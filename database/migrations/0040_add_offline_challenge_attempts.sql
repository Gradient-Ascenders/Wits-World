alter table public.challenge_attempts
  add column attempt_origin text not null default 'online',
  add column offline_client_attempt_id uuid,
  add column offline_pack_id uuid,
  add column offline_pack_issued_at timestamptz,
  add column synced_at timestamptz,
  add constraint challenge_attempts_offline_shape check (
    (attempt_origin = 'online' and offline_client_attempt_id is null
      and offline_pack_id is null and offline_pack_issued_at is null and synced_at is null)
    or (attempt_origin = 'offline' and offline_client_attempt_id is not null
      and offline_pack_id is not null and offline_pack_issued_at is not null
      and synced_at is not null and isfinite(synced_at)
      and offline_pack_issued_at <= started_at and completed_at <= synced_at)
  );

create unique index challenge_attempts_offline_client_idx
  on public.challenge_attempts (player_id, offline_client_attempt_id)
  where offline_client_attempt_id is not null;
create unique index challenge_attempts_offline_pack_idx
  on public.challenge_attempts (offline_pack_id) where offline_pack_id is not null;

alter table public.movement_evidence
  add column evidence_origin text not null default 'online',
  add column offline_pack_id uuid,
  add constraint movement_evidence_origin_check check (
    (evidence_origin = 'online' and offline_pack_id is null)
    or (evidence_origin = 'offline' and offline_pack_id is not null)
  );
alter table public.movement_eligibility_decisions
  add column time_basis text not null default 'server_receipt',
  add constraint movement_decision_time_basis_check
    check (time_basis in ('server_receipt', 'validated_offline_claim'));

-- Published content is immutable. A signed pack establishes its published
-- version; a later retirement is allowed only with matching historical evidence.
create function public.offline_content_was_available(
  content_type text, content_id uuid, current_status text,
  current_version integer, signed_version integer, at_time timestamptz
) returns boolean language sql stable as $$
  select (current_status = 'published' and current_version = signed_version)
    or (current_status = 'retired' and current_version = signed_version + 1
      and exists (select 1 from public.author_content_audit audit
        where audit.entity_type = content_type and audit.entity_id = content_id
          and audit.action = 'retire' and audit.resulting_version = current_version
          and audit.occurred_at > at_time));
$$;

create or replace function public.validate_attempt_snapshot(attempt_id_to_validate uuid)
returns void language plpgsql as $$
declare
  attempt_record record;
  question_snapshot record;
  choice_count integer;
  item_count integer;
begin
  select attempt.*, challenge.format, player.lifecycle_status into attempt_record
    from public.challenge_attempts attempt
    join public.event_challenges challenge on challenge.id = attempt.challenge_id
    join public.players player on player.id = attempt.player_id
    where attempt.id = attempt_id_to_validate;
  if not found or attempt_record.lifecycle_status in ('deletion_pending', 'deleted') then return; end if;
  if (select count(*) from public.attempt_questions where attempt_id = attempt_id_to_validate) <> 5 then
    raise exception 'Attempt must contain exactly five question snapshots' using errcode = '23514';
  end if;
  for question_snapshot in
    select snapshot.*, source.status as source_status, source.challenge_id, source.version
      from public.attempt_questions snapshot
      join public.challenge_questions source on source.id = snapshot.source_question_id
      where snapshot.attempt_id = attempt_id_to_validate
  loop
    if question_snapshot.challenge_id <> attempt_record.challenge_id
      or (question_snapshot.source_status <> 'published' and not (
        attempt_record.attempt_origin = 'offline'
        and public.offline_content_was_available('question', question_snapshot.source_question_id,
          question_snapshot.source_status, question_snapshot.version, question_snapshot.version - 1,
          attempt_record.started_at)
      )) then
      raise exception 'Attempt contains an unavailable source question' using errcode = '23514';
    end if;
    select count(*) into choice_count from public.attempt_question_choices where attempt_question_id = question_snapshot.id;
    select count(*) into item_count from public.attempt_question_ordering_items where attempt_question_id = question_snapshot.id;
    if (attempt_record.format = 'multiple_choice' and
      (choice_count <> 4 or item_count <> 0 or question_snapshot.explanation_snapshot is not null))
      or (attempt_record.format = 'ordering' and
      (item_count <> 4 or choice_count <> 0 or question_snapshot.explanation_snapshot is null)) then
      raise exception 'Attempt snapshot does not match its challenge format' using errcode = '23514';
    end if;
  end loop;
end;
$$;
