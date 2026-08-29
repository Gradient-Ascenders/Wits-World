import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import type { LocationClaim } from '../browser-location';

export type PlayerEventAvailability = 'active' | 'ended' | 'upcoming';

export interface PlayerEvent {
  availability: PlayerEventAvailability;
  description: null | string;
  endsAt: string;
  eventId: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  title: string;
}

export type EventDiscoveryFailure = 'authorization' | 'unavailable';

export class EventDiscoveryError extends Error {
  public constructor(public readonly failure: EventDiscoveryFailure) {
    super('Published events could not be loaded.');
    this.name = 'EventDiscoveryError';
  }
}

interface ListPlayerEventsOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export type EventEligibilityResult =
  | { status: 'reachable' }
  | { status: 'unreachable' }
  | {
      reason:
        | 'future_acquisition_time'
        | 'journey_too_fast'
        | 'location_accuracy'
        | 'stale_location';
      status: 'retry';
    }
  | { reason: 'ended' | 'not_started'; status: 'unavailable' };

export type EventEligibilityFailure =
  'authorization' | 'event-unavailable' | 'unavailable';

export class EventEligibilityError extends Error {
  public constructor(public readonly failure: EventEligibilityFailure) {
    super('Event eligibility could not be checked.');
    this.name = 'EventEligibilityError';
  }
}

interface EvaluateEventEligibilityOptions {
  apiBaseUrl: string;
  claim: LocationClaim;
  eventId: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export async function listPlayerEvents({
  apiBaseUrl,
  getAccessToken,
  signal,
}: ListPlayerEventsOptions): Promise<PlayerEvent[]> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new EventDiscoveryError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/events`, {
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

    throw new EventDiscoveryError('unavailable');
  }

  if (response.status === 401) {
    throw new EventDiscoveryError('authorization');
  }

  if (!response.ok) {
    throw new EventDiscoveryError('unavailable');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new EventDiscoveryError('unavailable');
  }

  return parseEventResponse(payload);
}

export async function evaluateEventEligibility({
  apiBaseUrl,
  claim,
  eventId,
  getAccessToken,
  signal,
}: EvaluateEventEligibilityOptions): Promise<EventEligibilityResult> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new EventEligibilityError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/events/${eventId}/eligibility`, {
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

    throw new EventEligibilityError('unavailable');
  }

  if (response.status === 401) {
    throw new EventEligibilityError('authorization');
  }

  if (response.status === 404) {
    throw new EventEligibilityError('event-unavailable');
  }

  if (!response.ok) {
    throw new EventEligibilityError('unavailable');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new EventEligibilityError('unavailable');
  }

  return parseEligibilityResponse(payload, eventId);
}

function parseEventResponse(payload: unknown): PlayerEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new EventDiscoveryError('unavailable');
  }

  const events = payload.events.map(parseEvent);

  if (typeof payload.requestId !== 'string') {
    throw new EventDiscoveryError('unavailable');
  }

  return events;
}

function parseEvent(value: unknown): PlayerEvent {
  if (
    !isRecord(value) ||
    typeof value.eventId !== 'string' ||
    typeof value.title !== 'string' ||
    (value.description !== null && typeof value.description !== 'string') ||
    !isCoordinate(value.latitude, -90, 90) ||
    !isCoordinate(value.longitude, -180, 180) ||
    typeof value.radiusMetres !== 'number' ||
    !Number.isFinite(value.radiusMetres) ||
    value.radiusMetres <= 0 ||
    !isDateTime(value.startsAt) ||
    !isDateTime(value.endsAt) ||
    !isAvailability(value.availability)
  ) {
    throw new EventDiscoveryError('unavailable');
  }

  return {
    availability: value.availability,
    description: value.description,
    endsAt: value.endsAt,
    eventId: value.eventId,
    latitude: value.latitude,
    longitude: value.longitude,
    radiusMetres: value.radiusMetres,
    startsAt: value.startsAt,
    title: value.title,
  };
}

function parseEligibilityResponse(
  payload: unknown,
  expectedEventId: string,
): EventEligibilityResult {
  if (
    !isRecord(payload) ||
    payload.eventId !== expectedEventId ||
    typeof payload.requestId !== 'string'
  ) {
    throw new EventEligibilityError('unavailable');
  }

  if (
    payload.status === 'reachable' &&
    payload.reachable === true &&
    payload.reason === undefined
  ) {
    return { status: 'reachable' };
  }

  if (
    payload.status === 'unreachable' &&
    payload.reachable === false &&
    payload.reason === undefined
  ) {
    return { status: 'unreachable' };
  }

  if (
    payload.status === 'retry' &&
    payload.reachable === null &&
    isRetryReason(payload.reason)
  ) {
    return { reason: payload.reason, status: 'retry' };
  }

  if (
    payload.status === 'unavailable' &&
    payload.reachable === false &&
    isUnavailableReason(payload.reason)
  ) {
    return { reason: payload.reason, status: 'unavailable' };
  }

  throw new EventEligibilityError('unavailable');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function isAvailability(value: unknown): value is PlayerEventAvailability {
  return value === 'active' || value === 'upcoming' || value === 'ended';
}

function isRetryReason(
  value: unknown,
): value is
  | 'future_acquisition_time'
  | 'journey_too_fast'
  | 'location_accuracy'
  | 'stale_location' {
  return (
    value === 'future_acquisition_time' ||
    value === 'journey_too_fast' ||
    value === 'location_accuracy' ||
    value === 'stale_location'
  );
}

function isUnavailableReason(value: unknown): value is 'ended' | 'not_started' {
  return value === 'ended' || value === 'not_started';
}
