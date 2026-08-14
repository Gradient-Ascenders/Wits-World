import { randomInt } from 'node:crypto';

import { CHALLENGE_QUESTION_COUNT } from './challenge-timing.js';

export type RandomIndexSource = (upperExclusive: number) => number;

export class InsufficientChallengeQuestionsError extends RangeError {
  constructor() {
    super(
      `A published challenge must provide at least ${CHALLENGE_QUESTION_COUNT} questions.`,
    );
    this.name = 'InsufficientChallengeQuestionsError';
  }
}

export class InvalidRandomIndexError extends RangeError {
  constructor() {
    super('Random index source returned an invalid index.');
    this.name = 'InvalidRandomIndexError';
  }
}

export function secureRandomIndex(upperExclusive: number): number {
  return randomInt(upperExclusive);
}

export function shuffleChallengeItems<T>(
  items: readonly T[],
  randomIndex: RandomIndexSource = secureRandomIndex,
): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selectedIndex = randomIndex(index + 1);

    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex > index
    ) {
      throw new InvalidRandomIndexError();
    }

    const current = shuffled[index]!;
    shuffled[index] = shuffled[selectedIndex]!;
    shuffled[selectedIndex] = current;
  }

  return shuffled;
}

export function selectChallengeQuestions<T>(
  questions: readonly T[],
  randomIndex: RandomIndexSource = secureRandomIndex,
): T[] {
  if (questions.length < CHALLENGE_QUESTION_COUNT) {
    throw new InsufficientChallengeQuestionsError();
  }

  return shuffleChallengeItems(questions, randomIndex).slice(
    0,
    CHALLENGE_QUESTION_COUNT,
  );
}
