import type pg from 'pg';

export interface EventEligibilityInput {
  eventId: string;
  latitude: number;
  longitude: number;
}

export type EventUnavailabilityReason = 'unpublished' | 'not_started' | 'ended';

export type EventEligibilityResult =
  | {
      outcome: 'not_found';
      eventId: string;
    }
  | {
      outcome: 'unavailable';
      eventId: string;
      reason: EventUnavailabilityReason;
    }
  | {
      outcome: 'evaluated';
      eventId: string;
      eligible: boolean;
      distanceMetres: number;
      radiusMetres: number;
      assignmentId?: string;
    };

export interface EventEligibilityService {
  evaluate(input: EventEligibilityInput): Promise<EventEligibilityResult>;
}

export interface EventEligibilityQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface CreateEventEligibilityServiceOptions {
  clock?: () => Date;
}

interface EventEligibilityRow extends pg.QueryResultRow {
  availability: 'available' | EventUnavailabilityReason;
  distance_metres: number | null;
  event_id: string;
  radius_metres: number;
  within_radius: boolean | null;
  assignment_id: string | null;
}

export class InvalidEventCoordinatesError extends RangeError {
  constructor(
    public readonly field: 'latitude' | 'longitude',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidEventCoordinatesError';
  }
}

export function createEventEligibilityService(
  database: EventEligibilityQueryable,
  { clock = () => new Date() }: CreateEventEligibilityServiceOptions = {},
): EventEligibilityService {
  return {
    async evaluate(input) {
      validateCoordinates(input);

      const result = await database.query<EventEligibilityRow>(
        EVENT_ELIGIBILITY_QUERY,
        [input.eventId, input.longitude, input.latitude, clock()],
      );
      const row = result.rows[0];

      if (!row) {
        return {
          outcome: 'not_found',
          eventId: input.eventId,
        };
      }

      if (row.availability !== 'available') {
        return {
          outcome: 'unavailable',
          eventId: row.event_id,
          reason: row.availability,
        };
      }

      if (
        !Number.isFinite(row.distance_metres) ||
        !Number.isFinite(row.radius_metres) ||
        typeof row.within_radius !== 'boolean'
      ) {
        throw new Error('Event eligibility query returned an invalid result.');
      }

      return {
        outcome: 'evaluated',
        eventId: row.event_id,
        eligible: row.within_radius,
        distanceMetres: row.distance_metres!,
        radiusMetres: row.radius_metres,
        ...(row.assignment_id ? { assignmentId: row.assignment_id } : {}),
      };
    },
  };
}

function validateCoordinates({
  latitude,
  longitude,
}: EventEligibilityInput): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new InvalidEventCoordinatesError(
      'latitude',
      'Latitude must be a finite number between -90 and 90 degrees.',
    );
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new InvalidEventCoordinatesError(
      'longitude',
      'Longitude must be a finite number between -180 and 180 degrees.',
    );
  }
}

const EVENT_ELIGIBILITY_QUERY = `
  with claim as (
    select st_setsrid(
             st_makepoint($2::double precision, $3::double precision),
             4326
           )::geography as location
  ), event_status as (
    select event.id,
           placement.effective_location as location,
           placement.placement_assignment_id::text as assignment_id,
           event.radius_metres,
           case
             when not placement.is_available then 'unpublished'
             when effective.availability = 'active' then 'available'
             when effective.availability = 'upcoming' then 'not_started'
             when effective.availability = 'ended' then 'ended'
             else 'unpublished'
           end as availability
      from public.events event
      cross join lateral public.resolve_event_availability(
        event.id,
        $4::timestamptz
      ) effective
      cross join lateral public.resolve_event_placement_location(
        event.id,
        $4::timestamptz
      ) placement
     where event.id = $1::uuid
  )
  select event_status.id::text as event_id,
         event_status.radius_metres,
         event_status.availability,
         event_status.assignment_id,
         case when event_status.availability = 'available'
              then st_distance(event_status.location, claim.location)
              else null
          end as distance_metres,
         case when event_status.availability = 'available'
              then st_dwithin(
                     event_status.location,
                     claim.location,
                     event_status.radius_metres
                   )
              else null
          end as within_radius
    from event_status
    cross join claim
`;
