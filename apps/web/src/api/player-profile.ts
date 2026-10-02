import { parseCardPresentation, type CardPresentation } from './cards';
import type { CurrentProgressionProfile } from './progression';
import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export interface PlayerProfile extends CurrentProgressionProfile {
  isOwner: boolean;
  version: number | null;
  bio: string;
  degree: string;
  studyYear: string;
  avatarDataUrl: string | null;
  status: { emoji: string; text: string; expiresAt: string | null } | null;
  isPublic: boolean;
  activityVisible: boolean;
  featuredCards: CardPresentation[];
  featuredOwnedCardIds: string[];
  activity: { date: string; count: number }[] | null;
  activityThrough: string;
}

export interface ProfileEdit {
  expectedVersion: number;
  bio: string;
  degree: string;
  studyYear: string;
  avatarDataUrl: string | null;
  statusEmoji: string;
  statusText: string;
  statusExpiry: 'keep' | 'today' | 'week' | 'never';
  isPublic: boolean;
  activityVisible: boolean;
  featuredOwnedCardIds: string[];
}

export class PlayerProfileError extends Error {
  constructor(
    public readonly failure:
      | 'authorization'
      | 'account_unavailable'
      | 'not_found'
      | 'conflict'
      | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'PlayerProfileError';
  }
}

interface Options {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
  playerName?: string;
  edit?: ProfileEdit;
}

export async function requestPlayerProfile({
  apiBaseUrl,
  getAccessToken,
  signal,
  playerName,
  edit,
}: Options): Promise<PlayerProfile> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    throw new PlayerProfileError(
      'authorization',
      'Sign in again to view this profile.',
    );
  }
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/profiles/${playerName === undefined ? 'me' : `players/${encodeURIComponent(playerName)}`}`,
      {
        method: edit ? 'PUT' : 'GET',
        signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(edit ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(edit ? { body: JSON.stringify(edit) } : {}),
      },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new PlayerProfileError(
      'unavailable',
      'Check your connection and try again.',
    );
  }
  if (response.status === 403)
    throw new PlayerProfileError(
      'account_unavailable',
      'This account cannot view player profiles right now.',
    );
  if (response.status === 401)
    throw new PlayerProfileError(
      'authorization',
      'Sign in again to view this profile.',
    );
  if (response.status === 404)
    throw new PlayerProfileError(
      'not_found',
      'This player profile is not available.',
    );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new PlayerProfileError(
      response.status === 409 ? 'conflict' : 'unavailable',
      typeof payload?.detail === 'string'
        ? payload.detail
        : 'Your profile could not be saved. Try again.',
    );
  }
  try {
    return parsePlayerProfile(await response.json());
  } catch {
    throw new PlayerProfileError(
      'unavailable',
      'Your profile could not be displayed. Try again.',
    );
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const instant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parsePlayerProfile(value: unknown): PlayerProfile {
  const keys = [
    'requestId',
    'playerName',
    'points',
    'rank',
    'currentStreak',
    'longestStreak',
    'achievements',
    'isOwner',
    'version',
    'bio',
    'degree',
    'studyYear',
    'avatarDataUrl',
    'status',
    'isPublic',
    'activityVisible',
    'featuredCards',
    'featuredOwnedCardIds',
    'activity',
    'activityThrough',
  ];
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    typeof value.requestId !== 'string' ||
    typeof value.playerName !== 'string' ||
    !value.playerName.trim() ||
    !integer(value.points) ||
    !integer(value.rank) ||
    value.rank < 1 ||
    !integer(value.currentStreak) ||
    !integer(value.longestStreak) ||
    value.longestStreak < value.currentStreak ||
    typeof value.isOwner !== 'boolean' ||
    !(value.version === null || integer(value.version)) ||
    typeof value.isPublic !== 'boolean' ||
    typeof value.activityVisible !== 'boolean' ||
    !['bio', 'degree', 'studyYear'].every(
      (key) => typeof value[key] === 'string',
    ) ||
    !(
      value.avatarDataUrl === null ||
      (typeof value.avatarDataUrl === 'string' &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value.avatarDataUrl))
    ) ||
    !Array.isArray(value.featuredCards) ||
    value.featuredCards.length > 4 ||
    !Array.isArray(value.featuredOwnedCardIds) ||
    value.featuredOwnedCardIds.length > 4 ||
    !value.featuredOwnedCardIds.every(uuid) ||
    !Array.isArray(value.achievements) ||
    !date(value.activityThrough)
  )
    throw new Error('Malformed profile');
  if (
    value.isOwner
      ? value.version === null ||
        value.featuredCards.length !== value.featuredOwnedCardIds.length
      : value.version !== null || value.featuredOwnedCardIds.length !== 0
  )
    throw new Error('Unsafe profile projection');
  const status = value.status;
  if (
    status !== null &&
    (!record(status) ||
      typeof status.emoji !== 'string' ||
      typeof status.text !== 'string' ||
      !(status.expiresAt === null || instant(status.expiresAt)))
  )
    throw new Error('Malformed status');
  const activity = value.activity;
  if (!(
    activity === null ||
    (Array.isArray(activity) &&
      activity.length <= 365 &&
      activity.every(
        (entry: unknown) =>
          record(entry) &&
          date(entry.date) &&
          integer(entry.count) &&
          entry.count > 0 &&
          entry.date <= (value.activityThrough as string),
      ))
  ))
    throw new Error('Malformed activity');
  if (!value.isOwner && !value.activityVisible && activity !== null)
    throw new Error('Private activity');
  const achievements = value.achievements.map((entry: unknown) => {
    if (
      !record(entry) ||
      !['code', 'title', 'description'].every(
        (key) => typeof entry[key] === 'string',
      ) ||
      typeof entry.earned !== 'boolean' ||
      !integer(entry.progress) ||
      !integer(entry.target) ||
      entry.target < 1 ||
      (!value.isOwner && !entry.earned)
    )
      throw new Error('Malformed achievement');
    return {
      code: entry.code as string,
      title: entry.title as string,
      description: entry.description as string,
      earned: entry.earned,
      progress: entry.progress,
      target: entry.target,
    };
  });
  return {
    playerName: value.playerName,
    points: value.points,
    rank: value.rank,
    currentStreak: value.currentStreak,
    longestStreak: value.longestStreak,
    achievements,
    isOwner: value.isOwner,
    version: value.version,
    bio: value.bio as string,
    degree: value.degree as string,
    studyYear: value.studyYear as string,
    avatarDataUrl: value.avatarDataUrl as string | null,
    status: status as PlayerProfile['status'],
    isPublic: value.isPublic,
    activityVisible: value.activityVisible,
    featuredCards: value.featuredCards.map(parseCardPresentation),
    featuredOwnedCardIds: value.featuredOwnedCardIds as string[],
    activity: activity as PlayerProfile['activity'],
    activityThrough: value.activityThrough,
  };
}
