-- Explicitly reviewed fixture IDs from the 8 October Neon inventory.
-- Operator-only: run in a transaction after reviewing the target and this list.
-- Keep immutable history and never disable its triggers or foreign keys.
create temporary table cleanup_fixture_events (id uuid primary key) on commit drop;
insert into cleanup_fixture_events
select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
from generate_series(18,31) n;
insert into cleanup_fixture_events values
  ('ff5e1652-7a75-4a90-b24c-bb69535c1d80'),
  ('77f87d8a-6934-4160-9b13-026ed0b2a72f'),
  ('f89ae181-01c3-4903-a9f4-c4b9b74f3412'),
  ('fefec143-fedd-43dd-8f9b-6d96bc021316');

do $$
begin
  if exists (
    select 1 from public.events e join cleanup_fixture_events f on f.id=e.id
    where not (lower(e.title) ~ '(^|[^a-z])(demo|test|testing|fixture|sample)([^a-z]|$)'
      or lower(e.description) like '%non-production%')
  ) then
    raise exception 'A reviewed fixture ID no longer has its expected fixture label';
  end if;
end;
$$;

update public.campaigns c
set status='retired',retired_at=now(),version=version+1,updated_at=now()
where c.status='published' and (
  exists(select 1 from public.campaign_events m join cleanup_fixture_events f on f.id=m.event_id where m.campaign_id=c.id)
  or exists(select 1 from public.campaign_trails m join public.trail_events s on s.trail_id=m.trail_id
    join cleanup_fixture_events f on f.id=s.event_id where m.campaign_id=c.id)
);
update public.trails t set status='retired',retired_at=now(),updated_at=now()
where t.status='published' and exists (
  select 1 from public.trail_events s join cleanup_fixture_events f on f.id=s.event_id where s.trail_id=t.id
);
update public.events e
set is_published=false,authoring_status='retired',retired_at=now(),version=version+1,updated_at=now()
from cleanup_fixture_events f where f.id=e.id and e.authoring_status='published';
update public.event_challenges c
set status='retired',version=version+1,updated_at=now()
from cleanup_fixture_events f where f.id=c.event_id and c.status='published';
update public.challenge_questions q
set status='retired',version=q.version+1,updated_at=now()
from public.event_challenges c join cleanup_fixture_events f on f.id=c.event_id
where q.challenge_id=c.id and q.status='published';

-- Return only unused, never-published review drafts so they can be deleted.
-- A restrictive FK failure rolls back the entire per-event deletion, not its history.
do $$
declare
  target record;
begin
  for target in
    select e.id from public.events e join cleanup_fixture_events f on f.id=e.id
    where e.authoring_status in ('draft','in_review','approved')
      and not exists(select 1 from public.challenge_attempts a where a.event_id=e.id)
      and not exists(select 1 from public.event_completions c where c.event_id=e.id)
      and not exists(select 1 from public.event_challenges c where c.event_id=e.id and c.status in ('published','retired'))
      and not exists(select 1 from public.event_challenges c join public.challenge_questions q on q.challenge_id=c.id
        where c.event_id=e.id and q.status in ('published','retired'))
    for update of e
  loop
    begin
      update public.events set authoring_status='draft',submitted_by_player_id=null,submitted_at=null,
        reviewed_by_player_id=null,reviewed_at=null,version=version+1,updated_at=now()
      where id=target.id and authoring_status in ('in_review','approved');
      update public.event_challenges set status='draft',submitted_by_player_id=null,submitted_at=null,
        reviewed_by_player_id=null,reviewed_at=null,version=version+1,updated_at=now()
      where event_id=target.id and status in ('in_review','approved');
      update public.challenge_questions q set status='draft',submitted_by_player_id=null,submitted_at=null,
        reviewed_by_player_id=null,reviewed_at=null,version=q.version+1,updated_at=now()
      from public.event_challenges c where c.id=q.challenge_id and c.event_id=target.id and q.status in ('in_review','approved');
      delete from private.challenge_answer_keys where question_id in (
        select q.id from public.challenge_questions q join public.event_challenges c on c.id=q.challenge_id where c.event_id=target.id);
      delete from private.challenge_ordering_answer_keys where question_id in (
        select q.id from public.challenge_questions q join public.event_challenges c on c.id=q.challenge_id where c.event_id=target.id);
      delete from public.challenge_choices where question_id in (
        select q.id from public.challenge_questions q join public.event_challenges c on c.id=q.challenge_id where c.event_id=target.id);
      delete from public.challenge_ordering_items where question_id in (
        select q.id from public.challenge_questions q join public.event_challenges c on c.id=q.challenge_id where c.event_id=target.id);
      delete from public.challenge_questions where challenge_id in (select id from public.event_challenges where event_id=target.id);
      delete from public.event_challenges where event_id=target.id;
      delete from public.events where id=target.id;
    exception when foreign_key_violation then
      raise notice 'A fixture draft has retained references; no rows in that draft were deleted';
    end;
  end loop;
end;
$$;

-- Revoked credentials are not active access. Preserve the kept account's deck/history.
-- The retired Test card and demo trail remain as immutable historical definitions.
do $$
begin
  if exists(select 1 from public.events e join cleanup_fixture_events f on f.id=e.id
    where e.is_published or e.authoring_status in ('in_review','approved')) then
    raise exception 'Fixture availability/review cleanup is incomplete';
  end if;
end;
$$;
