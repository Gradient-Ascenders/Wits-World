-- Issue #278: retain only coarse operational product-event aggregates for the
-- discovery/eligibility stages that do not already have authoritative durable
-- domain records. Do not retain player identity or precise coordinates here.
create table public.event_product_event_aggregates (
  event_id uuid not null
    references public.events (id) on delete restrict,
  location_key uuid not null,
  placement_assignment_id uuid
    references public.event_placement_assignments (id) on delete restrict,
  bucket_start timestamptz not null,
  view_count integer not null default 0,
  eligible_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_product_event_aggregates_primary_key
    primary key (event_id, location_key, bucket_start),
  constraint event_product_event_aggregates_location_key_check
    check (
      (placement_assignment_id is null and location_key = event_id)
      or
      (placement_assignment_id is not null and location_key = placement_assignment_id)
    ),
  constraint event_product_event_aggregates_hour_bucket_check
    check (
      bucket_start =
        date_trunc('hour', bucket_start at time zone 'UTC') at time zone 'UTC'
    ),
  constraint event_product_event_aggregates_counts_check
    check (view_count >= 0 and eligible_count >= 0),
  constraint event_product_event_aggregates_timestamps_check
    check (updated_at >= created_at)
);

create index event_product_event_aggregates_bucket_idx
  on public.event_product_event_aggregates
  (bucket_start, event_id, placement_assignment_id);

create index event_product_event_aggregates_assignment_idx
  on public.event_product_event_aggregates
  (placement_assignment_id, bucket_start, event_id)
  where placement_assignment_id is not null;

-- The remaining funnel and issuance stages stay authoritative in their
-- existing domain tables; these indexes make bounded operational reads cheap
-- without introducing parallel counters.
create index challenge_attempts_started_at_analytics_idx
  on public.challenge_attempts
  (started_at, event_id, placement_assignment_id);

create index event_completions_completed_at_analytics_idx
  on public.event_completions
  (completed_at, event_id, attempt_id);

create index event_completion_card_rewards_awarded_at_analytics_idx
  on public.event_completion_card_rewards
  (awarded_at, card_definition_id, completion_id);
