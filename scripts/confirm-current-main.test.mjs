import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(
  repositoryRoot,
  'scripts',
  'confirm-current-main.sh',
);
const selectedSha = '1'.repeat(40);
const newerSha = '2'.repeat(40);

function resolveBashExecutable() {
  const configuredBash = process.env.BASH_EXECUTABLE?.trim();

  if (configuredBash) {
    return configuredBash;
  }

  if (process.platform !== 'win32') {
    return 'bash';
  }

  const gitExecPathResult = spawnSync('git', ['--exec-path'], {
    encoding: 'utf8',
  });

  if (gitExecPathResult.status !== 0) {
    throw new Error(
      `Could not locate Git Bash: ${gitExecPathResult.stderr || gitExecPathResult.error}`,
    );
  }

  const bashExecutable = path.resolve(
    gitExecPathResult.stdout.trim(),
    '..',
    '..',
    '..',
    'bin',
    'bash.exe',
  );

  if (!existsSync(bashExecutable)) {
    throw new Error(`Could not locate Git Bash at ${bashExecutable}.`);
  }

  return bashExecutable;
}

const bashExecutable = resolveBashExecutable();

function toShellPath(value) {
  if (process.platform !== 'win32') {
    return value;
  }

  return value
    .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`)
    .replaceAll('\\', '/');
}

async function createFakeGit(directory) {
  const fakeGitPath = path.join(directory, 'git');

  await writeFile(
    fakeGitPath,
    `#!/usr/bin/env sh
if [ "\${MOCK_GIT_FAILURE:-0}" = "1" ]; then
  exit 1
fi
printf '%s\\trefs/heads/main\\n' "$MOCK_CURRENT_MAIN_SHA"
`,
    'utf8',
  );
  await chmod(fakeGitPath, 0o755);

  return fakeGitPath;
}

async function runConfirmation({ currentSha, failGit = false, markerExists }) {
  const testRoot = await mkdtemp(
    path.join(tmpdir(), 'witsworld-current-main-'),
  );

  try {
    const markerPath = path.join(testRoot, 'current-main');
    const fakeGitPath = await createFakeGit(testRoot);

    if (markerExists) {
      await writeFile(markerPath, 'stale marker', 'utf8');
    }

    const result = spawnSync(
      bashExecutable,
      [toShellPath(scriptPath), toShellPath(markerPath)],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DEPLOY_SHA: selectedSha,
          GIT_EXECUTABLE: toShellPath(fakeGitPath),
          GITEA_JOB_TOKEN: 'test-token',
          MOCK_CURRENT_MAIN_SHA: currentSha,
          MOCK_GIT_FAILURE: failGit ? '1' : '0',
          REPOSITORY_URL: 'https://gitea.example.test/owner/repository.git',
        },
      },
    );

    let marker = null;

    try {
      marker = await readFile(markerPath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    return { marker, result };
  } finally {
    await rm(testRoot, { force: true, recursive: true });
  }
}

test('marks the selected deployment when it is still current main', async () => {
  const { marker, result } = await runConfirmation({
    currentSha: selectedSha,
    markerExists: false,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(marker, '');
  assert.match(result.stdout, /Confirmed current main deployment commit/);
});

test('clears the marker and safely skips a stale deployment', async () => {
  const { marker, result } = await runConfirmation({
    currentSha: newerSha,
    markerExists: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(marker, null);
  assert.match(result.stdout, /Skipping stale production deployment/);
  assert.match(result.stdout, new RegExp(`Current main:\\s+${newerSha}`));
});

test('fails closed when the current main branch cannot be resolved', async () => {
  const { marker, result } = await runConfirmation({
    currentSha: selectedSha,
    failGit: true,
    markerExists: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(marker, null);
});
