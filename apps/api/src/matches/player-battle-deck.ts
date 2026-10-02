import type pg from 'pg';

import {
  validateBattleDeck,
  type BattleCreatureCard,
  type BattleDeck,
  type BattleEffect,
  type BattleMove,
  type BattlePowerCard,
  type EffectCode,
  type EffectTarget,
} from '@wits-world/game-rules';

import { validateBasicDeck } from '../cards/deck-rules.js';
import type {
  CardAffinity,
  CardCategory,
  CardEffect,
  CardMove,
  CardRarity,
} from '../cards/card-types.js';

export interface BattleDeckQueryClient {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface PlayerBattleDeckCard extends pg.QueryResultRow {
  position: number;
  ownedCardId: string;
  cardDefinitionId: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  battleCard: BattleCreatureCard | BattlePowerCard;
}

export interface LoadedPlayerBattleDeck {
  deckId: string;
  cards: readonly PlayerBattleDeckCard[];
  deck: BattleDeck;
}

export class PlayerBattleDeckError extends Error {
  constructor(message = 'The saved deck is unavailable for battle.') {
    super(message);
    this.name = 'PlayerBattleDeckError';
  }
}

interface SavedCardRow extends pg.QueryResultRow {
  position: number;
  owned_card_id: string;
  card_definition_id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  is_active: boolean;
  authoring_status: string;
}

interface MoveRow extends pg.QueryResultRow {
  id: string;
  card_definition_id: string;
  name: string;
  move_type: CardMove['moveType'];
  effect_type: CardMove['effectType'];
  effect_value: number | null;
  modifier_stat: CardMove['modifierStat'];
  modifier_operation: CardMove['modifierOperation'];
  modifier_duration_turns: number | null;
  power_cost: number;
}

interface EffectRow extends pg.QueryResultRow {
  id: string;
  card_definition_id: string;
  effect_type: CardEffect['effectType'];
  effect_value: number | null;
  modifier_stat: CardEffect['modifierStat'];
  modifier_operation: CardEffect['modifierOperation'];
  modifier_duration_turns: number | null;
  effect_code: EffectCode;
  effect_config: unknown;
}

interface MoveEffectRow extends EffectRow {
  card_move_id: string;
}

interface HydrationRow extends pg.QueryResultRow {
  row_kind: 0 | 1 | 2;
  position: number;
  id: string;
  card_definition_id: string;
  card_move_id: string | null;
  name: string | null;
  move_type: CardMove['moveType'] | null;
  effect_type: CardEffect['effectType'];
  effect_value: number | null;
  modifier_stat: CardEffect['modifierStat'];
  modifier_operation: CardEffect['modifierOperation'];
  modifier_duration_turns: number | null;
  power_cost: number | null;
  effect_code: EffectCode | null;
  effect_config: unknown;
}

export async function loadPlayerBattleDeck(
  client: BattleDeckQueryClient,
  playerId: string,
  deckId: string,
  {
    requirePublished = true,
    requireSelected = false,
  }: { requirePublished?: boolean; requireSelected?: boolean } = {},
): Promise<LoadedPlayerBattleDeck> {
  const cardsResult = await client.query<SavedCardRow>(
    `
      select
        membership.position,
        owned.id::text as owned_card_id,
        definition.id::text as card_definition_id,
        definition.name,
        definition.category,
        definition.affinity,
        definition.rarity,
        definition.hp,
        definition.power,
        definition.is_active,
        definition.authoring_status
      from public.player_decks deck
      join public.player_deck_cards membership
        on membership.deck_id = deck.id
       and membership.player_id = deck.player_id
      join public.player_cards owned
        on owned.id = membership.owned_card_id
       and owned.player_id = membership.player_id
      join public.card_definitions definition
        on definition.id = owned.card_definition_id
      where deck.id = $1::uuid
        and deck.player_id = $2::uuid
        and (
          not $3::boolean
          or exists (
            select 1
              from public.player_deck_selections selection
             where selection.player_id = deck.player_id
               and selection.deck_id = deck.id
          )
        )
      order by membership.position
      for update of owned
      for share of deck
    `,
    [deckId, playerId, requireSelected],
  );

  const rows = cardsResult.rows;
  if (rows.length > 0) {
    // Ownership rows above are locked before checking reservations. A trade
    // therefore cannot reserve a copy concurrently with a new match snapshot.
    const reserved = await client.query<{ owned_card_id: string }>(
      `
        select owned_card_id::text
          from private.card_trade_reservations
         where owned_card_id = any($1::uuid[])
         limit 1
      `,
      [rows.map((row) => row.owned_card_id)],
    );
    if (reserved.rows.length > 0) {
      throw new PlayerBattleDeckError();
    }
  }

  if (
    rows.length !== 5 ||
    rows.some(
      (row) =>
        !row.is_active ||
        (requirePublished && row.authoring_status !== 'published'),
    )
  ) {
    throw new PlayerBattleDeckError();
  }

  try {
    validateBasicDeck(
      rows.map((row) => ({
        ownedCardId: row.owned_card_id,
        cardDefinitionId: row.card_definition_id,
        category: row.category,
        rarity: row.rarity,
      })),
    );
  } catch {
    throw new PlayerBattleDeckError();
  }

  const definitionIds = [...new Set(rows.map((row) => row.card_definition_id))];
  const hydrationResult = await client.query<HydrationRow>(
    `
      select
        0 as row_kind,
        position,
        id::text,
        card_definition_id::text,
        null::text as card_move_id,
        name,
        move_type,
        effect_type,
        effect_value,
        modifier_stat,
        modifier_operation,
        modifier_duration_turns,
        power_cost,
        null::text as effect_code,
        null::jsonb as effect_config
      from public.card_moves
      where card_definition_id = any($1::uuid[])

      union all

      select
        1 as row_kind,
        effect.position,
        effect.id::text,
        effect.card_definition_id::text,
        effect.card_move_id::text,
        null::text as name,
        null::text as move_type,
        case
          when effect.effect_code = 'damage' then 'damage'
          when effect.effect_code = 'heal' then 'heal'
          when effect.effect_code in ('poison', 'stun') then 'debuff'
          when effect.effect_code in ('power_change', 'damage_modifier')
            and effect.effect_config ->> 'target' = 'opponent' then 'debuff'
          else 'buff'
        end as effect_type,
        effect.effect_value,
        null::text as modifier_stat,
        null::text as modifier_operation,
        null::integer as modifier_duration_turns,
        null::integer as power_cost,
        effect.effect_code,
        effect.effect_config
      from public.card_move_effects effect
      where effect.card_definition_id = any($1::uuid[])

      union all

      select
        2 as row_kind,
        position,
        id::text,
        card_definition_id::text,
        null::text as card_move_id,
        null::text as name,
        null::text as move_type,
        effect_type,
        effect_value,
        modifier_stat,
        modifier_operation,
        modifier_duration_turns,
        null::integer as power_cost,
        effect_code,
        effect_config
      from public.card_effects
      where card_definition_id = any($1::uuid[])

      order by row_kind, card_definition_id, card_move_id, position
    `,
    [definitionIds],
  );

  const moves: MoveRow[] = [];
  const moveEffects: MoveEffectRow[] = [];
  const effects: EffectRow[] = [];
  for (const row of hydrationResult.rows) {
    const effect = {
      id: row.id,
      card_definition_id: row.card_definition_id,
      effect_type: row.effect_type,
      effect_value: row.effect_value,
      modifier_stat: row.modifier_stat,
      modifier_operation: row.modifier_operation,
      modifier_duration_turns: row.modifier_duration_turns,
    };
    if (row.row_kind === 0) {
      // Legacy move effects have no effect_code property; mapEffect uses that
      // distinction to preserve the original fallback behavior.
      moves.push({
        ...effect,
        name: row.name!,
        move_type: row.move_type!,
        power_cost: row.power_cost!,
      });
    } else if (row.row_kind === 1) {
      moveEffects.push({
        ...effect,
        card_move_id: row.card_move_id!,
        effect_code: row.effect_code!,
        effect_config: row.effect_config,
      });
    } else {
      effects.push({
        ...effect,
        effect_code: row.effect_code!,
        effect_config: row.effect_config,
      });
    }
  }

  const movesByDefinition = groupByDefinition(moves);
  const effectsByMove = groupRows(moveEffects, 'card_move_id');
  const effectsByDefinition = groupByDefinition(effects);
  const creatures: BattleCreatureCard[] = [];
  const powerCards: BattlePowerCard[] = [];
  const cards: PlayerBattleDeckCard[] = [];

  for (const row of rows) {
    let battleCard: BattleCreatureCard | BattlePowerCard;
    if (row.category === 'creature') {
      if (row.affinity === null || row.hp === null || row.power === null) {
        throw new PlayerBattleDeckError();
      }

      battleCard = {
        id: row.owned_card_id,
        affinity: row.affinity,
        maxHp: row.hp,
        maxPower: row.power,
        moves: (movesByDefinition.get(row.card_definition_id) ?? []).map(
          (move) => mapMove(move, effectsByMove.get(move.id) ?? []),
        ),
      };
      creatures.push(battleCard);
    } else {
      battleCard = {
        id: row.owned_card_id,
        affinity: row.affinity,
        effects: (effectsByDefinition.get(row.card_definition_id) ?? []).map(
          mapEffect,
        ),
      };
      powerCards.push(battleCard);
    }

    cards.push({
      position: row.position,
      ownedCardId: row.owned_card_id,
      cardDefinitionId: row.card_definition_id,
      name: row.name,
      category: row.category,
      affinity: row.affinity,
      rarity: row.rarity,
      hp: row.hp,
      power: row.power,
      battleCard,
    });
  }

  const deck = { creatureCards: creatures, powerCards };
  try {
    validateBattleDeck(deck);
  } catch {
    throw new PlayerBattleDeckError();
  }

  return { deckId, cards, deck };
}

function groupByDefinition<T extends { card_definition_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const values = result.get(row.card_definition_id) ?? [];
    values.push(row);
    result.set(row.card_definition_id, values);
  }
  return result;
}

function groupRows<T extends Record<K, string>, K extends keyof T>(
  rows: readonly T[],
  key: K,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const values = result.get(row[key]) ?? [];
    values.push(row);
    result.set(row[key], values);
  }
  return result;
}

function mapMove(row: MoveRow, effects: readonly MoveEffectRow[]): BattleMove {
  return {
    id: row.id,
    name: row.name,
    moveType: row.move_type,
    powerCost: row.power_cost,
    effects: effects.length > 0 ? effects.map(mapEffect) : [mapEffect(row)],
  };
}

function mapEffect(row: MoveRow | EffectRow): BattleEffect {
  if ('effect_code' in row) {
    const config = asEffectConfig(row.effect_config);
    return {
      id: row.id,
      effectType: row.effect_type,
      effectValue: row.effect_value,
      effectCode: row.effect_code,
      ...(readEffectTarget(config.target)
        ? { target: readEffectTarget(config.target) }
        : {}),
      ...(readInteger(config.durationTurns) !== undefined
        ? { durationTurns: readInteger(config.durationTurns) }
        : {}),
      ...(readInteger(config.charges) !== undefined
        ? { charges: readInteger(config.charges) }
        : {}),
      ...(typeof config.neutral === 'boolean'
        ? { neutral: config.neutral }
        : {}),
      ...(typeof config.bypassDefense === 'boolean'
        ? { bypassDefense: config.bypassDefense }
        : {}),
      ...(readInteger(config.minimumHpExclusive) !== undefined
        ? { minimumHpExclusive: readInteger(config.minimumHpExclusive) }
        : {}),
      ...(typeof config.cannotDefeat === 'boolean'
        ? { cannotDefeat: config.cannotDefeat }
        : {}),
      ...(typeof config.immunityAfterRecovery === 'boolean'
        ? { immunityAfterRecovery: config.immunityAfterRecovery }
        : {}),
    };
  }
  return {
    id: row.id,
    effectType: row.effect_type,
    effectValue: row.effect_value,
    modifier:
      row.modifier_stat && row.modifier_operation
        ? {
            stat: row.modifier_stat,
            operation: row.modifier_operation,
            durationTurns: row.modifier_duration_turns,
          }
        : undefined,
  };
}

function asEffectConfig(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function readEffectTarget(value: unknown): EffectTarget | undefined {
  return value === 'self' || value === 'opponent' || value === 'both'
    ? value
    : undefined;
}
