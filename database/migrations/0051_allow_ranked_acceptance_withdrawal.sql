-- A player may cancel while a proposal still awaits the opponent. The final
-- decision becomes a decline and receives the same cooldown as any decline.
create or replace function private.protect_ranked_proposal_participant()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ranked proposal participation is immutable history'
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' then
    if new.proposal_id is distinct from old.proposal_id
       or new.season_id is distinct from old.season_id
       or new.player_id is distinct from old.player_id
       or new.queue_entry_id is distinct from old.queue_entry_id
       or new.created_at is distinct from old.created_at
       or new.acceptance_status = 'pending' then
      raise exception 'Ranked proposal response identity is immutable'
        using errcode = '55006';
    end if;

    if old.acceptance_status = 'pending' then
      return new;
    end if;

    if old.acceptance_status = 'accepted'
       and new.acceptance_status = 'declined'
       and exists (
         select 1 from private.ranked_matchmaking_proposals proposal
          where proposal.id = old.proposal_id
            and proposal.status = 'awaiting_acceptance'
       ) then
      return new;
    end if;

    raise exception 'Resolved ranked proposal responses are immutable'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

comment on function private.protect_ranked_proposal_participant() is
  'Proposal responses are final except that an accepted player may withdraw before the proposal resolves.';
