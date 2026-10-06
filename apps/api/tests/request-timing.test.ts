import Fastify from 'fastify';
import { Writable } from 'node:stream';
import { observeDatabaseError } from '../src/database/pool-observability.js';
import { expect, it, vi } from 'vitest';
import {
  registerRequestTiming,
  timeRequestStage,
  createPhaseTiming,
  getRequestPhaseTiming,
  phaseTimingFields,
  timePhase,
  timePhaseSync,
  type PhaseTimingField,
} from '../src/request-timing.js';

it('retains isolated request logger correlation through asynchronous database observations', async () => {
  const events: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      events.push(JSON.parse(String(chunk)));
      done();
    },
  });
  const app = Fastify({ logger: { stream } });
  registerRequestTiming(app);
  app.get('/pool-observation', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    observeDatabaseError(new Error('private SQL and credentials'), 'query');
    return { ok: true };
  });
  try {
    await Promise.all([
      app.inject({
        url: '/pool-observation',
        headers: { 'x-request-id': 'a' },
      }),
      app.inject({
        url: '/pool-observation',
        headers: { 'x-request-id': 'b' },
      }),
    ]);
    const observations = events.filter(
      (event) => event.msg === 'PostgreSQL pool observation',
    );
    expect(observations).toHaveLength(2);
    expect(new Set(observations.map((event) => event.reqId)).size).toBe(2);
    for (const event of observations)
      expect(event).toMatchObject({
        category: 'request',
        error_category: 'query_error',
      });
    expect(JSON.stringify(observations)).not.toContain('private SQL');
  } finally {
    await app.close();
  }
});

it('reports isolated stage timings for successful and failed requests without secrets', async () => {
  const app = Fastify();
  registerRequestTiming(app);
  app.get('/timed', async (request) => {
    await timeRequestStage(
      request,
      'auth',
      async () => new Promise((resolve) => setTimeout(resolve, 5)),
    );
    return { ok: true };
  });
  app.get('/failed', async (request) =>
    timeRequestStage(request, 'identity', async () => {
      throw new Error('failure');
    }),
  );
  try {
    const [success, failure] = await Promise.all([
      app.inject('/timed'),
      app.inject('/failed'),
    ]);
    expect(success.statusCode).toBe(200);
    expect(success.headers['server-timing']).toMatch(
      /^auth;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
    expect(failure.statusCode).toBe(500);
    expect(failure.headers['server-timing']).toMatch(
      /^identity;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
  } finally {
    await app.close();
  }
});

it('keeps detailed metrics server-only, numeric, scoped and isolated for concurrent routes', async () => {
  const events: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      events.push(JSON.parse(String(chunk)));
      done();
    },
  });
  const app = Fastify({ logger: { stream } });
  registerRequestTiming(app);
  const ids = new Set<object>();
  app.post(
    '/api/v1/matches/pvp/invitations/:invitationId/accept',
    async (request) => {
      const timing = getRequestPhaseTiming(request)!;
      ids.add(timing);
      await timePhase(timing, 'transaction_ms', async () => {
        timing.record('sql_statement_count', 18);
        timing.record('initial_match_write_ms', 2.5);
        timing.record('private_identifier' as PhaseTimingField, 999);
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      return { ok: true };
    },
  );
  app.get('/api/v1/matches/pvp/:matchId', async (request) => {
    const timing = getRequestPhaseTiming(request)!;
    ids.add(timing);
    timing.record('sql_statement_count', 6);
    if (request.headers['x-test-failure'])
      throw new Error('private failure detail');
    return { ok: true };
  });
  app.post('/api/v1/matches/pvp/:matchId/actions', async (request) => {
    expect(getRequestPhaseTiming(request)).toBeUndefined();
    return { ok: true };
  });
  try {
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/matches/pvp/invitations/private-invitation/accept',
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/matches/pvp/invitations/private-invitation/accept',
      }),
      app.inject('/api/v1/matches/pvp/private-match'),
      app.inject({
        method: 'GET',
        url: '/api/v1/matches/pvp/private-match',
        headers: { 'x-test-failure': 'yes' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/matches/pvp/private-match/actions',
      }),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([
      200, 200, 200, 500, 200,
    ]);
    expect(ids.size).toBe(4);
    for (const response of responses)
      expect(response.headers['server-timing']).toMatch(/^total;dur=\d+\.\d$/);
    const logs = events.filter((e) => e.msg === 'API request timing');
    expect(logs).toHaveLength(5);
    const detailed = logs.filter((e) => e.phaseTimings);
    expect(detailed).toHaveLength(4);
    expect(
      detailed
        .map(
          (e) =>
            (e.phaseTimings as Record<string, number>).sql_statement_count!,
        )
        .sort((a, b) => a - b),
    ).toEqual([6, 6, 18, 18]);
    for (const event of detailed.filter((e) =>
      String(e.route).endsWith('/accept'),
    ))
      expect(event.phaseTimings).toMatchObject({ initial_match_write_ms: 2.5 });
    for (const e of detailed) {
      expect(e.reqId).toEqual(expect.any(String));
      for (const [key, value] of Object.entries(e.phaseTimings as object)) {
        expect(phaseTimingFields).toContain(key);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    const serialized = JSON.stringify(logs);
    for (const secret of [
      'private-invitation',
      'private-match',
      'private failure detail',
      'private_identifier',
    ])
      expect(serialized).not.toContain(secret);
  } finally {
    await app.close();
  }
});

it('rejects invalid metric fields/values and never replaces operation results or errors', async () => {
  const collector = createPhaseTiming();
  collector.record('sql_statement_count', 1);
  collector.record('sql_statement_count', 0.5);
  collector.record('sql_client_ms', NaN);
  collector.record('sql_client_ms', -1);
  collector.record('__proto__' as PhaseTimingField, 1);
  expect(collector.snapshot()).toEqual({ sql_statement_count: 1 });
  const broken = {
    record() {
      throw new Error('sink failure');
    },
  };
  const original = new Error('operation failure');
  await expect(timePhase(broken, 'commit_ms', async () => 42)).resolves.toBe(
    42,
  );
  await expect(
    timePhase(broken, 'commit_ms', async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  expect(timePhaseSync(broken, 'match_construct_ms', () => 42)).toBe(42);
  expect(() =>
    timePhaseSync(broken, 'match_construct_ms', () => {
      throw original;
    }),
  ).toThrow(original);
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => {
    throw new Error('clock failure');
  });
  try {
    await expect(timePhase(collector, 'deck_ms', async () => 42)).resolves.toBe(
      42,
    );
  } finally {
    clock.mockRestore();
  }
  expect(collector.snapshot()).toEqual({ sql_statement_count: 1 });
});

it('preserves an HTTP response when timing logging fails', async () => {
  const app = Fastify();
  registerRequestTiming(app);
  app.get('/matches/pvp/:matchId', async (request) => {
    request.log.info = () => {
      throw new Error('logger failure');
    };
    return { ok: true };
  });
  try {
    const response = await app.inject('/matches/pvp/example');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  } finally {
    await app.close();
  }
});
