import type { CardAffinity } from './card-types.js';

const affinityCycle: readonly CardAffinity[] = [
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
];

export function getCardTypeMultiplier(
  attacker: CardAffinity,
  defender: CardAffinity,
): 0.75 | 1 | 1.5 {
  if (attacker === defender) {
    return 1;
  }

  const attackerIndex = affinityCycle.indexOf(attacker);
  const defenderIndex = affinityCycle.indexOf(defender);

  if ((attackerIndex + 1) % affinityCycle.length === defenderIndex) {
    return 1.5;
  }

  if (
    (attackerIndex - 1 + affinityCycle.length) % affinityCycle.length ===
    defenderIndex
  ) {
    return 0.75;
  }

  return 1;
}
