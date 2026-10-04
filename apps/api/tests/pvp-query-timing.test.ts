import { expect, it, vi } from 'vitest';
import { createPhaseTiming } from '../src/request-timing.js';
import {
  timePvpClient,
  countTrustStatements,
} from '../src/matches/pvp-query-timing.js';
import type { AsyncPvpClient } from '../src/matches/asynchronous-pvp-service.js';
import { createAsyncPvpService } from '../src/matches/asynchronous-pvp-service.js';
import { createSignedCursorCodec } from '../src/security/signed-cursor.js';

it('passes queries, values, results, errors and release through without retaining SQL', async () => {
  const result = { rows: [{ privateValue: 'not a metric' }] };
  const error = new Error('private query error');
  const query = vi
    .fn()
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(error);
  const release = vi.fn();
  const client = { query, release } as AsyncPvpClient;
  const timing = createPhaseTiming();
  const wrapped = timePvpClient(client, timing);
  const trust = countTrustStatements(wrapped, timing);
  const values = ['private parameter'];
  expect(await trust.query('private SQL', values)).toBe(result);
  await expect(wrapped.query('another private SQL')).rejects.toBe(error);
  wrapped.release();
  expect(query.mock.calls).toEqual([
    ['private SQL', values],
    ['another private SQL', undefined],
  ]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(timing.snapshot()).toMatchObject({
    sql_statement_count: 2,
    trust_statement_count: 1,
    sql_client_ms: expect.any(Number),
  });
  expect(JSON.stringify(timing.snapshot())).not.toContain('private');
  expect(timePvpClient(client)).toBe(client);
  expect(countTrustStatements(client)).toBe(client);
});

it('finalizes rollback metrics and releases once without replacing a service error', async () => {
  const error = new Error('original private database failure');
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce({ rows: [] });
  const release = vi.fn();
  const service = createAsyncPvpService(
    {
      async connect() {
        return { query, release };
      },
    },
    {
      cursorCodec: createSignedCursorCodec(
        'diagnostic-test-key-at-least-32-characters',
      ),
    },
  );
  const timing = createPhaseTiming();
  await expect(
    service.getMatch('private-player', 'private-match', timing),
  ).rejects.toBe(error);
  expect(query.mock.calls.map((call) => call[0])).toEqual([
    'begin',
    expect.any(String),
    'rollback',
  ]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(timing.snapshot()).toMatchObject({
    pool_acquire_ms: expect.any(Number),
    begin_ms: expect.any(Number),
    transaction_ms: expect.any(Number),
    get_locked_projection_ms: expect.any(Number),
    rollback_ms: expect.any(Number),
    sql_statement_count: 3,
  });
  expect(timing.snapshot()).not.toHaveProperty('commit_ms');
  expect(JSON.stringify(timing.snapshot())).not.toContain('private');
});
it('a broken diagnostics sink cannot change a query result or error', async () => {
  const error = new Error('query failure');
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockRejectedValueOnce(error);
  const sink = {
    record() {
      throw Error('diagnostics failure');
    },
  };
  const client = timePvpClient({ query, release() {} }, sink);
  await expect(
    countTrustStatements(client, sink).query('select'),
  ).resolves.toEqual({ rows: [] });
  await expect(client.query('select')).rejects.toBe(error);
});
