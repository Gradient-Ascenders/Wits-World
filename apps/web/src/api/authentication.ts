import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export interface CurrentPlayer {
  id: string;
  lifecycleStatus: 'active';
  role: 'author' | 'player';
}

export type CurrentPlayerFailure = 'authorization' | 'unavailable';

export class CurrentPlayerError extends Error {
  public constructor(public readonly failure: CurrentPlayerFailure) {
    super('The current player could not be loaded.');
    this.name = 'CurrentPlayerError';
  }
}

interface GetCurrentPlayerOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export async function getCurrentPlayer({
  apiBaseUrl,
  getAccessToken,
  signal,
}: GetCurrentPlayerOptions): Promise<CurrentPlayer> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new CurrentPlayerError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new CurrentPlayerError('unavailable');
  }

  if (response.status === 401 || response.status === 403) {
    throw new CurrentPlayerError('authorization');
  }

  if (!response.ok) {
    throw new CurrentPlayerError('unavailable');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new CurrentPlayerError('unavailable');
  }

  if (
    !isRecord(payload) ||
    !isUuid(payload.id) ||
    (payload.role !== 'player' && payload.role !== 'author') ||
    payload.lifecycleStatus !== 'active' ||
    typeof payload.requestId !== 'string'
  ) {
    throw new CurrentPlayerError('unavailable');
  }

  return {
    id: payload.id,
    lifecycleStatus: 'active',
    role: payload.role,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
  );
}
