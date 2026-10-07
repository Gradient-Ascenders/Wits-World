import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLivePvpRuntimeScheduler } from '../src/matches/live-pvp-runtime-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('live PvP runtime scheduler', () => {
  it('discovers a remote match without a local wake while skipping empty deadline processing', async () => {
    vi.useFakeTimers();
    const hasActiveWork = vi.fn().mockResolvedValue(false);
    const onWorkState = vi.fn().mockResolvedValue(undefined);
    const runOnce = vi.fn().mockResolvedValue({
      matchesScanned: 0,
      transitionsCommitted: 0,
      failures: 0,
    });
    const scheduler = createLivePvpRuntimeScheduler(
      { runOnce },
      {
        purgeTransientAccess: vi
          .fn()
          .mockResolvedValue({ accessRowsDeleted: 0, ticketRowsDeleted: 0 }),
      },
      { info: vi.fn(), error: vi.fn() },
      {
        deadlineSweepIntervalMs: 1000,
        transientCleanupIntervalMs: 1_800_000,
        hasActiveWork,
        onWorkState,
      },
    );
    scheduler.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(hasActiveWork).toHaveBeenCalledOnce();
    expect(runOnce).not.toHaveBeenCalled();
    expect(onWorkState).toHaveBeenLastCalledWith(false);

    // A different replica commits a match and crashes before sending a wake.
    hasActiveWork.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(runOnce).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runOnce).toHaveBeenCalledTimes(2);

    hasActiveWork.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onWorkState).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hasActiveWork).toHaveBeenCalledTimes(5);
    expect(runOnce).toHaveBeenCalledTimes(2);
    hasActiveWork.mockResolvedValue(true);
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(runOnce).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('retries failed work probes at the active cadence instead of hiding them in idle sleep', async () => {
    vi.useFakeTimers();
    const hasActiveWork = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(false);
    const error = vi.fn();
    const scheduler = createLivePvpRuntimeScheduler(
      { runOnce: vi.fn() },
      {
        purgeTransientAccess: vi
          .fn()
          .mockResolvedValue({ accessRowsDeleted: 0, ticketRowsDeleted: 0 }),
      },
      { info: vi.fn(), error },
      {
        deadlineSweepIntervalMs: 1000,
        transientCleanupIntervalMs: 1_800_000,
        hasActiveWork,
      },
    );
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledOnce();
    expect(hasActiveWork).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hasActiveWork).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('runs deadline and cleanup work immediately and repeatedly without overlap', async () => {
    vi.useFakeTimers();
    let releaseDeadline!: () => void;
    const firstDeadline = new Promise<void>((resolve) => {
      releaseDeadline = resolve;
    });
    const runOnce = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstDeadline;
        return { matchesScanned: 1, transitionsCommitted: 1, failures: 0 };
      })
      .mockResolvedValue({
        matchesScanned: 0,
        transitionsCommitted: 0,
        failures: 0,
      });
    const purgeTransientAccess = vi.fn().mockResolvedValue({
      accessRowsDeleted: 0,
      ticketRowsDeleted: 0,
    });
    const scheduler = createLivePvpRuntimeScheduler(
      { runOnce },
      { purgeTransientAccess },
      { info: vi.fn(), error: vi.fn() },
      { deadlineSweepIntervalMs: 250, transientCleanupIntervalMs: 60_000 },
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(750);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(purgeTransientAccess).toHaveBeenCalledTimes(1);

    releaseDeadline();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(runOnce.mock.calls.length).toBeGreaterThanOrEqual(2);

    await scheduler.stop();
  });
});
