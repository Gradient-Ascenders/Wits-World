import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export type StandingsPeriod = 'all_time' | 'monthly';

export interface ProgressionAchievement {
  code: string;
  title: string;
  description: string;
  earned: boolean;
  progress: number;
  target: number;
}

export interface CurrentProgressionProfile {
  playerName: string;
  points: number;
  rank: number;
  currentStreak: number;
  longestStreak: number;
  achievements: ProgressionAchievement[];
}

export interface StandingsEntry {
  playerName: string | null;
  points: number;
  rank: number;
  currentStreak: number;
  longestStreak: number;
  isCurrentPlayer: boolean;
}

export interface ProgressionStandings {
  period: StandingsPeriod;
  month: string | null;
  entries: StandingsEntry[];
  currentPlayer: StandingsEntry;
  pagination: {
    page: number;
    pageSize: number;
    totalPlayers: number;
    totalPages: number;
  };
}

interface ProgressionPagination {
  page: number;
  pageSize: number;
  totalPlayers: number;
  totalPages: number;
}

export type ProgressionApiFailure =
  'account-unavailable' | 'authorization' | 'malformed' | 'unavailable';

export class ProgressionApiError extends Error {
  public constructor(
    public readonly failure: ProgressionApiFailure,
    public readonly requestId?: string,
  ) {
    super('The progression request could not be completed.');
    this.name = 'ProgressionApiError';
  }
}

interface ProgressionRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface ListStandingsOptions extends ProgressionRequestOptions {
  period: StandingsPeriod;
  month?: string;
  page: number;
  pageSize: number;
}

const profileKeys = [
  'achievements',
  'currentStreak',
  'longestStreak',
  'playerName',
  'points',
  'rank',
  'requestId',
] as const;
const achievementKeys = [
  'code',
  'description',
  'earned',
  'progress',
  'target',
  'title',
] as const;
const standingsKeys = [
  'currentPlayer',
  'entries',
  'month',
  'pagination',
  'period',
  'requestId',
] as const;
const standingsEntryKeys = [
  'currentStreak',
  'isCurrentPlayer',
  'longestStreak',
  'playerName',
  'points',
  'rank',
] as const;
const paginationKeys = [
  'page',
  'pageSize',
  'totalPages',
  'totalPlayers',
] as const;
const achievementCodePattern = /^[a-z][a-z0-9_]*$/u;
const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/u;
const maximumStandingsPage = 10_000;
const maximumStandingsPageSize = 100;

export async function getCurrentProgressionProfile(
  options: ProgressionRequestOptions,
): Promise<CurrentProgressionProfile> {
  const payload = await progressionRequest({
    ...options,
    path: '/progression/me',
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, profileKeys) ||
    !isNonBlankString(payload.playerName) ||
    !isNonNegativeInteger(payload.points) ||
    !isPositiveInteger(payload.rank) ||
    !isNonNegativeInteger(payload.currentStreak) ||
    !isNonNegativeInteger(payload.longestStreak) ||
    payload.longestStreak < payload.currentStreak ||
    !Array.isArray(payload.achievements) ||
    typeof payload.requestId !== 'string'
  ) {
    throw malformedProgressionError(payload);
  }

  return {
    achievements: payload.achievements.map(parseAchievement),
    currentStreak: payload.currentStreak,
    longestStreak: payload.longestStreak,
    playerName: payload.playerName,
    points: payload.points,
    rank: payload.rank,
  };
}

export async function listProgressionStandings({
  month,
  page,
  pageSize,
  period,
  ...requestOptions
}: ListStandingsOptions): Promise<ProgressionStandings> {
  if (
    !isPositiveInteger(page) ||
    page > maximumStandingsPage ||
    !isPositiveInteger(pageSize) ||
    pageSize > maximumStandingsPageSize ||
    (period === 'monthly' && !monthPattern.test(month ?? '')) ||
    (period === 'all_time' && month !== undefined)
  ) {
    throw new ProgressionApiError('malformed');
  }

  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    period,
  });

  if (month !== undefined) {
    search.set('month', month);
  }

  const payload = await progressionRequest({
    ...requestOptions,
    path: `/progression/standings?${search.toString()}`,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, standingsKeys) ||
    payload.period !== period ||
    !(payload.month === null || typeof payload.month === 'string') ||
    (period === 'all_time'
      ? payload.month !== null
      : payload.month !== month) ||
    !Array.isArray(payload.entries) ||
    payload.entries.length > pageSize ||
    typeof payload.requestId !== 'string'
  ) {
    throw malformedProgressionError(payload);
  }

  const pagination = parsePagination(payload.pagination, page, pageSize);
  const responseMonth = payload.month;
  const currentPlayer = parseStandingsEntry(payload.currentPlayer);
  const entries = payload.entries.map(parseStandingsEntry);

  if (
    !currentPlayer.isCurrentPlayer ||
    currentPlayer.playerName === null ||
    currentPlayer.rank > pagination.totalPlayers ||
    entries.some((entry) => entry.rank > pagination.totalPlayers) ||
    entries.filter((entry) => entry.isCurrentPlayer).length > 1 ||
    entries.some(
      (entry) => entry.isCurrentPlayer && !sameEntry(entry, currentPlayer),
    )
  ) {
    throw malformedProgressionError(payload);
  }

  return {
    currentPlayer,
    entries,
    month: responseMonth,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
      totalPlayers: pagination.totalPlayers,
    },
    period,
  };
}

function parsePagination(
  value: unknown,
  requestedPage: number,
  requestedPageSize: number,
): ProgressionPagination {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, paginationKeys) ||
    value.page !== requestedPage ||
    value.pageSize !== requestedPageSize ||
    !isNonNegativeInteger(value.totalPlayers) ||
    !isNonNegativeInteger(value.totalPages) ||
    value.totalPages !== Math.ceil(value.totalPlayers / requestedPageSize)
  ) {
    throw malformedProgressionError(value);
  }

  return {
    page: value.page,
    pageSize: value.pageSize,
    totalPages: value.totalPages,
    totalPlayers: value.totalPlayers,
  };
}

async function progressionRequest({
  apiBaseUrl,
  getAccessToken,
  path,
  signal,
}: ProgressionRequestOptions & { path: string }): Promise<unknown> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new ProgressionApiError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new ProgressionApiError('unavailable');
  }

  if (!response.ok) {
    throw await parseProgressionError(response);
  }

  try {
    return await response.json();
  } catch {
    throw new ProgressionApiError('malformed');
  }
}

async function parseProgressionError(
  response: Response,
): Promise<ProgressionApiError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return new ProgressionApiError(
      response.status === 401 || response.status === 403
        ? 'authorization'
        : 'unavailable',
    );
  }

  const requestId = getRequestId(payload);
  const code = isRecord(payload) ? payload.code : undefined;

  if (response.status === 403 && code === 'ACCOUNT_UNAVAILABLE') {
    return new ProgressionApiError('account-unavailable', requestId);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProgressionApiError('authorization', requestId);
  }

  return new ProgressionApiError('unavailable', requestId);
}

function parseAchievement(value: unknown): ProgressionAchievement {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, achievementKeys) ||
    typeof value.code !== 'string' ||
    !achievementCodePattern.test(value.code) ||
    !isNonBlankString(value.title) ||
    !isNonBlankString(value.description) ||
    typeof value.earned !== 'boolean' ||
    !isNonNegativeInteger(value.progress) ||
    !isPositiveInteger(value.target)
  ) {
    throw malformedProgressionError(value);
  }

  return {
    code: value.code,
    description: value.description,
    earned: value.earned,
    progress: value.progress,
    target: value.target,
    title: value.title,
  };
}

function parseStandingsEntry(value: unknown): StandingsEntry {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, standingsEntryKeys) ||
    !(value.playerName === null || isNonBlankString(value.playerName)) ||
    !isNonNegativeInteger(value.points) ||
    !isPositiveInteger(value.rank) ||
    !isNonNegativeInteger(value.currentStreak) ||
    !isNonNegativeInteger(value.longestStreak) ||
    value.longestStreak < value.currentStreak ||
    typeof value.isCurrentPlayer !== 'boolean' ||
    (value.isCurrentPlayer && value.playerName === null)
  ) {
    throw malformedProgressionError(value);
  }

  return {
    currentStreak: value.currentStreak,
    isCurrentPlayer: value.isCurrentPlayer,
    longestStreak: value.longestStreak,
    playerName: value.playerName,
    points: value.points,
    rank: value.rank,
  };
}

function sameEntry(left: StandingsEntry, right: StandingsEntry) {
  return (
    left.playerName === right.playerName &&
    left.points === right.points &&
    left.rank === right.rank &&
    left.currentStreak === right.currentStreak &&
    left.longestStreak === right.longestStreak
  );
}

function malformedProgressionError(value: unknown) {
  return new ProgressionApiError('malformed', getRequestId(value));
}

function getRequestId(value: unknown) {
  return isRecord(value) && typeof value.requestId === 'string'
    ? value.requestId
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value);

  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}
