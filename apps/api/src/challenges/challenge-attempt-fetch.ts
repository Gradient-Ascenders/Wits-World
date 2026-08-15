import type pg from 'pg';

import {
  createChallengeAttemptReader,
  type PlayerSafeChallengeAttempt,
} from './challenge-attempt-reader.js';
import { calculateChallengeAttemptScore } from './challenge-attempt-marking.js';
import type {
  ChallengeAnswerSubmissionQueryable,
  ChallengeAttemptCompletionFinalizer,
} from './challenge-answer-submission.js';

export interface FetchChallengeAttemptInput {
  playerId: string;
  attemptId: string;
}

export interface ChallengeAttemptFetchService {
  fetchAttempt(
    input: FetchChallengeAttemptInput,
  ): Promise<PlayerSafeChallengeAttempt>;
}

export interface ChallengeAttemptFetchTransactionClient extends ChallengeAnswerSubmissionQueryable {
  release(): void;
}

export interface ChallengeAttemptFetchDatabase {
  connect(): Promise<ChallengeAttemptFetchTransactionClient>;
}

export interface ChallengeAttemptFetchOptions {
  finalizer: ChallengeAttemptCompletionFinalizer;
  clock?: () => Date;
}

export class ChallengeAttemptFetchNotFoundError extends Error {
  constructor() {
    super('Challenge attempt was not found.');
    this.name = 'ChallengeAttemptFetchNotFoundError';
  }
}

interface LockedAttemptRow extends pg.QueryResultRow {
  deadline: Date;
  status: 'in_progress' | 'completed';
}

export function createChallengeAttemptFetchService(
  database: ChallengeAttemptFetchDatabase,
  { finalizer, clock = () => new Date() }: ChallengeAttemptFetchOptions,
): ChallengeAttemptFetchService {
  return {
    async fetchAttempt(input) {
      const client = await database.connect();

      try {
        await client.query('begin', []);

        const lockResult = await client.query<LockedAttemptRow>(
          `
            select status, deadline
            from public.challenge_attempts
            where id = $1::uuid
              and player_id = $2::uuid
            for update
          `,
          [input.attemptId, input.playerId],
        );

        const lockedAttempt = lockResult.rows[0];

        if (!lockedAttempt) {
          throw new ChallengeAttemptFetchNotFoundError();
        }

        const reader = createChallengeAttemptReader(client);

        if (lockedAttempt.status === 'completed') {
          const completed = await reader.findByPlayerAndAttempt(
            input.playerId,
            input.attemptId,
          );

          if (!completed || completed.status !== 'completed') {
            throw new Error(
              'Completed challenge attempt is missing its persisted result.',
            );
          }

          await client.query('commit', []);
          return completed;
        }

        const now = clock();

        if (Number.isNaN(now.getTime())) {
          throw new Error(
            'Challenge attempt fetch clock returned an invalid timestamp.',
          );
        }

        if (now.getTime() >= lockedAttempt.deadline.getTime()) {
          const score = await calculateChallengeAttemptScore(
            client,
            input.attemptId,
          );

          await finalizer.finalizeAttempt(client, {
            playerId: input.playerId,
            attemptId: input.attemptId,
            completionReason: 'timeout',
            scoreCorrect: score.scoreCorrect,
            completedAt: now,
          });

          const completed = await reader.findByPlayerAndAttempt(
            input.playerId,
            input.attemptId,
          );

          if (!completed || completed.status !== 'completed') {
            throw new Error(
              'Challenge timeout finalizer did not persist a completed attempt.',
            );
          }

          await client.query('commit', []);
          return completed;
        }

        const inProgress = await reader.findByPlayerAndAttempt(
          input.playerId,
          input.attemptId,
        );

        if (!inProgress || inProgress.status !== 'in_progress') {
          throw new Error(
            'Challenge attempt fetch lost its in-progress attempt.',
          );
        }

        await client.query('commit', []);
        return inProgress;
      } catch (error) {
        try {
          await client.query('rollback', []);
        } catch {
          // Preserve the original fetch/finalization failure.
        }

        throw error;
      } finally {
        client.release();
      }
    },
  };
}
