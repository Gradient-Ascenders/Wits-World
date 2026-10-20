import type pg from 'pg';

import type { TrustRestrictionService } from '../trust/trust-restrictions.js';
import type { TerritoryOwnerBonusService } from '../territory/territory-owner-bonus.js';

import {
  createChallengeAttemptReader,
  type ChallengeAttemptQueryable,
  type InProgressChallengeAttempt,
  type InProgressOrderingChallengeAttempt,
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
import {
  InvalidMovementEvidenceContextError,
  type MovementEvidenceService,
  NonMonotonicMovementEvidenceError,
} from '../events/movement-evidence.js';

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
      attempt: InProgressChallengeAttempt | InProgressOrderingChallengeAttempt;
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
  movementEvidenceService: Pick<
    MovementEvidenceService,
    'evaluateJourneyWithinTransaction'
  >;
  randomIndex?: RandomIndexSource;
  maxLocationClaimAgeMs?: number;
  trustRestrictions?: Pick<TrustRestrictionService, 'assertAllowed'>;
  territoryOwnerBonus?: Pick<TerritoryOwnerBonusService, 'snapshotAttempt'>;
}

interface PublishedChallengeRow extends pg.QueryResultRow {
  challenge_id: string;
  format: 'multiple_choice' | 'ordering';
}

interface PublishedQuestionRow extends pg.QueryResultRow {
  difficulty: ChallengeDifficulty;
  prompt: string;
  explanation: string | null;
  question_id: string;
}

interface PublishedChoiceRow extends pg.QueryResultRow {
  question_id: string;
  choice_id: string;
  choice_text: string;
}

interface PublishedOrderingItemRow extends pg.QueryResultRow {
  question_id: string;
  item_id: string;
  item_text: string;
}

interface AttemptInsertRow extends pg.QueryResultRow {
  attempt_id: string;
}

interface PreparedQuestionBase {
  difficulty: ChallengeDifficulty;
  explanation: string | null;
  prompt: string;
  sourceQuestionId: string;
}

interface PreparedMultipleChoiceQuestion extends PreparedQuestionBase {
  format: 'multiple_choice';
  choices: Array<{
    sourceChoiceId: string;
    text: string;
  }>;
}

interface PreparedOrderingQuestion extends PreparedQuestionBase {
  format: 'ordering';
  items: Array<{
    sourceItemId: string;
    text: string;
  }>;
}

type PreparedQuestion =
  PreparedMultipleChoiceQuestion | PreparedOrderingQuestion;

export function createChallengeAttemptStartService(
  database: ChallengeAttemptDatabase,
  {
    clock = () => new Date(),
    movementEvidenceService,
    randomIndex = secureRandomIndex,
    maxLocationClaimAgeMs = PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
    trustRestrictions,
    territoryOwnerBonus,
  }: CreateChallengeAttemptStartServiceOptions,
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

        if (trustRestrictions) {
          await trustRestrictions.assertAllowed(
            input.playerId,
            'location_reward_challenge_hold',
            client,
          );
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

        // Hold a stable assignment while eligibility and attempt creation run.
        await client.query(
          'select version from public.event_placement_state where singleton=true for share',
          [],
        );

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

        try {
          const journeyDecision =
            await movementEvidenceService.evaluateJourneyWithinTransaction(
              client,
              {
                playerId: input.playerId,
                eventId: input.eventId,
                latitude: input.latitude,
                longitude: input.longitude,
                accuracyMetres: input.accuracyMetres,
                acquiredAt: new Date(input.acquiredAt),
                receivedAt: startedAt,
              },
              'reachable',
            );

          if (journeyDecision.outcome === 'too_fast') {
            await client.query('commit', []);
            transactionOpen = false;
            throw new ChallengeLocationRetryRequiredError('journey_too_fast');
          }
        } catch (error) {
          if (error instanceof NonMonotonicMovementEvidenceError) {
            throw new ChallengeLocationRetryRequiredError('stale_location');
          }

          if (error instanceof InvalidMovementEvidenceContextError) {
            throw new ChallengeUnavailableError();
          }

          throw error;
        }

        const challengeResult = await client.query<PublishedChallengeRow>(
          `
            select
              challenge.id::text as challenge_id,
              challenge.format
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
              question.difficulty,
              question.explanation
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
        const selectedQuestionIds = selectedQuestions.map(
          (question) => question.question_id,
        );
        const orderingItems =
          challenge.format === 'ordering'
            ? await client.query<PublishedOrderingItemRow>(
                `select item.question_id::text, item.id::text as item_id, item.item_text
                 from public.challenge_ordering_items item
                where item.question_id = any($1::uuid[])
                order by item.question_id, item.id`,
                [selectedQuestionIds],
              )
            : undefined;
        const choices =
          challenge.format === 'multiple_choice'
            ? await client.query<PublishedChoiceRow>(
                `select choice.question_id::text, choice.id::text as choice_id, choice.choice_text
                 from public.challenge_choices choice
                where choice.question_id = any($1::uuid[])
                order by choice.question_id, choice.authoring_position`,
                [selectedQuestionIds],
              )
            : undefined;

        for (const question of selectedQuestions) {
          if (challenge.format === 'ordering') {
            const itemRows = orderingItems!.rows.filter(
              (item) => item.question_id === question.question_id,
            );

            if (itemRows.length !== 4 || question.explanation === null) {
              throw new ChallengeUnavailableError();
            }

            const shuffledItems = shuffleChallengeItems(itemRows, randomIndex);

            preparedQuestions.push({
              format: 'ordering',
              sourceQuestionId: question.question_id,
              prompt: question.prompt,
              difficulty: question.difficulty,
              explanation: question.explanation,
              items: shuffledItems.map((item) => ({
                sourceItemId: item.item_id,
                text: item.item_text,
              })),
            });
            continue;
          }

          const choiceRows = choices!.rows.filter(
            (choice) => choice.question_id === question.question_id,
          );

          if (choiceRows.length !== 4) {
            throw new ChallengeUnavailableError();
          }

          const shuffledChoices = shuffleChallengeItems(
            choiceRows,
            randomIndex,
          );

          preparedQuestions.push({
            format: 'multiple_choice',
            sourceQuestionId: question.question_id,
            prompt: question.prompt,
            difficulty: question.difficulty,
            explanation: null,
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
              average_difficulty,
              placement_assignment_id
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8)
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
            eligibility.assignmentId ?? null,
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

        if (territoryOwnerBonus) {
          await territoryOwnerBonus.snapshotAttempt(client, {
            attemptId: insertedAttempt.attempt_id,
            playerId: input.playerId,
            eventId: input.eventId,
            startedAt,
          });
        }

        const questionSnapshots = preparedQuestions.map((question, index) => ({
          source_question_id: question.sourceQuestionId,
          position: index + 1,
          prompt: question.prompt,
          difficulty: question.difficulty,
          explanation: question.explanation,
        }));
        const itemSnapshots = preparedQuestions.flatMap((question) => {
          const items =
            question.format === 'multiple_choice'
              ? question.choices.map((choice) => ({
                  source_id: choice.sourceChoiceId,
                  text: choice.text,
                }))
              : question.items.map((item) => ({
                  source_id: item.sourceItemId,
                  text: item.text,
                }));
          return items.map((item, index) => ({
            source_question_id: question.sourceQuestionId,
            source_id: item.source_id,
            position: index + 1,
            text: item.text,
          }));
        });
        const multipleChoice = challenge.format === 'multiple_choice';
        // Read generated question IDs through RETURNING, rather than querying a
        // table changed by the same statement's snapshot.
        const snapshot = await client.query<{
          question_count: number;
          item_count: number;
        }>(
          `with questions as (
             insert into public.attempt_questions (
               attempt_id, source_question_id, position, prompt_snapshot,
               difficulty_snapshot, explanation_snapshot
             )
             select $1::uuid, source_question_id, position, prompt, difficulty, explanation
               from jsonb_to_recordset($2::jsonb) as row(
                 source_question_id uuid, position integer, prompt text,
                 difficulty integer, explanation text
               )
             order by position
             returning id, source_question_id
           ), items as (
             insert into public.${multipleChoice ? 'attempt_question_choices' : 'attempt_question_ordering_items'} (
               attempt_question_id, source_question_id,
               ${multipleChoice ? 'source_choice_id' : 'source_item_id'}, display_position,
               ${multipleChoice ? 'choice_text_snapshot' : 'item_text_snapshot'}
             )
             select question.id, item.source_question_id, item.source_id, item.position, item.text
               from questions question
               join jsonb_to_recordset($3::jsonb) as item(
                 source_question_id uuid, source_id uuid, position integer, text text
               ) on item.source_question_id = question.source_question_id
             order by question.id, item.position
             returning id
           )
           select (select count(*)::integer from questions) as question_count,
                  (select count(*)::integer from items) as item_count`,
          [
            insertedAttempt.attempt_id,
            JSON.stringify(questionSnapshots),
            JSON.stringify(itemSnapshots),
          ],
        );
        if (
          snapshot.rows[0]?.question_count !== 5 ||
          snapshot.rows[0].item_count !== 20
        ) {
          throw new Error(
            'Challenge attempt snapshots were not created completely.',
          );
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
