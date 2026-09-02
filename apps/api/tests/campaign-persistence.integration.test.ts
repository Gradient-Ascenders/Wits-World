import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
} from '../src/authoring/content-workflow.js';
import { createAuthorContentReadService } from '../src/authoring/content-read-service.js';
import {
  createAuthorCampaignService,
  InvalidAuthorCampaignError,
  type AuthorCampaign,
} from '../src/campaigns/author-campaign-service.js';
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
import { createAuthorEventService } from '../src/events/author-event-service.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createEventEligibilityService } from '../src/events/event-eligibility.js';
import {
  AuthorTrailStateConflictError,
  createAuthorTrailService,
} from '../src/trails/author-trail-service.js';
import { createPlayerTrailService } from '../src/trails/player-trail-service.js';

const AUTHOR_ONE_ID = '18340000-0000-4000-8000-000000000001';
const AUTHOR_TWO_ID = '18340000-0000-4000-8000-000000000002';
const PLAYER_ID = '18340000-0000-4000-8000-000000000003';

const LIFECYCLE_EVENT_ID = '18350000-0000-4000-8000-000000000001';
const OVERLAP_EVENT_ID = '18350000-0000-4000-8000-000000000002';
const CONCURRENT_EVENT_ID = '18350000-0000-4000-8000-000000000003';
const NON_INTERSECTING_EVENT_ID = '18350000-0000-4000-8000-000000000004';
const HISTORY_EVENT_ID = '18350000-0000-4000-8000-000000000005';
const TRAIL_SECOND_EVENT_ID = '18350000-0000-4000-8000-000000000006';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'campaign scheduling persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let trailId: string;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_campaigns_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      const temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };
      const migrations = await runMigrations(temporaryConfig);
      expect(migrations.applied).toContain(
        '0030_create_campaign_scheduling.sql',
      );

      pool = createDatabasePool(temporaryConfig);
      await seedPlayersAndEvents(pool);
      const trail = await createAuthorTrailService(pool).createTrail({
        actorPlayerId: AUTHOR_ONE_ID,
        title: 'Campaign history trail',
        eventIds: [HISTORY_EVENT_ID, TRAIL_SECOND_EVENT_ID],
      });
      trailId = trail.trailId;
      await createAuthorTrailService(pool).publishTrail(AUTHOR_ONE_ID, trailId);
    }, 60_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('creates the campaign constraints and query indexes', async () => {
      const indexes = await pool.query<{ indexname: string }>(
        `select indexname from pg_indexes
         where schemaname = 'public'
           and tablename in ('campaigns', 'campaign_events', 'campaign_trails')`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'campaigns_review_queue_idx',
          'campaigns_effective_schedule_idx',
          'campaigns_published_history_idx',
          'campaign_events_event_idx',
          'campaign_trails_trail_idx',
        ]),
      );

      await expect(
        pool.query(
          `insert into public.campaigns (title, starts_at, ends_at)
           values ('Invalid period', '2026-09-05T12:00:00Z', '2026-09-05T12:00:00Z')`,
        ),
      ).rejects.toMatchObject({ constraint: 'campaigns_period_check' });

      await expect(
        pool.query(
          `insert into public.campaigns (
             title, starts_at, ends_at, status, publication_provenance,
             published_at
           ) values (
             'Unsafe publication',
             '2026-09-05T10:00:00Z', '2026-09-05T12:00:00Z',
             'published', 'controlled_seed', now()
           )`,
        ),
      ).rejects.toThrow('must begin as a draft');
    });

    it('enforces effective event timing at inclusive start and exclusive end', async () => {
      const campaign = await createPublishedCampaign({
        title: 'Lifecycle window',
        startsAt: '2026-09-05T10:00:00.000Z',
        endsAt: '2026-09-05T12:00:00.000Z',
        eventIds: [LIFECYCLE_EVENT_ID],
      });
      expect(campaign).toMatchObject({
        status: 'published',
        publicationProvenance: 'reviewed',
        publishedAt: expect.any(String),
      });
      const history = await createAuthorContentReadService(pool).getHistory({
        entityType: 'campaign',
        entityId: campaign.campaignId,
        page: 1,
        pageSize: 20,
      });
      expect(history.items.map((item) => item.action)).toEqual([
        'create',
        'submit',
        'approve',
        'publish',
      ]);

      const upcoming = await discoverEvent(
        LIFECYCLE_EVENT_ID,
        '2026-09-05T09:59:59.999Z',
      );
      expect(upcoming).toMatchObject({
        availability: 'upcoming',
        startsAt: '2026-09-05T10:00:00.000Z',
        endsAt: '2026-09-05T12:00:00.000Z',
      });

      const active = await evaluateEvent(
        LIFECYCLE_EVENT_ID,
        '2026-09-05T10:00:00.000Z',
      );
      expect(active).toMatchObject({ outcome: 'evaluated', eligible: true });

      const ended = await evaluateEvent(
        LIFECYCLE_EVENT_ID,
        '2026-09-05T12:00:00.000Z',
      );
      expect(ended).toEqual({
        outcome: 'unavailable',
        eventId: LIFECYCLE_EVENT_ID,
        reason: 'ended',
      });
    });

    it('allows adjacent reuse but rejects overlapping approved schedules', async () => {
      await createApprovedCampaign({
        title: 'Morning schedule',
        startsAt: '2026-09-06T08:00:00.000Z',
        endsAt: '2026-09-06T10:00:00.000Z',
        eventIds: [OVERLAP_EVENT_ID],
      });

      const overlapping = await createSubmittedCampaign({
        title: 'Overlapping schedule',
        startsAt: '2026-09-06T09:00:00.000Z',
        endsAt: '2026-09-06T11:00:00.000Z',
        eventIds: [OVERLAP_EVENT_ID],
      });
      await expect(
        createAuthorCampaignService(pool).approveCampaign({
          actorPlayerId: AUTHOR_TWO_ID,
          campaignId: overlapping.campaignId,
          expectedVersion: overlapping.version,
        }),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);

      await expect(
        createApprovedCampaign({
          title: 'Adjacent schedule',
          startsAt: '2026-09-06T10:00:00.000Z',
          endsAt: '2026-09-06T12:00:00.000Z',
          eventIds: [OVERLAP_EVENT_ID],
        }),
      ).resolves.toMatchObject({ status: 'approved' });
    });

    it('rejects empty publication, missing references, and non-intersecting events', async () => {
      const service = createAuthorCampaignService(pool);
      await expect(
        service.createCampaign({
          actorPlayerId: AUTHOR_ONE_ID,
          title: 'Missing event',
          startsAt: '2026-09-05T08:00:00.000Z',
          endsAt: '2026-09-05T10:00:00.000Z',
          eventIds: ['18350000-0000-4000-8000-000000000099'],
          trailIds: [],
        }),
      ).rejects.toBeInstanceOf(InvalidAuthorCampaignError);

      const empty = await createSubmittedCampaign({
        title: 'Empty submitted campaign',
        startsAt: '2026-09-05T08:00:00.000Z',
        endsAt: '2026-09-05T10:00:00.000Z',
      });
      const queue = await createAuthorContentReadService(pool).listReviewQueue({
        actorPlayerId: AUTHOR_TWO_ID,
        entityType: 'campaign',
        page: 1,
        pageSize: 20,
      });
      expect(queue.items).toContainEqual(
        expect.objectContaining({
          entityType: 'campaign',
          entityId: empty.campaignId,
          canReview: true,
        }),
      );
      await expect(
        service.approveCampaign({
          actorPlayerId: AUTHOR_TWO_ID,
          campaignId: empty.campaignId,
          expectedVersion: empty.version,
        }),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);

      const outside = await createSubmittedCampaign({
        title: 'Non-intersecting event',
        startsAt: '2026-09-05T08:00:00.000Z',
        endsAt: '2026-09-05T10:00:00.000Z',
        eventIds: [NON_INTERSECTING_EVENT_ID],
      });
      await expect(
        service.approveCampaign({
          actorPlayerId: AUTHOR_TWO_ID,
          campaignId: outside.campaignId,
          expectedVersion: outside.version,
        }),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);
    });

    it('serializes direct concurrent lifecycle updates for the same member', async () => {
      const first = await createSubmittedCampaign({
        title: 'Concurrent schedule A',
        startsAt: '2026-09-07T08:00:00.000Z',
        endsAt: '2026-09-07T10:00:00.000Z',
        eventIds: [CONCURRENT_EVENT_ID],
      });
      const second = await createSubmittedCampaign({
        title: 'Concurrent schedule B',
        startsAt: '2026-09-07T09:00:00.000Z',
        endsAt: '2026-09-07T11:00:00.000Z',
        eventIds: [CONCURRENT_EVENT_ID],
      });
      const firstClient = await pool.connect();
      const secondClient = await pool.connect();
      try {
        const results = await Promise.allSettled([
          approveCampaignWithDirectSql(firstClient, first.campaignId),
          approveCampaignWithDirectSql(secondClient, second.campaignId),
        ]);
        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = results.filter(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toMatchObject({ code: '23P01' });
      } finally {
        firstClient.release();
        secondClient.release();
      }
    });

    it('retires scheduled discovery while retaining attempts and trail progress', async () => {
      const campaign = await createPublishedCampaign({
        title: 'Historical campaign',
        startsAt: '2026-09-08T08:00:00.000Z',
        endsAt: '2026-09-08T16:00:00.000Z',
        eventIds: [HISTORY_EVENT_ID],
        trailIds: [trailId],
      });
      await insertCompletion(pool, HISTORY_EVENT_ID, PLAYER_ID);

      await expect(
        createAuthorEventService(pool).retireEvent({
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: HISTORY_EVENT_ID,
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);
      await expect(
        createAuthorTrailService(pool).retireTrail(AUTHOR_ONE_ID, trailId),
      ).rejects.toBeInstanceOf(AuthorTrailStateConflictError);

      const retired = await createAuthorCampaignService(pool).retireCampaign({
        actorPlayerId: AUTHOR_ONE_ID,
        campaignId: campaign.campaignId,
        expectedVersion: campaign.version,
      });
      expect(retired.status).toBe('retired');

      await expect(
        discoverEvent(HISTORY_EVENT_ID, '2026-09-08T10:00:00.000Z'),
      ).resolves.toBeUndefined();
      await expect(
        evaluateEvent(HISTORY_EVENT_ID, '2026-09-08T10:00:00.000Z'),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'unpublished',
      });

      await expect(
        createAuthorEventService(pool).retireEvent({
          actorPlayerId: AUTHOR_ONE_ID,
          eventId: HISTORY_EVENT_ID,
          expectedVersion: 0,
        }),
      ).resolves.toMatchObject({ authoringStatus: 'retired' });
      await expect(
        createAuthorTrailService(pool).retireTrail(AUTHOR_ONE_ID, trailId),
      ).resolves.toMatchObject({ status: 'retired' });

      const trail = await createPlayerTrailService(pool, {
        clock: () => new Date('2026-09-08T10:00:00.000Z'),
      }).getTrail(PLAYER_ID, trailId);
      expect(trail).toMatchObject({
        availability: 'retired',
        progressStatus: 'retired',
        completedStepCount: 1,
      });
      expect(trail.steps.map((step) => step.state)).toEqual([
        'completed',
        'unavailable',
      ]);

      const completions = await pool.query<{ completion_count: number }>(
        `select count(*)::int completion_count
         from public.event_completions
         where player_id = $1::uuid and event_id = $2::uuid`,
        [PLAYER_ID, HISTORY_EVENT_ID],
      );
      expect(completions.rows[0]?.completion_count).toBe(1);
    });

    async function createSubmittedCampaign(input: {
      title: string;
      startsAt: string;
      endsAt: string;
      eventIds?: string[];
      trailIds?: string[];
    }): Promise<AuthorCampaign> {
      const service = createAuthorCampaignService(pool);
      const draft = await service.createCampaign({
        actorPlayerId: AUTHOR_ONE_ID,
        eventIds: input.eventIds ?? [],
        trailIds: input.trailIds ?? [],
        ...input,
      });
      return service.submitCampaign({
        actorPlayerId: AUTHOR_ONE_ID,
        campaignId: draft.campaignId,
        expectedVersion: draft.version,
      });
    }

    async function createApprovedCampaign(input: {
      title: string;
      startsAt: string;
      endsAt: string;
      eventIds?: string[];
      trailIds?: string[];
    }): Promise<AuthorCampaign> {
      const submitted = await createSubmittedCampaign(input);
      return createAuthorCampaignService(pool).approveCampaign({
        actorPlayerId: AUTHOR_TWO_ID,
        campaignId: submitted.campaignId,
        expectedVersion: submitted.version,
      });
    }

    async function createPublishedCampaign(input: {
      title: string;
      startsAt: string;
      endsAt: string;
      eventIds?: string[];
      trailIds?: string[];
    }): Promise<AuthorCampaign> {
      const approved = await createApprovedCampaign(input);
      return createAuthorCampaignService(pool).publishCampaign({
        actorPlayerId: AUTHOR_ONE_ID,
        campaignId: approved.campaignId,
        expectedVersion: approved.version,
      });
    }

    async function discoverEvent(eventId: string, at: string) {
      const events = await createEventDiscoveryService(pool, {
        clock: () => new Date(at),
      }).list();
      return events.find((event) => event.eventId === eventId);
    }

    async function evaluateEvent(eventId: string, at: string) {
      return createEventEligibilityService(pool, {
        clock: () => new Date(at),
      }).evaluate({
        eventId,
        latitude: -26.19205,
        longitude: 28.03038,
      });
    }
  },
);

async function approveCampaignWithDirectSql(
  client: pg.PoolClient,
  campaignId: string,
): Promise<void> {
  await client.query('begin');
  try {
    await client.query(
      `update public.campaigns
       set status = 'approved',
           version = version + 1,
           reviewed_by_player_id = $2::uuid,
           reviewed_at = now(),
           updated_at = now()
       where id = $1::uuid`,
      [campaignId, AUTHOR_TWO_ID],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedPlayersAndEvents(database: Pick<pg.Pool, 'query'>) {
  for (const [id, name, role] of [
    [AUTHOR_ONE_ID, 'campaign_author_one', 'author'],
    [AUTHOR_TWO_ID, 'campaign_author_two', 'author'],
    [PLAYER_ID, 'campaign_player', 'player'],
  ] as const) {
    await database.query(
      `insert into public.players (
         id, auth_issuer, auth_subject, player_name, role
       ) values ($1, 'https://issuer.example/', $2, $3, $4)`,
      [id, `auth0|${name}`, name, role],
    );
  }

  for (const [id, title, startsAt, endsAt] of [
    [
      LIFECYCLE_EVENT_ID,
      'Lifecycle event',
      '2026-09-01T08:00:00Z',
      '2026-09-30T18:00:00Z',
    ],
    [
      OVERLAP_EVENT_ID,
      'Overlap event',
      '2026-09-01T08:00:00Z',
      '2026-09-30T18:00:00Z',
    ],
    [
      CONCURRENT_EVENT_ID,
      'Concurrent event',
      '2026-09-01T08:00:00Z',
      '2026-09-30T18:00:00Z',
    ],
    [
      NON_INTERSECTING_EVENT_ID,
      'November event',
      '2026-11-01T08:00:00Z',
      '2026-11-01T18:00:00Z',
    ],
    [
      HISTORY_EVENT_ID,
      'Historical event',
      '2026-09-01T08:00:00Z',
      '2026-09-30T18:00:00Z',
    ],
    [
      TRAIL_SECOND_EVENT_ID,
      'Historical trail second event',
      '2026-09-01T08:00:00Z',
      '2026-09-30T18:00:00Z',
    ],
  ] as const) {
    await database.query(
      `insert into public.events (
         id, title, location, radius_metres, starts_at, ends_at,
         is_published, authoring_status, publication_provenance
       ) values (
         $1, $2,
         st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
         75, $3::timestamptz, $4::timestamptz,
         true, 'published', 'controlled_seed'
       )`,
      [id, title, startsAt, endsAt],
    );
  }
}

async function insertCompletion(
  database: Pick<pg.Pool, 'connect'>,
  eventId: string,
  playerId: string,
) {
  const challengeId = '18360000-0000-4000-8000-000000000001';
  const attemptId = '18360000-0000-4000-8000-000000000002';
  const completionId = '18360000-0000-4000-8000-000000000003';
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into public.event_challenges (id, event_id, status)
       values ($1, $2, 'draft')`,
      [challengeId, eventId],
    );
    await client.query(
      'alter table public.challenge_attempts disable trigger challenge_attempts_snapshot_integrity',
    );
    await client.query(
      `insert into public.challenge_attempts (
         id, player_id, event_id, challenge_id, status, started_at,
         deadline, time_limit_seconds, average_difficulty, completed_at,
         completion_reason, score_correct, created_at, updated_at
       ) values (
         $1, $2, $3, $4, 'completed',
         '2026-09-08T09:00:00Z', '2026-09-08T09:01:30Z',
         90, 1.00, '2026-09-08T09:01:00Z', 'answered', 3,
         '2026-09-08T09:00:00Z', '2026-09-08T09:01:00Z'
       )`,
      [attemptId, playerId, eventId, challengeId],
    );
    await client.query(
      'alter table public.challenge_attempts enable trigger challenge_attempts_snapshot_integrity',
    );
    await client.query(
      `insert into public.event_completions (
         id, attempt_id, player_id, event_id, score_correct,
         average_difficulty, coins_awarded, reward_policy_version, completed_at
       ) values ($1, $2, $3, $4, 3, 1.00, 0, 'campaign-test',
                 '2026-09-08T09:01:00Z')`,
      [completionId, attemptId, playerId, eventId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
