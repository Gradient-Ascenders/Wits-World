-- BASIC-18 corrective data migration. This is intentionally limited to the
-- known retired definition that prevents normalized card-definition-name
-- uniqueness from being enabled.

lock table public.card_definitions in share row exclusive mode;

do $$
declare
  definition_count integer;
  known_definition_count integer;
  retired_definition record;
  published_definition record;
begin
  select count(*)
    into definition_count
    from public.card_definitions;

  select count(*)
    into known_definition_count
    from public.card_definitions
   where id in (
     'a0ef723b-0b3f-498f-96e7-1f56a21cb3a1'::uuid,
     '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid
   );

  -- A clean database has no historical catalogue data to remediate. Any
  -- populated database must contain both exact records so partial or changed
  -- state cannot be silently treated as the approved remediation.
  if known_definition_count = 0 and definition_count = 0 then
    return;
  end if;

  if known_definition_count <> 2 then
    raise exception
      'Card-definition name remediation requires both approved Edge definitions';
  end if;

  select name, authoring_status, is_active
    into retired_definition
    from public.card_definitions
   where id = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid;

  if retired_definition.name is distinct from 'Edge'
     or retired_definition.authoring_status is distinct from 'retired'
     or retired_definition.is_active is distinct from false then
    raise exception
      'Card-definition name remediation expected retired Edge definition 4f4baa5d-e31b-44d9-b743-29b4d0db67fd';
  end if;

  select name, authoring_status, is_active
    into published_definition
    from public.card_definitions
   where id = 'a0ef723b-0b3f-498f-96e7-1f56a21cb3a1'::uuid;

  if published_definition.name is distinct from 'Edge'
     or published_definition.authoring_status is distinct from 'published'
     or published_definition.is_active is distinct from true then
    raise exception
      'Card-definition name remediation expected published Edge definition a0ef723b-0b3f-498f-96e7-1f56a21cb3a1';
  end if;

  if exists (
    select 1
      from public.card_definitions
     where lower(btrim(name)) = lower(btrim('Edge Legacy'))
  ) then
    raise exception
      'Card-definition name remediation found an existing normalized Edge Legacy name';
  end if;
end;
$$;

-- The lifecycle migration deliberately makes retired definition content
-- immutable. Disable only that guard for this checked corrective update; the
-- migration runner wraps the DDL and update in one transaction, so a failure
-- restores both the name and trigger state.
alter table public.card_definitions
  disable trigger card_definitions_content_immutability;

do $$
declare
  updated_count integer;
begin
  if not exists (
    select 1
      from public.card_definitions
     where id = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid
  ) then
    return;
  end if;

  update public.card_definitions
     set name = 'Edge Legacy'
   where id = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid
     and name = 'Edge'
     and authoring_status = 'retired'
     and is_active = false;

  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception
      'Card-definition name remediation did not update exactly one retired Edge definition';
  end if;
end;
$$;

alter table public.card_definitions
  enable trigger card_definitions_content_immutability;

do $$
declare
  duplicate_name text;
begin
  select lower(btrim(name))
    into duplicate_name
    from public.card_definitions
   group by lower(btrim(name))
  having count(*) > 1
   order by lower(btrim(name))
   limit 1;

  if duplicate_name is not null then
    raise exception
      'Card-definition name remediation left normalized duplicate name %',
      duplicate_name;
  end if;

  if exists (
    select 1
      from public.card_definitions
     where id = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid
  ) then
    if not exists (
      select 1
        from public.card_definitions
       where id = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd'::uuid
         and name = 'Edge Legacy'
         and authoring_status = 'retired'
         and is_active = false
    ) then
      raise exception
        'Card-definition name remediation did not preserve the approved retired definition state';
    end if;

    if not exists (
      select 1
        from public.card_definitions
       where id = 'a0ef723b-0b3f-498f-96e7-1f56a21cb3a1'::uuid
         and name = 'Edge'
         and authoring_status = 'published'
         and is_active = true
    ) then
      raise exception
        'Card-definition name remediation did not preserve the approved published definition state';
    end if;
  end if;
end;
$$;
