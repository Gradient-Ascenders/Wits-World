create table public.live_pvp_matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  version integer not null default 0,
  phase text not null default 'initial_selection',
  current_actor_player_id uuid,
  decision_started_at timestamptz,
  turn_deadline timestamptz,
  winner_player_id uuid,
  completion_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint live_pvp_matches_status_check
    check (status in ('active', 'completed')),
  constraint live_pvp_matches_version_check
    check (version >= 0),
  constraint live_pvp_matches_phase_check
    check (phase in ('initial_selection', 'active', 'replacement', 'completed')),
  constraint live_pvp_matches_completion_reason_check
    check (
      completion_reason is null
      or completion_reason in (
        'defeat',
        'abandonment_forfeit',
        'voluntary_resignation',
        'account_deletion_forfeit'
      )
    ),
  constraint live_pvp_matches_lifecycle_check
    check (
      (
        status = 'active'
        and phase <> 'completed'
        and winner_player_id is null
        and completion_reason is null
        and completed_at is null
        and decision_started_at is not null
        and turn_deadline is not null
        and (
          (phase = 'initial_selection' and current_actor_player_id is null)
          or
          (phase in ('active', 'replacement') and current_actor_player_id is not null)
        )
      )
      or
      (
        status = 'completed'
        and phase = 'completed'
        and current_actor_player_id is null
        and decision_started_at is null
        and turn_deadline is null
        and winner_player_id is not null
        and completion_reason is not null
        and completed_at is not null
      )
    ),
  constraint live_pvp_matches_deadline_check
    check (
      turn_deadline is null
      or turn_deadline = decision_started_at + interval '60 seconds'
    ),
  constraint live_pvp_matches_timestamps_check
    check (
      started_at >= created_at
      and updated_at >= created_at
      and (
        completed_at is null
        or completed_at >= started_at
      )
    ),
  constraint live_pvp_matches_identity_version_unique
    unique (id, version)
);

create index live_pvp_matches_active_idx
  on public.live_pvp_matches (updated_at desc, id desc)
  where status = 'active';

create index live_pvp_matches_history_idx
  on public.live_pvp_matches (completed_at desc, id desc)
  where status = 'completed';

create index live_pvp_matches_overdue_idx
  on public.live_pvp_matches (turn_deadline, id)
  where status = 'active';

create table private.live_pvp_deck_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.live_pvp_matches (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  participant_side text not null,
  source_deck_id uuid not null,
  created_at timestamptz not null default now(),

  constraint live_pvp_deck_snapshots_side_check
    check (participant_side in ('player_one', 'player_two')),
  constraint live_pvp_deck_snapshots_match_side_unique
    unique (match_id, participant_side),
  constraint live_pvp_deck_snapshots_match_player_unique
    unique (match_id, player_id),
  constraint live_pvp_deck_snapshots_identity_match_player_unique
    unique (id, match_id, player_id)
);

revoke all on table private.live_pvp_deck_snapshots from public;

create table private.live_pvp_deck_snapshot_cards (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references private.live_pvp_deck_snapshots (id) on delete restrict,
  position smallint not null,
  battle_card_id uuid not null,
  source_owned_card_id uuid not null,
  source_card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  category text not null,
  affinity text,
  rarity text not null,
  card_snapshot jsonb not null,

  constraint live_pvp_deck_snapshot_cards_position_check
    check (position between 1 and 5),
  constraint live_pvp_deck_snapshot_cards_category_check
    check (category in ('creature', 'power')),
  constraint live_pvp_deck_snapshot_cards_affinity_check
    check (
      (category = 'creature'
        and affinity is not null
        and affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic'))
      or
      (category = 'power'
        and (
          affinity is null
          or affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic')
        ))
    ),
  constraint live_pvp_deck_snapshot_cards_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  constraint live_pvp_deck_snapshot_cards_snapshot_check
    check (jsonb_typeof(card_snapshot) = 'object'),
  constraint live_pvp_deck_snapshot_cards_position_unique
    unique (snapshot_id, position),
  constraint live_pvp_deck_snapshot_cards_battle_identity_unique
    unique (snapshot_id, battle_card_id),
  constraint live_pvp_deck_snapshot_cards_owned_identity_unique
    unique (snapshot_id, source_owned_card_id),
  constraint live_pvp_deck_snapshot_cards_identity_snapshot_unique
    unique (id, snapshot_id)
);

revoke all on table private.live_pvp_deck_snapshot_cards from public;

create table public.live_pvp_match_participants (
  match_id uuid not null
    references public.live_pvp_matches (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  participant_side text not null,
  deck_snapshot_id uuid not null,
  consecutive_timeout_count smallint not null default 0,
  connection_generation bigint not null default 0,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (match_id, player_id),
  constraint live_pvp_match_participants_side_check
    check (participant_side in ('player_one', 'player_two')),
  constraint live_pvp_match_participants_timeout_count_check
    check (consecutive_timeout_count between 0 and 3),
  constraint live_pvp_match_participants_generation_check
    check (connection_generation >= 0),
  constraint live_pvp_match_participants_outcome_check
    check (outcome is null or outcome in ('win', 'loss')),
  constraint live_pvp_match_participants_side_unique
    unique (match_id, participant_side),
  constraint live_pvp_match_participants_snapshot_unique
    unique (deck_snapshot_id),
  constraint live_pvp_match_participants_snapshot_fk
    foreign key (deck_snapshot_id, match_id, player_id)
    references private.live_pvp_deck_snapshots (id, match_id, player_id)
    on delete restrict
    deferrable initially deferred,
  constraint live_pvp_match_participants_timestamps_check
    check (updated_at >= created_at)
);

alter table public.live_pvp_matches
  add constraint live_pvp_matches_current_actor_fk
  foreign key (id, current_actor_player_id)
  references public.live_pvp_match_participants (match_id, player_id)
  on delete restrict
  deferrable initially deferred;

alter table public.live_pvp_matches
  add constraint live_pvp_matches_winner_fk
  foreign key (id, winner_player_id)
  references public.live_pvp_match_participants (match_id, player_id)
  on delete restrict
  deferrable initially deferred;

create index live_pvp_match_participants_player_idx
  on public.live_pvp_match_participants (player_id, match_id);

create table private.live_pvp_match_states (
  match_id uuid primary key,
  version integer not null,
  battle_state jsonb not null,
  updated_at timestamptz not null default now(),

  constraint live_pvp_match_states_version_check
    check (version >= 0),
  constraint live_pvp_match_states_state_check
    check (jsonb_typeof(battle_state) = 'object'),
  constraint live_pvp_match_states_match_version_fk
    foreign key (match_id, version)
    references public.live_pvp_matches (id, version)
    on delete restrict
    deferrable initially deferred
);

revoke all on table private.live_pvp_match_states from public;

create table public.live_pvp_match_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.live_pvp_matches (id) on delete restrict,
  sequence integer not null,
  previous_version integer not null,
  committed_version integer not null,
  transition_kind text not null,
  actor_player_id uuid,
  public_result jsonb not null,
  created_at timestamptz not null default now(),

  constraint live_pvp_match_actions_sequence_check
    check (sequence > 0),
  constraint live_pvp_match_actions_previous_version_check
    check (previous_version >= 0),
  constraint live_pvp_match_actions_committed_version_check
    check (committed_version > 0),
  constraint live_pvp_match_actions_version_shape_check
    check (
      sequence = committed_version
      and previous_version + 1 = committed_version
    ),
  constraint live_pvp_match_actions_transition_kind_check
    check (
      transition_kind in (
        'participant_action',
        'automatic_initial_selection',
        'automatic_replacement',
        'timeout',
        'abandonment_forfeit',
        'voluntary_resignation',
        'account_deletion_forfeit'
      )
    ),
  constraint live_pvp_match_actions_actor_shape_check
    check (
      (
        transition_kind in ('participant_action', 'voluntary_resignation')
        and actor_player_id is not null
      )
      or
      (
        transition_kind not in ('participant_action', 'voluntary_resignation')
        and actor_player_id is null
      )
    ),
  constraint live_pvp_match_actions_result_check
    check (jsonb_typeof(public_result) = 'object'),
  constraint live_pvp_match_actions_actor_fk
    foreign key (match_id, actor_player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict
    deferrable initially deferred,
  constraint live_pvp_match_actions_sequence_unique
    unique (match_id, sequence),
  constraint live_pvp_match_actions_committed_version_unique
    unique (match_id, committed_version),
  constraint live_pvp_match_actions_identity_match_unique
    unique (id, match_id)
);

create index live_pvp_match_actions_history_idx
  on public.live_pvp_match_actions (match_id, sequence);

create table private.live_pvp_match_transitions (
  action_id uuid primary key,
  match_id uuid not null,
  state_before jsonb not null,
  state_after jsonb not null,
  authoritative_result jsonb not null,
  server_randomness jsonb not null default '{}'::jsonb,
  participant_connection_generation bigint,
  created_at timestamptz not null default now(),

  constraint live_pvp_match_transitions_action_fk
    foreign key (action_id, match_id)
    references public.live_pvp_match_actions (id, match_id)
    on delete restrict,
  constraint live_pvp_match_transitions_state_before_check
    check (jsonb_typeof(state_before) = 'object'),
  constraint live_pvp_match_transitions_state_after_check
    check (jsonb_typeof(state_after) = 'object'),
  constraint live_pvp_match_transitions_result_check
    check (jsonb_typeof(authoritative_result) = 'object'),
  constraint live_pvp_match_transitions_randomness_check
    check (jsonb_typeof(server_randomness) = 'object'),
  constraint live_pvp_match_transitions_generation_check
    check (
      participant_connection_generation is null
      or participant_connection_generation > 0
    )
);

revoke all on table private.live_pvp_match_transitions from public;

create table private.live_pvp_connection_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_digest bytea not null unique,
  match_id uuid not null
    references public.live_pvp_matches (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  role text not null,
  protocol_version smallint not null default 1,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  purge_after timestamptz not null,

  constraint live_pvp_connection_tickets_digest_check
    check (octet_length(ticket_digest) = 32),
  constraint live_pvp_connection_tickets_role_check
    check (role in ('participant', 'spectator')),
  constraint live_pvp_connection_tickets_protocol_check
    check (protocol_version = 1),
  constraint live_pvp_connection_tickets_expiry_check
    check (expires_at = created_at + interval '60 seconds'),
  constraint live_pvp_connection_tickets_redemption_check
    check (
      redeemed_at is null
      or (redeemed_at >= created_at and redeemed_at < expires_at)
    ),
  constraint live_pvp_connection_tickets_retention_check
    check (purge_after = expires_at + interval '24 hours'),
  constraint live_pvp_connection_tickets_identity_match_player_role_unique
    unique (id, match_id, player_id, role)
);

create index live_pvp_connection_tickets_match_player_idx
  on private.live_pvp_connection_tickets (match_id, player_id, created_at desc);

create index live_pvp_connection_tickets_expiry_idx
  on private.live_pvp_connection_tickets (expires_at, id)
  where redeemed_at is null;

create index live_pvp_connection_tickets_purge_idx
  on private.live_pvp_connection_tickets (purge_after, id);

revoke all on table private.live_pvp_connection_tickets from public;

create table private.live_pvp_connection_access (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique
    references private.live_pvp_connection_tickets (id) on delete restrict,
  match_id uuid not null
    references public.live_pvp_matches (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  role text not null,
  participant_generation bigint,
  opened_at timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  purge_after timestamptz,

  constraint live_pvp_connection_access_role_check
    check (role in ('participant', 'spectator')),
  constraint live_pvp_connection_access_generation_shape_check
    check (
      (role = 'participant' and participant_generation is not null and participant_generation > 0)
      or
      (role = 'spectator' and participant_generation is null)
    ),
  constraint live_pvp_connection_access_close_reason_check
    check (
      close_reason is null
      or close_reason in (
        'superseded',
        'transport_closed',
        'service_shutdown',
        'match_completed',
        'account_deletion'
      )
    ),
  constraint live_pvp_connection_access_lifecycle_check
    check (
      (
        closed_at is null
        and close_reason is null
        and purge_after is null
      )
      or
      (
        closed_at is not null
        and closed_at >= opened_at
        and close_reason is not null
        and purge_after = closed_at + interval '24 hours'
      )
    )
);

create unique index live_pvp_connection_access_one_participant_open_idx
  on private.live_pvp_connection_access (match_id, player_id)
  where role = 'participant' and closed_at is null;

create index live_pvp_connection_access_match_open_idx
  on private.live_pvp_connection_access (match_id, role, opened_at)
  where closed_at is null;

create index live_pvp_connection_access_player_idx
  on private.live_pvp_connection_access (player_id, opened_at desc);

create index live_pvp_connection_access_purge_idx
  on private.live_pvp_connection_access (purge_after, id)
  where purge_after is not null;

revoke all on table private.live_pvp_connection_access from public;

create table private.live_pvp_submission_receipts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  actor_player_id uuid not null,
  operation text not null,
  message_id uuid not null,
  expected_version integer not null,
  connection_generation bigint not null,
  payload_hash text not null,
  committed_event_id uuid not null,
  committed_acknowledgement jsonb not null,
  created_at timestamptz not null default now(),

  constraint live_pvp_submission_receipts_operation_check
    check (operation in ('action_submit', 'resign_submit')),
  constraint live_pvp_submission_receipts_expected_version_check
    check (expected_version >= 0),
  constraint live_pvp_submission_receipts_generation_check
    check (connection_generation > 0),
  constraint live_pvp_submission_receipts_payload_hash_check
    check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint live_pvp_submission_receipts_ack_check
    check (jsonb_typeof(committed_acknowledgement) = 'object'),
  constraint live_pvp_submission_receipts_actor_fk
    foreign key (match_id, actor_player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint live_pvp_submission_receipts_event_fk
    foreign key (committed_event_id, match_id)
    references public.live_pvp_match_actions (id, match_id)
    on delete restrict,
  constraint live_pvp_submission_receipts_message_unique
    unique (match_id, actor_player_id, operation, message_id)
);

create index live_pvp_submission_receipts_lookup_idx
  on private.live_pvp_submission_receipts (
    match_id,
    actor_player_id,
    operation,
    message_id
  );

revoke all on table private.live_pvp_submission_receipts from public;

create table private.live_pvp_completion_sources (
  match_id uuid not null,
  player_id uuid not null,
  outcome text not null,
  completion_reason text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),

  primary key (match_id, player_id),
  constraint live_pvp_completion_sources_outcome_check
    check (outcome in ('win', 'loss')),
  constraint live_pvp_completion_sources_reason_check
    check (
      completion_reason in (
        'defeat',
        'abandonment_forfeit',
        'voluntary_resignation',
        'account_deletion_forfeit'
      )
    ),
  constraint live_pvp_completion_sources_participant_fk
    foreign key (match_id, player_id)
    references public.live_pvp_match_participants (match_id, player_id)
    on delete restrict
);

revoke all on table private.live_pvp_completion_sources from public;

create function private.validate_live_pvp_deck_snapshot(
  snapshot_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  snapshot_record record;
  card_count integer;
  creature_count integer;
  power_count integer;
  deck_points integer;
begin
  select snapshot.*
    into snapshot_record
    from private.live_pvp_deck_snapshots snapshot
   where snapshot.id = snapshot_id_to_validate;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where card.category = 'creature')::integer,
    count(*) filter (where card.category = 'power')::integer,
    coalesce(
      sum(
        case card.rarity
          when 'common' then 1
          when 'rare' then 2
          when 'epic' then 3
          when 'legendary' then 4
        end
      ),
      0
    )::integer
    into card_count, creature_count, power_count, deck_points
    from private.live_pvp_deck_snapshot_cards card
   where card.snapshot_id = snapshot_id_to_validate;

  if card_count <> 5
     or creature_count <> 3
     or power_count <> 2
     or deck_points > 10 then
    raise exception
      'Live PvP deck snapshot % violates the shared five-card deck rules',
      snapshot_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_live_pvp_snapshot_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_live_pvp_deck_snapshot(
    coalesce(
      to_jsonb(new) ->> 'snapshot_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );

  return null;
end;
$$;

create constraint trigger live_pvp_deck_snapshots_valid
after insert or update on private.live_pvp_deck_snapshots
deferrable initially deferred
for each row
execute function private.validate_live_pvp_snapshot_after_mutation();

create constraint trigger live_pvp_deck_snapshot_cards_valid
after insert or update on private.live_pvp_deck_snapshot_cards
deferrable initially deferred
for each row
execute function private.validate_live_pvp_snapshot_after_mutation();

create function private.prevent_live_pvp_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Live PvP deck snapshots are immutable'
    using errcode = '55006';
end;
$$;

create trigger live_pvp_deck_snapshots_immutability
before update or delete on private.live_pvp_deck_snapshots
for each row
execute function private.prevent_live_pvp_snapshot_mutation();

create trigger live_pvp_deck_snapshot_cards_immutability
before update or delete on private.live_pvp_deck_snapshot_cards
for each row
execute function private.prevent_live_pvp_snapshot_mutation();

create function public.protect_live_pvp_match_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Live PvP match % cannot be deleted',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'active'
       or new.version <> 0
       or new.phase <> 'initial_selection' then
      raise exception
        'New live PvP matches must begin active in initial selection at version zero'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.started_at is distinct from old.started_at
     or new.created_at is distinct from old.created_at then
    raise exception
      'Live PvP match % identity is immutable',
      old.id
      using errcode = '55006';
  end if;

  if old.status = 'completed' then
    raise exception
      'Completed live PvP match % is immutable',
      old.id
      using errcode = '55006';
  end if;

  if new.version <> old.version + 1 then
    raise exception
      'Live PvP match % must advance exactly one version per authoritative transition',
      old.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger live_pvp_matches_lifecycle_guard
before insert or update or delete on public.live_pvp_matches
for each row
execute function public.protect_live_pvp_match_lifecycle();

create function public.protect_live_pvp_participant_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Live PvP match participants cannot be deleted'
      using errcode = '55006';
  end if;

  if new.match_id is distinct from old.match_id
     or new.player_id is distinct from old.player_id
     or new.participant_side is distinct from old.participant_side
     or new.deck_snapshot_id is distinct from old.deck_snapshot_id
     or new.created_at is distinct from old.created_at then
    raise exception
      'Live PvP participant identity and snapshot are immutable'
      using errcode = '55006';
  end if;

  if old.outcome is not null then
    raise exception
      'Terminal live PvP participant history is immutable'
      using errcode = '55006';
  end if;

  if new.connection_generation < old.connection_generation
     or new.connection_generation > old.connection_generation + 1 then
    raise exception
      'Live PvP participant connection generation must advance one step at a time'
      using errcode = '23514';
  end if;

  if old.outcome is null
     and new.outcome is not null
     and new.outcome not in ('win', 'loss') then
    raise exception
      'Live PvP participant outcome is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger live_pvp_match_participants_history_guard
before update or delete on public.live_pvp_match_participants
for each row
execute function public.protect_live_pvp_participant_history();

create function private.protect_live_pvp_match_state()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Live PvP match state cannot be deleted'
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' then
    if new.match_id is distinct from old.match_id
       or new.version <> old.version + 1 then
      raise exception
        'Live PvP match state must advance exactly one version'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger live_pvp_match_states_version_guard
before update or delete on private.live_pvp_match_states
for each row
execute function private.protect_live_pvp_match_state();

create function public.prevent_live_pvp_action_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Live PvP public action history is immutable'
    using errcode = '55006';
end;
$$;

create trigger live_pvp_match_actions_immutability
before update or delete on public.live_pvp_match_actions
for each row
execute function public.prevent_live_pvp_action_mutation();

create function private.prevent_live_pvp_private_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Private live PvP history is immutable'
    using errcode = '55006';
end;
$$;

create trigger live_pvp_match_transitions_immutability
before update or delete on private.live_pvp_match_transitions
for each row
execute function private.prevent_live_pvp_private_history_mutation();

create trigger live_pvp_submission_receipts_immutability
before update or delete on private.live_pvp_submission_receipts
for each row
execute function private.prevent_live_pvp_private_history_mutation();

create trigger live_pvp_completion_sources_immutability
before update or delete on private.live_pvp_completion_sources
for each row
execute function private.prevent_live_pvp_private_history_mutation();

create function private.validate_live_pvp_ticket_insert()
returns trigger
language plpgsql
as $$
declare
  player_status text;
  match_status text;
  participant_exists boolean;
  authoritative_created_at timestamptz;
begin
  if new.redeemed_at is not null then
    raise exception
      'New live PvP connection tickets must be unredeemed'
      using errcode = '23514';
  end if;

  select lifecycle_status
    into player_status
    from public.players
   where id = new.player_id
   for update;

  if player_status is distinct from 'active' then
    raise exception
      'Live PvP connection tickets require an active player'
      using errcode = '23514';
  end if;

  select status
    into match_status
    from public.live_pvp_matches
   where id = new.match_id
   for update;

  if match_status is distinct from 'active' then
    raise exception
      'Live PvP connection tickets require an active match'
      using errcode = '23514';
  end if;

  select exists (
    select 1
      from public.live_pvp_match_participants participant
     where participant.match_id = new.match_id
       and participant.player_id = new.player_id
  ) into participant_exists;

  if new.role = 'participant' and not participant_exists then
    raise exception
      'Participant live PvP ticket does not belong to a match participant'
      using errcode = '23514';
  end if;

  if new.role = 'spectator' and participant_exists then
    raise exception
      'A live PvP participant cannot mint a spectator ticket for the same match'
      using errcode = '23514';
  end if;

  -- Ticket lifetime begins only after every lifecycle lock that minting may
  -- wait for has been acquired. Do not use now(): it is fixed at transaction
  -- start and could consume the ticket TTL while blocked on a lifecycle lock.
  authoritative_created_at := clock_timestamp();
  new.created_at := authoritative_created_at;
  new.expires_at := authoritative_created_at + interval '60 seconds';
  new.purge_after := new.expires_at + interval '24 hours';

  return new;
end;
$$;

create trigger live_pvp_connection_tickets_insert_guard
before insert on private.live_pvp_connection_tickets
for each row
execute function private.validate_live_pvp_ticket_insert();

create function private.protect_live_pvp_ticket_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.ticket_digest is distinct from old.ticket_digest
     or new.match_id is distinct from old.match_id
     or new.player_id is distinct from old.player_id
     or new.role is distinct from old.role
     or new.protocol_version is distinct from old.protocol_version
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or new.purge_after is distinct from old.purge_after then
    raise exception
      'Live PvP connection ticket identity and lifetime are immutable'
      using errcode = '55006';
  end if;

  if old.redeemed_at is not null
     or new.redeemed_at is null then
    raise exception
      'Live PvP connection tickets may be redeemed exactly once'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger live_pvp_connection_tickets_update_guard
before update on private.live_pvp_connection_tickets
for each row
execute function private.protect_live_pvp_ticket_update();

create function private.protect_live_pvp_connection_access_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.ticket_id is distinct from old.ticket_id
     or new.match_id is distinct from old.match_id
     or new.player_id is distinct from old.player_id
     or new.role is distinct from old.role
     or new.participant_generation is distinct from old.participant_generation
     or new.opened_at is distinct from old.opened_at then
    raise exception
      'Live PvP connection access identity is immutable'
      using errcode = '55006';
  end if;

  if old.closed_at is not null
     or new.closed_at is null
     or new.close_reason is null
     or new.purge_after is null then
    raise exception
      'Live PvP connection access may be closed exactly once'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger live_pvp_connection_access_update_guard
before update on private.live_pvp_connection_access
for each row
execute function private.protect_live_pvp_connection_access_update();

create function private.close_live_pvp_access_on_match_completion()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'active' and new.status = 'completed' then
    update private.live_pvp_connection_access access
       set closed_at = new.completed_at,
           close_reason = 'match_completed',
           purge_after = new.completed_at + interval '24 hours'
     where access.match_id = new.id
       and access.closed_at is null;
  end if;

  return new;
end;
$$;

create trigger live_pvp_matches_close_access_on_completion
after update of status on public.live_pvp_matches
for each row
execute function private.close_live_pvp_access_on_match_completion();

create function private.redeem_live_pvp_connection_ticket(
  ticket_digest_to_redeem bytea,
  redemption_now timestamptz default null
)
returns table (
  access_id uuid,
  match_id uuid,
  player_id uuid,
  role text,
  participant_generation bigint
)
language plpgsql
as $$
declare
  ticket_identity record;
  ticket_record record;
  player_status text;
  match_status text;
  current_generation bigint;
  new_generation bigint;
  new_access_id uuid;
  effective_redemption_now timestamptz;
begin
  -- Read only the immutable identifiers first. Authority is established below
  -- after locking player -> match -> ticket -> participant in that order.
  select ticket.match_id, ticket.player_id
    into ticket_identity
    from private.live_pvp_connection_tickets ticket
   where ticket.ticket_digest = ticket_digest_to_redeem;

  if not found then
    raise exception
      'Live PvP connection ticket is invalid'
      using errcode = '28000';
  end if;

  select player.lifecycle_status
    into player_status
    from public.players player
   where player.id = ticket_identity.player_id
   for update;

  if not found or player_status is distinct from 'active' then
    raise exception
      'Live PvP connection ticket player is unavailable'
      using errcode = '28000';
  end if;

  select match.status
    into match_status
    from public.live_pvp_matches match
   where match.id = ticket_identity.match_id
   for update;

  if not found or match_status is distinct from 'active' then
    raise exception
      'Live PvP connection ticket match is unavailable'
      using errcode = '23514';
  end if;

  select ticket.*
    into ticket_record
    from private.live_pvp_connection_tickets ticket
   where ticket.ticket_digest = ticket_digest_to_redeem
   for update;

  if not found
     or ticket_record.match_id is distinct from ticket_identity.match_id
     or ticket_record.player_id is distinct from ticket_identity.player_id then
    raise exception
      'Live PvP connection ticket is invalid'
      using errcode = '28000';
  end if;

  if ticket_record.redeemed_at is not null then
    raise exception
      'Live PvP connection ticket has already been redeemed'
      using errcode = '23505';
  end if;

  new_generation := null;

  if ticket_record.role = 'participant' then
    select participant.connection_generation
      into current_generation
      from public.live_pvp_match_participants participant
     where participant.match_id = ticket_record.match_id
       and participant.player_id = ticket_record.player_id
     for update;

    if not found then
      raise exception
        'Live PvP participant ticket has no matching participant'
        using errcode = '23503';
    end if;
  end if;

  -- Production callers omit the override, so the authoritative clock is
  -- sampled only after every row lock that redemption may wait for.
  effective_redemption_now := coalesce(redemption_now, clock_timestamp());

  if effective_redemption_now >= ticket_record.expires_at then
    raise exception
      'Live PvP connection ticket has expired'
      using errcode = '22023';
  end if;

  if ticket_record.role = 'participant' then
    new_generation := current_generation + 1;

    update private.live_pvp_connection_access access
       set closed_at = effective_redemption_now,
           close_reason = 'superseded',
           purge_after = effective_redemption_now + interval '24 hours'
     where access.match_id = ticket_record.match_id
       and access.player_id = ticket_record.player_id
       and access.role = 'participant'
       and access.closed_at is null;

    update public.live_pvp_match_participants participant
       set connection_generation = new_generation,
           updated_at = greatest(
             participant.updated_at,
             effective_redemption_now
           )
     where participant.match_id = ticket_record.match_id
       and participant.player_id = ticket_record.player_id;
  end if;

  update private.live_pvp_connection_tickets ticket
     set redeemed_at = effective_redemption_now
   where ticket.id = ticket_record.id;

  insert into private.live_pvp_connection_access (
    ticket_id,
    match_id,
    player_id,
    role,
    participant_generation,
    opened_at
  ) values (
    ticket_record.id,
    ticket_record.match_id,
    ticket_record.player_id,
    ticket_record.role,
    new_generation,
    effective_redemption_now
  )
  returning id into new_access_id;

  return query
    select
      new_access_id,
      ticket_record.match_id,
      ticket_record.player_id,
      ticket_record.role,
      new_generation;
end;
$$;

revoke all on function private.redeem_live_pvp_connection_ticket(bytea, timestamptz) from public;

create function private.close_live_pvp_connection_access(
  access_id_to_close uuid,
  reason_to_record text,
  closed_at_to_record timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
as $$
begin
  if reason_to_record not in (
    'transport_closed',
    'service_shutdown',
    'match_completed',
    'account_deletion'
  ) then
    raise exception
      'Unsupported live PvP connection close reason'
      using errcode = '22023';
  end if;

  update private.live_pvp_connection_access access
     set closed_at = closed_at_to_record,
         close_reason = reason_to_record,
         purge_after = closed_at_to_record + interval '24 hours'
   where access.id = access_id_to_close
     and access.closed_at is null;

  return found;
end;
$$;

revoke all on function private.close_live_pvp_connection_access(uuid, text, timestamptz) from public;

create function private.purge_live_pvp_transient_access(
  purge_now timestamptz default clock_timestamp()
)
returns table (
  access_rows_deleted integer,
  ticket_rows_deleted integer
)
language plpgsql
as $$
declare
  deleted_access_count integer;
  deleted_ticket_count integer;
begin
  delete from private.live_pvp_connection_access access
   where access.purge_after is not null
     and access.purge_after <= purge_now;
  get diagnostics deleted_access_count = row_count;

  delete from private.live_pvp_connection_tickets ticket
   where ticket.purge_after <= purge_now
     and not exists (
       select 1
         from private.live_pvp_connection_access access
        where access.ticket_id = ticket.id
     );
  get diagnostics deleted_ticket_count = row_count;

  return query select deleted_access_count, deleted_ticket_count;
end;
$$;

revoke all on function private.purge_live_pvp_transient_access(timestamptz) from public;

create function private.validate_live_pvp_receipt_generation()
returns trigger
language plpgsql
as $$
declare
  persisted_generation bigint;
begin
  select participant.connection_generation
    into persisted_generation
    from public.live_pvp_match_participants participant
   where participant.match_id = new.match_id
     and participant.player_id = new.actor_player_id
   for update;

  if not found then
    raise exception
      'Live PvP submission receipt actor is not a participant'
      using errcode = '23503';
  end if;

  if new.connection_generation is distinct from persisted_generation then
    raise exception
      'Live PvP submission receipt uses a superseded connection generation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger live_pvp_submission_receipts_generation_guard
before insert on private.live_pvp_submission_receipts
for each row
execute function private.validate_live_pvp_receipt_generation();

create function private.validate_live_pvp_match(
  match_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  match_record record;
  participant_count integer;
  snapshot_count integer;
  null_outcome_count integer;
  win_count integer;
  winner_outcome text;
  state_count integer;
  action_count integer;
  first_action_version integer;
  last_action_version integer;
  completion_source_count integer;
  valid_completion_source_count integer;
begin
  select match.*
    into match_record
    from public.live_pvp_matches match
   where match.id = match_id_to_validate;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where snapshot.match_id = match_id_to_validate
        and snapshot.player_id = participant.player_id
        and snapshot.participant_side = participant.participant_side
    )::integer,
    count(*) filter (where participant.outcome is null)::integer,
    count(*) filter (where participant.outcome = 'win')::integer
    into participant_count, snapshot_count, null_outcome_count, win_count
    from public.live_pvp_match_participants participant
    join private.live_pvp_deck_snapshots snapshot
      on snapshot.id = participant.deck_snapshot_id
   where participant.match_id = match_id_to_validate;

  if participant_count <> 2 or snapshot_count <> 2 then
    raise exception
      'Live PvP match % requires exactly two participants and battle-ready snapshots',
      match_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into state_count
    from private.live_pvp_match_states state
   where state.match_id = match_id_to_validate
     and state.version = match_record.version;

  if state_count <> 1 then
    raise exception
      'Live PvP match % requires one current private state at its committed version',
      match_id_to_validate
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    min(action.committed_version),
    max(action.committed_version)
    into action_count, first_action_version, last_action_version
    from public.live_pvp_match_actions action
   where action.match_id = match_id_to_validate;

  if action_count <> match_record.version
     or (
       match_record.version > 0
       and (
         first_action_version <> 1
         or last_action_version <> match_record.version
       )
     ) then
    raise exception
      'Live PvP match % requires one immutable public transition for every committed version',
      match_id_to_validate
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where source.outcome = participant.outcome
        and source.completion_reason = match_record.completion_reason
        and source.occurred_at = match_record.completed_at
    )::integer
    into completion_source_count, valid_completion_source_count
    from private.live_pvp_completion_sources source
    join public.live_pvp_match_participants participant
      on participant.match_id = source.match_id
     and participant.player_id = source.player_id
   where source.match_id = match_id_to_validate;

  if match_record.status = 'active' then
    if null_outcome_count <> 2
       or completion_source_count <> 0 then
      raise exception
        'Active live PvP match % cannot have terminal outcomes or completion sources',
        match_id_to_validate
        using errcode = '23514';
    end if;
  else
    select participant.outcome
      into winner_outcome
      from public.live_pvp_match_participants participant
     where participant.match_id = match_id_to_validate
       and participant.player_id = match_record.winner_player_id;

    if null_outcome_count <> 0
       or win_count <> 1
       or winner_outcome is distinct from 'win'
       or completion_source_count <> 2
       or valid_completion_source_count <> 2 then
      raise exception
        'Completed live PvP match % requires one winner, one loser, and two matching completion sources',
        match_id_to_validate
        using errcode = '23514';
    end if;
  end if;
end;
$$;

create function private.validate_live_pvp_action(
  action_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  action_record record;
  match_version integer;
  transition_record record;
  receipt_count integer;
  expected_operation text;
begin
  select action.*
    into action_record
    from public.live_pvp_match_actions action
   where action.id = action_id_to_validate;

  if not found then
    return;
  end if;

  select match.version
    into match_version
    from public.live_pvp_matches match
   where match.id = action_record.match_id;

  if match_version < action_record.committed_version then
    raise exception
      'Live PvP public action % refers to an uncommitted version',
      action_id_to_validate
      using errcode = '23514';
  end if;

  select transition.*
    into transition_record
    from private.live_pvp_match_transitions transition
   where transition.action_id = action_id_to_validate
     and transition.match_id = action_record.match_id;

  if not found then
    raise exception
      'Live PvP public action % requires one private authoritative transition',
      action_id_to_validate
      using errcode = '23514';
  end if;

  if action_record.transition_kind in ('participant_action', 'voluntary_resignation') then
    expected_operation := case action_record.transition_kind
      when 'participant_action' then 'action_submit'
      else 'resign_submit'
    end;

    if transition_record.participant_connection_generation is null then
      raise exception
        'Participant live PvP transition % requires its accepted connection generation',
        action_id_to_validate
        using errcode = '23514';
    end if;

    select count(*)::integer
      into receipt_count
      from private.live_pvp_submission_receipts receipt
     where receipt.match_id = action_record.match_id
       and receipt.actor_player_id = action_record.actor_player_id
       and receipt.operation = expected_operation
       and receipt.committed_event_id = action_id_to_validate
       and receipt.expected_version = action_record.previous_version
       and receipt.connection_generation = transition_record.participant_connection_generation;

    if receipt_count <> 1 then
      raise exception
        'Participant live PvP transition % requires one matching idempotency receipt',
        action_id_to_validate
        using errcode = '23514';
    end if;
  else
    if transition_record.participant_connection_generation is not null then
      raise exception
        'Automatic live PvP transition % cannot carry a participant connection generation',
        action_id_to_validate
        using errcode = '23514';
    end if;

    select count(*)::integer
      into receipt_count
      from private.live_pvp_submission_receipts receipt
     where receipt.committed_event_id = action_id_to_validate;

    if receipt_count <> 0 then
      raise exception
        'Automatic live PvP transition % cannot have a participant idempotency receipt',
        action_id_to_validate
        using errcode = '23514';
    end if;
  end if;
end;
$$;

create function private.validate_live_pvp_receipt(
  receipt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  receipt_record record;
  action_record record;
begin
  select receipt.*
    into receipt_record
    from private.live_pvp_submission_receipts receipt
   where receipt.id = receipt_id_to_validate;

  if not found then
    return;
  end if;

  select action.*
    into action_record
    from public.live_pvp_match_actions action
   where action.id = receipt_record.committed_event_id
     and action.match_id = receipt_record.match_id;

  if not found
     or action_record.actor_player_id is distinct from receipt_record.actor_player_id
     or action_record.previous_version is distinct from receipt_record.expected_version
     or (
       receipt_record.operation = 'action_submit'
       and action_record.transition_kind <> 'participant_action'
     )
     or (
       receipt_record.operation = 'resign_submit'
       and action_record.transition_kind <> 'voluntary_resignation'
     ) then
    raise exception
      'Live PvP submission receipt does not match its authoritative transition'
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_live_pvp_match_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_live_pvp_match(
    coalesce(
      to_jsonb(new) ->> 'match_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create function private.validate_live_pvp_action_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_live_pvp_action(
    coalesce(
      to_jsonb(new) ->> 'action_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create function private.validate_live_pvp_receipt_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_live_pvp_receipt(new.id);
  return null;
end;
$$;

create constraint trigger live_pvp_matches_integrity
after insert or update on public.live_pvp_matches
deferrable initially deferred
for each row
execute function private.validate_live_pvp_match_after_mutation();

create constraint trigger live_pvp_match_participants_integrity
after insert or update on public.live_pvp_match_participants
deferrable initially deferred
for each row
execute function private.validate_live_pvp_match_after_mutation();

create constraint trigger live_pvp_match_states_integrity
after insert or update on private.live_pvp_match_states
deferrable initially deferred
for each row
execute function private.validate_live_pvp_match_after_mutation();

create constraint trigger live_pvp_match_actions_integrity
after insert on public.live_pvp_match_actions
deferrable initially deferred
for each row
execute function private.validate_live_pvp_action_after_mutation();

create constraint trigger live_pvp_match_transitions_integrity
after insert on private.live_pvp_match_transitions
deferrable initially deferred
for each row
execute function private.validate_live_pvp_action_after_mutation();

create constraint trigger live_pvp_submission_receipts_integrity
after insert on private.live_pvp_submission_receipts
deferrable initially deferred
for each row
execute function private.validate_live_pvp_receipt_after_mutation();

create constraint trigger live_pvp_completion_sources_integrity
after insert on private.live_pvp_completion_sources
deferrable initially deferred
for each row
execute function private.validate_live_pvp_match_after_mutation();

create function private.validate_live_pvp_connection_access()
returns trigger
language plpgsql
as $$
declare
  ticket_record record;
  participant_exists boolean;
  current_generation bigint;
begin
  if new.ticket_id is not null then
    select ticket.*
      into ticket_record
      from private.live_pvp_connection_tickets ticket
     where ticket.id = new.ticket_id;

    if not found
       or ticket_record.match_id is distinct from new.match_id
       or ticket_record.player_id is distinct from new.player_id
       or ticket_record.role is distinct from new.role
       or ticket_record.redeemed_at is distinct from new.opened_at then
      raise exception
        'Live PvP connection access does not match its redeemed ticket'
        using errcode = '23514';
    end if;
  end if;

  select exists (
    select 1
      from public.live_pvp_match_participants participant
     where participant.match_id = new.match_id
       and participant.player_id = new.player_id
  ) into participant_exists;

  if new.role = 'participant' then
    if not participant_exists then
      raise exception
        'Participant live PvP connection access requires match membership'
        using errcode = '23514';
    end if;

    select participant.connection_generation
      into current_generation
      from public.live_pvp_match_participants participant
     where participant.match_id = new.match_id
       and participant.player_id = new.player_id;

    if new.participant_generation is distinct from current_generation then
      raise exception
        'Participant live PvP connection access requires the current generation'
        using errcode = '23514';
    end if;
  elsif participant_exists then
    raise exception
      'A live PvP participant cannot hold spectator access to the same match'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger live_pvp_connection_access_insert_guard
before insert on private.live_pvp_connection_access
for each row
execute function private.validate_live_pvp_connection_access();

create function private.prepare_live_pvp_account_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.lifecycle_status = 'active'
     and new.lifecycle_status = 'deletion_pending' then
    if exists (
      select 1
        from public.live_pvp_match_participants participant
        join public.live_pvp_matches match
          on match.id = participant.match_id
       where participant.player_id = new.id
         and match.status = 'active'
    ) then
      raise exception
        'Active live PvP matches must be finalized before account deletion can begin'
        using errcode = '23514';
    end if;

    delete from private.live_pvp_connection_access access
     where access.player_id = new.id;

    delete from private.live_pvp_connection_tickets ticket
     where ticket.player_id = new.id;
  end if;

  return new;
end;
$$;

create trigger players_live_pvp_account_deletion_guard
before update of lifecycle_status on public.players
for each row
execute function private.prepare_live_pvp_account_deletion();

comment on table public.live_pvp_matches is
  'Authoritative durable live PvP lifecycle, gameplay version, phase, actor, one-minute deadline, and terminal result.';

comment on table public.live_pvp_match_participants is
  'Exactly two live PvP participants with immutable deck snapshots, timeout strikes, outcomes, and persisted connection generations.';

comment on table public.live_pvp_match_actions is
  'Immutable spectator-safe history with one public authoritative transition for each committed live PvP gameplay version.';

comment on table private.live_pvp_connection_tickets is
  'Short-lived one-use live PvP connection-ticket digests. Raw tickets and bearer tokens are never persisted.';

comment on table private.live_pvp_connection_access is
  'Redeemed participant and spectator access records. Closed rows are retained for 24 hours before purge.';

comment on table private.live_pvp_completion_sources is
  'Exactly-once per-participant terminal live PvP progression sources. Issue #251 does not create point-award rules.';
