create table public.movement_eligibility_decisions (
  id uuid primary key,
  movement_evidence_id uuid not null unique
    references public.movement_evidence (id) on delete cascade,
  -- This is deliberately a historical identifier rather than a foreign key.
  -- An anchor can expire before the later decision that cites it, and retention
  -- must not rewrite or delete the immutable decision audit.
  prior_movement_evidence_id uuid,
  reachability_status text not null,
  journey_outcome text not null,
  distance_metres double precision,
  uncertainty_adjusted_distance_metres double precision,
  elapsed_milliseconds bigint,
  required_speed_metres_per_second double precision,
  max_plausible_speed_metres_per_second double precision not null,
  created_at timestamptz not null,

  constraint movement_eligibility_decisions_distinct_evidence_check
    check (
      prior_movement_evidence_id is null
      or prior_movement_evidence_id <> movement_evidence_id
    ),
  constraint movement_eligibility_decisions_reachability_check
    check (reachability_status in ('reachable', 'unreachable', 'retry')),
  constraint movement_eligibility_decisions_outcome_check
    check (
      journey_outcome in (
        'not_evaluated',
        'baseline',
        'same_event',
        'plausible',
        'too_fast'
      )
    ),
  constraint movement_eligibility_decisions_threshold_check
    check (
      max_plausible_speed_metres_per_second > 0
      and max_plausible_speed_metres_per_second < 'Infinity'::double precision
    ),
  constraint movement_eligibility_decisions_metrics_check
    check (
      (journey_outcome in ('plausible', 'too_fast') and
       prior_movement_evidence_id is not null and
       distance_metres is not null and
       distance_metres >= 0 and
       distance_metres < 'Infinity'::double precision and
       uncertainty_adjusted_distance_metres is not null and
       uncertainty_adjusted_distance_metres >= 0 and
       uncertainty_adjusted_distance_metres < 'Infinity'::double precision and
       elapsed_milliseconds is not null and
       elapsed_milliseconds >= 0 and
       ((elapsed_milliseconds = 0 and
         required_speed_metres_per_second is null) or
        (elapsed_milliseconds > 0 and
         required_speed_metres_per_second is not null and
         required_speed_metres_per_second >= 0 and
         required_speed_metres_per_second < 'Infinity'::double precision)))
      or
      (journey_outcome not in ('plausible', 'too_fast') and
       distance_metres is null and
       uncertainty_adjusted_distance_metres is null and
       elapsed_milliseconds is null and
       required_speed_metres_per_second is null)
    ),
  constraint movement_eligibility_decisions_shape_check
    check (
      (journey_outcome = 'not_evaluated' and
       reachability_status <> 'reachable' and
       prior_movement_evidence_id is null)
      or
      (journey_outcome = 'baseline' and
       reachability_status = 'reachable' and
       prior_movement_evidence_id is null)
      or
      (journey_outcome = 'same_event' and
       reachability_status = 'reachable' and
       prior_movement_evidence_id is not null)
      or
      (journey_outcome in ('plausible', 'too_fast') and
       reachability_status = 'reachable' and
       prior_movement_evidence_id is not null)
    )
);

create index movement_evidence_player_received_idx
  on public.movement_evidence (player_id, received_at desc, acquired_at desc);

create function public.prevent_movement_eligibility_decision_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Movement eligibility decisions are immutable'
    using errcode = '55006';
end;
$$;

create trigger movement_eligibility_decision_immutability
before update on public.movement_eligibility_decisions
for each row
execute function public.prevent_movement_eligibility_decision_update();
