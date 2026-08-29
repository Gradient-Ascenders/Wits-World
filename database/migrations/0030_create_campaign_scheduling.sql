create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 0,
  submitted_by_player_id uuid
    references public.players (id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  reviewed_at timestamptz,
  publication_provenance text,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaigns_title_not_blank
    check (title = btrim(title) and title <> ''),
  constraint campaigns_description_not_blank
    check (
      description is null
      or (description = btrim(description) and description <> '')
    ),
  constraint campaigns_status_check
    check (status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  constraint campaigns_period_check
    check (ends_at > starts_at),
  constraint campaigns_version_check
    check (version >= 0),
  constraint campaigns_publication_provenance_check
    check (
      publication_provenance is null
      or publication_provenance in ('legacy', 'controlled_seed', 'reviewed')
    ),
  constraint campaigns_authoring_metadata_check
    check (
      public.validate_curated_authoring_metadata(
        status,
        submitted_by_player_id,
        submitted_at,
        reviewed_by_player_id,
        reviewed_at,
        publication_provenance
      )
    ),
  constraint campaigns_lifecycle_timestamps_check
    check (
      (
        status in ('draft', 'in_review', 'approved')
        and published_at is null
        and retired_at is null
      )
      or (
        status = 'published'
        and published_at is not null
        and retired_at is null
      )
      or (
        status = 'retired'
        and published_at is not null
        and retired_at is not null
      )
    ),
  constraint campaigns_timestamps_check
    check (
      updated_at >= created_at
      and (published_at is null or published_at >= created_at)
      and (retired_at is null or retired_at >= published_at)
    )
);

create table public.campaign_events (
  campaign_id uuid not null
    references public.campaigns (id) on delete restrict,
  event_id uuid not null
    references public.events (id) on delete restrict,
  primary key (campaign_id, event_id)
);

create table public.campaign_trails (
  campaign_id uuid not null
    references public.campaigns (id) on delete restrict,
  trail_id uuid not null
    references public.trails (id) on delete restrict,
  primary key (campaign_id, trail_id)
);

create index campaigns_review_queue_idx
  on public.campaigns (submitted_at, id)
  where status = 'in_review';

create index campaigns_effective_schedule_idx
  on public.campaigns (status, starts_at, ends_at, id)
  where status in ('approved', 'published');

create index campaigns_published_history_idx
  on public.campaigns (published_at, id)
  where published_at is not null;

create index campaign_events_event_idx
  on public.campaign_events (event_id, campaign_id);

create index campaign_trails_trail_idx
  on public.campaign_trails (trail_id, campaign_id);

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
        'trail',
        'campaign'
      )
    );

create trigger campaigns_curated_authoring_guard
before update on public.campaigns
for each row execute function public.guard_curated_authoring_transition();

create function public.protect_campaign_content_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New campaign % must begin as a draft', new.id
        using errcode = '55006';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.published_at is not null then
      raise exception 'Reviewed or published campaign % cannot be deleted', old.id
        using errcode = '55006';
    end if;
    return old;
  end if;

  if old.status <> 'draft' and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
  ) then
    raise exception 'Non-draft campaign % content is immutable', old.id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger campaigns_content_lifecycle_guard
before insert or update or delete on public.campaigns
for each row execute function public.protect_campaign_content_lifecycle();

create function public.protect_campaign_membership_lifecycle()
returns trigger
language plpgsql
as $$
declare
  campaign_status text;
  target_campaign_id uuid;
begin
  if tg_op <> 'INSERT' then
    target_campaign_id := old.campaign_id;
    select status into campaign_status
      from public.campaigns
      where id = target_campaign_id;

    if campaign_status is distinct from 'draft' then
      raise exception 'Non-draft campaign % membership is immutable', target_campaign_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    target_campaign_id := new.campaign_id;
    select status into campaign_status
      from public.campaigns
      where id = target_campaign_id;

    if campaign_status is distinct from 'draft' then
      raise exception 'Non-draft campaign % membership is immutable', target_campaign_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger campaign_events_lifecycle_guard
before insert or update or delete on public.campaign_events
for each row execute function public.protect_campaign_membership_lifecycle();

create trigger campaign_trails_lifecycle_guard
before insert or update or delete on public.campaign_trails
for each row execute function public.protect_campaign_membership_lifecycle();

create function public.lock_campaign_members(
  campaign_id_to_lock uuid
)
returns void
language plpgsql
as $$
declare
  member record;
begin
  for member in
    select 'event'::text as member_type, event_id as member_id
      from public.campaign_events
      where campaign_id = campaign_id_to_lock
    union all
    select 'trail'::text, trail_id
      from public.campaign_trails
      where campaign_id = campaign_id_to_lock
    order by member_type, member_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('campaign-member:' || member.member_type || ':' || member.member_id::text, 0)
    );
  end loop;
end;
$$;

create function public.validate_campaign_schedule(
  campaign_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  target public.campaigns%rowtype;
  member_count integer;
  unavailable_event_count integer;
  unavailable_trail_count integer;
  non_intersecting_event_count integer;
  overlapping_event_count integer;
  overlapping_trail_count integer;
begin
  select * into target
    from public.campaigns
    where id = campaign_id_to_validate;

  if not found then
    raise exception 'Campaign % does not exist', campaign_id_to_validate
      using errcode = '23503';
  end if;

  perform public.lock_campaign_members(campaign_id_to_validate);

  select
    (select count(*) from public.campaign_events where campaign_id = target.id)
    +
    (select count(*) from public.campaign_trails where campaign_id = target.id)
  into member_count;

  if member_count = 0 then
    raise exception 'Campaign % requires at least one event or trail', target.id
      using errcode = '23514';
  end if;

  select count(*)::integer into unavailable_event_count
    from public.campaign_events membership
    join public.events event on event.id = membership.event_id
    where membership.campaign_id = target.id
      and (
        event.authoring_status <> 'published'
        or not event.is_published
        or event.retired_at is not null
      );

  if unavailable_event_count > 0 then
    raise exception 'Campaign % requires every event to be published and not retired', target.id
      using errcode = '23514';
  end if;

  select count(*)::integer into unavailable_trail_count
    from public.campaign_trails membership
    join public.trails trail on trail.id = membership.trail_id
    where membership.campaign_id = target.id
      and trail.status <> 'published';

  if unavailable_trail_count > 0 then
    raise exception 'Campaign % requires every trail to be published and not retired', target.id
      using errcode = '23514';
  end if;

  select count(*)::integer into non_intersecting_event_count
    from public.campaign_events membership
    join public.events event on event.id = membership.event_id
    where membership.campaign_id = target.id
      and not (
        event.starts_at < target.ends_at
        and event.ends_at > target.starts_at
      );

  if non_intersecting_event_count > 0 then
    raise exception 'Every campaign event must overlap the campaign period'
      using errcode = '23514';
  end if;

  select count(*)::integer into overlapping_event_count
    from public.campaign_events membership
    join public.campaign_events other_membership
      on other_membership.event_id = membership.event_id
     and other_membership.campaign_id <> membership.campaign_id
    join public.campaigns other
      on other.id = other_membership.campaign_id
    where membership.campaign_id = target.id
      and other.status in ('approved', 'published')
      and target.starts_at < other.ends_at
      and target.ends_at > other.starts_at;

  if overlapping_event_count > 0 then
    raise exception 'A campaign event already belongs to an overlapping approved or published campaign'
      using errcode = '23P01';
  end if;

  select count(*)::integer into overlapping_trail_count
    from public.campaign_trails membership
    join public.campaign_trails other_membership
      on other_membership.trail_id = membership.trail_id
     and other_membership.campaign_id <> membership.campaign_id
    join public.campaigns other
      on other.id = other_membership.campaign_id
    where membership.campaign_id = target.id
      and other.status in ('approved', 'published')
      and target.starts_at < other.ends_at
      and target.ends_at > other.starts_at;

  if overlapping_trail_count > 0 then
    raise exception 'A campaign trail already belongs to an overlapping approved or published campaign'
      using errcode = '23P01';
  end if;
end;
$$;

create function public.guard_campaign_schedule_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('approved', 'published')
     and new.status is distinct from old.status then
    perform public.validate_campaign_schedule(old.id);
  end if;
  return new;
end;
$$;

create trigger campaigns_schedule_transition_guard
before update on public.campaigns
for each row execute function public.guard_campaign_schedule_transition();

create function public.guard_published_campaign_member_retirement()
returns trigger
language plpgsql
as $$
declare
  member_id uuid;
  referenced_by_published_campaign boolean;
begin
  if tg_table_name = 'events' then
    if not (old.authoring_status = 'published' and new.authoring_status = 'retired') then
      return new;
    end if;
    member_id := old.id;
    perform pg_advisory_xact_lock(
      hashtextextended('campaign-member:event:' || member_id::text, 0)
    );
    select exists (
      select 1
      from public.campaign_events membership
      join public.campaigns campaign on campaign.id = membership.campaign_id
      where membership.event_id = member_id
        and campaign.status = 'published'
    ) into referenced_by_published_campaign;
  else
    if not (old.status = 'published' and new.status = 'retired') then
      return new;
    end if;
    member_id := old.id;
    perform pg_advisory_xact_lock(
      hashtextextended('campaign-member:trail:' || member_id::text, 0)
    );
    select exists (
      select 1
      from public.campaign_trails membership
      join public.campaigns campaign on campaign.id = membership.campaign_id
      where membership.trail_id = member_id
        and campaign.status = 'published'
    ) into referenced_by_published_campaign;
  end if;

  if referenced_by_published_campaign then
    raise exception 'Retire the published campaign before retiring this campaign member'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger events_published_campaign_retirement_guard
before update on public.events
for each row execute function public.guard_published_campaign_member_retirement();

create trigger trails_published_campaign_retirement_guard
before update on public.trails
for each row execute function public.guard_published_campaign_member_retirement();

create function public.resolve_event_availability(
  event_id_to_resolve uuid,
  evaluated_at timestamptz
)
returns table (
  effective_starts_at timestamptz,
  effective_ends_at timestamptz,
  availability text
)
language sql
stable
as $$
  with target as (
    select event.*
    from public.events event
    where event.id = event_id_to_resolve
  ), campaign_history as (
    select exists (
      select 1
      from public.campaign_events membership
      join public.campaigns campaign on campaign.id = membership.campaign_id
      where membership.event_id = target.id
        and campaign.published_at is not null
    ) as has_history
    from target
  ), candidate_windows as (
    select
      greatest(target.starts_at, campaign.starts_at) as starts_at,
      least(target.ends_at, campaign.ends_at) as ends_at
    from target
    join public.campaign_events membership on membership.event_id = target.id
    join public.campaigns campaign on campaign.id = membership.campaign_id
    where campaign.status = 'published'
      and target.starts_at < campaign.ends_at
      and target.ends_at > campaign.starts_at
  ), selected_window as (
    select starts_at, ends_at
    from candidate_windows
    order by
      case
        when starts_at <= evaluated_at and ends_at > evaluated_at then 0
        when starts_at > evaluated_at then 1
        else 2
      end,
      case when starts_at > evaluated_at then starts_at end asc,
      case when ends_at <= evaluated_at then ends_at end desc
    limit 1
  )
  select
    case
      when not target.is_published then null
      when not campaign_history.has_history then target.starts_at
      else selected_window.starts_at
    end as effective_starts_at,
    case
      when not target.is_published then null
      when not campaign_history.has_history then target.ends_at
      else selected_window.ends_at
    end as effective_ends_at,
    case
      when not target.is_published then 'unpublished'
      when campaign_history.has_history and selected_window.starts_at is null then 'unpublished'
      when evaluated_at < coalesce(selected_window.starts_at, target.starts_at) then 'upcoming'
      when evaluated_at >= coalesce(selected_window.ends_at, target.ends_at) then 'ended'
      else 'active'
    end as availability
  from target
  cross join campaign_history
  left join selected_window on true;
$$;

create function public.resolve_trail_availability(
  trail_id_to_resolve uuid,
  evaluated_at timestamptz
)
returns table (
  effective_starts_at timestamptz,
  effective_ends_at timestamptz,
  availability text
)
language sql
stable
as $$
  with target as (
    select trail.*
    from public.trails trail
    where trail.id = trail_id_to_resolve
  ), campaign_history as (
    select exists (
      select 1
      from public.campaign_trails membership
      join public.campaigns campaign on campaign.id = membership.campaign_id
      where membership.trail_id = target.id
        and campaign.published_at is not null
    ) as has_history
    from target
  ), candidate_windows as (
    select campaign.starts_at, campaign.ends_at
    from target
    join public.campaign_trails membership on membership.trail_id = target.id
    join public.campaigns campaign on campaign.id = membership.campaign_id
    where campaign.status = 'published'
  ), selected_window as (
    select starts_at, ends_at
    from candidate_windows
    order by
      case
        when starts_at <= evaluated_at and ends_at > evaluated_at then 0
        when starts_at > evaluated_at then 1
        else 2
      end,
      case when starts_at > evaluated_at then starts_at end asc,
      case when ends_at <= evaluated_at then ends_at end desc
    limit 1
  )
  select
    case
      when target.status <> 'published' then null
      when not campaign_history.has_history then null
      else selected_window.starts_at
    end as effective_starts_at,
    case
      when target.status <> 'published' then null
      when not campaign_history.has_history then null
      else selected_window.ends_at
    end as effective_ends_at,
    case
      when target.status <> 'published' then 'retired'
      when not campaign_history.has_history then 'active'
      when selected_window.starts_at is null then 'retired'
      when evaluated_at < selected_window.starts_at then 'upcoming'
      when evaluated_at >= selected_window.ends_at then 'ended'
      else 'active'
    end as availability
  from target
  cross join campaign_history
  left join selected_window on true;
$$;
