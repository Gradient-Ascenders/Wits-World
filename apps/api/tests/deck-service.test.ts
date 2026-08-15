import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createDeckService,
  DeckOwnedCardNotFoundError,
  type DeckDatabase,
  type DeckTransactionClient,
} from '../src/cards/deck-service.js';

const PLAYER_ID = '91000000-0000-4000-8000-000000000001';

const DECK_ID = '92000000-0000-4000-8000-000000000001';

describe('saved deck service', () => {
  it('creates a legal deck from authoritative owned-card metadata', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const service = createDeckService(fixture.database);

    const deck = await service.createDeck({
      playerId: PLAYER_ID,
      name: '  Campus Five  ',
      ownedCardIds: ownedCardIds(),
    });

    expect(deck).toMatchObject({
      deckId: DECK_ID,
      name: 'Campus Five',
      totalPoints: 5,
      isSelected: false,
    });

    expect(deck.cards).toHaveLength(5);
    expect(deck.cards.map((card) => card.position)).toEqual([1, 2, 3, 4, 5]);

    const sql = executedSql(fixture.query);

    expect(sql).toContain('where owned.player_id = $1::uuid');
    expect(sql).toContain('owned.id = any($2::uuid[])');

    expect(executedCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('rejects an unavailable or cross-player owned copy and rolls back', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(
      successfulImplementation({
        ownedRows: authoritativeCards().slice(0, 4),
      }),
    );

    const service = createDeckService(fixture.database);

    await expect(
      service.createDeck({
        playerId: PLAYER_ID,
        name: 'Invalid ownership',
        ownedCardIds: ownedCardIds(),
      }),
    ).rejects.toBeInstanceOf(DeckOwnedCardNotFoundError);

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.player_decks',
    );
  });

  it('rejects the same owned copy twice before persistence', async () => {
    const fixture = createFixture();

    fixture.query.mockImplementation(successfulImplementation());

    const ids = ownedCardIds();
    ids[4] = ids[3]!;

    const service = createDeckService(fixture.database);

    await expect(
      service.createDeck({
        playerId: PLAYER_ID,
        name: 'Duplicate copy',
        ownedCardIds: ids,
      }),
    ).rejects.toMatchObject({
      code: 'DECK_COPY_DUPLICATED',
    });

    expect(executedSql(fixture.query)).not.toContain(
      'from public.player_cards owned',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it('rejects a deck above the ten-point cap using database rarity values', async () => {
    const fixture = createFixture();

    const rows = authoritativeCards();

    rows[0] = {
      ...rows[0]!,
      rarity: 'legendary',
    };
    rows[1] = {
      ...rows[1]!,
      rarity: 'epic',
    };
    rows[2] = {
      ...rows[2]!,
      rarity: 'rare',
    };

    fixture.query.mockImplementation(
      successfulImplementation({
        ownedRows: rows,
      }),
    );

    const service = createDeckService(fixture.database);

    await expect(
      service.createDeck({
        playerId: PLAYER_ID,
        name: 'Too expensive',
        ownedCardIds: ownedCardIds(),
      }),
    ).rejects.toMatchObject({
      code: 'DECK_POINT_CAP_EXCEEDED',
    });

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.player_decks',
    );

    expect(executedCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it('does not trust browser-supplied card metadata because create accepts only copy IDs', () => {
    type Input = Parameters<
      ReturnType<typeof createDeckService>['createDeck']
    >[0];

    const input: Input = {
      playerId: PLAYER_ID,
      name: 'Server authoritative',
      ownedCardIds: ownedCardIds(),
    };

    expect(input).not.toHaveProperty('rarity');
    expect(input).not.toHaveProperty('category');
    expect(input).not.toHaveProperty('totalPoints');
  });

  it('allows distinct owned copies of the same card definition', async () => {
    const fixture = createFixture();

    const rows = authoritativeCards();

    rows[1] = {
      ...rows[1]!,
      card_definition_id: rows[0]!.card_definition_id,
    };

    fixture.query.mockImplementation(
      successfulImplementation({
        ownedRows: rows,
      }),
    );

    const service = createDeckService(fixture.database);

    const deck = await service.createDeck({
      playerId: PLAYER_ID,
      name: 'Duplicate definition',
      ownedCardIds: ownedCardIds(),
    });

    expect(deck.cards[0]?.cardDefinitionId).toBe(
      deck.cards[1]?.cardDefinitionId,
    );

    expect(deck.cards[0]?.ownedCardId).not.toBe(deck.cards[1]?.ownedCardId);
  });
});

interface OwnedRow extends pg.QueryResultRow {
  owned_card_id: string;
  card_definition_id: string;
  name: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

function createFixture() {
  const query = vi.fn();

  const client: DeckTransactionClient = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ) {
      const result = await query(statement, values ?? []);

      return result as {
        rows: T[];
        rowCount?: number | null;
      };
    },

    release: vi.fn(),
  };

  const database: DeckDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };

  return {
    database,
    client,
    query,
  };
}

function successfulImplementation({
  ownedRows = authoritativeCards(),
}: {
  ownedRows?: OwnedRow[];
} = {}) {
  return async (statement: string) => {
    const sql = statement.toLowerCase().trim();

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return {
        rows: [],
      };
    }

    if (
      sql.includes('from public.player_cards owned') &&
      sql.includes('any($2::uuid[])')
    ) {
      return {
        rows: ownedRows,
      };
    }

    if (sql.includes('insert into public.player_decks')) {
      return {
        rows: [
          {
            deck_id: DECK_ID,
          },
        ],
      };
    }

    if (
      sql.includes('insert into public.player_deck_cards') ||
      sql.includes('delete from public.player_deck_cards')
    ) {
      return {
        rows: [],
      };
    }

    if (sql.includes('from public.player_decks deck')) {
      return {
        rows: deckReadRows(ownedRows),
      };
    }

    return {
      rows: [],
    };
  };
}

function authoritativeCards(): OwnedRow[] {
  return Array.from({ length: 5 }, (_, index) => {
    const number = index + 1;

    return {
      owned_card_id: ownedCardId(number),
      card_definition_id: `93000000-0000-4000-8000-${String(number).padStart(
        12,
        '0',
      )}`,
      name: `Deck card ${number}`,
      category: number <= 3 ? 'creature' : 'power',
      affinity: 'spark',
      rarity: 'common',
    };
  });
}

function deckReadRows(cards: OwnedRow[]) {
  return cards.map((card, index) => ({
    deck_id: DECK_ID,
    name: 'Campus Five',
    created_at: new Date('2026-08-15T10:00:00.000Z'),
    updated_at: new Date('2026-08-15T10:00:00.000Z'),
    is_selected: false,
    position: index + 1,
    owned_card_id: card.owned_card_id,
    card_definition_id: card.card_definition_id,
    card_name: card.name,
    category: card.category,
    affinity: card.affinity,
    rarity: card.rarity,
  }));
}

function ownedCardIds(): string[] {
  return Array.from({ length: 5 }, (_, index) => ownedCardId(index + 1));
}

function ownedCardId(number: number): string {
  return `94000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls
    .map(([statement]) => String(statement))
    .join('\n')
    .toLowerCase();
}

function executedCommands(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls
    .map(([statement]) => String(statement).trim().toLowerCase())
    .filter((statement) => ['begin', 'commit', 'rollback'].includes(statement));
}
