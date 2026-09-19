-- Issue #262: keep scheduled rotations unique without preventing Author plans.
drop index public.event_placement_plans_committed_bucket_uidx;
create unique index event_placement_plans_scheduled_bucket_uidx
  on public.event_placement_plans (policy_version_id, rotation_bucket)
  where status in ('applied', 'degraded') and trigger_kind = 'scheduled';

alter table public.event_placement_plans
  drop constraint event_placement_plans_trigger_check;
alter table public.event_placement_plans
  add constraint event_placement_plans_trigger_check
    check (trigger_kind in ('scheduled', 'manual', 'rollback', 'reconcile'));
alter table public.event_placement_plans
  drop constraint event_placement_plans_manual_actor_check;
alter table public.event_placement_plans
  add constraint event_placement_plans_manual_actor_check
    check (
      (trigger_kind in ('scheduled', 'reconcile') and requested_by_player_id is null)
      or (trigger_kind in ('manual', 'rollback') and requested_by_player_id is not null)
    );

create or replace function public.protect_event_placement_state()
returns trigger
language plpgsql
as $$
declare
  plan_policy text;
  plan_status text;
  plan_version bigint;
begin
  if tg_op = 'DELETE' then
    raise exception 'Event placement state is a retained singleton'
      using errcode = '55006';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Event placement state updates must increment version once'
      using errcode = '40001';
  end if;

  if new.current_plan_id is not null then
    select policy_version_id, status, committed_state_version
      into plan_policy, plan_status, plan_version
      from public.event_placement_plans
     where id = new.current_plan_id;

    if plan_policy is distinct from new.current_policy_version_id
       or plan_status not in ('applied', 'degraded')
       or plan_version is null
       or plan_version > new.version
       or (new.current_plan_id is distinct from old.current_plan_id
           and plan_version <> new.version) then
      raise exception 'Placement state must reference its current-policy committed plan'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

alter table public.challenge_attempts
  add column placement_assignment_id uuid
    references public.event_placement_assignments (id) on delete restrict;

create index challenge_attempts_placement_assignment_idx
  on public.challenge_attempts (placement_assignment_id)
  where placement_assignment_id is not null;

alter table public.event_placement_audit
  drop constraint event_placement_audit_operation_check;
alter table public.event_placement_audit
  add constraint event_placement_audit_operation_check
    check (
      operation in (
        'apply_plan', 'record_failure', 'pin', 'exclude_site', 'pause',
        'end_override', 'suspend_site', 'retire_site', 'suspend_zone',
        'retire_zone', 'reactivate_site', 'reactivate_zone', 'rollback',
        'approve_portability', 'end_portability'
      )
    );

-- One server-side location source for fixed and placement-managed content.
-- An event with portability history never silently falls back to its authored
-- point after losing an assignment or approval.
create function public.resolve_event_placement_location(
  event_id_to_resolve uuid,
  evaluated_at timestamptz
)
returns table (
  effective_location geography(Point, 4326),
  placement_assignment_id uuid,
  is_available boolean
)
language sql
stable
as $$
  with target as (
    select event.location,event.radius_metres
    from public.events event
    where event.id = event_id_to_resolve
  ), managed as (
    select exists (
      select 1
      from public.event_placement_portability portability
      where portability.event_id = event_id_to_resolve
        and portability.effective_at <= evaluated_at
    ) as was_portable
  ), active_assignment as (
    select assignment.id, site.location
    from public.event_placement_assignments assignment
    join public.event_placement_sites site on site.id = assignment.site_id
    join public.event_placement_zones zone on zone.id = assignment.zone_id
    join public.event_placement_state state on state.singleton = true
    join public.event_placement_policy_versions policy
      on policy.id = state.current_policy_version_id
    cross join target
    where assignment.event_id = event_id_to_resolve
      and assignment.policy_version_id = state.current_policy_version_id
      and assignment.starts_at <= evaluated_at
      and (assignment.ends_at is null or assignment.ends_at > evaluated_at)
      -- Assignment periods retain the site and zone decision at its start.
      -- Current lifecycle status must not erase a valid offline start in history.
      and not exists (
        select 1 from public.event_placement_overrides exclusion
        where exclusion.kind = 'site_exclusion'
          and exclusion.site_id = site.id
          and (exclusion.ended_at is null or exclusion.ended_at > evaluated_at)
          and exclusion.starts_at <= evaluated_at
          and exclusion.expires_at > evaluated_at
      )
      and not exists (
        select 1
        from public.events fixed_event
        cross join lateral public.resolve_event_availability(
          fixed_event.id, evaluated_at
        ) availability
        where fixed_event.id <> event_id_to_resolve
          and fixed_event.is_published = true
          and availability.availability = 'active'
          and not exists (
            select 1 from public.event_placement_portability fixed_portability
            where fixed_portability.event_id = fixed_event.id
              and fixed_portability.effective_at <= evaluated_at
          )
          and st_distance(site.location, fixed_event.location) < greatest(
            policy.minimum_separation_metres,
            target.radius_metres + fixed_event.radius_metres
          )
      )
      and exists (
        select 1
        from public.event_placement_portability portability
        where portability.event_id = event_id_to_resolve
          and portability.policy_version_id = assignment.policy_version_id
          and portability.effective_at <= evaluated_at
          and (portability.ended_at is null or portability.ended_at > evaluated_at)
      )
    order by assignment.starts_at desc, assignment.id
    limit 1
  )
  select
    case when managed.was_portable then active_assignment.location
         else target.location end,
    active_assignment.id,
    case when managed.was_portable then active_assignment.id is not null
         else true end
  from target
  cross join managed
  left join active_assignment on true;
$$;
