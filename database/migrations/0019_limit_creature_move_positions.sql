-- Deployment preflight: legacy author-created rows above position four require
-- explicit content review. This migration must never delete, renumber, or
-- truncate them silently.
do $$
begin
  if exists (
    select 1
    from public.card_moves
    where position > 4
  ) then
    raise exception
      'Migration 0019 cannot limit Creature move positions while card_moves rows above position 4 exist; review and remediate those rows first';
  end if;
end;
$$;

alter table public.card_moves
  drop constraint card_moves_position_check;

alter table public.card_moves
  add constraint card_moves_position_check
    check (position between 1 and 4);
