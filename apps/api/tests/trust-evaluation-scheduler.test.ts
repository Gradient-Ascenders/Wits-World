import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTrustEvaluationScheduler } from '../src/trust/trust-evaluation-scheduler.js';

const EMPTY_PURGE = {
  signalRowsDeleted: 0,
  snapshotRowsDeleted: 0,
  caseRowsDeleted: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('trust evaluation scheduler', () => {
  it('runs evaluation and retention cleanup immediately and on the configured cadence', async () => {
    vi.useFakeTimers();
    const evaluateMaintenanceBatch = vi.fn().mockResolvedValue(7);
    const purgeExpiredData = vi.fn().mockResolvedValue({
      signalRowsDeleted: 3,
      snapshotRowsDeleted: 2,
      caseRowsDeleted: 1,
    });
    const info = vi.fn();
    const warn = vi.fn();
    const scheduler = createTrustEvaluationScheduler(
      { evaluateMaintenanceBatch, purgeExpiredData },
      { info, warn },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();
    expect(purgeExpiredData).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(900_000);
    await scheduler.stop();

    expect(evaluateMaintenanceBatch).toHaveBeenCalledTimes(2);
    expect(purgeExpiredData).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledWith(
      { evaluated: 7 },
      'Trust evaluation maintenance completed',
    );
    expect(info).toHaveBeenCalledWith(
      {
        purged: {
          signalRowsDeleted: 3,
          snapshotRowsDeleted: 2,
          caseRowsDeleted: 1,
        },
      },
      'Trust retention cleanup completed',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not overlap runs and waits for evaluation plus cleanup during shutdown', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const pending = new Promise<number>((resolve) => {
      finish = () => resolve(0);
    });
    const evaluateMaintenanceBatch = vi.fn().mockReturnValue(pending);
    const purgeExpiredData = vi.fn().mockResolvedValue(EMPTY_PURGE);
    const scheduler = createTrustEvaluationScheduler(
      { evaluateMaintenanceBatch, purgeExpiredData },
      { info: vi.fn(), warn: vi.fn() },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_800_000);
    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();
    expect(purgeExpiredData).not.toHaveBeenCalled();

    const stopped = scheduler.stop();
    finish();
    await stopped;

    expect(evaluateMaintenanceBatch).toHaveBeenCalledOnce();
    expect(purgeExpiredData).toHaveBeenCalledOnce();
  });

  it('still runs retention cleanup when evaluation fails without leaking the exception', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const purgeExpiredData = vi.fn().mockResolvedValue(EMPTY_PURGE);
    const scheduler = createTrustEvaluationScheduler(
      {
        evaluateMaintenanceBatch: vi
          .fn()
          .mockRejectedValue(new Error('query contained private context')),
        purgeExpiredData,
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
    expect(purgeExpiredData).toHaveBeenCalledOnce();
  });

  it('logs a privacy-safe cleanup failure without preventing future sweeps', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const purgeExpiredData = vi
      .fn()
      .mockRejectedValueOnce(new Error('private retention context'))
      .mockResolvedValueOnce(EMPTY_PURGE);
    const scheduler = createTrustEvaluationScheduler(
      {
        evaluateMaintenanceBatch: vi.fn().mockResolvedValue(0),
        purgeExpiredData,
      },
      { info: vi.fn(), warn },
      900_000,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith({}, 'Trust retention cleanup failed');

    await vi.advanceTimersByTimeAsync(900_000);
    await scheduler.stop();
    expect(purgeExpiredData).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsafe maintenance interval before scheduling work', () => {
    expect(() =>
      createTrustEvaluationScheduler(
        {
          evaluateMaintenanceBatch: vi.fn(),
          purgeExpiredData: vi.fn(),
        },
        { info: vi.fn(), warn: vi.fn() },
        1_000,
      ),
    ).toThrow(/Trust evaluation interval/u);
  });
});
