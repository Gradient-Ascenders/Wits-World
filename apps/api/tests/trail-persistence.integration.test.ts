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
  AuthorTrailNotReadyError,
  AuthorTrailStateConflictError,
  createAuthorTrailService,
} from '../src/trails/author-trail-service.js';
import {
  createPlayerTrailService,
  NEARBY_UNVISITED_QUERY,
} from '../src/trails/player-trail-service.js';

const AUTHOR_ID = '17690000-0000-4000-8000-000000000001';
const OUT_OF_ORDER_PLAYER_ID = '17690000-0000-4000-8000-000000000002';
const OTHER_PLAYER_ID = '17690000-0000-4000-8000-000000000003';
const NEARBY_PLAYER_ID = '17690000-0000-4000-8000-000000000004';
const RETIRED_PLAYER_ID = '17690000-0000-4000-8000-000000000005';

const PROGRESS_ONE_ID = '17691000-0000-4000-8000-000000000001';
const PROGRESS_TWO_ID = '17691000-0000-4000-8000-000000000002';
const NEARBY_ONE_ID = '17691000-0000-4000-8000-000000000003';
const NEARBY_TWO_ID = '17691000-0000-4000-8000-000000000004';
const STANDALONE_ID = '17691000-0000-4000-8000-000000000005';
const FAR_EVENT_ID = '17691000-0000-4000-8000-000000000006';
const DRAFT_EVENT_ID = '17691000-0000-4000-8000-000000000007';
const RETIRED_ONE_ID = '17691000-0000-4000-8000-000000000008';
const RETIRED_TWO_ID = '17691000-0000-4000-8000-000000000009';

const NOW = new Date('2026-08-29T10:00:00.000Z');
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'ordered trail persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_trails_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      const migrations = await runMigrations(temporaryConfig);
      expect(migrations.applied.at(-1)).toBe('0027_create_ordered_trails.sql');

      pool = createDatabasePool(temporaryConfig);
      await seedPlayersAndEvents(pool);
    }, 60_000);

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

    it('creates constrained ordered membership while allowing event reuse across trails', async () => {
      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
         from pg_indexes
         where schemaname = 'public'
           and tablename in ('trails', 'trail_events')`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'trails_published_idx',
          'trails_retired_idx',
          'trail_events_event_idx',
          'trail_events_position_unique',
        ]),
      );

      const firstTrailId = await insertDraftTrail(pool, 'Constraint trail A');
      const secondTrailId = await insertDraftTrail(pool, 'Constraint trail B');
      await pool.query(
        `insert into public.trail_events (trail_id, event_id, position)
         values ($1, $2, 1)`,
        [firstTrailId, PROGRESS_ONE_ID],
      );

      await expect(
        pool.query(
          `insert into public.trail_events (trail_id, event_id, position)
           values ($1, $2, 1)`,
          [firstTrailId, PROGRESS_TWO_ID],
        ),
      ).rejects.toMatchObject({ constraint: 'trail_events_position_unique' });
      await expect(
        pool.query(
          `insert into public.trail_events (trail_id, event_id, position)
           values ($1, $2, 2)`,
          [firstTrailId, PROGRESS_ONE_ID],
        ),
      ).rejects.toMatchObject({ constraint: 'trail_events_pkey' });

      await expect(
        pool.query(
          `insert into public.trail_events (trail_id, event_id, position)
           values ($1, $2, 1)`,
          [secondTrailId, PROGRESS_ONE_ID],
        ),
      ).resolves.toBeDefined();

      const client = await pool.connect();
      try {
        await client.query('begin');
        const gapTrailId = await insertDraftTrail(client, 'Gap trail');
        await client.query(
          `insert into public.trail_events (trail_id, event_id, position)
           values ($1, $2, 2)`,
          [gapTrailId, PROGRESS_TWO_ID],
        );
        await expect(client.query('commit')).rejects.toThrow(
          'event positions must be contiguous from 1',
        );
        await client.query('rollback');
      } finally {
        client.release();
      }
    });

    it('manages draft reorder, publication, retirement, and audit atomically', async () => {
      const author = createAuthorTrailService(pool);
      const created = await author.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Author lifecycle trail',
        description: 'A draft that can be reordered.',
        eventIds: [PROGRESS_ONE_ID, PROGRESS_TWO_ID],
      });
      expect(created.status).toBe('draft');

      const reordered = await author.updateTrail({
        actorPlayerId: AUTHOR_ID,
        trailId: created.trailId,
        title: created.title,
        description: created.description,
        eventIds: [PROGRESS_TWO_ID, PROGRESS_ONE_ID],
      });
      expect(reordered.steps.map((step) => step.eventId)).toEqual([
        PROGRESS_TWO_ID,
        PROGRESS_ONE_ID,
      ]);

      const published = await author.publishTrail(AUTHOR_ID, created.trailId);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();

      await expect(
        author.updateTrail({
          actorPlayerId: AUTHOR_ID,
          trailId: created.trailId,
          title: 'Changed after publication',
          eventIds: [PROGRESS_ONE_ID, PROGRESS_TWO_ID],
        }),
      ).rejects.toBeInstanceOf(AuthorTrailStateConflictError);

      const retired = await author.retireTrail(AUTHOR_ID, created.trailId);
      expect(retired.status).toBe('retired');
      expect(retired.retiredAt).not.toBeNull();

      const audit = await pool.query<{ action: string }>(
        `select action
         from public.author_content_audit
         where entity_type = 'trail'
           and entity_id = $1::uuid
         order by occurred_at, id`,
        [created.trailId],
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        'create',
        'edit',
        'publish',
        'retire',
      ]);
    });

    it('rejects publication until every member event is available', async () => {
      const author = createAuthorTrailService(pool);
      const trail = await author.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Not ready trail',
        eventIds: [PROGRESS_ONE_ID, DRAFT_EVENT_ID],
      });

      await expect(
        author.publishTrail(AUTHOR_ID, trail.trailId),
      ).rejects.toBeInstanceOf(AuthorTrailNotReadyError);

      const stored = (await author.listTrails()).find(
        (candidate) => candidate.trailId === trail.trailId,
      );
      expect(stored?.status).toBe('draft');
    });

    it('derives an isolated longest prefix and accepts any authoritative completion', async () => {
      const author = createAuthorTrailService(pool);
      const trail = await author.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Progress prefix trail',
        eventIds: [PROGRESS_ONE_ID, PROGRESS_TWO_ID],
      });
      await author.publishTrail(AUTHOR_ID, trail.trailId);
      await insertCompletion(pool, {
        eventId: PROGRESS_TWO_ID,
        playerId: OUT_OF_ORDER_PLAYER_ID,
        scoreCorrect: 5,
        namespace: 20,
      });

      const players = createPlayerTrailService(pool, { clock: () => NOW });
      const outOfOrder = await players.getTrail(
        OUT_OF_ORDER_PLAYER_ID,
        trail.trailId,
      );
      expect(outOfOrder.completedStepCount).toBe(0);
      expect(outOfOrder.steps.map((step) => step.state)).toEqual([
        'current',
        'locked',
      ]);

      const isolated = await players.getTrail(OTHER_PLAYER_ID, trail.trailId);
      expect(isolated.completedStepCount).toBe(0);

      await insertCompletion(pool, {
        eventId: PROGRESS_ONE_ID,
        playerId: OUT_OF_ORDER_PLAYER_ID,
        scoreCorrect: 0,
        namespace: 21,
      });
      const caughtUp = await players.getTrail(
        OUT_OF_ORDER_PLAYER_ID,
        trail.trailId,
      );
      expect(caughtUp).toMatchObject({
        completedStepCount: 2,
        currentStepPosition: null,
        progressStatus: 'completed',
      });
      expect(caughtUp.steps.map((step) => step.state)).toEqual([
        'completed',
        'completed',
      ]);
    });

    it('shows retired history only to a player with progress', async () => {
      const author = createAuthorTrailService(pool);
      const trail = await author.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Historical trail',
        eventIds: [RETIRED_ONE_ID, RETIRED_TWO_ID],
      });
      await author.publishTrail(AUTHOR_ID, trail.trailId);
      await insertCompletion(pool, {
        eventId: RETIRED_ONE_ID,
        playerId: RETIRED_PLAYER_ID,
        scoreCorrect: 1,
        namespace: 22,
      });
      await author.retireTrail(AUTHOR_ID, trail.trailId);

      const players = createPlayerTrailService(pool, { clock: () => NOW });
      const retained = await players.getTrail(RETIRED_PLAYER_ID, trail.trailId);
      expect(retained).toMatchObject({
        publicationStatus: 'retired',
        progressStatus: 'retired',
        completedStepCount: 1,
      });
      expect(retained.steps[1]).toMatchObject({
        state: 'unavailable',
        unavailableReason: 'trail_retired',
      });

      await expect(
        players.getTrail(OTHER_PLAYER_ID, trail.trailId),
      ).rejects.toThrow('The requested trail was not found.');
    });

    it('returns active standalone and current nearby steps but excludes locked, completed, and distant events', async () => {
      const author = createAuthorTrailService(pool);
      const trail = await author.createTrail({
        actorPlayerId: AUTHOR_ID,
        title: 'Nearby trail',
        eventIds: [NEARBY_ONE_ID, NEARBY_TWO_ID],
      });
      await author.publishTrail(AUTHOR_ID, trail.trailId);
      const players = createPlayerTrailService(pool, { clock: () => NOW });
      const search = {
        playerId: NEARBY_PLAYER_ID,
        latitude: -26.19205,
        longitude: 28.03038,
        accuracyMetres: 20,
        maxDistanceMetres: 1_000,
        limit: 20,
      };

      const initial = await players.listNearbyUnvisited(search);
      expect(initial.map((event) => event.eventId)).toEqual(
        expect.arrayContaining([NEARBY_ONE_ID, STANDALONE_ID]),
      );
      expect(initial.map((event) => event.eventId)).not.toContain(
        NEARBY_TWO_ID,
      );
      expect(initial.map((event) => event.eventId)).not.toContain(FAR_EVENT_ID);

      await insertCompletion(pool, {
        eventId: NEARBY_ONE_ID,
        playerId: NEARBY_PLAYER_ID,
        scoreCorrect: 2,
        namespace: 23,
      });
      const advanced = await players.listNearbyUnvisited(search);
      expect(advanced.map((event) => event.eventId)).toEqual(
        expect.arrayContaining([NEARBY_TWO_ID, STANDALONE_ID]),
      );
      expect(advanced.map((event) => event.eventId)).not.toContain(
        NEARBY_ONE_ID,
      );
      expect(
        advanced.find((event) => event.eventId === NEARBY_TWO_ID)
          ?.trailContexts,
      ).toContainEqual({
        trailId: trail.trailId,
        title: trail.title,
        position: 2,
        totalSteps: 2,
      });
    });

    it('uses the event geography index for bounded nearby discovery', async () => {
      const client = await pool.connect();

      try {
        await client.query('set enable_seqscan = off');
        const result = await client.query<{ 'QUERY PLAN': string }>(
          `explain ${NEARBY_UNVISITED_QUERY}`,
          [OTHER_PLAYER_ID, NOW, 28.03038, -26.19205, 1_000, 20],
        );
        const plan = result.rows.map((row) => row['QUERY PLAN']).join('\n');

        expect(plan).toContain('events_location_gist_idx');
      } finally {
        client.release();
      }
    });
  },
);

async function seedPlayersAndEvents(
  database: Pick<pg.Pool, 'query'>,
): Promise<void> {
  const players = [
    [AUTHOR_ID, 'trail_author', 'author'],
    [OUT_OF_ORDER_PLAYER_ID, 'trail_out_of_order', 'player'],
    [OTHER_PLAYER_ID, 'trail_other', 'player'],
    [NEARBY_PLAYER_ID, 'trail_nearby', 'player'],
    [RETIRED_PLAYER_ID, 'trail_retired', 'player'],
  ] as const;

  for (const [id, playerName, role] of players) {
    await database.query(
      `insert into public.players (
         id, auth_issuer, auth_subject, player_name, role
       ) values ($1, 'https://issuer.example/', $2, $3, $4)`,
      [id, `auth0|${playerName}`, playerName, role],
    );
  }

  const events = [
    [PROGRESS_ONE_ID, 'Progress one', 28.03038, -26.19205, true],
    [PROGRESS_TWO_ID, 'Progress two', 28.0305, -26.1921, true],
    [NEARBY_ONE_ID, 'Nearby one', 28.03038, -26.19205, true],
    [NEARBY_TWO_ID, 'Nearby two', 28.0306, -26.1922, true],
    [STANDALONE_ID, 'Standalone', 28.031, -26.1925, true],
    [FAR_EVENT_ID, 'Far away', 18.4241, -33.9249, true],
    [DRAFT_EVENT_ID, 'Draft event', 28.0307, -26.1923, false],
    [RETIRED_ONE_ID, 'Historical one', 28.0308, -26.1924, true],
    [RETIRED_TWO_ID, 'Historical two', 28.0309, -26.1925, true],
  ] as const;

  for (const [id, title, longitude, latitude, isPublished] of events) {
    await database.query(
      `insert into public.events (
         id, title, location, radius_metres, starts_at, ends_at, is_published
       ) values (
         $1,
         $2,
         st_setsrid(st_makepoint($3, $4), 4326)::geography,
         75,
         '2026-08-29T08:00:00.000Z',
         '2026-08-29T12:00:00.000Z',
         $5
       )`,
      [id, title, longitude, latitude, isPublished],
    );
  }
}

async function insertDraftTrail(
  database: Pick<pg.Pool | pg.PoolClient, 'query'>,
  title: string,
): Promise<string> {
  const result = await database.query<{ id: string }>(
    `insert into public.trails (title)
     values ($1)
     returning id::text`,
    [title],
  );
  const id = result.rows[0]?.id;

  if (!id) {
    throw new Error('Trail fixture was not created.');
  }

  return id;
}

async function insertCompletion(
  database: Pick<pg.Pool, 'connect'>,
  input: {
    eventId: string;
    playerId: string;
    scoreCorrect: number;
    namespace: number;
  },
): Promise<void> {
  const challengeId = fixtureUuid(input.namespace, 1);
  const attemptId = fixtureUuid(input.namespace, 2);
  const completionId = fixtureUuid(input.namespace, 3);
  const client = await database.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.event_challenges (id, event_id, status)
       values ($1, $2, 'draft')`,
      [challengeId, input.eventId],
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
         '2026-08-29T09:00:00.000Z',
         '2026-08-29T09:01:30.000Z',
         90, 1.00, '2026-08-29T09:01:00.000Z',
         'answered', $5,
         '2026-08-29T09:00:00.000Z',
         '2026-08-29T09:01:00.000Z'
       )`,
      [
        attemptId,
        input.playerId,
        input.eventId,
        challengeId,
        input.scoreCorrect,
      ],
    );
    await client.query(
      'alter table public.challenge_attempts enable trigger challenge_attempts_snapshot_integrity',
    );
    await client.query(
      `insert into public.event_completions (
         id, attempt_id, player_id, event_id, score_correct,
         average_difficulty, coins_awarded, reward_policy_version, completed_at
       ) values (
         $1, $2, $3, $4, $5, 1.00, 0, 'trail-test',
         '2026-08-29T09:01:00.000Z'
       )`,
      [
        completionId,
        attemptId,
        input.playerId,
        input.eventId,
        input.scoreCorrect,
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

function fixtureUuid(namespace: number, value: number): string {
  return `176${namespace.toString().padStart(2, '0')}000-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}
