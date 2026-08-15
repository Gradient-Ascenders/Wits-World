import { describe, expect, it } from 'vitest';

import {
  InvalidCardDefinitionError,
  validateCardDefinition,
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
