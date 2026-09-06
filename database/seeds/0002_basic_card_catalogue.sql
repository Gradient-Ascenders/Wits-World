-- The complete ordinary catalogue is versioned by migration 0041 so stable
-- definition IDs, ownership rows, and match history move forward atomically.
-- Keep this repeatable seed as a readiness assertion rather than allowing the
-- retired pre-0041 demo roster to overwrite canonical production content.
do $$
declare
  ordinary_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'card_definitions'
      and column_name = 'catalogue_class'
  ) then
    return;
  end if;

  execute
    'select count(*)::integer
       from public.card_definitions
      where catalogue_class = ''ordinary''
        and authoring_status = ''published''
        and is_active'
    into ordinary_count;

  if ordinary_count <> 30 then
    raise exception
      'Expected 30 active published ordinary card definitions, found %',
      ordinary_count;
  end if;
end;
$$;
