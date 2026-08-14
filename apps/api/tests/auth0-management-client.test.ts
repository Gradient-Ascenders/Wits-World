import { describe, expect, it, vi } from 'vitest';

import {
  Auth0ManagementError,
  createAuth0ManagementClient,
} from '../src/auth/auth0-management-client.js';
import type { AuthManagementConfig } from '../src/config/auth-management.js';

const config: AuthManagementConfig = {
  clientId: 'management-client',
  clientSecret: 'super-secret-management-value',
  tokenUrl: new URL('https://auth.example.test/oauth/token'),
  apiBaseUrl: new URL('https://auth.example.test/api/v2/'),
  audience: 'https://auth.example.test/api/v2/',
};

describe('Auth0 Management API client', () => {
  it('obtains an M2M token and deletes the encoded Auth0 user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'management-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(emptyResponse(204));

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      client.deleteUser('auth0|player/123'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0]!;
    expect(tokenUrl.toString()).toBe('https://auth.example.test/oauth/token');
    expect(tokenRequest).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(JSON.parse(tokenRequest.body as string)).toEqual({
      client_id: 'management-client',
      client_secret: 'super-secret-management-value',
      audience: 'https://auth.example.test/api/v2/',
      grant_type: 'client_credentials',
    });

    const [deleteUrl, deleteRequest] = fetchMock.mock.calls[1]!;

    expect(deleteUrl.toString()).toBe(
      'https://auth.example.test/api/v2/users/auth0%7Cplayer%2F123',
    );

    expect(deleteRequest).toEqual({
      method: 'DELETE',
      headers: {
        authorization: 'Bearer management-access-token',
      },
    });
  });

  it('reuses a cached Management API token before expiry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'cached-management-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(emptyResponse(204));

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
      clock: () => new Date('2026-08-14T03:00:00.000Z'),
    });

    await client.deleteUser('auth0|player-one');
    await client.deleteUser('auth0|player-two');

    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('/oauth/token');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain(
      '/users/auth0%7Cplayer-one',
    );
    expect(fetchMock.mock.calls[2]?.[0].toString()).toContain(
      '/users/auth0%7Cplayer-two',
    );
  });

  it('refreshes the Management API token after a deletion returns 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'expired-management-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(emptyResponse(401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'fresh-management-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(emptyResponse(204));

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      client.deleteUser('auth0|player-123'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(fetchMock.mock.calls[3]?.[1]).toEqual({
      method: 'DELETE',
      headers: {
        authorization: 'Bearer fresh-management-token',
      },
    });
  });

  it('treats an already-absent Auth0 user as idempotent success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'management-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(emptyResponse(404));

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      client.deleteUser('auth0|already-gone'),
    ).resolves.toBeUndefined();
  });

  it('rejects an invalid Management API token response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        access_token: '',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    );

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.deleteUser('auth0|player-123')).rejects.toMatchObject({
      code: 'management_token_response_invalid',
    });
  });

  it('does not expose Auth0 error responses or credentials when token acquisition fails', async () => {
    const sensitiveResponse =
      'invalid super-secret-management-value auth0|private-user';

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(sensitiveResponse, {
        status: 500,
      }),
    );

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    let thrown: unknown;

    try {
      await client.deleteUser('auth0|private-user');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Auth0ManagementError);

    const managementError = thrown as Auth0ManagementError;

    expect(managementError.code).toBe('management_token_request_failed');
    expect(managementError.statusCode).toBe(500);
    expect(managementError.message).not.toContain(
      'super-secret-management-value',
    );
    expect(managementError.message).not.toContain('auth0|private-user');
    expect(managementError.message).not.toContain(sensitiveResponse);
  });

  it('does not expose the Auth0 subject or response body when deletion fails', async () => {
    const sensitiveResponse =
      'failure for auth0|private-user with internal details';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'management-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        new Response(sensitiveResponse, {
          status: 503,
        }),
      );

    const client = createAuth0ManagementClient(config, {
      fetchImpl: fetchMock as typeof fetch,
    });

    let thrown: unknown;

    try {
      await client.deleteUser('auth0|private-user');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Auth0ManagementError);

    const managementError = thrown as Auth0ManagementError;

    expect(managementError.code).toBe('user_deletion_failed');
    expect(managementError.statusCode).toBe(503);
    expect(managementError.message).not.toContain('auth0|private-user');
    expect(managementError.message).not.toContain(sensitiveResponse);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
  });
}
