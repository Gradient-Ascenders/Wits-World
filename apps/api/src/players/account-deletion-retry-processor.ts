import type { Auth0ManagementClient } from '../auth/auth0-management-client.js';
import type { AccountDeletionLifecycle } from './account-deletion-lifecycle.js';
import type { AccountDeletionOperationalLogger } from './account-deletion-coordinator.js';
import type { AccountDeletionFailureReason } from './types.js';

const DEFAULT_BATCH_SIZE = 25;

export interface AccountDeletionRetryResult {
  attempted: number;
  completed: number;
  retryRequired: number;
  purgedAudits: number;
}

export interface AccountDeletionRetryProcessor {
  runOnce(): Promise<AccountDeletionRetryResult>;
}

interface CreateAccountDeletionRetryProcessorOptions {
  batchSize?: number;
}

export function createAccountDeletionRetryProcessor(
  managementClient: Auth0ManagementClient,
  lifecycle: AccountDeletionLifecycle,
  operationalLogger: AccountDeletionOperationalLogger,
  {
    batchSize = DEFAULT_BATCH_SIZE,
  }: CreateAccountDeletionRetryProcessorOptions = {},
): AccountDeletionRetryProcessor {
  return {
    async runOnce() {
      const workItems = await lifecycle.listProcessable(batchSize);

      let completed = 0;
      let retryRequired = 0;

      for (const workItem of workItems) {
        try {
          await managementClient.deleteUser(workItem.identity.subject);
        } catch {
          retryRequired += 1;

          await recordFailure(
            lifecycle,
            operationalLogger,
            workItem.deletionId,
            'auth0_deletion_failed',
          );

          continue;
        }

        try {
          await lifecycle.complete(workItem.deletionId);
          completed += 1;
        } catch {
          retryRequired += 1;

          await recordFailure(
            lifecycle,
            operationalLogger,
            workItem.deletionId,
            'local_cleanup_failed',
          );
        }
      }

      const purgedAudits = await lifecycle.purgeExpiredCompleted();

      return {
        attempted: workItems.length,
        completed,
        retryRequired,
        purgedAudits,
      };
    },
  };
}

async function recordFailure(
  lifecycle: AccountDeletionLifecycle,
  operationalLogger: AccountDeletionOperationalLogger,
  deletionId: string,
  failureReason: AccountDeletionFailureReason,
): Promise<void> {
  operationalLogger.error(
    {
      deletionId,
      failureReason,
    },
    'Account deletion automatic retry failed.',
  );

  try {
    await lifecycle.markRetryPending(deletionId, failureReason);
  } catch {
    operationalLogger.error(
      {
        deletionId,
        failureReason,
      },
      'Account deletion retry state could not be persisted.',
    );
  }
}
