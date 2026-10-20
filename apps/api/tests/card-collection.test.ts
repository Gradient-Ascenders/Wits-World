import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createCardCollectionService,
  type CardCollectionQueryable,
} from '../src/cards/card-collection.js';

const PLAYER_ID = '70000000-0000-4000-8000-000000000069';

describe('card collection service', () => {
  it.each([false, true])(
    'scopes featured owned IDs before card projection (unique=%s)',
    async (unique) => {
      const fixture = createFixture([]);
      const ids = ['71000000-0000-4000-8000-000000000001'];
      await createCardCollectionService(fixture.database).listOwnedCards(
        PLAYER_ID,
        unique,
        undefined,
        ids,
      );
      expect(fixture.query).toHaveBeenCalledWith(
        expect.stringContaining('owned.id = any($2::uuid[])'),
        [PLAYER_ID, ids],
      );
      expect(executedSql(fixture.query)).toContain(
        'owned.player_id = $1::uuid',
      );
    },
  );

  it('does not fall back to the full collection for an empty featured selection', async () => {
    const fixture = createFixture([]);
    expect(
      await createCardCollectionService(fixture.database).listOwnedCards(
        PLAYER_ID,
        false,
        undefined,
        [],
      ),
    ).toEqual([]);
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it('scopes deck copies to both authenticated ownership and deck membership before projection', async () => {
    const fixture = createFixture([]);
    const deckId = '74000000-0000-4000-8000-000000000001';
    await createCardCollectionService(fixture.database).listOwnedCards(
      PLAYER_ID,
      false,
      deckId,
    );
    expect(fixture.query).toHaveBeenCalledTimes(1);
    expect(fixture.query).toHaveBeenCalledWith(expect.any(String), [
      PLAYER_ID,
      deckId,
    ]);
    const sql = executedSql(fixture.query);
    expect(sql).toContain('membership.deck_id = $2::uuid');
    expect(sql).toContain('membership.player_id = $1::uuid');
    expect(sql).toContain('deck.player_id = membership.player_id');
    expect(sql).toContain('membership.owned_card_id = owned.id');
  });

  it('applies deck membership inside unique-copy selection so older deck copies are retained', async () => {
    const fixture = createFixture([]);
    await createCardCollectionService(fixture.database).listOwnedCards(
      PLAYER_ID,
      true,
      '74000000-0000-4000-8000-000000000001',
    );
    const sql = executedSql(fixture.query);
    expect(sql.indexOf('membership.deck_id = $2::uuid')).toBeLessThan(
      sql.indexOf('order by card_definition_id, acquired_at desc, id desc'),
    );
  });

  it('returns an empty collection when the player owns no cards', async () => {
    const fixture = createFixture([]);

    const service = createCardCollectionService(fixture.database);

    await expect(service.listOwnedCards(PLAYER_ID)).resolves.toEqual([]);

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('where owned.player_id = $1::uuid'),
      [PLAYER_ID],
    );
  });

  it('maps complete player-safe card data', async () => {
    const acquiredAt = new Date('2026-08-15T10:00:00.000Z');

    const fixture = createFixture([
      {
        owned_card_id: '71000000-0000-4000-8000-000000000001',
        card_definition_id: '72000000-0000-4000-8000-000000000001',
        acquisition_kind: 'event_reward',
        acquired_at: acquiredAt,
        name: 'Campus Spark',
        category: 'creature',
        affinity: 'spark',
        rarity: 'rare',
        hp: 120,
        power: 25,
        description: 'A fast campus creature.',
        image_url: '/cards/campus-spark.svg',
        is_active: true,
        moves: [
          {
            id: '73000000-0000-4000-8000-000000000001',
            position: 1,
            name: 'Quick Wit',
            moveType: 'spark',
            effectType: 'damage',
            effectValue: 25,
            powerCost: 10,
          },
        ],
        effects: [],
      },
    ]);

    const service = createCardCollectionService(fixture.database);

    const cards = await service.listOwnedCards(PLAYER_ID);

    expect(cards).toEqual([
      {
        ownedCardId: '71000000-0000-4000-8000-000000000001',
        cardDefinitionId: '72000000-0000-4000-8000-000000000001',
        acquisitionKind: 'event_reward',
        acquiredAt: '2026-08-15T10:00:00.000Z',
        name: 'Campus Spark',
        category: 'creature',
        affinity: 'spark',
        rarity: 'rare',
        hp: 120,
        power: 25,
        description: 'A fast campus creature.',
        imageUrl: '/cards/campus-spark.svg',
        isActive: true,
        moves: [
          {
            id: '73000000-0000-4000-8000-000000000001',
            position: 1,
            name: 'Quick Wit',
            moveType: 'spark',
            effectType: 'damage',
            effectValue: 25,
            powerCost: 10,
          },
        ],
        effects: [],
      },
    ]);

    expect(cards[0]).not.toHaveProperty('playerId');
    expect(cards[0]).not.toHaveProperty('sourceCompletionId');
    expect(cards[0]).not.toHaveProperty('sourceStarterGrantId');
  });

  it('keeps duplicate copies of the same definition distinguishable', async () => {
    const definitionId = '72000000-0000-4000-8000-000000000002';

    const fixture = createFixture([
      buildOwnedRow(
        '71000000-0000-4000-8000-000000000002',
        definitionId,
        new Date('2026-08-15T11:00:00.000Z'),
      ),
      buildOwnedRow(
        '71000000-0000-4000-8000-000000000003',
        definitionId,
        new Date('2026-08-15T10:00:00.000Z'),
      ),
    ]);

    const service = createCardCollectionService(fixture.database);

    const cards = await service.listOwnedCards(PLAYER_ID);

    expect(cards).toHaveLength(2);

    expect(cards.map((card) => card.cardDefinitionId)).toEqual([
      definitionId,
      definitionId,
    ]);

    expect(new Set(cards.map((card) => card.ownedCardId)).size).toBe(2);
  });

  it('does not hide an owned card whose catalogue definition is inactive', async () => {
    const fixture = createFixture([
      {
        ...buildOwnedRow(
          '71000000-0000-4000-8000-000000000004',
          '72000000-0000-4000-8000-000000000004',
          new Date('2026-08-15T09:00:00.000Z'),
        ),
        is_active: false,
      },
    ]);

    const service = createCardCollectionService(fixture.database);

    const cards = await service.listOwnedCards(PLAYER_ID);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.isActive).toBe(false);

    const sql = executedSql(fixture.query);

    expect(sql).not.toContain('definition.is_active = true');
  });

  it('uses a deterministic newest-first ownership ordering', async () => {
    const fixture = createFixture([]);

    const service = createCardCollectionService(fixture.database);

    await service.listOwnedCards(PLAYER_ID);

    const sql = executedSql(fixture.query);

    expect(sql).toContain('order by owned.acquired_at desc, owned.id desc');
  });

  it('does not query reward, attempt, or answer internals', async () => {
    const fixture = createFixture([]);

    const service = createCardCollectionService(fixture.database);

    await service.listOwnedCards(PLAYER_ID);

    const sql = executedSql(fixture.query);

    expect(sql).not.toContain('event_completions');
    expect(sql).not.toContain('challenge_attempts');
    expect(sql).not.toContain('attempt_answers');
    expect(sql).not.toContain('challenge_answer_keys');
    expect(sql).not.toContain('reward_policy_version');
    expect(sql).not.toContain('source_completion_id');
    expect(sql).not.toContain('source_starter_grant_id');
  });

  it('loads modifier metadata for moves and effects', async () => {
    const fixture = createFixture([]);

    const service = createCardCollectionService(fixture.database);

    await service.listOwnedCards(PLAYER_ID);

    const sql = executedSql(fixture.query);

    expect(sql).toContain("'modifierstat', move.modifier_stat");
    expect(sql).toContain("'modifieroperation', move.modifier_operation");
    expect(sql).toContain(
      "'modifierdurationturns', move.modifier_duration_turns",
    );

    expect(sql).toContain("'modifierstat', effect.modifier_stat");
    expect(sql).toContain("'modifieroperation', effect.modifier_operation");
    expect(sql).toContain(
      "'modifierdurationturns', effect.modifier_duration_turns",
    );
  });

  it('lists only active published definitions in the player-safe trading catalogue', async () => {
    const fixture = createFixture([
      {
        affinity: 'wit',
        card_definition_id: '72000000-0000-4000-8000-000000000099',
        category: 'creature',
        description: 'Carries messages between the towers.',
        effects: [],
        hp: 90,
        image_alt: 'A luminous ibis carrying a campus map.',
        image_url: '/cards/luminous-ibis.webp',
        is_active: true,
        moves: [],
        name: 'Luminous Ibis',
        power: 8,
        rarity: 'rare',
      },
    ]);
    const service = createCardCollectionService(fixture.database);

    await expect(service.listTradingCatalogue()).resolves.toEqual([
      {
        affinity: 'wit',
        cardDefinitionId: '72000000-0000-4000-8000-000000000099',
        category: 'creature',
        description: 'Carries messages between the towers.',
        effects: [],
        hp: 90,
        imageAlt: 'A luminous ibis carrying a campus map.',
        imageUrl: '/cards/luminous-ibis.webp',
        isActive: true,
        moves: [],
        name: 'Luminous Ibis',
        power: 8,
        rarity: 'rare',
      },
    ]);

    const sql = executedSql(fixture.query);
    expect(sql).toContain('definition.is_active');
    expect(sql).toContain("definition.authoring_status = 'published'");
    expect(sql).toContain('definition.category,');
    expect(sql).toContain('from public.card_moves move');
    expect(sql).toContain('from public.card_effects effect');
    expect(sql).not.toContain('player_cards');
    expect(sql).not.toContain('card_trade_reservations');
    expect(fixture.query).toHaveBeenCalledWith(expect.any(String), []);
  });
});

function createFixture(rows: pg.QueryResultRow[]) {
  const query = vi.fn(
    async (
      statement: string,
      values: unknown[],
    ): Promise<{ rows: pg.QueryResultRow[] }> => {
      void statement;
      void values;

      return {
        rows,
      };
    },
  );

  const database: CardCollectionQueryable = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values: unknown[],
    ): Promise<{ rows: T[] }> {
      const result = await query(statement, values);

      return {
        rows: result.rows as unknown as T[],
      };
    },
  };

  return {
    database,
    query,
  };
}

function buildOwnedRow(
  ownedCardId: string,
  cardDefinitionId: string,
  acquiredAt: Date,
) {
  return {
    owned_card_id: ownedCardId,
    card_definition_id: cardDefinitionId,
    acquisition_kind: 'starter',
    acquired_at: acquiredAt,
    name: 'Duplicate Card',
    category: 'power',
    affinity: 'wit',
    rarity: 'common',
    hp: null,
    power: null,
    description: 'Duplicate test card.',
    image_url: null,
    is_active: true,
    moves: [],
    effects: [
      {
        id: '74000000-0000-4000-8000-000000000001',
        position: 1,
        effectType: 'buff',
        effectValue: 5,
      },
    ],
  };
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls
    .map(([statement]) => String(statement))
    .join('\n')
    .toLowerCase();
}
