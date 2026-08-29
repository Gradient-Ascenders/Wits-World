create table public.trails (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft',
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trails_title_not_blank
    check (btrim(title) <> ''),
  constraint trails_description_not_blank
    check (
      description is null
      or btrim(description) <> ''
    ),
  constraint trails_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint trails_lifecycle_check
    check (
      (
        status = 'draft'
        and published_at is null
        and retired_at is null
      )
      or
      (
        status = 'published'
        and published_at is not null
        and retired_at is null
      )
      or
      (
        status = 'retired'
        and retired_at is not null
      )
    ),
  constraint trails_timestamps_valid
    check (
      updated_at >= created_at
      and (
        published_at is null
        or published_at >= created_at
      )
      and (
        retired_at is null
        or retired_at >= created_at
      )
      and (
        published_at is null
        or retired_at is null
        or retired_at >= published_at
      )
    )
);

create table public.trail_events (
  trail_id uuid not null
    references public.trails (id) on delete restrict,
  event_id uuid not null
    references public.events (id) on delete restrict,
  position smallint not null,

  primary key (trail_id, event_id),
  constraint trail_events_position_unique
    unique (trail_id, position),
  constraint trail_events_position_check
    check (position between 1 and 50)
);

create index trails_published_idx
  on public.trails (published_at desc, id)
  where status = 'published';

create index trails_retired_idx
  on public.trails (retired_at desc, id)
  where status = 'retired';

create index trail_events_event_idx
  on public.trail_events (event_id, trail_id, position);

create function public.validate_trail_positions(
  trail_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  step_count integer;
  first_position integer;
  last_position integer;
begin
  select
    count(*)::integer,
    min(position)::integer,
    max(position)::integer
  into
    step_count,
    first_position,
    last_position
  from public.trail_events
  where trail_id = trail_id_to_validate;

  if step_count > 50 then
    raise exception
      'Trail % cannot contain more than 50 events',
      trail_id_to_validate
      using errcode = '23514';
  end if;

  if step_count > 0
     and (
       first_position <> 1
       or last_position <> step_count
     ) then
    raise exception
      'Trail % event positions must be contiguous from 1',
      trail_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function public.validate_trail_positions_after_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.validate_trail_positions(old.trail_id);
  end if;

  if tg_op <> 'DELETE'
     and (
       tg_op = 'INSERT'
       or new.trail_id is distinct from old.trail_id
     ) then
    perform public.validate_trail_positions(new.trail_id);
  end if;

  return null;
end;
$$;

create constraint trigger trail_events_contiguous_positions
after insert or update or delete on public.trail_events
deferrable initially deferred
for each row
execute function public.validate_trail_positions_after_mutation();

create function public.protect_trail_membership_lifecycle()
returns trigger
language plpgsql
as $$
declare
  old_trail_status text;
  new_trail_status text;
begin
  if tg_op <> 'INSERT' then
    select status
      into old_trail_status
      from public.trails
     where id = old.trail_id;

    if old_trail_status is distinct from 'draft' then
      raise exception
        'Published or retired trail % membership is immutable',
        old.trail_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    select status
      into new_trail_status
      from public.trails
     where id = new.trail_id;

    if new_trail_status is distinct from 'draft' then
      raise exception
        'Published or retired trail % membership is immutable',
        new.trail_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger trail_events_lifecycle_guard
before insert or update or delete on public.trail_events
for each row
execute function public.protect_trail_membership_lifecycle();

create function public.validate_trail_publication(
  trail_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  step_count integer;
  unavailable_event_count integer;
begin
  perform public.validate_trail_positions(trail_id_to_validate);

  select count(*)::integer
    into step_count
    from public.trail_events
   where trail_id = trail_id_to_validate;

  if step_count < 2 then
    raise exception
      'Trail % requires at least two events before publication',
      trail_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into unavailable_event_count
    from public.trail_events step
    join public.events event
      on event.id = step.event_id
   where step.trail_id = trail_id_to_validate
     and (
       event.is_published = false
       or event.retired_at is not null
     );

  if unavailable_event_count > 0 then
    raise exception
      'Trail % requires every event to be published and not retired',
      trail_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function public.protect_trail_authoring_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception
        'New trail % must begin as a draft',
        new.id
        using errcode = '55006';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception
      'Trail % identity and creation time are immutable',
      old.id
      using errcode = '55006';
  end if;

  if old.status = 'retired' then
    if row(
      new.title,
      new.description,
      new.status,
      new.published_at,
      new.retired_at,
      new.created_at,
      new.updated_at
    ) is distinct from row(
      old.title,
      old.description,
      old.status,
      old.published_at,
      old.retired_at,
      old.created_at,
      old.updated_at
    ) then
      raise exception
        'Retired trail % is immutable',
        old.id
        using errcode = '55006';
    end if;

    return new;
  end if;

  if old.status = 'published' then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.published_at is distinct from old.published_at then
      raise exception
        'Published trail % is immutable; retire it before creating a replacement',
        old.id
        using errcode = '55006';
    end if;

    if new.status <> 'retired' then
      raise exception
        'Published trail % can only transition to retired',
        old.id
        using errcode = '55006';
    end if;

    return new;
  end if;

  if new.status = 'published' then
    perform public.validate_trail_publication(old.id);
  elsif new.status <> 'draft'
        and new.status <> 'retired' then
    raise exception
      'Draft trail % has an invalid lifecycle transition',
      old.id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger trails_authoring_lifecycle_guard
before insert or update on public.trails
for each row
execute function public.protect_trail_authoring_lifecycle();

alter table public.author_content_audit
  drop constraint author_content_audit_entity_type_check;

alter table public.author_content_audit
  add constraint author_content_audit_entity_type_check
    check (
      entity_type in (
        'event',
        'challenge',
        'question',
        'card',
        'trail'
      )
    );
