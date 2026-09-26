-- Portable events receive their effective location from an active placement
-- assignment. Do not persist an authored point merely to satisfy the original
-- fixed-event schema.
alter table public.events
  alter column location drop not null;

create or replace function public.protect_event_authoring_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if old.authoring_status <> 'draft' and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or (new.location is null) <> (old.location is null)
    or (
      new.location is not null
      and old.location is not null
      and not st_equals(new.location::geometry, old.location::geometry)
    )
    or new.radius_metres is distinct from old.radius_metres
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
  ) then
    raise exception 'Non-draft event % content is immutable', old.id
      using errcode = '55006';
  end if;

  if new.is_published and not old.is_published then
    perform public.validate_event_publication(old.id);
  end if;

  return new;
end;
$$;

create function public.validate_event_location_or_portability()
returns trigger
language plpgsql
as $$
declare
  event_id_to_validate uuid;
begin
  if tg_table_name = 'events' then
    event_id_to_validate := new.id;
  else
    event_id_to_validate := new.event_id;
  end if;

  if exists (
    select 1
      from public.events event
     where event.id = event_id_to_validate
       and event.authoring_status <> 'retired'
       and event.location is null
       and not exists (
         select 1
           from public.event_placement_portability portability
          where portability.event_id = event.id
            and portability.ended_at is null
       )
  ) then
    raise exception 'An event without an authored location must remain portable'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger events_location_or_portability_validation
after insert or update on public.events
deferrable initially deferred
for each row execute function public.validate_event_location_or_portability();

create constraint trigger event_placement_portability_location_validation
after insert or update on public.event_placement_portability
deferrable initially deferred
for each row execute function public.validate_event_location_or_portability();
