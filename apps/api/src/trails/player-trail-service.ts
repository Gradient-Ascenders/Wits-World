import type pg from 'pg';

export type PlayerTrailPublicationStatus = 'published' | 'retired';
export type PlayerTrailProgressStatus = 'in_progress' | 'completed' | 'retired';
export type PlayerTrailAvailability =
  'active' | 'upcoming' | 'ended' | 'retired';
export type PlayerTrailStepState =
  'completed' | 'current' | 'locked' | 'unavailable';
export type PlayerTrailUnavailableReason =
  | 'upcoming'
  | 'ended'
  | 'event_unavailable'
  | 'event_retired'
  | 'trail_retired';

export interface PlayerTrailSummary {
  trailId: string;
  title: string;
  description: string | null;
  publicationStatus: PlayerTrailPublicationStatus;
  availability: PlayerTrailAvailability;
  startsAt: string | null;
  endsAt: string | null;
  progressStatus: PlayerTrailProgressStatus;
  completedStepCount: number;
  totalSteps: number;
  currentStepPosition: number | null;
}

export interface PlayerTrailStep {
  position: number;
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
  state: PlayerTrailStepState;
  unavailableReason: PlayerTrailUnavailableReason | null;
  completedAt: string | null;
}

export interface PlayerTrail extends PlayerTrailSummary {
  steps: PlayerTrailStep[];
}

export interface NearbyTrailContext {
  trailId: string;
  title: string;
  position: number;
  totalSteps: number;
}

export interface NearbyUnvisitedEvent {
  eventId: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  endsAt: string;
  distanceMetres: number;
  trailContexts: NearbyTrailContext[];
}

export interface NearbyUnvisitedInput {
  playerId: string;
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  maxDistanceMetres: number;
  limit: number;
}

export interface PlayerTrailService {
  listTrails(playerId: string): Promise<PlayerTrailSummary[]>;
  getTrail(playerId: string, trailId: string): Promise<PlayerTrail>;
  listNearbyUnvisited(
    input: NearbyUnvisitedInput,
  ): Promise<NearbyUnvisitedEvent[]>;
}

export interface PlayerTrailDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface PlayerTrailRow extends pg.QueryResultRow {
  trail_id: string;
  trail_title: string;
  trail_description: string | null;
  trail_status: PlayerTrailPublicationStatus;
  trail_availability: PlayerTrailAvailability;
  trail_starts_at: Date | null;
  trail_ends_at: Date | null;
  position: number;
  event_id: string;
  event_title: string;
  event_description: string | null;
  latitude: number;
  longitude: number;
  radius_metres: number;
  starts_at: Date;
  ends_at: Date;
  event_is_published: boolean;
  event_retired_at: Date | null;
  event_availability: 'active' | 'upcoming' | 'ended' | 'unpublished';
  completed_at: Date | null;
}

interface NearbyUnvisitedRow extends pg.QueryResultRow {
  event_id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_metres: number;
  starts_at: Date;
  ends_at: Date;
  distance_metres: number;
  trail_id: string | null;
  trail_title: string | null;
  trail_position: number | null;
  trail_total_steps: number | null;
}

export class PlayerTrailNotFoundError extends Error {
  constructor() {
    super('The requested trail was not found.');
    this.name = 'PlayerTrailNotFoundError';
  }
}

export class InvalidNearbyUnvisitedSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNearbyUnvisitedSearchError';
  }
}

interface CreatePlayerTrailServiceOptions {
  clock?: () => Date;
}

export function createPlayerTrailService(
  database: PlayerTrailDatabase,
  { clock = () => new Date() }: CreatePlayerTrailServiceOptions = {},
): PlayerTrailService {
  return {
    async listTrails(playerId) {
      const now = clock();
      const rows = await loadVisibleTrailRows(database, playerId, now);

      return derivePlayerTrails(rows, now).map(mapPlayerTrailSummary);
    },

    async getTrail(playerId, trailId) {
      const now = clock();
      const rows = await loadVisibleTrailRows(database, playerId, now, trailId);
      const trail = derivePlayerTrails(rows, now)[0];

      if (!trail) {
        throw new PlayerTrailNotFoundError();
      }

      return trail;
    },

    async listNearbyUnvisited(input) {
      validateNearbyInput(input);

      const result = await database.query<NearbyUnvisitedRow>(
        NEARBY_UNVISITED_QUERY,
        [
          input.playerId,
          clock(),
          input.longitude,
          input.latitude,
          input.maxDistanceMetres,
          input.limit,
        ],
      );

      return mapNearbyEvents(result.rows);
    },
  };
}

async function loadVisibleTrailRows(
  database: PlayerTrailDatabase,
  playerId: string,
  now: Date,
  trailId?: string,
): Promise<PlayerTrailRow[]> {
  const result = await database.query<PlayerTrailRow>(
    `
      select
        trail.id::text as trail_id,
        trail.title as trail_title,
        trail.description as trail_description,
        trail.status as trail_status,
        trail_schedule.availability as trail_availability,
        trail_schedule.effective_starts_at as trail_starts_at,
        trail_schedule.effective_ends_at as trail_ends_at,
        step.position,
        event.id::text as event_id,
        event.title as event_title,
        event.description as event_description,
        st_y(placement.effective_location::geometry) as latitude,
        st_x(placement.effective_location::geometry) as longitude,
        event.radius_metres,
        coalesce(event_schedule.effective_starts_at, event.starts_at) as starts_at,
        coalesce(event_schedule.effective_ends_at, event.ends_at) as ends_at,
        event.is_published as event_is_published,
        event.retired_at as event_retired_at,
        event_schedule.availability as event_availability,
        completion.completed_at
      from public.trails trail
      join public.trail_events step
        on step.trail_id = trail.id
      join public.events event
        on event.id = step.event_id
      cross join lateral public.resolve_trail_availability(
        trail.id,
        $3::timestamptz
      ) trail_schedule
      cross join lateral public.resolve_event_placement_location(event.id, $3::timestamptz) placement
      cross join lateral public.resolve_event_availability(
        event.id,
        $3::timestamptz
      ) event_schedule
      left join public.event_completions completion
        on completion.player_id = $1::uuid
       and completion.event_id = event.id
      where placement.is_available = true
        and (
        (
          trail.status = 'published'
          and trail_schedule.availability <> 'retired'
        )
        or (
          (
            trail.status = 'retired'
            or trail_schedule.availability = 'retired'
          )
          and trail.published_at is not null
          and exists (
            select 1
            from public.trail_events visible_step
            join public.event_completions visible_completion
              on visible_completion.event_id = visible_step.event_id
             and visible_completion.player_id = $1::uuid
            where visible_step.trail_id = trail.id
          )
        )
      )
        and ($2::uuid is null or trail.id = $2::uuid)
      order by
        (trail.status = 'published') desc,
        trail.published_at desc,
        trail.id,
        step.position
    `,
    [playerId, trailId ?? null, now],
  );

  return result.rows;
}

function derivePlayerTrails(rows: PlayerTrailRow[], now: Date): PlayerTrail[] {
  const grouped = new Map<string, PlayerTrailRow[]>();

  for (const row of rows) {
    const trailRows = grouped.get(row.trail_id);

    if (trailRows) {
      trailRows.push(row);
    } else {
      grouped.set(row.trail_id, [row]);
    }
  }

  return [...grouped.values()].map((trailRows) =>
    derivePlayerTrail(trailRows, now),
  );
}

function mapPlayerTrailSummary(trail: PlayerTrail): PlayerTrailSummary {
  return {
    trailId: trail.trailId,
    title: trail.title,
    description: trail.description,
    publicationStatus: trail.publicationStatus,
    availability: trail.availability,
    startsAt: trail.startsAt,
    endsAt: trail.endsAt,
    progressStatus: trail.progressStatus,
    completedStepCount: trail.completedStepCount,
    totalSteps: trail.totalSteps,
    currentStepPosition: trail.currentStepPosition,
  };
}

function derivePlayerTrail(rows: PlayerTrailRow[], now: Date): PlayerTrail {
  const orderedRows = [...rows].sort(
    (left, right) => left.position - right.position,
  );
  const first = orderedRows[0];

  if (!first) {
    throw new Error('A visible trail must contain at least one event.');
  }

  let completedStepCount = 0;

  for (const row of orderedRows) {
    if (row.completed_at === null) {
      break;
    }

    completedStepCount += 1;
  }

  const totalSteps = orderedRows.length;
  const complete = completedStepCount === totalSteps;
  const trailAvailability: PlayerTrailAvailability =
    first.trail_status === 'retired' ? 'retired' : first.trail_availability;
  const progressStatus: PlayerTrailProgressStatus = complete
    ? 'completed'
    : trailAvailability === 'retired'
      ? 'retired'
      : 'in_progress';
  const currentStepPosition = complete ? null : completedStepCount + 1;

  return {
    trailId: first.trail_id,
    title: first.trail_title,
    description: first.trail_description,
    publicationStatus: first.trail_status,
    availability: trailAvailability,
    startsAt: first.trail_starts_at?.toISOString() ?? null,
    endsAt: first.trail_ends_at?.toISOString() ?? null,
    progressStatus,
    completedStepCount,
    totalSteps,
    currentStepPosition,
    steps: orderedRows.map((row, index) =>
      mapPlayerTrailStep(
        row,
        index,
        completedStepCount,
        first.trail_status,
        trailAvailability,
        now,
      ),
    ),
  };
}

function mapPlayerTrailStep(
  row: PlayerTrailRow,
  index: number,
  completedStepCount: number,
  trailStatus: PlayerTrailPublicationStatus,
  trailAvailability: PlayerTrailAvailability,
  now: Date,
): PlayerTrailStep {
  const common = {
    position: row.position,
    eventId: row.event_id,
    title: row.event_title,
    description: row.event_description,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radius_metres,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
  };

  if (index < completedStepCount) {
    return {
      ...common,
      state: 'completed',
      unavailableReason: null,
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }

  if (trailStatus === 'retired' || trailAvailability === 'retired') {
    return {
      ...common,
      state: 'unavailable',
      unavailableReason: 'trail_retired',
      completedAt: null,
    };
  }

  if (index > completedStepCount) {
    return {
      ...common,
      state: 'locked',
      unavailableReason: null,
      completedAt: null,
    };
  }

  if (trailAvailability === 'upcoming' || trailAvailability === 'ended') {
    return {
      ...common,
      state: 'unavailable',
      unavailableReason: trailAvailability,
      completedAt: null,
    };
  }

  const unavailableReason = currentStepUnavailableReason(row, now);

  return {
    ...common,
    state: unavailableReason === null ? 'current' : 'unavailable',
    unavailableReason,
    completedAt: null,
  };
}

function currentStepUnavailableReason(
  row: PlayerTrailRow,
  now: Date,
): PlayerTrailUnavailableReason | null {
  if (!row.event_is_published || row.event_retired_at !== null) {
    return 'event_retired';
  }

  if (row.event_availability === 'unpublished') return 'event_unavailable';

  if (
    row.event_availability === 'upcoming' ||
    now.getTime() < row.starts_at.getTime()
  ) {
    return 'upcoming';
  }

  if (
    row.event_availability === 'ended' ||
    now.getTime() >= row.ends_at.getTime()
  ) {
    return 'ended';
  }

  return null;
}

function validateNearbyInput(input: NearbyUnvisitedInput): void {
  if (
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  ) {
    throw new InvalidNearbyUnvisitedSearchError(
      'Latitude must be between -90 and 90 degrees.',
    );
  }

  if (
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new InvalidNearbyUnvisitedSearchError(
      'Longitude must be between -180 and 180 degrees.',
    );
  }

  if (!Number.isFinite(input.accuracyMetres) || input.accuracyMetres < 0) {
    throw new InvalidNearbyUnvisitedSearchError(
      'Reported accuracy must be a finite non-negative number.',
    );
  }

  if (
    !Number.isFinite(input.maxDistanceMetres) ||
    input.maxDistanceMetres < 100 ||
    input.maxDistanceMetres > 5_000
  ) {
    throw new InvalidNearbyUnvisitedSearchError(
      'Maximum distance must be between 100 and 5000 metres.',
    );
  }

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new InvalidNearbyUnvisitedSearchError(
      'Result limit must be an integer between 1 and 50.',
    );
  }
}

function mapNearbyEvents(rows: NearbyUnvisitedRow[]): NearbyUnvisitedEvent[] {
  const events = new Map<string, NearbyUnvisitedEvent>();

  for (const row of rows) {
    let event = events.get(row.event_id);

    if (!event) {
      event = {
        eventId: row.event_id,
        title: row.title,
        description: row.description,
        latitude: row.latitude,
        longitude: row.longitude,
        radiusMetres: row.radius_metres,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        distanceMetres: row.distance_metres,
        trailContexts: [],
      };
      events.set(row.event_id, event);
    }

    if (
      row.trail_id !== null &&
      row.trail_title !== null &&
      row.trail_position !== null &&
      row.trail_total_steps !== null
    ) {
      event.trailContexts.push({
        trailId: row.trail_id,
        title: row.trail_title,
        position: row.trail_position,
        totalSteps: row.trail_total_steps,
      });
    }
  }

  return [...events.values()];
}

export const NEARBY_UNVISITED_QUERY = `
  with published_trail_steps as (
    select
      trail.id as trail_id,
      trail.title as trail_title,
      step.event_id,
      step.position,
      count(*) over (partition by trail.id)::int as total_steps,
      completion.id is not null as is_completed
    from public.trails trail
    join public.trail_events step
      on step.trail_id = trail.id
    cross join lateral public.resolve_trail_availability(
      trail.id,
      $2::timestamptz
    ) trail_schedule
    left join public.event_completions completion
      on completion.player_id = $1::uuid
     and completion.event_id = step.event_id
    where trail.status = 'published'
      and trail_schedule.availability = 'active'
  ),
  trail_current_positions as (
    select
      trail_id,
      min(position) filter (where is_completed = false) as current_position
    from published_trail_steps
    group by trail_id
  ),
  trail_current as (
    select step.*
    from published_trail_steps step
    join trail_current_positions current
      on current.trail_id = step.trail_id
     and current.current_position = step.position
  ),
  published_member_events as (
    select distinct event_id
    from published_trail_steps
  ),
  claim as (
    select st_setsrid(
      st_makepoint($3::double precision, $4::double precision),
      4326
    )::geography as location
  ),
  geographic_candidates as (
    -- Keep both geographic searches on indexed stored points. The placement
    -- resolver below remains authoritative for availability and distance.
    select event.id
    from public.events event
    cross join claim
    where st_dwithin(
      event.location,
      claim.location,
      $5::double precision
    )
      and not exists (
        select 1
        from public.event_placement_portability portability
        where portability.event_id = event.id
          and portability.effective_at <= $2::timestamptz
      )
    union
    select assignment.event_id as id
    from public.event_placement_sites site
    join public.event_placement_assignments assignment
      on assignment.site_id = site.id
    cross join claim
    where st_dwithin(
      site.location,
      claim.location,
      $5::double precision
    )
      and assignment.starts_at <= $2::timestamptz
      and (assignment.ends_at is null or assignment.ends_at > $2::timestamptz)
  ),
  nearby_candidates as (
    select
      event.id,
      event.title,
      event.description,
      placement.effective_location as location,
      event.radius_metres,
      event_schedule.effective_starts_at as starts_at,
      event_schedule.effective_ends_at as ends_at,
      st_distance(placement.effective_location, claim.location) as distance_metres
    from geographic_candidates geographic_candidate
    join public.events event on event.id = geographic_candidate.id
    cross join claim
    cross join lateral public.resolve_event_placement_location(event.id, $2::timestamptz) placement
    cross join lateral public.resolve_event_availability(
      event.id,
      $2::timestamptz
    ) event_schedule
    where event.is_published = true
      and event.retired_at is null
      and event_schedule.availability = 'active'
      and placement.is_available = true
      and not exists (
        select 1
        from public.event_completions completion
        where completion.player_id = $1::uuid
          and completion.event_id = event.id
      )
      and st_dwithin(
        placement.effective_location,
        claim.location,
        $5::double precision
      )
      and (
        not exists (
          select 1
          from published_member_events member
          where member.event_id = event.id
        )
        or exists (
          select 1
          from trail_current current
          where current.event_id = event.id
        )
      )
    order by distance_metres, event.id
    limit $6::integer
  )
  select
    candidate.id::text as event_id,
    candidate.title,
    candidate.description,
    st_y(candidate.location::geometry) as latitude,
    st_x(candidate.location::geometry) as longitude,
    candidate.radius_metres,
    candidate.starts_at,
    candidate.ends_at,
    candidate.distance_metres,
    current.trail_id::text as trail_id,
    current.trail_title,
    current.position as trail_position,
    current.total_steps as trail_total_steps
  from nearby_candidates candidate
  left join trail_current current
    on current.event_id = candidate.id
  order by candidate.distance_metres, candidate.id, current.trail_id
`;
