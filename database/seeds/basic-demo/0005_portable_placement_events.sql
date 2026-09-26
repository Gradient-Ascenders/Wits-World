-- Long-lived, non-production fixtures for exercising automatic event placement.
-- These events deliberately remain outside published trails and carry an active
-- controlled-policy portability approval for placement-v1.
create temporary table basic_demo_portable_events (
  event_key text primary key,
  event_id uuid not null unique,
  title text not null,
  description text not null,
  longitude double precision not null,
  latitude double precision not null
) on commit drop;

insert into basic_demo_portable_events (
  event_key,
  event_id,
  title,
  description,
  longitude,
  latitude
)
values
  (
    'campus-clues',
    '00000000-0000-4000-8000-000000000026',
    'Placement Demo - Campus Clues',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  ),
  (
    'landmark-quiz',
    '00000000-0000-4000-8000-000000000027',
    'Placement Demo - Landmark Quiz',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  ),
  (
    'student-life',
    '00000000-0000-4000-8000-000000000028',
    'Placement Demo - Student Life',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  ),
  (
    'campus-history',
    '00000000-0000-4000-8000-000000000029',
    'Placement Demo - Campus History',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  ),
  (
    'arts-and-culture',
    '00000000-0000-4000-8000-000000000030',
    'Placement Demo - Arts and Culture',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  ),
  (
    'science-and-discovery',
    '00000000-0000-4000-8000-000000000031',
    'Placement Demo - Science and Discovery',
    'Non-production portable event for testing automatic campus placement.',
    28.03038,
    -26.19205
  );

insert into public.events (
  id,
  title,
  description,
  location,
  radius_metres,
  starts_at,
  ends_at,
  is_published,
  authoring_status,
  publication_provenance
)
select
  event_id,
  title,
  description,
  st_setsrid(st_makepoint(longitude, latitude), 4326)::geography,
  50,
  '2026-09-01T00:00:00+02:00'::timestamptz,
  '2099-12-31T23:59:59+02:00'::timestamptz,
  true,
  'published',
  'controlled_seed'
from basic_demo_portable_events
on conflict (id) do nothing;

insert into public.event_challenges (
  id,
  event_id,
  format,
  status,
  publication_provenance
)
select
  md5('wits-world-basic-demo-portable-challenge:' || event_key)::uuid,
  event_id,
  'multiple_choice',
  'draft',
  null
from basic_demo_portable_events
on conflict (id) do nothing;

create temporary table basic_demo_portable_questions (
  question_position smallint primary key,
  prompt text not null,
  explanation text not null
) on commit drop;

insert into basic_demo_portable_questions (
  question_position,
  prompt,
  explanation
)
values
  (
    1,
    'What does the blue proposed marker represent?',
    'It is the candidate site the server selected for this portable event.'
  ),
  (
    2,
    'Does creating a preview immediately change the player map?',
    'No. The preview remains private to Authors until it is reviewed and applied.'
  ),
  (
    3,
    'Who checks coverage and separation rules?',
    'The server validates the plan against the active placement policy.'
  ),
  (
    4,
    'What should an Author inspect before applying a preview?',
    'The proposed sites, zone coverage, and any policy exceptions.'
  ),
  (
    5,
    'What happens when an approved preview is applied?',
    'Its assignments become the current player-visible event placements.'
  );

insert into public.challenge_questions (
  id,
  challenge_id,
  prompt,
  difficulty,
  explanation,
  status,
  publication_provenance
)
select
  md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  md5(
    'wits-world-basic-demo-portable-challenge:' || event.event_key
  )::uuid,
  event.title || ': ' || question.prompt,
  1,
  question.explanation,
  'draft',
  null
from basic_demo_portable_events event
cross join basic_demo_portable_questions question
join public.event_challenges challenge
  on challenge.id = md5(
    'wits-world-basic-demo-portable-challenge:' || event.event_key
  )::uuid
 and challenge.status = 'draft'
on conflict (id) do nothing;

create temporary table basic_demo_portable_choices (
  question_position smallint not null
    references basic_demo_portable_questions (question_position),
  authoring_position smallint not null,
  choice_text text not null,
  is_correct boolean not null,

  primary key (question_position, authoring_position)
) on commit drop;

insert into basic_demo_portable_choices (
  question_position,
  authoring_position,
  choice_text,
  is_correct
)
values
  (1, 1, 'A server-proposed event location', true),
  (1, 2, 'A permanently authored event location', false),
  (1, 3, 'An unavailable placement site', false),
  (1, 4, 'A player location', false),
  (2, 1, 'No, not until the preview is applied', true),
  (2, 2, 'Yes, immediately', false),
  (2, 3, 'Only on mobile devices', false),
  (2, 4, 'Only after the next sign-in', false),
  (3, 1, 'The server', true),
  (3, 2, 'The map component', false),
  (3, 3, 'The browser cache', false),
  (3, 4, 'Each player device', false),
  (4, 1, 'Sites, zone coverage, and policy exceptions', true),
  (4, 2, 'Only the map zoom level', false),
  (4, 3, 'Only the event titles', false),
  (4, 4, 'Nothing; previews apply automatically', false),
  (5, 1, 'The assignments become current for players', true),
  (5, 2, 'The events are permanently deleted', false),
  (5, 3, 'The placement policy is disabled', false),
  (5, 4, 'The preview remains private forever', false);

insert into public.challenge_choices (
  id,
  question_id,
  authoring_position,
  choice_text
)
select
  md5(
    'wits-world-basic-demo-portable-choice:' || event.event_key || ':' ||
    question.question_position || ':' || choice.authoring_position
  )::uuid,
  md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  choice.authoring_position,
  choice.choice_text
from basic_demo_portable_events event
cross join basic_demo_portable_questions question
join basic_demo_portable_choices choice
  on choice.question_position = question.question_position
join public.challenge_questions stored_question
  on stored_question.id = md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid
 and stored_question.status = 'draft'
on conflict (id) do nothing;

insert into private.challenge_answer_keys (
  question_id,
  accepted_choice_id
)
select
  md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  md5(
    'wits-world-basic-demo-portable-choice:' || event.event_key || ':' ||
    question.question_position || ':' || choice.authoring_position
  )::uuid
from basic_demo_portable_events event
cross join basic_demo_portable_questions question
join basic_demo_portable_choices choice
  on choice.question_position = question.question_position
join public.challenge_questions stored_question
  on stored_question.id = md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid
 and stored_question.status = 'draft'
where choice.is_correct
on conflict (question_id) do nothing;

update public.challenge_questions question
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = question.version + 1,
    updated_at = now()
from basic_demo_portable_events event,
     basic_demo_portable_questions fixture
where question.id = md5(
    'wits-world-basic-demo-portable-question:' || event.event_key || ':' ||
    fixture.question_position
  )::uuid
  and question.status = 'draft';

update public.event_challenges challenge
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = challenge.version + 1,
    updated_at = now()
from basic_demo_portable_events event
where challenge.id = md5(
    'wits-world-basic-demo-portable-challenge:' || event.event_key
  )::uuid
  and challenge.status = 'draft';

insert into public.event_placement_portability (
  event_id,
  policy_version_id,
  approved_by_player_id,
  review_provenance,
  effective_at
)
select
  event_id,
  'placement-v1',
  null,
  'controlled_policy',
  '2026-09-01T00:00:00+02:00'::timestamptz
from basic_demo_portable_events
on conflict (event_id, policy_version_id) where ended_at is null do nothing;

do $seed_validation$
begin
  if (
    select count(*)
      from public.events event
      join public.event_challenges challenge on challenge.event_id = event.id
      join public.event_placement_portability portability
        on portability.event_id = event.id
       and portability.policy_version_id = 'placement-v1'
       and portability.ended_at is null
     where event.id in (
       select event_id from basic_demo_portable_events
     )
       and event.is_published
       and event.authoring_status = 'published'
       and challenge.status = 'published'
       and (
         select count(*)
           from public.challenge_questions question
          where question.challenge_id = challenge.id
            and question.status = 'published'
       ) >= 5
  ) <> 6 then
    raise exception 'Basic demo requires exactly six placement-ready portable events';
  end if;
end;
$seed_validation$;
