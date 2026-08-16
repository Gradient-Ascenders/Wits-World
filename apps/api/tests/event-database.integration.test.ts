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
import { runSeeds } from '../src/database/seeds.js';
import { createEventDiscoveryService } from '../src/events/event-discovery.js';
import { createEventEligibilityService } from '../src/events/event-eligibility.js';
import { evaluateReachabilityWithAccuracy } from '../src/events/location-claim.js';

const DEMO_EVENT_ID = '00000000-0000-4000-8000-000000000018';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

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
    await runSeeds(temporaryConfig);
    await runSeeds(temporaryConfig);
    rerunMigrationResult = await runMigrations(temporaryConfig);
  }, 45_000);

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
        '0013_add_author_content_foundation.sql',
        '0014_harden_author_challenge_lifecycle.sql',
        '0015_add_card_authoring_lifecycle.sql',
        '0016_add_event_authoring_lifecycle.sql',
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
        '0013_add_author_content_foundation.sql',
        '0014_harden_author_challenge_lifecycle.sql',
        '0015_add_card_authoring_lifecycle.sql',
        '0016_add_event_authoring_lifecycle.sql',
      ],
    });
    expect(readiness).toMatchObject({
      database: temporaryDatabaseName,
      postgisVersion: expect.stringContaining('POSTGIS='),
    });

    await withDatabaseClient(temporaryConfig, async (client) => {
      const seededEvent = await client.query<{
        count: string;
        ends_at: Date;
        is_published: boolean;
        latitude: number;
        longitude: number;
        radius_metres: number;
        starts_at: Date;
        title: string;
      }>(
        `select (select count(*) from public.events)::text as count,
                title,
                st_x(location::geometry) as longitude,
                st_y(location::geometry) as latitude,
                radius_metres,
                starts_at,
                ends_at,
                is_published
           from public.events
          where id = $1`,
        [DEMO_EVENT_ID],
      );

      expect(seededEvent.rows).toHaveLength(1);
      expect(seededEvent.rows[0]).toMatchObject({
        count: '1',
        is_published: true,
        latitude: -26.19205,
        longitude: 28.03038,
        radius_metres: 75,
        title: 'Sprint 1 Demo - Wits Great Hall',
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
          availability: 'active',
          eventId: DEMO_EVENT_ID,
          radiusMetres: 75,
          title: 'Sprint 1 Demo - Wits Great Hall',
        }),
      ]);
    });
  }, 30_000);

  it('produces reachable, unreachable, and ambiguous results from PostGIS distances', async () => {
    const evaluatedAt = new Date('2026-08-10T12:00:00.000Z');

    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at, is_published
         ) values
           ($1, 'Unpublished test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $5, $6, false),
           ($2, 'Future test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $6, $7, true),
           ($3, 'Ended test event',
            st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
            75, $4, $5, true)
         on conflict (id) do nothing`,
        [
          '00000000-0000-4000-8000-000000000019',
          '00000000-0000-4000-8000-000000000020',
          '00000000-0000-4000-8000-000000000021',
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
        status: 'retry',
        reachable: null,
        reason: 'location_accuracy',
      });

      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000019',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'unpublished',
      });
      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000020',
          latitude: -26.19205,
          longitude: 28.03038,
        }),
      ).resolves.toMatchObject({
        outcome: 'unavailable',
        reason: 'not_started',
      });
      await expect(
        service.evaluate({
          eventId: '00000000-0000-4000-8000-000000000021',
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
      await runSeeds(temporaryConfig);

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
