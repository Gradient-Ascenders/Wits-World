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
  it('checks an exact normalized active recipient with one read and releases the connection', async () => {
    const statements: string[] = [];
    const { database, release } = tradeDatabase(async (statement, values) => {
      statements.push(normalizedSql(statement));
      expect(values).toEqual(['other_player', PLAYER_ID]);
      return {
        rows: [
          {
            id: '10000000-0000-4000-8000-000000000002',
            player_name: 'other_player',
          },
        ],
      };
    });
    await expect(
      createCardTradeService(database).findRecipient(
        PLAYER_ID,
        ' Other_Player ',
      ),
    ).resolves.toBe('other_player');
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('where lower(player_name) = $1');
    expect(statements[0]).toContain("lifecycle_status = 'active'");
    expect(statements[0]).toContain('id <> $2::uuid');
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects an absent recipient and releases the connection', async () => {
    const { database, release } = tradeDatabase(async () => ({ rows: [] }));
    await expect(
      createCardTradeService(database).findRecipient(
        PLAYER_ID,
        'missing_player',
      ),
    ).rejects.toMatchObject({ code: 'TRADE_PLAYER_UNAVAILABLE' });
    expect(release).toHaveBeenCalledOnce();
  });

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
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      PLAYER_ID,
      null,
      [REQUESTED_DEFINITION_ID],
      'card-trade-v1',
    ]);
    expect(release).toHaveBeenCalledOnce();
    expect(client).toBeDefined();
  });

  it('releases a new-draft connection if its snapshot query fails', async () => {
    const failure = new Error('Database unavailable');
    const { database, release } = tradeDatabase(async () => {
      throw failure;
    });
    await expect(
      createCardTradeService(database).previewSelection({
        playerId: PLAYER_ID,
        offeredOwnedCardIds: [],
        requestedDefinitions: [],
      }),
    ).rejects.toBe(failure);
    expect(release).toHaveBeenCalledOnce();
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

  it('paginates privacy-safe sent and received summaries', async () => {
    const now = new Date('2026-09-28T08:00:00.000Z');
    const { database, release } = tradeDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql.includes('select clock_timestamp() as now')) {
        return { rows: [{ now }] };
      }
      if (sql.includes('from private.card_trades trade')) {
        return {
          rows: [
            tradeListRow(1, PLAYER_ID, 'recipient-id', 'Other player'),
            tradeListRow(2, 'sender-id', PLAYER_ID, null),
            tradeListRow(3, PLAYER_ID, 'recipient-id', 'More results'),
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      createCardTradeService(database).listTrades({
        playerId: PLAYER_ID,
        page: 2,
        pageSize: 2,
        status: 'open',
      }),
    ).resolves.toEqual({
      page: 2,
      pageSize: 2,
      hasMore: true,
      items: [
        expect.objectContaining({
          direction: 'sent',
          counterpartyPlayerName: 'Other player',
        }),
        expect.objectContaining({
          direction: 'received',
          counterpartyPlayerName: 'Deleted player',
        }),
      ],
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects invalid pagination before connecting', async () => {
    const connect = vi.fn<CardTradeDatabase['connect']>();
    const service = createCardTradeService({ connect });

    await expect(
      service.listTrades({ playerId: PLAYER_ID, page: 0 }),
    ).rejects.toThrow('positive integer');
    await expect(
      service.listTrades({ playerId: PLAYER_ID, pageSize: 51 }),
    ).rejects.toThrow('between 1 and 50');
    expect(connect).not.toHaveBeenCalled();
  });

  it('runs expiry and retention maintenance through database functions', async () => {
    let call = 0;
    const { database, release } = tradeDatabase(async () => ({
      rows: [{ count: ++call }],
    }));
    const service = createCardTradeService(database);

    await expect(service.expireDueTrades()).resolves.toBe(1);
    await expect(service.purgeTerminalTrades()).resolves.toBe(2);
    expect(release).toHaveBeenCalledTimes(2);
  });
});

function tradeDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: pg.QueryResultRow[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = { query, release } as unknown as CardTradeClient;
  const database: CardTradeDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { database, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function tradeListRow(
  index: number,
  senderPlayerId: string,
  recipientPlayerId: string,
  counterpartyName: string | null,
) {
  return {
    trade_id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sender_player_id: senderPlayerId,
    recipient_player_id: recipientPlayerId,
    sender_name:
      senderPlayerId === PLAYER_ID ? 'Current player' : counterpartyName,
    recipient_name:
      recipientPlayerId === PLAYER_ID ? 'Current player' : counterpartyName,
    status: 'open',
    current_version: 1,
    created_at: new Date('2026-09-28T08:00:00.000Z'),
    expires_at: new Date('2026-09-29T08:00:00.000Z'),
    terminal_at: null,
  };
}

function createPreviewDatabase() {
  const release = vi.fn();
  const query = vi.fn<
    (
      statement: string,
      values?: unknown[],
    ) => Promise<{ rows: pg.QueryResultRow[] }>
  >(async (statement) => {
    if (statement.includes('with policy as')) {
      return {
        rows: [
          {
            policy: {
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
            copies: [
              copyRow(1, 'creature'),
              copyRow(2, 'creature', { saved_deck: true }),
              copyRow(3, 'creature'),
              copyRow(4, 'creature'),
              copyRow(5, 'power'),
              copyRow(6, 'power'),
            ],
            definitions: [
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
          },
        ],
      };
    }
    return { rows: [] };
  });
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
