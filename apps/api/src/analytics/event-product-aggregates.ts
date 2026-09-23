import type pg from 'pg';

export interface EventProductAnalyticsDatabase {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface EventViewImpression {
  eventId: string;
  placementAssignmentId?: string;
}

export interface EventEligibilityAggregateInput {
  eventId: string;
  placementAssignmentId?: string;
}

export interface EventProductAnalyticsRecorder {
  recordViews(
    events: readonly EventViewImpression[],
    observedAt: Date,
  ): Promise<void>;
  recordEligibility(
    input: EventEligibilityAggregateInput,
    observedAt: Date,
  ): Promise<void>;
}

interface RecordedEventRow extends pg.QueryResultRow {
  event_id: string;
}

export function createEventProductAnalyticsRecorder(
  database: EventProductAnalyticsDatabase,
): EventProductAnalyticsRecorder {
  return {
    async recordViews(events, observedAt) {
      if (events.length === 0) return;

      const uniqueEvents = new Map<string, EventViewImpression>();
      for (const event of events) {
        uniqueEvents.set(event.eventId, event);
      }

      const impressions = [...uniqueEvents.values()];
      const result = await database.query<RecordedEventRow>(
        RECORD_EVENT_VIEWS_QUERY,
        [
          impressions.map((event) => event.eventId),
          impressions.map((event) => event.placementAssignmentId ?? null),
          observedAt,
        ],
      );

      if (result.rows.length !== impressions.length) {
        throw new Error(
          'Event analytics view aggregation could not resolve every event location.',
        );
      }
    },

    async recordEligibility(input, observedAt) {
      const result = await database.query<RecordedEventRow>(
        RECORD_EVENT_ELIGIBILITY_QUERY,
        [input.eventId, input.placementAssignmentId ?? null, observedAt],
      );

      if (!result.rows[0]) {
        throw new Error(
          'Event analytics eligibility aggregation could not resolve the event location.',
        );
      }
    },
  };
}

const UTC_HOUR_BUCKET_EXPRESSION = `
  date_trunc('hour', $3::timestamptz at time zone 'UTC') at time zone 'UTC'
`;

const RECORD_EVENT_VIEWS_QUERY = `
  with input as (
    select event_id, placement_assignment_id
      from unnest($1::uuid[], $2::uuid[])
        as supplied(event_id, placement_assignment_id)
  ), validated as (
    select distinct
           input.event_id,
           input.placement_assignment_id,
           coalesce(input.placement_assignment_id, input.event_id) as location_key
      from input
      join public.events event on event.id = input.event_id
      left join public.event_placement_assignments assignment
        on assignment.id = input.placement_assignment_id
       and assignment.event_id = input.event_id
     where input.placement_assignment_id is null
        or assignment.id is not null
  ), inserted as (
    insert into public.event_product_event_aggregates (
      event_id,
      location_key,
      placement_assignment_id,
      bucket_start,
      view_count,
      eligible_count
    )
    select validated.event_id,
           validated.location_key,
           validated.placement_assignment_id,
           ${UTC_HOUR_BUCKET_EXPRESSION},
           1,
           0
      from validated
    on conflict (event_id, location_key, bucket_start)
    do update
      set view_count = public.event_product_event_aggregates.view_count + 1,
          updated_at = now()
    returning event_id::text
  )
  select event_id from inserted
`;

const RECORD_EVENT_ELIGIBILITY_QUERY = `
  with validated as (
    select event.id as event_id,
           $2::uuid as placement_assignment_id,
           coalesce($2::uuid, event.id) as location_key
      from public.events event
      left join public.event_placement_assignments assignment
        on assignment.id = $2::uuid
       and assignment.event_id = event.id
     where event.id = $1::uuid
       and ($2::uuid is null or assignment.id is not null)
  ), inserted as (
    insert into public.event_product_event_aggregates (
      event_id,
      location_key,
      placement_assignment_id,
      bucket_start,
      view_count,
      eligible_count
    )
    select validated.event_id,
           validated.location_key,
           validated.placement_assignment_id,
           ${UTC_HOUR_BUCKET_EXPRESSION},
           0,
           1
      from validated
    on conflict (event_id, location_key, bucket_start)
    do update
      set eligible_count = public.event_product_event_aggregates.eligible_count + 1,
          updated_at = now()
    returning event_id::text
  )
  select event_id from inserted
`;
