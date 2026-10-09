import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';
import {
  getBasicDemoSeedsDirectory,
  getSeedsDirectory,
  getVerifiedEventsSeedsDirectory,
} from './paths.js';

const SEED_LOCK_KEY = 9_160_002;

export interface SeedFile {
  name: string;
  path: string;
  sql: string;
}

export interface SeedResult {
  applied: string[];
}

export async function runSeeds(
  databaseConfig: DatabaseConfig,
  seedsDirectory = getSeedsDirectory(),
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<SeedResult> {
  const seedFiles = await loadSeedFiles(seedsDirectory);

  return runWithClient(databaseConfig, async (client) => {
    await client.query('begin');

    try {
      await client.query("set local lock_timeout = '30s'");
      await client.query("set local statement_timeout = '5min'");
      // All seed files share one transaction, so this lock also works with PgBouncer.
      await client.query('select pg_advisory_xact_lock($1)', [SEED_LOCK_KEY]);

      for (const seedFile of seedFiles) {
        await client.query(seedFile.sql);
      }

      await client.query('commit');
      return { applied: seedFiles.map((seedFile) => seedFile.name) };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function runBasicDemoSeeds(
  databaseConfig: DatabaseConfig,
  seedsDirectory = getSeedsDirectory(),
  basicDemoSeedsDirectory = getBasicDemoSeedsDirectory(),
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<SeedResult> {
  const baseResult = await runSeeds(
    databaseConfig,
    seedsDirectory,
    runWithClient,
  );
  const demoResult = await runSeeds(
    databaseConfig,
    basicDemoSeedsDirectory,
    runWithClient,
  );

  return {
    applied: [...baseResult.applied, ...demoResult.applied],
  };
}

export async function runVerifiedEventSeeds(
  databaseConfig: DatabaseConfig,
  seedsDirectory = getSeedsDirectory(),
  verifiedEventsSeedsDirectory = getVerifiedEventsSeedsDirectory(),
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<SeedResult> {
  const baseResult = await runSeeds(
    databaseConfig,
    seedsDirectory,
    runWithClient,
  );
  const contentResult = await runSeeds(
    databaseConfig,
    verifiedEventsSeedsDirectory,
    runWithClient,
  );

  return {
    applied: [...baseResult.applied, ...contentResult.applied],
  };
}

export async function loadSeedFiles(
  seedsDirectory: string,
): Promise<SeedFile[]> {
  const entries = await readdir(seedsDirectory);
  const seedNames = entries.filter((entry) => entry.endsWith('.sql')).sort();

  return Promise.all(
    seedNames.map(async (name) => {
      const path = resolve(seedsDirectory, name);

      return {
        name: basename(name),
        path,
        sql: await readFile(path, 'utf8'),
      };
    }),
  );
}
