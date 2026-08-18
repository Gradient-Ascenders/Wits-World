import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const webDirectory = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
const repositoryRoot = path.resolve(webDirectory, '../..');
const npmCliPath = process.env.npm_execpath;

if (!npmCliPath) {
  throw new Error('Run this preparation through npm run test:e2e:sprint1.');
}

run(['run', 'db:migrate:test', '--workspace', '@wits-world/api']);
run([
  'run',
  'db:seed:test',
  '--workspace',
  '@wits-world/api',
  '--',
  '--basic-demo',
]);
run(['run', 'test:e2e:sprint1:playwright', '--workspace', '@wits-world/web']);

function run(arguments_) {
  const result = spawnSync(process.execPath, [npmCliPath, ...arguments_], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
