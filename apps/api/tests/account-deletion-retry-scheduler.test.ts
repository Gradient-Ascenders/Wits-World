import { afterEach, describe, expect, it, vi } from 'vitest';

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
        intervalMs: 60_000,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(60_000);

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
        intervalMs: 1_000,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(runOnce).toHaveBeenCalledTimes(1);

    finishRun?.();

    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_000);

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
        intervalMs: 60_000,
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
        intervalMs: 60_000,
      },
    );

    scheduler.start();

    await vi.waitFor(() => {
      expect(runOnce).toHaveBeenCalledTimes(1);
    });

    await scheduler.stop();

    await vi.advanceTimersByTimeAsync(180_000);

    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});

function createProcessor(
  runOnce: AccountDeletionRetryProcessor['runOnce'],
): AccountDeletionRetryProcessor {
  return {
    runOnce,
  };
}
