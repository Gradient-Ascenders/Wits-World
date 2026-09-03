import { afterEach, describe, expect, it, vi } from 'vitest';

import { MIN_DATABASE_MAINTENANCE_INTERVAL_MS } from '../src/config/timers.js';
import { createAsyncPvpDeadlineScheduler } from '../src/matches/asynchronous-pvp-deadline-scheduler.js';

afterEach(() => vi.useRealTimers());

describe('asynchronous PvP deadline scheduler', () => {
  it('runs immediately, prevents overlap, repeats, and waits during stop', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runOnce = vi
      .fn()
      .mockImplementationOnce(async () => {
        await first;
        return { invitationsExpired: 1, matchesForfeited: 1, failures: 0 };
      })
      .mockResolvedValue({
        invitationsExpired: 0,
        matchesForfeited: 0,
        failures: 0,
      });
    const logger = { info: vi.fn(), error: vi.fn() };
    const scheduler = createAsyncPvpDeadlineScheduler(
      { runOnce },
      logger,
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(MIN_DATABASE_MAINTENANCE_INTERVAL_MS * 3);
    expect(runOnce).toHaveBeenCalledTimes(1);

    const stopped = scheduler.stop();
    let stopFinished = false;
    void stopped.then(() => {
      stopFinished = true;
    });
    await Promise.resolve();
    expect(stopFinished).toBe(false);
    release?.();
    await stopped;
    expect(logger.info).toHaveBeenCalledWith(
      { invitationsExpired: 1, matchesForfeited: 1, failures: 0 },
      'Asynchronous PvP deadline sweep completed.',
    );
  });

  it('rejects unsafe intervals and contains processor errors', async () => {
    expect(() =>
      createAsyncPvpDeadlineScheduler(
        { runOnce: vi.fn() },
        { info: vi.fn(), error: vi.fn() },
        MIN_DATABASE_MAINTENANCE_INTERVAL_MS - 1,
      ),
    ).toThrow('safe integer between');

    vi.useFakeTimers();
    const logger = { info: vi.fn(), error: vi.fn() };
    const scheduler = createAsyncPvpDeadlineScheduler(
      { runOnce: vi.fn().mockRejectedValue(new Error('private state')) },
      logger,
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    );
    scheduler.start();
    await vi.runOnlyPendingTimersAsync();
    await scheduler.stop();
    expect(logger.error).toHaveBeenCalledWith(
      {},
      'Asynchronous PvP deadline sweep failed.',
    );
  });
});
