import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const apiDirectory = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
const vitestEntrypoint = path.resolve(
  apiDirectory,
  '../../node_modules/vitest/vitest.mjs',
);
const testFiles = [
  'tests/event-database.integration.test.ts',
  'tests/player-database.integration.test.ts',
  'tests/account-deletion-persistence.integration.test.ts',
  'tests/challenge-persistence.integration.test.ts',
  'tests/challenge-attempt-database.integration.test.ts',
  'tests/card-catalogue.integration.test.ts',
  'tests/deck-persistence.integration.test.ts',
  'tests/cpu-match-database.integration.test.ts',
  'tests/author-content-persistence.integration.test.ts',
  'tests/author-event-database.integration.test.ts',
  'tests/author-challenge-database.integration.test.ts',
  'tests/author-card-database.integration.test.ts',
  'tests/auth-issuer-remap-database.integration.test.ts',
  'tests/card-definition-name-remediation.integration.test.ts',
  'tests/card-definition-name-uniqueness.integration.test.ts',
  'tests/card-move-position-migration.integration.test.ts',
  'tests/card-roster-rebalance-migration.integration.test.ts',
  'tests/progression-persistence.integration.test.ts',
];

// Each file provisions and migrates its own remote test database.
const maximumDatabaseWorkers = 2;
const defaultDatabaseTestTimeoutMs = 30_000;
const result = spawnSync(
  process.execPath,
  [
    vitestEntrypoint,
    'run',
    '--maxWorkers',
    String(maximumDatabaseWorkers),
    '--testTimeout',
    String(defaultDatabaseTestTimeoutMs),
    ...testFiles,
  ],
  {
    cwd: apiDirectory,
    env: { ...process.env, RUN_DATABASE_INTEGRATION_TESTS: 'true' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
