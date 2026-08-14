create table public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  event_id uuid not null
    references public.events (id) on delete restrict,
  challenge_id uuid not null,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  time_limit_seconds integer not null,
  average_difficulty numeric(3, 2) not null,
  completed_at timestamptz,
  completion_reason text,
  score_correct smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint challenge_attempts_event_challenge_fk
    foreign key (challenge_id, event_id)
    references public.event_challenges (id, event_id)
    on delete restrict,
  constraint challenge_attempts_player_event_unique
    unique (player_id, event_id),
  constraint challenge_attempts_identity_unique
    unique (id, player_id, event_id),
  constraint challenge_attempts_status_check
    check (status in ('in_progress', 'completed')),
  constraint challenge_attempts_time_limit_check
    check (time_limit_seconds in (90, 120, 150)),
  constraint challenge_attempts_difficulty_check
    check (average_difficulty between 1 and 3),
  constraint challenge_attempts_deadline_check
    check (deadline = started_at + (time_limit_seconds * interval '1 second')),
  constraint challenge_attempts_score_check
    check (score_correct is null or score_correct between 0 and 5),
  constraint challenge_attempts_completion_state_check
    check (
      (
        status = 'in_progress'
        and completed_at is null
        and completion_reason is null
        and score_correct is null
      )
      or
      (
        status = 'completed'
        and completed_at is not null
        and completed_at >= started_at
        and completion_reason in ('answered', 'timeout')
        and score_correct is not null
      )
    ),
  constraint challenge_attempts_timestamps_valid
    check (updated_at >= created_at)
);

create index challenge_attempts_player_status_idx
  on public.challenge_attempts (player_id, status);

create index challenge_attempts_event_status_idx
  on public.challenge_attempts (event_id, status);

create table public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.challenge_attempts (id) on delete restrict,
  source_question_id uuid not null
    references public.challenge_questions (id) on delete restrict,
  position smallint not null,
  prompt_snapshot text not null,
  difficulty_snapshot smallint not null,

  constraint attempt_questions_identity_unique
    unique (id, source_question_id),
  constraint attempt_questions_position_unique
    unique (attempt_id, position),
  constraint attempt_questions_source_unique
    unique (attempt_id, source_question_id),
  constraint attempt_questions_position_check
    check (position between 1 and 5),
  constraint attempt_questions_prompt_not_blank
    check (btrim(prompt_snapshot) <> ''),
  constraint attempt_questions_difficulty_check
    check (difficulty_snapshot between 1 and 3)
);

create index attempt_questions_attempt_idx
  on public.attempt_questions (attempt_id);

create table public.attempt_question_choices (
  id uuid primary key default gen_random_uuid(),
  attempt_question_id uuid not null,
  source_question_id uuid not null,
  source_choice_id uuid not null,
  display_position smallint not null,
  choice_text_snapshot text not null,

  constraint attempt_question_choices_identity_unique
    unique (attempt_question_id, id),
  constraint attempt_question_choices_attempt_question_fk
    foreign key (attempt_question_id, source_question_id)
    references public.attempt_questions (id, source_question_id)
    on delete restrict,
  constraint attempt_question_choices_source_fk
    foreign key (source_question_id, source_choice_id)
    references public.challenge_choices (question_id, id)
    on delete restrict,
  constraint attempt_question_choices_position_unique
    unique (attempt_question_id, display_position),
  constraint attempt_question_choices_source_unique
    unique (attempt_question_id, source_choice_id),
  constraint attempt_question_choices_position_check
    check (display_position between 1 and 4),
  constraint attempt_question_choices_text_not_blank
    check (btrim(choice_text_snapshot) <> '')
);

create index attempt_question_choices_attempt_question_idx
  on public.attempt_question_choices (attempt_question_id);

create table public.attempt_answers (
  attempt_question_id uuid primary key
    references public.attempt_questions (id) on delete restrict,
  selected_choice_id uuid not null,
  answered_at timestamptz not null default now(),

  constraint attempt_answers_selected_choice_fk
    foreign key (attempt_question_id, selected_choice_id)
    references public.attempt_question_choices (attempt_question_id, id)
    on delete restrict
);

create function public.prevent_attempt_answer_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Attempt answer % is immutable after submission',
    old.attempt_question_id
    using errcode = '55006';
end;
$$;

create trigger attempt_answers_immutability
before update or delete on public.attempt_answers
for each row execute function public.prevent_attempt_answer_mutation();

create function public.prevent_finalized_attempt_snapshot_mutation()
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

    if attempt_status = 'completed' then
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

create trigger attempt_questions_finalization_guard
before insert or update or delete on public.attempt_questions
for each row execute function public.prevent_finalized_attempt_snapshot_mutation();

create trigger attempt_question_choices_finalization_guard
before insert or update or delete on public.attempt_question_choices
for each row execute function public.prevent_finalized_attempt_snapshot_mutation();

create function public.prevent_finalized_attempt_answer_insert()
returns trigger
language plpgsql
as $$
declare
  attempt_status text;
begin
  select attempts.status
    into attempt_status
    from public.attempt_questions questions
    join public.challenge_attempts attempts
      on attempts.id = questions.attempt_id
   where questions.id = new.attempt_question_id;

  if attempt_status = 'completed' then
    raise exception
      'Attempt answer % cannot be inserted after finalization',
      new.attempt_question_id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger attempt_answers_finalization_guard
before insert on public.attempt_answers
for each row execute function public.prevent_finalized_attempt_answer_insert();

create function public.validate_attempt_snapshot(
  attempt_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  attempt_challenge_id uuid;
  question_count integer;
  choice_count integer;
  source_question_status text;
  source_question_challenge_id uuid;
  question_snapshot record;
begin
  select challenge_id
    into attempt_challenge_id
    from public.challenge_attempts
   where id = attempt_id_to_validate;

  if not found then
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

create function public.attempt_snapshot_integrity_trigger()
returns trigger
language plpgsql
as $$
declare
  attempt_id_to_validate uuid;
  old_attempt_id_to_validate uuid;
begin
  if tg_table_name = 'challenge_attempts' then
    if tg_op = 'delete' then
      attempt_id_to_validate := old.id;
    else
      attempt_id_to_validate := new.id;
    end if;
  elsif tg_table_name = 'attempt_questions' then
    if tg_op = 'delete' then
      attempt_id_to_validate := old.attempt_id;
    else
      attempt_id_to_validate := new.attempt_id;
    end if;

    if tg_op = 'update'
       and new.attempt_id is distinct from old.attempt_id then
      old_attempt_id_to_validate := old.attempt_id;
    end if;
  else
    if tg_op = 'delete' then
      select attempt_id
        into attempt_id_to_validate
        from public.attempt_questions
       where id = old.attempt_question_id;
    else
      select attempt_id
        into attempt_id_to_validate
        from public.attempt_questions
       where id = new.attempt_question_id;
    end if;

    if tg_op = 'update'
       and new.attempt_question_id is distinct from old.attempt_question_id then
      select attempt_id
        into old_attempt_id_to_validate
        from public.attempt_questions
       where id = old.attempt_question_id;
    end if;
  end if;

  if old_attempt_id_to_validate is not null then
    perform public.validate_attempt_snapshot(old_attempt_id_to_validate);
  end if;

  if attempt_id_to_validate is not null then
    perform public.validate_attempt_snapshot(attempt_id_to_validate);
  end if;

  if tg_op = 'delete' then
    return old;
  end if;

  return new;
end;
$$;

create constraint trigger challenge_attempts_snapshot_integrity
after insert or update or delete on public.challenge_attempts
deferrable initially deferred
for each row execute function public.attempt_snapshot_integrity_trigger();

create constraint trigger attempt_questions_snapshot_integrity
after insert or update or delete on public.attempt_questions
deferrable initially deferred
for each row execute function public.attempt_snapshot_integrity_trigger();

create constraint trigger attempt_question_choices_snapshot_integrity
after insert or update or delete on public.attempt_question_choices
deferrable initially deferred
for each row execute function public.attempt_snapshot_integrity_trigger();
