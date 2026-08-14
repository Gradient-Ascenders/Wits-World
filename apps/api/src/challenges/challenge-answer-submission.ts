import {
  type ChallengeAnswerLockQueryable,
  lockChallengeAnswer,
} from './challenge-answer-lock.js';
import {
  calculateChallengeAttemptScore,
  type ChallengeAttemptMarkingQueryable,
} from './challenge-attempt-marking.js';
import {
  createChallengeAttemptReader,
  type ChallengeAttemptQueryable,
  type PlayerSafeChallengeAttempt,
} from './challenge-attempt-reader.js';

export interface SubmitChallengeAnswerInput {
  playerId: string;
  attemptId: string;
  attemptQuestionId: string;
  choiceId: string;
}

export interface ChallengeAttemptFinalizationInput {
  playerId: string;
  attemptId: string;
  completionReason: 'answered' | 'timeout';
  scoreCorrect: number;
  completedAt: Date;
}

export interface ChallengeAttemptCompletionFinalizer {
  finalizeAttempt(
    database: ChallengeAnswerSubmissionQueryable,
    input: ChallengeAttemptFinalizationInput,
  ): Promise<void>;
}

export interface ChallengeAnswerSubmissionService {
  submitAnswer(
    input: SubmitChallengeAnswerInput,
  ): Promise<PlayerSafeChallengeAttempt>;
}

export interface ChallengeAnswerSubmissionQueryable
  extends
    ChallengeAnswerLockQueryable,
    ChallengeAttemptMarkingQueryable,
    ChallengeAttemptQueryable {}

export interface ChallengeAnswerSubmissionTransactionClient extends ChallengeAnswerSubmissionQueryable {
  release(): void;
}

export interface ChallengeAnswerSubmissionDatabase {
  connect(): Promise<ChallengeAnswerSubmissionTransactionClient>;
}

export interface ChallengeAnswerSubmissionOptions {
  finalizer: ChallengeAttemptCompletionFinalizer;
  clock?: () => Date;
}

export function createChallengeAnswerSubmissionService(
  database: ChallengeAnswerSubmissionDatabase,
  { finalizer, clock = () => new Date() }: ChallengeAnswerSubmissionOptions,
): ChallengeAnswerSubmissionService {
  return {
    async submitAnswer(input) {
      const receivedAt = clock();

      if (Number.isNaN(receivedAt.getTime())) {
        throw new Error(
          'Challenge answer submission clock returned an invalid timestamp.',
        );
      }

      const client = await database.connect();

      try {
        await client.query('begin', []);

        const lockResult = await lockChallengeAnswer(client, {
          ...input,
          receivedAt,
        });

        const reader = createChallengeAttemptReader(client);

        if (lockResult.outcome === 'completed_retry') {
          const completed = await reader.findByPlayerAndAttempt(
            input.playerId,
            input.attemptId,
          );

          if (!completed || completed.status !== 'completed') {
            throw new Error(
              'Completed challenge retry is missing its persisted result.',
            );
          }

          await client.query('commit', []);

          return completed;
        }

        if (
          lockResult.outcome === 'expired' ||
          lockResult.finalizationReason !== null
        ) {
          const score = await calculateChallengeAttemptScore(
            client,
            input.attemptId,
          );

          const completionReason =
            lockResult.outcome === 'expired'
              ? 'timeout'
              : lockResult.finalizationReason;

          if (completionReason === null) {
            throw new Error(
              'Challenge finalization reason was not established.',
            );
          }

          await finalizer.finalizeAttempt(client, {
            playerId: input.playerId,
            attemptId: input.attemptId,
            completionReason,
            scoreCorrect: score.scoreCorrect,
            completedAt: receivedAt,
          });

          const completed = await reader.findByPlayerAndAttempt(
            input.playerId,
            input.attemptId,
          );

          if (!completed || completed.status !== 'completed') {
            throw new Error(
              'Challenge finalizer did not persist a completed attempt.',
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
            'Challenge answer submission lost its in-progress attempt.',
          );
        }

        await client.query('commit', []);

        return inProgress;
      } catch (error) {
        try {
          await client.query('rollback', []);
        } catch {
          // Preserve the original submission failure.
        }

        throw error;
      } finally {
        client.release();
      }
    },
  };
}
