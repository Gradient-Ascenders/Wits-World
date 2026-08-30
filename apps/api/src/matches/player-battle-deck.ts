import type pg from 'pg';

import {
  validateBattleDeck,
  type BattleCreatureCard,
  type BattleDeck,
  type BattleEffect,
  type BattleMove,
  type BattlePowerCard,
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
  affinity: CardAffinity;
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
  affinity: CardAffinity;
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
      for share of deck
    `,
    [deckId, playerId, requireSelected],
  );

  const rows = cardsResult.rows;
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
  const [movesResult, effectsResult] = await Promise.all([
    client.query<MoveRow>(
      `
        select
          id::text,
          card_definition_id::text,
          name,
          move_type,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns,
          power_cost
        from public.card_moves
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position
      `,
      [definitionIds],
    ),
    client.query<EffectRow>(
      `
        select
          id::text,
          card_definition_id::text,
          effect_type,
          effect_value,
          modifier_stat,
          modifier_operation,
          modifier_duration_turns
        from public.card_effects
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position
      `,
      [definitionIds],
    ),
  ]);

  const movesByDefinition = groupByDefinition(movesResult.rows);
  const effectsByDefinition = groupByDefinition(effectsResult.rows);
  const creatures: BattleCreatureCard[] = [];
  const powerCards: BattlePowerCard[] = [];
  const cards: PlayerBattleDeckCard[] = [];

  for (const row of rows) {
    let battleCard: BattleCreatureCard | BattlePowerCard;
    if (row.category === 'creature') {
      if (row.hp === null || row.power === null) {
        throw new PlayerBattleDeckError();
      }

      battleCard = {
        id: row.owned_card_id,
        affinity: row.affinity,
        maxHp: row.hp,
        maxPower: row.power,
        moves: (movesByDefinition.get(row.card_definition_id) ?? []).map(
          mapMove,
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

function mapMove(row: MoveRow): BattleMove {
  return {
    id: row.id,
    name: row.name,
    moveType: row.move_type,
    powerCost: row.power_cost,
    effects: [mapEffect(row)],
  };
}

function mapEffect(row: MoveRow | EffectRow): BattleEffect {
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
