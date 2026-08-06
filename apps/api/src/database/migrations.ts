import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { withDatabaseClient } from './connection.js';
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

export async function runMigrations(
  databaseConfig: DatabaseConfig,
  migrationsDirectory = getMigrationsDirectory(),
): Promise<MigrationResult> {
  const migrationFiles = await loadMigrationFiles(migrationsDirectory);

  return withDatabaseClient(databaseConfig, async (client) => {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    try {
      await ensureMigrationTable(client);

      const appliedMigrations = await loadAppliedMigrations(client);
      const result: MigrationResult = {
        applied: [],
        skipped: [],
      };

      for (const migrationFile of migrationFiles) {
        const appliedChecksum = appliedMigrations.get(migrationFile.name);

        if (appliedChecksum) {
          if (appliedChecksum !== migrationFile.checksum) {
            throw new Error(
              `Migration ${migrationFile.name} has changed after being applied.`,
            );
          }

          result.skipped.push(migrationFile.name);
          continue;
        }

        await applyMigration(client, migrationFile);
        result.applied.push(migrationFile.name);
      }

      return result;
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  });
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

      return {
        checksum: createHash('sha256').update(sql).digest('hex'),
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
