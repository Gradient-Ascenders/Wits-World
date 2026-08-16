insert into public.events (
  id,
  title,
  description,
  location,
  radius_metres,
  starts_at,
  ends_at,
  is_published
)
values (
  '00000000-0000-4000-8000-000000000018',
  'Sprint 1 Demo - Wits Great Hall',
  'Non-production demonstration event for Sprint 1 location eligibility testing.',
  st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
  75,
  '2026-08-01T00:00:00+02:00'::timestamptz,
  '2026-08-26T00:00:00+02:00'::timestamptz,
  true
)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    location = excluded.location,
    radius_metres = excluded.radius_metres,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    is_published = excluded.is_published,
    updated_at = now();
