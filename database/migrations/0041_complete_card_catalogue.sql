alter table public.card_definitions
  add column catalogue_class text not null default 'ordinary',
  add column starter_eligible boolean not null default false,
  add column reward_eligible boolean not null default false,
  add column cpu_eligible boolean not null default false,
  add column image_alt text,
  add column artwork_attribution text,
  add column evolves_from_definition_id uuid
    references public.card_definitions (id) on delete restrict,
  add column evolution_copies_required smallint;

-- Existing Power cards predate typeless ordinary cards. Grandfather them as
-- specials until the canonical subset is replaced below.
update public.card_definitions
set catalogue_class = 'special'
where category = 'power';

alter table public.card_definitions
  drop constraint card_definitions_affinity_check,
  alter column affinity drop not null,
  add constraint card_definitions_catalogue_class_check
    check (catalogue_class in ('ordinary', 'special')),
  add constraint card_definitions_affinity_check
    check (
      (category = 'creature'
        and affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic'))
      or
      (category = 'power'
        and (
          affinity is null
          or (
            catalogue_class = 'special'
            and affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic')
          )
        ))
    ),
  add constraint card_definitions_image_alt_not_blank
    check (image_alt is null or btrim(image_alt) <> ''),
  add constraint card_definitions_artwork_attribution_not_blank
    check (artwork_attribution is null or btrim(artwork_attribution) <> ''),
  add constraint card_definitions_evolution_check
    check (
      (evolves_from_definition_id is null
        and evolution_copies_required is null)
      or
      (category = 'creature'
        and evolves_from_definition_id is not null
        and evolves_from_definition_id <> id
        and evolution_copies_required = 3)
    );

-- New Power cards are typeless. Preserve affinity-bearing historical Power
-- snapshots while allowing new CPU/PvP snapshots to persist a null affinity.
alter table private.async_pvp_deck_snapshot_cards
  drop constraint async_pvp_deck_snapshot_cards_affinity_check,
  alter column affinity drop not null,
  add constraint async_pvp_deck_snapshot_cards_affinity_check
    check (
      (category = 'creature'
        and affinity is not null
        and affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic'))
      or
      (category = 'power'
        and (
          affinity is null
          or affinity in ('wit', 'grit', 'spark', 'spirit', 'mystic')
        ))
    );

alter table public.card_moves
  add column rules_text text;

alter table public.card_moves
  add constraint card_moves_rules_text_not_blank
    check (rules_text is null or btrim(rules_text) <> ''),
  add constraint card_moves_identity_unique unique (id, card_definition_id);

alter table public.card_effects
  add column effect_code text,
  add column effect_config jsonb not null default '{}'::jsonb,
  add column rules_text text;

update public.card_effects
set
  effect_code = case
    when effect_type = 'damage' then 'damage'
    when effect_type = 'heal' then 'heal'
    when modifier_stat = 'power' then 'power_change'
    else 'damage_modifier'
  end,
  effect_config = jsonb_strip_nulls(jsonb_build_object(
    'target', case
      when effect_type in ('damage', 'debuff') then 'opponent'
      else 'self'
    end,
    'affinity', case when effect_type = 'damage' then 'source' end,
    'durationTurns', modifier_duration_turns
  )),
  rules_text = case
    when effect_type = 'damage' then 'Deal ' || effect_value || ' damage.'
    when effect_type = 'heal' then 'Heal ' || effect_value || ' HP.'
    when modifier_stat = 'power' and effect_type = 'buff'
      then 'Restore ' || effect_value || ' Power.'
    when modifier_stat = 'power' and effect_type = 'debuff'
      then 'The opposing Creature loses ' || effect_value || ' Power.'
    when effect_type = 'buff'
      then 'Deal ' || effect_value || '% more damage.'
    else 'The opposing Creature deals ' || effect_value || '% less damage.'
  end;

alter table public.card_effects
  alter column effect_code set not null,
  add constraint card_effects_code_check
    check (effect_code in (
      'damage',
      'heal',
      'power_change',
      'damage_modifier',
      'incoming_damage_modifier',
      'poison',
      'stun',
      'dodge',
      'reflect',
      'lifesteal',
      'restore_power_to_max',
      'self_damage',
      'swap_hp_percentages'
    )),
  add constraint card_effects_config_object_check
    check (jsonb_typeof(effect_config) = 'object'),
  add constraint card_effects_rules_text_not_blank
    check (rules_text is null or btrim(rules_text) <> '');

create function public.populate_card_effect_execution_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.effect_code is null then
    new.effect_code := case
      when new.effect_type = 'damage' then 'damage'
      when new.effect_type = 'heal' then 'heal'
      when new.modifier_stat = 'power' then 'power_change'
      else 'damage_modifier'
    end;
  end if;

  if new.effect_config = '{}'::jsonb then
    new.effect_config := jsonb_strip_nulls(jsonb_build_object(
      'target', case
        when new.effect_type in ('damage', 'debuff') then 'opponent'
        else 'self'
      end,
      'affinity', case when new.effect_type = 'damage' then 'neutral' end,
      'durationTurns', new.modifier_duration_turns
    ));
  end if;

  if new.rules_text is null then
    new.rules_text := case
      when new.effect_type = 'damage' then 'Deal ' || new.effect_value || ' neutral damage.'
      when new.effect_type = 'heal' then 'Heal ' || new.effect_value || ' HP.'
      when new.modifier_stat = 'power' and new.effect_type = 'buff'
        then 'Restore ' || new.effect_value || ' Power.'
      when new.modifier_stat = 'power' and new.effect_type = 'debuff'
        then 'The opposing Creature loses ' || new.effect_value || ' Power.'
      when new.effect_type = 'buff'
        then 'Deal ' || new.effect_value || '% more damage.'
      else 'The opposing Creature deals ' || new.effect_value || '% less damage.'
    end;
  end if;

  return new;
end;
$$;

create trigger card_effects_execution_metadata
before insert or update on public.card_effects
for each row execute function public.populate_card_effect_execution_metadata();

create table public.card_move_effects (
  id uuid primary key default gen_random_uuid(),
  card_move_id uuid not null,
  card_definition_id uuid not null,
  position smallint not null,
  effect_code text not null,
  effect_value integer,
  effect_config jsonb not null default '{}'::jsonb,
  rules_text text not null,

  constraint card_move_effects_move_fk
    foreign key (card_move_id, card_definition_id)
    references public.card_moves (id, card_definition_id)
    on delete cascade,
  constraint card_move_effects_move_position_unique
    unique (card_move_id, position),
  constraint card_move_effects_position_check
    check (position > 0),
  constraint card_move_effects_code_check
    check (effect_code in (
      'damage',
      'heal',
      'power_change',
      'damage_modifier',
      'incoming_damage_modifier',
      'poison',
      'stun',
      'dodge',
      'reflect',
      'lifesteal',
      'restore_power_to_max',
      'self_damage',
      'swap_hp_percentages'
    )),
  constraint card_move_effects_value_check
    check (effect_value is null or effect_value >= 0),
  constraint card_move_effects_config_object_check
    check (jsonb_typeof(effect_config) = 'object'),
  constraint card_move_effects_rules_text_not_blank
    check (btrim(rules_text) <> '')
);

create index card_move_effects_definition_idx
  on public.card_move_effects (card_definition_id, card_move_id, position);

insert into public.card_move_effects (
  id,
  card_move_id,
  card_definition_id,
  position,
  effect_code,
  effect_value,
  effect_config,
  rules_text
)
select
  md5('wits-world-move-effect:' || move.id::text || ':1')::uuid,
  move.id,
  move.card_definition_id,
  1,
  case
    when move.effect_type = 'damage' then 'damage'
    when move.effect_type = 'heal' then 'heal'
    when move.modifier_stat = 'power' then 'power_change'
    else 'damage_modifier'
  end,
  move.effect_value,
  jsonb_strip_nulls(jsonb_build_object(
    'target', case
      when move.effect_type in ('damage', 'debuff') then 'opponent'
      else 'self'
    end,
    'affinity', case when move.effect_type = 'damage' then 'source' end,
    'durationTurns', move.modifier_duration_turns
  )),
  case
    when move.effect_type = 'damage' then 'Deal ' || move.effect_value || ' damage.'
    when move.effect_type = 'heal' then 'Heal ' || move.effect_value || ' HP.'
    when move.modifier_stat = 'power' and move.effect_type = 'buff'
      then 'Restore ' || move.effect_value || ' Power.'
    when move.modifier_stat = 'power' and move.effect_type = 'debuff'
      then 'The opposing Creature loses ' || move.effect_value || ' Power.'
    when move.effect_type = 'buff'
      then 'Deal ' || move.effect_value || '% more damage.'
    else 'The opposing Creature deals ' || move.effect_value || '% less damage.'
  end
from public.card_moves move;

create temporary table complete_catalogue_cards (
  id uuid primary key,
  name text not null,
  category text not null,
  affinity text,
  rarity text not null,
  hp integer,
  power integer,
  description text not null,
  image_url text not null,
  image_alt text not null,
  starter_eligible boolean not null,
  reward_eligible boolean not null,
  cpu_eligible boolean not null,
  evolves_from_definition_id uuid
) on commit drop;

insert into complete_catalogue_cards (
  id, name, category, affinity, rarity, hp, power, description,
  image_url, image_alt, starter_eligible, reward_eligible, cpu_eligible,
  evolves_from_definition_id
)
values
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 'Quillip', 'creature', 'wit', 'common', 98, 11, 'A balanced Wit scholar that combines efficient attacks with a finite heal.', '/cards/quillip.webp', 'A small dark-blue owl with bright blue eyes perched beside an open book in a moonlit study.', true, true, true, null),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 'Ciphra', 'creature', 'wit', 'common', 92, 13, 'A fast Wit attacker that converts careful setup into strong burst damage.', '/cards/ciphra.webp', 'A spotted feline Creature with glowing blue markings crouched beside reflective water in a moonlit ruin.', true, true, false, null),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 'Prismole', 'creature', 'wit', 'common', 108, 9, 'A durable Wit planner that weakens opposing attacks.', '/cards/prismole.webp', 'A curious mole-like Creature with luminous crystal claws in an arcane workshop.', true, true, false, null),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 'Voltiki', 'creature', 'spark', 'common', 98, 11, 'A balanced Spark Creature with efficient damage and renewable Power.', '/cards/voltiki.webp', 'A nimble golden lizard Creature surrounded by lightning on a rocky ridge.', true, true, true, null),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 'Cinderhop', 'creature', 'spark', 'common', 92, 13, 'A fast Spark attacker that converts setup into high damage.', '/cards/cinderhop.webp', 'A bright golden rabbit-like Creature leaping from a tree as sparks trace its markings.', true, true, false, null),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 'Lumiswift', 'creature', 'spark', 'common', 108, 9, 'A defensive Spark flier that can soften one incoming attack.', '/cards/lumiswift.webp', 'A radiant golden bird soaring above a mountain valley at sunrise.', true, true, false, null),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 'Karrik', 'creature', 'grit', 'common', 98, 11, 'A balanced Grit defender with a finite recovery and guard action.', '/cards/karrik.webp', 'A sturdy armoured pangolin-like Creature standing among sunlit rocks.', true, true, true, null),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 'Rootusk', 'creature', 'grit', 'common', 92, 13, 'A forceful Grit attacker that builds momentum before a heavy rush.', '/cards/rootusk.webp', 'A tusked forest Creature covered in layered bark and moss.', true, true, false, null),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 'Ferrupine', 'creature', 'grit', 'common', 108, 9, 'A defensive Grit Creature that punishes direct Creature attacks.', '/cards/ferrupine.webp', 'A watchful porcupine-like Creature with metallic green quills on a grassy ledge.', true, true, false, null),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 'Nimbril', 'creature', 'spirit', 'common', 102, 11, 'A Spirit Creature that uses a short setup to amplify its next attack.', '/cards/nimbril.webp', 'A pale antelope-like spirit surrounded by flowing white mist beside a forest stream.', false, true, false, null),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 'Sylphane', 'creature', 'spirit', 'rare', 120, 15, 'A rare Spirit Creature capable of briefly stunning an opponent.', '/cards/sylphane.webp', 'An elegant white crane standing in mist beside a reflective lake.', false, true, false, null),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 'Sigilisk', 'creature', 'mystic', 'common', 102, 11, 'A Mystic Creature that applies persistent neutral Poison damage.', '/cards/sigilisk.webp', 'A dark lizard Creature with glowing purple spiral markings clinging to an ancient tree.', false, true, false, null),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 'Orreryx', 'creature', 'mystic', 'rare', 120, 15, 'A rare Mystic Creature that rewards long, deliberate attack sequences.', '/cards/orreryx.webp', 'A horned purple antelope-like Creature beneath a moon and floating arcane structures.', false, true, false, null),
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 'Quillume', 'creature', 'wit', 'epic', 120, 15, 'The Epic evolution of Quillip, combining deeper recovery with calculated defence.', '/cards/quillume.webp', 'A large scholarly owl with sweeping cream-and-brown wings overlooking a university city.', false, false, false, '84790040-6ea8-6155-c4b7-dec3a22ac3ab'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 'Voltadrake', 'creature', 'spark', 'epic', 115, 16, 'The Epic evolution of Voltiki, trading HP for a complete Power recharge.', '/cards/voltadrake.webp', 'A golden lightning drake coiled on a ridge beneath a stormy sky.', false, false, false, 'eca9b943-9e05-834e-c85c-1175001d897c'),
  ('8197b5ff-c2a1-5ce9-9c86-b124cdc39021', 'Karradon', 'creature', 'grit', 'epic', 130, 12, 'The Epic evolution of Karrik, built around strong defence and heavy Grit attacks.', '/cards/karradon.webp', 'A massive stone-plated pangolin Creature charging through a rocky valley.', false, false, false, '27cbcedf-1886-aa81-04b4-089b4c10cd87'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 'Nimbrael', 'creature', 'spirit', 'epic', 125, 15, 'The Epic evolution of Nimbril, restoring HP through its damaging moves.', '/cards/nimbrael.webp', 'A luminous white spirit stag with flowing antlers in an overgrown courtyard.', false, false, false, 'a230fdda-cec0-c127-b4a2-e4dd20660e3a'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 'Sigilith', 'creature', 'mystic', 'epic', 120, 16, 'The Epic evolution of Sigilisk, using deadly Poison and Power disruption.', '/cards/sigilith.webp', 'A powerful dark drake covered in glowing violet sigils beside crystal-lit water.', false, false, false, '0cba869b-d777-11f8-6b8c-c47d4d626558'),
  ('1d6416ca-2038-d640-283e-30adc2013d73', 'Axiomar', 'creature', 'wit', 'rare', 115, 14, 'A rare Wit Creature that predicts and reduces one incoming attack.', '/cards/axiomar.webp', 'A swift black-and-white long-tailed Creature surveying snowy mountain ruins.', false, true, false, null),
  ('740b5400-8362-b728-3b76-9d232077732d', 'Arcalyx', 'creature', 'spark', 'rare', 80, 18, 'A fragile rare Spark predator with an exceptionally high damage ceiling.', '/cards/arcalyx.webp', 'A lean golden feline Creature stalking across a storm-lit rocky plateau.', false, true, false, null),
  ('841b45f5-bb3c-41d4-342b-d1b8d33eefde', 'Basalox', 'creature', 'grit', 'rare', 120, 13, 'A rare Grit Creature with durable stats and direct heavy attacks.', '/cards/basalox.webp', 'A broad horned stone beast standing firmly in a grey mountain pass.', false, true, false, null),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 'Axiomarch', 'creature', 'wit', 'legendary', 140, 18, 'The Legendary evolution of Axiomar, combining foresight with decisive disruption.', '/cards/axiomarch.webp', 'A commanding black-and-white long-tailed Creature running through luminous geometric ruins.', false, false, false, '1d6416ca-2038-d640-283e-30adc2013d73'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 'Arcalyron', 'creature', 'spark', 'legendary', 100, 25, 'The Legendary evolution of Arcalyx, built as a volatile high-Power finisher.', '/cards/arcalyron.webp', 'A legendary golden lightning tiger roaring above a storm-lit city.', false, false, false, '740b5400-8362-b728-3b76-9d232077732d'),
  ('3c1356a9-d601-144e-77f3-1acfdd6aaaf9', 'Basalorn', 'creature', 'grit', 'legendary', 160, 16, 'The Legendary evolution of Basalox, providing the catalogue''s strongest defence.', '/cards/basalorn.webp', 'A colossal horned mountain guardian plated in dark rock and glowing amber seams.', false, false, false, '841b45f5-bb3c-41d4-342b-d1b8d33eefde'),
  ('0d28241f-a4f2-2cf3-52bc-dee1633b3316', 'Field Kit', 'power', null, 'common', null, null, 'Restore HP to the active Creature.', '/cards/field-kit.webp', 'A well-used field backpack with bandages and supplies resting on a campus path.', true, true, true, null),
  ('b7485793-8432-2db9-5f99-974164efa788', 'Reserve Focus', 'power', null, 'common', null, null, 'Restore Power to the active Creature.', '/cards/reserve-focus.webp', 'A glowing blue-and-gold restorative flask on a stone pedestal.', true, true, true, null),
  ('49e45cbb-f419-bf5c-2868-757646cb8dc9', 'Heavy Impact', 'power', null, 'common', null, null, 'Deal immediate neutral damage to the opposing Creature.', '/cards/heavy-impact.webp', 'A brilliant impact crater blasting stone fragments outward.', false, true, false, null),
  ('25621c1c-0722-303d-928b-4ed6e015dbd0', 'Counterplan', 'power', null, 'rare', null, null, 'Drain opposing Power and reduce its damage for two turns.', '/cards/counterplan.webp', 'A strategic table covered with glowing blue and purple plans and counters.', false, true, false, null),
  ('7f72be51-3370-8dbf-e96c-963ef4b5f29b', 'Grand Strategy', 'power', null, 'epic', null, null, 'Heal, restore Power, and strengthen the active Creature.', '/cards/grand-strategy.webp', 'A large circular strategy table projecting interlocking blue and gold pathways.', false, true, false, null),
  ('5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 'Fate Reversal', 'power', null, 'legendary', null, null, 'Exchange the active Creatures'' current HP percentages without defeating either Creature.', '/cards/fate-reversal.webp', 'A mystical balance scale exchanging streams of orange and blue energy.', false, true, false, null);

alter table public.card_definitions
  disable trigger card_definitions_authoring_lifecycle_immutability;
alter table public.card_definitions
  disable trigger card_definitions_content_immutability;
alter table public.card_definitions
  disable trigger card_definitions_curated_authoring_guard;
alter table public.card_definitions
  disable trigger card_definitions_publication_readiness;
alter table public.card_moves
  disable trigger card_moves_content_immutability;
alter table public.card_effects
  disable trigger card_effects_content_immutability;

-- Preserve existing starter ownership row IDs and deck memberships while
-- converging old affinity-specific starter Power cards on the shared typeless
-- starter pair. Historical match snapshots remain untouched.
update public.player_cards owned
set card_definition_id = case owned.card_definition_id
  when '49e45cbb-f419-bf5c-2868-757646cb8dc9'::uuid
    then '0d28241f-a4f2-2cf3-52bc-dee1633b3316'::uuid
  when '17150f89-427c-6bd8-5551-fbaf59b99808'::uuid
    then 'b7485793-8432-2db9-5f99-974164efa788'::uuid
  when 'a2405856-34a7-f0a8-d1f6-ed0f161ecdab'::uuid
    then '0d28241f-a4f2-2cf3-52bc-dee1633b3316'::uuid
  when 'b862854d-9bc1-2e2e-31f2-c3b31fefcaed'::uuid
    then 'b7485793-8432-2db9-5f99-974164efa788'::uuid
end
where owned.acquisition_kind = 'starter'
  and owned.card_definition_id in (
    '49e45cbb-f419-bf5c-2868-757646cb8dc9'::uuid,
    '17150f89-427c-6bd8-5551-fbaf59b99808'::uuid,
    'a2405856-34a7-f0a8-d1f6-ed0f161ecdab'::uuid,
    'b862854d-9bc1-2e2e-31f2-c3b31fefcaed'::uuid
  );

insert into public.card_definitions (
  id, name, category, affinity, rarity, hp, power, description, image_url,
  is_active, authoring_status, publication_provenance, catalogue_class,
  starter_eligible, reward_eligible, cpu_eligible, image_alt,
  artwork_attribution, evolves_from_definition_id,
  evolution_copies_required
)
select
  card.id,
  card.name,
  card.category,
  card.affinity,
  card.rarity,
  card.hp,
  card.power,
  card.description,
  card.image_url,
  true,
  'published',
  'controlled_seed',
  'ordinary',
  card.starter_eligible,
  card.reward_eligible,
  card.cpu_eligible,
  card.image_alt,
  'Original project artwork created with ChatGPT-Web[GPT-5.6 Sol] and curated by the Wits World team.',
  card.evolves_from_definition_id,
  case when card.evolves_from_definition_id is null then null else 3 end
from complete_catalogue_cards card
on conflict (id) do nothing;

update public.card_definitions definition
set
  name = card.name,
  category = card.category,
  affinity = card.affinity,
  rarity = card.rarity,
  hp = card.hp,
  power = card.power,
  description = card.description,
  image_url = card.image_url,
  image_alt = card.image_alt,
  artwork_attribution = 'Original project artwork created with ChatGPT-Web[GPT-5.6 Sol] and curated by the Wits World team.',
  catalogue_class = 'ordinary',
  starter_eligible = card.starter_eligible,
  reward_eligible = card.reward_eligible,
  cpu_eligible = card.cpu_eligible,
  evolves_from_definition_id = card.evolves_from_definition_id,
  evolution_copies_required = case
    when card.evolves_from_definition_id is null then null
    else 3
  end,
  is_active = true,
  authoring_status = 'published',
  publication_provenance = 'controlled_seed',
  version = definition.version + 1,
  updated_at = now()
from complete_catalogue_cards card
where definition.id = card.id;

-- Seven superseded affinity-specific Power definitions stay queryable for old
-- ownership and audit references but cannot enter new starters, rewards, decks,
-- or matches.
update public.card_definitions definition
set
  catalogue_class = 'special',
  starter_eligible = false,
  reward_eligible = false,
  cpu_eligible = false,
  is_active = false,
  authoring_status = 'retired',
  version = definition.version + 1,
  updated_at = now()
where definition.id in (
  '17150f89-427c-6bd8-5551-fbaf59b99808'::uuid,
  'a2405856-34a7-f0a8-d1f6-ed0f161ecdab'::uuid,
  'b862854d-9bc1-2e2e-31f2-c3b31fefcaed'::uuid,
  'c1db21b9-944e-f9d6-fa2c-7d14702f41d4'::uuid,
  '1f991679-3269-163f-4e74-b75a738a2bee'::uuid,
  '76f057c6-efab-38d9-9bcf-298d5c794f1a'::uuid,
  '4e7b34e3-4f31-33c1-5da5-000570b3d4f3'::uuid
);

delete from public.card_moves move
using complete_catalogue_cards card
where move.card_definition_id = card.id;

delete from public.card_effects effect
using complete_catalogue_cards card
where effect.card_definition_id = card.id;

create temporary table complete_catalogue_moves (
  card_definition_id uuid not null,
  position smallint not null,
  name text not null,
  move_type text not null,
  power_cost integer not null,
  rules_text text not null,
  legacy_effect_type text not null,
  legacy_effect_value integer not null,
  legacy_modifier_stat text,
  legacy_modifier_operation text,
  legacy_modifier_duration_turns integer,
  primary_effect_code text not null,
  primary_effect_value integer,
  primary_effect_config jsonb not null,
  primary key (card_definition_id, position)
) on commit drop;

insert into complete_catalogue_moves (
  card_definition_id, position, name, move_type, power_cost, rules_text,
  legacy_effect_type, legacy_effect_value, legacy_modifier_stat,
  legacy_modifier_operation, legacy_modifier_duration_turns,
  primary_effect_code, primary_effect_value, primary_effect_config
)
values
  -- Quillip
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 1, 'Ink Peck', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 2, 'Blind Spot', 'basic', 1, 'Deal 16 damage.', 'damage', 16, null, null, null, 'damage', 16, '{"target":"opponent","affinity":"source"}'),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 3, 'Quick Study', 'basic', 2, 'Heal this Creature by 25 HP.', 'heal', 25, null, null, null, 'heal', 25, '{"target":"self"}'),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 4, 'Eureka', 'wit', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Ciphra
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 1, 'Quick Read', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 2, 'Pattern Pounce', 'basic', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 3, 'Flash Feint', 'basic', 2, 'This Creature deals 20% more damage during its next 2 turns.', 'buff', 20, 'damage_multiplier', 'multiply', 2, 'damage_modifier', 20, '{"target":"self","durationTurns":2}'),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 4, 'Decoded Strike', 'wit', 4, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Prismole
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 1, 'Tunnel Plan', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 2, 'Facet Jab', 'basic', 1, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 3, 'Refract', 'basic', 2, 'The opposing Creature deals 15% less damage during its next 2 turns.', 'debuff', 15, 'damage_multiplier', 'multiply', 2, 'damage_modifier', 15, '{"target":"opponent","durationTurns":2}'),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 4, 'Breakthrough', 'wit', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Voltiki
  ('eca9b943-9e05-834e-c85c-1175001d897c', 1, 'Wall Dash', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 2, 'Arc Burst', 'basic', 1, 'Deal 16 damage.', 'damage', 16, null, null, null, 'damage', 16, '{"target":"opponent","affinity":"source"}'),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 3, 'Charge Coil', 'basic', 0, 'Restore 3 Power to this Creature.', 'buff', 3, 'power', 'add', null, 'power_change', 3, '{"target":"self"}'),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 4, 'Static Snap', 'spark', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Cinderhop
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 1, 'Mighty Maw', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 2, 'Quick Kick', 'basic', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 3, 'Perfect Read', 'basic', 2, 'This Creature deals 20% more damage during its next 2 turns.', 'buff', 20, 'damage_multiplier', 'multiply', 2, 'damage_modifier', 20, '{"target":"self","durationTurns":2}'),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 4, 'Calculated Claw', 'spark', 4, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Lumiswift
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 1, 'Wing Swipe', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 2, 'Swift Peck', 'basic', 1, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 3, 'Evasive Circle', 'basic', 2, 'The next incoming Creature attack deals 50% less damage.', 'buff', 50, 'damage_multiplier', 'multiply', null, 'incoming_damage_modifier', 50, '{"target":"self","charges":1}'),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 4, 'Thunderstrike Dive', 'spark', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Karrik
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 1, 'Stone Scrape', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 2, 'Tail Hammer', 'basic', 1, 'Deal 16 damage.', 'damage', 16, null, null, null, 'damage', 16, '{"target":"opponent","affinity":"source"}'),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 3, 'Dig In', 'basic', 2, 'Heal 15 HP, then make the next incoming Creature attack deal 20% less damage.', 'heal', 15, null, null, null, 'heal', 15, '{"target":"self"}'),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 4, 'Faultline Rush', 'grit', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Rootusk
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 1, 'Mud Charge', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 2, 'Thick Hide', 'basic', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 3, 'Ground Hook', 'basic', 2, 'This Creature deals 20% more damage during its next 2 turns.', 'buff', 20, 'damage_multiplier', 'multiply', 2, 'damage_modifier', 20, '{"target":"self","durationTurns":2}'),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 4, 'Relentless Rush', 'grit', 4, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Ferrupine
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 1, 'Rattle Rush', 'basic', 0, 'Deal 10 damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 2, 'Iron Quill', 'basic', 1, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 3, 'Quill Guard', 'basic', 2, 'For the next 2 incoming Creature attacks, reflect 35% of actual HP damage received as neutral damage without defeating the attacker.', 'buff', 35, 'damage_multiplier', 'multiply', null, 'reflect', 35, '{"target":"self","charges":2,"cannotDefeat":true}'),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 4, 'Barbed Return', 'grit', 3, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  -- Nimbril
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 1, 'Gentle Nudge', 'basic', 0, 'Deal 11 damage.', 'damage', 11, null, null, null, 'damage', 11, '{"target":"opponent","affinity":"source"}'),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 2, 'Mist Veil', 'basic', 1, 'Deal 16 damage.', 'damage', 16, null, null, null, 'damage', 16, '{"target":"opponent","affinity":"source"}'),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 3, 'Echo Horn', 'basic', 1, 'Deal 10 damage, then make the next damaging Creature move deal 50% more damage.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 4, 'Resonant Charge', 'spirit', 3, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Sylphane
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 1, 'Feather Cut', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 2, 'Driftstep', 'basic', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 3, 'Soul Chime', 'spirit', 4, 'Deal 10 damage and stun the opposing Creature until the end of its next turn.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 4, 'Veilstorm', 'spirit', 3, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Sigilisk
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 1, 'Glyph Flick', 'basic', 0, 'Deal 11 damage.', 'damage', 11, null, null, null, 'damage', 11, '{"target":"opponent","affinity":"source"}'),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 2, 'Scale Swipe', 'basic', 1, 'Deal 16 damage.', 'damage', 16, null, null, null, 'damage', 16, '{"target":"opponent","affinity":"source"}'),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 3, 'Hexstep', 'basic', 3, 'Deal 5 damage and apply Poison for 8 neutral damage at the end of the opponent''s next 3 turns.', 'damage', 5, null, null, null, 'damage', 5, '{"target":"opponent","affinity":"source"}'),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 4, 'Arcane Pulse', 'mystic', 3, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Orreryx
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 1, 'Astral Horn', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 2, 'Orbital Ram', 'basic', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 3, 'Astral Alignment', 'mystic', 2, 'Deal 8 damage, then deal 15% more damage during this Creature''s next 3 turns.', 'damage', 8, null, null, null, 'damage', 8, '{"target":"opponent","affinity":"source"}'),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 4, 'Starfall', 'mystic', 3, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  -- Quillume
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 1, 'Quill Barrage', 'basic', 0, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 2, 'Calculated Dive', 'basic', 1, 'Deal 24 damage.', 'damage', 24, null, null, null, 'damage', 24, '{"target":"opponent","affinity":"source"}'),
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 3, 'Deep Study', 'wit', 4, 'Heal this Creature by 45 HP.', 'heal', 45, null, null, null, 'heal', 45, '{"target":"self"}'),
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 4, 'Masterstroke', 'wit', 5, 'Deal 35 damage, then make the next incoming Creature attack deal 15% less damage.', 'damage', 35, null, null, null, 'damage', 35, '{"target":"opponent","affinity":"source"}'),
  -- Voltadrake
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 1, 'Thunder Claw', 'basic', 0, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 2, 'Aerial Rush', 'basic', 1, 'Deal 24 damage.', 'damage', 24, null, null, null, 'damage', 24, '{"target":"opponent","affinity":"source"}'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 3, 'Overcharge', 'spark', 0, 'Lose 25 HP, then restore this Creature to maximum Power. Cannot be used at 25 HP or less.', 'buff', 0, 'power', 'add', null, 'self_damage', 25, '{"target":"self","neutral":true,"bypassDefense":true,"minimumHpExclusive":25}'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 4, 'Tempest Arc', 'spark', 5, 'Deal 38 damage.', 'damage', 38, null, null, null, 'damage', 38, '{"target":"opponent","affinity":"source"}'),
  -- Karradon
  ('8197b5ff-c2a1-5ce9-9c86-b124cdc39021', 1, 'Granite Claw', 'basic', 0, 'Deal 12 damage.', 'damage', 12, null, null, null, 'damage', 12, '{"target":"opponent","affinity":"source"}'),
  ('8197b5ff-c2a1-5ce9-9c86-b124cdc39021', 2, 'Siege Tail', 'basic', 2, 'Deal 32 damage.', 'damage', 32, null, null, null, 'damage', 32, '{"target":"opponent","affinity":"source"}'),
  ('8197b5ff-c2a1-5ce9-9c86-b124cdc39021', 3, 'Immovable', 'grit', 4, 'The next incoming Creature attack deals 60% less damage.', 'buff', 60, 'damage_multiplier', 'multiply', null, 'incoming_damage_modifier', 60, '{"target":"self","charges":1}'),
  ('8197b5ff-c2a1-5ce9-9c86-b124cdc39021', 4, 'Tectonic Rush', 'grit', 5, 'Deal 40 damage.', 'damage', 40, null, null, null, 'damage', 40, '{"target":"opponent","affinity":"source"}'),
  -- Nimbrael
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 1, 'Spectral Charge', 'basic', 0, 'Deal 15 damage.', 'damage', 15, null, null, null, 'damage', 15, '{"target":"opponent","affinity":"source"}'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 2, 'Silent Step', 'basic', 1, 'Deal 24 damage.', 'damage', 24, null, null, null, 'damage', 24, '{"target":"opponent","affinity":"source"}'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 3, 'Echoing Crown', 'spirit', 3, 'Deal 15 damage, then heal 30% of actual HP damage dealt by the next 2 damaging Creature moves.', 'damage', 15, null, null, null, 'damage', 15, '{"target":"opponent","affinity":"source"}'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 4, 'Undying Spirit', 'spirit', 5, 'Deal 35 damage, then heal this Creature by 10 HP.', 'damage', 35, null, null, null, 'damage', 35, '{"target":"opponent","affinity":"source"}'),
  -- Sigilith
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 1, 'Runic Lash', 'basic', 0, 'Deal 13 damage.', 'damage', 13, null, null, null, 'damage', 13, '{"target":"opponent","affinity":"source"}'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 2, 'Prism Strike', 'basic', 1, 'Deal 20 damage.', 'damage', 20, null, null, null, 'damage', 20, '{"target":"opponent","affinity":"source"}'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 3, 'Toxic Bite', 'mystic', 4, 'Deal 10 damage and apply Deadly Poison for 12 neutral damage at the end of the opponent''s next 3 turns.', 'damage', 10, null, null, null, 'damage', 10, '{"target":"opponent","affinity":"source"}'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 4, 'Grand Convergence', 'mystic', 5, 'Deal 35 damage, then drain 2 Power from the opposing Creature.', 'damage', 35, null, null, null, 'damage', 35, '{"target":"opponent","affinity":"source"}'),
  -- Axiomar
  ('1d6416ca-2038-d640-283e-30adc2013d73', 1, 'Probe Strike', 'basic', 0, 'Deal 13 damage.', 'damage', 13, null, null, null, 'damage', 13, '{"target":"opponent","affinity":"source"}'),
  ('1d6416ca-2038-d640-283e-30adc2013d73', 2, 'False Opening', 'wit', 1, 'Deal 18 damage.', 'damage', 18, null, null, null, 'damage', 18, '{"target":"opponent","affinity":"source"}'),
  ('1d6416ca-2038-d640-283e-30adc2013d73', 3, 'Predictive Guard', 'basic', 3, 'The next incoming Creature attack deals 45% less damage.', 'buff', 45, 'damage_multiplier', 'multiply', null, 'incoming_damage_modifier', 45, '{"target":"self","charges":1}'),
  ('1d6416ca-2038-d640-283e-30adc2013d73', 4, 'Checkmate Rush', 'wit', 3, 'Deal 32 damage.', 'damage', 32, null, null, null, 'damage', 32, '{"target":"opponent","affinity":"source"}'),
  -- Arcalyx
  ('740b5400-8362-b728-3b76-9d232077732d', 1, 'Predator Pounce', 'basic', 0, 'Deal 15 damage.', 'damage', 15, null, null, null, 'damage', 15, '{"target":"opponent","affinity":"source"}'),
  ('740b5400-8362-b728-3b76-9d232077732d', 2, 'Livewire Step', 'spark', 2, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  ('740b5400-8362-b728-3b76-9d232077732d', 3, 'Charge Stalk', 'basic', 2, 'The next 2 damaging Creature moves deal 50% more damage.', 'buff', 50, 'damage_multiplier', 'multiply', null, 'damage_modifier', 50, '{"target":"self","charges":2}'),
  ('740b5400-8362-b728-3b76-9d232077732d', 4, 'Stormline Break', 'spark', 5, 'Deal 50 damage.', 'damage', 50, null, null, null, 'damage', 50, '{"target":"opponent","affinity":"source"}'),
  -- Basalox
  ('841b45f5-bb3c-41d4-342b-d1b8d33eefde', 1, 'Basalt Horn', 'basic', 0, 'Deal 14 damage.', 'damage', 14, null, null, null, 'damage', 14, '{"target":"opponent","affinity":"source"}'),
  ('841b45f5-bb3c-41d4-342b-d1b8d33eefde', 2, 'Rooted Ram', 'grit', 2, 'Deal 25 damage.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  ('841b45f5-bb3c-41d4-342b-d1b8d33eefde', 3, 'Seismic Stamp', 'basic', 3, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  ('841b45f5-bb3c-41d4-342b-d1b8d33eefde', 4, 'Faultbreaker Charge', 'grit', 5, 'Deal 42 damage.', 'damage', 42, null, null, null, 'damage', 42, '{"target":"opponent","affinity":"source"}'),
  -- Axiomarch
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 1, 'Diagnostic Strike', 'basic', 0, 'Deal 20 damage.', 'damage', 20, null, null, null, 'damage', 20, '{"target":"opponent","affinity":"source"}'),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 2, 'Calculated Feint', 'wit', 1, 'Deal 30 damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 3, 'Foresight Dodge', 'wit', 3, 'Deal 25 damage, then gain a 50% chance to dodge the next incoming Creature move.', 'damage', 25, null, null, null, 'damage', 25, '{"target":"opponent","affinity":"source"}'),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 4, 'Perfect Sequence', 'wit', 6, 'Deal 60 damage, then drain 3 Power from the opposing Creature.', 'damage', 60, null, null, null, 'damage', 60, '{"target":"opponent","affinity":"source"}'),
  -- Arcalyron
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 1, 'Ion Claw', 'basic', 0, 'Deal 22 damage.', 'damage', 22, null, null, null, 'damage', 22, '{"target":"opponent","affinity":"source"}'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 2, 'Thunderstep', 'spark', 3, 'Deal 40 damage.', 'damage', 40, null, null, null, 'damage', 40, '{"target":"opponent","affinity":"source"}'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 3, 'Storm Charge', 'spark', 5, 'Deal 30 damage, make the next damaging Creature move deal 50% more damage, and make the next incoming Creature attack deal 50% less damage.', 'damage', 30, null, null, null, 'damage', 30, '{"target":"opponent","affinity":"source"}'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 4, 'Static Demolition', 'spark', 10, 'Lose 20 HP, then deal 80 damage. Cannot be used at 20 HP or less.', 'buff', 0, 'power', 'add', null, 'self_damage', 20, '{"target":"self","neutral":true,"bypassDefense":true,"minimumHpExclusive":20}'),
  -- Basalorn
  ('3c1356a9-d601-144e-77f3-1acfdd6aaaf9', 1, 'Obsidian Horn', 'basic', 0, 'Deal 20 damage.', 'damage', 20, null, null, null, 'damage', 20, '{"target":"opponent","affinity":"source"}'),
  ('3c1356a9-d601-144e-77f3-1acfdd6aaaf9', 2, 'Continental Stamp', 'grit', 2, 'Deal 35 damage.', 'damage', 35, null, null, null, 'damage', 35, '{"target":"opponent","affinity":"source"}'),
  ('3c1356a9-d601-144e-77f3-1acfdd6aaaf9', 3, 'Mountain Stance', 'grit', 5, 'The next 2 incoming Creature attacks deal 60% less damage.', 'buff', 60, 'damage_multiplier', 'multiply', null, 'incoming_damage_modifier', 60, '{"target":"self","charges":2}'),
  ('3c1356a9-d601-144e-77f3-1acfdd6aaaf9', 4, 'Cataclysm Charge', 'grit', 6, 'Deal 60 damage.', 'damage', 60, null, null, null, 'damage', 60, '{"target":"opponent","affinity":"source"}');

insert into public.card_moves (
  id, card_definition_id, position, name, move_type, effect_type,
  effect_value, modifier_stat, modifier_operation, modifier_duration_turns,
  power_cost, rules_text
)
select
  md5(
    'wits-world-basic-move:' || move.card_definition_id::text || ':' ||
    case move.position
      when 1 then 'basic'
      when 2 then 'affinity'
      when 3 then 'coverage'
      when 4 then 'utility'
    end
  )::uuid,
  move.card_definition_id,
  move.position,
  move.name,
  move.move_type,
  move.legacy_effect_type,
  move.legacy_effect_value,
  move.legacy_modifier_stat,
  move.legacy_modifier_operation,
  move.legacy_modifier_duration_turns,
  move.power_cost,
  move.rules_text
from complete_catalogue_moves move;

insert into public.card_move_effects (
  id, card_move_id, card_definition_id, position, effect_code,
  effect_value, effect_config, rules_text
)
select
  md5('wits-world-move-effect:' || move.id::text || ':1')::uuid,
  move.id,
  move.card_definition_id,
  1,
  source.primary_effect_code,
  source.primary_effect_value,
  source.primary_effect_config,
  source.rules_text
from complete_catalogue_moves source
join public.card_moves move
  on move.card_definition_id = source.card_definition_id
 and move.position = source.position;

create temporary table complete_catalogue_extra_move_effects (
  card_definition_id uuid not null,
  move_position smallint not null,
  effect_position smallint not null,
  effect_code text not null,
  effect_value integer,
  effect_config jsonb not null,
  rules_text text not null,
  primary key (card_definition_id, move_position, effect_position)
) on commit drop;

insert into complete_catalogue_extra_move_effects (
  card_definition_id, move_position, effect_position, effect_code,
  effect_value, effect_config, rules_text
)
values
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 3, 2, 'incoming_damage_modifier', 20, '{"target":"self","charges":1}', 'The next incoming Creature attack deals 20% less damage.'),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 3, 2, 'damage_modifier', 50, '{"target":"self","charges":1}', 'The next damaging Creature move deals 50% more damage.'),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 3, 2, 'stun', 1, '{"target":"opponent","durationTurns":1,"immunityAfterRecovery":true}', 'Stun the opposing Creature until the end of its next turn.'),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 3, 2, 'poison', 8, '{"target":"opponent","durationTurns":3,"neutral":true}', 'Poison deals 8 neutral damage at the end of the opponent''s next 3 turns.'),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 3, 2, 'damage_modifier', 15, '{"target":"self","durationTurns":3}', 'This Creature deals 15% more damage during its next 3 turns.'),
  ('33546c11-4a85-7d2b-ad67-df2684ae1039', 4, 2, 'incoming_damage_modifier', 15, '{"target":"self","charges":1}', 'The next incoming Creature attack deals 15% less damage.'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 3, 2, 'restore_power_to_max', null, '{"target":"self"}', 'Restore this Creature to maximum Power.'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 3, 2, 'lifesteal', 30, '{"target":"self","charges":2}', 'Heal 30% of actual HP damage dealt by the next 2 damaging Creature moves.'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 4, 2, 'heal', 10, '{"target":"self"}', 'Heal this Creature by 10 HP.'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 3, 2, 'poison', 12, '{"target":"opponent","durationTurns":3,"neutral":true}', 'Deadly Poison deals 12 neutral damage at the end of the opponent''s next 3 turns.'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 4, 2, 'power_change', 2, '{"target":"opponent"}', 'Drain 2 Power from the opposing Creature.'),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 3, 2, 'dodge', 50, '{"target":"self","charges":1,"serverRandom":true}', 'Gain a 50% chance to dodge the next incoming Creature move.'),
  ('6045725a-8271-f50d-19d7-a62f02bf080b', 4, 2, 'power_change', 3, '{"target":"opponent"}', 'Drain 3 Power from the opposing Creature.'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 3, 2, 'damage_modifier', 50, '{"target":"self","charges":1}', 'The next damaging Creature move deals 50% more damage.'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 3, 3, 'incoming_damage_modifier', 50, '{"target":"self","charges":1}', 'The next incoming Creature attack deals 50% less damage.'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 4, 2, 'damage', 80, '{"target":"opponent","affinity":"source"}', 'Deal 80 damage.');

insert into public.card_move_effects (
  id, card_move_id, card_definition_id, position, effect_code,
  effect_value, effect_config, rules_text
)
select
  md5(
    'wits-world-move-effect:' || move.id::text || ':' ||
    effect.effect_position::text
  )::uuid,
  move.id,
  move.card_definition_id,
  effect.effect_position,
  effect.effect_code,
  effect.effect_value,
  effect.effect_config,
  effect.rules_text
from complete_catalogue_extra_move_effects effect
join public.card_moves move
  on move.card_definition_id = effect.card_definition_id
 and move.position = effect.move_position;

insert into public.card_effects (
  id, card_definition_id, position, effect_type, effect_value,
  modifier_stat, modifier_operation, modifier_duration_turns,
  effect_code, effect_config, rules_text
)
values
  (md5('wits-world-basic-effect:0d28241f-a4f2-2cf3-52bc-dee1633b3316:primary')::uuid,
    '0d28241f-a4f2-2cf3-52bc-dee1633b3316', 1, 'heal', 30,
    null, null, null, 'heal', '{"target":"self"}',
    'Heal the active Creature by 30 HP.'),
  (md5('wits-world-basic-effect:b7485793-8432-2db9-5f99-974164efa788:primary')::uuid,
    'b7485793-8432-2db9-5f99-974164efa788', 1, 'buff', 5,
    'power', 'add', null, 'power_change', '{"target":"self"}',
    'Restore 5 Power to the active Creature.'),
  (md5('wits-world-basic-effect:49e45cbb-f419-bf5c-2868-757646cb8dc9:primary')::uuid,
    '49e45cbb-f419-bf5c-2868-757646cb8dc9', 1, 'damage', 30,
    null, null, null, 'damage',
    '{"target":"opponent","affinity":"neutral"}',
    'Deal 30 neutral damage to the opposing Creature.'),
  (md5('wits-world-basic-effect:25621c1c-0722-303d-928b-4ed6e015dbd0:primary')::uuid,
    '25621c1c-0722-303d-928b-4ed6e015dbd0', 1, 'debuff', 2,
    'power', 'add', null, 'power_change', '{"target":"opponent"}',
    'The opposing Creature loses 2 Power.'),
  (md5('wits-world-basic-effect:25621c1c-0722-303d-928b-4ed6e015dbd0:secondary')::uuid,
    '25621c1c-0722-303d-928b-4ed6e015dbd0', 2, 'debuff', 15,
    'damage_multiplier', 'multiply', 2, 'damage_modifier',
    '{"target":"opponent","durationTurns":2}',
    'The opposing Creature deals 15% less damage during its next 2 turns.'),
  (md5('wits-world-basic-effect:7f72be51-3370-8dbf-e96c-963ef4b5f29b:primary')::uuid,
    '7f72be51-3370-8dbf-e96c-963ef4b5f29b', 1, 'heal', 20,
    null, null, null, 'heal', '{"target":"self"}',
    'Heal the active Creature by 20 HP.'),
  (md5('wits-world-basic-effect:7f72be51-3370-8dbf-e96c-963ef4b5f29b:secondary')::uuid,
    '7f72be51-3370-8dbf-e96c-963ef4b5f29b', 2, 'buff', 3,
    'power', 'add', null, 'power_change', '{"target":"self"}',
    'Restore 3 Power to the active Creature.'),
  (md5('wits-world-basic-effect:7f72be51-3370-8dbf-e96c-963ef4b5f29b:tertiary')::uuid,
    '7f72be51-3370-8dbf-e96c-963ef4b5f29b', 3, 'buff', 20,
    'damage_multiplier', 'multiply', 2, 'damage_modifier',
    '{"target":"self","durationTurns":2}',
    'The active Creature deals 20% more damage during its next 2 turns.'),
  (md5('wits-world-basic-effect:5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc:primary')::uuid,
    '5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 1, 'buff', 0,
    'hp', 'add', null, 'swap_hp_percentages', '{"target":"both"}',
    'Swap both active Creatures'' current HP percentages, rounded down, without reducing either below 1 HP.');

create function public.create_primary_card_move_effect()
returns trigger
language plpgsql
as $$
declare
  generated_code text;
  generated_rules text;
begin
  generated_code := case
    when new.effect_type = 'damage' then 'damage'
    when new.effect_type = 'heal' then 'heal'
    when new.modifier_stat = 'power' then 'power_change'
    else 'damage_modifier'
  end;
  generated_rules := coalesce(new.rules_text, case
    when new.effect_type = 'damage' then 'Deal ' || new.effect_value || ' damage.'
    when new.effect_type = 'heal' then 'Heal ' || new.effect_value || ' HP.'
    when new.modifier_stat = 'power' and new.effect_type = 'buff'
      then 'Restore ' || new.effect_value || ' Power.'
    when new.modifier_stat = 'power' and new.effect_type = 'debuff'
      then 'The opposing Creature loses ' || new.effect_value || ' Power.'
    when new.effect_type = 'buff'
      then 'Deal ' || new.effect_value || '% more damage.'
    else 'The opposing Creature deals ' || new.effect_value || '% less damage.'
  end);

  insert into public.card_move_effects (
    card_move_id,
    card_definition_id,
    position,
    effect_code,
    effect_value,
    effect_config,
    rules_text
  ) values (
    new.id,
    new.card_definition_id,
    1,
    generated_code,
    new.effect_value,
    jsonb_strip_nulls(jsonb_build_object(
      'target', case
        when new.effect_type in ('damage', 'debuff') then 'opponent'
        else 'self'
      end,
      'affinity', case when new.effect_type = 'damage' then 'source' end,
      'durationTurns', new.modifier_duration_turns
    )),
    generated_rules
  ) on conflict (card_move_id, position) do nothing;

  return new;
end;
$$;

create trigger card_moves_primary_effect
after insert on public.card_moves
for each row execute function public.create_primary_card_move_effect();

alter table public.card_definitions
  add constraint card_definitions_starter_eligibility_check
    check (
      not starter_eligible
      or (
        catalogue_class = 'ordinary'
        and rarity = 'common'
        and evolves_from_definition_id is null
        and (
          (category = 'creature' and affinity in ('wit', 'grit', 'spark'))
          or (category = 'power' and affinity is null)
        )
      )
    ),
  add constraint card_definitions_reward_eligibility_check
    check (
      not reward_eligible
      or (
        catalogue_class = 'ordinary'
        and evolves_from_definition_id is null
      )
    ),
  add constraint card_definitions_cpu_eligibility_check
    check (
      not cpu_eligible
      or (
        catalogue_class = 'ordinary'
        and rarity = 'common'
      )
    );

create index card_definitions_reward_pool_idx
  on public.card_definitions (rarity, id)
  where reward_eligible;

create index card_definitions_starter_pool_idx
  on public.card_definitions (category, affinity, id)
  where starter_eligible;

create or replace function public.prevent_published_card_content_mutation()
returns trigger
language plpgsql
as $$
declare
  card_status text;
  card_id uuid;
begin
  if tg_table_name = 'card_definitions' then
    if old.authoring_status <> 'draft' and (
      new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.affinity is distinct from old.affinity
      or new.rarity is distinct from old.rarity
      or new.hp is distinct from old.hp
      or new.power is distinct from old.power
      or new.description is distinct from old.description
      or new.image_url is distinct from old.image_url
      or new.image_alt is distinct from old.image_alt
      or new.artwork_attribution is distinct from old.artwork_attribution
      or new.catalogue_class is distinct from old.catalogue_class
      or new.starter_eligible is distinct from old.starter_eligible
      or new.reward_eligible is distinct from old.reward_eligible
      or new.cpu_eligible is distinct from old.cpu_eligible
      or new.evolves_from_definition_id is distinct from old.evolves_from_definition_id
      or new.evolution_copies_required is distinct from old.evolution_copies_required
    ) then
      raise exception 'Non-draft card definition % content is immutable', old.id
        using errcode = '55006';
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    card_id := old.card_definition_id;
    select authoring_status into card_status
      from public.card_definitions where id = card_id;
    if card_status is distinct from 'draft' then
      raise exception 'Moves and effects for non-draft card definition % are immutable', card_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    card_id := new.card_definition_id;
    select authoring_status into card_status
      from public.card_definitions where id = card_id;
    if card_status is distinct from 'draft' then
      raise exception 'Moves and effects for non-draft card definition % are immutable', card_id
        using errcode = '55006';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger card_move_effects_content_immutability
before insert or update or delete on public.card_move_effects
for each row execute function public.prevent_published_card_content_mutation();

alter table public.card_definitions
  enable trigger card_definitions_authoring_lifecycle_immutability;
alter table public.card_definitions
  enable trigger card_definitions_content_immutability;
alter table public.card_definitions
  enable trigger card_definitions_curated_authoring_guard;
alter table public.card_definitions
  enable trigger card_definitions_publication_readiness;
alter table public.card_moves
  enable trigger card_moves_content_immutability;
alter table public.card_effects
  enable trigger card_effects_content_immutability;

do $$
declare
  invalid_count integer;
begin
  select count(*)::integer into invalid_count
  from complete_catalogue_cards card
  left join public.card_definitions definition on definition.id = card.id
  where definition.id is null
     or definition.catalogue_class <> 'ordinary'
     or definition.authoring_status <> 'published'
     or not definition.is_active
     or definition.name <> card.name
     or definition.image_url <> card.image_url
     or definition.image_alt <> card.image_alt
     or definition.artwork_attribution is null;
  if invalid_count <> 0 then
    raise exception 'Complete catalogue contains % missing or invalid definitions', invalid_count;
  end if;

  select count(*)::integer into invalid_count
  from complete_catalogue_cards card
  join public.card_definitions definition on definition.id = card.id
  where definition.category = 'creature'
    and (
      (select count(*) from public.card_moves move
        where move.card_definition_id = definition.id) <> 4
      or exists (
        select 1 from public.card_moves move
        where move.card_definition_id = definition.id
          and move.move_type not in ('basic', definition.affinity)
      )
      or exists (
        select 1 from public.card_moves move
        where move.card_definition_id = definition.id
          and not exists (
            select 1 from public.card_move_effects effect
            where effect.card_move_id = move.id
          )
      )
    );
  if invalid_count <> 0 then
    raise exception 'Complete catalogue contains % Creatures with invalid moves', invalid_count;
  end if;

  select count(*)::integer into invalid_count
  from complete_catalogue_cards card
  join public.card_definitions definition on definition.id = card.id
  where definition.category = 'power'
    and (
      definition.affinity is not null
      or not exists (
        select 1 from public.card_effects effect
        where effect.card_definition_id = definition.id
      )
    );
  if invalid_count <> 0 then
    raise exception 'Complete catalogue contains % invalid typeless Power cards', invalid_count;
  end if;

  if (select count(*) from complete_catalogue_cards) <> 30
     or (select count(*) from complete_catalogue_cards where category = 'creature') <> 24
     or (select count(*) from complete_catalogue_cards where category = 'power') <> 6
     or (select count(*) from complete_catalogue_cards where rarity = 'common') <> 14
     or (select count(*) from complete_catalogue_cards where rarity = 'rare') <> 6
     or (select count(*) from complete_catalogue_cards where rarity = 'epic') <> 6
     or (select count(*) from complete_catalogue_cards where rarity = 'legendary') <> 4
     or (select count(*) from complete_catalogue_cards where evolves_from_definition_id is not null) <> 8
     or (select count(*) from complete_catalogue_cards where cpu_eligible) <> 5 then
    raise exception 'Complete catalogue composition does not match the approved 30-card roster';
  end if;

  if exists (
    select required.rarity
    from unnest(array['common', 'rare', 'epic', 'legendary'])
      as required(rarity)
    where not exists (
      select 1 from public.card_definitions definition
      where definition.reward_eligible
        and definition.rarity = required.rarity
    )
  ) then
    raise exception 'Every rarity must have at least one reward-eligible card';
  end if;
end;
$$;
