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
