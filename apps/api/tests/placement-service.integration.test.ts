import { randomUUID } from 'node:crypto';

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
import { runSeeds } from '../src/database/seeds.js';
import { createOfflineChallengeService } from '../src/challenges/offline-challenges.js';
import type { ChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-answer-submission.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createPlacementService } from '../src/placement/placement-service.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const authorId = '26200000-0000-4000-8000-000000000001';
const eventIds = [
  '26210000-0000-4000-8000-000000000001',
  '26210000-0000-4000-8000-000000000002',
  '26210000-0000-4000-8000-000000000003',
];

describe.skipIf(!runIntegrationTests)('placement service integration', () => {
  let administrationConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let pool: ReturnType<typeof createDatabasePool>;
  let appliedPlanId: string;
  let withdrawnEventId: string;

  beforeAll(async () => {
    loadApiEnvironment();
    administrationConfig = buildDatabaseConfig({ target: 'test' });
    temporaryDatabaseName = `wits_quest_placement_service_${Date.now()}_${process.pid}`;
    await withDatabaseClient(administrationConfig, (client) =>
      client.query(`create database ${temporaryDatabaseName}`),
    );
    const url = new URL(administrationConfig.connectionString);
    url.pathname = `/${temporaryDatabaseName}`;
    const config = {
      ...administrationConfig,
      connectionString: url.toString(),
    };
    await runMigrations(config);
    await runSeeds(config);
    pool = createDatabasePool(config);
    await pool.query(
      `insert into public.players
       (id,auth_issuer,auth_subject,player_name,role)
       values ($1,'https://issuer.example/','auth0|placement-service',
               'placement_tester','author')`,
      [authorId],
    );
    for (const [index, eventId] of eventIds.entries()) {
      const challengeId = randomUUID();
      await pool.query(
        `insert into public.events
         (id,title,location,radius_metres,starts_at,ends_at,
          is_published,authoring_status,publication_provenance)
         values ($1,$2,
           st_setsrid(st_makepoint(28.04,-26.18),4326)::geography,
           50,now()-interval '1 day',now()+interval '30 days',
           true,'published','controlled_seed')`,
        [eventId, `Portable service test ${index + 1}`],
      );
      await pool.query(
        `insert into public.event_challenges
         (id,event_id,status,publication_provenance)
         values ($1,$2,'draft',null)`,
        [challengeId, eventId],
      );
      await pool.query(
        `insert into public.challenge_questions
         (id,challenge_id,prompt,difficulty,status)
         select md5($1::text || ':question:' || number)::uuid,
                $1::uuid, 'Portable question ' || number || '?', 1, 'draft'
           from generate_series(1,5) number`,
        [challengeId],
      );
      await pool.query(
        `insert into public.challenge_choices
         (id,question_id,authoring_position,choice_text)
         select md5(question.id::text || ':choice:' || number)::uuid,
                question.id,number,'Choice ' || number
           from public.challenge_questions question
          cross join generate_series(1,4) number
          where question.challenge_id=$1`,
        [challengeId],
      );
      await pool.query(
        `insert into private.challenge_answer_keys
         (question_id,accepted_choice_id)
         select question.id,choice.id
           from public.challenge_questions question
           join public.challenge_choices choice
             on choice.question_id=question.id
            and choice.authoring_position=1
          where question.challenge_id=$1`,
        [challengeId],
      );
      await pool.query(
        `update public.challenge_questions
            set status='published',version=version+1,
                publication_provenance='controlled_seed',updated_at=now()
          where challenge_id=$1`,
        [challengeId],
      );
      await pool.query(
        `update public.event_challenges
            set status='published',version=version+1,
                publication_provenance='controlled_seed',updated_at=now()
          where id=$1`,
        [challengeId],
      );
      await pool.query(
        `insert into public.event_placement_portability
         (event_id,policy_version_id,approved_by_player_id,
          review_provenance,effective_at)
         values ($1,'placement-v1',$2,'reviewed',now())`,
        [eventId, authorId],
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (!administrationConfig || !temporaryDatabaseName) return;
    await withDatabaseClient(administrationConfig, (client) =>
      client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      ),
    );
  }, 60_000);

  it('applies a degraded preview atomically and removes withdrawn portable content', async () => {
    const service = createPlacementService(pool);
    const preview = await service.preview(authorId);
    expect(preview.status).toBe('degraded');
    expect(preview.entries).toHaveLength(3);
    expect(Object.values(preview.zoneCounts)).toEqual([1, 1, 1]);

    const applied = await service.apply(
      authorId,
      preview.planId,
      preview.stateVersion,
      'Reviewed placement test',
    );
    appliedPlanId = applied.planId;
    expect(applied.stateVersion).toBe(1);
    const current = await pool.query<{ count: number }>(
      `select count(*)::int as count from public.event_placement_assignments
         where ends_at is null`,
    );
    expect(current.rows[0]?.count).toBe(3);
    await expect(
      service.apply(authorId, preview.planId, preview.stateVersion, 'Replay'),
    ).rejects.toMatchObject({ code: 'STALE_PLACEMENT_STATE' });

    const playerEvents = await createEventDiscoveryService(pool).list();
    expect(
      playerEvents.filter((event) => eventIds.includes(event.eventId)),
    ).toHaveLength(3);
    const state = await service.state();
    expect(state.assignments).toHaveLength(3);
    const offline = createOfflineChallengeService(pool, {
      signingKey: 'placement-test-signing-key-32-characters',
      finalizer: {} as ChallengeAttemptCompletionFinalizer,
      maxSpeed: 1,
      retentionMs: 60_000,
    });
    const packs = await offline.packs(authorId, eventIds);
    expect(packs).toHaveLength(3);
    for (const { pack } of packs) {
      expect(pack.placementAssignmentId).toBeDefined();
      expect(Date.parse(pack.validUntil)).toBeLessThanOrEqual(
        Date.parse(state.nextRotationBoundary),
      );
    }
    const withdrawn = state.assignments[0]!.eventId;
    withdrawnEventId = withdrawn;
    await service.endPortability(
      authorId,
      withdrawn,
      state.stateVersion,
      'Review withdrawn',
    );
    const afterWithdrawal = await createEventDiscoveryService(pool).list();
    expect(afterWithdrawal.some((event) => event.eventId === withdrawn)).toBe(
      false,
    );
    expect((await service.runScheduled()).outcome).toBe('unserved');
    expect((await service.state()).metrics).toMatchObject({
      targetAssignmentCount: 6,
      activeAssignmentCount: 2,
      unservedZoneCount: 1,
      lastFailureCode: 'unserved_zone',
    });
  }, 120_000);

  it('audits pause idempotency and site lifecycle changes without reopening history', async () => {
    const service = createPlacementService(pool);
    const before = await service.state();
    const idempotencyKey = randomUUID();
    const input = {
      actorId: authorId,
      kind: 'automation_pause' as const,
      durationHours: 1,
      expectedVersion: before.stateVersion,
      reason: 'Campus closure',
      idempotencyKey,
    };
    const pause = await service.override(input);
    expect(pause.replayed).toBe(false);
    expect(await service.override(input)).toEqual({
      overrideId: pause.overrideId,
      replayed: true,
    });
    expect((await service.runScheduled()).outcome).toBe('paused');
    await service.endOverride(
      authorId,
      pause.overrideId,
      before.stateVersion + 1,
      'Campus reopened',
    );

    const current = await service.state();
    const assignment = current.assignments[0]!;
    await service.changeSite(
      authorId,
      assignment.siteId,
      'suspended',
      current.stateVersion,
      'Site temporarily closed',
    );
    const suspended = await service.state();
    expect(
      suspended.assignments.some((item) => item.siteId === assignment.siteId),
    ).toBe(false);
    expect(
      suspended.sites.find((item) => item.id === assignment.siteId)?.status,
    ).toBe('suspended');
    await service.changeSite(
      authorId,
      assignment.siteId,
      'active',
      suspended.stateVersion,
      'Site reviewed and reopened',
    );
    const reopened = await service.state();
    expect(
      reopened.sites.find((item) => item.id === assignment.siteId)?.status,
    ).toBe('active');
    await expect(
      service.rollback(
        authorId,
        appliedPlanId,
        reopened.stateVersion,
        'Restore initial plan',
      ),
    ).rejects.toMatchObject({ code: 'ROLLBACK_PLAN_INVALID' });
    expect((await service.state()).stateVersion).toBe(reopened.stateVersion);

    await service.approvePortability(
      authorId,
      withdrawnEventId,
      reopened.stateVersion,
      'Portable content reviewed again',
    );
    const outcomes = await Promise.all([
      service.runScheduled(),
      createPlacementService(pool).runScheduled(),
    ]);
    expect(outcomes.map((result) => result.outcome).sort()).toEqual([
      'already_applied',
      'applied',
    ]);
    const committed = await pool.query<{ count: number }>(
      `select count(*)::int as count from public.event_placement_plans
        where trigger_kind='scheduled' and status in ('applied','degraded')
          and rotation_bucket=(
            (now() at time zone 'Africa/Johannesburg') - interval '4 hours'
          )::date`,
    );
    expect(committed.rows[0]?.count).toBe(1);
  }, 120_000);
});
