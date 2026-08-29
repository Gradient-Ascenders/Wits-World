create table public.async_pvp_invitations (
  id uuid primary key default gen_random_uuid(),
  challenger_player_id uuid not null
    references public.players (id) on delete restrict,
  recipient_player_id uuid not null
    references public.players (id) on delete restrict,
  pair_player_low_id uuid generated always as (
    least(challenger_player_id, recipient_player_id)
  ) stored,
  pair_player_high_id uuid generated always as (
    greatest(challenger_player_id, recipient_player_id)
  ) stored,
  status text not null default 'pending',
  version integer not null default 0,
  match_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint async_pvp_invitations_distinct_players_check
    check (challenger_player_id <> recipient_player_id),
  constraint async_pvp_invitations_status_check
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  constraint async_pvp_invitations_version_check
    check (version >= 0),
  constraint async_pvp_invitations_expiry_check
    check (expires_at = created_at + interval '24 hours'),
  constraint async_pvp_invitations_lifecycle_check
    check (
      (
        status = 'pending'
        and responded_at is null
        and match_id is null
      )
      or
      (
        status = 'accepted'
        and responded_at is not null
        and responded_at < expires_at
        and match_id is not null
      )
      or
      (
        status = 'declined'
        and responded_at is not null
        and responded_at < expires_at
        and match_id is null
      )
      or
      (
        status = 'expired'
        and responded_at is not null
        and responded_at >= expires_at
        and match_id is null
      )
    ),
  constraint async_pvp_invitations_timestamps_check
    check (
      updated_at >= created_at
      and expires_at > created_at
      and (
        responded_at is null
        or responded_at >= created_at
      )
    ),
  constraint async_pvp_invitations_identity_challenger_unique
    unique (id, challenger_player_id),
  constraint async_pvp_invitations_identity_recipient_unique
    unique (id, recipient_player_id)
);

create unique index async_pvp_invitations_pending_pair_unique_idx
  on public.async_pvp_invitations (
    pair_player_low_id,
    pair_player_high_id
  )
  where status = 'pending';

create index async_pvp_invitations_challenger_list_idx
  on public.async_pvp_invitations (challenger_player_id, created_at desc, id desc);

create index async_pvp_invitations_recipient_list_idx
  on public.async_pvp_invitations (recipient_player_id, created_at desc, id desc);

create index async_pvp_invitations_overdue_idx
  on public.async_pvp_invitations (expires_at, id)
  where status = 'pending';

create table private.async_pvp_deck_snapshots (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.async_pvp_invitations (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  participant_role text not null,
  source_deck_id uuid not null,
  initial_creature_card_id uuid not null,
  created_at timestamptz not null default now(),

  constraint async_pvp_deck_snapshots_role_check
    check (participant_role in ('challenger', 'recipient')),
  constraint async_pvp_deck_snapshots_invitation_role_unique
    unique (invitation_id, participant_role),
  constraint async_pvp_deck_snapshots_invitation_player_unique
    unique (invitation_id, player_id),
  constraint async_pvp_deck_snapshots_identity_player_unique
    unique (id, player_id),
  constraint async_pvp_deck_snapshots_identity_invitation_player_unique
    unique (id, invitation_id, player_id)
);

revoke all on table private.async_pvp_deck_snapshots from public;

create table private.async_pvp_deck_snapshot_cards (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references private.async_pvp_deck_snapshots (id) on delete restrict,
  position smallint not null,
  battle_card_id uuid not null,
  source_owned_card_id uuid not null,
  source_card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  category text not null,
  affinity text not null,
  rarity text not null,
  card_snapshot jsonb not null,

  constraint async_pvp_deck_snapshot_cards_position_check
    check (position between 1 and 5),
  constraint async_pvp_deck_snapshot_cards_category_check
    check (category in ('creature', 'power')),
  constraint async_pvp_deck_snapshot_cards_affinity_check
    check (affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic')),
  constraint async_pvp_deck_snapshot_cards_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  constraint async_pvp_deck_snapshot_cards_snapshot_check
    check (jsonb_typeof(card_snapshot) = 'object'),
  constraint async_pvp_deck_snapshot_cards_position_unique
    unique (snapshot_id, position),
  constraint async_pvp_deck_snapshot_cards_battle_identity_unique
    unique (snapshot_id, battle_card_id),
  constraint async_pvp_deck_snapshot_cards_owned_identity_unique
    unique (snapshot_id, source_owned_card_id),
  constraint async_pvp_deck_snapshot_cards_identity_snapshot_unique
    unique (id, snapshot_id)
);

alter table private.async_pvp_deck_snapshots
  add constraint async_pvp_deck_snapshots_initial_creature_fk
  foreign key (initial_creature_card_id, id)
  references private.async_pvp_deck_snapshot_cards (id, snapshot_id)
  on delete restrict
  deferrable initially deferred;

revoke all on table private.async_pvp_deck_snapshot_cards from public;

create table public.async_pvp_matches (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.async_pvp_invitations (id) on delete restrict,
  status text not null default 'active',
  version integer not null default 0,
  current_player_id uuid,
  winner_player_id uuid,
  completion_reason text,
  decision_started_at timestamptz,
  turn_deadline timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint async_pvp_matches_status_check
    check (status in ('active', 'completed')),
  constraint async_pvp_matches_version_check
    check (version >= 0),
  constraint async_pvp_matches_completion_reason_check
    check (
      completion_reason is null
      or completion_reason in (
        'defeat',
        'turn_forfeit',
        'account_deletion_forfeit'
      )
    ),
  constraint async_pvp_matches_lifecycle_check
    check (
      (
        status = 'active'
        and current_player_id is not null
        and winner_player_id is null
        and completion_reason is null
        and decision_started_at is not null
        and turn_deadline is not null
        and completed_at is null
      )
      or
      (
        status = 'completed'
        and current_player_id is null
        and winner_player_id is not null
        and completion_reason is not null
        and decision_started_at is null
        and turn_deadline is null
        and completed_at is not null
      )
    ),
  constraint async_pvp_matches_deadline_check
    check (
      turn_deadline is null
      or turn_deadline = decision_started_at + interval '24 hours'
    ),
  constraint async_pvp_matches_timestamps_check
    check (
      started_at >= created_at
      and updated_at >= created_at
      and (
        completed_at is null
        or completed_at >= started_at
      )
    ),
  constraint async_pvp_matches_identity_version_unique
    unique (id, version)
);

alter table public.async_pvp_invitations
  add constraint async_pvp_invitations_match_fk
  foreign key (match_id)
  references public.async_pvp_matches (id)
  on delete restrict
  deferrable initially deferred;

create table public.async_pvp_match_participants (
  match_id uuid not null
    references public.async_pvp_matches (id) on delete restrict,
  player_id uuid not null
    references public.players (id) on delete restrict,
  engine_side text not null,
  deck_snapshot_id uuid not null,
  outcome text,
  created_at timestamptz not null default now(),

  primary key (match_id, player_id),
  constraint async_pvp_match_participants_side_check
    check (engine_side in ('player', 'cpu')),
  constraint async_pvp_match_participants_outcome_check
    check (outcome is null or outcome in ('win', 'loss')),
  constraint async_pvp_match_participants_side_unique
    unique (match_id, engine_side),
  constraint async_pvp_match_participants_snapshot_unique
    unique (deck_snapshot_id),
  constraint async_pvp_match_participants_snapshot_fk
    foreign key (deck_snapshot_id, player_id)
    references private.async_pvp_deck_snapshots (id, player_id)
    on delete restrict
    deferrable initially deferred
);

alter table public.async_pvp_matches
  add constraint async_pvp_matches_current_participant_fk
  foreign key (id, current_player_id)
  references public.async_pvp_match_participants (match_id, player_id)
  on delete restrict
  deferrable initially deferred;

alter table public.async_pvp_matches
  add constraint async_pvp_matches_winner_participant_fk
  foreign key (id, winner_player_id)
  references public.async_pvp_match_participants (match_id, player_id)
  on delete restrict
  deferrable initially deferred;

create index async_pvp_match_participants_player_idx
  on public.async_pvp_match_participants (player_id, match_id);

create index async_pvp_matches_active_idx
  on public.async_pvp_matches (updated_at desc, id desc)
  where status = 'active';

create index async_pvp_matches_history_idx
  on public.async_pvp_matches (completed_at desc, id desc)
  where status = 'completed';

create index async_pvp_matches_overdue_idx
  on public.async_pvp_matches (turn_deadline, id)
  where status = 'active';

create table private.async_pvp_match_states (
  match_id uuid primary key,
  version integer not null,
  battle_state jsonb not null,
  updated_at timestamptz not null default now(),

  constraint async_pvp_match_states_version_check
    check (version >= 0),
  constraint async_pvp_match_states_state_check
    check (jsonb_typeof(battle_state) = 'object'),
  constraint async_pvp_match_states_match_version_fk
    foreign key (match_id, version)
    references public.async_pvp_matches (id, version)
    on delete restrict
    deferrable initially deferred
);

revoke all on table private.async_pvp_match_states from public;

create table public.async_pvp_match_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  sequence integer not null,
  actor_player_id uuid not null,
  submission_id uuid not null,
  expected_version integer not null,
  action jsonb not null,
  public_result jsonb not null,
  created_at timestamptz not null default now(),

  constraint async_pvp_match_actions_sequence_check
    check (sequence > 0),
  constraint async_pvp_match_actions_expected_version_check
    check (expected_version >= 0),
  constraint async_pvp_match_actions_action_check
    check (jsonb_typeof(action) = 'object'),
  constraint async_pvp_match_actions_result_check
    check (jsonb_typeof(public_result) = 'object'),
  constraint async_pvp_match_actions_actor_fk
    foreign key (match_id, actor_player_id)
    references public.async_pvp_match_participants (match_id, player_id)
    on delete restrict,
  constraint async_pvp_match_actions_sequence_unique
    unique (match_id, sequence),
  constraint async_pvp_match_actions_submission_unique
    unique (match_id, actor_player_id, submission_id),
  constraint async_pvp_match_actions_identity_match_unique
    unique (id, match_id)
);

create index async_pvp_match_actions_history_idx
  on public.async_pvp_match_actions (match_id, sequence);

create table private.async_pvp_match_transitions (
  action_id uuid primary key,
  match_id uuid not null,
  state_before jsonb not null,
  state_after jsonb not null,
  authoritative_result jsonb not null,
  created_at timestamptz not null default now(),

  constraint async_pvp_match_transitions_action_fk
    foreign key (action_id, match_id)
    references public.async_pvp_match_actions (id, match_id)
    on delete restrict,
  constraint async_pvp_match_transitions_state_before_check
    check (jsonb_typeof(state_before) = 'object'),
  constraint async_pvp_match_transitions_state_after_check
    check (jsonb_typeof(state_after) = 'object'),
  constraint async_pvp_match_transitions_result_check
    check (jsonb_typeof(authoritative_result) = 'object')
);

revoke all on table private.async_pvp_match_transitions from public;

create table private.async_pvp_submission_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_player_id uuid not null
    references public.players (id) on delete restrict,
  operation text not null,
  submission_id uuid not null,
  invitation_id uuid
    references public.async_pvp_invitations (id) on delete restrict,
  match_id uuid
    references public.async_pvp_matches (id) on delete restrict,
  payload_hash text not null,
  committed_response jsonb not null,
  created_at timestamptz not null default now(),

  constraint async_pvp_submission_receipts_operation_check
    check (
      operation in (
        'invitation_create',
        'invitation_accept',
        'invitation_decline',
        'match_action'
      )
    ),
  constraint async_pvp_submission_receipts_payload_hash_check
    check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint async_pvp_submission_receipts_response_check
    check (jsonb_typeof(committed_response) = 'object'),
  constraint async_pvp_submission_receipts_resource_check
    check (
      (
        operation in (
          'invitation_create',
          'invitation_accept',
          'invitation_decline'
        )
        and invitation_id is not null
        and match_id is null
      )
      or
      (
        operation = 'match_action'
        and invitation_id is null
        and match_id is not null
      )
    ),
  constraint async_pvp_submission_receipts_actor_operation_unique
    unique (actor_player_id, operation, submission_id)
);

create index async_pvp_submission_receipts_invitation_idx
  on private.async_pvp_submission_receipts (invitation_id, actor_player_id)
  where invitation_id is not null;

create index async_pvp_submission_receipts_match_idx
  on private.async_pvp_submission_receipts (match_id, actor_player_id)
  where match_id is not null;

revoke all on table private.async_pvp_submission_receipts from public;

create function private.validate_async_pvp_deck_snapshot(
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
  initial_category text;
  expected_player_id uuid;
begin
  select snapshot.*, invitation.status as invitation_status,
         invitation.challenger_player_id,
         invitation.recipient_player_id
    into snapshot_record
    from private.async_pvp_deck_snapshots snapshot
    join public.async_pvp_invitations invitation
      on invitation.id = snapshot.invitation_id
   where snapshot.id = snapshot_id_to_validate;

  if not found then
    return;
  end if;

  expected_player_id := case snapshot_record.participant_role
    when 'challenger' then snapshot_record.challenger_player_id
    else snapshot_record.recipient_player_id
  end;

  if snapshot_record.player_id is distinct from expected_player_id then
    raise exception
      'Asynchronous PvP deck snapshot % belongs to the wrong participant',
      snapshot_id_to_validate
      using errcode = '23514';
  end if;

  if snapshot_record.participant_role = 'recipient'
     and snapshot_record.invitation_status <> 'accepted' then
    raise exception
      'Recipient deck snapshot % requires an accepted invitation',
      snapshot_id_to_validate
      using errcode = '23514';
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
    from private.async_pvp_deck_snapshot_cards card
   where card.snapshot_id = snapshot_id_to_validate;

  if card_count <> 5
     or creature_count <> 3
     or power_count <> 2
     or deck_points > 10 then
    raise exception
      'Asynchronous PvP deck snapshot % violates Basic deck rules',
      snapshot_id_to_validate
      using errcode = '23514';
  end if;

  select card.category
    into initial_category
    from private.async_pvp_deck_snapshot_cards card
   where card.id = snapshot_record.initial_creature_card_id
     and card.snapshot_id = snapshot_id_to_validate;

  if initial_category is distinct from 'creature' then
    raise exception
      'Asynchronous PvP deck snapshot % initial card must be a Creature',
      snapshot_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_async_pvp_snapshot_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_async_pvp_deck_snapshot(
    coalesce(
      to_jsonb(new) ->> 'snapshot_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );

  return null;
end;
$$;

create constraint trigger async_pvp_deck_snapshots_valid
after insert or update on private.async_pvp_deck_snapshots
deferrable initially deferred
for each row
execute function private.validate_async_pvp_snapshot_after_mutation();

create constraint trigger async_pvp_deck_snapshot_cards_valid
after insert or update on private.async_pvp_deck_snapshot_cards
deferrable initially deferred
for each row
execute function private.validate_async_pvp_snapshot_after_mutation();

create function private.prevent_async_pvp_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Asynchronous PvP deck snapshots are immutable'
    using errcode = '55006';
end;
$$;

create trigger async_pvp_deck_snapshots_immutability
before update or delete on private.async_pvp_deck_snapshots
for each row
execute function private.prevent_async_pvp_snapshot_mutation();

create trigger async_pvp_deck_snapshot_cards_immutability
before update or delete on private.async_pvp_deck_snapshot_cards
for each row
execute function private.prevent_async_pvp_snapshot_mutation();

create function public.protect_async_pvp_invitation_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Asynchronous PvP invitation % cannot be deleted',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.version <> 0 then
      raise exception
        'New asynchronous PvP invitations must begin pending at version zero'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.challenger_player_id is distinct from old.challenger_player_id
     or new.recipient_player_id is distinct from old.recipient_player_id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception
      'Asynchronous PvP invitation % identity is immutable',
      old.id
      using errcode = '55006';
  end if;

  if old.status <> 'pending' then
    raise exception
      'Terminal asynchronous PvP invitation % is immutable',
      old.id
      using errcode = '55006';
  end if;

  if new.status = 'pending'
     or new.version <> old.version + 1 then
    raise exception
      'Asynchronous PvP invitation % requires one terminal version transition',
      old.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger async_pvp_invitations_lifecycle_guard
before insert or update or delete on public.async_pvp_invitations
for each row
execute function public.protect_async_pvp_invitation_lifecycle();

create function public.protect_async_pvp_match_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Asynchronous PvP match % cannot be deleted',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.version <> 0 then
      raise exception
        'New asynchronous PvP matches must begin active at version zero'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.invitation_id is distinct from old.invitation_id
     or new.started_at is distinct from old.started_at
     or new.created_at is distinct from old.created_at then
    raise exception
      'Asynchronous PvP match % identity is immutable',
      old.id
      using errcode = '55006';
  end if;

  if old.status = 'completed' then
    raise exception
      'Completed asynchronous PvP match % is immutable',
      old.id
      using errcode = '55006';
  end if;

  if new.version <> old.version + 1 then
    raise exception
      'Asynchronous PvP match % must advance exactly one version',
      old.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger async_pvp_matches_lifecycle_guard
before insert or update or delete on public.async_pvp_matches
for each row
execute function public.protect_async_pvp_match_lifecycle();

create function public.protect_async_pvp_participant_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Asynchronous PvP match participants cannot be deleted'
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' then
    if new.match_id is distinct from old.match_id
       or new.player_id is distinct from old.player_id
       or new.engine_side is distinct from old.engine_side
       or new.deck_snapshot_id is distinct from old.deck_snapshot_id
       or new.created_at is distinct from old.created_at
       or old.outcome is not null
       or new.outcome is null then
      raise exception
        'Asynchronous PvP match participant history is immutable'
        using errcode = '55006';
    end if;
  end if;

  return new;
end;
$$;

create trigger async_pvp_match_participants_history_guard
before update or delete on public.async_pvp_match_participants
for each row
execute function public.protect_async_pvp_participant_history();

create function private.protect_async_pvp_match_state()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Asynchronous PvP match state cannot be deleted'
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' then
    if new.match_id is distinct from old.match_id
       or new.version <> old.version + 1 then
      raise exception
        'Asynchronous PvP match state must advance exactly one version'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger async_pvp_match_states_version_guard
before update or delete on private.async_pvp_match_states
for each row
execute function private.protect_async_pvp_match_state();

create function public.prevent_async_pvp_action_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Asynchronous PvP action history is immutable'
    using errcode = '55006';
end;
$$;

create trigger async_pvp_match_actions_immutability
before update or delete on public.async_pvp_match_actions
for each row
execute function public.prevent_async_pvp_action_mutation();

create function private.prevent_async_pvp_private_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Private asynchronous PvP history is immutable'
    using errcode = '55006';
end;
$$;

create trigger async_pvp_match_transitions_immutability
before update or delete on private.async_pvp_match_transitions
for each row
execute function private.prevent_async_pvp_private_history_mutation();

create trigger async_pvp_submission_receipts_immutability
before update or delete on private.async_pvp_submission_receipts
for each row
execute function private.prevent_async_pvp_private_history_mutation();

create function private.validate_async_pvp_invitation(
  invitation_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  invitation_record record;
  linked_match_invitation_id uuid;
  challenger_snapshot_count integer;
  recipient_snapshot_count integer;
  creation_receipt_count integer;
  response_receipt_count integer;
begin
  select invitation.*
    into invitation_record
    from public.async_pvp_invitations invitation
   where invitation.id = invitation_id_to_validate;

  if not found then
    return;
  end if;

  select
    count(*) filter (
      where snapshot.participant_role = 'challenger'
    )::integer,
    count(*) filter (
      where snapshot.participant_role = 'recipient'
    )::integer
    into challenger_snapshot_count, recipient_snapshot_count
    from private.async_pvp_deck_snapshots snapshot
   where snapshot.invitation_id = invitation_id_to_validate;

  if challenger_snapshot_count <> 1 then
    raise exception
      'Asynchronous PvP invitation % requires one challenger snapshot',
      invitation_id_to_validate
      using errcode = '23514';
  end if;

  select
    count(*) filter (
      where receipt.operation = 'invitation_create'
        and receipt.actor_player_id = invitation_record.challenger_player_id
    )::integer,
    count(*) filter (
      where (
        invitation_record.status = 'accepted'
        and receipt.operation = 'invitation_accept'
      )
      or (
        invitation_record.status = 'declined'
        and receipt.operation = 'invitation_decline'
      )
    )::integer
    into creation_receipt_count, response_receipt_count
    from private.async_pvp_submission_receipts receipt
   where receipt.invitation_id = invitation_id_to_validate;

  if creation_receipt_count <> 1 then
    raise exception
      'Asynchronous PvP invitation % requires one creation receipt',
      invitation_id_to_validate
      using errcode = '23514';
  end if;

  if invitation_record.status = 'accepted' then
    if recipient_snapshot_count <> 1 then
      raise exception
        'Accepted asynchronous PvP invitation % requires one recipient snapshot',
        invitation_id_to_validate
        using errcode = '23514';
    end if;

    select match.invitation_id
      into linked_match_invitation_id
      from public.async_pvp_matches match
     where match.id = invitation_record.match_id;

    if linked_match_invitation_id is distinct from invitation_id_to_validate then
      raise exception
        'Accepted asynchronous PvP invitation % has no matching battle',
        invitation_id_to_validate
        using errcode = '23514';
    end if;
  elsif invitation_record.status = 'declined'
        and response_receipt_count <> 1 then
    raise exception
      'Declined asynchronous PvP invitation % requires one response receipt',
      invitation_id_to_validate
      using errcode = '23514';
  elsif recipient_snapshot_count <> 0 then
    raise exception
      'Unaccepted asynchronous PvP invitation % cannot retain a recipient snapshot',
      invitation_id_to_validate
      using errcode = '23514';
  end if;

  if invitation_record.status = 'accepted'
     and response_receipt_count <> 1 then
    raise exception
      'Accepted asynchronous PvP invitation % requires one response receipt',
      invitation_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_async_pvp_match(
  match_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  match_record record;
  invitation_record record;
  participant_count integer;
  invitation_player_count integer;
  snapshot_count integer;
  state_count integer;
  null_outcome_count integer;
  win_count integer;
  winner_outcome text;
  terminal_action_count integer;
begin
  select match.*
    into match_record
    from public.async_pvp_matches match
   where match.id = match_id_to_validate;

  if not found then
    return;
  end if;

  select invitation.*
    into invitation_record
    from public.async_pvp_invitations invitation
   where invitation.id = match_record.invitation_id;

  if invitation_record.status is distinct from 'accepted'
     or invitation_record.match_id is distinct from match_id_to_validate then
    raise exception
      'Asynchronous PvP match % requires its accepted invitation',
      match_id_to_validate
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where participant.player_id in (
        invitation_record.challenger_player_id,
        invitation_record.recipient_player_id
      )
    )::integer,
    count(*) filter (
      where snapshot.invitation_id = match_record.invitation_id
        and snapshot.player_id = participant.player_id
    )::integer,
    count(*) filter (where participant.outcome is null)::integer,
    count(*) filter (where participant.outcome = 'win')::integer
    into
      participant_count,
      invitation_player_count,
      snapshot_count,
      null_outcome_count,
      win_count
    from public.async_pvp_match_participants participant
    join private.async_pvp_deck_snapshots snapshot
      on snapshot.id = participant.deck_snapshot_id
   where participant.match_id = match_id_to_validate;

  if participant_count <> 2
     or invitation_player_count <> 2
     or snapshot_count <> 2 then
    raise exception
      'Asynchronous PvP match % requires both invitation participants and snapshots',
      match_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into state_count
    from private.async_pvp_match_states state
   where state.match_id = match_id_to_validate
     and state.version = match_record.version;

  if state_count <> 1 then
    raise exception
      'Asynchronous PvP match % requires one current private state',
      match_id_to_validate
      using errcode = '23514';
  end if;

  if match_record.status = 'active' then
    if null_outcome_count <> 2 then
      raise exception
        'Active asynchronous PvP match % cannot have outcomes',
        match_id_to_validate
        using errcode = '23514';
    end if;
  else
    select participant.outcome
      into winner_outcome
      from public.async_pvp_match_participants participant
     where participant.match_id = match_id_to_validate
       and participant.player_id = match_record.winner_player_id;

    if null_outcome_count <> 0
       or win_count <> 1
       or winner_outcome is distinct from 'win' then
      raise exception
        'Completed asynchronous PvP match % requires one winner and one loser',
        match_id_to_validate
        using errcode = '23514';
    end if;

    select count(*)::integer
      into terminal_action_count
      from public.async_pvp_match_actions action
     where action.match_id = match_id_to_validate
       and action.sequence = match_record.version
       and action.expected_version = match_record.version - 1;

    if (
      match_record.completion_reason = 'defeat'
      and terminal_action_count <> 1
    ) or (
      match_record.completion_reason in (
        'turn_forfeit',
        'account_deletion_forfeit'
      )
      and terminal_action_count <> 0
    ) then
      raise exception
        'Asynchronous PvP match % terminal history is inconsistent',
        match_id_to_validate
        using errcode = '23514';
    end if;
  end if;
end;
$$;

create function private.validate_async_pvp_action(
  action_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  action_record record;
  match_record record;
  transition_count integer;
  receipt_count integer;
begin
  select action.*
    into action_record
    from public.async_pvp_match_actions action
   where action.id = action_id_to_validate;

  if not found then
    return;
  end if;

  if action_record.sequence <> action_record.expected_version + 1 then
    raise exception
      'Asynchronous PvP action % sequence does not match its expected version',
      action_id_to_validate
      using errcode = '23514';
  end if;

  select match.status, match.version, match.completion_reason
    into match_record
    from public.async_pvp_matches match
   where match.id = action_record.match_id;

  if match_record.version <> action_record.expected_version + 1
     or (
       match_record.status = 'completed'
       and match_record.completion_reason <> 'defeat'
     ) then
    raise exception
      'Asynchronous PvP action % does not belong to its committed version',
      action_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into transition_count
    from private.async_pvp_match_transitions transition
   where transition.action_id = action_id_to_validate
     and transition.match_id = action_record.match_id;

  if transition_count <> 1 then
    raise exception
      'Asynchronous PvP action % requires one private transition',
      action_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into receipt_count
    from private.async_pvp_submission_receipts receipt
   where receipt.operation = 'match_action'
     and receipt.match_id = action_record.match_id
     and receipt.actor_player_id = action_record.actor_player_id
     and receipt.submission_id = action_record.submission_id;

  if receipt_count <> 1 then
    raise exception
      'Asynchronous PvP action % requires one submission receipt',
      action_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_async_pvp_receipt(
  receipt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  receipt_record record;
  expected_actor_id uuid;
  participant_exists boolean;
  operation_receipt_count integer;
  action_exists boolean;
begin
  select receipt.*
    into receipt_record
    from private.async_pvp_submission_receipts receipt
   where receipt.id = receipt_id_to_validate;

  if not found then
    return;
  end if;

  if receipt_record.operation = 'invitation_create' then
    select invitation.challenger_player_id
      into expected_actor_id
      from public.async_pvp_invitations invitation
     where invitation.id = receipt_record.invitation_id;
  elsif receipt_record.operation in (
    'invitation_accept',
    'invitation_decline'
  ) then
    select invitation.recipient_player_id
      into expected_actor_id
      from public.async_pvp_invitations invitation
     where invitation.id = receipt_record.invitation_id;
  else
    select exists (
      select 1
        from public.async_pvp_match_participants participant
       where participant.match_id = receipt_record.match_id
         and participant.player_id = receipt_record.actor_player_id
    ) into participant_exists;

    if not participant_exists then
      raise exception
        'Asynchronous PvP match receipt % actor is not a participant',
        receipt_id_to_validate
        using errcode = '23514';
    end if;

    select exists (
      select 1
        from public.async_pvp_match_actions action
       where action.match_id = receipt_record.match_id
         and action.actor_player_id = receipt_record.actor_player_id
         and action.submission_id = receipt_record.submission_id
    ) into action_exists;

    if not action_exists then
      raise exception
        'Asynchronous PvP match receipt % has no matching action',
        receipt_id_to_validate
        using errcode = '23514';
    end if;

    return;
  end if;

  if expected_actor_id is distinct from receipt_record.actor_player_id then
    raise exception
      'Asynchronous PvP invitation receipt % has the wrong actor',
      receipt_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)::integer
    into operation_receipt_count
    from private.async_pvp_submission_receipts receipt
   where receipt.invitation_id = receipt_record.invitation_id
     and receipt.operation = receipt_record.operation;

  if operation_receipt_count <> 1 then
    raise exception
      'Asynchronous PvP invitation % has duplicate operation receipts',
      receipt_record.invitation_id
      using errcode = '23514';
  end if;
end;
$$;

create function private.validate_async_pvp_invitation_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_async_pvp_invitation(new.id);
  return null;
end;
$$;

create function private.validate_async_pvp_match_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_async_pvp_match(
    coalesce(
      to_jsonb(new) ->> 'match_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create function private.validate_async_pvp_action_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_async_pvp_action(
    coalesce(
      to_jsonb(new) ->> 'action_id',
      to_jsonb(new) ->> 'id'
    )::uuid
  );
  return null;
end;
$$;

create function private.validate_async_pvp_receipt_after_mutation()
returns trigger
language plpgsql
as $$
begin
  perform private.validate_async_pvp_receipt(new.id);
  return null;
end;
$$;

create constraint trigger async_pvp_invitations_integrity
after insert or update on public.async_pvp_invitations
deferrable initially deferred
for each row
execute function private.validate_async_pvp_invitation_after_mutation();

create constraint trigger async_pvp_matches_integrity
after insert or update on public.async_pvp_matches
deferrable initially deferred
for each row
execute function private.validate_async_pvp_match_after_mutation();

create constraint trigger async_pvp_match_participants_integrity
after insert or update on public.async_pvp_match_participants
deferrable initially deferred
for each row
execute function private.validate_async_pvp_match_after_mutation();

create constraint trigger async_pvp_match_states_integrity
after insert or update on private.async_pvp_match_states
deferrable initially deferred
for each row
execute function private.validate_async_pvp_match_after_mutation();

create constraint trigger async_pvp_match_actions_integrity
after insert on public.async_pvp_match_actions
deferrable initially deferred
for each row
execute function private.validate_async_pvp_action_after_mutation();

create constraint trigger async_pvp_match_transitions_integrity
after insert on private.async_pvp_match_transitions
deferrable initially deferred
for each row
execute function private.validate_async_pvp_action_after_mutation();

create constraint trigger async_pvp_submission_receipts_integrity
after insert on private.async_pvp_submission_receipts
deferrable initially deferred
for each row
execute function private.validate_async_pvp_receipt_after_mutation();

alter table public.progression_point_rules
  drop constraint progression_point_rules_source_kind_check;

alter table public.progression_point_rules
  add constraint progression_point_rules_source_kind_check
  check (
    source_kind in (
      'challenge_completion',
      'cpu_match',
      'asynchronous_pvp'
    )
  );

insert into public.progression_point_rules (
  rule_code,
  version,
  source_kind,
  outcome_key,
  points,
  is_active
) values
  (
    'async_pvp_defeat_win',
    1,
    'asynchronous_pvp',
    'defeat_win',
    25,
    true
  ),
  (
    'async_pvp_defeat_loss',
    1,
    'asynchronous_pvp',
    'defeat_loss',
    0,
    true
  ),
  (
    'async_pvp_turn_forfeit_win',
    1,
    'asynchronous_pvp',
    'turn_forfeit_win',
    25,
    true
  ),
  (
    'async_pvp_turn_forfeit_loss',
    1,
    'asynchronous_pvp',
    'turn_forfeit_loss',
    0,
    true
  ),
  (
    'async_pvp_account_deletion_forfeit_win',
    1,
    'asynchronous_pvp',
    'account_deletion_forfeit_win',
    25,
    true
  ),
  (
    'async_pvp_account_deletion_forfeit_loss',
    1,
    'asynchronous_pvp',
    'account_deletion_forfeit_loss',
    0,
    true
  );

alter table public.player_point_awards
  add column async_pvp_match_id uuid;

alter table public.player_point_awards
  add constraint player_point_awards_async_pvp_match_fk
  foreign key (async_pvp_match_id, player_id)
  references public.async_pvp_match_participants (match_id, player_id)
  on delete restrict;

alter table public.player_point_awards
  drop constraint player_point_awards_one_source_check;

alter table public.player_point_awards
  add constraint player_point_awards_one_source_check
  check (
    num_nonnulls(
      event_completion_id,
      cpu_match_id,
      async_pvp_match_id
    ) = 1
  );

create unique index player_point_awards_async_pvp_participant_unique_idx
  on public.player_point_awards (async_pvp_match_id, player_id)
  where async_pvp_match_id is not null;

create or replace function public.validate_player_point_award()
returns trigger
language plpgsql
as $$
declare
  expected_player_id uuid;
  expected_source_kind text;
  expected_outcome_key text;
  expected_points integer;
  expected_occurred_at timestamptz;
  source_status text;
begin
  if new.event_completion_id is not null then
    select
      completion.player_id,
      'challenge_completion',
      'score_' || completion.score_correct::text,
      completion.completed_at
      into
        expected_player_id,
        expected_source_kind,
        expected_outcome_key,
        expected_occurred_at
      from public.event_completions completion
     where completion.id = new.event_completion_id;
  elsif new.cpu_match_id is not null then
    select
      match.player_id,
      'cpu_match',
      case match.winner when 'player' then 'win' else 'loss' end,
      match.completed_at,
      match.status
      into
        expected_player_id,
        expected_source_kind,
        expected_outcome_key,
        expected_occurred_at,
        source_status
      from public.cpu_matches match
     where match.id = new.cpu_match_id;

    if source_status is distinct from 'completed'
       or expected_occurred_at is null then
      raise exception
        'CPU match % is not a completed progression source',
        new.cpu_match_id
        using errcode = '23514';
    end if;
  else
    select
      participant.player_id,
      'asynchronous_pvp',
      match.completion_reason || '_' || participant.outcome,
      match.completed_at,
      match.status
      into
        expected_player_id,
        expected_source_kind,
        expected_outcome_key,
        expected_occurred_at,
        source_status
      from public.async_pvp_matches match
      join public.async_pvp_match_participants participant
        on participant.match_id = match.id
     where match.id = new.async_pvp_match_id
       and participant.player_id = new.player_id;

    if source_status is distinct from 'completed'
       or expected_occurred_at is null
       or expected_outcome_key is null then
      raise exception
        'Asynchronous PvP match % is not a completed progression source',
        new.async_pvp_match_id
        using errcode = '23514';
    end if;
  end if;

  if expected_player_id is null then
    raise exception
      'Progression award source does not exist'
      using errcode = '23503';
  end if;

  select rule.points
    into expected_points
    from public.progression_point_rules rule
   where rule.rule_code = new.rule_code
     and rule.version = new.rule_version
     and rule.source_kind = expected_source_kind
     and rule.outcome_key = expected_outcome_key;

  if expected_points is null
     or new.player_id is distinct from expected_player_id
     or new.points_awarded is distinct from expected_points
     or new.occurred_at is distinct from expected_occurred_at then
    raise exception
      'Progression award does not match its authoritative source and rule'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function private.record_async_pvp_progression_award(
  match_id_to_record uuid,
  player_id_to_award uuid,
  rule_code_to_apply text,
  occurred_at_to_record timestamptz
)
returns table (
  award_id uuid,
  points_awarded integer,
  rule_code text,
  rule_version integer,
  was_created boolean
)
language plpgsql
as $$
declare
  active_rule record;
  activity_day_to_record date;
  activity_month_to_record date;
  existing_award record;
  inserted_award_id uuid;
  longest_streak_value integer;
  streak_at_last_activity_value integer;
  last_activity_day_value date;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(player_id_to_award::text, 171)
  );

  select
    award.id,
    award.points_awarded,
    award.rule_code,
    award.rule_version
    into existing_award
    from public.player_point_awards award
   where award.async_pvp_match_id = match_id_to_record
     and award.player_id = player_id_to_award;

  if found then
    return query
      select
        existing_award.id,
        existing_award.points_awarded,
        existing_award.rule_code,
        existing_award.rule_version,
        false;
    return;
  end if;

  select rule.*
    into active_rule
    from public.progression_point_rules rule
   where rule.rule_code = rule_code_to_apply
     and rule.source_kind = 'asynchronous_pvp'
     and rule.is_active = true;

  if not found then
    raise exception
      'No active asynchronous PvP progression rule exists for %',
      rule_code_to_apply
      using errcode = '23514';
  end if;

  activity_day_to_record :=
    (occurred_at_to_record at time zone 'Africa/Johannesburg')::date;
  activity_month_to_record :=
    date_trunc('month', activity_day_to_record)::date;

  insert into public.player_point_awards (
    player_id,
    rule_code,
    rule_version,
    async_pvp_match_id,
    points_awarded,
    occurred_at,
    activity_day,
    activity_month
  ) values (
    player_id_to_award,
    active_rule.rule_code,
    active_rule.version,
    match_id_to_record,
    active_rule.points,
    occurred_at_to_record,
    activity_day_to_record,
    activity_month_to_record
  )
  returning id into inserted_award_id;

  insert into public.player_activity_days (
    player_id,
    activity_day,
    completed_activity_count,
    first_award_id,
    last_award_id,
    first_activity_at,
    last_activity_at
  ) values (
    player_id_to_award,
    activity_day_to_record,
    1,
    inserted_award_id,
    inserted_award_id,
    occurred_at_to_record,
    occurred_at_to_record
  )
  on conflict (player_id, activity_day)
  do update set
    completed_activity_count =
      public.player_activity_days.completed_activity_count + 1,
    first_award_id = case
      when excluded.first_activity_at < public.player_activity_days.first_activity_at
        then excluded.first_award_id
      else public.player_activity_days.first_award_id
    end,
    last_award_id = case
      when excluded.last_activity_at >= public.player_activity_days.last_activity_at
        then excluded.last_award_id
      else public.player_activity_days.last_award_id
    end,
    first_activity_at = least(
      public.player_activity_days.first_activity_at,
      excluded.first_activity_at
    ),
    last_activity_at = greatest(
      public.player_activity_days.last_activity_at,
      excluded.last_activity_at
    );

  insert into public.player_monthly_progression (
    player_id,
    month_start,
    total_points,
    completed_activity_count
  ) values (
    player_id_to_award,
    activity_month_to_record,
    active_rule.points,
    1
  )
  on conflict (player_id, month_start)
  do update set
    total_points =
      public.player_monthly_progression.total_points + excluded.total_points,
    completed_activity_count =
      public.player_monthly_progression.completed_activity_count + 1,
    updated_at = now();

  with ordered_days as (
    select
      activity.activity_day,
      activity.activity_day
        - row_number() over (order by activity.activity_day)::integer
        as streak_group
    from public.player_activity_days activity
    where activity.player_id = player_id_to_award
  ),
  streaks as (
    select
      count(*)::integer as streak_length,
      max(ordered.activity_day) as streak_end
    from ordered_days ordered
    group by ordered.streak_group
  ),
  latest_day as (
    select max(activity.activity_day) as activity_day
    from public.player_activity_days activity
    where activity.player_id = player_id_to_award
  )
  select
    coalesce(max(streak.streak_length), 0),
    coalesce(
      max(streak.streak_length)
        filter (where streak.streak_end = latest.activity_day),
      0
    ),
    latest.activity_day
    into
      longest_streak_value,
      streak_at_last_activity_value,
      last_activity_day_value
  from streaks streak
  cross join latest_day latest
  group by latest.activity_day;

  insert into public.player_progression_state (
    player_id,
    total_points,
    streak_at_last_activity,
    longest_streak,
    last_activity_day
  ) values (
    player_id_to_award,
    active_rule.points,
    streak_at_last_activity_value,
    longest_streak_value,
    last_activity_day_value
  )
  on conflict (player_id)
  do update set
    total_points =
      public.player_progression_state.total_points + excluded.total_points,
    streak_at_last_activity = excluded.streak_at_last_activity,
    longest_streak = excluded.longest_streak,
    last_activity_day = excluded.last_activity_day,
    updated_at = now();

  with player_metrics as (
    select
      count(*) filter (
        where award.event_completion_id is not null
      )::integer as challenge_completions,
      count(*) filter (
        where completion.score_correct = 5
      )::integer as perfect_challenges,
      count(*) filter (
        where award.cpu_match_id is not null
      )::integer as cpu_matches,
      count(*) filter (
        where match.winner = 'player'
      )::integer as cpu_wins,
      longest_streak_value as longest_streak
    from public.player_point_awards award
    left join public.event_completions completion
      on completion.id = award.event_completion_id
    left join public.cpu_matches match
      on match.id = award.cpu_match_id
    where award.player_id = player_id_to_award
  )
  insert into public.player_achievement_unlocks (
    player_id,
    achievement_code,
    source_award_id,
    unlocked_at
  )
  select
    player_id_to_award,
    achievement.code,
    inserted_award_id,
    occurred_at_to_record
  from public.achievement_definitions achievement
  cross join player_metrics metrics
  where achievement.is_active = true
    and achievement.threshold <= case achievement.metric
      when 'challenge_completions' then metrics.challenge_completions
      when 'perfect_challenges' then metrics.perfect_challenges
      when 'cpu_wins' then metrics.cpu_wins
      when 'cpu_matches' then metrics.cpu_matches
      when 'longest_streak' then metrics.longest_streak
    end
  on conflict (player_id, achievement_code) do nothing;

  return query
    select
      inserted_award_id,
      active_rule.points,
      active_rule.rule_code,
      active_rule.version,
      true;
end;
$$;

create function private.record_asynchronous_pvp_completion(
  match_id_to_record uuid
)
returns table (
  award_id uuid,
  player_id uuid,
  points_awarded integer,
  rule_code text,
  rule_version integer,
  was_created boolean
)
language plpgsql
as $$
declare
  completed_match record;
  participant record;
  persisted_award record;
  participant_count integer;
begin
  select match.*
    into completed_match
    from public.async_pvp_matches match
   where match.id = match_id_to_record;

  if not found then
    raise exception
      'Asynchronous PvP match % does not exist',
      match_id_to_record
      using errcode = '23503';
  end if;

  if completed_match.status <> 'completed'
     or completed_match.completed_at is null
     or completed_match.completion_reason is null then
    raise exception
      'Asynchronous PvP match % is not completed',
      match_id_to_record
      using errcode = '23514';
  end if;

  select count(*)::integer
    into participant_count
    from public.async_pvp_match_participants match_participant
   where match_participant.match_id = match_id_to_record
     and match_participant.outcome is not null;

  if participant_count <> 2 then
    raise exception
      'Asynchronous PvP match % does not have two final outcomes',
      match_id_to_record
      using errcode = '23514';
  end if;

  for participant in
    select match_participant.player_id, match_participant.outcome
      from public.async_pvp_match_participants match_participant
     where match_participant.match_id = match_id_to_record
     order by match_participant.player_id
  loop
    select *
      into persisted_award
      from private.record_async_pvp_progression_award(
        match_id_to_record,
        participant.player_id,
        'async_pvp_' || completed_match.completion_reason || '_' ||
          participant.outcome,
        completed_match.completed_at
      );

    return query
      select
        persisted_award.award_id,
        participant.player_id,
        persisted_award.points_awarded,
        persisted_award.rule_code,
        persisted_award.rule_version,
        persisted_award.was_created;
  end loop;
end;
$$;
