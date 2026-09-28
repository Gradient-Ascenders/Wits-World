import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
import { getMigrationsDirectory } from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';
import { createAsyncPvpService } from '../src/matches/asynchronous-pvp-service.js';
import { TrustActivityRestrictedError } from '../src/trust/trust-restrictions.js';
import { createAsyncPvpDeadlineProcessor } from '../src/matches/asynchronous-pvp-deadline-processor.js';
import { createSignedCursorCodec } from '../src/security/signed-cursor.js';
import { createProgressionPersistence } from '../src/progression/progression-persistence.js';

const MIGRATION_NAME = '0028_create_asynchronous_pvp_persistence.sql';
const INVALIDATION_MIGRATION_NAME =
  '0033_add_async_pvp_invitation_invalidation.sql';
const INDEX_CLEANUP_MIGRATION_NAME = '0036_remove_duplicate_indexes.sql';
const RESIGNATION_MIGRATION_NAME =
  '0037_add_async_pvp_voluntary_resignation.sql';
const CANCELLATION_MIGRATION_NAME =
  '0039_add_async_pvp_invitation_cancellation.sql';
const COMPLETE_CATALOGUE_MIGRATION_NAME = '0041_complete_card_catalogue.sql';
const CARD_EVOLUTION_MIGRATION_NAME = '0042_implement_card_evolution.sql';
const TERRITORY_RUNTIME_MIGRATION_NAME =
  '0054_implement_contested_territory_runtime.sql';
const CARD_TRADE_MIGRATION_NAME = '0055_persist_versioned_card_trades.sql';
const CARD_TRADE_IDEMPOTENCY_MIGRATION_NAME =
  '0056_add_card_trade_submission_receipts.sql';
const HISTORY_ACTOR_MIGRATION_NAME = '0062_detach_deleted_player_history.sql';
const ACCOUNT_PURGE_MIGRATION_NAME =
  '0063_purge_deleted_player_progression.sql';
const PRE_MIGRATION_PLAYER_ID = '17900000-0000-4000-8000-000000000001';
const PRE_MIGRATION_MATCH_ID = '17900000-0000-4000-8000-000000000002';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface CardDefinitionFixture extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic' | null;
  rarity: 'common';
}

interface PendingInvitationFixture {
  invitationId: string;
  challengerPlayerId: string;
  recipientPlayerId: string;
  challengerSnapshotId: string;
  createSubmissionId: string;
}

interface AcceptedMatchFixture extends PendingInvitationFixture {
  matchId: string;
  recipientSnapshotId: string;
}

interface SnapshotBattleCardFixture extends pg.QueryResultRow {
  participant_role: 'challenger' | 'recipient';
  battle_card_id: string;
  category: 'creature' | 'power';
  affinity: CardDefinitionFixture['affinity'];
}

interface TerminalMoveStateRow extends pg.QueryResultRow {
  battle_state: {
    participants: Record<
      'cpu' | 'player',
      {
        activeCreatureId: string;
        creatures: Array<{
          card: {
            id: string;
            moves: Array<{
              id: string;
              name: string;
              moveType: 'basic';
              powerCost: number;
              effects: Array<{
                id: string;
                effectType: 'damage';
                effectValue: number;
              }>;
            }>;
          };
          currentHp: number;
          defeated: boolean;
        }>;
      }
    >;
  };
}

describe.skipIf(!runIntegrationTests)(
  'asynchronous PvP persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let preMigrationDirectory: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let cardDefinitions: CardDefinitionFixture[];

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_async_pvp_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      preMigrationDirectory = await copyPrePvpMigrations();
      await runMigrations(temporaryConfig, preMigrationDirectory);
      const preMigrationPool = createDatabasePool(temporaryConfig);

      try {
        await seedRetainedCpuProgression(preMigrationPool);
      } finally {
        await preMigrationPool.end();
      }

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toEqual([
        MIGRATION_NAME,
        INVALIDATION_MIGRATION_NAME,
        INDEX_CLEANUP_MIGRATION_NAME,
        RESIGNATION_MIGRATION_NAME,
        CANCELLATION_MIGRATION_NAME,
        COMPLETE_CATALOGUE_MIGRATION_NAME,
        CARD_EVOLUTION_MIGRATION_NAME,
        TERRITORY_RUNTIME_MIGRATION_NAME,
        CARD_TRADE_MIGRATION_NAME,
        CARD_TRADE_IDEMPOTENCY_MIGRATION_NAME,
        HISTORY_ACTOR_MIGRATION_NAME,
        ACCOUNT_PURGE_MIGRATION_NAME,
      ]);

      pool = createDatabasePool(temporaryConfig);
      const retainedAward = await pool.query<{
        cpu_match_id: string;
        points_awarded: number;
      }>(
        `select cpu_match_id::text, points_awarded
           from public.player_point_awards
          where cpu_match_id = $1::uuid`,
        [PRE_MIGRATION_MATCH_ID],
      );
      expect(retainedAward.rows).toEqual([
        {
          cpu_match_id: PRE_MIGRATION_MATCH_ID,
          points_awarded: 25,
        },
      ]);

      await runSeeds(temporaryConfig);
      const definitions = await pool.query<CardDefinitionFixture>(
        `select id::text, category, affinity, rarity
           from public.card_definitions
          where is_active = true
            and rarity = 'common'
          order by category, affinity, name, id`,
      );
      cardDefinitions = [
        ...definitions.rows
          .filter((definition) => definition.category === 'creature')
          .slice(0, 3),
        ...definitions.rows
          .filter((definition) => definition.category === 'power')
          .slice(0, 2),
      ];

      expect(cardDefinitions).toHaveLength(5);
    }, 90_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (preMigrationDirectory) {
        await rm(preMigrationDirectory, { force: true, recursive: true });
      }

      if (!administrationConfig || !temporaryDatabaseName) {
        return;
      }

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('keeps private state separate and creates the required access indexes', async () => {
      const privateTables = await pool.query<{ table_name: string }>(
        `select table_name
           from information_schema.tables
          where table_schema = 'private'
            and table_name like 'async_pvp_%'
          order by table_name`,
      );
      expect(privateTables.rows.map((row) => row.table_name)).toEqual([
        'async_pvp_deck_snapshot_cards',
        'async_pvp_deck_snapshots',
        'async_pvp_match_states',
        'async_pvp_match_transitions',
        'async_pvp_submission_receipts',
      ]);

      const publicColumns = await pool.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name in ('async_pvp_invitations', 'async_pvp_matches')`,
      );
      expect(publicColumns.rows.map((row) => row.column_name)).not.toEqual(
        expect.arrayContaining([
          'battle_state',
          'card_snapshot',
          'committed_response',
          'state_before',
          'state_after',
        ]),
      );

      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
           from pg_indexes
          where schemaname in ('public', 'private')
            and tablename like 'async_pvp_%'`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'async_pvp_invitations_pending_pair_unique_idx',
          'async_pvp_invitations_overdue_idx',
          'async_pvp_invitations_recipient_list_idx',
          'async_pvp_match_participants_player_idx',
          'async_pvp_matches_active_idx',
          'async_pvp_matches_history_idx',
          'async_pvp_matches_overdue_idx',
          'async_pvp_match_actions_sequence_unique',
          'async_pvp_submission_receipts_actor_operation_unique',
          'async_pvp_submission_receipts_match_resign_unique_idx',
          'async_pvp_submission_receipts_invitation_cancel_unique_idx',
        ]),
      );
    });

    it('records account-deletion invalidation as a distinct immutable terminal state', async () => {
      const challengerPlayerId = await insertPlayer(
        pool,
        'invalidation_challenger',
      );
      const recipientPlayerId = await insertPlayer(
        pool,
        'invalidation_recipient',
      );
      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId,
        recipientPlayerId,
      });

      const invalidated = await pool.query<{
        match_id: string | null;
        responded_at: Date;
        status: string;
        version: number;
      }>(
        `update public.async_pvp_invitations
            set status = 'invalidated',
                version = version + 1,
                responded_at = created_at + interval '1 minute',
                updated_at = created_at + interval '1 minute'
          where id = $1::uuid
          returning status, version, responded_at, match_id::text`,
        [invitation.invitationId],
      );
      expect(invalidated.rows[0]).toMatchObject({
        match_id: null,
        status: 'invalidated',
        version: 1,
      });
      await expect(
        pool.query(
          `update public.async_pvp_invitations
              set updated_at = updated_at + interval '1 second'
            where id = $1::uuid`,
          [invitation.invitationId],
        ),
      ).rejects.toThrow('Terminal asynchronous PvP invitation');

      const lateInvitation = await createPendingInvitation(
        pool,
        cardDefinitions,
      );
      await expect(
        pool.query(
          `update public.async_pvp_invitations
              set status = 'invalidated',
                  version = version + 1,
                  responded_at = expires_at,
                  updated_at = expires_at
            where id = $1::uuid`,
          [lateInvitation.invitationId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_invitations_lifecycle_check',
      });
    });

    it('preserves elapsed deadline outcomes while finalizing account deletion atomically', async () => {
      const pending = await createPendingInvitation(pool, cardDefinitions);
      const accepted = await createAcceptedMatch(pool, cardDefinitions);
      const overdueActor = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const overdueOpponent = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const requestedAt = new Date();
      const client = await pool.connect();
      try {
        await client.query('begin');
        await service.finalizeAccountDeletion(
          client,
          pending.challengerPlayerId,
          requestedAt,
        );
        await service.finalizeAccountDeletion(
          client,
          accepted.challengerPlayerId,
          requestedAt,
        );
        await service.finalizeAccountDeletion(
          client,
          overdueActor.challengerPlayerId,
          requestedAt,
        );
        await service.finalizeAccountDeletion(
          client,
          overdueOpponent.recipientPlayerId,
          requestedAt,
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }

      const terminal = await pool.query<{
        completion_reason: string;
        match_id: string;
        progression_count: string;
        winner_player_id: string;
      }>(
        `select match.id::text as match_id,
                match.completion_reason,
                match.winner_player_id::text,
                (select count(*)::text
                  from public.player_point_awards award
                  where award.async_pvp_match_id = match.id
                ) as progression_count
           from public.async_pvp_matches match
          where match.id = any($1::uuid[])`,
        [[accepted.matchId, overdueActor.matchId, overdueOpponent.matchId]],
      );
      expect(terminal.rows).toEqual(
        expect.arrayContaining([
          {
            match_id: accepted.matchId,
            completion_reason: 'account_deletion_forfeit',
            progression_count: '2',
            winner_player_id: accepted.recipientPlayerId,
          },
          {
            match_id: overdueActor.matchId,
            completion_reason: 'turn_forfeit',
            progression_count: '2',
            winner_player_id: overdueActor.recipientPlayerId,
          },
          {
            match_id: overdueOpponent.matchId,
            completion_reason: 'turn_forfeit',
            progression_count: '2',
            winner_player_id: overdueOpponent.recipientPlayerId,
          },
        ]),
      );
      await expect(
        pool.query<{ status: string }>(
          `select status
             from public.async_pvp_invitations
            where id = $1::uuid`,
          [pending.invitationId],
        ),
      ).resolves.toMatchObject({ rows: [{ status: 'invalidated' }] });
    });

    it('enforces deck, access, hidden-state, action, replay, and concurrency rules through the real service', async () => {
      const challengerPlayerId = await insertPlayer(pool, 'service_challenger');
      const recipientPlayerId = await insertPlayer(pool, 'service_recipient');
      const unrelatedPlayerId = await insertPlayer(pool, 'service_unrelated');
      const challengerDeck = await createOwnedDeck(
        pool,
        challengerPlayerId,
        cardDefinitions,
      );
      const recipientDeck = await createOwnedDeck(
        pool,
        recipientPlayerId,
        cardDefinitions,
      );
      const recipientName = await pool.query<{ player_name: string }>(
        `select player_name from public.players where id = $1::uuid`,
        [recipientPlayerId],
      );
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
        randomInt: () => 0,
      });
      const submissionId = randomUUID();
      const createInput = {
        playerId: challengerPlayerId,
        opponentPlayerName: recipientName.rows[0]!.player_name,
        deckId: challengerDeck.deckId,
        initialCreatureId: challengerDeck.creatureId,
        submissionId,
      };

      await expect(
        service.createInvitation({
          ...createInput,
          deckId: randomUUID(),
          submissionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'PVP_DECK_INVALID' });

      const invitation = await service.createInvitation(createInput);
      await expect(service.createInvitation(createInput)).resolves.toEqual(
        invitation,
      );
      expect(invitation).toMatchObject({
        direction: 'outgoing',
        status: 'pending',
        opponent: { playerName: recipientName.rows[0]!.player_name },
      });
      expect(invitation).not.toHaveProperty('deckId');
      expect(invitation).not.toHaveProperty('initialCreatureId');
      await expect(
        service.listInvitations({
          playerId: recipientPlayerId,
          direction: 'incoming',
          status: 'pending',
          limit: 1,
        }),
      ).resolves.toMatchObject({
        items: [
          {
            invitationId: invitation.invitationId,
            direction: 'incoming',
          },
        ],
        nextCursor: null,
      });

      const restrictedAcceptService = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
        randomInt: () => 0,
        trustRestrictions: {
          async assertAllowed(playerId) {
            if (playerId === challengerPlayerId) {
              throw new TrustActivityRestrictedError({
                scope: 'new_competitive_match_hold',
                startsAt: new Date(),
                expiresAt: new Date(Date.now() + 60_000),
              });
            }
          },
        },
      });
      await expect(
        restrictedAcceptService.acceptInvitation({
          playerId: recipientPlayerId,
          invitationId: invitation.invitationId,
          deckId: recipientDeck.deckId,
          initialCreatureId: recipientDeck.creatureId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ code: 'PVP_PLAYER_UNAVAILABLE' });

      const accepted = await service.acceptInvitation({
        playerId: recipientPlayerId,
        invitationId: invitation.invitationId,
        deckId: recipientDeck.deckId,
        initialCreatureId: recipientDeck.creatureId,
        submissionId: randomUUID(),
        expectedVersion: 0,
      });
      expect(accepted.invitation.status).toBe('accepted');
      expect(accepted.match).toMatchObject({
        status: 'active',
        version: 0,
        currentActor: 'opponent',
      });

      const challengerView = await service.getMatch(
        challengerPlayerId,
        accepted.match.matchId,
      );
      expect(challengerView.currentActor).toBe('self');
      expect(challengerView.state.self.creatures).toHaveLength(3);
      expect(challengerView.state.self.creatures).toEqual(
        expect.arrayContaining([expect.objectContaining({ rarity: 'common' })]),
      );
      expect(challengerView.state.opponent.activeCreature).toEqual(
        expect.objectContaining({ rarity: 'common' }),
      );
      expect(challengerView.state.opponent).not.toHaveProperty('creatures');
      expect(challengerView.legalActions.length).toBeGreaterThan(0);
      await expect(
        service.getMatch(unrelatedPlayerId, accepted.match.matchId),
      ).rejects.toMatchObject({ code: 'PVP_MATCH_NOT_FOUND' });
      await expect(
        service.listActiveMatches({ playerId: challengerPlayerId, limit: 1 }),
      ).resolves.toMatchObject({
        items: [
          {
            matchId: challengerView.matchId,
            currentActor: 'self',
          },
        ],
        nextCursor: null,
      });
      const action = challengerView.legalActions[0]!;
      await expect(
        service.submitAction({
          playerId: challengerPlayerId,
          matchId: challengerView.matchId,
          submissionId: randomUUID(),
          expectedVersion: challengerView.version,
          action: { type: 'use_move', moveId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'PVP_ACTION_ILLEGAL' });
      const actionSubmissionId = randomUUID();
      const actionInput = {
        playerId: challengerPlayerId,
        matchId: challengerView.matchId,
        submissionId: actionSubmissionId,
        expectedVersion: challengerView.version,
        action,
      };
      const advanced = await service.submitAction({
        ...actionInput,
      });
      expect(advanced.version).toBe(1);
      expect(advanced.lastAction).toMatchObject({ side: 'self' });
      expect(advanced.history).toEqual([
        expect.objectContaining({
          sequence: 1,
          turnNumber: 1,
          result: expect.objectContaining({ side: 'self' }),
        }),
      ]);
      await expect(service.submitAction(actionInput)).resolves.toEqual(
        advanced,
      );

      const recipientView = await service.getMatch(
        recipientPlayerId,
        challengerView.matchId,
      );
      expect(recipientView.currentActor).toBe('self');
      const competingResults = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((competingSubmissionId) =>
          service.submitAction({
            playerId: recipientPlayerId,
            matchId: recipientView.matchId,
            submissionId: competingSubmissionId,
            expectedVersion: recipientView.version,
            action: recipientView.legalActions[0]!,
          }),
        ),
      );
      expect(
        competingResults.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        competingResults.filter(
          (result) =>
            result.status === 'rejected' &&
            (result.reason as { code?: string }).code ===
              'PVP_MATCH_VERSION_CONFLICT',
        ),
      ).toHaveLength(1);
      await expect(
        service.getMatch(challengerPlayerId, challengerView.matchId),
      ).resolves.toMatchObject({ version: 2 });
    });

    it('cancels only the challenger, retains an auditable terminal record, and supports replay and pagination', async () => {
      const invitation = await createPendingInvitation(pool, cardDefinitions);
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const submissionId = randomUUID();
      const input = {
        playerId: invitation.challengerPlayerId,
        invitationId: invitation.invitationId,
        submissionId,
        expectedVersion: 0,
      };

      await expect(
        service.cancelInvitation({
          ...input,
          playerId: invitation.recipientPlayerId,
        }),
      ).rejects.toMatchObject({ code: 'PVP_INVITATION_NOT_FOUND' });

      const cancelled = await service.cancelInvitation(input);
      expect(cancelled).toMatchObject({
        direction: 'outgoing',
        matchId: null,
        status: 'cancelled',
        version: 1,
      });
      expect(cancelled.respondedAt).not.toBeNull();
      expect(cancelled).not.toHaveProperty('challengerPlayerId');
      expect(cancelled).not.toHaveProperty('recipientPlayerId');
      await expect(service.cancelInvitation(input)).resolves.toEqual(cancelled);
      await expect(
        service.cancelInvitation({ ...input, expectedVersion: 1 }),
      ).rejects.toMatchObject({ code: 'PVP_IDEMPOTENCY_CONFLICT' });
      await expect(
        service.cancelInvitation({ ...input, submissionId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'PVP_INVITATION_CANCELLED' });
      await expect(
        service.declineInvitation({
          playerId: invitation.recipientPlayerId,
          invitationId: invitation.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ code: 'PVP_INVITATION_CANCELLED' });
      await expect(
        service.acceptInvitation({
          playerId: invitation.recipientPlayerId,
          invitationId: invitation.invitationId,
          deckId: randomUUID(),
          initialCreatureId: randomUUID(),
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ code: 'PVP_INVITATION_CANCELLED' });

      const persisted = await pool.query<{
        cancel_receipt_count: string;
        match_count: string;
        match_id: string | null;
        snapshot_count: string;
        status: string;
      }>(
        `select invitation.status,
                invitation.match_id::text,
                (select count(*)::text
                   from private.async_pvp_deck_snapshots snapshot
                  where snapshot.invitation_id = invitation.id) as snapshot_count,
                (select count(*)::text
                   from private.async_pvp_submission_receipts receipt
                  where receipt.invitation_id = invitation.id
                    and receipt.operation = 'invitation_cancel') as cancel_receipt_count,
                (select count(*)::text
                   from public.async_pvp_matches match
                  where match.invitation_id = invitation.id) as match_count
           from public.async_pvp_invitations invitation
          where invitation.id = $1::uuid`,
        [invitation.invitationId],
      );
      expect(persisted.rows).toEqual([
        {
          cancel_receipt_count: '1',
          match_count: '0',
          match_id: null,
          snapshot_count: '1',
          status: 'cancelled',
        },
      ]);
      await expect(
        insertReceipt(pool, {
          actorPlayerId: invitation.recipientPlayerId,
          operation: 'invitation_decline',
          submissionId: randomUUID(),
          invitationId: invitation.invitationId,
        }),
      ).rejects.toThrow('does not match invitation status');
      await expect(
        pool.query(
          `update public.async_pvp_invitations
              set updated_at = updated_at + interval '1 second'
            where id = $1::uuid`,
          [invitation.invitationId],
        ),
      ).rejects.toThrow('Terminal asynchronous PvP invitation');

      const workerClient = await pool.connect();
      try {
        await workerClient.query('begin');
        await expect(
          service.expireInvitation(workerClient, invitation.invitationId),
        ).resolves.toBe(false);
        await workerClient.query('commit');
      } finally {
        workerClient.release();
      }

      const second = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId: invitation.challengerPlayerId,
        recipientPlayerId: invitation.recipientPlayerId,
      });
      await service.cancelInvitation({
        playerId: second.challengerPlayerId,
        invitationId: second.invitationId,
        submissionId: randomUUID(),
        expectedVersion: 0,
      });
      const firstPage = await service.listInvitations({
        playerId: invitation.challengerPlayerId,
        direction: 'outgoing',
        status: 'cancelled',
        limit: 1,
      });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextCursor).not.toBeNull();
      const secondPage = await service.listInvitations({
        playerId: invitation.challengerPlayerId,
        direction: 'outgoing',
        status: 'cancelled',
        cursor: firstPage.nextCursor!,
        limit: 1,
      });
      expect(secondPage.items).toHaveLength(1);
      expect(
        new Set(
          [...firstPage.items, ...secondPage.items].map(
            (item) => item.invitationId,
          ),
        ),
      ).toEqual(new Set([invitation.invitationId, second.invitationId]));
      await expect(
        service.listInvitations({
          playerId: invitation.recipientPlayerId,
          direction: 'incoming',
          status: 'cancelled',
          limit: 10,
        }),
      ).resolves.toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            direction: 'incoming',
            invitationId: invitation.invitationId,
            status: 'cancelled',
          }),
        ]),
      });
    });

    it('serializes cancellation against acceptance and never alters an accepted match', async () => {
      const invitation = await createPendingInvitation(pool, cardDefinitions);
      const recipientDeck = await createOwnedDeck(
        pool,
        invitation.recipientPlayerId,
        cardDefinitions,
      );
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
        randomInt: () => 0,
      });
      const results = await Promise.allSettled([
        service.cancelInvitation({
          playerId: invitation.challengerPlayerId,
          invitationId: invitation.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
        service.acceptInvitation({
          playerId: invitation.recipientPlayerId,
          invitationId: invitation.invitationId,
          deckId: recipientDeck.deckId,
          initialCreatureId: recipientDeck.creatureId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const persisted = await pool.query<{
        cancel_receipt_count: string;
        match_count: string;
        status: 'accepted' | 'cancelled';
      }>(
        `select invitation.status,
                (select count(*)::text
                   from public.async_pvp_matches match
                  where match.invitation_id = invitation.id) as match_count,
                (select count(*)::text
                   from private.async_pvp_submission_receipts receipt
                  where receipt.invitation_id = invitation.id
                    and receipt.operation = 'invitation_cancel') as cancel_receipt_count
           from public.async_pvp_invitations invitation
          where invitation.id = $1::uuid`,
        [invitation.invitationId],
      );
      const row = persisted.rows[0]!;
      expect(['accepted', 'cancelled']).toContain(row.status);
      expect(row.match_count).toBe(row.status === 'accepted' ? '1' : '0');
      expect(row.cancel_receipt_count).toBe(
        row.status === 'cancelled' ? '1' : '0',
      );

      if (row.status === 'accepted') {
        const match = await pool.query<{ id: string; status: string }>(
          `select id::text, status
             from public.async_pvp_matches
            where invitation_id = $1::uuid`,
          [invitation.invitationId],
        );
        await expect(
          service.cancelInvitation({
            playerId: invitation.challengerPlayerId,
            invitationId: invitation.invitationId,
            submissionId: randomUUID(),
            expectedVersion: 0,
          }),
        ).rejects.toMatchObject({ code: 'PVP_INVITATION_VERSION_CONFLICT' });
        await expect(
          pool.query<{ status: string }>(
            `select status from public.async_pvp_matches where id = $1::uuid`,
            [match.rows[0]!.id],
          ),
        ).resolves.toMatchObject({ rows: [{ status: 'active' }] });
      }
    });

    it('serializes cancellation against decline, expiry, and account invalidation', async () => {
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const responseRace = await createPendingInvitation(pool, cardDefinitions);
      const responseResults = await Promise.allSettled([
        service.cancelInvitation({
          playerId: responseRace.challengerPlayerId,
          invitationId: responseRace.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
        service.declineInvitation({
          playerId: responseRace.recipientPlayerId,
          invitationId: responseRace.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ]);
      expect(
        responseResults.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      await expect(
        pool.query<{ status: string }>(
          `select status from public.async_pvp_invitations where id = $1::uuid`,
          [responseRace.invitationId],
        ),
      ).resolves.toMatchObject({
        rows: [{ status: expect.stringMatching(/^(cancelled|declined)$/u) }],
      });

      const overdue = await createPendingInvitation(pool, cardDefinitions, {
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await expect(
        service.cancelInvitation({
          playerId: overdue.challengerPlayerId,
          invitationId: overdue.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ code: 'PVP_INVITATION_EXPIRED' });
      await expect(
        pool.query<{ cancel_receipt_count: string; status: string }>(
          `select invitation.status,
                  (select count(*)::text
                     from private.async_pvp_submission_receipts receipt
                    where receipt.invitation_id = invitation.id
                      and receipt.operation = 'invitation_cancel') as cancel_receipt_count
             from public.async_pvp_invitations invitation
            where invitation.id = $1::uuid`,
          [overdue.invitationId],
        ),
      ).resolves.toMatchObject({
        rows: [{ cancel_receipt_count: '0', status: 'expired' }],
      });

      const accountRace = await createPendingInvitation(pool, cardDefinitions);
      const deletionClient = await pool.connect();
      const deletion = (async () => {
        try {
          await deletionClient.query('begin');
          await service.finalizeAccountDeletion(
            deletionClient,
            accountRace.recipientPlayerId,
            new Date(),
          );
          await deletionClient.query('commit');
        } catch (error) {
          await deletionClient.query('rollback');
          throw error;
        } finally {
          deletionClient.release();
        }
      })();
      const cancellation = service.cancelInvitation({
        playerId: accountRace.challengerPlayerId,
        invitationId: accountRace.invitationId,
        submissionId: randomUUID(),
        expectedVersion: 0,
      });
      await expect(
        Promise.allSettled([deletion, cancellation]),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'fulfilled' }),
        ]),
      );
      const accountResult = await pool.query<{
        cancel_receipt_count: string;
        match_count: string;
        status: 'cancelled' | 'invalidated';
      }>(
        `select invitation.status,
                (select count(*)::text
                   from private.async_pvp_submission_receipts receipt
                  where receipt.invitation_id = invitation.id
                    and receipt.operation = 'invitation_cancel') as cancel_receipt_count,
                (select count(*)::text
                   from public.async_pvp_matches match
                  where match.invitation_id = invitation.id) as match_count
           from public.async_pvp_invitations invitation
          where invitation.id = $1::uuid`,
        [accountRace.invitationId],
      );
      expect(['cancelled', 'invalidated']).toContain(
        accountResult.rows[0]!.status,
      );
      expect(accountResult.rows[0]!.match_count).toBe('0');
      expect(accountResult.rows[0]!.cancel_receipt_count).toBe(
        accountResult.rows[0]!.status === 'cancelled' ? '1' : '0',
      );
    });

    it('resigns once into viewer-relative history, receipts, and progression', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const unrelatedPlayerId = await insertPlayer(pool, 'resign_unrelated');
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const submissionId = randomUUID();
      const input = {
        playerId: match.challengerPlayerId,
        matchId: match.matchId,
        submissionId,
        expectedVersion: 0,
      };

      await expect(
        service.resignMatch({
          ...input,
          submissionId: randomUUID(),
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'PVP_MATCH_VERSION_CONFLICT' });
      const resigned = await service.resignMatch(input);
      expect(resigned).toMatchObject({
        status: 'completed',
        version: 1,
        currentActor: null,
        turnDeadline: null,
        completionReason: 'voluntary_resignation',
        outcome: 'loss',
        legalActions: [],
      });
      await expect(service.resignMatch(input)).resolves.toEqual(resigned);
      await expect(
        service.resignMatch({ ...input, expectedVersion: 1 }),
      ).rejects.toMatchObject({ code: 'PVP_IDEMPOTENCY_CONFLICT' });
      await expect(
        service.resignMatch({
          ...input,
          playerId: unrelatedPlayerId,
          submissionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'PVP_MATCH_NOT_FOUND' });
      await expect(
        service.resignMatch({ ...input, submissionId: randomUUID() }),
      ).rejects.toMatchObject({ code: 'PVP_MATCH_COMPLETED' });

      await expect(
        service.getMatch(match.recipientPlayerId, match.matchId),
      ).resolves.toMatchObject({
        completionReason: 'voluntary_resignation',
        outcome: 'win',
      });
      await expect(
        service.listHistory({ playerId: match.challengerPlayerId }),
      ).resolves.toMatchObject({
        items: [
          {
            matchId: match.matchId,
            completionReason: 'voluntary_resignation',
            outcome: 'loss',
          },
        ],
      });

      const persisted = await pool.query<{
        action_count: string;
        activity_count: string;
        award_count: string;
        receipt_count: string;
      }>(
        `select
           (select count(*)::text
              from public.async_pvp_match_actions action
             where action.match_id = $1::uuid) as action_count,
           (select count(*)::text
              from public.player_activity_days activity
             where activity.player_id in ($2::uuid, $3::uuid)) as activity_count,
           (select count(*)::text
              from public.player_point_awards award
             where award.async_pvp_match_id = $1::uuid) as award_count,
           (select count(*)::text
              from private.async_pvp_submission_receipts receipt
             where receipt.match_id = $1::uuid
               and receipt.operation = 'match_resign') as receipt_count`,
        [match.matchId, match.challengerPlayerId, match.recipientPlayerId],
      );
      expect(persisted.rows).toEqual([
        {
          action_count: '0',
          activity_count: '2',
          award_count: '2',
          receipt_count: '1',
        },
      ]);
    });

    it('gives an elapsed deadline precedence over resignation', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });

      await expect(
        service.resignMatch({
          playerId: match.challengerPlayerId,
          matchId: match.matchId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ code: 'PVP_MATCH_COMPLETED' });
      await expect(
        service.getMatch(match.challengerPlayerId, match.matchId),
      ).resolves.toMatchObject({
        status: 'completed',
        completionReason: 'turn_forfeit',
      });
      await expect(
        pool.query<{ count: string }>(
          `select count(*)::text
             from private.async_pvp_submission_receipts
            where match_id = $1::uuid and operation = 'match_resign'`,
          [match.matchId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '0' }] });
    });

    it('finalizes an elapsed deadline before returning match detail', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });

      await expect(
        service.getMatch(match.challengerPlayerId, match.matchId),
      ).resolves.toMatchObject({
        status: 'completed',
        completionReason: 'turn_forfeit',
        version: 1,
      });
      await expect(
        pool.query<{ count: string }>(
          `select count(*)::text
             from private.async_pvp_submission_receipts
            where match_id = $1::uuid and operation = 'match_resign'`,
          [match.matchId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '0' }] });
    });

    it('converges a resignation race with the deadline worker on turn forfeit', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const processor = createAsyncPvpDeadlineProcessor(pool, service, {
        error: () => undefined,
      });

      const results = await Promise.allSettled([
        processor.runOnce(),
        service.resignMatch({
          playerId: match.challengerPlayerId,
          matchId: match.matchId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        }),
      ]);
      expect(results[0]?.status).toBe('fulfilled');
      expect(results[1]).toMatchObject({
        status: 'rejected',
        reason: { code: 'PVP_MATCH_COMPLETED' },
      });
      await expect(
        service.getMatch(match.challengerPlayerId, match.matchId),
      ).resolves.toMatchObject({
        status: 'completed',
        completionReason: 'turn_forfeit',
        version: 1,
      });
      await expect(
        pool.query<{
          award_count: string;
          resignation_count: string;
        }>(
          `select
             (select count(*)::text
                from public.player_point_awards
               where async_pvp_match_id = $1::uuid) as award_count,
             (select count(*)::text
                from private.async_pvp_submission_receipts
               where match_id = $1::uuid
                 and operation = 'match_resign') as resignation_count`,
          [match.matchId],
        ),
      ).resolves.toMatchObject({
        rows: [{ award_count: '2', resignation_count: '0' }],
      });
    });

    it('serializes resignation against a match-completing legal action', async () => {
      const moveId = randomUUID();
      const match = await createAcceptedMatch(pool, cardDefinitions, {
        terminalMoveId: moveId,
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const current = await service.getMatch(
        match.challengerPlayerId,
        match.matchId,
      );
      const results = await Promise.allSettled([
        service.submitAction({
          playerId: match.challengerPlayerId,
          matchId: match.matchId,
          submissionId: randomUUID(),
          expectedVersion: current.version,
          action: { type: 'use_move', moveId },
        }),
        service.resignMatch({
          playerId: match.challengerPlayerId,
          matchId: match.matchId,
          submissionId: randomUUID(),
          expectedVersion: current.version,
        }),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: { code: 'PVP_MATCH_COMPLETED' },
      });
      const finalMatch = await service.getMatch(
        match.challengerPlayerId,
        match.matchId,
      );
      expect(finalMatch.version).toBe(1);
      expect(finalMatch.status).toBe('completed');
      expect(['defeat', 'voluntary_resignation']).toContain(
        finalMatch.completionReason,
      );
      if (finalMatch.completionReason === 'defeat') {
        expect(results[0]?.status).toBe('fulfilled');
        expect(results[1]).toMatchObject({
          status: 'rejected',
          reason: { code: 'PVP_MATCH_COMPLETED' },
        });
      } else {
        expect(results[0]).toMatchObject({
          status: 'rejected',
          reason: { code: 'PVP_MATCH_COMPLETED' },
        });
        expect(results[1]?.status).toBe('fulfilled');
      }
      const persisted = await pool.query<{
        action_count: string;
        resignation_count: string;
      }>(
        `select
           (select count(*)::text
              from public.async_pvp_match_actions
             where match_id = $1::uuid) as action_count,
           (select count(*)::text
              from private.async_pvp_submission_receipts
             where match_id = $1::uuid
               and operation = 'match_resign') as resignation_count`,
        [match.matchId],
      );
      expect(
        Number(persisted.rows[0]!.action_count) +
          Number(persisted.rows[0]!.resignation_count),
      ).toBe(1);
      await expect(
        pool.query<{ count: string }>(
          `select count(*)::text
             from public.player_point_awards
            where async_pvp_match_id = $1::uuid`,
          [match.matchId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: '2' }] });
    });

    it('serializes resignation against account deletion finalization', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const deletionClient = await pool.connect();
      try {
        await deletionClient.query('begin');
        const deletion = service
          .finalizeAccountDeletion(
            deletionClient,
            match.challengerPlayerId,
            new Date(),
          )
          .then(() => deletionClient.query('commit'));
        const resignation = service.resignMatch({
          playerId: match.challengerPlayerId,
          matchId: match.matchId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        });
        const results = await Promise.allSettled([deletion, resignation]);
        expect(results[0]?.status).toBe('fulfilled');
        if (results[1]?.status === 'rejected') {
          expect(results[1].reason).toMatchObject({
            code: 'PVP_MATCH_COMPLETED',
          });
        }

        const finalMatch = await service.getMatch(
          match.challengerPlayerId,
          match.matchId,
        );
        expect(finalMatch).toMatchObject({
          status: 'completed',
          outcome: 'loss',
          version: 1,
        });
        expect(['account_deletion_forfeit', 'voluntary_resignation']).toContain(
          finalMatch.completionReason,
        );
        await expect(
          pool.query<{ count: string }>(
            `select count(*)::text
               from public.player_point_awards
              where async_pvp_match_id = $1::uuid`,
            [match.matchId],
          ),
        ).resolves.toMatchObject({ rows: [{ count: '2' }] });
      } finally {
        await deletionClient.query('rollback');
        deletionClient.release();
      }
    });

    it('rechecks invitation expiry against the clock after crossing the deadline while blocked', async () => {
      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 20_000),
      });
      const deadline = await pool.query<{ expires_at: Date }>(
        `select expires_at
             from public.async_pvp_invitations
            where id = $1::uuid`,
        [invitation.invitationId],
      );
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
               from public.async_pvp_invitations
              where id = $1::uuid
              for update`,
          [invitation.invitationId],
        );
        expect(Date.now()).toBeLessThan(deadline.rows[0]!.expires_at.getTime());
        const decline = service.declineInvitation({
          playerId: invitation.recipientPlayerId,
          invitationId: invitation.invitationId,
          submissionId: randomUUID(),
          expectedVersion: 0,
        });
        await waitForBlockedQuery(pool, 'for update of invitation');
        await waitUntilDatabaseAfter(pool, deadline.rows[0]!.expires_at);
        await blocker.query('commit');

        await expect(decline).rejects.toMatchObject({
          code: 'PVP_INVITATION_EXPIRED',
        });
        await expect(
          pool.query<{ status: string }>(
            `select status
                 from public.async_pvp_invitations
                where id = $1::uuid`,
            [invitation.invitationId],
          ),
        ).resolves.toMatchObject({ rows: [{ status: 'expired' }] });
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    }, 45_000);

    it('rechecks match expiry against the clock after crossing the deadline while blocked', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 20_000),
      });
      const deadline = await pool.query<{ turn_deadline: Date }>(
        `select turn_deadline
             from public.async_pvp_matches
            where id = $1::uuid`,
        [match.matchId],
      );
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
               from public.async_pvp_matches
              where id = $1::uuid
              for update`,
          [match.matchId],
        );
        expect(Date.now()).toBeLessThan(
          deadline.rows[0]!.turn_deadline.getTime(),
        );
        const getMatch = service.getMatch(
          match.challengerPlayerId,
          match.matchId,
        );
        await waitForBlockedQuery(pool, 'from public.async_pvp_matches match');
        await waitUntilDatabaseAfter(pool, deadline.rows[0]!.turn_deadline);
        await blocker.query('commit');

        await expect(getMatch).resolves.toMatchObject({
          status: 'completed',
          completionReason: 'turn_forfeit',
          outcome: 'loss',
        });
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    }, 45_000);

    it('rejects an invitation creator whose account deletion commits while creation is blocked', async () => {
      const challengerPlayerId = await insertPlayer(
        pool,
        'deleting_challenger',
      );
      const recipientPlayerId = await insertPlayer(pool, 'race_recipient');
      const challengerDeck = await createOwnedDeck(
        pool,
        challengerPlayerId,
        cardDefinitions,
      );
      const recipient = await pool.query<{ player_name: string }>(
        `select player_name
           from public.players
          where id = $1::uuid`,
        [recipientPlayerId],
      );
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
             from public.players
            where id = $1::uuid
            for update`,
          [challengerPlayerId],
        );
        const deletionRequestId = randomUUID();
        const requestedAt = new Date();
        await blocker.query(
          `insert into public.account_deletion_requests (
             id, requested_at, status
           ) values ($1::uuid, $2, 'pending')`,
          [deletionRequestId, requestedAt],
        );
        await blocker.query(
          `update public.players
              set lifecycle_status = 'deletion_pending',
                  deletion_request_id = $2::uuid,
                  updated_at = $3
            where id = $1::uuid`,
          [challengerPlayerId, deletionRequestId, requestedAt],
        );

        const create = service.createInvitation({
          playerId: challengerPlayerId,
          opponentPlayerName: recipient.rows[0]!.player_name,
          deckId: challengerDeck.deckId,
          initialCreatureId: challengerDeck.creatureId,
          submissionId: randomUUID(),
        });
        await waitForBlockedQuery(pool, 'for share');
        await blocker.query('commit');

        await expect(create).rejects.toMatchObject({
          code: 'PVP_PLAYER_UNAVAILABLE',
        });
        await expect(
          pool.query<{ invitation_count: string }>(
            `select count(*)::text as invitation_count
               from public.async_pvp_invitations
              where challenger_player_id = $1::uuid`,
            [challengerPlayerId],
          ),
        ).resolves.toMatchObject({
          rows: [{ invitation_count: '0' }],
        });
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    });

    it('does not list an overdue active match when bounded finalization skips its lock', async () => {
      const overdueMatch = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
      });
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
             from public.async_pvp_matches
            where id = $1::uuid
            for update`,
          [overdueMatch.matchId],
        );

        await expect(
          service.listActiveMatches({
            playerId: overdueMatch.challengerPlayerId,
            limit: 10,
          }),
        ).resolves.toEqual({ items: [], nextCursor: null });
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }

      await expect(
        service.getMatch(overdueMatch.challengerPlayerId, overdueMatch.matchId),
      ).resolves.toMatchObject({
        status: 'completed',
        completionReason: 'turn_forfeit',
      });
    });

    it('expires invitations and forfeits overdue matches exactly once into authorized history and progression', async () => {
      const expiredInvitation = await createPendingInvitation(
        pool,
        cardDefinitions,
        { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      );
      const overdueMatch = await createAcceptedMatch(pool, cardDefinitions, {
        acceptedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const service = createAsyncPvpService(pool, {
        cursorCodec: createSignedCursorCodec(
          'database-test-only-cursor-key-with-32-bytes',
        ),
        randomInt: () => 0,
      });
      const processor = createAsyncPvpDeadlineProcessor(pool, service, {
        error: () => undefined,
      });

      await expect(processor.runOnce()).resolves.toEqual({
        invitationsExpired: 1,
        matchesForfeited: 1,
        failures: 0,
      });
      await expect(processor.runOnce()).resolves.toEqual({
        invitationsExpired: 0,
        matchesForfeited: 0,
        failures: 0,
      });

      const finalized = await pool.query<{
        invitation_status: string;
        match_status: string;
        completion_reason: string;
        progression_count: string;
      }>(
        `select
           invitation.status as invitation_status,
           match.status as match_status,
           match.completion_reason,
           (select count(*)::text
              from public.player_point_awards award
             where award.async_pvp_match_id = match.id) as progression_count
         from public.async_pvp_invitations invitation
         cross join public.async_pvp_matches match
         where invitation.id = $1::uuid and match.id = $2::uuid`,
        [expiredInvitation.invitationId, overdueMatch.matchId],
      );
      expect(finalized.rows).toEqual([
        {
          invitation_status: 'expired',
          match_status: 'completed',
          completion_reason: 'turn_forfeit',
          progression_count: '2',
        },
      ]);

      await expect(
        service.listHistory({
          playerId: overdueMatch.challengerPlayerId,
          limit: 10,
        }),
      ).resolves.toMatchObject({
        items: [
          {
            matchId: overdueMatch.matchId,
            completionReason: 'turn_forfeit',
            outcome: 'loss',
          },
        ],
      });
      for (const [playerId, direction] of [
        [overdueMatch.challengerPlayerId, 'outgoing'],
        [overdueMatch.recipientPlayerId, 'incoming'],
      ] as const) {
        await expect(
          service.listInvitations({ playerId, direction, limit: 1 }),
        ).resolves.toEqual({ items: [], nextCursor: null });
      }
      const unrelatedPlayerId = await insertPlayer(pool, 'history_unrelated');
      await expect(
        service.listHistory({ playerId: unrelatedPlayerId, limit: 10 }),
      ).resolves.toEqual({ items: [], nextCursor: null });
    });

    it('enforces one pending invitation per unordered pair and one logical submission', async () => {
      const challengerPlayerId = await insertPlayer(pool, 'pair_challenger');
      const recipientPlayerId = await insertPlayer(pool, 'pair_recipient');
      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId,
        recipientPlayerId,
      });

      await expect(
        pool.query(
          `insert into public.async_pvp_invitations (
             challenger_player_id,
             recipient_player_id
           ) values ($1::uuid, $2::uuid)`,
          [recipientPlayerId, challengerPlayerId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_invitations_pending_pair_unique_idx',
      });

      await expect(
        pool.query(
          `insert into private.async_pvp_submission_receipts (
             actor_player_id,
             operation,
             submission_id,
             invitation_id,
             payload_hash,
             committed_response
           ) values ($1::uuid, 'invitation_create', $2::uuid, $3::uuid, $4, '{}')`,
          [
            challengerPlayerId,
            invitation.createSubmissionId,
            invitation.invitationId,
            'b'.repeat(64),
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_submission_receipts_actor_operation_unique',
      });

      await expect(
        pool.query(
          `insert into private.async_pvp_submission_receipts (
             actor_player_id,
             operation,
             submission_id,
             invitation_id,
             payload_hash,
             committed_response
           ) values ($1::uuid, 'invitation_create', $2::uuid, $3::uuid, $4, '{}')`,
          [
            challengerPlayerId,
            randomUUID(),
            invitation.invitationId,
            'c'.repeat(64),
          ],
        ),
      ).rejects.toThrow('duplicate operation receipts');

      await expect(
        pool.query(
          `update public.async_pvp_invitations
              set expires_at = expires_at + interval '1 hour'
            where id = $1::uuid`,
          [invitation.invitationId],
        ),
      ).rejects.toThrow('identity is immutable');
    });

    it('persists complete snapshots, accepted state, actions, and replay receipts', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const action = await appendAction(pool, match);

      const stored = await pool.query<{
        version: number;
        current_player_id: string;
        action_count: string;
        transition_count: string;
        receipt_count: string;
      }>(
        `select
           match.version,
           match.current_player_id::text,
           count(distinct action.id)::text as action_count,
           count(distinct transition.action_id)::text as transition_count,
           count(distinct receipt.id)::text as receipt_count
         from public.async_pvp_matches match
         join public.async_pvp_match_actions action
           on action.match_id = match.id
         join private.async_pvp_match_transitions transition
           on transition.action_id = action.id
         join private.async_pvp_submission_receipts receipt
           on receipt.match_id = match.id
          and receipt.submission_id = action.submission_id
        where match.id = $1::uuid
        group by match.id`,
        [match.matchId],
      );
      expect(stored.rows).toEqual([
        {
          version: 1,
          current_player_id: match.recipientPlayerId,
          action_count: '1',
          transition_count: '1',
          receipt_count: '1',
        },
      ]);

      await expect(
        pool.query(
          `update private.async_pvp_deck_snapshot_cards
              set card_snapshot = '{"tampered":true}'::jsonb
            where snapshot_id = $1::uuid`,
          [match.challengerSnapshotId],
        ),
      ).rejects.toThrow('deck snapshots are immutable');
      await expect(
        pool.query(
          `update public.async_pvp_match_actions
              set public_result = '{"tampered":true}'::jsonb
            where id = $1::uuid`,
          [action.actionId],
        ),
      ).rejects.toThrow('action history is immutable');
      await expect(
        pool.query(
          `insert into public.async_pvp_match_actions (
             match_id,
             sequence,
             actor_player_id,
             submission_id,
             expected_version,
             action,
             public_result
           ) values ($1::uuid, 2, $2::uuid, $3::uuid, 1, '{}', '{}')`,
          [match.matchId, match.challengerPlayerId, action.submissionId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_match_actions_submission_unique',
      });
    });

    it('rejects an active version advance without its action history', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const client = await pool.connect();

      try {
        await client.query('begin');
        await client.query(
          `update private.async_pvp_match_states
              set version = 1,
                  battle_state = '{"phase":"active","turnNumber":2}',
                  updated_at = now()
            where match_id = $1::uuid`,
          [match.matchId],
        );
        await client.query(
          `update public.async_pvp_matches
              set version = 1,
                  current_player_id = $2::uuid,
                  decision_started_at = now(),
                  turn_deadline = now() + interval '24 hours',
                  updated_at = now()
            where id = $1::uuid`,
          [match.matchId, match.recipientPlayerId],
        );

        await expect(client.query('commit')).rejects.toThrow(
          'version 1 requires 1 committed actions, found 0',
        );
        await client.query('rollback');
      } finally {
        client.release();
      }

      const persisted = await pool.query<{
        match_version: number;
        state_version: number;
      }>(
        `select
           match.version as match_version,
           state.version as state_version
         from public.async_pvp_matches match
         join private.async_pvp_match_states state
           on state.match_id = match.id
        where match.id = $1::uuid`,
        [match.matchId],
      );
      expect(persisted.rows).toEqual([
        {
          match_version: 0,
          state_version: 0,
        },
      ]);
    });

    it('rejects a resignation receipt without its terminal losing result', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `insert into private.async_pvp_submission_receipts (
             actor_player_id, operation, submission_id, match_id,
             payload_hash, committed_response
           ) values ($1::uuid, 'match_resign', $2::uuid, $3::uuid,
                     repeat('a', 64), '{}'::jsonb)`,
          [match.challengerPlayerId, randomUUID(), match.matchId],
        );
        await expect(client.query('commit')).rejects.toThrow(
          'does not match its terminal loser',
        );
        await client.query('rollback');
      } finally {
        client.release();
      }

      await expect(
        completeMatch(pool, match, 'voluntary_resignation'),
      ).rejects.toThrow('requires one resignation receipt');
    });

    it('rejects incomplete snapshots, invalid deadlines, and wrong receipt actors', async () => {
      const challengerPlayerId = await insertPlayer(pool, 'invalid_challenger');
      const recipientPlayerId = await insertPlayer(pool, 'invalid_recipient');
      const client = await pool.connect();

      try {
        await client.query('begin');
        const invitationId = randomUUID();
        await client.query(
          `insert into public.async_pvp_invitations (
             id,
             challenger_player_id,
             recipient_player_id
           ) values ($1::uuid, $2::uuid, $3::uuid)`,
          [invitationId, challengerPlayerId, recipientPlayerId],
        );
        await insertDeckSnapshot(client, cardDefinitions.slice(0, 4), {
          invitationId,
          playerId: challengerPlayerId,
          participantRole: 'challenger',
        });
        await insertReceipt(client, {
          actorPlayerId: challengerPlayerId,
          operation: 'invitation_create',
          submissionId: randomUUID(),
          invitationId,
        });
        await expect(client.query('commit')).rejects.toThrow(
          'violates Basic deck rules',
        );
        await client.query('rollback');
      } finally {
        client.release();
      }

      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId,
        recipientPlayerId,
      });
      const wrongActorClient = await pool.connect();

      try {
        await wrongActorClient.query('begin');
        await wrongActorClient.query(
          `update public.async_pvp_invitations
              set status = 'declined',
                  version = 1,
                  responded_at = now(),
                  updated_at = now()
            where id = $1::uuid`,
          [invitation.invitationId],
        );
        await insertReceipt(wrongActorClient, {
          actorPlayerId: challengerPlayerId,
          operation: 'invitation_decline',
          submissionId: randomUUID(),
          invitationId: invitation.invitationId,
        });
        await expect(wrongActorClient.query('commit')).rejects.toThrow(
          'has the wrong actor',
        );
        await wrongActorClient.query('rollback');
      } finally {
        wrongActorClient.release();
      }

      await expect(
        pool.query(
          `insert into public.async_pvp_matches (
             invitation_id,
             current_player_id,
             decision_started_at,
             turn_deadline
           ) values (
             $1::uuid,
             $2::uuid,
             now(),
             now() + interval '23 hours'
           )`,
          [invitation.invitationId, challengerPlayerId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_matches_deadline_check',
      });
    });

    it.each([
      ['defeat', 'async_pvp_defeat_win', 'async_pvp_defeat_loss'],
      [
        'turn_forfeit',
        'async_pvp_turn_forfeit_win',
        'async_pvp_turn_forfeit_loss',
      ],
      [
        'account_deletion_forfeit',
        'async_pvp_account_deletion_forfeit_win',
        'async_pvp_account_deletion_forfeit_loss',
      ],
    ] as const)(
      'records % progression as 25/0 exactly once for both participants',
      async (completionReason, winningRule, losingRule) => {
        const match = await createAcceptedMatch(pool, cardDefinitions);
        await completeMatch(pool, match, completionReason);
        const progression = createProgressionPersistence();

        const [first, replay] = await Promise.all([
          progression.recordAsynchronousPvpCompletion(pool, match.matchId),
          progression.recordAsynchronousPvpCompletion(pool, match.matchId),
        ]);
        const allResults = [...first, ...replay];
        expect(first.map((award) => award.ruleCode)).toEqual(
          expect.arrayContaining([winningRule, losingRule]),
        );
        expect(first.map((award) => award.pointsAwarded).sort()).toEqual([
          0, 25,
        ]);
        expect(allResults.filter((award) => award.wasCreated)).toHaveLength(2);

        const persisted = await pool.query<{
          player_id: string;
          points_awarded: number;
          activity_count: number;
        }>(
          `select
             award.player_id::text,
             award.points_awarded,
             activity.completed_activity_count as activity_count
           from public.player_point_awards award
           join public.player_activity_days activity
             on activity.player_id = award.player_id
            and activity.activity_day = award.activity_day
          where award.async_pvp_match_id = $1::uuid
          order by award.player_id`,
          [match.matchId],
        );
        expect(persisted.rows).toHaveLength(2);
        expect(persisted.rows.map((row) => row.activity_count)).toEqual([1, 1]);

        await expect(
          pool.query(
            `update public.player_point_awards
                set points_awarded = 99
              where async_pvp_match_id = $1::uuid`,
            [match.matchId],
          ),
        ).rejects.toThrow('immutable');
        await expect(
          pool.query(
            `update public.async_pvp_matches
                set updated_at = now()
              where id = $1::uuid`,
            [match.matchId],
          ),
        ).rejects.toThrow('Completed asynchronous PvP match');

        if (completionReason === 'turn_forfeit') {
          await expectLateTerminalAction(pool, match);
        }
      },
    );

    it('uses bounded overdue indexes for invitation and match deadline work', async () => {
      const client = await pool.connect();

      try {
        await client.query('set enable_seqscan = off');
        const invitations = await client.query<{ 'QUERY PLAN': string }>(
          `explain
           select id
             from public.async_pvp_invitations
            where status = 'pending'
              and expires_at <= now()
            order by expires_at, id
            limit 25`,
        );
        const matches = await client.query<{ 'QUERY PLAN': string }>(
          `explain
           select id
             from public.async_pvp_matches
            where status = 'active'
              and turn_deadline <= now()
            order by turn_deadline, id
            limit 25`,
        );

        expect(
          invitations.rows.map((row) => row['QUERY PLAN']).join('\n'),
        ).toContain('async_pvp_invitations_overdue_idx');
        expect(
          matches.rows.map((row) => row['QUERY PLAN']).join('\n'),
        ).toContain('async_pvp_matches_overdue_idx');
      } finally {
        client.release();
      }
    });
  },
);

async function waitForBlockedQuery(
  database: pg.Pool,
  queryFragment: string,
): Promise<void> {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    const blocked = await database.query<{ blocked: boolean }>(
      `select exists (
         select 1
           from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and query ilike $1
       ) as blocked`,
      [`%${queryFragment}%`],
    );
    if (blocked.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for blocked query: ${queryFragment}`);
}

async function waitUntilDatabaseAfter(
  database: pg.Pool,
  deadline: Date,
): Promise<void> {
  await database.query(
    `select pg_sleep(
       greatest(
         0,
         extract(epoch from ($1::timestamptz - clock_timestamp())) + 0.1
       )
     )`,
    [deadline],
  );
}

async function copyPrePvpMigrations(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(join(tmpdir(), 'wits-pvp-migrations-'));
  const migrationNames = await readdir(sourceDirectory);

  await Promise.all(
    migrationNames
      .filter(
        (name) =>
          name.endsWith('.sql') &&
          name !== MIGRATION_NAME &&
          name !== INVALIDATION_MIGRATION_NAME &&
          name !== INDEX_CLEANUP_MIGRATION_NAME &&
          name !== RESIGNATION_MIGRATION_NAME &&
          name !== CANCELLATION_MIGRATION_NAME &&
          name !== COMPLETE_CATALOGUE_MIGRATION_NAME &&
          name !== CARD_EVOLUTION_MIGRATION_NAME &&
          name !== TERRITORY_RUNTIME_MIGRATION_NAME &&
          name !== CARD_TRADE_MIGRATION_NAME &&
          name !== CARD_TRADE_IDEMPOTENCY_MIGRATION_NAME &&
          name !== HISTORY_ACTOR_MIGRATION_NAME &&
          name !== ACCOUNT_PURGE_MIGRATION_NAME,
      )
      .map((name) =>
        copyFile(join(sourceDirectory, name), join(targetDirectory, name)),
      ),
  );

  return targetDirectory;
}

async function seedRetainedCpuProgression(
  database: Pick<pg.Pool, 'query'>,
): Promise<void> {
  await database.query(
    `insert into public.players (
       id,
       auth_issuer,
       auth_subject,
       player_name,
       role
     ) values (
       $1::uuid,
       'https://issuer.example/',
       'auth0|pre-pvp-player',
       'pre_pvp_player',
       'player'
     )`,
    [PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `insert into public.cpu_matches (
       id,
       player_id,
       status,
       state,
       version,
       winner,
       started_at,
       completed_at,
       created_at,
       updated_at
     ) values (
       $1::uuid,
       $2::uuid,
       'completed',
       '{}',
       1,
       'player',
       '2026-08-20T10:00:00.000Z',
       '2026-08-20T10:10:00.000Z',
       '2026-08-20T10:00:00.000Z',
       '2026-08-20T10:10:00.000Z'
     )`,
    [PRE_MIGRATION_MATCH_ID, PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `select *
       from private.record_cpu_match_progression($1::uuid)`,
    [PRE_MIGRATION_MATCH_ID],
  );
}

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  namePrefix: string,
): Promise<string> {
  const playerId = randomUUID();
  const suffix = playerId.replaceAll('-', '').slice(0, 8);
  const playerName = `pvp_${suffix}`;

  await database.query(
    `insert into public.players (
       id,
       auth_issuer,
       auth_subject,
       player_name,
       role
     ) values ($1::uuid, 'https://issuer.example/', $2, $3, 'player')`,
    [playerId, `auth0|${namePrefix}_${suffix}`, playerName],
  );

  return playerId;
}

async function createOwnedDeck(
  database: pg.Pool,
  playerId: string,
  definitions: readonly CardDefinitionFixture[],
): Promise<{ creatureId: string; deckId: string }> {
  const grantId = randomUUID();
  const deckId = randomUUID();
  const ownedCardIds = definitions.map(() => randomUUID());
  await database.query(
    `insert into public.player_starter_grants (id, player_id, affinity)
     values ($1::uuid, $2::uuid, $3)`,
    [grantId, playerId, definitions[0]!.affinity],
  );
  for (const [index, definition] of definitions.entries()) {
    await database.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, acquisition_kind,
         source_starter_grant_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'starter', $4::uuid)`,
      [ownedCardIds[index], playerId, definition.id, grantId],
    );
  }
  await database.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Async integration deck')`,
    [deckId, playerId],
  );
  for (const [index, ownedCardId] of ownedCardIds.entries()) {
    await database.query(
      `insert into public.player_deck_cards (
         deck_id, player_id, owned_card_id, position
       ) values ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [deckId, playerId, ownedCardId, index + 1],
    );
  }
  return { creatureId: ownedCardIds[0]!, deckId };
}

async function createPendingInvitation(
  database: pg.Pool,
  definitions: readonly CardDefinitionFixture[],
  players?: {
    challengerPlayerId?: string;
    recipientPlayerId?: string;
    createdAt?: Date;
  },
): Promise<PendingInvitationFixture> {
  const challengerPlayerId =
    players?.challengerPlayerId ??
    (await insertPlayer(database, 'pvp_challenger'));
  const recipientPlayerId =
    players?.recipientPlayerId ??
    (await insertPlayer(database, 'pvp_recipient'));
  const invitationId = randomUUID();
  const createSubmissionId = randomUUID();
  const client = await database.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_invitations (
         id,
         challenger_player_id,
         recipient_player_id,
         created_at,
         expires_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         coalesce($4::timestamptz, transaction_timestamp()),
         coalesce($4::timestamptz, transaction_timestamp()) + interval '24 hours',
         coalesce($4::timestamptz, transaction_timestamp())
       )`,
      [
        invitationId,
        challengerPlayerId,
        recipientPlayerId,
        players?.createdAt?.toISOString() ?? null,
      ],
    );
    const challengerSnapshotId = await insertDeckSnapshot(client, definitions, {
      invitationId,
      playerId: challengerPlayerId,
      participantRole: 'challenger',
    });
    await insertReceipt(client, {
      actorPlayerId: challengerPlayerId,
      operation: 'invitation_create',
      submissionId: createSubmissionId,
      invitationId,
    });
    await client.query('commit');

    return {
      invitationId,
      challengerPlayerId,
      recipientPlayerId,
      challengerSnapshotId,
      createSubmissionId,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createAcceptedMatch(
  database: pg.Pool,
  definitions: readonly CardDefinitionFixture[],
  options?: { acceptedAt?: Date; terminalMoveId?: string },
): Promise<AcceptedMatchFixture> {
  const acceptedAt = options?.acceptedAt;
  const invitation = await createPendingInvitation(
    database,
    definitions,
    acceptedAt
      ? { createdAt: new Date(acceptedAt.getTime() - 60 * 60 * 1000) }
      : undefined,
  );
  const matchId = randomUUID();
  const client = await database.connect();

  try {
    await client.query('begin');
    const recipientSnapshotId = await insertDeckSnapshot(client, definitions, {
      invitationId: invitation.invitationId,
      playerId: invitation.recipientPlayerId,
      participantRole: 'recipient',
    });
    await client.query(
      `insert into public.async_pvp_matches (
         id,
         invitation_id,
         current_player_id,
         decision_started_at,
         turn_deadline,
         started_at,
         created_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         coalesce($4::timestamptz, transaction_timestamp()),
         coalesce($4::timestamptz, transaction_timestamp()) + interval '24 hours',
         coalesce($4::timestamptz, transaction_timestamp()),
         coalesce($4::timestamptz, transaction_timestamp()),
         coalesce($4::timestamptz, transaction_timestamp())
       )`,
      [
        matchId,
        invitation.invitationId,
        invitation.challengerPlayerId,
        acceptedAt?.toISOString() ?? null,
      ],
    );
    await client.query(
      `insert into public.async_pvp_match_participants (
         match_id,
         player_id,
         engine_side,
         deck_snapshot_id
       ) values
         ($1::uuid, $2::uuid, 'player', $3::uuid),
         ($1::uuid, $4::uuid, 'cpu', $5::uuid)`,
      [
        matchId,
        invitation.challengerPlayerId,
        invitation.challengerSnapshotId,
        invitation.recipientPlayerId,
        recipientSnapshotId,
      ],
    );
    const snapshotCards = await client.query<SnapshotBattleCardFixture>(
      `select snapshot.participant_role,
              card.battle_card_id::text,
              card.category,
              card.affinity
         from private.async_pvp_deck_snapshots snapshot
         join private.async_pvp_deck_snapshot_cards card
           on card.snapshot_id = snapshot.id
        where snapshot.id = any($1::uuid[])
        order by snapshot.participant_role, card.position`,
      [[invitation.challengerSnapshotId, recipientSnapshotId]],
    );
    const battleState = createFixtureBattleState(snapshotCards.rows);
    if (options?.terminalMoveId) {
      prepareTerminalMove(battleState, options.terminalMoveId);
    }
    await client.query(
      `insert into private.async_pvp_match_states (
         match_id,
         version,
         battle_state,
         updated_at
       ) values (
         $1::uuid,
         0,
         $2::jsonb,
         now()
       )`,
      [matchId, JSON.stringify(battleState)],
    );
    await client.query(
      `update public.async_pvp_invitations
          set status = 'accepted',
              version = 1,
              match_id = $2::uuid,
              responded_at = coalesce($3::timestamptz, transaction_timestamp()),
              updated_at = coalesce($3::timestamptz, transaction_timestamp())
        where id = $1::uuid`,
      [invitation.invitationId, matchId, acceptedAt?.toISOString() ?? null],
    );
    await insertReceipt(client, {
      actorPlayerId: invitation.recipientPlayerId,
      operation: 'invitation_accept',
      submissionId: randomUUID(),
      invitationId: invitation.invitationId,
    });
    await client.query('commit');

    return {
      ...invitation,
      matchId,
      recipientSnapshotId,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function prepareTerminalMove(
  state: TerminalMoveStateRow['battle_state'],
  moveId: string,
): void {
  const player = state.participants.player;
  const opponent = state.participants.cpu;
  const actingCreature = player.creatures.find(
    (creature) => creature.card.id === player.activeCreatureId,
  );
  const targetCreature = opponent.creatures.find(
    (creature) => creature.card.id === opponent.activeCreatureId,
  );
  if (!actingCreature || !targetCreature || opponent.creatures.length < 2) {
    throw new Error('Expected active fixture Creatures on both sides.');
  }

  actingCreature.card.moves = [
    {
      id: moveId,
      name: 'Terminal fixture move',
      moveType: 'basic',
      powerCost: 1,
      effects: [
        {
          id: randomUUID(),
          effectType: 'damage',
          effectValue: 10,
        },
      ],
    },
  ];
  for (const creature of opponent.creatures) {
    if (creature.card.id === opponent.activeCreatureId) {
      creature.currentHp = 1;
      creature.defeated = false;
    } else {
      creature.currentHp = 0;
      creature.defeated = true;
    }
  }
}

function createFixtureBattleState(cards: readonly SnapshotBattleCardFixture[]) {
  const participant = (role: 'challenger' | 'recipient') => {
    const participantCards = cards.filter(
      (card) => card.participant_role === role,
    );
    const creatures = participantCards
      .filter((card) => card.category === 'creature')
      .map((card) => ({
        card: {
          id: card.battle_card_id,
          affinity: card.affinity,
          maxHp: 10,
          maxPower: 10,
          moves: [],
        },
        currentHp: 10,
        remainingPower: 10,
        defeated: false,
        modifiers: [],
      }));
    return {
      creatures,
      powerCards: participantCards
        .filter((card) => card.category === 'power')
        .map((card) => ({
          id: card.battle_card_id,
          affinity: card.affinity,
          effects: [],
        })),
      usedPowerCardIds: [],
      activeCreatureId: creatures[0]!.card.id,
    };
  };
  const player = participant('challenger');
  const cpu = participant('recipient');
  return {
    phase: 'active',
    turnNumber: 1,
    currentSide: 'player',
    replacementSide: null,
    firstSide: 'player',
    selections: {
      player: player.activeCreatureId,
      cpu: cpu.activeCreatureId,
    },
    participants: { player, cpu },
    winner: null,
  };
}

async function insertDeckSnapshot(
  client: Pick<pg.PoolClient, 'query'>,
  definitions: readonly CardDefinitionFixture[],
  input: {
    invitationId: string;
    playerId: string;
    participantRole: 'challenger' | 'recipient';
  },
): Promise<string> {
  const snapshotId = randomUUID();
  const snapshotCardIds = definitions.map(() => randomUUID());

  await client.query(
    `insert into private.async_pvp_deck_snapshots (
       id,
       invitation_id,
       player_id,
       participant_role,
       source_deck_id,
       initial_creature_card_id
     ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid)`,
    [
      snapshotId,
      input.invitationId,
      input.playerId,
      input.participantRole,
      randomUUID(),
      snapshotCardIds[0],
    ],
  );

  for (const [index, definition] of definitions.entries()) {
    const battleCardId = randomUUID();
    await client.query(
      `insert into private.async_pvp_deck_snapshot_cards (
         id,
         snapshot_id,
         position,
         battle_card_id,
         source_owned_card_id,
         source_card_definition_id,
         category,
         affinity,
         rarity,
         card_snapshot
       ) values (
         $1::uuid,
         $2::uuid,
         $3,
         $4::uuid,
         $5::uuid,
         $6::uuid,
         $7,
         $8,
         $9,
         $10::jsonb
       )`,
      [
        snapshotCardIds[index],
        snapshotId,
        index + 1,
        battleCardId,
        randomUUID(),
        definition.id,
        definition.category,
        definition.affinity,
        definition.rarity,
        JSON.stringify({
          id: battleCardId,
          name: `Snapshot card ${index + 1}`,
          category: definition.category,
          affinity: definition.affinity,
          rarity: definition.rarity,
        }),
      ],
    );
  }

  return snapshotId;
}

async function insertReceipt(
  client: Pick<pg.PoolClient, 'query'>,
  input: {
    actorPlayerId: string;
    operation:
      | 'invitation_create'
      | 'invitation_accept'
      | 'invitation_decline'
      | 'invitation_cancel'
      | 'match_action';
    submissionId: string;
    invitationId?: string;
    matchId?: string;
  },
): Promise<void> {
  await client.query(
    `insert into private.async_pvp_submission_receipts (
       actor_player_id,
       operation,
       submission_id,
       invitation_id,
       match_id,
       payload_hash,
       committed_response
     ) values (
       $1::uuid,
       $2,
       $3::uuid,
       $4::uuid,
       $5::uuid,
       $6,
       $7::jsonb
     )`,
    [
      input.actorPlayerId,
      input.operation,
      input.submissionId,
      input.invitationId ?? null,
      input.matchId ?? null,
      'a'.repeat(64),
      JSON.stringify({ persisted: true }),
    ],
  );
}

async function appendAction(
  database: pg.Pool,
  match: AcceptedMatchFixture,
): Promise<{ actionId: string; submissionId: string }> {
  const client = await database.connect();
  const actionId = randomUUID();
  const submissionId = randomUUID();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_match_actions (
         id,
         match_id,
         sequence,
         actor_player_id,
         submission_id,
         expected_version,
         action,
         public_result,
         created_at
       ) values (
         $1::uuid,
         $2::uuid,
         1,
         $3::uuid,
         $4::uuid,
         0,
         '{"type":"use_move","moveId":"10000000-0000-4000-8000-000000000001"}',
         '{"type":"move_resolved"}',
         now()
       )`,
      [actionId, match.matchId, match.challengerPlayerId, submissionId],
    );
    await client.query(
      `insert into private.async_pvp_match_transitions (
         action_id,
         match_id,
         state_before,
         state_after,
         authoritative_result,
         created_at
       ) values (
         $1::uuid,
         $2::uuid,
         '{"phase":"active","turnNumber":1}',
         '{"phase":"active","turnNumber":2}',
         '{"type":"move_resolved"}',
         now()
       )`,
      [actionId, match.matchId],
    );
    await insertReceipt(client, {
      actorPlayerId: match.challengerPlayerId,
      operation: 'match_action',
      submissionId,
      matchId: match.matchId,
    });
    await client.query(
      `update private.async_pvp_match_states
          set version = 1,
              battle_state = '{"phase":"active","turnNumber":2}',
              updated_at = now()
        where match_id = $1::uuid`,
      [match.matchId],
    );
    await client.query(
      `update public.async_pvp_matches
          set version = 1,
              current_player_id = $2::uuid,
              decision_started_at = now(),
              turn_deadline = now() + interval '24 hours',
              updated_at = now()
        where id = $1::uuid`,
      [match.matchId, match.recipientPlayerId],
    );
    await client.query('commit');

    return { actionId, submissionId };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function completeMatch(
  database: pg.Pool,
  match: AcceptedMatchFixture,
  completionReason:
    | 'defeat'
    | 'turn_forfeit'
    | 'account_deletion_forfeit'
    | 'voluntary_resignation',
): Promise<void> {
  const client = await database.connect();
  const terminalActionId = randomUUID();
  const terminalSubmissionId = randomUUID();

  try {
    await client.query('begin');
    if (completionReason === 'defeat') {
      await client.query(
        `insert into public.async_pvp_match_actions (
           id,
           match_id,
           sequence,
           actor_player_id,
           submission_id,
           expected_version,
           action,
           public_result,
           created_at
         ) values (
           $1::uuid,
           $2::uuid,
           1,
           $3::uuid,
           $4::uuid,
           0,
           '{"type":"use_move","moveId":"10000000-0000-4000-8000-000000000002"}',
           '{"type":"match_completed"}',
           now()
         )`,
        [
          terminalActionId,
          match.matchId,
          match.challengerPlayerId,
          terminalSubmissionId,
        ],
      );
      await client.query(
        `insert into private.async_pvp_match_transitions (
           action_id,
           match_id,
           state_before,
           state_after,
           authoritative_result,
           created_at
         ) values (
           $1::uuid,
           $2::uuid,
           '{"phase":"active","turnNumber":1}',
           '{"phase":"completed","turnNumber":1}',
           '{"type":"match_completed"}',
           now()
         )`,
        [terminalActionId, match.matchId],
      );
      await insertReceipt(client, {
        actorPlayerId: match.challengerPlayerId,
        operation: 'match_action',
        submissionId: terminalSubmissionId,
        matchId: match.matchId,
      });
    }
    await client.query(
      `update private.async_pvp_match_states
          set version = 1,
              battle_state = '{"phase":"completed","turnNumber":1}',
              updated_at = now()
        where match_id = $1::uuid`,
      [match.matchId],
    );
    await client.query(
      `update public.async_pvp_match_participants
          set outcome = case
            when player_id = $2::uuid then 'win'
            else 'loss'
          end
        where match_id = $1::uuid`,
      [match.matchId, match.challengerPlayerId],
    );
    await client.query(
      `update public.async_pvp_matches
          set status = 'completed',
              version = 1,
              current_player_id = null,
              winner_player_id = $2::uuid,
              completion_reason = $3,
              decision_started_at = null,
              turn_deadline = null,
              completed_at = now(),
              updated_at = now()
        where id = $1::uuid`,
      [match.matchId, match.challengerPlayerId, completionReason],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function expectLateTerminalAction(
  database: pg.Pool,
  match: AcceptedMatchFixture,
): Promise<void> {
  const client = await database.connect();
  const actionId = randomUUID();
  const submissionId = randomUUID();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_match_actions (
         id,
         match_id,
         sequence,
         actor_player_id,
         submission_id,
         expected_version,
         action,
         public_result
       ) values (
         $1::uuid,
         $2::uuid,
         2,
         $3::uuid,
         $4::uuid,
         1,
         '{"type":"use_move"}',
         '{"type":"move_resolved"}'
       )`,
      [actionId, match.matchId, match.recipientPlayerId, submissionId],
    );
    await client.query(
      `insert into private.async_pvp_match_transitions (
         action_id,
         match_id,
         state_before,
         state_after,
         authoritative_result
       ) values ($1::uuid, $2::uuid, '{}', '{}', '{}')`,
      [actionId, match.matchId],
    );
    await insertReceipt(client, {
      actorPlayerId: match.recipientPlayerId,
      operation: 'match_action',
      submissionId,
      matchId: match.matchId,
    });
    await expect(client.query('commit')).rejects.toThrow(
      'does not belong to its committed version',
    );
    await client.query('rollback');
  } finally {
    client.release();
  }
}
