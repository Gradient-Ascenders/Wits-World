import { describe, expect, it } from 'vitest';

import {
  calculateChallengeDeadline,
  calculateChallengeTiming,
  InvalidChallengeSelectionError,
  selectChallengeTimeLimit,
} from '../src/challenges/challenge-timing.js';

describe('challenge timing rules', () => {
  it.each([
    {
      difficulties: [1, 1, 1, 1, 1] as const,
      averageDifficulty: 1,
      timeLimitSeconds: 90,
    },
    {
      difficulties: [1, 1, 1, 2, 2] as const,
      averageDifficulty: 1.4,
      timeLimitSeconds: 90,
    },
    {
      difficulties: [1, 1, 2, 2, 2] as const,
      averageDifficulty: 1.6,
      timeLimitSeconds: 120,
    },
    {
      difficulties: [2, 2, 2, 2, 2] as const,
      averageDifficulty: 2,
      timeLimitSeconds: 120,
    },
    {
      difficulties: [2, 2, 2, 3, 3] as const,
      averageDifficulty: 2.4,
      timeLimitSeconds: 120,
    },
    {
      difficulties: [2, 2, 3, 3, 3] as const,
      averageDifficulty: 2.6,
      timeLimitSeconds: 150,
    },
    {
      difficulties: [3, 3, 3, 3, 3] as const,
      averageDifficulty: 3,
      timeLimitSeconds: 150,
    },
  ])(
    'selects $timeLimitSeconds seconds for average difficulty $averageDifficulty',
    ({ difficulties, averageDifficulty, timeLimitSeconds }) => {
      expect(calculateChallengeTiming(difficulties)).toEqual({
        averageDifficulty,
        timeLimitSeconds,
      });
    },
  );

  it.each([
    [1, 90],
    [1.5, 90],
    [1.5001, 120],
    [2.5, 120],
    [2.5001, 150],
    [3, 150],
  ] as const)(
    'maps average difficulty %s to %s seconds',
    (averageDifficulty, expected) => {
      expect(selectChallengeTimeLimit(averageDifficulty)).toBe(expected);
    },
  );

  it('requires exactly five selected questions', () => {
    expect(() => calculateChallengeTiming([1, 2, 3, 1])).toThrow(
      InvalidChallengeSelectionError,
    );

    expect(() => calculateChallengeTiming([1, 2, 3, 1, 2, 3])).toThrow(
      InvalidChallengeSelectionError,
    );
  });

  it('rejects difficulty values outside the approved range', () => {
    expect(() => calculateChallengeTiming([1, 2, 3, 1, 4] as never)).toThrow(
      InvalidChallengeSelectionError,
    );

    expect(() => calculateChallengeTiming([1, 2, 3, 1, 1.5] as never)).toThrow(
      InvalidChallengeSelectionError,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0.99, 3.01])(
    'rejects invalid average difficulty %s',
    (averageDifficulty) => {
      expect(() => selectChallengeTimeLimit(averageDifficulty)).toThrow(
        InvalidChallengeSelectionError,
      );
    },
  );

  it('calculates the server deadline from the persisted time limit', () => {
    const startedAt = new Date('2026-09-01T10:00:00.000Z');

    expect(calculateChallengeDeadline(startedAt, 120).toISOString()).toBe(
      '2026-09-01T10:02:00.000Z',
    );
  });

  it('rejects an invalid challenge start time', () => {
    expect(() => calculateChallengeDeadline(new Date('invalid'), 90)).toThrow(
      InvalidChallengeSelectionError,
    );
  });
});
