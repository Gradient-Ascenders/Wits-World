alter table public.async_pvp_invitations
  drop constraint async_pvp_invitations_status_check,
  drop constraint async_pvp_invitations_lifecycle_check;

alter table public.async_pvp_invitations
  add constraint async_pvp_invitations_status_check
    check (
      status in (
        'pending',
        'accepted',
        'declined',
        'cancelled',
        'expired',
        'invalidated'
      )
    ),
  add constraint async_pvp_invitations_lifecycle_check
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
        status in ('declined', 'cancelled', 'invalidated')
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
    );

comment on constraint async_pvp_invitations_status_check
  on public.async_pvp_invitations is
  'cancelled records a challenger ending a pending invitation; declined records the recipient response; invalidated records account lifecycle termination; expired remains time-based.';

alter table private.async_pvp_submission_receipts
  drop constraint async_pvp_submission_receipts_operation_check;

alter table private.async_pvp_submission_receipts
  add constraint async_pvp_submission_receipts_operation_check
  check (
    operation in (
      'invitation_create',
      'invitation_accept',
      'invitation_decline',
      'invitation_cancel',
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
        'invitation_decline',
        'invitation_cancel'
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

create unique index async_pvp_submission_receipts_invitation_cancel_unique_idx
  on private.async_pvp_submission_receipts (invitation_id)
  where operation = 'invitation_cancel';

create or replace function private.validate_async_pvp_invitation(
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
  expected_response_receipt_count integer;
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
      where receipt.operation in (
        'invitation_accept',
        'invitation_decline',
        'invitation_cancel'
      )
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
      or (
        invitation_record.status = 'cancelled'
        and receipt.operation = 'invitation_cancel'
      )
    )::integer
    into
      creation_receipt_count,
      response_receipt_count,
      expected_response_receipt_count
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
  elsif recipient_snapshot_count <> 0 then
    raise exception
      'Unaccepted asynchronous PvP invitation % cannot retain a recipient snapshot',
      invitation_id_to_validate
      using errcode = '23514';
  end if;

  if invitation_record.status in ('accepted', 'declined', 'cancelled') then
    if response_receipt_count <> 1
       or expected_response_receipt_count <> 1 then
      raise exception
        'Responded asynchronous PvP invitation % requires its one matching response receipt',
        invitation_id_to_validate
        using errcode = '23514';
    end if;
  elsif response_receipt_count <> 0 then
    raise exception
      'Unresponded asynchronous PvP invitation % cannot have a response receipt',
      invitation_id_to_validate
      using errcode = '23514';
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
  invitation_status text;
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

  if receipt_record.operation in ('invitation_create', 'invitation_cancel') then
    select invitation.challenger_player_id, invitation.status
      into expected_actor_id, invitation_status
      from public.async_pvp_invitations invitation
     where invitation.id = receipt_record.invitation_id;
  elsif receipt_record.operation in (
    'invitation_accept',
    'invitation_decline'
  ) then
    select invitation.recipient_player_id, invitation.status
      into expected_actor_id, invitation_status
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

  if (receipt_record.operation = 'invitation_accept'
      and invitation_status is distinct from 'accepted')
     or (receipt_record.operation = 'invitation_decline'
         and invitation_status is distinct from 'declined')
     or (receipt_record.operation = 'invitation_cancel'
         and invitation_status is distinct from 'cancelled') then
    raise exception
      'Asynchronous PvP invitation receipt % does not match invitation status',
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
