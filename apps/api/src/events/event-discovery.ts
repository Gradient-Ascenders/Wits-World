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
      }));
    },
  };
}

const EVENT_DISCOVERY_QUERY = `
  select event.id::text as event_id,
         event.title,
         event.description,
         st_y(event.location::geometry) as latitude,
         st_x(event.location::geometry) as longitude,
         event.radius_metres,
         event.starts_at,
         event.ends_at,
         case
           when $1::timestamptz < event.starts_at then 'upcoming'
           when $1::timestamptz >= event.ends_at then 'ended'
           else 'active'
         end as availability
    from public.events event
   where event.is_published = true
   order by event.starts_at asc, event.id asc
`;
