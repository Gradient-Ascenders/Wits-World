-- Only a pending-deletion completion or this migration's legacy-tombstone
-- backfill may remove records that are immutable during ordinary gameplay.
create function private.allow_pending_player_purge()
returns trigger language plpgsql as $$
declare
  owner_id uuid;
  purge_mode text;
begin
  -- Trust snapshots retain their original expiry-based deletion path even
  -- after their player key has been replaced by a historical actor.
  if tg_table_name = 'trust_score_snapshots' then
    if old.purge_after <= clock_timestamp() then
      return old;
    end if;
  end if;

  purge_mode := current_setting('wits.account_deletion_purge', true);
  if purge_mode not in ('on', 'legacy') then
    raise exception 'Player history cannot be deleted outside account cleanup'
      using errcode = '55006';
  end if;

  owner_id := (to_jsonb(old) ->> 'player_id')::uuid;
  if owner_id is null and tg_table_name = 'event_completion_card_rewards' then
    select player_id into owner_id from public.event_completions
      where id = old.completion_id;
  elsif owner_id is null and tg_table_name = 'card_evolution_consumptions' then
    select player_id into owner_id from public.card_evolution_transactions
      where id = old.evolution_id;
  end if;

  perform 1 from public.players
   where id = owner_id
     and (
       (purge_mode = 'on' and lifecycle_status = 'deletion_pending'
        and deletion_request_id is not null)
       or (purge_mode = 'legacy' and lifecycle_status = 'deleted')
     );
  if not found then
    raise exception 'Player history cleanup requires a pending account deletion'
      using errcode = '55006';
  end if;
  return old;
end;
$$;

drop trigger completed_attempt_mutation_guard on public.challenge_attempts;
create trigger completed_attempt_mutation_guard
  before update on public.challenge_attempts
  for each row execute function public.prevent_finalized_challenge_record_mutation();
create trigger completed_attempt_deletion_guard
  before delete on public.challenge_attempts
  for each row execute function private.allow_pending_player_purge();

drop trigger event_completion_mutation_guard on public.event_completions;
create trigger event_completion_mutation_guard
  before update on public.event_completions
  for each row execute function public.prevent_finalized_challenge_record_mutation();
create trigger event_completion_deletion_guard
  before delete on public.event_completions
  for each row execute function private.allow_pending_player_purge();

drop trigger event_completion_card_rewards_immutability
  on public.event_completion_card_rewards;
create trigger event_completion_card_rewards_immutability
  before update on public.event_completion_card_rewards
  for each row execute function public.prevent_event_completion_card_reward_mutation();
create trigger event_completion_card_rewards_deletion_guard
  before delete on public.event_completion_card_rewards
  for each row execute function private.allow_pending_player_purge();

drop trigger coin_ledger_entries_retired_mutation_guard
  on public.coin_ledger_entries;
create trigger coin_ledger_entries_retired_mutation_guard
  before insert or update on public.coin_ledger_entries
  for each row execute function private.prevent_legacy_coin_ledger_mutation();
create trigger coin_ledger_entries_deletion_guard
  before delete on public.coin_ledger_entries
  for each row execute function private.allow_pending_player_purge();

drop trigger player_point_awards_immutability on public.player_point_awards;
create trigger player_point_awards_immutability
  before update on public.player_point_awards
  for each row execute function public.prevent_player_point_award_mutation();
create trigger player_point_awards_deletion_guard
  before delete on public.player_point_awards
  for each row execute function private.allow_pending_player_purge();

drop trigger player_achievement_unlocks_immutability
  on public.player_achievement_unlocks;
create trigger player_achievement_unlocks_immutability
  before update on public.player_achievement_unlocks
  for each row execute function public.prevent_player_achievement_unlock_mutation();
create trigger player_achievement_unlocks_deletion_guard
  before delete on public.player_achievement_unlocks
  for each row execute function private.allow_pending_player_purge();

drop trigger card_evolution_transactions_immutability
  on public.card_evolution_transactions;
create trigger card_evolution_transactions_immutability
  before update on public.card_evolution_transactions
  for each row execute function public.prevent_card_evolution_history_mutation();
create trigger card_evolution_transactions_deletion_guard
  before delete on public.card_evolution_transactions
  for each row execute function private.allow_pending_player_purge();

drop trigger card_evolution_consumptions_immutability
  on public.card_evolution_consumptions;
create trigger card_evolution_consumptions_immutability
  before update on public.card_evolution_consumptions
  for each row execute function public.prevent_card_evolution_history_mutation();
create trigger card_evolution_consumptions_deletion_guard
  before delete on public.card_evolution_consumptions
  for each row execute function private.allow_pending_player_purge();

drop trigger ranked_player_season_ratings_state_guard
  on public.ranked_player_season_ratings;
create trigger ranked_player_season_ratings_state_guard
  before insert or update on public.ranked_player_season_ratings
  for each row execute function public.protect_ranked_player_rating_state();
create trigger ranked_player_season_ratings_deletion_guard
  before delete on public.ranked_player_season_ratings
  for each row execute function private.allow_pending_player_purge();

drop trigger ranked_season_archives_immutability
  on public.ranked_season_standing_archives;
create trigger ranked_season_archives_immutability
  before update on public.ranked_season_standing_archives
  for each row execute function private.prevent_ranked_immutable_history_mutation();
create trigger ranked_season_standing_archives_deletion_guard
  before delete on public.ranked_season_standing_archives
  for each row execute function private.allow_pending_player_purge();

drop trigger trust_score_snapshots_immutability
  on private.trust_score_snapshots;
create trigger trust_score_snapshots_immutability
  before update on private.trust_score_snapshots
  for each row execute function private.prevent_trust_score_snapshot_mutation();
create trigger trust_score_snapshots_deletion_guard
  before delete on private.trust_score_snapshots
  for each row execute function private.allow_pending_player_purge();

drop trigger territory_owner_bonus_snapshots_immutability
  on private.territory_owner_bonus_snapshots;
create trigger territory_owner_bonus_snapshots_immutability
  before update on private.territory_owner_bonus_snapshots
  for each row execute function private.protect_territory_owner_bonus_snapshot();
create trigger territory_owner_bonus_snapshots_deletion_guard
  before delete on private.territory_owner_bonus_snapshots
  for each row execute function private.allow_pending_player_purge();

drop trigger territory_owner_bonus_decisions_immutability
  on private.territory_owner_bonus_decisions;
create trigger territory_owner_bonus_decisions_immutability
  before update on private.territory_owner_bonus_decisions
  for each row execute function private.prevent_territory_history_mutation();
create trigger territory_owner_bonus_decisions_deletion_guard
  before delete on private.territory_owner_bonus_decisions
  for each row execute function private.allow_pending_player_purge();

-- Preserve the existing cleanup chain for live owned state, then remove all
-- completed player-only progression in a single outer transaction.
alter function private.delete_player_owned_data(uuid, uuid)
  rename to delete_player_owned_data_before_permanent_purge;

create function private.purge_completed_player_progression(
  player_id_to_delete uuid
) returns void language plpgsql as $$
begin
  -- Consumed grants have already contributed to shared match snapshots.
  -- Those snapshots keep their historical outcome without the grant's
  -- device-time and player-owned eligibility details.
  delete from private.territory_zone_grants
   where player_id = player_id_to_delete;

  delete from private.ranked_standings_snapshots
   where viewer_player_id = player_id_to_delete;
  delete from private.ranked_standings_snapshot_rows
   where player_id = player_id_to_delete;
  delete from public.ranked_season_standing_archives
   where player_id = player_id_to_delete;

  delete from public.player_achievement_unlocks
   where player_id = player_id_to_delete;
  delete from public.player_activity_days
   where player_id = player_id_to_delete;
  delete from public.player_monthly_progression
   where player_id = player_id_to_delete;
  delete from public.player_progression_state
   where player_id = player_id_to_delete;
  delete from public.player_point_awards
   where player_id = player_id_to_delete;

  delete from public.coin_ledger_entries
   where player_id = player_id_to_delete;
  delete from public.card_evolution_consumptions
   where player_id = player_id_to_delete;
  delete from public.card_evolution_transactions
   where player_id = player_id_to_delete;

  delete from private.territory_owner_bonus_decisions
   where player_id = player_id_to_delete;
  delete from private.territory_owner_bonus_snapshots
   where player_id = player_id_to_delete;

  delete from public.event_completion_card_rewards reward
   using public.event_completions completion
   where reward.completion_id = completion.id
     and completion.player_id = player_id_to_delete;
  delete from public.event_completions
   where player_id = player_id_to_delete;
  delete from public.challenge_attempts
   where player_id = player_id_to_delete;

  delete from public.cpu_match_actions action
   using public.cpu_matches match
   where action.match_id = match.id and match.player_id = player_id_to_delete;
  delete from public.cpu_match_rounds round_record
   using public.cpu_matches match
   where round_record.match_id = match.id
     and match.player_id = player_id_to_delete;
  delete from public.cpu_match_cards card
   using public.cpu_matches match
   where card.match_id = match.id and match.player_id = player_id_to_delete;
  delete from public.cpu_matches where player_id = player_id_to_delete;

  delete from public.ranked_player_season_ratings
   where player_id = player_id_to_delete;

  -- Only cases with a moderation purpose survive. Ordinary score snapshots
  -- without a case have no post-deletion need.
  delete from private.trust_score_snapshots snapshot
   where snapshot.player_id = player_id_to_delete
     and not exists (
       select 1 from private.trust_cases trust_case
        where trust_case.player_id = player_id_to_delete
     );
end;
$$;

-- Free-form review notes and appeals may contain a name, email, or a copied
-- account UUID. Keep the structured decision/appeal trail but remove that
-- unbounded identity surface when its player account is deleted.
create or replace function private.prevent_trust_case_history_mutation()
returns trigger language plpgsql as $$
declare
  case_id_to_check uuid;
  deleted_player_id uuid;
begin
  if tg_op = 'UPDATE' then
    if current_setting('wits.account_deletion_purge', true) in ('on', 'legacy')
       and nullif(current_setting('wits.account_deletion_target', true), '') is not null then
      deleted_player_id := current_setting('wits.account_deletion_target', true)::uuid;
      if exists (
        select 1 from public.players
         where id = deleted_player_id
           and lifecycle_status in ('deletion_pending', 'deleted')
      ) and (
        exists (select 1 from private.trust_cases
                 where id = old.case_id and player_id = deleted_player_id)
        or (tg_table_name = 'trust_case_decisions'
            and to_jsonb(old) ->> 'actor_player_id' = deleted_player_id::text)
      ) then
        if tg_table_name = 'trust_case_decisions'
           and to_jsonb(new) - 'reason_note' = to_jsonb(old) - 'reason_note'
           and to_jsonb(new) -> 'reason_note' = 'null'::jsonb then
          return new;
        end if;
        if tg_table_name = 'trust_appeals'
           and to_jsonb(new) - 'appeal_text' = to_jsonb(old) - 'appeal_text'
           and to_jsonb(new) ->> 'appeal_text' = '[Redacted after account deletion]' then
          return new;
        end if;
      end if;
    end if;
    raise exception 'Trust governance history is append-only'
      using errcode = '55006';
  end if;

  case_id_to_check := (to_jsonb(old) ->> 'case_id')::uuid;
  if private.trust_case_history_delete_allowed(case_id_to_check) then
    return old;
  end if;
  raise exception 'Trust governance history may be deleted only with its eligible case'
    using errcode = '55006';
end;
$$;

create function private.redact_deleted_trust_free_text(player_id_to_delete uuid)
returns void language plpgsql as $$
begin
  perform set_config('wits.account_deletion_target', player_id_to_delete::text, true);
  update private.trust_case_decisions decision
     set reason_note = null
   where reason_note is not null
     and (actor_player_id = player_id_to_delete
       or exists (select 1 from private.trust_cases trust_case
                   where trust_case.id = decision.case_id
                     and trust_case.player_id = player_id_to_delete));
  update private.trust_appeals appeal
     set appeal_text = '[Redacted after account deletion]'
   where appeal_text <> '[Redacted after account deletion]'
     and exists (select 1 from private.trust_cases trust_case
                  where trust_case.id = appeal.case_id
                    and trust_case.player_id = player_id_to_delete);
  perform set_config('wits.account_deletion_target', '', true);
end;
$$;
revoke all on function private.redact_deleted_trust_free_text(uuid) from public;

-- Async PvP retry receipts contain a cached player-facing response, including
-- opponent Player Name. Preserve the idempotency receipt while removing the
-- deleted account's name and any copied UUID from that JSON response.
create function private.redact_deleted_async_pvp_response(
  response jsonb,
  player_id_to_delete uuid,
  deleted_player_name text
) returns jsonb language sql immutable as $$
  select case when deleted_player_name is null then
    replace(response::text, player_id_to_delete::text, 'Deleted player')::jsonb
  else
    replace(
      replace(response::text, player_id_to_delete::text, 'Deleted player'),
      to_jsonb(deleted_player_name)::text,
      to_jsonb('Deleted player'::text)::text)::jsonb
  end;
$$;
revoke all on function private.redact_deleted_async_pvp_response(jsonb, uuid, text)
  from public;

create or replace function private.prevent_async_pvp_private_history_mutation()
returns trigger language plpgsql as $$
declare
  deleted_player_id uuid;
  deleted_player_name text;
  redacted_response jsonb;
begin
  if tg_op = 'UPDATE'
     and tg_table_name = 'async_pvp_submission_receipts'
     and current_setting('wits.account_deletion_purge', true) in ('on', 'legacy')
     and nullif(current_setting('wits.account_deletion_target', true), '') is not null then
    deleted_player_id := current_setting('wits.account_deletion_target', true)::uuid;
    select player_name into deleted_player_name from public.players
     where id = deleted_player_id
       and lifecycle_status in ('deletion_pending', 'deleted');
    if found and to_jsonb(new) - 'committed_response' =
                 to_jsonb(old) - 'committed_response' then
      redacted_response := private.redact_deleted_async_pvp_response(
        old.committed_response, deleted_player_id, deleted_player_name);
      if new.committed_response = redacted_response then
        return new;
      end if;
    end if;
  end if;
  raise exception 'Private asynchronous PvP history is immutable'
    using errcode = '55006';
end;
$$;

create function private.redact_deleted_async_pvp_receipts(player_id_to_delete uuid)
returns void language plpgsql as $$
declare
  deleted_player_name text;
begin
  select player_name into deleted_player_name from public.players
   where id = player_id_to_delete
     and lifecycle_status in ('deletion_pending', 'deleted');
  if not found then
    raise exception 'PvP receipt redaction requires a deleting player'
      using errcode = '23514';
  end if;
  perform set_config('wits.account_deletion_target', player_id_to_delete::text, true);
  update private.async_pvp_submission_receipts receipt
     set committed_response = private.redact_deleted_async_pvp_response(
       receipt.committed_response, player_id_to_delete, deleted_player_name)
   where (receipt.actor_player_id = player_id_to_delete
       or exists (select 1 from public.async_pvp_invitations invitation
                   where invitation.id = receipt.invitation_id
                     and player_id_to_delete in
                       (invitation.challenger_player_id, invitation.recipient_player_id))
       or exists (select 1 from public.async_pvp_match_participants participant
                   where participant.match_id = receipt.match_id
                     and participant.player_id = player_id_to_delete))
     and (receipt.committed_response::text like '%' || player_id_to_delete::text || '%'
       or (deleted_player_name is not null
           and receipt.committed_response::text like '%'
             || to_jsonb(deleted_player_name)::text || '%'));
  perform set_config('wits.account_deletion_target', '', true);
end;
$$;
revoke all on function private.redact_deleted_async_pvp_receipts(uuid) from public;

create function private.delete_player_owned_data(
  player_id_to_delete uuid,
  deletion_request_id_to_complete uuid
) returns void language plpgsql as $$
begin
  perform 1 from public.players
   where id = player_id_to_delete
     and lifecycle_status = 'deletion_pending'
     and deletion_request_id = deletion_request_id_to_complete
   for update;
  if not found then
    raise exception 'Permanent purge requires the matching pending request'
      using errcode = '23514';
  end if;

  perform set_config('wits.account_deletion_purge', 'on', true);
  perform private.delete_player_owned_data_before_permanent_purge(
    player_id_to_delete, deletion_request_id_to_complete);
  perform private.purge_completed_player_progression(player_id_to_delete);
  perform private.redact_deleted_trust_free_text(player_id_to_delete);
  perform private.redact_deleted_async_pvp_receipts(player_id_to_delete);
  perform private.rekey_deleted_player_history_actor(player_id_to_delete);
  perform set_config('wits.account_deletion_purge', '', true);
end;
$$;

-- Preserve all existing trigger behavior for ordinary writes. For the
-- identity-only rewrite, skip only row UPDATE triggers; FK triggers still run.
do $$
declare
  guard record;
  original_definition text;
  update_definition text;
  other_definition text;
  other_events text;
  when_clause text;
  event_clause text;
  update_event text;
  event_token text;
  timing_end integer;
  on_at integer;
  execute_at integer;
  trigger_prefix text;
  trigger_suffix text;
begin
  for guard in
    select distinct trigger_record.oid,
           trigger_record.tgname,
           trigger_record.tgrelid::regclass as relation_name,
           trigger_record.tgtype
      from pg_constraint constraint_record
      join pg_trigger trigger_record
        on trigger_record.tgrelid = constraint_record.conrelid
     where constraint_record.contype = 'f'
       and constraint_record.confrelid = 'private.player_history_actors'::regclass
       and not trigger_record.tgisinternal
       and (trigger_record.tgtype & 1) <> 0
       and (trigger_record.tgtype & 16) <> 0
  loop
    original_definition := pg_get_triggerdef(guard.oid);
    on_at := strpos(original_definition, ' ON ');
    timing_end := case
      when strpos(original_definition, ' BEFORE ') > 0 then
        strpos(original_definition, ' BEFORE ') + length(' BEFORE ')
      when strpos(original_definition, ' AFTER ') > 0 then
        strpos(original_definition, ' AFTER ') + length(' AFTER ')
      else strpos(original_definition, ' INSTEAD OF ') + length(' INSTEAD OF ')
    end;
    event_clause := substr(original_definition, timing_end, on_at - timing_end);
    update_event := null;
    foreach event_token in array string_to_array(event_clause, ' OR ')
    loop
      if event_token like 'UPDATE%' then
        update_event := event_token;
      end if;
    end loop;
    if update_event is null then
      raise exception 'Actor trigger lacks an update event: %', original_definition;
    end if;
    other_events := concat_ws(' OR ',
      case when (guard.tgtype & 4) <> 0 then 'INSERT' end,
      case when (guard.tgtype & 8) <> 0 then 'DELETE' end);
    when_clause := 'private.actor_rekey_context_active()';
    update_definition := left(original_definition, timing_end - 1)
      || update_event || substr(original_definition, on_at);
    execute_at := strpos(update_definition, ' EXECUTE FUNCTION ');
    if execute_at = 0 then
      raise exception 'Unsupported actor trigger definition: %', original_definition;
    end if;
    trigger_prefix := left(update_definition, execute_at - 1);
    trigger_suffix := substr(update_definition, execute_at);
    if strpos(trigger_prefix, ' WHEN (') > 0 then
      trigger_prefix := replace(trigger_prefix, ' WHEN (',
        format(' WHEN (NOT %s AND (', when_clause)) || ')';
    else
      trigger_prefix := trigger_prefix || format(' WHEN (NOT %s)', when_clause);
    end if;
    update_definition := trigger_prefix || trigger_suffix;

    execute format('drop trigger %I on %s', guard.tgname, guard.relation_name);
    if other_events <> '' then
      update_definition := replace(update_definition,
        format('TRIGGER %I ', guard.tgname),
        format('TRIGGER %I ', left(guard.tgname, 48) || '_rekey_' ||
               substr(md5(guard.oid::text), 1, 8)));
      other_definition := left(original_definition, timing_end - 1)
        || other_events || substr(original_definition, on_at);
      execute other_definition;
    end if;
    execute update_definition;
  end loop;

  for guard in
    select distinct constraint_record.conrelid::regclass as relation_name
      from pg_constraint constraint_record
     where constraint_record.contype = 'f'
       and constraint_record.confrelid = 'private.player_history_actors'::regclass
  loop
    execute format(
      'create trigger account_deletion_actor_rekey_validator after update on %s for each row when (private.actor_rekey_context_active()) execute function private.validate_deleted_actor_rekey_update()',
      guard.relation_name);
  end loop;
end;
$$;
-- Earlier releases left anonymised player tombstones with completed
-- progression. Backfill them through the same purge and remove their physical
-- rows, without manufacturing new Auth0 identities or deletion receipts.
do $$
declare
  legacy_player_id uuid;
begin
  perform set_config('wits.account_deletion_purge', 'legacy', true);
  for legacy_player_id in
    select id from public.players where lifecycle_status = 'deleted' for update
  loop
    perform private.purge_completed_player_progression(legacy_player_id);
    perform private.redact_deleted_trust_free_text(legacy_player_id);
    perform private.redact_deleted_async_pvp_receipts(legacy_player_id);
    perform private.rekey_deleted_player_history_actor(legacy_player_id);
    delete from public.players where id = legacy_player_id;
  end loop;
  perform set_config('wits.account_deletion_purge', '', true);
end;
$$;

revoke all on function private.delete_player_owned_data_before_permanent_purge(uuid, uuid)
  from public;
revoke all on function private.purge_completed_player_progression(uuid) from public;
revoke all on function private.delete_player_owned_data(uuid, uuid) from public;
