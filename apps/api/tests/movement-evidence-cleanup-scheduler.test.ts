import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../src/config/timers.js';
import {
  createMovementEvidenceCleanupScheduler,
  MAX_NODE_TIMER_DELAY_MS,
} from '../src/events/movement-evidence-cleanup-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('movement evidence cleanup scheduler', () => {
  it('accepts the minimum and Node maximum timer delays', () => {
    const service = { purgeExpired: vi.fn().mockResolvedValue(0) };
    const logger = { info: vi.fn(), error: vi.fn() };

    expect(() =>
      createMovementEvidenceCleanupScheduler(
        service,
        logger,
        MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
      ),
    ).not.toThrow();
    expect(() =>
      createMovementEvidenceCleanupScheduler(
        service,
        logger,
        MAX_NODE_TIMER_DELAY_MS,
      ),
    ).not.toThrow();
  });

  it.each([
    MIN_DATABASE_MAINTENANCE_INTERVAL_MS - 1,
    MAX_NODE_TIMER_DELAY_MS + 1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    -1_000,
    1.5,
  ])('rejects the unsafe timer delay %s', (intervalMs) => {
    expect(() =>
      createMovementEvidenceCleanupScheduler(
        { purgeExpired: vi.fn().mockResolvedValue(0) },
        { info: vi.fn(), error: vi.fn() },
        intervalMs,
      ),
    ).toThrow('must be a safe integer between');
  });

  it('runs immediately, repeats idempotently, and logs counts only', async () => {
    vi.useFakeTimers();
    const purgeExpired = vi.fn().mockResolvedValueOnce(2).mockResolvedValue(0);
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const scheduler = createMovementEvidenceCleanupScheduler(
      { purgeExpired },
      logger,
      MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
    );

    scheduler.start();
    await vi.runOnlyPendingTimersAsync();
    await scheduler.stop();

    expect(purgeExpired).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      { deleted: 2 },
      'Expired movement evidence cleanup completed.',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('latitude');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('longitude');
  });

  it('reports a safe error without including the failure or precise data', async () => {
    const failure = new Error('sensitive failure -26.19205,28.03038');
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const scheduler = createMovementEvidenceCleanupScheduler(
      { purgeExpired: vi.fn().mockRejectedValue(failure) },
      logger,
      DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
    );

    scheduler.start();
    await scheduler.stop();

    expect(logger.error).toHaveBeenCalledWith(
      {},
      'Expired movement evidence cleanup failed.',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('-26.19205');
  });
});
