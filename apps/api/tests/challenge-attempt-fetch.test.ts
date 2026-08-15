import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  ChallengeAttemptFetchNotFoundError,
  createChallengeAttemptFetchService,
  type ChallengeAttemptFetchDatabase,
  type ChallengeAttemptFetchTransactionClient,
} from '../src/challenges/challenge-attempt-fetch.js';
import type { ChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-answer-submission.js';

import type {
  CompletedChallengeAttempt,
  InProgressChallengeAttempt,
} from '../src/challenges/challenge-attempt-reader.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000001';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';

describe('challenge attempt fetch service', () => {
  it('returns an owned in-progress attempt before its deadline', async () => {
    const fixture = createFixture({
      status: 'in_progress',
      deadline: new Date('2026-09-01T10:02:00.000Z'),
    });

    fixture.query.mockImplementation(
      queryImplementation({
        safeAttempt: inProgressAttempt(),
      }),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => new Date('2026-09-01T10:01:59.999Z'),
    });

    await expect(
      service.fetchAttempt({
        playerId: PLAYER_ID,
        attemptId: ATTEMPT_ID,
      }),
    ).resolves.toEqual(inProgressAttempt());

    expect(inProgressAttempt()).not.toHaveProperty('review');

    expect(fixture.finalizeAttempt).not.toHaveBeenCalled();
    expect(executedSql(fixture.query)).toContain('for update');
    expect(executedSql(fixture.query)).toContain('and player_id = $2::uuid');
    expect(executedCommands(fixture.query)).toContain('commit');
  });

  it('returns an already completed persisted attempt without finalizing again', async () => {
    const fixture = createFixture({
      status: 'completed',
      deadline: new Date('2026-09-01T10:02:00.000Z'),
    });

    fixture.query.mockImplementation(
      queryImplementation({
        lockedAttempt: {
          status: 'completed',
          deadline: new Date('2026-09-01T10:02:00.000Z'),
        },
        safeAttempt: completedAttempt(),
      }),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => {
        throw new Error('clock should not be needed');
      },
    });

    await expect(
      service.fetchAttempt({
        playerId: PLAYER_ID,
        attemptId: ATTEMPT_ID,
      }),
    ).resolves.toEqual(completedAttempt());

    expect(fixture.finalizeAttempt).not.toHaveBeenCalled();
  });

  it('finalizes an in-progress attempt received exactly at its deadline', async () => {
    const fixture = createFixture({
      status: 'in_progress',
      deadline: new Date('2026-09-01T10:02:00.000Z'),
    });

    let finalized = false;

    fixture.finalizeAttempt.mockImplementation(async () => {
      finalized = true;
    });

    fixture.query.mockImplementation(
      queryImplementation({
        lockedAttempt: fixture.lockedAttempt,
        safeAttempt: () =>
          finalized ? completedAttempt('timeout') : inProgressAttempt(),
        markingScore: 3,
      }),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => new Date('2026-09-01T10:02:00.000Z'),
    });

    const result = await service.fetchAttempt({
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
    });

    expect(result.status).toBe('completed');

    if (result.status !== 'completed') {
      throw new Error('Expected timeout finalization to return completion.');
    }

    expect(result.review).toHaveLength(5);
    expect(result.review.slice(3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selectedChoice: null, isCorrect: false }),
      ]),
    );
    expect(result.review.filter((entry) => entry.isCorrect)).toHaveLength(
      result.scoreCorrect,
    );

    expect(fixture.finalizeAttempt).toHaveBeenCalledWith(fixture.client, {
      playerId: PLAYER_ID,
      attemptId: ATTEMPT_ID,
      completionReason: 'timeout',
      scoreCorrect: 3,
      completedAt: new Date('2026-09-01T10:02:00.000Z'),
    });

    expect(executedCommands(fixture.query)).toContain('commit');
  });

  it('returns the same not-found result for an unavailable owned attempt', async () => {
    const fixture = createFixture(null);

    fixture.query.mockImplementation(
      queryImplementation({
        lockedAttempt: null,
      }),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
    });

    await expect(
      service.fetchAttempt({
        playerId: PLAYER_ID,
        attemptId: ATTEMPT_ID,
      }),
    ).rejects.toBeInstanceOf(ChallengeAttemptFetchNotFoundError);

    expect(executedCommands(fixture.query)).toContain('rollback');
  });

  it('rolls back when timeout finalization fails', async () => {
    const fixture = createFixture({
      status: 'in_progress',
      deadline: new Date('2026-09-01T10:02:00.000Z'),
    });

    fixture.query.mockImplementation(
      queryImplementation({
        lockedAttempt: fixture.lockedAttempt,
        markingScore: 2,
      }),
    );

    fixture.finalizeAttempt.mockRejectedValue(
      new Error('reward transaction failed'),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => new Date('2026-09-01T10:02:01.000Z'),
    });

    await expect(
      service.fetchAttempt({
        playerId: PLAYER_ID,
        attemptId: ATTEMPT_ID,
      }),
    ).rejects.toThrow('reward transaction failed');

    const commands = executedCommands(fixture.query);

    expect(commands).toContain('rollback');
    expect(commands).not.toContain('commit');
  });

  it('rejects an invalid server clock and rolls back', async () => {
    const fixture = createFixture({
      status: 'in_progress',
      deadline: new Date('2026-09-01T10:02:00.000Z'),
    });

    fixture.query.mockImplementation(
      queryImplementation({
        safeAttempt: inProgressAttempt(),
      }),
    );

    const service = createChallengeAttemptFetchService(fixture.database, {
      finalizer: fixture.finalizer,
      clock: () => new Date(Number.NaN),
    });

    await expect(
      service.fetchAttempt({
        playerId: PLAYER_ID,
        attemptId: ATTEMPT_ID,
      }),
    ).rejects.toThrow(
      'Challenge attempt fetch clock returned an invalid timestamp.',
    );

    expect(executedCommands(fixture.query)).toContain('rollback');
  });
});

interface LockedAttempt {
  deadline: Date;
  status: 'in_progress' | 'completed';
}

function createFixture(lockedAttempt: LockedAttempt | null) {
  const query = vi.fn();

  const client: ChallengeAttemptFetchTransactionClient = {
    query: async <T extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ) => {
      const result = await query(statement, values ?? []);
      return result as { rows: T[] };
    },
    release: vi.fn(),
  };

  const database: ChallengeAttemptFetchDatabase = {
    connect: vi.fn().mockResolvedValue(client),
  };

  const finalizeAttempt =
    vi.fn<ChallengeAttemptCompletionFinalizer['finalizeAttempt']>();

  const finalizer: ChallengeAttemptCompletionFinalizer = {
    finalizeAttempt,
  };

  return {
    database,
    client,
    query,
    finalizer,
    finalizeAttempt,
    lockedAttempt,
  };
}

function queryImplementation({
  lockedAttempt,
  safeAttempt,
  markingScore = 0,
}: {
  lockedAttempt?: LockedAttempt | null;
  safeAttempt?:
    | ReturnType<typeof inProgressAttempt>
    | ReturnType<typeof completedAttempt>
    | (() =>
        | ReturnType<typeof inProgressAttempt>
        | ReturnType<typeof completedAttempt>);
  markingScore?: number;
}) {
  return async (statement: string) => {
    const sql = statement.toLowerCase();

    if (
      sql.trim() === 'begin' ||
      sql.trim() === 'commit' ||
      sql.trim() === 'rollback'
    ) {
      return { rows: [] };
    }

    if (
      sql.includes('from public.challenge_attempts') &&
      sql.includes('for update')
    ) {
      return {
        rows:
          lockedAttempt === undefined
            ? [
                {
                  status: 'in_progress',
                  deadline: new Date('2026-09-01T10:02:00.000Z'),
                },
              ]
            : lockedAttempt
              ? [lockedAttempt]
              : [],
      };
    }

    const attempt =
      typeof safeAttempt === 'function' ? safeAttempt() : safeAttempt;

    if (sql.includes('as correct_choice_id')) {
      const review =
        attempt?.status === 'completed'
          ? attempt.review
          : completedAttempt().review;

      return {
        rows: review.map((entry) => ({
          attempt_question_id: entry.attemptQuestionId,
          position: entry.position,
          prompt_snapshot: entry.prompt,
          selected_choice_id: entry.selectedChoice?.choiceId ?? null,
          selected_choice_text: entry.selectedChoice?.text ?? null,
          correct_choice_id: entry.correctChoice.choiceId,
          correct_choice_text: entry.correctChoice.text,
          is_correct: entry.isCorrect,
        })),
      };
    }

    if (sql.includes('private.challenge_answer_keys')) {
      return {
        rows: [
          {
            question_count: 5,
            answer_key_count: 5,
            answered_count: markingScore,
            score_correct: markingScore,
          },
        ],
      };
    }

    if (sql.includes('from public.challenge_attempts attempt')) {
      if (!attempt) {
        return { rows: [] };
      }

      return {
        rows: [
          attempt.status === 'completed'
            ? {
                attempt_id: ATTEMPT_ID,
                event_id: EVENT_ID,
                format: 'multiple_choice',
                status: 'completed',
                started_at: new Date('2026-09-01T10:00:00.000Z'),
                deadline: new Date('2026-09-01T10:02:00.000Z'),
                completed_at: new Date(attempt.completedAt),
                completion_reason: attempt.completionReason,
                score_correct: attempt.scoreCorrect,
              }
            : {
                attempt_id: ATTEMPT_ID,
                event_id: EVENT_ID,
                format: 'multiple_choice',
                status: 'in_progress',
                started_at: new Date(attempt.startedAt),
                deadline: new Date(attempt.deadline),
                completed_at: null,
                completion_reason: null,
                score_correct: null,
              },
        ],
      };
    }

    if (sql.includes('from public.attempt_questions question')) {
      return {
        rows: inProgressAttempt().questions.map((question) => ({
          attempt_question_id: question.attemptQuestionId,
          position: question.position,
          prompt_snapshot: question.prompt,
          selected_choice_id: question.selectedChoiceId,
          answered_at:
            question.answeredAt === null ? null : new Date(question.answeredAt),
        })),
      };
    }

    if (sql.includes('from public.attempt_question_choices choice')) {
      return {
        rows: inProgressAttempt().questions.flatMap((question) =>
          question.choices.map((choice, index) => ({
            attempt_question_id: question.attemptQuestionId,
            choice_id: choice.choiceId,
            display_position: index + 1,
            choice_text_snapshot: choice.text,
          })),
        ),
      };
    }

    if (sql.includes('from public.event_completions completion')) {
      return {
        rows: [
          {
            completion_id: '41000000-0000-4000-8000-000000000001',
            coins_awarded: completedAttempt().reward.coinsAwarded,
          },
        ],
      };
    }

    if (sql.includes('from public.player_cards owned')) {
      return {
        rows: completedAttempt().reward.cards.map((card) => ({
          owned_card_id: card.ownedCardId,
          card_definition_id: card.cardDefinitionId,
          name: card.name,
          category: card.category,
          affinity: card.affinity,
          rarity: card.rarity,
        })),
      };
    }

    return { rows: [] };
  };
}

function inProgressAttempt(): InProgressChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'multiple_choice' as const,
    status: 'in_progress' as const,
    startedAt: '2026-09-01T10:00:00.000Z',
    deadline: '2026-09-01T10:02:00.000Z',
    totalQuestions: 5 as const,
    answeredCount: 0,
    questions: Array.from({ length: 5 }, (_, questionIndex) => {
      const position = questionIndex + 1;

      return {
        attemptQuestionId: `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
        position,
        prompt: `Question ${position}`,
        choices: Array.from({ length: 4 }, (_, choiceIndex) => ({
          choiceId: `33000000-0000-4000-${String(position).padStart(4, '0')}-${String(
            choiceIndex + 1,
          ).padStart(12, '0')}`,
          text: `Choice ${position}.${choiceIndex + 1}`,
        })),
        selectedChoiceId: null,
        answeredAt: null,
      };
    }),
  };
}

function completedAttempt(
  reason: 'answered' | 'timeout' = 'answered',
): CompletedChallengeAttempt {
  return {
    attemptId: ATTEMPT_ID,
    eventId: EVENT_ID,
    format: 'multiple_choice' as const,
    status: 'completed' as const,
    completedAt: '2026-09-01T10:02:00.000Z',
    completionReason: reason,
    totalQuestions: 5 as const,
    scoreCorrect: 3,
    reward: {
      coinsAwarded: 37,
      cards: [],
    },
    review: Array.from({ length: 5 }, (_, index) => {
      const position = index + 1;
      const answered = reason === 'answered' || position <= 3;
      const selectedChoiceNumber = position <= 3 ? 2 : 1;

      return {
        attemptQuestionId: `32000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
        position,
        prompt: `Question ${position}`,
        selectedChoice: answered
          ? {
              choiceId: `33000000-0000-4000-${String(position).padStart(
                4,
                '0',
              )}-${String(selectedChoiceNumber).padStart(12, '0')}`,
              text: `Choice ${position}.${selectedChoiceNumber}`,
            }
          : null,
        correctChoice: {
          choiceId: `33000000-0000-4000-${String(position).padStart(
            4,
            '0',
          )}-000000000002`,
          text: `Choice ${position}.2`,
        },
        isCorrect: answered && selectedChoiceNumber === 2,
      };
    }),
  };
}

function executedSql(query: ReturnType<typeof vi.fn>): string {
  return query.mock.calls
    .map(([statement]) => String(statement))
    .join('\n')
    .toLowerCase();
}

function executedCommands(query: ReturnType<typeof vi.fn>): string[] {
  return query.mock.calls
    .map(([statement]) => String(statement).trim().toLowerCase())
    .filter((statement) => ['begin', 'commit', 'rollback'].includes(statement));
}
