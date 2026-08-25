import { describe, expect, it } from 'vitest';

import {
  describeActiveModifier,
  describeAppliedEffect,
  describeEffect,
} from '../src/battle/effect-presentation';
import type { MatchEffect } from '../src/api/matches';

describe('battle effect presentation', () => {
  it.each([
    [effect('damage', 15), '15 base damage'],
    [effect('heal', 12), 'Restore 12 HP'],
    [modifiedEffect('buff', 3, 'power', 'add'), 'Restore 3 Power'],
    [modifiedEffect('debuff', 2, 'power', 'add'), 'Opponent loses 2 Power'],
    [
      modifiedEffect('buff', 15, 'damage_multiplier', 'multiply', 3, 1.15),
      'Damage +15% · 3 turns',
    ],
    [
      modifiedEffect('debuff', 15, 'damage_multiplier', 'multiply', 3, 0.85),
      'Opponent damage −15% · 3 turns',
    ],
    [
      modifiedEffect('buff', 15, 'damage_multiplier', 'multiply', null, 1.15),
      'Damage +15% · Rest of battle',
    ],
  ])('describes the effect preview as %s', (input, expected) => {
    expect(describeEffect(input)).toBe(expected);
  });

  it('previews a 150% damage debuff as the rules-clamped 100% reduction', () => {
    expect(
      describeEffect(
        modifiedEffect('debuff', 150, 'damage_multiplier', 'multiply', 2, 0),
      ),
    ).toBe('Opponent damage −100% · 2 turns');
  });

  it('preserves authored order when a Power card has multiple effects', () => {
    const effects = [
      effect('damage', 8),
      modifiedEffect('buff', 3, 'power', 'add'),
    ];

    expect(effects.map(describeEffect)).toEqual([
      '8 base damage',
      'Restore 3 Power',
    ]);
  });

  it('describes finite, permanent, and stacked active modifiers separately', () => {
    const modifiers = [
      {
        stat: 'damage_multiplier' as const,
        operation: 'multiply' as const,
        percentage: 10,
        remainingTurns: 2,
      },
      {
        stat: 'damage_multiplier' as const,
        operation: 'multiply' as const,
        percentage: -10,
        remainingTurns: null,
      },
    ];

    expect(modifiers.map(describeActiveModifier)).toEqual([
      'Damage +10% · 2 turns',
      'Damage −10% · Rest of battle',
    ]);
  });

  it('describes a rules-clamped 150% damage debuff as a 100% reduction', () => {
    expect(
      describeActiveModifier({
        stat: 'damage_multiplier',
        operation: 'multiply',
        percentage: -100,
        remainingTurns: 2,
      }),
    ).toBe('Damage −100% · 2 turns');
  });

  it('describes immediate and persistent authoritative outcomes', () => {
    expect(
      describeAppliedEffect({
        amount: 22,
        damageMultiplier: 1.5,
        effectId: 'effect',
        effectType: 'damage',
        modifier: null,
        targetCreatureId: 'creature',
        targetSide: 'cpu',
      }),
    ).toBe('CPU Creature took 22 damage.');
    expect(
      describeAppliedEffect({
        amount: -2,
        damageMultiplier: null,
        effectId: 'effect',
        effectType: 'debuff',
        modifier: { stat: 'power', operation: 'add', durationTurns: null },
        targetCreatureId: 'creature',
        targetSide: 'cpu',
      }),
    ).toBe('CPU Creature lost 2 Power.');
    expect(
      describeAppliedEffect({
        amount: 15,
        damageMultiplier: 0.85,
        effectId: 'effect',
        effectType: 'debuff',
        modifier: {
          stat: 'damage_multiplier',
          operation: 'multiply',
          durationTurns: 3,
        },
        targetCreatureId: 'creature',
        targetSide: 'cpu',
      }),
    ).toBe('CPU Creature damage decreased by 15% for 3 turns.');
  });
});

function effect(
  effectType: 'damage' | 'heal',
  effectValue: number,
): MatchEffect {
  return { damageMultiplier: null, effectType, effectValue, modifier: null };
}

function modifiedEffect(
  effectType: 'buff' | 'debuff',
  effectValue: number,
  stat: 'damage_multiplier' | 'hp' | 'power',
  operation: 'add' | 'multiply',
  durationTurns?: number | null,
  damageMultiplier: number | null = null,
): MatchEffect {
  return {
    damageMultiplier,
    effectType,
    effectValue,
    modifier: { durationTurns, operation, stat },
  };
}
