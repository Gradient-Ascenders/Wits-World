-- Long-lived, non-production fixtures for exercising the real trail,
-- location-eligibility, challenge, and reward journey in local environments.
create temporary table basic_demo_trail_events (
  event_key text primary key,
  event_id uuid not null unique,
  title text not null,
  description text not null,
  longitude double precision not null,
  latitude double precision not null,
  trail_position smallint not null unique
) on commit drop;

insert into basic_demo_trail_events (
  event_key,
  event_id,
  title,
  description,
  longitude,
  latitude,
  trail_position
)
values
  (
    'great-hall',
    '00000000-0000-4000-8000-000000000023',
    'Trail Demo - Great Hall',
    'The first non-production stop on the Campus Highlights Trail.',
    28.03038,
    -26.19205,
    1
  ),
  (
    'library-lawns',
    '00000000-0000-4000-8000-000000000024',
    'Trail Demo - Library Lawns',
    'The second non-production stop, close enough to test nearby discovery.',
    28.03120,
    -26.19140,
    2
  ),
  (
    'senate-house',
    '00000000-0000-4000-8000-000000000025',
    'Trail Demo - Senate House',
    'The final non-production stop on the Campus Highlights Trail.',
    28.03076,
    -26.19083,
    3
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
  75,
  '2026-09-01T00:00:00+02:00'::timestamptz,
  '2099-12-31T23:59:59+02:00'::timestamptz,
  true,
  'published',
  'controlled_seed'
from basic_demo_trail_events
on conflict (id) do nothing;

insert into public.event_challenges (
  id,
  event_id,
  format,
  status,
  publication_provenance
)
select
  md5('wits-world-basic-demo-trail-challenge:' || event_key)::uuid,
  event_id,
  'multiple_choice',
  'draft',
  null
from basic_demo_trail_events
on conflict (id) do nothing;

create temporary table basic_demo_trail_questions (
  question_position smallint primary key,
  prompt text not null,
  explanation text not null
) on commit drop;

insert into basic_demo_trail_questions (
  question_position,
  prompt,
  explanation
)
values
  (
    1,
    'Which label identifies this as test-only trail content?',
    'Every fixture in this trail uses the Trail Demo label.'
  ),
  (
    2,
    'How should you move to the next stop in this mock trail?',
    'Use the ordered trail list; this fixture does not provide route navigation.'
  ),
  (
    3,
    'Who decides whether this event is reachable?',
    'The API evaluates the reported location and remains authoritative.'
  ),
  (
    4,
    'What happens after completing the current trail stop?',
    'The server-derived trail progress makes the next ordered stop current.'
  ),
  (
    5,
    'Can the nearby list be used without selecting a map marker?',
    'The nearby event list is the accessible map-independent discovery path.'
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
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  md5(
    'wits-world-basic-demo-trail-challenge:' || event.event_key
  )::uuid,
  event.title || ': ' || question.prompt,
  1,
  question.explanation,
  'draft',
  null
from basic_demo_trail_events event
cross join basic_demo_trail_questions question
join public.event_challenges challenge
  on challenge.id = md5(
    'wits-world-basic-demo-trail-challenge:' || event.event_key
  )::uuid
 and challenge.status = 'draft'
on conflict (id) do nothing;

create temporary table basic_demo_trail_choices (
  authoring_position smallint primary key,
  choice_text text not null,
  is_correct boolean not null
) on commit drop;

insert into basic_demo_trail_choices (
  authoring_position,
  choice_text,
  is_correct
)
values
  (1, 'The first answer', true),
  (2, 'The second answer', false),
  (3, 'The third answer', false),
  (4, 'The fourth answer', false);

insert into public.challenge_choices (
  id,
  question_id,
  authoring_position,
  choice_text
)
select
  md5(
    'wits-world-basic-demo-trail-choice:' || event.event_key || ':' ||
    question.question_position || ':' || choice.authoring_position
  )::uuid,
  md5(
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  choice.authoring_position,
  choice.choice_text
from basic_demo_trail_events event
cross join basic_demo_trail_questions question
cross join basic_demo_trail_choices choice
join public.challenge_questions stored_question
  on stored_question.id = md5(
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
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
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
    question.question_position
  )::uuid,
  md5(
    'wits-world-basic-demo-trail-choice:' || event.event_key || ':' ||
    question.question_position || ':' || choice.authoring_position
  )::uuid
from basic_demo_trail_events event
cross join basic_demo_trail_questions question
cross join basic_demo_trail_choices choice
join public.challenge_questions stored_question
  on stored_question.id = md5(
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
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
from basic_demo_trail_events event,
     basic_demo_trail_questions fixture
where question.id = md5(
    'wits-world-basic-demo-trail-question:' || event.event_key || ':' ||
    fixture.question_position
  )::uuid
  and question.status = 'draft';

update public.event_challenges challenge
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = challenge.version + 1,
    updated_at = now()
from basic_demo_trail_events event
where challenge.id = md5(
    'wits-world-basic-demo-trail-challenge:' || event.event_key
  )::uuid
  and challenge.status = 'draft';

insert into public.trails (
  id,
  title,
  description,
  status
)
values (
  '00000000-0000-4000-8000-000000000177',
  'Campus Highlights Trail',
  'A three-stop, non-production trail for testing ordered progress and nearby discovery.',
  'draft'
)
on conflict (id) do nothing;

insert into public.trail_events (
  trail_id,
  event_id,
  position
)
select
  '00000000-0000-4000-8000-000000000177'::uuid,
  event.event_id,
  event.trail_position
from basic_demo_trail_events event
join public.trails trail
  on trail.id = '00000000-0000-4000-8000-000000000177'::uuid
 and trail.status = 'draft'
on conflict (trail_id, event_id) do nothing;

update public.trails
set status = 'published',
    published_at = now(),
    updated_at = now()
where id = '00000000-0000-4000-8000-000000000177'::uuid
  and status = 'draft';
