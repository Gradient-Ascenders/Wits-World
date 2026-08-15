import { describe, expect, it } from 'vitest';

import {
  DeckRuleViolationError,
  getDeckRarityPoints,
  validateBasicDeck,
  type DeckRuleCard,
  type DeckRuleViolationCode,
} from '../src/cards/deck-rules.js';

describe('Basic deck rules', () => {
  it('maps the approved rarity points', () => {
    expect(getDeckRarityPoints('common')).toBe(1);
    expect(getDeckRarityPoints('rare')).toBe(2);
    expect(getDeckRarityPoints('epic')).toBe(3);
    expect(getDeckRarityPoints('legendary')).toBe(4);
  });

  it('accepts a valid five-card deck at exactly ten points', () => {
    const cards = [
      card(1, 'creature', 'legendary'),
      card(2, 'creature', 'rare'),
      card(3, 'creature', 'common'),
      card(4, 'power', 'rare'),
      card(5, 'power', 'common'),
    ];

    expect(validateBasicDeck(cards)).toEqual({
      totalCards: 5,
      creatureCount: 3,
      powerCount: 2,
      totalPoints: 10,
    });
  });

  it.each([
    {
      cards: validDeck().slice(0, 4),
      code: 'DECK_SIZE_INVALID',
    },
    {
      cards: [...validDeck(), card(6, 'power', 'common')],
      code: 'DECK_SIZE_INVALID',
    },
  ] as const)('rejects an invalid deck size', ({ cards, code }) => {
    expectViolation(cards, code);
  });

  it('rejects two uses of the same owned copy', () => {
    const cards = validDeck();

    cards[4] = {
      ...cards[4]!,
      ownedCardId: cards[3]!.ownedCardId,
    };

    expectViolation(cards, 'DECK_COPY_DUPLICATED');
  });

  it('allows two owned copies of the same card definition', () => {
    const cards = validDeck();

    cards[1] = {
      ...cards[1]!,
      cardDefinitionId: cards[0]!.cardDefinitionId,
    };

    expect(validateBasicDeck(cards)).toMatchObject({
      totalCards: 5,
      creatureCount: 3,
      powerCount: 2,
    });

    expect(cards[0]!.ownedCardId).not.toBe(cards[1]!.ownedCardId);
  });

  it.each([
    [
      [
        card(1, 'creature', 'common'),
        card(2, 'creature', 'common'),
        card(3, 'power', 'common'),
        card(4, 'power', 'common'),
        card(5, 'power', 'common'),
      ],
    ],
    [
      [
        card(1, 'creature', 'common'),
        card(2, 'creature', 'common'),
        card(3, 'creature', 'common'),
        card(4, 'creature', 'common'),
        card(5, 'power', 'common'),
      ],
    ],
  ])('rejects invalid Creature/Power composition', (cards) => {
    expectViolation(cards, 'DECK_COMPOSITION_INVALID');
  });

  it('rejects eleven rarity points', () => {
    const cards = [
      card(1, 'creature', 'legendary'),
      card(2, 'creature', 'epic'),
      card(3, 'creature', 'rare'),
      card(4, 'power', 'common'),
      card(5, 'power', 'common'),
    ];

    expectViolation(cards, 'DECK_POINT_CAP_EXCEEDED');
  });

  it('accepts a lower-cost legal deck', () => {
    expect(validateBasicDeck(validDeck())).toEqual({
      totalCards: 5,
      creatureCount: 3,
      powerCount: 2,
      totalPoints: 5,
    });
  });
});

function validDeck(): DeckRuleCard[] {
  return [
    card(1, 'creature', 'common'),
    card(2, 'creature', 'common'),
    card(3, 'creature', 'common'),
    card(4, 'power', 'common'),
    card(5, 'power', 'common'),
  ];
}

function card(
  index: number,
  category: DeckRuleCard['category'],
  rarity: DeckRuleCard['rarity'],
): DeckRuleCard {
  return {
    ownedCardId: `71000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    cardDefinitionId: `72000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    category,
    rarity,
  };
}

function expectViolation(
  cards: readonly DeckRuleCard[],
  code: DeckRuleViolationCode,
) {
  try {
    validateBasicDeck(cards);
  } catch (error) {
    expect(error).toBeInstanceOf(DeckRuleViolationError);

    expect((error as DeckRuleViolationError).code).toBe(code);

    return;
  }

  throw new Error(`Expected deck validation to fail with ${code}.`);
}
