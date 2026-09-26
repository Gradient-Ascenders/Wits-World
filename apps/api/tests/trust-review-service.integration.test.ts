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
import { getMigrationsDirectory } from '../src/database/paths.js';
import {
  createTrustReviewService,
  InvalidTrustDecisionError,
  StaleTrustCaseVersionError,
  TrustCaseNotFoundError,
  type TrustReviewService,
} from '../src/trust/trust-review-service.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const policyVersion = 'trust-v1';

interface PlayerFixture {
  id: string;
  name: string;
}

interface CaseFixture {
  caseId: string;
  evidenceId: string;
  initialDecisionId: string;
  snapshotId: string;
  player: PlayerFixture;
}

describe.skipIf(!runIntegrationTests)(
  'trust review service integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let service: TrustReviewService;
    let reviewer: PlayerFixture;
    let secondReviewer: PlayerFixture;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trust_review_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });
      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      const temporaryConfig: DatabaseConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };
      await runMigrations(temporaryConfig, getMigrationsDirectory());
      pool = createDatabasePool(temporaryConfig);
      service = createTrustReviewService(pool);
      reviewer = await insertPlayer(pool, 'trust_reviewer', 'author');
      secondReviewer = await insertPlayer(pool, 'trust_second', 'author');
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

    it('filters and paginates a stable privacy-safe queue while excluding self-review cases', async () => {
      const observe = await createCase(pool, 'queue_observe', 25);
      const urgent = await createCase(pool, 'queue_urgent', 80);
      const ownCase = await createCaseForPlayer(pool, reviewer, 55);

      const firstPage = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'open',
        signalType: 'impossible_movement',
        restrictionState: 'none',
        page: 1,
        pageSize: 1,
      });
      expect(firstPage).toMatchObject({
        page: 1,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
        items: [
          {
            caseId: urgent.caseId,
            currentBand: 'urgent_review',
            signalTypes: ['impossible_movement'],
            activeRestrictionScopes: [],
          },
        ],
      });
      const secondPage = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'open',
        band: 'observe',
        page: 1,
        pageSize: 20,
      });
      expect(secondPage.items.map((item) => item.caseId)).toEqual([
        observe.caseId,
      ]);
      expect(
        firstPage.items.some((item) => item.caseId === ownCase.caseId),
      ).toBe(false);
      expect(JSON.stringify(firstPage)).not.toMatch(
        /auth_subject|latitude|longitude|source_identifier|deduplication/u,
      );
      expectPrivacySafeProjection(firstPage);
    });

    it('applies lower, upper, and bounded queue date filters', async () => {
      const fixture = await createCase(pool, 'queue_date_target', 55);
      const timestamp = await pool.query<{ opened_at: Date }>(
        `select opened_at
           from private.trust_cases
          where id = $1::uuid`,
        [fixture.caseId],
      );
      const openedAt = timestamp.rows[0]?.opened_at;
      expect(openedAt).toBeInstanceOf(Date);
      const lower = new Date((openedAt?.getTime() ?? 0) - 1_000).toISOString();
      const upper = new Date((openedAt?.getTime() ?? 0) + 1_000).toISOString();

      const lowerBound = await service.listCases({
        actorPlayerId: reviewer.id,
        createdFrom: lower,
        page: 1,
        pageSize: 100,
      });
      const upperBound = await service.listCases({
        actorPlayerId: reviewer.id,
        createdTo: upper,
        page: 1,
        pageSize: 100,
      });
      const bounded = await service.listCases({
        actorPlayerId: reviewer.id,
        createdFrom: openedAt?.toISOString(),
        createdTo: openedAt?.toISOString(),
        updatedFrom: openedAt?.toISOString(),
        updatedTo: openedAt?.toISOString(),
        page: 1,
        pageSize: 100,
      });

      expect(lowerBound.items.map((item) => item.caseId)).toContain(
        fixture.caseId,
      );
      expect(upperBound.items.map((item) => item.caseId)).toContain(
        fixture.caseId,
      );
      expect(bounded.items.map((item) => item.caseId)).toEqual([
        fixture.caseId,
      ]);
    });

    it('returns explainable derived evidence and denies self-access as not found', async () => {
      const fixture = await createCase(pool, 'detail_target', 55);
      const detail = await service.getCase({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
      });
      expect(detail).toMatchObject({
        caseId: fixture.caseId,
        playerId: fixture.player.id,
        status: 'open',
        version: 1,
        currentScore: 55,
        currentBand: 'review_required',
        policyVersion,
        evidence: [
          {
            evidenceId: fixture.evidenceId,
            signalType: 'impossible_movement',
            severity: 'strong',
            safeSourceType: 'movement_decision',
            reviewedFalsePositive: false,
          },
        ],
      });
      expect(JSON.stringify(detail)).not.toMatch(
        /auth_subject|latitude|longitude|required_speed|distance|accuracy/u,
      );
      expectPrivacySafeProjection(detail);

      await expect(
        service.getCase({
          actorPlayerId: fixture.player.id,
          caseId: fixture.caseId,
        }),
      ).rejects.toBeInstanceOf(TrustCaseNotFoundError);
    });

    it('records actor, time, reason, policy and prior history without mutation', async () => {
      const fixture = await createCase(pool, 'audit_target', 55);
      const decided = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'derived_signal_review',
        note: 'The derived signal needs continued human review.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [fixture.evidenceId],
        restrictionScopes: [],
      });
      expect(decided).toMatchObject({
        status: 'under_review',
        version: 2,
        currentScore: 0,
        currentBand: 'normal',
        evidence: [
          {
            evidenceId: fixture.evidenceId,
            effectivePoints: 0,
            decayState: 'reviewed_false_positive',
            reviewedFalsePositive: true,
          },
        ],
      });

      const history = await service.listHistory({
        actorPlayerId: secondReviewer.id,
        caseId: fixture.caseId,
        page: 1,
        pageSize: 20,
      });
      expect(history.totalItems).toBe(2);
      expect(history.items[0]).toMatchObject({
        actorType: 'author',
        actorPlayerId: reviewer.id,
        actorPlayerName: reviewer.name,
        action: 'monitoring_continued',
        previousStatus: 'open',
        resultingStatus: 'under_review',
        reasonCode: 'derived_signal_review',
        reasonNote: 'The derived signal needs continued human review.',
        policyVersion,
        versionBefore: 1,
        versionAfter: 2,
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [fixture.evidenceId],
        restrictions: [],
      });
      expect(history.items[0]?.occurredAt).toEqual(expect.any(String));
      expect(history.items[1]).toMatchObject({
        actorType: 'system',
        action: 'case_opened',
        versionBefore: 0,
        versionAfter: 1,
        falsePositiveEvidenceIds: [],
        restrictions: [],
      });
      expectPrivacySafeProjection(history);

      const immutable = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from private.trust_case_decisions
          where case_id = $1::uuid`,
        [fixture.caseId],
      );
      expect(immutable.rows[0]?.count).toBe('2');
      const snapshotAudit = await pool.query<{
        current_score: number;
        latest_snapshot_id: string;
        decision_snapshot_id: string;
      }>(
        `select trust_case.current_score,
                trust_case.latest_score_snapshot_id::text as latest_snapshot_id,
                decision.resulting_score_snapshot_id::text as decision_snapshot_id
           from private.trust_cases trust_case
           join private.trust_case_decisions decision
             on decision.case_id = trust_case.id
            and decision.case_version_after = trust_case.version
          where trust_case.id = $1::uuid`,
        [fixture.caseId],
      );
      expect(snapshotAudit.rows[0]).toEqual({
        current_score: 0,
        latest_snapshot_id: snapshotAudit.rows[0]?.decision_snapshot_id,
        decision_snapshot_id: snapshotAudit.rows[0]?.decision_snapshot_id,
      });
    });

    it('accepts 100 combined evidence references and rejects 101', async () => {
      const fixture = await createCase(pool, 'evidence_limit', 55);
      const additionalEvidenceIds = await addCaseEvidence(pool, fixture, 100);
      const allEvidenceIds = [fixture.evidenceId, ...additionalEvidenceIds];
      const accepted = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'bounded_evidence_review',
        note: 'Review exactly one hundred distinct evidence summaries.',
        evidenceIds: allEvidenceIds.slice(0, 50),
        falsePositiveEvidenceIds: allEvidenceIds.slice(50, 100),
        restrictionScopes: [],
      });
      expect(accepted).toMatchObject({ status: 'under_review', version: 2 });
      expect(accepted.recentHistory[0]).toMatchObject({
        evidenceIds: expect.arrayContaining(allEvidenceIds.slice(0, 100)),
        falsePositiveEvidenceIds: expect.arrayContaining(
          allEvidenceIds.slice(50, 100),
        ),
      });

      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 2,
          action: 'monitor',
          reasonCode: 'excess_evidence_review',
          note: 'This decision exceeds the combined evidence-reference limit.',
          evidenceIds: allEvidenceIds.slice(0, 51),
          falsePositiveEvidenceIds: allEvidenceIds.slice(51),
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expectCaseVersionAndCounts(pool, fixture.caseId, 2, 2, 0);
    });

    it('serializes concurrent same-version decisions so one fails explicitly as stale', async () => {
      const fixture = await createCase(pool, 'concurrent_target', 55);
      const input = {
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'monitor' as const,
        reasonCode: 'concurrent_review',
        note: 'Review started from the same queue version.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: [],
      };
      const outcomes = await Promise.allSettled([
        service.decide({ ...input, actorPlayerId: reviewer.id }),
        service.decide({ ...input, actorPlayerId: secondReviewer.id }),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejection = outcomes.find(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      expect(rejection?.reason).toBeInstanceOf(StaleTrustCaseVersionError);

      const persisted = await pool.query<{
        version: number;
        author_decisions: number;
      }>(
        `select trust_case.version,
                count(decision.id) filter (where decision.actor_type = 'author')::integer
                  as author_decisions
           from private.trust_cases trust_case
           join private.trust_case_decisions decision
             on decision.case_id = trust_case.id
          where trust_case.id = $1::uuid
          group by trust_case.version`,
        [fixture.caseId],
      );
      expect(persisted.rows[0]).toEqual({ version: 2, author_decisions: 1 });
    });

    it('applies supported restrictions atomically and rejects unsupported or active-resolution transitions', async () => {
      const fixture = await createCase(pool, 'restriction_target', 55);
      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'restrict',
          reasonCode: 'trade_review',
          note: 'The trade scope is not writable through the review API.',
          evidenceIds: [fixture.evidenceId],
          falsePositiveEvidenceIds: [],
          restrictionScopes: ['card_trade_hold' as never],
          restrictionDurationHours: 24,
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expectCaseVersionAndCounts(pool, fixture.caseId, 1, 1, 0);

      const restricted = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'restrict',
        reasonCode: 'activity_review',
        note: 'Temporarily hold new competitive matches during review.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: ['new_competitive_match_hold'],
        restrictionDurationHours: 24,
      });
      expect(restricted).toMatchObject({
        status: 'under_review',
        version: 2,
        restrictions: [
          {
            scope: 'new_competitive_match_hold',
            active: true,
            appealStatus: 'eligible',
          },
        ],
      });
      await expectCaseVersionAndCounts(pool, fixture.caseId, 2, 2, 1);
      const history = await service.listHistory({
        actorPlayerId: secondReviewer.id,
        caseId: fixture.caseId,
        page: 1,
        pageSize: 20,
      });
      expect(history.items[0]).toMatchObject({
        action: 'restriction_applied',
        falsePositiveEvidenceIds: [],
        restrictions: [
          {
            scope: 'new_competitive_match_hold',
            startsAt: expect.any(String),
            expiresAt: expect.any(String),
          },
        ],
      });
      const committedRestriction = history.items[0]?.restrictions[0];
      expect(
        new Date(committedRestriction?.expiresAt ?? 0).getTime() -
          new Date(committedRestriction?.startsAt ?? 0).getTime(),
      ).toBe(24 * 60 * 60 * 1000);

      await expect(
        service.decide({
          actorPlayerId: secondReviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 2,
          action: 'resolve',
          reasonCode: 'review_complete',
          note: 'This must not resolve while the restriction remains active.',
          evidenceIds: [],
          falsePositiveEvidenceIds: [],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expectCaseVersionAndCounts(pool, fixture.caseId, 2, 2, 1);
    });

    it('rolls back every reviewer write after a late restriction failure', async () => {
      const fixture = await createCase(pool, 'rollback_target', 55);
      const decisionId = randomUUID();
      const recalculatedSnapshotId = randomUUID();
      const adjustmentId = randomUUID();
      const duplicateRestrictionId = randomUUID();
      const generatedIds = [
        decisionId,
        recalculatedSnapshotId,
        adjustmentId,
        duplicateRestrictionId,
        duplicateRestrictionId,
      ];
      const failingService = createTrustReviewService(pool, {
        createId: () => generatedIds.shift() ?? randomUUID(),
      });

      await expect(
        failingService.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'restrict',
          reasonCode: 'late_failure_probe',
          note: 'Force a failure only after every related write has been attempted.',
          evidenceIds: [fixture.evidenceId],
          falsePositiveEvidenceIds: [fixture.evidenceId],
          restrictionScopes: [
            'online_verification_required',
            'new_competitive_match_hold',
          ],
          restrictionDurationHours: 24,
        }),
      ).rejects.toThrow();

      const persisted = await pool.query<{
        status: string;
        version: number;
        current_score: number;
        latest_score_snapshot_id: string;
        decisions: number;
        evidence_links: number;
        adjustments: number;
        restrictions: number;
        snapshots: number;
      }>(
        `select trust_case.status,
                trust_case.version,
                trust_case.current_score,
                trust_case.latest_score_snapshot_id::text,
                (select count(*)::integer
                   from private.trust_case_decisions decision
                  where decision.case_id = trust_case.id) as decisions,
                (select count(*)::integer
                   from private.trust_decision_evidence link
                   join private.trust_case_decisions decision
                     on decision.id = link.decision_id
                  where decision.case_id = trust_case.id) as evidence_links,
                (select count(*)::integer
                   from private.trust_signal_adjustments adjustment
                  where adjustment.case_id = trust_case.id) as adjustments,
                (select count(*)::integer
                   from private.trust_restrictions restriction
                  where restriction.case_id = trust_case.id) as restrictions,
                (select count(*)::integer
                   from private.trust_score_snapshots snapshot
                  where snapshot.player_id = trust_case.player_id) as snapshots
           from private.trust_cases trust_case
          where trust_case.id = $1::uuid`,
        [fixture.caseId],
      );
      expect(persisted.rows[0]).toEqual({
        status: 'open',
        version: 1,
        current_score: 55,
        latest_score_snapshot_id: fixture.snapshotId,
        decisions: 1,
        evidence_links: 0,
        adjustments: 0,
        restrictions: 0,
        snapshots: 1,
      });
    });

    it('rejects direct open resolution and allows dismissal only after review begins', async () => {
      const fixture = await createCase(pool, 'resolution_target', 25);
      for (const action of ['dismiss', 'resolve'] as const) {
        await expect(
          service.decide({
            actorPlayerId: reviewer.id,
            caseId: fixture.caseId,
            expectedVersion: 1,
            action,
            reasonCode: 'review_complete',
            note: 'A human decision cannot resolve an open case directly.',
            evidenceIds: [fixture.evidenceId],
            falsePositiveEvidenceIds: [],
            restrictionScopes: [],
          }),
        ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      }
      await expectCaseVersionAndCounts(pool, fixture.caseId, 1, 1, 0);

      const underReview = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'review_started',
        note: 'Begin the human review before deciding the case.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: [],
      });
      expect(underReview).toMatchObject({ status: 'under_review', version: 2 });

      const resolved = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 2,
        action: 'dismiss',
        reasonCode: 'insufficient_evidence',
        note: 'The derived signal does not justify a player restriction.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: [],
      });
      expect(resolved).toMatchObject({
        status: 'resolved',
        version: 3,
        resolutionReason: 'dismissed',
        resolvedAt: expect.any(String),
      });
      const persisted = await pool.query<{
        status: string;
        version: number;
        resolution_reason: string;
        governance_finalized_at: Date | null;
      }>(
        `select status, version, resolution_reason, governance_finalized_at
           from private.trust_cases
          where id = $1::uuid`,
        [fixture.caseId],
      );
      expect(persisted.rows[0]).toMatchObject({
        status: 'resolved',
        version: 3,
        resolution_reason: 'dismissed',
        governance_finalized_at: expect.any(Date),
      });

      await expect(
        service.decide({
          actorPlayerId: secondReviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 3,
          action: 'monitor',
          reasonCode: 'late_review',
          note: 'A resolved case cannot receive another reviewer decision.',
          evidenceIds: [],
          falsePositiveEvidenceIds: [],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
    });

    it('allows an under-review unrestricted case to resolve explicitly', async () => {
      const fixture = await createCase(pool, 'explicit_resolution', 25);
      await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'monitor',
        reasonCode: 'review_started',
        note: 'Begin the human review before resolving the case.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: [],
      });
      const resolved = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 2,
        action: 'resolve',
        reasonCode: 'review_complete',
        note: 'The unrestricted review is complete.',
        evidenceIds: [fixture.evidenceId],
        falsePositiveEvidenceIds: [],
        restrictionScopes: [],
      });
      expect(resolved).toMatchObject({
        status: 'resolved',
        version: 3,
        resolutionReason: 'review_complete',
      });
    });
  },
);

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  label: string,
  role: 'player' | 'author' = 'player',
): Promise<PlayerFixture> {
  const id = randomUUID();
  const name = `${label.slice(0, 10)}_${id.slice(0, 5)}`;
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values ($1::uuid, 'https://issuer.example/', $2, $3, $4)`,
    [id, `auth0|${label}-${randomUUID()}`, name, role],
  );
  return { id, name };
}

async function createCase(
  database: Pick<pg.Pool, 'connect' | 'query'>,
  label: string,
  score: number,
): Promise<CaseFixture> {
  const player = await insertPlayer(database as pg.Pool, label);
  return createCaseForPlayer(database, player, score);
}

async function createCaseForPlayer(
  database: Pick<pg.Pool, 'connect'>,
  player: PlayerFixture,
  score: number,
): Promise<CaseFixture> {
  const client = await database.connect();
  const caseId = randomUUID();
  const signalId = randomUUID();
  const evidenceId = randomUUID();
  const snapshotId = randomUUID();
  const initialDecisionId = randomUUID();
  const at = new Date(Date.now() - 60_000);
  const movementPoints = Math.min(score, 50);
  const submissionPoints = Math.min(Math.max(score - 50, 0), 30);
  const opponentPoints = Math.min(Math.max(score - 80, 0), 20);
  const band =
    score >= 75 ? 'urgent_review' : score >= 50 ? 'review_required' : 'observe';
  try {
    await client.query('begin');
    await client.query(
      `insert into private.trust_signals (
         id, player_id, policy_version, signal_type, severity, base_points,
         observed_at, expires_at, source_type, source_identifier,
         deduplication_digest, created_at
       ) values (
         $1::uuid, $2::uuid, $3, 'impossible_movement', 'strong', 25,
         $4::timestamptz, $4::timestamptz + interval '90 days',
         'movement_decision', $5, $6::bytea, $4::timestamptz
       )`,
      [
        signalId,
        player.id,
        policyVersion,
        at,
        `movement:${signalId}`,
        digest(signalId),
      ],
    );
    await client.query(
      `insert into private.trust_score_snapshots (
         id, player_id, policy_version, evaluated_at,
         movement_points, submission_conflict_points, opponent_pattern_points,
         final_score, review_band, source_signal_count, calculation_digest,
         purge_after, created_at
       ) values (
         $1::uuid, $2::uuid, $3, $4::timestamptz,
         $5, $6, $7, $8, $9, 1, $10::bytea,
         $4::timestamptz + interval '12 months', $4::timestamptz
       )`,
      [
        snapshotId,
        player.id,
        policyVersion,
        at,
        movementPoints,
        submissionPoints,
        opponentPoints,
        score,
        band,
        digest(`${caseId}:${score}`),
      ],
    );
    await client.query(
      `insert into private.trust_cases (
         id, player_id, policy_version, status, version, current_score,
         current_band, latest_score_snapshot_id, opened_at, updated_at
       ) values (
         $1::uuid, $2::uuid, $3, 'open', 1, $4, $5, $6::uuid,
         $7::timestamptz, $7::timestamptz
       )`,
      [caseId, player.id, policyVersion, score, band, snapshotId, at],
    );
    await client.query(
      `insert into private.trust_case_decisions (
         id, case_id, actor_type, actor_player_id, policy_version,
         case_version_before, case_version_after, decision_type,
         previous_status, resulting_status, reason_code,
         resulting_score_snapshot_id, created_at
       ) values (
         $1::uuid, $2::uuid, 'system', null, $3,
         0, 1, 'case_opened', null, 'open', 'score_threshold_crossed',
         $4::uuid, $5::timestamptz
       )`,
      [initialDecisionId, caseId, policyVersion, snapshotId, at],
    );
    await client.query(
      `insert into private.trust_case_evidence (
         id, case_id, original_signal_id, signal_type, severity,
         base_points, observed_at, policy_version, safe_source_type, created_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'impossible_movement', 'strong',
         25, $4::timestamptz, $5, 'movement_decision', $4::timestamptz
       )`,
      [evidenceId, caseId, signalId, at, policyVersion],
    );
    await client.query('commit');
    return { caseId, evidenceId, initialDecisionId, snapshotId, player };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function addCaseEvidence(
  database: Pick<pg.Pool, 'connect'>,
  fixture: CaseFixture,
  count: number,
): Promise<string[]> {
  const client = await database.connect();
  const observedAt = new Date(Date.now() - 60_000);
  const records = Array.from({ length: count }, () => {
    const signalId = randomUUID();
    return {
      signalId,
      evidenceId: randomUUID(),
      sourceIdentifier: `submission:${signalId}`,
      digestHex: digest(signalId).toString('hex'),
    };
  });
  try {
    await client.query('begin');
    await client.query(
      `with input as (
         select *
           from jsonb_to_recordset($1::jsonb) as item(
             "signalId" uuid,
             "sourceIdentifier" text,
             "digestHex" text
           )
       )
       insert into private.trust_signals (
         id, player_id, policy_version, signal_type, severity, base_points,
         observed_at, expires_at, source_type, source_identifier,
         deduplication_digest, created_at
       )
       select "signalId", $2::uuid, $3, 'submission_conflict_pattern', 'pattern', 10,
              $4::timestamptz, $4::timestamptz + interval '90 days',
              'submission_pattern', "sourceIdentifier", decode("digestHex", 'hex'),
              $4::timestamptz
         from input`,
      [JSON.stringify(records), fixture.player.id, policyVersion, observedAt],
    );
    await client.query(
      `with input as (
         select *
           from jsonb_to_recordset($1::jsonb) as item(
             "signalId" uuid,
             "evidenceId" uuid
           )
       )
       insert into private.trust_case_evidence (
         id, case_id, original_signal_id, signal_type, severity,
         base_points, observed_at, policy_version, safe_source_type, created_at
       )
       select "evidenceId", $2::uuid, "signalId", 'submission_conflict_pattern',
              'pattern', 10, $3::timestamptz, $4, 'submission_pattern',
              $3::timestamptz
         from input`,
      [JSON.stringify(records), fixture.caseId, observedAt, policyVersion],
    );
    await client.query('commit');
    return records.map((record) => record.evidenceId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function expectCaseVersionAndCounts(
  database: Pick<pg.Pool, 'query'>,
  caseId: string,
  version: number,
  decisions: number,
  restrictions: number,
): Promise<void> {
  const result = await database.query<{
    version: number;
    decisions: number;
    restrictions: number;
  }>(
    `select trust_case.version,
            (select count(*)::integer
               from private.trust_case_decisions decision
              where decision.case_id = trust_case.id) as decisions,
            (select count(*)::integer
               from private.trust_restrictions restriction
              where restriction.case_id = trust_case.id) as restrictions
       from private.trust_cases trust_case
      where trust_case.id = $1::uuid`,
    [caseId],
  );
  expect(result.rows[0]).toEqual({ version, decisions, restrictions });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function expectPrivacySafeProjection(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const prohibitedField of [
    'latitude',
    'longitude',
    'coordinates',
    'locationPayload',
    'authIssuer',
    'authSubject',
    'providerIdentifier',
    'rawTelemetry',
    'submittedAnswer',
    'privateMatchState',
    'sourceIdentifier',
    'sourceDigest',
    'deduplicationDigest',
  ]) {
    expect(serialized).not.toContain(prohibitedField);
  }
}
