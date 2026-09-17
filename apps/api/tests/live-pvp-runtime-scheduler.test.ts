import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLivePvpRuntimeScheduler } from '../src/matches/live-pvp-runtime-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('live PvP runtime scheduler', () => {
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
