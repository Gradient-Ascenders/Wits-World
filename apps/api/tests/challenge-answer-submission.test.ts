import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createChallengeAnswerSubmissionService,
  type ChallengeAnswerSubmissionQueryable,
  type ChallengeAnswerSubmissionTransactionClient,
  type ChallengeAttemptCompletionFinalizer,
} from '../src/challenges/challenge-answer-submission.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000166';
const EVENT_ID = '00000000-0000-4000-8000-000000000066';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000066';
const QUESTION_ID = '32000000-0000-4000-8000-000000000001';
const CHOICE_ID = '33000000-0000-4000-8000-000000000001';

const RECEIVED_AT = new Date('2026-09-01T10:01:00.000Z');
const DEADLINE = new Date('2026-09-01T10:02:00.000Z');

describe('challenge answer submission coordinator', () => {
  it('commits a normal answer and returns the updated player-safe attempt', async () => {
    const fixture = createFixture({
      answerCount: 1,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    const result = await service.submitAnswer(validInput());

    expect(result).toMatchObject({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      status: 'in_progress',
      answeredCount: 1,
    });
    expect(result).not.toHaveProperty('review');
    expect(result).not.toHaveProperty('scoreCorrect');
    expect(result).not.toHaveProperty('reward');

    expect(fixture.finalizeAttempt).not.toHaveBeenCalled();

    expect(transactionCommands(fixture.query)).toEqual(['begin', 'commit']);

    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it('uses the server clock as the persisted answer receipt time', async () => {
    const fixture = createFixture({
      answerCount: 1,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    await service.submitAnswer(validInput());

    const answerInsert = fixture.query.mock.calls.find(([statement]) =>
      String(statement).includes('insert into public.attempt_answers'),
    );

    expect(answerInsert?.[1]).toEqual([
      QUESTION_ID,
      CHOICE_ID,
      RECEIVED_AT.toISOString(),
    ]);
  });

  it('marks and finalizes the fifth answer inside the same transaction', async () => {
    const fixture = createFixture({
      answerCount: 5,
      scoreCorrect: 4,
      becomeCompletedAfterFinalizer: true,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    const result = await service.submitAnswer(validInput());

    expect(fixture.finalizeAttempt).toHaveBeenCalledWith(fixture.client, {
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      completionReason: 'answered',
      scoreCorrect: 4,
      completedAt: RECEIVED_AT,
    });

    expect(result).toMatchObject({
      attemptId: ATTEMPT_ID,
      status: 'completed',
      scoreCorrect: 4,
    });

    if (result.status !== 'completed') {
      throw new Error('Expected the fifth answer to complete the attempt.');
    }

    expect(result.review).toHaveLength(5);
    expect(result.review.every((entry) => entry.selectedChoice !== null)).toBe(
      true,
    );
    expect(result.review.filter((entry) => entry.isCorrect)).toHaveLength(
      result.scoreCorrect,
    );

    expect(transactionCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('finalizes an expired attempt as timeout without inserting the late answer', async () => {
    const expiredAt = new Date('2026-09-01T10:02:00.000Z');

    const fixture = createFixture({
      answerCount: 3,
      scoreCorrect: 2,
      becomeCompletedAfterFinalizer: true,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => expiredAt,
    });

    await service.submitAnswer(validInput());

    expect(executedSql(fixture.query)).not.toContain(
      'insert into public.attempt_answers',
    );

    expect(fixture.finalizeAttempt).toHaveBeenCalledWith(fixture.client, {
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      completionReason: 'timeout',
      scoreCorrect: 2,
      completedAt: expiredAt,
    });
  });

  it('returns the persisted result for an exact retry against a completed attempt', async () => {
    const fixture = createFixture({
      initialStatus: 'completed',
      existingChoiceId: CHOICE_ID,
      answerCount: 5,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    const result = await service.submitAnswer(validInput());

    expect(result).toMatchObject({
      attemptId: ATTEMPT_ID,
      status: 'completed',
    });

    if (result.status !== 'completed') {
      throw new Error('Expected a completed retry result.');
    }

    expect(result.review).toHaveLength(5);

    expect(fixture.finalizeAttempt).not.toHaveBeenCalled();

    expect(transactionCommands(fixture.query)).toEqual(['begin', 'commit']);
  });

  it('rolls back the fifth answer when finalization fails', async () => {
    const fixture = createFixture({
      answerCount: 5,
      scoreCorrect: 4,
      finalizerFailure: new Error('reward transaction failed'),
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    await expect(service.submitAnswer(validInput())).rejects.toThrow(
      'reward transaction failed',
    );

    expect(transactionCommands(fixture.query)).toEqual(['begin', 'rollback']);

    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it('rolls back when the finalizer does not persist a completed attempt', async () => {
    const fixture = createFixture({
      answerCount: 5,
      scoreCorrect: 3,
      becomeCompletedAfterFinalizer: false,
    });

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => RECEIVED_AT,
    });

    await expect(service.submitAnswer(validInput())).rejects.toThrow(
      'Challenge finalizer did not persist a completed attempt.',
    );

    expect(transactionCommands(fixture.query)).toEqual(['begin', 'rollback']);
  });

  it('rejects an invalid server clock before opening a transaction', async () => {
    const fixture = createFixture();

    const service = createChallengeAnswerSubmissionService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => new Date('invalid'),
    });

    await expect(service.submitAnswer(validInput())).rejects.toThrow(
      'Challenge answer submission clock returned an invalid timestamp.',
    );

    expect(fixture.connect).not.toHaveBeenCalled();
  });
});

interface FixtureOptions {
  initialStatus?: 'in_progress' | 'completed';
  existingChoiceId?: string | null;
  answerCount?: number;
  scoreCorrect?: number;
  becomeCompletedAfterFinalizer?: boolean;
  finalizerFailure?: Error;
}

function createFixture({
  initialStatus = 'in_progress',
  existingChoiceId = null,
  answerCount = 1,
  scoreCorrect = 1,
  becomeCompletedAfterFinalizer = false,
  finalizerFailure,
}: FixtureOptions = {}) {
  let status: 'in_progress' | 'completed' = initialStatus;
  let completionReason: 'answered' | 'timeout' | null =
    initialStatus === 'completed' ? 'answered' : null;

  const query = vi.fn(
    async (
      statement: string,
      values: unknown[],
    ): Promise<{ rows: pg.QueryResultRow[] }> => {
      void values;

      const normalized = statement.trim().toLowerCase();

      if (
        normalized === 'begin' ||
        normalized === 'commit' ||
        normalized === 'rollback'
      ) {
        return {
          rows: [],
        };
      }

      if (statement.includes('from public.challenge_attempts attempt')) {
        if (statement.includes('for update')) {
          return {
            rows: [
              {
                status,
                deadline: DEADLINE,
              },
            ],
          };
        }

        return {
          rows: [attemptRow(status, scoreCorrect, completionReason)],
        };
      }

      if (statement.includes('as correct_choice_id')) {
        return {
          rows: completedReviewRows(answerCount, scoreCorrect),
        };
      }

      if (statement.includes('private.challenge_answer_keys')) {
        return {
          rows: [
            {
              question_count: 5,
              answer_key_count: 5,
              answered_count: answerCount,
              score_correct: scoreCorrect,
            },
          ],
        };
      }

      if (
        statement.includes('from public.attempt_questions question') &&
        statement.includes('left join public.attempt_question_choices')
      ) {
        return {
          rows: [
            {
              attempt_question_id: QUESTION_ID,
              choice_id: CHOICE_ID,
              selected_choice_id: existingChoiceId,
            },
          ],
        };
      }

      if (statement.includes('insert into public.attempt_answers')) {
        return {
          rows: [],
        };
      }

      if (statement.includes('count(answer.attempt_question_id)')) {
        return {
          rows: [
            {
              answered_count: answerCount,
            },
          ],
        };
      }

      if (
        statement.includes('from public.attempt_questions question') &&
        statement.includes('left join public.attempt_answers answer')
      ) {
        return {
          rows: inProgressQuestionRows(answerCount),
        };
      }

      if (statement.includes('from public.attempt_question_choices choice')) {
        return {
          rows: inProgressChoiceRows(),
        };
      }

      if (statement.includes('from public.event_completions completion')) {
        return {
          rows: [
            {
              completion_id: '41000000-0000-4000-8000-000000000066',
              coins_awarded: 40,
            },
          ],
        };
      }

      if (statement.includes('from public.player_cards owned')) {
        return {
          rows: [],
        };
      }

      throw new Error(`Unexpected SQL in test fixture: ${statement}`);
    },
  );

  const release = vi.fn();

  const client: ChallengeAnswerSubmissionTransactionClient = {
    async query<T extends pg.QueryResultRow>(
      statement: string,
      values: unknown[],
    ): Promise<{ rows: T[] }> {
      const result = await query(statement, values);

      return {
        rows: result.rows as unknown as T[],
      };
    },
    release,
  };

  const connect = vi.fn(async () => client);

  const database = {
    connect,
  };

  const finalizeAttempt = vi.fn(
    async (
      finalizationDatabase: ChallengeAnswerSubmissionQueryable,
      input: { completionReason: 'answered' | 'timeout' },
    ) => {
      expect(finalizationDatabase).toBe(client);

      if (finalizerFailure) {
        throw finalizerFailure;
      }

      if (becomeCompletedAfterFinalizer) {
        status = 'completed';
        completionReason = input.completionReason;
      }
    },
  );

  const finalizer: ChallengeAttemptCompletionFinalizer = {
    finalizeAttempt,
  };

  return {
    client,
    connect,
    database,
    finalizer,
    finalizeAttempt,
    query,
    release,
  };
}

function attemptRow(
  status: 'in_progress' | 'completed',
  scoreCorrect: number,
  completionReason: 'answered' | 'timeout' | null,
) {
  return {
    attempt_id: ATTEMPT_ID,
    event_id: EVENT_ID,
    format: 'multiple_choice',
    status,
    started_at: new Date('2026-09-01T10:00:00.000Z'),
    deadline: DEADLINE,
    completed_at:
      status === 'completed' ? new Date('2026-09-01T10:01:00.000Z') : null,
    completion_reason: status === 'completed' ? completionReason : null,
    score_correct: status === 'completed' ? scoreCorrect : null,
  };
}

function inProgressQuestionRows(answerCount: number) {
  return Array.from({ length: 5 }, (_, index) => ({
    attempt_question_id: `32000000-0000-4000-8000-${String(index + 1).padStart(
      12,
      '0',
    )}`,
    position: index + 1,
    prompt_snapshot: `Question ${index + 1}`,
    selected_choice_id:
      index < answerCount
        ? `33000000-0000-4000-${String(index + 1).padStart(
            4,
            '0',
          )}-000000000001`
        : null,
    answered_at:
      index < answerCount ? new Date('2026-09-01T10:00:30.000Z') : null,
  }));
}

function inProgressChoiceRows() {
  return Array.from({ length: 5 }, (_, questionIndex) =>
    Array.from({ length: 4 }, (_, choiceIndex) => ({
      attempt_question_id: `32000000-0000-4000-8000-${String(
        questionIndex + 1,
      ).padStart(12, '0')}`,
      choice_id: `33000000-0000-4000-${String(questionIndex + 1).padStart(
        4,
        '0',
      )}-${String(choiceIndex + 1).padStart(12, '0')}`,
      display_position: choiceIndex + 1,
      choice_text_snapshot: `Choice ${questionIndex + 1}.${choiceIndex + 1}`,
    })),
  ).flat();
}

function completedReviewRows(answerCount: number, scoreCorrect: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    const answered = position <= answerCount;
    const selectedChoiceNumber = position <= scoreCorrect ? 2 : 1;

    return {
      attempt_question_id: `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
      position,
      prompt_snapshot: `Question ${position}`,
      selected_choice_id: answered
        ? `33000000-0000-4000-${String(position).padStart(4, '0')}-${String(
            selectedChoiceNumber,
          ).padStart(12, '0')}`
        : null,
      selected_choice_text: answered
        ? `Choice ${position}.${selectedChoiceNumber}`
        : null,
      correct_choice_id: `33000000-0000-4000-${String(position).padStart(
        4,
        '0',
      )}-000000000002`,
      correct_choice_text: `Choice ${position}.2`,
      is_correct: answered && position <= scoreCorrect,
    };
  });
}

function validInput() {
  return {
    playerId: PLAYER_ID,
    attemptId: ATTEMPT_ID,
    attemptQuestionId: QUESTION_ID,
    choiceId: CHOICE_ID,
  };
}

function transactionCommands(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls
    .map(([statement]) => String(statement).trim().toLowerCase())
    .filter((statement) => ['begin', 'commit', 'rollback'].includes(statement));
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls.map(([statement]) => String(statement)).join('\n');
}
