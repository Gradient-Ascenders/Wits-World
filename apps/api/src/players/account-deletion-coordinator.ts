import type { Auth0ManagementClient } from '../auth/auth0-management-client.js';
import type { ReauthenticationTokenVerifier } from '../auth/reauthentication-token-verifier.js';
import type { AuthenticatedIdentity } from '../auth/types.js';
import type { AccountDeletionLifecycle } from './account-deletion-lifecycle.js';
import type { AccountDeletionFailureReason } from './types.js';

export const PERMANENT_DELETION_CONFIRMATION = 'DELETE_MY_ACCOUNT';

export type AccountDeletionCoordinatorErrorCode =
  'recent_authentication_required' | 'permanent_deletion_confirmation_required';

export class AccountDeletionCoordinatorError extends Error {
  readonly code: AccountDeletionCoordinatorErrorCode;

  constructor(code: AccountDeletionCoordinatorErrorCode) {
    super(messageForCode(code));
    this.name = 'AccountDeletionCoordinatorError';
    this.code = code;
  }
}

export interface AccountDeletionOutcome {
  deletionId: string;
  status: 'completed' | 'retry_pending';
}

export interface AccountDeletionCoordinator {
  deleteAccount(input: {
    identity: AuthenticatedIdentity;
    reauthenticationToken: string;
    confirmation: string;
  }): Promise<AccountDeletionOutcome>;
}

export interface AccountDeletionOperationalLogger {
  error(
    context: {
      deletionId: string;
      failureReason: AccountDeletionFailureReason;
    },
    message: string,
  ): void;
}

export function createAccountDeletionCoordinator(
  reauthenticationVerifier: ReauthenticationTokenVerifier,
  managementClient: Auth0ManagementClient,
  lifecycle: AccountDeletionLifecycle,
  operationalLogger: AccountDeletionOperationalLogger,
): AccountDeletionCoordinator {
  async function recordRetry(
    deletionId: string,
    failureReason: AccountDeletionFailureReason,
  ): Promise<AccountDeletionOutcome> {
    operationalLogger.error(
      {
        deletionId,
        failureReason,
      },
      'Account deletion requires automatic retry.',
    );

    const retryState = await lifecycle.markRetryPending(
      deletionId,
      failureReason,
    );

    return {
      deletionId: retryState.id,
      status: 'retry_pending',
    };
  }

  return {
    async deleteAccount({ identity, reauthenticationToken, confirmation }) {
      if (confirmation !== PERMANENT_DELETION_CONFIRMATION) {
        throw new AccountDeletionCoordinatorError(
          'permanent_deletion_confirmation_required',
        );
      }

      let proof;

      try {
        proof = await reauthenticationVerifier.verify(reauthenticationToken);
      } catch {
        throw new AccountDeletionCoordinatorError(
          'recent_authentication_required',
        );
      }

      if (
        proof.identity.issuer !== identity.issuer ||
        proof.identity.subject !== identity.subject
      ) {
        throw new AccountDeletionCoordinatorError(
          'recent_authentication_required',
        );
      }

      const deletionRequest = await lifecycle.request(identity);

      try {
        await managementClient.deleteUser(identity.subject);
      } catch {
        return recordRetry(deletionRequest.id, 'auth0_deletion_failed');
      }

      try {
        const completed = await lifecycle.complete(deletionRequest.id);

        return {
          deletionId: completed.id,
          status: 'completed',
        };
      } catch {
        return recordRetry(deletionRequest.id, 'local_cleanup_failed');
      }
    },
  };
}

function messageForCode(code: AccountDeletionCoordinatorErrorCode): string {
  switch (code) {
    case 'recent_authentication_required':
      return 'Recent authentication is required for permanent account deletion.';
    case 'permanent_deletion_confirmation_required':
      return 'Explicit permanent account deletion confirmation is required.';
  }
}
