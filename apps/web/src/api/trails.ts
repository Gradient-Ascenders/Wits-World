import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import type { LocationClaim } from '../browser-location';

export type PlayerTrailPublicationStatus = 'published' | 'retired';
export type PlayerTrailProgressStatus = 'completed' | 'in_progress' | 'retired';
export type PlayerTrailAvailability =
  'active' | 'ended' | 'retired' | 'upcoming';
export type PlayerTrailStepState =
  'completed' | 'current' | 'locked' | 'unavailable';
export type PlayerTrailUnavailableReason =
  | 'ended'
  | 'event_retired'
  | 'event_unavailable'
  | 'trail_retired'
  | 'upcoming';

export interface PlayerTrailSummary {
  availability: PlayerTrailAvailability;
  completedStepCount: number;
  currentStepPosition: number | null;
  description: string | null;
  endsAt: string | null;
  progressStatus: PlayerTrailProgressStatus;
  publicationStatus: PlayerTrailPublicationStatus;
  startsAt: string | null;
  title: string;
  totalSteps: number;
  trailId: string;
}

export interface PlayerTrailStep {
  completedAt: string | null;
  description: string | null;
  endsAt: string;
  eventId: string;
  latitude: number;
  longitude: number;
  position: number;
  radiusMetres: number;
  startsAt: string;
  state: PlayerTrailStepState;
  title: string;
  unavailableReason: PlayerTrailUnavailableReason | null;
}

export interface PlayerTrail extends PlayerTrailSummary {
  steps: PlayerTrailStep[];
}

export interface NearbyTrailContext {
  position: number;
  title: string;
  totalSteps: number;
  trailId: string;
}

export interface NearbyUnvisitedEvent {
  description: string | null;
  distanceMetres: number;
  endsAt: string;
  eventId: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  title: string;
  trailContexts: NearbyTrailContext[];
}

export type TrailDiscoveryFailure =
  'authorization' | 'not-found' | 'unavailable';

export class TrailDiscoveryError extends Error {
  public constructor(public readonly failure: TrailDiscoveryFailure) {
    super('Trail discovery could not be loaded.');
    this.name = 'TrailDiscoveryError';
  }
}

export type NearbyUnvisitedFailure =
  'authorization' | 'location-retry' | 'unavailable';

export class NearbyUnvisitedError extends Error {
  public constructor(public readonly failure: NearbyUnvisitedFailure) {
    super('Nearby unvisited events could not be loaded.');
    this.name = 'NearbyUnvisitedError';
  }
}

interface ApiRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface GetPlayerTrailOptions extends ApiRequestOptions {
  trailId: string;
}

interface ListNearbyUnvisitedOptions extends ApiRequestOptions {
  claim: LocationClaim;
}

export async function listPlayerTrails(
  options: ApiRequestOptions,
): Promise<PlayerTrailSummary[]> {
  const payload = await requestTrailJson(
    `${options.apiBaseUrl}/trails`,
    options,
  );

  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, ['requestId', 'trails']) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.trails)
  ) {
    throw new TrailDiscoveryError('unavailable');
  }

  return payload.trails.map((trail) => parseTrailSummary(trail));
}

export async function getPlayerTrail({
  apiBaseUrl,
  getAccessToken,
  signal,
  trailId,
}: GetPlayerTrailOptions): Promise<PlayerTrail> {
  const payload = await requestTrailJson(
    `${apiBaseUrl}/trails/${encodeURIComponent(trailId)}`,
    { apiBaseUrl, getAccessToken, signal },
    trailId,
  );

  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, ['requestId', 'trail']) ||
    typeof payload.requestId !== 'string' ||
    !isRecord(payload.trail) ||
    !hasOnlyKeys(payload.trail, [...summaryKeys, 'steps']) ||
    !Array.isArray(payload.trail.steps)
  ) {
    throw new TrailDiscoveryError('unavailable');
  }

  const summary = parseTrailSummary(payload.trail, true);
  const steps = payload.trail.steps.map(parseTrailStep);

  if (
    steps.length !== summary.totalSteps ||
    steps.some((step, index) => step.position !== index + 1)
  ) {
    throw new TrailDiscoveryError('unavailable');
  }

  return { ...summary, steps };
}

export async function listNearbyUnvisited({
  apiBaseUrl,
  claim,
  getAccessToken,
  signal,
}: ListNearbyUnvisitedOptions): Promise<NearbyUnvisitedEvent[]> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new NearbyUnvisitedError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/events/nearby-unvisited`, {
      body: JSON.stringify(claim),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new NearbyUnvisitedError('unavailable');
  }

  if (response.status === 401) {
    throw new NearbyUnvisitedError('authorization');
  }

  if (response.status === 422) {
    throw new NearbyUnvisitedError('location-retry');
  }

  if (!response.ok) {
    throw new NearbyUnvisitedError('unavailable');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new NearbyUnvisitedError('unavailable');
  }

  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, ['events', 'requestId']) ||
    !Array.isArray(payload.events) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new NearbyUnvisitedError('unavailable');
  }

  return payload.events.map(parseNearbyEvent);
}

async function requestTrailJson(
  url: string,
  { getAccessToken, signal }: ApiRequestOptions,
  trailId?: string,
): Promise<unknown> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new TrailDiscoveryError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(url, {
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

    throw new TrailDiscoveryError('unavailable');
  }

  if (response.status === 401) {
    throw new TrailDiscoveryError('authorization');
  }

  if (response.status === 404 && trailId !== undefined) {
    throw new TrailDiscoveryError('not-found');
  }

  if (!response.ok) {
    throw new TrailDiscoveryError('unavailable');
  }

  try {
    return await response.json();
  } catch {
    throw new TrailDiscoveryError('unavailable');
  }
}

const summaryKeys = [
  'availability',
  'completedStepCount',
  'currentStepPosition',
  'description',
  'endsAt',
  'progressStatus',
  'publicationStatus',
  'startsAt',
  'title',
  'totalSteps',
  'trailId',
] as const;

function parseTrailSummary(
  value: unknown,
  allowSteps = false,
): PlayerTrailSummary {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, allowSteps ? [...summaryKeys, 'steps'] : summaryKeys) ||
    !isTrailAvailability(value.availability) ||
    !isIntegerInRange(value.completedStepCount, 0, 50) ||
    (value.currentStepPosition !== null &&
      !isIntegerInRange(value.currentStepPosition, 1, 50)) ||
    (value.description !== null && typeof value.description !== 'string') ||
    !isNullableDateTime(value.endsAt) ||
    !isTrailProgressStatus(value.progressStatus) ||
    !isTrailPublicationStatus(value.publicationStatus) ||
    !isNullableDateTime(value.startsAt) ||
    typeof value.title !== 'string' ||
    !isIntegerInRange(value.totalSteps, 1, 50) ||
    typeof value.trailId !== 'string' ||
    value.completedStepCount > value.totalSteps ||
    (value.currentStepPosition !== null &&
      value.currentStepPosition > value.totalSteps)
  ) {
    throw new TrailDiscoveryError('unavailable');
  }

  return {
    availability: value.availability,
    completedStepCount: value.completedStepCount,
    currentStepPosition: value.currentStepPosition,
    description: value.description,
    endsAt: value.endsAt,
    progressStatus: value.progressStatus,
    publicationStatus: value.publicationStatus,
    startsAt: value.startsAt,
    title: value.title,
    totalSteps: value.totalSteps,
    trailId: value.trailId,
  };
}

const stepKeys = [
  'completedAt',
  'description',
  'endsAt',
  'eventId',
  'latitude',
  'longitude',
  'position',
  'radiusMetres',
  'startsAt',
  'state',
  'title',
  'unavailableReason',
] as const;

function parseTrailStep(value: unknown): PlayerTrailStep {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, stepKeys) ||
    !isNullableDateTime(value.completedAt) ||
    (value.description !== null && typeof value.description !== 'string') ||
    !isDateTime(value.endsAt) ||
    typeof value.eventId !== 'string' ||
    !isCoordinate(value.latitude, -90, 90) ||
    !isCoordinate(value.longitude, -180, 180) ||
    !isIntegerInRange(value.position, 1, 50) ||
    !isPositiveNumber(value.radiusMetres) ||
    !isDateTime(value.startsAt) ||
    !isTrailStepState(value.state) ||
    typeof value.title !== 'string' ||
    (value.unavailableReason !== null &&
      !isUnavailableReason(value.unavailableReason))
  ) {
    throw new TrailDiscoveryError('unavailable');
  }

  return {
    completedAt: value.completedAt,
    description: value.description,
    endsAt: value.endsAt,
    eventId: value.eventId,
    latitude: value.latitude,
    longitude: value.longitude,
    position: value.position,
    radiusMetres: value.radiusMetres,
    startsAt: value.startsAt,
    state: value.state,
    title: value.title,
    unavailableReason: value.unavailableReason,
  };
}

const nearbyEventKeys = [
  'description',
  'distanceMetres',
  'endsAt',
  'eventId',
  'latitude',
  'longitude',
  'radiusMetres',
  'startsAt',
  'title',
  'trailContexts',
] as const;

function parseNearbyEvent(value: unknown): NearbyUnvisitedEvent {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, nearbyEventKeys) ||
    (value.description !== null && typeof value.description !== 'string') ||
    !isPositiveOrZeroNumber(value.distanceMetres) ||
    !isDateTime(value.endsAt) ||
    typeof value.eventId !== 'string' ||
    !isCoordinate(value.latitude, -90, 90) ||
    !isCoordinate(value.longitude, -180, 180) ||
    !isPositiveNumber(value.radiusMetres) ||
    !isDateTime(value.startsAt) ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.trailContexts)
  ) {
    throw new NearbyUnvisitedError('unavailable');
  }

  return {
    description: value.description,
    distanceMetres: value.distanceMetres,
    endsAt: value.endsAt,
    eventId: value.eventId,
    latitude: value.latitude,
    longitude: value.longitude,
    radiusMetres: value.radiusMetres,
    startsAt: value.startsAt,
    title: value.title,
    trailContexts: value.trailContexts.map(parseTrailContext),
  };
}

function parseTrailContext(value: unknown): NearbyTrailContext {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['position', 'title', 'totalSteps', 'trailId']) ||
    !isIntegerInRange(value.position, 1, 50) ||
    typeof value.title !== 'string' ||
    !isIntegerInRange(value.totalSteps, 2, 50) ||
    typeof value.trailId !== 'string' ||
    value.position > value.totalSteps
  ) {
    throw new NearbyUnvisitedError('unavailable');
  }

  return {
    position: value.position,
    title: value.title,
    totalSteps: value.totalSteps,
    trailId: value.trailId,
  };
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPositiveOrZeroNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isTrailAvailability(value: unknown): value is PlayerTrailAvailability {
  return (
    value === 'active' ||
    value === 'ended' ||
    value === 'retired' ||
    value === 'upcoming'
  );
}

function isTrailProgressStatus(
  value: unknown,
): value is PlayerTrailProgressStatus {
  return (
    value === 'completed' || value === 'in_progress' || value === 'retired'
  );
}

function isTrailPublicationStatus(
  value: unknown,
): value is PlayerTrailPublicationStatus {
  return value === 'published' || value === 'retired';
}

function isTrailStepState(value: unknown): value is PlayerTrailStepState {
  return (
    value === 'completed' ||
    value === 'current' ||
    value === 'locked' ||
    value === 'unavailable'
  );
}

function isUnavailableReason(
  value: unknown,
): value is PlayerTrailUnavailableReason {
  return (
    value === 'ended' ||
    value === 'event_retired' ||
    value === 'event_unavailable' ||
    value === 'trail_retired' ||
    value === 'upcoming'
  );
}
