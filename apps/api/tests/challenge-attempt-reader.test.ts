import { describe, expect, it, vi } from 'vitest';

import {
  createChallengeAttemptReader,
  type ChallengeAttemptQueryable,
} from '../src/challenges/challenge-attempt-reader.js';

const PLAYER_ID = '00000000-0000-4000-8000-000000000101';
const EVENT_ID = '00000000-0000-4000-8000-000000000018';
const ATTEMPT_ID = '31000000-0000-4000-8000-000000000001';

describe('challenge attempt reader', () => {
  it('returns null when the player has no attempt for the event', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [],
    });

    const reader = createChallengeAttemptReader(createQueryable(query));

    await expect(
      reader.findByPlayerAndEvent(PLAYER_ID, EVENT_ID),
    ).resolves.toBeNull();

    expect(query).toHaveBeenCalledOnce();
  });

  it('returns null when the player does not own the requested attempt', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [],
    });

    const reader = createChallengeAttemptReader(createQueryable(query));

    await expect(
      reader.findByPlayerAndAttempt(PLAYER_ID, ATTEMPT_ID),
    ).resolves.toBeNull();

    expect(query).toHaveBeenCalledOnce();

    const [statement, values] = query.mock.calls[0] ?? [];

    expect(String(statement)).toContain('attempt.player_id = $1::uuid');
    expect(String(statement)).toContain('attempt.id = $2::uuid');
    expect(values).toEqual([PLAYER_ID, ATTEMPT_ID]);
  });

  it('loads a completed attempt by authenticated player and attempt id', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'completed',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: new Date('2026-09-01T10:01:30.000Z'),
            completion_reason: 'answered',
            score_correct: 4,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            completion_id: '41000000-0000-4000-8000-000000000066',
            coins_awarded: 40,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: completedReviewRows({ scoreCorrect: 4 }),
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    const attempt = await reader.findByPlayerAndAttempt(PLAYER_ID, ATTEMPT_ID);

    expect(attempt).toEqual({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      format: 'multiple_choice',
      status: 'completed',
      completedAt: '2026-09-01T10:01:30.000Z',
      completionReason: 'answered',
      totalQuestions: 5,
      scoreCorrect: 4,
      reward: {
        coinsAwarded: 40,
        cards: [],
      },
      review: completedReview({ scoreCorrect: 4 }),
    });

    expect(attempt).not.toHaveProperty('questions');
    expect(attempt).not.toHaveProperty('selectedChoiceId');
    expect(attempt).not.toHaveProperty('answeredAt');

    const [statement, values] = query.mock.calls[0] ?? [];

    expect(String(statement)).toContain('attempt.player_id = $1::uuid');
    expect(String(statement)).toContain('attempt.id = $2::uuid');
    expect(values).toEqual([PLAYER_ID, ATTEMPT_ID]);
  });

  it('loads an in-progress attempt using only player-safe snapshots', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'in_progress',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: null,
            completion_reason: null,
            score_correct: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 5 }, (_, index) => ({
          attempt_question_id: `32000000-0000-4000-8000-${String(
            index + 1,
          ).padStart(12, '0')}`,
          position: index + 1,
          prompt_snapshot: `Question ${index + 1}`,
          selected_choice_id:
            index === 0 ? '33000000-0000-4000-8000-000000000001' : null,
          answered_at:
            index === 0 ? new Date('2026-09-01T10:00:20.000Z') : null,
        })),
      })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 5 }, (_, questionIndex) =>
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
        ).flat(),
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    const attempt = await reader.findByPlayerAndEvent(PLAYER_ID, EVENT_ID);

    expect(attempt).toMatchObject({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      format: 'multiple_choice',
      status: 'in_progress',
      startedAt: '2026-09-01T10:00:00.000Z',
      deadline: '2026-09-01T10:02:00.000Z',
      totalQuestions: 5,
      answeredCount: 1,
    });

    if (!attempt || attempt.status !== 'in_progress') {
      throw new Error('Expected an in-progress attempt.');
    }

    expect(attempt.questions).toHaveLength(5);
    expect(attempt.questions[0]).toMatchObject({
      position: 1,
      prompt: 'Question 1',
      selectedChoiceId: '33000000-0000-4000-8000-000000000001',
      answeredAt: '2026-09-01T10:00:20.000Z',
    });
    expect(attempt.questions[0]?.choices).toHaveLength(4);

    const executedSql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
      .toLowerCase();

    expect(executedSql).not.toContain('challenge_answer_keys');
    expect(executedSql).not.toContain('accepted_choice');
    expect(executedSql).not.toContain('private.');
  });

  it('loads a completed attempt without returning question or answer snapshots', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'completed',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: new Date('2026-09-01T10:01:25.000Z'),
            completion_reason: 'answered',
            score_correct: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            completion_id: '41000000-0000-4000-8000-000000000001',
            coins_awarded: 37,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            owned_card_id: '51000000-0000-4000-8000-000000000001',
            card_definition_id: '50000000-0000-4000-8000-000000000009',
            name: 'Campus Spark',
            category: 'creature',
            affinity: 'spark',
            rarity: 'common',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: completedReviewRows({ scoreCorrect: 3 }),
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    const attempt = await reader.findByPlayerAndEvent(PLAYER_ID, EVENT_ID);

    expect(attempt).toEqual({
      attemptId: ATTEMPT_ID,
      eventId: EVENT_ID,
      format: 'multiple_choice',
      status: 'completed',
      completedAt: '2026-09-01T10:01:25.000Z',
      completionReason: 'answered',
      totalQuestions: 5,
      scoreCorrect: 3,
      reward: {
        coinsAwarded: 37,
        cards: [
          {
            ownedCardId: '51000000-0000-4000-8000-000000000001',
            cardDefinitionId: '50000000-0000-4000-8000-000000000009',
            name: 'Campus Spark',
            category: 'creature',
            affinity: 'spark',
            rarity: 'common',
          },
        ],
      },
      review: completedReview({ scoreCorrect: 3 }),
    });

    expect(attempt).not.toHaveProperty('questions');
    expect(attempt).not.toHaveProperty('selectedChoiceId');
    expect(attempt).not.toHaveProperty('answeredAt');
  });

  it('returns unanswered timeout review entries as incorrect with the correct choice', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'completed',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: new Date('2026-09-01T10:02:00.000Z'),
            completion_reason: 'timeout',
            score_correct: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            completion_id: '41000000-0000-4000-8000-000000000001',
            coins_awarded: 25,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: completedReviewRows({ scoreCorrect: 1, answeredCount: 2 }),
      });

    const reader = createChallengeAttemptReader(createQueryable(query));
    const attempt = await reader.findByPlayerAndAttempt(PLAYER_ID, ATTEMPT_ID);

    if (!attempt || attempt.status !== 'completed') {
      throw new Error('Expected a completed attempt.');
    }

    expect(attempt.review).toHaveLength(5);
    expect(attempt.review[2]).toEqual({
      attemptQuestionId: '32000000-0000-4000-8000-000000000003',
      position: 3,
      prompt: 'Question 3',
      selectedChoice: null,
      correctChoice: {
        choiceId: '33000000-0000-4000-0003-000000000002',
        text: 'Choice 3.2',
      },
      isCorrect: false,
    });
    expect(attempt.review.filter((entry) => entry.isCorrect)).toHaveLength(
      attempt.scoreCorrect,
    );
  });

  it('rejects completed review data that disagrees with the persisted score', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'completed',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: new Date('2026-09-01T10:01:25.000Z'),
            completion_reason: 'answered',
            score_correct: 4,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            completion_id: '41000000-0000-4000-8000-000000000001',
            coins_awarded: 40,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: completedReviewRows({ scoreCorrect: 3 }),
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    await expect(
      reader.findByPlayerAndAttempt(PLAYER_ID, ATTEMPT_ID),
    ).rejects.toThrow('Completed challenge attempt review is inconsistent.');
  });

  it('rejects an incomplete persisted in-progress snapshot', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'in_progress',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: null,
            completion_reason: null,
            score_correct: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    await expect(
      reader.findByPlayerAndEvent(PLAYER_ID, EVENT_ID),
    ).rejects.toThrow('Persisted challenge attempt snapshot is incomplete.');
  });

  it('rejects a completed attempt without its persisted completion', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            attempt_id: ATTEMPT_ID,
            event_id: EVENT_ID,
            format: 'multiple_choice',
            status: 'completed',
            started_at: new Date('2026-09-01T10:00:00.000Z'),
            deadline: new Date('2026-09-01T10:02:00.000Z'),
            completed_at: new Date('2026-09-01T10:01:25.000Z'),
            completion_reason: 'answered',
            score_correct: 3,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const reader = createChallengeAttemptReader(createQueryable(query));

    await expect(
      reader.findByPlayerAndEvent(PLAYER_ID, EVENT_ID),
    ).rejects.toThrow('Completed challenge attempt is missing its completion.');
  });
});

function createQueryable(
  query: ReturnType<typeof vi.fn>,
): ChallengeAttemptQueryable {
  return {
    query: query as ChallengeAttemptQueryable['query'],
  };
}

function completedReviewRows({
  scoreCorrect,
  answeredCount = 5,
}: {
  scoreCorrect: number;
  answeredCount?: number;
}) {
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    const selectedChoiceNumber = position <= scoreCorrect ? 2 : 1;
    const answered = position <= answeredCount;

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
      is_correct: answered && selectedChoiceNumber === 2,
    };
  });
}

function completedReview(options: {
  scoreCorrect: number;
  answeredCount?: number;
}) {
  return completedReviewRows(options).map((entry) => ({
    attemptQuestionId: entry.attempt_question_id,
    position: entry.position,
    prompt: entry.prompt_snapshot,
    selectedChoice:
      entry.selected_choice_id === null
        ? null
        : {
            choiceId: entry.selected_choice_id,
            text: entry.selected_choice_text,
          },
    correctChoice: {
      choiceId: entry.correct_choice_id,
      text: entry.correct_choice_text,
    },
    isCorrect: entry.is_correct,
  }));
}
