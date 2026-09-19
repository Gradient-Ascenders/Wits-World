create table private.ranked_policy_versions (
  policy_version text primary key,
  initial_rating integer not null,
  minimum_rating integer not null,
  provisional_match_count smallint not null,
  provisional_k_factor smallint not null,
  established_k_factor smallint not null,
  rating_scale integer not null,
  initial_search_range integer not null,
  search_range_increment integer not null,
  search_widen_interval interval not null,
  maximum_search_range integer not null,
  queue_lease_duration interval not null,
  proposal_duration interval not null,
  proposal_cooldown interval not null,
  season_duration interval not null,
  soft_reset_factor numeric(4, 3) not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint ranked_policy_versions_name_check
    check (
      policy_version = lower(policy_version)
      and policy_version ~ '^[a-z][a-z0-9-]{0,63}$'
    ),
  constraint ranked_policy_versions_rating_check
    check (
      initial_rating = 1000
      and minimum_rating = 100
      and provisional_match_count = 5
      and provisional_k_factor = 40
      and established_k_factor = 24
      and rating_scale = 400
    ),
  constraint ranked_policy_versions_search_check
    check (
      initial_search_range = 100
      and search_range_increment = 50
      and search_widen_interval = interval '15 seconds'
      and maximum_search_range = 400
    ),
  constraint ranked_policy_versions_timing_check
    check (
      queue_lease_duration = interval '30 seconds'
      and proposal_duration = interval '20 seconds'
      and proposal_cooldown = interval '30 seconds'
      and season_duration = interval '28 days'
    ),
  constraint ranked_policy_versions_reset_check
    check (soft_reset_factor = 0.5)
);

revoke all on table private.ranked_policy_versions from public;

insert into private.ranked_policy_versions (
  policy_version,
  initial_rating,
  minimum_rating,
  provisional_match_count,
  provisional_k_factor,
  established_k_factor,
  rating_scale,
  initial_search_range,
  search_range_increment,
  search_widen_interval,
  maximum_search_range,
  queue_lease_duration,
  proposal_duration,
  proposal_cooldown,
  season_duration,
  soft_reset_factor
) values (
  'ranked-v1',
  1000,
  100,
  5,
  40,
  24,
  400,
  100,
  50,
  interval '15 seconds',
  400,
  interval '30 seconds',
  interval '20 seconds',
  interval '30 seconds',
  interval '28 days',
  0.5
);

create function private.prevent_ranked_policy_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ranked policy versions are immutable'
    using errcode = '55006';
end;
$$;

create trigger ranked_policy_versions_immutability
before update or delete on private.ranked_policy_versions
for each row execute function private.prevent_ranked_policy_version_mutation();

create table public.ranked_seasons (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null
    references private.ranked_policy_versions (policy_version) on delete restrict,
  name text not null,
  status text not null default 'scheduled',
  version integer not null default 0,
  intended_start_at timestamptz not null,
  activated_at timestamptz,
  active_ends_at timestamptz,
  closing_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ranked_seasons_name_check
    check (name = btrim(name) and char_length(name) between 1 and 120),
  constraint ranked_seasons_status_check
    check (status in ('scheduled', 'active', 'closing', 'closed')),
  constraint ranked_seasons_version_check
    check (version >= 0),
  constraint ranked_seasons_lifecycle_check
    check (
      (
        status = 'scheduled'
        and activated_at is null
        and active_ends_at is null
        and closing_at is null
        and closed_at is null
      )
      or (
        status = 'active'
        and activated_at is not null
        and active_ends_at is not null
        and closing_at is null
        and closed_at is null
      )
      or (
        status = 'closing'
        and activated_at is not null
        and active_ends_at is not null
        and closing_at is not null
        and closed_at is null
      )
      or (
        status = 'closed'
        and activated_at is not null
        and active_ends_at is not null
        and closing_at is not null
        and closed_at is not null
      )
    ),
  constraint ranked_seasons_timestamps_check
    check (
      isfinite(intended_start_at)
      and isfinite(created_at)
      and isfinite(updated_at)
      and updated_at >= created_at
      and (activated_at is null or isfinite(activated_at))
      and (active_ends_at is null or active_ends_at > activated_at)
      and (closing_at is null or closing_at >= active_ends_at)
      and (closed_at is null or closed_at >= closing_at)
    ),
  constraint ranked_seasons_identity_policy_unique
    unique (id, policy_version)
);

create unique index ranked_seasons_one_current_idx
  on public.ranked_seasons ((true))
  where status in ('active', 'closing');

create index ranked_seasons_schedule_idx
  on public.ranked_seasons (intended_start_at, id)
  where status = 'scheduled';

create index ranked_seasons_history_idx
  on public.ranked_seasons (closed_at desc, id desc)
  where status = 'closed';

create function public.protect_ranked_season_lifecycle()
returns trigger
language plpgsql
as $$
declare
  configured_duration interval;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ranked seasons are retained for competitive history'
      using errcode = '55006';
  end if;

  select season_duration
    into configured_duration
    from private.ranked_policy_versions
   where policy_version = new.policy_version;

  if tg_op = 'INSERT' then
    if new.status <> 'scheduled'
       or new.version <> 0 then
      raise exception 'New ranked seasons must begin scheduled at version zero'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'Closed ranked seasons are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.policy_version is distinct from old.policy_version
     or new.created_at is distinct from old.created_at then
    raise exception 'Ranked season identity is immutable'
      using errcode = '55006';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Ranked season updates must advance one version'
      using errcode = '40001';
  end if;

  if not (
    (old.status = 'scheduled' and new.status in ('scheduled', 'active'))
    or (old.status = 'active' and new.status = 'closing')
    or (old.status = 'closing' and new.status = 'closed')
  ) then
    raise exception 'Invalid ranked season lifecycle transition'
      using errcode = '55006';
  end if;

  if old.status <> 'scheduled' and (
    new.name is distinct from old.name
    or new.intended_start_at is distinct from old.intended_start_at
    or new.activated_at is distinct from old.activated_at
    or new.active_ends_at is distinct from old.active_ends_at
  ) then
    raise exception 'Activated ranked season definition is immutable'
      using errcode = '55006';
  end if;

  if old.status = 'closing'
     and (new.closing_at is distinct from old.closing_at) then
    raise exception 'Ranked season closure cannot change its closing timestamp'
      using errcode = '55006';
  end if;

  if new.activated_at is not null
     and new.active_ends_at is distinct from new.activated_at + configured_duration then
    raise exception 'Ranked season end must use its policy duration'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ranked_seasons_lifecycle_guard
before insert or update or delete on public.ranked_seasons
for each row execute function public.protect_ranked_season_lifecycle();

create table public.ranked_player_season_ratings (
  season_id uuid not null
    references public.ranked_seasons (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  starting_rating integer not null,
  rating integer not null,
  settled_match_count integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  rating_first_reached_at timestamptz not null default now(),
  carried_from_season_id uuid,
  last_settled_match_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (season_id, player_id),
  constraint ranked_player_season_ratings_values_check
    check (
      starting_rating >= 100
      and rating >= 100
      and settled_match_count >= 0
      and wins >= 0
      and losses >= 0
      and wins + losses = settled_match_count
    ),
  constraint ranked_player_season_ratings_ledger_shape_check
    check (
      (settled_match_count = 0 and last_settled_match_id is null)
      or (settled_match_count > 0 and last_settled_match_id is not null)
    ),
  constraint ranked_player_season_ratings_source_check
    check (carried_from_season_id is null or carried_from_season_id <> season_id),
  constraint ranked_player_season_ratings_timestamps_check
    check (
      isfinite(rating_first_reached_at)
      and isfinite(created_at)
      and isfinite(updated_at)
      and rating_first_reached_at >= created_at
      and updated_at >= created_at
    ),
  constraint ranked_player_season_ratings_source_fk
    foreign key (carried_from_season_id, player_id)
    references public.ranked_player_season_ratings (season_id, player_id)
    on delete restrict
    deferrable initially deferred
);

create index ranked_player_season_standings_idx
  on public.ranked_player_season_ratings (
    season_id,
    rating desc,
    rating_first_reached_at,
    player_id
  )
  where settled_match_count >= 5;

create index ranked_player_rating_history_idx
  on public.ranked_player_season_ratings (player_id, season_id);

create function public.protect_ranked_player_rating_state()
returns trigger
language plpgsql
as $$
declare
  season_record record;
  policy_record private.ranked_policy_versions%rowtype;
  source_rating integer;
  expected_starting_rating integer;
  player_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ranked seasonal ratings are retained for history'
      using errcode = '55006';
  end if;

  select season.status, season.policy_version
    into season_record
    from public.ranked_seasons season
   where season.id = new.season_id;

  select *
    into policy_record
    from private.ranked_policy_versions policy
   where policy.policy_version = season_record.policy_version;

  if tg_op = 'INSERT' then
    select lifecycle_status
      into player_status
      from public.players
     where id = new.player_id;

    if player_status is distinct from 'active' then
      raise exception 'Ranked ratings require an active player'
        using errcode = '23514';
    end if;

    if season_record.status not in ('scheduled', 'active') then
      raise exception 'New ranked ratings require a scheduled or active season'
        using errcode = '23514';
    end if;

    if new.carried_from_season_id is null then
      expected_starting_rating := policy_record.initial_rating;
    else
      select rating
        into source_rating
        from public.ranked_player_season_ratings
       where season_id = new.carried_from_season_id
         and player_id = new.player_id;

      if source_rating is null then
        raise exception 'Ranked soft reset requires a prior seasonal rating'
          using errcode = '23514';
      end if;

      if not exists (
        select 1
          from public.ranked_seasons
         where id = new.carried_from_season_id
           and status = 'closed'
      ) then
        raise exception 'Ranked soft reset requires a closed previous season'
          using errcode = '23514';
      end if;

      expected_starting_rating := greatest(
        policy_record.minimum_rating,
        policy_record.initial_rating
          + round(
              (source_rating - policy_record.initial_rating)::numeric
              * policy_record.soft_reset_factor
            )::integer
      );
    end if;

    if new.starting_rating <> expected_starting_rating
       or new.rating <> expected_starting_rating
       or new.settled_match_count <> 0
       or new.wins <> 0
       or new.losses <> 0
       or new.last_settled_match_id is not null then
      raise exception 'New ranked rating does not match its authoritative season seed'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if season_record.status = 'closed' then
    raise exception 'Closed-season ratings are immutable'
      using errcode = '55006';
  end if;

  if new.season_id is distinct from old.season_id
     or new.player_id is distinct from old.player_id
     or new.starting_rating is distinct from old.starting_rating
     or new.carried_from_season_id is distinct from old.carried_from_season_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Ranked seasonal rating identity and seed are immutable'
      using errcode = '55006';
  end if;

  if new.settled_match_count <> old.settled_match_count + 1
     or new.wins < old.wins
     or new.losses < old.losses
     or (new.wins - old.wins) + (new.losses - old.losses) <> 1
     or new.last_settled_match_id is null
     or new.last_settled_match_id is not distinct from old.last_settled_match_id then
    raise exception 'Ranked ratings may advance only through one settlement'
      using errcode = '23514';
  end if;

  if new.rating is distinct from old.rating then
    if new.rating_first_reached_at is distinct from new.updated_at then
      raise exception 'Changed ranked ratings must record when the value was first reached'
        using errcode = '23514';
    end if;
  elsif new.rating_first_reached_at is distinct from old.rating_first_reached_at then
    raise exception 'Unchanged ranked ratings retain their first-reached timestamp'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ranked_player_season_ratings_state_guard
before insert or update or delete on public.ranked_player_season_ratings
for each row execute function public.protect_ranked_player_rating_state();

create table private.ranked_matchmaking_proposals (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null
    references public.ranked_seasons (id) on delete restrict,
  status text not null default 'awaiting_acceptance',
  version integer not null default 0,
  created_at timestamptz not null default now(),
  acceptance_deadline timestamptz not null default (now() + interval '20 seconds'),
  resolved_at timestamptz,

  constraint ranked_matchmaking_proposals_status_check
    check (status in ('awaiting_acceptance', 'matched', 'cancelled', 'expired')),
  constraint ranked_matchmaking_proposals_version_check check (version >= 0),
  constraint ranked_matchmaking_proposals_deadline_check
    check (acceptance_deadline = created_at + interval '20 seconds'),
  constraint ranked_matchmaking_proposals_lifecycle_check
    check (
      (status = 'awaiting_acceptance' and resolved_at is null)
      or (
        status in ('matched', 'cancelled', 'expired')
        and resolved_at is not null
        and resolved_at >= created_at
      )
    ),
  constraint ranked_matchmaking_proposals_identity_season_unique
    unique (id, season_id)
);

create index ranked_matchmaking_proposals_deadline_idx
  on private.ranked_matchmaking_proposals (acceptance_deadline, id)
  where status = 'awaiting_acceptance';

revoke all on table private.ranked_matchmaking_proposals from public;

create function private.protect_ranked_proposal_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'awaiting_acceptance'
       or new.version <> 0 then
      raise exception 'New ranked proposals must await acceptance at version zero'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Ranked matchmaking proposals are retained as receipts'
      using errcode = '55006';
  end if;

  if old.status <> 'awaiting_acceptance' then
    raise exception 'Resolved ranked proposals are immutable'
      using errcode = '55006';
  end if;

  if new.id is distinct from old.id
     or new.season_id is distinct from old.season_id
     or new.created_at is distinct from old.created_at
     or new.acceptance_deadline is distinct from old.acceptance_deadline
     or new.version <> old.version + 1
     or new.status not in ('matched', 'cancelled', 'expired') then
    raise exception 'Invalid ranked proposal lifecycle transition'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger ranked_matchmaking_proposals_lifecycle_guard
before insert or update or delete on private.ranked_matchmaking_proposals
for each row execute function private.protect_ranked_proposal_lifecycle();

create table private.ranked_queue_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  player_id uuid not null,
  selected_deck_id uuid,
  status text not null default 'searching',
  version integer not null default 0,
  original_joined_at timestamptz not null default now(),
  lease_expires_at timestamptz default (now() + interval '30 seconds'),
  active_proposal_id uuid,
  terminal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ranked_queue_entries_rating_fk
    foreign key (season_id, player_id)
    references public.ranked_player_season_ratings (season_id, player_id)
    on delete restrict,
  constraint ranked_queue_entries_deck_fk
    foreign key (selected_deck_id, player_id)
    references public.player_decks (id, player_id)
    on delete set null (selected_deck_id),
  constraint ranked_queue_entries_proposal_fk
    foreign key (active_proposal_id, season_id)
    references private.ranked_matchmaking_proposals (id, season_id)
    on delete restrict
    deferrable initially deferred,
  constraint ranked_queue_entries_status_check
    check (
      status in (
        'searching',
        'proposed',
        'matched',
        'cancelled',
        'expired',
        'restricted',
        'invalid_deck'
      )
    ),
  constraint ranked_queue_entries_version_check check (version >= 0),
  constraint ranked_queue_entries_active_deck_check
    check (selected_deck_id is not null or status not in ('searching', 'proposed')),
  constraint ranked_queue_entries_lifecycle_check
    check (
      (
        status = 'searching'
        and lease_expires_at is not null
        and lease_expires_at > updated_at
        and active_proposal_id is null
        and terminal_at is null
      )
      or (
        status = 'proposed'
        and lease_expires_at is null
        and active_proposal_id is not null
        and terminal_at is null
      )
      or (
        status in ('matched', 'cancelled', 'expired', 'restricted', 'invalid_deck')
        and lease_expires_at is null
        and active_proposal_id is null
        and terminal_at is not null
      )
    ),
  constraint ranked_queue_entries_timestamps_check
    check (
      isfinite(original_joined_at)
      and isfinite(created_at)
      and isfinite(updated_at)
      and original_joined_at = created_at
      and updated_at >= created_at
      and (lease_expires_at is null or isfinite(lease_expires_at))
      and (terminal_at is null or terminal_at >= created_at)
    ),
  constraint ranked_queue_entries_identity_season_player_unique
    unique (id, season_id, player_id)
);

create unique index ranked_queue_entries_one_active_player_idx
  on private.ranked_queue_entries (player_id)
  where status in ('searching', 'proposed');

create index ranked_queue_entries_claim_idx
  on private.ranked_queue_entries (season_id, original_joined_at, id)
  where status = 'searching';

create index ranked_queue_entries_lease_idx
  on private.ranked_queue_entries (lease_expires_at, id)
  where status = 'searching';

create index ranked_queue_entries_player_history_idx
  on private.ranked_queue_entries (player_id, created_at desc, id desc);

revoke all on table private.ranked_queue_entries from public;

create function private.protect_ranked_queue_lifecycle()
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
     and to_jsonb(new) - 'selected_deck_id' = to_jsonb(old) - 'selected_deck_id'
     and exists (
       select 1 from public.players
        where id = old.player_id and lifecycle_status = 'deletion_pending'
     ) then
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

create trigger ranked_queue_entries_lifecycle_guard
before insert or update or delete on private.ranked_queue_entries
for each row execute function private.protect_ranked_queue_lifecycle();

create table private.ranked_matchmaking_proposal_participants (
  proposal_id uuid not null,
  season_id uuid not null,
  player_id uuid not null,
  queue_entry_id uuid not null,
  acceptance_status text not null default 'pending',
  responded_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),

  primary key (proposal_id, player_id),
  constraint ranked_proposal_participants_proposal_fk
    foreign key (proposal_id, season_id)
    references private.ranked_matchmaking_proposals (id, season_id)
    on delete restrict,
  constraint ranked_proposal_participants_queue_fk
    foreign key (queue_entry_id, season_id, player_id)
    references private.ranked_queue_entries (id, season_id, player_id)
    on delete restrict,
  constraint ranked_proposal_participants_acceptance_check
    check (
      acceptance_status in (
        'pending',
        'accepted',
        'declined',
        'timed_out',
        'invalid',
        'system_cancelled'
      )
    ),
  constraint ranked_proposal_participants_response_check
    check (
      (
        acceptance_status = 'pending'
        and responded_at is null
        and cooldown_until is null
      )
      or (
        acceptance_status in ('accepted', 'invalid', 'system_cancelled')
        and responded_at is not null
        and cooldown_until is null
      )
      or (
        acceptance_status in ('declined', 'timed_out')
        and responded_at is not null
        and cooldown_until = responded_at + interval '30 seconds'
      )
    ),
  constraint ranked_proposal_participants_timestamps_check
    check (
      isfinite(created_at)
      and (responded_at is null or responded_at >= created_at)
      and (cooldown_until is null or cooldown_until > responded_at)
    ),
  constraint ranked_proposal_participants_queue_unique
    unique (proposal_id, queue_entry_id)
);

create index ranked_proposal_participants_player_idx
  on private.ranked_matchmaking_proposal_participants (
    player_id,
    created_at desc,
    proposal_id
  );

create index ranked_proposal_participants_cooldown_idx
  on private.ranked_matchmaking_proposal_participants (player_id, cooldown_until desc)
  where cooldown_until is not null;

revoke all on table private.ranked_matchmaking_proposal_participants from public;

create function private.protect_ranked_proposal_participant()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ranked proposal participation is immutable history'
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' then
    if old.acceptance_status <> 'pending'
       or new.proposal_id is distinct from old.proposal_id
       or new.season_id is distinct from old.season_id
       or new.player_id is distinct from old.player_id
       or new.queue_entry_id is distinct from old.queue_entry_id
       or new.created_at is distinct from old.created_at
       or new.acceptance_status = 'pending' then
      raise exception 'Ranked proposal responses are append-only decisions'
        using errcode = '55006';
    end if;
  end if;

  return new;
end;
$$;

create trigger ranked_proposal_participants_history_guard
before update or delete on private.ranked_matchmaking_proposal_participants
for each row execute function private.protect_ranked_proposal_participant();

create table private.ranked_matchmaking_receipts (
  proposal_id uuid primary key,
  match_id uuid not null unique
    references public.live_pvp_matches (id) on delete restrict,
  season_id uuid not null,
  policy_version text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint ranked_matchmaking_receipts_proposal_fk
    foreign key (proposal_id, season_id)
    references private.ranked_matchmaking_proposals (id, season_id)
    on delete restrict,
  constraint ranked_matchmaking_receipts_season_policy_fk
    foreign key (season_id, policy_version)
    references public.ranked_seasons (id, policy_version)
    on delete restrict,
  constraint ranked_matchmaking_receipts_identity_unique
    unique (match_id, season_id, policy_version)
);

revoke all on table private.ranked_matchmaking_receipts from public;

create table private.ranked_match_rating_inputs (
  match_id uuid not null,
  season_id uuid not null,
  policy_version text not null,
  player_id uuid not null,
  pre_match_rating integer not null,
  prior_settled_match_count integer not null,
  k_factor smallint not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (match_id, player_id),
  constraint ranked_match_rating_inputs_receipt_fk
    foreign key (match_id, season_id, policy_version)
    references private.ranked_matchmaking_receipts (
      match_id,
      season_id,
      policy_version
    )
    on delete restrict,
  constraint ranked_match_rating_inputs_participant_fk
    foreign key (match_id, player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint ranked_match_rating_inputs_rating_check
    check (pre_match_rating >= 100 and prior_settled_match_count >= 0),
  constraint ranked_match_rating_inputs_k_check
    check (
      (prior_settled_match_count < 5 and k_factor = 40)
      or (prior_settled_match_count >= 5 and k_factor = 24)
    ),
  constraint ranked_match_rating_inputs_snapshot_unique
    unique (
      match_id,
      player_id,
      pre_match_rating,
      prior_settled_match_count,
      k_factor
    )
);

revoke all on table private.ranked_match_rating_inputs from public;

create table private.ranked_rating_settlements (
  match_id uuid primary key,
  season_id uuid not null,
  policy_version text not null,
  winner_player_id uuid not null,
  loser_player_id uuid not null,
  completion_reason text not null,
  settled_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint ranked_rating_settlements_receipt_fk
    foreign key (match_id, season_id, policy_version)
    references private.ranked_matchmaking_receipts (
      match_id,
      season_id,
      policy_version
    )
    on delete restrict,
  constraint ranked_rating_settlements_winner_fk
    foreign key (match_id, winner_player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint ranked_rating_settlements_loser_fk
    foreign key (match_id, loser_player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint ranked_rating_settlements_distinct_players_check
    check (winner_player_id <> loser_player_id),
  constraint ranked_rating_settlements_reason_check
    check (
      completion_reason in (
        'defeat',
        'abandonment_forfeit',
        'voluntary_resignation',
        'account_deletion_forfeit'
      )
    ),
  constraint ranked_rating_settlements_timestamps_check
    check (isfinite(settled_at) and isfinite(created_at)),
  constraint ranked_rating_settlements_identity_unique
    unique (match_id, season_id, policy_version)
);

revoke all on table private.ranked_rating_settlements from public;

create table private.ranked_rating_ledger_entries (
  match_id uuid not null,
  season_id uuid not null,
  policy_version text not null,
  player_id uuid not null,
  outcome text not null,
  rating_before integer not null,
  expected_score numeric(18, 15) not null,
  k_factor smallint not null,
  calculated_delta integer not null,
  applied_delta integer not null,
  rating_after integer not null,
  match_count_before integer not null,
  match_count_after integer not null,
  wins_before integer not null,
  wins_after integer not null,
  losses_before integer not null,
  losses_after integer not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (match_id, player_id),
  constraint ranked_rating_ledger_settlement_fk
    foreign key (match_id, season_id, policy_version)
    references private.ranked_rating_settlements (
      match_id,
      season_id,
      policy_version
    )
    on delete restrict
    deferrable initially deferred,
  constraint ranked_rating_ledger_input_fk
    foreign key (
      match_id,
      player_id,
      rating_before,
      match_count_before,
      k_factor
    )
    references private.ranked_match_rating_inputs (
      match_id,
      player_id,
      pre_match_rating,
      prior_settled_match_count,
      k_factor
    )
    on delete restrict,
  constraint ranked_rating_ledger_outcome_check check (outcome in ('win', 'loss')),
  constraint ranked_rating_ledger_rating_check
    check (
      rating_before >= 100
      and rating_after >= 100
      and applied_delta = rating_after - rating_before
      and rating_after = greatest(100, rating_before + calculated_delta)
      and abs(calculated_delta) <= k_factor
      and (
        (outcome = 'win' and calculated_delta >= 0)
        or (outcome = 'loss' and calculated_delta <= 0)
      )
    ),
  constraint ranked_rating_ledger_expected_score_check
    check (expected_score > 0 and expected_score < 1),
  constraint ranked_rating_ledger_count_check
    check (
      match_count_before >= 0
      and match_count_after = match_count_before + 1
      and wins_before >= 0
      and losses_before >= 0
      and wins_before + losses_before = match_count_before
      and wins_after + losses_after = match_count_after
      and (
        (outcome = 'win'
          and wins_after = wins_before + 1
          and losses_after = losses_before)
        or
        (outcome = 'loss'
          and wins_after = wins_before
          and losses_after = losses_before + 1)
      )
    ),
  constraint ranked_rating_ledger_k_check
    check (
      (match_count_before < 5 and k_factor = 40)
      or (match_count_before >= 5 and k_factor = 24)
    ),
  constraint ranked_rating_ledger_current_state_unique
    unique (
      match_id,
      season_id,
      player_id,
      rating_after,
      match_count_after,
      wins_after,
      losses_after
    )
);

create index ranked_rating_ledger_player_history_idx
  on private.ranked_rating_ledger_entries (
    player_id,
    created_at desc,
    match_id
  );

revoke all on table private.ranked_rating_ledger_entries from public;

alter table public.ranked_player_season_ratings
  add constraint ranked_player_season_ratings_last_ledger_fk
  foreign key (
    last_settled_match_id,
    season_id,
    player_id,
    rating,
    settled_match_count,
    wins,
    losses
  )
  references private.ranked_rating_ledger_entries (
    match_id,
    season_id,
    player_id,
    rating_after,
    match_count_after,
    wins_after,
    losses_after
  )
  on delete restrict
  deferrable initially deferred;

create table public.ranked_season_standing_archives (
  season_id uuid not null
    references public.ranked_seasons (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  rank integer not null,
  rating integer not null,
  wins integer not null,
  losses integer not null,
  settled_match_count integer not null,
  archived_at timestamptz not null,

  primary key (season_id, player_id),
  constraint ranked_season_archives_rank_check check (rank > 0),
  constraint ranked_season_archives_rating_check check (rating >= 100),
  constraint ranked_season_archives_record_check
    check (
      settled_match_count >= 5
      and wins >= 0
      and losses >= 0
      and wins + losses = settled_match_count
    ),
  constraint ranked_season_archives_timestamp_check check (isfinite(archived_at))
);

create index ranked_season_archives_standings_idx
  on public.ranked_season_standing_archives (
    season_id,
    rank,
    rating desc,
    player_id
  );

create index ranked_season_archives_player_history_idx
  on public.ranked_season_standing_archives (player_id, season_id);

create table private.ranked_season_close_receipts (
  season_id uuid primary key
    references public.ranked_seasons (id) on delete restrict,
  settlement_count integer not null,
  archived_player_count integer not null,
  closed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint ranked_season_close_receipts_counts_check
    check (settlement_count >= 0 and archived_player_count >= 0),
  constraint ranked_season_close_receipts_timestamps_check
    check (isfinite(closed_at) and isfinite(created_at))
);

revoke all on table private.ranked_season_close_receipts from public;

create function private.prevent_ranked_immutable_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ranked competitive history is immutable'
    using errcode = '55006';
end;
$$;

create trigger ranked_matchmaking_receipts_immutability
before update or delete on private.ranked_matchmaking_receipts
for each row execute function private.prevent_ranked_immutable_history_mutation();

create trigger ranked_match_rating_inputs_immutability
before update or delete on private.ranked_match_rating_inputs
for each row execute function private.prevent_ranked_immutable_history_mutation();

create trigger ranked_rating_settlements_immutability
before update or delete on private.ranked_rating_settlements
for each row execute function private.prevent_ranked_immutable_history_mutation();

create trigger ranked_rating_ledger_immutability
before update or delete on private.ranked_rating_ledger_entries
for each row execute function private.prevent_ranked_immutable_history_mutation();

create trigger ranked_season_archives_immutability
before update or delete on public.ranked_season_standing_archives
for each row execute function private.prevent_ranked_immutable_history_mutation();

create trigger ranked_season_close_receipts_immutability
before update or delete on private.ranked_season_close_receipts
for each row execute function private.prevent_ranked_immutable_history_mutation();

create function private.require_active_ranked_match_for_receipt()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from public.live_pvp_matches match
     where match.id = new.match_id
       and match.status = 'active'
  ) then
    raise exception 'Only a new active live match can be classified as ranked'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ranked_matchmaking_receipts_active_match_guard
before insert on private.ranked_matchmaking_receipts
for each row execute function private.require_active_ranked_match_for_receipt();

create function private.require_ranked_terminal_settlement()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed'
     and exists (
       select 1
         from private.ranked_matchmaking_receipts receipt
        where receipt.match_id = new.id
     )
     and not exists (
       select 1
         from private.ranked_rating_settlements settlement
        where settlement.match_id = new.id
     ) then
    raise exception 'A ranked live match must settle ratings with its terminal result'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger ranked_live_terminal_requires_settlement
after update of status on public.live_pvp_matches
deferrable initially deferred
for each row execute function private.require_ranked_terminal_settlement();

create function private.validate_ranked_proposal(proposal_id_to_validate uuid)
returns void
language plpgsql
as $$
declare
  proposal_record private.ranked_matchmaking_proposals%rowtype;
  participant_count integer;
  invalid_participant_count integer;
begin
  select *
    into proposal_record
    from private.ranked_matchmaking_proposals
   where id = proposal_id_to_validate;

  if not found then
    return;
  end if;

  select count(*)::integer
    into participant_count
    from private.ranked_matchmaking_proposal_participants
   where proposal_id = proposal_record.id;

  if participant_count <> 2 then
    raise exception 'Ranked proposals require exactly two participants'
      using errcode = '23514';
  end if;

  if proposal_record.status = 'awaiting_acceptance' then
    select count(*)::integer
      into invalid_participant_count
      from private.ranked_matchmaking_proposal_participants participant
      join private.ranked_queue_entries queue
        on queue.id = participant.queue_entry_id
     where participant.proposal_id = proposal_record.id
       and (
         participant.acceptance_status not in ('pending', 'accepted')
         or queue.status <> 'proposed'
         or queue.active_proposal_id is distinct from proposal_record.id
       );
  elsif proposal_record.status = 'matched' then
    select count(*)::integer
      into invalid_participant_count
      from private.ranked_matchmaking_proposal_participants participant
      join private.ranked_queue_entries queue
        on queue.id = participant.queue_entry_id
     where participant.proposal_id = proposal_record.id
       and (
         participant.acceptance_status <> 'accepted'
         or queue.status <> 'matched'
         or queue.active_proposal_id is not null
       );

    if not exists (
      select 1
        from private.ranked_matchmaking_receipts receipt
       where receipt.proposal_id = proposal_record.id
    ) then
      raise exception 'Matched ranked proposals require one matchmaking receipt'
        using errcode = '23514';
    end if;
  else
    select count(*)::integer
      into invalid_participant_count
      from private.ranked_matchmaking_proposal_participants participant
      join private.ranked_queue_entries queue
        on queue.id = participant.queue_entry_id
     where participant.proposal_id = proposal_record.id
       and (
         participant.acceptance_status = 'pending'
         or queue.active_proposal_id = proposal_record.id
       );
  end if;

  if invalid_participant_count <> 0 then
    raise exception 'Ranked proposal, response, and queue states disagree'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_ranked_proposal_trigger()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_ranked_proposal(
    coalesce(
      to_jsonb(new) ->> 'proposal_id',
      to_jsonb(new) ->> 'active_proposal_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );

  if tg_op = 'UPDATE'
     and to_jsonb(old) ->> 'active_proposal_id' is distinct from
       to_jsonb(new) ->> 'active_proposal_id'
     and to_jsonb(old) ->> 'active_proposal_id' is not null then
    perform private.validate_ranked_proposal(
      (to_jsonb(old) ->> 'active_proposal_id')::uuid
    );
  end if;

  return null;
end;
$$;

create constraint trigger ranked_proposals_shape_valid
after insert or update on private.ranked_matchmaking_proposals
deferrable initially deferred
for each row execute function private.validate_ranked_proposal_trigger();

create constraint trigger ranked_proposal_participants_shape_valid
after insert or update on private.ranked_matchmaking_proposal_participants
deferrable initially deferred
for each row execute function private.validate_ranked_proposal_trigger();

create constraint trigger ranked_queue_proposal_shape_valid
after update on private.ranked_queue_entries
deferrable initially deferred
for each row execute function private.validate_ranked_proposal_trigger();

create function private.cancel_ranked_queue_for_account_deletion(
  player_id_to_delete uuid
)
returns void
language plpgsql
as $$
declare
  proposal_record record;
  cancellation_at timestamptz;
begin
  perform 1 from public.players
   where id = player_id_to_delete and lifecycle_status = 'deletion_pending'
   for update;

  if not found then
    raise exception 'Ranked queue cleanup requires a deletion-pending player'
      using errcode = '23514';
  end if;

  for proposal_record in
    select proposal.id
      from private.ranked_matchmaking_proposals proposal
      join private.ranked_queue_entries queue
        on queue.active_proposal_id = proposal.id
     where queue.player_id = player_id_to_delete
       and queue.status = 'proposed'
       and proposal.status = 'awaiting_acceptance'
     order by proposal.id
     for update of proposal
  loop
    cancellation_at := clock_timestamp();

    update private.ranked_matchmaking_proposal_participants
       set acceptance_status = 'system_cancelled',
           responded_at = cancellation_at
     where proposal_id = proposal_record.id
       and acceptance_status = 'pending';

    update private.ranked_queue_entries
       set status = 'cancelled',
           version = version + 1,
           lease_expires_at = null,
           active_proposal_id = null,
           terminal_at = cancellation_at,
           updated_at = cancellation_at
     where active_proposal_id = proposal_record.id
       and status = 'proposed';

    update private.ranked_matchmaking_proposals
       set status = 'cancelled',
           version = version + 1,
           resolved_at = cancellation_at
     where id = proposal_record.id;
  end loop;

  cancellation_at := clock_timestamp();
  update private.ranked_queue_entries
     set status = 'cancelled',
         version = version + 1,
         lease_expires_at = null,
         terminal_at = cancellation_at,
         updated_at = cancellation_at
   where player_id = player_id_to_delete
     and status = 'searching';
end;
$$;

revoke all on function private.cancel_ranked_queue_for_account_deletion(uuid)
  from public;

alter function private.delete_player_owned_data(uuid, uuid)
  rename to delete_player_owned_data_before_ranked;

create function private.delete_player_owned_data(
  player_id_to_delete uuid,
  deletion_request_id_to_complete uuid
)
returns void
language plpgsql
as $$
begin
  perform private.cancel_ranked_queue_for_account_deletion(player_id_to_delete);
  perform private.delete_player_owned_data_before_ranked(
    player_id_to_delete,
    deletion_request_id_to_complete
  );
end;
$$;

revoke all on function private.delete_player_owned_data_before_ranked(uuid, uuid)
  from public;
revoke all on function private.delete_player_owned_data(uuid, uuid)
  from public;

create function private.validate_ranked_matchmaking_receipt(
  match_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  receipt_record private.ranked_matchmaking_receipts%rowtype;
  proposal_status text;
  season_status text;
  match_status text;
  input_count integer;
  invalid_input_count integer;
begin
  select *
    into receipt_record
    from private.ranked_matchmaking_receipts
   where match_id = match_id_to_validate;

  if not found then
    return;
  end if;

  select status
    into proposal_status
    from private.ranked_matchmaking_proposals
   where id = receipt_record.proposal_id;

  select status
    into season_status
    from public.ranked_seasons
   where id = receipt_record.season_id;

  select status
    into match_status
    from public.live_pvp_matches
   where id = receipt_record.match_id;

  if proposal_status is distinct from 'matched'
     or season_status is distinct from 'active'
     or match_status not in ('active', 'completed') then
    raise exception 'Ranked matchmaking receipt requires a matched proposal and valid live match'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into input_count
    from private.ranked_match_rating_inputs input
   where input.match_id = receipt_record.match_id;

  if input_count <> 2 then
    raise exception 'Ranked matches require exactly two rating input snapshots'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into invalid_input_count
    from private.ranked_match_rating_inputs input
    left join private.ranked_matchmaking_proposal_participants proposal_participant
      on proposal_participant.proposal_id = receipt_record.proposal_id
     and proposal_participant.player_id = input.player_id
    left join public.ranked_player_season_ratings rating
      on rating.season_id = input.season_id
     and rating.player_id = input.player_id
   where input.match_id = receipt_record.match_id
     and (
       proposal_participant.player_id is null
       or proposal_participant.acceptance_status <> 'accepted'
       or rating.player_id is null
       or rating.rating <> input.pre_match_rating
       or rating.settled_match_count <> input.prior_settled_match_count
     );

  if invalid_input_count <> 0 then
    raise exception 'Ranked rating inputs do not match accepted players and current ratings'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_ranked_matchmaking_receipt_trigger()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_ranked_matchmaking_receipt(
    (to_jsonb(new) ->> 'match_id')::uuid
  );
  return null;
end;
$$;

create constraint trigger ranked_matchmaking_receipts_valid
after insert on private.ranked_matchmaking_receipts
deferrable initially deferred
for each row execute function private.validate_ranked_matchmaking_receipt_trigger();

create constraint trigger ranked_match_rating_inputs_valid
after insert on private.ranked_match_rating_inputs
deferrable initially deferred
for each row execute function private.validate_ranked_matchmaking_receipt_trigger();

create function private.validate_ranked_settlement(match_id_to_validate uuid)
returns void
language plpgsql
as $$
declare
  settlement_record private.ranked_rating_settlements%rowtype;
  match_record public.live_pvp_matches%rowtype;
  season_status text;
  ledger_count integer;
  invalid_ledger_count integer;
begin
  select *
    into settlement_record
    from private.ranked_rating_settlements
   where match_id = match_id_to_validate;

  if not found then
    return;
  end if;

  select *
    into match_record
    from public.live_pvp_matches
   where id = settlement_record.match_id;

  select status
    into season_status
    from public.ranked_seasons
   where id = settlement_record.season_id;

  if match_record.status <> 'completed'
     or match_record.winner_player_id is distinct from settlement_record.winner_player_id
     or match_record.completion_reason is distinct from settlement_record.completion_reason
     or settlement_record.settled_at < match_record.completed_at
     or season_status not in ('active', 'closing') then
    raise exception 'Ranked settlement must match one terminal live match in its open season'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from private.live_pvp_completion_sources source
     where source.match_id = settlement_record.match_id
       and (
         source.completion_reason <> settlement_record.completion_reason
         or (source.player_id = settlement_record.winner_player_id and source.outcome <> 'win')
         or (source.player_id = settlement_record.loser_player_id and source.outcome <> 'loss')
       )
  ) then
    raise exception 'Ranked settlement conflicts with immutable live completion sources'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into ledger_count
    from private.ranked_rating_ledger_entries ledger
   where ledger.match_id = settlement_record.match_id;

  if ledger_count <> 2 then
    raise exception 'Ranked settlements require exactly two rating ledger entries'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into invalid_ledger_count
    from private.ranked_rating_ledger_entries ledger
    join public.ranked_player_season_ratings rating
      on rating.season_id = ledger.season_id
     and rating.player_id = ledger.player_id
    join private.ranked_match_rating_inputs opponent
      on opponent.match_id = ledger.match_id
     and opponent.player_id <> ledger.player_id
   where ledger.match_id = settlement_record.match_id
     and (
       (ledger.player_id = settlement_record.winner_player_id and ledger.outcome <> 'win')
       or (ledger.player_id = settlement_record.loser_player_id and ledger.outcome <> 'loss')
       or ledger.player_id not in (
         settlement_record.winner_player_id,
         settlement_record.loser_player_id
       )
       or rating.last_settled_match_id is distinct from settlement_record.match_id
       or rating.rating <> ledger.rating_after
       or rating.settled_match_count <> ledger.match_count_after
       or rating.wins <> ledger.wins_after
       or rating.losses <> ledger.losses_after
       or ledger.expected_score <> round(
         1::numeric / (
           1::numeric + power(
             10::numeric,
             (opponent.pre_match_rating - ledger.rating_before)::numeric / 400
           )
         ),
         15
       )
       or ledger.calculated_delta <> round(
         ledger.k_factor * (
           (case when ledger.outcome = 'win' then 1 else 0 end)::numeric
           - ledger.expected_score
         )
       )::integer
     );

  if invalid_ledger_count <> 0 then
    raise exception 'Ranked settlement, ledger, and current ratings disagree'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_ranked_settlement_trigger()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_ranked_settlement(
    coalesce(
      to_jsonb(new) ->> 'match_id',
      to_jsonb(new) ->> 'last_settled_match_id'
    )::uuid
  );
  return null;
end;
$$;

create constraint trigger ranked_rating_settlements_valid
after insert on private.ranked_rating_settlements
deferrable initially deferred
for each row execute function private.validate_ranked_settlement_trigger();

create constraint trigger ranked_rating_ledger_entries_valid
after insert on private.ranked_rating_ledger_entries
deferrable initially deferred
for each row execute function private.validate_ranked_settlement_trigger();

create constraint trigger ranked_current_ratings_settlement_valid
after update of last_settled_match_id on public.ranked_player_season_ratings
deferrable initially deferred
for each row execute function private.validate_ranked_settlement_trigger();

create function private.validate_ranked_archive_insert()
returns trigger
language plpgsql
as $$
declare
  season_status text;
  current_rating public.ranked_player_season_ratings%rowtype;
begin
  select status
    into season_status
    from public.ranked_seasons
   where id = new.season_id;

  select *
    into current_rating
    from public.ranked_player_season_ratings
   where season_id = new.season_id
     and player_id = new.player_id;

  if season_status not in ('closing', 'closed')
     or current_rating.player_id is null
     or current_rating.settled_match_count < 5
     or new.rating <> current_rating.rating
     or new.wins <> current_rating.wins
     or new.losses <> current_rating.losses
     or new.settled_match_count <> current_rating.settled_match_count then
    raise exception 'Ranked archive rows must snapshot one established closing-season rating'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ranked_season_archives_insert_guard
before insert on public.ranked_season_standing_archives
for each row execute function private.validate_ranked_archive_insert();

create function private.validate_ranked_season_close(season_id_to_validate uuid)
returns void
language plpgsql
as $$
declare
  season_record public.ranked_seasons%rowtype;
  receipt_record private.ranked_season_close_receipts%rowtype;
  expected_settlement_count integer;
  expected_archive_count integer;
  actual_archive_count integer;
  invalid_archive_count integer;
begin
  select *
    into season_record
    from public.ranked_seasons
   where id = season_id_to_validate;

  if not found or season_record.status <> 'closed' then
    return;
  end if;

  select *
    into receipt_record
    from private.ranked_season_close_receipts
   where season_id = season_record.id;

  if receipt_record.season_id is null
     or receipt_record.closed_at is distinct from season_record.closed_at then
    raise exception 'Closed ranked seasons require one matching close receipt'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into expected_settlement_count
    from private.ranked_rating_settlements
   where season_id = season_record.id;

  if exists (
    select 1
      from private.ranked_matchmaking_receipts match_receipt
      left join private.ranked_rating_settlements settlement
        on settlement.match_id = match_receipt.match_id
     where match_receipt.season_id = season_record.id
       and settlement.match_id is null
  ) then
    raise exception 'Ranked season cannot close with unsettled matches'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from private.ranked_queue_entries queue
     where queue.season_id = season_record.id
       and queue.status in ('searching', 'proposed')
  ) or exists (
    select 1
      from private.ranked_matchmaking_proposals proposal
     where proposal.season_id = season_record.id
       and proposal.status = 'awaiting_acceptance'
  ) then
    raise exception 'Ranked season cannot close with active queue or proposal state'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into expected_archive_count
    from public.ranked_player_season_ratings rating
   where rating.season_id = season_record.id
     and rating.settled_match_count >= 5;

  select count(*)::integer
    into actual_archive_count
    from public.ranked_season_standing_archives archive
   where archive.season_id = season_record.id;

  select count(*)::integer
    into invalid_archive_count
    from public.ranked_season_standing_archives archive
   where archive.season_id = season_record.id
     and (
       archive.rank <> 1 + (
         select count(*)::integer
           from public.ranked_season_standing_archives higher
          where higher.season_id = archive.season_id
            and higher.rating > archive.rating
       )
       or archive.rating is distinct from (
         select rating.rating
           from public.ranked_player_season_ratings rating
          where rating.season_id = archive.season_id
            and rating.player_id = archive.player_id
       )
     );

  if receipt_record.settlement_count <> expected_settlement_count
     or receipt_record.archived_player_count <> expected_archive_count
     or actual_archive_count <> expected_archive_count
     or invalid_archive_count <> 0 then
    raise exception 'Ranked season close counts or competition ranks are invalid'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_ranked_season_close_trigger()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_ranked_season_close(
    coalesce(
      to_jsonb(new) ->> 'season_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create constraint trigger ranked_seasons_close_valid
after update on public.ranked_seasons
deferrable initially deferred
for each row execute function private.validate_ranked_season_close_trigger();

create constraint trigger ranked_season_close_receipts_valid
after insert on private.ranked_season_close_receipts
deferrable initially deferred
for each row execute function private.validate_ranked_season_close_trigger();

create constraint trigger ranked_season_archives_close_valid
after insert on public.ranked_season_standing_archives
deferrable initially deferred
for each row execute function private.validate_ranked_season_close_trigger();

comment on table public.ranked_seasons is
  'Versioned ranked-v1 season lifecycle. Only one season may be active or closing.';

comment on table public.ranked_player_season_ratings is
  'Current per-player seasonal rating projection backed by immutable settlement ledger entries.';

comment on table private.ranked_queue_entries is
  'Private ranked queue leases and terminal queue history. One player may have at most one active entry.';

comment on table private.ranked_matchmaking_proposals is
  'Private two-player ranked proposals with one server-owned twenty-second acceptance deadline.';

comment on table private.ranked_matchmaking_receipts is
  'Immutable binding from one accepted ranked proposal to one authoritative live PvP match and season.';

comment on table private.ranked_rating_settlements is
  'Exactly-once terminal ranked-match settlement receipt. The match identifier is the idempotency key.';

comment on table private.ranked_rating_ledger_entries is
  'Immutable per-player rating changes whose snapshots and resulting current rating must agree.';

comment on table public.ranked_season_standing_archives is
  'Immutable established-player competitive facts for a closed ranked season; no player-name snapshot is stored.';
