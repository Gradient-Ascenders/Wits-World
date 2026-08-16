create function public.prevent_published_challenge_lifecycle_reversal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status in ('published', 'retired') then
    raise exception
      'Published or retired challenge % cannot be deleted',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    if new.status not in ('published', 'retired')
       or new.event_id is distinct from old.event_id
       or new.format is distinct from old.format then
      raise exception
        'Published challenge % cannot be unpublished or reassigned; retire it instead',
        old.id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'retired' then
    if new.status is distinct from old.status
       or new.event_id is distinct from old.event_id
       or new.format is distinct from old.format then
      raise exception
        'Retired challenge % cannot be republished or reassigned',
        old.id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_published_challenge_content_mutation()
returns trigger
language plpgsql
as $$
declare
  question_status text;
begin
  if tg_table_name = 'challenge_questions' then
    if tg_op = 'DELETE'
       and old.status in ('published', 'retired') then
      raise exception
        'Published or retired question % cannot be deleted',
        old.id
        using errcode = '55006';
    end if;

    if tg_op = 'UPDATE'
       and old.status in ('published', 'retired') then
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
    select status
      into question_status
      from public.challenge_questions
     where id = old.question_id;

    if question_status in ('published', 'retired') then
      raise exception
        'Choices for published or retired question % are immutable; create a replacement',
        old.question_id
        using errcode = '55006';
    end if;
  else
    select status
      into question_status
      from public.challenge_questions
     where id = old.question_id;

    if question_status in ('published', 'retired') then
      raise exception
        'Answer key for published or retired question % is immutable; create a replacement',
        old.question_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger event_challenges_lifecycle_immutability
before update or delete on public.event_challenges
for each row
execute function public.prevent_published_challenge_lifecycle_reversal();