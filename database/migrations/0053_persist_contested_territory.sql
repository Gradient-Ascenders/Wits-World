create table private.territory_policy_versions (
  policy_version text primary key,
  maximum_location_claim_age interval not null,
  zone_grant_lifetime interval not null,
  grant_cleanup_deadline interval not null,
  influence_per_eligible_win smallint not null,
  required_prior_ranked_settlements smallint not null,
  daily_influence_cap smallint not null,
  daily_cap_timezone text not null,
  settlement_cadence interval not null,
  minimum_ownership_influence smallint not null,
  owner_bonus_minimum_correct_answers smallint not null,
  owner_bonus_daily_limit smallint not null,
  owner_bonus_pool text not null,
  review_provenance text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_policy_versions_name_check
    check (
      policy_version = lower(policy_version)
      and policy_version ~ '^[a-z][a-z0-9-]{0,63}$'
    ),
  constraint territory_policy_versions_claim_check
    check (
      maximum_location_claim_age > interval '0 seconds'
      and zone_grant_lifetime > interval '0 seconds'
      and grant_cleanup_deadline > interval '0 seconds'
    ),
  constraint territory_policy_versions_influence_check
    check (
      influence_per_eligible_win > 0
      and required_prior_ranked_settlements >= 0
      and daily_influence_cap > 0
      and daily_cap_timezone = btrim(daily_cap_timezone)
      and daily_cap_timezone <> ''
      and char_length(daily_cap_timezone) <= 100
    ),
  constraint territory_policy_versions_settlement_check
    check (
      settlement_cadence > interval '0 seconds'
      and settlement_cadence <= interval '24 hours'
      and mod(
        86400::numeric,
        extract(epoch from settlement_cadence)::numeric
      ) = 0
      and minimum_ownership_influence > 0
    ),
  constraint territory_policy_versions_bonus_check
    check (
      owner_bonus_minimum_correct_answers > 0
      and owner_bonus_daily_limit > 0
      and owner_bonus_pool = btrim(owner_bonus_pool)
      and owner_bonus_pool ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
      and char_length(owner_bonus_pool) <= 100
    ),
  constraint territory_policy_versions_provenance_check
    check (
      review_provenance = btrim(review_provenance)
      and review_provenance <> ''
      and char_length(review_provenance) <= 200
    )
);

revoke all on table private.territory_policy_versions from public;

insert into private.territory_policy_versions (
  policy_version,
  maximum_location_claim_age,
  zone_grant_lifetime,
  grant_cleanup_deadline,
  influence_per_eligible_win,
  required_prior_ranked_settlements,
  daily_influence_cap,
  daily_cap_timezone,
  settlement_cadence,
  minimum_ownership_influence,
  owner_bonus_minimum_correct_answers,
  owner_bonus_daily_limit,
  owner_bonus_pool,
  review_provenance
) values (
  'territory-v1',
  interval '2 minutes',
  interval '5 minutes',
  interval '24 hours',
  1,
  5,
  5,
  'Africa/Johannesburg',
  interval '1 hour',
  3,
  3,
  1,
  'active_non_evolved_common',
  'Issue #267 reviewed contested-campus policy'
);

create function private.prevent_territory_policy_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Territory policy versions are immutable'
    using errcode = '55006';
end;
$$;

create trigger territory_policy_versions_immutability
before update or delete on private.territory_policy_versions
for each row execute function private.prevent_territory_policy_mutation();

create table public.territory_zones (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  zone_key text not null,
  definition_version integer not null default 1,
  name text not null,
  area geometry(MultiPolygon, 4326) not null,
  status text not null default 'pending_review',
  lifecycle_version integer not null default 0,
  source_placement_zone_id uuid,
  source_placement_policy_version text,
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

  constraint territory_zones_policy_key_version_unique
    unique (policy_version, zone_key, definition_version),
  constraint territory_zones_id_policy_unique
    unique (id, policy_version),
  constraint territory_zones_source_placement_fk
    foreign key (source_placement_zone_id, source_placement_policy_version)
    references public.event_placement_zones (id, policy_version_id)
    on delete restrict,
  constraint territory_zones_key_check
    check (zone_key = btrim(zone_key) and zone_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint territory_zones_definition_version_check
    check (definition_version > 0),
  constraint territory_zones_name_check
    check (name = btrim(name) and name <> '' and char_length(name) <= 120),
  constraint territory_zones_area_check
    check (
      st_srid(area) = 4326
      and geometrytype(area) = 'MULTIPOLYGON'
      and not st_isempty(area)
      and st_isvalid(area)
    ),
  constraint territory_zones_status_check
    check (status in ('pending_review', 'active', 'suspended', 'retired')),
  constraint territory_zones_lifecycle_version_check
    check (lifecycle_version >= 0),
  constraint territory_zones_source_placement_pair_check
    check (
      (source_placement_zone_id is null and source_placement_policy_version is null)
      or (source_placement_zone_id is not null and source_placement_policy_version is not null)
    ),
  constraint territory_zones_sources_check
    check (
      cardinality(source_urls) > 0
      and public.content_source_urls_are_valid(source_urls)
    ),
  constraint territory_zones_review_check
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
  constraint territory_zones_lifecycle_check
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
  constraint territory_zones_timestamps_check
    check (
      isfinite(created_at)
      and isfinite(updated_at)
      and updated_at >= created_at
      and (
        reviewed_at is null
        or (isfinite(reviewed_at) and reviewed_at >= created_at)
      )
      and (activated_at is null or activated_at >= reviewed_at)
      and (suspended_at is null or suspended_at >= activated_at)
      and (retired_at is null or retired_at >= created_at)
    )
);

create index territory_zones_area_gist_idx
  on public.territory_zones using gist (area);

create unique index territory_zones_one_current_definition_uidx
  on public.territory_zones (zone_key)
  where status in ('active', 'suspended');

create index territory_zones_active_idx
  on public.territory_zones (policy_version, zone_key, id)
  where status = 'active';

create function public.validate_territory_review_actor()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_status text;
begin
  if tg_op = 'UPDATE'
     and new.review_provenance is not distinct from old.review_provenance
     and new.reviewed_by_player_id is not distinct from old.reviewed_by_player_id
     and new.reviewed_at is not distinct from old.reviewed_at then
    return new;
  end if;

  if new.review_provenance is distinct from 'reviewed' then
    return new;
  end if;

  select role, lifecycle_status
    into actor_role, actor_status
    from public.players
   where id = new.reviewed_by_player_id;

  if actor_role is distinct from 'author'
     or actor_status is distinct from 'active' then
    raise exception 'Territory review requires an active Author'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_zones_review_actor_guard
before insert or update on public.territory_zones
for each row execute function public.validate_territory_review_actor();

create function public.protect_territory_zone_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_version <> 0 then
      raise exception 'New territory zones must begin at lifecycle version zero'
        using errcode = '23514';
    end if;

    if new.status <> 'pending_review'
       and new.review_provenance is distinct from 'controlled_policy' then
      raise exception 'New territory zones must begin pending review'
        using errcode = '55006';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Territory zones are retained for ownership history'
      using errcode = '55006';
  end if;

  if old.status = 'retired' then
    raise exception 'Retired territory zones are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.policy_version is distinct from old.policy_version
     or new.zone_key is distinct from old.zone_key
     or new.definition_version is distinct from old.definition_version
     or new.name is distinct from old.name
     or not st_equals(new.area, old.area)
     or new.source_placement_zone_id is distinct from old.source_placement_zone_id
     or new.source_placement_policy_version is distinct from old.source_placement_policy_version
     or new.source_urls is distinct from old.source_urls
     or new.created_at is distinct from old.created_at then
    raise exception 'Territory zone definitions and provenance are immutable'
      using errcode = '55006';
  end if;

  if old.status <> 'pending_review' and (
    new.review_provenance is distinct from old.review_provenance
    or new.reviewed_by_player_id is distinct from old.reviewed_by_player_id
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Reviewed territory-zone evidence is immutable'
      using errcode = '55006';
  end if;

  if new.updated_at < old.updated_at then
    raise exception 'Territory zone update timestamps cannot move backwards'
      using errcode = '23514';
  end if;

  if new.status is not distinct from old.status and (
    new.activated_at is distinct from old.activated_at
    or new.suspended_at is distinct from old.suspended_at
    or new.retired_at is distinct from old.retired_at
  ) then
    raise exception 'Territory lifecycle timestamps change only with lifecycle state'
      using errcode = '55006';
  end if;

  if old.activated_at is not null
     and new.activated_at is distinct from old.activated_at then
    raise exception 'Territory initial activation timestamp is immutable'
      using errcode = '55006';
  end if;

  if new.status = 'retired' and (
    new.activated_at is distinct from old.activated_at
    or new.suspended_at is distinct from old.suspended_at
  ) then
    raise exception 'Territory retirement cannot rewrite earlier lifecycle timestamps'
      using errcode = '55006';
  end if;

  if not (
    (old.status = 'pending_review' and new.status in ('pending_review', 'active', 'retired'))
    or (old.status = 'active' and new.status in ('active', 'suspended', 'retired'))
    or (old.status = 'suspended' and new.status in ('suspended', 'active', 'retired'))
  ) then
    raise exception 'Invalid territory zone lifecycle transition'
      using errcode = '55006';
  end if;

  if new.status is distinct from old.status then
    if new.lifecycle_version <> old.lifecycle_version + 1 then
      raise exception 'Territory zone lifecycle transitions must increment version once'
        using errcode = '40001';
    end if;
  elsif new.lifecycle_version <> old.lifecycle_version then
    raise exception 'Territory zone version changes require a lifecycle transition'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

create trigger territory_zones_lifecycle_guard
before insert or update or delete on public.territory_zones
for each row execute function public.protect_territory_zone_lifecycle();

create function public.reject_overlapping_active_territory_zone()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(9160268);

  if exists (
    select 1
      from public.territory_zones other
     where other.id <> new.id
       and other.status = 'active'
       and st_intersects(other.area, new.area)
       and not st_touches(other.area, new.area)
  ) then
    raise exception 'Active territory zones cannot overlap'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger territory_zones_no_active_overlap
before insert or update of status, area on public.territory_zones
for each row execute function public.reject_overlapping_active_territory_zone();

create table private.territory_ownership_versions (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null,
  policy_version text not null,
  state_version bigint not null,
  ranked_season_id uuid
    references public.ranked_seasons (id) on delete restrict,
  previous_owner_player_id uuid
    references public.players (id) on delete restrict,
  owner_player_id uuid
    references public.players (id) on delete restrict,
  transition_kind text not null,
  settlement_receipt_id uuid,
  effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_ownership_versions_zone_policy_fk
    foreign key (zone_id, policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_ownership_versions_zone_state_unique
    unique (zone_id, state_version),
  constraint territory_ownership_versions_id_zone_unique
    unique (id, zone_id),
  constraint territory_ownership_versions_state_check
    check (state_version >= 0),
  constraint territory_ownership_versions_transition_check
    check (
      transition_kind in (
        'activated',
        'reactivated',
        'settlement',
        'suspended',
        'retired',
        'account_deletion',
        'season_reset'
      )
    ),
  constraint territory_ownership_versions_settlement_shape_check
    check (
      (transition_kind = 'settlement' and settlement_receipt_id is not null)
      or (transition_kind <> 'settlement' and settlement_receipt_id is null)
    ),
  constraint territory_ownership_versions_unowned_transition_check
    check (
      transition_kind = 'settlement'
      or owner_player_id is null
    ),
  constraint territory_ownership_versions_timestamps_check
    check (isfinite(effective_at) and isfinite(created_at))
);

create unique index territory_ownership_versions_settlement_uidx
  on private.territory_ownership_versions (settlement_receipt_id)
  where settlement_receipt_id is not null;

create index territory_ownership_versions_history_idx
  on private.territory_ownership_versions (zone_id, state_version desc);

create index territory_ownership_versions_owner_history_idx
  on private.territory_ownership_versions (owner_player_id, effective_at desc)
  where owner_player_id is not null;

revoke all on table private.territory_ownership_versions from public;

create table private.territory_current_ownership (
  zone_id uuid primary key
    references public.territory_zones (id) on delete restrict,
  ownership_version_id uuid not null unique,
  updated_at timestamptz not null default clock_timestamp(),

  constraint territory_current_ownership_version_zone_fk
    foreign key (ownership_version_id, zone_id)
    references private.territory_ownership_versions (id, zone_id)
    on delete restrict,
  constraint territory_current_ownership_updated_at_check
    check (isfinite(updated_at))
);

revoke all on table private.territory_current_ownership from public;

create table private.territory_contribution_decisions (
  source_match_id uuid primary key,
  ranked_season_id uuid not null,
  ranked_policy_version text not null,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  winner_player_id uuid not null
    references public.players (id) on delete restrict,
  zone_id uuid,
  outcome text not null,
  influence_points smallint not null,
  exclusion_reason text,
  decided_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_contribution_decisions_ranked_settlement_fk
    foreign key (source_match_id, ranked_season_id, ranked_policy_version)
    references private.ranked_rating_settlements (
      match_id,
      season_id,
      policy_version
    )
    on delete restrict,
  constraint territory_contribution_decisions_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_contribution_decisions_outcome_check
    check (outcome in ('accepted', 'excluded')),
  constraint territory_contribution_decisions_shape_check
    check (
      (
        outcome = 'accepted'
        and zone_id is not null
        and influence_points > 0
        and exclusion_reason is null
      )
      or (
        outcome = 'excluded'
        and influence_points = 0
        and exclusion_reason is not null
        and exclusion_reason = btrim(exclusion_reason)
        and exclusion_reason ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
        and char_length(exclusion_reason) <= 100
      )
    ),
  constraint territory_contribution_decisions_timestamps_check
    check (isfinite(decided_at) and isfinite(created_at))
);

create index territory_contribution_decisions_player_history_idx
  on private.territory_contribution_decisions (winner_player_id, decided_at desc);

create index territory_contribution_decisions_zone_history_idx
  on private.territory_contribution_decisions (zone_id, decided_at desc)
  where zone_id is not null;

revoke all on table private.territory_contribution_decisions from public;

create table private.territory_influence_contributions (
  source_match_id uuid primary key
    references private.territory_contribution_decisions (source_match_id)
    on delete restrict,
  ranked_season_id uuid not null
    references public.ranked_seasons (id) on delete restrict,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  zone_id uuid not null,
  player_id uuid not null
    references public.players (id) on delete restrict,
  influence_points smallint not null,
  contributed_at timestamptz not null default clock_timestamp(),
  contribution_date date not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_influence_contributions_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_influence_contributions_points_check
    check (influence_points > 0),
  constraint territory_influence_contributions_timestamps_check
    check (isfinite(contributed_at) and isfinite(created_at))
);

create index territory_influence_contributions_window_idx
  on private.territory_influence_contributions (
    zone_id,
    ranked_season_id,
    contributed_at,
    player_id
  );

create index territory_influence_contributions_daily_cap_idx
  on private.territory_influence_contributions (
    zone_id,
    player_id,
    contribution_date,
    contributed_at
  );

revoke all on table private.territory_influence_contributions from public;

create table private.territory_settlement_receipts (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null,
  ranked_season_id uuid not null
    references public.ranked_seasons (id) on delete restrict,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  window_start timestamptz not null,
  window_end timestamptz not null,
  expected_state_version bigint not null,
  resulting_state_version bigint not null,
  owner_before_player_id uuid
    references public.players (id) on delete restrict,
  owner_after_player_id uuid
    references public.players (id) on delete restrict,
  input_digest text not null,
  settled_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_settlement_receipts_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_settlement_receipts_window_unique
    unique (zone_id, ranked_season_id, window_start, window_end),
  constraint territory_settlement_receipts_state_unique
    unique (zone_id, resulting_state_version),
  constraint territory_settlement_receipts_window_check
    check (
      isfinite(window_start)
      and isfinite(window_end)
      and window_end > window_start
    ),
  constraint territory_settlement_receipts_state_check
    check (
      expected_state_version >= 0
      and resulting_state_version = expected_state_version + 1
    ),
  constraint territory_settlement_receipts_digest_check
    check (input_digest ~ '^[0-9a-f]{64}$'),
  constraint territory_settlement_receipts_timestamps_check
    check (isfinite(settled_at) and isfinite(created_at))
);

create index territory_settlement_receipts_zone_history_idx
  on private.territory_settlement_receipts (
    zone_id,
    ranked_season_id,
    window_start desc
  );

revoke all on table private.territory_settlement_receipts from public;

create table private.territory_settlement_totals (
  settlement_receipt_id uuid not null
    references private.territory_settlement_receipts (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  accepted_influence_count smallint not null,
  earliest_contribution_at timestamptz not null,
  account_eligible boolean not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (settlement_receipt_id, player_id),
  constraint territory_settlement_totals_count_check
    check (accepted_influence_count > 0),
  constraint territory_settlement_totals_timestamps_check
    check (isfinite(earliest_contribution_at) and isfinite(created_at))
);

create index territory_settlement_totals_tiebreak_idx
  on private.territory_settlement_totals (
    settlement_receipt_id,
    accepted_influence_count desc,
    earliest_contribution_at,
    player_id
  );

revoke all on table private.territory_settlement_totals from public;

alter table private.territory_ownership_versions
  add constraint territory_ownership_versions_settlement_fk
  foreign key (settlement_receipt_id)
  references private.territory_settlement_receipts (id)
  on delete restrict
  deferrable initially deferred;

create function private.prevent_territory_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Territory contribution, settlement, and ownership history is immutable'
    using errcode = '55006';
end;
$$;

create trigger territory_contribution_decisions_immutability
before update or delete on private.territory_contribution_decisions
for each row execute function private.prevent_territory_history_mutation();

create trigger territory_influence_contributions_immutability
before update or delete on private.territory_influence_contributions
for each row execute function private.prevent_territory_history_mutation();

create trigger territory_settlement_receipts_immutability
before update or delete on private.territory_settlement_receipts
for each row execute function private.prevent_territory_history_mutation();

create trigger territory_settlement_totals_immutability
before update or delete on private.territory_settlement_totals
for each row execute function private.prevent_territory_history_mutation();

create trigger territory_ownership_versions_immutability
before update or delete on private.territory_ownership_versions
for each row execute function private.prevent_territory_history_mutation();

create function private.validate_territory_contribution_decision()
returns trigger
language plpgsql
as $$
declare
  ranked_winner uuid;
  ranked_settled_at timestamptz;
  zone_status text;
  winner_status text;
  expected_influence_points smallint;
begin
  select settlement.winner_player_id, settlement.settled_at
    into ranked_winner, ranked_settled_at
    from private.ranked_rating_settlements settlement
   where settlement.match_id = new.source_match_id
     and settlement.season_id = new.ranked_season_id
     and settlement.policy_version = new.ranked_policy_version;

  new.decided_at := clock_timestamp();

  if ranked_winner is null
     or ranked_winner is distinct from new.winner_player_id
     or new.decided_at < ranked_settled_at then
    raise exception 'Territory decision must derive from its authoritative ranked winner'
      using errcode = '23514';
  end if;

  if new.outcome = 'accepted' then
    select status
      into zone_status
      from public.territory_zones
     where id = new.zone_id
       and policy_version = new.territory_policy_version;

    select lifecycle_status
      into winner_status
      from public.players
     where id = new.winner_player_id;

    select policy.influence_per_eligible_win
      into expected_influence_points
      from private.territory_policy_versions policy
     where policy.policy_version = new.territory_policy_version;

    if zone_status is distinct from 'active'
       or winner_status is distinct from 'active'
       or new.influence_points is distinct from expected_influence_points then
      raise exception 'Accepted territory influence conflicts with policy or active state'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger territory_contribution_decisions_validation
before insert on private.territory_contribution_decisions
for each row execute function private.validate_territory_contribution_decision();

create function private.prepare_territory_influence_contribution()
returns trigger
language plpgsql
as $$
declare
  decision_record private.territory_contribution_decisions%rowtype;
  zone_status text;
  player_status text;
  daily_cap smallint;
  daily_timezone text;
  expected_influence_points smallint;
  existing_daily_count integer;
begin
  select lifecycle_status
    into player_status
    from public.players
   where id = new.player_id
   for update;

  if player_status is distinct from 'active' then
    raise exception 'Territory influence requires an active player'
      using errcode = '23514';
  end if;

  perform 1
    from public.territory_zones
   where id = new.zone_id
     and policy_version = new.territory_policy_version
   for update;

  if not found then
    raise exception 'Territory contribution references an unknown zone version'
      using errcode = '23503';
  end if;

  select status
    into zone_status
    from public.territory_zones
   where id = new.zone_id;

  if zone_status is distinct from 'active' then
    raise exception 'Territory influence can only be recorded for an active zone'
      using errcode = '23514';
  end if;

  select *
    into decision_record
    from private.territory_contribution_decisions
   where source_match_id = new.source_match_id;

  if not found
     or decision_record.outcome <> 'accepted'
     or decision_record.zone_id is distinct from new.zone_id
     or decision_record.winner_player_id is distinct from new.player_id
     or decision_record.ranked_season_id is distinct from new.ranked_season_id
     or decision_record.territory_policy_version is distinct from new.territory_policy_version
     or decision_record.influence_points is distinct from new.influence_points then
    raise exception 'Territory contribution must match one accepted source decision'
      using errcode = '23514';
  end if;

  select policy.daily_influence_cap,
         policy.daily_cap_timezone,
         policy.influence_per_eligible_win
    into daily_cap, daily_timezone, expected_influence_points
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  if new.influence_points is distinct from expected_influence_points then
    raise exception 'Territory contribution points conflict with policy'
      using errcode = '23514';
  end if;

  new.contributed_at := clock_timestamp();
  new.contribution_date := timezone(daily_timezone, new.contributed_at)::date;

  select count(*)::integer
    into existing_daily_count
    from private.territory_influence_contributions contribution
   where contribution.zone_id = new.zone_id
     and contribution.player_id = new.player_id
     and contribution.contribution_date = new.contribution_date;

  if existing_daily_count >= daily_cap then
    raise exception 'Territory daily influence cap exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_influence_contributions_prepare
before insert on private.territory_influence_contributions
for each row execute function private.prepare_territory_influence_contribution();

create function private.validate_territory_decision_shape(
  source_match_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  decision_outcome text;
  contribution_count integer;
begin
  select outcome
    into decision_outcome
    from private.territory_contribution_decisions
   where source_match_id = source_match_id_to_validate;

  if not found then
    return;
  end if;

  select count(*)::integer
    into contribution_count
    from private.territory_influence_contributions contribution
   where contribution.source_match_id = source_match_id_to_validate;

  if (decision_outcome = 'accepted' and contribution_count <> 1)
     or (decision_outcome = 'excluded' and contribution_count <> 0) then
    raise exception 'Territory decisions and accepted contribution rows disagree'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_territory_decision_shape_trigger()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_territory_decision_shape(new.source_match_id);
  return null;
end;
$$;

create constraint trigger territory_decisions_require_contribution
  after insert on private.territory_contribution_decisions
  deferrable initially deferred
  for each row execute function private.validate_territory_decision_shape_trigger();

create constraint trigger territory_contributions_match_decision
  after insert on private.territory_influence_contributions
  deferrable initially deferred
  for each row execute function private.validate_territory_decision_shape_trigger();

create function private.validate_territory_daily_cap()
returns trigger
language plpgsql
as $$
declare
  daily_cap smallint;
  contribution_count integer;
begin
  select policy.daily_influence_cap
    into daily_cap
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  select count(*)::integer
    into contribution_count
    from private.territory_influence_contributions contribution
   where contribution.zone_id = new.zone_id
     and contribution.player_id = new.player_id
     and contribution.contribution_date = new.contribution_date;

  if contribution_count > daily_cap then
    raise exception 'Territory daily influence cap exceeded'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger territory_contributions_daily_cap
  after insert on private.territory_influence_contributions
  deferrable initially deferred
  for each row execute function private.validate_territory_daily_cap();

create function private.validate_territory_ownership_version()
returns trigger
language plpgsql
as $$
declare
  previous_record private.territory_ownership_versions%rowtype;
  zone_status text;
  player_status text;
  receipt_record private.territory_settlement_receipts%rowtype;
begin
  perform 1
    from public.territory_zones
   where id = new.zone_id
     and policy_version = new.policy_version
   for update;

  if not found then
    raise exception 'Territory ownership references an unknown zone version'
      using errcode = '23503';
  end if;

  select *
    into previous_record
    from private.territory_ownership_versions version
   where version.zone_id = new.zone_id
   order by version.state_version desc
   limit 1;

  if found then
    if new.state_version <> previous_record.state_version + 1
       or new.previous_owner_player_id is distinct from previous_record.owner_player_id
       or new.effective_at < previous_record.effective_at then
      raise exception 'Territory ownership versions must advance from authoritative history'
        using errcode = '40001';
    end if;
  elsif new.state_version <> 0
        or new.previous_owner_player_id is not null
        or new.transition_kind <> 'activated' then
    raise exception 'Territory ownership history must begin unowned at activation'
      using errcode = '23514';
  end if;

  select status
    into zone_status
    from public.territory_zones
   where id = new.zone_id;

  if new.owner_player_id is not null then
    select lifecycle_status
      into player_status
      from public.players
     where id = new.owner_player_id;

    if zone_status is distinct from 'active'
       or player_status is distinct from 'active' then
      raise exception 'Territory ownership requires an active zone and player'
        using errcode = '23514';
    end if;
  end if;

  if new.transition_kind = 'settlement' then
    select *
      into receipt_record
      from private.territory_settlement_receipts receipt
     where receipt.id = new.settlement_receipt_id;

    if not found
       or receipt_record.zone_id is distinct from new.zone_id
       or receipt_record.territory_policy_version is distinct from new.policy_version
       or receipt_record.ranked_season_id is distinct from new.ranked_season_id
       or receipt_record.expected_state_version is distinct from new.state_version - 1
       or receipt_record.resulting_state_version is distinct from new.state_version
       or receipt_record.owner_before_player_id is distinct from new.previous_owner_player_id
       or receipt_record.owner_after_player_id is distinct from new.owner_player_id
       or receipt_record.settled_at is distinct from new.effective_at then
      raise exception 'Territory settlement ownership version conflicts with its receipt'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger territory_ownership_versions_validation
before insert on private.territory_ownership_versions
for each row execute function private.validate_territory_ownership_version();

create function private.refresh_territory_current_ownership()
returns trigger
language plpgsql
as $$
begin
  insert into private.territory_current_ownership (
    zone_id,
    ownership_version_id,
    updated_at
  ) values (
    new.zone_id,
    new.id,
    clock_timestamp()
  )
  on conflict (zone_id) do update
    set ownership_version_id = excluded.ownership_version_id,
        updated_at = excluded.updated_at;

  return null;
end;
$$;

create trigger territory_ownership_versions_refresh_projection
  after insert on private.territory_ownership_versions
  for each row execute function private.refresh_territory_current_ownership();

create function private.validate_territory_current_ownership_projection()
returns trigger
language plpgsql
as $$
declare
  target_zone_id uuid;
  latest_version_id uuid;
  projected_version_id uuid;
begin
  if tg_op = 'DELETE' then
    target_zone_id := old.zone_id;
  else
    target_zone_id := new.zone_id;
  end if;

  select version.id
    into latest_version_id
    from private.territory_ownership_versions version
   where version.zone_id = target_zone_id
   order by version.state_version desc
   limit 1;

  select current_state.ownership_version_id
    into projected_version_id
    from private.territory_current_ownership current_state
   where current_state.zone_id = target_zone_id;

  if projected_version_id is distinct from latest_version_id then
    raise exception 'Territory current ownership must match authoritative history'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger territory_current_ownership_matches_history
  after insert or update or delete on private.territory_current_ownership
  deferrable initially deferred
  for each row execute function private.validate_territory_current_ownership_projection();

create function private.rebuild_territory_current_ownership()
returns integer
language plpgsql
as $$
declare
  rebuilt_count integer;
begin
  perform pg_advisory_xact_lock(9160269);
  lock table private.territory_ownership_versions in share mode;

  delete from private.territory_current_ownership;

  insert into private.territory_current_ownership (
    zone_id,
    ownership_version_id,
    updated_at
  )
  select distinct on (version.zone_id)
    version.zone_id,
    version.id,
    clock_timestamp()
  from private.territory_ownership_versions version
  order by version.zone_id, version.state_version desc;

  get diagnostics rebuilt_count = row_count;
  return rebuilt_count;
end;
$$;

revoke all on function private.rebuild_territory_current_ownership() from public;

create function private.record_territory_zone_lifecycle_ownership()
returns trigger
language plpgsql
as $$
declare
  previous_record private.territory_ownership_versions%rowtype;
  next_state_version bigint;
  transition text;
  transition_at timestamptz;
  next_season_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      return null;
    end if;
    transition := 'activated';
    transition_at := new.activated_at;
    next_state_version := 0;
    next_season_id := null;
  elsif new.status is not distinct from old.status then
    return null;
  elsif new.status = 'active' then
    transition := case when old.status = 'suspended' then 'reactivated' else 'activated' end;
    transition_at := case
      when old.status = 'suspended' then clock_timestamp()
      else new.activated_at
    end;
  elsif new.status = 'suspended' then
    transition := 'suspended';
    transition_at := new.suspended_at;
  elsif new.status = 'retired' then
    transition := 'retired';
    transition_at := new.retired_at;
  else
    return null;
  end if;

  select *
    into previous_record
    from private.territory_ownership_versions version
   where version.zone_id = new.id
   order by version.state_version desc
   limit 1;

  if not found and transition = 'retired' then
    return null;
  end if;

  if found then
    next_state_version := previous_record.state_version + 1;
    next_season_id := case
      when transition in ('suspended', 'retired') then previous_record.ranked_season_id
      else null
    end;
  elsif next_state_version is null then
    next_state_version := 0;
    next_season_id := null;
  end if;

  insert into private.territory_ownership_versions (
    zone_id,
    policy_version,
    state_version,
    ranked_season_id,
    previous_owner_player_id,
    owner_player_id,
    transition_kind,
    effective_at
  ) values (
    new.id,
    new.policy_version,
    next_state_version,
    next_season_id,
    case when found then previous_record.owner_player_id else null end,
    null,
    transition,
    transition_at
  );

  return null;
end;
$$;

create trigger territory_zones_ownership_lifecycle
  after insert or update of status on public.territory_zones
  for each row execute function private.record_territory_zone_lifecycle_ownership();

create function private.validate_territory_settlement_receipt()
returns trigger
language plpgsql
as $$
declare
  zone_record public.territory_zones%rowtype;
  current_version private.territory_ownership_versions%rowtype;
  policy_record private.territory_policy_versions%rowtype;
  season_status text;
  owner_status text;
  local_window_start timestamp without time zone;
  local_day_start timestamp without time zone;
  cadence_seconds numeric;
  offset_seconds numeric;
begin
  select *
    into policy_record
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  if not found then
    raise exception 'Territory settlement references an unknown policy version'
      using errcode = '23503';
  end if;

  perform 1
    from public.players player
   where player.id in (new.owner_before_player_id, new.owner_after_player_id)
   order by player.id
   for update;

  select *
    into zone_record
    from public.territory_zones zone
   where zone.id = new.zone_id
     and zone.policy_version = new.territory_policy_version
   for update;

  if not found or zone_record.status <> 'active' then
    raise exception 'Territory settlement requires an active zone version'
      using errcode = '23514';
  end if;

  select *
    into current_version
    from private.territory_ownership_versions version
   where version.zone_id = new.zone_id
   order by version.state_version desc
   limit 1;

  if not found
     or current_version.state_version is distinct from new.expected_state_version
     or current_version.owner_player_id is distinct from new.owner_before_player_id then
    raise exception 'Territory settlement expected state is stale'
      using errcode = '40001';
  end if;

  select status
    into season_status
    from public.ranked_seasons
   where id = new.ranked_season_id;

  if season_status not in ('active', 'closing') then
    raise exception 'Territory settlement requires an active or closing ranked season'
      using errcode = '23514';
  end if;

  if new.owner_after_player_id is not null then
    select lifecycle_status
      into owner_status
      from public.players
     where id = new.owner_after_player_id;

    if owner_status is distinct from 'active' then
      raise exception 'Territory settlement cannot assign an unavailable player'
        using errcode = '23514';
    end if;
  end if;

  if new.window_end is distinct from new.window_start + policy_record.settlement_cadence then
    raise exception 'Territory settlement window duration conflicts with policy'
      using errcode = '23514';
  end if;

  local_window_start := timezone(
    policy_record.daily_cap_timezone,
    new.window_start
  );
  local_day_start := date_trunc('day', local_window_start);
  cadence_seconds := extract(epoch from policy_record.settlement_cadence);
  offset_seconds := extract(epoch from (local_window_start - local_day_start));

  if mod(offset_seconds, cadence_seconds) <> 0 then
    raise exception 'Territory settlement window is not aligned to policy cadence'
      using errcode = '23514';
  end if;

  new.settled_at := clock_timestamp();

  if new.window_end > new.settled_at then
    raise exception 'Territory settlement cannot close a future window'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_settlement_receipts_validation
before insert on private.territory_settlement_receipts
for each row execute function private.validate_territory_settlement_receipt();

create function private.record_territory_settlement_ownership()
returns trigger
language plpgsql
as $$
begin
  insert into private.territory_ownership_versions (
    zone_id,
    policy_version,
    state_version,
    ranked_season_id,
    previous_owner_player_id,
    owner_player_id,
    transition_kind,
    settlement_receipt_id,
    effective_at
  ) values (
    new.zone_id,
    new.territory_policy_version,
    new.resulting_state_version,
    new.ranked_season_id,
    new.owner_before_player_id,
    new.owner_after_player_id,
    'settlement',
    new.id,
    new.settled_at
  );

  return null;
end;
$$;

create trigger territory_settlement_receipts_record_ownership
  after insert on private.territory_settlement_receipts
  for each row execute function private.record_territory_settlement_ownership();

create function private.validate_territory_settlement_totals(
  receipt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  receipt_record private.territory_settlement_receipts%rowtype;
  mismatch_count integer;
begin
  select *
    into receipt_record
    from private.territory_settlement_receipts receipt
   where receipt.id = receipt_id_to_validate;

  if not found then
    return;
  end if;

  with expected as (
    select
      contribution.player_id,
      count(*)::integer accepted_influence_count,
      min(contribution.contributed_at) earliest_contribution_at
    from private.territory_influence_contributions contribution
    where contribution.zone_id = receipt_record.zone_id
      and contribution.ranked_season_id = receipt_record.ranked_season_id
      and contribution.territory_policy_version = receipt_record.territory_policy_version
      and contribution.contributed_at >= receipt_record.window_start
      and contribution.contributed_at < receipt_record.window_end
    group by contribution.player_id
  ),
  actual as (
    select total.player_id,
           total.accepted_influence_count::integer accepted_influence_count,
           total.earliest_contribution_at
      from private.territory_settlement_totals total
     where total.settlement_receipt_id = receipt_id_to_validate
  )
  select count(*)::integer
    into mismatch_count
    from (
      (select * from expected except select * from actual)
      union all
      (select * from actual except select * from expected)
    ) mismatch;

  if mismatch_count <> 0 then
    raise exception 'Territory settlement totals must match authoritative contributions'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_territory_settlement_totals_trigger()
returns trigger
language plpgsql
as $$
declare
  receipt_id_to_validate uuid;
begin
  if tg_table_name = 'territory_settlement_receipts' then
    receipt_id_to_validate := new.id;
  else
    receipt_id_to_validate := new.settlement_receipt_id;
  end if;

  perform private.validate_territory_settlement_totals(receipt_id_to_validate);
  return null;
end;
$$;

create constraint trigger territory_settlement_receipts_totals_valid
  after insert on private.territory_settlement_receipts
  deferrable initially deferred
  for each row execute function private.validate_territory_settlement_totals_trigger();

create constraint trigger territory_settlement_totals_valid
  after insert on private.territory_settlement_totals
  deferrable initially deferred
  for each row execute function private.validate_territory_settlement_totals_trigger();

create function private.clear_territory_ownership_for_account_deletion()
returns trigger
language plpgsql
as $$
declare
  candidate_zone_id uuid;
  owned_zone private.territory_ownership_versions%rowtype;
begin
  if old.lifecycle_status = 'active'
     and new.lifecycle_status = 'deletion_pending' then
    for candidate_zone_id in
      select current_state.zone_id
        from private.territory_current_ownership current_state
        join private.territory_ownership_versions version
          on version.id = current_state.ownership_version_id
       where version.owner_player_id = new.id
       order by current_state.zone_id
    loop
      perform 1
        from public.territory_zones zone
       where zone.id = candidate_zone_id
       for update;

      select version.*
        into owned_zone
        from private.territory_current_ownership current_state
        join private.territory_ownership_versions version
          on version.id = current_state.ownership_version_id
       where current_state.zone_id = candidate_zone_id
         and version.owner_player_id = new.id;

      if not found then
        continue;
      end if;

      insert into private.territory_ownership_versions (
        zone_id,
        policy_version,
        state_version,
        ranked_season_id,
        previous_owner_player_id,
        owner_player_id,
        transition_kind,
        effective_at
      ) values (
        owned_zone.zone_id,
        owned_zone.policy_version,
        owned_zone.state_version + 1,
        owned_zone.ranked_season_id,
        owned_zone.owner_player_id,
        null,
        'account_deletion',
        new.updated_at
      );
    end loop;
  end if;

  return null;
end;
$$;

create trigger players_clear_territory_ownership_on_deletion
  after update of lifecycle_status on public.players
  for each row execute function private.clear_territory_ownership_for_account_deletion();

create function private.bootstrap_territory_v1_zones()
returns integer
language plpgsql
as $$
declare
  required_keys constant text[] := array[
    'east_campus',
    'west_campus',
    'arts_and_community'
  ];
  existing_territory_count integer;
  source_count integer;
  inserted_count integer := 0;
begin
  perform pg_advisory_xact_lock(9160268);

  select count(*)::integer
    into existing_territory_count
    from public.territory_zones zone
   where zone.policy_version = 'territory-v1';

  select count(*)::integer
    into source_count
    from public.event_placement_zones source
   where source.policy_version_id = 'placement-v1'
     and source.zone_key = any(required_keys);

  if existing_territory_count = 0 then
    if source_count = 0 then
      return 0;
    end if;

    if source_count <> 3
       or exists (
         select 1
           from public.event_placement_zones source
          where source.policy_version_id = 'placement-v1'
            and source.zone_key = any(required_keys)
            and (
              source.review_provenance is distinct from 'controlled_policy'
              or source.reviewed_at is null
              or not st_isvalid(source.area)
              or st_isempty(source.area)
            )
       ) then
      raise exception 'territory-v1 requires the three reviewed placement-v1 zones'
        using errcode = '23514';
    end if;

    insert into public.territory_zones (
      id,
      policy_version,
      zone_key,
      definition_version,
      name,
      area,
      status,
      lifecycle_version,
      source_placement_zone_id,
      source_placement_policy_version,
      source_urls,
      review_provenance,
      reviewed_at,
      activated_at,
      created_at,
      updated_at
    )
    select
      md5('wits-world-territory-zone:' || source.zone_key || ':v1')::uuid,
      'territory-v1',
      source.zone_key,
      1,
      source.name,
      source.area,
      'active',
      0,
      source.id,
      source.policy_version_id,
      source.source_urls,
      source.review_provenance,
      source.reviewed_at,
      source.activated_at,
      greatest(source.created_at, source.reviewed_at),
      greatest(source.updated_at, source.reviewed_at)
    from public.event_placement_zones source
    where source.policy_version_id = 'placement-v1'
      and source.zone_key = any(required_keys)
    order by source.zone_key;

    get diagnostics inserted_count = row_count;
  end if;

  if (
    select count(*)
      from public.territory_zones zone
     where zone.policy_version = 'territory-v1'
       and zone.definition_version = 1
       and zone.zone_key = any(required_keys)
  ) <> 3 then
    raise exception 'territory-v1 requires exactly three reviewed zone definitions'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.territory_zones territory
      join public.event_placement_zones source
        on source.id = territory.source_placement_zone_id
       and source.policy_version_id = territory.source_placement_policy_version
     where territory.policy_version = 'territory-v1'
       and territory.definition_version = 1
       and territory.zone_key = any(required_keys)
       and (
         source.policy_version_id <> 'placement-v1'
         or source.zone_key is distinct from territory.zone_key
         or source.name is distinct from territory.name
         or not st_equals(source.area, territory.area)
         or source.source_urls is distinct from territory.source_urls
         or source.review_provenance is distinct from territory.review_provenance
         or source.reviewed_at is distinct from territory.reviewed_at
       )
  ) then
    raise exception 'territory-v1 conflicts with reviewed placement-v1 provenance'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.territory_zones territory
     where territory.policy_version = 'territory-v1'
       and territory.definition_version = 1
       and territory.zone_key = any(required_keys)
       and territory.source_placement_zone_id is null
  ) then
    raise exception 'territory-v1 requires placement provenance for every initial zone'
      using errcode = '23514';
  end if;

  return inserted_count;
end;
$$;

revoke all on function private.bootstrap_territory_v1_zones() from public;

select private.bootstrap_territory_v1_zones();
