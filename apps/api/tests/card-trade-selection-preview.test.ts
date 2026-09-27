import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createCardTradeService,
  type CardTradeClient,
  type CardTradeDatabase,
} from '../src/trading/card-trade-service.js';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const REQUESTED_DEFINITION_ID = '20000000-0000-4000-8000-000000000001';
const SELECTED_COPY_ID = '30000000-0000-4000-8000-000000000001';

describe('card trade selection preview', () => {
  it('computes exact-copy availability and rarity warnings without reserving cards', async () => {
    const { client, database, query, release } = createPreviewDatabase();
    const service = createCardTradeService(database);

    const preview = await service.previewSelection({
      playerId: PLAYER_ID,
      offeredOwnedCardIds: [SELECTED_COPY_ID],
      requestedDefinitions: [
        { cardDefinitionId: REQUESTED_DEFINITION_ID, quantity: 1 },
      ],
    });

    expect(preview).toMatchObject({
      valid: true,
      issues: [],
      offeredRarityPoints: 1,
      requestedRarityPoints: 2,
      imbalanceWarningRequired: true,
      limits: {
        maximumCopiesPerSide: 5,
        minimumCreatureCopies: 3,
        minimumPowerCopies: 2,
      },
    });
    expect(preview.ownedCopies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownedCardId: SELECTED_COPY_ID,
          availability: 'selected_here',
        }),
        expect.objectContaining({
          ownedCardId: '30000000-0000-4000-8000-000000000002',
          availability: 'saved_deck',
        }),
        expect.objectContaining({
          ownedCardId: '30000000-0000-4000-8000-000000000003',
          availability: 'collection_minimum',
        }),
        expect.objectContaining({
          ownedCardId: '30000000-0000-4000-8000-000000000005',
          availability: 'available',
        }),
      ]),
    );
    expect(preview.requestedDefinitions).toEqual([
      expect.objectContaining({
        cardDefinitionId: REQUESTED_DEFINITION_ID,
        name: 'Rare Power',
        quantity: 1,
      }),
    ]);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).not.toContain('insert into private.card_trade_reservations');
    expect(query).toHaveBeenCalledWith('begin');
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
    expect(client).toBeDefined();
  });

  it('rejects duplicate copy identifiers before opening a transaction', async () => {
    const connect = vi.fn();
    const service = createCardTradeService({ connect } as CardTradeDatabase);

    await expect(
      service.previewSelection({
        playerId: PLAYER_ID,
        offeredOwnedCardIds: [SELECTED_COPY_ID, SELECTED_COPY_ID.toUpperCase()],
        requestedDefinitions: [
          { cardDefinitionId: REQUESTED_DEFINITION_ID, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRADE_INCOMPLETE' });
    expect(connect).not.toHaveBeenCalled();
  });
});

function createPreviewDatabase() {
  const release = vi.fn();
  const query = vi.fn(
    async (statement: string): Promise<{ rows: pg.QueryResultRow[] }> => {
      if (statement.includes('from private.card_trade_policy_versions')) {
        return {
          rows: [
            {
              policy_version: 'card-trade-v1',
              minimum_account_age_seconds: 86_400,
              maximum_open_offers: 5,
              maximum_copies_per_side: 5,
              maximum_completed_trades_24h: 5,
              offer_lifetime_seconds: 86_400,
              imbalance_warning_threshold: 0,
              minimum_creature_copies: 3,
              minimum_power_copies: 2,
            },
          ],
        };
      }
      if (
        statement.includes('from public.player_cards owned') &&
        statement.includes('as saved_deck')
      ) {
        return {
          rows: [
            copyRow(1, 'creature'),
            copyRow(2, 'creature', { saved_deck: true }),
            copyRow(3, 'creature'),
            copyRow(4, 'creature'),
            copyRow(5, 'power'),
            copyRow(6, 'power'),
          ],
        };
      }
      if (
        statement.includes('from public.card_definitions definition') &&
        statement.includes('definition.id = any')
      ) {
        return {
          rows: [
            {
              card_definition_id: REQUESTED_DEFINITION_ID,
              name: 'Rare Power',
              category: 'power',
              affinity: 'wit',
              rarity: 'rare',
              image_url: '/cards/rare-power.webp',
              image_alt: 'A glowing card over the Great Hall.',
            },
          ],
        };
      }
      return { rows: [] };
    },
  );
  const client = { query, release } as unknown as CardTradeClient;
  const database: CardTradeDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { client, database, query, release };
}

function copyRow(
  index: number,
  category: 'creature' | 'power',
  overrides: Record<string, unknown> = {},
) {
  return {
    owned_card_id: `30000000-0000-4000-8000-00000000000${index}`,
    card_definition_id: `40000000-0000-4000-8000-00000000000${index}`,
    name: `${category} ${index}`,
    category,
    affinity: 'wit',
    rarity: 'common',
    image_url: null,
    image_alt: null,
    is_active: true,
    authoring_status: 'published',
    saved_deck: false,
    gameplay_commitment: false,
    other_trade: false,
    ...overrides,
  };
}
