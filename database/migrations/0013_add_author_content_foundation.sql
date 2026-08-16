alter table public.challenge_questions
  add column explanation text;

alter table public.challenge_questions
  add constraint challenge_questions_explanation_not_blank
    check (
      explanation is null
      or btrim(explanation) <> ''
    );

create function public.prevent_published_question_explanation_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'retired')
     and new.explanation is distinct from old.explanation then
    raise exception
      'Explanation for published or retired question % is immutable; create a replacement',
      old.id
      using errcode = '55006';
  end if;

  return new;
end;
$$;

create trigger challenge_questions_explanation_immutability
before update of explanation on public.challenge_questions
for each row
execute function public.prevent_published_question_explanation_mutation();

create table public.author_content_audit (
  id uuid primary key default gen_random_uuid(),
  actor_player_id uuid not null
    references public.players (id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  occurred_at timestamptz not null default now(),

  constraint author_content_audit_entity_type_check
    check (
      entity_type in (
        'event',
        'challenge',
        'question',
        'card'
      )
    ),
  constraint author_content_audit_action_check
    check (
      action in (
        'create',
        'edit',
        'publish',
        'retire'
      )
    )
);

create index author_content_audit_entity_idx
  on public.author_content_audit (
    entity_type,
    entity_id,
    occurred_at desc,
    id
  );

create index author_content_audit_actor_idx
  on public.author_content_audit (
    actor_player_id,
    occurred_at desc,
    id
  );

create function public.validate_author_content_audit_actor()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
  actor_lifecycle_status text;
begin
  select
    role,
    lifecycle_status
  into
    actor_role,
    actor_lifecycle_status
  from public.players
  where id = new.actor_player_id;

  if actor_role is distinct from 'author'
     or actor_lifecycle_status is distinct from 'active' then
    raise exception
      'Author content audit entries require an active Author'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger author_content_audit_actor_guard
before insert on public.author_content_audit
for each row
execute function public.validate_author_content_audit_actor();

create function public.prevent_author_content_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Author content audit entries are immutable'
    using errcode = '55006';
end;
$$;

create trigger author_content_audit_immutability
before update or delete on public.author_content_audit
for each row
execute function public.prevent_author_content_audit_mutation();