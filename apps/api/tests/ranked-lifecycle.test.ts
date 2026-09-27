import { describe, expect, it, vi } from 'vitest';

import type {
  RankedClient,
  RankedDatabase,
} from '../src/matches/ranked-database.js';
import { maintainRankedSeasons } from '../src/matches/ranked-season-service.js';
import { settleRankedMatch } from '../src/matches/ranked-settlement.js';

const SEASON_ID = 'c1000000-0000-4000-8000-000000000001';
const MATCH_ID = 'c2000000-0000-4000-8000-000000000001';
const WINNER_ID = 'c3000000-0000-4000-8000-000000000001';
const LOSER_ID = 'c3000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-09-28T12:00:00.000Z');

describe('ranked lifecycle persistence', () => {
  it('activates the next scheduled season and seeds server-owned ratings', async () => {
    const { database, query, release } = rankedDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql === 'select clock_timestamp() as now') {
        return { rows: [{ now: NOW }] };
      }
      if (sql.includes("status in ('active', 'closing')")) {
        return { rows: [] };
      }
      if (sql.includes("status = 'scheduled'")) {
        return { rows: [{ id: SEASON_ID }] };
      }
      if (sql.includes("status = 'closed'")) return { rows: [] };
      return { rows: [] };
    });

    await expect(maintainRankedSeasons(database)).resolves.toEqual({
      startedClosing: false,
      closedSeason: false,
      activatedSeason: true,
    });
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes(
          'insert into public.ranked_player_season_ratings',
        ),
      ),
    ).toBe(true);
    expect(query).toHaveBeenCalledWith('commit');
    expect(release).toHaveBeenCalledOnce();
  });

  it('closes queue entry points when an active season reaches its deadline', async () => {
    const { database, query } = rankedDatabase(async (statement) => {
      const sql = normalizedSql(statement);
      if (sql === 'select clock_timestamp() as now') {
        return { rows: [{ now: NOW }] };
      }
      if (sql.includes("status in ('active', 'closing')")) {
        return {
          rows: [
            {
              id: SEASON_ID,
              status: 'active',
              active_ends_at: new Date('2026-09-28T11:59:00.000Z'),
            },
          ],
        };
      }
      if (sql.includes('from private.ranked_matchmaking_receipts')) {
        return { rows: [{ id: MATCH_ID }] };
      }
      return { rows: [] };
    });

    await expect(maintainRankedSeasons(database)).resolves.toEqual({
      startedClosing: true,
      closedSeason: false,
      activatedSeason: false,
    });
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes("set status = 'closing'"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.filter(([statement]) =>
        String(statement).includes("set status = 'cancelled'"),
      ),
    ).toHaveLength(2);
  });

  it('settles ratings once and records an explicit territory exclusion', async () => {
    const query = vi.fn(async (statement: string, values?: unknown[]) => {
      const sql = normalizedSql(statement);
      if (sql.includes('from private.ranked_matchmaking_receipts')) {
        return {
          rows: [{ season_id: SEASON_ID, policy_version: 'ranked-v1' }],
        };
      }
      if (sql.includes('from private.ranked_rating_settlements')) {
        return { rows: [] };
      }
      if (sql.includes('from private.ranked_match_rating_inputs rating')) {
        return {
          rows: [
            {
              prior_settled_match_count: 8,
              territory_policy_version: 'territory-v1',
              zone_id: null,
            },
          ],
        };
      }
      if (
        sql.includes('from private.ranked_match_rating_inputs') &&
        sql.includes('order by player_id')
      ) {
        return {
          rows: [rankedInput(WINNER_ID), rankedInput(LOSER_ID)],
        };
      }
      if (sql.includes('from public.ranked_player_season_ratings')) {
        return {
          rows: [currentRating(WINNER_ID), currentRating(LOSER_ID)],
        };
      }
      if (sql.includes('from private.territory_contribution_decisions')) {
        return { rows: [] };
      }
      if (sql.includes('from private.territory_policy_versions')) {
        return {
          rows: [
            {
              required_prior_ranked_settlements: 5,
              influence_per_eligible_win: 3,
              daily_influence_cap: 6,
              daily_cap_timezone: 'Africa/Johannesburg',
            },
          ],
        };
      }
      if (sql.startsWith('with expected as')) {
        return {
          rows: [
            {
              expected_score: '0.500000000000000',
              calculated_delta: values?.[3] === 1 ? 16 : -16,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      settleRankedMatch(
        { query } as unknown as Parameters<typeof settleRankedMatch>[0],
        {
          matchId: MATCH_ID,
          winnerPlayerId: WINNER_ID,
          loserPlayerId: LOSER_ID,
          completionReason: 'defeat',
          completedAt: NOW,
        },
      ),
    ).resolves.toBeUndefined();
    expect(
      query.mock.calls.filter(([statement]) =>
        String(statement).includes(
          'insert into private.ranked_rating_ledger_entries',
        ),
      ),
    ).toHaveLength(2);
    expect(
      query.mock.calls.some(
        ([statement, values]) =>
          String(statement).includes('territory_contribution_decisions') &&
          Array.isArray(values) &&
          values.includes('no_zone_grant'),
      ),
    ).toBe(true);
  });

  it('leaves an unranked live result untouched', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await settleRankedMatch(
      { query } as unknown as Parameters<typeof settleRankedMatch>[0],
      {
        matchId: MATCH_ID,
        winnerPlayerId: WINNER_ID,
        loserPlayerId: LOSER_ID,
        completionReason: 'defeat',
        completedAt: NOW,
      },
    );
    expect(query).toHaveBeenCalledOnce();
  });
});

function rankedDatabase(
  implementation: (
    statement: string,
    values?: unknown[],
  ) => Promise<{
    rows: Record<string, unknown>[];
    rowCount?: number | null;
  }>,
) {
  const query = vi.fn(implementation);
  const release = vi.fn();
  const client = { query, release } as unknown as RankedClient;
  const database = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as RankedDatabase;
  return { database, query, release };
}

function normalizedSql(statement: string) {
  return statement.toLowerCase().replaceAll(/\s+/gu, ' ').trim();
}

function rankedInput(playerId: string) {
  return {
    season_id: SEASON_ID,
    policy_version: 'ranked-v1',
    player_id: playerId,
    pre_match_rating: 1_000,
    prior_settled_match_count: 8,
    k_factor: 24,
  };
}

function currentRating(playerId: string) {
  return {
    player_id: playerId,
    rating: 1_000,
    settled_match_count: 8,
    wins: 4,
    losses: 4,
  };
}
