-- Issue #270 implements the server-authoritative runtime contract defined by
-- territory-v1. Published migration 0053 remains immutable; this migration is
-- additive and replaces only database functions whose runtime invariants need
-- to account for grants, final partial settlements, and owner bonuses.

alter table private.ranked_queue_entries
  add column territory_contender boolean not null default false;

create or replace function private.protect_ranked_queue_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'searching'
       or new.version <> 0
       or new.lease_expires_at is distinct from new.updated_at + interval '30 seconds' then
      raise exception 'New ranked queue entries require a 30-second searching lease'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Ranked queue entries are retained as matchmaking history'
      using errcode = '55006';
  end if;

  if old.selected_deck_id is not null
     and new.selected_deck_id is null
     and old.status not in ('searching', 'proposed')
     and new.territory_contender is not distinct from old.territory_contender
     and to_jsonb(new) - array['selected_deck_id'] = to_jsonb(old) - array['selected_deck_id'] then
    return new;
  end if;

  if old.status not in ('searching', 'proposed') then
    raise exception 'Terminal ranked queue entries are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.season_id is distinct from old.season_id
     or new.player_id is distinct from old.player_id
     or new.selected_deck_id is distinct from old.selected_deck_id
     or new.territory_contender is distinct from old.territory_contender
     or new.original_joined_at is distinct from old.original_joined_at
     or new.created_at is distinct from old.created_at
     or new.version <> old.version + 1 then
    raise exception 'Ranked queue identity is immutable and updates advance one version'
      using errcode = '40001';
  end if;

  if old.status = 'searching' then
    if new.status = 'searching' then
      if new.active_proposal_id is not null
         or new.terminal_at is not null
         or new.lease_expires_at is distinct from new.updated_at + interval '30 seconds' then
        raise exception 'Ranked queue heartbeats must renew exactly one lease'
          using errcode = '23514';
      end if;
    elsif new.status = 'proposed' then
      if new.active_proposal_id is null then
        raise exception 'Claimed ranked queue entries require an active proposal'
          using errcode = '23514';
      end if;
    elsif new.status not in ('cancelled', 'expired', 'restricted', 'invalid_deck') then
      raise exception 'Invalid searching ranked queue transition'
        using errcode = '55006';
    end if;
  elsif old.status = 'proposed' then
    if new.status = 'searching' then
      if new.active_proposal_id is not null
         or new.terminal_at is not null
         or new.lease_expires_at is distinct from new.updated_at + interval '30 seconds' then
        raise exception 'Requeued ranked entries require a fresh 30-second lease'
          using errcode = '23514';
      end if;
    elsif new.status not in (
      'matched',
      'cancelled',
      'expired',
      'restricted',
      'invalid_deck'
    ) then
      raise exception 'Invalid proposed ranked queue transition'
        using errcode = '55006';
    end if;
  end if;

  return new;
end;
$$;

create table private.territory_zone_grants (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null unique,
  ranked_season_id uuid not null,
  player_id uuid not null,
  zone_id uuid not null,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  zone_lifecycle_version integer not null,
  decision_version integer not null default 1,
  decision_outcome text not null default 'granted',
  device_acquired_at timestamptz not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_match_id uuid
    references public.live_pvp_matches (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_zone_grants_queue_fk
    foreign key (queue_entry_id, ranked_season_id, player_id)
    references private.ranked_queue_entries (id, season_id, player_id)
    on delete restrict,
  constraint territory_zone_grants_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_zone_grants_versions_check
    check (zone_lifecycle_version >= 0 and decision_version > 0),
  constraint territory_zone_grants_outcome_check
    check (decision_outcome = 'granted'),
  constraint territory_zone_grants_use_shape_check
    check (
      (used_at is null and used_match_id is null)
      or (used_at is not null and used_match_id is not null)
    ),
  constraint territory_zone_grants_timestamps_check
    check (
      isfinite(device_acquired_at)
      and isfinite(issued_at)
      and isfinite(expires_at)
      and isfinite(created_at)
      and device_acquired_at <= issued_at
      and expires_at > issued_at
      and (used_at is null or (isfinite(used_at) and used_at >= issued_at and used_at < expires_at))
    )
);

create index territory_zone_grants_expiry_idx
  on private.territory_zone_grants (expires_at, id);

create index territory_zone_grants_player_idx
  on private.territory_zone_grants (player_id, expires_at desc);

revoke all on table private.territory_zone_grants from public;

create function private.validate_territory_zone_grant()
returns trigger
language plpgsql
as $$
declare
  queue_record private.ranked_queue_entries%rowtype;
  zone_record public.territory_zones%rowtype;
  policy_record private.territory_policy_versions%rowtype;
begin
  select *
    into queue_record
    from private.ranked_queue_entries queue
   where queue.id = new.queue_entry_id
     and queue.season_id = new.ranked_season_id
     and queue.player_id = new.player_id;

  if not found or not queue_record.territory_contender then
    raise exception 'Territory grants require a contender queue entry'
      using errcode = '23514';
  end if;

  select *
    into zone_record
    from public.territory_zones zone
   where zone.id = new.zone_id
     and zone.policy_version = new.territory_policy_version;

  if not found
     or zone_record.status <> 'active'
     or zone_record.lifecycle_version <> new.zone_lifecycle_version then
    raise exception 'Territory grants require the active reviewed zone version'
      using errcode = '23514';
  end if;

  select *
    into policy_record
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  if not found
     or new.expires_at is distinct from new.issued_at + policy_record.zone_grant_lifetime
     or new.issued_at - new.device_acquired_at > policy_record.maximum_location_claim_age then
    raise exception 'Territory grant timing conflicts with policy'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_zone_grants_validation
before insert on private.territory_zone_grants
for each row execute function private.validate_territory_zone_grant();

create function private.protect_territory_zone_grant()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if old.used_at is not null then
    raise exception 'Consumed territory grants are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.queue_entry_id is distinct from old.queue_entry_id
     or new.ranked_season_id is distinct from old.ranked_season_id
     or new.player_id is distinct from old.player_id
     or new.zone_id is distinct from old.zone_id
     or new.territory_policy_version is distinct from old.territory_policy_version
     or new.zone_lifecycle_version is distinct from old.zone_lifecycle_version
     or new.decision_version is distinct from old.decision_version
     or new.decision_outcome is distinct from old.decision_outcome
     or new.device_acquired_at is distinct from old.device_acquired_at
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.used_at is null
     or new.used_match_id is null then
    raise exception 'Territory grant identity and expiry are immutable'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger territory_zone_grants_lifecycle_guard
before update or delete on private.territory_zone_grants
for each row execute function private.protect_territory_zone_grant();

create table private.territory_ranked_match_snapshots (
  match_id uuid not null,
  player_id uuid not null,
  ranked_season_id uuid not null,
  ranked_policy_version text not null,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  zone_id uuid,
  source_grant_id uuid,
  zone_lifecycle_version integer,
  snapshotted_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (match_id, player_id),
  constraint territory_ranked_match_snapshots_receipt_fk
    foreign key (match_id, ranked_season_id, ranked_policy_version)
    references private.ranked_matchmaking_receipts (match_id, season_id, policy_version)
    on delete restrict
    deferrable initially deferred,
  constraint territory_ranked_match_snapshots_participant_fk
    foreign key (match_id, player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint territory_ranked_match_snapshots_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_ranked_match_snapshots_zone_shape_check
    check (
      (zone_id is null and source_grant_id is null and zone_lifecycle_version is null)
      or (zone_id is not null and source_grant_id is not null and zone_lifecycle_version is not null)
    ),
  constraint territory_ranked_match_snapshots_lifecycle_check
    check (zone_lifecycle_version is null or zone_lifecycle_version >= 0),
  constraint territory_ranked_match_snapshots_timestamps_check
    check (isfinite(snapshotted_at) and isfinite(created_at))
);

create index territory_ranked_match_snapshots_zone_idx
  on private.territory_ranked_match_snapshots (
    zone_id,
    ranked_season_id,
    snapshotted_at
  )
  where zone_id is not null;

revoke all on table private.territory_ranked_match_snapshots from public;

create function private.validate_territory_ranked_match_snapshot()
returns trigger
language plpgsql
as $$
declare
  grant_record private.territory_zone_grants%rowtype;
begin
  if new.source_grant_id is null then
    return new;
  end if;

  select *
    into grant_record
    from private.territory_zone_grants zone_grant
   where zone_grant.id = new.source_grant_id;

  if not found
     or grant_record.used_match_id is distinct from new.match_id
     or grant_record.player_id is distinct from new.player_id
     or grant_record.ranked_season_id is distinct from new.ranked_season_id
     or grant_record.territory_policy_version is distinct from new.territory_policy_version
     or grant_record.zone_id is distinct from new.zone_id
     or grant_record.zone_lifecycle_version is distinct from new.zone_lifecycle_version
     or grant_record.used_at is null
     or grant_record.used_at > new.snapshotted_at then
    raise exception 'Territory ranked match snapshot conflicts with its consumed grant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_ranked_match_snapshots_validation
before insert on private.territory_ranked_match_snapshots
for each row execute function private.validate_territory_ranked_match_snapshot();

create trigger territory_ranked_match_snapshots_immutability
before update or delete on private.territory_ranked_match_snapshots
for each row execute function private.prevent_territory_history_mutation();

alter table private.territory_settlement_receipts
  add column settlement_kind text not null default 'hourly',
  add constraint territory_settlement_receipts_kind_check
    check (settlement_kind in ('hourly', 'season_final'));

create unique index territory_settlement_receipts_one_season_final_uidx
  on private.territory_settlement_receipts (zone_id, ranked_season_id)
  where settlement_kind = 'season_final';

create table private.territory_season_close_receipts (
  ranked_season_id uuid primary key
    references public.ranked_seasons (id) on delete restrict,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  finalized_zone_count integer not null,
  accepted_contribution_count integer not null,
  closed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_season_close_receipts_counts_check
    check (finalized_zone_count >= 0 and accepted_contribution_count >= 0),
  constraint territory_season_close_receipts_timestamps_check
    check (isfinite(closed_at) and isfinite(created_at))
);

create function private.validate_territory_season_close_receipt()
returns trigger
language plpgsql
as $$
declare
  season_status text;
  active_zone_count integer;
  authoritative_contribution_count integer;
  incomplete_zone_count integer;
begin
  select status
    into season_status
    from public.ranked_seasons
   where id = new.ranked_season_id
   for update;

  if season_status is distinct from 'closing' then
    raise exception 'Territory season close requires a closing ranked season'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from private.ranked_matchmaking_receipts receipt
     where receipt.season_id = new.ranked_season_id
       and not exists (
         select 1
           from private.ranked_rating_settlements settlement
          where settlement.match_id = receipt.match_id
       )
  ) then
    raise exception 'Territory season close requires every ranked match to settle first'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into active_zone_count
    from public.territory_zones zone
   where zone.policy_version = new.territory_policy_version
     and zone.status = 'active';

  if new.finalized_zone_count is distinct from active_zone_count then
    raise exception 'Territory season close zone count is stale'
      using errcode = '40001';
  end if;

  select count(*)::integer
    into authoritative_contribution_count
    from private.territory_influence_contributions contribution
   where contribution.ranked_season_id = new.ranked_season_id
     and contribution.territory_policy_version = new.territory_policy_version;

  if new.accepted_contribution_count is distinct from authoritative_contribution_count then
    raise exception 'Territory season close contribution count is stale'
      using errcode = '40001';
  end if;

  select count(*)::integer
    into incomplete_zone_count
    from public.territory_zones zone
   where zone.policy_version = new.territory_policy_version
     and zone.status = 'active'
     and not exists (
       select 1
         from private.territory_settlement_receipts receipt
        where receipt.zone_id = zone.id
          and receipt.ranked_season_id = new.ranked_season_id
          and receipt.territory_policy_version = new.territory_policy_version
          and receipt.window_end = new.closed_at
     );

  if incomplete_zone_count <> 0 then
    raise exception 'Territory season close requires every active zone to settle through close time'
      using errcode = '23514';
  end if;

  if not isfinite(new.closed_at) or new.closed_at > clock_timestamp() then
    raise exception 'Territory season close time must be authoritative and not future'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_season_close_receipts_validation
before insert on private.territory_season_close_receipts
for each row execute function private.validate_territory_season_close_receipt();

revoke all on table private.territory_season_close_receipts from public;

create trigger territory_season_close_receipts_immutability
before update or delete on private.territory_season_close_receipts
for each row execute function private.prevent_territory_history_mutation();

create or replace function private.validate_territory_settlement_receipt()
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

  if new.settlement_kind = 'hourly' then
    if new.window_end is distinct from new.window_start + policy_record.settlement_cadence then
      raise exception 'Territory hourly settlement duration conflicts with policy'
        using errcode = '23514';
    end if;
  else
    if season_status <> 'closing'
       or new.window_end >= new.window_start + policy_record.settlement_cadence then
      raise exception 'Territory season-final settlement must be a closing partial window'
        using errcode = '23514';
    end if;
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

create or replace function private.prepare_territory_influence_contribution()
returns trigger
language plpgsql
as $$
declare
  decision_record private.territory_contribution_decisions%rowtype;
  zone_status text;
  player_status text;
  season_status text;
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

  select status
    into season_status
    from public.ranked_seasons
   where id = new.ranked_season_id;

  if season_status not in ('active', 'closing')
     or exists (
       select 1
         from private.territory_season_close_receipts receipt
        where receipt.ranked_season_id = new.ranked_season_id
     ) then
    raise exception 'Territory influence cannot be added to a sealed season'
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

  if new.contributed_at is null then
    new.contributed_at := clock_timestamp();
  end if;
  if not isfinite(new.contributed_at) or new.contributed_at > clock_timestamp() then
    raise exception 'Territory contribution timestamp must be authoritative and not future'
      using errcode = '23514';
  end if;
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

create table private.territory_owner_bonus_snapshots (
  attempt_id uuid primary key
    references public.challenge_attempts (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  zone_id uuid,
  eligibility_outcome text not null,
  bonus_date date not null,
  started_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_owner_bonus_snapshots_zone_policy_fk
    foreign key (zone_id, territory_policy_version)
    references public.territory_zones (id, policy_version)
    on delete restrict,
  constraint territory_owner_bonus_snapshots_outcome_check
    check (eligibility_outcome in ('eligible', 'not_eligible', 'already_claimed')),
  constraint territory_owner_bonus_snapshots_shape_check
    check (
      (eligibility_outcome = 'eligible' and zone_id is not null)
      or eligibility_outcome <> 'eligible'
    ),
  constraint territory_owner_bonus_snapshots_timestamps_check
    check (isfinite(started_at) and isfinite(created_at))
);

revoke all on table private.territory_owner_bonus_snapshots from public;

create function private.validate_territory_owner_bonus_snapshot()
returns trigger
language plpgsql
as $$
declare
  attempt_record record;
  daily_timezone text;
  matching_zone_count integer;
  matching_zone_id uuid;
  current_owner_player_id uuid;
  already_claimed boolean;
  expected_outcome text;
  player_status text;
begin
  select attempt.player_id, attempt.event_id, attempt.started_at, attempt.status
    into attempt_record
    from public.challenge_attempts attempt
   where attempt.id = new.attempt_id;

  if not found
     or attempt_record.player_id is distinct from new.player_id
     or attempt_record.started_at is distinct from new.started_at
     or attempt_record.status <> 'in_progress' then
    raise exception 'Territory owner bonus snapshot conflicts with its challenge attempt'
      using errcode = '23514';
  end if;

  select lifecycle_status
    into player_status
    from public.players player
   where player.id = new.player_id
   for share;

  if player_status is distinct from 'active' then
    raise exception 'Territory owner bonus snapshot requires an active player'
      using errcode = '23514';
  end if;

  perform 1
    from public.territory_zones zone
   where zone.policy_version = new.territory_policy_version
     and zone.status = 'active'
   order by zone.id
   for share;

  select policy.daily_cap_timezone
    into daily_timezone
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  if daily_timezone is null
     or new.bonus_date is distinct from timezone(daily_timezone, new.started_at)::date then
    raise exception 'Territory owner bonus date conflicts with policy'
      using errcode = '23514';
  end if;

  with placement as (
    select effective_location
      from public.resolve_event_placement_location(
        attempt_record.event_id,
        new.started_at
      )
     where is_available = true
  ), matching as (
    select zone.id
      from public.territory_zones zone
      cross join placement
     where zone.policy_version = new.territory_policy_version
       and zone.status = 'active'
       and st_contains(zone.area, placement.effective_location::geometry)
     order by zone.id
  )
  select count(*)::integer, (array_agg(id order by id))[1]
    into matching_zone_count, matching_zone_id
    from matching;

  if matching_zone_count = 1 then
    select version.owner_player_id
      into current_owner_player_id
      from private.territory_current_ownership current_state
      join private.territory_ownership_versions version
        on version.id = current_state.ownership_version_id
     where current_state.zone_id = matching_zone_id;
  end if;

  select exists (
    select 1
      from private.territory_owner_bonus_decisions decision
     where decision.player_id = new.player_id
       and decision.bonus_date = new.bonus_date
       and decision.outcome = 'awarded'
  ) into already_claimed;

  expected_outcome := case
    when already_claimed then 'already_claimed'
    when matching_zone_count = 1
         and current_owner_player_id is not distinct from new.player_id
      then 'eligible'
    else 'not_eligible'
  end;

  if new.eligibility_outcome is distinct from expected_outcome
     or (
       expected_outcome = 'eligible'
       and new.zone_id is distinct from matching_zone_id
     )
     or (expected_outcome <> 'eligible' and new.zone_id is not null) then
    raise exception 'Territory owner bonus eligibility snapshot is not authoritative'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger territory_owner_bonus_snapshots_validation
before insert on private.territory_owner_bonus_snapshots
for each row execute function private.validate_territory_owner_bonus_snapshot();

create function private.protect_territory_owner_bonus_snapshot()
returns trigger
language plpgsql
as $$
declare
  attempt_status text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Territory owner bonus snapshots are immutable'
      using errcode = '55006';
  end if;

  select status
    into attempt_status
    from public.challenge_attempts
   where id = old.attempt_id;

  if attempt_status is distinct from 'in_progress' then
    raise exception 'Retained territory owner bonus snapshots are immutable'
      using errcode = '55006';
  end if;

  return old;
end;
$$;

create trigger territory_owner_bonus_snapshots_immutability
before update or delete on private.territory_owner_bonus_snapshots
for each row execute function private.protect_territory_owner_bonus_snapshot();

create table private.territory_owner_bonus_decisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique
    references private.territory_owner_bonus_snapshots (attempt_id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  territory_policy_version text not null
    references private.territory_policy_versions (policy_version) on delete restrict,
  bonus_date date not null,
  outcome text not null,
  card_definition_id uuid
    references public.card_definitions (id) on delete restrict,
  decided_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),

  constraint territory_owner_bonus_decisions_id_player_unique
    unique (id, player_id),
  constraint territory_owner_bonus_decisions_outcome_check
    check (outcome in ('awarded', 'not_eligible', 'score_too_low', 'already_claimed')),
  constraint territory_owner_bonus_decisions_shape_check
    check (
      (outcome = 'awarded' and card_definition_id is not null)
      or (outcome <> 'awarded' and card_definition_id is null)
    ),
  constraint territory_owner_bonus_decisions_timestamps_check
    check (isfinite(decided_at) and isfinite(created_at))
);

create unique index territory_owner_bonus_one_award_per_day_uidx
  on private.territory_owner_bonus_decisions (player_id, bonus_date)
  where outcome = 'awarded';

revoke all on table private.territory_owner_bonus_decisions from public;

create trigger territory_owner_bonus_decisions_immutability
before update or delete on private.territory_owner_bonus_decisions
for each row execute function private.prevent_territory_history_mutation();

create function private.validate_territory_owner_bonus_decision()
returns trigger
language plpgsql
as $$
declare
  snapshot_record private.territory_owner_bonus_snapshots%rowtype;
  definition_record record;
  completion_score smallint;
  completion_completed_at timestamptz;
  minimum_correct smallint;
begin
  select *
    into snapshot_record
    from private.territory_owner_bonus_snapshots snapshot
   where snapshot.attempt_id = new.attempt_id;

  if not found
     or snapshot_record.player_id is distinct from new.player_id
     or snapshot_record.territory_policy_version is distinct from new.territory_policy_version
     or snapshot_record.bonus_date is distinct from new.bonus_date then
    raise exception 'Territory owner bonus decision conflicts with its attempt snapshot'
      using errcode = '23514';
  end if;

  select completion.score_correct, completion.completed_at
    into completion_score, completion_completed_at
    from public.event_completions completion
   where completion.attempt_id = new.attempt_id
     and completion.player_id = new.player_id;

  if not found or new.decided_at < completion_completed_at then
    raise exception 'Territory owner bonus decision requires the authoritative challenge completion'
      using errcode = '23514';
  end if;

  select policy.owner_bonus_minimum_correct_answers
    into minimum_correct
    from private.territory_policy_versions policy
   where policy.policy_version = new.territory_policy_version;

  if minimum_correct is null then
    raise exception 'Territory owner bonus decision references an unknown policy'
      using errcode = '23503';
  end if;

  if snapshot_record.eligibility_outcome = 'not_eligible' then
    if new.outcome <> 'not_eligible' then
      raise exception 'Ineligible territory owner bonus snapshots can only remain ineligible'
        using errcode = '23514';
    end if;
  elsif snapshot_record.eligibility_outcome = 'already_claimed' then
    if new.outcome <> 'already_claimed' then
      raise exception 'Previously claimed territory owner bonuses can only remain already claimed'
        using errcode = '23514';
    end if;
  elsif completion_score < minimum_correct then
    if new.outcome <> 'score_too_low' then
      raise exception 'Low-scoring eligible territory owner bonuses must remain score too low'
        using errcode = '23514';
    end if;
  elsif new.outcome not in ('awarded', 'already_claimed') then
    raise exception 'Eligible territory owner bonuses require an authoritative daily award outcome'
      using errcode = '23514';
  end if;

  if new.outcome = 'awarded' then
    select is_active, authoring_status, reward_eligible, rarity,
           evolves_from_definition_id
      into definition_record
      from public.card_definitions
     where id = new.card_definition_id;

    if not found
       or not definition_record.is_active
       or definition_record.authoring_status <> 'published'
       or not definition_record.reward_eligible
       or definition_record.rarity <> 'common'
       or definition_record.evolves_from_definition_id is not null then
      raise exception 'Territory owner bonus card is outside the policy reward pool'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger territory_owner_bonus_decisions_validation
before insert on private.territory_owner_bonus_decisions
for each row execute function private.validate_territory_owner_bonus_decision();

alter table public.player_cards
  add column source_territory_bonus_id uuid;

alter table public.player_cards
  add constraint player_cards_source_territory_bonus_fk
    foreign key (source_territory_bonus_id, player_id)
    references private.territory_owner_bonus_decisions (id, player_id)
    on delete restrict;

alter table public.player_cards
  drop constraint player_cards_source_check;

alter table public.player_cards
  add constraint player_cards_source_check
    check (
      (acquisition_kind = 'event_reward'
        and source_completion_id is not null
        and source_starter_grant_id is null
        and source_evolution_id is null)
      or
      (acquisition_kind = 'starter'
        and source_completion_id is null
        and source_starter_grant_id is not null
        and source_evolution_id is null
        and source_territory_bonus_id is null)
      or
      (acquisition_kind = 'evolution'
        and source_completion_id is null
        and source_starter_grant_id is null
        and source_evolution_id is not null
        and source_territory_bonus_id is null)
    );

create unique index player_cards_territory_owner_bonus_unique_idx
  on public.player_cards (source_territory_bonus_id)
  where source_territory_bonus_id is not null;

create function public.validate_player_card_territory_bonus_source()
returns trigger
language plpgsql
as $$
declare
  source_record record;
begin
  if new.source_territory_bonus_id is null then
    return new;
  end if;

  select decision.outcome,
         decision.card_definition_id,
         decision.attempt_id,
         completion.attempt_id as completion_attempt_id
    into source_record
    from private.territory_owner_bonus_decisions decision
    join public.event_completions completion
      on completion.id = new.source_completion_id
     and completion.player_id = new.player_id
   where decision.id = new.source_territory_bonus_id
     and decision.player_id = new.player_id;

  if not found
     or source_record.outcome <> 'awarded'
     or source_record.card_definition_id is distinct from new.card_definition_id
     or source_record.attempt_id is distinct from source_record.completion_attempt_id
     or new.acquisition_kind <> 'event_reward' then
    raise exception 'Territory owner bonus card conflicts with its authoritative decision'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger player_cards_territory_owner_bonus_validation
before insert or update on public.player_cards
for each row execute function public.validate_player_card_territory_bonus_source();

revoke all on function public.validate_player_card_territory_bonus_source() from public;

alter function private.delete_player_owned_data(uuid, uuid)
  rename to delete_player_owned_data_before_territory_runtime;

create function private.delete_player_owned_data(
  player_id_to_delete uuid,
  deletion_request_id_to_complete uuid
)
returns void
language plpgsql
as $$
begin
  delete from private.territory_zone_grants
   where player_id = player_id_to_delete
     and used_at is null;

  delete from private.territory_owner_bonus_snapshots snapshot
  using public.challenge_attempts attempt
   where snapshot.attempt_id = attempt.id
     and attempt.player_id = player_id_to_delete
     and attempt.status = 'in_progress';

  perform private.delete_player_owned_data_before_territory_runtime(
    player_id_to_delete,
    deletion_request_id_to_complete
  );
end;
$$;

revoke all on function private.delete_player_owned_data_before_territory_runtime(uuid, uuid)
  from public;
revoke all on function private.delete_player_owned_data(uuid, uuid)
  from public;

comment on table private.territory_zone_grants is
  'Short-lived private territory-v1 eligibility grants. Precise location claims are never persisted.';
comment on table private.territory_ranked_match_snapshots is
  'Immutable ranked participant territory snapshots consumed from one-time grants at match creation.';
comment on table private.territory_season_close_receipts is
  'Exactly-once territory finalization receipts that seal ranked seasons before ranked closure.';
comment on table private.territory_owner_bonus_snapshots is
  'Private challenge-start snapshots for territory owner bonus eligibility and Johannesburg bonus date.';
comment on table private.territory_owner_bonus_decisions is
  'Exactly-once owner bonus completion outcomes; at most one awarded card per player and local date.';
