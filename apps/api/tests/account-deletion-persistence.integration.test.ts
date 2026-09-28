import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import {
  AUTH0_DATABASE_CONNECTION_STRATEGY,
  CONNECTION_STRATEGY_CLAIM,
  PLAYER_NAME_CLAIM,
} from '../src/auth/interactive-player-claims.js';
import type { AuthConfig } from '../src/config/auth.js';
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
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import { createProgressionReadService } from '../src/progression/progression-read-service.js';
import { createTrustReviewService } from '../src/trust/trust-review-service.js';
import { createTrustRestrictionService } from '../src/trust/trust-restrictions.js';
import {
  createPlayerIdentityService,
  DeletedIdentityTokenError,
} from '../src/players/player-identity.js';

const ISSUER = 'https://auth.example.test/';
const PLAYER_ID = 'd1000000-0000-4000-8000-000000000001';
const DELETION_ID = 'd1100000-0000-4000-8000-000000000001';
const COMPLETED_EVENT_ID = 'd2000000-0000-4000-8000-000000000001';
const ACTIVE_EVENT_ID = 'd2000000-0000-4000-8000-000000000002';
const COMPLETED_CHALLENGE_ID = 'd3000000-0000-4000-8000-000000000001';
const ACTIVE_CHALLENGE_ID = 'd3000000-0000-4000-8000-000000000002';
const COMPLETED_ATTEMPT_ID = 'd4000000-0000-4000-8000-000000000001';
const ACTIVE_ATTEMPT_ID = 'd4000000-0000-4000-8000-000000000002';
const COMPLETION_ID = 'd5000000-0000-4000-8000-000000000001';
const STARTER_GRANT_ID = 'd6000000-0000-4000-8000-000000000001';
const DECK_ID = 'd7000000-0000-4000-8000-000000000001';
const ACTIVE_MATCH_ID = 'd8000000-0000-4000-8000-000000000001';
const COMPLETED_MATCH_ID = 'd8000000-0000-4000-8000-000000000002';
const RANKED_SEASON_ID = 'd9000000-0000-4000-8000-000000000001';
const OPPONENT_PLAYER_ID = 'da000000-0000-4000-8000-000000000001';
const SHARED_INVITATION_ID = 'db000000-0000-4000-8000-000000000001';

const ROLLBACK_PLAYER_ID = 'd1000000-0000-4000-8000-000000000002';
const ROLLBACK_DELETION_ID = 'd1100000-0000-4000-8000-000000000002';
const ROLLBACK_GRANT_ID = 'd6000000-0000-4000-8000-000000000002';

const CONCURRENT_PLAYER_ID = 'd1000000-0000-4000-8000-000000000003';
const CONCURRENT_DELETION_ID = 'd1100000-0000-4000-8000-000000000003';
const GAMEPLAY_ROLLBACK_PLAYER_ID = 'd1000000-0000-4000-8000-000000000004';
const GAMEPLAY_ROLLBACK_DELETION_ID = 'd1100000-0000-4000-8000-000000000004';
const DENIED_TOKEN_PLAYER_ID = 'd1000000-0000-4000-8000-000000000005';
const DENIED_TOKEN_DELETION_ID = 'd1100000-0000-4000-8000-000000000005';
const RACING_TOKEN_PLAYER_ID = 'd1000000-0000-4000-8000-000000000006';
const RACING_TOKEN_DELETION_ID = 'd1100000-0000-4000-8000-000000000006';
const TRUST_CLEANUP_PLAYER_ID = 'd1000000-0000-4000-8000-000000000007';
const TRUST_CLEANUP_DELETION_ID = 'd1100000-0000-4000-8000-000000000007';
const ACCOUNT_DELETION_MIGRATION =
  '0024_complete_account_deletion_retention.sql';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'account deletion persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_deletion_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(
        '0024_complete_account_deletion_retention.sql',
      );
      expect(migrationResult.applied).toContain(
        '0025_add_ordering_challenges.sql',
      );

      await runSeeds(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
    }, 180_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
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

    it('physically deletes the account and player-only history while preserving authored content', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-history',
      };

      await withDatabaseClient(temporaryConfig, async (client) => {
        await seedCompletePlayerJourney(client, identity.subject);
        await client.query(
          `insert into public.players (
             id, auth_issuer, auth_subject, player_name, role, lifecycle_status
           ) values ($1::uuid, $2, 'auth0|deletion-opponent',
                     'deletion_opponent', 'player', 'active')`,
          [OPPONENT_PLAYER_ID, ISSUER],
        );
        await seedDeclinedSharedInvitation(client);
        await client.query(
          `select * from private.record_challenge_completion_progression($1::uuid)`,
          [COMPLETION_ID],
        );
        await client.query(
          `insert into public.ranked_seasons (
             id, policy_version, name, intended_start_at
           ) values ($1::uuid, 'ranked-v1', 'Deletion test season', now())`,
          [RANKED_SEASON_ID],
        );
        await client.query(
          `update public.ranked_seasons
              set status = 'active', version = version + 1,
                  activated_at = now(), active_ends_at = now() + interval '28 days',
                  updated_at = now()
            where id = $1::uuid`,
          [RANKED_SEASON_ID],
        );
        await client.query(
          `insert into public.ranked_player_season_ratings (
             season_id, player_id, starting_rating, rating
           ) values ($1::uuid, $2::uuid, 1000, 1000)`,
          [RANKED_SEASON_ID, PLAYER_ID],
        );
      });

      const beforePurge = await pool.query<{
        awards: string;
        achievements: string;
      }>(
        `select
           (select count(*)::text from public.player_point_awards
             where player_id = $1::uuid) as awards,
           (select count(*)::text from public.player_achievement_unlocks
             where player_id = $1::uuid) as achievements`,
        [PLAYER_ID],
      );
      expect(beforePurge.rows[0]?.awards).toBe('1');
      expect(Number(beforePurge.rows[0]?.achievements)).toBeGreaterThan(0);

      await expect(
        pool.query(
          `
            delete from public.attempt_answers answer
            using public.attempt_questions question
            where answer.attempt_question_id = question.id
              and question.attempt_id = $1::uuid
          `,
          [COMPLETED_ATTEMPT_ID],
        ),
      ).rejects.toThrow();

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T12:00:00.000Z'),
        createId: () => DELETION_ID,
      });

      const requested = await lifecycle.request(identity);
      const completed = await lifecycle.complete(requested.id);

      expect(completed).toMatchObject({
        id: DELETION_ID,
        status: 'completed',
        completedAt: new Date('2026-08-26T12:00:00.000Z'),
        failureReason: null,
      });
      await expect(lifecycle.complete(requested.id)).resolves.toEqual(
        completed,
      );

      const player = await pool.query(
        `select id from public.players where id = $1::uuid`,
        [PLAYER_ID],
      );
      expect(player.rows).toEqual([]);
      const receiptAndDenial = await pool.query<{
        receipt: Record<string, unknown>;
        denial: Record<string, unknown>;
      }>(
        `select to_jsonb(request) as receipt, to_jsonb(denial) as denial
           from public.account_deletion_requests request
           join private.deleted_identity_token_denials denial
             on denial.deletion_request_id = request.id
          where request.id = $1::uuid`,
        [DELETION_ID],
      );
      expect(Object.keys(receiptAndDenial.rows[0]!.receipt).sort()).toEqual([
        'completed_at',
        'failure_reason',
        'id',
        'requested_at',
        'status',
      ]);
      expect(Object.keys(receiptAndDenial.rows[0]!.denial).sort()).toEqual([
        'deletion_request_id',
        'expires_at',
        'identity_digest',
        'identity_salt',
        'tokens_issued_before',
      ]);
      const retainedOperationalRecord = JSON.stringify(
        receiptAndDenial.rows[0],
      );
      for (const identifier of [
        PLAYER_ID,
        identity.subject,
        'deleted_author',
      ]) {
        expect(retainedOperationalRecord).not.toContain(identifier);
      }
      const historicalActor = await pool.query(
        `select id from private.player_history_actors where id = $1::uuid`,
        [PLAYER_ID],
      );
      expect(historicalActor.rows).toEqual([]);
      const sharedInvitation = await pool.query<{
        challenger_player_id: string;
        recipient_player_id: string;
        status: string;
      }>(
        `select challenger_player_id, recipient_player_id, status
           from public.async_pvp_invitations where id = $1::uuid`,
        [SHARED_INVITATION_ID],
      );
      expect(sharedInvitation.rows[0]).toMatchObject({
        recipient_player_id: OPPONENT_PLAYER_ID,
        status: 'declined',
      });
      expect(sharedInvitation.rows[0]?.challenger_player_id).not.toBe(
        PLAYER_ID,
      );
      const detachedActor = await pool.query(
        `select id from private.player_history_actors where id = $1::uuid`,
        [sharedInvitation.rows[0]?.challenger_player_id],
      );
      expect(detachedActor.rows).toHaveLength(1);
      const pvpReceipts = await pool.query<{ committed_response: unknown }>(
        `select committed_response
           from private.async_pvp_submission_receipts
          where invitation_id = $1::uuid`,
        [SHARED_INVITATION_ID],
      );
      expect(pvpReceipts.rows).toHaveLength(2);
      for (const receipt of pvpReceipts.rows) {
        const response = JSON.stringify(receipt.committed_response);
        expect(response).not.toContain(PLAYER_ID);
        expect(response).not.toContain('deleted_author');
        expect(response).toContain('Deleted player');
      }
      const uuidColumns = await pool.query<{
        schema_name: string;
        table_name: string;
        column_name: string;
      }>(
        `select namespace.nspname as schema_name,
                relation.relname as table_name,
                attribute.attname as column_name
           from pg_attribute attribute
           join pg_class relation on relation.oid = attribute.attrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname in ('public', 'private')
            and relation.relkind in ('r', 'p')
            and attribute.atttypid = 'uuid'::regtype
            and attribute.attnum > 0
            and not attribute.attisdropped`,
      );
      const quoteIdentifier = (value: string) =>
        `"${value.replaceAll('"', '""')}"`;
      const oldUuidReferences = await pool.query<{ location: string }>(
        uuidColumns.rows
          .map(
            ({ schema_name, table_name, column_name }) =>
              `select '${schema_name}.${table_name}.${column_name}' as location
                 where exists (select 1 from ${quoteIdentifier(schema_name)}.${quoteIdentifier(table_name)}
                                where ${quoteIdentifier(column_name)} = $1::uuid)`,
          )
          .join(' union all '),
        [PLAYER_ID],
      );
      expect(oldUuidReferences.rows).toEqual([]);

      const deletedData = await pool.query<Record<string, string>>(
        `
          select
            (select count(*)::text from public.player_cards
              where player_id = $1::uuid) as owned_cards,
            (select count(*)::text from public.player_starter_grants
              where player_id = $1::uuid) as starter_grants,
            (select count(*)::text from public.player_decks
              where player_id = $1::uuid) as decks,
            (select count(*)::text from public.player_deck_cards
              where player_id = $1::uuid) as deck_cards,
            (select count(*)::text from public.player_deck_selections
              where player_id = $1::uuid) as deck_selections,
            (select count(*)::text from public.player_wallets
              where player_id = $1::uuid) as wallets,
            (select count(*)::text
               from public.attempt_answers answer
               join public.attempt_questions question
                 on question.id = answer.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as answers,
            (select count(*)::text
               from public.attempt_questions question
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as question_snapshots,
            (select count(*)::text
               from public.attempt_question_choices choice
               join public.attempt_questions question
                 on question.id = choice.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
               where attempt.player_id = $1::uuid) as choice_snapshots,
            (select count(*)::text
               from public.attempt_ordering_answers answer
               join public.attempt_questions question
                 on question.id = answer.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as ordering_answers,
            (select count(*)::text
               from public.attempt_ordering_answer_items answer_item
               join public.attempt_questions question
                 on question.id = answer_item.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as ordering_answer_items,
            (select count(*)::text
               from public.attempt_question_ordering_items item
               join public.attempt_questions question
                 on question.id = item.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as ordering_item_snapshots,
            (select count(*)::text from public.challenge_attempts
              where player_id = $1::uuid and status = 'in_progress')
              as active_attempts,
            (select count(*)::text from public.cpu_matches
              where player_id = $1::uuid and status = 'active')
              as active_matches
        `,
        [PLAYER_ID],
      );

      expect(deletedData.rows[0]).toEqual({
        owned_cards: '0',
        starter_grants: '0',
        decks: '0',
        deck_cards: '0',
        deck_selections: '0',
        wallets: '0',
        answers: '0',
        question_snapshots: '0',
        choice_snapshots: '0',
        ordering_answers: '0',
        ordering_answer_items: '0',
        ordering_item_snapshots: '0',
        active_attempts: '0',
        active_matches: '0',
      });

      const progression = await pool.query<Record<string, string>>(
        `select
           (select count(*)::text from public.player_point_awards
             where player_id = $1::uuid) as awards,
           (select count(*)::text from public.player_activity_days
             where player_id = $1::uuid) as days,
           (select count(*)::text from public.player_progression_state
             where player_id = $1::uuid) as state,
           (select count(*)::text from public.player_monthly_progression
             where player_id = $1::uuid) as monthly,
           (select count(*)::text from public.player_achievement_unlocks
             where player_id = $1::uuid) as achievements`,
        [PLAYER_ID],
      );
      expect(Object.values(progression.rows[0] ?? {})).toEqual([
        '0',
        '0',
        '0',
        '0',
        '0',
      ]);
      const rankedState = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from public.ranked_player_season_ratings
          where player_id = $1::uuid`,
        [PLAYER_ID],
      );
      expect(rankedState.rows[0]?.count).toBe('0');

      const retainedData = await pool.query<Record<string, string>>(
        `
          select
            (select count(*)::text from public.challenge_attempts
              where id = $2::uuid and player_id = $1::uuid
                and status = 'completed') as completed_attempts,
            (select count(*)::text from public.event_completions
              where id = $3::uuid and player_id = $1::uuid)
              as completions,
            (select count(*)::text from public.coin_ledger_entries
              where player_id = $1::uuid and completion_id = $3::uuid)
              as ledger_entries,
            (select count(*)::text from public.event_completion_card_rewards
              where completion_id = $3::uuid) as card_reward_outcomes,
            (select count(*)::text from public.cpu_matches
              where id = $4::uuid and player_id = $1::uuid
                and status = 'completed') as completed_matches,
            (select count(*)::text from public.cpu_match_cards
              where match_id = $4::uuid) as completed_match_cards,
            (select count(*)::text from public.cpu_match_rounds
              where match_id = $4::uuid) as completed_match_rounds,
            (select count(*)::text from public.cpu_match_actions
              where match_id = $4::uuid) as completed_match_actions,
            (select count(*)::text from public.author_content_audit
              where actor_player_id = $9::uuid) as author_audits,
            (select count(*)::text from public.events
              where id in ($5::uuid, $6::uuid)) as retained_events,
            (select count(*)::text from public.event_challenges
              where id in ($7::uuid, $8::uuid)) as retained_challenges
        `,
        [
          PLAYER_ID,
          COMPLETED_ATTEMPT_ID,
          COMPLETION_ID,
          COMPLETED_MATCH_ID,
          COMPLETED_EVENT_ID,
          ACTIVE_EVENT_ID,
          COMPLETED_CHALLENGE_ID,
          ACTIVE_CHALLENGE_ID,
          sharedInvitation.rows[0]?.challenger_player_id,
        ],
      );

      expect(retainedData.rows[0]).toEqual({
        completed_attempts: '0',
        completions: '0',
        ledger_entries: '0',
        card_reward_outcomes: '0',
        completed_matches: '0',
        completed_match_cards: '0',
        completed_match_rounds: '0',
        completed_match_actions: '0',
        author_audits: '1',
        retained_events: '2',
        retained_challenges: '2',
      });

      const retainedMatch = await pool.query<{
        player_deck_id: string | null;
      }>(`select player_deck_id from public.cpu_matches where id = $1::uuid`, [
        COMPLETED_MATCH_ID,
      ]);
      expect(retainedMatch.rows).toEqual([]);

      const rejoined = await createPlayerIdentityService(pool).resolve({
        connectionStrategy: AUTH0_DATABASE_CONNECTION_STRATEGY,
        issuer: identity.issuer,
        subject: identity.subject,
        playerName: 'deleted_author',
        tokenIssuedAt: new Date('2026-08-26T12:00:01.000Z'),
      });

      expect(rejoined).toMatchObject({
        playerName: 'deleted_author',
        role: 'player',
        lifecycleStatus: 'active',
      });
      expect(rejoined.id).not.toBe(PLAYER_ID);
      const rejoinedSharedHistory = await pool.query<{ count: string }>(
        `select count(*)::text as count from public.async_pvp_invitations
          where id = $1::uuid
            and (challenger_player_id = $2::uuid
                 or recipient_player_id = $2::uuid)`,
        [SHARED_INVITATION_ID, rejoined.id],
      );
      expect(rejoinedSharedHistory.rows[0]?.count).toBe('0');

      await pool.query(
        `insert into public.ranked_player_season_ratings (
           season_id, player_id, starting_rating, rating
         ) values ($1::uuid, $2::uuid, 1000, 1000)`,
        [RANKED_SEASON_ID, rejoined.id],
      );
      const freshRating = await pool.query<{
        rating: number;
        settled_match_count: number;
      }>(
        `select rating, settled_match_count
           from public.ranked_player_season_ratings
          where season_id = $1::uuid and player_id = $2::uuid`,
        [RANKED_SEASON_ID, rejoined.id],
      );
      expect(freshRating.rows[0]).toEqual({
        rating: 1000,
        settled_match_count: 0,
      });

      const standings = await createProgressionReadService(pool).listStandings({
        playerId: rejoined.id,
        period: 'all_time',
        page: 1,
        pageSize: 100,
      });
      expect(
        standings.entries.filter(
          (entry) => entry.playerName === 'deleted_author',
        ),
      ).toHaveLength(1);
      expect(standings.currentPlayer.points).toBe(0);

      const newProgress = await pool.query<{ count: string }>(
        `
          select (
            (select count(*) from public.player_cards where player_id = $1::uuid)
            + (select count(*) from public.player_decks where player_id = $1::uuid)
            + (select count(*) from public.challenge_attempts where player_id = $1::uuid)
            + (select count(*) from public.cpu_matches where player_id = $1::uuid)
          )::text as count
        `,
        [rejoined.id],
      );
      expect(newProgress.rows[0]?.count).toBe('0');
    }, 60_000);

    it('purges expired trust snapshots for active players but protects unexpired snapshots', async () => {
      const activePlayerId = randomUUID();
      const expiredSnapshotId = randomUUID();
      const unexpiredSnapshotId = randomUUID();
      const expiredSignalId = randomUUID();
      const expiredAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      const recentAt = new Date(Date.now() - 60_000);

      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1::uuid, $2, $3, 'trust_expiry', 'player', 'active')`,
        [activePlayerId, ISSUER, `auth0|trust-retention-${activePlayerId}`],
      );
      for (const [snapshotId, evaluatedAt] of [
        [expiredSnapshotId, expiredAt],
        [unexpiredSnapshotId, recentAt],
      ] as const) {
        await pool.query(
          `insert into private.trust_score_snapshots (
             id, player_id, policy_version, evaluated_at,
             movement_points, submission_conflict_points, opponent_pattern_points,
             final_score, review_band, source_signal_count, calculation_digest,
             purge_after, created_at
           ) values (
             $1::uuid, $2::uuid, 'trust-v1', $3::timestamptz,
             0, 0, 0, 0, 'normal', 0, decode(repeat('33', 32), 'hex'),
             $3::timestamptz, clock_timestamp()
           )`,
          [snapshotId, activePlayerId, evaluatedAt],
        );
      }
      await pool.query(
        `insert into private.trust_signals (
           id, player_id, policy_version, signal_type, severity, base_points,
           observed_at, expires_at, source_type, source_identifier,
           deduplication_digest, created_at
         ) values (
           $1::uuid, $2::uuid, 'trust-v1', 'impossible_movement', 'moderate', 15,
           $3::timestamptz, $3::timestamptz, 'movement_decision',
           $4, decode(repeat('44', 32), 'hex'), clock_timestamp()
         )`,
        [expiredSignalId, activePlayerId, expiredAt, expiredSignalId],
      );

      await expect(
        pool.query(
          `delete from private.trust_score_snapshots where id = $1::uuid`,
          [unexpiredSnapshotId],
        ),
      ).rejects.toMatchObject({ code: '55006' });

      const cleanup = await pool.query<{
        signal_rows_deleted: number;
        snapshot_rows_deleted: number;
      }>(`select * from private.purge_expired_trust_data()`);
      expect(cleanup.rows[0]?.signal_rows_deleted).toBeGreaterThanOrEqual(1);
      expect(cleanup.rows[0]?.snapshot_rows_deleted).toBeGreaterThanOrEqual(1);

      const remaining = await pool.query<{
        expired_signals: string;
        expired_snapshots: string;
        unexpired_snapshots: string;
      }>(
        `select
           (select count(*)::text from private.trust_signals where id = $1::uuid)
             as expired_signals,
           (select count(*)::text from private.trust_score_snapshots where id = $2::uuid)
             as expired_snapshots,
           (select count(*)::text from private.trust_score_snapshots where id = $3::uuid)
             as unexpired_snapshots`,
        [expiredSignalId, expiredSnapshotId, unexpiredSnapshotId],
      );
      expect(remaining.rows[0]).toEqual({
        expired_signals: '0',
        expired_snapshots: '0',
        unexpired_snapshots: '1',
      });
    }, 30_000);

    it('preserves a bounded formal trust case while removing source signals', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|trust-account-deletion',
      };
      const observedAt = new Date('2024-08-25T10:00:00.000Z');
      const snapshotId = 'd1200000-0000-4000-8000-000000000007';
      const caseId = 'd1300000-0000-4000-8000-000000000007';

      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1::uuid, $2, $3, 'trust_cleanup', 'player', 'active')`,
        [TRUST_CLEANUP_PLAYER_ID, identity.issuer, identity.subject],
      );
      await pool.query(
        `insert into private.trust_signals (
           id, player_id, policy_version, signal_type, severity, base_points,
           observed_at, expires_at, source_type, source_identifier,
           deduplication_digest, created_at
         ) values (
           'd1400000-0000-4000-8000-000000000007'::uuid,
           $1::uuid, 'trust-v1', 'impossible_movement', 'moderate', 15,
           $2::timestamptz, $2::timestamptz, 'movement_decision',
           'account-delete-signal', decode(repeat('11', 32), 'hex'),
           $2::timestamptz
         )`,
        [TRUST_CLEANUP_PLAYER_ID, observedAt],
      );
      await pool.query(
        `insert into private.trust_score_snapshots (
           id, player_id, policy_version, evaluated_at,
           movement_points, submission_conflict_points, opponent_pattern_points,
           final_score, review_band, source_signal_count, calculation_digest,
           purge_after, created_at
         ) values (
           $1::uuid, $2::uuid, 'trust-v1', $3::timestamptz,
           30, 0, 0, 30, 'observe', 1,
           decode(repeat('22', 32), 'hex'),
           $3::timestamptz, $3::timestamptz
         )`,
        [snapshotId, TRUST_CLEANUP_PLAYER_ID, observedAt],
      );
      const trustClient = await pool.connect();
      try {
        await trustClient.query('begin');
        await trustClient.query(
          `insert into private.trust_cases (
             id, player_id, policy_version, status, version, current_score,
             current_band, latest_score_snapshot_id, opened_at, updated_at
           ) values (
             $1::uuid, $2::uuid, 'trust-v1', 'open', 1, 30, 'observe',
             $3::uuid, $4::timestamptz, $4::timestamptz
           )`,
          [caseId, TRUST_CLEANUP_PLAYER_ID, snapshotId, observedAt],
        );
        await trustClient.query(
          `insert into private.trust_case_decisions (
             id, case_id, actor_type, actor_player_id, policy_version,
             case_version_before, case_version_after, decision_type,
             previous_status, resulting_status, reason_code,
             resulting_score_snapshot_id, created_at
           ) values (
             'd1500000-0000-4000-8000-000000000007'::uuid,
             $1::uuid, 'system', null, 'trust-v1', 0, 1,
             'case_opened', null, 'open', 'score_band_crossed',
             $2::uuid, $3::timestamptz
           )`,
          [caseId, snapshotId, observedAt],
        );
        await trustClient.query('commit');
      } catch (error) {
        await trustClient.query('rollback');
        throw error;
      } finally {
        trustClient.release();
      }

      const reviewerId = 'd1600000-0000-4000-8000-000000000007';
      const restrictionDecisionId = 'd1700000-0000-4000-8000-000000000007';
      const reviewedAt = new Date();
      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1::uuid, $2, 'auth0|deletion-reviewer',
                   'deletion_reviewer', 'author', 'active')`,
        [reviewerId, ISSUER],
      );
      const reviewClient = await pool.connect();
      try {
        await reviewClient.query('begin');
        await reviewClient.query(
          `update private.trust_cases
              set status = 'under_review', version = 2,
                  updated_at = $2::timestamptz
            where id = $1::uuid`,
          [caseId, reviewedAt],
        );
        await reviewClient.query(
          `insert into private.trust_case_decisions (
             id, case_id, actor_type, actor_player_id, policy_version,
             case_version_before, case_version_after, decision_type,
             previous_status, resulting_status, reason_code,
             resulting_score_snapshot_id, reason_note, created_at
           ) values ($1::uuid, $2::uuid, 'author', $3::uuid, 'trust-v1',
                     1, 2, 'restriction', 'open', 'under_review',
                     'review_hold', $4::uuid, $6, $5::timestamptz)`,
          [
            restrictionDecisionId,
            caseId,
            reviewerId,
            snapshotId,
            reviewedAt,
            `Reviewer note about ${identity.subject}`,
          ],
        );
        await reviewClient.query(
          `insert into private.trust_restrictions (
             id, case_id, player_id, decision_id, policy_version, scope,
             starts_at, original_expires_at, created_at
           ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'trust-v1',
                     'new_competitive_match_hold', $5::timestamptz,
                     $5::timestamptz + interval '1 day', $5::timestamptz)`,
          [
            randomUUID(),
            caseId,
            TRUST_CLEANUP_PLAYER_ID,
            restrictionDecisionId,
            reviewedAt,
          ],
        );
        await reviewClient.query(
          `insert into private.trust_appeals (
             id, case_id, challenged_decision_id, player_id, policy_version,
             submitted_at, appeal_text, created_at
           ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'trust-v1',
                     $5::timestamptz, $6, $5::timestamptz)`,
          [
            randomUUID(),
            caseId,
            restrictionDecisionId,
            TRUST_CLEANUP_PLAYER_ID,
            reviewedAt,
            `Appeal from ${identity.subject} with ${TRUST_CLEANUP_PLAYER_ID}`,
          ],
        );
        await reviewClient.query('commit');
      } catch (error) {
        await reviewClient.query('rollback');
        throw error;
      } finally {
        reviewClient.release();
      }

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T10:00:00.000Z'),
        createId: () => TRUST_CLEANUP_DELETION_ID,
      });
      await lifecycle.request(identity);

      const trustState = await pool.query<{
        cases: string;
        signals: string;
        snapshots: string;
        restrictions: string;
        appeals: string;
      }>(
        `select
           (select count(*)::text from private.trust_cases
             where player_id = $1::uuid) as cases,
           (select count(*)::text from private.trust_signals
             where player_id = $1::uuid) as signals,
           (select count(*)::text from private.trust_score_snapshots
             where player_id = $1::uuid) as snapshots,
           (select count(*)::text from private.trust_restrictions
             where player_id = $1::uuid) as restrictions,
           (select count(*)::text from private.trust_appeals
             where player_id = $1::uuid) as appeals`,
        [TRUST_CLEANUP_PLAYER_ID],
      );
      expect(trustState.rows[0]).toEqual({
        cases: '1',
        signals: '0',
        snapshots: '1',
        restrictions: '1',
        appeals: '1',
      });
      await lifecycle.complete(TRUST_CLEANUP_DELETION_ID);
      const removedPlayer = await pool.query(
        `select id from public.players where id = $1::uuid`,
        [TRUST_CLEANUP_PLAYER_ID],
      );
      expect(removedPlayer.rows).toEqual([]);
      const retainedCase = await pool.query<{
        player_id: string;
        status: string;
        purge_after: Date;
      }>(
        `select trust_case.player_id, trust_case.status, retention.purge_after
           from private.trust_cases trust_case
           join private.trust_case_deletion_retention retention
             on retention.case_id = trust_case.id
          where trust_case.id = $1::uuid`,
        [caseId],
      );
      expect(retainedCase.rows[0]?.status).toBe('under_review');
      expect(retainedCase.rows[0]?.player_id).not.toBe(TRUST_CLEANUP_PLAYER_ID);
      expect(retainedCase.rows[0]?.purge_after).toEqual(
        new Date('2026-11-24T10:00:00.000Z'),
      );
      const retainedSnapshot = await pool.query<{ player_id: string }>(
        `select player_id::text from private.trust_score_snapshots
          where id = $1::uuid`,
        [snapshotId],
      );
      expect(retainedSnapshot.rows[0]?.player_id).toBe(
        retainedCase.rows[0]?.player_id,
      );
      const formerTrustIdentity = await pool.query<{ remaining: string }>(
        `select (
           (select count(*) from private.trust_cases where player_id = $1::uuid)
           + (select count(*) from private.trust_restrictions where player_id = $1::uuid)
           + (select count(*) from private.trust_appeals where player_id = $1::uuid)
           + (select count(*) from private.trust_score_snapshots where player_id = $1::uuid)
         )::text as remaining`,
        [TRUST_CLEANUP_PLAYER_ID],
      );
      expect(formerTrustIdentity.rows[0]?.remaining).toBe('0');
      const retainedFreeText = await pool.query<{
        appeal_text: string;
        reason_note: string | null;
      }>(
        `select appeal.appeal_text, decision.reason_note
           from private.trust_appeals appeal
           join private.trust_case_decisions decision
             on decision.id = appeal.challenged_decision_id
          where appeal.case_id = $1::uuid`,
        [caseId],
      );
      expect(retainedFreeText.rows[0]).toEqual({
        appeal_text: '[Redacted after account deletion]',
        reason_note: null,
      });
      const restrictions = createTrustRestrictionService(pool);
      await expect(
        restrictions.activeRestriction(
          retainedCase.rows[0]!.player_id,
          'new_competitive_match_hold',
        ),
      ).resolves.toBeNull();
      await expect(
        restrictions.activeRestriction(
          TRUST_CLEANUP_PLAYER_ID,
          'new_competitive_match_hold',
        ),
      ).resolves.toBeNull();
      const review = createTrustReviewService(pool);
      const reviewQueue = await review.listCases({
        actorPlayerId: reviewerId,
        status: 'all',
        page: 1,
        pageSize: 100,
      });
      expect(reviewQueue.items).toContainEqual(
        expect.objectContaining({
          caseId,
          playerName: 'Deleted player',
          canReview: false,
        }),
      );
      await expect(
        review.getCase({ actorPlayerId: reviewerId, caseId }),
      ).resolves.toMatchObject({
        caseId,
        playerName: 'Deleted player',
        canReview: false,
        restrictionCount: 1,
        activeRestrictionCount: 0,
      });
      await expect(
        review.decide({
          actorPlayerId: reviewerId,
          caseId,
          expectedVersion: 2,
          action: 'dismiss',
          reasonNote: 'Historical case is read-only.',
          evidenceIds: [],
          restrictionScopes: [],
        }),
      ).rejects.toThrow();
      await pool.query(
        `update private.trust_case_deletion_retention
            set purge_after = clock_timestamp() - interval '1 second'
          where case_id = $1::uuid`,
        [caseId],
      );
      const expiredTrust = await pool.query<{
        case_rows_deleted: number;
        snapshot_rows_deleted: number;
      }>(`select * from private.purge_expired_trust_data()`);
      expect(expiredTrust.rows[0]?.case_rows_deleted).toBeGreaterThanOrEqual(1);
      expect(
        expiredTrust.rows[0]?.snapshot_rows_deleted,
      ).toBeGreaterThanOrEqual(1);
      const expiredCase = await pool.query(
        `select id from private.trust_cases where id = $1::uuid`,
        [caseId],
      );
      expect(expiredCase.rows).toEqual([]);
      const expiredSnapshot = await pool.query(
        `select id from private.trust_score_snapshots where id = $1::uuid`,
        [snapshotId],
      );
      expect(expiredSnapshot.rows).toEqual([]);
    }, 30_000);

    it('rejects the same unexpired access token after completed deletion without reprovisioning', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|deleted-token-replay',
      };
      const issuedAtSeconds = Math.floor(Date.now() / 1000) - 60;
      const completedAt = new Date();
      const keyPair = await generateKeyPair('RS256');
      const authConfig: AuthConfig = {
        audience: 'https://api.example.test',
        domain: 'auth.example.test',
        issuer: ISSUER,
        jwksUrl: new URL(`${ISSUER}.well-known/jwks.json`),
        spaClientId: 'wits-world-spa-client',
      };
      const accessToken = await new SignJWT({
        [CONNECTION_STRATEGY_CLAIM]: AUTH0_DATABASE_CONNECTION_STRATEGY,
        [PLAYER_NAME_CLAIM]: 'deleted_token_player',
      })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(identity.issuer)
        .setAudience(authConfig.audience)
        .setSubject(identity.subject)
        .setIssuedAt(issuedAtSeconds)
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3_600)
        .sign(keyPair.privateKey);

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, player_name, role, lifecycle_status
          ) values ($1, $2, $3, 'deleted_token_player', 'player', 'active')
        `,
        [DENIED_TOKEN_PLAYER_ID, identity.issuer, identity.subject],
      );

      const deletionCountBefore = await pool.query<{ count: string }>(
        `select count(*)::text as count from public.account_deletion_requests`,
      );
      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => completedAt,
        createId: () => DENIED_TOKEN_DELETION_ID,
      });
      const playerIdentityService = createPlayerIdentityService(pool);
      const app = await buildApp({
        authConfig,
        accessTokenVerifier: createAccessTokenVerifier(authConfig, {
          verificationKey: keyPair.publicKey,
        }),
        playerIdentityService,
        accountDeletionServices: {
          lifecycle,
          managementClient: { deleteUser: async () => undefined },
          reauthenticationVerifier: {
            verify: async () => ({
              authenticatedAt: new Date(),
              identity,
            }),
          },
        },
        logger: false,
      });

      try {
        const deletionResponse = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/account-deletion',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            confirmation: 'DELETE_MY_ACCOUNT',
            reauthenticationToken: 'fresh-id-token',
          },
        });

        expect(deletionResponse.statusCode).toBe(200);
        expect(deletionResponse.json()).toMatchObject({
          deletionId: DENIED_TOKEN_DELETION_ID,
          status: 'completed',
        });

        const protectedResponse = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { authorization: `Bearer ${accessToken}` },
        });
        const retryResponse = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/account-deletion',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            confirmation: 'DELETE_MY_ACCOUNT',
            reauthenticationToken: 'fresh-id-token',
          },
        });

        expect(protectedResponse.statusCode).toBe(403);
        expect(protectedResponse.json()).toMatchObject({
          code: 'ACCOUNT_UNAVAILABLE',
        });
        expect(retryResponse.statusCode).toBe(403);
        expect(retryResponse.json()).toMatchObject({
          code: 'ACCOUNT_UNAVAILABLE',
        });

        const persisted = await pool.query<{
          deletion_count: string;
          denial_count: string;
          mapped_players: string;
        }>(
          `
            select
              (select count(*)::text
                 from public.account_deletion_requests) as deletion_count,
              (select count(*)::text
                 from private.deleted_identity_token_denials
                where deletion_request_id = $1::uuid) as denial_count,
              (select count(*)::text
                 from public.players
                where auth_issuer = $2
                  and auth_subject = $3) as mapped_players
          `,
          [DENIED_TOKEN_DELETION_ID, identity.issuer, identity.subject],
        );

        expect(persisted.rows[0]).toEqual({
          deletion_count: String(
            Number(deletionCountBefore.rows[0]?.count ?? '0') + 1,
          ),
          denial_count: '1',
          mapped_players: '0',
        });
      } finally {
        await app.close();
      }
    }, 30_000);

    it('rejects an old token whose resolution starts during deletion completion', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|deletion-resolution-race',
      };
      const completedAt = new Date();
      const tokenIssuedAt = new Date(completedAt.getTime() - 60_000);
      const deletionCountBefore = await pool.query<{ count: string }>(
        `select count(*)::text as count from public.account_deletion_requests`,
      );

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, player_name, role, lifecycle_status
          ) values ($1, $2, $3, 'racing_token_player', 'player', 'active')
        `,
        [RACING_TOKEN_PLAYER_ID, identity.issuer, identity.subject],
      );

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => completedAt,
        createId: () => RACING_TOKEN_DELETION_ID,
      });
      const requested = await lifecycle.request(identity);
      const completionPaused = createDeferred<void>();
      const releaseCompletion = createDeferred<void>();
      const resolutionLockAttempted = createDeferred<number>();
      const completionClient = await pool.connect();
      const resolutionClient = await pool.connect();
      let completionPauseObserved = false;

      const pausedCompletionLifecycle = createAccountDeletionLifecycle(
        {
          connect: async () =>
            createInterceptedClient(completionClient, async (statement) => {
              if (
                !completionPauseObserved &&
                statement.includes(
                  'insert into private.deleted_identity_token_denials',
                )
              ) {
                completionPauseObserved = true;
                completionPaused.resolve();
                await releaseCompletion.promise;
              }
            }),
        } as Pick<pg.Pool, 'connect'>,
        { clock: () => completedAt },
      );
      const identityService = createPlayerIdentityService({
        query: pool.query.bind(pool),
        connect: async () =>
          createInterceptedClient(resolutionClient, async (statement) => {
            if (statement.includes('pg_advisory_xact_lock')) {
              const backend = await resolutionClient.query<{ pid: number }>(
                `select pg_backend_pid() as pid`,
              );
              resolutionLockAttempted.resolve(backend.rows[0]?.pid ?? -1);
            }
          }),
      });

      const completion = pausedCompletionLifecycle.complete(requested.id);
      let resolution:
        | Promise<
            { status: 'fulfilled' } | { status: 'rejected'; reason: unknown }
          >
        | undefined;

      try {
        await completionPaused.promise;

        resolution = identityService
          .resolve({
            connectionStrategy: AUTH0_DATABASE_CONNECTION_STRATEGY,
            issuer: identity.issuer,
            subject: identity.subject,
            playerName: 'racing_token_player',
            tokenIssuedAt,
          })
          .then(
            () => ({ status: 'fulfilled' as const }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          );
        const resolutionBackendPid = await resolutionLockAttempted.promise;
        await waitForAdvisoryLockWait(pool, resolutionBackendPid);

        releaseCompletion.resolve();
        await expect(completion).resolves.toMatchObject({
          id: RACING_TOKEN_DELETION_ID,
          status: 'completed',
        });
        const resolutionResult = await resolution;
        expect(resolutionResult.status).toBe('rejected');
        if (resolutionResult.status === 'rejected') {
          expect(resolutionResult.reason).toBeInstanceOf(
            DeletedIdentityTokenError,
          );
        }

        const persisted = await pool.query<{
          deletion_count: string;
          denial_count: string;
          mapped_players: string;
        }>(
          `
          select
            (select count(*)::text
               from public.account_deletion_requests) as deletion_count,
            (select count(*)::text
               from private.deleted_identity_token_denials
              where deletion_request_id = $1::uuid) as denial_count,
            (select count(*)::text
               from public.players
              where auth_issuer = $2
                and auth_subject = $3) as mapped_players
          `,
          [RACING_TOKEN_DELETION_ID, identity.issuer, identity.subject],
        );

        expect(persisted.rows[0]).toEqual({
          deletion_count: String(
            Number(deletionCountBefore.rows[0]?.count ?? '0') + 1,
          ),
          denial_count: '1',
          mapped_players: '0',
        });
      } finally {
        releaseCompletion.resolve();
        await Promise.allSettled(
          resolution ? [completion, resolution] : [completion],
        );
      }
    }, 30_000);

    it('rolls back deletion initiation when dependent gameplay finalization fails', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|gameplay-finalization-rollback',
      };
      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1::uuid, $2, $3, 'gameplay_rollback', 'player', 'active')`,
        [GAMEPLAY_ROLLBACK_PLAYER_ID, identity.issuer, identity.subject],
      );
      const finalizeDependentGameplay = vi
        .fn()
        .mockRejectedValue(new Error('forced PvP finalization failure'));
      const requestedAt = new Date('2026-08-26T12:30:00.000Z');
      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => requestedAt,
        createId: () => GAMEPLAY_ROLLBACK_DELETION_ID,
        finalizeDependentGameplay,
      });

      await expect(lifecycle.request(identity)).rejects.toThrow(
        'forced PvP finalization failure',
      );
      expect(finalizeDependentGameplay).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.any(Function) }),
        GAMEPLAY_ROLLBACK_PLAYER_ID,
        requestedAt,
      );
      const state = await pool.query<{
        deletion_count: string;
        lifecycle_status: string;
      }>(
        `select player.lifecycle_status,
                (select count(*)::text
                   from public.account_deletion_requests deletion
                  where deletion.id = $2::uuid) as deletion_count
           from public.players player
          where player.id = $1::uuid`,
        [GAMEPLAY_ROLLBACK_PLAYER_ID, GAMEPLAY_ROLLBACK_DELETION_ID],
      );
      expect(state.rows[0]).toEqual({
        deletion_count: '0',
        lifecycle_status: 'active',
      });
    });

    it('rolls back partial cleanup and succeeds on retry', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-rollback',
      };
      const definition = await loadStarterDefinitions(pool, 1);
      const cardDefinition = definition[0];

      if (!cardDefinition) {
        throw new Error('Expected a seeded card definition.');
      }

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, player_name, role, lifecycle_status
          ) values ($1, $2, $3, 'rollback_player', 'player', 'active')
        `,
        [ROLLBACK_PLAYER_ID, identity.issuer, identity.subject],
      );
      await pool.query(
        `
          insert into public.player_starter_grants (id, player_id, affinity)
          values ($1, $2, 'wit')
        `,
        [ROLLBACK_GRANT_ID, ROLLBACK_PLAYER_ID],
      );
      await pool.query(
        `
          insert into public.player_cards (
            player_id, card_definition_id, source_starter_grant_id,
            acquisition_kind
          ) values ($1, $2, $3, 'starter')
        `,
        [ROLLBACK_PLAYER_ID, cardDefinition.id, ROLLBACK_GRANT_ID],
      );
      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T13:00:00.000Z'),
        createId: () => ROLLBACK_DELETION_ID,
      });
      const requested = await lifecycle.request(identity);

      await pool.query(`
        create function private.reject_card_cleanup_for_test()
        returns trigger
        language plpgsql
        as $$
        begin
          raise exception 'forced account cleanup failure';
        end;
        $$;

        create trigger reject_card_cleanup_for_test
        before delete on public.player_cards
        for each row execute function private.reject_card_cleanup_for_test();
      `);

      try {
        await expect(lifecycle.complete(requested.id)).rejects.toThrow(
          'forced account cleanup failure',
        );

        const rolledBack = await pool.query<{
          cards: string;
          lifecycle_status: string;
          request_status: string;
          wallets: string;
        }>(
          `
            select
              player.lifecycle_status,
              deletion.status as request_status,
              (select count(*)::text from public.player_cards
                where player_id = player.id) as cards,
              (select count(*)::text from public.player_wallets
                where player_id = player.id) as wallets
            from public.players player
            join public.account_deletion_requests deletion
              on deletion.id = player.deletion_request_id
            where player.id = $1::uuid
          `,
          [ROLLBACK_PLAYER_ID],
        );

        expect(rolledBack.rows[0]).toEqual({
          cards: '1',
          lifecycle_status: 'deletion_pending',
          request_status: 'pending',
          wallets: '0',
        });
      } finally {
        await pool.query(`
          drop trigger if exists reject_card_cleanup_for_test
            on public.player_cards;
          drop function if exists private.reject_card_cleanup_for_test();
        `);
      }

      await lifecycle.markRetryPending(requested.id, 'local_cleanup_failed');
      await expect(lifecycle.complete(requested.id)).resolves.toMatchObject({
        id: ROLLBACK_DELETION_ID,
        status: 'completed',
      });

      const retried = await pool.query<{
        cards: string;
        players: string;
        wallets: string;
      }>(
        `
          select
            (select count(*)::text from public.players
              where id = $1::uuid) as players,
            (select count(*)::text from public.player_cards
              where player_id = $1::uuid) as cards,
            (select count(*)::text from public.player_wallets
              where player_id = $1::uuid) as wallets
        `,
        [ROLLBACK_PLAYER_ID],
      );

      expect(retried.rows[0]).toEqual({
        cards: '0',
        players: '0',
        wallets: '0',
      });
    }, 30_000);

    it('serializes concurrent completion calls into one removed account', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-concurrent',
      };

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, role, lifecycle_status
          ) values ($1, $2, $3, 'player', 'active')
        `,
        [CONCURRENT_PLAYER_ID, identity.issuer, identity.subject],
      );
      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T14:00:00.000Z'),
        createId: () => CONCURRENT_DELETION_ID,
      });
      const requested = await lifecycle.request(identity);

      const results = await Promise.all([
        lifecycle.complete(requested.id),
        lifecycle.complete(requested.id),
      ]);

      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toMatchObject({
        id: CONCURRENT_DELETION_ID,
        status: 'completed',
      });

      const persisted = await pool.query<{
        audits: string;
        players: string;
        wallets: string;
      }>(
        `
          select
            (select count(*)::text from public.players
              where id = $1::uuid) as players,
            (select count(*)::text from public.account_deletion_requests
              where id = $2::uuid) as audits,
            (select count(*)::text from public.player_wallets
              where player_id = $1::uuid) as wallets
        `,
        [CONCURRENT_PLAYER_ID, CONCURRENT_DELETION_ID],
      );

      expect(persisted.rows[0]).toEqual({
        audits: '1',
        players: '0',
        wallets: '0',
      });
    }, 30_000);

    it('backfills card reward outcomes when upgrading a current schema', async () => {
      const existingDatabaseName = `wits_quest_deletion_upgrade_${Date.now()}_${process.pid}`;
      const migrationDirectory = await mkdtemp(
        join(tmpdir(), 'wits-deletion-migrations-'),
      );
      const existingUrl = new URL(administrationConfig.connectionString);
      existingUrl.pathname = `/${existingDatabaseName}`;
      const existingConfig = {
        ...administrationConfig,
        connectionString: existingUrl.toString(),
      };

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${existingDatabaseName}`);
      });

      try {
        const migrations = await readdir(getMigrationsDirectory());
        await Promise.all(
          migrations
            .filter(
              (name) =>
                name.endsWith('.sql') && name < ACCOUNT_DELETION_MIGRATION,
            )
            .map((name) =>
              copyFile(
                join(getMigrationsDirectory(), name),
                join(migrationDirectory, name),
              ),
            ),
        );

        await runMigrations(existingConfig, migrationDirectory);
        await runSeeds(existingConfig);

        const upgradePlayerId = 'e1000000-0000-4000-8000-000000000001';
        const upgradeEventId = 'e2000000-0000-4000-8000-000000000001';
        const upgradeChallengeId = 'e3000000-0000-4000-8000-000000000001';
        const upgradeAttemptId = 'e4000000-0000-4000-8000-000000000001';
        const upgradeCompletionId = 'e5000000-0000-4000-8000-000000000001';

        await withDatabaseClient(existingConfig, async (client) => {
          await client.query(
            `
              insert into public.players (
                id, auth_issuer, auth_subject, role, lifecycle_status
              ) values ($1, $2, 'auth0|upgrade-player', 'player', 'active')
            `,
            [upgradePlayerId, ISSUER],
          );
          await seedLegacyRewardDefinition(client);
          await seedPublishedChallenge(client, {
            challengeId: upgradeChallengeId,
            eventId: upgradeEventId,
            namespace: 'e3100001',
            title: 'Deletion upgrade challenge',
          });
          await seedAttempt(client, {
            attemptId: upgradeAttemptId,
            challengeId: upgradeChallengeId,
            eventId: upgradeEventId,
            namespace: 'e4100001',
            playerId: upgradePlayerId,
            answerCount: 5,
          });
          await completeAttempt(client, {
            attemptId: upgradeAttemptId,
            completionId: upgradeCompletionId,
            includeRetainedCardReward: false,
            playerId: upgradePlayerId,
          });
        });

        await copyFile(
          join(getMigrationsDirectory(), ACCOUNT_DELETION_MIGRATION),
          join(migrationDirectory, ACCOUNT_DELETION_MIGRATION),
        );
        await expect(
          runMigrations(existingConfig, migrationDirectory),
        ).resolves.toMatchObject({
          applied: [ACCOUNT_DELETION_MIGRATION],
        });

        await withDatabaseClient(existingConfig, async (client) => {
          const retained = await client.query<{
            awarded_at: Date;
            card_definition_id: string;
            reward_position: number;
          }>(
            `
              select reward_position, card_definition_id::text, awarded_at
              from public.event_completion_card_rewards
              where completion_id = $1::uuid
            `,
            [upgradeCompletionId],
          );

          expect(retained.rows).toHaveLength(1);
          expect(retained.rows[0]).toMatchObject({
            reward_position: 1,
            card_definition_id: expect.any(String),
            awarded_at: expect.any(Date),
          });
        });

        await Promise.all(
          migrations
            .filter(
              (name) =>
                name.endsWith('.sql') &&
                name > ACCOUNT_DELETION_MIGRATION &&
                name < '0062_detach_deleted_player_history.sql',
            )
            .map((name) =>
              copyFile(
                join(getMigrationsDirectory(), name),
                join(migrationDirectory, name),
              ),
            ),
        );
        await runMigrations(existingConfig, migrationDirectory);
        const legacyDeletedId = upgradePlayerId;
        const legacyDeletionId = 'e7100000-0000-4000-8000-000000000001';
        await withDatabaseClient(existingConfig, async (client) => {
          await client.query('begin');
          await client.query(
            `insert into public.account_deletion_requests (
               id, requested_at, status
             ) values ($1::uuid, now(), 'pending')`,
            [legacyDeletionId],
          );
          await client.query(
            `update public.players
                set lifecycle_status = 'deletion_pending',
                    deletion_request_id = $2::uuid, updated_at = now()
              where id = $1::uuid`,
            [legacyDeletedId, legacyDeletionId],
          );
          await client.query(
            `select private.delete_player_owned_data($1::uuid, $2::uuid)`,
            [legacyDeletedId, legacyDeletionId],
          );
          await client.query(
            `update public.players
                set auth_issuer = null, auth_subject = null,
                    player_name = null, role = null,
                    lifecycle_status = 'deleted',
                    deletion_request_id = null, updated_at = now()
              where id = $1::uuid`,
            [legacyDeletedId],
          );
          await client.query(
            `update public.account_deletion_requests
                set status = 'completed', completed_at = now()
              where id = $1::uuid`,
            [legacyDeletionId],
          );
          await client.query('commit');
          const retainedProgress = await client.query<{ awards: string }>(
            `select count(*)::text as awards from public.player_point_awards
              where player_id = $1::uuid`,
            [legacyDeletedId],
          );
          expect(Number(retainedProgress.rows[0]?.awards)).toBeGreaterThan(0);
        });
        for (const name of [
          '0062_detach_deleted_player_history.sql',
          '0063_purge_deleted_player_progression.sql',
        ]) {
          await copyFile(
            join(getMigrationsDirectory(), name),
            join(migrationDirectory, name),
          );
        }
        await expect(
          runMigrations(existingConfig, migrationDirectory),
        ).resolves.toMatchObject({
          applied: [
            '0062_detach_deleted_player_history.sql',
            '0063_purge_deleted_player_progression.sql',
          ],
        });
        await withDatabaseClient(existingConfig, async (client) => {
          const migrated = await client.query<{
            players: string;
            actors: string;
            awards: string;
            completions: string;
          }>(
            `select
               (select count(*)::text from public.players where id = $1::uuid) as players,
               (select count(*)::text from private.player_history_actors
                 where id = $1::uuid) as actors,
               (select count(*)::text from public.player_point_awards
                 where player_id = $1::uuid) as awards,
               (select count(*)::text from public.event_completions
                 where player_id = $1::uuid) as completions`,
            [legacyDeletedId],
          );
          expect(migrated.rows[0]).toEqual({
            players: '0',
            actors: '0',
            awards: '0',
            completions: '0',
          });
        });
      } finally {
        await withDatabaseClient(administrationConfig, async (client) => {
          await client.query(
            `drop database if exists ${existingDatabaseName} with (force)`,
          );
        });
        await rm(migrationDirectory, { force: true, recursive: true });
      }
    }, 180_000);
  },
);

async function seedCompletePlayerJourney(
  client: pg.PoolClient,
  authSubject: string,
): Promise<void> {
  await client.query(
    `
      insert into public.players (
        id, auth_issuer, auth_subject, player_name, role, lifecycle_status
      ) values ($1, $2, $3, 'deleted_author', 'author', 'active')
    `,
    [PLAYER_ID, ISSUER, authSubject],
  );

  await seedPublishedChallenge(client, {
    challengeId: COMPLETED_CHALLENGE_ID,
    eventId: COMPLETED_EVENT_ID,
    namespace: 'd3100001',
    title: 'Completed deletion challenge',
  });
  await seedPublishedOrderingChallenge(client, {
    challengeId: ACTIVE_CHALLENGE_ID,
    eventId: ACTIVE_EVENT_ID,
    namespace: 'd3100002',
    title: 'Active deletion challenge',
  });

  const definitions = await loadStarterDefinitions(client, 5);

  if (definitions.length !== 5) {
    throw new Error('Expected five seeded starter definitions.');
  }

  await client.query(
    `
      insert into public.player_starter_grants (id, player_id, affinity)
      values ($1, $2, 'wit')
    `,
    [STARTER_GRANT_ID, PLAYER_ID],
  );

  const ownedCardIds: string[] = [];

  for (const [index, definition] of definitions.entries()) {
    const ownedCardId = fixtureUuid('d6100001', index + 1);
    ownedCardIds.push(ownedCardId);
    await client.query(
      `
        insert into public.player_cards (
          id,
          player_id,
          card_definition_id,
          source_starter_grant_id,
          acquisition_kind
        ) values ($1, $2, $3, $4, 'starter')
      `,
      [ownedCardId, PLAYER_ID, definition.id, STARTER_GRANT_ID],
    );
  }

  await client.query(
    `
      insert into public.player_decks (id, player_id, name)
      values ($1, $2, 'Deletion retention deck')
    `,
    [DECK_ID, PLAYER_ID],
  );

  for (const [index, ownedCardId] of ownedCardIds.entries()) {
    await client.query(
      `
        insert into public.player_deck_cards (
          deck_id, player_id, owned_card_id, position
        ) values ($1, $2, $3, $4)
      `,
      [DECK_ID, PLAYER_ID, ownedCardId, index + 1],
    );
  }

  await client.query(
    `
      insert into public.player_deck_selections (player_id, deck_id)
      values ($1, $2)
    `,
    [PLAYER_ID, DECK_ID],
  );

  await seedAttempt(client, {
    attemptId: COMPLETED_ATTEMPT_ID,
    challengeId: COMPLETED_CHALLENGE_ID,
    eventId: COMPLETED_EVENT_ID,
    namespace: 'd4100001',
    playerId: PLAYER_ID,
    answerCount: 5,
  });
  await completeAttempt(client, {
    attemptId: COMPLETED_ATTEMPT_ID,
    completionId: COMPLETION_ID,
    includeRetainedCardReward: true,
    playerId: PLAYER_ID,
  });

  await seedOrderingAttempt(client, {
    attemptId: ACTIVE_ATTEMPT_ID,
    challengeId: ACTIVE_CHALLENGE_ID,
    eventId: ACTIVE_EVENT_ID,
    namespace: 'd4100002',
    playerId: PLAYER_ID,
    answerCount: 1,
  });

  await seedMatches(client, ownedCardIds[0]!, definitions[0]!.id);

  await client.query(
    `
      insert into public.author_content_audit (
        id, actor_player_id, entity_type, entity_id, action, occurred_at
      ) values (
        $1, $2, 'event', $3, 'publish', '2026-08-26T10:00:00.000Z'
      )
    `,
    ['d9000000-0000-4000-8000-000000000001', PLAYER_ID, COMPLETED_EVENT_ID],
  );
}

async function seedPublishedChallenge(
  client: pg.PoolClient,
  input: {
    challengeId: string;
    eventId: string;
    namespace: string;
    title: string;
  },
): Promise<void> {
  const curatedLifecycle = await hasCuratedAuthoringLifecycle(client);
  await client.query('begin');

  try {
    await client.query(
      curatedLifecycle
        ? `
        insert into public.events (
          id, title, location, radius_metres, starts_at, ends_at, is_published,
          authoring_status, publication_provenance
        ) values (
          $1,
          $2,
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
          true,
          'published',
          'controlled_seed'
        )
      `
        : `
        insert into public.events (
          id, title, location, radius_metres, starts_at, ends_at, is_published
        ) values (
          $1,
          $2,
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
          true
        )
      `,
      [input.eventId, input.title],
    );
    await client.query(
      `
        insert into public.event_challenges (id, event_id, format, status)
        values ($1, $2, 'multiple_choice', 'draft')
      `,
      [input.challengeId, input.eventId],
    );

    for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
      const questionId = fixtureUuid(input.namespace, questionNumber);

      await client.query(
        `
          insert into public.challenge_questions (
            id, challenge_id, prompt, difficulty, explanation, status
          ) values ($1, $2, $3, 2, $4, 'draft')
        `,
        [
          questionId,
          input.challengeId,
          `${input.title} question ${questionNumber}`,
          `${input.title} explanation ${questionNumber}`,
        ],
      );

      for (let choiceNumber = 1; choiceNumber <= 4; choiceNumber += 1) {
        await client.query(
          `
            insert into public.challenge_choices (
              id, question_id, authoring_position, choice_text
            ) values ($1, $2, $3, $4)
          `,
          [
            fixtureUuid(
              incrementNamespace(input.namespace),
              questionNumber * 10 + choiceNumber,
            ),
            questionId,
            choiceNumber,
            `${input.title} choice ${questionNumber}.${choiceNumber}`,
          ],
        );
      }

      await client.query(
        `
          insert into private.challenge_answer_keys (
            question_id, accepted_choice_id
          ) values ($1, $2)
        `,
        [
          questionId,
          fixtureUuid(
            incrementNamespace(input.namespace),
            questionNumber * 10 + 1,
          ),
        ],
      );
    }

    await client.query(
      curatedLifecycle
        ? `
        update public.challenge_questions
           set status = 'published',
               version = version + 1,
               publication_provenance = 'controlled_seed',
               updated_at = now()
         where challenge_id = $1
      `
        : `update public.challenge_questions
             set status = 'published', updated_at = now()
           where challenge_id = $1`,
      [input.challengeId],
    );
    await client.query(
      curatedLifecycle
        ? `
        update public.event_challenges
           set status = 'published',
               version = version + 1,
               publication_provenance = 'controlled_seed',
               updated_at = now()
         where id = $1
      `
        : `update public.event_challenges
             set status = 'published', updated_at = now()
           where id = $1`,
      [input.challengeId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedAttempt(
  client: pg.PoolClient,
  input: {
    attemptId: string;
    challengeId: string;
    eventId: string;
    namespace: string;
    playerId: string;
    answerCount: number;
  },
): Promise<void> {
  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.challenge_attempts (
          id,
          player_id,
          event_id,
          challenge_id,
          started_at,
          deadline,
          time_limit_seconds,
          average_difficulty,
          created_at,
          updated_at
        ) values (
          $1, $2, $3, $4,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:02:00.000Z',
          120,
          2.00,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:00:00.000Z'
        )
      `,
      [input.attemptId, input.playerId, input.eventId, input.challengeId],
    );

    const questions = await client.query<{
      difficulty: number;
      id: string;
      prompt: string;
    }>(
      `
        select id::text, prompt, difficulty
        from public.challenge_questions
        where challenge_id = $1::uuid
        order by id
      `,
      [input.challengeId],
    );

    for (const [questionIndex, question] of questions.rows.entries()) {
      const attemptQuestionId = fixtureUuid(input.namespace, questionIndex + 1);
      await client.query(
        `
          insert into public.attempt_questions (
            id,
            attempt_id,
            source_question_id,
            position,
            prompt_snapshot,
            difficulty_snapshot
          ) values ($1, $2, $3, $4, $5, $6)
        `,
        [
          attemptQuestionId,
          input.attemptId,
          question.id,
          questionIndex + 1,
          question.prompt,
          question.difficulty,
        ],
      );

      const choices = await client.query<{
        choice_text: string;
        id: string;
      }>(
        `
          select id::text, choice_text
          from public.challenge_choices
          where question_id = $1::uuid
          order by authoring_position
        `,
        [question.id],
      );

      let selectedChoiceId: string | null = null;

      for (const [choiceIndex, choice] of choices.rows.entries()) {
        const attemptChoiceId = fixtureUuid(
          incrementNamespace(input.namespace),
          (questionIndex + 1) * 10 + choiceIndex + 1,
        );
        selectedChoiceId ??= attemptChoiceId;

        await client.query(
          `
            insert into public.attempt_question_choices (
              id,
              attempt_question_id,
              source_question_id,
              source_choice_id,
              display_position,
              choice_text_snapshot
            ) values ($1, $2, $3, $4, $5, $6)
          `,
          [
            attemptChoiceId,
            attemptQuestionId,
            question.id,
            choice.id,
            choiceIndex + 1,
            choice.choice_text,
          ],
        );
      }

      if (questionIndex < input.answerCount && selectedChoiceId) {
        await client.query(
          `
            insert into public.attempt_answers (
              attempt_question_id, selected_choice_id, answered_at
            ) values ($1, $2, '2026-08-26T10:01:00.000Z')
          `,
          [attemptQuestionId, selectedChoiceId],
        );
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedPublishedOrderingChallenge(
  client: pg.PoolClient,
  input: {
    challengeId: string;
    eventId: string;
    namespace: string;
    title: string;
  },
): Promise<void> {
  const curatedLifecycle = await hasCuratedAuthoringLifecycle(client);
  await client.query('begin');

  try {
    await client.query(
      curatedLifecycle
        ? `
        insert into public.events (
          id, title, location, radius_metres, starts_at, ends_at, is_published,
          authoring_status, publication_provenance
        ) values (
          $1,
          $2,
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
          true,
          'published',
          'controlled_seed'
        )
      `
        : `
        insert into public.events (
          id, title, location, radius_metres, starts_at, ends_at, is_published
        ) values (
          $1,
          $2,
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
          true
        )
      `,
      [input.eventId, input.title],
    );
    await client.query(
      `
        insert into public.event_challenges (id, event_id, format, status)
        values ($1, $2, 'ordering', 'draft')
      `,
      [input.challengeId, input.eventId],
    );

    for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
      const questionId = fixtureUuid(input.namespace, questionNumber);

      await client.query(
        `
          insert into public.challenge_questions (
            id, challenge_id, prompt, difficulty, explanation, status
          ) values ($1, $2, $3, 2, $4, 'draft')
        `,
        [
          questionId,
          input.challengeId,
          `${input.title} question ${questionNumber}`,
          `${input.title} explanation ${questionNumber}`,
        ],
      );

      for (let itemNumber = 1; itemNumber <= 4; itemNumber += 1) {
        const itemId = fixtureUuid(
          incrementNamespace(input.namespace),
          questionNumber * 10 + itemNumber,
        );
        await client.query(
          `
            insert into public.challenge_ordering_items (
              id, question_id, item_text
            ) values ($1, $2, $3)
          `,
          [
            itemId,
            questionId,
            `${input.title} item ${questionNumber}.${itemNumber}`,
          ],
        );
        await client.query(
          `
            insert into private.challenge_ordering_answer_keys (
              question_id, item_id, correct_position
            ) values ($1, $2, $3)
          `,
          [questionId, itemId, itemNumber],
        );
      }
    }

    await client.query(
      curatedLifecycle
        ? `
        update public.challenge_questions
           set status = 'published',
               version = version + 1,
               publication_provenance = 'controlled_seed',
               updated_at = now()
         where challenge_id = $1
      `
        : `update public.challenge_questions
             set status = 'published', updated_at = now()
           where challenge_id = $1`,
      [input.challengeId],
    );
    await client.query(
      curatedLifecycle
        ? `
        update public.event_challenges
           set status = 'published',
               version = version + 1,
               publication_provenance = 'controlled_seed',
               updated_at = now()
         where id = $1
      `
        : `update public.event_challenges
             set status = 'published', updated_at = now()
           where id = $1`,
      [input.challengeId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedOrderingAttempt(
  client: pg.PoolClient,
  input: {
    attemptId: string;
    challengeId: string;
    eventId: string;
    namespace: string;
    playerId: string;
    answerCount: number;
  },
): Promise<void> {
  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.challenge_attempts (
          id,
          player_id,
          event_id,
          challenge_id,
          started_at,
          deadline,
          time_limit_seconds,
          average_difficulty,
          created_at,
          updated_at
        ) values (
          $1, $2, $3, $4,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:02:00.000Z',
          120,
          2.00,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:00:00.000Z'
        )
      `,
      [input.attemptId, input.playerId, input.eventId, input.challengeId],
    );

    const questions = await client.query<{
      difficulty: number;
      explanation: string;
      id: string;
      prompt: string;
    }>(
      `
        select id::text, prompt, difficulty, explanation
        from public.challenge_questions
        where challenge_id = $1::uuid
        order by id
      `,
      [input.challengeId],
    );

    for (const [questionIndex, question] of questions.rows.entries()) {
      const attemptQuestionId = fixtureUuid(input.namespace, questionIndex + 1);
      await client.query(
        `
          insert into public.attempt_questions (
            id,
            attempt_id,
            source_question_id,
            position,
            prompt_snapshot,
            difficulty_snapshot,
            explanation_snapshot
          ) values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          attemptQuestionId,
          input.attemptId,
          question.id,
          questionIndex + 1,
          question.prompt,
          question.difficulty,
          question.explanation,
        ],
      );

      const items = await client.query<{
        id: string;
        item_text: string;
      }>(
        `
          select item.id::text, item.item_text
          from public.challenge_ordering_items item
          join private.challenge_ordering_answer_keys answer_key
            on answer_key.question_id = item.question_id
           and answer_key.item_id = item.id
          where item.question_id = $1::uuid
          order by answer_key.correct_position
        `,
        [question.id],
      );
      const attemptItemIds: string[] = [];

      for (const [itemIndex, item] of items.rows.entries()) {
        const attemptItemId = fixtureUuid(
          incrementNamespace(input.namespace),
          (questionIndex + 1) * 10 + itemIndex + 1,
        );
        attemptItemIds.push(attemptItemId);
        await client.query(
          `
            insert into public.attempt_question_ordering_items (
              id,
              attempt_question_id,
              source_question_id,
              source_item_id,
              display_position,
              item_text_snapshot
            ) values ($1, $2, $3, $4, $5, $6)
          `,
          [
            attemptItemId,
            attemptQuestionId,
            question.id,
            item.id,
            itemIndex + 1,
            item.item_text,
          ],
        );
      }

      if (questionIndex < input.answerCount) {
        await client.query(
          `
            insert into public.attempt_ordering_answers (
              attempt_question_id, answered_at
            ) values ($1, '2026-08-26T10:01:00.000Z')
          `,
          [attemptQuestionId],
        );

        for (const [itemIndex, attemptItemId] of attemptItemIds.entries()) {
          await client.query(
            `
              insert into public.attempt_ordering_answer_items (
                attempt_question_id, selected_item_id, submitted_position
              ) values ($1, $2, $3)
            `,
            [attemptQuestionId, attemptItemId, itemIndex + 1],
          );
        }
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function completeAttempt(
  client: pg.PoolClient,
  input: {
    attemptId: string;
    completionId: string;
    includeRetainedCardReward: boolean;
    playerId: string;
  },
): Promise<void> {
  const rewardCard = await client.query<{ id: string }>(
    `
      select id::text
      from public.card_definitions
      where rarity = 'rare'
        and is_active = true
      order by id
      limit 1
    `,
  );
  const cardDefinitionId = rewardCard.rows[0]?.id;

  if (!cardDefinitionId) {
    throw new Error('Expected a seeded reward card definition.');
  }

  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.event_completions (
          id,
          attempt_id,
          player_id,
          event_id,
          score_correct,
          average_difficulty,
          coins_awarded,
          reward_policy_version,
          completed_at
        )
        select
          $1,
          attempt.id,
          attempt.player_id,
          attempt.event_id,
          5,
          attempt.average_difficulty,
          0,
          'points-cards-v2',
          '2026-08-26T10:01:30.000Z'
        from public.challenge_attempts attempt
        where attempt.id = $2::uuid
          and attempt.player_id = $3::uuid
      `,
      [input.completionId, input.attemptId, input.playerId],
    );
    await client.query(
      `
        insert into public.player_cards (
          player_id,
          card_definition_id,
          source_completion_id,
          acquisition_kind,
          acquired_at
        ) values (
          $1, $2, $3, 'event_reward', '2026-08-26T10:01:30.000Z'
        )
      `,
      [input.playerId, cardDefinitionId, input.completionId],
    );
    await client.query(
      `
        update public.challenge_attempts
           set status = 'completed',
               completed_at = '2026-08-26T10:01:30.000Z',
               completion_reason = 'answered',
               score_correct = 5,
               updated_at = '2026-08-26T10:01:30.000Z'
         where id = $1::uuid
      `,
      [input.attemptId],
    );

    if (input.includeRetainedCardReward) {
      await client.query(
        `
          insert into public.event_completion_card_rewards (
            completion_id,
            reward_position,
            card_definition_id,
            awarded_at
          ) values ($1, 1, $2, '2026-08-26T10:01:30.000Z')
        `,
        [input.completionId, cardDefinitionId],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedLegacyRewardDefinition(
  client: pg.PoolClient,
): Promise<void> {
  const definitionId = 'e6000000-0000-4000-8000-000000000001';

  await client.query(
    `insert into public.card_definitions (
       id, name, category, affinity, rarity, hp, power, description,
       is_active, authoring_status
     ) values (
       $1, 'Deletion upgrade reward', 'power', 'spark', 'rare', null, null,
       'Historical reward fixture for the account-deletion migration.',
       false, 'draft'
     )`,
    [definitionId],
  );
  await client.query(
    `insert into public.card_effects (
       card_definition_id, position, effect_type, effect_value
     ) values ($1, 1, 'heal', 10)`,
    [definitionId],
  );
  await client.query(
    `update public.card_definitions
        set authoring_status = 'published',
            is_active = true,
            updated_at = now()
      where id = $1::uuid`,
    [definitionId],
  );
}

async function seedDeclinedSharedInvitation(
  client: pg.PoolClient,
): Promise<void> {
  const definitions = await client.query<{
    id: string;
    category: 'creature' | 'power';
    affinity: string;
    rarity: string;
  }>(
    `select id, category, affinity, rarity from (
       (select id, category, affinity, rarity from public.card_definitions
         where category = 'creature' and rarity = 'common' and is_active
         order by id limit 3)
       union all
       (select id, category, affinity, rarity from public.card_definitions
         where category = 'power' and rarity = 'common' and is_active
         order by id limit 2)
     ) cards`,
  );
  if (definitions.rows.length !== 5) {
    throw new Error('Expected five seeded Common cards for PvP history.');
  }

  const snapshotId = randomUUID();
  const initialCreatureId = randomUUID();
  await client.query('begin');
  try {
    await client.query(
      `insert into public.async_pvp_invitations (
         id, challenger_player_id, recipient_player_id,
         created_at, expires_at
       ) values ($1::uuid, $2::uuid, $3::uuid,
                 now() - interval '1 hour', now() + interval '23 hours')`,
      [SHARED_INVITATION_ID, PLAYER_ID, OPPONENT_PLAYER_ID],
    );
    await client.query(
      `insert into private.async_pvp_deck_snapshots (
         id, invitation_id, player_id, participant_role,
         source_deck_id, initial_creature_card_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'challenger',
                 $4::uuid, $5::uuid)`,
      [snapshotId, SHARED_INVITATION_ID, PLAYER_ID, DECK_ID, initialCreatureId],
    );
    for (const [index, definition] of definitions.rows.entries()) {
      await client.query(
        `insert into private.async_pvp_deck_snapshot_cards (
           id, snapshot_id, position, battle_card_id,
           source_owned_card_id, source_card_definition_id,
           category, affinity, rarity, card_snapshot
         ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
                   $6::uuid, $7, $8, $9, $10::jsonb)`,
        [
          index === 0 ? initialCreatureId : randomUUID(),
          snapshotId,
          index + 1,
          randomUUID(),
          randomUUID(),
          definition.id,
          definition.category,
          definition.affinity,
          definition.rarity,
          JSON.stringify({ category: definition.category }),
        ],
      );
    }
    for (const [operation, actorId] of [
      ['invitation_create', PLAYER_ID],
      ['invitation_decline', OPPONENT_PLAYER_ID],
    ] as const) {
      await client.query(
        `insert into private.async_pvp_submission_receipts (
           actor_player_id, operation, submission_id, invitation_id,
           payload_hash, committed_response
         ) values ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::jsonb)`,
        [
          actorId,
          operation,
          randomUUID(),
          SHARED_INVITATION_ID,
          'a'.repeat(64),
          JSON.stringify({
            opponent: { playerName: 'deleted_author' },
            playerId: PLAYER_ID,
          }),
        ],
      );
    }
    await client.query(
      `update public.async_pvp_invitations
          set status = 'declined', version = version + 1,
              responded_at = now() - interval '30 minutes', updated_at = now()
        where id = $1::uuid`,
      [SHARED_INVITATION_ID],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createInterceptedClient(
  client: pg.PoolClient,
  beforeQuery: (statement: string) => Promise<void>,
): pg.PoolClient {
  return {
    query: (async (statement: string, parameters?: unknown[]) => {
      await beforeQuery(statement);
      return client.query(statement, parameters as never);
    }) as pg.PoolClient['query'],
    release: () => client.release(),
  } as pg.PoolClient;
}

async function waitForAdvisoryLockWait(
  database: Pick<pg.Pool, 'query'>,
  backendPid: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await database.query<{ waiting: boolean }>(
      `
        select exists (
          select 1
            from pg_locks
           where pid = $1
             and locktype = 'advisory'
             and not granted
        ) as waiting
      `,
      [backendPid],
    );

    if (result.rows[0]?.waiting) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Identity resolution did not wait on the deletion lock.');
}

async function seedMatches(
  client: pg.PoolClient,
  ownedCardId: string,
  cardDefinitionId: string,
): Promise<void> {
  const activeRoundId = 'd8100000-0000-4000-8000-000000000001';
  const completedRoundId = 'd8100000-0000-4000-8000-000000000002';

  await client.query(
    `
      insert into public.cpu_matches (
        id, player_id, player_deck_id, status, state,
        started_at, created_at, updated_at
      ) values (
        $1, $2, $3, 'active', '{}'::jsonb,
        '2026-08-26T10:03:00.000Z',
        '2026-08-26T10:03:00.000Z',
        '2026-08-26T10:03:00.000Z'
      )
    `,
    [ACTIVE_MATCH_ID, PLAYER_ID, DECK_ID],
  );
  await client.query(
    `
      insert into public.cpu_matches (
        id, player_id, player_deck_id, status, state, winner,
        started_at, completed_at, created_at, updated_at
      ) values (
        $1, $2, $3, 'completed', '{}'::jsonb, 'player',
        '2026-08-26T09:00:00.000Z',
        '2026-08-26T09:10:00.000Z',
        '2026-08-26T09:00:00.000Z',
        '2026-08-26T09:10:00.000Z'
      )
    `,
    [COMPLETED_MATCH_ID, PLAYER_ID, DECK_ID],
  );

  for (const matchId of [ACTIVE_MATCH_ID, COMPLETED_MATCH_ID]) {
    await client.query(
      `
        insert into public.cpu_match_cards (
          id, match_id, side, position, owned_card_id,
          card_definition_id, snapshot
        ) values (
          gen_random_uuid(), $1, 'player', 1, $2, $3, '{}'::jsonb
        )
      `,
      [matchId, ownedCardId, cardDefinitionId],
    );
  }

  await client.query(
    `
      insert into public.cpu_match_rounds (
        id, match_id, round_number, state_before, state_after, result
      ) values
        ($1, $3, 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
        ($2, $4, 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    `,
    [activeRoundId, completedRoundId, ACTIVE_MATCH_ID, COMPLETED_MATCH_ID],
  );
  await client.query(
    `
      insert into public.cpu_match_actions (
        id, match_id, round_id, sequence, side, submission_id,
        action, result, response
      ) values
        (gen_random_uuid(), $3, $1, 1, 'player', gen_random_uuid(),
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
        (gen_random_uuid(), $4, $2, 1, 'player', gen_random_uuid(),
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    `,
    [activeRoundId, completedRoundId, ACTIVE_MATCH_ID, COMPLETED_MATCH_ID],
  );
}

async function loadStarterDefinitions(
  database: Pick<pg.Pool, 'query'> | pg.PoolClient,
  limit: number,
): Promise<Array<{ id: string }>> {
  const result = await database.query<{ id: string }>(
    `
      select id::text
      from public.card_definitions
      where rarity = 'common'
        and is_active = true
        and starter_eligible = true
        and (
          (category = 'creature' and affinity = 'wit')
          or (category = 'power' and affinity is null)
        )
      order by category, id
      limit $1
    `,
    [limit],
  );

  return result.rows;
}

async function hasCuratedAuthoringLifecycle(
  client: pg.PoolClient,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'events'
         and column_name = 'authoring_status'
     )`,
  );
  return result.rows[0]?.exists ?? false;
}

function fixtureUuid(namespace: string, value: number): string {
  return `${namespace}-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function incrementNamespace(namespace: string): string {
  return (Number.parseInt(namespace, 16) + 1).toString(16).padStart(8, '0');
}
