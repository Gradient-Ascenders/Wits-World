import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import {
  runMigrations,
  type MigrationResult,
} from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';
import {
  checkDatabaseReadiness,
  type DatabaseReadiness,
} from '../src/database/readiness.js';
import { runBasicDemoSeeds } from '../src/database/seeds.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createEventEligibilityService } from '../src/events/event-eligibility.js';
import { evaluateReachabilityWithAccuracy } from '../src/events/location-claim.js';

const DEMO_EVENT_ID = '00000000-0000-4000-8000-000000000018';
const DEMO_TRAIL_ID = '00000000-0000-4000-8000-000000000177';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

async function insertLegacyPublishedDemoQuestion(
  config: DatabaseConfig,
): Promise<void> {
  await withDatabaseClient(config, async (client) => {
    await client.query('begin');

    try {
      await client.query(
        `insert into public.challenge_questions (
           id, challenge_id, prompt, difficulty, explanation, status
         ) values (
           md5('wits-world-sprint-1-demo-question:great-hall-campus')::uuid,
           md5('wits-world-sprint-1-demo-challenge')::uuid,
           'On which Wits campus is the Great Hall located?',
           1,
           null,
           'draft'
         )`,
      );
      await client.query(
        `insert into public.challenge_choices (
           id, question_id, authoring_position, choice_text
         )
         select
           md5(
             'wits-world-sprint-1-demo-choice:great-hall-campus:' ||
             choice.authoring_position
           )::uuid,
           md5(
             'wits-world-sprint-1-demo-question:great-hall-campus'
           )::uuid,
           choice.authoring_position,
           choice.choice_text
         from (
           values
             (1, 'West Campus'),
             (2, 'East Campus'),
             (3, 'Parktown Campus'),
             (4, 'Education Campus')
         ) choice(authoring_position, choice_text)`,
      );
      await client.query(
        `insert into private.challenge_answer_keys (
           question_id, accepted_choice_id
         ) values (
           md5(
             'wits-world-sprint-1-demo-question:great-hall-campus'
           )::uuid,
           md5(
             'wits-world-sprint-1-demo-choice:great-hall-campus:2'
           )::uuid
         )`,
      );
      await client.query(
        `update public.challenge_questions
            set status = 'published',
                version = version + 1,
                publication_provenance = 'controlled_seed',
                updated_at = now()
          where id = md5(
            'wits-world-sprint-1-demo-question:great-hall-campus'
          )::uuid`,
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

describe.skipIf(!runIntegrationTests)('event database integration', () => {
  let administrationConfig: DatabaseConfig;
  let migrationResult: MigrationResult;
  let readiness: DatabaseReadiness;
  let rerunMigrationResult: MigrationResult;
  let temporaryConfig: DatabaseConfig;
  let temporaryDatabaseName: string;

  beforeAll(async () => {
    loadApiEnvironment();
    administrationConfig = buildDatabaseConfig({ target: 'test' });
    temporaryDatabaseName = `wits_quest_event_${Date.now()}_${process.pid}`;

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(`create database ${temporaryDatabaseName}`);
    });

    const temporaryUrl = new URL(administrationConfig.connectionString);
    temporaryUrl.pathname = `/${temporaryDatabaseName}`;
    temporaryConfig = {
      ...administrationConfig,
      connectionString: temporaryUrl.toString(),
    };

    migrationResult = await runMigrations(temporaryConfig);
    readiness = await checkDatabaseReadiness(temporaryConfig);
    await runBasicDemoSeeds(temporaryConfig);
    await insertLegacyPublishedDemoQuestion(temporaryConfig);
    await runBasicDemoSeeds(temporaryConfig);
    rerunMigrationResult = await runMigrations(temporaryConfig);
  }, 90_000);

  afterAll(async () => {
    if (!administrationConfig || !temporaryDatabaseName) {
      return;
    }

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      );
    });
  }, 30_000);

  it('migrates an empty database and enforces the event fixture contract', async () => {
    expect(migrationResult).toEqual({
      applied: [
        '0001_enable_postgis.sql',
        '0002_create_events.sql',
        '0003_create_players.sql',
        '0004_create_account_deletion_requests.sql',
        '0005_create_challenge_definitions.sql',
        '0006_create_challenge_attempts.sql',
        '0007_create_cards_rewards_and_ownership.sql',
        '0008_allow_multiple_event_reward_cards.sql',
        '0009_create_card_catalogue_and_starter_grants.sql',
        '0010_add_card_modifier_metadata.sql',
        '0011_create_saved_decks.sql',
        '0012_create_cpu_matches.sql',
        '0013_add_author_content_foundation.sql',
        '0014_harden_author_challenge_lifecycle.sql',
        '0015_add_card_authoring_lifecycle.sql',
        '0016_add_event_authoring_lifecycle.sql',
        '0017_resolve_edge_card_definition_name.sql',
        '0018_enforce_card_definition_name_uniqueness.sql',
        '0019_add_player_display_name.sql',
        '0019_limit_creature_move_positions.sql',
        '0020_replace_display_name_with_player_name.sql',
        '0021_enforce_player_name_policy.sql',
        '0022_tighten_player_name_policy.sql',
        '0023_rebalance_canonical_card_roster.sql',
        '0024_complete_account_deletion_retention.sql',
        '0025_add_ordering_challenges.sql',
        '0026_create_player_progression.sql',
        '0027_create_ordered_trails.sql',
        '0028_create_asynchronous_pvp_persistence.sql',
        '0029_curate_author_content_lifecycle.sql',
        '0030_create_campaign_scheduling.sql',
        '0031_create_movement_evidence.sql',
        '0032_add_movement_eligibility_decisions.sql',
        '0033_add_async_pvp_invitation_invalidation.sql',
        '0034_retire_coin_rewards.sql',
        '0035_deny_deleted_identity_tokens.sql',
        '0036_remove_duplicate_indexes.sql',
        '0037_add_async_pvp_voluntary_resignation.sql',
        '0038_add_question_performance_analytics_indexes.sql',
        '0039_add_async_pvp_invitation_cancellation.sql',
        '0040_add_offline_challenge_attempts.sql',
        '0041_complete_card_catalogue.sql',
        '0042_implement_card_evolution.sql',
        '0043_add_content_source_evidence.sql',
        '0044_create_live_pvp_persistence.sql',
        '0045_create_event_placement_persistence.sql',
        '0046_persist_longitudinal_trust.sql',
        '0047_persist_ranked_competition.sql',
        '0048_implement_trust_scoring_and_enforcement.sql',
        '0049_enable_event_placement_services.sql',
        '0050_create_ranked_standings_snapshots.sql',
        '0051_allow_ranked_acceptance_withdrawal.sql',
        '0052_ranked_invalid_proposal_cooldowns.sql',
        '0053_persist_contested_territory.sql',
        '0054_implement_contested_territory_runtime.sql',
        '0055_persist_versioned_card_trades.sql',
        '0056_add_card_trade_submission_receipts.sql',
        '0057_create_advanced_analytics.sql',
      ],
      skipped: [],
    });
    expect(rerunMigrationResult).toEqual({
      applied: [],
      skipped: [
        '0001_enable_postgis.sql',
        '0002_create_events.sql',
        '0003_create_players.sql',
        '0004_create_account_deletion_requests.sql',
        '0005_create_challenge_definitions.sql',
        '0006_create_challenge_attempts.sql',
        '0007_create_cards_rewards_and_ownership.sql',
        '0008_allow_multiple_event_reward_cards.sql',
        '0009_create_card_catalogue_and_starter_grants.sql',
        '0010_add_card_modifier_metadata.sql',
        '0011_create_saved_decks.sql',
        '0012_create_cpu_matches.sql',
        '0013_add_author_content_foundation.sql',
        '0014_harden_author_challenge_lifecycle.sql',
        '0015_add_card_authoring_lifecycle.sql',
        '0016_add_event_authoring_lifecycle.sql',
        '0017_resolve_edge_card_definition_name.sql',
        '0018_enforce_card_definition_name_uniqueness.sql',
        '0019_add_player_display_name.sql',
        '0019_limit_creature_move_positions.sql',
        '0020_replace_display_name_with_player_name.sql',
        '0021_enforce_player_name_policy.sql',
        '0022_tighten_player_name_policy.sql',
        '0023_rebalance_canonical_card_roster.sql',
        '0024_complete_account_deletion_retention.sql',
        '0025_add_ordering_challenges.sql',
        '0026_create_player_progression.sql',
        '0027_create_ordered_trails.sql',
        '0028_create_asynchronous_pvp_persistence.sql',
        '0029_curate_author_content_lifecycle.sql',
        '0030_create_campaign_scheduling.sql',
        '0031_create_movement_evidence.sql',
        '0032_add_movement_eligibility_decisions.sql',
        '0033_add_async_pvp_invitation_invalidation.sql',
        '0034_retire_coin_rewards.sql',
        '0035_deny_deleted_identity_tokens.sql',
        '0036_remove_duplicate_indexes.sql',
        '0037_add_async_pvp_voluntary_resignation.sql',
        '0038_add_question_performance_analytics_indexes.sql',
        '0039_add_async_pvp_invitation_cancellation.sql',
        '0040_add_offline_challenge_attempts.sql',
        '0041_complete_card_catalogue.sql',
        '0042_implement_card_evolution.sql',
        '0043_add_content_source_evidence.sql',
        '0044_create_live_pvp_persistence.sql',
        '0045_create_event_placement_persistence.sql',
        '0046_persist_longitudinal_trust.sql',
        '0047_persist_ranked_competition.sql',
        '0048_implement_trust_scoring_and_enforcement.sql',
        '0049_enable_event_placement_services.sql',
        '0050_create_ranked_standings_snapshots.sql',
        '0051_allow_ranked_acceptance_withdrawal.sql',
        '0052_ranked_invalid_proposal_cooldowns.sql',
        '0053_persist_contested_territory.sql',
        '0054_implement_contested_territory_runtime.sql',
        '0055_persist_versioned_card_trades.sql',
        '0056_add_card_trade_submission_receipts.sql',
        '0057_create_advanced_analytics.sql',
      ],
    });
    expect(readiness).toMatchObject({
      database: temporaryDatabaseName,
      postgisVersion: expect.stringContaining('POSTGIS='),
    });

    await withDatabaseClient(temporaryConfig, async (client) => {
      const redundantIndexes = [
        'card_moves_definition_position_idx',
        'card_effects_definition_position_idx',
        'cpu_match_cards_match_idx',
        'cpu_match_rounds_match_idx',
        'cpu_match_actions_match_idx',
        'async_pvp_match_actions_history_idx',
      ];
      const retainedIndexes = [
        'card_moves_card_position_unique',
        'card_effects_card_position_unique',
        'cpu_match_cards_primary_key',
        'cpu_match_rounds_identity_unique',
        'cpu_match_actions_identity_unique',
        'async_pvp_match_actions_sequence_unique',
      ];
      const removed = await client.query(
        `select indexname from pg_indexes
          where schemaname = 'public' and indexname = any($1::text[])`,
        [redundantIndexes],
      );
      expect(removed.rows).toEqual([]);

      const retained = await client.query<{ name: string }>(
        `select c.relname as name
           from pg_index i
           join pg_class c on c.oid = i.indexrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_constraint k on k.conindid = i.indexrelid
          where n.nspname = 'public' and c.relname = any($1::text[])
            and i.indisunique and i.indisvalid and i.indisready
            and k.contype in ('p', 'u')`,
        [retainedIndexes],
      );
      expect(retained.rows.map((row) => row.name).sort()).toEqual(
        [...retainedIndexes].sort(),
      );

      const seededEvent = await client.query<{
        authoring_status: string;
        count: string;
        ends_at: Date;
        is_published: boolean;
        latitude: number;
        longitude: number;
        radius_metres: number;
        starts_at: Date;
        title: string;
        publication_provenance: string;
      }>(
        `select (select count(*) from public.events)::text as count,
                title,
                st_x(location::geometry) as longitude,
                st_y(location::geometry) as latitude,
                radius_metres,
                starts_at,
                ends_at,
                is_published,
                authoring_status,
                publication_provenance
           from public.events
          where id = $1`,
        [DEMO_EVENT_ID],
      );

      expect(seededEvent.rows).toHaveLength(1);
      expect(seededEvent.rows[0]).toMatchObject({
        count: '8',
        authoring_status: 'published',
        is_published: true,
        latitude: -26.19205,
        longitude: 28.03038,
        radius_metres: 75,
        title: 'Sprint 1 Demo - Wits Great Hall',
        publication_provenance: 'controlled_seed',
      });
      expect(seededEvent.rows[0]?.starts_at.toISOString()).toBe(
        '2026-07-31T22:00:00.000Z',
      );
      expect(seededEvent.rows[0]?.ends_at.toISOString()).toBe(
        '2026-08-25T22:00:00.000Z',
      );

      await expectInvalidEvent(client, { title: '   ' });
      await expectInvalidEvent(client, { location: null });
      await expectInvalidEvent(client, { radiusMetres: 0 });
      await expectInvalidEvent(client, {
        endsAt: '2026-08-01T00:00:00+02:00',
      });

      const locationColumn = await client.query<{ data_type: string }>(
        `select format_type(attribute.atttypid, attribute.atttypmod) as data_type
           from pg_attribute attribute
           join pg_class relation on relation.oid = attribute.attrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname = 'events'
            and attribute.attname = 'location'`,
      );
      expect(locationColumn.rows[0]?.data_type).toBe('geography(Point,4326)');

      const locationIndex = await client.query<{ indexdef: string }>(
        `select indexdef
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'events'
            and indexname = 'events_location_gist_idx'`,
      );
      expect(locationIndex.rows[0]?.indexdef.toLowerCase()).toContain(
        'using gist (location)',
      );
    });
  }, 30_000);

  it('discovers the seeded event through the database service', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const service = createEventDiscoveryService(client, {
        clock: () => new Date('2026-08-10T12:00:00.000Z'),
      });

      await expect(service.list()).resolves.toEqual([
        expect.objectContaining({
          availability: 'ended',
          eventId: '00000000-0000-4000-8000-000000000021',
          title: 'Basic Demo - Expired Campus Event',
        }),
        expect.objectContaining({
          availability: 'active',
          eventId: DEMO_EVENT_ID,
          radiusMetres: 75,
          title: 'Sprint 1 Demo - Wits Great Hall',
        }),
        expect.objectContaining({
          availability: 'active',
          eventId: '00000000-0000-4000-8000-000000000019',
          radiusMetres: 75,
          title: 'Basic Demo - Wits Library',
        }),
        expect.objectContaining({
          availability: 'upcoming',
          eventId: '00000000-0000-4000-8000-000000000020',
          title: 'Basic Demo - Upcoming Campus Event',
        }),
        expect.objectContaining({
          availability: 'upcoming',
          eventId: '00000000-0000-4000-8000-000000000023',
          title: 'Trail Demo - Great Hall',
        }),
        expect.objectContaining({
          availability: 'upcoming',
          eventId: '00000000-0000-4000-8000-000000000024',
          title: 'Trail Demo - Library Lawns',
        }),
        expect.objectContaining({
          availability: 'upcoming',
          eventId: '00000000-0000-4000-8000-000000000025',
          title: 'Trail Demo - Senate House',
        }),
      ]);
    });
  }, 30_000);

  it('seeds an idempotent three-stop trail with playable challenges', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const fixture = await client.query<{
        answer_key_count: string;
        challenge_count: string;
        choice_count: string;
        event_count: string;
        published_question_count: string;
        status: string;
        title: string;
      }>(
        `select
           trail.title,
           trail.status,
           count(distinct step.event_id)::text as event_count,
           count(distinct challenge.id)::text as challenge_count,
           count(distinct question.id) filter (
             where question.status = 'published'
           )::text as published_question_count,
           count(distinct choice.id)::text as choice_count,
           count(distinct answer_key.question_id)::text as answer_key_count
         from public.trails trail
         join public.trail_events step
           on step.trail_id = trail.id
         join public.event_challenges challenge
           on challenge.event_id = step.event_id
          and challenge.status = 'published'
         join public.challenge_questions question
           on question.challenge_id = challenge.id
         join public.challenge_choices choice
           on choice.question_id = question.id
         join private.challenge_answer_keys answer_key
           on answer_key.question_id = question.id
         where trail.id = $1::uuid
         group by trail.id, trail.title, trail.status`,
        [DEMO_TRAIL_ID],
      );

      expect(fixture.rows).toEqual([
        {
          answer_key_count: '15',
          challenge_count: '3',
          choice_count: '60',
          event_count: '3',
          published_question_count: '15',
          status: 'published',
          title: 'Campus Highlights Trail',
        },
      ]);
    });
  }, 30_000);

  it('seeds one published five-question challenge for the Great Hall event', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const seededChallenge = await client.query<{
        choice_count: string;
        challenge_count: string;
        key_count: string;
        legacy_retired_question_count: string;
        nonblank_explanation_count: string;
        published_question_count: string;
        valid_question_count: string;
      }>(
        `
          select
            count(distinct challenge.id)::text as challenge_count,
            count(distinct question.id) filter (
              where question.status = 'published'
            )::text as published_question_count,
            count(distinct question.id) filter (
              where question.status = 'published'
                and btrim(question.explanation) <> ''
            )::text as nonblank_explanation_count,
            count(distinct choice.id) filter (
              where question.status = 'published'
            )::text as choice_count,
            count(distinct answer_key.question_id) filter (
              where question.status = 'published'
            )::text as key_count,
            (
              select count(*)::text
              from public.challenge_questions legacy_question
              join public.event_challenges legacy_challenge
                on legacy_challenge.id = legacy_question.challenge_id
              where legacy_challenge.event_id = $1::uuid
                and legacy_question.id = md5(
                  'wits-world-sprint-1-demo-question:great-hall-campus'
                )::uuid
                and legacy_question.status = 'retired'
            ) as legacy_retired_question_count,
            (
              select count(*)::text
              from (
                select
                  question.id,
                  count(distinct choice.id) as choice_count,
                  count(distinct answer_key.question_id) as key_count
                from public.event_challenges challenge
                join public.challenge_questions question
                  on question.challenge_id = challenge.id
                left join public.challenge_choices choice
                  on choice.question_id = question.id
                left join private.challenge_answer_keys answer_key
                  on answer_key.question_id = question.id
                where challenge.event_id = $1::uuid
                  and challenge.status = 'published'
                  and question.status = 'published'
                group by question.id
              ) question_integrity
              where choice_count = 4
                and key_count = 1
            ) as valid_question_count
          from public.event_challenges challenge
          left join public.challenge_questions question
            on question.challenge_id = challenge.id
          left join public.challenge_choices choice
            on choice.question_id = question.id
          left join private.challenge_answer_keys answer_key
            on answer_key.question_id = question.id
          where challenge.event_id = $1::uuid
            and challenge.status = 'published'
        `,
        [DEMO_EVENT_ID],
      );

      expect(seededChallenge.rows).toEqual([
        {
          challenge_count: '1',
          choice_count: '20',
          key_count: '5',
          legacy_retired_question_count: '1',
          nonblank_explanation_count: '5',
          published_question_count: '5',
          valid_question_count: '5',
        },
      ]);
    });
  }, 30_000);

  it('seeds representative Basic availability states', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const states = await client.query<{
        ends_at: Date;
        event_id: string;
        is_published: boolean;
        starts_at: Date;
      }>(
        `select
           id::text as event_id,
           starts_at,
           ends_at,
           is_published
         from public.events
         where id = any($1::uuid[])
         order by id`,
        [
          [
            '00000000-0000-4000-8000-000000000018',
            '00000000-0000-4000-8000-000000000019',
            '00000000-0000-4000-8000-000000000020',
            '00000000-0000-4000-8000-000000000021',
            '00000000-0000-4000-8000-000000000022',
          ],
        ],
      );

      expect(states.rows).toHaveLength(5);
      expect(states.rows.filter((event) => event.is_published)).toHaveLength(4);
      expect(states.rows[0]?.event_id).toBe(
        '00000000-0000-4000-8000-000000000018',
      );
      expect(states.rows[2]?.starts_at.getTime()).toBeGreaterThan(
        new Date('2026-08-10T12:00:00.000Z').getTime(),
      );
      expect(states.rows[3]?.ends_at.getTime()).toBeLessThan(
        new Date('2026-08-10T12:00:00.000Z').getTime(),
      );
      expect(states.rows[4]?.is_published).toBe(false);
    });
  }, 30_000);

  it('produces reachable, unreachable, and ambiguous results from PostGIS distances', async () => {
    const evaluatedAt = new Date('2026-08-10T12:00:00.000Z');

    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at, is_published,
           authoring_status, publication_provenance
         ) values
           ($1, 'Unpublished test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $5, $6, false, 'draft', null),
           ($2, 'Future test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $6, $7, true, 'published', 'controlled_seed'),
           ($3, 'Ended test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $4, $5, true, 'published', 'controlled_seed')
         on conflict (id) do nothing`,
        [
          '00000000-0000-4000-8000-000000000091',
          '00000000-0000-4000-8000-000000000092',
          '00000000-0000-4000-8000-000000000093',
          '2026-08-01T00:00:00.000Z',
          '2026-08-05T00:00:00.000Z',
          '2026-08-15T00:00:00.000Z',
          '2026-08-20T00:00:00.000Z',
        ],
      );

      const boundaryPoint = await client.query<{
        latitude: number;
        longitude: number;
      }>(
        `select st_y(projected.location::geometry) as latitude,
                st_x(projected.location::geometry) as longitude
           from public.events event
          cross join lateral (
            select st_project(event.location, 70, radians(90)) as location
          ) projected
          where event.id = $1`,
        [DEMO_EVENT_ID],
      );
      const boundaryCoordinates = boundaryPoint.rows[0];

      if (!boundaryCoordinates) {
        throw new Error('Expected a projected boundary test point.');
      }

      const service = createEventEligibilityService(client, {
        clock: () => evaluatedAt,
      });
      const eventCentre = await service.evaluate({
        eventId: DEMO_EVENT_ID,
        latitude: -26.19205,
        longitude: 28.03038,
      });
      const outsideRadius = await service.evaluate({
        eventId: DEMO_EVENT_ID,
        latitude: -26.19205,
        longitude: 28.032,
      });
      const ambiguousBoundary = await service.evaluate({
        eventId: DEMO_EVENT_ID,
        latitude: boundaryCoordinates.latitude,
        longitude: boundaryCoordinates.longitude,
      });

      expect(eventCentre).toMatchObject({
        outcome: 'evaluated',
        eligible: true,
        radiusMetres: 75,
      });
      expect(outsideRadius).toMatchObject({
        outcome: 'evaluated',
        eligible: false,
        radiusMetres: 75,
      });
      expect(ambiguousBoundary).toMatchObject({
        outcome: 'evaluated',
        eligible: true,
        radiusMetres: 75,
      });

      if (
        eventCentre.outcome !== 'evaluated' ||
        outsideRadius.outcome !== 'evaluated' ||
        ambiguousBoundary.outcome !== 'evaluated'
      ) {
        throw new Error('Expected evaluated eligibility results.');
      }

      expect(eventCentre.distanceMetres).toBeCloseTo(0, 3);
      expect(outsideRadius.distanceMetres).toBeGreaterThan(75);
      expect(ambiguousBoundary.distanceMetres).toBeCloseTo(70, 3);
      expect(
        evaluateReachabilityWithAccuracy(
          eventCentre.distanceMetres,
          eventCentre.radiusMetres,
          10,
        ),
      ).toEqual({ status: 'reachable', reachable: true });
      expect(
        evaluateReachabilityWithAccuracy(
          outsideRadius.distanceMetres,
          outsideRadius.radiusMetres,
          10,
        ),
      ).toEqual({ status: 'unreachable', reachable: false });
      expect(
        evaluateReachabilityWithAccuracy(
          ambiguousBoundary.distanceMetres,
          ambiguousBoundary.radiusMetres,
          10,
        ),
      ).toEqual({
        status: 'reachable',
        reachable: true,
      });

      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000091',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'unpublished',
      });
      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000092',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'not_started',
      });
      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000093',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'ended',
      });
      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000099',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toEqual({
        outcome: 'not_found',
        eventId: '00000000-0000-4000-8000-000000000099',
      });
    });
  }, 30_000);

  it('rolls back a failed migration and succeeds on a corrected rerun', async () => {
    const migrationDirectory = await createRecoveryMigrationDirectory();
    const recoveryMigrationPath = join(
      migrationDirectory,
      '9999_rehearsal_recovery.sql',
    );

    try {
      await writeFile(
        recoveryMigrationPath,
        `create table public.rehearsal_recovery_marker (id integer primary key);
select * from public.rehearsal_missing_relation;
`,
      );

      await expect(
        runMigrations(temporaryConfig, migrationDirectory),
      ).rejects.toThrow();

      await withDatabaseClient(temporaryConfig, async (client) => {
        const failedState = await client.query<{
          marker: string | null;
          migration_count: string;
        }>(
          `select to_regclass('public.rehearsal_recovery_marker')::text as marker,
                  (select count(*)::text
                     from public.schema_migrations
                    where name = '9999_rehearsal_recovery.sql') as migration_count`,
        );

        expect(failedState.rows[0]).toEqual({
          marker: null,
          migration_count: '0',
        });
      });

      await writeFile(
        recoveryMigrationPath,
        'create table public.rehearsal_recovery_marker (id integer primary key);\n',
      );

      await expect(
        runMigrations(temporaryConfig, migrationDirectory),
      ).resolves.toEqual({
        applied: ['9999_rehearsal_recovery.sql'],
        skipped: [
          '0001_enable_postgis.sql',
          '0002_create_events.sql',
          '0003_create_players.sql',
          '0004_create_account_deletion_requests.sql',
        ],
      });
      await runBasicDemoSeeds(temporaryConfig);

      await withDatabaseClient(temporaryConfig, async (client) => {
        const recoveredState = await client.query<{
          event_count: string;
          marker: string | null;
          migration_count: string;
        }>(
          `select to_regclass('public.rehearsal_recovery_marker')::text as marker,
                  (select count(*)::text
                     from public.schema_migrations
                    where name = '9999_rehearsal_recovery.sql') as migration_count,
                  (select count(*)::text
                     from public.events
                    where id = $1) as event_count`,
          [DEMO_EVENT_ID],
        );

        expect(recoveredState.rows[0]).toEqual({
          event_count: '1',
          marker: 'rehearsal_recovery_marker',
          migration_count: '1',
        });
      });
    } finally {
      await rm(migrationDirectory, { force: true, recursive: true });
    }
  }, 45_000);
});

async function createRecoveryMigrationDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'wits-world-recovery-'));
  const migrationsDirectory = getMigrationsDirectory();

  await Promise.all(
    [
      '0001_enable_postgis.sql',
      '0002_create_events.sql',
      '0003_create_players.sql',
      '0004_create_account_deletion_requests.sql',
    ].map((name) =>
      copyFile(join(migrationsDirectory, name), join(directory, name)),
    ),
  );

  return directory;
}

interface InvalidEventOverrides {
  endsAt?: string;
  location?: null;
  radiusMetres?: number;
  title?: string;
}

async function expectInvalidEvent(
  client: Parameters<Parameters<typeof withDatabaseClient>[1]>[0],
  overrides: InvalidEventOverrides,
) {
  const values = {
    endsAt: '2026-08-02T00:00:00+02:00',
    location:
      overrides.location === null
        ? null
        : 'SRID=4326;POINT(28.03038 -26.19205)',
    radiusMetres: overrides.radiusMetres ?? 75,
    title: overrides.title ?? 'Invalid event fixture',
    ...overrides,
  };

  await expect(
    client.query(
      `insert into public.events (
         title, location, radius_metres, starts_at, ends_at
       ) values ($1, $2::geography, $3, $4::timestamptz, $5::timestamptz)`,
      [
        values.title,
        values.location,
        values.radiusMetres,
        '2026-08-01T00:00:00+02:00',
        values.endsAt,
      ],
    ),
  ).rejects.toThrow();
}
