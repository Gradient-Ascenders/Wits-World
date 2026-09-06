export const cardAffinities = [
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
] as const;

export type CardAffinity = (typeof cardAffinities)[number];

export const starterAffinities = [
  'spark',
  'grit',
  'wit',
] as const satisfies readonly CardAffinity[];

export type StarterAffinity = (typeof starterAffinities)[number];

export const cardCategories = ['creature', 'power'] as const;

export type CardCategory = (typeof cardCategories)[number];

export const cardRarities = ['common', 'rare', 'epic', 'legendary'] as const;

export type CardRarity = (typeof cardRarities)[number];

export const moveTypes = ['basic', ...cardAffinities] as const;

export type MoveType = (typeof moveTypes)[number];

export const effectTypes = ['damage', 'debuff', 'heal', 'buff'] as const;

export type EffectType = (typeof effectTypes)[number];

export const modifierStats = ['hp', 'power', 'damage_multiplier'] as const;

export type ModifierStat = (typeof modifierStats)[number];

export const modifierOperations = ['add', 'multiply'] as const;

export type ModifierOperation = (typeof modifierOperations)[number];

export interface CardMove {
  id: string;
  position: number;
  name: string;
  moveType: MoveType;
  effectType: EffectType;
  effectValue: number | null;
  modifierStat: ModifierStat | null;
  modifierOperation: ModifierOperation | null;
  modifierDurationTurns: number | null;
  powerCost: number;
  rulesText?: string | null;
}

export interface CardEffect {
  id: string;
  position: number;
  effectType: EffectType;
  effectValue: number | null;
  modifierStat: ModifierStat | null;
  modifierOperation: ModifierOperation | null;
  modifierDurationTurns: number | null;
  rulesText?: string | null;
}

export interface CardDefinition {
  id: string;
  name: string;
  category: CardCategory;
  affinity: CardAffinity | null;
  rarity: CardRarity;
  hp: number | null;
  power: number | null;
  description: string | null;
  imageUrl: string | null;
  imageAlt?: string | null;
  artworkAttribution?: string | null;
  isActive: boolean;
  moves: CardMove[];
  effects: CardEffect[];
}

export interface OwnedCard extends Omit<CardDefinition, 'id'> {
  cardDefinitionId: string;
  ownedCardId: string;
  acquisitionKind: 'event_reward' | 'starter';
  acquiredAt: string;
}

export interface StarterGrant {
  starterGrantId: string;
  affinity: CardAffinity;
  grantedAt: string;
  cards: OwnedCard[];
}

export type StarterPreviewMove = Omit<CardMove, 'id'>;

export type StarterPreviewEffect = Omit<CardEffect, 'id'>;

export interface StarterCreaturePreview {
  name: string;
  hp: number;
  power: number;
  moves: StarterPreviewMove[];
}

export interface StarterPowerCardPreview {
  name: string;
  effects: StarterPreviewEffect[];
}

export interface StarterOption {
  affinity: StarterAffinity;
  title: string;
  description: string;
  highlights: [string, string, string];
  composition: {
    creatureCount: 3;
    powerCardCount: 2;
  };
  creatures: StarterCreaturePreview[];
  powerCards: StarterPowerCardPreview[];
}
