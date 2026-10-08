-- Active campus content pack replacing the original mixed-state verified set.
-- Historical rows are retired rather than deleted so attempts and rewards remain auditable.

create temporary table active_campus_event_fixture (
  event_key text primary key,
  source_event_key text not null,
  title text not null unique,
  description text not null,
  location_name text not null unique,
  longitude double precision not null,
  latitude double precision not null,
  radius_metres integer not null,
  source_urls text[] not null
) on commit drop;

create temporary table superseded_campus_event_ids (id uuid primary key) on commit drop;
insert into superseded_campus_event_ids
select md5('wits-world-verified-event:' || k)::uuid
from unnest(array['foundations','heritage','discovery','arts','civic','early-order','science-order','culture-order','public-order','modern-order']) k;
insert into superseded_campus_event_ids
select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(18,31) n;

insert into active_campus_event_fixture values
  (
    'great-hall-foundations',
    'foundations',
    'Great Hall Beginnings',
    'Discover the milestones that established Wits and shaped its earliest years.',
    'Great Hall',
    28.0303750,
    -26.1920468,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/452712704'
    ]
  ),
  (
    'cullen-library-heritage',
    'heritage',
    'Cullen Library Heritage',
    'Explore the people, buildings and principles recorded across Wits heritage.',
    'William Cullen Library',
    28.0293495,
    -26.1906928,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/26327942'
    ]
  ),
  (
    'origins-centre-discoveries',
    'discovery',
    'Origins Centre Discoveries',
    'Meet Wits researchers, facilities and discoveries across a century of science.',
    'Origins Centre',
    28.0283091,
    -26.1929795,
    60,
    array[
      'https://www.wits.ac.za/origins/plan-your-visit/',
      'https://www.openstreetmap.org/way/26327903'
    ]
  ),
  (
    'school-of-arts-culture',
    'arts',
    'School of Arts Culture',
    'Visit milestones in Wits theatre, music, art and campus culture.',
    'Wits School of Arts',
    28.0326024,
    -26.1920348,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/235955328'
    ]
  ),
  (
    'matrix-campus-life',
    'civic',
    'Matrix Campus Life',
    'Recall Wits people and institutions involved in public life, sport, law and medicine.',
    'The Matrix',
    28.0307564,
    -26.1895929,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/739521835'
    ]
  ),
  (
    'digital-dome-early-years',
    'early-order',
    'Digital Dome Early Years',
    'Arrange foundational Wits milestones into their correct historical order.',
    'Wits Anglo American Digital Dome',
    28.0283502,
    -26.1884929,
    60,
    array[
      'https://digitaldome.wits.ac.za/plan-your-visit/',
      'https://www.openstreetmap.org/way/223889931'
    ]
  ),
  (
    'science-stadium-milestones',
    'science-order',
    'Science Stadium Milestones',
    'Place selected Wits science and research milestones in chronological order.',
    'Wits Science Stadium',
    28.0258204,
    -26.1906244,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/235891611'
    ]
  ),
  (
    'art-museum-timeline',
    'culture-order',
    'Art Museum Timeline',
    'Sequence selected milestones in Wits arts, buildings and student life.',
    'Wits Art Museum',
    28.0328645,
    -26.1928427,
    60,
    array[
      'https://www.wits.ac.za/wam/contact-us/',
      'https://www.openstreetmap.org/way/739519845'
    ]
  ),
  (
    'wits-club-public-life',
    'public-order',
    'Wits Club Public Life',
    'Order selected milestones from Wits civic, legal and social history.',
    'Wits Club',
    28.0258017,
    -26.1857438,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/618335711'
    ]
  ),
  (
    'amphitheatre-modern-century',
    'modern-order',
    'Amphitheatre Modern Century',
    'Order milestones from the modernisation and centenary journey of Wits.',
    'Amphitheatre',
    28.0300541,
    -26.1900839,
    60,
    array[
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf',
      'https://www.openstreetmap.org/way/739545292'
    ]
  ),
  (
    'msl-science-challenge',
    'discovery',
    'MSL Science Challenge',
    'Explore Wits researchers, facilities and discoveries from the Mathematical Sciences Laboratory.',
    'MSL',
    28.0268144,
    -26.1904425,
    60,
    array[
      'https://www.wits.ac.za/csam/contact-us/',
      'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf'
    ]
  );

-- Retire published campaigns first because their members cannot retire while
-- the campaign remains published.
insert into superseded_campus_event_ids
select md5('wits-world-campus-event-v2:' || event_key)::uuid from active_campus_event_fixture;

update public.campaigns campaign
set status = 'retired',
    retired_at = now(),
    version = campaign.version + 1,
    updated_at = now()
where campaign.status = 'published'
  and (
    exists (
      select 1
      from public.campaign_events membership
      join public.events event on event.id = membership.event_id
      where membership.campaign_id = campaign.id
        and event.id in (select id from superseded_campus_event_ids)
        and event.id not in (
          select md5('wits-world-campus-event-v3:' || event_key)::uuid
          from active_campus_event_fixture
        )
    )
    or exists (
      select 1
      from public.campaign_trails membership
      join public.trail_events step on step.trail_id = membership.trail_id
      join public.events event on event.id = step.event_id
      where membership.campaign_id = campaign.id
        and event.id in (select id from superseded_campus_event_ids)
        and event.id not in (
          select md5('wits-world-campus-event-v3:' || event_key)::uuid
          from active_campus_event_fixture
        )
    )
  );

update public.trails trail
set status = 'retired',
    retired_at = now(),
    updated_at = now()
where trail.status = 'published'
  and exists (
    select 1
    from public.trail_events step
    join public.events event on event.id = step.event_id
    where step.trail_id = trail.id
      and event.id in (select id from superseded_campus_event_ids)
      and event.id not in (
        select md5('wits-world-campus-event-v3:' || event_key)::uuid
        from active_campus_event_fixture
      )
  );

update public.events event
set is_published = false,
    authoring_status = 'retired',
    retired_at = now(),
    version = event.version + 1,
    updated_at = now()
where event.authoring_status = 'published'
  and event.id in (select id from superseded_campus_event_ids)
  and event.id not in (
    select md5('wits-world-campus-event-v3:' || event_key)::uuid
    from active_campus_event_fixture
  );

insert into public.events (
  id, title, description, location, radius_metres, starts_at, ends_at,
  is_published, authoring_status, publication_provenance, source_urls
)
select
  md5('wits-world-campus-event-v3:' || event_key)::uuid,
  title,
  description,
  st_setsrid(st_makepoint(longitude, latitude), 4326)::geography,
  radius_metres,
  '2026-09-01T00:00:00+02:00'::timestamptz,
  '2026-12-01T00:00:00+02:00'::timestamptz,
  true,
  'published',
  'controlled_seed',
  source_urls
from active_campus_event_fixture
on conflict (id) do nothing;

create temporary table active_campus_new_challenge_ids (
  id uuid primary key
) on commit drop;

with inserted as (
  insert into public.event_challenges (
    id, event_id, format, status, publication_provenance
  )
  select
    md5('wits-world-campus-challenge-v3:' || fixture.event_key)::uuid,
    md5('wits-world-campus-event-v3:' || fixture.event_key)::uuid,
    source.format,
    'draft',
    null
  from active_campus_event_fixture fixture
  join public.event_challenges source
    on source.id = md5(
      'wits-world-verified-challenge:' || fixture.source_event_key
    )::uuid
   and source.status = 'published'
  on conflict (id) do nothing
  returning id
)
insert into active_campus_new_challenge_ids select id from inserted;

create temporary table active_campus_new_question_ids (
  id uuid primary key
) on commit drop;

with inserted as (
  insert into public.challenge_questions (
    id, challenge_id, prompt, difficulty, explanation, status,
    publication_provenance, source_urls
  )
  select
    md5(
      'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
      source_question.id::text
    )::uuid,
    md5('wits-world-campus-challenge-v3:' || fixture.event_key)::uuid,
    source_question.prompt,
    source_question.difficulty,
    source_question.explanation,
    'draft',
    null,
    source_question.source_urls || case
      when 'https://wits100.wits.ac.za/' = any(source_question.source_urls)
      then array['https://giving.wits.ac.za/centenary-campaign/']::text[]
      else array[]::text[] end
  from active_campus_event_fixture fixture
  join public.event_challenges source_challenge
    on source_challenge.id = md5(
      'wits-world-verified-challenge:' || fixture.source_event_key
    )::uuid
   and source_challenge.status = 'published'
  join public.challenge_questions source_question
    on source_question.challenge_id = source_challenge.id
   and source_question.status = 'published'
  join active_campus_new_challenge_ids created_challenge
    on created_challenge.id = md5(
      'wits-world-campus-challenge-v3:' || fixture.event_key
    )::uuid
  on conflict (id) do nothing
  returning id
)
insert into active_campus_new_question_ids select id from inserted;

insert into public.challenge_choices (
  id, question_id, authoring_position, choice_text
)
select
  md5(
    'wits-world-campus-choice-v3:' || fixture.event_key || ':' ||
    source_choice.id::text
  )::uuid,
  md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid,
  source_choice.authoring_position,
  source_choice.choice_text
from active_campus_event_fixture fixture
join public.event_challenges source_challenge
  on source_challenge.id = md5(
    'wits-world-verified-challenge:' || fixture.source_event_key
  )::uuid
join public.challenge_questions source_question
  on source_question.challenge_id = source_challenge.id
join public.challenge_choices source_choice
  on source_choice.question_id = source_question.id
join active_campus_new_question_ids created_question
  on created_question.id = md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid
on conflict (id) do nothing;

insert into private.challenge_answer_keys (
  question_id, accepted_choice_id
)
select
  md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid,
  md5(
    'wits-world-campus-choice-v3:' || fixture.event_key || ':' ||
    source_answer.accepted_choice_id::text
  )::uuid
from active_campus_event_fixture fixture
join public.event_challenges source_challenge
  on source_challenge.id = md5(
    'wits-world-verified-challenge:' || fixture.source_event_key
  )::uuid
join public.challenge_questions source_question
  on source_question.challenge_id = source_challenge.id
join private.challenge_answer_keys source_answer
  on source_answer.question_id = source_question.id
join active_campus_new_question_ids created_question
  on created_question.id = md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid
on conflict (question_id) do nothing;

insert into public.challenge_ordering_items (
  id, question_id, item_text
)
select
  md5(
    'wits-world-campus-ordering-item-v3:' || fixture.event_key || ':' ||
    source_item.id::text
  )::uuid,
  md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid,
  source_item.item_text
from active_campus_event_fixture fixture
join public.event_challenges source_challenge
  on source_challenge.id = md5(
    'wits-world-verified-challenge:' || fixture.source_event_key
  )::uuid
join public.challenge_questions source_question
  on source_question.challenge_id = source_challenge.id
join public.challenge_ordering_items source_item
  on source_item.question_id = source_question.id
join active_campus_new_question_ids created_question
  on created_question.id = md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid
on conflict (id) do nothing;

insert into private.challenge_ordering_answer_keys (
  question_id, item_id, correct_position
)
select
  md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid,
  md5(
    'wits-world-campus-ordering-item-v3:' || fixture.event_key || ':' ||
    source_answer.item_id::text
  )::uuid,
  source_answer.correct_position
from active_campus_event_fixture fixture
join public.event_challenges source_challenge
  on source_challenge.id = md5(
    'wits-world-verified-challenge:' || fixture.source_event_key
  )::uuid
join public.challenge_questions source_question
  on source_question.challenge_id = source_challenge.id
join private.challenge_ordering_answer_keys source_answer
  on source_answer.question_id = source_question.id
join active_campus_new_question_ids created_question
  on created_question.id = md5(
    'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
    source_question.id::text
  )::uuid
on conflict (question_id, item_id) do nothing;

update public.challenge_questions question
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = question.version + 1,
    updated_at = now()
from active_campus_new_question_ids created
where question.id = created.id
  and question.status = 'draft';

update public.event_challenges challenge
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = challenge.version + 1,
    updated_at = now()
from active_campus_new_challenge_ids created
where challenge.id = created.id
  and challenge.status = 'draft';

create temporary table active_campus_trail_fixture (
  trail_key text primary key,
  title text not null unique,
  description text not null
) on commit drop;

insert into active_campus_trail_fixture values
  (
    'east-campus-essentials',
    'East Campus Essentials',
    'A four-stop route through central East Campus gathering spaces and landmarks.'
  ),
  (
    'west-campus-discovery',
    'West Campus Discovery',
    'A four-stop route through science, heritage and discovery locations on West Campus.'
  ),
  (
    'arts-and-community',
    'Arts and Community',
    'A three-stop route connecting campus social history with Wits creative spaces.'
  );

create temporary table active_campus_trail_event_fixture (
  trail_key text not null references active_campus_trail_fixture (trail_key),
  event_key text not null references active_campus_event_fixture (event_key),
  position smallint not null,
  primary key (trail_key, event_key),
  unique (trail_key, position)
) on commit drop;

insert into active_campus_trail_event_fixture values
  ('east-campus-essentials', 'great-hall-foundations', 1),
  ('east-campus-essentials', 'cullen-library-heritage', 2),
  ('east-campus-essentials', 'matrix-campus-life', 3),
  ('east-campus-essentials', 'amphitheatre-modern-century', 4),
  ('west-campus-discovery', 'digital-dome-early-years', 1),
  ('west-campus-discovery', 'science-stadium-milestones', 2),
  ('west-campus-discovery', 'msl-science-challenge', 3),
  ('west-campus-discovery', 'origins-centre-discoveries', 4),
  ('arts-and-community', 'wits-club-public-life', 1),
  ('arts-and-community', 'school-of-arts-culture', 2),
  ('arts-and-community', 'art-museum-timeline', 3);

create temporary table active_campus_new_trail_ids (
  id uuid primary key
) on commit drop;

with inserted as (
  insert into public.trails (id, title, description, status)
  select
    md5('wits-world-campus-trail-v3:' || trail_key)::uuid,
    title,
    description,
    'draft'
  from active_campus_trail_fixture
  on conflict (id) do nothing
  returning id
)
insert into active_campus_new_trail_ids select id from inserted;

insert into public.trail_events (trail_id, event_id, position)
select
  md5('wits-world-campus-trail-v3:' || membership.trail_key)::uuid,
  md5('wits-world-campus-event-v3:' || membership.event_key)::uuid,
  membership.position
from active_campus_trail_event_fixture membership
join active_campus_new_trail_ids created
  on created.id = md5(
    'wits-world-campus-trail-v3:' || membership.trail_key
  )::uuid
on conflict (trail_id, event_id) do nothing;

update public.trails trail
set status = 'published',
    published_at = now(),
    updated_at = now()
from active_campus_new_trail_ids created
where trail.id = created.id
  and trail.status = 'draft';

-- Standalone trails have no expiry; campaign scheduling bounds both views.
create temporary table active_campus_new_campaign_ids (id uuid primary key) on commit drop;
with inserted as (
  insert into public.campaigns (id,title,description,starts_at,ends_at,status)
  values (
    md5('wits-world-campus-campaign-v3:spring-2026')::uuid,
    'Campus Discovery: Spring 2026',
    'Sourced campus challenges and three ordered trails through the end of November.',
    '2026-09-01T00:00:00+02:00'::timestamptz,
    '2026-12-01T00:00:00+02:00'::timestamptz,
    'draft'
  ) on conflict (id) do nothing returning id
) insert into active_campus_new_campaign_ids select id from inserted;
insert into public.campaign_events (campaign_id,event_id)
select created.id,md5('wits-world-campus-event-v3:'||fixture.event_key)::uuid
from active_campus_new_campaign_ids created cross join active_campus_event_fixture fixture;
insert into public.campaign_trails (campaign_id,trail_id)
select created.id,md5('wits-world-campus-trail-v3:'||fixture.trail_key)::uuid
from active_campus_new_campaign_ids created cross join active_campus_trail_fixture fixture;
update public.campaigns set status='published',publication_provenance='controlled_seed',
  published_at=now(),version=version+1,updated_at=now()
where id in (select id from active_campus_new_campaign_ids);

do $$
begin
  if not exists (
    select 1 from public.campaigns c where c.id=md5('wits-world-campus-campaign-v3:spring-2026')::uuid
      and c.title='Campus Discovery: Spring 2026'
      and c.description='Sourced campus challenges and three ordered trails through the end of November.'
      and c.starts_at='2026-09-01T00:00:00+02:00'::timestamptz
      and c.ends_at='2026-12-01T00:00:00+02:00'::timestamptz
      and c.status='published' and c.publication_provenance='controlled_seed' and c.version=1
      and c.published_at is not null and c.retired_at is null
      and (select count(*) from public.campaign_events m where m.campaign_id=c.id)=11
      and (select count(*) from public.campaign_trails m where m.campaign_id=c.id)=3
      and not exists(select 1 from active_campus_event_fixture f where not exists (
        select 1 from public.campaign_events m where m.campaign_id=c.id and m.event_id=md5('wits-world-campus-event-v3:'||f.event_key)::uuid))
      and not exists(select 1 from active_campus_trail_fixture f where not exists (
        select 1 from public.campaign_trails m where m.campaign_id=c.id and m.trail_id=md5('wits-world-campus-trail-v3:'||f.trail_key)::uuid))
  ) then
    raise exception 'Active campus campaign canonical conflict';
  end if;
end;
$$;

do $$
declare
  active_event_count integer;
  active_question_count integer;
  active_trail_count integer;
  active_trail_step_count integer;
  canonical_conflict_count integer;
  invalid_answer_count integer;
begin
  select count(*) into active_event_count
  from public.events event
  join active_campus_event_fixture fixture
    on event.id = md5(
      'wits-world-campus-event-v3:' || fixture.event_key
    )::uuid
  where event.is_published
    and event.authoring_status = 'published'
    and event.retired_at is null
    and event.starts_at <= now()
    and event.ends_at > now();

  select count(*) into active_question_count
  from public.challenge_questions question
  join active_campus_event_fixture fixture
    on question.challenge_id = md5(
      'wits-world-campus-challenge-v3:' || fixture.event_key
    )::uuid
  where question.status = 'published';

  select count(distinct trail.id), count(step.event_id)
    into active_trail_count, active_trail_step_count
  from public.trails trail
  join active_campus_trail_fixture fixture
    on trail.id = md5(
      'wits-world-campus-trail-v3:' || fixture.trail_key
    )::uuid
  left join public.trail_events step on step.trail_id = trail.id
  where trail.status = 'published';

  select count(*) into invalid_answer_count
  from public.challenge_questions question
  join public.event_challenges challenge on challenge.id = question.challenge_id
  join active_campus_event_fixture fixture
    on challenge.id = md5(
      'wits-world-campus-challenge-v3:' || fixture.event_key
    )::uuid
  left join lateral (
    select count(*) as choice_count
    from public.challenge_choices choice
    where choice.question_id = question.id
  ) choices on true
  left join lateral (
    select count(*) as answer_count
    from private.challenge_answer_keys answer
    where answer.question_id = question.id
  ) mcq_answers on true
  left join lateral (
    select count(*) as item_count
    from public.challenge_ordering_items item
    where item.question_id = question.id
  ) ordering_items on true
  left join lateral (
    select count(*) as answer_count
    from private.challenge_ordering_answer_keys answer
    where answer.question_id = question.id
  ) ordering_answers on true
  where question.status <> 'published'
     or question.explanation is null
     or cardinality(question.source_urls) = 0
     or case challenge.format
       when 'multiple_choice' then
         choices.choice_count <> 4
         or mcq_answers.answer_count <> 1
         or ordering_items.item_count <> 0
         or ordering_answers.answer_count <> 0
       when 'ordering' then
         choices.choice_count <> 0
         or mcq_answers.answer_count <> 0
         or ordering_items.item_count <> 4
         or ordering_answers.answer_count <> 4
       else true
     end;

  select count(*) into canonical_conflict_count
  from (
    select 'event:' || fixture.event_key as conflict_key
    from active_campus_event_fixture fixture
    left join public.events event
      on event.id = md5(
        'wits-world-campus-event-v3:' || fixture.event_key
      )::uuid
    left join public.event_challenges challenge
      on challenge.id = md5(
        'wits-world-campus-challenge-v3:' || fixture.event_key
      )::uuid
    where event.id is null
       or event.title is distinct from fixture.title
       or event.description is distinct from fixture.description
       or not st_equals(
         event.location::geometry,
         st_setsrid(st_makepoint(fixture.longitude, fixture.latitude), 4326)
       )
       or event.radius_metres is distinct from fixture.radius_metres
       or event.starts_at is distinct from '2026-09-01T00:00:00+02:00'::timestamptz
       or event.ends_at is distinct from '2026-12-01T00:00:00+02:00'::timestamptz
       or event.authoring_status is distinct from 'published'
       or not event.is_published
       or event.retired_at is not null
       or event.version is distinct from 0
       or event.publication_provenance is distinct from 'controlled_seed'
       or event.source_urls is distinct from fixture.source_urls
       or challenge.id is null
       or challenge.event_id is distinct from event.id
       or challenge.format is distinct from case
         when fixture.source_event_key in (
           'foundations', 'heritage', 'discovery', 'arts', 'civic'
         ) then 'multiple_choice'
         else 'ordering'
       end
       or challenge.status is distinct from 'published'
       or challenge.version is distinct from 1
       or challenge.publication_provenance is distinct from 'controlled_seed'

    union all

    select 'question:' || fixture.event_key || ':' || source_question.id::text
    from active_campus_event_fixture fixture
    join public.event_challenges source_challenge
      on source_challenge.id = md5(
        'wits-world-verified-challenge:' || fixture.source_event_key
      )::uuid
    join public.challenge_questions source_question
      on source_question.challenge_id = source_challenge.id
    left join public.challenge_questions question
      on question.id = md5(
        'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
        source_question.id::text
      )::uuid
    where question.id is null
       or question.challenge_id is distinct from md5(
         'wits-world-campus-challenge-v3:' || fixture.event_key
       )::uuid
       or question.prompt is distinct from source_question.prompt
       or question.difficulty is distinct from source_question.difficulty
       or question.explanation is distinct from source_question.explanation
       or question.status is distinct from 'published'
       or question.version is distinct from 1
       or question.publication_provenance is distinct from 'controlled_seed'
       or question.source_urls is distinct from (source_question.source_urls || case
         when 'https://wits100.wits.ac.za/' = any(source_question.source_urls)
         then array['https://giving.wits.ac.za/centenary-campaign/']::text[]
         else array[]::text[] end)

    union all

    select 'choice:' || fixture.event_key || ':' || source_choice.id::text
    from active_campus_event_fixture fixture
    join public.event_challenges source_challenge
      on source_challenge.id = md5(
        'wits-world-verified-challenge:' || fixture.source_event_key
      )::uuid
    join public.challenge_questions source_question
      on source_question.challenge_id = source_challenge.id
    join public.challenge_choices source_choice
      on source_choice.question_id = source_question.id
    left join public.challenge_choices choice
      on choice.id = md5(
        'wits-world-campus-choice-v3:' || fixture.event_key || ':' ||
        source_choice.id::text
      )::uuid
    where choice.id is null
       or choice.question_id is distinct from md5(
         'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
         source_question.id::text
       )::uuid
       or choice.authoring_position is distinct from source_choice.authoring_position
       or choice.choice_text is distinct from source_choice.choice_text

    union all

    select 'mcq-answer:' || fixture.event_key || ':' || source_question.id::text
    from active_campus_event_fixture fixture
    join public.event_challenges source_challenge
      on source_challenge.id = md5(
        'wits-world-verified-challenge:' || fixture.source_event_key
      )::uuid
    join public.challenge_questions source_question
      on source_question.challenge_id = source_challenge.id
    join private.challenge_answer_keys source_answer
      on source_answer.question_id = source_question.id
    left join private.challenge_answer_keys answer
      on answer.question_id = md5(
        'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
        source_question.id::text
      )::uuid
    where answer.question_id is null
       or answer.accepted_choice_id is distinct from md5(
         'wits-world-campus-choice-v3:' || fixture.event_key || ':' ||
         source_answer.accepted_choice_id::text
       )::uuid

    union all

    select 'ordering-item:' || fixture.event_key || ':' || source_item.id::text
    from active_campus_event_fixture fixture
    join public.event_challenges source_challenge
      on source_challenge.id = md5(
        'wits-world-verified-challenge:' || fixture.source_event_key
      )::uuid
    join public.challenge_questions source_question
      on source_question.challenge_id = source_challenge.id
    join public.challenge_ordering_items source_item
      on source_item.question_id = source_question.id
    left join public.challenge_ordering_items item
      on item.id = md5(
        'wits-world-campus-ordering-item-v3:' || fixture.event_key || ':' ||
        source_item.id::text
      )::uuid
    where item.id is null
       or item.question_id is distinct from md5(
         'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
         source_question.id::text
       )::uuid
       or item.item_text is distinct from source_item.item_text

    union all

    select 'ordering-answer:' || fixture.event_key || ':' || source_answer.item_id::text
    from active_campus_event_fixture fixture
    join public.event_challenges source_challenge
      on source_challenge.id = md5(
        'wits-world-verified-challenge:' || fixture.source_event_key
      )::uuid
    join public.challenge_questions source_question
      on source_question.challenge_id = source_challenge.id
    join private.challenge_ordering_answer_keys source_answer
      on source_answer.question_id = source_question.id
    left join private.challenge_ordering_answer_keys answer
      on answer.question_id = md5(
        'wits-world-campus-question-v3:' || fixture.event_key || ':' ||
        source_question.id::text
      )::uuid
     and answer.item_id = md5(
        'wits-world-campus-ordering-item-v3:' || fixture.event_key || ':' ||
        source_answer.item_id::text
      )::uuid
    where answer.question_id is null
       or answer.correct_position is distinct from source_answer.correct_position

    union all

    select 'trail:' || fixture.trail_key
    from active_campus_trail_fixture fixture
    left join public.trails trail
      on trail.id = md5(
        'wits-world-campus-trail-v3:' || fixture.trail_key
      )::uuid
    where trail.id is null
       or trail.title is distinct from fixture.title
       or trail.description is distinct from fixture.description
       or trail.status is distinct from 'published'
       or trail.published_at is null
       or trail.retired_at is not null

    union all

    select 'trail-event:' || fixture.trail_key || ':' || fixture.event_key
    from active_campus_trail_event_fixture fixture
    left join public.trail_events membership
      on membership.trail_id = md5(
        'wits-world-campus-trail-v3:' || fixture.trail_key
      )::uuid
     and membership.event_id = md5(
        'wits-world-campus-event-v3:' || fixture.event_key
      )::uuid
    where membership.trail_id is null
       or membership.position is distinct from fixture.position
  ) conflicts;

  if active_event_count <> 11
     or active_question_count <> 110
     or active_trail_count <> 3
     or active_trail_step_count <> 11
     or invalid_answer_count <> 0
     or canonical_conflict_count <> 0 then
    raise exception
      'Active campus content seed verification failed: events %, questions %, trails %, steps %, invalid answers %, conflicts %',
      active_event_count,
      active_question_count,
      active_trail_count,
      active_trail_step_count,
      invalid_answer_count,
      canonical_conflict_count;
  end if;
end;
$$;
