import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import { runMigrations, type MigrationResult } from './migrations.js';
import {
  getBasicDemoSeedsDirectory,
  getMigrationsDirectory,
  getSeedsDirectory,
} from './paths.js';
import { checkDatabaseReadiness, type DatabaseReadiness } from './readiness.js';
import { runBasicDemoSeeds, type SeedResult } from './seeds.js';

const BASIC_DEMO_EVENT_IDS = [
  '00000000-0000-4000-8000-000000000018',
  '00000000-0000-4000-8000-000000000019',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000021',
];
const BASIC_DEMO_CHALLENGE_ID = '04b3f8bb-92ad-cd03-1d4c-11942a9d6551';

export interface DatabaseReleaseInspection {
  database: string;
  postgisAvailableVersion: string;
  serverVersion: string;
}

export interface DatabaseReleaseVerification {
  basicDemoEventCount?: number;
  basicDemoChallengeCount?: number;
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
  includeBasicDemoSeed: boolean;
  onInspection?: (inspection: DatabaseReleaseInspection) => void;
}

interface DatabaseReleaseDependencies {
  checkReadiness?: typeof checkDatabaseReadiness;
  inspectTarget?: typeof inspectDatabaseReleaseTarget;
  migrationsDirectory?: string;
  runMigrationFiles?: typeof runMigrations;
  runBasicDemoSeedFiles?: typeof runBasicDemoSeeds;
  seedsDirectory?: string;
  basicDemoSeedsDirectory?: string;
  verifyRelease?: typeof verifyDatabaseRelease;
}

export async function runDatabaseRelease(
  {
    confirmDatabase,
    databaseConfig,
    includeBasicDemoSeed,
    onInspection = () => undefined,
  }: DatabaseReleaseOptions,
  {
    checkReadiness = checkDatabaseReadiness,
    inspectTarget = inspectDatabaseReleaseTarget,
    migrationsDirectory = getMigrationsDirectory(),
    runMigrationFiles = runMigrations,
    runBasicDemoSeedFiles = runBasicDemoSeeds,
    seedsDirectory = getSeedsDirectory(),
    basicDemoSeedsDirectory = getBasicDemoSeedsDirectory(),
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
  const seeds = includeBasicDemoSeed
    ? await runBasicDemoSeedFiles(
        databaseConfig,
        seedsDirectory,
        basicDemoSeedsDirectory,
      )
    : null;
  const verification = await verifyRelease(databaseConfig, {
    expectedMigrationCount:
      migrations.applied.length + migrations.skipped.length,
    verifyBasicDemo: includeBasicDemoSeed,
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
    verifyBasicDemo,
  }: { expectedMigrationCount: number; verifyBasicDemo: boolean },
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

    if (!verifyBasicDemo) {
      return { migrationCount };
    }

    const demoEvents = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.events
        where id = any($1::uuid[])
          and is_published = true`,
      [BASIC_DEMO_EVENT_IDS],
    );
    const demoEventCount = parseCount(demoEvents, 'Basic demo event');

    if (demoEventCount !== BASIC_DEMO_EVENT_IDS.length) {
      throw new Error(
        `Database verification failed: expected ${BASIC_DEMO_EVENT_IDS.length} published Basic demo events, found ${demoEventCount}.`,
      );
    }

    const challenges = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.event_challenges
        where id = $1::uuid
          and status = 'published'`,
      [BASIC_DEMO_CHALLENGE_ID],
    );
    const basicDemoChallengeCount = parseCount(
      challenges,
      'Basic demo challenge',
    );

    if (basicDemoChallengeCount !== 1) {
      throw new Error(
        `Database verification failed: expected one published Basic demo challenge, found ${basicDemoChallengeCount}.`,
      );
    }

    return {
      basicDemoEventCount: demoEventCount,
      basicDemoChallengeCount,
      migrationCount,
    };
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
