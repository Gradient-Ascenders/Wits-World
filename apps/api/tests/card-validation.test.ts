import { describe, expect, it } from 'vitest';

import {
  InvalidCardDefinitionError,
  validateCardDefinition,
  validateCardDefinitionForPublication,
} from '../src/cards/card-validation.js';

const validCreature = {
  name: 'Test Creature',
  category: 'creature' as const,
  affinity: 'wit' as const,
  rarity: 'common' as const,
  hp: 100,
  power: 10,
  moves: [
    {
      position: 1,
      name: 'Strike',
      moveType: 'basic' as const,
      effectType: 'damage' as const,
      effectValue: 10,
      powerCost: 1,
    },
  ],
};

const validPower = {
  name: 'Test Power',
  category: 'power' as const,
  affinity: 'wit' as const,
  rarity: 'common' as const,
  hp: null,
  power: null,
  effects: [
    {
      position: 1,
      effectType: 'heal' as const,
      effectValue: 10,
    },
  ],
};

describe('card definition validation', () => {
  it('accepts valid Creature and Power definitions', () => {
    expect(() => validateCardDefinition(validCreature)).not.toThrow();
    expect(() => validateCardDefinition(validPower)).not.toThrow();
  });

  it('accepts explicit null modifier metadata for direct effects', () => {
    expect(() =>
      validateCardDefinition({
        ...validPower,
        effects: [
          {
            position: 1,
            effectType: 'heal',
            effectValue: 10,
            modifierStat: null,
            modifierOperation: null,
            modifierDurationTurns: null,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('does not impose rarity-wide stat ranges', () => {
    expect(() =>
      validateCardDefinition({
        ...validCreature,
        rarity: 'legendary',
        hp: 1,
        power: 0,
      }),
    ).not.toThrow();
  });

  it('allows zero through four ordered Creature moves for drafts', () => {
    expect(() =>
      validateCardDefinition({
        ...validCreature,
        moves: [],
      }),
    ).not.toThrow();

    expect(() =>
      validateCardDefinition({
        ...validCreature,
        moves: [1, 2, 3, 4].map((position) => ({
          ...validCreature.moves[0]!,
          name: `Move ${position}`,
          position,
        })),
      }),
    ).not.toThrow();
  });

  it('rejects a fifth Creature move', () => {
    expect(() =>
      validateCardDefinition({
        ...validCreature,
        moves: [1, 2, 3, 4, 5].map((position) => ({
          ...validCreature.moves[0]!,
          name: `Move ${position}`,
          position,
        })),
      }),
    ).toThrow('at most four moves');
  });

  it('rejects a Creature move position above four', () => {
    expect(() =>
      validateCardDefinition({
        ...validCreature,
        moves: [{ ...validCreature.moves[0]!, position: 5 }],
      }),
    ).toThrow('positions must be between one and four');
  });

  it.each([
    ['invalid affinity', { ...validCreature, affinity: 'ember' }],
    [
      'invalid move type',
      {
        ...validCreature,
        moves: [{ ...validCreature.moves[0], moveType: 'ember' }],
      },
    ],
    ['negative HP', { ...validCreature, hp: -1 }],
    [
      'negative Power cost',
      {
        ...validCreature,
        moves: [{ ...validCreature.moves[0], powerCost: -1 }],
      },
    ],
    [
      'duplicate move positions',
      {
        ...validCreature,
        moves: [
          validCreature.moves[0],
          { ...validCreature.moves[0], name: 'Second' },
        ],
      },
    ],
  ])('rejects %s', (_description, definition) => {
    expect(() => validateCardDefinition(definition as never)).toThrow(
      InvalidCardDefinitionError,
    );
  });

  it('allows omitted effect values for every effect type', () => {
    expect(() =>
      validateCardDefinition({
        ...validPower,
        effects: [
          { position: 1, effectType: 'damage' },
          {
            position: 2,
            effectType: 'debuff',
            modifierStat: 'hp',
            modifierOperation: 'add',
          },
          { position: 3, effectType: 'heal' },
          {
            position: 4,
            effectType: 'buff',
            modifierStat: 'damage_multiplier',
            modifierOperation: 'multiply',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('keeps null executable values valid in drafts but rejects them for publication', () => {
    const creatureDraft = {
      ...validCreature,
      moves: [{ ...validCreature.moves[0]!, effectValue: null }],
    };
    const powerDraft = {
      ...validPower,
      effects: [{ ...validPower.effects[0]!, effectValue: null }],
    };

    expect(() => validateCardDefinition(creatureDraft)).not.toThrow();
    expect(() => validateCardDefinition(powerDraft)).not.toThrow();
    expect(() => validateCardDefinitionForPublication(creatureDraft)).toThrow(
      'Move "Strike" requires an effect value before publication',
    );
    expect(() => validateCardDefinitionForPublication(powerDraft)).toThrow(
      'Power-card effect 1 requires an effect value before publication',
    );
  });

  it('accepts non-null Creature and Power effects for publication', () => {
    expect(() =>
      validateCardDefinitionForPublication(validCreature),
    ).not.toThrow();
    expect(() =>
      validateCardDefinitionForPublication(validPower),
    ).not.toThrow();
  });

  it('requires modifier metadata for Buff and Debuff effects', () => {
    expect(() =>
      validateCardDefinition({
        ...validPower,
        effects: [{ position: 1, effectType: 'buff', effectValue: 3 }],
      }),
    ).toThrow('effects require modifier metadata');
  });

  it('validates modifier operation, target, and duration combinations', () => {
    expect(() =>
      validateCardDefinition({
        ...validPower,
        effects: [
          {
            position: 1,
            effectType: 'buff',
            effectValue: 3,
            modifierStat: 'damage_multiplier',
            modifierOperation: 'add',
          },
        ],
      }),
    ).toThrow('requires multiply');

    expect(() =>
      validateCardDefinition({
        ...validPower,
        effects: [
          {
            position: 1,
            effectType: 'buff',
            effectValue: 3,
            modifierStat: 'hp',
            modifierOperation: 'add',
            modifierDurationTurns: 2,
          },
        ],
      }),
    ).toThrow('Only damage-strength modifiers can define a duration');
  });
});
