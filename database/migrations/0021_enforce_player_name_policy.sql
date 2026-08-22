-- Migration 0020 is already applied to the shared development database. Keep
-- its checksum stable and refine the nullable cross-provider Player Name
-- policy in this next migration.
alter table public.players
  drop constraint players_player_name_sanity_check;

alter table public.players
  add constraint players_player_name_policy_check
  check (
    player_name is null
    or (
      player_name = lower(player_name)
      and char_length(player_name) between 3 and 20
      and player_name ~ '^[a-z0-9_+.!#$^`~@''-]+$'
    )
  );

-- The case-insensitive partial unique index created by 0020 remains the final
-- database authority across Auth0 database and Google players.
