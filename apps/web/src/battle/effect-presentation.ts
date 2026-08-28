import type {
  AppliedMatchEffect,
  MatchActiveModifier,
  MatchEffect,
} from '../api/matches';
import type { StarterPreviewEffect } from '../api/cards';

export function describeEffect(effect: MatchEffect): string {
  if (effect.effectType === 'damage') {
    return `${effect.effectValue} base damage`;
  }

  if (effect.effectType === 'heal') {
    return `Restore ${effect.effectValue} HP`;
  }

  const modifier = effect.modifier;
  if (!modifier) {
    return `${titleCase(effect.effectType)} ${effect.effectValue}`;
  }

  if (modifier.stat === 'hp') {
    return effect.effectType === 'buff'
      ? `Restore ${effect.effectValue} HP`
      : `Opponent loses ${effect.effectValue} HP`;
  }

  if (modifier.stat === 'power') {
    return effect.effectType === 'buff'
      ? `Restore ${effect.effectValue} Power`
      : `Opponent loses ${effect.effectValue} Power`;
  }

  const direction = effect.effectType === 'buff' ? '+' : '−';
  const subject = effect.effectType === 'buff' ? 'Damage' : 'Opponent damage';
  const percentage = effectiveDamagePercentage(effect.damageMultiplier);
  return `${subject} ${direction}${percentage}% · ${describeDuration(
    modifier.durationTurns ?? null,
  )}`;
}

export function describeStarterEffect(effect: StarterPreviewEffect): string {
  if (effect.effectValue === null) {
    return titleCase(effect.effectType);
  }

  const modifier =
    effect.modifierStat && effect.modifierOperation
      ? {
          durationTurns: effect.modifierDurationTurns,
          operation: effect.modifierOperation,
          stat: effect.modifierStat,
        }
      : null;
  const damageMultiplier =
    modifier?.stat === 'damage_multiplier' &&
    (effect.effectType === 'buff' || effect.effectType === 'debuff')
      ? effect.effectType === 'buff'
        ? 1 + effect.effectValue / 100
        : Math.max(0, 1 - effect.effectValue / 100)
      : null;

  return describeEffect({
    damageMultiplier,
    effectType: effect.effectType,
    effectValue: effect.effectValue,
    modifier,
  });
}

export function describeActiveModifier(modifier: MatchActiveModifier): string {
  const direction = modifier.percentage >= 0 ? '+' : '−';
  return `Damage ${direction}${Math.abs(modifier.percentage)}% · ${describeDuration(
    modifier.remainingTurns,
  )}`;
}

export function describeAppliedEffect(effect: AppliedMatchEffect): string {
  const target =
    effect.targetSide === 'player' ? 'Your Creature' : 'CPU Creature';

  if (effect.effectType === 'damage') {
    return `${target} took ${Math.abs(effect.amount)} damage.`;
  }

  if (effect.effectType === 'heal') {
    return `${target} restored ${Math.abs(effect.amount)} HP.`;
  }

  const stat = effect.modifier?.stat;
  if (stat === 'hp') {
    return effect.effectType === 'buff'
      ? `${target} restored ${Math.abs(effect.amount)} HP.`
      : `${target} lost ${Math.abs(effect.amount)} HP.`;
  }

  if (stat === 'power') {
    return effect.effectType === 'buff'
      ? `${target} restored ${Math.abs(effect.amount)} Power.`
      : `${target} lost ${Math.abs(effect.amount)} Power.`;
  }

  if (stat === 'damage_multiplier') {
    const direction = effect.effectType === 'buff' ? 'increased' : 'decreased';
    return `${target} damage ${direction} by ${Math.abs(effect.amount)}% for ${describeDuration(
      effect.modifier?.durationTurns ?? null,
    ).toLowerCase()}.`;
  }

  return `${target} received ${effect.effectType} ${effect.amount}.`;
}

function describeDuration(remainingTurns: number | null): string {
  if (remainingTurns === null) return 'Rest of battle';
  return `${remainingTurns} ${remainingTurns === 1 ? 'turn' : 'turns'}`;
}

function effectiveDamagePercentage(multiplier: number | null): number {
  if (multiplier === null) {
    throw new Error('Damage multiplier preview is missing its projection.');
  }
  return Math.abs(Math.round((multiplier - 1) * 100));
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
