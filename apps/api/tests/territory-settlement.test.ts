import { describe, expect, it } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';

import {
  maintainTerritorySettlements,
  selectTerritoryOwner,
  territorySettlementDigest,
  type TerritorySettlementTotal,
} from '../src/territory/territory-settlement.js';

const base: TerritorySettlementTotal[] = [
  {
    playerId: '00000000-0000-4000-8000-000000000001',
    acceptedInfluenceCount: 3,
    earliestContributionAt: '2026-09-22 08:05:00+00',
    earliestContributionKey: '2026-09-22T08:05:00.000000Z',
    accountEligible: true,
  },
  {
    playerId: '00000000-0000-4000-8000-000000000002',
    acceptedInfluenceCount: 3,
    earliestContributionAt: '2026-09-22 08:10:00+00',
    earliestContributionKey: '2026-09-22T08:10:00.000000Z',
    accountEligible: true,
  },
];

describe('territory-v1 deterministic settlement', () => {
  it('keeps an incumbent when nobody reaches the ownership threshold', () => {
    const totals = base.map((total) => ({
      ...total,
      acceptedInfluenceCount: 2,
    }));
    expect(
      selectTerritoryOwner('00000000-0000-4000-8000-000000000099', totals, 3),
    ).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('keeps an incumbent among tied leaders', () => {
    expect(
      selectTerritoryOwner('00000000-0000-4000-8000-000000000002', base, 3),
    ).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('breaks challenger ties by earliest contribution then stable UUID', () => {
    expect(selectTerritoryOwner(null, base, 3)).toBe(
      '00000000-0000-4000-8000-000000000001',
    );

    const simultaneous = base.map((total) => ({
      ...total,
      earliestContributionKey: '2026-09-22T08:05:00.000000Z',
    }));
    expect(selectTerritoryOwner(null, simultaneous.reverse(), 3)).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('excludes inactive accounts from ownership without deleting their totals', () => {
    const totals = [
      { ...base[0]!, acceptedInfluenceCount: 5, accountEligible: false },
      { ...base[1]!, acceptedInfluenceCount: 3 },
    ];
    expect(selectTerritoryOwner(null, totals, 3)).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
  });

  it('hashes identical ledgers identically regardless of input order', () => {
    const input = {
      zoneId: '00000000-0000-4000-8000-000000000010',
      seasonId: '00000000-0000-4000-8000-000000000020',
      policyVersion: 'territory-v1',
      kind: 'hourly' as const,
      windowStart: '2026-09-22T08:00:00.000Z',
      windowEnd: '2026-09-22T09:00:00.000Z',
      expectedStateVersion: '7',
      ownerBeforePlayerId: null,
    };
    expect(territorySettlementDigest({ ...input, totals: base })).toBe(
      territorySettlementDigest({ ...input, totals: [...base].reverse() }),
    );
  });
});

describe('territory settlement maintenance transactions', () => {
  it('commits each catch-up window before acquiring locks for the next window', async () => {
    const seasonId = '00000000-0000-4000-8000-000000000020';
    const zoneId = '00000000-0000-4000-8000-000000000010';
    const now = new Date('2026-09-22T10:30:00.000Z');
    const boundary = new Date('2026-09-22T10:00:00.000Z');
    const firstWindowStart = new Date('2026-09-22T08:00:00.000Z');
    let settledCount = 0;
    let connectionCount = 0;
    const receiptInsertsByConnection: number[] = [];

    const database = {
      async connect() {
        const connectionIndex = connectionCount++;
        receiptInsertsByConnection[connectionIndex] = 0;
        return {
          async query(statement: string) {
            if (
              statement === 'begin' ||
              statement === 'commit' ||
              statement === 'rollback' ||
              statement.startsWith('savepoint ') ||
              statement.startsWith('release savepoint ') ||
              statement.startsWith('rollback to savepoint ')
            ) {
              return { rows: [] };
            }
            if (statement.includes('select clock_timestamp() as now')) {
              return { rows: [{ now }] };
            }
            if (
              statement.includes('from public.ranked_seasons') &&
              statement.includes("status in ('active', 'closing')") &&
              statement.includes('limit 1')
            ) {
              return { rows: [{ id: seasonId }] };
            }
            if (
              statement.includes('from public.territory_zones') &&
              statement.includes("status = 'active'") &&
              statement.includes('order by id') &&
              !statement.includes('for update')
            ) {
              return { rows: [{ id: zoneId }] };
            }
            if (
              statement.includes('minimum_ownership_influence') &&
              statement.includes('settlement_cadence')
            ) {
              return {
                rows: [
                  {
                    settlement_cadence_ms: 3_600_000,
                    minimum_ownership_influence: 3,
                    daily_cap_timezone: 'Africa/Johannesburg',
                  },
                ],
              };
            }
            if (
              statement.includes('select minimum_ownership_influence') &&
              statement.includes('from private.territory_policy_versions')
            ) {
              return { rows: [{ minimum_ownership_influence: 3 }] };
            }
            if (
              statement.includes("date_trunc('hour'") &&
              statement.includes('as boundary')
            ) {
              return { rows: [{ boundary }] };
            }
            if (
              statement.includes('latest_receipt as') &&
              statement.includes('as window_start')
            ) {
              return {
                rows: [
                  {
                    window_start: new Date(
                      firstWindowStart.getTime() + settledCount * 3_600_000,
                    ),
                  },
                ],
              };
            }
            if (
              statement.includes(
                'from private.territory_settlement_receipts',
              ) &&
              statement.includes('window_start =') &&
              statement.includes('window_end =')
            ) {
              return { rows: [] };
            }
            if (
              statement.includes('from private.territory_current_ownership') &&
              statement.includes('ownership_version_id')
            ) {
              return {
                rows: [
                  {
                    state_version: String(settledCount),
                    owner_player_id: null,
                  },
                ],
              };
            }
            if (
              statement.includes('select distinct contribution.player_id::text')
            ) {
              return { rows: [] };
            }
            if (
              statement.includes('from public.territory_zones') &&
              statement.includes('for update')
            ) {
              return { rows: [{ id: zoneId }] };
            }
            if (
              statement.includes(
                'count(*)::integer as accepted_influence_count',
              )
            ) {
              return { rows: [] };
            }
            if (
              statement.includes(
                'insert into private.territory_settlement_receipts',
              )
            ) {
              receiptInsertsByConnection[connectionIndex]! += 1;
              settledCount += 1;
              return {
                rows: [
                  {
                    id: `00000000-0000-4000-8000-00000000010${settledCount}`,
                  },
                ],
              };
            }
            throw new Error(
              `Unexpected territory settlement query: ${statement}`,
            );
          },
          release() {},
        };
      },
      async query() {
        return { rows: [] };
      },
    } as unknown as RankedDatabase;

    const result = await maintainTerritorySettlements(database, 2);

    expect(result).toEqual({ settledWindows: 2, finalizedSeason: false });
    expect(connectionCount).toBe(2);
    expect(receiptInsertsByConnection).toEqual([1, 1]);
  });
});
