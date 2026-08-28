create table public.event_completion_card_rewards (
  completion_id uuid not null
    references public.event_completions (id) on delete restrict,
  reward_position smallint not null,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  awarded_at timestamptz not null,

  constraint event_completion_card_rewards_primary_key
    primary key (completion_id, reward_position),
  constraint event_completion_card_rewards_position_check
    check (reward_position > 0)
);

create index event_completion_card_rewards_definition_idx
  on public.event_completion_card_rewards (card_definition_id);

insert into public.event_completion_card_rewards (
  completion_id,
  reward_position,
  card_definition_id,
  awarded_at
)
select
  owned.source_completion_id,
  row_number() over (
    partition by owned.source_completion_id
    order by owned.acquired_at, owned.id
  )::smallint,
  owned.card_definition_id,
  owned.acquired_at
from public.player_cards owned
where owned.acquisition_kind = 'event_reward'
  and owned.source_completion_id is not null;

create function public.prevent_event_completion_card_reward_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Event completion card reward records are immutable'
    using errcode = '55006';
end;
$$;

create trigger event_completion_card_rewards_immutability
before update or delete on public.event_completion_card_rewards
for each row
execute function public.prevent_event_completion_card_reward_mutation();

create function private.is_pending_account_deletion_attempt(
  attempt_id_to_check uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from public.challenge_attempts attempt
      join public.players player
        on player.id = attempt.player_id
     where attempt.id = attempt_id_to_check
       and player.lifecycle_status = 'deletion_pending'
       and player.deletion_request_id is not null
  );
$$;

create or replace function public.prevent_attempt_answer_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and exists (
       select 1
         from public.attempt_questions question
        where question.id = old.attempt_question_id
          and private.is_pending_account_deletion_attempt(
            question.attempt_id
          )
     ) then
    return old;
  end if;

  raise exception
    'Attempt answer % is immutable after submission',
    old.attempt_question_id
    using errcode = '55006';
end;
$$;

create or replace function public.prevent_finalized_attempt_snapshot_mutation()
returns trigger
language plpgsql
as $$
declare
  old_attempt_id uuid;
  new_attempt_id uuid;
  snapshot_id uuid;
  attempt_status text;
begin
  if tg_table_name = 'attempt_questions' then
    snapshot_id := coalesce(new.id, old.id);

    if tg_op <> 'INSERT' then
      old_attempt_id := old.attempt_id;
    end if;

    if tg_op <> 'DELETE' then
      new_attempt_id := new.attempt_id;
    end if;
  elsif tg_table_name = 'attempt_question_choices' then
    snapshot_id := coalesce(new.id, old.id);

    if tg_op <> 'INSERT' then
      select attempt_id
        into old_attempt_id
        from public.attempt_questions
       where id = old.attempt_question_id;
    end if;

    if tg_op <> 'DELETE' then
      select attempt_id
        into new_attempt_id
        from public.attempt_questions
       where id = new.attempt_question_id;
    end if;
  else
    raise exception
      'Unexpected table % for finalized attempt snapshot guard',
      tg_table_name
      using errcode = '0A000';
  end if;

  if old_attempt_id is not null then
    select status
      into attempt_status
      from public.challenge_attempts
     where id = old_attempt_id;

    if attempt_status = 'completed'
       and not (
         tg_op = 'DELETE'
         and private.is_pending_account_deletion_attempt(old_attempt_id)
       ) then
      raise exception
        'Attempt snapshot % is immutable after finalization',
        snapshot_id
        using errcode = '55006';
    end if;
  end if;

  if new_attempt_id is not null
     and new_attempt_id is distinct from old_attempt_id then
    select status
      into attempt_status
      from public.challenge_attempts
     where id = new_attempt_id;

    if attempt_status = 'completed' then
      raise exception
        'Attempt snapshot % is immutable after finalization',
        snapshot_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.validate_attempt_snapshot(
  attempt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  attempt_challenge_id uuid;
  player_lifecycle_status text;
  question_count integer;
  choice_count integer;
  source_question_status text;
  source_question_challenge_id uuid;
  question_snapshot record;
begin
  select attempt.challenge_id, player.lifecycle_status
    into attempt_challenge_id, player_lifecycle_status
    from public.challenge_attempts attempt
    join public.players player
      on player.id = attempt.player_id
   where attempt.id = attempt_id_to_validate;

  if not found then
    return;
  end if;

  if player_lifecycle_status in ('deletion_pending', 'deleted') then
    return;
  end if;

  select count(*)
    into question_count
    from public.attempt_questions
   where attempt_id = attempt_id_to_validate;

  if question_count <> 5 then
    raise exception
      'Attempt % must contain exactly five question snapshots',
      attempt_id_to_validate
      using errcode = '23514';
  end if;

  for question_snapshot in
    select id, source_question_id
      from public.attempt_questions
     where attempt_id = attempt_id_to_validate
  loop
    select status, challenge_id
      into source_question_status, source_question_challenge_id
      from public.challenge_questions
     where id = question_snapshot.source_question_id;

    if source_question_status is distinct from 'published'
       or source_question_challenge_id is distinct from attempt_challenge_id then
      raise exception
        'Attempt % contains a question outside its published challenge',
        attempt_id_to_validate
        using errcode = '23514';
    end if;

    select count(*)
      into choice_count
      from public.attempt_question_choices
     where attempt_question_id = question_snapshot.id;

    if choice_count <> 4 then
      raise exception
        'Attempt question % must contain exactly four choice snapshots',
        question_snapshot.id
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

-- PostgreSQL exposes TG_OP in uppercase. Preserve completed-record immutability
-- while allowing the active-attempt deletion that migration 0007 intended.
create or replace function public.prevent_finalized_challenge_record_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'challenge_attempts'
     and old.status <> 'completed' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  raise exception
    'Finalized challenge record % is immutable',
    old.id
    using errcode = '55006';
end;
$$;

create function private.delete_player_owned_data(
  player_id_to_delete uuid,
  deletion_request_id_to_complete uuid
)
returns void
language plpgsql
as $$
begin
  perform 1
    from public.players
   where id = player_id_to_delete
     and lifecycle_status = 'deletion_pending'
     and deletion_request_id = deletion_request_id_to_complete
   for update;

  if not found then
    raise exception
      'Player account deletion cleanup requires the matching pending request'
      using errcode = '23514';
  end if;

  insert into public.event_completion_card_rewards (
    completion_id,
    reward_position,
    card_definition_id,
    awarded_at
  )
  select
    owned.source_completion_id,
    row_number() over (
      partition by owned.source_completion_id
      order by owned.acquired_at, owned.id
    )::smallint,
    owned.card_definition_id,
    owned.acquired_at
  from public.player_cards owned
  where owned.player_id = player_id_to_delete
    and owned.acquisition_kind = 'event_reward'
    and owned.source_completion_id is not null
    and not exists (
      select 1
        from public.event_completion_card_rewards retained
       where retained.completion_id = owned.source_completion_id
    );

  delete from public.cpu_match_actions action
  using public.cpu_matches match
  where action.match_id = match.id
    and match.player_id = player_id_to_delete
    and match.status = 'active';

  delete from public.cpu_match_rounds round_record
  using public.cpu_matches match
  where round_record.match_id = match.id
    and match.player_id = player_id_to_delete
    and match.status = 'active';

  delete from public.cpu_match_cards match_card
  using public.cpu_matches match
  where match_card.match_id = match.id
    and match.player_id = player_id_to_delete
    and match.status = 'active';

  delete from public.cpu_matches
  where player_id = player_id_to_delete
    and status = 'active';

  delete from public.player_deck_selections
  where player_id = player_id_to_delete;

  delete from public.player_decks
  where player_id = player_id_to_delete;

  delete from public.player_cards
  where player_id = player_id_to_delete;

  delete from public.player_starter_grants
  where player_id = player_id_to_delete;

  delete from public.player_wallets
  where player_id = player_id_to_delete;

  delete from public.attempt_answers answer
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where answer.attempt_question_id = question.id
    and question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.attempt_question_choices choice
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where choice.attempt_question_id = question.id
    and question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.attempt_questions question
  using public.challenge_attempts attempt
  where question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.challenge_attempts
  where player_id = player_id_to_delete
    and status = 'in_progress';
end;
$$;
