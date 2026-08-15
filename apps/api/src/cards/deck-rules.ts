import type { CardCategory, CardRarity } from './card-types.js';

export const BASIC_DECK_SIZE = 5;
export const BASIC_DECK_CREATURE_COUNT = 3;
export const BASIC_DECK_POWER_COUNT = 2;
export const BASIC_DECK_POINT_CAP = 10;

export const deckRarityPoints: Readonly<Record<CardRarity, number>> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export interface DeckRuleCard {
  ownedCardId: string;
  cardDefinitionId: string;
  category: CardCategory;
  rarity: CardRarity;
}

export interface DeckRuleSummary {
  totalCards: number;
  creatureCount: number;
  powerCount: number;
  totalPoints: number;
}

export type DeckRuleViolationCode =
  | 'DECK_SIZE_INVALID'
  | 'DECK_COPY_DUPLICATED'
  | 'DECK_COMPOSITION_INVALID'
  | 'DECK_POINT_CAP_EXCEEDED';

export class DeckRuleViolationError extends Error {
  readonly code: DeckRuleViolationCode;

  constructor(code: DeckRuleViolationCode, message: string) {
    super(message);
    this.name = 'DeckRuleViolationError';
    this.code = code;
  }
}

export function getDeckRarityPoints(rarity: CardRarity): number {
  return deckRarityPoints[rarity];
}

export function validateBasicDeck(
  cards: readonly DeckRuleCard[],
): DeckRuleSummary {
  if (cards.length !== BASIC_DECK_SIZE) {
    throw new DeckRuleViolationError(
      'DECK_SIZE_INVALID',
      'A Basic deck must contain exactly five cards.',
    );
  }

  if (new Set(cards.map((card) => card.ownedCardId)).size !== cards.length) {
    throw new DeckRuleViolationError(
      'DECK_COPY_DUPLICATED',
      'The same owned card copy cannot appear twice in one deck.',
    );
  }

  const creatureCount = cards.filter(
    (card) => card.category === 'creature',
  ).length;

  const powerCount = cards.filter((card) => card.category === 'power').length;

  if (
    creatureCount !== BASIC_DECK_CREATURE_COUNT ||
    powerCount !== BASIC_DECK_POWER_COUNT
  ) {
    throw new DeckRuleViolationError(
      'DECK_COMPOSITION_INVALID',
      'A Basic deck must contain three Creature cards and two Power cards.',
    );
  }

  const totalPoints = cards.reduce(
    (total, card) => total + getDeckRarityPoints(card.rarity),
    0,
  );

  if (totalPoints > BASIC_DECK_POINT_CAP) {
    throw new DeckRuleViolationError(
      'DECK_POINT_CAP_EXCEEDED',
      'A Basic deck cannot exceed ten rarity points.',
    );
  }

  return {
    totalCards: cards.length,
    creatureCount,
    powerCount,
    totalPoints,
  };
}
