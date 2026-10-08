import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';
import type { RankedReadService } from '../src/matches/ranked-read-service.js';
import type { RankedService } from '../src/matches/ranked-service.js';
import { instrumentPool } from '../src/database/pool-observability.js';
import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { GameplayCoordinationUnavailable } from '../src/matches/gameplay-coordination.js';

const maintenance = vi.hoisted(() => ({
  maintainRankedSeasons: vi.fn(),
  cancelExpiredTerritoryContenders: vi.fn(),
  cleanupExpiredTerritoryGrants: vi.fn(),
  maintainTerritorySettlements: vi.fn(),
}));

vi.mock('../src/matches/ranked-season-service.js', () => ({
  maintainRankedSeasons: maintenance.maintainRankedSeasons,
}));
vi.mock('../src/territory/territory-grants.js', () => ({
  TERRITORY_POLICY_VERSION: 'territory-v1',
  cancelExpiredTerritoryContenders:
    maintenance.cancelExpiredTerritoryContenders,
  cleanupExpiredTerritoryGrants: maintenance.cleanupExpiredTerritoryGrants,
}));
vi.mock('../src/territory/territory-settlement.js', () => ({
  maintainTerritorySettlements: maintenance.maintainTerritorySettlements,
}));

import { createRankedScheduler } from '../src/matches/ranked-scheduler.js';

beforeEach(() => {
  vi.resetAllMocks();
  maintenance.maintainRankedSeasons.mockResolvedValue({
    startedClosing: false,
    closedSeason: false,
    activatedSeason: false,
  });
  maintenance.cancelExpiredTerritoryContenders.mockResolvedValue(0);
  maintenance.cleanupExpiredTerritoryGrants.mockResolvedValue(0);
  maintenance.maintainTerritorySettlements.mockResolvedValue({
    settledWindows: 0,
    finalizedSeason: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ranked scheduler', () => {
  it('keeps discovery separate from nested maintenance database acquisitions', async () => {
    vi.useFakeTimers();
    const logger = { info: vi.fn(), error: vi.fn() };
    const pool = Object.assign(new EventEmitter(), {
      options: { max: 4 },
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      connect: async () => ({ release: vi.fn() }),
      end: async () => undefined,
    }) as unknown as pg.Pool;
    instrumentPool(pool, logger);
    const acquire = async () => {
      await Promise.resolve();
      const client = await pool.connect();
      client.release();
      return 0;
    };
    const scheduler = createRankedScheduler(
      pool,
      {
        expireQueueEntries: acquire,
        expireProposals: acquire,
        pairOnce: async () => {
          await acquire();
          return false;
        },
      } as unknown as RankedService,
      { cleanupExpiredSnapshots: acquire } as unknown as RankedReadService,
      logger,
      1000,
      {
        nextSweep: async () => {
          await acquire();
          return false;
        },
      },
    );
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();
    await pool.end();
    const rows = logger.info.mock.calls
      .map(([fields]) => fields)
      .filter((fields) => fields.event === 'operation_summary');
    expect(
      rows.find((fields) => fields.category === 'ranked_probe'),
    ).toMatchObject({ acquisitions_count: 1, holds_completed_count: 1 });
    expect(
      rows.find((fields) => fields.category === 'ranked_maintenance'),
    ).toMatchObject({ acquisitions_count: 4, holds_completed_count: 4 });
    expect(rows.some((fields) => fields.category === 'other')).toBe(false);
  });
  function setup(
    nextSweep = vi.fn().mockResolvedValue(1_800_000),
    coordinatedIdle = false,
  ) {
    const service = {
      expireQueueEntries: vi.fn().mockResolvedValue(0),
      expireProposals: vi.fn().mockResolvedValue(0),
      pairOnce: vi.fn().mockResolvedValue(false),
    };
    const onMatchesCreated = vi.fn();
    const reads = { cleanupExpiredSnapshots: vi.fn().mockResolvedValue(0) };
    const logger = { info: vi.fn(), error: vi.fn() };
    const scheduler = createRankedScheduler(
      {} as RankedDatabase,
      service as unknown as RankedService,
      reads as unknown as RankedReadService,
      logger,
      1000,
      { nextSweep, onMatchesCreated, coordinatedIdle },
    );
    return { scheduler, service, reads, logger, nextSweep, onMatchesCreated };
  }

  it('sleeps without DB probes in coordinated mode, but wakes immediately for shared queue activity', async () => {
    vi.useFakeTimers();
    const { scheduler, nextSweep, service } = setup(undefined, true);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(nextSweep).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(900_000);
    expect(nextSweep).toHaveBeenCalledOnce();
    expect(service.pairOnce).toHaveBeenCalledOnce();
    nextSweep.mockResolvedValue(true);
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.pairOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.pairOnce).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('uses bounded idle recovery and preserves earlier known boundaries in coordinated mode', async () => {
    vi.useFakeTimers();
    const nextSweep = vi
      .fn()
      .mockResolvedValueOnce(600_000)
      .mockResolvedValue(1_800_000);
    const { scheduler } = setup(nextSweep, true);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(599_999);
    expect(nextSweep).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(nextSweep).toHaveBeenCalledTimes(2);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(nextSweep).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('discovers remotely queued players without a wake and skips repeated empty maintenance', async () => {
    vi.useFakeTimers();
    const { scheduler, service, nextSweep, onMatchesCreated } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(service.pairOnce).toHaveBeenCalledOnce();
    expect(nextSweep).toHaveBeenCalledTimes(30);
    // Work committed by another replica must be found before its lease expires.
    service.pairOnce.mockResolvedValueOnce(true);
    nextSweep.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(onMatchesCreated).toHaveBeenCalledOnce();
    const count = service.pairOnce.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.pairOnce.mock.calls.length).toBeGreaterThan(count);
    nextSweep.mockResolvedValue(1_800_000);
    await vi.advanceTimersByTimeAsync(1000);
    const idleCount = service.pairOnce.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(service.pairOnce).toHaveBeenCalledTimes(idleCount);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledOnce();
    nextSweep.mockResolvedValue(true);
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.pairOnce.mock.calls.length).toBeGreaterThan(idleCount);
    await scheduler.stop();
  });

  it('performs territory maintenance at a known boundary even inside the normal cleanup throttle', async () => {
    vi.useFakeTimers();
    const nextSweep = vi
      .fn()
      .mockResolvedValueOnce(1000)
      .mockResolvedValue(1_800_000);
    const { scheduler } = setup(nextSweep);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('drains capped territory catch-up batches before going back to sleep', async () => {
    vi.useFakeTimers();
    maintenance.maintainTerritorySettlements.mockResolvedValueOnce({
      settledWindows: 24,
      finalizedSeason: false,
    });
    const { scheduler, service } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.pairOnce).toHaveBeenCalledTimes(2);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('keeps minute-level housekeeping when empty without forcing it on every probe', async () => {
    vi.useFakeTimers();
    const { scheduler, service, nextSweep } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(nextSweep).toHaveBeenCalledTimes(60);
    expect(service.pairOnce).toHaveBeenCalledOnce();
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(service.pairOnce).toHaveBeenCalledTimes(2);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('processes 20-second proposals and 30-second leases during a Redis outage, then resumes work creation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T08:00:00.000Z'));
    const startedAt = Date.now();
    let pendingProposal = true;
    let pendingLease = true;
    const proposalExpiries: number[] = [];
    const leaseExpiries: number[] = [];
    const nextSweep = vi.fn(async () =>
      pendingProposal || pendingLease ? true : 1_800_000,
    );
    const { scheduler, service, reads, logger, onMatchesCreated } = setup(
      nextSweep,
      true,
    );
    maintenance.maintainRankedSeasons.mockRejectedValue(
      new GameplayCoordinationUnavailable(),
    );
    service.expireProposals.mockImplementation(async () => {
      if (!pendingProposal || Date.now() - startedAt < 20_000) return 0;
      pendingProposal = false;
      proposalExpiries.push(Date.now() - startedAt);
      return 1;
    });
    service.expireQueueEntries.mockImplementation(async () => {
      if (!pendingLease || Date.now() - startedAt < 30_000) return 0;
      pendingLease = false;
      leaseExpiries.push(Date.now() - startedAt);
      return 1;
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(proposalExpiries).toEqual([20_000]);
    expect(leaseExpiries).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(leaseExpiries).toEqual([30_000]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(service.pairOnce).not.toHaveBeenCalled();
    expect(reads.cleanupExpiredSnapshots).toHaveBeenCalledTimes(2);
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledTimes(2);
    expect(maintenance.cancelExpiredTerritoryContenders).toHaveBeenCalledTimes(
      2,
    );
    expect(maintenance.cleanupExpiredTerritoryGrants).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      {},
      'Ranked work creation paused; existing-work maintenance continues.',
    );

    // Recovery must retry creation even if the DB probe now reports idle.
    maintenance.maintainRankedSeasons.mockResolvedValue({
      startedClosing: false,
      closedSeason: false,
      activatedSeason: true,
    });
    service.pairOnce.mockResolvedValueOnce(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onMatchesCreated).toHaveBeenCalledOnce();
    expect(service.pairOnce).toHaveBeenCalledTimes(2);
    const probesAfterRecovery = nextSweep.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(nextSweep).toHaveBeenCalledTimes(probesAfterRecovery);
    await scheduler.stop();
  });

  it('keeps successful pairs and existing-work cleanup when Redis fails mid-pairing', async () => {
    const { scheduler, service, reads, onMatchesCreated } = setup();
    service.pairOnce
      .mockResolvedValueOnce(true)
      .mockRejectedValue(new GameplayCoordinationUnavailable());
    service.expireQueueEntries.mockResolvedValue(1);
    service.expireProposals.mockResolvedValue(2);
    const result = await scheduler.runOnce();
    expect(result).toMatchObject({
      expiredEntries: 1,
      resolvedProposals: 2,
      pairedPlayers: 2,
      workCreationPaused: true,
    });
    expect(onMatchesCreated).toHaveBeenCalledOnce();
    expect(reads.cleanupExpiredSnapshots).toHaveBeenCalledOnce();
    expect(maintenance.maintainTerritorySettlements).toHaveBeenCalledOnce();
  });

  it('does not disguise a pairing database error as a recoverable coordination outage', async () => {
    const { scheduler, service, reads } = setup();
    const failure = Object.assign(new Error('database unavailable'), {
      code: '08006',
    });
    service.pairOnce.mockRejectedValue(failure);
    await expect(scheduler.runOnce()).rejects.toBe(failure);
    expect(service.expireQueueEntries).toHaveBeenCalledOnce();
    expect(service.expireProposals).toHaveBeenCalledOnce();
    expect(reads.cleanupExpiredSnapshots).not.toHaveBeenCalled();
  });

  it('reports one privacy-safe error when interval ticks share a failed run', async () => {
    vi.useFakeTimers();
    let rejectMaintenance!: (error: Error) => void;
    maintenance.maintainRankedSeasons.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectMaintenance = reject;
      }),
    );
    const error = vi.fn();
    const scheduler = createRankedScheduler(
      {} as RankedDatabase,
      {} as RankedService,
      {} as RankedReadService,
      { info: vi.fn(), error },
      250,
      { nextSweep: vi.fn().mockResolvedValue(true) },
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(maintenance.maintainRankedSeasons).toHaveBeenCalledOnce();

    rejectMaintenance(
      Object.assign(new Error('query contained private context'), {
        code: '42601',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      { databaseErrorCode: '42601' },
      'Ranked maintenance sweep failed.',
    );
  });
});
