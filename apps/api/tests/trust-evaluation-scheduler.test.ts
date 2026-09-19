import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTrustEvaluationScheduler } from '../src/trust/trust-evaluation-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('trust evaluation scheduler', () => {
  it('runs immediately and on the configured cadence with aggregate-only progress', async () => {
    vi.useFakeTimers();
    const evaluateMaintenanceBatch = vi.fn().mockResolvedValue(7);
    const info = vi.fn();
    const warn = vi.fn();
    const scheduler = createTrustEvaluationScheduler(
      { evaluateMaintenanceBatch },
      { info, warn },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(900_000);
    await scheduler.stop();

    expect(evaluateMaintenanceBatch).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenLastCalledWith(
      { evaluated: 7 },
      'Trust evaluation maintenance completed',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not overlap runs and waits for an in-flight run during shutdown', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const evaluateMaintenanceBatch = vi.fn().mockReturnValue(pending);
    const scheduler = createTrustEvaluationScheduler(
      { evaluateMaintenanceBatch },
      { info: vi.fn(), warn: vi.fn() },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();

    const stopped = scheduler.stop();
    finish();
    await stopped;

    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();
  });

  it('logs a privacy-safe maintenance failure without forwarding the exception', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const scheduler = createTrustEvaluationScheduler(
      {
        evaluateMaintenanceBatch: vi
          .fn()
          .mockRejectedValue(new Error('query contained private context')),
      },
      { info: vi.fn(), warn },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();

    expect(warn).toHaveBeenCalledWith(
      {},
      'Trust evaluation maintenance failed',
    );
  });

  it('rejects an unsafe maintenance interval before scheduling work', () => {
    expect(() =>
      createTrustEvaluationScheduler(
        { evaluateMaintenanceBatch: vi.fn() },
        { info: vi.fn(), warn: vi.fn() },
        1_000,
      ),
    ).toThrow(/Trust evaluation interval/u);
  });
});
