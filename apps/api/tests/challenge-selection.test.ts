import { describe, expect, it } from 'vitest';

import {
  InsufficientChallengeQuestionsError,
  InvalidRandomIndexError,
  selectChallengeQuestions,
  shuffleChallengeItems,
} from '../src/challenges/challenge-selection.js';

describe('challenge selection rules', () => {
  it('selects exactly five distinct questions from a larger pool', () => {
    const questions = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];

    const selected = selectChallengeQuestions(questions, () => 0);

    expect(selected).toEqual(['q2', 'q3', 'q4', 'q5', 'q6']);
    expect(selected).toHaveLength(5);
    expect(new Set(selected).size).toBe(5);
  });

  it('does not mutate the original question pool', () => {
    const questions = ['q1', 'q2', 'q3', 'q4', 'q5'];

    selectChallengeQuestions(questions, () => 0);

    expect(questions).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
  });

  it('shuffles choice order using the injected random source', () => {
    const choices = ['a', 'b', 'c', 'd'];

    const shuffled = shuffleChallengeItems(choices, () => 0);

    expect(shuffled).toEqual(['b', 'c', 'd', 'a']);
    expect(new Set(shuffled)).toEqual(new Set(choices));
  });

  it('requires at least five published questions', () => {
    expect(() => selectChallengeQuestions(['q1', 'q2', 'q3', 'q4'])).toThrow(
      InsufficientChallengeQuestionsError,
    );
  });

  it.each([() => -1, (upperExclusive: number) => upperExclusive, () => 1.5])(
    'rejects an invalid random index source',
    (randomIndex) => {
      expect(() => shuffleChallengeItems(['a', 'b'], randomIndex)).toThrow(
        InvalidRandomIndexError,
      );
    },
  );
});
