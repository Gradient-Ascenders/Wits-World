import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { runSeeds } from '../src/database/seeds.js';

const DEMO_EVENT_ID = '00000000-0000-4000-8000-000000000018';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('event database integration', () => {
  let administrationConfig: DatabaseConfig;
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
  });

  afterAll(async () => {
    if (!administrationConfig || !temporaryDatabaseName) {
      return;
    }

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      );
    });
  });

  it('migrates an empty database and enforces the event fixture contract', async () => {
    await expect(runMigrations(temporaryConfig)).resolves.toEqual({
      applied: ['0001_enable_postgis.sql', '0002_create_events.sql'],
      skipped: [],
    });

    await runSeeds(temporaryConfig);
    await runSeeds(temporaryConfig);

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
});

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
