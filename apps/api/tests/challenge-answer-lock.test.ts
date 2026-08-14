import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  ChallengeAnswerLockedError,
  ChallengeAttemptCompletedError,
  ChallengeAttemptNotFoundError,
  InvalidChallengeAnswerError,
  lockChallengeAnswer,
  type ChallengeAnswerLockQueryable,
} from '../src/challenges/challenge-answer-lock.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000166';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000066';
const QUESTION_ID = '32000000-0000-4000-8000-000000000001';
const CHOICE_ID = '33000000-0000-4000-8000-000000000001';
const OTHER_CHOICE_ID = '33000000-0000-4000-8000-000000000002';

const RECEIVED_AT = new Date('2026-09-01T10:01:00.000Z');
const DEADLINE = new Date('2026-09-01T10:02:00.000Z');

describe('challenge answer locking', () => {
  it('binds lookup to both attempt and authenticated player and locks the attempt', async () => {
    const fixture = createFixture();

    await lockChallengeAnswer(fixture.database, validInput());

    const attemptCall = fixture.query.mock.calls[0];

    expect(attemptCall?.[0]).toContain('for update');
    expect(attemptCall?.[0]).toContain('attempt.player_id = $2::uuid');
    expect(attemptCall?.[1]).toEqual([ATTEMPT_ID, PLAYER_ID]);
  });

  it('returns not found for a missing or wrong-owner attempt', async () => {
    const fixture = createFixture({
      attemptExists: false,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).rejects.toBeInstanceOf(ChallengeAttemptNotFoundError);

    expect(fixture.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a question that does not belong to the attempt', async () => {
    const fixture = createFixture({
      bindingExists: false,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).rejects.toBeInstanceOf(InvalidChallengeAnswerError);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );
  });

  it('rejects a choice that does not belong to the selected question', async () => {
    const fixture = createFixture({
      choiceBelongsToQuestion: false,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).rejects.toBeInstanceOf(InvalidChallengeAnswerError);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );
  });

  it('locks a new on-time answer using server receipt time', async () => {
    const fixture = createFixture({
      answeredCountAfterInsert: 3,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).resolves.toEqual({
      outcome: 'accepted',
      answeredCount: 3,
      finalizationReason: null,
    });

    const insertCall = fixture.query.mock.calls.find(([sql]) =>
      sql.includes('insert into public.attempt_answers'),
    );

    expect(insertCall?.[1]).toEqual([
      QUESTION_ID,
      CHOICE_ID,
      RECEIVED_AT.toISOString(),
    ]);
  });

  it('treats an exact duplicate answer as idempotent', async () => {
    const fixture = createFixture({
      existingChoiceId: CHOICE_ID,
      answeredCountAfterInsert: 2,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).resolves.toEqual({
      outcome: 'idempotent',
      answeredCount: 2,
      finalizationReason: null,
    });

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );
  });

  it('rejects a different choice after the question is locked', async () => {
    const fixture = createFixture({
      existingChoiceId: OTHER_CHOICE_ID,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).rejects.toBeInstanceOf(ChallengeAnswerLockedError);

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );
  });

  it('signals answered finalization when the fifth answer is accepted', async () => {
    const fixture = createFixture({
      answeredCountAfterInsert: 5,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).resolves.toEqual({
      outcome: 'accepted',
      answeredCount: 5,
      finalizationReason: 'answered',
    });
  });

  it('does not accept an answer received exactly at the deadline', async () => {
    const fixture = createFixture();

    await expect(
      lockChallengeAnswer(fixture.database, {
        ...validInput(),
        receivedAt: DEADLINE,
      }),
    ).resolves.toEqual({
      outcome: 'expired',
      finalizationReason: 'timeout',
    });

    const sql = executedSql(fixture.query);

    expect(sql).not.toContain('from public.attempt_questions question');
    expect(sql).not.toContain('insert into public.attempt_answers');
  });

  it('recognizes an exact retry against an already completed attempt', async () => {
    const fixture = createFixture({
      status: 'completed',
      existingChoiceId: CHOICE_ID,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).resolves.toEqual({
      outcome: 'completed_retry',
    });

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );
  });

  it('rejects a new answer against an already completed attempt', async () => {
    const fixture = createFixture({
      status: 'completed',
      existingChoiceId: OTHER_CHOICE_ID,
    });

    await expect(
      lockChallengeAnswer(fixture.database, validInput()),
    ).rejects.toBeInstanceOf(ChallengeAttemptCompletedError);
  });
});

interface FixtureOptions {
  attemptExists?: boolean;
  status?: 'in_progress' | 'completed';
  bindingExists?: boolean;
  choiceBelongsToQuestion?: boolean;
  existingChoiceId?: string | null;
  answeredCountAfterInsert?: number;
}

function createFixture({
  attemptExists = true,
  status = 'in_progress',
  bindingExists = true,
  choiceBelongsToQuestion = true,
  existingChoiceId = null,
  answeredCountAfterInsert = 1,
}: FixtureOptions = {}) {
  const query = vi.fn(
    async (
      statement: string,
      values: unknown[],
    ): Promise<{ rows: pg.QueryResultRow[] }> => {
      void values;

      if (statement.includes('from public.challenge_attempts attempt')) {
        return {
          rows: attemptExists
            ? [
                {
                  status,
                  deadline: DEADLINE,
                },
              ]
            : [],
        };
      }

      if (statement.includes('from public.attempt_questions question')) {
        if (statement.includes('left join public.attempt_question_choices')) {
          return {
            rows: bindingExists
              ? [
                  {
                    attempt_question_id: QUESTION_ID,
                    choice_id: choiceBelongsToQuestion ? CHOICE_ID : null,
                    selected_choice_id: existingChoiceId,
                  },
                ]
              : [],
          };
        }

        if (statement.includes('count(answer.attempt_question_id)')) {
          return {
            rows: [
              {
                answered_count: answeredCountAfterInsert,
              },
            ],
          };
        }
      }

      if (statement.includes('insert into public.attempt_answers')) {
        return {
          rows: [],
        };
      }

      throw new Error(`Unexpected SQL in test fixture: ${statement}`);
    },
  );

  const database: ChallengeAnswerLockQueryable = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values: unknown[],
    ): Promise<{ rows: T[] }> {
      const result = await query(statement, values);

      return {
        rows: result.rows as T[],
      };
    },
  };

  return {
    database,
    query,
  };
}

function validInput() {
  return {
    playerId: PLAYER_ID,
    attemptId: ATTEMPT_ID,
    attemptQuestionId: QUESTION_ID,
    choiceId: CHOICE_ID,
    receivedAt: RECEIVED_AT,
  };
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls.map((call) => String(call[0])).join('\n');
}
