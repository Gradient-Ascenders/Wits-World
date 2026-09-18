-- Issue #261 initial automatic-placement catalogue. The reviewed site points
-- and evidence come from the placement-v1 policy. Coverage geometry is a
-- conservative union of 60-metre catchments around each zone's member sites;
-- it is not a route, property-boundary, accessibility, or safety claim.
do $seed$
declare
  policy_reviewed_at constant timestamptz := '2026-09-18T18:28:05Z';
  campus_map_url constant text :=
    'https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf';
begin
  if to_regclass('public.event_placement_policy_versions') is null then
    return;
  end if;

  insert into public.event_placement_policy_versions (
    id,
    automatic_target,
    preferred_assignments_per_zone,
    mandatory_assignments_per_zone,
    minimum_separation_metres,
    rotation_timezone,
    rotation_local_time,
    replacements_per_rotation,
    site_cooldown_buckets,
    preview_ttl_minutes,
    maximum_pin_hours,
    maximum_pause_hours,
    maximum_exclusion_hours,
    review_provenance,
    created_at
  ) values (
    'placement-v1',
    6,
    2,
    1,
    150,
    'Africa/Johannesburg',
    '04:00:00',
    2,
    2,
    15,
    168,
    168,
    720,
    'Issue #259 reviewed policy',
    policy_reviewed_at
  )
  on conflict (id) do nothing;

  if not exists (
    select 1
      from public.event_placement_policy_versions policy
     where policy.id = 'placement-v1'
       and policy.automatic_target = 6
       and policy.preferred_assignments_per_zone = 2
       and policy.mandatory_assignments_per_zone = 1
       and policy.minimum_separation_metres = 150
       and policy.rotation_timezone = 'Africa/Johannesburg'
       and policy.rotation_local_time = '04:00:00'
       and policy.replacements_per_rotation = 2
       and policy.site_cooldown_buckets = 2
       and policy.preview_ttl_minutes = 15
       and policy.maximum_pin_hours = 168
       and policy.maximum_pause_hours = 168
       and policy.maximum_exclusion_hours = 720
  ) then
    raise exception 'placement-v1 conflicts with the reviewed policy';
  end if;

  create temporary table placement_site_fixture (
    zone_key text not null,
    site_key text primary key,
    site_name text not null,
    longitude double precision not null,
    latitude double precision not null,
    source_urls text[] not null
  ) on commit drop;

  insert into placement_site_fixture values
    (
      'east_campus', 'great_hall', 'Great Hall',
      28.0303750, -26.1920468,
      array[campus_map_url, 'https://www.openstreetmap.org/way/452712704']
    ),
    (
      'east_campus', 'william_cullen_library', 'William Cullen Library',
      28.0293495, -26.1906928,
      array[campus_map_url, 'https://www.openstreetmap.org/way/26327942']
    ),
    (
      'east_campus', 'the_matrix', 'The Matrix',
      28.0307564, -26.1895929,
      array[campus_map_url, 'https://www.openstreetmap.org/way/739521835']
    ),
    (
      'east_campus', 'amphitheatre', 'Amphitheatre',
      28.0300541, -26.1900839,
      array[campus_map_url, 'https://www.openstreetmap.org/way/739545292']
    ),
    (
      'west_campus', 'origins_centre', 'Origins Centre',
      28.0283091, -26.1929795,
      array[
        'https://www.wits.ac.za/origins/plan-your-visit/',
        'https://www.openstreetmap.org/way/26327903'
      ]
    ),
    (
      'west_campus', 'digital_dome', 'Wits Anglo American Digital Dome',
      28.0283502, -26.1884929,
      array[
        'https://digitaldome.wits.ac.za/plan-your-visit/',
        'https://www.openstreetmap.org/way/223889931'
      ]
    ),
    (
      'west_campus', 'science_stadium', 'Wits Science Stadium',
      28.0258204, -26.1906244,
      array[campus_map_url, 'https://www.openstreetmap.org/way/235891611']
    ),
    (
      'west_campus', 'msl', 'Mathematical Sciences Laboratory (MSL)',
      28.0268144, -26.1904425,
      array[campus_map_url, 'https://www.wits.ac.za/csam/contact-us/']
    ),
    (
      'arts_and_community', 'school_of_arts', 'Wits School of Arts',
      28.0326024, -26.1920348,
      array[campus_map_url, 'https://www.openstreetmap.org/way/235955328']
    ),
    (
      'arts_and_community', 'wits_art_museum', 'Wits Art Museum',
      28.0328645, -26.1928427,
      array[
        'https://www.wits.ac.za/wam/contact-us/',
        'https://www.openstreetmap.org/way/739519845'
      ]
    ),
    (
      'arts_and_community', 'wits_club', 'Wits Club',
      28.0258017, -26.1857438,
      array[campus_map_url, 'https://www.openstreetmap.org/way/618335711']
    );

  insert into public.event_placement_zones (
    id,
    policy_version_id,
    zone_key,
    name,
    area,
    status,
    source_urls,
    review_provenance,
    reviewed_at,
    activated_at,
    created_at,
    updated_at
  )
  select
    md5('wits-world-placement-zone:' || fixture.zone_key)::uuid,
    'placement-v1',
    fixture.zone_key,
    case fixture.zone_key
      when 'east_campus' then 'East Campus'
      when 'west_campus' then 'West Campus'
      else 'Arts and Community'
    end,
    st_multi(
      st_collectionextract(
        st_unaryunion(
          st_collect(
            st_buffer(
              st_setsrid(
                st_makepoint(fixture.longitude, fixture.latitude),
                4326
              )::geography,
              60
            )::geometry
          )
        ),
        3
      )
    )::geometry(MultiPolygon, 4326),
    'active',
    array[campus_map_url],
    'controlled_policy',
    policy_reviewed_at,
    policy_reviewed_at,
    policy_reviewed_at,
    policy_reviewed_at
  from placement_site_fixture fixture
  group by fixture.zone_key
  on conflict (policy_version_id, zone_key) do nothing;

  insert into public.event_placement_sites (
    id,
    zone_id,
    policy_version_id,
    site_key,
    name,
    location,
    maximum_interaction_radius_metres,
    status,
    source_urls,
    review_provenance,
    reviewed_at,
    activated_at,
    created_at,
    updated_at
  )
  select
    md5('wits-world-placement-site:' || fixture.site_key)::uuid,
    md5('wits-world-placement-zone:' || fixture.zone_key)::uuid,
    'placement-v1',
    fixture.site_key,
    fixture.site_name,
    st_setsrid(
      st_makepoint(fixture.longitude, fixture.latitude),
      4326
    )::geography,
    60,
    'active',
    fixture.source_urls,
    'controlled_policy',
    policy_reviewed_at,
    policy_reviewed_at,
    policy_reviewed_at,
    policy_reviewed_at
  from placement_site_fixture fixture
  on conflict (policy_version_id, site_key) do nothing;

  if (
    select count(*)
      from public.event_placement_zones
     where policy_version_id = 'placement-v1'
       and status = 'active'
       and review_provenance = 'controlled_policy'
  ) <> 3 then
    raise exception 'placement-v1 requires exactly three active reviewed zones';
  end if;

  if (
    select count(*)
      from public.event_placement_sites
     where policy_version_id = 'placement-v1'
       and status = 'active'
       and maximum_interaction_radius_metres = 60
       and review_provenance = 'controlled_policy'
  ) <> 11 then
    raise exception 'placement-v1 requires exactly eleven active reviewed sites';
  end if;

  if exists (
    select 1
      from placement_site_fixture fixture
      join public.event_placement_sites site
        on site.policy_version_id = 'placement-v1'
       and site.site_key = fixture.site_key
      join public.event_placement_zones zone on zone.id = site.zone_id
     where site.name is distinct from fixture.site_name
        or zone.zone_key is distinct from fixture.zone_key
        or site.maximum_interaction_radius_metres <> 60
        or site.source_urls is distinct from fixture.source_urls
        or not st_equals(
          site.location::geometry,
          st_setsrid(
            st_makepoint(fixture.longitude, fixture.latitude),
            4326
          )
        )
  ) then
    raise exception 'placement-v1 site catalogue conflicts with reviewed data';
  end if;

  insert into public.event_placement_state (
    singleton,
    current_policy_version_id,
    version,
    updated_at
  ) values (
    true,
    'placement-v1',
    0,
    policy_reviewed_at
  )
  on conflict (singleton) do nothing;
end;
$seed$;
