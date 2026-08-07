import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

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
