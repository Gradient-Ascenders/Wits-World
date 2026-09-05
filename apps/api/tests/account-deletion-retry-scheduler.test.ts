import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../src/config/timers.js';
import type { AccountDeletionRetryProcessor } from '../src/players/account-deletion-retry-processor.js';
import { createAccountDeletionRetryScheduler } from '../src/players/account-deletion-retry-scheduler.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('account deletion retry scheduler', () => {
  it('runs a retry sweep immediately and periodically', async () => {
    vi.useFakeTimers();

    const runOnce = vi.fn(async () => ({
      attempted: 1,
      completed: 1,
      retryRequired: 0,
      purgedAudits: 0,
    }));

    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const scheduler = createAccountDeletionRetryScheduler(
      createProcessor(runOnce),
      logger,
      {
        intervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS);

    expect(runOnce).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it('does not allow retry sweeps to overlap', async () => {
    vi.useFakeTimers();

    let finishRun: (() => void) | undefined;

    const runOnce = vi.fn(
      () =>
        new Promise<{
          attempted: number;
          completed: number;
          retryRequired: number;
          purgedAudits: number;
        }>((resolve) => {
          finishRun = () =>
            resolve({
              attempted: 1,
              completed: 1,
              retryRequired: 0,
              purgedAudits: 0,
            });
        }),
    );

    const scheduler = createAccountDeletionRetryScheduler(
      createProcessor(runOnce),
      {
        info: vi.fn(),
        error: vi.fn(),
      },
      {
        intervalMs: MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(MIN_DATABASE_MAINTENANCE_INTERVAL_MS * 5);

    expect(runOnce).toHaveBeenCalledTimes(1);

    finishRun?.();

    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(MIN_DATABASE_MAINTENANCE_INTERVAL_MS);

    expect(runOnce).toHaveBeenCalledTimes(2);

    finishRun?.();

    await scheduler.stop();
  });

  it('contains sweep failures and logs no exception details', async () => {
    vi.useFakeTimers();

    const runOnce = vi.fn(async () => {
      throw new Error('sensitive auth0|private-user database detail');
    });

    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const scheduler = createAccountDeletionRetryScheduler(
      createProcessor(runOnce),
      logger,
      {
        intervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    expect(logger.error).toHaveBeenCalledWith(
      {},
      'Account deletion retry sweep failed.',
    );

    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'auth0|private-user',
    );

    await scheduler.stop();
  });

  it('clears future sweeps when stopped', async () => {
    vi.useFakeTimers();

    const runOnce = vi.fn(async () => ({
      attempted: 0,
      completed: 0,
      retryRequired: 0,
      purgedAudits: 0,
    }));

    const scheduler = createAccountDeletionRetryScheduler(
      createProcessor(runOnce),
      {
        info: vi.fn(),
        error: vi.fn(),
      },
      {
        intervalMs: DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await scheduler.stop();

    await vi.advanceTimersByTimeAsync(
      DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS * 3,
    );

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it.each([
    MIN_DATABASE_MAINTENANCE_INTERVAL_MS - 1,
    MAX_NODE_TIMER_DELAY_MS + 1,
    Number.MAX_SAFE_INTEGER,
    1.5,
  ])('rejects the unsafe interval %s', (intervalMs) => {
    expect(() =>
      createAccountDeletionRetryScheduler(
        createProcessor(vi.fn()),
        { info: vi.fn(), error: vi.fn() },
        { intervalMs },
      ),
    ).toThrow('must be a safe integer between');
  });
});

function createProcessor(
  runOnce: AccountDeletionRetryProcessor['runOnce'],
): AccountDeletionRetryProcessor {
  return {
    runOnce,
  };
}
