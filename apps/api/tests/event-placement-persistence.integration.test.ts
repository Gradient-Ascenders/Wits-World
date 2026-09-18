import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { runSeeds } from '../src/database/seeds.js';

const MIGRATION_NAME = '0045_create_event_placement_persistence.sql';
const POLICY_ID = 'placement-v1';
const AUTHOR_ID = '26100000-0000-4000-8000-000000000001';
const EVENT_ID = '26110000-0000-4000-8000-000000000001';
const SECOND_EVENT_ID = '26110000-0000-4000-8000-000000000002';
const OVERSIZED_EVENT_ID = '26110000-0000-4000-8000-000000000003';
const PENDING_SITE_ID = '26120000-0000-4000-8000-000000000001';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'event placement persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let eastZoneId: string;
    let greatHallSiteId: string;
    let secondEastSiteId: string;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_placement_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      const migrations = await runMigrations(temporaryConfig);
      expect(migrations.applied).toContain(MIGRATION_NAME);
      await runSeeds(temporaryConfig);

      pool = createDatabasePool(temporaryConfig);
      const catalogue = await pool.query<{
        east_zone_id: string;
        great_hall_site_id: string;
        second_east_site_id: string;
      }>(
        `select
           zone.id::text east_zone_id,
           max(site.id::text) filter (where site.site_key = 'great_hall') great_hall_site_id,
           max(site.id::text) filter (where site.site_key = 'william_cullen_library') second_east_site_id
         from public.event_placement_zones zone
         join public.event_placement_sites site on site.zone_id = zone.id
         where zone.policy_version_id = $1
           and zone.zone_key = 'east_campus'
         group by zone.id`,
        [POLICY_ID],
      );
      eastZoneId = catalogue.rows[0]?.east_zone_id ?? '';
      greatHallSiteId = catalogue.rows[0]?.great_hall_site_id ?? '';
      secondEastSiteId = catalogue.rows[0]?.second_east_site_id ?? '';

      await seedAuthorAndEvents(pool);
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

    it('seeds the reviewed policy, three zones, eleven sites, and spatial indexes', async () => {
      const policy = await pool.query<{
        automatic_target: number;
        minimum_separation_metres: number;
        replacements_per_rotation: number;
        rotation: string;
      }>(
        `select automatic_target,
                minimum_separation_metres,
                replacements_per_rotation,
                rotation_local_time::text rotation
           from public.event_placement_policy_versions
          where id = $1`,
        [POLICY_ID],
      );
      expect(policy.rows).toEqual([
        {
          automatic_target: 6,
          minimum_separation_metres: 150,
          replacements_per_rotation: 2,
          rotation: '04:00:00',
        },
      ]);

      const catalogue = await pool.query<{
        ambiguous_site_count: number;
        site_count: number;
        zone_count: number;
      }>(
        `select
           (select count(*)::int
              from public.event_placement_zones
             where policy_version_id = $1 and status = 'active') zone_count,
           (select count(*)::int
              from public.event_placement_sites
             where policy_version_id = $1
               and status = 'active'
               and maximum_interaction_radius_metres = 60) site_count,
           (select count(*)::int
              from public.event_placement_sites site
             where site.policy_version_id = $1
               and (
                 select count(*)
                   from public.event_placement_zones zone
                  where zone.policy_version_id = site.policy_version_id
                    and zone.status = 'active'
                    and st_covers(zone.area, site.location::geometry)
               ) <> 1) ambiguous_site_count`,
        [POLICY_ID],
      );
      expect(catalogue.rows).toEqual([
        { ambiguous_site_count: 0, site_count: 11, zone_count: 3 },
      ]);

      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
           from pg_indexes
          where schemaname = 'public'
            and tablename in (
              'event_placement_zones',
              'event_placement_sites',
              'event_placement_assignments',
              'event_placement_overrides'
            )`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'event_placement_zones_area_gist_idx',
          'event_placement_sites_location_gist_idx',
          'event_placement_assignments_current_event_uidx',
          'event_placement_assignments_current_site_uidx',
          'event_placement_overrides_active_idx',
        ]),
      );

      await expect(runSeeds(temporaryConfig)).resolves.toEqual(
        expect.objectContaining({
          applied: expect.arrayContaining([
            '0003_event_placement_catalogue.sql',
          ]),
        }),
      );
    });

    it('upgrades an existing database without rewriting event history', async () => {
      const upgradeDatabaseName = `wits_quest_placement_upgrade_${Date.now()}_${process.pid}`;
      const migrationDirectory = await copyMigrationsBeforePlacement();
      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${upgradeDatabaseName}`;
      const upgradeConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${upgradeDatabaseName}`);
      });

      try {
        await runMigrations(upgradeConfig, migrationDirectory);
        await withDatabaseClient(upgradeConfig, async (client) => {
          await client.query(
            `insert into public.events (
               id, title, location, radius_metres, starts_at, ends_at,
               is_published, authoring_status, publication_provenance
             ) values (
               '26190000-0000-4000-8000-000000000001',
               'Retained upgrade event',
               st_setsrid(st_makepoint(28.03, -26.19), 4326)::geography,
               60, now(), now() + interval '1 day',
               true, 'published', 'controlled_seed'
             )`,
          );
        });

        await copyFile(
          join(getMigrationsDirectory(), MIGRATION_NAME),
          join(migrationDirectory, MIGRATION_NAME),
        );
        await expect(
          runMigrations(upgradeConfig, migrationDirectory),
        ).resolves.toEqual(
          expect.objectContaining({ applied: [MIGRATION_NAME] }),
        );

        await withDatabaseClient(upgradeConfig, async (client) => {
          const retained = await client.query<{ title: string }>(
            `select title from public.events
              where id = '26190000-0000-4000-8000-000000000001'`,
          );
          expect(retained.rows).toEqual([{ title: 'Retained upgrade event' }]);
        });
      } finally {
        await rm(migrationDirectory, { force: true, recursive: true });
        await withDatabaseClient(administrationConfig, async (client) => {
          await client.query(
            `drop database if exists ${upgradeDatabaseName} with (force)`,
          );
        });
      }
    }, 60_000);

    it('rejects unreviewed, inactive, oversized, and non-portable assignments', async () => {
      await pool.query(
        `insert into public.event_placement_sites (
           id, zone_id, policy_version_id, site_key, name, location,
           maximum_interaction_radius_metres, source_urls
         ) values (
           $1, $2, $3, 'pending_test_site', 'Pending test site',
           st_setsrid(st_makepoint(28.0303750, -26.1920468), 4326)::geography,
           60, array['https://example.com/pending-site']
         )`,
        [PENDING_SITE_ID, eastZoneId, POLICY_ID],
      );

      const pendingPlanId = await createAppliedPlan({
        bucket: '2026-10-01',
        eventId: EVENT_ID,
        siteId: PENDING_SITE_ID,
        zoneId: eastZoneId,
      });
      await expect(
        insertAssignment({
          planId: pendingPlanId,
          eventId: EVENT_ID,
          siteId: PENDING_SITE_ID,
          zoneId: eastZoneId,
        }),
      ).rejects.toThrow('violates policy, lifecycle, portability, or radius');

      const oversizedPlanId = await createAppliedPlan({
        bucket: '2026-10-02',
        eventId: OVERSIZED_EVENT_ID,
        siteId: greatHallSiteId,
        zoneId: eastZoneId,
      });
      await expect(
        insertAssignment({
          planId: oversizedPlanId,
          eventId: OVERSIZED_EVENT_ID,
          siteId: greatHallSiteId,
          zoneId: eastZoneId,
        }),
      ).rejects.toThrow('violates policy, lifecycle, portability, or radius');
      await pool.query(
        `update public.event_placement_portability
            set ended_at = now(), end_reason = 'Test withdrawal'
          where event_id = $1 and ended_at is null`,
        [EVENT_ID],
      );
      const fixedPlanId = await createAppliedPlan({
        bucket: '2026-10-03',
        eventId: EVENT_ID,
        siteId: greatHallSiteId,
        zoneId: eastZoneId,
      });
      await expect(
        insertAssignment({
          planId: fixedPlanId,
          eventId: EVENT_ID,
          siteId: greatHallSiteId,
          zoneId: eastZoneId,
        }),
      ).rejects.toThrow('violates policy, lifecycle, portability, or radius');

      await approvePortableEvent(EVENT_ID);
    });

    it('requires assignment closure in the same transaction as site suspension', async () => {
      const planId = await createAppliedPlan({
        bucket: '2026-10-04',
        eventId: EVENT_ID,
        siteId: greatHallSiteId,
        zoneId: eastZoneId,
      });
      const assignmentId = await insertAssignment({
        planId,
        eventId: EVENT_ID,
        siteId: greatHallSiteId,
        zoneId: eastZoneId,
      });

      await expect(
        pool.query(
          `update public.event_placement_sites
              set status = 'suspended',
                  version = version + 1,
                  suspended_at = now(),
                  updated_at = now()
            where id = $1`,
          [greatHallSiteId],
        ),
      ).rejects.toThrow('cannot retain a current assignment');

      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `update public.event_placement_assignments
              set ends_at = now(), end_reason = 'site_suspended'
            where id = $1`,
          [assignmentId],
        );
        await client.query(
          `update public.event_placement_sites
              set status = 'suspended',
                  version = version + 1,
                  suspended_at = now(),
                  updated_at = now()
            where id = $1`,
          [greatHallSiteId],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }

      const history = await pool.query<{
        end_reason: string;
        site_status: string;
      }>(
        `select assignment.end_reason, site.status site_status
           from public.event_placement_assignments assignment
           join public.event_placement_sites site on site.id = assignment.site_id
          where assignment.id = $1`,
        [assignmentId],
      );
      expect(history.rows).toEqual([
        { end_reason: 'site_suspended', site_status: 'suspended' },
      ]);

      await expect(
        pool.query(
          `update public.event_placement_assignments
              set ends_at = now(), end_reason = 'rewritten'
            where id = $1`,
          [assignmentId],
        ),
      ).rejects.toThrow('may only be ended once');
    });

    it('enforces current assignment uniqueness and bounded Author overrides', async () => {
      const firstPlanId = await createAppliedPlan({
        bucket: '2026-10-05',
        eventId: SECOND_EVENT_ID,
        siteId: secondEastSiteId,
        zoneId: eastZoneId,
      });
      await insertAssignment({
        planId: firstPlanId,
        eventId: SECOND_EVENT_ID,
        siteId: secondEastSiteId,
        zoneId: eastZoneId,
      });

      const duplicatePlanId = await createAppliedPlan({
        bucket: '2026-10-06',
        eventId: SECOND_EVENT_ID,
        siteId: secondEastSiteId,
        zoneId: eastZoneId,
      });
      await expect(
        insertAssignment({
          planId: duplicatePlanId,
          eventId: SECOND_EVENT_ID,
          siteId: secondEastSiteId,
          zoneId: eastZoneId,
        }),
      ).rejects.toMatchObject({ code: '23505' });

      await expect(
        pool.query(
          `insert into public.event_placement_overrides (
             policy_version_id, kind, actor_player_id, reason,
             idempotency_key, request_hash, starts_at, expires_at
           ) values (
             $1, 'automation_pause', $2, 'Too long',
             '26130000-0000-4000-8000-000000000001', repeat('b', 64),
             now(), now() + interval '8 days'
           )`,
          [POLICY_ID, AUTHOR_ID],
        ),
      ).rejects.toThrow('exceeds policy duration limit');

      await pool.query(
        `insert into public.event_placement_overrides (
           policy_version_id, kind, actor_player_id, reason,
           idempotency_key, request_hash, starts_at, expires_at
         ) values (
           $1, 'automation_pause', $2, 'Campus closure',
           '26130000-0000-4000-8000-000000000002', repeat('c', 64),
           now(), now() + interval '7 days'
         )`,
        [POLICY_ID, AUTHOR_ID],
      );
      await expect(
        pool.query(
          `insert into public.event_placement_overrides (
             policy_version_id, kind, actor_player_id, reason,
             idempotency_key, request_hash, starts_at, expires_at
           ) values (
             $1, 'automation_pause', $2, 'Changed payload',
             '26130000-0000-4000-8000-000000000002', repeat('d', 64),
             now(), now() + interval '1 day'
           )`,
          [POLICY_ID, AUTHOR_ID],
        ),
      ).rejects.toMatchObject({ code: '23505' });

      await expect(
        pool.query(
          `update public.event_placement_policy_versions
              set automatic_target = 7
            where id = $1`,
          [POLICY_ID],
        ),
      ).rejects.toThrow('policy versions are immutable');
    });

    async function approvePortableEvent(eventId: string): Promise<void> {
      await pool.query(
        `insert into public.event_placement_portability (
           event_id, policy_version_id, approved_by_player_id,
           review_provenance, effective_at
         ) values ($1, $2, $3, 'reviewed', now())`,
        [eventId, POLICY_ID, AUTHOR_ID],
      );
    }

    async function createAppliedPlan(input: {
      bucket: string;
      eventId: string;
      siteId: string;
      zoneId: string;
    }): Promise<string> {
      const planId = (
        await pool.query<{ id: string }>(
          `insert into public.event_placement_plans (
             policy_version_id, rotation_bucket, status, trigger_kind,
             input_digest, expected_state_version, target_assignment_count,
             actual_assignment_count, zone_assignment_counts, valid_until
           ) values (
             $1, $2::date, 'preview', 'scheduled', repeat('a', 64),
             0, 6, 1, '{"east_campus":1}'::jsonb, now() + interval '15 minutes'
           ) returning id::text`,
          [POLICY_ID, input.bucket],
        )
      ).rows[0]?.id;
      if (!planId) {
        throw new Error('Expected placement plan insert to return an ID.');
      }

      await pool.query(
        `insert into public.event_placement_plan_entries (
           plan_id, event_id, site_id, zone_id, position, origin
         ) values ($1, $2, $3, $4, 1, 'automatic')`,
        [planId, input.eventId, input.siteId, input.zoneId],
      );
      await pool.query(
        `update public.event_placement_plans
            set status = 'applied',
                committed_state_version = 1,
                applied_at = now()
          where id = $1`,
        [planId],
      );
      return planId;
    }

    async function insertAssignment(input: {
      planId: string;
      eventId: string;
      siteId: string;
      zoneId: string;
    }): Promise<string> {
      const result = await pool.query<{ id: string }>(
        `insert into public.event_placement_assignments (
           plan_id, policy_version_id, event_id, site_id, zone_id,
           origin, starts_at
         ) values ($1, $2, $3, $4, $5, 'automatic', now())
         returning id::text`,
        [input.planId, POLICY_ID, input.eventId, input.siteId, input.zoneId],
      );
      return result.rows[0]?.id ?? '';
    }
  },
);

async function seedAuthorAndEvents(database: Pick<pg.Pool, 'query'>) {
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values ($1, 'https://issuer.example/', 'auth0|placement-author',
               'placement_author', 'author')`,
    [AUTHOR_ID],
  );

  for (const [eventId, title] of [
    [EVENT_ID, 'Portable placement test event'],
    [SECOND_EVENT_ID, 'Second portable placement test event'],
    [OVERSIZED_EVENT_ID, 'Oversized portable placement test event'],
  ] as const) {
    await database.query(
      `insert into public.events (
         id, title, location, radius_metres, starts_at, ends_at,
         is_published, authoring_status, publication_provenance
       ) values (
         $1, $2,
         st_setsrid(st_makepoint(28.04, -26.18), 4326)::geography,
         case when $1::uuid = $3::uuid then 61 else 60 end,
         '2026-09-01T00:00:00Z', '2099-12-31T23:59:59Z',
         true, 'published', 'controlled_seed'
       )`,
      [eventId, title, OVERSIZED_EVENT_ID],
    );
    await database.query(
      `insert into public.event_placement_portability (
         event_id, policy_version_id, approved_by_player_id,
         review_provenance, effective_at
       ) values ($1, $2, $3, 'reviewed', now())`,
      [eventId, POLICY_ID, AUTHOR_ID],
    );
  }
}

async function copyMigrationsBeforePlacement(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wits-placement-migrations-'));
  const source = getMigrationsDirectory();
  const files = (await readdir(source))
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_NAME)
    .sort();

  await Promise.all(
    files.map((name) => copyFile(join(source, name), join(directory, name))),
  );
  return directory;
}
