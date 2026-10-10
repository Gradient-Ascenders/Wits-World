import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildMigrationDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  withDatabaseClient,
  type DatabaseClientRunner,
} from '../src/database/connection.js';
import {
  loadMigrationFiles,
  runMigrations,
} from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';
import { runDatabaseRelease } from '../src/database/release-procedure.js';
import { runSeeds } from '../src/database/seeds.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'isolated database maintenance',
  () => {
    let administrationConfig: DatabaseConfig;
    let databaseConfig: DatabaseConfig;
    let databaseName: string | undefined;
    let directory: string | undefined;
    let migrationsDirectory: string;
    let seedsDirectory: string;

    beforeAll(() => {
      loadApiEnvironment();
      administrationConfig = buildMigrationDatabaseConfig({ target: 'test' });
      const url = new URL(administrationConfig.connectionString);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
        url.hostname,
      );
      const isolatedCi =
        process.env.CI === 'true' &&
        url.hostname === 'postgres' &&
        url.port === '5432' &&
        url.username === 'wits_world_ci' &&
        url.pathname === '/wits_world_test' &&
        process.env.DATABASE_URL ===
          'postgresql://ci-guard:ci-guard@127.0.0.1:1/wits_world_ci_guard';
      if (!loopback && !isolatedCi)
        throw new Error(
          'Database maintenance tests require disposable local or isolated CI PostGIS, never Neon.',
        );
    });

    beforeEach(async () => {
      const name = `wits_release_${randomUUID().replaceAll('-', '')}`;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${name}`);
      });
      databaseName = name;
      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${name}`;
      databaseConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };
      directory = await mkdtemp(join(tmpdir(), 'wits-maintenance-'));
      migrationsDirectory = join(directory, 'migrations');
      seedsDirectory = join(directory, 'seeds');
      await mkdir(migrationsDirectory);
      await mkdir(seedsDirectory);
    }, 30_000);

    afterEach(async () => {
      try {
        if (databaseName) {
          await withDatabaseClient(administrationConfig, async (client) => {
            await client.query(`drop database ${databaseName} with (force)`);
          });
        }
      } finally {
        databaseName = undefined;
        if (directory) await rm(directory, { force: true, recursive: true });
        directory = undefined;
      }
    }, 30_000);

    it('serializes concurrent releases across individual migration commits', async () => {
      await writeFile(
        join(migrationsDirectory, '0001_create.sql'),
        'create table public.release_probe (id integer primary key); select pg_sleep(0.1); insert into public.release_probe values (1);',
      );
      await writeFile(
        join(migrationsDirectory, '0002_insert.sql'),
        'select pg_sleep(0.1); insert into public.release_probe values (2);',
      );

      const results = await Promise.all([
        runMigrations(databaseConfig, migrationsDirectory),
        runMigrations(databaseConfig, migrationsDirectory),
      ]);
      expect(results.map((result) => result.applied.length).sort()).toEqual([
        0, 2,
      ]);
      expect(results.map((result) => result.skipped.length).sort()).toEqual([
        0, 2,
      ]);
      await withDatabaseClient(databaseConfig, async (client) => {
        expect(
          (
            await client.query(
              'select id from public.release_probe order by id',
            )
          ).rows,
        ).toEqual([{ id: 1 }, { id: 2 }]);
      });
    }, 30_000);

    it('rolls back only the failed file, releases the session lock, and safely retries', async () => {
      await writeFile(
        join(migrationsDirectory, '0001_create.sql'),
        'create table public.release_probe (id integer primary key);',
      );
      await writeFile(
        join(migrationsDirectory, '0002_insert.sql'),
        'insert into public.release_probe values (2); select 1/0;',
      );
      await expect(
        runMigrations(databaseConfig, migrationsDirectory),
      ).rejects.toThrow('division by zero');
      await withDatabaseClient(databaseConfig, async (client) => {
        expect(
          (await client.query('select * from public.release_probe')).rows,
        ).toEqual([]);
        expect(
          (await client.query('select name from public.schema_migrations'))
            .rows,
        ).toEqual([{ name: '0001_create.sql' }]);
        expect(
          (
            await client.query(
              'select pg_try_advisory_lock(9160001) as acquired',
            )
          ).rows,
        ).toEqual([{ acquired: true }]);
        await client.query('select pg_advisory_unlock(9160001)');
      });
      await writeFile(
        join(migrationsDirectory, '0002_insert.sql'),
        'insert into public.release_probe values (2);',
      );
      await expect(
        runMigrations(databaseConfig, migrationsDirectory),
      ).resolves.toEqual({
        applied: ['0002_insert.sql'],
        skipped: ['0001_create.sql'],
      });
    }, 30_000);

    it('enforces the real 30-second lock deadline and leaves no blocked migration query', async () => {
      await writeFile(
        join(migrationsDirectory, '0001_pending.sql'),
        'create table public.must_not_exist (id integer);',
      );
      await withDatabaseClient(databaseConfig, async (holder) => {
        await holder.query('select pg_advisory_lock(9160001)');
        try {
          const startedAt = performance.now();
          await expect(
            runMigrations(databaseConfig, migrationsDirectory),
          ).rejects.toThrow('not acquired within 30 seconds');
          expect(performance.now() - startedAt).toBeLessThan(35_000);
          expect(
            (
              await holder.query(
                "select to_regclass('public.must_not_exist') as table_name",
              )
            ).rows,
          ).toEqual([{ table_name: null }]);
          expect(
            (
              await holder.query(
                `select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted and classid = 0 and objid = 9160001 and database = (select oid from pg_database where datname = current_database())`,
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
        } finally {
          await holder.query('select pg_advisory_unlock(9160001)');
        }
      });
    }, 40_000);

    it('releases transactional seed locks and timeout settings after commit and rollback', async () => {
      await withDatabaseClient(databaseConfig, async (client) => {
        const runner: DatabaseClientRunner = async (_config, run) =>
          run(client);
        await client.query(
          'create table public.seed_probe (id integer primary key)',
        );
        await writeFile(
          join(seedsDirectory, '0001_seed.sql'),
          'insert into public.seed_probe values (1);',
        );
        await runSeeds(databaseConfig, seedsDirectory, runner);
        expect(
          (
            await client.query(
              "select count(*)::int as count from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid = 0 and objid = 9160002",
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect((await client.query('show lock_timeout')).rows).toEqual([
          { lock_timeout: '0' },
        ]);
        await writeFile(
          join(seedsDirectory, '0001_seed.sql'),
          'insert into public.seed_probe values (2); select 1/0;',
        );
        await expect(
          runSeeds(databaseConfig, seedsDirectory, runner),
        ).rejects.toThrow('division by zero');
        expect(
          (await client.query('select id from public.seed_probe')).rows,
        ).toEqual([{ id: 1 }]);
        expect(
          (
            await client.query(
              "select count(*)::int as count from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and classid = 0 and objid = 9160002",
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect((await client.query('show statement_timeout')).rows).toEqual([
          { statement_timeout: '0' },
        ]);
      });
    }, 30_000);

    it('releases the full schema and verifies a no-op rerun without seeding production content', async () => {
      const count = (await loadMigrationFiles(getMigrationsDirectory())).length;
      const options = {
        confirmDatabase: databaseName!,
        databaseConfig,
        includeBasicDemoSeed: false,
      };
      const first = await runDatabaseRelease(options);
      expect(first.migrations.applied).toHaveLength(count);
      expect(first.seeds).toBeNull();
      expect(first.verification.migrationCount).toBe(count);
      const second = await runDatabaseRelease(options);
      expect(second.migrations).toEqual({
        applied: [],
        skipped: first.migrations.applied,
      });
      expect(second.seeds).toBeNull();
      expect(second.verification.migrationCount).toBe(count);
    }, 90_000);
  },
);
