import { describe, expect, it, vi } from 'vitest';

import {
  createTrustService,
  type TrustQueryable,
} from '../src/trust/trust-service.js';

const pair = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
] as const;

function fixture(
  options: {
    missing?: boolean;
    inactive?: boolean;
    patterns?: boolean;
    total?: number;
    pairMatches?: number;
    forfeits?: number;
    failAt?: string;
  } = {},
) {
  const statements: string[] = [];
  const release = vi.fn();
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    statements.push(sql);
    if (options.failAt && sql.includes(options.failAt))
      throw new Error('query failed');
    if (sql.includes('having count(*) = 2') && sql.includes('match.id = $1')) {
      return {
        rows: options.missing
          ? []
          : [
              {
                player_low_id: pair[1],
                player_high_id: pair[0],
                completed_at: new Date('2026-10-01T12:00:00Z'),
              },
            ],
      };
    }
    if (sql.includes('count(*)::integer as count'))
      return { rows: [{ count: options.inactive ? 1 : 2 }] };
    if (sql.includes("'concentration' as aggregate_type"))
      return {
        rows: options.patterns
          ? [
              ...pair.map((player_id) => ({
                aggregate_type: 'concentration',
                player_id,
                total_matches: options.total ?? 6,
                pair_matches: options.pairMatches ?? 6,
                matching_forfeits: 0,
              })),
              {
                aggregate_type: 'one_sided',
                player_id: pair[1],
                total_matches: 0,
                pair_matches: 0,
                matching_forfeits: options.forfeits ?? 4,
              },
            ]
          : [],
      };
    return { rows: [] };
  });
  const client = { query, release } as unknown as TrustQueryable & {
    release(): void;
  };
  const connect = vi.fn(async () => client);
  return {
    service: createTrustService({ connect }),
    connect,
    query,
    statements,
    release,
  };
}

describe('Trust combined history public transaction', () => {
  it.each([
    { total: 5, pairMatches: 5, forfeits: 3, expected: 0 },
    { total: 6, pairMatches: 5, forfeits: 3, expected: 2 },
    { total: 10, pairMatches: 8, forfeits: 4, expected: 4 },
    { total: 10, pairMatches: 7, forfeits: 4, expected: 2 },
  ])(
    'preserves thresholds for $total matches / $pairMatches pair / $forfeits forfeits',
    async (options) => {
      const f = fixture({ patterns: true, ...options });
      await f.service.evaluateOpponentPatternsForMatch(pair[0]);
      const inserts = f.query.mock.calls.filter(([sql]) =>
        sql.includes('insert into private.trust_signals'),
      );
      expect(inserts).toHaveLength(options.expected);
      for (const [, values] of inserts) {
        const summary = JSON.parse(values?.[10] as string) as Record<
          string,
          unknown
        >;
        expect(summary).toMatchObject(
          summary.kind === 'opponent_concentration'
            ? {
                completedMatchCount: options.total,
                repeatedOpponentMatchCount: options.pairMatches,
                opponentConcentrationRatio: options.pairMatches / options.total,
              }
            : { qualifyingForfeitCount: options.forfeits },
        );
      }
    },
  );
  it.each([
    { patterns: false, expected: 5 },
    { patterns: true, expected: 13 },
  ])(
    'uses $expected statements with one acquisition',
    async ({ patterns, expected }) => {
      const f = fixture({ patterns });
      await f.service.evaluateOpponentPatternsForMatch(pair[0]);
      expect(f.statements).toHaveLength(expected);
      expect(f.connect).toHaveBeenCalledOnce();
      expect(f.release).toHaveBeenCalledOnce();
      expect(f.statements[0]).toBe('begin');
      expect(f.statements.at(-1)).toBe('commit');
      const historyCalls = f.query.mock.calls.filter(([sql]) =>
        sql.includes("'concentration' as aggregate_type"),
      );
      expect(historyCalls).toHaveLength(1);
      expect(historyCalls[0]?.[1]).toEqual([
        ...pair,
        new Date('2026-10-01T12:00:00Z'),
      ]);
      // Pair order is canonical even if the context provider returns reversed IDs.
      const inserts = f.statements.filter((sql) =>
        sql.includes('insert into private.trust_signals'),
      );
      expect(inserts).toHaveLength(patterns ? 4 : 0);
    },
  );

  it.each([
    { missing: true, expected: 3 },
    { inactive: true, expected: 4 },
  ])(
    'preserves early guard with $expected statements',
    async ({ expected, ...options }) => {
      const f = fixture(options);
      await f.service.evaluateOpponentPatternsForMatch(pair[0]);
      expect(f.statements).toHaveLength(expected);
      expect(f.statements.some((sql) => sql.includes('aggregate_type'))).toBe(
        false,
      );
      expect(f.release).toHaveBeenCalledOnce();
    },
  );

  it.each([
    'match.id = $1',
    'count(*)::integer as count',
    "'concentration' as aggregate_type",
    'insert into private.trust_signals',
    'commit',
  ])('rolls back and releases after failure at %s', async (failAt) => {
    const f = fixture({ patterns: true, failAt });
    await expect(
      f.service.evaluateOpponentPatternsForMatch(pair[0]),
    ).rejects.toThrow('query failed');
    expect(f.statements.at(-1)).toBe('rollback');
    expect(f.release).toHaveBeenCalledOnce();
  });
});
