create schema if not exists private;

create table public.event_challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.events (id) on delete restrict,
  format text not null default 'multiple_choice',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_challenges_event_identity_unique
    unique (id, event_id),
  constraint event_challenges_format_check
    check (format = 'multiple_choice'),
  constraint event_challenges_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint event_challenges_timestamps_valid
    check (updated_at >= created_at)
);

create unique index event_challenges_one_published_per_event_idx
  on public.event_challenges (event_id)
  where status = 'published';

create table public.challenge_questions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null
    references public.event_challenges (id) on delete restrict,
  prompt text not null,
  difficulty smallint not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint challenge_questions_challenge_identity_unique
    unique (id, challenge_id),
  constraint challenge_questions_prompt_not_blank
    check (btrim(prompt) <> ''),
  constraint challenge_questions_difficulty_check
    check (difficulty between 1 and 3),
  constraint challenge_questions_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint challenge_questions_timestamps_valid
    check (updated_at >= created_at)
);

create index challenge_questions_challenge_status_idx
  on public.challenge_questions (challenge_id, status);

create table public.challenge_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.challenge_questions (id) on delete restrict,
  authoring_position smallint not null,
  choice_text text not null,

  constraint challenge_choices_question_identity_unique
    unique (question_id, id),
  constraint challenge_choices_position_check
    check (authoring_position between 1 and 4),
  constraint challenge_choices_text_not_blank
    check (btrim(choice_text) <> ''),
  constraint challenge_choices_position_unique
    unique (question_id, authoring_position)
);

create index challenge_choices_question_idx
  on public.challenge_choices (question_id);

create table private.challenge_answer_keys (
  question_id uuid primary key
    references public.challenge_questions (id) on delete restrict,
  accepted_choice_id uuid not null,

  constraint challenge_answer_keys_choice_same_question_fk
    foreign key (question_id, accepted_choice_id)
    references public.challenge_choices (question_id, id)
    on delete restrict
);

revoke all on table private.challenge_answer_keys from public;

create function public.validate_published_question(
  question_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  question_status text;
  choice_count integer;
  answer_key_count integer;
begin
  select status
    into question_status
    from public.challenge_questions
   where id = question_id_to_validate;

  if question_status is distinct from 'published' then
    return;
  end if;

  select count(*)
    into choice_count
    from public.challenge_choices
   where question_id = question_id_to_validate;

  if choice_count <> 4 then
    raise exception
      'Published question % must have exactly four choices',
      question_id_to_validate
      using errcode = '23514';
  end if;

  select count(*)
    into answer_key_count
    from private.challenge_answer_keys
   where question_id = question_id_to_validate;

  if answer_key_count <> 1 then
    raise exception
      'Published question % must have exactly one answer key',
      question_id_to_validate
      using errcode = '23514';
  end if;
end;
$$;

create function public.validate_published_challenge(
  challenge_id_to_validate uuid
)
returns void
language plpgsql
as $$
declare
  challenge_status text;
  published_question_count integer;
begin
  select status
    into challenge_status
    from public.event_challenges
   where id = challenge_id_to_validate;

  if challenge_status is distinct from 'published' then
    return;
  end if;

  select count(*)
    into published_question_count
    from public.challenge_questions
   where challenge_id = challenge_id_to_validate
     and status = 'published';

  if published_question_count < 5 then
    raise exception
      'Published challenge % must have at least five published questions',
      challenge_id_to_validate
      using errcode = '23514';
  end if;

  perform public.validate_published_question(question.id)
    from public.challenge_questions question
   where question.challenge_id = challenge_id_to_validate
     and question.status = 'published';
end;
$$;

create function public.prevent_published_challenge_content_mutation()
returns trigger
language plpgsql
as $$
declare
  question_status text;
begin
  if tg_table_name = 'challenge_questions' then
    if tg_op = 'delete' and old.status in ('published', 'retired') then
      raise exception
        'Published or retired question % cannot be deleted',
        old.id
        using errcode = '55006';
    end if;

    if tg_op = 'update' and old.status in ('published', 'retired') then
      if old.status = 'retired'
         or new.status not in ('published', 'retired')
         or new.challenge_id is distinct from old.challenge_id
         or new.prompt is distinct from old.prompt
         or new.difficulty is distinct from old.difficulty then
        raise exception
          'Published or retired question % is immutable; create a replacement',
          old.id
          using errcode = '55006';
      end if;
    end if;
  elsif tg_table_name = 'challenge_choices' then
    if tg_op = 'delete' then
      select status
        into question_status
        from public.challenge_questions
       where id = old.question_id;
    else
      select status
        into question_status
        from public.challenge_questions
       where id = old.question_id;
    end if;

    if question_status in ('published', 'retired') then
      raise exception
        'Choices for published or retired question % are immutable; create a replacement',
        old.question_id
        using errcode = '55006';
    end if;
  else
    if tg_op = 'delete' then
      select status
        into question_status
        from public.challenge_questions
       where id = old.question_id;
    else
      select status
        into question_status
        from public.challenge_questions
       where id = old.question_id;
    end if;

    if question_status in ('published', 'retired') then
      raise exception
        'Answer key for published or retired question % is immutable; create a replacement',
        old.question_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'delete' then
    return old;
  end if;

  return new;
end;
$$;

create trigger challenge_questions_content_immutability
before update or delete on public.challenge_questions
for each row execute function public.prevent_published_challenge_content_mutation();

create trigger challenge_choices_content_immutability
before update or delete on public.challenge_choices
for each row execute function public.prevent_published_challenge_content_mutation();

create trigger challenge_answer_keys_content_immutability
before update or delete on private.challenge_answer_keys
for each row execute function public.prevent_published_challenge_content_mutation();

create function public.challenge_definition_integrity_trigger()
returns trigger
language plpgsql
as $$
declare
  question_id_to_validate uuid;
  challenge_id_to_validate uuid;
begin
  if tg_table_name = 'event_challenges' then
    if tg_op = 'delete' then
      challenge_id_to_validate := old.id;
    else
      challenge_id_to_validate := new.id;
    end if;
    perform public.validate_published_challenge(challenge_id_to_validate);
  elsif tg_table_name = 'challenge_questions' then
    if tg_op = 'delete' then
      question_id_to_validate := old.id;
    else
      question_id_to_validate := new.id;
    end if;
    perform public.validate_published_question(question_id_to_validate);
    select challenge_id
      into challenge_id_to_validate
      from public.challenge_questions
     where id = question_id_to_validate;
    if challenge_id_to_validate is not null then
      perform public.validate_published_challenge(challenge_id_to_validate);
    end if;
  else
    if tg_op = 'delete' then
      question_id_to_validate := old.question_id;
    else
      question_id_to_validate := new.question_id;
    end if;
    perform public.validate_published_question(question_id_to_validate);
    select challenge_id
      into challenge_id_to_validate
      from public.challenge_questions
     where id = question_id_to_validate;
    if challenge_id_to_validate is not null then
      perform public.validate_published_challenge(challenge_id_to_validate);
    end if;
  end if;

  if tg_op = 'delete' then
    return old;
  end if;

  return new;
end;
$$;

create constraint trigger event_challenges_publication_integrity
after insert or update of status on public.event_challenges
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();

create constraint trigger challenge_questions_publication_integrity
after insert or update of status on public.challenge_questions
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();

create constraint trigger challenge_choices_publication_integrity
after insert or update or delete on public.challenge_choices
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();

create constraint trigger challenge_answer_keys_publication_integrity
after insert or update or delete on private.challenge_answer_keys
deferrable initially deferred
for each row execute function public.challenge_definition_integrity_trigger();
