import type pg from 'pg';

import {
  createChallengeAttemptReader,
  type ChallengeAttemptQueryable,
  type InProgressChallengeAttempt,
  type PlayerSafeChallengeAttempt,
} from './challenge-attempt-reader.js';
import {
  selectChallengeQuestions,
  shuffleChallengeItems,
  type RandomIndexSource,
  secureRandomIndex,
} from './challenge-selection.js';
import {
  calculateChallengeDeadline,
  calculateChallengeTiming,
  type ChallengeDifficulty,
} from './challenge-timing.js';
import { createEventEligibilityService } from '../events/event-eligibility.js';
import {
  evaluateLocationTiming,
  evaluateReachabilityWithAccuracy,
  type LocationRetryReason,
  PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
} from '../events/location-claim.js';

export interface ChallengeAttemptTransactionClient extends ChallengeAttemptQueryable {
  release(): void;
}

export interface ChallengeAttemptDatabase {
  connect(): Promise<ChallengeAttemptTransactionClient>;
}

export interface StartChallengeAttemptInput {
  playerId: string;
  eventId: string;
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  acquiredAt: string;
}

export type StartChallengeAttemptResult =
  | {
      outcome: 'created';
      attempt: InProgressChallengeAttempt;
    }
  | {
      outcome: 'resumed';
      attempt: PlayerSafeChallengeAttempt;
    };

export interface ChallengeAttemptStartService {
  startOrResume(
    input: StartChallengeAttemptInput,
  ): Promise<StartChallengeAttemptResult>;
}

export class ChallengeEventNotFoundError extends Error {
  constructor() {
    super('The requested event was not found.');
    this.name = 'ChallengeEventNotFoundError';
  }
}

export class ChallengeEventNotActiveError extends Error {
  constructor(public readonly reason: 'not_started' | 'ended') {
    super('The requested event is not currently active.');
    this.name = 'ChallengeEventNotActiveError';
  }
}

export class ChallengeEventNotReachableError extends Error {
  constructor() {
    super('The submitted location is outside the event radius.');
    this.name = 'ChallengeEventNotReachableError';
  }
}

export class ChallengeLocationRetryRequiredError extends Error {
  constructor(public readonly reason: LocationRetryReason) {
    super('A new location claim is required.');
    this.name = 'ChallengeLocationRetryRequiredError';
  }
}

export class ChallengeUnavailableError extends Error {
  constructor() {
    super('The event challenge is not currently available.');
    this.name = 'ChallengeUnavailableError';
  }
}

interface CreateChallengeAttemptStartServiceOptions {
  clock?: () => Date;
  randomIndex?: RandomIndexSource;
  maxLocationClaimAgeMs?: number;
}

interface PublishedChallengeRow extends pg.QueryResultRow {
  challenge_id: string;
}

interface PublishedQuestionRow extends pg.QueryResultRow {
  difficulty: ChallengeDifficulty;
  prompt: string;
  question_id: string;
}

interface PublishedChoiceRow extends pg.QueryResultRow {
  choice_id: string;
  choice_text: string;
}

interface AttemptInsertRow extends pg.QueryResultRow {
  attempt_id: string;
}

interface AttemptQuestionInsertRow extends pg.QueryResultRow {
  attempt_question_id: string;
}

interface PreparedQuestion {
  difficulty: ChallengeDifficulty;
  prompt: string;
  sourceQuestionId: string;
  choices: Array<{
    sourceChoiceId: string;
    text: string;
  }>;
}

export function createChallengeAttemptStartService(
  database: ChallengeAttemptDatabase,
  {
    clock = () => new Date(),
    randomIndex = secureRandomIndex,
    maxLocationClaimAgeMs = PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
  }: CreateChallengeAttemptStartServiceOptions = {},
): ChallengeAttemptStartService {
  return {
    async startOrResume(input) {
      const client = await database.connect();
      let transactionOpen = false;

      try {
        await client.query('begin', []);
        transactionOpen = true;

        const reader = createChallengeAttemptReader(client);

        const existingAttempt = await reader.findByPlayerAndEvent(
          input.playerId,
          input.eventId,
        );

        if (existingAttempt) {
          await client.query('commit', []);
          transactionOpen = false;

          return {
            outcome: 'resumed',
            attempt: existingAttempt,
          };
        }

        const startedAt = clock();

        const timingResult = evaluateLocationTiming(
          input.acquiredAt,
          startedAt,
          maxLocationClaimAgeMs,
        );

        if (timingResult.outcome === 'retry') {
          throw new ChallengeLocationRetryRequiredError(timingResult.reason);
        }

        const eligibilityService = createEventEligibilityService(client, {
          clock: () => startedAt,
        });

        const eligibility = await eligibilityService.evaluate({
          eventId: input.eventId,
          latitude: input.latitude,
          longitude: input.longitude,
        });

        if (eligibility.outcome === 'not_found') {
          throw new ChallengeEventNotFoundError();
        }

        if (eligibility.outcome === 'unavailable') {
          if (eligibility.reason === 'unpublished') {
            throw new ChallengeEventNotFoundError();
          }

          throw new ChallengeEventNotActiveError(eligibility.reason);
        }

        const reachability = evaluateReachabilityWithAccuracy(
          eligibility.distanceMetres,
          eligibility.radiusMetres,
          input.accuracyMetres,
        );

        if (reachability.status === 'unreachable') {
          throw new ChallengeEventNotReachableError();
        }

        if (reachability.status === 'retry') {
          throw new ChallengeLocationRetryRequiredError(reachability.reason);
        }

        const challengeResult = await client.query<PublishedChallengeRow>(
          `
            select challenge.id::text as challenge_id
              from public.event_challenges challenge
             where challenge.event_id = $1::uuid
               and challenge.status = 'published'
          `,
          [input.eventId],
        );

        const challenge = challengeResult.rows[0];

        if (!challenge) {
          throw new ChallengeUnavailableError();
        }

        const questionResult = await client.query<PublishedQuestionRow>(
          `
            select
              question.id::text as question_id,
              question.prompt,
              question.difficulty
            from public.challenge_questions question
            where question.challenge_id = $1::uuid
              and question.status = 'published'
            order by question.id
          `,
          [challenge.challenge_id],
        );

        if (questionResult.rows.length < 5) {
          throw new ChallengeUnavailableError();
        }

        const selectedQuestions = selectChallengeQuestions(
          questionResult.rows,
          randomIndex,
        );

        const preparedQuestions: PreparedQuestion[] = [];

        for (const question of selectedQuestions) {
          const choiceResult = await client.query<PublishedChoiceRow>(
            `
              select
                choice.id::text as choice_id,
                choice.choice_text
              from public.challenge_choices choice
              where choice.question_id = $1::uuid
              order by choice.authoring_position
            `,
            [question.question_id],
          );

          if (choiceResult.rows.length !== 4) {
            throw new ChallengeUnavailableError();
          }

          const shuffledChoices = shuffleChallengeItems(
            choiceResult.rows,
            randomIndex,
          );

          preparedQuestions.push({
            sourceQuestionId: question.question_id,
            prompt: question.prompt,
            difficulty: question.difficulty,
            choices: shuffledChoices.map((choice) => ({
              sourceChoiceId: choice.choice_id,
              text: choice.choice_text,
            })),
          });
        }

        const challengeTiming = calculateChallengeTiming(
          preparedQuestions.map((question) => question.difficulty),
        );

        const deadline = calculateChallengeDeadline(
          startedAt,
          challengeTiming.timeLimitSeconds,
        );

        const attemptInsert = await client.query<AttemptInsertRow>(
          `
            insert into public.challenge_attempts (
              player_id,
              event_id,
              challenge_id,
              started_at,
              deadline,
              time_limit_seconds,
              average_difficulty
            )
            values ($1, $2, $3, $4, $5, $6, $7)
            on conflict on constraint challenge_attempts_player_event_unique
            do nothing
            returning id::text as attempt_id
          `,
          [
            input.playerId,
            input.eventId,
            challenge.challenge_id,
            startedAt,
            deadline,
            challengeTiming.timeLimitSeconds,
            challengeTiming.averageDifficulty,
          ],
        );

        const insertedAttempt = attemptInsert.rows[0];

        if (!insertedAttempt) {
          const concurrentWinner = await reader.findByPlayerAndEvent(
            input.playerId,
            input.eventId,
          );

          if (!concurrentWinner) {
            throw new Error(
              'Concurrent challenge start did not produce a persisted attempt.',
            );
          }

          await client.query('commit', []);
          transactionOpen = false;

          return {
            outcome: 'resumed',
            attempt: concurrentWinner,
          };
        }

        for (const [questionIndex, question] of preparedQuestions.entries()) {
          const questionInsert = await client.query<AttemptQuestionInsertRow>(
            `
                insert into public.attempt_questions (
                  attempt_id,
                  source_question_id,
                  position,
                  prompt_snapshot,
                  difficulty_snapshot
                )
                values ($1, $2, $3, $4, $5)
                returning id::text as attempt_question_id
              `,
            [
              insertedAttempt.attempt_id,
              question.sourceQuestionId,
              questionIndex + 1,
              question.prompt,
              question.difficulty,
            ],
          );

          const attemptQuestion = questionInsert.rows[0];

          if (!attemptQuestion) {
            throw new Error(
              'Challenge attempt question snapshot was not created.',
            );
          }

          for (const [choiceIndex, choice] of question.choices.entries()) {
            await client.query(
              `
                insert into public.attempt_question_choices (
                  attempt_question_id,
                  source_question_id,
                  source_choice_id,
                  display_position,
                  choice_text_snapshot
                )
                values ($1, $2, $3, $4, $5)
              `,
              [
                attemptQuestion.attempt_question_id,
                question.sourceQuestionId,
                choice.sourceChoiceId,
                choiceIndex + 1,
                choice.text,
              ],
            );
          }
        }

        const createdAttempt = await reader.findByPlayerAndEvent(
          input.playerId,
          input.eventId,
        );

        if (!createdAttempt || createdAttempt.status !== 'in_progress') {
          throw new Error(
            'Created challenge attempt could not be loaded safely.',
          );
        }

        await client.query('commit', []);
        transactionOpen = false;

        return {
          outcome: 'created',
          attempt: createdAttempt,
        };
      } catch (error) {
        if (transactionOpen) {
          try {
            await client.query('rollback', []);
          } catch {
            // Preserve the original start/resume failure.
          }
        }

        throw error;
      } finally {
        client.release();
      }
    },
  };
}
