create table public.cpu_matches (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  player_deck_id uuid,
  status text not null default 'active',
  state jsonb not null,
  version integer not null default 0,
  turn_started_at timestamptz,
  turn_deadline timestamptz,
  winner text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cpu_matches_player_deck_fk
    foreign key (player_deck_id)
    references public.player_decks (id)
    on delete set null,
  constraint cpu_matches_status_check
    check (status in ('active', 'completed')),
  constraint cpu_matches_version_check
    check (version >= 0),
  constraint cpu_matches_winner_check
    check (winner is null or winner in ('player', 'cpu')),
  constraint cpu_matches_completion_state_check
    check (
      (status = 'active' and completed_at is null and winner is null)
      or
      (status = 'completed' and completed_at is not null and winner is not null)
    ),
  constraint cpu_matches_deadline_state_check
    check (turn_deadline is null or turn_started_at is not null),
  constraint cpu_matches_timestamps_valid
    check (updated_at >= created_at)
);

create unique index cpu_matches_one_active_per_player_idx
  on public.cpu_matches (player_id)
  where status = 'active';

create index cpu_matches_player_history_idx
  on public.cpu_matches (player_id, completed_at desc, id)
  where status = 'completed';

create table public.cpu_match_cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.cpu_matches (id) on delete restrict,
  side text not null,
  position smallint not null,
  owned_card_id uuid,
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  snapshot jsonb not null,

  constraint cpu_match_cards_side_check
    check (side in ('player', 'cpu')),
  constraint cpu_match_cards_position_check
    check (position between 1 and 5),
  constraint cpu_match_cards_primary_key
    unique (match_id, side, position),
  constraint cpu_match_cards_owned_id_check
    check (side = 'cpu' or owned_card_id is not null)
);

create index cpu_match_cards_match_idx
  on public.cpu_match_cards (match_id, side, position);

create table public.cpu_match_rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.cpu_matches (id) on delete restrict,
  round_number integer not null,
  state_before jsonb not null,
  state_after jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),

  constraint cpu_match_rounds_round_number_check
    check (round_number > 0),
  constraint cpu_match_rounds_identity_unique
    unique (match_id, round_number),
  constraint cpu_match_rounds_match_identity_unique
    unique (id, match_id)
);

create index cpu_match_rounds_match_idx
  on public.cpu_match_rounds (match_id, round_number);

create table public.cpu_match_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null
    references public.cpu_matches (id) on delete restrict,
  round_id uuid not null,
  sequence integer not null,
  side text not null,
  submission_id uuid,
  action jsonb not null,
  result jsonb not null,
  response jsonb,
  created_at timestamptz not null default now(),

  constraint cpu_match_actions_side_check
    check (side in ('player', 'cpu')),
  constraint cpu_match_actions_sequence_check
    check (sequence > 0),
  constraint cpu_match_actions_round_fk
    foreign key (round_id, match_id)
    references public.cpu_match_rounds (id, match_id)
    on delete restrict,
  constraint cpu_match_actions_identity_unique
    unique (match_id, sequence),
  constraint cpu_match_actions_submission_unique
    unique (match_id, submission_id)
);

create index cpu_match_actions_round_idx
  on public.cpu_match_actions (round_id, sequence);

create index cpu_match_actions_match_idx
  on public.cpu_match_actions (match_id, sequence);
