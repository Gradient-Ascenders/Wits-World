import type pg from 'pg';

import type {
  CardAffinity,
  CardCategory,
  CardEffect,
  CardMove,
  CardRarity,
  OwnedCard,
} from './card-types.js';

export interface CardCollectionQueryable {
  query<T extends pg.QueryResultRow>(
    statement: string,
    values: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface CardCollectionService {
  listOwnedCards(
    playerId: string,
    unique?: boolean,
    deckId?: string,
    ownedCardIds?: readonly string[],
  ): Promise<OwnedCard[]>;
  listTradingCatalogue(): Promise<TradingCardDefinition[]>;
}

export type TradingCardDefinition = Pick<
  OwnedCard,
  | 'affinity'
  | 'cardDefinitionId'
  | 'category'
  | 'description'
  | 'effects'
  | 'hp'
  | 'imageAlt'
  | 'imageUrl'
  | 'isActive'
  | 'moves'
  | 'name'
  | 'power'
  | 'rarity'
>;

interface OwnedCardRow extends pg.QueryResultRow {
  acquired_at: Date;
  acquisition_kind: OwnedCard['acquisitionKind'];
  affinity: CardAffinity | null;
  card_definition_id: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  image_alt: string | null;
  image_url: string | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  owned_card_id: string;
  power: number | null;
  rarity: CardRarity;
}

interface TradingCardDefinitionRow extends pg.QueryResultRow {
  affinity: CardAffinity | null;
  card_definition_id: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  image_alt: string | null;
  image_url: string | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  power: number | null;
  rarity: CardRarity;
}

export function createCardCollectionService(
  database: CardCollectionQueryable,
): CardCollectionService {
  return {
    async listOwnedCards(playerId, unique = false, deckId, ownedCardIds) {
      if (ownedCardIds?.length === 0) return [];
      const values: unknown[] = [playerId];
      if (deckId) values.push(deckId);
      const copyScope = ownedCardIds
        ? `and owned.id = any($${values.push(ownedCardIds)}::uuid[])`
        : '';
      // Scope before move/effect projection (and before unique-copy selection).
      // Both the deck and the owned copy must belong to the authenticated player.
      const deckScope = deckId
        ? `and exists (
            select 1
            from public.player_deck_cards membership
            join public.player_decks deck
              on deck.id = membership.deck_id
             and deck.player_id = membership.player_id
            where membership.deck_id = $2::uuid
              and membership.player_id = $1::uuid
              and membership.owned_card_id = owned.id
          )`
        : '';
      const result = await database.query<OwnedCardRow>(
        `
          select
            owned.id::text as owned_card_id,
            owned.acquisition_kind,
            owned.acquired_at,
            definition.id::text as card_definition_id,
            definition.name,
            definition.category,
            definition.affinity,
            definition.rarity,
            definition.hp,
            definition.power,
            definition.description,
            definition.image_alt,
            definition.image_url,
            definition.is_active,
            coalesce((
              select json_agg(
                json_build_object(
                  'id', move.id::text,
                  'position', move.position,
                  'name', move.name,
                  'moveType', move.move_type,
                  'effectType', move.effect_type,
                  'effectValue', move.effect_value,
                  'modifierStat', move.modifier_stat,
                  'modifierOperation', move.modifier_operation,
                  'modifierDurationTurns', move.modifier_duration_turns,
                  'powerCost', move.power_cost,
                  'rulesText', move.rules_text
                ) order by move.position
              )
              from public.card_moves move
              where move.card_definition_id = definition.id
            ), '[]'::json) as moves,
            coalesce((
              select json_agg(
                json_build_object(
                  'id', effect.id::text,
                  'position', effect.position,
                  'effectType', effect.effect_type,
                  'effectValue', effect.effect_value,
                  'modifierStat', effect.modifier_stat,
                  'modifierOperation', effect.modifier_operation,
                  'modifierDurationTurns', effect.modifier_duration_turns,
                  'rulesText', effect.rules_text
                ) order by effect.position
              )
              from public.card_effects effect
              where effect.card_definition_id = definition.id
            ), '[]'::json) as effects
          from ${
            unique
              ? `(
            select distinct on (card_definition_id) *
            from public.player_cards owned
            where owned.player_id = $1::uuid
            ${deckScope}
            ${copyScope}
            order by card_definition_id, acquired_at desc, id desc
          )`
              : 'public.player_cards'
          } owned
          join public.card_definitions definition
            on definition.id = owned.card_definition_id
          where owned.player_id = $1::uuid
          ${unique ? '' : deckScope}
          ${unique ? '' : copyScope}
          order by owned.acquired_at desc, owned.id desc
        `,
        values,
      );

      return result.rows.map(mapOwnedCard);
    },

    async listTradingCatalogue() {
      const result = await database.query<TradingCardDefinitionRow>(
        `
          select
            definition.id::text as card_definition_id,
            definition.name,
            definition.category,
            definition.affinity,
            definition.rarity,
            definition.hp,
            definition.power,
            definition.description,
            definition.image_url,
            definition.image_alt,
            definition.is_active,
            coalesce((
              select json_agg(
                json_build_object(
                  'id', move.id::text,
                  'position', move.position,
                  'name', move.name,
                  'moveType', move.move_type,
                  'effectType', move.effect_type,
                  'effectValue', move.effect_value,
                  'modifierStat', move.modifier_stat,
                  'modifierOperation', move.modifier_operation,
                  'modifierDurationTurns', move.modifier_duration_turns,
                  'powerCost', move.power_cost,
                  'rulesText', move.rules_text
                ) order by move.position
              )
              from public.card_moves move
              where move.card_definition_id = definition.id
            ), '[]'::json) as moves,
            coalesce((
              select json_agg(
                json_build_object(
                  'id', effect.id::text,
                  'position', effect.position,
                  'effectType', effect.effect_type,
                  'effectValue', effect.effect_value,
                  'modifierStat', effect.modifier_stat,
                  'modifierOperation', effect.modifier_operation,
                  'modifierDurationTurns', effect.modifier_duration_turns,
                  'rulesText', effect.rules_text
                ) order by effect.position
              )
              from public.card_effects effect
              where effect.card_definition_id = definition.id
            ), '[]'::json) as effects
          from public.card_definitions definition
          where definition.is_active
            and definition.authoring_status = 'published'
          order by
            definition.category,
            definition.name,
            definition.id
        `,
        [],
      );

      return result.rows.map((row) => ({
        affinity: row.affinity,
        cardDefinitionId: row.card_definition_id,
        category: row.category,
        description: row.description,
        effects: row.effects ?? [],
        hp: row.hp,
        imageAlt: row.image_alt,
        imageUrl: row.image_url,
        isActive: row.is_active,
        moves: row.moves ?? [],
        name: row.name,
        power: row.power,
        rarity: row.rarity,
      }));
    },
  };
}

function mapOwnedCard(row: OwnedCardRow): OwnedCard {
  return {
    ownedCardId: row.owned_card_id,
    cardDefinitionId: row.card_definition_id,
    name: row.name,
    category: row.category,
    affinity: row.affinity,
    rarity: row.rarity,
    hp: row.hp,
    power: row.power,
    description: row.description,
    imageAlt: row.image_alt,
    imageUrl: row.image_url,
    isActive: row.is_active,
    moves: row.moves ?? [],
    effects: row.effects ?? [],
    acquisitionKind: row.acquisition_kind,
    acquiredAt: row.acquired_at.toISOString(),
  };
}
