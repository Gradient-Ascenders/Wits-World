import console from 'node:console';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { databaseTargetIdentitySha256 } from '../scripts/verification-target.mjs';

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  client: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));
vi.mock('node:fs', () => ({ existsSync: () => false }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: mocks.readFile,
  rm: mocks.rm,
  writeFile: mocks.writeFile,
}));
vi.mock('dotenv', () => ({ config: vi.fn() }));
vi.mock('pg', () => ({ default: { Client: mocks.client } }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.resetModules();
});

async function runPrVerification(failE2e = false) {
  process.argv = ['node', 'run-verification.mjs', '--profile', 'pr-e2e'];
  vi.stubEnv('npm_execpath', '/test/npm-cli.js');
  vi.stubEnv(
    'TEST_DATABASE_URL',
    'postgresql://ci:ci@postgres:5432/wits_world_test',
  );
  vi.stubEnv('DATABASE_URL', 'postgresql://guard:guard@127.0.0.1:1/ci_guard');
  vi.stubEnv(
    'TEST_DATABASE_IDENTITY_SHA256',
    databaseTargetIdentitySha256(process.env.TEST_DATABASE_URL),
  );
  vi.stubEnv('VERIFICATION_SANITIZE_OUTPUT', 'true');
  vi.stubEnv('BASIC_E2E_JSON_REPORT_PATH', '/previous/report.json');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.spawnSync.mockImplementation((command, args) => {
    if (command === 'git') return { status: 0, stdout: `${'a'.repeat(40)}\n` };
    return { status: failE2e && args.includes('test:e2e:basic') ? 1 : 0 };
  });
  mocks.readFile.mockRejectedValue(
    new Error('No browser report after setup failure'),
  );
  await import('../scripts/run-verification.mjs');
}

function writtenJson(basename) {
  const call = mocks.writeFile.mock.calls.find(
    ([file]) => path.basename(file) === basename,
  );
  return JSON.parse(call[1]);
}

describe('PR E2E verification orchestration', () => {
  it('runs preparation, readiness, and E2E without a remote lock or repeated suites', async () => {
    await runPrVerification();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(
      mocks.spawnSync.mock.calls
        .filter(([command]) => command !== 'git')
        .map(([, args]) => args.slice(1)),
    ).toEqual([
      ['run', 'prepare:api'],
      ['run', 'db:check:test', '--workspace', '@wits-world/api'],
      ['run', 'test:e2e:basic'],
    ]);
    expect(writtenJson('summary.json')).toMatchObject({
      profile: 'pr-e2e',
      status: 'passed',
    });
    expect(process.env.BASIC_E2E_JSON_REPORT_PATH).toBe(
      '/previous/report.json',
    );
  });

  it('fails the gate and writes safe diagnostics when E2E setup fails without a report', async () => {
    await runPrVerification(true);
    expect(process.exitCode).toBe(1);
    expect(writtenJson('summary.json')).toMatchObject({
      profile: 'pr-e2e',
      status: 'failed',
    });
    expect(writtenJson('playwright-diagnostics.json')).toMatchObject({
      status: 'failed',
      failures: [{ failureCategory: 'diagnostic-collection-failure' }],
    });
    expect(
      mocks.rm.mock.calls.some(
        ([file]) => path.basename(file) === 'playwright-report.raw.json',
      ),
    ).toBe(true);
    expect(process.env.BASIC_E2E_JSON_REPORT_PATH).toBe(
      '/previous/report.json',
    );
  });
});
