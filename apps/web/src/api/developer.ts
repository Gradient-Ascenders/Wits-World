import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export type DeveloperApiKeyStatus = 'active' | 'revoked';

export interface DeveloperApiKeyMetadata {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: DeveloperApiKeyStatus;
}

export interface DeveloperApiKeyList {
  keys: DeveloperApiKeyMetadata[];
  activeKeyLimit: number;
}

export interface CreatedDeveloperApiKey {
  key: DeveloperApiKeyMetadata;
  apiKey: string;
}

export type DeveloperApiFailure =
  'authorization' | 'key-limit' | 'not-found' | 'unavailable';

export class DeveloperApiError extends Error {
  constructor(
    public readonly failure: DeveloperApiFailure,
    public readonly requestId?: string,
  ) {
    super('The developer API request could not be completed.');
    this.name = 'DeveloperApiError';
  }
}

interface RequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export async function listDeveloperApiKeys(
  options: RequestOptions,
): Promise<DeveloperApiKeyList> {
  const payload = await requestJson(`${options.apiBaseUrl}/developer/keys`, {
    ...options,
    method: 'GET',
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['activeKeyLimit', 'keys', 'requestId']) ||
    !Number.isInteger(payload.activeKeyLimit) ||
    Number(payload.activeKeyLimit) < 1 ||
    !Array.isArray(payload.keys) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new DeveloperApiError('unavailable');
  }
  return {
    activeKeyLimit: Number(payload.activeKeyLimit),
    keys: payload.keys.map(parseKeyMetadata),
  };
}

export async function createDeveloperApiKey(
  options: RequestOptions & { name: string },
): Promise<CreatedDeveloperApiKey> {
  const payload = await requestJson(`${options.apiBaseUrl}/developer/keys`, {
    ...options,
    method: 'POST',
    body: { name: options.name },
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['apiKey', 'key', 'requestId']) ||
    typeof payload.apiKey !== 'string' ||
    !payload.apiKey.startsWith('ww_api_') ||
    typeof payload.requestId !== 'string'
  ) {
    throw new DeveloperApiError('unavailable');
  }
  return { apiKey: payload.apiKey, key: parseKeyMetadata(payload.key) };
}

export async function revokeDeveloperApiKey(
  options: RequestOptions & { keyId: string },
): Promise<DeveloperApiKeyMetadata> {
  const payload = await requestJson(
    `${options.apiBaseUrl}/developer/keys/${encodeURIComponent(options.keyId)}`,
    { ...options, method: 'DELETE' },
  );
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['key', 'requestId']) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new DeveloperApiError('unavailable');
  }
  return parseKeyMetadata(payload.key);
}

async function requestJson(
  url: string,
  options: RequestOptions & {
    method: 'GET' | 'POST' | 'DELETE';
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  let accessToken: string;
  try {
    accessToken = await options.getAccessToken();
  } catch {
    throw new DeveloperApiError('authorization');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new DeveloperApiError('unavailable');
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    const requestId =
      typeof problem?.requestId === 'string' ? problem.requestId : undefined;
    if (response.status === 401 || response.status === 403) {
      throw new DeveloperApiError('authorization', requestId);
    }
    if (
      response.status === 409 &&
      problem?.code === 'DEVELOPER_API_KEY_LIMIT_REACHED'
    ) {
      throw new DeveloperApiError('key-limit', requestId);
    }
    if (response.status === 404) {
      throw new DeveloperApiError('not-found', requestId);
    }
    throw new DeveloperApiError('unavailable', requestId);
  }

  return response.json().catch(() => {
    throw new DeveloperApiError('unavailable');
  });
}

function parseKeyMetadata(value: unknown): DeveloperApiKeyMetadata {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'createdAt',
      'id',
      'keyPrefix',
      'lastUsedAt',
      'name',
      'revokedAt',
      'status',
    ]) ||
    !isUuid(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.keyPrefix !== 'string' ||
    typeof value.createdAt !== 'string' ||
    !isNullableString(value.lastUsedAt) ||
    !isNullableString(value.revokedAt) ||
    (value.status !== 'active' && value.status !== 'revoked')
  ) {
    throw new DeveloperApiError('unavailable');
  }
  return {
    id: value.id,
    name: value.name,
    keyPrefix: value.keyPrefix,
    createdAt: value.createdAt,
    lastUsedAt: value.lastUsedAt,
    revokedAt: value.revokedAt,
    status: value.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(value)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

async function readProblem(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}
