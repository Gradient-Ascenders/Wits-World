import { describe, expect, it, vi } from 'vitest';

import { recordTerritoryContribution } from '../src/territory/territory-contributions.js';
import type { TerritoryQueryable } from '../src/territory/territory-grants.js';

const MATCH_ID = '10000000-0000-4000-8000-000000000001';
const SEASON_ID = '20000000-0000-4000-8000-000000000001';
const PLAYER_ID = '30000000-0000-4000-8000-000000000001';
const ZONE_ID = '40000000-0000-4000-8000-000000000001';

function createQueryable(query: ReturnType<typeof vi.fn>): TerritoryQueryable {
  return { query } as unknown as TerritoryQueryable;
}

const input = {
  matchId: MATCH_ID,
  seasonId: SEASON_ID,
  rankedPolicyVersion: 'ranked-v1',
  winnerPlayerId: PLAYER_ID,
  completionReason: 'defeat' as const,
};

const policy = {
  required_prior_ranked_settlements: 5,
  influence_per_eligible_win: 1,
  daily_influence_cap: 5,
  daily_cap_timezone: 'Africa/Johannesburg',
};

describe('territory-v1 authoritative contributions', () => {
  it('records a zero-point decision for an ordinary ranked win without a zone grant', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            prior_settled_match_count: 5,
            territory_policy_version: 'territory-v1',
            zone_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [policy] })
      .mockResolvedValueOnce({ rows: [] });

    await recordTerritoryContribution(createQueryable(query), input);

    expect(query).toHaveBeenCalledTimes(4);
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'private.territory_contribution_decisions',
    );
    expect(query.mock.calls[3]?.[1]).toContain('no_zone_grant');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('territory_influence_contributions'),
      ),
    ).toBe(false);
  });

  it('does not award influence to a provisional winner', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            prior_settled_match_count: 4,
            territory_policy_version: 'territory-v1',
            zone_id: ZONE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [policy] })
      .mockResolvedValueOnce({ rows: [] });

    await recordTerritoryContribution(createQueryable(query), input);

    expect(query.mock.calls[3]?.[1]).toContain('winner_provisional');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('territory_influence_contributions'),
      ),
    ).toBe(false);
  });

  it('serializes an established winner and records exactly one server-derived point', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            prior_settled_match_count: 5,
            territory_policy_version: 'territory-v1',
            zone_id: ZONE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [policy] })
      .mockResolvedValueOnce({ rows: [{ lifecycle_status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            contributed_at: new Date('2026-09-22T10:00:00.000Z'),
            contribution_date: '2026-09-22',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ accepted_count: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await recordTerritoryContribution(createQueryable(query), input);

    expect(String(query.mock.calls[3]?.[0])).toContain('for update');
    expect(String(query.mock.calls[4]?.[0])).toContain('for update');
    expect(String(query.mock.calls[7]?.[0])).toContain(
      'private.territory_contribution_decisions',
    );
    expect(query.mock.calls[7]?.[1]).toContain(1);
    expect(String(query.mock.calls[8]?.[0])).toContain(
      'private.territory_influence_contributions',
    );
    expect(query.mock.calls[8]?.[1]).toContain(1);
  });

  it('rechecks the local daily cap while the player and zone locks are held', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            prior_settled_match_count: 5,
            territory_policy_version: 'territory-v1',
            zone_id: ZONE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [policy] })
      .mockResolvedValueOnce({ rows: [{ lifecycle_status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            contributed_at: new Date('2026-09-22T10:00:00.000Z'),
            contribution_date: '2026-09-22',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ accepted_count: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    await recordTerritoryContribution(createQueryable(query), input);

    expect(query.mock.calls[7]?.[1]).toContain('daily_cap_reached');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes(
          'insert into private.territory_influence_contributions',
        ),
      ),
    ).toBe(false);
  });
});
