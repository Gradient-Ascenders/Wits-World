import { describe, expect, it } from 'vitest';

import {
  calculateChallengeRewardPlan,
  RewardCatalogUnavailableError,
} from '../src/challenges/challenge-reward-policy.js';

const allRarities = ['common', 'rare', 'epic', 'legendary'] as const;

describe('challenge reward policy', () => {
  it.each([
    [0, 1, 0],
    [1, 1, 10],
    [1, 3, 20],
    [2, 1, 20],
    [2, 3, 30],
    [3, 1, 30],
    [3, 3, 40],
    [4, 1, 40],
    [4, 3, 50],
    [5, 1, 50],
    [5, 3, 75],
  ])(
    'calculates the score-band coins for %s correct at difficulty %s',
    (scoreCorrect, averageDifficulty, expectedCoins) => {
      const result = calculateChallengeRewardPlan(
        scoreCorrect,
        averageDifficulty,
        allRarities,
        () => 1,
      );

      expect(result.coinsAwarded).toBe(expectedCoins);
    },
  );

  it('guarantees one Common card for three correct answers', () => {
    const result = calculateChallengeRewardPlan(3, 2, ['common'], () => 0);

    expect(result.cardRarities).toEqual(['common']);
  });

  it('redistributes a four-answer reward when only Rare cards are available', () => {
    const result = calculateChallengeRewardPlan(4, 2, ['rare'], () => 0);

    expect(result.cardRarities).toEqual(['rare']);
  });

  it.each([
    [0, 'common'],
    [74, 'common'],
    [75, 'rare'],
    [99, 'rare'],
  ])(
    'selects the score-four rarity at weighted roll %s when both are available',
    (rarityRoll, expectedRarity) => {
      const result = calculateChallengeRewardPlan(
        4,
        2,
        ['common', 'rare'],
        () => rarityRoll,
      );

      expect(result.cardRarities).toEqual([expectedRarity]);
    },
  );

  it('supports the two-card perfect-score outcome', () => {
    const result = calculateChallengeRewardPlan(5, 2, ['common'], () => 0);

    expect(result.cardRarities).toEqual(['common', 'common']);
  });

  it.each([
    [0, ['common', 'common']],
    [1, ['common']],
    [4, ['common']],
  ])(
    'respects the perfect-score 20%% two-card boundary with roll %s',
    (cardCountRoll, expectedCards) => {
      const result = calculateChallengeRewardPlan(
        5,
        2,
        ['common'],
        (maxExclusive) => (maxExclusive === 5 ? cardCountRoll : 0),
      );

      expect(result.cardRarities).toEqual(expectedCards);
    },
  );

  it.each([
    [0, 'common'],
    [44, 'common'],
    [45, 'rare'],
    [84, 'rare'],
    [85, 'epic'],
    [98, 'epic'],
    [99, 'legendary'],
  ])(
    'selects the score-five rarity at weighted roll %s',
    (rarityRoll, expectedRarity) => {
      const result = calculateChallengeRewardPlan(
        5,
        2,
        allRarities,
        (maxExclusive) => (maxExclusive === 5 ? 1 : rarityRoll),
      );

      expect(result.cardRarities).toEqual([expectedRarity]);
    },
  );

  it('fails a guaranteed Common reward when the catalogue is empty', () => {
    expect(() => calculateChallengeRewardPlan(3, 2, [], () => 0)).toThrow(
      RewardCatalogUnavailableError,
    );
  });

  it('rejects invalid score and difficulty input', () => {
    expect(() =>
      calculateChallengeRewardPlan(6, 2, allRarities, () => 0),
    ).toThrow();
    expect(() =>
      calculateChallengeRewardPlan(3, 4, allRarities, () => 0),
    ).toThrow();
  });
});
