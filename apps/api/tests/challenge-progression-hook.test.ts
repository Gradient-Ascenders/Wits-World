import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-attempt-completion-finalizer.js';
import type { ChallengeAnswerSubmissionQueryable } from '../src/challenges/challenge-answer-submission.js';
import type { ProgressionPersistence } from '../src/progression/progression-persistence.js';

const PLAYER_ID = '17200000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '17210000-0000-4000-8000-000000000001';
const EVENT_ID = '17220000-0000-4000-8000-000000000001';
const COMPLETION_ID = '17230000-0000-4000-8000-000000000001';
const COMPLETED_AT = new Date('2026-08-29T08:00:00.000Z');

describe('challenge progression completion hook', () => {
  it('uses the signed offline catalogue even when those cards are no longer active', async () => {
    const cardId = '17250000-0000-4000-8000-000000000001';
    const base = completionQuery('in_progress');
    const query = vi.fn<ChallengeAnswerSubmissionQueryable['query']>(
      async <T extends pg.QueryResultRow>(
        sql: string,
        values: unknown[],
      ): Promise<{ rows: T[] }> => {
        if (sql.includes('from public.card_definitions')) {
          expect(sql).not.toContain('is_active');
          expect(values).toEqual([[cardId]]);
          return {
            rows: [
              { card_definition_id: cardId, rarity: 'common' },
            ] as unknown as T[],
          };
        }
        return (base as ChallengeAnswerSubmissionQueryable['query'])<T>(
          sql,
          values,
        );
      },
    );
    const finalizer = createChallengeAttemptCompletionFinalizer({
      progressionPersistence: progressionMock(),
      randomInt: () => 0,
    });
    await finalizer.finalizeAttempt(
      { query: query as ChallengeAnswerSubmissionQueryable['query'] },
      {
        ...input(),
        scoreCorrect: 3,
        offlineRewardContext: {
          policyVersion: 'points-cards-v2',
          cards: [{ cardDefinitionId: cardId, rarity: 'common' }],
        },
      },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'insert into public.event_completion_card_rewards',
      ),
      [COMPLETION_ID, 1, cardId, COMPLETED_AT],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.event_completions'),
      expect.arrayContaining(['points-cards-v2']),
    );
  });

  it('does not substitute current rewards when a saved policy or card is unavailable', async () => {
    for (const policyVersion of ['future-policy', 'points-cards-v2']) {
      const query = completionQuery('in_progress');
      const finalizer = createChallengeAttemptCompletionFinalizer({
        progressionPersistence: progressionMock(),
      });
      await expect(
        finalizer.finalizeAttempt(
          { query: query as ChallengeAnswerSubmissionQueryable['query'] },
          {
            ...input(),
            scoreCorrect: 3,
            offlineRewardContext: {
              policyVersion,
              cards: [
                {
                  cardDefinitionId: '17250000-0000-4000-8000-000000000001',
                  rarity: 'common',
                },
              ],
            },
          },
        ),
      ).rejects.toThrow(/saved reward/);
      expect(executedSql(query)).not.toContain(
        'insert into public.event_completions',
      );
    }
  });

  it('records progression after a new authoritative completion is finalized', async () => {
    const query = completionQuery('in_progress');
    const database = {
      query: query as ChallengeAnswerSubmissionQueryable['query'],
    };
    const progressionPersistence = progressionMock();
    const finalizer = createChallengeAttemptCompletionFinalizer({
      progressionPersistence,
    });

    await finalizer.finalizeAttempt(database, input());

    expect(
      progressionPersistence.recordChallengeCompletion,
    ).toHaveBeenCalledWith(database, COMPLETION_ID);
    expect(query.mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(progressionPersistence.recordChallengeCompletion).mock
        .invocationCallOrder[0]!,
    );
  });

  it('replays the persisted progression decision for a completed attempt', async () => {
    const query = completionQuery('completed');
    const database = {
      query: query as ChallengeAnswerSubmissionQueryable['query'],
    };
    const progressionPersistence = progressionMock();
    const finalizer = createChallengeAttemptCompletionFinalizer({
      progressionPersistence,
    });

    await finalizer.finalizeAttempt(database, input());

    expect(
      progressionPersistence.recordChallengeCompletion,
    ).toHaveBeenCalledOnce();
    expect(
      progressionPersistence.recordChallengeCompletion,
    ).toHaveBeenCalledWith(database, COMPLETION_ID);
    expect(executedSql(query)).not.toContain(
      'insert into public.event_completions',
    );
  });

  it('propagates progression failure to the owning transaction', async () => {
    const query = completionQuery('in_progress');
    const database = {
      query: query as ChallengeAnswerSubmissionQueryable['query'],
    };
    const progressionPersistence = progressionMock();
    vi.mocked(
      progressionPersistence.recordChallengeCompletion,
    ).mockRejectedValueOnce(new Error('progression write failed'));
    const finalizer = createChallengeAttemptCompletionFinalizer({
      progressionPersistence,
    });

    await expect(finalizer.finalizeAttempt(database, input())).rejects.toThrow(
      'progression write failed',
    );
  });
});

function completionQuery(status: 'in_progress' | 'completed') {
  return vi.fn<ChallengeAnswerSubmissionQueryable['query']>(
    async <T extends pg.QueryResultRow>(
      statement: string,
    ): Promise<{ rows: T[] }> => {
      let rows: pg.QueryResultRow[];

      if (statement.includes('from public.challenge_attempts')) {
        rows = [
          {
            attempt_id: ATTEMPT_ID,
            average_difficulty: '1',
            event_id: EVENT_ID,
            status,
          },
        ];
      } else if (statement.includes('from public.event_completions')) {
        rows = [{ completion_id: COMPLETION_ID }];
      } else if (statement.includes('from public.card_definitions')) {
        rows = [];
      } else if (statement.includes('insert into public.event_completions')) {
        rows = [{ completion_id: COMPLETION_ID }];
      } else if (statement.includes('update public.challenge_attempts')) {
        rows = [{ attempt_id: ATTEMPT_ID }];
      } else {
        rows = [];
      }

      return { rows: rows as T[] };
    },
  );
}

function progressionMock(): ProgressionPersistence {
  return {
    recordChallengeCompletion: vi.fn().mockResolvedValue({
      awardId: '17240000-0000-4000-8000-000000000001',
      playerId: PLAYER_ID,
      pointsAwarded: 0,
      ruleCode: 'challenge_score_0',
      ruleVersion: 1,
      sourceKind: 'challenge_completion',
      wasCreated: true,
    }),
    recordCpuMatch: vi.fn(),
    recordAsynchronousPvpCompletion: vi.fn(),
  };
}

function input() {
  return {
    playerId: PLAYER_ID,
    attemptId: ATTEMPT_ID,
    completionReason: 'answered' as const,
    scoreCorrect: 0,
    completedAt: COMPLETED_AT,
  };
}

function executedSql(query: ReturnType<typeof completionQuery>) {
  return query.mock.calls.map(([statement]) => String(statement)).join('\n');
}
