import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateChallengeAttemptScore,
  InvalidChallengeMarkingStateError,
  type ChallengeAttemptMarkingQueryable,
} from '../src/challenges/challenge-attempt-marking.js';

const ATTEMPT_ID = '31000000-0000-4000-8000-000000000066';

interface TestMarkingRow {
  question_count: number;
  answer_key_count: number;
  answered_count: number;
  score_correct: number;
}

describe('challenge attempt marking', () => {
  it('derives score only from persisted answers and private answer keys', async () => {
    const fixture = createDatabaseFixture({
      question_count: 5,
      answer_key_count: 5,
      answered_count: 4,
      score_correct: 3,
    });

    const result = await calculateChallengeAttemptScore(
      fixture.database,
      ATTEMPT_ID,
    );

    expect(result).toEqual({
      totalQuestions: 5,
      answeredCount: 4,
      scoreCorrect: 3,
    });

    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining('private.challenge_answer_keys'),
      [ATTEMPT_ID],
    );

    const sql = fixture.query.mock.calls[0]?.[0] ?? '';

    expect(sql).toContain('selected_choice.source_choice_id');
    expect(sql).toContain('answer_key.accepted_choice_id');
  });

  it('counts unanswered questions as incorrect', async () => {
    const fixture = createDatabaseFixture({
      question_count: 5,
      answer_key_count: 5,
      answered_count: 2,
      score_correct: 1,
    });

    await expect(
      calculateChallengeAttemptScore(fixture.database, ATTEMPT_ID),
    ).resolves.toEqual({
      totalQuestions: 5,
      answeredCount: 2,
      scoreCorrect: 1,
    });
  });

  it('allows a zero score when no submitted answer is correct', async () => {
    const fixture = createDatabaseFixture({
      question_count: 5,
      answer_key_count: 5,
      answered_count: 5,
      score_correct: 0,
    });

    await expect(
      calculateChallengeAttemptScore(fixture.database, ATTEMPT_ID),
    ).resolves.toEqual({
      totalQuestions: 5,
      answeredCount: 5,
      scoreCorrect: 0,
    });
  });

  it('rejects an incomplete five-question marking state', async () => {
    const fixture = createDatabaseFixture({
      question_count: 4,
      answer_key_count: 4,
      answered_count: 4,
      score_correct: 3,
    });

    await expect(
      calculateChallengeAttemptScore(fixture.database, ATTEMPT_ID),
    ).rejects.toBeInstanceOf(InvalidChallengeMarkingStateError);
  });

  it('rejects a marking state with a missing private answer key', async () => {
    const fixture = createDatabaseFixture({
      question_count: 5,
      answer_key_count: 4,
      answered_count: 5,
      score_correct: 4,
    });

    await expect(
      calculateChallengeAttemptScore(fixture.database, ATTEMPT_ID),
    ).rejects.toBeInstanceOf(InvalidChallengeMarkingStateError);
  });

  it('does not expose accepted choices in its result', async () => {
    const fixture = createDatabaseFixture({
      question_count: 5,
      answer_key_count: 5,
      answered_count: 5,
      score_correct: 4,
    });

    const result = await calculateChallengeAttemptScore(
      fixture.database,
      ATTEMPT_ID,
    );

    expect(result).toEqual({
      totalQuestions: 5,
      answeredCount: 5,
      scoreCorrect: 4,
    });

    expect(result).not.toHaveProperty('correctAnswers');
    expect(result).not.toHaveProperty('acceptedChoiceId');
    expect(result).not.toHaveProperty('questions');
  });
});

function createDatabaseFixture(row: TestMarkingRow) {
  const query = vi.fn(
    async (
      statement: string,
      values: unknown[],
    ): Promise<{ rows: TestMarkingRow[] }> => {
      void statement;
      void values;

      return {
        rows: [row],
      };
    },
  );

  const database: ChallengeAttemptMarkingQueryable = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values: unknown[],
    ): Promise<{ rows: T[] }> {
      const result = await query(statement, values);

      return {
        rows: result.rows as unknown as T[],
      };
    },
  };

  return {
    database,
    query,
  };
}
