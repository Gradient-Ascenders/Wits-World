create temporary table basic_seed_cards (
  id uuid primary key,
  name text not null,
  category text not null,
  affinity text not null,
  rarity text not null,
  hp integer,
  power integer,
  description text not null
) on commit drop;

insert into basic_seed_cards (
  id, name, category, affinity, rarity, hp, power, description
)
select
  md5('wits-world-basic-card:' || affinity || ':creature:' || position)::uuid,
  initcap(affinity) || ' Creature ' || position,
  'creature',
  affinity,
  'common',
  80 + (position * 10),
  10 + position,
  'Common starter Creature for the ' || initcap(affinity) || ' affinity.'
from (
  values
    ('wit'),
    ('grit'),
    ('spark'),
    ('spirit'),
    ('mystic')
) as affinities(affinity)
cross join generate_series(1, 3) as positions(position);

insert into basic_seed_cards (
  id, name, category, affinity, rarity, hp, power, description
)
select
  md5('wits-world-basic-card:' || affinity || ':power:' || position)::uuid,
  initcap(affinity) || ' Power ' || position,
  'power',
  affinity,
  'common',
  null,
  null,
  'Common starter Power card for the ' || initcap(affinity) || ' affinity.'
from (
  values
    ('wit'),
    ('grit'),
    ('spark'),
    ('spirit'),
    ('mystic')
) as affinities(affinity)
cross join generate_series(1, 2) as positions(position);

insert into basic_seed_cards (
  id, name, category, affinity, rarity, hp, power, description
)
values
  (
    md5('wits-world-basic-card:reward:rare:creature')::uuid,
    'Spark Rare Creature',
    'creature',
    'spark',
    'rare',
    110,
    14,
    'Rare catalogue demonstration Creature.'
  ),
  (
    md5('wits-world-basic-card:reward:rare:power')::uuid,
    'Spark Rare Power',
    'power',
    'spark',
    'rare',
    null,
    null,
    'Rare catalogue demonstration Power card.'
  ),
  (
    md5('wits-world-basic-card:reward:epic:creature')::uuid,
    'Spark Epic Creature',
    'creature',
    'spark',
    'epic',
    140,
    18,
    'Epic catalogue demonstration Creature.'
  ),
  (
    md5('wits-world-basic-card:reward:epic:power')::uuid,
    'Spark Epic Power',
    'power',
    'spark',
    'epic',
    null,
    null,
    'Epic catalogue demonstration Power card.'
  ),
  (
    md5('wits-world-basic-card:reward:legendary:creature')::uuid,
    'Spark Legendary Creature',
    'creature',
    'spark',
    'legendary',
    180,
    22,
    'Legendary catalogue demonstration Creature.'
  ),
  (
    md5('wits-world-basic-card:reward:legendary:power')::uuid,
    'Spark Legendary Power',
    'power',
    'spark',
    'legendary',
    null,
    null,
    'Legendary catalogue demonstration Power card with multiple effects.'
  );

insert into public.card_definitions (
  id,
  name,
  category,
  affinity,
  rarity,
  hp,
  power,
  description,
  image_url,
  is_active,
  authoring_status
)
select
  id,
  name,
  category,
  affinity,
  rarity,
  hp,
  power,
  description,
  null,
  false,
  'draft'
from basic_seed_cards
on conflict (id) do nothing;

insert into public.card_moves (
  id,
  card_definition_id,
  position,
  name,
  move_type,
  effect_type,
  effect_value,
  modifier_stat,
  modifier_operation,
  modifier_duration_turns,
  power_cost
)
select
  md5('wits-world-basic-move:' || seed.id::text || ':basic')::uuid,
  seed.id,
  1,
  'Training Strike',
  'basic',
  'damage',
  10,
  null,
  null,
  null,
  1
from basic_seed_cards seed
join public.card_definitions definition
  on definition.id = seed.id
where seed.category = 'creature'
  and definition.authoring_status = 'draft'
on conflict (id) do update set
  card_definition_id = excluded.card_definition_id,
  position = excluded.position,
  name = excluded.name,
  move_type = excluded.move_type,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  modifier_stat = excluded.modifier_stat,
  modifier_operation = excluded.modifier_operation,
  modifier_duration_turns = excluded.modifier_duration_turns,
  power_cost = excluded.power_cost;

insert into public.card_moves (
  id,
  card_definition_id,
  position,
  name,
  move_type,
  effect_type,
  effect_value,
  modifier_stat,
  modifier_operation,
  modifier_duration_turns,
  power_cost
)
select
  md5('wits-world-basic-move:' || seed.id::text || ':affinity')::uuid,
  seed.id,
  2,
  initcap(seed.affinity) || ' Strike',
  seed.affinity,
  'damage',
  15,
  null,
  null,
  null,
  2
from basic_seed_cards seed
join public.card_definitions definition
  on definition.id = seed.id
where seed.category = 'creature'
  and definition.authoring_status = 'draft'
on conflict (id) do update set
  card_definition_id = excluded.card_definition_id,
  position = excluded.position,
  name = excluded.name,
  move_type = excluded.move_type,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  modifier_stat = excluded.modifier_stat,
  modifier_operation = excluded.modifier_operation,
  modifier_duration_turns = excluded.modifier_duration_turns,
  power_cost = excluded.power_cost;

insert into public.card_effects (
  id,
  card_definition_id,
  position,
  effect_type,
  effect_value,
  modifier_stat,
  modifier_operation,
  modifier_duration_turns
)
select
  md5('wits-world-basic-effect:' || seed.id::text || ':primary')::uuid,
  seed.id,
  1,
  'heal',
  15,
  null,
  null,
  null
from basic_seed_cards seed
join public.card_definitions definition
  on definition.id = seed.id
where seed.category = 'power'
  and definition.authoring_status = 'draft'
on conflict (id) do update set
  card_definition_id = excluded.card_definition_id,
  position = excluded.position,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  modifier_stat = excluded.modifier_stat,
  modifier_operation = excluded.modifier_operation,
  modifier_duration_turns = excluded.modifier_duration_turns;

insert into public.card_effects (
  id,
  card_definition_id,
  position,
  effect_type,
  effect_value,
  modifier_stat,
  modifier_operation,
  modifier_duration_turns
)
select
  md5('wits-world-basic-effect:' || seed.id::text || ':secondary')::uuid,
  seed.id,
  2,
  'buff',
  3,
  'damage_multiplier',
  'multiply',
  null
from basic_seed_cards seed
join public.card_definitions definition
  on definition.id = seed.id
where seed.name = 'Spark Legendary Power'
  and definition.authoring_status = 'draft'
on conflict (id) do update set
  card_definition_id = excluded.card_definition_id,
  position = excluded.position,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  modifier_stat = excluded.modifier_stat,
  modifier_operation = excluded.modifier_operation,
  modifier_duration_turns = excluded.modifier_duration_turns;

update public.card_definitions definition
set
  authoring_status = 'published',
  is_active = true,
  updated_at = now()
from basic_seed_cards seed
where definition.id = seed.id
  and definition.authoring_status = 'draft';