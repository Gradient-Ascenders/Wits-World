import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export interface CurrentPlayer {
  id: string;
  lifecycleStatus: 'active';
  playerName: string | null;
  playerNameSetupRequired: boolean;
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

export type PlayerNameSetupFailure =
  'already_assigned' | 'authorization' | 'conflict' | 'invalid' | 'unavailable';

export class PlayerNameSetupError extends Error {
  public constructor(
    public readonly failure: PlayerNameSetupFailure,
    message = 'The Player Name could not be saved.',
  ) {
    super(message);
    this.name = 'PlayerNameSetupError';
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

interface AssignPlayerNameOptions extends GetCurrentPlayerOptions {
  playerName: string;
}

export async function assignCurrentPlayerName({
  apiBaseUrl,
  getAccessToken,
  playerName,
  signal,
}: AssignPlayerNameOptions): Promise<CurrentPlayer> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new PlayerNameSetupError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/me/player-name`, {
      body: JSON.stringify({ playerName }),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'PUT',
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new PlayerNameSetupError('unavailable');
  }

  if (response.status === 401 || response.status === 403) {
    throw new PlayerNameSetupError('authorization');
  }

  if (!response.ok) {
    const problem = await readProblem(response);

    if (response.status === 409 && problem?.code === 'PLAYER_NAME_CONFLICT') {
      throw new PlayerNameSetupError(
        'conflict',
        'That Player Name is already in use. Choose another.',
      );
    }

    if (
      response.status === 409 &&
      problem?.code === 'PLAYER_NAME_ALREADY_ASSIGNED'
    ) {
      throw new PlayerNameSetupError('already_assigned');
    }

    if (response.status === 400) {
      throw new PlayerNameSetupError(
        'invalid',
        typeof problem?.detail === 'string'
          ? problem.detail
          : 'Enter a valid Player Name.',
      );
    }

    throw new PlayerNameSetupError('unavailable');
  }

  const player = parseCurrentPlayer(await response.json().catch(() => null));

  if (!player) {
    throw new PlayerNameSetupError('unavailable');
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
    !isUuid(value.id) ||
    !(
      value.playerName === null ||
      (typeof value.playerName === 'string' && value.playerName.length > 0)
    ) ||
    typeof value.playerNameSetupRequired !== 'boolean' ||
    value.playerNameSetupRequired !== (value.playerName === null) ||
    (value.role !== 'player' && value.role !== 'author') ||
    value.lifecycleStatus !== 'active' ||
    typeof value.requestId !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    lifecycleStatus: 'active',
    playerName: value.playerName,
    playerNameSetupRequired: value.playerNameSetupRequired,
    role: value.role,
  };
}

async function readProblem(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
