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

  it('supports the two-card perfect-score outcome', () => {
    const result = calculateChallengeRewardPlan(5, 2, ['common'], () => 0);

    expect(result.cardRarities).toEqual(['common', 'common']);
  });

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
