create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location geography(Point, 4326) not null,
  radius_metres integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (btrim(title) <> ''),
  constraint events_description_not_blank check (
    description is null or btrim(description) <> ''
  ),
  constraint events_location_not_empty check (
    not st_isempty(location::geometry)
  ),
  constraint events_radius_metres_positive check (radius_metres > 0),
  constraint events_availability_valid check (ends_at > starts_at),
  constraint events_timestamps_valid check (updated_at >= created_at)
);

create index events_location_gist_idx
  on public.events
  using gist (location);
