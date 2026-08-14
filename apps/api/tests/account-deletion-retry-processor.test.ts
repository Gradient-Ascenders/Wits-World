import { describe, expect, it, vi } from 'vitest';

import type {
  AccountDeletionLifecycle,
  AccountDeletionWorkItem,
} from '../src/players/account-deletion-lifecycle.js';
import { createAccountDeletionRetryProcessor } from '../src/players/account-deletion-retry-processor.js';

const firstWorkItem: AccountDeletionWorkItem = {
  deletionId: '00000000-0000-4000-8000-000000000401',
  identity: {
    issuer: 'https://auth.example.test/',
    subject: 'auth0|retry-player-one',
  },
  status: 'retry_pending',
};

const secondWorkItem: AccountDeletionWorkItem = {
  deletionId: '00000000-0000-4000-8000-000000000402',
  identity: {
    issuer: 'https://auth.example.test/',
    subject: 'auth0|retry-player-two',
  },
  status: 'pending',
};

describe('account deletion retry processor', () => {
  it('retries processable deletions and completes local cleanup', async () => {
    const deleteUser = vi.fn(async () => undefined);
    const complete = vi.fn(async () => completedRequest());
    const purgeExpiredCompleted = vi.fn(async () => 2);

    const processor = createAccountDeletionRetryProcessor(
      {
        deleteUser,
      },
      createLifecycle({
        listProcessable: async () => [firstWorkItem, secondWorkItem],
        complete,
        purgeExpiredCompleted,
      }),
      {
        error: vi.fn(),
      },
    );

    await expect(processor.runOnce()).resolves.toEqual({
      attempted: 2,
      completed: 2,
      retryRequired: 0,
      purgedAudits: 2,
    });

    expect(deleteUser).toHaveBeenNthCalledWith(
      1,
      firstWorkItem.identity.subject,
    );
    expect(deleteUser).toHaveBeenNthCalledWith(
      2,
      secondWorkItem.identity.subject,
    );

    expect(complete).toHaveBeenNthCalledWith(1, firstWorkItem.deletionId);
    expect(complete).toHaveBeenNthCalledWith(2, secondWorkItem.deletionId);

    expect(purgeExpiredCompleted).toHaveBeenCalledTimes(1);
  });

  it('keeps processing later deletions when Auth0 deletion fails', async () => {
    const deleteUser = vi
      .fn()
      .mockRejectedValueOnce(new Error('sensitive Auth0 failure'))
      .mockResolvedValueOnce(undefined);

    const markRetryPending = vi.fn(async () => retryRequest());
    const complete = vi.fn(async () => completedRequest());

    const logger = {
      error: vi.fn(),
    };

    const processor = createAccountDeletionRetryProcessor(
      {
        deleteUser,
      },
      createLifecycle({
        listProcessable: async () => [firstWorkItem, secondWorkItem],
        markRetryPending,
        complete,
      }),
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      attempted: 2,
      completed: 1,
      retryRequired: 1,
      purgedAudits: 0,
    });

    expect(markRetryPending).toHaveBeenCalledWith(
      firstWorkItem.deletionId,
      'auth0_deletion_failed',
    );

    expect(complete).toHaveBeenCalledWith(secondWorkItem.deletionId);

    expect(logger.error).toHaveBeenCalledWith(
      {
        deletionId: firstWorkItem.deletionId,
        failureReason: 'auth0_deletion_failed',
      },
      'Account deletion automatic retry failed.',
    );

    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'sensitive Auth0 failure',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      firstWorkItem.identity.subject,
    );
  });

  it('records local cleanup failure after Auth0 deletion succeeds', async () => {
    const complete = vi.fn(async () => {
      throw new Error('sensitive database failure');
    });

    const markRetryPending = vi.fn(async () => ({
      ...retryRequest(),
      failureReason: 'local_cleanup_failed' as const,
    }));

    const logger = {
      error: vi.fn(),
    };

    const processor = createAccountDeletionRetryProcessor(
      {
        deleteUser: vi.fn(async () => undefined),
      },
      createLifecycle({
        listProcessable: async () => [firstWorkItem],
        complete,
        markRetryPending,
      }),
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      attempted: 1,
      completed: 0,
      retryRequired: 1,
      purgedAudits: 0,
    });

    expect(markRetryPending).toHaveBeenCalledWith(
      firstWorkItem.deletionId,
      'local_cleanup_failed',
    );

    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'sensitive database failure',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      firstWorkItem.identity.subject,
    );
  });

  it('continues safely when retry state persistence also fails', async () => {
    const logger = {
      error: vi.fn(),
    };

    const processor = createAccountDeletionRetryProcessor(
      {
        deleteUser: vi.fn(async () => {
          throw new Error('provider unavailable');
        }),
      },
      createLifecycle({
        listProcessable: async () => [firstWorkItem],
        markRetryPending: vi.fn(async () => {
          throw new Error('database unavailable');
        }),
      }),
      logger,
    );

    await expect(processor.runOnce()).resolves.toEqual({
      attempted: 1,
      completed: 0,
      retryRequired: 1,
      purgedAudits: 0,
    });

    expect(logger.error).toHaveBeenCalledTimes(2);

    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      {
        deletionId: firstWorkItem.deletionId,
        failureReason: 'auth0_deletion_failed',
      },
      'Account deletion retry state could not be persisted.',
    );
  });

  it('uses the configured bounded batch size', async () => {
    const listProcessable = vi.fn(async () => []);

    const processor = createAccountDeletionRetryProcessor(
      {
        deleteUser: vi.fn(),
      },
      createLifecycle({
        listProcessable,
      }),
      {
        error: vi.fn(),
      },
      {
        batchSize: 10,
      },
    );

    await processor.runOnce();

    expect(listProcessable).toHaveBeenCalledWith(10);
  });
});

function createLifecycle(
  overrides: Partial<AccountDeletionLifecycle> = {},
): AccountDeletionLifecycle {
  return {
    request: async () => pendingRequest(),
    markRetryPending: async () => retryRequest(),
    complete: async () => completedRequest(),
    listProcessable: async () => [],
    purgeExpiredCompleted: async () => 0,
    ...overrides,
  };
}

function pendingRequest() {
  return {
    id: firstWorkItem.deletionId,
    requestedAt: new Date('2026-08-14T03:00:00.000Z'),
    completedAt: null,
    status: 'pending' as const,
    failureReason: null,
  };
}

function retryRequest() {
  return {
    ...pendingRequest(),
    status: 'retry_pending' as const,
    failureReason: 'auth0_deletion_failed' as const,
  };
}

function completedRequest() {
  return {
    ...pendingRequest(),
    completedAt: new Date('2026-08-14T03:10:00.000Z'),
    status: 'completed' as const,
    failureReason: null,
  };
}
