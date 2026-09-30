import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));
vi.mock('node:fs', () => ({ existsSync: mocks.existsSync }));

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.resetModules();
});

async function runBasic(arguments_ = []) {
  process.argv = ['node', 'run-basic-e2e.mjs', ...arguments_];
  vi.stubEnv('npm_execpath', '/test/npm-cli.js');
  vi.stubEnv('BASIC_E2E_RUN_ID', 'previous-run');
  await import('../../web/playwright/run-basic-e2e.mjs');
}

function commands() {
  return mocks.spawnSync.mock.calls.map(([command, args]) => ({
    command,
    args: [path.basename(args[0]), ...args.slice(1)],
  }));
}

describe('Basic E2E build reuse', () => {
  it('builds once for a standalone run and keeps migrations and seeds on the test target', async () => {
    await runBasic();
    expect(commands()).toEqual([
      {
        command: process.execPath,
        args: ['npm-cli.js', 'run', 'build', '--workspace', '@wits-world/api'],
      },
      { command: process.execPath, args: ['migrate.js', '--test'] },
      {
        command: process.execPath,
        args: ['seed.js', '--test', '--basic-demo'],
      },
      {
        command: process.execPath,
        args: [
          'npm-cli.js',
          'run',
          'test:e2e:basic:playwright',
          '--workspace',
          '@wits-world/web',
        ],
      },
    ]);
    expect(process.env.BASIC_E2E_RUN_ID).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('reuses the readiness build in PR verification without rebuilding', async () => {
    await runBasic(['--api-build-prepared']);
    expect(commands().map(({ args }) => args[0])).toEqual([
      'migrate.js',
      'seed.js',
      'npm-cli.js',
    ]);
    expect(commands().some(({ args }) => args.includes('build'))).toBe(false);
  });

  it('fails before connecting when a prepared entrypoint is missing', async () => {
    mocks.existsSync.mockReturnValue(false);
    await expect(runBasic(['--api-build-prepared'])).rejects.toThrow(
      'prepared Basic E2E API build is missing',
    );
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it('stops before seeding or launching browsers when migration fails', async () => {
    mocks.spawnSync.mockReturnValue({ status: 1 });
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('failed child');
    });
    await expect(runBasic(['--api-build-prepared'])).rejects.toThrow(
      'failed child',
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(commands()).toHaveLength(1);
  });
});
