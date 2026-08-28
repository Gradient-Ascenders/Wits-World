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
values
  ('eca9b943-9e05-834e-c85c-1175001d897c', 'Spark Creature 1', 'creature', 'spark', 'common', 96, 10, 'Accessible pressure attacker with a meaningful burst decision and neutral coverage into Grit.'),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 'Spark Creature 2', 'creature', 'spark', 'common', 88, 12, 'Low-HP glass cannon with the strongest Common raw burst.'),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 'Spark Creature 3', 'creature', 'spark', 'common', 103, 9, 'Pressure-control bruiser that trades peak damage for HP and short defensive tempo.'),
  ('740b5400-8362-b728-3b76-9d232077732d', 'Spark Rare Creature', 'creature', 'spark', 'rare', 98, 12, 'Combo striker whose rarity adds sequencing and stronger coverage.'),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 'Spark Epic Creature', 'creature', 'spark', 'epic', 102, 13, 'Flexible attacker with two coverage routes instead of inflated defensive stats.'),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 'Spark Legendary Creature', 'creature', 'spark', 'legendary', 106, 14, 'Long-horizon finisher whose permanent setup must repay its action and Power investment.'),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 'Grit Creature 1', 'creature', 'grit', 'common', 104, 9, 'Efficient defensive anchor. The frozen HP and duration include the final balance reduction.'),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 'Grit Creature 2', 'creature', 'grit', 'common', 101, 11, 'Efficient bruiser that chooses between sustained output and a finishing hit.'),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 'Grit Creature 3', 'creature', 'grit', 'common', 98, 10, 'Repair-oriented defender with finite healing. The frozen HP and heal include the final balance reduction.'),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 'Wit Creature 1', 'creature', 'wit', 'common', 98, 11, 'Resource disruptor that sacrifices an attack and equal Power to deny an opposing option.'),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 'Wit Creature 2', 'creature', 'wit', 'common', 94, 12, 'Broad-coverage attacker and the intentional exception to the usual one-coverage pattern.'),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 'Wit Creature 3', 'creature', 'wit', 'common', 103, 10, 'Control specialist. Fast Read is the final approved neutral Basic fallback.'),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 'Spirit Creature 1', 'creature', 'spirit', 'common', 102, 10, 'Balanced sustain Creature and the first Spirit progression unlock.'),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 'Spirit Creature 2', 'creature', 'spirit', 'common', 94, 12, 'Low-HP resource planner with a finite choice between pressure and substantial healing.'),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 'Spirit Creature 3', 'creature', 'spirit', 'common', 110, 9, 'Preventative guardian that sustains through HP and damage reduction instead of healing.'),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 'Mystic Creature 1', 'creature', 'mystic', 'common', 98, 11, 'Accessible setup specialist and the first Mystic progression unlock.'),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 'Mystic Creature 2', 'creature', 'mystic', 'common', 90, 13, 'Fragile combo attacker whose high ceiling requires setup and Power commitment.'),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 'Mystic Creature 3', 'creature', 'mystic', 'common', 106, 10, 'Long-game specialist. Whispering Rune is the final approved neutral Basic fallback.'),
  ('0d28241f-a4f2-2cf3-52bc-dee1633b3316', 'Spark Power 1', 'power', 'spark', 'common', null, null, 'Immediate pressure or finishing damage.'),
  ('b7485793-8432-2db9-5f99-974164efa788', 'Spark Power 2', 'power', 'spark', 'common', null, null, 'Maintains pressure while preparing two stronger attacks.'),
  ('49e45cbb-f419-bf5c-2868-757646cb8dc9', 'Grit Power 1', 'power', 'grit', 'common', null, null, 'Stabilization that retains prevention when healing is partly wasted.'),
  ('17150f89-427c-6bd8-5551-fbaf59b99808', 'Grit Power 2', 'power', 'grit', 'common', null, null, 'Durable tempo swing with the final approved healing reduction.'),
  ('a2405856-34a7-f0a8-d1f6-ed0f161ecdab', 'Wit Power 1', 'power', 'wit', 'common', null, null, 'Disrupts expensive plans while advancing the battle.'),
  ('b862854d-9bc1-2e2e-31f2-c3b31fefcaed', 'Wit Power 2', 'power', 'wit', 'common', null, null, 'Flexible recovery and setup.'),
  ('c1db21b9-944e-f9d6-fa2c-7d14702f41d4', 'Spirit Power 1', 'power', 'spirit', 'common', null, null, 'Focused emergency sustain.'),
  ('1f991679-3269-163f-4e74-b75a738a2bee', 'Spirit Power 2', 'power', 'spirit', 'common', null, null, 'Bounded, one-use resource recovery.'),
  ('76f057c6-efab-38d9-9bcf-298d5c794f1a', 'Mystic Power 1', 'power', 'mystic', 'common', null, null, 'Sequencing card whose first effect increases its own later damage effect.'),
  ('4e7b34e3-4f31-33c1-5da5-000570b3d4f3', 'Mystic Power 2', 'power', 'mystic', 'common', null, null, 'Long-horizon setup with modest stabilization.'),
  ('25621c1c-0722-303d-928b-4ed6e015dbd0', 'Spark Rare Power', 'power', 'spark', 'rare', null, null, 'Pressure plus small sequencing disruption.'),
  ('7f72be51-3370-8dbf-e96c-963ef4b5f29b', 'Spark Epic Power', 'power', 'spark', 'epic', null, null, 'Setup-and-strike card whose Buff also affects its ordered damage effect.'),
  ('5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 'Spark Legendary Power', 'power', 'spark', 'legendary', null, null, 'Three-stage setup, burst, and protection swing. A lethal second effect skips the final Debuff under current rules.');

create temporary table basic_seed_moves (
  card_definition_id uuid not null,
  position smallint not null,
  name text not null,
  move_type text not null,
  effect_type text not null,
  effect_value integer not null,
  modifier_stat text,
  modifier_operation text,
  modifier_duration_turns integer,
  power_cost integer not null,
  primary key (card_definition_id, position)
) on commit drop;

insert into basic_seed_moves (
  card_definition_id, position, name, move_type, effect_type, effect_value,
  modifier_stat, modifier_operation, modifier_duration_turns, power_cost
)
values
  ('eca9b943-9e05-834e-c85c-1175001d897c', 1, 'Steady Jab', 'basic', 'damage', 9, null, null, null, 0),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 2, 'Flash Arc', 'spark', 'damage', 19, null, null, null, 2),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 3, 'Overcharge', 'spark', 'damage', 32, null, null, null, 4),
  ('eca9b943-9e05-834e-c85c-1175001d897c', 4, 'Feinting Insight', 'mystic', 'damage', 15, null, null, null, 2),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 1, 'Quick Jab', 'basic', 'damage', 8, null, null, null, 0),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 2, 'Voltage Spike', 'spark', 'damage', 21, null, null, null, 2),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 3, 'Redline', 'spark', 'damage', 34, null, null, null, 4),
  ('ec9fb511-5dd2-8164-5f56-d9e13820c713', 4, 'Calculated Feint', 'mystic', 'damage', 16, null, null, null, 2),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 1, 'Pressing Blow', 'basic', 'damage', 10, null, null, null, 0),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 2, 'Live Wire', 'spark', 'damage', 18, null, null, null, 2),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 3, 'Read the Opening', 'mystic', 'damage', 15, null, null, null, 2),
  ('62d5bb93-78ad-5c44-412c-c7eca5f03250', 4, 'Static Screen', 'spark', 'debuff', 10, 'damage_multiplier', 'multiply', 2, 1),
  ('740b5400-8362-b728-3b76-9d232077732d', 1, 'Measured Jab', 'basic', 'damage', 10, null, null, null, 0),
  ('740b5400-8362-b728-3b76-9d232077732d', 2, 'Flash Sequence', 'spark', 'damage', 22, null, null, null, 2),
  ('740b5400-8362-b728-3b76-9d232077732d', 3, 'Clever Vector', 'wit', 'damage', 16, null, null, null, 2),
  ('740b5400-8362-b728-3b76-9d232077732d', 4, 'Momentum Read', 'spark', 'buff', 15, 'damage_multiplier', 'multiply', 2, 1),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 1, 'Opening Tap', 'basic', 'damage', 10, null, null, null, 0),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 2, 'Storm Thesis', 'spark', 'damage', 28, null, null, null, 3),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 3, 'Countercurrent', 'wit', 'damage', 18, null, null, null, 2),
  ('65f102ad-ff11-876c-a4f7-e2e74167bc4c', 4, 'Prismatic Detour', 'mystic', 'damage', 18, null, null, null, 2),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 1, 'First Spark', 'basic', 'damage', 10, null, null, null, 0),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 2, 'Crown Voltage', 'spark', 'damage', 31, null, null, null, 3),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 3, 'Perfect Feint', 'wit', 'damage', 18, null, null, null, 2),
  ('948a71e6-f04b-fcec-75ef-e401066ec8b8', 4, 'Unending Charge', 'spark', 'buff', 15, 'damage_multiplier', 'multiply', null, 2),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 1, 'Firm Strike', 'basic', 'damage', 10, null, null, null, 0),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 2, 'Stone Rhythm', 'grit', 'damage', 15, null, null, null, 1),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 3, 'Hidden Angle', 'spirit', 'damage', 15, null, null, null, 2),
  ('27cbcedf-1886-aa81-04b4-089b4c10cd87', 4, 'Dig In', 'grit', 'debuff', 10, 'damage_multiplier', 'multiply', 2, 1),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 1, 'Workmanlike Blow', 'basic', 'damage', 9, null, null, null, 0),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 2, 'Efficient Force', 'grit', 'damage', 21, null, null, null, 2),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 3, 'Relentless Drive', 'grit', 'damage', 28, null, null, null, 3),
  ('c2c81cdc-5c15-84d1-6ba9-0271b1d3fdac', 4, 'Patient Read', 'spirit', 'damage', 16, null, null, null, 2),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 1, 'Guarded Tap', 'basic', 'damage', 9, null, null, null, 0),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 2, 'Stalwart Swing', 'grit', 'damage', 19, null, null, null, 2),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 3, 'Quiet Counter', 'spirit', 'damage', 15, null, null, null, 2),
  ('fc2c46fb-d960-b1bb-ea9a-93110b79e22d', 4, 'Patch Up', 'grit', 'heal', 12, null, null, null, 2),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 1, 'Quick Retort', 'basic', 'damage', 9, null, null, null, 0),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 2, 'Logic Lash', 'wit', 'damage', 18, null, null, null, 2),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 3, 'Lateral Step', 'spirit', 'damage', 14, null, null, null, 2),
  ('84790040-6ea8-6155-c4b7-dec3a22ac3ab', 4, 'Power Leak', 'wit', 'debuff', 2, 'power', 'add', null, 2),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 1, 'Testing Tap', 'basic', 'damage', 8, null, null, null, 0),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 2, 'Sharp Thesis', 'wit', 'damage', 20, null, null, null, 2),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 3, 'Borrowed Resolve', 'spirit', 'damage', 15, null, null, null, 2),
  ('47f04de3-98d9-79ad-2759-7409c499c5ec', 4, 'Spark of Improvisation', 'spark', 'damage', 15, null, null, null, 2),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 1, 'Fast Read', 'basic', 'damage', 8, null, null, null, 0),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 2, 'Checkmate Line', 'wit', 'damage', 25, null, null, null, 3),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 3, 'Reframe', 'spirit', 'damage', 15, null, null, null, 2),
  ('cdd5284b-0aaf-5c50-f820-787a7f6b1506', 4, 'Misdirect', 'wit', 'debuff', 15, 'damage_multiplier', 'multiply', 2, 2),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 1, 'Grounding Tap', 'basic', 'damage', 9, null, null, null, 0),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 2, 'Heartbeat Wave', 'spirit', 'damage', 18, null, null, null, 2),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 3, 'Steady Hand', 'wit', 'damage', 15, null, null, null, 2),
  ('a230fdda-cec0-c127-b4a2-e4dd20660e3a', 4, 'Mend', 'spirit', 'heal', 14, null, null, null, 2),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 1, 'Gentle Tap', 'basic', 'damage', 8, null, null, null, 0),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 2, 'Rallying Pulse', 'spirit', 'damage', 20, null, null, null, 2),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 3, 'Rooted Reply', 'wit', 'damage', 16, null, null, null, 2),
  ('6e6b2c9f-27b2-2145-3b8a-219a0df622d7', 4, 'Deep Breath', 'spirit', 'heal', 18, null, null, null, 3),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 1, 'Centering Blow', 'basic', 'damage', 10, null, null, null, 0),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 2, 'Enduring Chorus', 'spirit', 'damage', 20, null, null, null, 2),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 3, 'Insightful Reply', 'wit', 'damage', 15, null, null, null, 2),
  ('6f962f85-eaee-fd27-b2d7-c00c8af95098', 4, 'Calming Field', 'spirit', 'debuff', 10, 'damage_multiplier', 'multiply', 3, 2),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 1, 'Plain Sigil', 'basic', 'damage', 9, null, null, null, 0),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 2, 'Arcane Thread', 'mystic', 'damage', 18, null, null, null, 2),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 3, 'Stone Rune', 'grit', 'damage', 15, null, null, null, 2),
  ('0cba869b-d777-11f8-6b8c-c47d4d626558', 4, 'Focus Lens', 'mystic', 'buff', 10, 'damage_multiplier', 'multiply', 3, 1),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 1, 'Simple Mark', 'basic', 'damage', 8, null, null, null, 0),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 2, 'Convergence', 'mystic', 'damage', 28, null, null, null, 3),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 3, 'Iron Glyph', 'grit', 'damage', 17, null, null, null, 2),
  ('5340e0ee-d31c-93f5-0d59-39d0cd977f15', 4, 'Attune', 'mystic', 'buff', 15, 'damage_multiplier', 'multiply', 2, 2),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 1, 'Whispering Rune', 'basic', 'damage', 8, null, null, null, 0),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 2, 'Deep Pattern', 'mystic', 'damage', 21, null, null, null, 2),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 3, 'Grounded Equation', 'grit', 'damage', 15, null, null, null, 2),
  ('a30d8e2e-42bf-574a-aa6f-1ebdf33c86b6', 4, 'Long Vision', 'mystic', 'buff', 10, 'damage_multiplier', 'multiply', null, 2);

create temporary table basic_seed_effects (
  card_definition_id uuid not null,
  position smallint not null,
  effect_type text not null,
  effect_value integer not null,
  modifier_stat text,
  modifier_operation text,
  modifier_duration_turns integer,
  primary key (card_definition_id, position)
) on commit drop;

insert into basic_seed_effects (
  card_definition_id, position, effect_type, effect_value,
  modifier_stat, modifier_operation, modifier_duration_turns
)
values
  ('0d28241f-a4f2-2cf3-52bc-dee1633b3316', 1, 'damage', 20, null, null, null),
  ('b7485793-8432-2db9-5f99-974164efa788', 1, 'damage', 12, null, null, null),
  ('b7485793-8432-2db9-5f99-974164efa788', 2, 'buff', 10, 'damage_multiplier', 'multiply', 2),
  ('49e45cbb-f419-bf5c-2868-757646cb8dc9', 1, 'heal', 8, null, null, null),
  ('49e45cbb-f419-bf5c-2868-757646cb8dc9', 2, 'debuff', 10, 'damage_multiplier', 'multiply', 2),
  ('17150f89-427c-6bd8-5551-fbaf59b99808', 1, 'damage', 14, null, null, null),
  ('17150f89-427c-6bd8-5551-fbaf59b99808', 2, 'heal', 6, null, null, null),
  ('a2405856-34a7-f0a8-d1f6-ed0f161ecdab', 1, 'debuff', 3, 'power', 'add', null),
  ('a2405856-34a7-f0a8-d1f6-ed0f161ecdab', 2, 'damage', 10, null, null, null),
  ('b862854d-9bc1-2e2e-31f2-c3b31fefcaed', 1, 'heal', 10, null, null, null),
  ('b862854d-9bc1-2e2e-31f2-c3b31fefcaed', 2, 'buff', 10, 'damage_multiplier', 'multiply', 2),
  ('c1db21b9-944e-f9d6-fa2c-7d14702f41d4', 1, 'heal', 20, null, null, null),
  ('1f991679-3269-163f-4e74-b75a738a2bee', 1, 'heal', 10, null, null, null),
  ('1f991679-3269-163f-4e74-b75a738a2bee', 2, 'buff', 3, 'power', 'add', null),
  ('76f057c6-efab-38d9-9bcf-298d5c794f1a', 1, 'buff', 10, 'damage_multiplier', 'multiply', 2),
  ('76f057c6-efab-38d9-9bcf-298d5c794f1a', 2, 'damage', 12, null, null, null),
  ('4e7b34e3-4f31-33c1-5da5-000570b3d4f3', 1, 'heal', 10, null, null, null),
  ('4e7b34e3-4f31-33c1-5da5-000570b3d4f3', 2, 'buff', 10, 'damage_multiplier', 'multiply', null),
  ('25621c1c-0722-303d-928b-4ed6e015dbd0', 1, 'damage', 16, null, null, null),
  ('25621c1c-0722-303d-928b-4ed6e015dbd0', 2, 'debuff', 2, 'power', 'add', null),
  ('7f72be51-3370-8dbf-e96c-963ef4b5f29b', 1, 'buff', 15, 'damage_multiplier', 'multiply', 3),
  ('7f72be51-3370-8dbf-e96c-963ef4b5f29b', 2, 'damage', 16, null, null, null),
  ('5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 1, 'buff', 15, 'damage_multiplier', 'multiply', 2),
  ('5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 2, 'damage', 18, null, null, null),
  ('5f476b3a-7fc9-e5eb-b552-716dd5cbf5dc', 3, 'debuff', 10, 'damage_multiplier', 'multiply', 2);

insert into public.card_definitions (
  id, name, category, affinity, rarity, hp, power, description,
  image_url, is_active, authoring_status
)
select
  id, name, category, affinity, rarity, hp, power, description,
  null, false, 'draft'
from basic_seed_cards
on conflict (id) do nothing;

insert into public.card_moves (
  id, card_definition_id, position, name, move_type, effect_type, effect_value,
  modifier_stat, modifier_operation, modifier_duration_turns, power_cost
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
  move.card_definition_id, move.position, move.name, move.move_type,
  move.effect_type, move.effect_value, move.modifier_stat,
  move.modifier_operation, move.modifier_duration_turns, move.power_cost
from basic_seed_moves move
join public.card_definitions definition
  on definition.id = move.card_definition_id
where definition.authoring_status = 'draft'
on conflict (card_definition_id, position) do update set
  name = excluded.name,
  move_type = excluded.move_type,
  effect_type = excluded.effect_type,
  effect_value = excluded.effect_value,
  modifier_stat = excluded.modifier_stat,
  modifier_operation = excluded.modifier_operation,
  modifier_duration_turns = excluded.modifier_duration_turns,
  power_cost = excluded.power_cost;

insert into public.card_effects (
  id, card_definition_id, position, effect_type, effect_value,
  modifier_stat, modifier_operation, modifier_duration_turns
)
select
  md5(
    'wits-world-basic-effect:' || effect.card_definition_id::text || ':' ||
    case effect.position
      when 1 then 'primary'
      when 2 then 'secondary'
      when 3 then 'tertiary'
    end
  )::uuid,
  effect.card_definition_id, effect.position, effect.effect_type,
  effect.effect_value, effect.modifier_stat, effect.modifier_operation,
  effect.modifier_duration_turns
from basic_seed_effects effect
join public.card_definitions definition
  on definition.id = effect.card_definition_id
where definition.authoring_status = 'draft'
on conflict (card_definition_id, position) do update set
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
