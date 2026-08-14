export const CHALLENGE_QUESTION_COUNT = 5;

export type ChallengeDifficulty = 1 | 2 | 3;
export type ChallengeTimeLimitSeconds = 90 | 120 | 150;

export interface ChallengeTiming {
  averageDifficulty: number;
  timeLimitSeconds: ChallengeTimeLimitSeconds;
}

export class InvalidChallengeSelectionError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChallengeSelectionError';
  }
}

export function calculateChallengeTiming(
  difficulties: readonly ChallengeDifficulty[],
): ChallengeTiming {
  if (difficulties.length !== CHALLENGE_QUESTION_COUNT) {
    throw new InvalidChallengeSelectionError(
      `A challenge attempt must contain exactly ${CHALLENGE_QUESTION_COUNT} questions.`,
    );
  }

  for (const difficulty of difficulties) {
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3) {
      throw new InvalidChallengeSelectionError(
        'Challenge difficulty must be an integer from 1 through 3.',
      );
    }
  }

  const totalDifficulty = difficulties.reduce(
    (total, difficulty) => total + difficulty,
    0,
  );

  const averageDifficulty = Number(
    (totalDifficulty / CHALLENGE_QUESTION_COUNT).toFixed(2),
  );

  return {
    averageDifficulty,
    timeLimitSeconds: selectChallengeTimeLimit(averageDifficulty),
  };
}

export function selectChallengeTimeLimit(
  averageDifficulty: number,
): ChallengeTimeLimitSeconds {
  if (
    !Number.isFinite(averageDifficulty) ||
    averageDifficulty < 1 ||
    averageDifficulty > 3
  ) {
    throw new InvalidChallengeSelectionError(
      'Average challenge difficulty must be between 1 and 3.',
    );
  }

  if (averageDifficulty <= 1.5) {
    return 90;
  }

  if (averageDifficulty <= 2.5) {
    return 120;
  }

  return 150;
}

export function calculateChallengeDeadline(
  startedAt: Date,
  timeLimitSeconds: ChallengeTimeLimitSeconds,
): Date {
  const startedAtMilliseconds = startedAt.getTime();

  if (!Number.isFinite(startedAtMilliseconds)) {
    throw new InvalidChallengeSelectionError(
      'Challenge start time must be valid.',
    );
  }

  return new Date(startedAtMilliseconds + timeLimitSeconds * 1_000);
}
