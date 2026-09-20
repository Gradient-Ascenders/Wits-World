-- HTTP pagination needs a stable committed view across API instances. These
-- short-lived private rows contain competitive facts and local player IDs only.
create table private.ranked_standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.ranked_seasons (id) on delete restrict,
  viewer_player_id uuid not null references public.players (id) on delete restrict,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint ranked_standings_snapshots_lifetime_check
    check (expires_at = created_at + interval '10 minutes')
);

create index ranked_standings_snapshots_expiry_idx
  on private.ranked_standings_snapshots (expires_at, id);

revoke all on table private.ranked_standings_snapshots from public;

create table private.ranked_standings_snapshot_rows (
  snapshot_id uuid not null
    references private.ranked_standings_snapshots (id) on delete cascade,
  ordinal integer not null,
  player_id uuid not null references public.players (id) on delete restrict,
  rank integer not null,
  rating integer not null,
  wins integer not null,
  losses integer not null,
  settled_match_count integer not null,
  primary key (snapshot_id, ordinal),
  unique (snapshot_id, player_id),
  constraint ranked_standings_snapshot_rows_values_check
    check (
      ordinal > 0 and rank > 0 and rating >= 100
      and wins >= 0 and losses >= 0
      and settled_match_count >= 5
      and wins + losses = settled_match_count
    )
);

revoke all on table private.ranked_standings_snapshot_rows from public;

comment on table private.ranked_standings_snapshots is
  'Viewer-bound ten-minute current-standings pagination snapshots; no Player Name is copied.';

comment on table private.ranked_standings_snapshot_rows is
  'Stable competitive facts for one short-lived traversal; display names resolve from current player state.';
