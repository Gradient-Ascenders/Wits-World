import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';

const POSITION_MIGRATION = '0019_limit_creature_move_positions.sql';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'Creature move-position migration safety',
  () => {
    let administrationConfig: DatabaseConfig | undefined;
    let migrationDirectory: string | undefined;
    let temporaryDatabaseName: string | undefined;

    afterAll(async () => {
      if (migrationDirectory) {
        await rm(migrationDirectory, { force: true, recursive: true });
      }
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('rejects position-above-four data without recording or partially applying 0019', async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_move_preflight_${Date.now()}_${process.pid}`;
      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      const temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };
      migrationDirectory = await mkdtemp(
        join(tmpdir(), 'wits-world-move-preflight-'),
      );

      const migrationNames = (await readdir(getMigrationsDirectory())).filter(
        (name) => name.endsWith('.sql') && name < POSITION_MIGRATION,
      );
      await Promise.all(
        migrationNames.map((name) =>
          copyFile(
            join(getMigrationsDirectory(), name),
            join(migrationDirectory!, name),
          ),
        ),
      );

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });
      await runMigrations(temporaryConfig, migrationDirectory);

      await withDatabaseClient(temporaryConfig, async (client) => {
        const definition = await client.query<{ id: string }>(
          `insert into public.card_definitions (
             name, category, affinity, rarity, hp, power
           ) values (
             'Legacy position-five draft', 'creature', 'wit', 'common', 100, 10
           ) returning id::text`,
        );
        await client.query(
          `insert into public.card_moves (
             card_definition_id, position, name, move_type,
             effect_type, effect_value, power_cost
           ) values ($1::uuid, 5, 'Legacy fifth move', 'basic', 'damage', 10, 1)`,
          [definition.rows[0]?.id],
        );
      });

      await copyFile(
        join(getMigrationsDirectory(), POSITION_MIGRATION),
        join(migrationDirectory, POSITION_MIGRATION),
      );

      await expect(
        runMigrations(temporaryConfig, migrationDirectory),
      ).rejects.toThrow('card_moves rows above position 4 exist');

      await withDatabaseClient(temporaryConfig, async (client) => {
        const state = await client.query<{
          migration_count: number;
          position_five_count: number;
        }>(
          `select
             (select count(*)::int
                from public.schema_migrations
               where name = $1) as migration_count,
             (select count(*)::int
                from public.card_moves
               where position = 5) as position_five_count`,
          [POSITION_MIGRATION],
        );

        expect(state.rows).toEqual([
          { migration_count: 0, position_five_count: 1 },
        ]);
      });
    }, 60_000);
  },
);
