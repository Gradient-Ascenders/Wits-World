alter table public.card_definitions
  add column authoring_status text;

update public.card_definitions
   set authoring_status =
     case
       when is_active then 'published'
       else 'retired'
     end;

alter table public.card_definitions
  alter column authoring_status set not null,
  alter column authoring_status set default 'draft',
  alter column is_active set default false,
  add constraint card_definitions_authoring_status_check
    check (authoring_status in ('draft', 'published', 'retired')),
  add constraint card_definitions_active_status_check
    check (
      (authoring_status = 'published' and is_active = true)
      or
      (authoring_status in ('draft', 'retired') and is_active = false)
    );

create function public.prevent_card_authoring_lifecycle_reversal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and old.authoring_status in ('published', 'retired') then
    raise exception
      'Published or retired card definition % cannot be deleted',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'UPDATE'
     and old.authoring_status = 'published' then
    if new.authoring_status not in ('published', 'retired') then
      raise exception
        'Published card definition % cannot return to draft',
        old.id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.authoring_status = 'retired'
     and new.authoring_status is distinct from old.authoring_status then
    raise exception
      'Retired card definition % cannot be republished',
      old.id
      using errcode = '55006';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger card_definitions_authoring_lifecycle_immutability
before update or delete on public.card_definitions
for each row
execute function public.prevent_card_authoring_lifecycle_reversal();

create function public.prevent_published_card_content_mutation()
returns trigger
language plpgsql
as $$
declare
  card_status text;
  card_id uuid;
begin
  if tg_table_name = 'card_definitions' then
    if old.authoring_status in ('published', 'retired') then
      if new.name is distinct from old.name
         or new.category is distinct from old.category
         or new.affinity is distinct from old.affinity
         or new.rarity is distinct from old.rarity
         or new.hp is distinct from old.hp
         or new.power is distinct from old.power
         or new.description is distinct from old.description
         or new.image_url is distinct from old.image_url then
        raise exception
          'Published or retired card definition % is immutable; create a replacement',
          old.id
          using errcode = '55006';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    card_id := new.card_definition_id;
  else
    card_id := old.card_definition_id;
  end if;

  select authoring_status
    into card_status
    from public.card_definitions
   where id = card_id;

  if card_status in ('published', 'retired') then
    raise exception
      'Moves and effects for published or retired card definition % are immutable; create a replacement',
      card_id
      using errcode = '55006';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger card_definitions_content_immutability
before update on public.card_definitions
for each row
execute function public.prevent_published_card_content_mutation();

create trigger card_moves_content_immutability
before insert or update or delete on public.card_moves
for each row
execute function public.prevent_published_card_content_mutation();

create trigger card_effects_content_immutability
before insert or update or delete on public.card_effects
for each row
execute function public.prevent_published_card_content_mutation();