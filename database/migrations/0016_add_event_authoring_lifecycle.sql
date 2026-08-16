alter table public.events
  add column retired_at timestamptz;

alter table public.events
  add constraint events_retired_not_published_check
    check (
      retired_at is null
      or is_published = false
    );

create function public.validate_event_publication(
  event_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  published_challenge_id uuid;
  active_common_count integer;
begin
  select challenge.id
    into published_challenge_id
    from public.event_challenges challenge
   where challenge.event_id = event_id_to_validate
     and challenge.status = 'published';

  if published_challenge_id is null then
    raise exception
      'Event % requires a published challenge before publication',
      event_id_to_validate
      using errcode = '23514';
  end if;

  perform public.validate_published_challenge(
    published_challenge_id
  );

  select count(*)
    into active_common_count
    from public.card_definitions
   where rarity = 'common'
     and is_active = true;

  if active_common_count < 1 then
    raise exception
      'Event % requires at least one active Common reward card before publication',
      event_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function public.protect_event_authoring_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if old.retired_at is not null then
    if new.retired_at is distinct from old.retired_at
       or new.is_published is distinct from old.is_published
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or not st_equals(
         new.location::geometry,
         old.location::geometry
       )
       or new.radius_metres is distinct from old.radius_metres
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at then
      raise exception
        'Retired event % is immutable',
        old.id
        using errcode = '55006';
    end if;

    return new;
  end if;

  if old.is_published then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or not st_equals(
         new.location::geometry,
         old.location::geometry
       )
       or new.radius_metres is distinct from old.radius_metres
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at then
      raise exception
        'Published event % is immutable; retire it before creating a replacement',
        old.id
        using errcode = '55006';
    end if;

    if new.is_published = false
       and new.retired_at is null then
      raise exception
        'Published event % cannot return to draft',
        old.id
        using errcode = '55006';
    end if;

    return new;
  end if;

  if new.is_published
     and old.is_published = false then
    perform public.validate_event_publication(old.id);
  end if;

  return new;
end;
$$;

create trigger events_authoring_lifecycle_guard
before update on public.events
for each row
execute function public.protect_event_authoring_lifecycle();

create function public.prevent_published_event_challenge_retirement()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published'
     and new.status = 'retired'
     and exists (
       select 1
       from public.events event
       where event.id = old.event_id
         and event.is_published = true
     ) then
    raise exception
      'Published challenge % cannot be retired while event % is published',
      old.id,
      old.event_id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_challenges_published_event_guard
before update of status on public.event_challenges
for each row
execute function public.prevent_published_event_challenge_retirement();