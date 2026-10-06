import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
  getMigrationsDirectory,
  getSeedsDirectory,
} from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';
import {
  rankedTransaction,
  type RankedClient,
  type RankedDatabase,
} from '../src/matches/ranked-database.js';
import { settleTerritoryWindow } from '../src/territory/territory-settlement.js';
import { createTerritoryReadService } from '../src/territory/territory-read-service.js';

const MIGRATION_NAME = '0053_persist_contested_territory.sql';
const RUNTIME_MIGRATION_NAME = '0054_implement_contested_territory_runtime.sql';
const SEED_NAME = '0004_territory_catalogue.sql';
const TERRITORY_POLICY = 'territory-v1';
const RANKED_POLICY = 'ranked-v1';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface RankedPlayer {
  id: string;
  deckId: string;
}

interface RankedPair {
  seasonId: string;
  first: RankedPlayer;
  second: RankedPlayer;
  proposalId: string;
}

interface CardDefinition extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic' | null;
  rarity: 'common';
}

interface TerritoryZoneRow extends pg.QueryResultRow {
  id: string;
  zone_key: string;
}

describe.skipIf(!runIntegrationTests)(
  'contested territory persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: pg.Pool;
    let seasonId: string;
    let cards: CardDefinition[];
    const zones = new Map<string, string>();

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_territory_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(MIGRATION_NAME);
      expect(migrationResult.applied).toContain(RUNTIME_MIGRATION_NAME);
      const seedResult = await runSeeds(temporaryConfig);
      expect(seedResult.applied).toContain(SEED_NAME);

      pool = createDatabasePool(temporaryConfig);
      const territoryZones = await pool.query<TerritoryZoneRow>(
        `select id::text, zone_key
           from public.territory_zones
          where policy_version = $1
          order by zone_key`,
        [TERRITORY_POLICY],
      );
      for (const zone of territoryZones.rows) zones.set(zone.zone_key, zone.id);

      const definitions = await pool.query<CardDefinition>(
        `select id::text, category, affinity, rarity
           from public.card_definitions
          where is_active = true and rarity = 'common'
          order by category, affinity nulls last, name, id`,
      );
      cards = [
        ...definitions.rows
          .filter((card) => card.category === 'creature')
          .slice(0, 3),
        ...definitions.rows
          .filter((card) => card.category === 'power')
          .slice(0, 2),
      ];
      expect(cards).toHaveLength(5);

      seasonId = randomUUID();
      await pool.query(
        `insert into public.ranked_seasons (
           id, policy_version, name, intended_start_at
         ) values ($1::uuid, $2, 'Territory persistence season', now())`,
        [seasonId, RANKED_POLICY],
      );
      await activateSeason(pool, seasonId);
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

    it('adds private runtime state without retaining precise territory claims', async () => {
      const grantColumns = await pool.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'private'
            and table_name = 'territory_zone_grants'
          order by ordinal_position`,
      );
      const columnNames = grantColumns.rows.map((row) => row.column_name);
      expect(columnNames).toEqual(
        expect.arrayContaining([
          'queue_entry_id',
          'player_id',
          'zone_id',
          'territory_policy_version',
          'device_acquired_at',
          'issued_at',
          'expires_at',
          'used_at',
          'used_match_id',
        ]),
      );
      expect(columnNames).not.toEqual(
        expect.arrayContaining(['latitude', 'longitude', 'accuracy_metres']),
      );

      const runtimeColumns = await pool.query<{
        settlement_kind: boolean;
        bonus_source: boolean;
      }>(
        `select
           exists (
             select 1 from information_schema.columns
              where table_schema = 'private'
                and table_name = 'territory_settlement_receipts'
                and column_name = 'settlement_kind'
           ) settlement_kind,
           exists (
             select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = 'player_cards'
                and column_name = 'source_territory_bonus_id'
           ) bonus_source`,
      );
      expect(runtimeColumns.rows).toEqual([
        { settlement_kind: true, bonus_source: true },
      ]);
    });

    it('persists territory-v1 privately and copies reviewed PostGIS zones with independent lifecycle', async () => {
      const policy = await pool.query<{
        daily_cap_timezone: string;
        daily_influence_cap: number;
        grant_cleanup_deadline: string;
        influence_per_eligible_win: number;
        maximum_location_claim_age: string;
        minimum_ownership_influence: number;
        owner_bonus_daily_limit: number;
        owner_bonus_minimum_correct_answers: number;
        owner_bonus_pool: string;
        required_prior_ranked_settlements: number;
        settlement_cadence: string;
        zone_grant_lifetime: string;
      }>(
        `select maximum_location_claim_age::text,
                zone_grant_lifetime::text,
                grant_cleanup_deadline::text,
                influence_per_eligible_win,
                required_prior_ranked_settlements,
                daily_influence_cap,
                daily_cap_timezone,
                settlement_cadence::text,
                minimum_ownership_influence,
                owner_bonus_minimum_correct_answers,
                owner_bonus_daily_limit,
                owner_bonus_pool
           from private.territory_policy_versions
          where policy_version = $1`,
        [TERRITORY_POLICY],
      );
      expect(policy.rows).toEqual([
        {
          daily_cap_timezone: 'Africa/Johannesburg',
          daily_influence_cap: 5,
          grant_cleanup_deadline: '24:00:00',
          influence_per_eligible_win: 1,
          maximum_location_claim_age: '00:02:00',
          minimum_ownership_influence: 3,
          owner_bonus_daily_limit: 1,
          owner_bonus_minimum_correct_answers: 3,
          owner_bonus_pool: 'active_non_evolved_common',
          required_prior_ranked_settlements: 5,
          settlement_cadence: '01:00:00',
          zone_grant_lifetime: '00:05:00',
        },
      ]);

      const catalogue = await pool.query<{
        copied_count: number;
        invalid_geometry_count: number;
        mismatch_count: number;
        projection_count: number;
      }>(
        `select
           (select count(*)::int
              from public.territory_zones
             where policy_version = $1
               and definition_version = 1) copied_count,
           (select count(*)::int
              from public.territory_zones
             where policy_version = $1
               and (
                 st_srid(area) <> 4326
                 or geometrytype(area) <> 'MULTIPOLYGON'
                 or st_isempty(area)
                 or not st_isvalid(area)
               )) invalid_geometry_count,
           (select count(*)::int
              from public.territory_zones territory
              join public.event_placement_zones placement
                on placement.id = territory.source_placement_zone_id
               and placement.policy_version_id = territory.source_placement_policy_version
             where territory.policy_version = $1
               and (
                 territory.zone_key is distinct from placement.zone_key
                 or territory.name is distinct from placement.name
                 or not st_equals(territory.area, placement.area)
                 or territory.source_urls is distinct from placement.source_urls
                 or territory.review_provenance is distinct from placement.review_provenance
               )) mismatch_count,
           (select count(*)::int
              from private.territory_current_ownership) projection_count`,
        [TERRITORY_POLICY],
      );
      expect(catalogue.rows).toEqual([
        {
          copied_count: 3,
          invalid_geometry_count: 0,
          mismatch_count: 0,
          projection_count: 3,
        },
      ]);

      const indexNames = await pool.query<{ indexname: string }>(
        `select indexname
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'territory_zones'`,
      );
      expect(indexNames.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'territory_zones_area_gist_idx',
          'territory_zones_one_current_definition_uidx',
          'territory_zones_active_idx',
        ]),
      );

      const publicGrants = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from information_schema.table_privileges
          where table_schema = 'private'
            and table_name like 'territory_%'
            and grantee = 'PUBLIC'`,
      );
      expect(publicGrants.rows[0]?.count).toBe('0');

      await expect(
        pool.query(
          `update private.territory_policy_versions
              set daily_influence_cap = 6
            where policy_version = $1`,
          [TERRITORY_POLICY],
        ),
      ).rejects.toThrow(/immutable/u);

      await expect(runSeeds(temporaryConfig)).resolves.toEqual(
        expect.objectContaining({
          applied: expect.arrayContaining([SEED_NAME]),
        }),
      );
    });

    it('reads current territory standings with PostgreSQL-safe query aliases', async () => {
      const zoneId = zones.get('arts_and_community');
      if (!zoneId)
        throw new Error('Arts & Community territory was not seeded.');

      const standings = await createTerritoryReadService(pool).standings(
        randomUUID(),
        zoneId,
      );

      expect(standings).toEqual(
        expect.objectContaining({
          activity: expect.objectContaining({
            contributors: expect.any(Number),
            influence: expect.any(Number),
          }),
          seasonId,
          zoneId,
        }),
      );
    });

    it('upgrades a seeded placement database and bootstraps territory without rewriting placement state', async () => {
      const upgradeDatabaseName = `wits_quest_territory_upgrade_${Date.now()}_${process.pid}`;
      const migrationDirectory = await copyMigrationsBeforeTerritory();
      const seedDirectory = await copySeedsBeforeTerritory();
      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${upgradeDatabaseName}`;
      const upgradeConfig: DatabaseConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${upgradeDatabaseName}`);
      });

      try {
        await runMigrations(upgradeConfig, migrationDirectory);
        await runSeeds(upgradeConfig, seedDirectory);
        await withDatabaseClient(upgradeConfig, async (client) => {
          await client.query(
            `update public.event_placement_zones
                set status = 'suspended',
                    version = version + 1,
                    suspended_at = now(),
                    updated_at = now()
              where policy_version_id = 'placement-v1'
                and zone_key = 'west_campus'`,
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
          const state = await client.query<{
            placement_status: string;
            territory_count: number;
          }>(
            `select
               (select status
                  from public.event_placement_zones
                 where policy_version_id = 'placement-v1'
                   and zone_key = 'west_campus') placement_status,
               (select count(*)::int
                  from public.territory_zones
                 where policy_version = 'territory-v1') territory_count`,
          );
          expect(state.rows).toEqual([
            { placement_status: 'suspended', territory_count: 3 },
          ]);
        });

        await withDatabaseClient(upgradeConfig, async (client) => {
          const copied = await client.query<{
            placement_status: string;
            territory_status: string;
          }>(
            `select
               (select status
                  from public.event_placement_zones
                 where policy_version_id = 'placement-v1'
                   and zone_key = 'west_campus') placement_status,
               (select status
                  from public.territory_zones
                 where policy_version = 'territory-v1'
                   and zone_key = 'west_campus') territory_status`,
          );
          expect(copied.rows).toEqual([
            { placement_status: 'suspended', territory_status: 'active' },
          ]);
        });
      } finally {
        await rm(migrationDirectory, { force: true, recursive: true });
        await rm(seedDirectory, { force: true, recursive: true });
        await withDatabaseClient(administrationConfig, async (client) => {
          await client.query(
            `drop database if exists ${upgradeDatabaseName} with (force)`,
          );
        });
      }
    }, 120_000);

    it('rejects invalid and overlapping geometry while keeping territory independent from placement lifecycle', async () => {
      const eastZoneId = requireZone(zones, 'east_campus');

      await expect(
        pool.query(
          `insert into public.territory_zones (
             policy_version, zone_key, definition_version, name, area,
             source_urls
           ) values (
             $1, 'empty_geometry', 1, 'Empty geometry',
             st_geomfromtext('MULTIPOLYGON EMPTY', 4326),
             array['https://example.com/territory']
           )`,
          [TERRITORY_POLICY],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `insert into public.territory_zones (
             policy_version, zone_key, definition_version, name, area,
             status, source_urls, review_provenance, reviewed_at, activated_at
           )
           select $1, 'overlap_test', 1, 'Overlap test', area,
                  'active', array['https://example.com/territory'],
                  'controlled_policy', now(), now()
             from public.territory_zones
            where id = $2::uuid`,
          [TERRITORY_POLICY, eastZoneId],
        ),
      ).rejects.toThrow(/cannot overlap/u);

      await pool.query(
        `update public.event_placement_zones
            set status = 'suspended',
                version = version + 1,
                suspended_at = now(),
                updated_at = now()
          where policy_version_id = 'placement-v1'
            and zone_key = 'east_campus'`,
      );
      const independent = await pool.query<{ status: string }>(
        `select status
           from public.territory_zones
          where id = $1::uuid`,
        [eastZoneId],
      );
      expect(independent.rows).toEqual([{ status: 'active' }]);

      await pool.query(
        `update public.event_placement_zones
            set status = 'active',
                version = version + 1,
                suspended_at = null,
                updated_at = now()
          where policy_version_id = 'placement-v1'
            and zone_key = 'east_campus'`,
      );
    });

    it('records exactly one append-only contribution for one authoritative ranked result under concurrency', async () => {
      const winner = await createPlayer(pool, seasonId);
      const loser = await createPlayer(pool, seasonId);
      const pair = await createAcceptedPair(pool, seasonId, winner, loser);
      const matchId = await createRankedMatch(pool, pair, cards);
      await completeRankedMatch(pool, seasonId, matchId, winner, loser);
      const eastZoneId = requireZone(zones, 'east_campus');

      const concurrent = await Promise.allSettled([
        recordAcceptedContribution(pool, {
          matchId,
          seasonId,
          playerId: winner.id,
          zoneId: eastZoneId,
        }),
        recordAcceptedContribution(pool, {
          matchId,
          seasonId,
          playerId: winner.id,
          zoneId: eastZoneId,
        }),
      ]);
      expect(
        concurrent.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        concurrent.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const persisted = await pool.query<{
        contribution_count: number;
        decision_count: number;
        influence_points: number;
        local_date_matches: boolean;
      }>(
        `select
           (select count(*)::int
              from private.territory_contribution_decisions
             where source_match_id = $1::uuid) decision_count,
           (select count(*)::int
              from private.territory_influence_contributions
             where source_match_id = $1::uuid) contribution_count,
           (select influence_points::int
              from private.territory_influence_contributions
             where source_match_id = $1::uuid) influence_points,
           (select contribution_date =
                    (contributed_at at time zone 'Africa/Johannesburg')::date
              from private.territory_influence_contributions
             where source_match_id = $1::uuid) local_date_matches`,
        [matchId],
      );
      expect(persisted.rows).toEqual([
        {
          contribution_count: 1,
          decision_count: 1,
          influence_points: 1,
          local_date_matches: true,
        },
      ]);

      await expect(
        pool.query(
          `update private.territory_influence_contributions
              set influence_points = 1
            where source_match_id = $1::uuid`,
          [matchId],
        ),
      ).rejects.toThrow(/immutable/u);
      await expect(
        pool.query(
          `delete from private.territory_contribution_decisions
            where source_match_id = $1::uuid`,
          [matchId],
        ),
      ).rejects.toThrow(/immutable/u);
    }, 60_000);

    it('persists versioned settlement history, rebuilds current ownership, and clears a deleting owner', async () => {
      const player = await createPlayer(pool, seasonId);
      const westZoneId = requireZone(zones, 'west_campus');
      const windows = await pool.query<{
        first_start: Date;
        second_start: Date;
        first_end: Date;
        second_end: Date;
      }>(
        `select
           (date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             - interval '2 hours') at time zone 'Africa/Johannesburg' first_start,
           (date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             - interval '1 hour') at time zone 'Africa/Johannesburg' second_start,
           (date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             - interval '1 hour') at time zone 'Africa/Johannesburg' first_end,
           date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             at time zone 'Africa/Johannesburg' second_end`,
      );
      const window = windows.rows[0]!;

      const firstReceiptId = await insertSettlement(pool, {
        zoneId: westZoneId,
        seasonId,
        windowStart: window.first_start,
        windowEnd: window.first_end,
        expectedStateVersion: 0,
        ownerBeforePlayerId: null,
        ownerAfterPlayerId: player.id,
        digestCharacter: 'a',
      });
      await insertSettlement(pool, {
        zoneId: westZoneId,
        seasonId,
        windowStart: window.second_start,
        windowEnd: window.second_end,
        expectedStateVersion: 1,
        ownerBeforePlayerId: player.id,
        ownerAfterPlayerId: player.id,
        digestCharacter: 'b',
      });

      const history = await pool.query<{
        owner: string | null;
        previous_owner: string | null;
        state_version: string;
        transition_kind: string;
      }>(
        `select state_version::text,
                previous_owner_player_id::text previous_owner,
                owner_player_id::text owner,
                transition_kind
           from private.territory_ownership_versions
          where zone_id = $1::uuid
          order by state_version`,
        [westZoneId],
      );
      expect(history.rows).toEqual([
        {
          owner: null,
          previous_owner: null,
          state_version: '0',
          transition_kind: 'activated',
        },
        {
          owner: player.id,
          previous_owner: null,
          state_version: '1',
          transition_kind: 'settlement',
        },
        {
          owner: player.id,
          previous_owner: player.id,
          state_version: '2',
          transition_kind: 'settlement',
        },
      ]);

      await expect(
        insertSettlement(pool, {
          zoneId: westZoneId,
          seasonId,
          windowStart: new Date(window.first_start.getTime() - 60 * 60 * 1000),
          windowEnd: window.first_start,
          expectedStateVersion: 0,
          ownerBeforePlayerId: null,
          ownerAfterPlayerId: player.id,
          digestCharacter: 'c',
        }),
      ).rejects.toThrow(/stale/u);

      const rebuildClient = await pool.connect();
      let rebuiltCount: number | undefined;
      try {
        await rebuildClient.query('begin');
        await rebuildClient.query(
          `delete from private.territory_current_ownership`,
        );
        const rebuild = await rebuildClient.query<{ rebuilt: number }>(
          `select private.rebuild_territory_current_ownership() rebuilt`,
        );
        rebuiltCount = rebuild.rows[0]?.rebuilt;
        await rebuildClient.query('commit');
      } catch (error) {
        await rebuildClient.query('rollback');
        throw error;
      } finally {
        rebuildClient.release();
      }
      expect(rebuiltCount).toBe(3);

      const rebuilt = await loadCurrentOwner(pool, westZoneId);
      expect(rebuilt).toEqual({
        owner_player_id: player.id,
        state_version: '2',
      });

      await expect(
        pool.query(
          `update private.territory_current_ownership current_state
              set ownership_version_id = version.id
             from private.territory_ownership_versions version
            where current_state.zone_id = $1::uuid
              and version.zone_id = current_state.zone_id
              and version.state_version = 1`,
          [westZoneId],
        ),
      ).rejects.toThrow(/authoritative history/u);

      const deletionRequestId = randomUUID();
      const deletionRequestedAt = new Date();
      await pool.query(
        `insert into public.account_deletion_requests (
           id, requested_at, status
         ) values ($1::uuid, $2, 'pending')`,
        [deletionRequestId, deletionRequestedAt],
      );
      await pool.query(
        `update public.players
            set lifecycle_status = 'deletion_pending',
                deletion_request_id = $2::uuid,
                updated_at = $3
          where id = $1::uuid`,
        [player.id, deletionRequestId, deletionRequestedAt],
      );
      const afterDeletion = await loadCurrentOwner(pool, westZoneId);
      expect(afterDeletion).toEqual({
        owner_player_id: null,
        state_version: '3',
      });

      const retainedReceipt = await pool.query<{ id: string }>(
        `select id::text
           from private.territory_settlement_receipts
          where id = $1::uuid`,
        [firstReceiptId],
      );
      expect(retainedReceipt.rows).toEqual([{ id: firstReceiptId }]);
    });

    it('rechecks current ownership after a concurrent lifecycle transition during account deletion', async () => {
      const player = await createPlayer(pool, seasonId);
      const eastZoneId = requireZone(zones, 'east_campus');
      const windows = await pool.query<{
        window_start: Date;
        window_end: Date;
      }>(
        `select
           (date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             - interval '1 hour') at time zone 'Africa/Johannesburg' window_start,
           date_trunc('hour', now() at time zone 'Africa/Johannesburg')
             at time zone 'Africa/Johannesburg' window_end`,
      );
      const window = windows.rows[0]!;

      await insertSettlement(pool, {
        zoneId: eastZoneId,
        seasonId,
        windowStart: window.window_start,
        windowEnd: window.window_end,
        expectedStateVersion: 0,
        ownerBeforePlayerId: null,
        ownerAfterPlayerId: player.id,
        digestCharacter: 'd',
      });

      const deletionRequestId = randomUUID();
      const deletionRequestedAt = new Date();
      await pool.query(
        `insert into public.account_deletion_requests (
           id, requested_at, status
         ) values ($1::uuid, $2, 'pending')`,
        [deletionRequestId, deletionRequestedAt],
      );

      const lifecycleClient = await pool.connect();
      const deletionClient = await pool.connect();
      let lifecycleCommitted = false;
      let deletionCommitted = false;

      try {
        await lifecycleClient.query('begin');
        await deletionClient.query('begin');

        await lifecycleClient.query(
          `update public.territory_zones
              set status = 'suspended',
                  lifecycle_version = lifecycle_version + 1,
                  suspended_at = now(),
                  updated_at = now()
            where id = $1::uuid`,
          [eastZoneId],
        );

        const deletionBackend = await deletionClient.query<{ pid: number }>(
          `select pg_backend_pid()::int pid`,
        );
        const deletionPid = deletionBackend.rows[0]?.pid;
        expect(deletionPid).toBeDefined();

        const deletionUpdate = deletionClient.query(
          `update public.players
              set lifecycle_status = 'deletion_pending',
                  deletion_request_id = $2::uuid,
                  updated_at = $3
            where id = $1::uuid`,
          [player.id, deletionRequestId, deletionRequestedAt],
        );

        await waitForBackendLock(pool, deletionPid!);
        await lifecycleClient.query('commit');
        lifecycleCommitted = true;

        await deletionUpdate;
        await deletionClient.query('commit');
        deletionCommitted = true;
      } finally {
        if (!lifecycleCommitted) {
          await lifecycleClient.query('rollback').catch(() => undefined);
        }
        if (!deletionCommitted) {
          await deletionClient.query('rollback').catch(() => undefined);
        }
        lifecycleClient.release();
        deletionClient.release();
      }

      const current = await loadCurrentOwner(pool, eastZoneId);
      expect(current).toEqual({ owner_player_id: null, state_version: '2' });

      const history = await pool.query<{ transition_kind: string }>(
        `select transition_kind
           from private.territory_ownership_versions
          where zone_id = $1::uuid
          order by state_version`,
        [eastZoneId],
      );
      expect(history.rows).toEqual([
        { transition_kind: 'activated' },
        { transition_kind: 'settlement' },
        { transition_kind: 'suspended' },
      ]);
    }, 60_000);

    it('settles threshold boundaries with real policy reads and rolls back a failed standalone receipt', async () => {
      const clock = await pool.query<{ start: Date; end: Date }>(
        `select date_trunc('hour', now()) - interval '1 hour' as start,
                date_trunc('hour', now()) as end`,
      );
      const window = clock.rows[0]!;
      for (const influenceCount of [2, 3, 4]) {
        const zone = await pool.query<{ id: string }>(
          `insert into public.territory_zones (
             policy_version, zone_key, definition_version, name, area,
             status, source_urls, review_provenance, reviewed_at, activated_at,
             created_at, updated_at
           ) select $1, $2, 1, 'Settlement threshold fixture',
                    st_translate(area, $3, 0), 'active', source_urls,
                    'controlled_policy', $4, $4, $4, $4
               from public.territory_zones where id = $5::uuid
           returning id::text`,
          [
            TERRITORY_POLICY,
            `threshold_${influenceCount}`,
            0.2 + influenceCount * 0.05,
            window.start,
            requireZone(zones, 'east_campus'),
          ],
        );
        const zoneId = zone.rows[0]!.id;
        const winner = await createPlayer(pool, seasonId);
        for (let index = 0; index < influenceCount; index += 1) {
          const loser = await createPlayer(pool, seasonId);
          const pair = await createAcceptedPair(pool, seasonId, winner, loser);
          const matchId = await createRankedMatch(pool, pair, cards);
          await completeRankedMatch(pool, seasonId, matchId, winner, loser);
          await recordAcceptedContribution(pool, {
            matchId,
            seasonId,
            playerId: winner.id,
            zoneId,
            contributedAt: new Date(window.start.getTime() + 300_000 + index),
          });
        }
        let policyReads = 0;
        let releases = 0;
        let failTotals = true;
        const database = {
          async connect() {
            const client = await pool.connect();
            return {
              async query(statement: string, values?: unknown[]) {
                if (statement.includes('select minimum_ownership_influence'))
                  policyReads += 1;
                if (
                  failTotals &&
                  statement.includes(
                    'insert into private.territory_settlement_totals',
                  )
                ) {
                  // Abort a real PostgreSQL transaction after receipt creation.
                  return client.query('select 1 / 0');
                }
                return client.query(statement, values);
              },
              release() {
                releases += 1;
                client.release();
              },
            } as RankedClient;
          },
          query: pool.query.bind(pool),
        } as RankedDatabase;
        const input = {
          zoneId,
          seasonId,
          windowStart: window.start,
          windowEnd: window.end,
          kind: 'hourly' as const,
        };
        await expect(
          rankedTransaction(database, (client) =>
            settleTerritoryWindow(client, input),
          ),
        ).rejects.toThrow(/division by zero/u);
        expect(await loadCurrentOwner(pool, zoneId)).toEqual({
          owner_player_id: null,
          state_version: '0',
        });
        const rolledBack = await pool.query<{ count: number }>(
          `select count(*)::int as count from private.territory_settlement_receipts where zone_id = $1::uuid`,
          [zoneId],
        );
        expect(rolledBack.rows[0]?.count).toBe(0);
        expect(releases).toBe(1);
        failTotals = false;
        const result = await rankedTransaction(database, (client) =>
          settleTerritoryWindow(client, input),
        );
        expect(result.ownerAfterPlayerId).toBe(
          influenceCount < 3 ? null : winner.id,
        );
        expect(
          await rankedTransaction(database, (client) =>
            settleTerritoryWindow(client, input),
          ),
        ).toEqual(result);
        // One failed attempt + one successful standalone lookup; receipt replay
        // does not reload policy or append another ownership version.
        expect(policyReads).toBe(2);
        expect(releases).toBe(3);
        expect(await loadCurrentOwner(pool, zoneId)).toEqual({
          owner_player_id: result.ownerAfterPlayerId,
          state_version: '1',
        });
        const totals = await pool.query<{ count: number }>(
          `select accepted_influence_count as count from private.territory_settlement_totals where settlement_receipt_id = $1::uuid`,
          [result.receiptId],
        );
        expect(totals.rows).toEqual([{ count: influenceCount }]);
        expect(pool.waitingCount).toBe(0);
        expect(pool.idleCount).toBe(pool.totalCount);
      }
    }, 60_000);

    it('preserves ownership history when a zone is suspended and retired', async () => {
      const zoneId = requireZone(zones, 'arts_and_community');
      const before = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from private.territory_ownership_versions
          where zone_id = $1::uuid`,
        [zoneId],
      );

      await pool.query(
        `update public.territory_zones
            set status = 'suspended',
                lifecycle_version = lifecycle_version + 1,
                suspended_at = now(),
                updated_at = now()
          where id = $1::uuid`,
        [zoneId],
      );
      await pool.query(
        `update public.territory_zones
            set status = 'retired',
                lifecycle_version = lifecycle_version + 1,
                retired_at = now(),
                updated_at = now()
          where id = $1::uuid`,
        [zoneId],
      );

      const retained = await pool.query<{
        history_count: number;
        status: string;
      }>(
        `select
           (select status from public.territory_zones where id = $1::uuid) status,
           (select count(*)::int
              from private.territory_ownership_versions
             where zone_id = $1::uuid) history_count`,
        [zoneId],
      );
      expect(retained.rows).toEqual([
        { history_count: (before.rows[0]?.count ?? 0) + 2, status: 'retired' },
      ]);

      await expect(
        pool.query(
          `update public.territory_zones
              set status = 'active',
                  lifecycle_version = lifecycle_version + 1,
                  retired_at = null,
                  updated_at = now()
            where id = $1::uuid`,
          [zoneId],
        ),
      ).rejects.toThrow(/immutable/u);

      await runSeeds(temporaryConfig);
      const stillRetired = await pool.query<{ status: string }>(
        `select status from public.territory_zones where id = $1::uuid`,
        [zoneId],
      );
      expect(stillRetired.rows).toEqual([{ status: 'retired' }]);
    });
  },
);

async function waitForBackendLock(
  database: Pick<pg.Pool, 'query'>,
  backendPid: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const activity = await database.query<{ wait_event_type: string | null }>(
      `select wait_event_type
         from pg_stat_activity
        where pid = $1::int`,
      [backendPid],
    );

    if (activity.rows[0]?.wait_event_type === 'Lock') return;
    await delay(25);
  }

  throw new Error(
    'Timed out waiting for the deletion transaction to block on the territory zone lock.',
  );
}

async function activateSeason(database: Pick<pg.Pool, 'query'>, id: string) {
  return database.query(
    `update public.ranked_seasons
        set status = 'active', version = version + 1,
            activated_at = now(), active_ends_at = now() + interval '28 days',
            updated_at = now()
      where id = $1::uuid`,
    [id],
  );
}

async function createPlayer(
  database: Pick<pg.Pool, 'query'>,
  seasonId: string,
): Promise<RankedPlayer> {
  const id = randomUUID();
  const deckId = randomUUID();
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values (
       $1::uuid, 'https://issuer.example/', $2,
       $3, 'player'
     )`,
    [id, `auth0|territory-${id}`, `territory_${id.slice(0, 8)}`],
  );
  await database.query(
    `insert into public.player_decks (id, player_id, name)
     values ($1::uuid, $2::uuid, 'Territory test deck')`,
    [deckId, id],
  );
  await database.query(
    `insert into public.ranked_player_season_ratings (
       season_id, player_id, starting_rating, rating
     ) values ($1::uuid, $2::uuid, 1000, 1000)`,
    [seasonId, id],
  );
  return { id, deckId };
}

async function enqueue(
  database: Pick<pg.Pool, 'query'>,
  seasonId: string,
  player: RankedPlayer,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `insert into private.ranked_queue_entries (
       id, season_id, player_id, selected_deck_id
     ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
    [id, seasonId, player.id, player.deckId],
  );
  return id;
}

async function claimPair(
  database: Pick<pg.Pool, 'connect'>,
  seasonId: string,
  firstQueueId: string,
  secondQueueId: string,
  first: RankedPlayer,
  second: RankedPlayer,
): Promise<RankedPair> {
  const proposalId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into private.ranked_matchmaking_proposals (
         id, season_id, created_at, acceptance_deadline
       ) values (
         $1::uuid, $2::uuid, now(), now() + interval '20 seconds'
       )`,
      [proposalId, seasonId],
    );
    const updated = await client.query(
      `update private.ranked_queue_entries
          set status = 'proposed', version = version + 1,
              lease_expires_at = null, active_proposal_id = $3::uuid,
              updated_at = now()
        where id in ($1::uuid, $2::uuid) and status = 'searching'
        returning id`,
      [firstQueueId, secondQueueId, proposalId],
    );
    if (updated.rowCount !== 2) {
      throw new Error('Another worker claimed this queue entry');
    }
    await client.query(
      `insert into private.ranked_matchmaking_proposal_participants (
         proposal_id, season_id, player_id, queue_entry_id
       ) values
         ($1::uuid, $2::uuid, $3::uuid, $4::uuid),
         ($1::uuid, $2::uuid, $5::uuid, $6::uuid)`,
      [proposalId, seasonId, first.id, firstQueueId, second.id, secondQueueId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return { seasonId, first, second, proposalId };
}

async function createAcceptedPair(
  database: pg.Pool,
  seasonId: string,
  first: RankedPlayer,
  second: RankedPlayer,
): Promise<RankedPair> {
  const firstQueueId = await enqueue(database, seasonId, first);
  const secondQueueId = await enqueue(database, seasonId, second);
  const pair = await claimPair(
    database,
    seasonId,
    firstQueueId,
    secondQueueId,
    first,
    second,
  );
  await database.query(
    `update private.ranked_matchmaking_proposal_participants
        set acceptance_status = 'accepted', responded_at = now()
      where proposal_id = $1::uuid`,
    [pair.proposalId],
  );
  return pair;
}

async function createRankedMatch(
  database: pg.Pool,
  pair: RankedPair,
  cards: readonly CardDefinition[],
): Promise<string> {
  const matchId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `update private.ranked_queue_entries
          set status = 'matched', version = version + 1,
              lease_expires_at = null, active_proposal_id = null,
              terminal_at = now(), updated_at = now()
        where active_proposal_id = $1::uuid`,
      [pair.proposalId],
    );
    await client.query(
      `update private.ranked_matchmaking_proposals
          set status = 'matched', version = version + 1, resolved_at = now()
        where id = $1::uuid`,
      [pair.proposalId],
    );
    await client.query(
      `insert into public.live_pvp_matches (
         id, decision_started_at, turn_deadline
       ) values ($1::uuid, now(), now() + interval '60 seconds')`,
      [matchId],
    );
    for (const [index, player] of [pair.first, pair.second].entries()) {
      const snapshotId = randomUUID();
      await client.query(
        `insert into private.live_pvp_deck_snapshots (
           id, match_id, player_id, participant_side, source_deck_id
         ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
        [
          snapshotId,
          matchId,
          player.id,
          index === 0 ? 'player_one' : 'player_two',
          player.deckId,
        ],
      );
      for (const [position, card] of cards.entries()) {
        await client.query(
          `insert into private.live_pvp_deck_snapshot_cards (
             snapshot_id, position, battle_card_id, source_owned_card_id,
             source_card_definition_id, category, affinity, rarity,
             card_snapshot
           ) values (
             $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8,
             '{}'::jsonb
           )`,
          [
            snapshotId,
            position + 1,
            randomUUID(),
            randomUUID(),
            card.id,
            card.category,
            card.affinity,
            card.rarity,
          ],
        );
      }
      await client.query(
        `insert into public.live_pvp_match_participants (
           match_id, player_id, participant_side, deck_snapshot_id
         ) values ($1::uuid, $2::uuid, $3, $4::uuid)`,
        [
          matchId,
          player.id,
          index === 0 ? 'player_one' : 'player_two',
          snapshotId,
        ],
      );
    }
    await client.query(
      `insert into private.live_pvp_match_states (
         match_id, version, battle_state
       ) values ($1::uuid, 0, '{}'::jsonb)`,
      [matchId],
    );
    await client.query(
      `insert into private.ranked_matchmaking_receipts (
         proposal_id, match_id, season_id, policy_version
       ) values ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [pair.proposalId, matchId, pair.seasonId, RANKED_POLICY],
    );
    for (const player of [pair.first, pair.second]) {
      await client.query(
        `insert into private.ranked_match_rating_inputs (
           match_id, season_id, policy_version, player_id,
           pre_match_rating, prior_settled_match_count, k_factor
         )
         select $1::uuid, rating.season_id, $4, $2::uuid,
                rating.rating, rating.settled_match_count,
                case when rating.settled_match_count < 5 then 40 else 24 end
           from public.ranked_player_season_ratings rating
          where rating.season_id = $3::uuid and rating.player_id = $2::uuid`,
        [matchId, player.id, pair.seasonId, RANKED_POLICY],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return matchId;
}

async function completeRankedMatch(
  database: pg.Pool,
  seasonId: string,
  matchId: string,
  winner: RankedPlayer,
  loser: RankedPlayer,
) {
  const actionId = randomUUID();
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `update public.live_pvp_matches
          set status = 'completed', version = 1, phase = 'completed',
              decision_started_at = null, turn_deadline = null,
              winner_player_id = $2::uuid, completion_reason = 'defeat',
              completed_at = now(), updated_at = now()
        where id = $1::uuid`,
      [matchId, winner.id],
    );
    await client.query(
      `update private.live_pvp_match_states
          set version = 1, battle_state = '{"phase":"completed"}'::jsonb,
              updated_at = now()
        where match_id = $1::uuid`,
      [matchId],
    );
    await client.query(
      `update public.live_pvp_match_participants
          set outcome = case when player_id = $2::uuid then 'win' else 'loss' end,
              updated_at = now()
        where match_id = $1::uuid`,
      [matchId, winner.id],
    );
    await client.query(
      `insert into public.live_pvp_match_actions (
         id, match_id, sequence, previous_version, committed_version,
         transition_kind, public_result
       ) values ($1::uuid, $2::uuid, 1, 0, 1, 'timeout', '{}'::jsonb)`,
      [actionId, matchId],
    );
    await client.query(
      `insert into private.live_pvp_match_transitions (
         action_id, match_id, state_before, state_after,
         authoritative_result
       ) values (
         $1::uuid, $2::uuid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
       )`,
      [actionId, matchId],
    );
    await client.query(
      `insert into private.live_pvp_completion_sources (
         match_id, player_id, outcome, completion_reason, occurred_at
       ) values
         ($1::uuid, $2::uuid, 'win', 'defeat', now()),
         ($1::uuid, $3::uuid, 'loss', 'defeat', now())`,
      [matchId, winner.id, loser.id],
    );
    await settlePair(client, seasonId, matchId, winner, loser);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function settlePair(
  client: pg.PoolClient,
  seasonId: string,
  matchId: string,
  winner: RankedPlayer,
  loser: RankedPlayer,
) {
  await client.query(
    `insert into private.ranked_rating_settlements (
       match_id, season_id, policy_version, winner_player_id,
       loser_player_id, completion_reason, settled_at
     ) values (
       $1::uuid, $2::uuid, $5, $3::uuid, $4::uuid,
       'defeat', now()
     )`,
    [matchId, seasonId, winner.id, loser.id, RANKED_POLICY],
  );
  for (const [player, outcome] of [
    [winner, 'win'],
    [loser, 'loss'],
  ] as const) {
    const state = await client.query<{
      rating: number;
      settled_match_count: number;
      wins: number;
      losses: number;
    }>(
      `select rating, settled_match_count, wins, losses
         from public.ranked_player_season_ratings
        where season_id = $1::uuid and player_id = $2::uuid
        for update`,
      [seasonId, player.id],
    );
    const current = state.rows[0]!;
    const opponentState = await client.query<{ rating: number }>(
      `select pre_match_rating as rating
         from private.ranked_match_rating_inputs
        where match_id = $1::uuid and player_id <> $2::uuid`,
      [matchId, player.id],
    );
    const kFactor = current.settled_match_count < 5 ? 40 : 24;
    const expected =
      1 / (1 + 10 ** ((opponentState.rows[0]!.rating - current.rating) / 400));
    const expectedScore = Number(expected.toFixed(15));
    const rawDelta = kFactor * (Number(outcome === 'win') - expectedScore);
    const calculatedDelta =
      Math.sign(rawDelta) * Math.round(Math.abs(rawDelta));
    const nextRating = Math.max(100, current.rating + calculatedDelta);
    const appliedDelta = nextRating - current.rating;
    await client.query(
      `insert into private.ranked_rating_ledger_entries (
         match_id, season_id, policy_version, player_id, outcome,
         rating_before, expected_score, k_factor,
         calculated_delta, applied_delta, rating_after,
         match_count_before, match_count_after,
         wins_before, wins_after, losses_before, losses_after
       ) values (
         $1::uuid, $2::uuid, $17, $3::uuid, $4,
         $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        matchId,
        seasonId,
        player.id,
        outcome,
        current.rating,
        expectedScore,
        kFactor,
        calculatedDelta,
        appliedDelta,
        nextRating,
        current.settled_match_count,
        current.settled_match_count + 1,
        current.wins,
        current.wins + Number(outcome === 'win'),
        current.losses,
        current.losses + Number(outcome === 'loss'),
        RANKED_POLICY,
      ],
    );
    await client.query(
      `update public.ranked_player_season_ratings
          set rating = $3, settled_match_count = settled_match_count + 1,
              wins = wins + $4, losses = losses + $5,
              rating_first_reached_at = now(),
              last_settled_match_id = $6::uuid, updated_at = now()
        where season_id = $1::uuid and player_id = $2::uuid`,
      [
        seasonId,
        player.id,
        nextRating,
        Number(outcome === 'win'),
        Number(outcome === 'loss'),
        matchId,
      ],
    );
  }
}

async function recordAcceptedContribution(
  database: pg.Pool,
  input: {
    matchId: string;
    seasonId: string;
    playerId: string;
    zoneId: string;
    contributedAt?: Date;
  },
) {
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into private.territory_contribution_decisions (
         source_match_id, ranked_season_id, ranked_policy_version,
         territory_policy_version, winner_player_id, zone_id,
         outcome, influence_points
       ) values (
         $1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid,
         'accepted', 1
       )`,
      [
        input.matchId,
        input.seasonId,
        RANKED_POLICY,
        TERRITORY_POLICY,
        input.playerId,
        input.zoneId,
      ],
    );
    await client.query(
      `insert into private.territory_influence_contributions (
         source_match_id, ranked_season_id, territory_policy_version,
         zone_id, player_id, influence_points, contributed_at
       ) values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, 1, $6::timestamptz)`,
      [
        input.matchId,
        input.seasonId,
        TERRITORY_POLICY,
        input.zoneId,
        input.playerId,
        input.contributedAt ?? null,
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

async function insertSettlement(
  database: Pick<pg.Pool, 'query'>,
  input: {
    zoneId: string;
    seasonId: string;
    windowStart: Date;
    windowEnd: Date;
    expectedStateVersion: number;
    ownerBeforePlayerId: string | null;
    ownerAfterPlayerId: string | null;
    digestCharacter: string;
  },
): Promise<string> {
  const result = await database.query<{ id: string }>(
    `insert into private.territory_settlement_receipts (
       zone_id, ranked_season_id, territory_policy_version,
       window_start, window_end, expected_state_version,
       resulting_state_version, owner_before_player_id,
       owner_after_player_id, input_digest
     ) values (
       $1::uuid, $2::uuid, $3, $4, $5, $6::bigint, $6::bigint + 1,
       $7::uuid, $8::uuid, repeat($9, 64)
     ) returning id::text`,
    [
      input.zoneId,
      input.seasonId,
      TERRITORY_POLICY,
      input.windowStart,
      input.windowEnd,
      input.expectedStateVersion,
      input.ownerBeforePlayerId,
      input.ownerAfterPlayerId,
      input.digestCharacter,
    ],
  );
  return result.rows[0]?.id ?? '';
}

async function loadCurrentOwner(
  database: Pick<pg.Pool, 'query'>,
  zoneId: string,
): Promise<{ owner_player_id: string | null; state_version: string }> {
  const result = await database.query<{
    owner_player_id: string | null;
    state_version: string;
  }>(
    `select version.owner_player_id::text, version.state_version::text
       from private.territory_current_ownership current_state
       join private.territory_ownership_versions version
         on version.id = current_state.ownership_version_id
      where current_state.zone_id = $1::uuid`,
    [zoneId],
  );
  return result.rows[0]!;
}

function requireZone(zoneMap: Map<string, string>, key: string): string {
  const id = zoneMap.get(key);
  if (!id) throw new Error(`Expected seeded territory zone ${key}.`);
  return id;
}

async function copyMigrationsBeforeTerritory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wits-territory-migrations-'));
  const source = getMigrationsDirectory();
  const files = (await readdir(source))
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_NAME)
    .sort();
  await Promise.all(
    files.map((name) => copyFile(join(source, name), join(directory, name))),
  );
  return directory;
}

async function copySeedsBeforeTerritory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wits-territory-seeds-'));
  const source = getSeedsDirectory();
  const files = (await readdir(source))
    .filter((name) => name.endsWith('.sql') && name < SEED_NAME)
    .sort();
  await Promise.all(
    files.map((name) => copyFile(join(source, name), join(directory, name))),
  );
  return directory;
}
