import { randomUUID } from 'node:crypto';

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
  createTrustReviewService,
  SelfTrustReviewForbiddenError,
  StaleTrustCaseVersionError,
} from '../src/trust/trust-review-service.js';
import { createTrustService } from '../src/trust/trust-service.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'trust review service integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trust_review_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });
      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      const temporaryConfig = {
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

    it('searches the queue and records an audited bounded restriction once', async () => {
      const player = await insertPlayer(pool, 'review_target');
      const author = await insertPlayer(pool, 'review_author', 'author');
      const scoring = createTrustService(pool);
      const review = createTrustReviewService(pool);
      const observedAt = new Date(Date.now() - 2_000);

      await scoring.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'review-movement-1',
        deduplicationKey: 'review-movement-1',
      });
      await scoring.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt,
        sourceType: 'movement_decision',
        sourceIdentifier: 'review-movement-2',
        deduplicationKey: 'review-movement-2',
      });

      const page = await review.listCases({
        actorPlayerId: author.id,
        search: 'review_tar',
        status: 'active',
        page: 1,
        pageSize: 20,
      });
      expect(page.totalItems).toBe(1);
      expect(page.items[0]).toMatchObject({
        playerId: player.id,
        band: 'review_required',
        score: 50,
        canReview: true,
      });

      const before = await review.getCase(author.id, page.items[0]!.caseId);
      expect(before.evidence).toHaveLength(2);
      expect(before.scoreExplanation).toMatchObject({
        movementPoints: 50,
        finalScore: 50,
      });

      const decided = await review.recordDecision({
        actorPlayerId: author.id,
        action: 'restrict',
        caseId: before.caseId,
        durationHours: 72,
        expectedVersion: before.version,
        reasonNote:
          'Require online verification while the signals are reviewed.',
        restrictionScopes: ['online_verification_required'],
      });
      expect(decided).toMatchObject({
        status: 'under_review',
        version: before.version + 1,
        activeRestrictionCount: 1,
      });
      expect(decided.history[0]).toMatchObject({
        actorPlayerId: author.id,
        decisionType: 'restriction_applied',
        previousStatus: before.status,
        resultingStatus: 'under_review',
        reasonNote:
          'Require online verification while the signals are reviewed.',
      });
      expect(decided.history[0]!.restrictions).toHaveLength(1);

      await expect(
        review.recordDecision({
          actorPlayerId: author.id,
          action: 'continue_monitoring',
          caseId: before.caseId,
          expectedVersion: before.version,
          reasonNote: 'This stale decision must not overwrite the restriction.',
        }),
      ).rejects.toBeInstanceOf(StaleTrustCaseVersionError);

      const audit = await pool.query<{
        decisions: number;
        restrictions: number;
      }>(
        `select
         (select count(*)::integer from private.trust_case_decisions
           where case_id = $1::uuid and actor_type = 'author') as decisions,
         (select count(*)::integer from private.trust_restrictions
           where case_id = $1::uuid) as restrictions`,
        [before.caseId],
      );
      expect(audit.rows[0]).toEqual({ decisions: 1, restrictions: 1 });
    }, 60_000);

    it('recalculates a false-positive decision on the server and prevents self-review', async () => {
      const player = await insertPlayer(pool, 'false_positive');
      const author = await insertPlayer(pool, 'false_author', 'author');
      const scoring = createTrustService(pool);
      const review = createTrustReviewService(pool);

      await scoring.recordSignal({
        playerId: player.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt: new Date(Date.now() - 1_000),
        sourceType: 'movement_decision',
        sourceIdentifier: 'false-positive-movement',
        deduplicationKey: 'false-positive-movement',
      });
      const page = await review.listCases({
        actorPlayerId: author.id,
        search: player.id,
        page: 1,
        pageSize: 20,
      });
      const before = await review.getCase(author.id, page.items[0]!.caseId);
      const decided = await review.recordDecision({
        actorPlayerId: author.id,
        action: 'mark_false_positive',
        caseId: before.caseId,
        evidenceIds: [before.evidence[0]!.evidenceId],
        expectedVersion: before.version,
        reasonNote: 'The reviewed context explains this movement signal.',
      });
      expect(decided).toMatchObject({
        status: 'resolved',
        score: 0,
        band: 'normal',
      });
      expect(decided.evidence[0]).toMatchObject({
        state: 'adjusted_false_positive',
        effectivePoints: 0,
      });

      const selfReviewAuthor = await insertPlayer(
        pool,
        'self_author',
        'author',
      );
      await scoring.recordSignal({
        playerId: selfReviewAuthor.id,
        signalType: 'impossible_movement',
        severity: 'strong',
        basePoints: 25,
        observedAt: new Date(Date.now() - 1_000),
        sourceType: 'movement_decision',
        sourceIdentifier: 'self-review-movement',
        deduplicationKey: 'self-review-movement',
      });
      const selfPage = await review.listCases({
        actorPlayerId: selfReviewAuthor.id,
        search: selfReviewAuthor.id,
        page: 1,
        pageSize: 20,
      });
      await expect(
        review.recordDecision({
          actorPlayerId: selfReviewAuthor.id,
          action: 'dismiss',
          caseId: selfPage.items[0]!.caseId,
          expectedVersion: selfPage.items[0]!.version,
          reasonNote: 'Self-review must be rejected.',
        }),
      ).rejects.toBeInstanceOf(SelfTrustReviewForbiddenError);
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
