import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCardTradeService } from '../src/trading/card-trade-service.js';
import {
  createDeckService,
  DeckOwnedCardNotFoundError,
} from '../src/cards/deck-service.js';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  getMigrationsDirectory,
  getSeedsDirectory,
} from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';

const MIGRATION_NAME = '0055_persist_versioned_card_trades.sql';
const IDEMPOTENCY_MIGRATION_NAME =
  '0056_add_card_trade_submission_receipts.sql';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface DefinitionRow extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  rarity: 'common';
}

interface OwnedFixtureCard {
  id: string;
  definitionId: string;
  category: 'creature' | 'power';
}

interface PlayerFixture {
  id: string;
  playerName: string;
  cards: OwnedFixtureCard[];
}

interface PreMigrationFixture {
  playerId: string;
  deckId: string;
  cardIds: string[];
}

describe.skipIf(!runIntegrationTests)(
  'versioned card trade persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let preMigrationDirectory: string;
    let pool: pg.Pool;
    let preMigrationFixture: PreMigrationFixture;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_card_trades_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      preMigrationDirectory = await copyMigrationsBeforeTradePersistence();
      await runMigrations(temporaryConfig, preMigrationDirectory);
      await runSeeds(temporaryConfig, getSeedsDirectory());

      preMigrationFixture = await withDatabaseClient(
        temporaryConfig,
        async (client) => seedPreMigrationDeck(client),
      );

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(MIGRATION_NAME);
      expect(migrationResult.applied).toContain(IDEMPOTENCY_MIGRATION_NAME);

      pool = createDatabasePool(temporaryConfig);
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (preMigrationDirectory) {
        await rm(preMigrationDirectory, { recursive: true, force: true });
      }
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('migrates existing ownership and deck references without rewriting them', async () => {
      const cards = await pool.query<{
        id: string;
        source_trade_movement_id: string | null;
      }>(
        `select id::text, source_trade_movement_id::text
           from public.player_cards
          where player_id = $1::uuid
          order by id`,
        [preMigrationFixture.playerId],
      );
      expect(cards.rows.map((row) => row.id).sort()).toEqual(
        [...preMigrationFixture.cardIds].sort(),
      );
      expect(
        cards.rows.every((row) => row.source_trade_movement_id === null),
      ).toBe(true);

      const membership = await pool.query<{ owned_card_id: string }>(
        `select owned_card_id::text
           from public.player_deck_cards
          where deck_id = $1::uuid
          order by position`,
        [preMigrationFixture.deckId],
      );
      expect(membership.rows.map((row) => row.owned_card_id)).toEqual(
        preMigrationFixture.cardIds,
      );

      const policy = await pool.query<{
        policy_version: string;
        maximum_open_offers: number;
        maximum_copies_per_side: number;
        maximum_completed_trades_24h: number;
        offer_lifetime_seconds: number;
        imbalance_warning_threshold: number;
        minimum_creature_copies: number;
        minimum_power_copies: number;
      }>(
        `select policy_version, maximum_open_offers, maximum_copies_per_side,
                maximum_completed_trades_24h, offer_lifetime_seconds,
                imbalance_warning_threshold, minimum_creature_copies,
                minimum_power_copies
           from private.card_trade_policy_versions
          where policy_version = 'card-trade-v1'`,
      );
      expect(policy.rows).toEqual([
        {
          policy_version: 'card-trade-v1',
          maximum_open_offers: 5,
          maximum_copies_per_side: 5,
          maximum_completed_trades_24h: 5,
          offer_lifetime_seconds: 86_400,
          imbalance_warning_threshold: 2,
          minimum_creature_copies: 3,
          minimum_power_copies: 2,
        },
      ]);

      const trustVersions = await pool.query<{ policy_version: string }>(
        `select policy_version
           from private.trust_policy_versions
          where policy_version in ('trust-v1', 'trust-v2')
          order by policy_version`,
      );
      expect(trustVersions.rows.map((row) => row.policy_version)).toEqual([
        'trust-v1',
        'trust-v2',
      ]);
    });

    it.each([1, 5])(
      'keeps trade database round trips bounded for %i copies per side',
      async (copiesPerSide) => {
        const sender = await insertPlayerWithCollection(
          pool,
          `batch_${copiesPerSide}_sender`,
        );
        const recipient = await insertPlayerWithCollection(
          pool,
          `batch_${copiesPerSide}_recipient`,
        );
        const statements: string[] = [];
        const service = createCardTradeService({
          async connect() {
            const client = await pool.connect();
            return {
              query(statement, values) {
                statements.push(statement);
                return client.query(statement, values);
              },
              release: () => client.release(),
            };
          },
        });
        const trade = await service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: recipient.id,
          confirmOffer: true,
          submissionId: randomUUID(),
          offeredOwnedCardIds: sender.cards
            .slice(0, copiesPerSide)
            .map((card) => card.id),
          requestedDefinitions: recipient.cards
            .slice(0, copiesPerSide)
            .map((card) => ({
              cardDefinitionId: card.definitionId,
              quantity: 1,
            })),
        });
        statements.length = 0;
        const before = await service.getTrade(trade.tradeId, recipient.id);
        expect(before).toEqual(trade);
        expect(statements).toHaveLength(5);
        const readStatements = statements.length;
        statements.length = 0;
        const input = {
          tradeId: trade.tradeId,
          playerId: recipient.id,
          expectedVersion: trade.version,
          confirmOffer: true,
          submissionId: randomUUID(),
        };
        const completed = await service.acceptTrade(input);
        expect(completed.settlement?.movements).toHaveLength(copiesPerSide * 2);
        expect(
          statements.filter((sql) =>
            sql.includes('insert into private.card_trade_movements'),
          ),
        ).toHaveLength(1);
        expect(
          statements.filter((sql) =>
            sql.includes('insert into public.player_cards'),
          ),
        ).toHaveLength(1);
        expect(statements.length).toBeLessThanOrEqual(55);
        const acceptanceStatements = statements.length;
        const replay = await service.acceptTrade(input);
        expect(replay).toEqual(completed);
        expect(await service.getTrade(trade.tradeId, recipient.id)).toEqual(
          completed,
        );
        console.info(
          JSON.stringify({
            event: 'trade_round_trip_check',
            copiesPerSide,
            readStatements,
            acceptanceStatements,
          }),
        );
      },
    );

    it('settles a confirmed proposal in one acceptance and safely replays it', async () => {
      const sender = await insertPlayerWithCollection(pool, 'confirm_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'confirm_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        submissionId: randomUUID(),
        confirmOffer: true,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      expect(trade.sender.accepted).toBe(true);
      expect(trade.recipient.accepted).toBe(false);
      const input = {
        tradeId: trade.tradeId,
        playerId: recipient.id,
        expectedVersion: trade.version,
        submissionId: randomUUID(),
        confirmOffer: true,
      };
      await expect(
        service.acceptTrade({
          ...input,
          playerId: sender.id,
          submissionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'TRADE_ACTION_NOT_ALLOWED' });
      await expect(
        service.acceptTrade({
          ...input,
          playerId: randomUUID(),
          submissionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'TRADE_NOT_PARTICIPANT' });
      const completed = await service.acceptTrade(input);
      expect(completed.status).toBe('completed');
      expect(completed.settlement?.movements).toHaveLength(2);
      expect(
        completed.settlement?.movements
          .map((movement) => movement.sourceOwnedCardId)
          .sort(),
      ).toEqual([sender.cards[0]!.id, recipient.cards[0]!.id].sort());
      const replay = await service.acceptTrade(input);
      expect(replay.settlement?.receiptId).toBe(
        completed.settlement?.receiptId,
      );
    });

    it('sends a confirmed counter as a new proposal and rejects stale consent', async () => {
      const sender = await insertPlayerWithCollection(pool, 'counter_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'counter_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        confirmOffer: true,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      const counter = await service.reviseTrade({
        tradeId: trade.tradeId,
        playerId: recipient.id,
        expectedVersion: trade.version,
        confirmOffer: true,
        offeredOwnedCardIds: [recipient.cards[1]!.id],
        requestedDefinitions: [
          { cardDefinitionId: sender.cards[1]!.definitionId, quantity: 1 },
        ],
      });
      expect(counter.version).toBe(trade.version + 1);
      expect(counter.sender.accepted).toBe(false);
      expect(counter.sender.offeredCopies).toEqual([]);
      expect(counter.recipient.accepted).toBe(true);
      await expect(
        service.acceptTrade({
          tradeId: trade.tradeId,
          playerId: sender.id,
          expectedVersion: trade.version,
          confirmOffer: true,
        }),
      ).rejects.toMatchObject({ code: 'TRADE_VERSION_STALE' });
      const accepted = await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        expectedVersion: counter.version,
        confirmOffer: true,
      });
      expect(accepted.status).toBe('completed');
      expect(
        accepted.settlement?.movements
          .map((movement) => movement.sourceOwnedCardId)
          .sort(),
      ).toEqual([sender.cards[1]!.id, recipient.cards[1]!.id].sort());
    });

    it('refuses protected requested copies without changing the confirmed proposal', async () => {
      const sender = await insertPlayerWithCollection(pool, 'protected_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'protected_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        confirmOffer: true,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      const deckId = randomUUID();
      await pool.query(
        `insert into public.player_decks (id, player_id, name) values ($1::uuid, $2::uuid, 'Protected acceptance')`,
        [deckId, recipient.id],
      );
      await pool.query(
        `insert into public.player_deck_cards (deck_id, player_id, owned_card_id, position) values ($1::uuid, $2::uuid, $3::uuid, 1)`,
        [deckId, recipient.id, recipient.cards[0]!.id],
      );
      await expect(
        service.acceptTrade({
          tradeId: trade.tradeId,
          playerId: recipient.id,
          expectedVersion: trade.version,
          confirmOffer: true,
        }),
      ).rejects.toMatchObject({ code: 'TRADE_COPY_CONFLICT' });
      const current = await service.getTrade(trade.tradeId, recipient.id);
      expect(current.status).toBe('open');
      expect(current.version).toBe(trade.version);
      expect(current.settlement).toBeNull();
      expect(current.recipient.offeredCopies).toEqual([]);
    });

    it('makes create and revision submissions durably idempotent', async () => {
      const sender = await insertPlayerWithCollection(
        pool,
        'idempotent_sender',
      );
      const recipient = await insertPlayerWithCollection(
        pool,
        'idempotent_recipient',
      );
      const service = createCardTradeService(pool);
      const createSubmissionId = randomUUID();
      const createInput = {
        senderPlayerId: sender.id,
        recipientPlayerName: recipient.playerName,
        submissionId: createSubmissionId,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      } as const;

      const created = await service.createTrade(createInput);
      const replayed = await service.createTrade(createInput);
      expect(replayed.tradeId).toBe(created.tradeId);

      const previewInput = {
        playerId: sender.id,
        tradeId: created.tradeId,
        expectedVersion: created.version,
        offeredOwnedCardIds: createInput.offeredOwnedCardIds,
        requestedDefinitions: createInput.requestedDefinitions,
      };
      const editablePreview = await service.previewSelection(previewInput);
      expect(editablePreview.valid).toBe(true);
      expect(
        editablePreview.ownedCopies.find(
          (copy) => copy.ownedCardId === sender.cards[0]!.id,
        )?.availability,
      ).toBe('selected_here');
      await expect(
        service.previewSelection({ ...previewInput, playerId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'TRADE_NOT_PARTICIPANT' });
      await expect(
        service.previewSelection({
          ...previewInput,
          expectedVersion: created.version + 1,
        }),
      ).rejects.toMatchObject({ code: 'TRADE_VERSION_STALE' });

      const tradeCount = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trades
          where sender_player_id = $1::uuid
            and recipient_player_id = $2::uuid`,
        [sender.id, recipient.id],
      );
      expect(tradeCount.rows[0]?.count).toBe(1);

      await expect(
        service.createTrade({
          ...createInput,
          requestedDefinitions: [
            { cardDefinitionId: recipient.cards[1]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_IDEMPOTENCY_CONFLICT' });

      const revisionSubmissionId = randomUUID();
      const revision = {
        tradeId: created.tradeId,
        playerId: recipient.id,
        submissionId: revisionSubmissionId,
        expectedVersion: 1,
        offeredOwnedCardIds: [recipient.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
        ],
      } as const;
      const revised = await service.reviseTrade(revision);
      const revisionReplay = await service.reviseTrade(revision);
      expect(revised.version).toBe(2);
      expect(revisionReplay.version).toBe(2);

      const versions = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trade_versions
          where trade_id = $1::uuid`,
        [created.tradeId],
      );
      expect(versions.rows[0]?.count).toBe(2);

      const receipts = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trade_submission_receipts
          where trade_id = $1::uuid`,
        [created.tradeId],
      );
      expect(receipts.rows[0]?.count).toBe(2);

      await expect(
        pool.query(
          `update private.card_trade_submission_receipts
              set payload_hash = repeat('0', 64)
            where trade_id = $1::uuid`,
          [created.tradeId],
        ),
      ).rejects.toMatchObject({ code: '55006' });

      await expect(
        pool.query(
          `delete from private.card_trade_submission_receipts
            where trade_id = $1::uuid`,
          [created.tradeId],
        ),
      ).rejects.toMatchObject({ code: '55006' });
    });

    it('purges idempotency receipts with expired non-completed trade history', async () => {
      const sender = await insertPlayerWithCollection(pool, 'receipt_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'receipt_recipient',
      );
      const tradeId = randomUUID();
      const submissionId = randomUUID();

      const fixtureClient = await pool.connect();
      try {
        await fixtureClient.query('begin');
        await fixtureClient.query(
          `insert into private.card_trades (
             id, sender_player_id, recipient_player_id, policy_version,
             current_version, status, created_at, expires_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, 'card-trade-v1', 1, 'open',
             clock_timestamp() - interval '32 days',
             clock_timestamp() - interval '31 days'
           )`,
          [tradeId, sender.id, recipient.id],
        );
        await fixtureClient.query(
          `insert into private.card_trade_versions (
             trade_id, version, created_by_player_id, created_at
           ) values (
             $1::uuid, 1, $2::uuid, clock_timestamp() - interval '32 days'
           )`,
          [tradeId, sender.id],
        );
        await fixtureClient.query(
          `update private.card_trades
              set status = 'cancelled',
                  terminal_at = clock_timestamp() - interval '31 days',
                  terminal_reason = 'cancelled'
            where id = $1::uuid`,
          [tradeId],
        );
        await fixtureClient.query(
          `insert into private.card_trade_submission_receipts (
             actor_player_id, operation, submission_id, payload_hash, trade_id, created_at
           ) values (
             $1::uuid, 'trade_cancel', $2::uuid, repeat('a', 64), $3::uuid,
             clock_timestamp() - interval '31 days'
           )`,
          [sender.id, submissionId, tradeId],
        );
        await fixtureClient.query('commit');
      } catch (error) {
        await fixtureClient.query('rollback');
        throw error;
      } finally {
        fixtureClient.release();
      }

      const purged = await createCardTradeService(pool).purgeTerminalTrades();
      expect(purged).toBeGreaterThanOrEqual(1);

      const trade = await pool.query(
        `select 1 from private.card_trades where id = $1::uuid`,
        [tradeId],
      );
      const receipt = await pool.query(
        `select 1 from private.card_trade_submission_receipts
          where actor_player_id = $1::uuid
            and operation = 'trade_cancel'
            and submission_id = $2::uuid`,
        [sender.id, submissionId],
      );
      expect(trade.rowCount).toBe(0);
      expect(receipt.rowCount).toBe(0);
    });

    it('discovers, reads, and declines trades with durable command replay', async () => {
      const sender = await insertPlayerWithCollection(pool, 'decline_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'decline_recipient',
      );
      const service = createCardTradeService(pool);
      const created = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerName: ` ${recipient.playerName.toUpperCase()} `,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });

      await expect(
        service.findRecipient(sender.id, recipient.playerName),
      ).resolves.toBe(recipient.playerName.toLowerCase());
      await expect(
        service.findRecipient(sender.id, 'missing_trade_recipient'),
      ).rejects.toMatchObject({ code: 'TRADE_PLAYER_UNAVAILABLE' });
      await expect(
        service.getTrade(created.tradeId, sender.id),
      ).resolves.toMatchObject({
        tradeId: created.tradeId,
        status: 'open',
        version: 1,
      });
      await expect(
        service.listTrades({
          playerId: recipient.id,
          direction: 'received',
          status: 'open',
          page: 1,
          pageSize: 1,
        }),
      ).resolves.toMatchObject({
        page: 1,
        pageSize: 1,
        hasMore: false,
        items: [
          {
            tradeId: created.tradeId,
            direction: 'received',
            status: 'open',
            counterpartyPlayerName: sender.playerName,
          },
        ],
      });

      const snapshot = async () =>
        pool.query(
          `select trade.status,
                  (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                  (select count(*)::integer from private.card_trade_submission_receipts receipt where receipt.trade_id = trade.id) receipt_count
             from private.card_trades trade
            where trade.id = $1::uuid`,
          [created.tradeId],
        );
      const beforeRejectedCommand = await snapshot();
      const submissionId = randomUUID();
      await expect(
        service.declineTradeCommand({
          tradeId: created.tradeId,
          playerId: sender.id,
          submissionId,
        }),
      ).rejects.toMatchObject({ code: 'TRADE_ACTION_NOT_ALLOWED' });
      expect((await snapshot()).rows).toEqual(beforeRejectedCommand.rows);

      const declined = await service.declineTradeCommand({
        tradeId: created.tradeId,
        playerId: recipient.id,
        submissionId,
      });
      const replay = await service.declineTradeCommand({
        tradeId: created.tradeId,
        playerId: recipient.id,
        submissionId,
      });
      expect(declined.status).toBe('declined');
      expect(replay.tradeId).toBe(declined.tradeId);
      expect(replay.status).toBe('declined');

      const persisted = await pool.query<{
        status: string;
        reservation_count: number;
        receipt_count: number;
        decline_receipt_count: number;
      }>(
        `select trade.status,
                (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                (select count(*)::integer from private.card_trade_submission_receipts receipt where receipt.trade_id = trade.id) receipt_count,
                (select count(*)::integer from private.card_trade_submission_receipts receipt where receipt.trade_id = trade.id and receipt.operation = 'trade_decline') decline_receipt_count
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [created.tradeId],
      );
      expect(persisted.rows[0]).toEqual({
        status: 'declined',
        reservation_count: 0,
        receipt_count: 1,
        decline_receipt_count: 1,
      });

      const deletionPending = await insertPlayerWithCollection(
        pool,
        'deletion_pending',
      );
      await pool.query(
        `with request as (
           insert into public.account_deletion_requests (id, requested_at, status)
           values ($1::uuid, clock_timestamp(), 'pending')
           returning id
         )
         update public.players
            set lifecycle_status = 'deletion_pending',
                deletion_request_id = (select id from request)
          where id = $2::uuid`,
        [randomUUID(), deletionPending.id],
      );
      await expect(
        service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: deletionPending.id,
          offeredOwnedCardIds: [sender.cards[1]!.id],
          requestedDefinitions: [
            {
              cardDefinitionId: deletionPending.cards[1]!.definitionId,
              quantity: 1,
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_PLAYER_UNAVAILABLE' });
      const rejectedDeletionTarget = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trades
          where sender_player_id = $1::uuid
            and recipient_player_id = $2::uuid`,
        [sender.id, deletionPending.id],
      );
      expect(rejectedDeletionTarget.rows[0]?.count).toBe(0);

      const directDeclineTrade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[2]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[1]!.definitionId, quantity: 1 },
        ],
      });
      await expect(
        service.declineTrade(directDeclineTrade.tradeId, recipient.id),
      ).resolves.toMatchObject({ status: 'declined' });
    });

    it('persists imbalance acknowledgements per participant and blocks unacknowledged acceptance', async () => {
      const sender = await insertPlayerWithCollection(pool, 'imbalance_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'imbalance_recipient',
      );
      const senderGrant = await pool.query<{ id: string }>(
        `select id::text from public.player_starter_grants
          where player_id = $1::uuid`,
        [sender.id],
      );
      const extraSenderPowers = await pool.query<{
        id: string;
        card_definition_id: string;
      }>(
        `insert into public.player_cards (
           id, player_id, card_definition_id, source_starter_grant_id,
           acquisition_kind
         )
         select gen_random_uuid(), $1::uuid, definition.id, $2::uuid, 'starter'
           from public.card_definitions definition
          where definition.category = 'power'
            and definition.is_active
            and definition.authoring_status = 'published'
            and definition.catalogue_class = 'ordinary'
            and not exists (
              select 1 from public.player_cards owned
               where owned.player_id = $1::uuid
                 and owned.card_definition_id = definition.id
            )
          order by definition.name, definition.id
          limit 3
         returning id::text, card_definition_id::text`,
        [sender.id, senderGrant.rows[0]!.id],
      );
      expect(extraSenderPowers.rows).toHaveLength(3);
      const senderOffer = [
        sender.cards[0]!,
        ...extraSenderPowers.rows.map((card) => ({
          id: card.id,
          definitionId: card.card_definition_id,
        })),
      ];
      const service = createCardTradeService(pool);
      const created = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: senderOffer.map((card) => card.id),
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      try {
        const complete = await service.reviseTrade({
          tradeId: created.tradeId,
          playerId: recipient.id,
          expectedVersion: created.version,
          offeredOwnedCardIds: [recipient.cards[0]!.id],
          requestedDefinitions: senderOffer.map((card) => ({
            cardDefinitionId: card.definitionId,
            quantity: 1,
          })),
        });
        expect(complete.complete).toBe(true);
        expect(complete.imbalanceWarningRequired).toBe(true);

        const senderAckId = randomUUID();
        const senderAcknowledgement = await service.acknowledgeImbalance({
          tradeId: created.tradeId,
          playerId: sender.id,
          submissionId: senderAckId,
          expectedVersion: complete.version,
        });
        const senderAckReplay = await service.acknowledgeImbalance({
          tradeId: created.tradeId,
          playerId: sender.id,
          submissionId: senderAckId,
          expectedVersion: complete.version,
        });
        expect(senderAcknowledgement.sender.imbalanceAcknowledged).toBe(true);
        expect(senderAckReplay.sender.imbalanceAcknowledged).toBe(true);
        expect(senderAckReplay.recipient.imbalanceAcknowledged).toBe(false);

        const accepted = await service.acceptTrade({
          tradeId: created.tradeId,
          playerId: sender.id,
          submissionId: randomUUID(),
          expectedVersion: complete.version,
        });
        expect(accepted).toMatchObject({
          status: 'open',
          complete: true,
          sender: { accepted: true },
          recipient: { accepted: false },
        });
        await expect(
          service.acceptTrade({
            tradeId: created.tradeId,
            playerId: recipient.id,
            submissionId: randomUUID(),
            expectedVersion: complete.version,
          }),
        ).rejects.toMatchObject({ code: 'TRADE_IMBALANCE_ACK_REQUIRED' });

        const beforeRecipientAcknowledgement = await pool.query<{
          status: string;
          acknowledgement_count: number;
          acceptance_count: number;
          reservation_count: number;
          receipt_count: number;
        }>(
          `select trade.status,
                  (select count(*)::integer from private.card_trade_imbalance_acknowledgements acknowledgement where acknowledgement.trade_id = trade.id and acknowledgement.version = trade.current_version) acknowledgement_count,
                  (select count(*)::integer from private.card_trade_acceptances acceptance where acceptance.trade_id = trade.id and acceptance.version = trade.current_version) acceptance_count,
                  (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                  (select count(*)::integer from private.card_trade_submission_receipts receipt where receipt.trade_id = trade.id) receipt_count
             from private.card_trades trade
            where trade.id = $1::uuid`,
          [created.tradeId],
        );
        expect(beforeRecipientAcknowledgement.rows[0]).toEqual({
          status: 'open',
          acknowledgement_count: 1,
          acceptance_count: 1,
          reservation_count: 5,
          receipt_count: 2,
        });

        const recipientAcknowledgement = await service.acknowledgeImbalance({
          tradeId: created.tradeId,
          playerId: recipient.id,
          submissionId: randomUUID(),
          expectedVersion: complete.version,
        });
        expect(recipientAcknowledgement.recipient.imbalanceAcknowledged).toBe(
          true,
        );
        const acknowledgements = await pool.query<{
          player_id: string;
          version: number;
        }>(
          `select player_id::text, version
             from private.card_trade_imbalance_acknowledgements
            where trade_id = $1::uuid
            order by player_id`,
          [created.tradeId],
        );
        expect(acknowledgements.rows).toEqual(
          [sender.id, recipient.id].sort().map((playerId) => ({
            player_id: playerId,
            version: complete.version,
          })),
        );
      } finally {
        const current = await service.getTrade(created.tradeId, sender.id);
        if (current.status === 'open') {
          await service.cancelTrade(created.tradeId, sender.id);
        }
      }
    });

    it('leaves versions and reservations unchanged after stale and wrong-owner revisions', async () => {
      const sender = await insertPlayerWithCollection(pool, 'reject_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'reject_recipient',
      );
      const service = createCardTradeService(pool);
      const created = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      const snapshot = async () =>
        pool.query(
          `select trade.status, trade.current_version,
                  (select count(*)::integer from private.card_trade_versions version where version.trade_id = trade.id) version_count,
                  (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                  (select count(*)::integer from private.card_trade_submission_receipts receipt where receipt.trade_id = trade.id) receipt_count,
                  (select count(*)::integer from private.card_trade_acceptances acceptance where acceptance.trade_id = trade.id) acceptance_count
             from private.card_trades trade
            where trade.id = $1::uuid`,
          [created.tradeId],
        );
      const before = await snapshot();

      await expect(
        service.reviseTrade({
          tradeId: created.tradeId,
          playerId: recipient.id,
          expectedVersion: created.version + 1,
          offeredOwnedCardIds: [recipient.cards[0]!.id],
          requestedDefinitions: [
            { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_VERSION_STALE' });
      await expect(
        service.reviseTrade({
          tradeId: created.tradeId,
          playerId: recipient.id,
          expectedVersion: created.version,
          offeredOwnedCardIds: [sender.cards[0]!.id],
          requestedDefinitions: [
            { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_COPY_CONFLICT' });

      expect((await snapshot()).rows).toEqual(before.rows);
    });

    it('prevents conflicting reservations and makes acceptance version-specific', async () => {
      const sender = await insertPlayerWithCollection(pool, 'version_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'version_recipient',
      );
      const other = await insertPlayerWithCollection(pool, 'version_other');
      const service = createCardTradeService(pool);

      const created = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      expect(created).toMatchObject({
        status: 'open',
        version: 1,
        complete: false,
      });

      await expect(
        service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: other.id,
          offeredOwnedCardIds: [sender.cards[0]!.id],
          requestedDefinitions: [
            { cardDefinitionId: other.cards[0]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_COPY_CONFLICT' });

      const complete = await service.reviseTrade({
        tradeId: created.tradeId,
        playerId: recipient.id,
        expectedVersion: 1,
        offeredOwnedCardIds: [recipient.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      expect(complete).toMatchObject({ version: 2, complete: true });

      const accepted = await service.acceptTrade({
        tradeId: created.tradeId,
        playerId: sender.id,
        expectedVersion: 2,
      });
      expect(accepted.sender.accepted).toBe(true);

      const revised = await service.reviseTrade({
        tradeId: created.tradeId,
        playerId: recipient.id,
        expectedVersion: 2,
        offeredOwnedCardIds: [recipient.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      expect(revised).toMatchObject({ version: 3, complete: true });
      expect(revised.sender.accepted).toBe(false);
      expect(revised.recipient.accepted).toBe(false);

      const historicalAcceptance = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trade_acceptances
          where trade_id = $1::uuid and version = 2`,
        [created.tradeId],
      );
      expect(historicalAcceptance.rows[0]?.count).toBe(1);

      await expect(
        service.acceptTrade({
          tradeId: created.tradeId,
          playerId: sender.id,
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({ code: 'TRADE_VERSION_STALE' });

      await service.cancelTrade(created.tradeId, sender.id);
    });

    it('serializes competing reservation attempts for the same exact copy', async () => {
      const sender = await insertPlayerWithCollection(pool, 'race_sender');
      const firstRecipient = await insertPlayerWithCollection(
        pool,
        'race_first',
      );
      const secondRecipient = await insertPlayerWithCollection(
        pool,
        'race_second',
      );
      const service = createCardTradeService(pool);

      const attempts = await Promise.allSettled([
        service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: firstRecipient.id,
          offeredOwnedCardIds: [sender.cards[0]!.id],
          requestedDefinitions: [
            {
              cardDefinitionId: firstRecipient.cards[0]!.definitionId,
              quantity: 1,
            },
          ],
        }),
        service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: secondRecipient.id,
          offeredOwnedCardIds: [sender.cards[0]!.id],
          requestedDefinitions: [
            {
              cardDefinitionId: secondRecipient.cards[0]!.definitionId,
              quantity: 1,
            },
          ],
        }),
      ]);

      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        attempts.filter((attempt) => attempt.status === 'rejected'),
      ).toHaveLength(1);
      const rejected = attempts.find(
        (attempt) => attempt.status === 'rejected',
      );
      expect(
        rejected?.status === 'rejected' ? rejected.reason : null,
      ).toMatchObject({
        code: 'TRADE_COPY_CONFLICT',
      });

      const fulfilled = attempts.find(
        (attempt) => attempt.status === 'fulfilled',
      );
      if (fulfilled?.status === 'fulfilled') {
        await service.cancelTrade(fulfilled.value.tradeId, sender.id);
      }
    });

    it('serializes final acceptance against cancellation without a partial exchange', async () => {
      const sender = await insertPlayerWithCollection(
        pool,
        'terminal_race_sender',
      );
      const recipient = await insertPlayerWithCollection(
        pool,
        'terminal_race_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await createCompleteTrade(service, sender, recipient);

      await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        submissionId: randomUUID(),
        expectedVersion: trade.version,
      });

      const outcomes = await Promise.allSettled([
        service.acceptTrade({
          tradeId: trade.tradeId,
          playerId: recipient.id,
          submissionId: randomUUID(),
          expectedVersion: trade.version,
        }),
        service.cancelTradeCommand({
          tradeId: trade.tradeId,
          playerId: sender.id,
          submissionId: randomUUID(),
        }),
      ]);

      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1);

      const state = await pool.query<{
        status: 'completed' | 'cancelled';
        receipt_count: number;
        movement_count: number;
        reservation_count: number;
        source_count: number;
      }>(
        `select trade.status,
                (select count(*)::integer from private.card_trade_settlement_receipts receipt where receipt.trade_id = trade.id) receipt_count,
                (select count(*)::integer from private.card_trade_movements movement join private.card_trade_settlement_receipts receipt on receipt.id = movement.receipt_id where receipt.trade_id = trade.id) movement_count,
                (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                (select count(*)::integer from public.player_cards owned where owned.id = any($2::uuid[])) source_count
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [trade.tradeId, [sender.cards[0]!.id, recipient.cards[0]!.id]],
      );

      if (state.rows[0]?.status === 'completed') {
        expect(state.rows[0]).toEqual({
          status: 'completed',
          receipt_count: 1,
          movement_count: 2,
          reservation_count: 0,
          source_count: 0,
        });
      } else {
        expect(state.rows[0]).toEqual({
          status: 'cancelled',
          receipt_count: 0,
          movement_count: 0,
          reservation_count: 0,
          source_count: 2,
        });
      }
    });

    it('blocks reserved copies from entering saved decks and releases them on cancellation', async () => {
      const sender = await insertPlayerWithCollection(pool, 'deck_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'deck_recipient',
      );
      const trades = createCardTradeService(pool);
      const decks = createDeckService(pool);

      const trade = await trades.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });

      await expect(
        decks.createDeck({
          playerId: sender.id,
          name: 'Reserved cards',
          ownedCardIds: sender.cards.map((card) => card.id),
        }),
      ).rejects.toBeInstanceOf(DeckOwnedCardNotFoundError);

      await trades.cancelTrade(trade.tradeId, sender.id);
      await expect(
        decks.createDeck({
          playerId: sender.id,
          name: 'Released cards',
          ownedCardIds: sender.cards.map((card) => card.id),
        }),
      ).resolves.toMatchObject({ name: 'Released cards' });
    });

    it('settles every listed copy exactly once with new ownership IDs and immutable provenance', async () => {
      const sender = await insertPlayerWithCollection(pool, 'settle_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'settle_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await createCompleteTrade(service, sender, recipient);

      const senderAcceptanceSubmissionId = randomUUID();
      const recipientAcceptanceSubmissionId = randomUUID();
      await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        submissionId: senderAcceptanceSubmissionId,
        expectedVersion: trade.version,
      });
      const settled = await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: recipient.id,
        submissionId: recipientAcceptanceSubmissionId,
        expectedVersion: trade.version,
      });

      expect(settled.status).toBe('completed');
      expect(settled.settlement?.movements).toHaveLength(2);
      const receiptId = settled.settlement?.receiptId;
      expect(receiptId).toBeTruthy();

      const sourceIds = [sender.cards[0]!.id, recipient.cards[0]!.id];
      const sourceRows = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from public.player_cards
          where id = any($1::uuid[])`,
        [sourceIds],
      );
      expect(sourceRows.rows[0]?.count).toBe(0);

      const grants = await pool.query<{
        id: string;
        player_id: string;
        acquisition_kind: string;
        source_trade_movement_id: string;
      }>(
        `select id::text, player_id::text, acquisition_kind,
                source_trade_movement_id::text
           from public.player_cards
          where source_trade_movement_id in (
            select id from private.card_trade_movements where receipt_id = $1::uuid
          )
          order by id`,
        [receiptId],
      );
      expect(grants.rows).toHaveLength(2);
      expect(grants.rows.every((row) => row.acquisition_kind === 'trade')).toBe(
        true,
      );
      expect(grants.rows.map((row) => row.id)).not.toEqual(
        expect.arrayContaining(sourceIds),
      );

      const movements = await pool.query<{
        source_owned_card_id: string;
        source_acquisition_kind: string;
        source_starter_grant_id: string | null;
      }>(
        `select source_owned_card_id::text, source_acquisition_kind,
                source_starter_grant_id::text
           from private.card_trade_movements
          where receipt_id = $1::uuid
          order by source_owned_card_id`,
        [receiptId],
      );
      expect(
        movements.rows.map((row) => row.source_owned_card_id).sort(),
      ).toEqual([...sourceIds].sort());
      expect(
        movements.rows.every(
          (row) =>
            row.source_acquisition_kind === 'starter' &&
            row.source_starter_grant_id !== null,
        ),
      ).toBe(true);

      const replay = await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        submissionId: senderAcceptanceSubmissionId,
        expectedVersion: trade.version,
      });
      expect(replay.settlement?.receiptId).toBe(receiptId);

      const acceptanceSubmissionReceipts = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trade_submission_receipts
          where trade_id = $1::uuid
            and operation = 'trade_accept'`,
        [trade.tradeId],
      );
      expect(acceptanceSubmissionReceipts.rows[0]?.count).toBe(2);

      const receiptCount = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.card_trade_settlement_receipts
          where trade_id = $1::uuid`,
        [trade.tradeId],
      );
      expect(receiptCount.rows[0]?.count).toBe(1);

      await expect(
        pool.query(
          `update private.card_trades set terminal_reason = 'changed' where id = $1::uuid`,
          [trade.tradeId],
        ),
      ).rejects.toThrow();
    });

    it('rolls back the full exchange when a recipient grant fails', async () => {
      const sender = await insertPlayerWithCollection(pool, 'rollback_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'rollback_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await createCompleteTrade(service, sender, recipient);

      await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        expectedVersion: trade.version,
      });

      await pool.query(`
        create function private.test_reject_trade_grant()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.acquisition_kind = 'trade' then
            raise exception 'test trade grant failure';
          end if;
          return new;
        end;
        $$;
        create trigger test_reject_trade_grant
        before insert on public.player_cards
        for each row execute function private.test_reject_trade_grant();
      `);

      try {
        await expect(
          service.acceptTrade({
            tradeId: trade.tradeId,
            playerId: recipient.id,
            expectedVersion: trade.version,
          }),
        ).rejects.toThrow('test trade grant failure');
      } finally {
        await pool.query(
          `drop trigger if exists test_reject_trade_grant on public.player_cards;
           drop function if exists private.test_reject_trade_grant();`,
        );
      }

      const persisted = await pool.query<{
        status: string;
        receipt_count: number;
        movement_count: number;
        reservation_count: number;
        source_count: number;
        acceptance_count: number;
      }>(
        `select trade.status,
                (select count(*)::integer from private.card_trade_settlement_receipts receipt where receipt.trade_id = trade.id) receipt_count,
                (select count(*)::integer from private.card_trade_movements movement join private.card_trade_settlement_receipts receipt on receipt.id = movement.receipt_id where receipt.trade_id = trade.id) movement_count,
                (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservation_count,
                (select count(*)::integer from public.player_cards owned where owned.id = any($2::uuid[])) source_count,
                (select count(*)::integer from private.card_trade_acceptances acceptance where acceptance.trade_id = trade.id and acceptance.version = trade.current_version) acceptance_count
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [trade.tradeId, [sender.cards[0]!.id, recipient.cards[0]!.id]],
      );
      expect(persisted.rows[0]).toEqual({
        status: 'open',
        receipt_count: 0,
        movement_count: 0,
        reservation_count: 2,
        source_count: 2,
        acceptance_count: 1,
      });

      await service.cancelTrade(trade.tradeId, sender.id);
    });

    it('commits deadline expiry before rejecting stale actions and keeps terminal trades immutable', async () => {
      const sender = await insertPlayerWithCollection(pool, 'expiry_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'expiry_recipient',
      );
      const service = createCardTradeService(pool);
      const tradeId = randomUUID();

      const expiryClient = await pool.connect();
      try {
        await expiryClient.query('begin');
        await expiryClient.query(
          `insert into private.card_trades (
             id, sender_player_id, recipient_player_id, policy_version,
             current_version, status, created_at, expires_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, 'card-trade-v1', 1, 'open',
             clock_timestamp() - interval '2 days',
             clock_timestamp() - interval '1 day'
           )`,
          [tradeId, sender.id, recipient.id],
        );
        await expiryClient.query(
          `insert into private.card_trade_versions (
             trade_id, version, created_by_player_id, created_at
           ) values ($1::uuid, 1, $2::uuid, clock_timestamp() - interval '2 days')`,
          [tradeId, sender.id],
        );
        await expiryClient.query(
          `insert into private.card_trade_version_items (
             trade_id, version, offering_player_id, position, owned_card_id,
             card_definition_id, rarity, acquired_at, acquisition_kind
           )
           select $1::uuid, 1, owned.player_id, 1, owned.id,
                  owned.card_definition_id, definition.rarity, owned.acquired_at,
                  owned.acquisition_kind
             from public.player_cards owned
             join public.card_definitions definition
               on definition.id = owned.card_definition_id
            where owned.id = $2::uuid`,
          [tradeId, sender.cards[0]!.id],
        );
        await expiryClient.query(
          `insert into private.card_trade_reservations (
             owned_card_id, trade_id, version, player_id, reserved_at
           ) values ($1::uuid, $2::uuid, 1, $3::uuid, clock_timestamp() - interval '2 days')`,
          [sender.cards[0]!.id, tradeId, sender.id],
        );
        await expiryClient.query('commit');
      } catch (error) {
        await expiryClient.query('rollback');
        throw error;
      } finally {
        expiryClient.release();
      }

      await expect(
        service.reviseTrade({
          tradeId,
          playerId: sender.id,
          expectedVersion: 1,
          offeredOwnedCardIds: [sender.cards[0]!.id],
          requestedDefinitions: [
            { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_NOT_OPEN' });

      const expired = await pool.query<{
        status: string;
        terminal_reason: string;
        reservations: number;
      }>(
        `select trade.status, trade.terminal_reason,
                (select count(*)::integer
                   from private.card_trade_reservations reservation
                  where reservation.trade_id = trade.id) reservations
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [tradeId],
      );
      expect(expired.rows[0]).toEqual({
        status: 'expired',
        terminal_reason: 'deadline_elapsed',
        reservations: 0,
      });

      await expect(
        pool.query(
          `update private.card_trades set status = 'open', terminal_at = null, terminal_reason = null where id = $1::uuid`,
          [tradeId],
        ),
      ).rejects.toThrow();
    });

    it('keeps trust-v1 historical while a trust-v2 card trade hold invalidates open offers', async () => {
      const sender = await insertPlayerWithCollection(pool, 'hold_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'hold_recipient',
      );
      const author = await insertAuthor(pool, 'hold_author');
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });

      const snapshotId = randomUUID();
      const caseId = randomUUID();
      const openedDecisionId = randomUUID();
      const holdDecisionId = randomUUID();
      const restrictionId = randomUUID();

      const trustClient = await pool.connect();
      try {
        await trustClient.query('begin');
        await trustClient.query(
          `insert into private.trust_score_snapshots (
             id, player_id, policy_version, evaluated_at,
             movement_points, submission_conflict_points, opponent_pattern_points,
             final_score, review_band, source_signal_count, calculation_digest
           ) values (
             $1::uuid, $2::uuid, 'trust-v2', clock_timestamp(),
             50, 0, 0, 50, 'review_required', 0, decode(repeat('00', 32), 'hex')
           )`,
          [snapshotId, sender.id],
        );
        const openedAt = await trustClient.query<{ at: Date }>(
          `select clock_timestamp() as at`,
        );
        await trustClient.query(
          `insert into private.trust_cases (
             id, player_id, policy_version, status, version, current_score,
             current_band, latest_score_snapshot_id, opened_at, updated_at
           ) values (
             $1::uuid, $2::uuid, 'trust-v2', 'open', 1, 50,
             'review_required', $3::uuid, $4::timestamptz, $4::timestamptz
           )`,
          [caseId, sender.id, snapshotId, openedAt.rows[0]!.at],
        );
        await trustClient.query(
          `insert into private.trust_case_decisions (
             id, case_id, actor_type, actor_player_id, policy_version,
             case_version_before, case_version_after, decision_type,
             previous_status, resulting_status, reason_code,
             resulting_score_snapshot_id, created_at
           ) values (
             $1::uuid, $2::uuid, 'system', null, 'trust-v2',
             0, 1, 'case_opened', null, 'open', 'score_threshold_crossed',
             $3::uuid, $4::timestamptz
           )`,
          [openedDecisionId, caseId, snapshotId, openedAt.rows[0]!.at],
        );
        const reviewAt = await trustClient.query<{ at: Date }>(
          `select clock_timestamp() as at`,
        );
        await trustClient.query(
          `update private.trust_cases
              set status = 'under_review',
                  version = 2,
                  updated_at = $2::timestamptz
            where id = $1::uuid`,
          [caseId, reviewAt.rows[0]!.at],
        );
        await trustClient.query(
          `insert into private.trust_case_decisions (
             id, case_id, actor_type, actor_player_id, policy_version,
             case_version_before, case_version_after, decision_type,
             previous_status, resulting_status, reason_code,
             resulting_score_snapshot_id, created_at
           ) values (
             $1::uuid, $2::uuid, 'author', $3::uuid, 'trust-v2',
             1, 2, 'restriction_applied', 'open', 'under_review',
             'card_trade_review', $4::uuid, $5::timestamptz
           )`,
          [holdDecisionId, caseId, author, snapshotId, reviewAt.rows[0]!.at],
        );
        await trustClient.query(
          `insert into private.trust_restrictions (
             id, case_id, player_id, decision_id, policy_version, scope,
             starts_at, original_expires_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'trust-v2',
             'card_trade_hold', $5, $5::timestamptz + interval '1 day'
           )`,
          [
            restrictionId,
            caseId,
            sender.id,
            holdDecisionId,
            reviewAt.rows[0]!.at,
          ],
        );
        await trustClient.query('commit');
      } catch (error) {
        await trustClient.query('rollback');
        throw error;
      } finally {
        trustClient.release();
      }

      const state = await pool.query<{
        status: string;
        terminal_reason: string;
        reservations: number;
      }>(
        `select trade.status, trade.terminal_reason,
                (select count(*)::integer
                   from private.card_trade_reservations reservation
                  where reservation.trade_id = trade.id) reservations
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [trade.tradeId],
      );
      expect(state.rows[0]).toEqual({
        status: 'invalidated',
        terminal_reason: 'card_trade_hold',
        reservations: 0,
      });

      await expect(
        service.createTrade({
          senderPlayerId: sender.id,
          recipientPlayerId: recipient.id,
          offeredOwnedCardIds: [sender.cards[1]!.id],
          requestedDefinitions: [
            { cardDefinitionId: recipient.cards[1]!.definitionId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'TRADE_PLAYER_UNAVAILABLE' });
    });

    it('invalidates unfinished trades and releases reservations when deletion begins', async () => {
      const sender = await insertPlayerWithCollection(pool, 'delete_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'delete_recipient',
      );
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });
      const deletionRequestId = randomUUID();

      await pool.query(
        `insert into public.account_deletion_requests (
           id, requested_at, status
         ) values ($1::uuid, clock_timestamp(), 'pending')`,
        [deletionRequestId],
      );
      await pool.query(
        `update public.players
            set lifecycle_status = 'deletion_pending',
                deletion_request_id = $2::uuid
          where id = $1::uuid`,
        [sender.id, deletionRequestId],
      );

      const state = await pool.query<{
        status: string;
        terminal_reason: string;
        reservations: number;
      }>(
        `select trade.status, trade.terminal_reason,
                (select count(*)::integer from private.card_trade_reservations reservation where reservation.trade_id = trade.id) reservations
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [trade.tradeId],
      );
      expect(state.rows[0]).toEqual({
        status: 'invalidated',
        terminal_reason: 'account_deletion',
        reservations: 0,
      });
    });

    it('keeps participant authority and not-found guards from changing an open offer', async () => {
      const sender = await insertPlayerWithCollection(pool, 'authority_sender');
      const recipient = await insertPlayerWithCollection(
        pool,
        'authority_recipient',
      );
      const outsider = await insertPlayerWithCollection(
        pool,
        'authority_outsider',
      );
      const service = createCardTradeService(pool);
      const trade = await service.createTrade({
        senderPlayerId: sender.id,
        recipientPlayerId: recipient.id,
        offeredOwnedCardIds: [sender.cards[0]!.id],
        requestedDefinitions: [
          { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
        ],
      });

      await expect(
        service.getTrade(randomUUID(), sender.id),
      ).rejects.toMatchObject({
        code: 'TRADE_NOT_FOUND',
      });
      await expect(
        service.getTrade(trade.tradeId, outsider.id),
      ).rejects.toMatchObject({ code: 'TRADE_NOT_PARTICIPANT' });
      await expect(
        service.declineTrade(trade.tradeId, outsider.id),
      ).rejects.toMatchObject({ code: 'TRADE_NOT_PARTICIPANT' });

      const persisted = await pool.query<{
        status: string;
        version: number;
        reservation_count: number;
        acceptance_count: number;
      }>(
        `select trade.status, trade.current_version as version,
                (select count(*)::integer from private.card_trade_reservations reservation
                  where reservation.trade_id = trade.id) reservation_count,
                (select count(*)::integer from private.card_trade_acceptances acceptance
                  where acceptance.trade_id = trade.id) acceptance_count
           from private.card_trades trade
          where trade.id = $1::uuid`,
        [trade.tradeId],
      );
      expect(persisted.rows).toEqual([
        {
          status: 'open',
          version: 1,
          reservation_count: 1,
          acceptance_count: 0,
        },
      ]);
    });
  },
);

async function createCompleteTrade(
  service: ReturnType<typeof createCardTradeService>,
  sender: PlayerFixture,
  recipient: PlayerFixture,
) {
  const created = await service.createTrade({
    senderPlayerId: sender.id,
    recipientPlayerId: recipient.id,
    offeredOwnedCardIds: [sender.cards[0]!.id],
    requestedDefinitions: [
      { cardDefinitionId: recipient.cards[0]!.definitionId, quantity: 1 },
    ],
  });
  return service.reviseTrade({
    tradeId: created.tradeId,
    playerId: recipient.id,
    expectedVersion: created.version,
    offeredOwnedCardIds: [recipient.cards[0]!.id],
    requestedDefinitions: [
      { cardDefinitionId: sender.cards[0]!.definitionId, quantity: 1 },
    ],
  });
}

async function insertPlayerWithCollection(
  database: Pick<pg.Pool, 'query'>,
  label: string,
): Promise<PlayerFixture> {
  const id = randomUUID();
  const grantId = randomUUID();
  const playerName = label.slice(0, 20);
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role, created_at, updated_at
     ) values (
       $1::uuid, 'https://issuer.example/', $2, $3, 'player',
       clock_timestamp() - interval '2 days',
       clock_timestamp() - interval '2 days'
     )`,
    [id, `auth0|trade-${label}-${id}`, playerName],
  );
  await database.query(
    `insert into public.player_starter_grants (
       id, player_id, affinity, granted_at
     ) values ($1::uuid, $2::uuid, 'wit', clock_timestamp() - interval '2 days')`,
    [grantId, id],
  );

  const catalogue = await database.query<DefinitionRow>(
    `select id::text, category, rarity
       from public.card_definitions
      where is_active
        and authoring_status = 'published'
        and catalogue_class = 'ordinary'
        and rarity = 'common'
      order by category, name, id`,
  );
  const selected = [
    ...catalogue.rows.filter((row) => row.category === 'creature').slice(0, 3),
    ...catalogue.rows.filter((row) => row.category === 'power').slice(0, 2),
  ];
  if (selected.length !== 5)
    throw new Error('Common trade fixture cards unavailable.');

  const cards: OwnedFixtureCard[] = [];
  for (const [index, definition] of selected.entries()) {
    const cardId = randomUUID();
    await database.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, source_starter_grant_id,
         acquisition_kind, acquired_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid,
         'starter', clock_timestamp() - ($5::integer * interval '1 minute')
       )`,
      [cardId, id, definition.id, grantId, index],
    );
    cards.push({
      id: cardId,
      definitionId: definition.id,
      category: definition.category,
    });
  }
  return { id, playerName, cards };
}

async function insertAuthor(
  database: Pick<pg.Pool, 'query'>,
  label: string,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, role, created_at, updated_at
     ) values (
       $1::uuid, 'https://issuer.example/', $2, 'author',
       clock_timestamp() - interval '2 days',
       clock_timestamp() - interval '2 days'
     )`,
    [id, `auth0|trade-${label}-${id}`],
  );
  return id;
}

async function seedPreMigrationDeck(client: {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}): Promise<PreMigrationFixture> {
  const playerId = randomUUID();
  const grantId = randomUUID();
  const deckId = randomUUID();
  const catalogue = await client.query<DefinitionRow>(
    `select id::text, category, rarity
       from public.card_definitions
      where is_active
        and authoring_status = 'published'
        and catalogue_class = 'ordinary'
        and rarity = 'common'
      order by category, name, id`,
  );
  const selected = [
    ...catalogue.rows.filter((row) => row.category === 'creature').slice(0, 3),
    ...catalogue.rows.filter((row) => row.category === 'power').slice(0, 2),
  ];
  if (selected.length !== 5)
    throw new Error('Pre-migration fixture cards unavailable.');

  await client.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, role, created_at, updated_at
     ) values (
       $1::uuid, 'https://issuer.example/', $2, 'player',
       clock_timestamp() - interval '2 days',
       clock_timestamp() - interval '2 days'
     )`,
    [playerId, `auth0|trade-pre-${playerId}`],
  );
  await client.query(
    `insert into public.player_starter_grants (id, player_id, affinity, granted_at)
     values ($1::uuid, $2::uuid, 'wit', clock_timestamp() - interval '2 days')`,
    [grantId, playerId],
  );

  const cardIds: string[] = [];
  for (const [index, definition] of selected.entries()) {
    const cardId = randomUUID();
    cardIds.push(cardId);
    await client.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, source_starter_grant_id,
         acquisition_kind, acquired_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'starter',
         clock_timestamp() - ($5::integer * interval '1 minute')
       )`,
      [cardId, playerId, definition.id, grantId, index],
    );
  }

  await client.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Pre-trade deck')`,
    [deckId, playerId],
  );
  for (const [index, cardId] of cardIds.entries()) {
    await client.query(
      `insert into public.player_deck_cards (
         deck_id, player_id, owned_card_id, position
       ) values ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [deckId, playerId, cardId, index + 1],
    );
  }

  return { playerId, deckId, cardIds };
}

async function copyMigrationsBeforeTradePersistence(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(
    join(tmpdir(), 'wits-card-trade-migrations-'),
  );
  const migrationNames = await readdir(sourceDirectory);
  await Promise.all(
    migrationNames
      .filter((name) => name.endsWith('.sql') && name < MIGRATION_NAME)
      .map((name) =>
        copyFile(join(sourceDirectory, name), join(targetDirectory, name)),
      ),
  );
  return targetDirectory;
}
