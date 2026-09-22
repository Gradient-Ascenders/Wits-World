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
        expectedVersion: trade.version,
      });

      const outcomes = await Promise.allSettled([
        service.acceptTrade({
          tradeId: trade.tradeId,
          playerId: recipient.id,
          expectedVersion: trade.version,
        }),
        service.cancelTrade(trade.tradeId, sender.id),
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

      await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: sender.id,
        expectedVersion: trade.version,
      });
      const settled = await service.acceptTrade({
        tradeId: trade.tradeId,
        playerId: recipient.id,
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
        expectedVersion: trade.version,
      });
      expect(replay.settlement?.receiptId).toBe(receiptId);

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
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, role, created_at, updated_at
     ) values (
       $1::uuid, 'https://issuer.example/', $2, 'player',
       clock_timestamp() - interval '2 days',
       clock_timestamp() - interval '2 days'
     )`,
    [id, `auth0|trade-${label}-${id}`],
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
  return { id, cards };
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
