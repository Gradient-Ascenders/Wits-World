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
values
  (
    '00000000-0000-4000-8000-000000000019',
    'Basic Demo - Wits Library',
    'Non-production active event for Basic event discovery and eligibility testing.',
    st_setsrid(st_makepoint(28.03120, -26.19140), 4326)::geography,
    75,
    '2026-08-01T00:00:00+02:00'::timestamptz,
    '2026-08-26T00:00:00+02:00'::timestamptz,
    true,
    'published',
    'controlled_seed'
  ),
  (
    '00000000-0000-4000-8000-000000000020',
    'Basic Demo - Upcoming Campus Event',
    'Non-production upcoming event for Basic availability-state testing.',
    st_setsrid(st_makepoint(28.03200, -26.19180), 4326)::geography,
    75,
    '2026-08-20T00:00:00+02:00'::timestamptz,
    '2026-08-30T00:00:00+02:00'::timestamptz,
    true,
    'published',
    'controlled_seed'
  ),
  (
    '00000000-0000-4000-8000-000000000021',
    'Basic Demo - Expired Campus Event',
    'Non-production expired event for Basic availability-state testing.',
    st_setsrid(st_makepoint(28.02980, -26.19300), 4326)::geography,
    75,
    '2026-07-01T00:00:00+02:00'::timestamptz,
    '2026-07-31T23:59:59+02:00'::timestamptz,
    true,
    'published',
    'controlled_seed'
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    'Basic Demo - Unpublished Campus Event',
    'Non-production unpublished event for Basic unavailable-state testing.',
    st_setsrid(st_makepoint(28.03240, -26.19220), 4326)::geography,
    75,
    '2026-08-01T00:00:00+02:00'::timestamptz,
    '2026-08-26T00:00:00+02:00'::timestamptz,
    false,
    'draft',
    null
  )
on conflict (id) do nothing;
