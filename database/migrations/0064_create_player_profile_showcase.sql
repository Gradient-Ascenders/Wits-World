create table public.player_profiles (
  player_id uuid primary key references public.players(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  bio text not null default '' check (char_length(bio) <= 280),
  degree text not null default '' check (char_length(degree) <= 100),
  study_year text not null default '' check (char_length(study_year) <= 32),
  avatar_data_url text check (char_length(avatar_data_url) <= 100000),
  status_emoji text not null default '' check (char_length(status_emoji) <= 16),
  status_text text not null default '' check (char_length(status_text) <= 80),
  status_expires_at timestamptz,
  is_public boolean not null default false,
  activity_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.player_profile_cards (
  player_id uuid not null references public.players(id) on delete cascade,
  owned_card_id uuid not null references public.player_cards(id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  primary key (player_id, position),
  unique (player_id, owned_card_id)
);

-- Showcasing never prevents a transfer or evolution of an owned copy.
create function public.remove_transferred_profile_card()
returns trigger language plpgsql as $$
begin
  delete from public.player_profile_cards
   where owned_card_id = new.id and player_id <> new.player_id;
  return new;
end;
$$;

create trigger remove_transferred_profile_card
after update of player_id on public.player_cards
for each row when (old.player_id is distinct from new.player_id)
execute function public.remove_transferred_profile_card();

-- Personal metadata must disappear with account deletion, including old rows.
create function public.purge_unavailable_player_profile()
returns trigger language plpgsql as $$
begin
  if new.lifecycle_status = 'deleted' then
    delete from public.player_profile_cards where player_id = new.id;
    delete from public.player_profiles where player_id = new.id;
  end if;
  return new;
end;
$$;

create trigger purge_unavailable_player_profile
after update of lifecycle_status on public.players
for each row execute function public.purge_unavailable_player_profile();
