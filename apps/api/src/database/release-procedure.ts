import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import { runMigrations, type MigrationResult } from './migrations.js';
import {
  getBasicDemoSeedsDirectory,
  getMigrationsDirectory,
  getSeedsDirectory,
  getVerifiedEventsSeedsDirectory,
} from './paths.js';
import { checkDatabaseReadiness, type DatabaseReadiness } from './readiness.js';
import {
  runBasicDemoSeeds,
  runVerifiedEventSeeds,
  type SeedResult,
} from './seeds.js';

const BASIC_DEMO_EVENT_IDS = [
  '00000000-0000-4000-8000-000000000018',
  '00000000-0000-4000-8000-000000000019',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000021',
];
const BASIC_DEMO_CHALLENGE_ID = '04b3f8bb-92ad-cd03-1d4c-11942a9d6551';
const BASIC_DEMO_PORTABLE_EVENT_IDS = [
  '00000000-0000-4000-8000-000000000026',
  '00000000-0000-4000-8000-000000000027',
  '00000000-0000-4000-8000-000000000028',
  '00000000-0000-4000-8000-000000000029',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000031',
];
const ACTIVE_CAMPUS_EVENT_KEYS = [
  'great-hall-foundations',
  'cullen-library-heritage',
  'origins-centre-discoveries',
  'school-of-arts-culture',
  'matrix-campus-life',
  'digital-dome-early-years',
  'science-stadium-milestones',
  'art-museum-timeline',
  'wits-club-public-life',
  'amphitheatre-modern-century',
  'msl-science-challenge',
];
const ACTIVE_CAMPUS_TRAIL_KEYS = [
  'east-campus-essentials',
  'west-campus-discovery',
  'arts-and-community',
];

export interface DatabaseReleaseInspection {
  database: string;
  postgisAvailableVersion: string;
  serverVersion: string;
}

export interface DatabaseReleaseVerification {
  basicDemoEventCount?: number;
  basicDemoChallengeCount?: number;
  basicDemoPortableEventCount?: number;
  migrationCount: number;
  verifiedEventCount?: number;
  verifiedQuestionCount?: number;
  verifiedTrailCount?: number;
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
  includeVerifiedEventsSeed?: boolean;
  onInspection?: (inspection: DatabaseReleaseInspection) => void;
}

interface DatabaseReleaseDependencies {
  checkReadiness?: typeof checkDatabaseReadiness;
  inspectTarget?: typeof inspectDatabaseReleaseTarget;
  migrationsDirectory?: string;
  runMigrationFiles?: typeof runMigrations;
  runBasicDemoSeedFiles?: typeof runBasicDemoSeeds;
  runVerifiedEventSeedFiles?: typeof runVerifiedEventSeeds;
  seedsDirectory?: string;
  basicDemoSeedsDirectory?: string;
  verifiedEventsSeedsDirectory?: string;
  verifyRelease?: typeof verifyDatabaseRelease;
}

export async function runDatabaseRelease(
  {
    confirmDatabase,
    databaseConfig,
    includeBasicDemoSeed,
    includeVerifiedEventsSeed = false,
    onInspection = () => undefined,
  }: DatabaseReleaseOptions,
  {
    checkReadiness = checkDatabaseReadiness,
    inspectTarget = inspectDatabaseReleaseTarget,
    migrationsDirectory = getMigrationsDirectory(),
    runMigrationFiles = runMigrations,
    runBasicDemoSeedFiles = runBasicDemoSeeds,
    runVerifiedEventSeedFiles = runVerifiedEventSeeds,
    seedsDirectory = getSeedsDirectory(),
    basicDemoSeedsDirectory = getBasicDemoSeedsDirectory(),
    verifiedEventsSeedsDirectory = getVerifiedEventsSeedsDirectory(),
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
    : includeVerifiedEventsSeed
      ? await runVerifiedEventSeedFiles(
          databaseConfig,
          seedsDirectory,
          verifiedEventsSeedsDirectory,
        )
      : null;
  const verification = await verifyRelease(databaseConfig, {
    expectedMigrationCount:
      migrations.applied.length + migrations.skipped.length,
    verifyBasicDemo: includeBasicDemoSeed,
    ...(includeVerifiedEventsSeed ? { verifyVerifiedEvents: true } : {}),
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
    verifyVerifiedEvents,
  }: {
    expectedMigrationCount: number;
    verifyBasicDemo: boolean;
    verifyVerifiedEvents?: boolean;
  },
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

    if (!verifyBasicDemo && !verifyVerifiedEvents) {
      return { migrationCount };
    }

    if (verifyVerifiedEvents) {
      const events = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.events
          where id in (
            select md5('wits-world-campus-event-v3:' || event_key)::uuid
              from unnest($1::text[]) event_key
          )
            and is_published = true
            and authoring_status = 'published'
            and retired_at is null`,
        [ACTIVE_CAMPUS_EVENT_KEYS],
      );
      const questions = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.challenge_questions question
           join public.event_challenges challenge on challenge.id = question.challenge_id
          where challenge.event_id in (
            select md5('wits-world-campus-event-v3:' || event_key)::uuid
              from unnest($1::text[]) event_key
          )
            and question.status = 'published'`,
        [ACTIVE_CAMPUS_EVENT_KEYS],
      );
      const trails = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.trails
          where id in (
            select md5('wits-world-campus-trail-v3:' || trail_key)::uuid
              from unnest($1::text[]) trail_key
          )
            and status = 'published'`,
        [ACTIVE_CAMPUS_TRAIL_KEYS],
      );
      const verifiedEventCount = parseCount(events, 'verified event');
      const verifiedQuestionCount = parseCount(questions, 'verified question');
      const verifiedTrailCount = parseCount(trails, 'verified trail');

      if (
        verifiedEventCount !== 11 ||
        verifiedQuestionCount !== 110 ||
        verifiedTrailCount !== 3
      ) {
        throw new Error(
          `Database verification failed: expected 11 verified events, 110 questions, and 3 trails; found ${verifiedEventCount}, ${verifiedQuestionCount}, and ${verifiedTrailCount}.`,
        );
      }

      return {
        migrationCount,
        verifiedEventCount,
        verifiedQuestionCount,
        verifiedTrailCount,
      };
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

    const portableEvents = await client.query<{ count: string }>(
      `select count(*)::text as count
         from public.events event
        where event.id = any($1::uuid[])
          and event.is_published = true
          and event.authoring_status = 'published'
          and exists (
            select 1
              from public.event_placement_portability portability
             where portability.event_id = event.id
               and portability.policy_version_id = 'placement-v1'
               and portability.ended_at is null
          )
          and exists (
            select 1
              from public.event_challenges challenge
             where challenge.event_id = event.id
               and challenge.status = 'published'
               and (
                 select count(*)
                   from public.challenge_questions question
                  where question.challenge_id = challenge.id
                    and question.status = 'published'
               ) >= 5
          )
          and not exists (
            select 1
              from public.trail_events membership
              join public.trails trail on trail.id = membership.trail_id
             where membership.event_id = event.id
               and trail.status = 'published'
          )`,
      [BASIC_DEMO_PORTABLE_EVENT_IDS],
    );
    const basicDemoPortableEventCount = parseCount(
      portableEvents,
      'Basic demo portable event',
    );

    if (basicDemoPortableEventCount !== BASIC_DEMO_PORTABLE_EVENT_IDS.length) {
      throw new Error(
        `Database verification failed: expected ${BASIC_DEMO_PORTABLE_EVENT_IDS.length} placement-ready Basic demo events, found ${basicDemoPortableEventCount}.`,
      );
    }

    return {
      basicDemoEventCount: demoEventCount,
      basicDemoChallengeCount,
      basicDemoPortableEventCount,
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
