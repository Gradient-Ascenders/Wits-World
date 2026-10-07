import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RankedDatabase } from '../src/matches/ranked-database.js';
import type { RankedReadService } from '../src/matches/ranked-read-service.js';
import type { RankedService } from '../src/matches/ranked-service.js';

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
    const scheduler = createRankedScheduler(
      {} as RankedDatabase,
      service as unknown as RankedService,
      {
        cleanupExpiredSnapshots: vi.fn().mockResolvedValue(0),
      } as unknown as RankedReadService,
      { info: vi.fn(), error: vi.fn() },
      1000,
      { nextSweep, onMatchesCreated, coordinatedIdle },
    );
    return { scheduler, service, nextSweep, onMatchesCreated };
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
