-- Migration 0019 was applied to the shared development database before the
-- final Auth0-backed player-name decision. Preserve its checksum and replace
-- the temporary presentation field without treating player-entered values as
-- trusted Auth0 usernames.
alter table public.players
  drop constraint players_display_name_check;

alter table public.players
  rename column display_name to player_name;

-- Temporary display names were not authentication-provider data. Existing
-- players are populated from the validated Auth0 claim on their next request.
update public.players
   set player_name = null
 where player_name is not null;

alter table public.players
  add constraint players_player_name_sanity_check
  check (
    player_name is null
    or (
      player_name = btrim(player_name)
      and char_length(player_name) > 0
      and player_name !~ '[[:cntrl:]]'
    )
  );

create unique index players_player_name_case_insensitive_unique
  on public.players (lower(player_name))
  where player_name is not null;
