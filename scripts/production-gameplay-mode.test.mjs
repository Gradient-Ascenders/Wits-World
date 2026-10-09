import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';

import { selectProductionGameplayMode } from './production-gameplay-mode.mjs';

test('defaults to polling until all production writers are confirmed coordinated', () => {
  assert.equal(selectProductionGameplayMode(), 'polling');
  assert.equal(selectProductionGameplayMode({ backend: 'upstash' }), 'polling');
  assert.equal(
    selectProductionGameplayMode({
      backend: 'upstash',
      writersCoordinated: 'false',
    }),
    'polling',
  );
});

test('enables upstash only after an explicit writer-retirement acknowledgement', () => {
  assert.equal(
    selectProductionGameplayMode({
      backend: 'upstash',
      writersCoordinated: 'true',
    }),
    'upstash',
  );
  assert.equal(
    selectProductionGameplayMode({
      backend: 'polling',
      writersCoordinated: 'true',
    }),
    'polling',
  );
});

test('rejects unknown backend and acknowledgement values rather than silently activating', () => {
  for (const backend of ['redis', 'UPSTASH', 'secret-marker']) {
    assert.throws(
      () =>
        selectProductionGameplayMode({ backend, writersCoordinated: 'true' }),
      /Invalid production/u,
    );
  }
  for (const writersCoordinated of ['1', 'TRUE', 'yes', 'secret-marker']) {
    assert.throws(
      () =>
        selectProductionGameplayMode({
          backend: 'upstash',
          writersCoordinated,
        }),
      /must be true or false/u,
    );
  }
});

test('CLI emits only the selected safe backend and returns nonzero on invalid configuration', () => {
  const script = fileURLToPath(
    new URL('./production-gameplay-mode.mjs', import.meta.url),
  );
  for (const [backend, writersCoordinated, expected] of [
    ['upstash', 'false', 'polling'],
    ['upstash', 'true', 'upstash'],
  ]) {
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND: backend,
        PRODUCTION_GAMEPLAY_WRITERS_COORDINATED: writersCoordinated,
      },
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), expected);
    assert.equal(result.stderr, '');
  }
  const invalid = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND: 'secret-marker',
      PRODUCTION_GAMEPLAY_WRITERS_COORDINATED: 'true',
    },
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(invalid.stderr.includes('secret-marker'), false);
});
