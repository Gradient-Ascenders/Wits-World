import type pg from 'pg';

export type PlayerEventAvailability = 'active' | 'upcoming' | 'ended';

export interface PlayerEvent {
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
  availability: PlayerEventAvailability;
  placementAssignmentId?: string;
}

export interface EventDiscoveryService {
  list(): Promise<PlayerEvent[]>;
}

export interface EventDiscoveryQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface CreateEventDiscoveryServiceOptions {
  clock?: () => Date;
}

interface CreateCachedEventDiscoveryServiceOptions {
  clock?: () => Date;
  maxAgeMs?: number;
}

interface PlayerEventRow extends pg.QueryResultRow {
  event_id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_metres: number;
  starts_at: Date;
  ends_at: Date;
  availability: PlayerEventAvailability;
  placement_assignment_id: string | null;
}

export function createEventDiscoveryService(
  database: EventDiscoveryQueryable,
  { clock = () => new Date() }: CreateEventDiscoveryServiceOptions = {},
): EventDiscoveryService {
  return {
    async list() {
      const result = await database.query<PlayerEventRow>(
        EVENT_DISCOVERY_QUERY,
        [clock()],
      );

      return result.rows.map((row) => ({
        eventId: row.event_id,
        title: row.title,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        radiusMetres: row.radius_metres,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        availability: row.availability,
        ...(row.placement_assignment_id
          ? { placementAssignmentId: row.placement_assignment_id }
          : {}),
      }));
    },
  };
}

const DEFAULT_EVENT_DISCOVERY_CACHE_MAX_AGE_MS = 5_000;

export function createCachedEventDiscoveryService(
  source: EventDiscoveryService,
  {
    clock = () => new Date(),
    maxAgeMs = DEFAULT_EVENT_DISCOVERY_CACHE_MAX_AGE_MS,
  }: CreateCachedEventDiscoveryServiceOptions = {},
): EventDiscoveryService {
  let cached:
    { events: PlayerEvent[]; expiresAtMilliseconds: number } | undefined;
  let inFlight: Promise<PlayerEvent[]> | undefined;

  return {
    async list() {
      const nowMilliseconds = clock().getTime();

      if (cached && nowMilliseconds < cached.expiresAtMilliseconds) {
        return cloneEvents(cached.events);
      }

      if (!inFlight) {
        inFlight = source
          .list()
          .then((events) => {
            const loadedAtMilliseconds = clock().getTime();
            cached = {
              events: cloneEvents(events),
              expiresAtMilliseconds: calculateCacheExpiry(
                events,
                loadedAtMilliseconds,
                maxAgeMs,
              ),
            };

            return cached.events;
          })
          .finally(() => {
            inFlight = undefined;
          });
      }

      return cloneEvents(await inFlight);
    },
  };
}

function calculateCacheExpiry(
  events: PlayerEvent[],
  loadedAtMilliseconds: number,
  maxAgeMs: number,
): number {
  let expiresAtMilliseconds = loadedAtMilliseconds + Math.max(0, maxAgeMs);

  for (const event of events) {
    for (const transition of [event.startsAt, event.endsAt]) {
      const transitionMilliseconds = Date.parse(transition);

      if (
        transitionMilliseconds > loadedAtMilliseconds &&
        transitionMilliseconds < expiresAtMilliseconds
      ) {
        expiresAtMilliseconds = transitionMilliseconds;
      }
    }
  }

  return expiresAtMilliseconds;
}

function cloneEvents(events: PlayerEvent[]): PlayerEvent[] {
  return events.map((event) => ({ ...event }));
}

const EVENT_DISCOVERY_QUERY = `
  select event.id::text as event_id,
         event.title,
         event.description,
         st_y(placement.effective_location::geometry) as latitude,
         st_x(placement.effective_location::geometry) as longitude,
         event.radius_metres,
         effective.effective_starts_at as starts_at,
         effective.effective_ends_at as ends_at,
         effective.availability,
         placement.placement_assignment_id::text as placement_assignment_id
    from public.events event
    cross join lateral public.resolve_event_availability(
      event.id,
      $1::timestamptz
    ) effective
    cross join lateral public.resolve_event_placement_location(
      event.id,
      $1::timestamptz
    ) placement
   where event.is_published = true
     and effective.availability <> 'unpublished'
     and placement.is_available = true
   order by effective.effective_starts_at asc, event.id asc
`;
