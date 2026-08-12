import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import type { DatabaseClientRunner } from '../src/database/connection.js';
import {
  inspectDatabaseReleaseTarget,
  runDatabaseRelease,
  verifyDatabaseRelease,
} from '../src/database/release-procedure.js';

const databaseConfig: DatabaseConfig = {
  connectionString:
    'postgresql://owner:password@database.test/wits_quest_test?sslmode=require',
  target: 'test',
  variableName: 'TEST_DATABASE_URL',
};
const inspection = {
  database: 'wits_quest_test',
  postgisAvailableVersion: '3.5.0',
  serverVersion: 'PostgreSQL 17',
};
const readiness = {
  database: 'wits_quest_test',
  postgisVersion: 'POSTGIS="3.5.0"',
  serverVersion: 'PostgreSQL 17',
  user: 'owner',
};

describe('database release procedure', () => {
  it('runs migrations, readiness, optional seeding, and verification in order', async () => {
    const stages: string[] = [];
    const onInspection = vi.fn(() => stages.push('inspection-reported'));
    const inspectTarget = vi.fn(async () => {
      stages.push('inspection');
      return inspection;
    });
    const runMigrationFiles = vi.fn(async () => {
      stages.push('migrations');
      return { applied: ['0001.sql'], skipped: ['0002.sql'] };
    });
    const checkReadiness = vi.fn(async () => {
      stages.push('readiness');
      return readiness;
    });
    const runSeedFiles = vi.fn(async () => {
      stages.push('seeds');
      return { applied: ['0001_seed.sql'] };
    });
    const verifyRelease = vi.fn(async () => {
      stages.push('verification');
      return { demoEventCount: 1, migrationCount: 2 };
    });

    await expect(
      runDatabaseRelease(
        {
          confirmDatabase: 'wits_quest_test',
          databaseConfig,
          includeDemoSeed: true,
          onInspection,
        },
        {
          checkReadiness,
          inspectTarget,
          migrationsDirectory: '/migrations',
          runMigrationFiles,
          runSeedFiles,
          seedsDirectory: '/seeds',
          verifyRelease,
        },
      ),
    ).resolves.toMatchObject({
      inspection,
      migrations: { applied: ['0001.sql'], skipped: ['0002.sql'] },
      readiness,
      seeds: { applied: ['0001_seed.sql'] },
      verification: { demoEventCount: 1, migrationCount: 2 },
    });

    expect(stages).toEqual([
      'inspection',
      'inspection-reported',
      'migrations',
      'readiness',
      'seeds',
      'verification',
    ]);
    expect(verifyRelease).toHaveBeenCalledWith(databaseConfig, {
      expectedMigrationCount: 2,
      verifyDemoEvent: true,
    });
  });

  it('stops before writes when the connected database is not confirmed', async () => {
    const runMigrationFiles = vi.fn();
    const runSeedFiles = vi.fn();

    await expect(
      runDatabaseRelease(
        {
          confirmDatabase: 'different_database',
          databaseConfig,
          includeDemoSeed: true,
        },
        {
          inspectTarget: vi.fn().mockResolvedValue(inspection),
          runMigrationFiles,
          runSeedFiles,
        },
      ),
    ).rejects.toThrow('Database confirmation failed');

    expect(runMigrationFiles).not.toHaveBeenCalled();
    expect(runSeedFiles).not.toHaveBeenCalled();
  });

  it('stops before writes when target inspection fails', async () => {
    const runMigrationFiles = vi.fn();

    await expect(
      runDatabaseRelease(
        {
          confirmDatabase: 'wits_quest_test',
          databaseConfig,
          includeDemoSeed: false,
        },
        {
          inspectTarget: vi.fn().mockRejectedValue(new Error('not ready')),
          runMigrationFiles,
        },
      ),
    ).rejects.toThrow('not ready');

    expect(runMigrationFiles).not.toHaveBeenCalled();
  });

  it('does not seed or verify after a migration failure', async () => {
    const checkReadiness = vi.fn();
    const runSeedFiles = vi.fn();
    const verifyRelease = vi.fn();

    await expect(
      runDatabaseRelease(
        {
          confirmDatabase: 'wits_quest_test',
          databaseConfig,
          includeDemoSeed: true,
        },
        {
          checkReadiness,
          inspectTarget: vi.fn().mockResolvedValue(inspection),
          runMigrationFiles: vi.fn().mockRejectedValue(new Error('failed')),
          runSeedFiles,
          verifyRelease,
        },
      ),
    ).rejects.toThrow('failed');

    expect(checkReadiness).not.toHaveBeenCalled();
    expect(runSeedFiles).not.toHaveBeenCalled();
    expect(verifyRelease).not.toHaveBeenCalled();
  });

  it('does not apply seeds without the explicit seed option', async () => {
    const runSeedFiles = vi.fn();
    const verifyRelease = vi.fn().mockResolvedValue({ migrationCount: 2 });

    await runDatabaseRelease(
      {
        confirmDatabase: 'wits_quest_test',
        databaseConfig,
        includeDemoSeed: false,
      },
      {
        checkReadiness: vi.fn().mockResolvedValue(readiness),
        inspectTarget: vi.fn().mockResolvedValue(inspection),
        runMigrationFiles: vi.fn().mockResolvedValue({
          applied: [],
          skipped: ['0001.sql', '0002.sql'],
        }),
        runSeedFiles,
        verifyRelease,
      },
    );

    expect(runSeedFiles).not.toHaveBeenCalled();
    expect(verifyRelease).toHaveBeenCalledWith(databaseConfig, {
      expectedMigrationCount: 2,
      verifyDemoEvent: false,
    });
  });
});

describe('database release inspection and verification', () => {
  it('identifies the target and confirms PostGIS is available without writing', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { database: 'wits_quest_test', server_version: 'PostgreSQL 17' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ default_version: '3.5.0' }] });

    await expect(
      inspectDatabaseReleaseTarget(databaseConfig, createClientRunner(query)),
    ).resolves.toEqual(inspection);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('insert'));
  });

  it('verifies the recorded migrations and single published demo event', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    await expect(
      verifyDatabaseRelease(
        databaseConfig,
        { expectedMigrationCount: 2, verifyDemoEvent: true },
        createClientRunner(query),
      ),
    ).resolves.toEqual({ demoEventCount: 1, migrationCount: 2 });
  });
});

function createClientRunner(query: ReturnType<typeof vi.fn>) {
  const client = { query } as unknown as pg.PoolClient;

  const runWithClient: DatabaseClientRunner = async (
    _databaseConfig,
    callback,
  ) => callback(client);

  return runWithClient;
}
