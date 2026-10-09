import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import type { DatabaseClientRunner } from '../src/database/connection.js';
import { loadSeedFiles, runSeeds } from '../src/database/seeds.js';

const databaseConfig: DatabaseConfig = {
  connectionString:
    'postgresql://owner:password@database.test/neondb?sslmode=require',
  target: 'test',
  variableName: 'TEST_DATABASE_URL',
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('seed file loading', () => {
  it('loads SQL seeds in filename order', async () => {
    const directory = await createTemporarySeedDirectory();

    await writeFile(join(directory, '0002_second.sql'), 'select 2;');
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    await writeFile(join(directory, '.gitkeep'), '');

    const seedFiles = await loadSeedFiles(directory);

    expect(seedFiles.map((seedFile) => seedFile.name)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
  });
});

describe('seed execution', () => {
  it('applies every seed in one transaction and releases the lock', async () => {
    const directory = await createTemporarySeedDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    await writeFile(join(directory, '0002_second.sql'), 'select 2;');
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      runSeeds(databaseConfig, directory, createClientRunner(query)),
    ).resolves.toEqual({
      applied: ['0001_first.sql', '0002_second.sql'],
    });

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin',
      "set local lock_timeout = '30s'",
      "set local statement_timeout = '5min'",
      'select pg_advisory_xact_lock($1)',
      'select 1;',
      'select 2;',
      'commit',
    ]);
    expect(query).toHaveBeenNthCalledWith(
      4,
      'select pg_advisory_xact_lock($1)',
      [9_160_002],
    );
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('rolls back a failed seed and releases the lock', async () => {
    const directory = await createTemporarySeedDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'invalid seed;');
    const query = vi.fn(async (statement: string) => {
      if (statement === 'invalid seed;') {
        throw new Error('seed failed');
      }

      return { rows: [] };
    });

    await expect(
      runSeeds(databaseConfig, directory, createClientRunner(query)),
    ).rejects.toThrow('seed failed');

    const statements = query.mock.calls.map(([statement]) => statement);
    expect(statements).toContain('rollback');
    expect(statements).not.toContain('commit');
    expect(statements.at(-1)).toBe('rollback');
  });

  it('rolls back a failed lock acquisition without executing seed SQL', async () => {
    const directory = await createTemporarySeedDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    const query = vi.fn(async (statement: string) => {
      if (statement === 'select pg_advisory_xact_lock($1)')
        throw new Error('lock timeout');
      return { rows: [] };
    });
    await expect(
      runSeeds(databaseConfig, directory, createClientRunner(query)),
    ).rejects.toThrow('lock timeout');
    expect(query).not.toHaveBeenCalledWith('select 1;');
    expect(query).toHaveBeenLastCalledWith('rollback');
  });
});

async function createTemporarySeedDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'wits-world-seeds-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createClientRunner(query: ReturnType<typeof vi.fn>) {
  const client = { query } as unknown as pg.PoolClient;

  const runWithClient: DatabaseClientRunner = async (
    _databaseConfig,
    callback,
  ) => callback(client);

  return runWithClient;
}
