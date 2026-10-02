import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  loadPlayerBattleDeck,
  PlayerBattleDeckError,
  type BattleDeckQueryClient,
} from '../src/matches/player-battle-deck.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const DECK_ID = '20000000-0000-4000-8000-000000000001';
const RESERVED_CARD_ID = '30000000-0000-4000-8000-000000000001';
const ownedIds = Array.from(
  { length: 5 },
  (_, index) => `30000000-0000-4000-8000-00000000000${index + 1}`,
);
const definitionIds = Array.from(
  { length: 5 },
  (_, index) => `40000000-0000-4000-8000-00000000000${index + 1}`,
);

function savedCards() {
  return [2, 0, 4, 1, 3].map((cardIndex, position) => ({
    position: position + 1,
    owned_card_id: ownedIds[cardIndex],
    card_definition_id: definitionIds[cardIndex],
    name: `Card ${cardIndex + 1}`,
    category: cardIndex < 3 ? 'creature' : 'power',
    affinity: cardIndex < 3 ? 'wit' : null,
    rarity: 'common',
    hp: cardIndex < 3 ? 10 : null,
    power: cardIndex < 3 ? 10 : null,
    is_active: true,
    authoring_status: 'published',
  }));
}

function hydratedCards() {
  return [
    ...definitionIds.slice(0, 3).flatMap((cardDefinitionId, cardIndex) =>
      [1, 2, 3, 4].map((position) => ({
        row_kind: 0,
        position,
        id: `move-${cardIndex}-${position}`,
        card_definition_id: cardDefinitionId,
        card_move_id: null,
        name: `Move ${position}`,
        move_type: 'basic',
        effect_type: 'damage',
        effect_value: position,
        modifier_stat: null,
        modifier_operation: null,
        modifier_duration_turns: null,
        power_cost: 0,
        effect_code: null,
        effect_config: null,
      })),
    ),
    ...definitionIds.slice(0, 3).flatMap((cardDefinitionId, cardIndex) =>
      [1, 2].map((position) => ({
        row_kind: 1,
        position,
        id: `move-effect-${cardIndex}-${position}`,
        card_definition_id: cardDefinitionId,
        card_move_id: `move-${cardIndex}-2`,
        name: null,
        move_type: null,
        effect_type: position === 1 ? 'damage' : 'heal',
        effect_value: position,
        modifier_stat: null,
        modifier_operation: null,
        modifier_duration_turns: null,
        power_cost: null,
        effect_code: position === 1 ? 'damage' : 'heal',
        effect_config: {},
      })),
    ),
    ...definitionIds.slice(3).map((cardDefinitionId, index) => ({
      row_kind: 2,
      position: 1,
      id: `power-effect-${index}`,
      card_definition_id: cardDefinitionId,
      card_move_id: null,
      name: null,
      move_type: null,
      effect_type: 'heal',
      effect_value: 1,
      modifier_stat: null,
      modifier_operation: null,
      modifier_duration_turns: null,
      power_cost: null,
      effect_code: 'heal',
      effect_config: {},
    })),
  ];
}

function fakeClient(
  cards = savedCards(),
  reserved: { owned_card_id: string }[] = [],
) {
  const statements: string[] = [];
  const values: unknown[][] = [];
  const client: BattleDeckQueryClient = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      parameters: unknown[] = [],
    ) {
      statements.push(statement);
      values.push(parameters);
      if (statement.includes('from public.player_decks deck')) {
        return { rows: cards as unknown as T[] };
      }
      if (statement.includes('from private.card_trade_reservations')) {
        return { rows: reserved as unknown as T[] };
      }
      if (statement.includes('from public.card_moves')) {
        return { rows: hydratedCards() as unknown as T[] };
      }
      throw new Error(`Unexpected query: ${statement}`);
    },
  };
  return { client, statements, values };
}

describe('player battle deck hydration', () => {
  it('uses one ordered hydration statement and preserves deck and move order', async () => {
    const { client, statements, values } = fakeClient();

    const loaded = await loadPlayerBattleDeck(client, PLAYER_ID, DECK_ID, {
      requireSelected: true,
    });

    expect(statements).toHaveLength(3);
    expect(statements[2]).toContain('union all');
    expect(statements[2]).toContain(
      'order by row_kind, card_definition_id, card_move_id, position',
    );
    expect(values[0]).toEqual([DECK_ID, PLAYER_ID, true]);
    expect(values[2]).toEqual([
      [
        definitionIds[2],
        definitionIds[0],
        definitionIds[4],
        definitionIds[1],
        definitionIds[3],
      ],
    ]);
    expect(loaded.cards.map((card) => card.ownedCardId)).toEqual([
      ownedIds[2],
      ownedIds[0],
      ownedIds[4],
      ownedIds[1],
      ownedIds[3],
    ]);
    expect(
      loaded.deck.creatureCards[0]?.moves.map((move) => move.name),
    ).toEqual(['Move 1', 'Move 2', 'Move 3', 'Move 4']);
    expect(loaded.deck.creatureCards[0]?.moves[0]?.effects[0]).toMatchObject({
      effectType: 'damage',
      effectValue: 1,
    });
    expect(
      loaded.deck.creatureCards[0]?.moves[0]?.effects[0],
    ).not.toHaveProperty('effectCode');
    expect(
      loaded.deck.creatureCards[0]?.moves[1]?.effects.map(
        (effect) => effect.effectCode,
      ),
    ).toEqual(['damage', 'heal']);
  });

  it.each([
    ['missing ownership rows', []],
    ['missing owned card', savedCards().slice(0, 4)],
    [
      'duplicate owned copy',
      savedCards().map((card, index) =>
        index === 4 ? { ...card, owned_card_id: ownedIds[0] } : card,
      ),
    ],
  ])('rejects %s before hydration', async (_label, cards) => {
    const { client, statements } = fakeClient(cards);
    await expect(
      loadPlayerBattleDeck(client, PLAYER_ID, DECK_ID),
    ).rejects.toBeInstanceOf(PlayerBattleDeckError);
    expect(
      statements.some((statement) =>
        statement.includes('from public.card_moves'),
      ),
    ).toBe(false);
  });

  it.each([
    ['inactive', { is_active: false }],
    ['unpublished', { authoring_status: 'draft' }],
  ])('rejects %s cards before hydration', async (_label, change) => {
    const cards = savedCards();
    cards[0] = { ...cards[0]!, ...change };
    const { client, statements } = fakeClient(cards);
    await expect(
      loadPlayerBattleDeck(client, PLAYER_ID, DECK_ID),
    ).rejects.toBeInstanceOf(PlayerBattleDeckError);
    expect(statements).toHaveLength(2);
  });
});

describe('player battle deck trade reservations', () => {
  it('locks owned copies before rejecting a trade-reserved match commitment', async () => {
    const statements: string[] = [];
    const ownedIds = [
      RESERVED_CARD_ID,
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000005',
    ];

    const client: BattleDeckQueryClient = {
      async query<T extends pg.QueryResultRow>(statement: string) {
        statements.push(statement);
        if (statement.includes('from public.player_decks deck')) {
          return {
            rows: ownedIds.map((ownedCardId, index) => ({
              position: index + 1,
              owned_card_id: ownedCardId,
              card_definition_id: `40000000-0000-4000-8000-00000000000${index + 1}`,
              name: `Card ${index + 1}`,
              category: index < 3 ? 'creature' : 'power',
              affinity: index < 3 ? 'wit' : null,
              rarity: 'common',
              hp: index < 3 ? 10 : null,
              power: index < 3 ? null : 1,
              is_active: true,
              authoring_status: 'published',
            })) as unknown as T[],
          };
        }
        if (statement.includes('from private.card_trade_reservations')) {
          return {
            rows: [{ owned_card_id: RESERVED_CARD_ID }] as unknown as T[],
          };
        }
        throw new Error(`Unexpected query: ${statement}`);
      },
    };

    await expect(
      loadPlayerBattleDeck(client, PLAYER_ID, DECK_ID),
    ).rejects.toBeInstanceOf(PlayerBattleDeckError);

    expect(statements[0]).toContain('for update of owned');
    expect(statements[1]).toContain('from private.card_trade_reservations');
  });
});
