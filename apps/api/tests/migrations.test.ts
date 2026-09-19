import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseConfig } from '../src/config/database.js';
import type { DatabaseClientRunner } from '../src/database/connection.js';
import {
  loadMigrationFiles,
  runMigrations,
} from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';

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

describe('migration file loading', () => {
  it('keeps published migration checksums and orders later migrations after them', async () => {
    const migrationFiles = await loadMigrationFiles(getMigrationsDirectory());
    const immutableCoinMigrations = migrationFiles.filter(({ name }) =>
      [
        '0007_create_cards_rewards_and_ownership.sql',
        '0024_complete_account_deletion_retention.sql',
        '0025_add_ordering_challenges.sql',
      ].includes(name),
    );
    const playerNameMigrations = migrationFiles.filter(
      ({ name }) =>
        name.startsWith('0021_') ||
        name.startsWith('0022_') ||
        name.startsWith('0023_') ||
        name.startsWith('0024_') ||
        name.startsWith('0025_') ||
        name.startsWith('0026_') ||
        name.startsWith('0027_') ||
        name.startsWith('0028_') ||
        name.startsWith('0029_') ||
        name.startsWith('0030_') ||
        name.startsWith('0031_') ||
        name.startsWith('0032_') ||
        name.startsWith('0033_') ||
        name.startsWith('0034_') ||
        name.startsWith('0035_') ||
        name.startsWith('0036_') ||
        name.startsWith('0037_') ||
        name.startsWith('0038_') ||
        name.startsWith('0039_') ||
        name.startsWith('0040_') ||
        name.startsWith('0041_') ||
        name.startsWith('0042_') ||
        name.startsWith('0043_') ||
        name.startsWith('0044_') ||
        name.startsWith('0045_') ||
        name.startsWith('0046_') ||
        name.startsWith('0047_') ||
        name.startsWith('0048_'),
    );

    expect(
      immutableCoinMigrations.map(({ checksum, name }) => ({ checksum, name })),
    ).toEqual([
      {
        checksum:
          'ca9c7b036cac67e70b4f72c4c6a8a239ae0083745193dadfbeff6503cd18b9f7',
        name: '0007_create_cards_rewards_and_ownership.sql',
      },
      {
        checksum:
          '8f4a493bf38fe7a221ce0a6ed645a1e2911b8062bebc925dae70a3f0e1eca12e',
        name: '0024_complete_account_deletion_retention.sql',
      },
      {
        checksum:
          'dcea7cd694a95f2a46a148b8d48f404a092ac3c0582bcf479befb5ccfdce5835',
        name: '0025_add_ordering_challenges.sql',
      },
    ]);

    expect(
      playerNameMigrations.map(({ checksum, name }) => ({ checksum, name })),
    ).toEqual([
      {
        checksum:
          'f599515f61b897ea3737df05147a3354bcb630b4564e5550220e14cf742090af',
        name: '0021_enforce_player_name_policy.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0022_tighten_player_name_policy.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0023_rebalance_canonical_card_roster.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0024_complete_account_deletion_retention.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0025_add_ordering_challenges.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0026_create_player_progression.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0027_create_ordered_trails.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0028_create_asynchronous_pvp_persistence.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0029_curate_author_content_lifecycle.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0030_create_campaign_scheduling.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0031_create_movement_evidence.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0032_add_movement_eligibility_decisions.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0033_add_async_pvp_invitation_invalidation.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0034_retire_coin_rewards.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0035_deny_deleted_identity_tokens.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0036_remove_duplicate_indexes.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0037_add_async_pvp_voluntary_resignation.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0038_add_question_performance_analytics_indexes.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0039_add_async_pvp_invitation_cancellation.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0040_add_offline_challenge_attempts.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0041_complete_card_catalogue.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0042_implement_card_evolution.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0043_add_content_source_evidence.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0044_create_live_pvp_persistence.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0045_create_event_placement_persistence.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0046_persist_longitudinal_trust.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0047_persist_ranked_competition.sql',
      },
      {
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        name: '0048_implement_trust_scoring_and_enforcement.sql',
      },
    ]);
  });

  it('calculates the same checksum for LF and CRLF line endings', async () => {
    const lfDirectory = await createTemporaryMigrationDirectory();
    const crlfDirectory = await createTemporaryMigrationDirectory();
    const sql = 'select 1;\nselect 2;\n';

    await writeFile(join(lfDirectory, '0001_first.sql'), sql);
    await writeFile(
      join(crlfDirectory, '0001_first.sql'),
      sql.replaceAll('\n', '\r\n'),
    );

    const [lfMigration] = await loadMigrationFiles(lfDirectory);
    const [crlfMigration] = await loadMigrationFiles(crlfDirectory);

    expect(crlfMigration?.checksum).toBe(lfMigration?.checksum);
  });

  it('loads SQL migrations in filename order', async () => {
    const directory = await createTemporaryMigrationDirectory();

    await writeFile(join(directory, '0002_second.sql'), 'select 2;');
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    await writeFile(join(directory, '.gitkeep'), '');

    const migrationFiles = await loadMigrationFiles(directory);

    expect(migrationFiles.map((migrationFile) => migrationFile.name)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(migrationFiles[0]?.checksum).toHaveLength(64);
  });
});

describe('migration execution', () => {
  it('applies an unapplied migration in a transaction', async () => {
    const directory = await createTemporaryMigrationDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    const query = createMigrationQuery();

    await expect(
      runMigrations(databaseConfig, directory, createClientRunner(query)),
    ).resolves.toEqual({
      applied: ['0001_first.sql'],
      skipped: [],
    });

    expect(query).toHaveBeenCalledWith('begin');
    expect(query).toHaveBeenCalledWith('select 1;');
    expect(query).toHaveBeenCalledWith(
      'insert into public.schema_migrations (name, checksum) values ($1, $2)',
      ['0001_first.sql', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith('commit');
    expect(query).not.toHaveBeenCalledWith('rollback');
    expect(query).toHaveBeenLastCalledWith(
      'select pg_advisory_unlock($1)',
      [9_160_001],
    );
  });

  it('skips a migration whose stored checksum matches', async () => {
    const directory = await createTemporaryMigrationDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    const [migrationFile] = await loadMigrationFiles(directory);
    const query = createMigrationQuery([
      {
        checksum: migrationFile?.checksum ?? '',
        name: '0001_first.sql',
      },
    ]);

    await expect(
      runMigrations(databaseConfig, directory, createClientRunner(query)),
    ).resolves.toEqual({
      applied: [],
      skipped: ['0001_first.sql'],
    });

    expect(query).not.toHaveBeenCalledWith('begin');
    expect(query).not.toHaveBeenCalledWith('select 1;');
  });

  it('rejects an applied migration whose checksum changed', async () => {
    const directory = await createTemporaryMigrationDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'select 1;');
    const query = createMigrationQuery([
      { checksum: 'different-checksum', name: '0001_first.sql' },
    ]);

    await expect(
      runMigrations(databaseConfig, directory, createClientRunner(query)),
    ).rejects.toThrow(
      'Migration 0001_first.sql has changed after being applied.',
    );

    expect(query).not.toHaveBeenCalledWith('begin');
    expect(query).toHaveBeenLastCalledWith(
      'select pg_advisory_unlock($1)',
      [9_160_001],
    );
  });

  it('rolls back a failed migration and releases the lock', async () => {
    const directory = await createTemporaryMigrationDirectory();
    await writeFile(join(directory, '0001_first.sql'), 'invalid migration;');
    const query = createMigrationQuery([], 'invalid migration;');

    await expect(
      runMigrations(databaseConfig, directory, createClientRunner(query)),
    ).rejects.toThrow('migration failed');

    const statements = query.mock.calls.map(([statement]) => statement);
    expect(statements).toContain('rollback');
    expect(statements).not.toContain('commit');
    expect(statements.at(-1)).toBe('select pg_advisory_unlock($1)');
  });
});

async function createTemporaryMigrationDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'wits-world-migrations-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createMigrationQuery(
  appliedMigrations: Array<{ checksum: string; name: string }> = [],
  failingStatement?: string,
) {
  return vi.fn(async (statement: string) => {
    if (statement === failingStatement) {
      throw new Error('migration failed');
    }

    if (statement.startsWith('select name, checksum')) {
      return { rows: appliedMigrations };
    }

    return { rows: [] };
  });
}

function createClientRunner(query: ReturnType<typeof vi.fn>) {
  const client = { query } as unknown as pg.PoolClient;

  const runWithClient: DatabaseClientRunner = async (
    _databaseConfig,
    callback,
  ) => callback(client);

  return runWithClient;
}
