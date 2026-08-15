alter table public.player_cards
  add constraint player_cards_identity_unique
    unique (id, player_id);

create table public.player_decks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_decks_identity_unique
    unique (id, player_id),
  constraint player_decks_name_not_blank
    check (btrim(name) <> ''),
  constraint player_decks_timestamps_valid
    check (updated_at >= created_at)
);

create index player_decks_player_updated_idx
  on public.player_decks (player_id, updated_at desc, id);

create table public.player_deck_cards (
  deck_id uuid not null,
  player_id uuid not null,
  owned_card_id uuid not null,
  position smallint not null,
  added_at timestamptz not null default now(),

  constraint player_deck_cards_primary_key
    primary key (deck_id, position),

  constraint player_deck_cards_owned_copy_unique
    unique (deck_id, owned_card_id),

  constraint player_deck_cards_deck_fk
    foreign key (deck_id, player_id)
    references public.player_decks (id, player_id)
    on delete cascade,

  constraint player_deck_cards_owned_copy_fk
    foreign key (owned_card_id, player_id)
    references public.player_cards (id, player_id)
    on delete restrict,

  constraint player_deck_cards_position_check
    check (position between 1 and 5)
);

create index player_deck_cards_owned_copy_idx
  on public.player_deck_cards (owned_card_id);

create table public.player_deck_selections (
  player_id uuid primary key
    references public.players (id) on delete restrict,
  deck_id uuid not null,
  selected_at timestamptz not null default now(),

  constraint player_deck_selections_owned_deck_fk
    foreign key (deck_id, player_id)
    references public.player_decks (id, player_id)
    on delete cascade
);