alter table public.card_moves
  add column modifier_stat text,
  add column modifier_operation text,
  add column modifier_duration_turns integer;

alter table public.card_effects
  add column modifier_stat text,
  add column modifier_operation text,
  add column modifier_duration_turns integer;

-- The catalogue already contains this authored Buff card from migration 0009's
-- seed. Backfill its approved modifier before adding the battle-readiness
-- constraints below so existing databases can migrate safely.
update public.card_effects effect
   set modifier_stat = 'damage_multiplier',
       modifier_operation = 'multiply'
 where effect.effect_type = 'buff'
   and effect.modifier_stat is null
   and exists (
     select 1
       from public.card_definitions definition
      where definition.id = effect.card_definition_id
        and definition.name = 'Spark Legendary Power'
        and definition.category = 'power'
        and definition.affinity = 'spark'
   );

alter table public.card_moves
  add constraint card_moves_modifier_stat_check
    check (
      modifier_stat is null
      or modifier_stat in ('hp', 'power', 'damage_multiplier')
    ),
  add constraint card_moves_modifier_operation_check
    check (
      modifier_operation is null
      or modifier_operation in ('add', 'multiply')
    ),
  add constraint card_moves_modifier_duration_check
    check (
      modifier_duration_turns is null
      or modifier_duration_turns > 0
    ),
  add constraint card_moves_modifier_definition_check
    check (
      (
        effect_type in ('damage', 'heal')
        and modifier_stat is null
        and modifier_operation is null
        and modifier_duration_turns is null
      )
      or
      (
        effect_type in ('buff', 'debuff')
        and modifier_stat is not null
        and modifier_operation is not null
        and (
          modifier_stat = 'damage_multiplier'
          or modifier_duration_turns is null
        )
        and (
          (
            modifier_stat = 'damage_multiplier'
            and modifier_operation = 'multiply'
          )
          or (
            modifier_stat in ('hp', 'power')
            and modifier_operation = 'add'
          )
        )
      )
    );

alter table public.card_effects
  add constraint card_effects_modifier_stat_check
    check (
      modifier_stat is null
      or modifier_stat in ('hp', 'power', 'damage_multiplier')
    ),
  add constraint card_effects_modifier_operation_check
    check (
      modifier_operation is null
      or modifier_operation in ('add', 'multiply')
    ),
  add constraint card_effects_modifier_duration_check
    check (
      modifier_duration_turns is null
      or modifier_duration_turns > 0
    ),
  add constraint card_effects_modifier_definition_check
    check (
      (
        effect_type in ('damage', 'heal')
        and modifier_stat is null
        and modifier_operation is null
        and modifier_duration_turns is null
      )
      or
      (
        effect_type in ('buff', 'debuff')
        and modifier_stat is not null
        and modifier_operation is not null
        and (
          modifier_stat = 'damage_multiplier'
          or modifier_duration_turns is null
        )
        and (
          (
            modifier_stat = 'damage_multiplier'
            and modifier_operation = 'multiply'
          )
          or (
            modifier_stat in ('hp', 'power')
            and modifier_operation = 'add'
          )
        )
      )
    );
