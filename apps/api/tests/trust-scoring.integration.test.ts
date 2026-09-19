import { createHash, randomUUID } from 'node:crypto';

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
import {
  createTrustRestrictionService,
  TrustActivityRestrictedError,
} from '../src/trust/trust-restrictions.js';
import { createTrustService } from '../src/trust/trust-service.js';

const POLICY_VERSION = 'trust-v1';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'trust scoring and enforcement integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trust_scoring_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      await runMigrations(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('applies the forward-only trust governance hardening from migration 0048', async () => {
      const column = await pool.query<{ is_nullable: string }>(
        `select is_nullable
         from information_schema.columns
        where table_schema = 'private'
          and table_name = 'trust_case_decisions'
          and column_name = 'resulting_score_snapshot_id'`,
      );
      expect(column.rows).toEqual([{ is_nullable: 'NO' }]);

      const offlineDigest = await pool.query<{
        data_type: string;
        is_nullable: string;
      }>(
        `select data_type, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'challenge_attempts'
          and column_name = 'offline_submission_digest'`,
      );
      expect(offlineDigest.rows).toEqual([
        { data_type: 'bytea', is_nullable: 'YES' },
      ]);

      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
         from pg_indexes
        where schemaname = 'private'
          and indexname in (
            'trust_appeal_resolutions_reviewer_idx',
            'trust_signal_adjustments_original_effective_idx'
          )
        order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        'trust_appeal_resolutions_reviewer_idx',
        'trust_signal_adjustments_original_effective_idx',
      ]);

      const comments = await pool.query<{
        table_name: string;
        comment: string | null;
      }>(
        `select table_name,
              obj_description(format('private.%I', table_name)::regclass) as comment
         from information_schema.tables
        where table_schema = 'private'
          and table_name in (
            'trust_policy_versions',
            'trust_decision_evidence',
            'trust_signal_adjustments',
            'trust_appeal_resolutions'
          )
        order by table_name`,
      );
      expect(comments.rows).toHaveLength(4);
      for (const row of comments.rows) {
        expect(row.comment).toEqual(expect.any(String));
        expect(row.comment?.length).toBeGreaterThan(20);
      }
    }, 30_000);

    it('deduplicates signals, derives the 24-hour conflict pattern, caps scoring, and never auto-restricts', async () => {
      const player = await insertPlayer(pool, 'trust_score');
      const service = createTrustService(pool);
      const observedAt = new Date(Date.now() - 2_000);
      const movementInput = {
        playerId: player.id,
        signalType: 'impossible_movement' as const,
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'movement-score-1',
        deduplicationKey: 'movement-score-1',
      };

      const concurrent = await Promise.all([
        service.recordSignal(movementInput),
        service.recordSignal(movementInput),
      ]);
      expect(concurrent.sort()).toEqual([false, true]);

      await service.recordSignal({
        ...movementInput,
        sourceIdentifier: 'movement-score-2',
        deduplicationKey: 'movement-score-2',
      });

      for (let index = 0; index < 3; index += 1) {
        await service.recordSubmissionConflict({
          playerId: player.id,
          operation: 'test_mutation',
          resourceIdentifier: `resource-${index}`,
          submissionId: randomUUID(),
        });
      }

      await service.recordSignal({
        playerId: player.id,
        signalType: 'opponent_concentration',
        severity: 'pattern',
        basePoints: 20,
        observedAt,
        sourceType: 'pvp_pattern',
        sourceIdentifier: 'opponent-pattern-1',
        deduplicationKey: 'opponent-pattern-1',
      });
      await service.recordSignal({
        playerId: player.id,
        signalType: 'one_sided_outcome_pattern',
        severity: 'pattern',
        basePoints: 10,
        observedAt,
        sourceType: 'pvp_pattern',
        sourceIdentifier: 'one-sided-pattern-1',
        deduplicationKey: 'one-sided-pattern-1',
      });

      const signals = await pool.query<{ signal_type: string; count: number }>(
        `select signal_type, count(*)::integer as count
         from private.trust_signals
        where player_id = $1::uuid
        group by signal_type
        order by signal_type`,
        [player.id],
      );
      expect(signals.rows).toEqual([
        { signal_type: 'idempotency_payload_conflict', count: 3 },
        { signal_type: 'impossible_movement', count: 2 },
        { signal_type: 'one_sided_outcome_pattern', count: 1 },
        { signal_type: 'opponent_concentration', count: 1 },
        { signal_type: 'submission_conflict_pattern', count: 1 },
      ]);

      const latest = await pool.query<{
        movement_points: number;
        submission_conflict_points: number;
        opponent_pattern_points: number;
        final_score: number;
        review_band: string;
      }>(
        `select movement_points, submission_conflict_points,
              opponent_pattern_points, final_score, review_band
         from private.trust_score_snapshots
        where player_id = $1::uuid
        order by evaluated_at desc, id desc
        limit 1`,
        [player.id],
      );
      expect(latest.rows[0]).toMatchObject({
        submission_conflict_points: 30,
        final_score: 100,
        review_band: 'urgent_review',
      });
      expect(latest.rows[0]!.movement_points).toBeGreaterThanOrEqual(48);
      expect(latest.rows[0]!.opponent_pattern_points).toBeGreaterThanOrEqual(
        28,
      );

      const trustCase = await pool.query<{
        status: string;
        current_band: string;
      }>(
        `select status, current_band
         from private.trust_cases
        where player_id = $1::uuid
          and status in ('open', 'under_review')`,
        [player.id],
      );
      expect(trustCase.rows).toEqual([
        { status: 'open', current_band: 'urgent_review' },
      ]);

      const restrictions = await pool.query<{ count: number }>(
        `select count(*)::integer as count
         from private.trust_restrictions
        where player_id = $1::uuid`,
        [player.id],
      );
      expect(restrictions.rows[0]?.count).toBe(0);
    }, 60_000);

    it('links decision evidence safely and enforces only a human-authored active restriction', async () => {
      const player = await insertPlayer(pool, 'restriction_player');
      const author = await insertPlayer(pool, 'restriction_author', 'author');
      const otherPlayer = await insertPlayer(pool, 'other_case_player');
      const service = createTrustService(pool);
      const observedAt = new Date(Date.now() - 2_000);

      await service.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'restriction-movement-1',
        deduplicationKey: 'restriction-movement-1',
      });
      await service.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'restriction-movement-2',
        deduplicationKey: 'restriction-movement-2',
      });
      await service.recordSignal({
        playerId: otherPlayer.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'other-movement-1',
        deduplicationKey: 'other-movement-1',
      });
      await service.recordSignal({
        playerId: otherPlayer.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'other-movement-2',
        deduplicationKey: 'other-movement-2',
      });

      const caseRow = await loadCaseAuditFixture(pool, player.id);
      const otherCase = await loadCaseAuditFixture(pool, otherPlayer.id);

      await expect(
        pool.query(
          `insert into private.trust_decision_evidence (decision_id, case_evidence_id)
         values ($1::uuid, $2::uuid)`,
          [caseRow.decisionId, caseRow.evidenceId],
        ),
      ).resolves.toBeDefined();

      await expect(
        pool.query(
          `insert into private.trust_decision_evidence (decision_id, case_evidence_id)
         values ($1::uuid, $2::uuid)`,
          [caseRow.decisionId, otherCase.evidenceId],
        ),
      ).rejects.toThrow(/same case/u);

      const restrictionId = randomUUID();
      const decisionId = randomUUID();
      const client = await pool.connect();
      try {
        await client.query('begin');
        const nowResult = await client.query<{ now: Date }>(
          `select clock_timestamp() as now`,
        );
        const now = nowResult.rows[0]!.now;
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        await client.query(
          `update private.trust_cases
            set status = 'under_review',
                version = version + 1,
                updated_at = $2::timestamptz
          where id = $1::uuid`,
          [caseRow.caseId, now],
        );
        await client.query(
          `insert into private.trust_case_decisions (
           id, case_id, actor_type, actor_player_id, policy_version,
           case_version_before, case_version_after, decision_type,
           previous_status, resulting_status, reason_code,
           resulting_score_snapshot_id, created_at
         ) values (
           $1::uuid, $2::uuid, 'author', $3::uuid, $4,
           1, 2, 'restriction_applied', 'open', 'under_review',
           'activity_review', $5::uuid, $6::timestamptz
         )`,
          [
            decisionId,
            caseRow.caseId,
            author.id,
            POLICY_VERSION,
            caseRow.snapshotId,
            now,
          ],
        );
        await client.query(
          `insert into private.trust_restrictions (
           id, case_id, player_id, decision_id, policy_version,
           scope, starts_at, original_expires_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
           'new_competitive_match_hold', $6::timestamptz, $7::timestamptz
         )`,
          [
            restrictionId,
            caseRow.caseId,
            player.id,
            decisionId,
            POLICY_VERSION,
            now,
            expiresAt,
          ],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }

      const restrictions = createTrustRestrictionService(pool);
      await expect(
        restrictions.assertAllowed(player.id, 'new_competitive_match_hold'),
      ).rejects.toBeInstanceOf(TrustActivityRestrictedError);
      await expect(
        restrictions.assertAllowed(player.id, 'location_reward_challenge_hold'),
      ).resolves.toBeUndefined();
    }, 60_000);

    it('preserves a human-resolved case and opens a new case only for later evidence', async () => {
      const player = await insertPlayer(pool, 'resolved_player');
      const author = await insertPlayer(pool, 'resolved_author', 'author');
      const service = createTrustService(pool);
      const observedAt = new Date(Date.now() - 2_000);

      await service.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'resolved-case-first-1',
        deduplicationKey: 'resolved-case-first-1',
      });
      await service.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'resolved-case-first-2',
        deduplicationKey: 'resolved-case-first-2',
      });

      const firstCase = await loadCaseAuditFixture(pool, player.id);
      const resolvedAt = await resolveCaseAsAuthor(
        pool,
        firstCase,
        author.id,
        'review_dismissed',
      );

      await service.evaluatePlayer(player.id);
      let cases = await pool.query<{ status: string; count: number }>(
        `select status, count(*)::integer as count
         from private.trust_cases
        where player_id = $1::uuid
        group by status
        order by status`,
        [player.id],
      );
      expect(cases.rows).toEqual([{ status: 'resolved', count: 1 }]);

      const retainedHistory = await pool.query<{
        actor_type: string;
        decision_type: string;
        resulting_status: string;
      }>(
        `select actor_type, decision_type, resulting_status
         from private.trust_case_decisions
        where case_id = $1::uuid
        order by case_version_after`,
        [firstCase.caseId],
      );
      expect(retainedHistory.rows).toEqual([
        {
          actor_type: 'system',
          decision_type: 'case_opened',
          resulting_status: 'open',
        },
        {
          actor_type: 'author',
          decision_type: 'case_resolved',
          resulting_status: 'resolved',
        },
      ]);

      const laterTime = await pool.query<{ now: Date }>(
        `select clock_timestamp() as now`,
      );
      expect(laterTime.rows[0]!.now.getTime()).toBeGreaterThanOrEqual(
        resolvedAt.getTime(),
      );
      await service.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt: laterTime.rows[0]!.now,
        sourceType: 'movement_decision',
        sourceIdentifier: 'resolved-case-later',
        deduplicationKey: 'resolved-case-later',
      });

      cases = await pool.query<{ status: string; count: number }>(
        `select status, count(*)::integer as count
         from private.trust_cases
        where player_id = $1::uuid
        group by status
        order by status`,
        [player.id],
      );
      expect(cases.rows).toEqual([
        { status: 'open', count: 1 },
        { status: 'resolved', count: 1 },
      ]);
    }, 60_000);

    it('resolves an open case only after seven continuous days below observe', async () => {
      const player = await insertPlayer(pool, 'decay_player');
      const service = createTrustService(pool);
      const observedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      await insertTrustSignal(pool, {
        playerId: player.id,
        observedAt,
        sourceIdentifier: 'historical-strong-movement',
        severity: 'strong',
        basePoints: 25,
      });

      await evaluateAt(pool, service, player.id, observedAt);
      const belowAt = new Date(observedAt.getTime() + 45 * 24 * 60 * 60 * 1000);
      await evaluateAt(pool, service, player.id, belowAt);

      const sixDaysLater = new Date(
        belowAt.getTime() + 6 * 24 * 60 * 60 * 1000,
      );
      await evaluateAt(pool, service, player.id, sixDaysLater);
      let state = await pool.query<{
        status: string;
        resolution_reason: string | null;
      }>(
        `select status, resolution_reason
         from private.trust_cases
        where player_id = $1::uuid
        order by opened_at desc
        limit 1`,
        [player.id],
      );
      expect(state.rows[0]).toEqual({
        status: 'open',
        resolution_reason: null,
      });

      const eightDaysLater = new Date(
        belowAt.getTime() + 8 * 24 * 60 * 60 * 1000,
      );
      await evaluateAt(pool, service, player.id, eightDaysLater);
      state = await pool.query<{
        status: string;
        resolution_reason: string | null;
      }>(
        `select status, resolution_reason
         from private.trust_cases
        where player_id = $1::uuid
        order by opened_at desc
        limit 1`,
        [player.id],
      );
      expect(state.rows[0]).toEqual({
        status: 'resolved',
        resolution_reason: 'decayed',
      });
    }, 60_000);

    it('derives reciprocal repeated-opponent signals from completed PvP without double counting', async () => {
      const first = await insertPlayer(pool, 'pair_first');
      const second = await insertPlayer(pool, 'pair_second');
      const service = createTrustService(pool);
      const base = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const client = await pool.connect();

      try {
        await client.query('begin');
        const matchIds: string[] = [];
        for (let index = 0; index < 6; index += 1) {
          const completedAt = new Date(
            base.getTime() + index * 24 * 60 * 60 * 1000,
          );
          matchIds.push(
            await insertRollbackOnlyCompletedLiveMatch(client, {
              firstPlayerId: first.id,
              secondPlayerId: second.id,
              winnerPlayerId: first.id,
              completedAt,
              completionReason: index < 4 ? 'abandonment_forfeit' : 'defeat',
            }),
          );
        }

        // The rollback-only fixture intentionally contains only the public match
        // rows consumed by trust-v1. Live PvP's full deferred persistence graph
        // is independently validated by live-pvp-persistence.integration.test.ts.
        const latestMatchId = matchIds[matchIds.length - 1]!;
        await service.evaluateOpponentPatternsForMatchWithinTransaction(
          client,
          latestMatchId,
        );
        await service.evaluateOpponentPatternsForMatchWithinTransaction(
          client,
          latestMatchId,
        );

        const signals = await client.query<{
          player_id: string;
          signal_type: string;
          count: number;
        }>(
          `select player_id::text, signal_type, count(*)::integer as count
           from private.trust_signals
          where player_id = any($1::uuid[])
            and signal_type in ('opponent_concentration', 'one_sided_outcome_pattern')
          group by player_id, signal_type
          order by player_id, signal_type`,
          [[first.id, second.id]],
        );
        expect(signals.rows).toHaveLength(4);
        expect(signals.rows.every((row) => row.count === 1)).toBe(true);
        expect(new Set(signals.rows.map((row) => row.player_id))).toEqual(
          new Set([first.id, second.id]),
        );
        expect(new Set(signals.rows.map((row) => row.signal_type))).toEqual(
          new Set(['opponent_concentration', 'one_sided_outcome_pattern']),
        );
      } finally {
        await client.query('rollback');
        client.release();
      }
    }, 60_000);
  },
);

interface PlayerFixture {
  id: string;
}

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  label: string,
  role: 'player' | 'author' = 'player',
): Promise<PlayerFixture> {
  const id = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values ($1::uuid, 'https://issuer.example/', $2, $3, $4)`,
    [
      id,
      `auth0|${label}-${id}`,
      `${label.slice(0, 10)}_${id.slice(0, 5)}`,
      role,
    ],
  );
  return { id };
}

async function loadCaseAuditFixture(
  database: Pick<pg.Pool, 'query'>,
  playerId: string,
): Promise<{
  caseId: string;
  snapshotId: string;
  decisionId: string;
  evidenceId: string;
}> {
  const result = await database.query<{
    case_id: string;
    snapshot_id: string;
    decision_id: string;
    evidence_id: string;
  }>(
    `select trust_case.id::text as case_id,
            trust_case.latest_score_snapshot_id::text as snapshot_id,
            decision.id::text as decision_id,
            evidence.id::text as evidence_id
       from private.trust_cases trust_case
       join private.trust_case_decisions decision
         on decision.case_id = trust_case.id
        and decision.case_version_after = 1
       join private.trust_case_evidence evidence
         on evidence.case_id = trust_case.id
      where trust_case.player_id = $1::uuid
        and trust_case.status = 'open'
      limit 1`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Expected an open trust case audit fixture.');
  return {
    caseId: row.case_id,
    snapshotId: row.snapshot_id,
    decisionId: row.decision_id,
    evidenceId: row.evidence_id,
  };
}

async function resolveCaseAsAuthor(
  database: Pick<pg.Pool, 'connect'>,
  fixture: { caseId: string; snapshotId: string },
  authorId: string,
  reasonCode: string,
): Promise<Date> {
  const client = await database.connect();
  try {
    await client.query('begin');
    const time = await client.query<{ now: Date }>(
      `select clock_timestamp() as now`,
    );
    const resolvedAt = time.rows[0]!.now;
    const decisionId = randomUUID();
    await client.query(
      `update private.trust_cases
          set status = 'resolved',
              version = version + 1,
              updated_at = $2::timestamptz,
              resolved_at = $2::timestamptz,
              resolution_reason = $3
        where id = $1::uuid`,
      [fixture.caseId, resolvedAt, reasonCode],
    );
    await client.query(
      `insert into private.trust_case_decisions (
         id, case_id, actor_type, actor_player_id, policy_version,
         case_version_before, case_version_after, decision_type,
         previous_status, resulting_status, reason_code,
         resulting_score_snapshot_id, created_at
       ) values (
         $1::uuid, $2::uuid, 'author', $3::uuid, $4,
         1, 2, 'case_resolved', 'open', 'resolved', $5,
         $6::uuid, $7::timestamptz
       )`,
      [
        decisionId,
        fixture.caseId,
        authorId,
        POLICY_VERSION,
        reasonCode,
        fixture.snapshotId,
        resolvedAt,
      ],
    );
    await client.query('commit');
    return resolvedAt;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function insertTrustSignal(
  database: Pick<pg.Pool, 'query'>,
  input: {
    playerId: string;
    observedAt: Date;
    sourceIdentifier: string;
    severity: 'moderate' | 'strong';
    basePoints: 15 | 25;
  },
): Promise<void> {
  await database.query(
    `insert into private.trust_signals (
       id, player_id, policy_version, signal_type, severity, base_points,
       observed_at, expires_at, source_type, source_identifier,
       deduplication_digest
     ) values (
       $1::uuid, $2::uuid, $3, 'impossible_movement', $4, $5,
       $6::timestamptz, $6::timestamptz + interval '90 days', 'movement_decision', $7, $8::bytea
     )`,
    [
      randomUUID(),
      input.playerId,
      POLICY_VERSION,
      input.severity,
      input.basePoints,
      input.observedAt,
      input.sourceIdentifier,
      createHash('sha256').update(input.sourceIdentifier).digest(),
    ],
  );
}

async function evaluateAt(
  database: Pick<pg.Pool, 'connect'>,
  service: ReturnType<typeof createTrustService>,
  playerId: string,
  evaluatedAt: Date,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query('begin');
    await service.evaluatePlayerWithinTransaction(
      client,
      playerId,
      evaluatedAt,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function insertRollbackOnlyCompletedLiveMatch(
  client: pg.PoolClient,
  input: {
    firstPlayerId: string;
    secondPlayerId: string;
    winnerPlayerId: string;
    completedAt: Date;
    completionReason: 'defeat' | 'abandonment_forfeit';
  },
): Promise<string> {
  const matchId = randomUUID();
  const startedAt = new Date(input.completedAt.getTime() - 60_000);
  const turnDeadline = new Date(startedAt.getTime() + 60_000);
  await client.query(
    `insert into public.live_pvp_matches (
       id, status, version, phase, current_actor_player_id,
       decision_started_at, turn_deadline, started_at, created_at, updated_at
     ) values (
       $1::uuid, 'active', 0, 'initial_selection', null,
       $2::timestamptz, $3::timestamptz, $2::timestamptz,
       $2::timestamptz, $2::timestamptz
     )`,
    [matchId, startedAt, turnDeadline],
  );
  await client.query(
    `insert into public.live_pvp_match_participants (
       match_id, player_id, participant_side, deck_snapshot_id,
       consecutive_timeout_count, connection_generation, outcome,
       created_at, updated_at
     ) values
       ($1::uuid, $2::uuid, 'player_one', $4::uuid, 0, 0, null,
        $6::timestamptz, $6::timestamptz),
       ($1::uuid, $3::uuid, 'player_two', $5::uuid, 0, 0, null,
        $6::timestamptz, $6::timestamptz)`,
    [
      matchId,
      input.firstPlayerId,
      input.secondPlayerId,
      randomUUID(),
      randomUUID(),
      startedAt,
    ],
  );
  await client.query(
    `update public.live_pvp_matches
        set status = 'completed',
            version = 1,
            phase = 'completed',
            current_actor_player_id = null,
            decision_started_at = null,
            turn_deadline = null,
            winner_player_id = $2::uuid,
            completion_reason = $3,
            completed_at = $4::timestamptz,
            updated_at = $4::timestamptz
      where id = $1::uuid`,
    [matchId, input.winnerPlayerId, input.completionReason, input.completedAt],
  );
  await client.query(
    `update public.live_pvp_match_participants
        set outcome = case when player_id = $2::uuid then 'win' else 'loss' end,
            updated_at = $3::timestamptz
      where match_id = $1::uuid`,
    [matchId, input.winnerPlayerId, input.completedAt],
  );
  return matchId;
}
