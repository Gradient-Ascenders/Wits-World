insert into public.event_challenges (
  id,
  event_id,
  format,
  status
)
values (
  md5('wits-world-sprint-1-demo-challenge')::uuid,
  '00000000-0000-4000-8000-000000000018'::uuid,
  'multiple_choice',
  'published'
)
on conflict (id) do update
set event_id = excluded.event_id,
    format = excluded.format,
    status = excluded.status,
    updated_at = now();

create temporary table sprint_1_demo_challenge_questions (
  question_key text primary key,
  prompt text not null,
  difficulty smallint not null
) on commit drop;

insert into sprint_1_demo_challenge_questions (
  question_key,
  prompt,
  difficulty
)
values
  (
    'great-hall-campus',
    'On which Wits campus is the Great Hall located?',
    1
  ),
  (
    'university-name',
    'What does the name Wits stand for?',
    1
  ),
  (
    'great-hall-ceremonies',
    'Which Wits building is used for major ceremonies and graduations?',
    1
  ),
  (
    'east-campus-library',
    'Which library is located on Wits East Campus?',
    1
  ),
  (
    'wits-city',
    'Which city is home to the University of the Witwatersrand?',
    1
  );

insert into public.challenge_questions (
  id,
  challenge_id,
  prompt,
  difficulty,
  status
)
select
  md5('wits-world-sprint-1-demo-question:' || question_key)::uuid,
  md5('wits-world-sprint-1-demo-challenge')::uuid,
  prompt,
  difficulty,
  'published'
from sprint_1_demo_challenge_questions
on conflict (id) do update
set challenge_id = excluded.challenge_id,
    prompt = excluded.prompt,
    difficulty = excluded.difficulty,
    status = excluded.status,
    updated_at = now();

create temporary table sprint_1_demo_challenge_choices (
  question_key text not null
    references sprint_1_demo_challenge_questions (question_key),
  authoring_position smallint not null,
  choice_text text not null,
  is_correct boolean not null,

  primary key (question_key, authoring_position)
) on commit drop;

insert into sprint_1_demo_challenge_choices (
  question_key,
  authoring_position,
  choice_text,
  is_correct
)
values
  ('great-hall-campus', 1, 'West Campus', false),
  ('great-hall-campus', 2, 'East Campus', true),
  ('great-hall-campus', 3, 'Parktown Campus', false),
  ('great-hall-campus', 4, 'Education Campus', false),
  ('university-name', 1, 'University of the Witwatersrand', true),
  ('university-name', 2, 'Western Institute of Technology', false),
  ('university-name', 3, 'Witbank Technical School', false),
  ('university-name', 4, 'World Institute of Science', false),
  ('great-hall-ceremonies', 1, 'The Great Hall', true),
  ('great-hall-ceremonies', 2, 'The Planetarium', false),
  ('great-hall-ceremonies', 3, 'The Origins Centre', false),
  ('great-hall-ceremonies', 4, 'The Wits Art Museum', false),
  ('east-campus-library', 1, 'Commerce Library', false),
  ('east-campus-library', 2, 'Wartenweiler Library', true),
  ('east-campus-library', 3, 'Law Library', false),
  ('east-campus-library', 4, 'Architecture Library', false),
  ('wits-city', 1, 'Pretoria', false),
  ('wits-city', 2, 'Johannesburg', true),
  ('wits-city', 3, 'Cape Town', false),
  ('wits-city', 4, 'Bloemfontein', false);

insert into public.challenge_choices (
  id,
  question_id,
  authoring_position,
  choice_text
)
select
  md5(
    'wits-world-sprint-1-demo-choice:' || choice.question_key || ':' ||
    choice.authoring_position
  )::uuid,
  md5('wits-world-sprint-1-demo-question:' || choice.question_key)::uuid,
  choice.authoring_position,
  choice.choice_text
from sprint_1_demo_challenge_choices choice
on conflict (id) do nothing;

insert into private.challenge_answer_keys (
  question_id,
  accepted_choice_id
)
select
  md5('wits-world-sprint-1-demo-question:' || choice.question_key)::uuid,
  md5(
    'wits-world-sprint-1-demo-choice:' || choice.question_key || ':' ||
    choice.authoring_position
  )::uuid
from sprint_1_demo_challenge_choices choice
where choice.is_correct = true
on conflict (question_id) do nothing;
