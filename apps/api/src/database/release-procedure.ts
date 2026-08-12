import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import { runMigrations, type MigrationResult } from './migrations.js';
import { getMigrationsDirectory, getSeedsDirectory } from './paths.js';
import { checkDatabaseReadiness, type DatabaseReadiness } from './readiness.js';
import { runSeeds, type SeedResult } from './seeds.js';

const DEMO_EVENT_ID = '00000000-0000-4000-8000-000000000018';

export interface DatabaseReleaseInspection {
  database: string;
  postgisAvailableVersion: string;
  serverVersion: string;
}

export interface DatabaseReleaseVerification {
  demoEventCount?: number;
  migrationCount: number;
}

export interface DatabaseReleaseResult {
  inspection: DatabaseReleaseInspection;
  migrations: MigrationResult;
  readiness: DatabaseReadiness;
  seeds: SeedResult | null;
  verification: DatabaseReleaseVerification;
}

interface DatabaseReleaseOptions {
  confirmDatabase: string;
  databaseConfig: DatabaseConfig;
  includeDemoSeed: boolean;
  onInspection?: (inspection: DatabaseReleaseInspection) => void;
}

interface DatabaseReleaseDependencies {
  checkReadiness?: typeof checkDatabaseReadiness;
  inspectTarget?: typeof inspectDatabaseReleaseTarget;
  migrationsDirectory?: string;
  runMigrationFiles?: typeof runMigrations;
  runSeedFiles?: typeof runSeeds;
  seedsDirectory?: string;
  verifyRelease?: typeof verifyDatabaseRelease;
}

export async function runDatabaseRelease(
  {
    confirmDatabase,
    databaseConfig,
    includeDemoSeed,
    onInspection = () => undefined,
  }: DatabaseReleaseOptions,
  {
    checkReadiness = checkDatabaseReadiness,
    inspectTarget = inspectDatabaseReleaseTarget,
    migrationsDirectory = getMigrationsDirectory(),
    runMigrationFiles = runMigrations,
    runSeedFiles = runSeeds,
    seedsDirectory = getSeedsDirectory(),
    verifyRelease = verifyDatabaseRelease,
  }: DatabaseReleaseDependencies = {},
): Promise<DatabaseReleaseResult> {
  const inspection = await inspectTarget(databaseConfig);
  onInspection(inspection);

  if (inspection.database !== confirmDatabase) {
    throw new Error(
      `Database confirmation failed: expected ${confirmDatabase}, connected to ${inspection.database}.`,
    );
  }

  const migrations = await runMigrationFiles(
    databaseConfig,
    migrationsDirectory,
  );
  const readiness = await checkReadiness(databaseConfig);
  const seeds = includeDemoSeed
    ? await runSeedFiles(databaseConfig, seedsDirectory)
    : null;
  const verification = await verifyRelease(databaseConfig, {
    expectedMigrationCount:
      migrations.applied.length + migrations.skipped.length,
    verifyDemoEvent: includeDemoSeed,
  });

  return {
    inspection,
    migrations,
    readiness,
    seeds,
    verification,
  };
}

export async function inspectDatabaseReleaseTarget(
  databaseConfig: DatabaseConfig,
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<DatabaseReleaseInspection> {
  return runWithClient(databaseConfig, async (client) => {
    const connection = await client.query<{
      database: string;
      server_version: string;
    }>(
      `select current_database() as database,
              version() as server_version`,
    );
    const postgis = await client.query<{ default_version: string }>(
      `select default_version
         from pg_available_extensions
        where name = 'postgis'`,
    );

    return {
      database: requireSingleRow(connection, 'connection').database,
      postgisAvailableVersion: requireSingleRow(postgis, 'PostGIS')
        .default_version,
      serverVersion: requireSingleRow(connection, 'connection').server_version,
    };
  });
}

export async function verifyDatabaseRelease(
  databaseConfig: DatabaseConfig,
  {
    expectedMigrationCount,
    verifyDemoEvent,
  }: { expectedMigrationCount: number; verifyDemoEvent: boolean },
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<DatabaseReleaseVerification> {
  return runWithClient(databaseConfig, async (client) => {
    const migrations = await client.query<{ count: string }>(
      'select count(*)::text as count from public.schema_migrations',
    );
    const migrationCount = parseCount(migrations, 'migration');

    if (migrationCount !== expectedMigrationCount) {
      throw new Error(
        `Database verification failed: expected ${expectedMigrationCount} recorded migrations, found ${migrationCount}.`,
      );
    }

    if (!verifyDemoEvent) {
      return { migrationCount };
    }

    const demoEvent = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.events
        where id = $1
          and is_published = true`,
      [DEMO_EVENT_ID],
    );
    const demoEventCount = parseCount(demoEvent, 'demo event');

    if (demoEventCount !== 1) {
      throw new Error(
        `Database verification failed: expected one published Sprint 1 demo event, found ${demoEventCount}.`,
      );
    }

    return { demoEventCount, migrationCount };
  });
}

function requireSingleRow<T extends pg.QueryResultRow>(
  result: pg.QueryResult<T>,
  description: string,
): T {
  const row = result.rows[0];

  if (!row) {
    throw new Error(`Database ${description} check returned no rows.`);
  }

  return row;
}

function parseCount(
  result: pg.QueryResult<{ count: string }>,
  description: string,
) {
  const count = Number.parseInt(
    requireSingleRow(result, description).count,
    10,
  );

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Database ${description} check returned an invalid count.`);
  }

  return count;
}
