import type { MultiPolygon, Polygon } from 'geojson';

import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export type TerritoryGeometry = Polygon | MultiPolygon;
export type TerritoryZoneStatus = 'active' | 'suspended';
export type TerritoryTransitionKind =
  | 'account_deletion'
  | 'activated'
  | 'reactivated'
  | 'retired'
  | 'season_reset'
  | 'settlement'
  | 'suspended';

export interface TerritoryOwner {
  playerName: string;
}

export interface TerritoryZoneSummary {
  geometry: TerritoryGeometry;
  name: string;
  owner: TerritoryOwner | null;
  seasonId: string | null;
  status: TerritoryZoneStatus;
  windowEnd: string | null;
  windowStart: string | null;
  zoneId: string;
}

export interface TerritoryZoneDetail extends TerritoryZoneSummary {
  lastSettledAt: string | null;
  lifecycleVersion: number;
}

export interface TerritoryStandings {
  activity: { contributors: number; influence: number };
  seasonId: string | null;
  top: Array<{ influence: number; rank: number }>;
  viewer: {
    dailyCap: number;
    influence: number;
    remainingDailyInfluence: number;
    todayInfluence: number;
  };
  zoneId: string;
}

export interface TerritoryHistoryEntry {
  effectiveAt: string;
  owner: TerritoryOwner | null;
  seasonId: string | null;
  transitionKind: TerritoryTransitionKind;
}

export interface TerritoryHistory {
  entries: TerritoryHistoryEntry[];
  zoneId: string;
}

export type TerritoryApiFailure = 'authorization' | 'not-found' | 'unavailable';

export class TerritoryApiError extends Error {
  public constructor(public readonly failure: TerritoryApiFailure) {
    super('Territory information could not be loaded.');
    this.name = 'TerritoryApiError';
  }
}

interface TerritoryRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface TerritoryZoneRequestOptions extends TerritoryRequestOptions {
  zoneId: string;
}

export async function listTerritoryZones(
  options: TerritoryRequestOptions,
): Promise<TerritoryZoneSummary[]> {
  const payload = await requestTerritoryJson(
    `${options.apiBaseUrl}/territory/zones`,
    options,
  );
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['zones']) ||
    !Array.isArray(payload.zones)
  ) {
    throw new TerritoryApiError('unavailable');
  }
  return payload.zones.map(parseZoneSummary);
}

export async function getTerritoryZone(
  options: TerritoryZoneRequestOptions,
): Promise<TerritoryZoneDetail> {
  const payload = await requestTerritoryJson(
    `${options.apiBaseUrl}/territory/zones/${encodeURIComponent(options.zoneId)}`,
    options,
  );
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      ...zoneSummaryKeys,
      'lastSettledAt',
      'lifecycleVersion',
    ]) ||
    !isNonNegativeInteger(payload.lifecycleVersion) ||
    !isNullableDate(payload.lastSettledAt)
  ) {
    throw new TerritoryApiError('unavailable');
  }
  const summary = parseZoneSummary({
    geometry: payload.geometry,
    name: payload.name,
    owner: payload.owner,
    seasonId: payload.seasonId,
    status: payload.status,
    windowEnd: payload.windowEnd,
    windowStart: payload.windowStart,
    zoneId: payload.zoneId,
  });
  return {
    ...summary,
    lastSettledAt: payload.lastSettledAt,
    lifecycleVersion: payload.lifecycleVersion,
  };
}

export async function getTerritoryStandings(
  options: TerritoryZoneRequestOptions,
): Promise<TerritoryStandings> {
  const payload = await requestTerritoryJson(
    `${options.apiBaseUrl}/territory/zones/${encodeURIComponent(options.zoneId)}/standings`,
    options,
  );
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      'activity',
      'seasonId',
      'top',
      'viewer',
      'zoneId',
    ]) ||
    !isUuid(payload.zoneId) ||
    !isNullableUuid(payload.seasonId) ||
    !Array.isArray(payload.top) ||
    payload.top.length > 3 ||
    !isRecord(payload.activity) ||
    !hasExactKeys(payload.activity, ['contributors', 'influence']) ||
    !isNonNegativeInteger(payload.activity.contributors) ||
    !isNonNegativeInteger(payload.activity.influence) ||
    !isRecord(payload.viewer) ||
    !hasExactKeys(payload.viewer, [
      'dailyCap',
      'influence',
      'remainingDailyInfluence',
      'todayInfluence',
    ]) ||
    !isPositiveInteger(payload.viewer.dailyCap) ||
    !isNonNegativeInteger(payload.viewer.influence) ||
    !isNonNegativeInteger(payload.viewer.remainingDailyInfluence) ||
    !isNonNegativeInteger(payload.viewer.todayInfluence)
  ) {
    throw new TerritoryApiError('unavailable');
  }

  const top = payload.top.map((entry) => {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['influence', 'rank']) ||
      !isPositiveInteger(entry.influence) ||
      !isPositiveInteger(entry.rank) ||
      entry.rank > 3
    ) {
      throw new TerritoryApiError('unavailable');
    }
    return { influence: entry.influence, rank: entry.rank };
  });

  return {
    activity: {
      contributors: payload.activity.contributors,
      influence: payload.activity.influence,
    },
    seasonId: payload.seasonId,
    top,
    viewer: {
      dailyCap: payload.viewer.dailyCap,
      influence: payload.viewer.influence,
      remainingDailyInfluence: payload.viewer.remainingDailyInfluence,
      todayInfluence: payload.viewer.todayInfluence,
    },
    zoneId: payload.zoneId,
  };
}

export async function getTerritoryHistory(
  options: TerritoryZoneRequestOptions,
): Promise<TerritoryHistory> {
  const payload = await requestTerritoryJson(
    `${options.apiBaseUrl}/territory/zones/${encodeURIComponent(options.zoneId)}/history`,
    options,
  );
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['entries', 'zoneId']) ||
    !isUuid(payload.zoneId) ||
    !Array.isArray(payload.entries) ||
    payload.entries.length > 50
  ) {
    throw new TerritoryApiError('unavailable');
  }

  return {
    entries: payload.entries.map(parseHistoryEntry),
    zoneId: payload.zoneId,
  };
}

async function requestTerritoryJson(
  url: string,
  options: TerritoryRequestOptions,
): Promise<unknown> {
  let token: string;
  try {
    token = await options.getAccessToken();
  } catch {
    throw new TerritoryApiError('authorization');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new TerritoryApiError('unavailable');
  }

  if (response.status === 401 || response.status === 403) {
    throw new TerritoryApiError('authorization');
  }
  if (response.status === 404) throw new TerritoryApiError('not-found');
  if (!response.ok) throw new TerritoryApiError('unavailable');

  try {
    return await response.json();
  } catch {
    throw new TerritoryApiError('unavailable');
  }
}

const zoneSummaryKeys = [
  'geometry',
  'name',
  'owner',
  'seasonId',
  'status',
  'windowEnd',
  'windowStart',
  'zoneId',
] as const;

function parseZoneSummary(payload: unknown): TerritoryZoneSummary {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, zoneSummaryKeys) ||
    !isUuid(payload.zoneId) ||
    typeof payload.name !== 'string' ||
    payload.name.trim().length === 0 ||
    (payload.status !== 'active' && payload.status !== 'suspended') ||
    !isTerritoryGeometry(payload.geometry) ||
    !isOwner(payload.owner) ||
    !isNullableUuid(payload.seasonId) ||
    !isNullableDate(payload.windowStart) ||
    !isNullableDate(payload.windowEnd)
  ) {
    throw new TerritoryApiError('unavailable');
  }
  return {
    geometry: payload.geometry,
    name: payload.name,
    owner: payload.owner,
    seasonId: payload.seasonId,
    status: payload.status,
    windowEnd: payload.windowEnd,
    windowStart: payload.windowStart,
    zoneId: payload.zoneId,
  };
}

function parseHistoryEntry(payload: unknown): TerritoryHistoryEntry {
  const transitionKinds = new Set<TerritoryTransitionKind>([
    'account_deletion',
    'activated',
    'reactivated',
    'retired',
    'season_reset',
    'settlement',
    'suspended',
  ]);
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      'effectiveAt',
      'owner',
      'seasonId',
      'transitionKind',
    ]) ||
    !isDate(payload.effectiveAt) ||
    !isOwner(payload.owner) ||
    !isNullableUuid(payload.seasonId) ||
    typeof payload.transitionKind !== 'string' ||
    !transitionKinds.has(payload.transitionKind as TerritoryTransitionKind)
  ) {
    throw new TerritoryApiError('unavailable');
  }
  return {
    effectiveAt: payload.effectiveAt,
    owner: payload.owner,
    seasonId: payload.seasonId,
    transitionKind: payload.transitionKind as TerritoryTransitionKind,
  };
}

function isTerritoryGeometry(value: unknown): value is TerritoryGeometry {
  if (!isRecord(value) || !hasExactKeys(value, ['coordinates', 'type'])) {
    return false;
  }
  if (value.type === 'Polygon') return isPolygonCoordinates(value.coordinates);
  if (value.type === 'MultiPolygon') {
    return (
      Array.isArray(value.coordinates) &&
      value.coordinates.length > 0 &&
      value.coordinates.every(isPolygonCoordinates)
    );
  }
  return false;
}

function isPolygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

function isLinearRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false;
  if (!value.every(isPosition)) return false;
  const first = value[0] as number[];
  const last = value.at(-1) as number[];
  return first[0] === last[0] && first[1] === last[1];
}

function isPosition(value: unknown): value is number[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !value.every((coordinate) => Number.isFinite(coordinate))
  ) {
    return false;
  }
  const longitude = value[0] as number;
  const latitude = value[1] as number;
  return (
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
  );
}

function isOwner(value: unknown): value is TerritoryOwner | null {
  return (
    value === null ||
    (isRecord(value) &&
      hasExactKeys(value, ['playerName']) &&
      typeof value.playerName === 'string' &&
      value.playerName.trim().length > 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isDate(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
