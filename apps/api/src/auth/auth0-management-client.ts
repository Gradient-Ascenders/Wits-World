import type { AuthManagementConfig } from '../config/auth-management.js';

const TOKEN_REFRESH_SKEW_MS = 60_000;

export type Auth0ManagementErrorCode =
  | 'management_token_request_failed'
  | 'management_token_response_invalid'
  | 'user_deletion_failed';

export class Auth0ManagementError extends Error {
  readonly code: Auth0ManagementErrorCode;
  readonly statusCode: number | undefined;

  constructor(code: Auth0ManagementErrorCode, statusCode?: number) {
    super(messageForCode(code));
    this.name = 'Auth0ManagementError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface Auth0ManagementClient {
  deleteUser(authSubject: string): Promise<void>;
}

interface CreateAuth0ManagementClientOptions {
  fetchImpl?: typeof fetch;
  clock?: () => Date;
}

interface CachedAccessToken {
  value: string;
  refreshAfterMs: number;
}

interface ManagementTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export function createAuth0ManagementClient(
  config: AuthManagementConfig,
  {
    fetchImpl = fetch,
    clock = () => new Date(),
  }: CreateAuth0ManagementClientOptions = {},
): Auth0ManagementClient {
  let cachedAccessToken: CachedAccessToken | undefined;

  async function getAccessToken(forceRefresh = false): Promise<string> {
    const nowMs = clock().getTime();

    if (
      !forceRefresh &&
      cachedAccessToken &&
      nowMs < cachedAccessToken.refreshAfterMs
    ) {
      return cachedAccessToken.value;
    }

    const response = await fetchImpl(config.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: config.audience,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      throw new Auth0ManagementError(
        'management_token_request_failed',
        response.status,
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new Auth0ManagementError('management_token_response_invalid');
    }

    if (!isManagementTokenResponse(payload)) {
      throw new Auth0ManagementError('management_token_response_invalid');
    }

    const lifetimeMs = payload.expires_in * 1000;
    const refreshSkewMs = Math.min(
      TOKEN_REFRESH_SKEW_MS,
      Math.floor(lifetimeMs / 2),
    );

    cachedAccessToken = {
      value: payload.access_token,
      refreshAfterMs: nowMs + lifetimeMs - refreshSkewMs,
    };

    return payload.access_token;
  }

  async function sendDelete(
    authSubject: string,
    accessToken: string,
  ): Promise<Response> {
    const encodedSubject = encodeURIComponent(authSubject);
    const userUrl = new URL(`users/${encodedSubject}`, config.apiBaseUrl);

    return fetchImpl(userUrl, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
  }

  return {
    async deleteUser(authSubject) {
      if (authSubject.trim() === '') {
        throw new Auth0ManagementError('user_deletion_failed');
      }

      let accessToken = await getAccessToken();
      let response = await sendDelete(authSubject, accessToken);

      if (response.status === 401) {
        cachedAccessToken = undefined;
        accessToken = await getAccessToken(true);
        response = await sendDelete(authSubject, accessToken);
      }

      if (response.status === 204 || response.status === 404) {
        return;
      }

      throw new Auth0ManagementError('user_deletion_failed', response.status);
    },
  };
}

function isManagementTokenResponse(
  payload: unknown,
): payload is ManagementTokenResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.access_token === 'string' &&
    candidate.access_token.length > 0 &&
    typeof candidate.token_type === 'string' &&
    candidate.token_type.toLowerCase() === 'bearer' &&
    typeof candidate.expires_in === 'number' &&
    Number.isFinite(candidate.expires_in) &&
    candidate.expires_in > 0
  );
}

function messageForCode(code: Auth0ManagementErrorCode): string {
  switch (code) {
    case 'management_token_request_failed':
      return 'Auth0 Management API authentication failed.';
    case 'management_token_response_invalid':
      return 'Auth0 Management API returned an invalid token response.';
    case 'user_deletion_failed':
      return 'Auth0 user deletion failed.';
  }
}
