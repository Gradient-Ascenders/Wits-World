import { describe, expect, it } from 'vitest';

import { getCardTypeMultiplier } from '../src/cards/card-rules.js';

describe('card type rules', () => {
  it('applies the approved five-affinity cycle', () => {
    expect(getCardTypeMultiplier('wit', 'grit')).toBe(1.5);
    expect(getCardTypeMultiplier('grit', 'spark')).toBe(1.5);
    expect(getCardTypeMultiplier('spark', 'spirit')).toBe(1.5);
    expect(getCardTypeMultiplier('spirit', 'mystic')).toBe(1.5);
    expect(getCardTypeMultiplier('mystic', 'wit')).toBe(1.5);
  });

  it('applies disadvantage to the reverse matchup', () => {
    expect(getCardTypeMultiplier('grit', 'wit')).toBe(0.75);
    expect(getCardTypeMultiplier('wit', 'mystic')).toBe(0.75);
  });

  it('leaves same and non-adjacent matchups neutral', () => {
    expect(getCardTypeMultiplier('wit', 'wit')).toBe(1);
    expect(getCardTypeMultiplier('wit', 'spark')).toBe(1);
    expect(getCardTypeMultiplier('wit', 'spirit')).toBe(1);
  });
});
