import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyBattlesRelease } from './verify-battles-summary-contract.mjs';

const sha = 'a'.repeat(40);
const environment = {
  DEPLOY_SHA: sha,
  API_PUBLISHED_SHA: sha,
  API_ORIGIN: 'https://api.example.test',
  WEB_API_BASE_URL: 'https://api.example.test/api/v1',
};
const entryPath = '/api/v1/matches/cpu/entry';
const historyPath = '/api/v1/matches/history';

function object(properties) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function document() {
  const string = { type: 'string' };
  const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
  const entry = object({
    activeMatch: nullable(
      object({
        matchId: string,
        status: string,
        startedAt: string,
        state: object({}),
      }),
    ),
    selectedDeck: nullable(object({ deckId: string, name: string })),
    requestId: string,
  });
  const history = object({
    matches: {
      type: 'array',
      maxItems: 20,
      items: object({
        matchId: string,
        status: string,
        winner: string,
        startedAt: string,
        completedAt: string,
        roundCount: { type: 'integer' },
      }),
    },
    requestId: string,
  });
  const operation = (schema) => ({
    get: {
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          content: { 'application/json': { schema: { oneOf: [schema] } } },
        },
      },
    },
  });
  return {
    paths: { [entryPath]: operation(entry), [historyPath]: operation(history) },
  };
}

function fixture({
  schema = document(),
  status = 401,
  code = 'UNAUTHORIZED',
  failPath,
} = {}) {
  const requests = [];
  return {
    requests,
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      const path = new URL(url).pathname;
      return new Response(
        JSON.stringify(path === '/documentation/json' ? schema : { code }),
        {
          status:
            path === '/documentation/json'
              ? 200
              : !failPath || path === failPath
                ? status
                : 401,
        },
      );
    },
  };
}

const once = { attempts: 1, retryDelayMs: 0 };

test('permits same-commit publication only after both live summary contracts verify', async () => {
  const { fetchFn, requests } = fixture();
  await verifyBattlesRelease(environment, { ...once, fetchFn });
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      'https://api.example.test/documentation/json',
      'https://api.example.test/api/v1/matches/cpu/entry?view=summary',
      'https://api.example.test/api/v1/matches/history?view=summary&limit=5',
    ],
  );
  for (const { options } of requests) {
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { accept: 'application/json' });
    assert.ok(options.signal instanceof AbortSignal);
  }
});

for (const API_PUBLISHED_SHA of [undefined, '', 'b'.repeat(40)]) {
  test(`blocks absent/skipped or mismatched API publication: ${String(API_PUBLISHED_SHA)}`, async () => {
    const { fetchFn, requests } = fixture();
    await assert.rejects(
      verifyBattlesRelease(
        { ...environment, API_PUBLISHED_SHA },
        { ...once, fetchFn },
      ),
      /publication.*not confirmed/,
    );
    assert.equal(requests.length, 0);
  });
}

for (const path of [entryPath, historyPath]) {
  test(`blocks the legacy response contract at ${path}`, async () => {
    const schema = document();
    schema.paths[path].get.responses[200].content['application/json'].schema =
      object({ requestId: { type: 'string' } });
    const { fetchFn } = fixture({ schema });
    await assert.rejects(
      verifyBattlesRelease(environment, { ...once, fetchFn }),
      /compact .* contract/,
    );
  });
  test(`blocks legacy query rejection even with advertised schemas at ${path}`, async () => {
    const { fetchFn } = fixture({ status: 400, failPath: path });
    await assert.rejects(
      verifyBattlesRelease(environment, { ...once, fetchFn }),
      /unexpected response/,
    );
  });
}

test('blocks an endpoint that does not advertise bearer authentication', async () => {
  const schema = document();
  delete schema.paths[historyPath].get.security;
  const { fetchFn } = fixture({ schema });
  await assert.rejects(
    verifyBattlesRelease(environment, { ...once, fetchFn }),
    /bearer authentication/,
  );
});

for (const status of [200, 404, 500, 503]) {
  test(`blocks unexpected query response ${status}`, async () => {
    const { fetchFn } = fixture({ status });
    await assert.rejects(
      verifyBattlesRelease(environment, { ...once, fetchFn }),
      /unexpected response/,
    );
  });
}

test('requires the expected anonymous problem code', async () => {
  const { fetchFn } = fixture({ code: 'OTHER' });
  await assert.rejects(
    verifyBattlesRelease(environment, { ...once, fetchFn }),
    /expected auth contract/,
  );
});

test('bounds retries and hides upstream network, timeout and parse errors', async () => {
  let calls = 0;
  await assert.rejects(
    verifyBattlesRelease(environment, {
      attempts: 2,
      retryDelayMs: 0,
      fetchFn: async () => {
        calls++;
        throw new Error('private-upstream-detail');
      },
    }),
    (error) =>
      !error.message.includes('private-upstream-detail') &&
      /unexpected response/.test(error.message),
  );
  assert.equal(calls, 2);
  await assert.rejects(
    verifyBattlesRelease(environment, {
      ...once,
      fetchFn: async () => new Response('not JSON'),
    }),
    /unexpected response/,
  );
});

test('allows a transient request error to recover within the bounded attempts', async () => {
  const { fetchFn, requests } = fixture();
  let calls = 0;
  await verifyBattlesRelease(environment, {
    attempts: 2,
    retryDelayMs: 0,
    fetchFn: async (...args) => {
      if (calls++ === 0) throw new Error('temporary');
      return fetchFn(...args);
    },
  });
  assert.equal(calls, 4);
  assert.equal(requests.length, 3);
});

for (const override of [
  { API_ORIGIN: '' },
  { API_ORIGIN: 'http://api.example.test' },
  { API_ORIGIN: 'https://private-user:private-password@api.example.test' },
  { API_ORIGIN: 'https://api.example.test/other' },
  { API_ORIGIN: 'https://api.example.test/?private=value' },
  { WEB_API_BASE_URL: 'https://another-api.example.test/api/v1' },
  { WEB_API_BASE_URL: 'https://api.example.test/other' },
]) {
  test(`rejects an unsafe/mismatched origin configuration ${Object.keys(override)[0]} ${Object.values(override)[0]}`, async () => {
    const { fetchFn, requests } = fixture();
    await assert.rejects(
      verifyBattlesRelease(
        { ...environment, ...override },
        { ...once, fetchFn },
      ),
      (error) =>
        /published HTTPS API/.test(error.message) &&
        !error.message.includes('private'),
    );
    assert.equal(requests.length, 0);
  });
}

test('CLI exits unsuccessfully for a publication-skipped job', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('./verify-battles-summary-contract.mjs', import.meta.url),
      ),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ...environment, API_PUBLISHED_SHA: '' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /publication.*not confirmed/);
});

test('workflow orders API before web and verifies publication plus contracts before web mutation', async () => {
  const workflow = await readFile(
    new URL('../.gitea/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  const api = workflow.split('  deploy-api:')[1].split('  deploy-web:')[0];
  const web = workflow.split('  deploy-web:')[1];
  assert.match(
    api,
    /published_sha: \$\{\{ steps\.api_publication\.outputs\.published_sha \}\}/,
  );
  assert.match(
    api,
    /api_origin: \$\{\{ steps\.api_health\.outputs\.api_origin \}\}/,
  );
  const publication = api
    .split('      - name: Deploy API to Azure')[1]
    .split('      - name: Verify production health')[0];
  assert.match(publication, /id: api_publication/);
  assert.ok(
    publication.indexOf('Skipping stale API deployment.') <
      publication.indexOf('az webapp deploy'),
  );
  assert.ok(
    publication.indexOf('az webapp deploy') <
      publication.indexOf("printf 'published_sha="),
  );
  assert.equal((publication.match(/published_sha=/g) ?? []).length, 1);
  const health = api
    .split('      - name: Verify production health')[1]
    .split('      - name: Clean deployment workspace')[0];
  assert.match(health, /id: api_health/);
  assert.match(
    health,
    /if \[ "\$STATUS" = "200" \]; then[\s\S]*printf 'api_origin=/,
  );
  assert.match(web, /needs:\s+- validation\s+- deploy-api/);
  assert.match(web, /if: \$\{\{ needs\.deploy-api\.result == 'success' &&/);
  assert.match(
    web,
    /API_PUBLISHED_SHA: \$\{\{ needs\.deploy-api\.outputs\.published_sha \}\}/,
  );
  assert.match(
    web,
    /API_ORIGIN: \$\{\{ needs\.deploy-api\.outputs\.api_origin \}\}/,
  );
  assert.match(web, /WEB_API_BASE_URL: \$\{\{ vars\.VITE_API_BASE_URL \}\}/);
  const deploy = web
    .split('      - name: Deploy web application to Azure')[1]
    .split('      - name: Verify production website')[0];
  assert.match(deploy, /set -euo pipefail/);
  const gate = deploy.indexOf(
    'node "$DEPLOY_ROOT/repository/scripts/verify-battles-summary-contract.mjs"',
  );
  assert.ok(gate > deploy.indexOf('Skipping the web deployment.'));
  assert.ok(gate < deploy.indexOf('confirm-current-main.sh'));
  assert.ok(gate < deploy.indexOf('az webapp deploy'));
  assert.ok(gate < deploy.indexOf('az webapp config set'));
  assert.doesNotMatch(deploy, /verify-battles-summary-contract\.mjs[^\n]*\|\|/);
});

test('normal main and PR validation run deployment regression tests', async () => {
  for (const name of ['ci.yml', 'pr-validation.yml']) {
    const workflow = await readFile(
      new URL(`../.gitea/workflows/${name}`, import.meta.url),
      'utf8',
    );
    const coverage = workflow.split('  test:')[1].split(/^ {2}[\w-]+:/m)[0];
    assert.match(
      coverage,
      /name: Test deployment release guards\s+run: time npm run test:deployment/,
    );
  }
});

function workflowScript(workflow, name) {
  const step = workflow
    .split(`      - name: ${name}\n`)[1]
    ?.split('\n      - name: ')[0];
  assert.ok(step, `Missing workflow step: ${name}`);
  const script = step.split('        run: |\n')[1];
  assert.ok(script, `Missing shell command: ${name}`);
  return script
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}

function bashExecutable() {
  if (process.env.BASH_EXECUTABLE) return process.env.BASH_EXECUTABLE;
  if (process.platform !== 'win32') return 'bash';
  const result = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return path.resolve(
    result.stdout.trim(),
    '..',
    '..',
    '..',
    'bin',
    'bash.exe',
  );
}

function shellPath(value) {
  return process.platform === 'win32'
    ? value
        .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`)
        .replaceAll('\\', '/')
    : value;
}

// Execute the actual workflow commands against a disposable Git repository.
// Only ls-remote is stubbed, so current-main checks cannot contact Gitea.
async function releaseFixture(changedFiles, callback) {
  const prefix = path.resolve(tmpdir(), 'witsworld-release-decisions-');
  const root = await mkdtemp(prefix);
  const repository = path.join(root, 'repository');
  await mkdir(repository);
  await mkdir(path.join(root, 'empty-hooks'));
  const gitEnvironment = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  };
  function git(...args) {
    const result = spawnSync(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        '-c',
        `core.hooksPath=${path.join(root, 'empty-hooks')}`,
        '-c',
        'user.name=Release fixture',
        '-c',
        'user.email=release-fixture@example.test',
        ...args,
      ],
      {
        cwd: repository,
        env: gitEnvironment,
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  try {
    const guard = await readFile(
      new URL('./confirm-current-main.sh', import.meta.url),
      'utf8',
    );
    const files = [
      '.gitea/workflows/ci.yml',
      '.nvmrc',
      'package.json',
      'package-lock.json',
      'tsconfig.base.json',
      'apps/web/src/fixture.ts',
      'apps/api/src/fixture.ts',
      'packages/account-policy/fixture.ts',
      'packages/game-rules/fixture.ts',
      'scripts/confirm-current-main.sh',
      'scripts/prepare-api.mjs',
      'scripts/production-gameplay-mode.mjs',
      'database/migrations/fixture.sql',
      'docs/fixture.md',
    ];
    for (const file of files) {
      const target = path.join(repository, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        file === 'scripts/confirm-current-main.sh'
          ? guard.replaceAll('\r\n', '\n')
          : 'baseline\n',
      );
    }
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture baseline');
    const previousSha = git('rev-parse', 'HEAD');
    for (const file of changedFiles) {
      const target = path.join(repository, file);
      const original = await readFile(target, 'utf8');
      await writeFile(target, original + '\n# fixture change\n');
    }
    git('add', '.');
    git('commit', '--quiet', '--allow-empty', '-m', 'fixture change');
    const deploySha = git('rev-parse', 'HEAD');
    const fakeRemote = path.join(root, 'remote-git.sh');
    await writeFile(
      fakeRemote,
      '#!/usr/bin/env sh\nprintf "%s\\trefs/heads/main\\n" "$MOCK_CURRENT_MAIN_SHA"\n',
    );
    await chmod(fakeRemote, 0o755);
    const workflow = (
      await readFile(
        new URL('../.gitea/workflows/ci.yml', import.meta.url),
        'utf8',
      )
    ).replaceAll('\r\n', '\n');
    async function run(name, overrides = {}, prelude = '') {
      const output = path.join(root, 'step-output');
      await writeFile(output, '');
      const script = workflowScript(workflow, name)
        .replaceAll(
          '"/tmp/witsworld-api-deploy-${DEPLOY_SHA}"',
          '"$TEST_DEPLOY_ROOT"',
        )
        .replaceAll(
          '"/tmp/witsworld-web-deploy-${DEPLOY_SHA}"',
          '"$TEST_DEPLOY_ROOT"',
        );
      const scriptPath = path.join(root, 'step.sh');
      await writeFile(scriptPath, prelude + '\n' + script);
      const result = spawnSync(bashExecutable(), [shellPath(scriptPath)], {
        cwd: repository,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...gitEnvironment,
          TEST_DEPLOY_ROOT: shellPath(root),
          DEPLOY_SHA: deploySha,
          PREVIOUS_SHA: previousSha,
          GITHUB_OUTPUT: shellPath(output),
          GIT_EXECUTABLE: shellPath(fakeRemote),
          MOCK_CURRENT_MAIN_SHA: deploySha,
          GITEA_JOB_TOKEN: 'fixture-token',
          REPOSITORY_URL: 'https://gitea.example.test/fixture.git',
          ...overrides,
        },
      });
      return {
        result,
        outputs: Object.fromEntries(
          (await readFile(output, 'utf8'))
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => line.split('=')),
        ),
      };
    }
    await callback({ run, root, repository, deploySha });
  } finally {
    assert.ok(path.resolve(root).startsWith(prefix));
    await rm(root, { recursive: true, force: true });
  }
}

const detectionSteps = [
  'Detect web deployment changes for candidate artifact',
  'Detect API deployment changes for production artifact',
  'Detect API deployment changes',
  'Detect web deployment changes',
];

for (const { label, changed, required } of [
  {
    label: 'API and web',
    changed: ['apps/api/src/fixture.ts', 'apps/web/src/fixture.ts'],
    required: [true, true, true, true],
  },
  {
    label: 'web only',
    changed: ['apps/web/src/fixture.ts'],
    required: [true, true, true, true],
  },
  {
    label: 'API only',
    changed: ['apps/api/src/fixture.ts'],
    required: [false, true, true, false],
  },
  {
    label: 'unrelated docs only',
    changed: ['docs/fixture.md'],
    required: [false, false, false, false],
  },
  {
    label: 'production gameplay gate only',
    changed: ['scripts/production-gameplay-mode.mjs'],
    required: [false, true, true, false],
  },
]) {
  test(`actual artifact and publication filters agree for ${label} changes`, async () => {
    await releaseFixture(changed, async ({ run }) => {
      for (const [index, name] of detectionSteps.entries()) {
        const { result, outputs } = await run(name);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
          outputs.required,
          String(required[index]),
          `${label}: ${name}`,
        );
      }
    });
  });
}

test('every existing web release input requires both API artifact creation and publication', async () => {
  const workflow = (
    await readFile(
      new URL('../.gitea/workflows/ci.yml', import.meta.url),
      'utf8',
    )
  ).replaceAll('\r\n', '\n');
  const paths = detectionSteps.map((name) => {
    const script = workflowScript(workflow, name);
    return script
      .split('git diff --quiet "$BASE_SHA" "$DEPLOY_SHA" -- \\\n')[1]
      .split(/\nthen|\nDIFF_STATUS=/)[0]
      .replaceAll('\\', '')
      .trim()
      .split(/\s+/);
  });
  assert.deepEqual(
    paths[0],
    paths[3],
    'web artifact and publication inputs must agree',
  );
  assert.deepEqual(
    paths[1],
    paths[2],
    'API artifact and publication inputs must agree',
  );
  for (const input of paths[0])
    assert.ok(
      paths[1].includes(input),
      `Missing API prerequisite input: ${input}`,
    );
});

test('manual dispatch without push-before forces both artifacts and publications', async () => {
  await releaseFixture(['docs/fixture.md'], async ({ run }) => {
    for (const name of detectionSteps) {
      const { result, outputs } = await run(name, { PREVIOUS_SHA: '' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(outputs.required, 'true', name);
    }
  });
});

test('superseded web-only commits skip both publications before any Azure mutation', async () => {
  await releaseFixture(['apps/web/src/fixture.ts'], async ({ run }) => {
    for (const name of detectionSteps.slice(2)) {
      const { result, outputs } = await run(name, {
        MOCK_CURRENT_MAIN_SHA: 'b'.repeat(40),
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(outputs.required, 'false', name);
      assert.match(result.stdout, /stale/);
    }
  });
});

test('failed or skipped API publication cannot emit success evidence or publish required web', async () => {
  await releaseFixture(
    ['apps/web/src/fixture.ts'],
    async ({ run, root, repository, deploySha }) => {
      const gateSource = await readFile(
        new URL('./verify-battles-summary-contract.mjs', import.meta.url),
        'utf8',
      );
      await writeFile(
        path.join(repository, 'scripts/verify-battles-summary-contract.mjs'),
        gateSource,
      );
      const azCalls = path.join(root, 'az-calls');
      const prelude = 'az() { printf "called\\n" >> "$AZ_CALLS"; return 1; }';
      const common = {
        AZ_CALLS: shellPath(azCalls),
        AZURE_RESOURCE_GROUP: 'fixture',
        AZURE_WEBAPP_NAME: 'fixture',
      };
      const skipped = await run('Deploy API to Azure', common, prelude);
      assert.equal(skipped.result.status, 0, skipped.result.stderr);
      assert.equal(skipped.outputs.published_sha, undefined);
      const decision = await run('Detect API deployment changes');
      assert.equal(decision.outputs.required, 'true');
      const failed = await run('Deploy API to Azure', common, prelude);
      assert.equal(failed.result.status, 1);
      assert.equal(failed.outputs.published_sha, undefined);
      assert.equal(await readFile(azCalls, 'utf8'), 'called\n');
      await writeFile(azCalls, '');
      const webDecision = await run('Detect web deployment changes');
      assert.equal(webDecision.outputs.required, 'true');
      const blocked = await run(
        'Deploy web application to Azure',
        {
          ...common,
          API_PUBLISHED_SHA: '',
          API_ORIGIN: environment.API_ORIGIN,
          WEB_API_BASE_URL: environment.WEB_API_BASE_URL,
        },
        prelude,
      );
      assert.equal(blocked.result.status, 1);
      assert.match(blocked.result.stderr, /publication.*not confirmed/);
      assert.equal(await readFile(azCalls, 'utf8'), '');
      const published = await run(
        'Deploy API to Azure',
        common,
        'az() { return 0; }',
      );
      assert.equal(published.result.status, 0, published.result.stderr);
      assert.equal(published.outputs.published_sha, deploySha);
    },
  );
});

test('a commit superseded after detection still cannot publish API or web', async () => {
  await releaseFixture(
    ['apps/web/src/fixture.ts'],
    async ({ run, root, deploySha }) => {
      const calls = path.join(root, 'mutations');
      await writeFile(calls, '');
      // Contract behavior is covered above; stub only its success here to isolate
      // the current-main check that follows it, without making network requests.
      const prelude =
        'node() { return 0; }\naz() { printf "mutation\\n" >> "$AZ_CALLS"; return 0; }';
      for (const [detection, publication] of [
        ['Detect API deployment changes', 'Deploy API to Azure'],
        ['Detect web deployment changes', 'Deploy web application to Azure'],
      ]) {
        const decision = await run(detection);
        assert.equal(decision.result.status, 0, decision.result.stderr);
        assert.equal(decision.outputs.required, 'true');
        const stale = await run(
          publication,
          {
            MOCK_CURRENT_MAIN_SHA: 'b'.repeat(40),
            AZ_CALLS: shellPath(calls),
            API_PUBLISHED_SHA: deploySha,
            API_ORIGIN: environment.API_ORIGIN,
            WEB_API_BASE_URL: environment.WEB_API_BASE_URL,
          },
          prelude,
        );
        assert.equal(stale.result.status, 0, stale.result.stderr);
        assert.match(stale.result.stdout, /Skipping stale/);
        assert.equal(stale.outputs.published_sha, undefined);
        assert.equal(await readFile(calls, 'utf8'), '');
      }
    },
  );
});
