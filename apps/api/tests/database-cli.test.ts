import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClientRunner } from '../src/database/connection.js';
import type { DatabaseConfig } from '../src/config/database.js';
import type {
  DatabaseReleaseInspection,
  DatabaseReleaseStage,
} from '../src/database/release-procedure.js';

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  config: vi.fn(({ target }: { target: string }) => ({
    target,
    variableName: target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
    connectionString: 'postgresql://fixture:fixture@localhost/disposable',
  })),
  readiness: vi.fn(),
  migrate: vi.fn(),
  seed: vi.fn(),
  demoSeed: vi.fn(),
  verifiedSeed: vi.fn(),
  release: vi.fn(),
  remap: vi.fn(),
  audit: vi.fn(),
  classifications: vi.fn(),
  readFile: vi.fn(),
  connect: vi.fn(),
  clientRelease: vi.fn(),
  poolEnd: vi.fn(),
  createPool: vi.fn(),
}));

vi.mock('../src/config/database.js', () => ({
  loadApiEnvironment: mocks.environment,
  buildDatabaseConfig: mocks.config,
  buildMigrationDatabaseConfig: mocks.config,
}));
vi.mock('../src/database/readiness.js', () => ({
  checkDatabaseReadiness: mocks.readiness,
}));
vi.mock('../src/database/migrations.js', () => ({
  runMigrations: mocks.migrate,
}));
vi.mock('../src/database/seeds.js', () => ({
  runSeeds: mocks.seed,
  runBasicDemoSeeds: mocks.demoSeed,
  runVerifiedEventSeeds: mocks.verifiedSeed,
}));
vi.mock('../src/database/paths.js', () => ({
  getMigrationsDirectory: () => '/fixtures/migrations',
  getSeedsDirectory: () => '/fixtures/seeds',
  getBasicDemoSeedsDirectory: () => '/fixtures/demo',
  getVerifiedEventsSeedsDirectory: () => '/fixtures/verified',
}));
vi.mock('../src/database/release-procedure.js', () => ({
  runDatabaseRelease: mocks.release,
}));
vi.mock('../src/database/auth-issuer-remap-procedure.js', () => ({
  remapAuthIssuer: mocks.remap,
}));
vi.mock('../src/database/quality-audit.js', () => ({
  auditDatabaseQuality: mocks.audit,
  parsePlayerDataClassifications: mocks.classifications,
}));
vi.mock('../src/database/connection.js', () => ({
  createDatabasePool: mocks.createPool,
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));

const readiness = {
  database: 'disposable',
  user: 'fixture',
  postgisVersion: 'POSTGIS="3.5.0"',
  serverVersion: 'PostgreSQL 17',
};
const inspection: DatabaseReleaseInspection = {
  database: 'disposable',
  postgisAvailableVersion: '3.5.0',
  serverVersion: 'PostgreSQL 17',
};

async function run(entrypoint: string, args: string[] = []) {
  process.argv = ['node', 'database-cli', ...args];
  const entrypoints: Record<string, () => Promise<unknown>> = {
    check: () => import('../src/database/check.js'),
    migrate: () => import('../src/database/migrate.js'),
    seed: () => import('../src/database/seed.js'),
    release: () => import('../src/database/release.js'),
    'remap-auth-issuer': () => import('../src/database/remap-auth-issuer.js'),
    audit: () => import('../src/database/audit.js'),
  };
  await entrypoints[entrypoint]!();
  // These entry points launch main() without top-level await.
  await vi.waitFor(() => {
    if (entrypoint === 'release') {
      expect(
        vi.mocked(console.error).mock.calls.length > 0 ||
          vi
            .mocked(console.log)
            .mock.calls.some(
              ([message]) =>
                message ===
                'Database release procedure completed successfully.',
            ),
      ).toBe(true);
      return;
    }
    expect(
      vi.mocked(console.log).mock.calls.length +
        vi.mocked(console.error).mock.calls.length,
    ).toBeGreaterThan(0);
  });
}

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
  mocks.config.mockImplementation(({ target }) => ({
    target,
    variableName: target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
    connectionString: 'postgresql://fixture:fixture@localhost/disposable',
  }));
  mocks.readiness.mockResolvedValue(readiness);
  for (const seed of [mocks.seed, mocks.demoSeed, mocks.verifiedSeed]) {
    seed.mockResolvedValue({ applied: ['0001_content.sql'] });
  }
  mocks.migrate.mockResolvedValue({
    applied: ['0065_integrity.sql'],
    skipped: ['0001_schema.sql'],
  });
  mocks.connect.mockResolvedValue({ release: mocks.clientRelease });
  mocks.poolEnd.mockResolvedValue(undefined);
  mocks.createPool.mockReturnValue({
    connect: mocks.connect,
    end: mocks.poolEnd,
  });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('database command-line boundaries', () => {
  it.each([
    { args: [], target: 'development' },
    { args: ['--test'], target: 'test' },
  ])(
    'checks the explicit $target target and reports PostGIS readiness',
    async ({ args, target }) => {
      await run('check', args);
      expect(mocks.config).toHaveBeenCalledWith({ target });
      expect(mocks.readiness).toHaveBeenCalledWith(
        expect.objectContaining({ target }),
      );
      expect(console.log).toHaveBeenCalledWith(
        'Connected database: disposable',
      );
      expect(console.log).toHaveBeenCalledWith(
        `PostGIS: ${readiness.postgisVersion}`,
      );
      expect(process.exitCode).toBeUndefined();
    },
  );

  it.each([
    {
      entrypoint: 'check',
      dependency: mocks.readiness,
      label: 'Database readiness check failed',
    },
    {
      entrypoint: 'migrate',
      dependency: mocks.migrate,
      label: 'Database migration failed',
    },
    {
      entrypoint: 'seed',
      dependency: mocks.seed,
      label: 'Database seeding failed',
    },
  ])(
    'returns a nonzero exit code when $entrypoint fails',
    async ({ entrypoint, dependency, label }) => {
      dependency.mockRejectedValue(new Error('connection refused'));
      await run(entrypoint, ['--test']);
      expect(console.error).toHaveBeenCalledWith(
        `${label}: connection refused`,
      );
      expect(process.exitCode).toBe(1);
      expect(console.log).not.toHaveBeenCalled();
    },
  );

  it('reports exactly the migrations that the runner applied, including skipped counts', async () => {
    await run('migrate', ['--test']);
    expect(mocks.migrate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'test' }),
      '/fixtures/migrations',
    );
    expect(console.log).toHaveBeenCalledWith('Applied migrations: 1');
    expect(console.log).toHaveBeenCalledWith('Skipped migrations: 1');
    expect(console.log).toHaveBeenCalledWith('applied 0065_integrity.sql');
    expect(console.log).not.toHaveBeenCalledWith('applied 0001_schema.sql');
  });

  it.each([
    { flag: undefined, runner: mocks.seed, directories: ['/fixtures/seeds'] },
    {
      flag: '--basic-demo',
      runner: mocks.demoSeed,
      directories: ['/fixtures/seeds', '/fixtures/demo'],
    },
    {
      flag: '--verified-events',
      runner: mocks.verifiedSeed,
      directories: ['/fixtures/seeds', '/fixtures/verified'],
    },
  ])(
    'selects the requested $flag content pack without invoking other packs',
    async ({ flag, runner, directories }) => {
      await run('seed', ['--test', ...(flag ? [flag] : [])]);
      expect(runner).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'test' }),
        ...directories,
      );
      for (const other of [
        mocks.seed,
        mocks.demoSeed,
        mocks.verifiedSeed,
      ].filter((candidate) => candidate !== runner)) {
        expect(other).not.toHaveBeenCalled();
      }
      expect(console.log).toHaveBeenCalledWith('applied 0001_content.sql');
    },
  );

  it('rejects mutually exclusive seed packs before any seed write', async () => {
    await run('seed', ['--basic-demo', '--verified-events']);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('cannot be combined'),
    );
    for (const runner of [mocks.seed, mocks.demoSeed, mocks.verifiedSeed])
      expect(runner).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('requires release target confirmation before calling the release procedure', async () => {
    await run('release', ['--target', 'test']);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('--confirm-database is required'),
    );
    expect(process.exitCode).toBe(1);
  });

  it.each(['demo', 'verified'] as const)(
    'passes the approved %s release options and prints verified result counts',
    async (pack) => {
      mocks.release.mockImplementation(
        async (options: {
          onInspection: (value: DatabaseReleaseInspection) => void;
          onStage: (
            stage: DatabaseReleaseStage,
            state: 'started' | 'completed',
            durationMs?: number,
          ) => void;
        }) => {
          options.onInspection(inspection);
          options.onStage('migrations', 'started');
          options.onStage('migrations', 'completed', 20);
          return {
            migrations: {
              applied: ['0065_integrity.sql'],
              skipped: ['0001_schema.sql'],
            },
            readiness,
            seeds: pack === 'demo' ? { applied: ['0001_demo.sql'] } : null,
            verification:
              pack === 'demo'
                ? {
                    migrationCount: 65,
                    basicDemoEventCount: 1,
                    basicDemoChallengeCount: 1,
                    basicDemoPortableEventCount: 1,
                  }
                : {
                    migrationCount: 65,
                    verifiedEventCount: 11,
                    verifiedQuestionCount: 110,
                    verifiedTrailCount: 3,
                  },
          };
        },
      );
      await run('release', [
        '--target',
        'test',
        '--confirm-database',
        'disposable',
        pack === 'demo' ? '--seed-basic-demo' : '--seed-verified-events',
      ]);
      expect(mocks.release).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmDatabase: 'disposable',
          databaseConfig: expect.objectContaining({ target: 'test' }),
          includeBasicDemoSeed: pack === 'demo',
          includeVerifiedEventsSeed: pack === 'verified',
        }),
      );
      expect(console.log).toHaveBeenCalledWith(
        'Connected database: disposable',
      );
      expect(console.log).toHaveBeenCalledWith(
        'Database release migrations: started',
      );
      expect(console.log).toHaveBeenCalledWith(
        'Database release migrations: completed (20 ms)',
      );
      expect(console.log).toHaveBeenCalledWith(
        `Applied seed files: ${pack === 'demo' ? 1 : 0}`,
      );
      expect(console.log).toHaveBeenCalledWith(
        pack === 'demo'
          ? 'Published Basic demo events: 1'
          : 'Verified trails: 3',
      );
      expect(process.exitCode).toBeUndefined();
    },
  );

  it('redacts database URLs from a failed release without suppressing failure', async () => {
    mocks.release.mockRejectedValue(
      new Error('connection failed postgresql://owner:secret@db.example/test'),
    );
    await run('release', [
      '--target',
      'test',
      '--confirm-database',
      'disposable',
    ]);
    expect(console.error).toHaveBeenCalledWith(
      'Database release procedure failed: connection failed [redacted database URL]',
    );
    expect(process.exitCode).toBe(1);
  });

  it.each([false, true])(
    'keeps issuer remap apply=%s explicit and reports dry-run versus applied results',
    async (apply) => {
      mocks.remap.mockResolvedValue({
        hostname: 'localhost',
        database: 'disposable',
        matchingPlayers: 5,
        updatedPlayers: apply ? 5 : 0,
        applied: apply,
      });
      await run('remap-auth-issuer', [
        '--target',
        'test',
        '--confirm-database',
        'disposable',
        '--confirm-hostname',
        'localhost',
        '--from-issuer',
        'https://old.example.test/',
        '--to-issuer',
        'https://new.example.test/',
        ...(apply ? ['--apply'] : []),
      ]);
      expect(mocks.remap).toHaveBeenCalledWith(
        expect.objectContaining({
          apply,
          confirmDatabase: 'disposable',
          confirmHostname: 'localhost',
          target: 'test',
        }),
      );
      expect(console.log).toHaveBeenCalledWith(
        apply
          ? 'Auth0 issuer remap completed successfully.'
          : 'Dry run only. Re-run with --apply during the cutover maintenance window.',
      );
    },
  );

  it('redacts a non-Error issuer-remap failure and returns a failure exit code', async () => {
    mocks.remap.mockRejectedValue(
      'failed postgres://owner:secret@db.example/test',
    );
    await run('remap-auth-issuer', [
      '--target',
      'test',
      '--confirm-database',
      'disposable',
      '--confirm-hostname',
      'localhost',
      '--from-issuer',
      'https://old.example.test/',
      '--to-issuer',
      'https://new.example.test/',
    ]);
    expect(console.error).toHaveBeenCalledWith(
      'Auth0 issuer remap failed: failed [redacted database URL]',
    );
    expect(process.exitCode).toBe(1);
  });

  it.each([
    { args: ['--unknown'] },
    { args: ['--classifications'] },
    { args: ['--classifications', '--test'] },
    {
      args: ['--classifications', 'one.json', '--classifications', 'two.json'],
    },
  ])(
    'rejects invalid audit arguments %j before loading credentials or connecting',
    async ({ args }) => {
      await run('audit', args);
      expect(mocks.environment).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.createPool).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('AUDIT_FAILED'),
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it('parses private classifications, emits only the report and releases audit connections', async () => {
    const raw = { version: 1, players: [] };
    const classifications = new Map();
    mocks.readFile.mockResolvedValue(JSON.stringify(raw));
    mocks.classifications.mockReturnValue(classifications);
    mocks.audit.mockImplementation(
      async (
        config: DatabaseConfig,
        options: { classifications: unknown },
        runner: DatabaseClientRunner,
      ) => {
        expect(options.classifications).toBe(classifications);
        return runner(config, async (client) => {
          expect(client.release).toBe(mocks.clientRelease);
          return { integrity: { violations: 0 }, counts: { players: 5 } };
        });
      },
    );
    await run('audit', [
      '--test',
      '--classifications',
      '/private/classifications.json',
    ]);
    expect(mocks.readFile).toHaveBeenCalledWith(
      '/private/classifications.json',
      'utf8',
    );
    expect(mocks.classifications).toHaveBeenCalledWith(
      raw,
      expect.objectContaining({ target: 'test' }),
    );
    expect(
      JSON.parse(vi.mocked(console.log).mock.calls[0]![0] as string),
    ).toEqual({ integrity: { violations: 0 }, counts: { players: 5 } });
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
    expect(mocks.poolEnd).toHaveBeenCalledOnce();
  });

  it('releases the quiet audit pool on query failure and hides provider details', async () => {
    mocks.audit.mockImplementation(
      async (
        config: DatabaseConfig,
        _options: unknown,
        runner: DatabaseClientRunner,
      ) =>
        runner(config, async () => {
          throw Object.assign(new Error('provider secret'), { code: '08006' });
        }),
    );
    await run('audit', ['--test']);
    expect(console.error).toHaveBeenCalledWith(
      'Database quality audit failed (08006). Check the target and arguments; no data was changed.',
    );
    expect(mocks.clientRelease).toHaveBeenCalledOnce();
    expect(mocks.poolEnd).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });
});
