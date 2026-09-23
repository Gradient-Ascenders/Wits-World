import { afterEach, describe, expect, it, vi } from 'vitest';

import { MIN_DATABASE_MAINTENANCE_INTERVAL_MS } from '../src/config/timers.js';
import { createCardTradeMaintenanceScheduler } from '../src/trading/card-trade-maintenance-scheduler.js';

describe('card trade maintenance scheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('runs expiry and retention immediately and then on the configured interval', async () => {
    vi.useFakeTimers();
    const expireDueTrades = vi.fn().mockResolvedValue(2);
    const purgeTerminalTrades = vi.fn().mockResolvedValue(1);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const scheduler = createCardTradeMaintenanceScheduler(
      { expireDueTrades, purgeTerminalTrades },
      logger,
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    );

    scheduler.start();
    await vi.runAllTicks();
    await Promise.resolve();
    await Promise.resolve();
    expect(expireDueTrades).toHaveBeenCalledTimes(1);
    expect(purgeTerminalTrades).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MIN_DATABASE_MAINTENANCE_INTERVAL_MS);
    expect(expireDueTrades).toHaveBeenCalledTimes(2);
    expect(purgeTerminalTrades).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it('rejects unsafe maintenance intervals', () => {
    expect(() =>
      createCardTradeMaintenanceScheduler(
        {
          expireDueTrades: vi.fn(),
          purgeTerminalTrades: vi.fn(),
        },
        { info: vi.fn(), warn: vi.fn() },
        1,
      ),
    ).toThrow('Card trade maintenance interval must be a safe integer between');
  });

  it('does not overlap slow maintenance runs', async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const expireDueTrades = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0);
        }),
    );
    const purgeTerminalTrades = vi.fn().mockResolvedValue(0);
    const scheduler = createCardTradeMaintenanceScheduler(
      { expireDueTrades, purgeTerminalTrades },
      { info: vi.fn(), warn: vi.fn() },
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    );

    scheduler.start();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(MIN_DATABASE_MAINTENANCE_INTERVAL_MS);
    expect(expireDueTrades).toHaveBeenCalledTimes(1);

    release?.();
    await Promise.resolve();
    await Promise.resolve();
    await scheduler.stop();
  });
});
