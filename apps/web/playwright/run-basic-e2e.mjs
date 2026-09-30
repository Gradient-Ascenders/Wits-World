import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const webDirectory = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
const repositoryRoot = path.resolve(webDirectory, '../..');
const npmCliPath = process.env.npm_execpath;
const apiBuildPrepared = process.argv.includes('--api-build-prepared');
const migrationEntrypoint = path.join(
  repositoryRoot,
  'apps/api/dist/database/migrate.js',
);
const seedEntrypoint = path.join(
  repositoryRoot,
  'apps/api/dist/database/seed.js',
);

if (!npmCliPath) {
  throw new Error('Run this preparation through npm run test:e2e:basic.');
}

process.env.BASIC_E2E_RUN_ID = randomUUID();

if (!apiBuildPrepared) {
  run([npmCliPath, 'run', 'build', '--workspace', '@wits-world/api']);
}
if (!existsSync(migrationEntrypoint) || !existsSync(seedEntrypoint)) {
  throw new Error(
    'The prepared Basic E2E API build is missing. Build the API before using --api-build-prepared.',
  );
}
run([migrationEntrypoint, '--test']);
run([seedEntrypoint, '--test', '--basic-demo']);
run([
  npmCliPath,
  'run',
  'test:e2e:basic:playwright',
  '--workspace',
  '@wits-world/web',
]);

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
