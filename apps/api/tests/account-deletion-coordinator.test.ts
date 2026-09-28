import { describe, expect, it, vi } from 'vitest';

import type { Auth0ManagementClient } from '../src/auth/auth0-management-client.js';
import type { ReauthenticationTokenVerifier } from '../src/auth/reauthentication-token-verifier.js';
import type { AuthenticatedIdentity } from '../src/auth/types.js';
import type { AccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import {
  AccountDeletionCoordinatorError,
  createAccountDeletionCoordinator,
  PERMANENT_DELETION_CONFIRMATION,
} from '../src/players/account-deletion-coordinator.js';
import type { AccountDeletionRequest } from '../src/players/types.js';

const identity: AuthenticatedIdentity = {
  issuer: 'https://auth.example.test/',
  subject: 'auth0|player-123',
};

const pendingRequest: AccountDeletionRequest = {
  id: '00000000-0000-4000-8000-000000000300',
  requestedAt: new Date('2026-08-14T03:00:00.000Z'),
  completedAt: null,
  status: 'pending',
  failureReason: null,
};

const retryRequest: AccountDeletionRequest = {
  ...pendingRequest,
  status: 'retry_pending',
  failureReason: 'auth0_deletion_failed',
};

const completedRequest: AccountDeletionRequest = {
  ...pendingRequest,
  completedAt: new Date('2026-08-14T03:01:00.000Z'),
  status: 'completed',
  failureReason: null,
};

describe('account deletion coordinator', () => {
  it('deletes the matching Auth0 user and completes local account removal', async () => {
    const verify = vi.fn(async () => ({
      identity,
      authenticatedAt: new Date('2026-08-14T02:59:00.000Z'),
    }));
    const deleteUser = vi.fn(async () => undefined);
    const request = vi.fn(async () => pendingRequest);
    const complete = vi.fn(async () => completedRequest);

    const logger = {
      error: vi.fn(),
    };

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(verify),
      createManagementClient(deleteUser),
      createLifecycle({
        request,
        complete,
      }),
      logger,
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'fresh-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({
      deletionId: pendingRequest.id,
      status: 'completed',
    });

    expect(verify).toHaveBeenCalledWith('fresh-id-token');
    expect(request).toHaveBeenCalledWith(identity);
    expect(deleteUser).toHaveBeenCalledWith(identity.subject);
    expect(complete).toHaveBeenCalledWith(pendingRequest.id);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('rejects deletion without explicit permanent confirmation before changing state', async () => {
    const verify = vi.fn();
    const request = vi.fn();

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(verify),
      createManagementClient(),
      createLifecycle({
        request: request as AccountDeletionLifecycle['request'],
      }),
      {
        error: vi.fn(),
      },
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'fresh-id-token',
        confirmation: 'yes',
      }),
    ).rejects.toMatchObject({
      code: 'permanent_deletion_confirmation_required',
    });

    expect(verify).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects invalid recent-authentication proof before locking the account', async () => {
    const verify = vi.fn(async () => {
      throw new Error('sensitive token verification detail');
    });
    const request = vi.fn();

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(verify),
      createManagementClient(),
      createLifecycle({
        request: request as AccountDeletionLifecycle['request'],
      }),
      {
        error: vi.fn(),
      },
    );

    let thrown: unknown;

    try {
      await coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'invalid-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AccountDeletionCoordinatorError);
    expect(thrown).toMatchObject({
      code: 'recent_authentication_required',
    });
    expect((thrown as Error).message).not.toContain(
      'sensitive token verification detail',
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a valid reauthentication token for another identity', async () => {
    const request = vi.fn();
    const deleteUser = vi.fn();

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(
        vi.fn(async () => ({
          identity: {
            issuer: identity.issuer,
            subject: 'auth0|another-player',
          },
          authenticatedAt: new Date('2026-08-14T02:59:00.000Z'),
        })),
      ),
      createManagementClient(deleteUser),
      createLifecycle({
        request: request as AccountDeletionLifecycle['request'],
      }),
      {
        error: vi.fn(),
      },
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'other-player-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      }),
    ).rejects.toMatchObject({
      code: 'recent_authentication_required',
    });

    expect(request).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('keeps the account pending and records an Auth0 deletion failure for retry', async () => {
    const deleteUser = vi.fn(async () => {
      throw new Error('external provider failure');
    });
    const complete = vi.fn();
    const markRetryPending = vi.fn(async () => retryRequest);
    const logger = {
      error: vi.fn(),
    };

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(),
      createManagementClient(deleteUser),
      createLifecycle({
        markRetryPending,
        complete: complete as AccountDeletionLifecycle['complete'],
      }),
      logger,
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'fresh-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({
      deletionId: pendingRequest.id,
      status: 'retry_pending',
    });

    expect(markRetryPending).toHaveBeenCalledWith(
      pendingRequest.id,
      'auth0_deletion_failed',
    );
    expect(complete).not.toHaveBeenCalled();

    expect(logger.error).toHaveBeenCalledWith(
      {
        deletionId: pendingRequest.id,
        failureReason: 'auth0_deletion_failed',
      },
      'Account deletion requires automatic retry.',
    );
  });

  it('records local cleanup failure after the Auth0 account was deleted', async () => {
    const deleteUser = vi.fn(async () => undefined);
    const complete = vi.fn(async () => {
      throw new Error('database cleanup failure');
    });
    const markRetryPending = vi.fn(async () => ({
      ...retryRequest,
      failureReason: 'local_cleanup_failed' as const,
    }));

    const logger = {
      error: vi.fn(),
    };

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(),
      createManagementClient(deleteUser),
      createLifecycle({
        complete,
        markRetryPending,
      }),
      logger,
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'fresh-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({
      deletionId: pendingRequest.id,
      status: 'retry_pending',
    });

    expect(deleteUser).toHaveBeenCalledWith(identity.subject);
    expect(markRetryPending).toHaveBeenCalledWith(
      pendingRequest.id,
      'local_cleanup_failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      {
        deletionId: pendingRequest.id,
        failureReason: 'local_cleanup_failed',
      },
      'Account deletion requires automatic retry.',
    );
  });

  it('continues an already-pending deletion request idempotently', async () => {
    const request = vi.fn(async () => ({
      ...retryRequest,
      failureReason: 'auth0_deletion_failed' as const,
    }));
    const deleteUser = vi.fn(async () => undefined);
    const complete = vi.fn(async () => completedRequest);

    const coordinator = createAccountDeletionCoordinator(
      createVerifier(),
      createManagementClient(deleteUser),
      createLifecycle({
        request,
        complete,
      }),
      {
        error: vi.fn(),
      },
    );

    await expect(
      coordinator.deleteAccount({
        identity,
        reauthenticationToken: 'fresh-id-token',
        confirmation: PERMANENT_DELETION_CONFIRMATION,
      }),
    ).resolves.toEqual({
      deletionId: pendingRequest.id,
      status: 'completed',
    });

    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(pendingRequest.id);
  });
});

function createVerifier(
  verify: ReauthenticationTokenVerifier['verify'] = async () => ({
    identity,
    authenticatedAt: new Date('2026-08-14T02:59:00.000Z'),
  }),
): ReauthenticationTokenVerifier {
  return {
    verify,
  };
}

function createManagementClient(
  deleteUser: Auth0ManagementClient['deleteUser'] = async () => undefined,
): Auth0ManagementClient {
  return {
    deleteUser,
  };
}

function createLifecycle(
  overrides: Partial<AccountDeletionLifecycle> = {},
): AccountDeletionLifecycle {
  return {
    request: async () => pendingRequest,
    markRetryPending: async () => retryRequest,
    complete: async () => completedRequest,
    listProcessable: async () => [],
    purgeExpiredCompleted: async () => 0,
    ...overrides,
  };
}
