alter table public.players
  add column display_name text;

alter table public.players
  add constraint players_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 2 and 32
      and display_name !~ '[[:cntrl:]]'
    )
  );
