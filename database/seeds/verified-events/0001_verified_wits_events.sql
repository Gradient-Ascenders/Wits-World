-- Issue #165 production-shaped Wits Quest content pack.
-- Publication remains subject to independent factual and presentation review.

create temporary table verified_event_fixture (
  event_key text primary key,
  event_number smallint not null unique,
  title text not null unique,
  description text not null,
  location_name text not null unique,
  longitude double precision not null,
  latitude double precision not null,
  radius_metres integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null,
  source_urls text[] not null
) on commit drop;

insert into verified_event_fixture values
  ('foundations', 1, 'Wits Foundations Quest', 'Trace the University from its mining-school origins to its first landmark discoveries.', 'Great Hall', 28.030411, -26.192142, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf','https://artefacts.co.za/main/Buildings/bldgframes_mob.php?bldgid=15658']),
  ('heritage', 2, 'Wits Campus Heritage Quest', 'Explore the people, buildings and principles that shaped the early Wits campus.', 'William Cullen Library', 28.029528, -26.190667, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/library/contact-us/','https://artefacts.co.za/main/Buildings/bldgframes_mob.php?bldgid=1013']),
  ('discovery', 3, 'Wits Discovery Quest', 'Meet Wits researchers, facilities and discoveries across a century of science.', 'Origins Centre', 28.028314, -26.192981, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/origins/','https://mapcarta.com/W26327903']),
  ('arts', 4, 'Wits Arts and Culture Quest', 'Visit milestones in Wits theatre, music, art and campus culture.', 'Wits Art Museum', 28.033169, -26.193047, 60, '2100-01-01T00:00:00+02:00', '2100-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/wam/contact-us/','https://artefacts.co.za/main/Buildings/bldgframes_mob.php?bldgid=8509']),
  ('civic', 5, 'Wits Civic and Alumni Quest', 'Recall Wits people and institutions involved in law, public life, sport and medicine.', 'Facilities and Services Building', 28.024797, -26.189375, 60, '2100-01-01T00:00:00+02:00', '2100-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/media/wits-university/footer/about-wits/procurement/Directions%20-%20Wits%20Procurement%20Department%2007.08.2025.pdf','https://www.wits.ac.za/maps/braamfontein-campus-west/']),
  ('early-order', 6, 'Ordering Wits: Early Years', 'Put foundational Wits milestones into chronological order.', 'Wits Anglo American Digital Dome', 28.028431, -26.188511, 60, '2025-01-01T00:00:00+02:00', '2025-12-31T23:59:59+02:00', true, array['https://digitaldome.wits.ac.za/plan-your-visit/','https://artefacts.co.za/main/Buildings/bldgframes.php?bldgid=9854']),
  ('science-order', 7, 'Ordering Wits: Science and Discovery', 'Arrange selected Wits science and research milestones by year.', 'Oppenheimer Life Sciences entrance', 28.026583, -26.193250, 60, '2025-01-01T00:00:00+02:00', '2025-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/media/wits-university/faculties-and-schools/humanities/wits-school-of-education/documents/PGCE-part%20time.pdf','https://www.wits.ac.za/maps/braamfontein-campus/']),
  ('culture-order', 8, 'Ordering Wits: Campus Culture', 'Sequence selected milestones in Wits arts, buildings and student life.', 'Wits Theatre', 28.032492, -26.192810, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', true, array['https://www.wits.ac.za/witstheatre/contact-us/','https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf']),
  ('public-order', 9, 'Ordering Wits: Public Life', 'Place selected Wits civic, legal and social milestones in time.', 'Adler Museum of Medicine', 28.046383, -26.176189, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', false, array['https://www.wits.ac.za/health/adlermuseum/contact-us/','https://www.wits.ac.za/maps/parktown-campus/']),
  ('modern-order', 10, 'Ordering Wits: Modern Century', 'Order milestones from Wits modernisation and centenary journey.', 'Wits Business School', 28.036900, -26.180800, 60, '2026-09-01T00:00:00+02:00', '2099-12-31T23:59:59+02:00', false, array['https://www.capsi.wits.ac.za/wp-content/uploads/2024/07/PUB-MMAfricanPhil_brochure.pdf','https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Parktown-Campus.pdf']);

insert into public.events (
  id, title, description, location, radius_metres, starts_at, ends_at,
  is_published, authoring_status, publication_provenance, source_urls
)
select
  md5('wits-world-verified-event:' || event_key)::uuid,
  title,
  description,
  st_setsrid(st_makepoint(longitude, latitude), 4326)::geography,
  radius_metres,
  starts_at,
  ends_at,
  is_published,
  case when is_published then 'published' else 'draft' end,
  case when is_published then 'controlled_seed' else null end,
  source_urls
from verified_event_fixture
on conflict (id) do nothing;

create temporary table verified_new_challenge_ids (
  id uuid primary key
) on commit drop;

with inserted as (
  insert into public.event_challenges (
    id, event_id, format, status, publication_provenance
  )
  select
    md5('wits-world-verified-challenge:' || event_key)::uuid,
    md5('wits-world-verified-event:' || event_key)::uuid,
    case when event_number <= 5 then 'multiple_choice' else 'ordering' end,
    'draft',
    null
  from verified_event_fixture
  on conflict (id) do nothing
  returning id
)
insert into verified_new_challenge_ids select id from inserted;

do $$
begin
  if exists (
    select 1
    from verified_event_fixture fixture
    join public.event_challenges stored
      on stored.id = md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
    left join verified_new_challenge_ids created on created.id = stored.id
    where created.id is null
      and (
        stored.event_id is distinct from md5('wits-world-verified-event:' || fixture.event_key)::uuid
        or stored.format is distinct from case
          when fixture.event_number <= 5 then 'multiple_choice'
          else 'ordering'
        end
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed'
      )
  ) then
    raise exception 'Verified event seed canonical conflict: a pre-existing deterministic challenge does not match the complete final canonical state; no existing content was mutated';
  end if;
end;
$$;

create temporary table verified_new_question_ids (
  id uuid primary key
) on commit drop;

create temporary table verified_mcq_fixture (
  event_key text not null,
  question_position smallint not null,
  prompt text not null,
  correct_choice text not null,
  distractor_one text not null,
  distractor_two text not null,
  distractor_three text not null,
  explanation text not null,
  primary key (event_key, question_position),
  unique (event_key, prompt)
) on commit drop;

insert into verified_mcq_fixture values
  ('foundations',1,'In which city did the institution that became Wits begin in 1896?','Kimberley','Johannesburg','Pretoria','Cape Town','Wits began as a school in Kimberley in 1896.'),
  ('foundations',2,'In which year did the institution that became Wits begin?','1896','1904','1922','1934','The official Wits centenary timeline begins with the Kimberley school in 1896.'),
  ('foundations',3,'In which month of 1922 was Wits granted full university status?','March','January','June','October','Wits was granted full university status in March 1922.'),
  ('foundations',4,'Who became Wits University''s first Chancellor?','Prince Arthur of Connaught','Jan Hofmeyer','Raymond Dart','Bernard Price','Prince Arthur of Connaught was appointed the first Chancellor after Wits was established.'),
  ('foundations',5,'Who became Wits University''s first Principal?','Jan Hofmeyer','Prince Arthur of Connaught','Basil Schonland','Phillip Tobias','Professor Jan Hofmeyer was appointed the first Principal.'),
  ('foundations',6,'On what date was the official opening of Wits celebrated in 1922?','4 October','1 March','12 March','12 October','The opening ceremony occurred on 4 October 1922, after full status took effect in March.'),
  ('foundations',7,'Which Wits professor announced the Taung Skull discovery?','Raymond Dart','Phillip Tobias','Friedel Sellschop','Basil Schonland','Professor Raymond Dart announced the Taung Skull discovery in 1925.'),
  ('foundations',8,'What species name did Raymond Dart give the Taung Skull?','Australopithecus africanus','Australopithecus sediba','Aardonyx celestae','Antetonitrus ingenipes','Dart named the species Australopithecus africanus.'),
  ('foundations',9,'To which area did Wits move from Plein Square?','Milner Park','Parktown','Soweto','Braamfontein East only','The University moved from Plein Square to its first completed teaching buildings at Milner Park.'),
  ('foundations',10,'Who officially opened Central Block in 1925?','The Prince of Wales','Prince Arthur of Connaught','The Governor-General','Jan Hofmeyer','The Prince of Wales officially opened Central Block in 1925.'),

  ('heritage',1,'On what date did Wits'' first library officially open?','12 March 1934','4 October 1922','12 October 1960','1 March 1922','The first Wits library officially opened on 12 March 1934.'),
  ('heritage',2,'After whom was the first Wits library named in 1974?','William Cullen','Bernard Price','John Moffat','Jan Hofmeyer','The library was named after William Cullen in 1974.'),
  ('heritage',3,'Who was appointed as Wits'' first black staff member in 1935?','Benedict Wallet Vilakazi','Clement Doke','Phillip Tobias','Dikgang Moseneke','Dr B.W. Vilakazi became Wits'' first black staff member in 1935.'),
  ('heritage',4,'What was Wits University''s first research institute?','Bernard Price Geophysical Research Institute','Centre for Applied Legal Studies','Wits Business School','Wits Centre for Ethics','The Bernard Price Geophysical Research Institute, established in 1936, was Wits'' first research institute.'),
  ('heritage',5,'In which year did the Governor-General officially open the Great Hall?','1940','1934','1959','1964','The completed Great Hall was officially opened in June 1940.'),
  ('heritage',6,'Which two scholars produced the Zulu-English dictionary highlighted in the Wits timeline?','Clement Doke and B.W. Vilakazi','Raymond Dart and Phillip Tobias','Cyril and Esther Adler','Jan Hofmeyer and Bernard Price','The dictionary resulted from work by Clement Doke and Dr B.W. Vilakazi.'),
  ('heritage',7,'What prompted the first major Wits student protest recorded in the centenary timeline?','Fee increases','A campus relocation','Library opening hours','A sports result','The timeline records the 1943 protest as opposition to fee increases.'),
  ('heritage',8,'Which students were supported by the scholarships approved by Wits Convocation in 1949?','African medical students','Architecture students','International law students','Postgraduate physics students','Wits Convocation approved financial support for African students to study medicine.'),
  ('heritage',9,'Which building was officially opened and named for a benefactor in 1959?','John Moffat Building','Solomon Mahlangu House','William Cullen Library','Wits Theatre','The John Moffat Building was officially opened in 1959 and named for John Moffat.'),
  ('heritage',10,'What national first did Wits achieve by purchasing a computer in 1962?','First South African university to own a computer','First African university to operate a planetarium','First university to own a nuclear accelerator','First university to establish a law clinic','Wits became the first university in South Africa to own a computer.'),

  ('discovery',1,'On what date did the Johannesburg Planetarium open its doors?','12 October 1960','12 March 1934','4 October 1922','1 January 1962','The planetarium opened on 12 October 1960.'),
  ('discovery',2,'What distinction did the 1960 planetarium hold in Africa?','First full-sized planetarium in Africa','First university computer in Africa','First digital dome in Africa','First astronomical observatory in Africa','It was the first full-sized planetarium in Africa and second in the Southern Hemisphere.'),
  ('discovery',3,'What nickname was given to Wits'' Tandem van der Graaff nuclear accelerator?','Daisy','Kudos','Sediba','Taung','The nuclear accelerator purchased for the Nuclear Physics Research Unit was called Daisy.'),
  ('discovery',4,'In which year was Wits Business School opened?','1968','1962','1972','1982','Wits Business School opened in 1968.'),
  ('discovery',5,'Who opened the Origins Centre in 2006?','President Thabo Mbeki','Nelson Mandela','Dikgang Moseneke','Loyiso Nongxa','President Thabo Mbeki opened the Origins Centre in 2006.'),
  ('discovery',6,'Which new dinosaur species did Wits announce in 2009?','Aardonyx celestae','Australopithecus sediba','Antetonitrus ingenipes','Australopithecus africanus','The 2009 timeline entry names Aardonyx celestae as a newly announced dinosaur species.'),
  ('discovery',7,'Which fossils were displayed at Wits in 2010?','Australopithecus sediba','The Taung Skull only','Aardonyx celestae','Antetonitrus ingenipes','Australopithecus sediba fossils were displayed at Wits in 2010.'),
  ('discovery',8,'What did Wits researchers discover at Blombos Cave in 2011?','A 100,000-year-old ochre toolkit and workshop','The Taung Skull','A full-sized planetarium projector','The first university computer','The timeline describes the find as the world''s oldest art studio: a 100,000-year-old ochre toolkit and workshop.'),
  ('discovery',9,'What astronomical event did Wits physicists help observe in 2017?','Signals from the collision of two neutron stars','The first image of a black hole','The transit of Venus','The discovery of Pluto','Wits physicists joined the international observation of signals from two colliding neutron stars.'),
  ('discovery',10,'Who led the Wits Quantum Initiative described in the 2021 timeline entry?','Andrew Forbes','Shabir Madhi','Raymond Dart','Friedel Sellschop','Professor Andrew Forbes from the Wits School of Physics led WitsQ.'),

  ('arts',1,'In which year did Wits begin hosting the Free People''s concerts?','1971','1968','1979','1983','The Wits timeline dates the start of the Free People''s concerts to 1971.'),
  ('arts',2,'Who founded the Adler Museum?','Cyril and Esther Adler','Clement Doke and B.W. Vilakazi','Felicia and Sydney Kentridge','Anglo American and De Beers','Drs Cyril and Esther Adler founded the Adler Museum in 1962.'),
  ('arts',3,'What collection grew from the Standard Bank Foundation of Art established in 1979?','A jointly owned African art collection','A medical-history collection','A rock-art archive only','A collection of astronomical projectors','The annual purchase fund created an African art collection jointly owned by Wits and Standard Bank.'),
  ('arts',4,'In which month and year did the Wits Theatre complex first open?','July 1983','March 1934','October 1960','May 2013','The Wits Theatre complex opened its doors in July 1983.'),
  ('arts',5,'Which organisations funded the Amic Deck?','Anglo American and De Beers','Wits and Standard Bank','The CSIR and CERN','Johannesburg City Council and Zeiss','Anglo American and De Beers funded the deck linking the east and west campuses.'),
  ('arts',6,'Which firm built the organ installed at the Department of Music in 1994?','Fehrle and Roeleveld','Zeiss','Anglo American','Osmond Lange','The timeline identifies Fehrle and Roeleveld as the organ builder.'),
  ('arts',7,'What is the name of the revamped student mall established in 2003?','The Matrix','Amic Deck','Wits Junction','University Corner','The revamped student mall established in 2003 is called the Matrix.'),
  ('arts',8,'Who delivered a public lecture at Wits in 2004?','The Dalai Lama','Robert Kennedy','Amartya Sen','Nelson Mandela','The centenary timeline records the Dalai Lama''s 2004 visit and public lecture.'),
  ('arts',9,'Which faculty hosted the first Wits Arts and Literature Experience in 2008?','Faculty of Humanities','Faculty of Science','Faculty of Health Sciences','Faculty of Engineering and the Built Environment','The Faculty of Humanities hosted the first Wits Arts and Literature Experience.'),
  ('arts',10,'At which Johannesburg street corner is the Wits Art Museum located?','Bertha and Jorissen Streets','Yale and Enoch Sontonga Avenues','Empire and Jan Smuts Roads','York and Carse O''Gowrie Roads','The official Wits Art Museum contact page places WAM at the corner of Bertha and Jorissen Streets.'),

  ('civic',1,'In which Wits venue did Robert Kennedy speak in 1966?','The Great Hall','The Wits Theatre','The Origins Centre','The Planetarium','Robert Kennedy addressed a packed mixed audience in the Great Hall.'),
  ('civic',2,'In which year did the Wits Law Clinic open?','1973','1966','1978','1989','The Wits Law Clinic opened in August 1973.'),
  ('civic',3,'Who established the Wits Law Clinic?','Felicia Kentridge','Richard Goldstone','Dikgang Moseneke','Robert Kennedy','The timeline credits Felicia Kentridge with establishing the Wits Law Clinic.'),
  ('civic',4,'What does CALS stand for at Wits?','Centre for Applied Legal Studies','Campus Arts and Literature Society','Centre for African Language Studies','Council for Academic Library Services','CALS is the Centre for Applied Legal Studies, established in 1978.'),
  ('civic',5,'Which football trophy did Wits win in 1978?','Mainstay Cup','Nedbank Cup','Telkom Knockout','MTN 8','The Wits centenary timeline records the University''s 1978 Mainstay Cup victory.'),
  ('civic',6,'Which honorary Wits alumnus won the Nobel Peace Prize in 1993?','Nelson Mandela','Sydney Brenner','Amartya Sen','Robert Kennedy','The Wits timeline identifies Nelson Mandela as an honorary alumnus and 1993 Nobel Peace Prize winner.'),
  ('civic',7,'Who became the seventh Chancellor of Wits in 1996?','Richard Goldstone','Dikgang Moseneke','Prince Arthur of Connaught','Loyiso Nongxa','Judge Richard Goldstone became Wits University''s seventh Chancellor.'),
  ('civic',8,'Which Wits alumnus received the 2002 Nobel Prize in Physiology or Medicine?','Sydney Brenner','Nelson Mandela','Amartya Sen','Phillip Tobias','Sydney Brenner shared the 2002 Nobel Prize in Physiology or Medicine.'),
  ('civic',9,'Which student-led protest began at Wits in 2015 and spread nationally?','#FeesMustFall','#RhodesMustFall','#OpenWits','#Wits100','#FeesMustFall began at Wits in 2015 and spread to other universities.'),
  ('civic',10,'Who led the two COVID-19 vaccine trials highlighted by Wits in 2020?','Shabir Madhi','Andrew Forbes','Sydney Brenner','Loyiso Nongxa','Professor Shabir Madhi led the Oxford and Novavax vaccine trials highlighted in the timeline.');

with inserted as (
  insert into public.challenge_questions (
    id, challenge_id, prompt, difficulty, explanation, status,
    publication_provenance, source_urls
  )
  select
    md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid,
    md5('wits-world-verified-challenge:' || question.event_key)::uuid,
    question.prompt,
    case event.event_number when 1 then 1 when 2 then 1 when 3 then 2 when 4 then 2 else 3 end,
    question.explanation,
    'draft',
    null,
    case
      when question.event_key = 'arts' and question.question_position = 10
        then array['https://www.wits.ac.za/wam/contact-us/']
      when question.event_key = 'civic' and question.question_position = 8
        then array[
          'https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/',
          'https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html'
        ]
      else array['https://wits100.wits.ac.za/']
    end
  from verified_mcq_fixture question
  join verified_event_fixture event using (event_key)
  on conflict (id) do nothing
  returning id
)
insert into verified_new_question_ids select id from inserted;

do $$
begin
  if exists (
    select 1
    from verified_mcq_fixture fixture
    join verified_event_fixture event using (event_key)
    join public.challenge_questions stored
      on stored.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
    left join verified_new_question_ids created on created.id = stored.id
    where created.id is null
      and (
        stored.challenge_id is distinct from md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
        or stored.prompt is distinct from fixture.prompt
        or stored.difficulty is distinct from case event.event_number
          when 1 then 1 when 2 then 1 when 3 then 2 when 4 then 2 else 3
        end
        or stored.explanation is distinct from fixture.explanation
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed'
        or stored.source_urls is distinct from case
          when fixture.event_key = 'arts' and fixture.question_position = 10
            then array['https://www.wits.ac.za/wam/contact-us/']::text[]
          when fixture.event_key = 'civic' and fixture.question_position = 8
            then array[
              'https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/',
              'https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html'
            ]::text[]
          else array['https://wits100.wits.ac.za/']::text[]
        end
        or (select count(*) from public.challenge_choices choice
            where choice.question_id = stored.id) <> 4
        or not exists (
          select 1
          from private.challenge_answer_keys answer
          where answer.question_id = stored.id
            and answer.accepted_choice_id = md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || (((fixture.question_position - 1) % 4) + 1))::uuid
        )
        or exists (
          select 1
          from generate_series(1, 4) expected(authoring_position)
          left join public.challenge_choices choice
            on choice.id = md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || expected.authoring_position)::uuid
          where choice.id is null
             or choice.question_id is distinct from stored.id
             or choice.authoring_position is distinct from expected.authoring_position
             or choice.choice_text is distinct from case expected.authoring_position
               when ((fixture.question_position - 1) % 4) + 1 then fixture.correct_choice
               when (((fixture.question_position - 1) % 4) + 1) % 4 + 1 then fixture.distractor_one
               when (((fixture.question_position - 1) % 4) + 2) % 4 + 1 then fixture.distractor_two
               else fixture.distractor_three
             end
        )
      )
  ) then
    raise exception 'Verified event seed canonical conflict: a pre-existing deterministic question does not match the complete final canonical state; no existing content was mutated';
  end if;
end;
$$;

insert into public.challenge_choices (
  id, question_id, authoring_position, choice_text
)
select
  md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || choice.position)::uuid,
  md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid,
  choice.position,
  case choice.position
    when ((fixture.question_position - 1) % 4) + 1 then fixture.correct_choice
    when (((fixture.question_position - 1) % 4) + 1) % 4 + 1 then fixture.distractor_one
    when (((fixture.question_position - 1) % 4) + 2) % 4 + 1 then fixture.distractor_two
    else fixture.distractor_three
  end
from verified_mcq_fixture fixture
cross join generate_series(1, 4) choice(position)
join public.challenge_questions stored_question
  on stored_question.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
 and stored_question.status = 'draft'
join verified_new_question_ids created_question
  on created_question.id = stored_question.id
on conflict (id) do nothing;

insert into private.challenge_answer_keys (question_id, accepted_choice_id)
select
  md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid,
  md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || (((fixture.question_position - 1) % 4) + 1))::uuid
from verified_mcq_fixture fixture
join public.challenge_questions stored_question
  on stored_question.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
 and stored_question.status = 'draft'
join verified_new_question_ids created_question
  on created_question.id = stored_question.id
on conflict (question_id) do nothing;

create temporary table verified_milestone_fixture (
  milestone_position smallint primary key,
  milestone_year smallint not null,
  milestone_text text not null unique,
  source_urls text[] not null default array['https://wits100.wits.ac.za/']::text[]
) on commit drop;

insert into verified_milestone_fixture (
  milestone_position, milestone_year, milestone_text
) values
  (1,1896,'Wits begins as a school in Kimberley'),
  (2,1922,'Wits receives full university status'),
  (3,1925,'Raymond Dart announces the Taung Skull discovery'),
  (4,1929,'Wits'' state subsidy is reduced to five percent'),
  (5,1934,'The first Wits library officially opens'),
  (6,1935,'B.W. Vilakazi becomes Wits'' first black staff member'),
  (7,1936,'The Bernard Price Geophysical Research Institute is established'),
  (8,1940,'The Great Hall officially opens'),
  (9,1943,'The first major Wits student fee protest takes place'),
  (10,1948,'The Zulu-English dictionary is published'),
  (11,1949,'Wits Convocation approves African medical scholarships'),
  (12,1956,'Wits Convocation publicly opposes university segregation'),
  (13,1959,'The John Moffat Building officially opens'),
  (14,1960,'The Johannesburg Planetarium opens'),
  (15,1961,'Wits acquires a small nuclear reactor'),
  (16,1962,'Wits becomes the first South African university to own a computer'),
  (17,1964,'The Student Union officially opens'),
  (18,1966,'Robert Kennedy speaks in the Great Hall'),
  (19,1968,'Wits Business School opens'),
  (20,1971,'Wits begins hosting Free People''s concerts'),
  (21,1972,'Wits buys the Daisy nuclear accelerator'),
  (22,1973,'The Wits Law Clinic opens'),
  (23,1974,'The Adler Museum is handed over to Wits'),
  (24,1976,'Senate House opens'),
  (25,1977,'The All Sports Club opens'),
  (26,1978,'CALS is established'),
  (27,1979,'The Standard Bank Foundation of Art is established'),
  (28,1982,'The Wits Bridging Programme is officially launched'),
  (29,1983,'The Wits Theatre complex opens'),
  (30,1989,'The Amic Deck officially opens'),
  (31,1993,'Nelson Mandela wins the Nobel Peace Prize'),
  (32,1994,'The Department of Music atrium organ is installed'),
  (33,1996,'Richard Goldstone becomes Wits Chancellor'),
  (34,2000,'The Health Sciences memorial sculpture is erected'),
  (35,2002,'Sydney Brenner receives the Nobel Prize in Physiology or Medicine'),
  (36,2003,'The Matrix student mall is established'),
  (37,2004,'The Dalai Lama delivers a public lecture at Wits'),
  (38,2005,'Loyiso Nongxa delivers the Ngxe apology'),
  (39,2006,'The Origins Centre opens'),
  (40,2007,'Kudos Kudu makes his official appearance'),
  (41,2008,'Wits hosts its first Arts and Literature Experience'),
  (42,2009,'Wits announces the dinosaur Aardonyx celestae'),
  (43,2010,'Australopithecus sediba fossils are displayed at Wits'),
  (44,2012,'Wits celebrates its 90th anniversary'),
  (45,2014,'Wits launches the Centre of Excellence in Mathematical and Statistical Sciences');

update verified_milestone_fixture
set source_urls = array[
  'https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/',
  'https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html'
]
where milestone_position = 35;

update verified_milestone_fixture
set source_urls = array[
  'https://wits100.wits.ac.za/',
  'https://www.wits.ac.za/media/wits-university/alumni/documents/heritage/Wits90.pdf'
]
where milestone_position = 44;

update verified_milestone_fixture
set source_urls = array[
  'https://www.wits.ac.za/news/latest-news/general-news/2014/2014-04/'
]
where milestone_position = 45;

create temporary table verified_ordering_question_milestone_fixture (
  event_key text not null,
  question_position smallint not null,
  item_position smallint not null,
  milestone_position smallint not null references verified_milestone_fixture,
  primary key (event_key, question_position, item_position),
  unique (event_key, question_position, milestone_position)
) on commit drop;

insert into verified_ordering_question_milestone_fixture
select
  event.event_key,
  question.question_position,
  item.item_position,
  case
    when ((event.event_number - 6) * 10 + question.question_position) <= 42
      then ((event.event_number - 6) * 10 + question.question_position + item.item_position - 1)::smallint
    else (
      ((event.event_number - 6) * 10 + question.question_position) - 42
      + ((item.item_position - 1) * 10)
    )::smallint
  end
from verified_event_fixture event
cross join generate_series(1, 10) question(question_position)
cross join generate_series(1, 4) item(item_position)
where event.event_number >= 6;

create temporary table verified_ordering_question_fixture (
  event_key text not null,
  question_position smallint not null,
  prompt text not null,
  explanation text not null,
  source_urls text[] not null,
  primary key (event_key, question_position),
  unique (event_key, prompt)
) on commit drop;

insert into verified_ordering_question_fixture
select
  membership.event_key,
  membership.question_position,
  format(
    'Arrange Wits timeline set %s (%s-%s) from earliest to latest.',
    ((event.event_number - 6) * 10 + membership.question_position),
    min(milestone.milestone_year),
    max(milestone.milestone_year)
  ),
  'The official Wits centenary timeline dates these milestones, in order, to ' ||
    string_agg(milestone.milestone_year::text, ', ' order by membership.item_position) || '.',
  (
    select array_agg(distinct source_url order by source_url)
    from verified_ordering_question_milestone_fixture source_membership
    join verified_milestone_fixture source_milestone
      on source_milestone.milestone_position = source_membership.milestone_position
    cross join lateral unnest(source_milestone.source_urls) source_url
    where source_membership.event_key = membership.event_key
      and source_membership.question_position = membership.question_position
  )
from verified_ordering_question_milestone_fixture membership
join verified_event_fixture event using (event_key)
join verified_milestone_fixture milestone
  on milestone.milestone_position = membership.milestone_position
group by membership.event_key, event.event_number, membership.question_position;

with inserted as (
  insert into public.challenge_questions (
    id, challenge_id, prompt, difficulty, explanation, status,
    publication_provenance, source_urls
  )
  select
    md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid,
    md5('wits-world-verified-challenge:' || question.event_key)::uuid,
    question.prompt,
    case event.event_number when 6 then 1 when 7 then 1 when 8 then 2 when 9 then 2 else 3 end,
    question.explanation,
    'draft',
    null,
    question.source_urls
  from verified_ordering_question_fixture question
  join verified_event_fixture event using (event_key)
  on conflict (id) do nothing
  returning id
)
insert into verified_new_question_ids select id from inserted;

do $$
begin
  if exists (
    select 1
    from verified_ordering_question_fixture fixture
    join verified_event_fixture event using (event_key)
    join public.challenge_questions stored
      on stored.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
    left join verified_new_question_ids created on created.id = stored.id
    where created.id is null
      and (
        stored.challenge_id is distinct from md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
        or stored.prompt is distinct from fixture.prompt
        or stored.difficulty is distinct from case event.event_number
          when 6 then 1 when 7 then 1 when 8 then 2 when 9 then 2 else 3
        end
        or stored.explanation is distinct from fixture.explanation
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed'
        or stored.source_urls is distinct from fixture.source_urls
        or (select count(*) from public.challenge_ordering_items item
            where item.question_id = stored.id) <> 4
        or (select count(*) from private.challenge_ordering_answer_keys answer
            where answer.question_id = stored.id) <> 4
        or exists (
          select 1
          from verified_ordering_question_milestone_fixture membership
          join verified_milestone_fixture milestone
            on milestone.milestone_position = membership.milestone_position
          left join public.challenge_ordering_items item
            on item.id = md5('wits-world-verified-ordering-item:' || membership.event_key || ':' || membership.question_position || ':' || membership.item_position)::uuid
          left join private.challenge_ordering_answer_keys answer
            on answer.question_id = stored.id
           and answer.item_id = item.id
          where membership.event_key = fixture.event_key
            and membership.question_position = fixture.question_position
            and (
              item.id is null
              or item.question_id is distinct from stored.id
              or item.item_text is distinct from milestone.milestone_text
              or answer.correct_position is distinct from membership.item_position
            )
        )
      )
  ) then
    raise exception 'Verified event seed canonical conflict: a pre-existing deterministic question does not match the complete final canonical state; no existing content was mutated';
  end if;
end;
$$;

insert into public.challenge_ordering_items (id, question_id, item_text)
select
  md5('wits-world-verified-ordering-item:' || question.event_key || ':' || question.question_position || ':' || membership.item_position)::uuid,
  md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid,
  milestone.milestone_text
from verified_ordering_question_fixture question
join verified_ordering_question_milestone_fixture membership
  using (event_key, question_position)
join verified_milestone_fixture milestone
  on milestone.milestone_position = membership.milestone_position
join public.challenge_questions stored_question
  on stored_question.id = md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid
 and stored_question.status = 'draft'
join verified_new_question_ids created_question
  on created_question.id = stored_question.id
on conflict (id) do nothing;

insert into private.challenge_ordering_answer_keys (
  question_id, item_id, correct_position
)
select
  md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid,
  md5('wits-world-verified-ordering-item:' || question.event_key || ':' || question.question_position || ':' || membership.item_position)::uuid,
  membership.item_position
from verified_ordering_question_fixture question
join verified_ordering_question_milestone_fixture membership
  using (event_key, question_position)
join verified_milestone_fixture milestone
  on milestone.milestone_position = membership.milestone_position
join public.challenge_questions stored_question
  on stored_question.id = md5('wits-world-verified-question:' || question.event_key || ':' || question.question_position)::uuid
 and stored_question.status = 'draft'
join verified_new_question_ids created_question
  on created_question.id = stored_question.id
on conflict (question_id, item_id) do nothing;

update public.challenge_questions question
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = question.version + 1,
    updated_at = now()
from verified_new_question_ids created
where question.id = created.id
  and question.status = 'draft';

update public.event_challenges challenge
set status = 'published',
    publication_provenance = 'controlled_seed',
    version = challenge.version + 1,
    updated_at = now()
from verified_new_challenge_ids created
where challenge.id = created.id
  and challenge.status = 'draft';

do $$
declare
  canonical_conflict_count bigint;
  challenge_count integer;
  distinct_location_count integer;
  distinct_ordering_set_count integer;
  distinct_question_content_count integer;
  event_count integer;
  invalid_event_count integer;
  invalid_question_count integer;
  question_count integer;
begin
  select count(*), count(*) filter (
    where cardinality(event.source_urls) < 2
       or event.radius_metres <= 0
       or st_isempty(event.location::geometry)
  )
  into event_count, invalid_event_count
  from public.events event
  join verified_event_fixture fixture
    on event.id = md5('wits-world-verified-event:' || fixture.event_key)::uuid;

  select count(distinct st_asewkb(event.location::geometry))
  into distinct_location_count
  from public.events event
  join verified_event_fixture fixture
    on event.id = md5('wits-world-verified-event:' || fixture.event_key)::uuid;

  select count(*) into challenge_count
  from public.event_challenges challenge
  join verified_event_fixture event
    on challenge.id = md5('wits-world-verified-challenge:' || event.event_key)::uuid
   and challenge.event_id = md5('wits-world-verified-event:' || event.event_key)::uuid
  where challenge.status = 'published'
    and challenge.format = case
      when event.event_number <= 5 then 'multiple_choice'
      else 'ordering'
    end;

  select count(*), count(*) filter (
    where question.explanation is null
       or btrim(question.explanation) = ''
       or cardinality(question.source_urls) = 0
       or question.difficulty not between 1 and 3
       or case challenge.format
         when 'multiple_choice' then
           choice_counts.item_count <> 4
           or choice_counts.answer_count <> 1
           or ordering_counts.item_count <> 0
           or ordering_counts.answer_count <> 0
         when 'ordering' then
           ordering_counts.item_count <> 4
           or ordering_counts.answer_count <> 4
           or choice_counts.item_count <> 0
           or choice_counts.answer_count <> 0
         else true
       end
  )
  into question_count, invalid_question_count
  from public.challenge_questions question
  join public.event_challenges challenge
    on challenge.id = question.challenge_id
  join verified_event_fixture event
    on question.challenge_id = md5('wits-world-verified-challenge:' || event.event_key)::uuid
  cross join lateral (
    select
      count(choice.id) as item_count,
      count(answer.question_id) as answer_count
    from public.challenge_choices choice
    left join private.challenge_answer_keys answer
      on answer.question_id = choice.question_id
     and answer.accepted_choice_id = choice.id
    where choice.question_id = question.id
  ) choice_counts
  cross join lateral (
    select
      count(item.id) as item_count,
      count(answer.item_id) as answer_count
    from public.challenge_ordering_items item
    left join private.challenge_ordering_answer_keys answer
      on answer.question_id = item.question_id
     and answer.item_id = item.id
    where item.question_id = question.id
  ) ordering_counts
  where question.status = 'published';

  select count(distinct semantic_signature)
  into distinct_question_content_count
  from (
    select
      'multiple_choice|' || lower(btrim(question.prompt)) || '|' ||
        string_agg(lower(btrim(choice.choice_text)), '|' order by lower(btrim(choice.choice_text)))
        as semantic_signature
    from public.challenge_questions question
    join public.event_challenges challenge on challenge.id = question.challenge_id
    join verified_event_fixture event
      on challenge.id = md5('wits-world-verified-challenge:' || event.event_key)::uuid
    join public.challenge_choices choice on choice.question_id = question.id
    where challenge.format = 'multiple_choice'
    group by question.id

    union all

    select
      'ordering|' ||
        string_agg(lower(btrim(item.item_text)), '|' order by lower(btrim(item.item_text)))
        as semantic_signature
    from public.challenge_questions question
    join public.event_challenges challenge on challenge.id = question.challenge_id
    join verified_event_fixture event
      on challenge.id = md5('wits-world-verified-challenge:' || event.event_key)::uuid
    join public.challenge_ordering_items item on item.question_id = question.id
    where challenge.format = 'ordering'
    group by question.id
  ) question_content;

  select count(distinct semantic_signature)
  into distinct_ordering_set_count
  from (
    select
      string_agg(lower(btrim(item.item_text)), '|' order by lower(btrim(item.item_text)))
        as semantic_signature
    from public.challenge_questions question
    join public.event_challenges challenge on challenge.id = question.challenge_id
    join verified_event_fixture event
      on challenge.id = md5('wits-world-verified-challenge:' || event.event_key)::uuid
    join public.challenge_ordering_items item on item.question_id = question.id
    where challenge.format = 'ordering'
    group by question.id
  ) ordering_sets;

  select
    (select count(*)
     from verified_event_fixture fixture
     left join public.events stored
       on stored.id = md5('wits-world-verified-event:' || fixture.event_key)::uuid
     where stored.id is null
        or stored.title is distinct from fixture.title
        or stored.description is distinct from fixture.description
        or not st_equals(
          stored.location::geometry,
          st_setsrid(st_makepoint(fixture.longitude, fixture.latitude), 4326)
        )
        or stored.radius_metres is distinct from fixture.radius_metres
        or stored.starts_at is distinct from fixture.starts_at
        or stored.ends_at is distinct from fixture.ends_at
        or stored.is_published is distinct from fixture.is_published
        or stored.authoring_status is distinct from case
          when fixture.is_published then 'published'
          else 'draft'
        end
        or stored.version is distinct from 0
        or stored.publication_provenance is distinct from case
          when fixture.is_published then 'controlled_seed'
          else null
        end
        or stored.source_urls is distinct from fixture.source_urls)
    +
    (select count(*)
     from verified_event_fixture fixture
     left join public.event_challenges stored
       on stored.id = md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
     where stored.id is null
        or stored.event_id is distinct from md5('wits-world-verified-event:' || fixture.event_key)::uuid
        or stored.format is distinct from case
          when fixture.event_number <= 5 then 'multiple_choice'
          else 'ordering'
        end
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed')
    +
    (select count(*)
     from verified_mcq_fixture fixture
     join verified_event_fixture event using (event_key)
     left join public.challenge_questions stored
       on stored.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
     where stored.id is null
        or stored.challenge_id is distinct from md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
        or stored.prompt is distinct from fixture.prompt
        or stored.difficulty is distinct from case event.event_number
          when 1 then 1 when 2 then 1 when 3 then 2 when 4 then 2 else 3
        end
        or stored.explanation is distinct from fixture.explanation
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed'
        or stored.source_urls is distinct from case
          when fixture.event_key = 'arts' and fixture.question_position = 10
            then array['https://www.wits.ac.za/wam/contact-us/']::text[]
          when fixture.event_key = 'civic' and fixture.question_position = 8
            then array[
              'https://www.nobelprize.org/prizes/medicine/2002/brenner/facts/',
              'https://www.wits.ac.za/news/latest-news/general-news/2024/2024-04/science-meets-history-at-adler-museum-of-medicine.html'
            ]::text[]
          else array['https://wits100.wits.ac.za/']::text[]
        end)
    +
    (select count(*)
     from verified_mcq_fixture fixture
     cross join generate_series(1, 4) expected(authoring_position)
     left join public.challenge_choices stored
       on stored.id = md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || expected.authoring_position)::uuid
     where stored.id is null
        or stored.question_id is distinct from md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
        or stored.authoring_position is distinct from expected.authoring_position
        or stored.choice_text is distinct from case expected.authoring_position
          when ((fixture.question_position - 1) % 4) + 1 then fixture.correct_choice
          when (((fixture.question_position - 1) % 4) + 1) % 4 + 1 then fixture.distractor_one
          when (((fixture.question_position - 1) % 4) + 2) % 4 + 1 then fixture.distractor_two
          else fixture.distractor_three
        end)
    +
    (select count(*)
     from verified_mcq_fixture fixture
     left join private.challenge_answer_keys stored
       on stored.question_id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
     where stored.question_id is null
        or stored.accepted_choice_id is distinct from md5('wits-world-verified-choice:' || fixture.event_key || ':' || fixture.question_position || ':' || (((fixture.question_position - 1) % 4) + 1))::uuid)
    +
    (select count(*)
     from verified_ordering_question_fixture fixture
     join verified_event_fixture event using (event_key)
     left join public.challenge_questions stored
       on stored.id = md5('wits-world-verified-question:' || fixture.event_key || ':' || fixture.question_position)::uuid
     where stored.id is null
        or stored.challenge_id is distinct from md5('wits-world-verified-challenge:' || fixture.event_key)::uuid
        or stored.prompt is distinct from fixture.prompt
        or stored.difficulty is distinct from case event.event_number
          when 6 then 1 when 7 then 1 when 8 then 2 when 9 then 2 else 3
        end
        or stored.explanation is distinct from fixture.explanation
        or stored.status is distinct from 'published'
        or stored.version is distinct from 1
        or stored.publication_provenance is distinct from 'controlled_seed'
        or stored.source_urls is distinct from fixture.source_urls)
    +
    (select count(*)
     from verified_ordering_question_milestone_fixture membership
     join verified_milestone_fixture milestone
       on milestone.milestone_position = membership.milestone_position
     left join public.challenge_ordering_items stored
       on stored.id = md5('wits-world-verified-ordering-item:' || membership.event_key || ':' || membership.question_position || ':' || membership.item_position)::uuid
     where stored.id is null
        or stored.question_id is distinct from md5('wits-world-verified-question:' || membership.event_key || ':' || membership.question_position)::uuid
        or stored.item_text is distinct from milestone.milestone_text)
    +
    (select count(*)
     from verified_ordering_question_milestone_fixture membership
     left join private.challenge_ordering_answer_keys stored
       on stored.question_id = md5('wits-world-verified-question:' || membership.event_key || ':' || membership.question_position)::uuid
      and stored.item_id = md5('wits-world-verified-ordering-item:' || membership.event_key || ':' || membership.question_position || ':' || membership.item_position)::uuid
     where stored.question_id is null
        or stored.correct_position is distinct from membership.item_position)
  into canonical_conflict_count;

  if canonical_conflict_count <> 0 then
    raise exception 'Verified event seed canonical conflict: % deterministic rows or relationships differ from the canonical fixture; no existing content was overwritten',
      canonical_conflict_count;
  end if;

  if event_count <> 10
     or distinct_location_count <> 10
     or challenge_count <> 10
     or question_count <> 100
     or distinct_question_content_count <> 100
     or distinct_ordering_set_count <> 50
     or invalid_event_count <> 0
     or invalid_question_count <> 0 then
    raise exception 'Verified event seed conflict: expected 10 valid distinct locations, 10 published challenges, 100 unique valid questions, and 50 unique ordering sets; found events %, locations %, invalid events %, challenges %, questions %, unique content %, ordering sets %, invalid questions %',
      event_count, distinct_location_count, invalid_event_count, challenge_count,
      question_count, distinct_question_content_count, distinct_ordering_set_count,
      invalid_question_count;
  end if;

  if not exists (
    select 1
    from public.card_definitions card
    -- Keep this predicate identical to loadActiveCardDefinitions(), the
    -- server-authoritative reward candidate query.
    where card.is_active = true
      and card.authoring_status = 'published'
      and card.reward_eligible = true
      and card.rarity = 'common'
  ) then
    raise exception 'Verified events require at least one active, published, reward-eligible Common card';
  end if;
end;
$$;
