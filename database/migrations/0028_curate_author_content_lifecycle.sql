alter table public.events
  add column authoring_status text,
  add column version integer not null default 0,
  add column submitted_by_player_id uuid
    references public.players (id) on delete restrict,
  add column submitted_at timestamptz,
  add column reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  add column reviewed_at timestamptz,
  add column publication_provenance text;

update public.events
set authoring_status = case
      when retired_at is not null then 'retired'
      when is_published then 'published'
      else 'draft'
    end,
    publication_provenance = case
      when retired_at is not null or is_published then 'legacy'
      else null
    end;

alter table public.events
  alter column authoring_status set not null,
  alter column authoring_status set default 'draft',
  add constraint events_authoring_status_check
    check (authoring_status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint events_version_check check (version >= 0),
  add constraint events_publication_provenance_check
    check (publication_provenance is null or publication_provenance in ('legacy', 'controlled_seed', 'reviewed')),
  add constraint events_authoring_compatibility_check
    check (
      (authoring_status = 'published' and is_published and retired_at is null)
      or (authoring_status = 'retired' and not is_published and retired_at is not null)
      or (authoring_status in ('draft', 'in_review', 'approved') and not is_published and retired_at is null)
    );

alter table public.event_challenges
  drop constraint event_challenges_status_check,
  add column version integer not null default 0,
  add column submitted_by_player_id uuid
    references public.players (id) on delete restrict,
  add column submitted_at timestamptz,
  add column reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  add column reviewed_at timestamptz,
  add column publication_provenance text,
  add constraint event_challenges_status_check
    check (status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint event_challenges_version_check check (version >= 0),
  add constraint event_challenges_publication_provenance_check
    check (publication_provenance is null or publication_provenance in ('legacy', 'controlled_seed', 'reviewed'));

update public.event_challenges
set publication_provenance = 'legacy'
where status in ('published', 'retired');

alter table public.challenge_questions
  drop constraint challenge_questions_status_check,
  add column version integer not null default 0,
  add column submitted_by_player_id uuid
    references public.players (id) on delete restrict,
  add column submitted_at timestamptz,
  add column reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  add column reviewed_at timestamptz,
  add column publication_provenance text,
  add constraint challenge_questions_status_check
    check (status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint challenge_questions_version_check check (version >= 0),
  add constraint challenge_questions_publication_provenance_check
    check (publication_provenance is null or publication_provenance in ('legacy', 'controlled_seed', 'reviewed'));

update public.challenge_questions
set publication_provenance = 'legacy'
where status in ('published', 'retired');

alter table public.card_definitions
  drop constraint card_definitions_authoring_status_check,
  drop constraint card_definitions_active_status_check,
  add column version integer not null default 0,
  add column submitted_by_player_id uuid
    references public.players (id) on delete restrict,
  add column submitted_at timestamptz,
  add column reviewed_by_player_id uuid
    references public.players (id) on delete restrict,
  add column reviewed_at timestamptz,
  add column publication_provenance text,
  add constraint card_definitions_authoring_status_check
    check (authoring_status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint card_definitions_version_check check (version >= 0),
  add constraint card_definitions_publication_provenance_check
    check (publication_provenance is null or publication_provenance in ('legacy', 'controlled_seed', 'reviewed')),
  add constraint card_definitions_active_status_check
    check (
      (authoring_status = 'published' and is_active)
      or (authoring_status <> 'published' and not is_active)
    );

update public.card_definitions
set publication_provenance = 'legacy'
where authoring_status in ('published', 'retired');

alter table public.author_content_audit
  drop constraint author_content_audit_action_check,
  add column from_status text,
  add column to_status text,
  add column note text,
  add column resulting_version integer,
  add constraint author_content_audit_action_check
    check (action in ('create', 'edit', 'submit', 'approve', 'return', 'publish', 'retire')),
  add constraint author_content_audit_from_status_check
    check (from_status is null or from_status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint author_content_audit_to_status_check
    check (to_status is null or to_status in ('draft', 'in_review', 'approved', 'published', 'retired')),
  add constraint author_content_audit_note_check
    check (
      note is null
      or (note = btrim(note) and note <> '' and char_length(note) <= 1000)
    ),
  add constraint author_content_audit_version_check
    check (resulting_version is null or resulting_version >= 0),
  add constraint author_content_audit_new_row_shape_check
    check (
      resulting_version is null
      or (to_status is not null and (action <> 'return' or note is not null))
    );

create unique index author_content_audit_entity_version_uidx
  on public.author_content_audit (entity_type, entity_id, resulting_version)
  where resulting_version is not null;

create index author_content_review_queue_events_idx
  on public.events (submitted_at, id) where authoring_status = 'in_review';
create index author_content_review_queue_challenges_idx
  on public.event_challenges (submitted_at, id) where status = 'in_review';
create index author_content_review_queue_questions_idx
  on public.challenge_questions (submitted_at, id) where status = 'in_review';
create index author_content_review_queue_cards_idx
  on public.card_definitions (submitted_at, id) where authoring_status = 'in_review';

create function public.validate_curated_authoring_metadata(
  lifecycle_status text,
  submitted_by uuid,
  submission_time timestamptz,
  reviewed_by uuid,
  review_time timestamptz,
  provenance text
)
returns boolean
language sql
immutable
as $$
  select
    (submitted_by is null) = (submission_time is null)
    and (reviewed_by is null) = (review_time is null)
    and (
      reviewed_by is null
      or (submitted_by is not null and reviewed_by <> submitted_by)
    )
    and case lifecycle_status
      when 'draft' then submitted_by is null and reviewed_by is null and provenance is null
      when 'in_review' then submitted_by is not null and reviewed_by is null and provenance is null
      when 'approved' then submitted_by is not null and reviewed_by is not null and provenance is null
      when 'published' then provenance is not null and (
        provenance in ('legacy', 'controlled_seed')
        or (provenance = 'reviewed' and submitted_by is not null and reviewed_by is not null)
      )
      when 'retired' then provenance is not null
      else false
    end;
$$;

alter table public.events add constraint events_authoring_metadata_check
  check (public.validate_curated_authoring_metadata(authoring_status, submitted_by_player_id, submitted_at, reviewed_by_player_id, reviewed_at, publication_provenance));
alter table public.event_challenges add constraint event_challenges_authoring_metadata_check
  check (public.validate_curated_authoring_metadata(status, submitted_by_player_id, submitted_at, reviewed_by_player_id, reviewed_at, publication_provenance));
alter table public.challenge_questions add constraint challenge_questions_authoring_metadata_check
  check (public.validate_curated_authoring_metadata(status, submitted_by_player_id, submitted_at, reviewed_by_player_id, reviewed_at, publication_provenance));
alter table public.card_definitions add constraint card_definitions_authoring_metadata_check
  check (public.validate_curated_authoring_metadata(authoring_status, submitted_by_player_id, submitted_at, reviewed_by_player_id, reviewed_at, publication_provenance));

create function public.guard_curated_authoring_transition()
returns trigger
language plpgsql
as $$
declare
  old_status text;
  new_status text;
  valid_transition boolean;
begin
  if tg_table_name in ('events', 'card_definitions') then
    old_status := old.authoring_status;
    new_status := new.authoring_status;
  else
    old_status := old.status;
    new_status := new.status;
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Author content version must increment exactly once' using errcode = '40001';
  end if;

  valid_transition := old_status = new_status
    or (old_status = 'draft' and new_status = 'in_review')
    or (old_status = 'in_review' and new_status in ('approved', 'draft'))
    or (old_status = 'approved' and new_status in ('published', 'draft'))
    or (old_status = 'published' and new_status = 'retired')
    or (
      old_status = 'draft'
      and new_status = 'published'
      and new.publication_provenance = 'controlled_seed'
    );

  if not valid_transition then
    raise exception 'Invalid Author content transition from % to %', old_status, new_status
      using errcode = '55006';
  end if;

  if old_status <> 'draft' and old_status = new_status then
    raise exception 'Only draft Author content can be edited' using errcode = '55006';
  end if;

  if new_status in ('approved', 'published')
     and new.reviewed_by_player_id = new.submitted_by_player_id then
    raise exception 'An Author cannot review their own latest submission' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger events_curated_authoring_guard
before update on public.events
for each row execute function public.guard_curated_authoring_transition();
create trigger event_challenges_curated_authoring_guard
before update on public.event_challenges
for each row execute function public.guard_curated_authoring_transition();
create trigger challenge_questions_curated_authoring_guard
before update on public.challenge_questions
for each row execute function public.guard_curated_authoring_transition();
create trigger card_definitions_curated_authoring_guard
before update on public.card_definitions
for each row execute function public.guard_curated_authoring_transition();

create or replace function public.protect_event_authoring_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if old.authoring_status <> 'draft' and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or not st_equals(new.location::geometry, old.location::geometry)
    or new.radius_metres is distinct from old.radius_metres
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
  ) then
    raise exception 'Non-draft event % content is immutable', old.id
      using errcode = '55006';
  end if;

  if new.is_published and not old.is_published then
    perform public.validate_event_publication(old.id);
  end if;

  return new;
end;
$$;

create or replace function public.prevent_published_challenge_lifecycle_reversal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status <> 'draft' then
    raise exception 'Non-draft challenge % cannot be deleted', old.id
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' and (
    new.event_id is distinct from old.event_id
    or new.format is distinct from old.format
  ) then
    raise exception 'Non-draft challenge % content is immutable', old.id
      using errcode = '55006';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_published_question_explanation_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' and new.explanation is distinct from old.explanation then
    raise exception 'Explanation for non-draft question % is immutable', old.id
      using errcode = '55006';
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
  question_id_to_check uuid;
begin
  if tg_table_name = 'challenge_questions' then
    if tg_op = 'DELETE' and old.status <> 'draft' then
      raise exception 'Non-draft question % cannot be deleted', old.id using errcode = '55006';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'draft' and (
      new.challenge_id is distinct from old.challenge_id
      or new.prompt is distinct from old.prompt
      or new.difficulty is distinct from old.difficulty
    ) then
      raise exception 'Non-draft question % content is immutable', old.id using errcode = '55006';
    end if;
  else
    question_id_to_check := case when tg_op = 'DELETE' then old.question_id else new.question_id end;
    select status into question_status from public.challenge_questions where id = question_id_to_check;
    if question_status <> 'draft' then
      raise exception 'Nested content for non-draft question % is immutable', question_id_to_check
        using errcode = '55006';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger challenge_choices_content_immutability on public.challenge_choices;
create trigger challenge_choices_content_immutability
before insert or update or delete on public.challenge_choices
for each row execute function public.prevent_published_challenge_content_mutation();
drop trigger challenge_answer_keys_content_immutability on private.challenge_answer_keys;
create trigger challenge_answer_keys_content_immutability
before insert or update or delete on private.challenge_answer_keys
for each row execute function public.prevent_published_challenge_content_mutation();
drop trigger challenge_ordering_items_content_immutability on public.challenge_ordering_items;
create trigger challenge_ordering_items_content_immutability
before insert or update or delete on public.challenge_ordering_items
for each row execute function public.prevent_published_challenge_content_mutation();
drop trigger challenge_ordering_answer_keys_content_immutability on private.challenge_ordering_answer_keys;
create trigger challenge_ordering_answer_keys_content_immutability
before insert or update or delete on private.challenge_ordering_answer_keys
for each row execute function public.prevent_published_challenge_content_mutation();

create or replace function public.prevent_published_card_content_mutation()
returns trigger
language plpgsql
as $$
declare
  card_status text;
  card_id uuid;
begin
  if tg_table_name = 'card_definitions' then
    if old.authoring_status <> 'draft' and (
      new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.affinity is distinct from old.affinity
      or new.rarity is distinct from old.rarity
      or new.hp is distinct from old.hp
      or new.power is distinct from old.power
      or new.description is distinct from old.description
      or new.image_url is distinct from old.image_url
    ) then
      raise exception 'Non-draft card definition % content is immutable', old.id using errcode = '55006';
    end if;
    return new;
  end if;
  card_id := case when tg_op = 'DELETE' then old.card_definition_id else new.card_definition_id end;
  select authoring_status into card_status from public.card_definitions where id = card_id;
  if card_status <> 'draft' then
    raise exception 'Moves and effects for non-draft card definition % are immutable', card_id
      using errcode = '55006';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
