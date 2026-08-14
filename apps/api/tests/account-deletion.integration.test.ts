import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AccessTokenVerifier } from '../src/auth/access-token-verifier.js';
import type { Auth0ManagementClient } from '../src/auth/auth0-management-client.js';
import type { ReauthenticationTokenVerifier } from '../src/auth/reauthentication-token-verifier.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { AccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import type { PlayerIdentityService } from '../src/players/player-identity.js';

const identity = {
  issuer: 'https://auth.example.test/',
  subject: 'auth0|player-123',
};

const player = {
  id: '00000000-0000-4000-8000-000000000500',
  role: 'player' as const,
  lifecycleStatus: 'active' as const,
};

const pendingDeletion = {
  id: '00000000-0000-4000-8000-000000000600',
  requestedAt: new Date('2026-08-14T05:00:00.000Z'),
  completedAt: null,
  status: 'pending' as const,
  failureReason: null,
};

const completedDeletion = {
  ...pendingDeletion,
  completedAt: new Date('2026-08-14T05:01:00.000Z'),
  status: 'completed' as const,
};

const authConfig: AuthConfig = {
  domain: 'auth.example.test',
  issuer: 'https://auth.example.test/',
  audience: 'https://api.example.test',
  spaClientId: 'wits-world-spa-client',
  jwksUrl: new URL('https://auth.example.test/.well-known/jwks.json'),
};

describe('account deletion API', () => {
  it('permanently deletes the authenticated account after fresh matching reauthentication', async () => {
    const deleteUser = vi.fn(async () => undefined);
    const complete = vi.fn(async () => completedDeletion);

    const app = await buildDeletionApp({
      managementClient: {
        deleteUser,
      },
      lifecycle: createLifecycle({
        complete,
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'fresh-id-token',
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toMatchObject({
      deletionId: pendingDeletion.id,
      status: 'completed',
    });

    expect(deleteUser).toHaveBeenCalledWith(identity.subject);
    expect(complete).toHaveBeenCalledWith(pendingDeletion.id);

    await app.close();
  });

  it('rejects invalid recent-authentication proof before locking the account', async () => {
    const requestDeletion = vi.fn();

    const app = await buildDeletionApp({
      reauthenticationVerifier: {
        verify: vi.fn(async () => {
          throw new Error('invalid proof');
        }),
      },
      lifecycle: createLifecycle({
        request: requestDeletion as AccountDeletionLifecycle['request'],
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'invalid-id-token',
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.statusCode).toBe(401);

    expect(response.json()).toMatchObject({
      code: 'RECENT_AUTHENTICATION_REQUIRED',
    });

    expect(requestDeletion).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects reauthentication belonging to another Auth0 identity', async () => {
    const requestDeletion = vi.fn();

    const app = await buildDeletionApp({
      reauthenticationVerifier: {
        verify: vi.fn(async () => ({
          identity: {
            issuer: identity.issuer,
            subject: 'auth0|another-player',
          },
          authenticatedAt: new Date('2026-08-14T05:00:00.000Z'),
        })),
      },
      lifecycle: createLifecycle({
        request: requestDeletion as AccountDeletionLifecycle['request'],
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'other-player-id-token',
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(requestDeletion).not.toHaveBeenCalled();

    await app.close();
  });

  it('rejects deletion without explicit permanent confirmation', async () => {
    const requestDeletion = vi.fn();

    const app = await buildDeletionApp({
      lifecycle: createLifecycle({
        request: requestDeletion as AccountDeletionLifecycle['request'],
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'fresh-id-token',
        confirmation: 'yes',
      },
    });

    expect(response.statusCode).toBe(400);

    expect(response.json()).toMatchObject({
      code: 'PERMANENT_DELETION_CONFIRMATION_REQUIRED',
    });

    expect(requestDeletion).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns accepted while an external deletion failure awaits automatic retry', async () => {
    const markRetryPending = vi.fn(async () => ({
      ...pendingDeletion,
      status: 'retry_pending' as const,
      failureReason: 'auth0_deletion_failed' as const,
    }));

    const app = await buildDeletionApp({
      managementClient: {
        deleteUser: vi.fn(async () => {
          throw new Error('provider unavailable');
        }),
      },
      lifecycle: createLifecycle({
        markRetryPending,
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'fresh-id-token',
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.statusCode).toBe(202);

    expect(response.json()).toMatchObject({
      deletionId: pendingDeletion.id,
      status: 'retry_pending',
    });

    expect(markRetryPending).toHaveBeenCalledWith(
      pendingDeletion.id,
      'auth0_deletion_failed',
    );

    await app.close();
  });

  it('rejects a deletion request for an already locked account', async () => {
    const verify = vi.fn();

    const app = await buildDeletionApp({
      playerIdentityService: {
        resolve: vi.fn(async () => ({
          ...player,
          lifecycleStatus: 'deletion_pending' as const,
        })),
      },
      reauthenticationVerifier: {
        verify,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account-deletion',
      headers: {
        authorization: 'Bearer valid-access-token',
      },
      payload: {
        reauthenticationToken: 'fresh-id-token',
        confirmation: 'DELETE_MY_ACCOUNT',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'ACCOUNT_UNAVAILABLE',
    });

    expect(verify).not.toHaveBeenCalled();

    await app.close();
  });

  it('documents the account deletion endpoint as a protected operation', async () => {
    const app = await buildDeletionApp();

    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(response.statusCode).toBe(200);

    const document = response.json<{
      paths: Record<
        string,
        {
          post?: {
            operationId?: string;
            security?: Array<Record<string, unknown>>;
          };
        }
      >;
    }>();

    const accountDeletionOperation =
      document.paths['/api/v1/auth/account-deletion']?.post;

    expect(accountDeletionOperation).toBeDefined();

    expect(accountDeletionOperation?.operationId).toBe(
      'deleteCurrentPlayerAccount',
    );

    expect(accountDeletionOperation?.security).toEqual([
      {
        bearerAuth: [],
      },
    ]);

    await app.close();
  });
});

interface BuildDeletionAppOverrides {
  playerIdentityService?: PlayerIdentityService;
  reauthenticationVerifier?: ReauthenticationTokenVerifier;
  managementClient?: Auth0ManagementClient;
  lifecycle?: AccountDeletionLifecycle;
}

async function buildDeletionApp(overrides: BuildDeletionAppOverrides = {}) {
  const accessTokenVerifier: AccessTokenVerifier = {
    verify: vi.fn(async () => identity),
  };

  return buildApp({
    authConfig,
    logger: false,
    accessTokenVerifier,

    playerIdentityService: overrides.playerIdentityService ?? {
      resolve: vi.fn(async () => player),
    },

    accountDeletionServices: {
      reauthenticationVerifier: overrides.reauthenticationVerifier ?? {
        verify: vi.fn(async () => ({
          identity,
          authenticatedAt: new Date('2026-08-14T05:00:00.000Z'),
        })),
      },

      managementClient: overrides.managementClient ?? {
        deleteUser: vi.fn(async () => undefined),
      },

      lifecycle: overrides.lifecycle ?? createLifecycle(),
    },
  });
}

function createLifecycle(
  overrides: Partial<AccountDeletionLifecycle> = {},
): AccountDeletionLifecycle {
  return {
    request: vi.fn(async () => pendingDeletion),
    markRetryPending: vi.fn(async () => ({
      ...pendingDeletion,
      status: 'retry_pending' as const,
      failureReason: 'auth0_deletion_failed' as const,
    })),
    complete: vi.fn(async () => completedDeletion),
    listProcessable: vi.fn(async () => []),
    purgeExpiredCompleted: vi.fn(async () => 0),
    ...overrides,
  };
}
