import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import pg from 'pg';
import { config as loadDotenv } from 'dotenv';

import {
  confirmAdvisoryUnlock,
  resolveVerificationProfile,
  validateReleaseCommit,
  validateTestDatabaseEnvironment,
} from './verification-target.mjs';
import { buildSanitizedPlaywrightDiagnostics } from './playwright-diagnostics.mjs';

const repositoryRoot = path.resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
);
const artifactDirectory = path.resolve(
  process.env.VERIFICATION_ARTIFACT_DIRECTORY ??
    path.join(repositoryRoot, '.playwright-artifacts/verification'),
);
const summaryPath = path.join(artifactDirectory, 'summary.json');
const rawPlaywrightReportPath = path.join(
  artifactDirectory,
  'playwright-report.raw.json',
);
const sanitizedPlaywrightDiagnosticsPath = path.join(
  artifactDirectory,
  'playwright-diagnostics.json',
);
const verificationLockKey = 9_160_166;
const npmCliPath = process.env.npm_execpath;
const steps = [];
let profile = 'configuration';
let headCommit = 'unavailable';

loadVerificationEnvironment();
await rm(rawPlaywrightReportPath, { force: true });
await rm(sanitizedPlaywrightDiagnosticsPath, { force: true });

if (!npmCliPath) {
  await failConfiguration(
    'Run verification through an npm script so the locked npm CLI is used.',
  );
} else if (process.argv.includes('--failure-probe')) {
  profile = 'failure-probe';
  steps.push({
    durationSeconds: 0,
    name: 'deliberate failure gate probe',
    status: 'failed-as-requested',
  });
  await writeSummary('failed');
  console.error(
    'Deliberate verification failure probe: the gate is failing as requested.',
  );
  process.exitCode = 1;
} else {
  await runVerification();
}

async function runVerification() {
  let lockClient;
  let failureMessage;

  try {
    profile = resolveVerificationProfile(process.argv.slice(2));
    headCommit = readHeadCommit();
    validateReleaseCommit(profile, process.env, headCommit);

    if (
      profile !== 'pr-e2e' &&
      !process.argv.includes('--skip-package-tests')
    ) {
      runNpmStep('account-policy package tests', [
        'run',
        'test',
        '--workspace',
        '@wits-world/account-policy',
      ]);
      runNpmStep('game-rules package tests', [
        'run',
        'test',
        '--workspace',
        '@wits-world/game-rules',
      ]);
    }

    const target = validateTestDatabaseEnvironment(process.env);
    process.env.TEST_DATABASE_URL = target.connectionString;
    if (profile !== 'pr-e2e') {
      lockClient = await acquireVerificationLock(target.connectionString);
    }

    runNpmStep('prepare shared API dependencies', ['run', 'prepare:api']);
    runNpmStep('test database readiness', [
      'run',
      'db:check:test',
      '--workspace',
      '@wits-world/api',
    ]);
    if (profile !== 'pr-e2e') {
      runNpmStep('test database migrations', [
        'run',
        'db:migrate:test',
        '--workspace',
        '@wits-world/api',
      ]);
      runNpmStep('database integration tests', [
        'run',
        'test:database',
        '--workspace',
        '@wits-world/api',
      ]);
    }

    await runBasicE2eStep();
  } catch (error) {
    failureMessage =
      error instanceof Error ? error.message : 'Unknown verification failure.';
  } finally {
    if (lockClient) {
      try {
        await releaseVerificationLock(lockClient);
      } catch (error) {
        failureMessage ??=
          error instanceof Error
            ? error.message
            : 'The verification lock release failed.';
      }
    }
  }

  if (failureMessage) {
    console.error(`Verification failed: ${failureMessage}`);
    await writeSummary('failed');
    process.exitCode = 1;
  } else {
    await writeSummary('passed');
    console.log(`Verification profile ${profile} passed.`);
  }
}

async function runBasicE2eStep() {
  await rm(rawPlaywrightReportPath, { force: true });
  await rm(sanitizedPlaywrightDiagnosticsPath, { force: true });
  const previousReportPath = process.env.BASIC_E2E_JSON_REPORT_PATH;
  process.env.BASIC_E2E_JSON_REPORT_PATH = rawPlaywrightReportPath;

  try {
    runNpmStep('deterministic Basic Playwright E2E', [
      'run',
      'test:e2e:basic',
      ...(profile === 'pr-e2e' ? ['--', '--api-build-prepared'] : []),
    ]);
  } catch (error) {
    await writeSanitizedPlaywrightDiagnostics();
    throw error;
  } finally {
    if (previousReportPath === undefined) {
      delete process.env.BASIC_E2E_JSON_REPORT_PATH;
    } else {
      process.env.BASIC_E2E_JSON_REPORT_PATH = previousReportPath;
    }
    await rm(rawPlaywrightReportPath, { force: true });
  }
}

async function writeSanitizedPlaywrightDiagnostics() {
  let diagnostics;

  try {
    const report = JSON.parse(await readFile(rawPlaywrightReportPath, 'utf8'));
    diagnostics = buildSanitizedPlaywrightDiagnostics(report);
  } catch {
    diagnostics = {
      failures: [
        {
          attachments: [],
          durationSeconds: 0,
          errorColumn: null,
          errorFile: null,
          errorLine: null,
          exceptionCategory: 'uncategorized-exception',
          failureCategory: 'diagnostic-collection-failure',
          failureReason:
            'The Playwright diagnostic report was unavailable or invalid.',
          failingStep: null,
          failurePhase: 'runner/web-server-setup',
          file: null,
          hookOrFixtureTitle: null,
          line: null,
          projectName: null,
          testTitle: 'Playwright diagnostic collection',
        },
      ],
      schemaVersion: 3,
      status: 'failed',
    };
  }

  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    sanitizedPlaywrightDiagnosticsPath,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
    'utf8',
  );
}

function loadVerificationEnvironment() {
  for (const envFile of [
    path.join(repositoryRoot, '.env'),
    path.join(repositoryRoot, 'apps/api/.env'),
  ]) {
    if (existsSync(envFile)) {
      loadDotenv({ path: envFile, override: false, quiet: true });
    }
  }
}

function readHeadCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error('The checked-out commit SHA could not be resolved.');
  }

  const commit = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error('The checked-out commit SHA is not a full lowercase SHA.');
  }
  return commit;
}

function runNpmStep(name, arguments_) {
  const startedAt = Date.now();
  const sanitizeOutput = process.env.VERIFICATION_SANITIZE_OUTPUT === 'true';
  const result = spawnSync(process.execPath, [npmCliPath, ...arguments_], {
    cwd: repositoryRoot,
    encoding: sanitizeOutput ? 'utf8' : undefined,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    stdio: sanitizeOutput ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  const status = result.status === 0 ? 'passed' : 'failed';

  steps.push({
    durationSeconds: Math.ceil((Date.now() - startedAt) / 1_000),
    name,
    status,
  });

  if (sanitizeOutput) {
    console.log(`${name}: ${status}; raw child output suppressed.`);
  }

  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed.`);
  }
}

async function acquireVerificationLock(connectionString) {
  const startedAt = Date.now();
  const connectionUrl = new URL(connectionString);
  const sslMode = connectionUrl.searchParams.get('sslmode');
  connectionUrl.searchParams.delete('sslmode');
  const client = new pg.Client({
    connectionString: connectionUrl.toString(),
    connectionTimeoutMillis: 10_000,
    ssl:
      sslMode === null || sslMode === 'disable'
        ? false
        : { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    await client.query("set lock_timeout = '45min'");
    console.log('Waiting for the dedicated test database verification lock.');
    await client.query('select pg_advisory_lock($1)', [verificationLockKey]);
    steps.push({
      durationSeconds: Math.ceil((Date.now() - startedAt) / 1_000),
      name: 'dedicated test database serialization lock',
      status: 'passed',
    });
    return client;
  } catch {
    steps.push({
      durationSeconds: Math.ceil((Date.now() - startedAt) / 1_000),
      name: 'dedicated test database serialization lock',
      status: 'failed',
    });
    await client.end().catch(() => undefined);
    throw new Error(
      'The dedicated test database lock could not be acquired; connection details are suppressed.',
    );
  }
}

async function releaseVerificationLock(client) {
  const startedAt = Date.now();
  let failed = false;

  try {
    const result = await client.query(
      'select pg_advisory_unlock($1) as unlocked',
      [verificationLockKey],
    );
    confirmAdvisoryUnlock(result);
  } catch {
    failed = true;
  }

  try {
    await client.end();
  } catch {
    failed = true;
  }

  steps.push({
    durationSeconds: Math.ceil((Date.now() - startedAt) / 1_000),
    name: 'dedicated test database lock release',
    status: failed ? 'failed' : 'passed',
  });

  if (failed) {
    throw new Error('The verification lock release could not be confirmed.');
  }
}

async function failConfiguration(message) {
  console.error(`Verification failed: ${message}`);
  await writeSummary('failed');
  process.exitCode = 1;
}

async function writeSummary(status) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        commit: headCommit,
        profile,
        schemaVersion: 1,
        status,
        steps,
        ...(existsSync(sanitizedPlaywrightDiagnosticsPath)
          ? { playwrightDiagnostics: 'playwright-diagnostics.json' }
          : {}),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
