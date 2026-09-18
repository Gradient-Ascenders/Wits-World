create table public.event_placement_policy_versions (
  id text primary key,
  automatic_target smallint not null,
  preferred_assignments_per_zone smallint not null,
  mandatory_assignments_per_zone smallint not null,
  minimum_separation_metres integer not null,
  rotation_timezone text not null,
  rotation_local_time time without time zone not null,
  replacements_per_rotation smallint not null,
  site_cooldown_buckets smallint not null,
  preview_ttl_minutes smallint not null,
  maximum_pin_hours integer not null,
  maximum_pause_hours integer not null,
  maximum_exclusion_hours integer not null,
  review_provenance text not null,
  created_at timestamptz not null default now(),

  constraint event_placement_policy_versions_id_check
    check (id = btrim(id) and id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint event_placement_policy_versions_capacity_check
    check (
      automatic_target > 0
      and preferred_assignments_per_zone > 0
      and mandatory_assignments_per_zone > 0
      and mandatory_assignments_per_zone <= preferred_assignments_per_zone
      and preferred_assignments_per_zone <= automatic_target
    ),
  constraint event_placement_policy_versions_distance_check
    check (minimum_separation_metres > 0),
  constraint event_placement_policy_versions_rotation_check
    check (
      rotation_timezone = 'Africa/Johannesburg'
      and replacements_per_rotation between 0 and automatic_target
      and site_cooldown_buckets >= 0
    ),
  constraint event_placement_policy_versions_duration_check
    check (
      preview_ttl_minutes > 0
      and maximum_pin_hours > 0
      and maximum_pause_hours > 0
      and maximum_exclusion_hours > 0
    ),
  constraint event_placement_policy_versions_provenance_check
    check (
      review_provenance = btrim(review_provenance)
      and review_provenance <> ''
      and char_length(review_provenance) <= 200
    )
);

create function public.prevent_event_placement_policy_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Event placement policy versions are immutable'
    using errcode = '55006';
end;
$$;

create trigger event_placement_policy_versions_immutability
before update or delete on public.event_placement_policy_versions
for each row execute function public.prevent_event_placement_policy_mutation();

create table public.event_placement_zones (
  id uuid primary key default gen_random_uuid(),
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  zone_key text not null,
  name text not null,
  area geometry(MultiPolygon, 4326) not null,
  status text not null default 'pending_review',
  version integer not null default 0,
  source_urls text[] not null default array[]::text[],
  review_provenance text,
  reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  reviewed_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_placement_zones_policy_key_unique
    unique (policy_version_id, zone_key),
  constraint event_placement_zones_id_policy_unique
    unique (id, policy_version_id),
  constraint event_placement_zones_key_check
    check (zone_key = btrim(zone_key) and zone_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint event_placement_zones_name_check
    check (name = btrim(name) and name <> '' and char_length(name) <= 120),
  constraint event_placement_zones_area_check
    check (not st_isempty(area) and st_isvalid(area)),
  constraint event_placement_zones_status_check
    check (status in ('pending_review', 'active', 'suspended', 'retired')),
  constraint event_placement_zones_version_check check (version >= 0),
  constraint event_placement_zones_sources_check
    check (
      cardinality(source_urls) > 0
      and public.content_source_urls_are_valid(source_urls)
    ),
  constraint event_placement_zones_review_check
    check (
      (
        review_provenance is null
        and reviewed_by_player_id is null
        and reviewed_at is null
      )
      or (
        review_provenance in ('controlled_policy', 'reviewed')
        and reviewed_at is not null
        and (
          (review_provenance = 'controlled_policy' and reviewed_by_player_id is null)
          or (review_provenance = 'reviewed' and reviewed_by_player_id is not null)
        )
      )
    ),
  constraint event_placement_zones_lifecycle_check
    check (
      (
        status = 'pending_review'
        and activated_at is null
        and suspended_at is null
        and retired_at is null
      )
      or (
        status = 'active'
        and reviewed_at is not null
        and activated_at is not null
        and suspended_at is null
        and retired_at is null
      )
      or (
        status = 'suspended'
        and reviewed_at is not null
        and activated_at is not null
        and suspended_at is not null
        and retired_at is null
      )
      or (
        status = 'retired'
        and retired_at is not null
      )
    ),
  constraint event_placement_zones_timestamps_check
    check (
      updated_at >= created_at
      and (reviewed_at is null or reviewed_at >= created_at)
      and (activated_at is null or activated_at >= reviewed_at)
      and (suspended_at is null or suspended_at >= activated_at)
      and (retired_at is null or retired_at >= created_at)
    )
);

create table public.event_placement_sites (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null,
  policy_version_id text not null,
  site_key text not null,
  name text not null,
  location geography(Point, 4326) not null,
  maximum_interaction_radius_metres integer not null,
  status text not null default 'pending_review',
  version integer not null default 0,
  source_urls text[] not null default array[]::text[],
  review_provenance text,
  reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  reviewed_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_placement_sites_zone_policy_fk
    foreign key (zone_id, policy_version_id)
    references public.event_placement_zones (id, policy_version_id)
    on delete restrict,
  constraint event_placement_sites_policy_key_unique
    unique (policy_version_id, site_key),
  constraint event_placement_sites_id_zone_unique unique (id, zone_id),
  constraint event_placement_sites_key_check
    check (site_key = btrim(site_key) and site_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint event_placement_sites_name_check
    check (name = btrim(name) and name <> '' and char_length(name) <= 160),
  constraint event_placement_sites_location_check
    check (not st_isempty(location::geometry)),
  constraint event_placement_sites_radius_check
    check (maximum_interaction_radius_metres > 0),
  constraint event_placement_sites_status_check
    check (status in ('pending_review', 'active', 'suspended', 'retired')),
  constraint event_placement_sites_version_check check (version >= 0),
  constraint event_placement_sites_sources_check
    check (
      cardinality(source_urls) > 0
      and public.content_source_urls_are_valid(source_urls)
    ),
  constraint event_placement_sites_review_check
    check (
      (
        review_provenance is null
        and reviewed_by_player_id is null
        and reviewed_at is null
      )
      or (
        review_provenance in ('controlled_policy', 'reviewed')
        and reviewed_at is not null
        and (
          (review_provenance = 'controlled_policy' and reviewed_by_player_id is null)
          or (review_provenance = 'reviewed' and reviewed_by_player_id is not null)
        )
      )
    ),
  constraint event_placement_sites_lifecycle_check
    check (
      (
        status = 'pending_review'
        and activated_at is null
        and suspended_at is null
        and retired_at is null
      )
      or (
        status = 'active'
        and reviewed_at is not null
        and activated_at is not null
        and suspended_at is null
        and retired_at is null
      )
      or (
        status = 'suspended'
        and reviewed_at is not null
        and activated_at is not null
        and suspended_at is not null
        and retired_at is null
      )
      or (
        status = 'retired'
        and retired_at is not null
      )
    ),
  constraint event_placement_sites_timestamps_check
    check (
      updated_at >= created_at
      and (reviewed_at is null or reviewed_at >= created_at)
      and (activated_at is null or activated_at >= reviewed_at)
      and (suspended_at is null or suspended_at >= activated_at)
      and (retired_at is null or retired_at >= created_at)
    )
);

create index event_placement_zones_area_gist_idx
  on public.event_placement_zones using gist (area);

create index event_placement_zones_active_idx
  on public.event_placement_zones (policy_version_id, zone_key, id)
  where status = 'active';

create index event_placement_sites_location_gist_idx
  on public.event_placement_sites using gist (location);

create index event_placement_sites_active_zone_idx
  on public.event_placement_sites (zone_id, site_key, id)
  where status = 'active';

create function public.validate_event_placement_review_actor()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_status text;
begin
  if new.review_provenance is distinct from 'reviewed' then
    return new;
  end if;

  select role, lifecycle_status
    into actor_role, actor_status
    from public.players
   where id = new.reviewed_by_player_id;

  if actor_role is distinct from 'author'
     or actor_status is distinct from 'active' then
    raise exception 'Placement review requires an active Author'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_placement_zones_review_actor_guard
before insert or update on public.event_placement_zones
for each row execute function public.validate_event_placement_review_actor();

create trigger event_placement_sites_review_actor_guard
before insert or update on public.event_placement_sites
for each row execute function public.validate_event_placement_review_actor();

create function public.protect_event_placement_zone_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_review'
       and new.review_provenance is distinct from 'controlled_policy' then
      raise exception 'New placement zones must begin pending review'
        using errcode = '55006';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Placement zones are retained for audit'
      using errcode = '55006';
  end if;

  if old.status = 'retired' then
    raise exception 'Retired placement zones are immutable'
      using errcode = '55006';
  end if;

  if old.status <> 'pending_review' and (
    new.policy_version_id is distinct from old.policy_version_id
    or new.zone_key is distinct from old.zone_key
    or new.name is distinct from old.name
    or not st_equals(new.area, old.area)
    or new.source_urls is distinct from old.source_urls
    or new.review_provenance is distinct from old.review_provenance
    or new.reviewed_by_player_id is distinct from old.reviewed_by_player_id
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Reviewed placement zone definitions are immutable'
      using errcode = '55006';
  end if;

  if not (
    (old.status = 'pending_review' and new.status in ('pending_review', 'active', 'retired'))
    or (old.status = 'active' and new.status in ('active', 'suspended', 'retired'))
    or (old.status = 'suspended' and new.status in ('suspended', 'active', 'retired'))
  ) then
    raise exception 'Invalid placement zone lifecycle transition'
      using errcode = '55006';
  end if;

  if new.status is distinct from old.status then
    if new.version <> old.version + 1 then
      raise exception 'Placement zone lifecycle transitions must increment version'
        using errcode = '40001';
    end if;
  elsif new.version <> old.version then
    raise exception 'Placement zone version changes require a lifecycle transition'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

create trigger event_placement_zones_lifecycle_guard
before insert or update or delete on public.event_placement_zones
for each row execute function public.protect_event_placement_zone_lifecycle();

create function public.protect_event_placement_site_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_review'
       and new.review_provenance is distinct from 'controlled_policy' then
      raise exception 'New placement sites must begin pending review'
        using errcode = '55006';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Placement sites are retained for audit'
      using errcode = '55006';
  end if;

  if old.status = 'retired' then
    raise exception 'Retired placement sites are immutable'
      using errcode = '55006';
  end if;

  if old.status <> 'pending_review' and (
    new.zone_id is distinct from old.zone_id
    or new.policy_version_id is distinct from old.policy_version_id
    or new.site_key is distinct from old.site_key
    or new.name is distinct from old.name
    or not st_equals(new.location::geometry, old.location::geometry)
    or new.maximum_interaction_radius_metres is distinct from old.maximum_interaction_radius_metres
    or new.source_urls is distinct from old.source_urls
    or new.review_provenance is distinct from old.review_provenance
    or new.reviewed_by_player_id is distinct from old.reviewed_by_player_id
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Reviewed placement site definitions are immutable'
      using errcode = '55006';
  end if;

  if not (
    (old.status = 'pending_review' and new.status in ('pending_review', 'active', 'retired'))
    or (old.status = 'active' and new.status in ('active', 'suspended', 'retired'))
    or (old.status = 'suspended' and new.status in ('suspended', 'active', 'retired'))
  ) then
    raise exception 'Invalid placement site lifecycle transition'
      using errcode = '55006';
  end if;

  if new.status is distinct from old.status then
    if new.version <> old.version + 1 then
      raise exception 'Placement site lifecycle transitions must increment version'
        using errcode = '40001';
    end if;
  elsif new.version <> old.version then
    raise exception 'Placement site version changes require a lifecycle transition'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

create trigger event_placement_sites_lifecycle_guard
before insert or update or delete on public.event_placement_sites
for each row execute function public.protect_event_placement_site_lifecycle();

create table public.event_placement_portability (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  approved_by_player_id uuid
    references public.players (id) on delete restrict,
  review_provenance text not null,
  effective_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),

  constraint event_placement_portability_review_check
    check (
      (review_provenance = 'controlled_policy' and approved_by_player_id is null)
      or (review_provenance = 'reviewed' and approved_by_player_id is not null)
    ),
  constraint event_placement_portability_period_check
    check (ended_at is null or ended_at >= effective_at),
  constraint event_placement_portability_end_reason_check
    check (
      (ended_at is null and end_reason is null)
      or (
        ended_at is not null
        and end_reason = btrim(end_reason)
        and end_reason <> ''
        and char_length(end_reason) <= 500
      )
    )
);

create unique index event_placement_portability_current_uidx
  on public.event_placement_portability (event_id, policy_version_id)
  where ended_at is null;

create index event_placement_portability_policy_idx
  on public.event_placement_portability (policy_version_id, effective_at, event_id)
  where ended_at is null;

create function public.protect_event_placement_portability()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_status text;
begin
  if tg_op = 'INSERT' then
    if new.review_provenance = 'reviewed' then
      select role, lifecycle_status
        into actor_role, actor_status
        from public.players
       where id = new.approved_by_player_id;
      if actor_role is distinct from 'author'
         or actor_status is distinct from 'active' then
        raise exception 'Portable-event approval requires an active Author'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Portable-event approval history is immutable'
      using errcode = '55006';
  end if;

  if old.ended_at is not null
     or new.id is distinct from old.id
     or new.event_id is distinct from old.event_id
     or new.policy_version_id is distinct from old.policy_version_id
     or new.approved_by_player_id is distinct from old.approved_by_player_id
     or new.review_provenance is distinct from old.review_provenance
     or new.effective_at is distinct from old.effective_at
     or new.created_at is distinct from old.created_at
     or new.ended_at is null then
    raise exception 'Portable-event approvals may only be ended once'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_placement_portability_guard
before insert or update or delete on public.event_placement_portability
for each row execute function public.protect_event_placement_portability();

create table public.event_placement_state (
  singleton boolean primary key default true,
  current_policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  current_plan_id uuid,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),

  constraint event_placement_state_singleton_check check (singleton),
  constraint event_placement_state_version_check check (version >= 0)
);

create table public.event_placement_plans (
  id uuid primary key default gen_random_uuid(),
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  rotation_bucket date not null,
  status text not null,
  trigger_kind text not null,
  input_digest text not null,
  expected_state_version bigint not null,
  committed_state_version bigint,
  target_assignment_count smallint not null,
  actual_assignment_count smallint not null default 0,
  zone_assignment_counts jsonb not null default '{}'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  failure_code text,
  predecessor_plan_id uuid
    references public.event_placement_plans (id) on delete restrict,
  rollback_source_plan_id uuid
    references public.event_placement_plans (id) on delete restrict,
  requested_by_player_id uuid
    references public.players (id) on delete restrict,
  created_at timestamptz not null default now(),
  valid_until timestamptz,
  applied_at timestamptz,

  constraint event_placement_plans_status_check
    check (status in ('preview', 'applied', 'degraded', 'failed', 'expired')),
  constraint event_placement_plans_trigger_check
    check (trigger_kind in ('scheduled', 'manual', 'rollback')),
  constraint event_placement_plans_digest_check
    check (input_digest ~ '^[0-9a-f]{64}$'),
  constraint event_placement_plans_state_versions_check
    check (
      expected_state_version >= 0
      and (committed_state_version is null or committed_state_version > expected_state_version)
    ),
  constraint event_placement_plans_counts_check
    check (
      target_assignment_count > 0
      and actual_assignment_count between 0 and target_assignment_count
      and jsonb_typeof(zone_assignment_counts) = 'object'
      and jsonb_typeof(exceptions) = 'array'
    ),
  constraint event_placement_plans_failure_code_check
    check (
      failure_code is null
      or (
        failure_code = btrim(failure_code)
        and failure_code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
        and char_length(failure_code) <= 100
      )
    ),
  constraint event_placement_plans_shape_check
    check (
      (
        status = 'preview'
        and committed_state_version is null
        and valid_until is not null
        and valid_until > created_at
        and applied_at is null
        and failure_code is null
      )
      or (
        status in ('applied', 'degraded')
        and committed_state_version is not null
        and applied_at is not null
        and applied_at >= created_at
        and failure_code is null
      )
      or (
        status = 'failed'
        and committed_state_version is null
        and applied_at is null
        and failure_code is not null
      )
      or (
        status = 'expired'
        and committed_state_version is null
        and applied_at is null
        and valid_until is not null
      )
    ),
  constraint event_placement_plans_manual_actor_check
    check (
      (trigger_kind = 'scheduled' and requested_by_player_id is null)
      or (trigger_kind in ('manual', 'rollback') and requested_by_player_id is not null)
    )
);

alter table public.event_placement_state
  add constraint event_placement_state_current_plan_fk
  foreign key (current_plan_id)
  references public.event_placement_plans (id)
  on delete restrict;

create function public.protect_event_placement_state()
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

  if tg_op = 'UPDATE' and new.version <> old.version + 1 then
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
       or plan_version is distinct from new.version then
      raise exception 'Placement state must reference its committed current-policy plan'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger event_placement_state_guard
before update or delete on public.event_placement_state
for each row execute function public.protect_event_placement_state();

create unique index event_placement_plans_committed_bucket_uidx
  on public.event_placement_plans (policy_version_id, rotation_bucket)
  where status in ('applied', 'degraded');

create index event_placement_plans_history_idx
  on public.event_placement_plans (created_at desc, id);

create index event_placement_plans_preview_expiry_idx
  on public.event_placement_plans (valid_until, id)
  where status = 'preview';

create table public.event_placement_plan_entries (
  plan_id uuid not null
    references public.event_placement_plans (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  site_id uuid not null,
  zone_id uuid not null,
  position smallint not null,
  origin text not null,
  is_preserved boolean not null default false,

  primary key (plan_id, event_id),
  constraint event_placement_plan_entries_site_unique unique (plan_id, site_id),
  constraint event_placement_plan_entries_position_unique unique (plan_id, position),
  constraint event_placement_plan_entries_assignment_unique
    unique (plan_id, event_id, site_id),
  constraint event_placement_plan_entries_site_zone_fk
    foreign key (site_id, zone_id)
    references public.event_placement_sites (id, zone_id)
    on delete restrict,
  constraint event_placement_plan_entries_position_check check (position > 0),
  constraint event_placement_plan_entries_origin_check
    check (origin in ('automatic', 'pin', 'rollback'))
);

create function public.protect_event_placement_plan_entry()
returns trigger
language plpgsql
as $$
declare
  plan_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Placement plan entries are immutable'
      using errcode = '55006';
  end if;

  select status into plan_status
    from public.event_placement_plans
   where id = new.plan_id;
  if plan_status is distinct from 'preview' then
    raise exception 'Placement plan entries require a preview plan'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_placement_plan_entries_guard
before insert or update or delete on public.event_placement_plan_entries
for each row execute function public.protect_event_placement_plan_entry();

create function public.protect_event_placement_plan()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Placement plans are retained for audit'
      using errcode = '55006';
  end if;

  if old.status <> 'preview'
     or new.id is distinct from old.id
     or new.policy_version_id is distinct from old.policy_version_id
     or new.rotation_bucket is distinct from old.rotation_bucket
     or new.trigger_kind is distinct from old.trigger_kind
     or new.input_digest is distinct from old.input_digest
     or new.expected_state_version is distinct from old.expected_state_version
     or new.target_assignment_count is distinct from old.target_assignment_count
     or new.zone_assignment_counts is distinct from old.zone_assignment_counts
     or new.exceptions is distinct from old.exceptions
     or new.predecessor_plan_id is distinct from old.predecessor_plan_id
     or new.rollback_source_plan_id is distinct from old.rollback_source_plan_id
     or new.requested_by_player_id is distinct from old.requested_by_player_id
     or new.created_at is distinct from old.created_at
     or new.valid_until is distinct from old.valid_until
     or new.status not in ('applied', 'degraded', 'failed', 'expired') then
    raise exception 'Placement plans are immutable after their preview transition'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_placement_plans_guard
before update or delete on public.event_placement_plans
for each row execute function public.protect_event_placement_plan();

create table public.event_placement_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  site_id uuid not null,
  zone_id uuid not null,
  origin text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),

  constraint event_placement_assignments_plan_entry_fk
    foreign key (plan_id, event_id, site_id)
    references public.event_placement_plan_entries (plan_id, event_id, site_id)
    on delete restrict,
  constraint event_placement_assignments_site_zone_fk
    foreign key (site_id, zone_id)
    references public.event_placement_sites (id, zone_id)
    on delete restrict,
  constraint event_placement_assignments_origin_check
    check (origin in ('automatic', 'pin', 'rollback')),
  constraint event_placement_assignments_period_check
    check (ends_at is null or ends_at >= starts_at),
  constraint event_placement_assignments_end_reason_check
    check (
      (ends_at is null and end_reason is null)
      or (
        ends_at is not null
        and end_reason = btrim(end_reason)
        and end_reason <> ''
        and char_length(end_reason) <= 120
      )
    )
);

create unique index event_placement_assignments_current_event_uidx
  on public.event_placement_assignments (event_id)
  where ends_at is null;

create unique index event_placement_assignments_current_site_uidx
  on public.event_placement_assignments (site_id)
  where ends_at is null;

create index event_placement_assignments_site_history_idx
  on public.event_placement_assignments (site_id, ends_at desc, starts_at desc, id);

create index event_placement_assignments_event_history_idx
  on public.event_placement_assignments (event_id, ends_at desc, starts_at desc, id);

create function public.validate_event_placement_assignment()
returns trigger
language plpgsql
as $$
declare
  plan_policy text;
  plan_status text;
  plan_entry_origin text;
  site_policy text;
  site_status text;
  site_zone uuid;
  site_radius integer;
  zone_status text;
  event_radius integer;
  event_status text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  select policy_version_id, status
    into plan_policy, plan_status
    from public.event_placement_plans
   where id = new.plan_id;
  select origin
    into plan_entry_origin
    from public.event_placement_plan_entries
   where plan_id = new.plan_id
     and event_id = new.event_id
     and site_id = new.site_id;
  select policy_version_id, status, zone_id, maximum_interaction_radius_metres
    into site_policy, site_status, site_zone, site_radius
    from public.event_placement_sites
   where id = new.site_id;
  select status into zone_status
    from public.event_placement_zones
   where id = new.zone_id;
  select radius_metres, authoring_status
    into event_radius, event_status
    from public.events
   where id = new.event_id;

  if plan_status not in ('applied', 'degraded')
     or plan_policy is distinct from new.policy_version_id
     or plan_entry_origin is distinct from new.origin
     or site_policy is distinct from new.policy_version_id
     or site_zone is distinct from new.zone_id
     or site_status is distinct from 'active'
     or zone_status is distinct from 'active'
     or event_status is distinct from 'published'
     or event_radius > site_radius
     or not exists (
       select 1
         from public.event_placement_portability portability
        where portability.event_id = new.event_id
          and portability.policy_version_id = new.policy_version_id
          and portability.effective_at <= new.starts_at
          and (
            portability.ended_at is null
            or portability.ended_at > new.starts_at
          )
     ) then
    raise exception 'Placement assignment violates policy, lifecycle, portability, or radius rules'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_placement_assignments_validation
before insert on public.event_placement_assignments
for each row execute function public.validate_event_placement_assignment();

create function public.protect_event_placement_assignment()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Placement assignments are retained for audit'
      using errcode = '55006';
  end if;

  if old.ends_at is not null
     or new.id is distinct from old.id
     or new.plan_id is distinct from old.plan_id
     or new.policy_version_id is distinct from old.policy_version_id
     or new.event_id is distinct from old.event_id
     or new.site_id is distinct from old.site_id
     or new.zone_id is distinct from old.zone_id
     or new.origin is distinct from old.origin
     or new.starts_at is distinct from old.starts_at
     or new.created_at is distinct from old.created_at
     or new.ends_at is null then
    raise exception 'Placement assignments may only be ended once'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_placement_assignments_guard
before update or delete on public.event_placement_assignments
for each row execute function public.protect_event_placement_assignment();

create table public.event_placement_overrides (
  id uuid primary key default gen_random_uuid(),
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  kind text not null,
  event_id uuid references public.events (id) on delete restrict,
  site_id uuid references public.event_placement_sites (id) on delete restrict,
  actor_player_id uuid not null references public.players (id) on delete restrict,
  reason text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),

  constraint event_placement_overrides_actor_idempotency_unique
    unique (actor_player_id, idempotency_key),
  constraint event_placement_overrides_kind_check
    check (kind in ('pin', 'site_exclusion', 'automation_pause')),
  constraint event_placement_overrides_target_check
    check (
      (kind = 'pin' and event_id is not null and site_id is not null)
      or (kind = 'site_exclusion' and event_id is null and site_id is not null)
      or (kind = 'automation_pause' and event_id is null and site_id is null)
    ),
  constraint event_placement_overrides_reason_check
    check (
      reason = btrim(reason)
      and reason <> ''
      and char_length(reason) <= 1000
    ),
  constraint event_placement_overrides_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint event_placement_overrides_period_check
    check (
      expires_at > starts_at
      and (ended_at is null or ended_at >= starts_at)
    ),
  constraint event_placement_overrides_end_reason_check
    check (
      (ended_at is null and end_reason is null)
      or (
        ended_at is not null
        and end_reason = btrim(end_reason)
        and end_reason <> ''
        and char_length(end_reason) <= 500
      )
    )
);

create index event_placement_overrides_active_idx
  on public.event_placement_overrides (kind, expires_at, id)
  where ended_at is null;

create index event_placement_overrides_site_idx
  on public.event_placement_overrides (site_id, expires_at desc, id)
  where site_id is not null;

create function public.validate_event_placement_override()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_status text;
  duration_limit interval;
  target_site_status text;
begin
  select role, lifecycle_status
    into actor_role, actor_status
    from public.players
   where id = new.actor_player_id;
  if actor_role is distinct from 'author'
     or actor_status is distinct from 'active' then
    raise exception 'Placement overrides require an active Author'
      using errcode = '23514';
  end if;

  select case new.kind
      when 'pin' then make_interval(hours => maximum_pin_hours)
      when 'site_exclusion' then make_interval(hours => maximum_exclusion_hours)
      else make_interval(hours => maximum_pause_hours)
    end
    into duration_limit
    from public.event_placement_policy_versions
   where id = new.policy_version_id;

  if new.expires_at - new.starts_at > duration_limit then
    raise exception 'Placement override exceeds policy duration limit'
      using errcode = '23514';
  end if;

  if new.site_id is not null then
    select status into target_site_status
      from public.event_placement_sites
     where id = new.site_id
       and policy_version_id = new.policy_version_id;
    if target_site_status is distinct from 'active' then
      raise exception 'Placement override requires an active policy site'
        using errcode = '23514';
    end if;
  end if;

  if new.kind = 'pin' and not exists (
    select 1
      from public.event_placement_portability portability
     where portability.event_id = new.event_id
       and portability.policy_version_id = new.policy_version_id
       and portability.effective_at <= new.starts_at
       and (
         portability.ended_at is null
         or portability.ended_at > new.starts_at
       )
  ) then
    raise exception 'Placement pins require a current portable-event approval'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_placement_overrides_validation
before insert on public.event_placement_overrides
for each row execute function public.validate_event_placement_override();

create function public.protect_event_placement_override()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Placement overrides are retained for audit'
      using errcode = '55006';
  end if;

  if old.ended_at is not null
     or new.id is distinct from old.id
     or new.policy_version_id is distinct from old.policy_version_id
     or new.kind is distinct from old.kind
     or new.event_id is distinct from old.event_id
     or new.site_id is distinct from old.site_id
     or new.actor_player_id is distinct from old.actor_player_id
     or new.reason is distinct from old.reason
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_hash is distinct from old.request_hash
     or new.starts_at is distinct from old.starts_at
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.ended_at is null then
    raise exception 'Placement overrides may only be ended once'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_placement_overrides_guard
before update or delete on public.event_placement_overrides
for each row execute function public.protect_event_placement_override();

create table public.event_placement_audit (
  id uuid primary key default gen_random_uuid(),
  policy_version_id text not null
    references public.event_placement_policy_versions (id) on delete restrict,
  plan_id uuid references public.event_placement_plans (id) on delete restrict,
  override_id uuid references public.event_placement_overrides (id) on delete restrict,
  actor_player_id uuid references public.players (id) on delete restrict,
  operation text not null,
  previous_state_version bigint not null,
  resulting_state_version bigint not null,
  reason text,
  previous_state jsonb not null default '{}'::jsonb,
  resulting_state jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint event_placement_audit_operation_check
    check (
      operation in (
        'apply_plan', 'record_failure', 'pin', 'exclude_site', 'pause',
        'end_override', 'suspend_site', 'retire_site', 'suspend_zone',
        'retire_zone', 'rollback'
      )
    ),
  constraint event_placement_audit_versions_check
    check (
      previous_state_version >= 0
      and resulting_state_version >= previous_state_version
    ),
  constraint event_placement_audit_reason_check
    check (
      reason is null
      or (
        reason = btrim(reason)
        and reason <> ''
        and char_length(reason) <= 1000
      )
    ),
  constraint event_placement_audit_json_check
    check (
      jsonb_typeof(previous_state) = 'object'
      and jsonb_typeof(resulting_state) = 'object'
    )
);

create index event_placement_audit_history_idx
  on public.event_placement_audit (occurred_at desc, id);

create index event_placement_audit_actor_idx
  on public.event_placement_audit (actor_player_id, occurred_at desc, id)
  where actor_player_id is not null;

create function public.validate_event_placement_audit_actor()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_status text;
begin
  if new.actor_player_id is null then
    if new.operation not in ('apply_plan', 'record_failure') then
      raise exception 'Manual placement audit operations require an Author'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select role, lifecycle_status
    into actor_role, actor_status
    from public.players
   where id = new.actor_player_id;
  if actor_role is distinct from 'author'
     or actor_status is distinct from 'active' then
    raise exception 'Placement audit actors must be active Authors'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger event_placement_audit_actor_guard
before insert on public.event_placement_audit
for each row execute function public.validate_event_placement_audit_actor();

create function public.prevent_event_placement_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Placement audit records are immutable'
    using errcode = '55006';
end;
$$;

create trigger event_placement_audit_immutability
before update or delete on public.event_placement_audit
for each row execute function public.prevent_event_placement_audit_mutation();

create function public.validate_event_placement_site_membership(
  site_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  target public.event_placement_sites%rowtype;
  containing_active_zone_count integer;
  target_zone_status text;
begin
  select * into target
    from public.event_placement_sites
   where id = site_id_to_validate;
  if not found or target.status <> 'active' then
    return;
  end if;

  select status into target_zone_status
    from public.event_placement_zones
   where id = target.zone_id;

  select count(*)::integer
    into containing_active_zone_count
    from public.event_placement_zones zone
   where zone.policy_version_id = target.policy_version_id
     and zone.status = 'active'
     and st_covers(zone.area, target.location::geometry);

  if not exists (
       select 1
         from public.event_placement_zones zone
        where zone.id = target.zone_id
          and st_covers(zone.area, target.location::geometry)
     )
     or (
       target_zone_status = 'active'
       and containing_active_zone_count <> 1
     )
     or (
       target_zone_status = 'suspended'
       and containing_active_zone_count <> 0
     )
     or target_zone_status not in ('active', 'suspended') then
    raise exception 'Active placement site must remain unambiguously inside its reviewed zone'
      using errcode = '23514';
  end if;
end;
$$;

create function public.validate_event_placement_zone_state(
  zone_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  target_status text;
begin
  select status into target_status
    from public.event_placement_zones
   where id = zone_id_to_validate;
  if not found then
    return;
  end if;

  if target_status = 'active' and not exists (
    select 1
      from public.event_placement_sites site
     where site.zone_id = zone_id_to_validate
       and site.status = 'active'
  ) then
    raise exception 'Active placement zone requires an active reviewed site'
      using errcode = '23514';
  end if;

  if target_status <> 'active' and exists (
    select 1
      from public.event_placement_assignments assignment
     where assignment.zone_id = zone_id_to_validate
       and assignment.ends_at is null
  ) then
    raise exception 'Inactive placement zone cannot retain a current assignment'
      using errcode = '23514';
  end if;
end;
$$;

create function public.validate_event_placement_site_state(
  site_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  target_status text;
begin
  select status into target_status
    from public.event_placement_sites
   where id = site_id_to_validate;
  if not found then
    return;
  end if;

  perform public.validate_event_placement_site_membership(site_id_to_validate);

  if target_status <> 'active' and exists (
    select 1
      from public.event_placement_assignments assignment
     where assignment.site_id = site_id_to_validate
       and assignment.ends_at is null
  ) then
    raise exception 'Inactive placement site cannot retain a current assignment'
      using errcode = '23514';
  end if;
end;
$$;

create function public.validate_event_placement_zone_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_event_placement_zone_state(coalesce(new.id, old.id));

  if tg_op <> 'DELETE' then
    perform public.validate_event_placement_site_membership(site.id)
      from public.event_placement_sites site
     where site.zone_id = new.id;
  end if;

  return null;
end;
$$;

create constraint trigger event_placement_zones_deferred_validation
after insert or update or delete on public.event_placement_zones
deferrable initially deferred
for each row execute function public.validate_event_placement_zone_after_mutation();

create function public.validate_event_placement_site_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_event_placement_site_state(coalesce(new.id, old.id));
  perform public.validate_event_placement_zone_state(coalesce(new.zone_id, old.zone_id));
  if tg_op = 'UPDATE' and old.zone_id is distinct from new.zone_id then
    perform public.validate_event_placement_zone_state(old.zone_id);
  end if;
  return null;
end;
$$;

create constraint trigger event_placement_sites_deferred_validation
after insert or update or delete on public.event_placement_sites
deferrable initially deferred
for each row execute function public.validate_event_placement_site_after_mutation();

create function public.validate_event_placement_assignment_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_event_placement_site_state(coalesce(new.site_id, old.site_id));
  perform public.validate_event_placement_zone_state(coalesce(new.zone_id, old.zone_id));
  return null;
end;
$$;

create constraint trigger event_placement_assignments_deferred_validation
after insert or update or delete on public.event_placement_assignments
deferrable initially deferred
for each row execute function public.validate_event_placement_assignment_after_mutation();
