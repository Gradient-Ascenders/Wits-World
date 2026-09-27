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
            band: 'urgent_review',
            canReview: true,
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

    it('treats active as open plus under-review, excludes resolved by default, and searches Player Name literally', async () => {
      const open = await createCase(pool, 'active_open', 25);
      const underReview = await createCase(pool, 'active_review', 55);
      const resolved = await createCase(pool, 'active_resolved', 80);
      await service.decide({
        actorPlayerId: reviewer.id,
        caseId: underReview.caseId,
        expectedVersion: 1,
        action: 'continue_monitoring',
        reasonNote: 'Keep this case in the active reviewer queue.',
        evidenceIds: [],
        restrictionScopes: [],
      });
      await service.decide({
        actorPlayerId: reviewer.id,
        caseId: resolved.caseId,
        expectedVersion: 1,
        action: 'continue_monitoring',
        reasonNote: 'Begin review before resolving the retained case.',
        evidenceIds: [],
        restrictionScopes: [],
      });
      await service.decide({
        actorPlayerId: reviewer.id,
        caseId: resolved.caseId,
        expectedVersion: 2,
        action: 'dismiss',
        reasonNote: 'Resolve this case so it cannot crowd the active queue.',
        evidenceIds: [],
        restrictionScopes: [],
      });

      const active = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'active',
        search: 'ACTIVE_',
        page: 1,
        pageSize: 20,
      });
      expect(new Set(active.items.map((item) => item.caseId))).toEqual(
        new Set([open.caseId, underReview.caseId]),
      );
      expect(active.items.some((item) => item.caseId === resolved.caseId)).toBe(
        false,
      );

      const resolvedPage = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'resolved',
        search: 'active_',
        page: 1,
        pageSize: 20,
      });
      expect(resolvedPage.items.map((item) => item.caseId)).toContain(
        resolved.caseId,
      );

      const allStatuses = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'all',
        page: 1,
        pageSize: 100,
      });
      expect(allStatuses.items.map((item) => item.caseId)).toEqual(
        expect.arrayContaining([
          open.caseId,
          underReview.caseId,
          resolved.caseId,
        ]),
      );
      const exactCase = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'all',
        search: resolved.caseId,
        page: 1,
        pageSize: 20,
      });
      expect(exactCase.items.map((item) => item.caseId)).toEqual([
        resolved.caseId,
      ]);
      const exactPlayer = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'all',
        search: open.player.id,
        page: 1,
        pageSize: 20,
      });
      expect(exactPlayer.items.map((item) => item.caseId)).toEqual([
        open.caseId,
      ]);

      const injectionLikeLiteral = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'active',
        search: "%' OR 1=1 --",
        page: 1,
        pageSize: 20,
      });
      expect(injectionLikeLiteral.items).toEqual([]);
      expectPrivacySafeProjection(active);
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
        status: 'active',
        createdFrom: lower,
        page: 1,
        pageSize: 100,
      });
      const upperBound = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'active',
        createdTo: upper,
        page: 1,
        pageSize: 100,
      });
      const bounded = await service.listCases({
        actorPlayerId: reviewer.id,
        status: 'active',
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
        score: 55,
        band: 'review_required',
        canReview: true,
        policyVersion,
        evidencePreview: [
          {
            evidenceId: fixture.evidenceId,
            signalType: 'impossible_movement',
            severity: 'strong',
            safeSourceType: 'movement_decision',
            reviewedFalsePositive: false,
            opponentPattern: null,
          },
        ],
        evidenceTotalItems: 1,
        evidenceTruncated: false,
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

    it('bounds detail previews and paginates complete evidence deterministically', async () => {
      const fixture = await createCase(pool, 'bounded_detail', 55);
      await addCaseEvidence(pool, fixture, 15);

      const detail = await service.getCase({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
      });
      expect(detail.evidencePreview).toHaveLength(10);
      expect(detail.evidenceTotalItems).toBe(16);
      expect(detail.evidenceTruncated).toBe(true);

      const first = await service.listEvidence({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        page: 1,
        pageSize: 5,
      });
      const second = await service.listEvidence({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        page: 2,
        pageSize: 5,
      });
      expect(first).toMatchObject({
        page: 1,
        pageSize: 5,
        totalItems: 16,
        totalPages: 4,
      });
      expect(first.items).toHaveLength(5);
      expect(second.items).toHaveLength(5);
      expect(
        first.items.some((item) =>
          second.items.some(
            (candidate) => candidate.evidenceId === item.evidenceId,
          ),
        ),
      ).toBe(false);
      await expect(
        service.listEvidence({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          page: 1,
          pageSize: 101,
        }),
      ).rejects.toThrow(/pageSize/u);
      expectPrivacySafeProjection(first);
    });

    it('exports only the bounded server-defined privacy-safe projection', async () => {
      const fixture = await createCase(pool, 'bounded_export', 55);
      await addCaseEvidence(pool, fixture, 105);
      const exported = await service.exportCase({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
      });

      expect(exported).toMatchObject({
        formatVersion: 'trust-case-review-v1',
        generatedAt: expect.any(String),
        case: {
          caseId: fixture.caseId,
          evidenceTotalItems: 106,
          evidenceTruncated: true,
        },
        evidence: {
          page: 1,
          pageSize: 100,
          totalItems: 106,
          totalPages: 2,
        },
      });
      expect(exported.evidence.items).toHaveLength(100);
      expectPrivacySafeProjection(exported);

      await expect(
        service.exportCase({
          actorPlayerId: fixture.player.id,
          caseId: fixture.caseId,
        }),
      ).rejects.toBeInstanceOf(TrustCaseNotFoundError);
    });

    it('projects durable opponent-pattern aggregates without counterpart or match identity', async () => {
      const fixture = await createCase(pool, 'opponent_detail', 55);
      const evidenceId = await addOpponentPatternEvidence(pool, fixture);
      const evidence = await service.listEvidence({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        page: 1,
        pageSize: 20,
      });
      expect(evidence.items).toContainEqual(
        expect.objectContaining({
          evidenceId,
          signalType: 'opponent_concentration',
          opponentPattern: {
            availability: 'available',
            kind: 'opponent_concentration',
            evaluationWindowStart: '2026-08-01T10:00:00.000Z',
            evaluationWindowEnd: '2026-08-31T10:00:00.000Z',
            completedMatchCount: 8,
            repeatedOpponentMatchCount: 7,
            opponentConcentrationRatio: 0.875,
            minimumCompletedMatchCount: 6,
            minimumOpponentConcentrationRatio: 0.8,
          },
        }),
      );
      expectPrivacySafeProjection(evidence);
      expect(JSON.stringify(evidence)).not.toMatch(
        /opponentPlayerId|matchId|deck|battleState/u,
      );
    });

    it('blocks legacy unexplained opponent evidence until a fresh explained evaluation supersedes it', async () => {
      const fixture = await createCase(pool, 'legacy_opponent_detail', 55);
      const legacyEvidenceId = await addOpponentPatternEvidence(pool, fixture, {
        observedAt: new Date('2026-09-20T10:00:00.000Z'),
        includeSummary: false,
      });

      const blocked = await service.getCase({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
      });
      expect(blocked.canReview).toBe(false);
      expect(blocked.evidencePreview).toContainEqual(
        expect.objectContaining({
          evidenceId: legacyEvidenceId,
          opponentPattern: {
            availability: 'unavailable',
            reason: 'legacy_summary_not_retained',
            remediation: 'await_fresh_detector_evaluation',
          },
        }),
      );
      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'continue_monitoring',
          reasonNote: 'This must wait for explainable opponent evidence.',
          evidenceIds: [legacyEvidenceId],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);

      const freshEvidenceId = await addOpponentPatternEvidence(pool, fixture, {
        observedAt: new Date('2026-09-21T10:00:00.000Z'),
      });
      const reviewable = await service.getCase({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
      });
      expect(reviewable.canReview).toBe(true);
      expect(reviewable.evidencePreview).toContainEqual(
        expect.objectContaining({
          evidenceId: legacyEvidenceId,
          opponentPattern: {
            availability: 'unavailable',
            reason: 'legacy_summary_not_retained',
            remediation: 'await_fresh_detector_evaluation',
          },
        }),
      );
      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'continue_monitoring',
          reasonNote: 'The selected legacy row is still unavailable.',
          evidenceIds: [legacyEvidenceId],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'continue_monitoring',
          reasonNote: 'Review using the fresh explained detector evaluation.',
          evidenceIds: [freshEvidenceId],
          restrictionScopes: [],
        }),
      ).resolves.toMatchObject({ status: 'under_review', version: 2 });
    });

    it('records actor, time, reason, policy and prior history without mutation', async () => {
      const fixture = await createCase(pool, 'audit_target', 55);
      const decided = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'mark_false_positive',
        reasonNote: 'The derived signal needs continued human review.',
        evidenceIds: [fixture.evidenceId],
        restrictionScopes: [],
      });
      expect(decided).toMatchObject({
        status: 'under_review',
        version: 2,
        score: 0,
        band: 'normal',
        evidencePreview: [
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
        action: 'evidence_marked_false_positive',
        previousStatus: 'open',
        resultingStatus: 'under_review',
        reasonCode: 'review_false_positive',
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

    it('accepts 100 evidence references and rejects 101', async () => {
      const fixture = await createCase(pool, 'evidence_limit', 55);
      const additionalEvidenceIds = await addCaseEvidence(pool, fixture, 100);
      const allEvidenceIds = [fixture.evidenceId, ...additionalEvidenceIds];
      const accepted = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'continue_monitoring',
        reasonNote: 'Review exactly one hundred distinct evidence summaries.',
        evidenceIds: allEvidenceIds.slice(0, 100),
        restrictionScopes: [],
      });
      expect(accepted).toMatchObject({ status: 'under_review', version: 2 });
      expect(accepted.recentHistory[0]).toMatchObject({
        evidenceIds: expect.arrayContaining(allEvidenceIds.slice(0, 100)),
        falsePositiveEvidenceIds: [],
      });

      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 2,
          action: 'continue_monitoring',
          reasonNote: 'This decision exceeds the evidence-reference limit.',
          evidenceIds: allEvidenceIds,
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
        action: 'continue_monitoring' as const,
        reasonNote: 'Review started from the same queue version.',
        evidenceIds: [fixture.evidenceId],
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
          reasonNote: 'The trade scope is not writable through the review API.',
          evidenceIds: [fixture.evidenceId],
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
        reasonNote: 'Temporarily hold new competitive matches during review.',
        evidenceIds: [fixture.evidenceId],
        restrictionScopes: ['new_competitive_match_hold'],
        restrictionDurationHours: 24,
      });
      expect(restricted).toMatchObject({
        status: 'under_review',
        version: 2,
        restrictionCount: 1,
        activeRestrictionCount: 1,
        canReview: true,
        restrictionPreview: [
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

      const restrictions = await service.listRestrictions({
        actorPlayerId: secondReviewer.id,
        caseId: fixture.caseId,
        page: 1,
        pageSize: 1,
      });
      expect(restrictions).toMatchObject({
        page: 1,
        pageSize: 1,
        totalItems: 1,
        totalPages: 1,
        items: [
          {
            scope: 'new_competitive_match_hold',
            active: true,
          },
        ],
      });
      await expect(
        service.listRestrictions({
          actorPlayerId: secondReviewer.id,
          caseId: fixture.caseId,
          page: 1,
          pageSize: 101,
        }),
      ).rejects.toThrow(/pageSize/u);

      await expect(
        service.decide({
          actorPlayerId: secondReviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 2,
          action: 'dismiss',
          reasonNote:
            'This must not resolve while the restriction remains active.',
          evidenceIds: [],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expectCaseVersionAndCounts(pool, fixture.caseId, 2, 2, 1);
    });

    it('rolls back every reviewer write after a late restriction failure', async () => {
      const fixture = await createCase(pool, 'rollback_target', 55);
      const decisionId = randomUUID();
      const duplicateRestrictionId = randomUUID();
      const generatedIds = [
        decisionId,
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
          reasonNote:
            'Force a failure only after every related write has been attempted.',
          evidenceIds: [fixture.evidenceId],
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
      await expect(
        service.decide({
          actorPlayerId: reviewer.id,
          caseId: fixture.caseId,
          expectedVersion: 1,
          action: 'dismiss',
          reasonNote: 'A human decision cannot resolve an open case directly.',
          evidenceIds: [fixture.evidenceId],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
      await expectCaseVersionAndCounts(pool, fixture.caseId, 1, 1, 0);

      const underReview = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'continue_monitoring',
        reasonNote: 'Begin the human review before deciding the case.',
        evidenceIds: [fixture.evidenceId],
        restrictionScopes: [],
      });
      expect(underReview).toMatchObject({ status: 'under_review', version: 2 });

      const resolved = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 2,
        action: 'dismiss',
        reasonNote: 'The derived signal does not justify a player restriction.',
        evidenceIds: [fixture.evidenceId],
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
          action: 'continue_monitoring',
          reasonNote:
            'A resolved case cannot receive another reviewer decision.',
          evidenceIds: [],
          restrictionScopes: [],
        }),
      ).rejects.toBeInstanceOf(InvalidTrustDecisionError);
    });

    it('allows an under-review unrestricted case to be dismissed', async () => {
      const fixture = await createCase(pool, 'explicit_resolution', 25);
      await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 1,
        action: 'continue_monitoring',
        reasonNote: 'Begin the human review before resolving the case.',
        evidenceIds: [fixture.evidenceId],
        restrictionScopes: [],
      });
      const resolved = await service.decide({
        actorPlayerId: reviewer.id,
        caseId: fixture.caseId,
        expectedVersion: 2,
        action: 'dismiss',
        reasonNote: 'The unrestricted review is complete.',
        evidenceIds: [fixture.evidenceId],
        restrictionScopes: [],
      });
      expect(resolved).toMatchObject({
        status: 'resolved',
        version: 3,
        resolutionReason: 'dismissed',
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

async function addOpponentPatternEvidence(
  database: Pick<pg.Pool, 'connect'>,
  fixture: CaseFixture,
  options: { observedAt?: Date; includeSummary?: boolean } = {},
): Promise<string> {
  const client = await database.connect();
  const signalId = randomUUID();
  const evidenceId = randomUUID();
  const observedAt = options.observedAt ?? new Date('2026-08-31T10:00:00.000Z');
  const summary = {
    kind: 'opponent_concentration',
    evaluationWindowStart: '2026-08-01T10:00:00.000Z',
    evaluationWindowEnd: observedAt.toISOString(),
    completedMatchCount: 8,
    repeatedOpponentMatchCount: 7,
    opponentConcentrationRatio: 0.875,
    minimumCompletedMatchCount: 6,
    minimumOpponentConcentrationRatio: 0.8,
  };
  try {
    await client.query('begin');
    await client.query(
      `insert into private.trust_signals (
         id, player_id, policy_version, signal_type, severity, base_points,
         observed_at, expires_at, source_type, source_identifier,
         deduplication_digest, review_summary
       ) values (
         $1::uuid, $2::uuid, $3, 'opponent_concentration', 'pattern', 20,
         $4::timestamptz, $4::timestamptz + interval '90 days',
         'pvp_pattern', $5, $6::bytea, $7::jsonb
       )`,
      [
        signalId,
        fixture.player.id,
        policyVersion,
        observedAt,
        `private-source-${signalId}`,
        digest(signalId),
        options.includeSummary === false ? null : JSON.stringify(summary),
      ],
    );
    await client.query(
      `insert into private.trust_case_evidence (
         id, case_id, original_signal_id, signal_type, severity,
         base_points, observed_at, policy_version, safe_source_type,
         safe_review_summary
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'opponent_concentration', 'pattern',
         20, $4::timestamptz, $5, 'pvp_pattern', $6::jsonb
       )`,
      [
        evidenceId,
        fixture.caseId,
        signalId,
        observedAt,
        policyVersion,
        options.includeSummary === false ? null : JSON.stringify(summary),
      ],
    );
    await client.query('commit');
    return evidenceId;
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
