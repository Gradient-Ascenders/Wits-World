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
  listOwnedCards(playerId: string): Promise<OwnedCard[]>;
}

interface OwnedCardRow extends pg.QueryResultRow {
  acquired_at: Date;
  acquisition_kind: OwnedCard['acquisitionKind'];
  affinity: CardAffinity;
  card_definition_id: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  image_url: string | null;
  is_active: boolean;
  moves: CardMove[];
  name: string;
  owned_card_id: string;
  power: number | null;
  rarity: CardRarity;
}

export function createCardCollectionService(
  database: CardCollectionQueryable,
): CardCollectionService {
  return {
    async listOwnedCards(playerId) {
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
                  'powerCost', move.power_cost
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
                  'modifierDurationTurns', effect.modifier_duration_turns
                ) order by effect.position
              )
              from public.card_effects effect
              where effect.card_definition_id = definition.id
            ), '[]'::json) as effects
          from public.player_cards owned
          join public.card_definitions definition
            on definition.id = owned.card_definition_id
          where owned.player_id = $1::uuid
          order by owned.acquired_at desc, owned.id desc
        `,
        [playerId],
      );

      return result.rows.map(mapOwnedCard);
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
    imageUrl: row.image_url,
    isActive: row.is_active,
    moves: row.moves ?? [],
    effects: row.effects ?? [],
    acquisitionKind: row.acquisition_kind,
    acquiredAt: row.acquired_at.toISOString(),
  };
}
