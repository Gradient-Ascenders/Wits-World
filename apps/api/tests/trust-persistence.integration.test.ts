import { createHash, randomUUID } from 'node:crypto';
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
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import { completeLegacyAccountDeletion } from './fixtures/complete-legacy-account-deletion.js';

const MIGRATION_NAME = '0046_persist_longitudinal_trust.sql';
const POLICY_VERSION = 'trust-v1';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface PlayerFixture {
  id: string;
  issuer: string;
  subject: string;
}

interface CaseFixture {
  caseId: string;
  snapshotId: string;
  player: PlayerFixture;
}

describe.skipIf(!runIntegrationTests)(
  'longitudinal trust persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let preMigrationDirectory: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trust_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      preMigrationDirectory = await copyPreTrustMigrations();
      await runMigrations(temporaryConfig, preMigrationDirectory);
      const preMigrationPool = createDatabasePool(temporaryConfig);

      try {
        await insertPlayer(preMigrationPool, 'pre_trust_player');
      } finally {
        await preMigrationPool.end();
      }

      await copyFile(
        join(getMigrationsDirectory(), MIGRATION_NAME),
        join(preMigrationDirectory, MIGRATION_NAME),
      );

      await expect(
        runMigrations(temporaryConfig, preMigrationDirectory),
      ).resolves.toEqual({
        applied: [MIGRATION_NAME],
        skipped: expect.any(Array),
      });

      const rerun = await runMigrations(temporaryConfig, preMigrationDirectory);
      expect(rerun.applied).toEqual([]);
      expect(rerun.skipped).toContain(MIGRATION_NAME);

      await verifyCleanMigration(administrationConfig);
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

    it('keeps trust data private, seeds trust-v1, and exposes no raw sensitive-evidence columns', async () => {
      const tables = await pool.query<{ table_name: string }>(
        `select table_name
           from information_schema.tables
          where table_schema = 'private'
            and table_name like 'trust_%'
          order by table_name`,
      );
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'trust_appeal_resolutions',
        'trust_appeals',
        'trust_case_decisions',
        'trust_case_evidence',
        'trust_cases',
        'trust_decision_evidence',
        'trust_policy_versions',
        'trust_restrictions',
        'trust_score_snapshots',
        'trust_signal_adjustments',
        'trust_signals',
      ]);

      const publicTables = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from information_schema.tables
          where table_schema = 'public'
            and table_name like 'trust_%'`,
      );
      expect(publicTables.rows[0]?.count).toBe('0');

      const publicGrants = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from information_schema.table_privileges
          where table_schema = 'private'
            and table_name like 'trust_%'
            and grantee = 'PUBLIC'`,
      );
      expect(publicGrants.rows[0]?.count).toBe('0');

      const columns = await pool.query<{
        column_name: string;
        table_name: string;
      }>(
        `select table_name, column_name
           from information_schema.columns
          where table_schema = 'private'
            and table_name like 'trust_%'`,
      );
      const columnNames = columns.rows.map((row) => row.column_name);
      expect(columnNames).not.toEqual(
        expect.arrayContaining([
          'latitude',
          'longitude',
          'accuracy_metres',
          'distance_metres',
          'required_speed',
          'submitted_answer',
          'access_token',
          'auth_subject',
          'email',
          'payload',
          'metadata',
          'evidence',
        ]),
      );

      const policy = await pool.query<{ policy_version: string }>(
        `select policy_version from private.trust_policy_versions`,
      );
      expect(policy.rows).toEqual([{ policy_version: POLICY_VERSION }]);
    }, 30_000);

    it('retains immutable signals for exactly 90 days and deduplicates concurrent source evidence', async () => {
      const player = await insertPlayer(pool, 'signal_player');
      const observedAt = new Date('2026-06-01T10:00:00.000Z');
      const signalId = randomUUID();
      const digest = digestFor('movement-decision-1');

      await pool.query(
        `insert into private.trust_signals (
           id, player_id, policy_version, signal_type, severity, base_points,
           observed_at, expires_at, source_type, source_identifier,
           deduplication_digest, created_at
         ) values (
           $1::uuid, $2::uuid, $3, 'impossible_movement', 'moderate', 15,
           $4::timestamptz, $4::timestamptz, 'movement_decision',
           'movement-decision-1', $5::bytea, $4::timestamptz
         )`,
        [signalId, player.id, POLICY_VERSION, observedAt, digest],
      );

      const stored = await pool.query<{ expires_at: Date }>(
        `select expires_at from private.trust_signals where id = $1::uuid`,
        [signalId],
      );
      expect(stored.rows[0]?.expires_at).toEqual(
        new Date('2026-08-30T10:00:00.000Z'),
      );

      await expect(
        pool.query(
          `update private.trust_signals set base_points = 25 where id = $1::uuid`,
          [signalId],
        ),
      ).rejects.toThrow(/immutable/u);

      const concurrentDigest = digestFor('same-conflict');
      const insert = () =>
        pool.query(
          `insert into private.trust_signals (
             id, player_id, policy_version, signal_type, severity, base_points,
             observed_at, expires_at, source_type, source_identifier,
             deduplication_digest, created_at
           ) values (
             $1::uuid, $2::uuid, $3, 'idempotency_payload_conflict',
             'derived', 10, $4::timestamptz, $4::timestamptz,
             'mutation_conflict', 'conflict-1', $5::bytea, $4::timestamptz
           )`,
          [
            randomUUID(),
            player.id,
            POLICY_VERSION,
            observedAt,
            concurrentDigest,
          ],
        );
      const results = await Promise.allSettled([insert(), insert()]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const count = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from private.trust_signals
          where player_id = $1::uuid
            and deduplication_digest = $2::bytea`,
        [player.id, concurrentDigest],
      );
      expect(count.rows[0]?.count).toBe('1');
    }, 30_000);

    it('enforces deterministic score caps, review bands, retention, and immutability', async () => {
      const player = await insertPlayer(pool, 'score_player');
      const evaluatedAt = new Date('2026-06-15T12:00:00.000Z');
      const snapshotId = await insertSnapshot(pool, player.id, {
        evaluatedAt,
        movementPoints: 30,
        submissionPoints: 10,
        opponentPoints: 20,
      });

      const stored = await pool.query<{
        final_score: number;
        purge_after: Date;
        review_band: string;
      }>(
        `select final_score, review_band, purge_after
           from private.trust_score_snapshots
          where id = $1::uuid`,
        [snapshotId],
      );
      expect(stored.rows[0]).toEqual({
        final_score: 60,
        review_band: 'review_required',
        purge_after: new Date('2027-06-15T12:00:00.000Z'),
      });

      await expect(
        pool.query(
          `insert into private.trust_score_snapshots (
             id, player_id, policy_version, evaluated_at,
             movement_points, submission_conflict_points, opponent_pattern_points,
             final_score, review_band, source_signal_count, calculation_digest,
             purge_after, created_at
           ) values (
             $1::uuid, $2::uuid, $3, $4::timestamptz,
             51, 0, 0, 51, 'review_required', 1, $5::bytea,
             $4::timestamptz, $4::timestamptz
           )`,
          [
            randomUUID(),
            player.id,
            POLICY_VERSION,
            evaluatedAt,
            digestFor('bad-cap'),
          ],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `update private.trust_score_snapshots
              set review_band = 'urgent_review'
            where id = $1::uuid`,
          [snapshotId],
        ),
      ).rejects.toThrow(/immutable/u);
    }, 30_000);

    it('serializes active-case creation and requires every case version to have append-only audit history', async () => {
      const player = await insertPlayer(pool, 'case_player');
      const createdAt = new Date('2026-07-01T09:00:00.000Z');
      const first = await createCase(pool, player, 30, createdAt);
      const racingPlayer = await insertPlayer(pool, 'case_race_player');
      const competing = await Promise.allSettled([
        createCase(
          pool,
          racingPlayer,
          35,
          new Date('2026-07-01T09:01:00.000Z'),
        ),
        createCase(
          pool,
          racingPlayer,
          40,
          new Date('2026-07-01T09:02:00.000Z'),
        ),
      ]);
      expect(
        competing.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        competing.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const client = await pool.connect();
      try {
        await client.query('begin');
        const nextSnapshot = await insertSnapshot(client, player.id, {
          evaluatedAt: new Date('2026-07-02T09:00:00.000Z'),
          movementPoints: 25,
          submissionPoints: 10,
          opponentPoints: 10,
        });
        await client.query(
          `update private.trust_cases
              set version = 2,
                  current_score = 45,
                  current_band = 'observe',
                  latest_score_snapshot_id = $2::uuid,
                  updated_at = '2026-07-02T09:00:00.000Z'
            where id = $1::uuid`,
          [first.caseId, nextSnapshot],
        );
        await expect(client.query('commit')).rejects.toThrow(
          /matching append-only decision/u,
        );
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }

      const current = await pool.query<{ version: number }>(
        `select version from private.trust_cases where id = $1::uuid`,
        [first.caseId],
      );
      expect(current.rows[0]?.version).toBe(1);
    }, 30_000);

    it('allows only one concurrent mutation of the same expected case version', async () => {
      const player = await insertPlayer(pool, 'case_version_race_player');
      const fixture = await createCase(
        pool,
        player,
        55,
        new Date('2026-07-05T09:00:00.000Z'),
      );

      const results = await Promise.allSettled([
        transitionCase(pool, fixture.caseId, player.id, {
          actorId: null,
          actorType: 'system',
          decisionType: 'score_refresh',
          expectedVersion: 1,
          score: 60,
          status: 'under_review',
          at: new Date('2026-07-05T10:00:00.000Z'),
        }),
        transitionCase(pool, fixture.caseId, player.id, {
          actorId: null,
          actorType: 'system',
          decisionType: 'score_refresh',
          expectedVersion: 1,
          score: 65,
          status: 'under_review',
          at: new Date('2026-07-05T10:00:01.000Z'),
        }),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const persisted = await pool.query<{
        decisions: string;
        snapshots: string;
        version: number;
      }>(
        `select
           trust_case.version,
           (select count(*)::text from private.trust_case_decisions decision
             where decision.case_id = trust_case.id) as decisions,
           (select count(*)::text from private.trust_score_snapshots snapshot
             where snapshot.player_id = trust_case.player_id) as snapshots
           from private.trust_cases trust_case
          where trust_case.id = $1::uuid`,
        [fixture.caseId],
      );
      expect(persisted.rows[0]).toEqual({
        decisions: '2',
        snapshots: '2',
        version: 2,
      });
    }, 30_000);

    it('retains safe case evidence after its originating signal expires', async () => {
      const player = await insertPlayer(pool, 'evidence_player');
      const observedAt = new Date('2025-01-01T00:00:00.000Z');
      const signalId = randomUUID();
      await insertSignal(pool, {
        id: signalId,
        playerId: player.id,
        observedAt,
        sourceIdentifier: 'expired-movement-source',
      });
      const fixture = await createCase(
        pool,
        player,
        30,
        new Date('2025-01-02T00:00:00.000Z'),
      );
      await pool.query(
        `insert into private.trust_case_evidence (
           id, case_id, original_signal_id, signal_type, severity, base_points,
           observed_at, policy_version, safe_source_type, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, 'impossible_movement', 'moderate', 15,
           $4::timestamptz, $5, 'movement_decision', $6::timestamptz
         )`,
        [
          randomUUID(),
          fixture.caseId,
          signalId,
          observedAt,
          POLICY_VERSION,
          new Date('2025-01-02T00:00:00.000Z'),
        ],
      );

      await pool.query(
        `select * from private.purge_expired_trust_data($1::timestamptz)`,
        [new Date('2025-04-02T00:00:00.000Z')],
      );

      const retained = await pool.query<{
        evidence_count: string;
        signal_count: string;
      }>(
        `select
           (select count(*)::text from private.trust_signals
             where id = $1::uuid) as signal_count,
           (select count(*)::text from private.trust_case_evidence
             where original_signal_id = $1::uuid) as evidence_count`,
        [signalId],
      );
      expect(retained.rows[0]).toEqual({
        signal_count: '0',
        evidence_count: '1',
      });
    }, 30_000);

    it('rejects self-review, keeps decisions append-only, and preserves false-positive provenance', async () => {
      const player = await insertPlayer(pool, 'self_review_player', 'author');
      const reviewer = await insertPlayer(pool, 'other_reviewer', 'author');
      const fixture = await createCase(
        pool,
        player,
        55,
        new Date('2026-07-10T10:00:00.000Z'),
      );
      const signalId = randomUUID();
      const signalObservedAt = new Date('2026-07-09T10:00:00.000Z');
      await insertSignal(pool, {
        id: signalId,
        playerId: player.id,
        observedAt: signalObservedAt,
        sourceIdentifier: 'review-signal',
      });
      await pool.query(
        `insert into private.trust_case_evidence (
           id, case_id, original_signal_id, signal_type, severity, base_points,
           observed_at, policy_version, safe_source_type, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, 'impossible_movement', 'moderate', 15,
           $4::timestamptz, $5, 'movement_decision', $6::timestamptz
         )`,
        [
          randomUUID(),
          fixture.caseId,
          signalId,
          signalObservedAt,
          POLICY_VERSION,
          new Date('2026-07-10T10:00:00.000Z'),
        ],
      );

      await expect(
        transitionCase(pool, fixture.caseId, player.id, {
          actorId: player.id,
          actorType: 'author',
          decisionType: 'monitor',
          expectedVersion: 1,
          score: 55,
          status: 'under_review',
          at: new Date('2026-07-10T11:00:00.000Z'),
        }),
      ).rejects.toThrow(/own trust case/u);

      const decision = await transitionCase(pool, fixture.caseId, player.id, {
        actorId: reviewer.id,
        actorType: 'author',
        decisionType: 'signals_false_positive',
        expectedVersion: 1,
        score: 55,
        status: 'under_review',
        at: new Date('2026-07-10T12:00:00.000Z'),
      });
      await pool.query(
        `insert into private.trust_signal_adjustments (
           id, case_id, original_signal_id, decision_id, policy_version,
           adjustment_type, effective_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           'reviewed_false_positive', $6::timestamptz, $6::timestamptz
         )`,
        [
          randomUUID(),
          fixture.caseId,
          signalId,
          decision.decisionId,
          POLICY_VERSION,
          new Date('2026-07-10T12:00:00.000Z'),
        ],
      );

      await expect(
        pool.query(
          `update private.trust_case_decisions
              set reason_code = 'changed'
            where id = $1::uuid`,
          [decision.decisionId],
        ),
      ).rejects.toThrow(/append-only/u);

      const provenance = await pool.query<{
        adjustments: string;
        signals: string;
      }>(
        `select
           (select count(*)::text from private.trust_signal_adjustments
             where original_signal_id = $1::uuid) as adjustments,
           (select count(*)::text from private.trust_signals
             where id = $1::uuid) as signals`,
        [signalId],
      );
      expect(provenance.rows[0]).toEqual({ adjustments: '1', signals: '1' });
    }, 30_000);

    it('bounds restriction scopes and duration and permits one appeal resolved by a different Author', async () => {
      const player = await insertPlayer(pool, 'restricted_player');
      const reviewer = await insertPlayer(pool, 'restriction_author', 'author');
      const resolver = await insertPlayer(pool, 'appeal_author', 'author');
      const fixture = await createCase(
        pool,
        player,
        80,
        new Date('2026-07-20T10:00:00.000Z'),
      );
      const appealSignalId = randomUUID();
      const appealSignalObservedAt = new Date('2026-07-19T10:00:00.000Z');
      await insertSignal(pool, {
        id: appealSignalId,
        playerId: player.id,
        observedAt: appealSignalObservedAt,
        sourceIdentifier: 'appeal-adjustment-signal',
      });
      await pool.query(
        `insert into private.trust_case_evidence (
           id, case_id, original_signal_id, signal_type, severity, base_points,
           observed_at, policy_version, safe_source_type, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, 'impossible_movement', 'moderate', 15,
           $4::timestamptz, $5, 'movement_decision', $6::timestamptz
         )`,
        [
          randomUUID(),
          fixture.caseId,
          appealSignalId,
          appealSignalObservedAt,
          POLICY_VERSION,
          new Date('2026-07-20T10:00:00.000Z'),
        ],
      );
      const transition = await transitionCase(pool, fixture.caseId, player.id, {
        actorId: reviewer.id,
        actorType: 'author',
        decisionType: 'restriction',
        expectedVersion: 1,
        score: 80,
        status: 'under_review',
        at: new Date('2026-07-20T11:00:00.000Z'),
      });
      const restrictionId = randomUUID();
      await pool.query(
        `insert into private.trust_restrictions (
           id, case_id, player_id, decision_id, policy_version, scope,
           starts_at, original_expires_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           'new_competitive_match_hold', $6::timestamptz, $7::timestamptz,
           $6::timestamptz
         )`,
        [
          restrictionId,
          fixture.caseId,
          player.id,
          transition.decisionId,
          POLICY_VERSION,
          transition.at,
          new Date('2026-07-25T11:00:00.000Z'),
        ],
      );

      await expect(
        pool.query(
          `insert into private.trust_restrictions (
             id, case_id, player_id, decision_id, policy_version, scope,
             starts_at, original_expires_at, created_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
             'online_verification_required', $6::timestamptz, $7::timestamptz,
             $6::timestamptz
           )`,
          [
            randomUUID(),
            fixture.caseId,
            player.id,
            transition.decisionId,
            POLICY_VERSION,
            transition.at,
            new Date('2026-07-30T11:00:00.000Z'),
          ],
        ),
      ).rejects.toThrow();

      const appealId = randomUUID();
      await pool.query(
        `insert into private.trust_appeals (
           id, case_id, challenged_decision_id, player_id, policy_version,
           submitted_at, appeal_text, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           $6::timestamptz, 'Please review this restriction.', $6::timestamptz
         )`,
        [
          appealId,
          fixture.caseId,
          transition.decisionId,
          player.id,
          POLICY_VERSION,
          new Date('2026-07-21T11:00:00.000Z'),
        ],
      );

      await expect(
        pool.query(
          `insert into private.trust_appeal_resolutions (
             appeal_id, reviewer_player_id, policy_version, outcome,
             effective_expires_at, resolved_at, created_at
           ) values (
             $1::uuid, $2::uuid, $3, 'upheld', null,
             $4::timestamptz, $4::timestamptz
           )`,
          [
            appealId,
            reviewer.id,
            POLICY_VERSION,
            new Date('2026-07-22T11:00:00.000Z'),
          ],
        ),
      ).rejects.toThrow(/different Author/u);

      const appealResolvedAt = new Date('2026-07-22T11:00:00.000Z');
      await expect(
        pool.query(
          `insert into private.trust_appeal_resolutions (
             appeal_id, reviewer_player_id, policy_version, outcome,
             effective_expires_at, resolved_at, created_at
           ) values (
             $1::uuid, $2::uuid, $3, 'overturned', $4::timestamptz,
             $4::timestamptz, $4::timestamptz
           )`,
          [appealId, resolver.id, POLICY_VERSION, appealResolvedAt],
        ),
      ).resolves.toBeDefined();

      await pool.query(
        `insert into private.trust_signal_adjustments (
           id, case_id, original_signal_id, decision_id, appeal_id,
           policy_version, adjustment_type, effective_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, null, $4::uuid,
           $5, 'reviewed_false_positive', $6::timestamptz, $6::timestamptz
         )`,
        [
          randomUUID(),
          fixture.caseId,
          appealSignalId,
          appealId,
          POLICY_VERSION,
          appealResolvedAt,
        ],
      );

      const preserved = await pool.query<{
        adjustment_count: string;
        original_expires_at: Date;
      }>(
        `select restriction.original_expires_at,
                (select count(*)::text
                   from private.trust_signal_adjustments adjustment
                  where adjustment.appeal_id = $2::uuid) as adjustment_count
           from private.trust_restrictions restriction
          where restriction.id = $1::uuid`,
        [restrictionId, appealId],
      );
      expect(preserved.rows[0]).toEqual({
        adjustment_count: '1',
        original_expires_at: new Date('2026-07-25T11:00:00.000Z'),
      });

      await expect(
        pool.query(
          `insert into private.trust_appeals (
             id, case_id, challenged_decision_id, player_id, policy_version,
             submitted_at, appeal_text, created_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
             $6::timestamptz, 'Second appeal.', $6::timestamptz
           )`,
          [
            randomUUID(),
            fixture.caseId,
            transition.decisionId,
            player.id,
            POLICY_VERSION,
            new Date('2026-07-23T11:00:00.000Z'),
          ],
        ),
      ).rejects.toThrow();
    }, 30_000);

    it('deletes active and unfinished trust state while retaining finalized anonymous governance', async () => {
      const player = await insertPlayer(pool, 'delete_trust_player');
      const reviewer = await insertPlayer(
        pool,
        'delete_trust_reviewer',
        'author',
      );

      const resolvedCase = await createCase(
        pool,
        player,
        30,
        new Date('2026-07-01T10:00:00.000Z'),
        true,
      );
      const unresolvedGovernanceCase = await createCase(
        pool,
        player,
        35,
        new Date('2026-07-10T10:00:00.000Z'),
        true,
        null,
      );

      const activeCase = await createCase(
        pool,
        player,
        80,
        new Date('2026-07-30T10:00:00.000Z'),
      );
      const restrictionDecision = await transitionCase(
        pool,
        activeCase.caseId,
        player.id,
        {
          actorId: reviewer.id,
          actorType: 'author',
          decisionType: 'restriction',
          expectedVersion: 1,
          score: 80,
          status: 'under_review',
          at: new Date('2026-07-30T11:00:00.000Z'),
        },
      );
      await pool.query(
        `insert into private.trust_restrictions (
           id, case_id, player_id, decision_id, policy_version, scope,
           starts_at, original_expires_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           'new_competitive_match_hold', $6::timestamptz, $7::timestamptz,
           $6::timestamptz
         )`,
        [
          randomUUID(),
          activeCase.caseId,
          player.id,
          restrictionDecision.decisionId,
          POLICY_VERSION,
          restrictionDecision.at,
          new Date('2026-08-05T11:00:00.000Z'),
        ],
      );
      await pool.query(
        `insert into private.trust_appeals (
           id, case_id, challenged_decision_id, player_id, policy_version,
           submitted_at, appeal_text, created_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           $6::timestamptz, 'Please review before deletion.', $6::timestamptz
         )`,
        [
          randomUUID(),
          activeCase.caseId,
          restrictionDecision.decisionId,
          player.id,
          POLICY_VERSION,
          new Date('2026-07-30T12:00:00.000Z'),
        ],
      );
      await insertSignal(pool, {
        id: randomUUID(),
        playerId: player.id,
        observedAt: new Date('2026-08-01T09:00:00.000Z'),
        sourceIdentifier: 'delete-active-signal',
      });

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-02T10:00:00.000Z'),
        createId: randomUUID,
      });

      const request = await lifecycle.request({
        issuer: player.issuer,
        subject: player.subject,
      });

      const afterRequest = await pool.query<{
        active_cases: string;
        appeals: string;
        resolved_cases: string;
        restrictions: string;
        signals: string;
        unfinished_governance_cases: string;
      }>(
        `select
           (select count(*)::text from private.trust_cases
             where id = $1::uuid) as active_cases,
           (select count(*)::text from private.trust_cases
             where id = $2::uuid) as resolved_cases,
           (select count(*)::text from private.trust_cases
             where id = $3::uuid) as unfinished_governance_cases,
           (select count(*)::text from private.trust_signals
             where player_id = $4::uuid) as signals,
           (select count(*)::text from private.trust_restrictions
             where player_id = $4::uuid) as restrictions,
           (select count(*)::text from private.trust_appeals
             where player_id = $4::uuid) as appeals`,
        [
          activeCase.caseId,
          resolvedCase.caseId,
          unresolvedGovernanceCase.caseId,
          player.id,
        ],
      );
      expect(afterRequest.rows[0]).toEqual({
        active_cases: '0',
        appeals: '0',
        resolved_cases: '1',
        restrictions: '0',
        signals: '0',
        unfinished_governance_cases: '0',
      });

      await expect(
        pool.query(
          `delete from private.trust_cases
            where id = $1::uuid`,
          [resolvedCase.caseId],
        ),
      ).rejects.toThrow(/account-deletion or retention cleanup/u);
      await expect(
        pool.query(
          `delete from private.trust_case_decisions
            where case_id = $1::uuid`,
          [resolvedCase.caseId],
        ),
      ).rejects.toThrow(/eligible case/u);

      await expect(
        insertSignal(pool, {
          id: randomUUID(),
          playerId: player.id,
          observedAt: new Date('2026-08-02T10:00:01.000Z'),
          sourceIdentifier: 'post-deletion-signal',
        }),
      ).rejects.toThrow(/active player/u);

      await completeLegacyAccountDeletion(pool, player.id, request.id);
      const tombstone = await pool.query<{
        auth_subject: string | null;
        lifecycle_status: string;
        player_name: string | null;
      }>(
        `select auth_subject, lifecycle_status, player_name
           from public.players
          where id = $1::uuid`,
        [player.id],
      );
      expect(tombstone.rows[0]).toEqual({
        auth_subject: null,
        lifecycle_status: 'deleted',
        player_name: null,
      });

      const rejoined = await insertPlayerWithIdentity(
        pool,
        'rejoined_trust_player',
        player.issuer,
        player.subject,
      );
      expect(rejoined.id).not.toBe(player.id);
      const inherited = await pool.query<{ count: string }>(
        `select (
           (select count(*) from private.trust_signals where player_id = $1::uuid)
           + (select count(*) from private.trust_score_snapshots where player_id = $1::uuid)
           + (select count(*) from private.trust_cases where player_id = $1::uuid)
           + (select count(*) from private.trust_restrictions where player_id = $1::uuid)
         )::text as count`,
        [rejoined.id],
      );
      expect(inherited.rows[0]?.count).toBe('0');
    }, 30_000);

    it('allows one audited governance-finalization mutation after case resolution', async () => {
      const player = await insertPlayer(pool, 'governance_finalization_player');
      const resolvedAt = new Date('2026-08-10T10:01:00.000Z');
      const fixture = await createCase(
        pool,
        player,
        55,
        new Date('2026-08-10T10:00:00.000Z'),
        true,
        null,
      );

      const before = await pool.query<{
        governance_finalized_at: Date | null;
        status: string;
        version: number;
      }>(
        `select status, version, governance_finalized_at
           from private.trust_cases
          where id = $1::uuid`,
        [fixture.caseId],
      );
      expect(before.rows[0]).toMatchObject({
        governance_finalized_at: null,
        status: 'resolved',
        version: 2,
      });

      const finalizedAt = new Date('2026-08-20T10:00:00.000Z');
      await finalizeGovernance(pool, fixture.caseId, 2, finalizedAt);

      const after = await pool.query<{
        governance_finalized_at: Date;
        purge_after: Date;
        resolved_at: Date;
        status: string;
        version: number;
      }>(
        `select status, version, resolved_at, governance_finalized_at, purge_after
           from private.trust_cases
          where id = $1::uuid`,
        [fixture.caseId],
      );
      expect(after.rows[0]).toEqual({
        governance_finalized_at: finalizedAt,
        purge_after: new Date('2027-08-20T10:00:00.000Z'),
        resolved_at: resolvedAt,
        status: 'resolved',
        version: 3,
      });

      await expect(
        finalizeGovernance(
          pool,
          fixture.caseId,
          3,
          new Date('2026-08-21T10:00:00.000Z'),
        ),
      ).rejects.toThrow(/one governance-finalization mutation/u);
    }, 30_000);

    it('purges expired snapshots and finalized governance idempotently', async () => {
      const player = await insertPlayer(pool, 'retention_player');
      const fixture = await createCase(
        pool,
        player,
        30,
        new Date('2024-01-01T00:00:00.000Z'),
        true,
        null,
      );
      await finalizeGovernance(
        pool,
        fixture.caseId,
        2,
        new Date('2024-01-10T00:00:00.000Z'),
      );

      const first = await pool.query<{
        case_rows_deleted: number;
        signal_rows_deleted: number;
        snapshot_rows_deleted: number;
      }>(`select * from private.purge_expired_trust_data($1::timestamptz)`, [
        new Date('2025-02-01T00:00:00.000Z'),
      ]);
      expect(first.rows[0]).toMatchObject({
        case_rows_deleted: 1,
      });

      const remaining = await pool.query<{
        cases: string;
        decisions: string;
      }>(
        `select
           (select count(*)::text from private.trust_cases where id = $1::uuid) as cases,
           (select count(*)::text from private.trust_case_decisions where case_id = $1::uuid) as decisions`,
        [fixture.caseId],
      );
      expect(remaining.rows[0]).toEqual({ cases: '0', decisions: '0' });

      await expect(
        pool.query(
          `select * from private.purge_expired_trust_data($1::timestamptz)`,
          [new Date('2999-01-01T00:00:00.000Z')],
        ),
      ).rejects.toThrow(/cannot purge future data/u);

      const retry = await pool.query<{
        case_rows_deleted: number;
        signal_rows_deleted: number;
        snapshot_rows_deleted: number;
      }>(`select * from private.purge_expired_trust_data($1::timestamptz)`, [
        new Date('2025-02-01T00:00:00.000Z'),
      ]);
      expect(retry.rows[0]).toEqual({
        case_rows_deleted: 0,
        signal_rows_deleted: 0,
        snapshot_rows_deleted: 0,
      });
    }, 30_000);
  },
);

async function verifyCleanMigration(
  administrationConfig: DatabaseConfig,
): Promise<void> {
  const databaseName = `wits_quest_trust_clean_${Date.now()}_${process.pid}`;
  await withDatabaseClient(administrationConfig, async (client) => {
    await client.query(`create database ${databaseName}`);
  });

  const databaseUrl = new URL(administrationConfig.connectionString);
  databaseUrl.pathname = `/${databaseName}`;
  const databaseConfig = {
    ...administrationConfig,
    connectionString: databaseUrl.toString(),
  };

  try {
    const firstRun = await runMigrations(databaseConfig);
    expect(firstRun.applied).toContain(MIGRATION_NAME);
    const secondRun = await runMigrations(databaseConfig);
    expect(secondRun.applied).toEqual([]);
    expect(secondRun.skipped).toContain(MIGRATION_NAME);
  } finally {
    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${databaseName} with (force)`,
      );
    });
  }
}

async function copyPreTrustMigrations(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(
    join(tmpdir(), 'wits-trust-migrations-'),
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

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  label: string,
  role: 'player' | 'author' = 'player',
): Promise<PlayerFixture> {
  return insertPlayerWithIdentity(
    database,
    label,
    'https://issuer.example/',
    `auth0|${label}-${randomUUID()}`,
    role,
  );
}

async function insertPlayerWithIdentity(
  database: Pick<pg.Pool, 'query'>,
  label: string,
  issuer: string,
  subject: string,
  role: 'player' | 'author' = 'player',
): Promise<PlayerFixture> {
  const id = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values ($1::uuid, $2, $3, $4, $5)`,
    [id, issuer, subject, `${label.slice(0, 10)}_${id.slice(0, 5)}`, role],
  );
  return { id, issuer, subject };
}

function digestFor(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

async function insertSignal(
  database: Pick<pg.Pool, 'query'>,
  input: {
    id: string;
    playerId: string;
    observedAt: Date;
    sourceIdentifier: string;
  },
): Promise<void> {
  await database.query(
    `insert into private.trust_signals (
       id, player_id, policy_version, signal_type, severity, base_points,
       observed_at, expires_at, source_type, source_identifier,
       deduplication_digest, created_at
     ) values (
       $1::uuid, $2::uuid, $3, 'impossible_movement', 'moderate', 15,
       $4::timestamptz, $4::timestamptz, 'movement_decision', $5,
       $6::bytea, $4::timestamptz
     )`,
    [
      input.id,
      input.playerId,
      POLICY_VERSION,
      input.observedAt,
      input.sourceIdentifier,
      digestFor(input.sourceIdentifier),
    ],
  );
}

async function insertSnapshot(
  database: Pick<pg.Pool | pg.PoolClient, 'query'>,
  playerId: string,
  input: {
    evaluatedAt: Date;
    movementPoints: number;
    submissionPoints: number;
    opponentPoints: number;
  },
): Promise<string> {
  const id = randomUUID();
  const total = Math.min(
    100,
    input.movementPoints + input.submissionPoints + input.opponentPoints,
  );
  const band =
    total >= 75
      ? 'urgent_review'
      : total >= 50
        ? 'review_required'
        : total >= 25
          ? 'observe'
          : 'normal';
  await database.query(
    `insert into private.trust_score_snapshots (
       id, player_id, policy_version, evaluated_at,
       movement_points, submission_conflict_points, opponent_pattern_points,
       final_score, review_band, source_signal_count, calculation_digest,
       purge_after, created_at
     ) values (
       $1::uuid, $2::uuid, $3, $4::timestamptz,
       $5, $6, $7, $8, $9, 1, $10::bytea,
       $4::timestamptz, $4::timestamptz
     )`,
    [
      id,
      playerId,
      POLICY_VERSION,
      input.evaluatedAt,
      input.movementPoints,
      input.submissionPoints,
      input.opponentPoints,
      total,
      band,
      digestFor(`${playerId}-${input.evaluatedAt.toISOString()}-${total}`),
    ],
  );
  return id;
}

async function createCase(
  database: Pick<pg.Pool, 'connect'>,
  player: PlayerFixture,
  score: number,
  at: Date,
  resolved = false,
  governanceFinalizedAt?: Date | null,
): Promise<CaseFixture> {
  const client = await database.connect();
  const caseId = randomUUID();
  let snapshotId: string;
  try {
    await client.query('begin');
    snapshotId = await insertSnapshot(client, player.id, {
      evaluatedAt: at,
      movementPoints: Math.min(score, 50),
      submissionPoints: Math.min(Math.max(score - 50, 0), 30),
      opponentPoints: Math.min(Math.max(score - 80, 0), 20),
    });
    const band =
      score >= 75
        ? 'urgent_review'
        : score >= 50
          ? 'review_required'
          : score >= 25
            ? 'observe'
            : 'normal';
    await client.query(
      `insert into private.trust_cases (
         id, player_id, policy_version, status, version, current_score,
         current_band, latest_score_snapshot_id, opened_at, updated_at,
         resolved_at, resolution_reason, governance_finalized_at, purge_after
       ) values (
         $1::uuid, $2::uuid, $3, 'open', 1, $4, $5, $6::uuid,
         $7::timestamptz, $7::timestamptz, null, null, null, null
       )`,
      [caseId, player.id, POLICY_VERSION, score, band, snapshotId, at],
    );
    await client.query(
      `insert into private.trust_case_decisions (
         id, case_id, actor_type, actor_player_id, policy_version,
         case_version_before, case_version_after, decision_type,
         previous_status, resulting_status, reason_code,
         resulting_score_snapshot_id, created_at
       ) values (
         $1::uuid, $2::uuid, 'system', null, $3,
         0, 1, 'case_opened', null, 'open', 'score_band_crossed',
         $4::uuid, $5::timestamptz
       )`,
      [randomUUID(), caseId, POLICY_VERSION, snapshotId, at],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  if (resolved) {
    const resolvedAt = new Date(at.getTime() + 60_000);
    await transitionCase(database, caseId, player.id, {
      actorId: null,
      actorType: 'system',
      decisionType: 'case_resolved',
      expectedVersion: 1,
      score,
      status: 'resolved',
      at: resolvedAt,
      governanceFinalizedAt:
        governanceFinalizedAt === undefined
          ? resolvedAt
          : governanceFinalizedAt,
    });
  }

  return { caseId, snapshotId, player };
}

async function transitionCase(
  database: Pick<pg.Pool, 'connect'>,
  caseId: string,
  playerId: string,
  input: {
    actorId: string | null;
    actorType: 'author' | 'system';
    decisionType: string;
    expectedVersion: number;
    score: number;
    status: 'open' | 'under_review' | 'resolved';
    at: Date;
    governanceFinalizedAt?: Date | null;
  },
): Promise<{ at: Date; decisionId: string }> {
  const client = await database.connect();
  const decisionId = randomUUID();
  try {
    await client.query('begin');
    const current = await client.query<{
      status: 'open' | 'under_review' | 'resolved';
    }>(
      `select status
         from private.trust_cases
        where id = $1::uuid and version = $2
        for update`,
      [caseId, input.expectedVersion],
    );
    if (!current.rows[0]) throw new Error('Trust case version is stale.');

    const snapshotId = await insertSnapshot(client, playerId, {
      evaluatedAt: input.at,
      movementPoints: Math.min(input.score, 50),
      submissionPoints: Math.min(Math.max(input.score - 50, 0), 30),
      opponentPoints: Math.min(Math.max(input.score - 80, 0), 20),
    });
    const band =
      input.score >= 75
        ? 'urgent_review'
        : input.score >= 50
          ? 'review_required'
          : input.score >= 25
            ? 'observe'
            : 'normal';
    await client.query(
      `update private.trust_cases
          set status = $3,
              version = $2 + 1,
              current_score = $4,
              current_band = $5,
              latest_score_snapshot_id = $6::uuid,
              updated_at = $7::timestamptz,
              resolved_at = case when $3 = 'resolved' then $7::timestamptz else null end,
              resolution_reason = case when $3 = 'resolved' then 'review_complete' else null end,
              governance_finalized_at = $8::timestamptz
        where id = $1::uuid and version = $2`,
      [
        caseId,
        input.expectedVersion,
        input.status,
        input.score,
        band,
        snapshotId,
        input.at,
        input.governanceFinalizedAt ?? null,
      ],
    );
    await client.query(
      `insert into private.trust_case_decisions (
         id, case_id, actor_type, actor_player_id, policy_version,
         case_version_before, case_version_after, decision_type,
         previous_status, resulting_status, reason_code,
         resulting_score_snapshot_id, created_at
       ) values (
         $1::uuid, $2::uuid, $3, $4::uuid, $5,
         $6, $7, $8, $9, $10, 'review_action', $11::uuid, $12::timestamptz
       )`,
      [
        decisionId,
        caseId,
        input.actorType,
        input.actorId,
        POLICY_VERSION,
        input.expectedVersion,
        input.expectedVersion + 1,
        input.decisionType,
        current.rows[0].status,
        input.status,
        snapshotId,
        input.at,
      ],
    );
    await client.query('commit');
    return { at: input.at, decisionId };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeGovernance(
  database: Pick<pg.Pool, 'connect'>,
  caseId: string,
  expectedVersion: number,
  finalizedAt: Date,
): Promise<void> {
  const client = await database.connect();
  const decisionId = randomUUID();
  try {
    await client.query('begin');
    const current = await client.query<{
      latest_score_snapshot_id: string;
      status: string;
    }>(
      `select status, latest_score_snapshot_id
         from private.trust_cases
        where id = $1::uuid and version = $2
        for update`,
      [caseId, expectedVersion],
    );
    if (!current.rows[0]) throw new Error('Trust case version is stale.');

    await client.query(
      `update private.trust_cases
          set version = $2 + 1,
              updated_at = $3::timestamptz,
              governance_finalized_at = $3::timestamptz
        where id = $1::uuid and version = $2`,
      [caseId, expectedVersion, finalizedAt],
    );
    await client.query(
      `insert into private.trust_case_decisions (
         id, case_id, actor_type, actor_player_id, policy_version,
         case_version_before, case_version_after, decision_type,
         previous_status, resulting_status, reason_code,
         resulting_score_snapshot_id, created_at
       ) values (
         $1::uuid, $2::uuid, 'system', null, $3,
         $4, $5, 'governance_finalized', 'resolved', 'resolved',
         'appeal_lifecycle_complete', $6::uuid, $7::timestamptz
       )`,
      [
        decisionId,
        caseId,
        POLICY_VERSION,
        expectedVersion,
        expectedVersion + 1,
        current.rows[0].latest_score_snapshot_id,
        finalizedAt,
      ],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
