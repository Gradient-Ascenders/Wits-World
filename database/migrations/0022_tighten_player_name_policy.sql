-- Migration 0021 is immutable. Tighten only its player-name check while
-- preserving nullable Google onboarding and the unique index created by 0020.
alter table public.players
  drop constraint players_player_name_policy_check;

alter table public.players
  add constraint players_player_name_policy_check
  check (
    player_name is null
    or (
      player_name = lower(player_name)
      and char_length(player_name) between 3 and 20
      and player_name ~ '^[a-z0-9_+.!#$^`~@''-]+$'
      and player_name !~
        '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$'
      and player_name !~ '^\+?[0-9]+$'
    )
  );
