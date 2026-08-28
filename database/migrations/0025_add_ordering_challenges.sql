alter table public.event_challenges
  drop constraint event_challenges_format_check;

alter table public.event_challenges
  add constraint event_challenges_format_check
    check (format in ('multiple_choice', 'ordering'));

create table public.challenge_ordering_items (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.challenge_questions (id) on delete restrict,
  item_text text not null,

  constraint challenge_ordering_items_question_identity_unique
    unique (question_id, id),
  constraint challenge_ordering_items_text_not_blank
    check (btrim(item_text) <> '')
);

create index challenge_ordering_items_question_idx
  on public.challenge_ordering_items (question_id);

create table private.challenge_ordering_answer_keys (
  question_id uuid not null
    references public.challenge_questions (id) on delete restrict,
  item_id uuid not null,
  correct_position smallint not null,

  constraint challenge_ordering_answer_keys_primary
    primary key (question_id, item_id),
  constraint challenge_ordering_answer_keys_item_same_question_fk
    foreign key (question_id, item_id)
    references public.challenge_ordering_items (question_id, id)
    on delete restrict,
  constraint challenge_ordering_answer_keys_position_check
    check (correct_position between 1 and 4),
  constraint challenge_ordering_answer_keys_position_unique
    unique (question_id, correct_position)
);

revoke all on table private.challenge_ordering_answer_keys from public;

alter table public.attempt_questions
  add column explanation_snapshot text;

alter table public.attempt_questions
  add constraint attempt_questions_explanation_snapshot_not_blank
    check (
      explanation_snapshot is null
      or btrim(explanation_snapshot) <> ''
    );

create table public.attempt_question_ordering_items (
  id uuid primary key default gen_random_uuid(),
  attempt_question_id uuid not null,
  source_question_id uuid not null,
  source_item_id uuid not null,
  display_position smallint not null,
  item_text_snapshot text not null,

  constraint attempt_question_ordering_items_identity_unique
    unique (attempt_question_id, id),
  constraint attempt_question_ordering_items_attempt_question_fk
    foreign key (attempt_question_id, source_question_id)
    references public.attempt_questions (id, source_question_id)
    on delete restrict,
  constraint attempt_question_ordering_items_source_fk
    foreign key (source_question_id, source_item_id)
    references public.challenge_ordering_items (question_id, id)
    on delete restrict,
  constraint attempt_question_ordering_items_position_unique
    unique (attempt_question_id, display_position),
  constraint attempt_question_ordering_items_source_unique
    unique (attempt_question_id, source_item_id),
  constraint attempt_question_ordering_items_position_check
    check (display_position between 1 and 4),
  constraint attempt_question_ordering_items_text_not_blank
    check (btrim(item_text_snapshot) <> '')
);

create index attempt_question_ordering_items_question_idx
  on public.attempt_question_ordering_items (attempt_question_id);

create table public.attempt_ordering_answers (
  attempt_question_id uuid primary key
    references public.attempt_questions (id) on delete restrict,
  answered_at timestamptz not null default now()
);

create table public.attempt_ordering_answer_items (
  attempt_question_id uuid not null
    references public.attempt_ordering_answers (attempt_question_id)
    on delete restrict,
  selected_item_id uuid not null,
  submitted_position smallint not null,

  constraint attempt_ordering_answer_items_primary
    primary key (attempt_question_id, submitted_position),
  constraint attempt_ordering_answer_items_selected_item_fk
    foreign key (attempt_question_id, selected_item_id)
    references public.attempt_question_ordering_items (attempt_question_id, id)
    on delete restrict,
  constraint attempt_ordering_answer_items_selected_unique
    unique (attempt_question_id, selected_item_id),
  constraint attempt_ordering_answer_items_position_check
    check (submitted_position between 1 and 4)
);

create function public.validate_question_child_format()
returns trigger
language plpgsql
as $$
declare
  expected_format text;
  actual_format text;
  affected_question_id uuid;
begin
  affected_question_id := coalesce(new.question_id, old.question_id);

  if tg_table_name in ('challenge_choices', 'challenge_answer_keys') then
    expected_format := 'multiple_choice';
  elsif tg_table_name in (
    'challenge_ordering_items',
    'challenge_ordering_answer_keys'
  ) then
    expected_format := 'ordering';
  else
    raise exception
      'Unexpected question child table %',
      tg_table_name
      using errcode = '0A000';
  end if;

  select challenge.format
    into actual_format
    from public.challenge_questions question
    join public.event_challenges challenge
      on challenge.id = question.challenge_id
   where question.id = affected_question_id;

  if actual_format is distinct from expected_format then
    raise exception
      'Question % cannot contain % content',
      affected_question_id,
      expected_format
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger challenge_choices_format_guard
before insert or update on public.challenge_choices
for each row execute function public.validate_question_child_format();

create trigger challenge_answer_keys_format_guard
before insert or update on private.challenge_answer_keys
for each row execute function public.validate_question_child_format();

create trigger challenge_ordering_items_format_guard
before insert or update on public.challenge_ordering_items
for each row execute function public.validate_question_child_format();

create trigger challenge_ordering_answer_keys_format_guard
before insert or update on private.challenge_ordering_answer_keys
for each row execute function public.validate_question_child_format();

create function public.prevent_draft_challenge_format_change_with_questions()
returns trigger
language plpgsql
as $$
begin
  if new.format is distinct from old.format
     and exists (
       select 1
         from public.challenge_questions question
        where question.challenge_id = old.id
     ) then
    raise exception
      'Challenge % format cannot change after questions exist',
      old.id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger event_challenges_draft_format_guard
before update of format on public.event_challenges
for each row execute function public.prevent_draft_challenge_format_change_with_questions();

create or replace function public.validate_published_question(
  question_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  question_status text;
  challenge_format text;
  choice_count integer;
  mcq_answer_key_count integer;
  ordering_item_count integer;
  ordering_answer_key_count integer;
begin
  select question.status, challenge.format
    into question_status, challenge_format
    from public.challenge_questions question
    join public.event_challenges challenge
      on challenge.id = question.challenge_id
   where question.id = question_id_to_validate;

  if question_status is distinct from 'published' then
    return;
  end if;

  select count(*)
    into choice_count
    from public.challenge_choices
   where question_id = question_id_to_validate;

  select count(*)
    into mcq_answer_key_count
    from private.challenge_answer_keys
   where question_id = question_id_to_validate;

  select count(*)
    into ordering_item_count
    from public.challenge_ordering_items
   where question_id = question_id_to_validate;

  select count(*)
    into ordering_answer_key_count
    from private.challenge_ordering_answer_keys
   where question_id = question_id_to_validate;

  if challenge_format = 'multiple_choice' then
    if choice_count <> 4
       or mcq_answer_key_count <> 1
       or ordering_item_count <> 0
       or ordering_answer_key_count <> 0 then
      raise exception
        'Published multiple-choice question % must have four choices and one answer key only',
        question_id_to_validate
        using errcode = '23514';
    end if;
  elsif challenge_format = 'ordering' then
    if ordering_item_count <> 4
       or ordering_answer_key_count <> 4
       or choice_count <> 0
       or mcq_answer_key_count <> 0 then
      raise exception
        'Published ordering question % must have four items and a complete private order only',
        question_id_to_validate
        using errcode = '23514';
    end if;
  else
    raise exception
      'Question % has an unsupported challenge format',
      question_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create trigger challenge_ordering_items_content_immutability
before update or delete on public.challenge_ordering_items
for each row execute function public.prevent_published_challenge_content_mutation();

create trigger challenge_ordering_answer_keys_content_immutability
before update or delete on private.challenge_ordering_answer_keys
for each row execute function public.prevent_published_challenge_content_mutation();

create constraint trigger challenge_ordering_items_publication_integrity
after insert or update or delete on public.challenge_ordering_items
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();

create constraint trigger challenge_ordering_answer_keys_publication_integrity
after insert or update or delete on private.challenge_ordering_answer_keys
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();

create function public.prevent_finalized_ordering_snapshot_mutation()
returns trigger
language plpgsql
as $$
declare
  affected_attempt_id uuid;
  attempt_status text;
begin
  select question.attempt_id
    into affected_attempt_id
    from public.attempt_questions question
   where question.id = coalesce(new.attempt_question_id, old.attempt_question_id);

  select status
    into attempt_status
    from public.challenge_attempts
   where id = affected_attempt_id;

  if attempt_status = 'completed'
     and not (
       tg_op = 'DELETE'
       and private.is_pending_account_deletion_attempt(affected_attempt_id)
     ) then
    raise exception
      'Ordering snapshot cannot change after attempt finalization'
      using errcode = '55006';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger attempt_question_ordering_items_finalization_guard
before insert or update or delete on public.attempt_question_ordering_items
for each row execute function public.prevent_finalized_ordering_snapshot_mutation();

create function public.validate_ordering_attempt_answer_format()
returns trigger
language plpgsql
as $$
declare
  attempt_format text;
begin
  select challenge.format
    into attempt_format
    from public.attempt_questions question
    join public.challenge_attempts attempt
      on attempt.id = question.attempt_id
    join public.event_challenges challenge
      on challenge.id = attempt.challenge_id
   where question.id = new.attempt_question_id;

  if attempt_format is distinct from 'ordering' then
    raise exception
      'Ordering answers require an ordering challenge attempt'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger attempt_ordering_answers_format_guard
before insert on public.attempt_ordering_answers
for each row execute function public.validate_ordering_attempt_answer_format();

create trigger attempt_ordering_answers_finalization_guard
before insert on public.attempt_ordering_answers
for each row execute function public.prevent_finalized_attempt_answer_insert();

create trigger attempt_ordering_answers_immutability
before update or delete on public.attempt_ordering_answers
for each row execute function public.prevent_attempt_answer_mutation();

create trigger attempt_ordering_answer_items_immutability
before update or delete on public.attempt_ordering_answer_items
for each row execute function public.prevent_attempt_answer_mutation();

create function public.validate_ordering_attempt_answer(
  attempt_question_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  answer_exists boolean;
  answer_item_count integer;
begin
  select exists (
    select 1
      from public.attempt_ordering_answers answer
     where answer.attempt_question_id = attempt_question_id_to_validate
  ) into answer_exists;

  if not answer_exists then
    return;
  end if;

  select count(*)
    into answer_item_count
    from public.attempt_ordering_answer_items item
   where item.attempt_question_id = attempt_question_id_to_validate;

  if answer_item_count <> 4 then
    raise exception
      'Ordering answer % must contain exactly four unique attempt items',
      attempt_question_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function public.ordering_attempt_answer_integrity_trigger()
returns trigger
language plpgsql
as $$
declare
  affected_attempt_question_id uuid;
begin
  affected_attempt_question_id := coalesce(
    new.attempt_question_id,
    old.attempt_question_id
  );

  perform public.validate_ordering_attempt_answer(affected_attempt_question_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create constraint trigger attempt_ordering_answers_integrity
after insert or update or delete on public.attempt_ordering_answers
deferrable initially deferred
for each row execute function public.ordering_attempt_answer_integrity_trigger();

create constraint trigger attempt_ordering_answer_items_integrity
after insert or update or delete on public.attempt_ordering_answer_items
deferrable initially deferred
for each row execute function public.ordering_attempt_answer_integrity_trigger();

create or replace function public.validate_attempt_snapshot(
  attempt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  attempt_challenge_id uuid;
  attempt_format text;
  player_lifecycle_status text;
  question_count integer;
  choice_count integer;
  ordering_item_count integer;
  source_question_status text;
  source_question_challenge_id uuid;
  question_snapshot record;
begin
  select attempt.challenge_id, challenge.format, player.lifecycle_status
    into attempt_challenge_id, attempt_format, player_lifecycle_status
    from public.challenge_attempts attempt
    join public.event_challenges challenge
      on challenge.id = attempt.challenge_id
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
    select id, source_question_id, explanation_snapshot
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

    select count(*)
      into ordering_item_count
      from public.attempt_question_ordering_items
     where attempt_question_id = question_snapshot.id;

    if attempt_format = 'multiple_choice' then
      if choice_count <> 4
         or ordering_item_count <> 0
         or question_snapshot.explanation_snapshot is not null then
        raise exception
          'Multiple-choice attempt question % must contain four choice snapshots and no ordering fields',
          question_snapshot.id
          using errcode = '23514';
      end if;
    elsif attempt_format = 'ordering' then
      if ordering_item_count <> 4
         or choice_count <> 0
         or question_snapshot.explanation_snapshot is null then
        raise exception
          'Ordering attempt question % must contain four item snapshots and an explanation',
          question_snapshot.id
          using errcode = '23514';
      end if;
    else
      raise exception
        'Attempt % has an unsupported challenge format',
        attempt_id_to_validate
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

create constraint trigger attempt_question_ordering_items_snapshot_integrity
after insert or update or delete on public.attempt_question_ordering_items
deferrable initially deferred
for each row execute function public.attempt_snapshot_integrity_trigger();

create or replace function private.delete_player_owned_data(
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

  delete from public.attempt_ordering_answer_items answer_item
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where answer_item.attempt_question_id = question.id
    and question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.attempt_ordering_answers answer
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where answer.attempt_question_id = question.id
    and question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.attempt_answers answer
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where answer.attempt_question_id = question.id
    and question.attempt_id = attempt.id
    and attempt.player_id = player_id_to_delete;

  delete from public.attempt_question_ordering_items item
  using public.attempt_questions question,
        public.challenge_attempts attempt
  where item.attempt_question_id = question.id
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
