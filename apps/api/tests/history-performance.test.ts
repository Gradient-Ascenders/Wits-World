import type pg from 'pg';
import { expect, it } from 'vitest';
import {
  createCpuMatchService,
  type CpuMatchClient,
} from '../src/matches/cpu-match-service.js';

it('profiles history round trips with three matches and twenty rounds each', async () => {
  let calls = 0;
  const date = new Date('2026-09-01T00:00:00Z');
  const matches = Array.from({ length: 3 }, (_, i) => ({
    id: `match-${i}`,
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
    if (sql.includes('from public.cpu_matches')) {
      expect(sql).toContain('where player_id = $1::uuid');
      expect(args).toEqual(['player']);
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
    release: () => {},
  } as CpuMatchClient;
  const service = createCpuMatchService({ connect: async () => client });
  const start = performance.now();
  const result = await service.listHistory('player');
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
});
