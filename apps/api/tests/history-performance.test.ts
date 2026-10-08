import type pg from 'pg';
import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  createCpuMatchService,
  type CpuMatchClient,
} from '../src/matches/cpu-match-service.js';

it('profiles history round trips with three matches and twenty rounds each', async () => {
  let calls = 0;
  let acquiredAt = 0;
  const holdDurations: number[] = [];
  const date = new Date('2026-09-01T00:00:00Z');
  const playerId = 'a1000000-0000-4000-8000-000000000001';
  const matches = Array.from({ length: 3 }, (_, i) => ({
    id: `a2000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    winner: 'player',
    started_at: date,
    completed_at: date,
  }));
  const rounds = matches.flatMap((match) =>
    Array.from({ length: 20 }, (_, i) => ({
      id: `${match.id}-round-${i}`,
      match_id: match.id,
      round_number: i + 1,
      result: [],
      created_at: date,
    })),
  );
  const query = async (sql: string, args?: unknown[]) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (sql.includes('with recent as materialized')) {
      expect(args).toEqual([playerId, 5]);
      return { rows: matches.map((match) => ({ ...match, round_count: 20 })) };
    }
    if (sql.includes('from public.cpu_matches')) {
      expect(sql).toContain('where player_id = $1::uuid');
      expect(args).toEqual([playerId]);
      return { rows: matches };
    }
    if (sql.includes('from public.cpu_match_rounds'))
      return {
        rows: Array.isArray(args?.[0])
          ? rounds
          : rounds.filter((r) => r.match_id === args?.[0]),
      };
    if (sql.includes('from public.cpu_match_actions')) {
      expect(args).toEqual([matches.map((match) => match.id)]);
      return {
        rows: rounds.map((round) => ({
          round_id: round.id,
          sequence: round.round_number,
          side: 'player',
          submission_id: null,
          action: { type: 'timeout' },
          result: {
            action: { type: 'timeout' },
            side: 'player',
            effects: [],
            expiredEffects: [],
            defeatedCreatureId: null,
            winner: null,
            turnEnded: true,
          },
          created_at: date,
        })),
      };
    }
    throw new Error('Unexpected history query');
  };
  const client = {
    query: query as pg.PoolClient['query'],
    release: () => {
      holdDurations.push(performance.now() - acquiredAt);
    },
  } as CpuMatchClient;
  const service = createCpuMatchService({
    connect: async () => {
      acquiredAt = performance.now();
      return client;
    },
  });
  const start = performance.now();
  const result = await service.listHistory(playerId);
  process.stdout.write(
    JSON.stringify({
      scenario: 'history, simulated 10ms/query',
      calls,
      elapsedMs: Math.round(performance.now() - start),
    }) + '\n',
  );
  expect(result).toHaveLength(3);
  expect(result.every((match) => match.rounds.length === 20)).toBe(true);
  for (const match of result)
    for (const round of match.rounds) {
      expect(round.actions).toHaveLength(1);
      expect(round.actions[0]?.sequence).toBe(round.roundNumber);
      expect(round.actions[0]?.createdAt).toBe(date.toISOString());
    }
  expect(calls).toBe(3);
  const fullBytes = Buffer.byteLength(JSON.stringify({ matches: result }));
  calls = 0;
  const compactStart = performance.now();
  const compact = await service.listHistorySummaries(playerId, 5);
  expect(compact).toHaveLength(3);
  expect(compact.map((match) => match.roundCount)).toEqual([20, 20, 20]);
  expect(calls).toBe(1);
  const compactBytes = Buffer.byteLength(JSON.stringify({ matches: compact }));
  expect(compactBytes).toBeLessThan(fullBytes / 10);
  process.stdout.write(
    JSON.stringify({
      scenario: 'same three-match fixture, simulated 10ms/query',
      beforeStatements: 3,
      afterStatements: calls,
      acquisitionsBefore: 1,
      acquisitionsAfter: 1,
      beforeBytes: fullBytes,
      afterBytes: compactBytes,
      beforeHoldMs: holdDurations[0],
      afterHoldMs: holdDurations[1],
      compactReadMs: performance.now() - compactStart,
    }) + '\n',
  );
  const app = await buildApp({
    logger: false,
    authConfig: {
      domain: 'auth.example.test',
      issuer: 'https://auth.example.test/',
      audience: 'https://api.example.test',
      spaClientId: 'fixture',
      jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
    },
    accessTokenVerifier: {
      verify: async () => ({
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        subject: 'auth0|fixture',
        playerName: 'fixture-player',
        tokenIssuedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    },
    playerIdentityService: {
      resolve: async () => ({
        id: playerId,
        role: 'player',
        playerName: 'fixture-player',
        lifecycleStatus: 'active',
      }),
    },
    cpuMatchService: service,
  });
  try {
    for (const view of ['full', 'summary']) {
      const durations: number[] = [];
      let bytes = 0;
      for (let run = 0; run < 3; run++) {
        const requestStarted = performance.now();
        const response = await app.inject({
          method: 'GET',
          url:
            '/api/v1/matches/history' +
            (view === 'summary' ? '?view=summary&limit=5' : ''),
          headers: { authorization: 'Bearer fixture' },
        });
        durations.push(performance.now() - requestStarted);
        expect(response.statusCode, response.body).toBe(200);
        bytes = Buffer.byteLength(response.body);
      }
      process.stdout.write(
        JSON.stringify({
          scenario:
            'in-process Fastify HTTP, same fixture, simulated 10ms/query',
          view,
          responseBytes: bytes,
          requestDurationsMs: durations,
          medianMs: [...durations].sort((a, b) => a - b)[1],
        }) + '\n',
      );
    }
  } finally {
    await app.close();
  }
});
