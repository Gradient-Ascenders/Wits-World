import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type pg from 'pg';

import {
  getSessionDatabaseConfig,
  type DatabaseConfig,
} from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import { getMigrationsDirectory } from './paths.js';

const MIGRATION_LOCK_KEY = 9_160_001;

export interface MigrationFile {
  checksum: string;
  name: string;
  path: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface MigrationHistoryInspection {
  changed: string[];
  pending: string[];
  unexpected: string[];
}

export function inspectMigrationHistory(
  migrationFiles: readonly MigrationFile[],
  appliedMigrations: ReadonlyMap<string, string>,
): MigrationHistoryInspection {
  const sourceNames = new Set(migrationFiles.map(({ name }) => name));

  return {
    changed: migrationFiles
      .filter(
        ({ name, checksum }) =>
          appliedMigrations.has(name) &&
          appliedMigrations.get(name) !== checksum,
      )
      .map(({ name }) => name),
    pending: migrationFiles
      .filter(({ name }) => !appliedMigrations.has(name))
      .map(({ name }) => name),
    unexpected: [...appliedMigrations.keys()]
      .filter((name) => !sourceNames.has(name))
      .sort(),
  };
}

export async function runMigrations(
  databaseConfig: DatabaseConfig,
  migrationsDirectory = getMigrationsDirectory(),
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<MigrationResult> {
  const migrationFiles = await loadMigrationFiles(migrationsDirectory);

  return runWithClient(
    getSessionDatabaseConfig(databaseConfig),
    async (client) => {
      // This dedicated direct session spans the per-file migration transactions.
      await client.query("set lock_timeout = '30s'");
      await client.query("set statement_timeout = '5min'");
      try {
        await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      } catch (error) {
        if (
          error instanceof Error &&
          (error as NodeJS.ErrnoException).code === '55P03'
        ) {
          throw new Error(
            'Migration lock was not acquired within 30 seconds. Check for another database release before retrying.',
            { cause: error },
          );
        }
        throw error;
      }

      const result: MigrationResult = { applied: [], skipped: [] };
      let lockReleased: boolean;
      try {
        await ensureMigrationTable(client);

        const appliedMigrations = await loadAppliedMigrations(client);
        const history = inspectMigrationHistory(
          migrationFiles,
          appliedMigrations,
        );

        if (history.unexpected.length > 0) {
          throw new Error(
            `Applied migrations are missing from this release: ${history.unexpected.join(', ')}.`,
          );
        }

        if (history.changed.length > 0) {
          throw new Error(
            `Migration ${history.changed[0]} has changed after being applied.`,
          );
        }

        for (const migrationFile of migrationFiles) {
          const appliedChecksum = appliedMigrations.get(migrationFile.name);

          if (appliedChecksum) {
            result.skipped.push(migrationFile.name);
            continue;
          }

          await applyMigration(client, migrationFile);
          result.applied.push(migrationFile.name);
        }
      } finally {
        const unlocked = await client.query<{ pg_advisory_unlock: boolean }>(
          'select pg_advisory_unlock($1)',
          [MIGRATION_LOCK_KEY],
        );
        lockReleased = unlocked.rows[0]?.pg_advisory_unlock === true;
      }
      if (!lockReleased) {
        throw new Error(
          'Migration lock ownership was lost. Migrations require a direct, session-compatible database connection.',
        );
      }
      return result;
    },
  );
}

export async function loadMigrationFiles(
  migrationsDirectory: string,
): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectory);
  const migrationNames = entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort();

  return Promise.all(
    migrationNames.map(async (name) => {
      const path = resolve(migrationsDirectory, name);
      const sql = await readFile(path, 'utf8');
      const canonicalSql = sql.replace(/\r\n?/g, '\n');

      return {
        checksum: createHash('sha256').update(canonicalSql).digest('hex'),
        name: basename(name),
        path,
        sql,
      };
    }),
  );
}

async function ensureMigrationTable(client: pg.PoolClient) {
  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function loadAppliedMigrations(client: pg.PoolClient) {
  const result = await client.query<{ checksum: string; name: string }>(
    'select name, checksum from public.schema_migrations order by name',
  );

  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

async function applyMigration(
  client: pg.PoolClient,
  migrationFile: MigrationFile,
) {
  await client.query('begin');

  try {
    await client.query(migrationFile.sql);
    await client.query(
      'insert into public.schema_migrations (name, checksum) values ($1, $2)',
      [migrationFile.name, migrationFile.checksum],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
