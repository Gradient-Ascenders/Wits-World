import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAuthorAnalyticsService,
  type AuthorAnalyticsDatabase,
} from '../src/analytics/author-analytics-service.js';
import { createEventProductAnalyticsRecorder } from '../src/analytics/event-product-aggregates.js';
import type { QuestionPerformanceService } from '../src/challenges/question-performance-service.js';
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

const EVENT_ACTIVE = '10000000-0000-4000-8000-000000000001';
const EVENT_IGNORED = '10000000-0000-4000-8000-000000000002';
const EVENT_BACKGROUND = '10000000-0000-4000-8000-000000000003';
const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001';
const ANALYTICS_TIME = new Date('2026-09-10T12:34:56.000Z');
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'advanced analytics database integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let databaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let rewardCardId: string;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      databaseName = `wits_advanced_analytics_${Date.now()}_${process.pid}`;
      await withDatabaseClient(administrationConfig, (client) =>
        client.query(`create database ${databaseName}`),
      );
      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${databaseName}`;
      const temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };
      await runMigrations(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
      rewardCardId = await seedAuthoritativeAnalyticsFixture();
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (administrationConfig && databaseName) {
        await withDatabaseClient(administrationConfig, (client) =>
          client.query(`drop database if exists ${databaseName} with (force)`),
        );
      }
    }, 30_000);

    it('atomically accumulates coarse product events under concurrent writes', async () => {
      const recorder = createEventProductAnalyticsRecorder(pool);

      await Promise.all(
        Array.from({ length: 12 }, () =>
          recorder.recordViews([{ eventId: EVENT_ACTIVE }], ANALYTICS_TIME),
        ),
      );
      await Promise.all(
        Array.from({ length: 12 }, () =>
          recorder.recordEligibility({ eventId: EVENT_ACTIVE }, ANALYTICS_TIME),
        ),
      );
      await Promise.all(
        Array.from({ length: 15 }, () =>
          recorder.recordViews([{ eventId: EVENT_IGNORED }], ANALYTICS_TIME),
        ),
      );

      const rows = await pool.query<{
        event_id: string;
        view_count: number;
        eligible_count: number;
        bucket_start: Date;
      }>(
        `select event_id::text, view_count, eligible_count, bucket_start
           from public.event_product_event_aggregates
          where event_id in ($1::uuid, $2::uuid)
          order by event_id`,
        [EVENT_ACTIVE, EVENT_IGNORED],
      );

      expect(rows.rows).toEqual([
        {
          event_id: EVENT_ACTIVE,
          view_count: 12,
          eligible_count: 12,
          bucket_start: new Date('2026-09-10T12:00:00.000Z'),
        },
        {
          event_id: EVENT_IGNORED,
          view_count: 15,
          eligible_count: 0,
          bucket_start: new Date('2026-09-10T12:00:00.000Z'),
        },
      ]);

      const columns = await pool.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'event_product_event_aggregates'
          order by ordinal_position`,
      );
      expect(columns.rows.map((row) => row.column_name)).not.toEqual(
        expect.arrayContaining([
          'player_id',
          'latitude',
          'longitude',
          'accuracy_metres',
          'auth_subject',
        ]),
      );
    });

    it('combines product events with authoritative attempts and completions and identifies ignored locations', async () => {
      const service = createAnalyticsService(pool);

      const popular = await service.listEventLocations({
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        mode: 'popular',
        page: 1,
        pageSize: 25,
      });
      const ignored = await service.listEventLocations({
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        mode: 'ignored',
        page: 1,
        pageSize: 25,
      });

      expect(popular.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventId: EVENT_ACTIVE,
            locationKind: 'authored',
            locationId: EVENT_ACTIVE,
            viewCount: 12,
            eligibleCount: 12,
            startCount: 12,
            completionCount: 12,
            suppressed: false,
          }),
        ]),
      );
      expect(ignored.items).toEqual([
        expect.objectContaining({
          eventId: EVENT_IGNORED,
          viewCount: 15,
          eligibleCount: 0,
          startCount: 0,
          completionCount: 0,
          suppressed: false,
        }),
      ]);
    });

    it('counts card issuance from immutable reward history without depending on current ownership', async () => {
      const service = createAnalyticsService(pool);
      const ownership = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from public.player_cards
          where source_completion_id is not null`,
      );
      expect(ownership.rows[0]?.count).toBe(0);

      const result = await service.listCardIssuance({
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        page: 1,
        pageSize: 100,
      });
      const card = result.items.find(
        (item) => item.cardDefinitionId === rewardCardId,
      );

      expect(card).toMatchObject({
        issuanceCount: 12,
        issuancesPer100Completions: 100,
        suppressed: false,
      });
      expect(
        result.rarities.find((item) => item.rarity === card?.rarity),
      ).toMatchObject({
        issuanceCount: 12,
        issuancesPer100Completions: 100,
        suppressed: false,
      });
    });

    it('suppresses rarity totals that would reveal a suppressed sibling card count', async () => {
      const sibling = await pool.query<{ id: string }>(
        `select sibling.id::text
           from public.card_definitions primary_card
           join public.card_definitions sibling
             on sibling.rarity = primary_card.rarity
            and sibling.id <> primary_card.id
          where primary_card.id = $1::uuid
          order by sibling.id
          limit 1`,
        [rewardCardId],
      );
      const siblingCardId = sibling.rows[0]?.id;
      if (!siblingCardId) {
        throw new Error('Expected a same-rarity sibling catalogue card.');
      }

      await pool.query(
        `insert into public.event_completion_card_rewards (
           completion_id, reward_position, card_definition_id, awarded_at
         )
         select md5('analytics-completion-' || number)::uuid,
                2,
                $1::uuid,
                '2026-09-10T10:01:00Z'::timestamptz + number * interval '1 minute'
           from generate_series(1, 3) number`,
        [siblingCardId],
      );

      const result = await createAnalyticsService(pool).listCardIssuance({
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        page: 1,
        pageSize: 100,
      });
      const disclosedCard = result.items.find(
        (item) => item.cardDefinitionId === rewardCardId,
      );
      const suppressedSibling = result.items.find(
        (item) => item.cardDefinitionId === siblingCardId,
      );
      const rarity = result.rarities.find(
        (item) => item.rarity === disclosedCard?.rarity,
      );

      expect(disclosedCard).toMatchObject({
        issuanceCount: 12,
        suppressed: false,
      });
      expect(suppressedSibling).toMatchObject({
        issuanceCount: null,
        issuancesPer100Completions: null,
        suppressed: true,
      });
      expect(rarity).toMatchObject({
        issuanceCount: null,
        issuancesPer100Completions: null,
        suppressed: true,
      });
    });

    it('meets the documented representative database execution target', async () => {
      const captured: Array<{ statement: string; values: unknown[] }> = [];
      const capturingDatabase: AuthorAnalyticsDatabase = {
        async query<T extends import('pg').QueryResultRow>(
          statement: string,
          values: unknown[] = [],
        ) {
          captured.push({ statement, values });
          return pool.query<T>(statement, values);
        },
      };
      const service = createAnalyticsService(capturingDatabase);

      await service.listEventLocations({
        fromDate: '2025-01-01',
        toDate: '2025-01-02',
        mode: 'all',
        page: 1,
        pageSize: 25,
      });
      await service.listCardIssuance({
        fromDate: '2026-09-10',
        toDate: '2026-09-11',
        page: 1,
        pageSize: 25,
      });

      for (const capturedQuery of captured) {
        const plan = await pool.query<{ 'QUERY PLAN': string }>(
          `explain (analyze, buffers, format text) ${capturedQuery.statement}`,
          capturedQuery.values,
        );
        const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
        expect(text).toMatch(/Execution Time: \d/);
        expect(text).toMatch(/Buffers:/);
        const executionTime = Number(
          /Execution Time: ([\d.]+)/.exec(text)?.[1],
        );
        expect(executionTime).toBeLessThan(1_000);
      }

      const locationPlan = await pool.query<{ 'QUERY PLAN': string }>(
        `explain (analyze, buffers, format text)
         select event_id
           from public.event_product_event_aggregates
          where bucket_start >= '2025-01-01T00:00:00Z'::timestamptz
            and bucket_start < '2025-01-02T00:00:00Z'::timestamptz`,
      );
      expect(
        locationPlan.rows.map((row) => row['QUERY PLAN']).join('\n'),
      ).toMatch(/event_product_event_aggregates_bucket_idx/);
    });

    async function seedAuthoritativeAnalyticsFixture(): Promise<string> {
      await pool.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at
         ) values
           ($1::uuid, 'Active analytics event', st_setsrid(st_makepoint(28.03, -26.19), 4326)::geography, 75, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
           ($2::uuid, 'Ignored analytics event', st_setsrid(st_makepoint(28.04, -26.20), 4326)::geography, 75, '2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'),
           ($3::uuid, 'Background analytics event', st_setsrid(st_makepoint(28.05, -26.21), 4326)::geography, 75, '2025-01-01T00:00:00Z', '2028-01-01T00:00:00Z')`,
        [EVENT_ACTIVE, EVENT_IGNORED, EVENT_BACKGROUND],
      );
      await pool.query(
        `insert into public.event_challenges (id, event_id, format)
         values ($1::uuid, $2::uuid, 'multiple_choice')`,
        [CHALLENGE_ID, EVENT_ACTIVE],
      );

      await pool.query(
        `insert into public.event_product_event_aggregates (
           event_id, location_key, bucket_start, view_count, eligible_count
         )
         select $1::uuid,
                $1::uuid,
                ('2024-01-01T00:00:00Z'::timestamptz + number * interval '1 hour'),
                1,
                0
           from generate_series(0, 19999) number`,
        [EVENT_BACKGROUND],
      );

      await pool.query(
        `insert into public.players (id, auth_issuer, auth_subject, role)
         select md5('analytics-player-' || number)::uuid,
                'https://analytics.example.test/',
                'auth0|analytics-' || number,
                'player'
           from generate_series(1, 12) number`,
      );

      // These rows exercise start/completion analytics rather than challenge
      // snapshot integrity. The existing question-performance DB suite covers
      // complete attempt snapshots, so disable only the user-defined attempt
      // triggers while creating this compact authoritative completion fixture.
      await pool.query(
        'alter table public.challenge_attempts disable trigger user',
      );
      try {
        await pool.query(
          `insert into public.challenge_attempts (
             id, player_id, event_id, challenge_id, status,
             started_at, deadline, time_limit_seconds, average_difficulty,
             completed_at, completion_reason, score_correct
           )
           select md5('analytics-attempt-' || number)::uuid,
                  md5('analytics-player-' || number)::uuid,
                  $1::uuid,
                  $2::uuid,
                  'completed',
                  '2026-09-10T10:00:00Z'::timestamptz + number * interval '1 minute',
                  '2026-09-10T10:01:30Z'::timestamptz + number * interval '1 minute',
                  90,
                  1.00,
                  '2026-09-10T10:01:00Z'::timestamptz + number * interval '1 minute',
                  'answered',
                  5
             from generate_series(1, 12) number`,
          [EVENT_ACTIVE, CHALLENGE_ID],
        );
      } finally {
        await pool.query(
          'alter table public.challenge_attempts enable trigger user',
        );
      }

      await pool.query(
        `insert into public.event_completions (
           id, attempt_id, player_id, event_id, score_correct,
           average_difficulty, coins_awarded, reward_policy_version, completed_at
         )
         select md5('analytics-completion-' || number)::uuid,
                md5('analytics-attempt-' || number)::uuid,
                md5('analytics-player-' || number)::uuid,
                $1::uuid,
                5,
                1.00,
                0,
                'analytics-test-v1',
                '2026-09-10T10:01:00Z'::timestamptz + number * interval '1 minute'
           from generate_series(1, 12) number`,
        [EVENT_ACTIVE],
      );

      const card = await pool.query<{ id: string }>(
        `select id::text
           from public.card_definitions
          where reward_eligible = true
          order by id
          limit 1`,
      );
      const cardId = card.rows[0]?.id;
      if (!cardId)
        throw new Error('Expected a reward-eligible catalogue card.');

      await pool.query(
        `insert into public.event_completion_card_rewards (
           completion_id, reward_position, card_definition_id, awarded_at
         )
         select md5('analytics-completion-' || number)::uuid,
                1,
                $1::uuid,
                '2026-09-10T10:01:00Z'::timestamptz + number * interval '1 minute'
           from generate_series(1, 12) number`,
        [cardId],
      );

      return cardId;
    }
  },
);

function createAnalyticsService(database: AuthorAnalyticsDatabase) {
  const questionPerformance: QuestionPerformanceService = {
    async list() {
      return {
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        minimumSampleSize: 10,
        problematicIncorrectRate: 0.7,
      };
    },
  };
  return createAuthorAnalyticsService(database, questionPerformance);
}
