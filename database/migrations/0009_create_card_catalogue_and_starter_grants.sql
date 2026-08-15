alter table public.card_definitions
  add column hp integer,
  add column power integer;

alter table public.card_definitions
  add constraint card_definitions_creature_stats_check
    check (
      (category = 'creature'
        and hp is not null
        and hp > 0
        and power is not null
        and power >= 0)
      or
      (category = 'power' and hp is null and power is null)
    );

create table public.card_moves (
  id uuid primary key default gen_random_uuid(),
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  position smallint not null,
  name text not null,
  move_type text not null,
  effect_type text not null,
  effect_value integer,
  power_cost integer not null,

  constraint card_moves_card_position_unique
    unique (card_definition_id, position),
  constraint card_moves_position_check
    check (position > 0),
  constraint card_moves_name_not_blank
    check (btrim(name) <> ''),
  constraint card_moves_type_check
    check (move_type in ('basic', 'wit', 'grit', 'spark', 'spirit', 'mystic')),
  constraint card_moves_effect_type_check
    check (effect_type in ('damage', 'debuff', 'heal', 'buff')),
  constraint card_moves_effect_value_check
    check (effect_value is null or effect_value >= 0),
  constraint card_moves_power_cost_check
    check (power_cost >= 0)
);

create index card_moves_definition_position_idx
  on public.card_moves (card_definition_id, position);

create table public.card_effects (
  id uuid primary key default gen_random_uuid(),
  card_definition_id uuid not null
    references public.card_definitions (id) on delete restrict,
  position smallint not null,
  effect_type text not null,
  effect_value integer,

  constraint card_effects_card_position_unique
    unique (card_definition_id, position),
  constraint card_effects_position_check
    check (position > 0),
  constraint card_effects_type_check
    check (effect_type in ('damage', 'debuff', 'heal', 'buff')),
  constraint card_effects_value_check
    check (effect_value is null or effect_value >= 0)
);

create index card_effects_definition_position_idx
  on public.card_effects (card_definition_id, position);

create function public.validate_card_child_category()
returns trigger
language plpgsql
as $$
declare
  card_category text;
begin
  select category
    into card_category
    from public.card_definitions
   where id = new.card_definition_id;

  if tg_table_name = 'card_moves' and card_category is distinct from 'creature' then
    raise exception 'Card moves require a Creature card definition'
      using errcode = '23514';
  end if;

  if tg_table_name = 'card_effects' and card_category is distinct from 'power' then
    raise exception 'Card effects require a Power card definition'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_moves_category_guard
before insert or update on public.card_moves
for each row execute function public.validate_card_child_category();

create trigger card_effects_category_guard
before insert or update on public.card_effects
for each row execute function public.validate_card_child_category();

create function public.validate_card_definition_category_change()
returns trigger
language plpgsql
as $$
begin
  if new.category = 'creature'
     and exists (
       select 1
       from public.card_effects
       where card_definition_id = new.id
     ) then
    raise exception 'A card with effects cannot be changed to Creature'
      using errcode = '23514';
  end if;

  if new.category = 'power'
     and exists (
       select 1
       from public.card_moves
       where card_definition_id = new.id
     ) then
    raise exception 'A card with moves cannot be changed to Power'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger card_definition_category_guard
before update of category on public.card_definitions
for each row execute function public.validate_card_definition_category_change();

create table public.player_starter_grants (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null
    references public.players (id) on delete restrict,
  affinity text not null,
  granted_at timestamptz not null default now(),

  constraint player_starter_grants_player_unique
    unique (player_id),
  constraint player_starter_grants_identity_unique
    unique (id, player_id),
  constraint player_starter_grants_affinity_check
    check (affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic'))
);

alter table public.player_cards
  add column source_starter_grant_id uuid;

alter table public.player_cards
  add constraint player_cards_source_starter_grant_fk
    foreign key (source_starter_grant_id, player_id)
    references public.player_starter_grants (id, player_id)
    on delete restrict;

alter table public.player_cards
  drop constraint player_cards_source_check;

alter table public.player_cards
  add constraint player_cards_source_check
    check (
      (acquisition_kind = 'event_reward'
        and source_completion_id is not null
        and source_starter_grant_id is null)
      or
      (acquisition_kind = 'starter'
        and source_completion_id is null
        and source_starter_grant_id is not null)
    );

create unique index player_cards_starter_grant_definition_unique_idx
  on public.player_cards (source_starter_grant_id, card_definition_id)
  where acquisition_kind = 'starter'
    and source_starter_grant_id is not null;

create index player_cards_starter_grant_idx
  on public.player_cards (source_starter_grant_id)
  where source_starter_grant_id is not null;
