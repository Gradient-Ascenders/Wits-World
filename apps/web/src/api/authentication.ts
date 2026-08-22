import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export interface CurrentPlayer {
  displayName: string | null;
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

interface UpdateDisplayNameOptions extends GetCurrentPlayerOptions {
  displayName: string;
}

export class DisplayNameUpdateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DisplayNameUpdateError';
  }
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

  const player = parseCurrentPlayer(payload);

  if (!player) {
    throw new CurrentPlayerError('unavailable');
  }

  return player;
}

export async function updateCurrentPlayerDisplayName({
  apiBaseUrl,
  displayName,
  getAccessToken,
  signal,
}: UpdateDisplayNameOptions): Promise<CurrentPlayer> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new CurrentPlayerError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/me/display-name`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new DisplayNameUpdateError(
      'Your display name could not be saved. Try again.',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new CurrentPlayerError('authorization');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new DisplayNameUpdateError(
      'Your display name could not be saved. Try again.',
    );
  }

  if (!response.ok) {
    throw new DisplayNameUpdateError(
      isRecord(payload) && typeof payload.detail === 'string'
        ? payload.detail
        : 'Your display name could not be saved. Try again.',
    );
  }

  const player = parseCurrentPlayer(payload);

  if (!player) {
    throw new DisplayNameUpdateError(
      'Your display name was saved, but the updated account could not be loaded. Refresh and try again.',
    );
  }

  return player;
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

function parseCurrentPlayer(value: unknown): CurrentPlayer | null {
  if (
    !isRecord(value) ||
    (typeof value.displayName !== 'string' && value.displayName !== null) ||
    !isUuid(value.id) ||
    (value.role !== 'player' && value.role !== 'author') ||
    value.lifecycleStatus !== 'active' ||
    typeof value.requestId !== 'string'
  ) {
    return null;
  }

  return {
    displayName: value.displayName,
    id: value.id,
    lifecycleStatus: 'active',
    role: value.role,
  };
}
