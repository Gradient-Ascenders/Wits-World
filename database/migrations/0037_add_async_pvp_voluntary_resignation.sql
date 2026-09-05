alter table public.async_pvp_matches
  drop constraint async_pvp_matches_completion_reason_check;

alter table public.async_pvp_matches
  add constraint async_pvp_matches_completion_reason_check
  check (
    completion_reason is null
    or completion_reason in (
      'defeat',
      'turn_forfeit',
      'account_deletion_forfeit',
      'voluntary_resignation'
    )
  );

alter table private.async_pvp_submission_receipts
  drop constraint async_pvp_submission_receipts_operation_check;

alter table private.async_pvp_submission_receipts
  add constraint async_pvp_submission_receipts_operation_check
  check (
    operation in (
      'invitation_create',
      'invitation_accept',
      'invitation_decline',
      'match_action',
      'match_resign'
    )
  );

alter table private.async_pvp_submission_receipts
  drop constraint async_pvp_submission_receipts_resource_check;

alter table private.async_pvp_submission_receipts
  add constraint async_pvp_submission_receipts_resource_check
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
      operation in ('match_action', 'match_resign')
      and invitation_id is null
      and match_id is not null
    )
  );

create unique index async_pvp_submission_receipts_match_resign_unique_idx
  on private.async_pvp_submission_receipts (match_id)
  where operation = 'match_resign';

create or replace function private.validate_async_pvp_match(
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
  action_count integer;
  expected_action_count integer;
  resignation_receipt_count integer;
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

  select count(*)::integer
    into action_count
    from public.async_pvp_match_actions action
   where action.match_id = match_id_to_validate;

  expected_action_count := case
    when match_record.status = 'completed'
      and match_record.completion_reason in (
        'turn_forfeit',
        'account_deletion_forfeit',
        'voluntary_resignation'
      )
      then match_record.version - 1
    else match_record.version
  end;

  if action_count <> expected_action_count then
    raise exception
      'Asynchronous PvP match % version % requires % committed actions, found %',
      match_id_to_validate,
      match_record.version,
      expected_action_count,
      action_count
      using errcode = '23514';
  end if;

  select count(*)::integer
    into resignation_receipt_count
    from private.async_pvp_submission_receipts receipt
   where receipt.match_id = match_id_to_validate
     and receipt.operation = 'match_resign';

  if match_record.completion_reason = 'voluntary_resignation' then
    if resignation_receipt_count <> 1 then
      raise exception
        'Voluntarily resigned asynchronous PvP match % requires one resignation receipt',
        match_id_to_validate
        using errcode = '23514';
    end if;
  elsif resignation_receipt_count <> 0 then
    raise exception
      'Asynchronous PvP match % cannot have a resignation receipt',
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
  end if;
end;
$$;

create or replace function private.validate_async_pvp_receipt(
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
  match_record record;
  resigning_outcome text;
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

    if receipt_record.operation = 'match_resign' then
      select match.status, match.completion_reason, match.winner_player_id
        into match_record
        from public.async_pvp_matches match
       where match.id = receipt_record.match_id;

      select participant.outcome
        into resigning_outcome
        from public.async_pvp_match_participants participant
       where participant.match_id = receipt_record.match_id
         and participant.player_id = receipt_record.actor_player_id;

      if match_record.status is distinct from 'completed'
         or match_record.completion_reason is distinct from 'voluntary_resignation'
         or match_record.winner_player_id is not distinct from receipt_record.actor_player_id
         or resigning_outcome is distinct from 'loss' then
        raise exception
          'Asynchronous PvP resignation receipt % does not match its terminal loser',
          receipt_id_to_validate
          using errcode = '23514';
      end if;

      select count(*)::integer
        into operation_receipt_count
        from private.async_pvp_submission_receipts receipt
       where receipt.match_id = receipt_record.match_id
         and receipt.operation = 'match_resign';

      if operation_receipt_count <> 1 then
        raise exception
          'Asynchronous PvP match % has duplicate resignation receipts',
          receipt_record.match_id
          using errcode = '23514';
      end if;

      return;
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

insert into public.progression_point_rules (
  rule_code,
  version,
  source_kind,
  outcome_key,
  points,
  is_active
) values
  (
    'async_pvp_voluntary_resignation_win',
    1,
    'asynchronous_pvp',
    'voluntary_resignation_win',
    25,
    true
  ),
  (
    'async_pvp_voluntary_resignation_loss',
    1,
    'asynchronous_pvp',
    'voluntary_resignation_loss',
    0,
    true
  );
