import { describe, expect, it, vi } from 'vitest';

import type {
  RankedClient,
  RankedDatabase,
} from '../src/matches/ranked-database.js';
import {
  createGameplayExistingWorkGuard,
  GameplayCoordinationUnavailable,
} from '../src/matches/gameplay-coordination.js';

import {
  maintainTerritorySettlements,
  selectTerritoryOwner,
  settleTerritoryWindow,
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
  it('commits fenced catch-up windows independently even when the producer guard is unavailable', async () => {
    const seasonId = '00000000-0000-4000-8000-000000000020';
    const zoneId = '00000000-0000-4000-8000-000000000010';
    const now = new Date('2026-09-22T10:30:00.000Z');
    const boundary = new Date('2026-09-22T10:00:00.000Z');
    const firstWindowStart = new Date('2026-09-22T08:00:00.000Z');
    let settledCount = 0;
    let connectionCount = 0;
    const receiptInsertsByConnection: number[] = [];
    let policyLoads = 0;
    let duplicatePolicyReads = 0;
    let releases = 0;
    let existingWorkFences = 0;
    const beginProduction = vi
      .fn()
      .mockRejectedValue(new GameplayCoordinationUnavailable());

    const database = {
      activityGuard: { begin: beginProduction },
      existingWorkGuard: createGameplayExistingWorkGuard('ranked'),
      async connect() {
        const connectionIndex = connectionCount++;
        receiptInsertsByConnection[connectionIndex] = 0;
        return {
          async query(statement: string) {
            if (statement === 'select pg_advisory_xact_lock_shared($1, $2)') {
              existingWorkFences += 1;
              return { rows: [] };
            }
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
              policyLoads += 1;
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
              duplicatePolicyReads += 1;
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
          release() {
            releases += 1;
          },
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
    expect(policyLoads).toBe(2);
    expect(duplicatePolicyReads).toBe(0);
    expect(releases).toBe(2);
    expect(existingWorkFences).toBe(2);
    expect(beginProduction).not.toHaveBeenCalled();
  });
});

const settlementInput = {
  zoneId: '00000000-0000-4000-8000-000000000010',
  seasonId: '00000000-0000-4000-8000-000000000020',
  windowStart: new Date('2026-09-22T09:00:00.000Z'),
  windowEnd: new Date('2026-09-22T10:00:00.000Z'),
  kind: 'hourly' as const,
};

// Model the query boundaries of one due window per zone. PostgreSQL integration
// coverage separately exercises the actual receipts, constraints and rollback.
function settlementDatabase(counts = [3]) {
  const zoneIds = counts.map(
    (_, index) =>
      `00000000-0000-4000-8000-${String(10 + index).padStart(12, '0')}`,
  );
  const receipts = new Map<
    string,
    { id: string; owner_after_player_id: unknown; input_digest: unknown }
  >();
  const state = {
    minimumInfluence: 3,
    missingPolicy: false,
    noOp: false,
    failure: undefined as Error | undefined,
    retry: false,
  };
  const releases: ReturnType<typeof vi.fn>[] = [];
  const query = vi.fn(async (statement: string, values: unknown[] = []) => {
    if (/^(begin|commit|rollback|savepoint|release savepoint)/u.test(statement))
      return { rows: [] };
    if (statement.includes('select clock_timestamp() as now'))
      return { rows: [{ now: new Date('2026-09-22T10:30:00.000Z') }] };
    if (
      statement.includes('from public.ranked_seasons') &&
      statement.includes('limit 1')
    )
      return { rows: [{ id: settlementInput.seasonId }] };
    if (statement.includes('settlement_cadence'))
      return {
        rows: state.missingPolicy
          ? []
          : [
              {
                settlement_cadence_ms: 3_600_000,
                minimum_ownership_influence: state.minimumInfluence,
                daily_cap_timezone: 'Africa/Johannesburg',
              },
            ],
      };
    if (statement.includes('select minimum_ownership_influence'))
      return {
        rows: state.missingPolicy
          ? []
          : [{ minimum_ownership_influence: state.minimumInfluence }],
      };
    if (statement.includes('as boundary'))
      return { rows: [{ boundary: settlementInput.windowEnd }] };
    if (statement.includes('latest_receipt as'))
      return {
        rows: [
          {
            window_start:
              state.noOp || receipts.has(String(values[0]))
                ? settlementInput.windowEnd
                : settlementInput.windowStart,
          },
        ],
      };
    if (statement.includes('from private.territory_settlement_receipts')) {
      const prior = receipts.get(String(values[0]));
      return {
        rows: prior ? [{ ...prior, owner_before_player_id: null }] : [],
      };
    }
    if (statement.includes('from private.territory_current_ownership'))
      return { rows: [{ state_version: '0', owner_player_id: null }] };
    if (statement.includes('select distinct contribution.player_id'))
      return { rows: [{ player_id: base[0]!.playerId }] };
    if (statement.includes('from public.players'))
      return { rows: [{ id: base[0]!.playerId }] };
    if (statement.includes('from public.territory_zones'))
      return { rows: zoneIds.map((id) => ({ id })) };
    if (statement.includes('count(*)::integer as accepted_influence_count'))
      return {
        rows: [
          {
            player_id: base[0]!.playerId,
            accepted_influence_count:
              counts[zoneIds.indexOf(String(values[0]))],
            earliest_contribution_at: base[0]!.earliestContributionAt,
            earliest_contribution_key: base[0]!.earliestContributionKey,
            account_eligible: true,
          },
        ],
      };
    if (
      statement.includes('insert into private.territory_settlement_receipts')
    ) {
      if (state.failure) throw state.failure;
      if (state.retry) {
        state.retry = false;
        throw Object.assign(new Error('serialization retry'), {
          code: '40001',
        });
      }
      const receipt = {
        id: `receipt-${values[0]}`,
        owner_after_player_id: values[8],
        input_digest: values[9],
      };
      receipts.set(String(values[0]), receipt);
      return { rows: [{ id: receipt.id }] };
    }
    if (statement.includes('insert into private.territory_settlement_totals'))
      return { rows: [] };
    throw new Error('Unexpected settlement fixture query.');
  });
  const database = {
    connect: vi.fn(async () => {
      const release = vi.fn();
      releases.push(release);
      return { query, release };
    }),
    query,
  } as unknown as RankedDatabase;
  return { database, query, state, receipts, releases };
}

describe('operation-scoped territory policy reuse', () => {
  it('loads the policy for a no-op operation without creating a receipt', async () => {
    const fixture = settlementDatabase();
    fixture.state.noOp = true;
    expect(await maintainTerritorySettlements(fixture.database)).toEqual({
      settledWindows: 0,
      finalizedSeason: false,
    });
    expect(
      fixture.query.mock.calls.filter(([sql]) =>
        sql.includes('settlement_cadence'),
      ),
    ).toHaveLength(1);
    expect(
      fixture.query.mock.calls.some(([sql]) =>
        sql.includes('select minimum_ownership_influence'),
      ),
    ).toBe(false);
    expect(fixture.receipts.size).toBe(0);
    expect(fixture.releases[0]).toHaveBeenCalledOnce();
  });

  it.each([3, 5])(
    'uses authoritative minimum %i for multiple zones below, at and above the boundary',
    async (minimum) => {
      const fixture = settlementDatabase([minimum - 1, minimum, minimum + 1]);
      // Five models a different authoritative versioned policy value, not a
      // runtime override of the immutable territory-v1 row.
      fixture.state.minimumInfluence = minimum;
      expect(
        (await maintainTerritorySettlements(fixture.database, 3))
          .settledWindows,
      ).toBe(3);
      expect(
        [...fixture.receipts.values()].map(
          (receipt) => receipt.owner_after_player_id,
        ),
      ).toEqual([null, base[0]!.playerId, base[0]!.playerId]);
      expect(
        fixture.query.mock.calls.filter(([sql]) =>
          sql.includes('settlement_cadence'),
        ),
      ).toHaveLength(3);
      expect(
        fixture.query.mock.calls.some(([sql]) =>
          sql.includes('select minimum_ownership_influence'),
        ),
      ).toBe(false);
      expect(
        fixture.query.mock.calls.filter(([sql]) => sql === 'commit'),
      ).toHaveLength(3);
      for (const release of fixture.releases)
        expect(release).toHaveBeenCalledOnce();
    },
  );

  it('reloads policy on a subsequent sweep and does not resettle an existing window', async () => {
    const fixture = settlementDatabase();
    await maintainTerritorySettlements(fixture.database, 1);
    const prior = [...fixture.receipts.values()];
    expect(
      (await maintainTerritorySettlements(fixture.database, 1)).settledWindows,
    ).toBe(0);
    expect([...fixture.receipts.values()]).toEqual(prior);
    expect(
      fixture.query.mock.calls.filter(([sql]) =>
        sql.includes('settlement_cadence'),
      ),
    ).toHaveLength(2);
    expect(fixture.releases).toHaveLength(2);
    for (const release of fixture.releases)
      expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases a failed operation, then loads policy afresh on recovery', async () => {
    const fixture = settlementDatabase();
    fixture.state.failure = new Error('receipt write failed');
    await expect(
      maintainTerritorySettlements(fixture.database, 1),
    ).rejects.toThrow('receipt write failed');
    expect(fixture.query.mock.calls.map(([sql]) => sql)).toContain(
      'rollback to savepoint territory_settle_0',
    );
    expect(fixture.query.mock.calls.map(([sql]) => sql)).toContain('rollback');
    expect(fixture.query.mock.calls.map(([sql]) => sql)).not.toContain(
      'commit',
    );
    expect(fixture.receipts.size).toBe(0);
    expect(fixture.releases[0]).toHaveBeenCalledOnce();
    fixture.state.failure = undefined;
    fixture.state.minimumInfluence = 5;
    expect(
      (await maintainTerritorySettlements(fixture.database, 1)).settledWindows,
    ).toBe(1);
    expect([...fixture.receipts.values()][0]?.owner_after_player_id).toBeNull();
    expect(
      fixture.query.mock.calls.filter(([sql]) =>
        sql.includes('settlement_cadence'),
      ),
    ).toHaveLength(2);
    expect(fixture.releases[1]).toHaveBeenCalledOnce();
  });

  it('reuses the operation policy through a savepoint retry', async () => {
    const fixture = settlementDatabase();
    fixture.state.retry = true;
    expect(
      (await maintainTerritorySettlements(fixture.database, 1)).settledWindows,
    ).toBe(1);
    expect(fixture.query.mock.calls.map(([sql]) => sql)).toContain(
      'savepoint territory_settle_1',
    );
    expect(
      fixture.query.mock.calls.filter(([sql]) =>
        sql.includes('settlement_cadence'),
      ),
    ).toHaveLength(1);
    expect(
      fixture.query.mock.calls.some(([sql]) =>
        sql.includes('select minimum_ownership_influence'),
      ),
    ).toBe(false);
    expect(fixture.releases[0]).toHaveBeenCalledOnce();
  });

  it('retains the standalone lookup and the existing-receipt fast path', async () => {
    const fixture = settlementDatabase();
    const client = await fixture.database.connect();
    try {
      const first = await settleTerritoryWindow(client as RankedClient, {
        ...settlementInput,
        policyVersion: 'territory-v1',
      });
      expect(
        await settleTerritoryWindow(client as RankedClient, settlementInput),
      ).toEqual(first);
      expect(
        fixture.query.mock.calls.filter(([sql]) =>
          sql.includes('select minimum_ownership_influence'),
        ),
      ).toEqual([[expect.any(String), ['territory-v1']]]);
      expect(
        fixture.query.mock.calls.some(([sql]) =>
          sql.includes('settlement_cadence'),
        ),
      ).toBe(false);
    } finally {
      client.release();
    }
  });

  it.each(['operation', 'standalone'])(
    'preserves the missing-policy error for %s callers',
    async (caller) => {
      const fixture = settlementDatabase();
      fixture.state.missingPolicy = true;
      if (caller === 'operation') {
        await expect(
          maintainTerritorySettlements(fixture.database, 1),
        ).rejects.toThrow('Territory settlement policy is unavailable.');
        expect(fixture.query.mock.calls.map(([sql]) => sql)).toContain(
          'rollback',
        );
      } else {
        const client = await fixture.database.connect();
        try {
          await expect(
            settleTerritoryWindow(client, settlementInput),
          ).rejects.toThrow('Territory settlement policy is unavailable.');
        } finally {
          client.release();
        }
      }
      expect(fixture.receipts.size).toBe(0);
      expect(fixture.releases[0]).toHaveBeenCalledOnce();
    },
  );
});
