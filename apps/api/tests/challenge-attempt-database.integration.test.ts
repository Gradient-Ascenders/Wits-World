import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createChallengeAttemptStartService,
  type StartChallengeAttemptInput,
} from '../src/challenges/challenge-attempt-start.js';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { createMovementEvidenceService } from '../src/events/movement-evidence.js';

import {
  ChallengeAnswerLockedError,
  ChallengeAttemptNotFoundError,
  InvalidChallengeAnswerError,
  lockChallengeAnswer,
  type LockChallengeAnswerInput,
} from '../src/challenges/challenge-answer-lock.js';

import { createChallengeAttemptFetchService } from '../src/challenges/challenge-attempt-fetch.js';
import { createChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-attempt-completion-finalizer.js';
import { createChallengeAnswerSubmissionService } from '../src/challenges/challenge-answer-submission.js';

const EVENT_ID = '00000000-0000-4000-8000-000000000065';
const CHALLENGE_ID = '30000000-0000-4000-8000-000000000065';

const CREATE_PLAYER_ID = '00000000-0000-4000-8000-000000000165';
const RESUME_PLAYER_ID = '00000000-0000-4000-8000-000000000166';
const CONCURRENT_PLAYER_ID = '00000000-0000-4000-8000-000000000167';

const ANSWER_PLAYER_ID = '00000000-0000-4000-8000-000000000168';
const DUPLICATE_PLAYER_ID = '00000000-0000-4000-8000-000000000169';

const WRONG_OWNER_PLAYER_ID = '00000000-0000-4000-8000-000000000170';
const WRONG_OWNER_INTRUDER_ID = '00000000-0000-4000-8000-000000000171';

const BINDING_PLAYER_ID = '00000000-0000-4000-8000-000000000172';
const CONCURRENT_ANSWER_PLAYER_ID = '00000000-0000-4000-8000-000000000173';
const EXPIRED_ANSWER_PLAYER_ID = '00000000-0000-4000-8000-000000000174';

const FETCH_TIMEOUT_PLAYER_ID = '00000000-0000-4000-8000-000000000176';
const FIFTH_ANSWER_PLAYER_ID = '00000000-0000-4000-8000-000000000177';

const ANSWER_RECEIVED_AT = new Date('2026-09-01T10:01:00.000Z');

const STARTED_AT = new Date('2026-09-01T10:00:00.000Z');

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'challenge attempt database integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();

      administrationConfig = buildDatabaseConfig({
        target: 'test',
      });

      temporaryDatabaseName = `wits_quest_challenge_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;

      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      await runMigrations(temporaryConfig);

      await withDatabaseClient(temporaryConfig, async (client) => {
        await seedPublishedChallenge(client);
      });

      pool = createDatabasePool(temporaryConfig);
    }, 60_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (!administrationConfig || !temporaryDatabaseName) {
        return;
      }

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('creates exactly five persisted question snapshots with four shuffled choices each', async () => {
      await insertPlayer(pool, CREATE_PLAYER_ID, 'create-attempt');

      const service = createChallengeAttemptStartService(pool, {
        clock: () => STARTED_AT,
        movementEvidenceService: createTestMovementEvidenceService(pool),
        randomIndex: () => 0,
      });

      const result = await service.startOrResume(validInput(CREATE_PLAYER_ID));

      expect(result.outcome).toBe('created');

      if (result.outcome !== 'created') {
        throw new Error('Expected a newly created challenge attempt.');
      }

      if (result.attempt.format !== 'multiple_choice') {
        throw new Error('Expected a multiple-choice challenge attempt.');
      }

      expect(result.attempt).toMatchObject({
        eventId: EVENT_ID,
        format: 'multiple_choice',
        status: 'in_progress',
        startedAt: '2026-09-01T10:00:00.000Z',
        deadline: '2026-09-01T10:02:00.000Z',
        totalQuestions: 5,
        answeredCount: 0,
      });

      expect(result.attempt.questions).toHaveLength(5);
      expect(
        result.attempt.questions.map((question) => question.prompt),
      ).toEqual([
        'Question 2',
        'Question 3',
        'Question 4',
        'Question 5',
        'Question 6',
      ]);

      for (const question of result.attempt.questions) {
        expect(question.choices).toHaveLength(4);
        expect(question).not.toHaveProperty('difficulty');
        expect(question).not.toHaveProperty('sourceQuestionId');

        for (const choice of question.choices) {
          expect(choice).not.toHaveProperty('sourceChoiceId');
          expect(choice).not.toHaveProperty('accepted');
          expect(choice).not.toHaveProperty('correct');
        }
      }

      const attempt = await pool.query<{
        attempt_id: string;
        average_difficulty: string;
        deadline: Date;
        started_at: Date;
        time_limit_seconds: number;
      }>(
        `
          select
            id::text as attempt_id,
            started_at,
            deadline,
            time_limit_seconds,
            average_difficulty::text
          from public.challenge_attempts
          where player_id = $1
            and event_id = $2
        `,
        [CREATE_PLAYER_ID, EVENT_ID],
      );

      expect(attempt.rows).toHaveLength(1);
      expect(attempt.rows[0]).toMatchObject({
        attempt_id: result.attempt.attemptId,
        average_difficulty: '2.20',
        time_limit_seconds: 120,
      });
      expect(attempt.rows[0]?.started_at.toISOString()).toBe(
        '2026-09-01T10:00:00.000Z',
      );
      expect(attempt.rows[0]?.deadline.toISOString()).toBe(
        '2026-09-01T10:02:00.000Z',
      );

      const questionSnapshots = await pool.query<{
        position: number;
        source_question_id: string;
      }>(
        `
          select
            question.position,
            question.source_question_id::text
          from public.attempt_questions question
          where question.attempt_id = $1
          order by question.position
        `,
        [result.attempt.attemptId],
      );

      expect(questionSnapshots.rows).toEqual([
        {
          position: 1,
          source_question_id: sourceQuestionId(2),
        },
        {
          position: 2,
          source_question_id: sourceQuestionId(3),
        },
        {
          position: 3,
          source_question_id: sourceQuestionId(4),
        },
        {
          position: 4,
          source_question_id: sourceQuestionId(5),
        },
        {
          position: 5,
          source_question_id: sourceQuestionId(6),
        },
      ]);

      expect(
        new Set(
          questionSnapshots.rows.map((question) => question.source_question_id),
        ).size,
      ).toBe(5);

      const snapshotCounts = await pool.query<{
        choice_count: string;
        question_count: string;
      }>(
        `
          select
            (
              select count(*)::text
              from public.attempt_questions
              where attempt_id = $1
            ) as question_count,
            (
              select count(*)::text
              from public.attempt_question_choices choice
              join public.attempt_questions question
                on question.id = choice.attempt_question_id
              where question.attempt_id = $1
            ) as choice_count
        `,
        [result.attempt.attemptId],
      );

      expect(snapshotCounts.rows[0]).toEqual({
        question_count: '5',
        choice_count: '20',
      });

      const firstQuestionChoices = await pool.query<{
        display_position: number;
        source_choice_id: string;
      }>(
        `
          select
            choice.display_position,
            choice.source_choice_id::text
          from public.attempt_question_choices choice
          join public.attempt_questions question
            on question.id = choice.attempt_question_id
          where question.attempt_id = $1
            and question.position = 1
          order by choice.display_position
        `,
        [result.attempt.attemptId],
      );

      expect(firstQuestionChoices.rows).toEqual([
        {
          display_position: 1,
          source_choice_id: sourceChoiceId(2, 2),
        },
        {
          display_position: 2,
          source_choice_id: sourceChoiceId(2, 3),
        },
        {
          display_position: 3,
          source_choice_id: sourceChoiceId(2, 4),
        },
        {
          display_position: 4,
          source_choice_id: sourceChoiceId(2, 1),
        },
      ]);
    }, 30_000);

    it('resumes the same persisted attempt without requiring a fresh location claim', async () => {
      await insertPlayer(pool, RESUME_PLAYER_ID, 'resume-attempt');

      const service = createChallengeAttemptStartService(pool, {
        clock: () => STARTED_AT,
        movementEvidenceService: createTestMovementEvidenceService(pool),
        randomIndex: () => 0,
      });

      const first = await service.startOrResume(validInput(RESUME_PLAYER_ID));

      expect(first.outcome).toBe('created');

      const second = await service.startOrResume({
        ...validInput(RESUME_PLAYER_ID),
        latitude: 0,
        longitude: 0,
        accuracyMetres: 1,
        acquiredAt: '2026-09-01T09:00:00.000Z',
      });

      expect(second.outcome).toBe('resumed');
      expect(second.attempt).toEqual(first.attempt);

      const persisted = await pool.query<{
        attempt_count: string;
        choice_count: string;
        question_count: string;
      }>(
        `
          select
            (
              select count(*)::text
              from public.challenge_attempts
              where player_id = $1
                and event_id = $2
            ) as attempt_count,
            (
              select count(*)::text
              from public.attempt_questions question
              join public.challenge_attempts attempt
                on attempt.id = question.attempt_id
              where attempt.player_id = $1
                and attempt.event_id = $2
            ) as question_count,
            (
              select count(*)::text
              from public.attempt_question_choices choice
              join public.attempt_questions question
                on question.id = choice.attempt_question_id
              join public.challenge_attempts attempt
                on attempt.id = question.attempt_id
              where attempt.player_id = $1
                and attempt.event_id = $2
            ) as choice_count
        `,
        [RESUME_PLAYER_ID, EVENT_ID],
      );

      expect(persisted.rows[0]).toEqual({
        attempt_count: '1',
        question_count: '5',
        choice_count: '20',
      });
    }, 30_000);

    it('converges concurrent starts on one persisted attempt', async () => {
      await insertPlayer(pool, CONCURRENT_PLAYER_ID, 'concurrent-attempt');

      const firstService = createChallengeAttemptStartService(pool, {
        clock: () => STARTED_AT,
        movementEvidenceService: createTestMovementEvidenceService(pool),
        randomIndex: () => 0,
      });

      const secondService = createChallengeAttemptStartService(pool, {
        clock: () => STARTED_AT,
        movementEvidenceService: createTestMovementEvidenceService(pool),
        randomIndex: (upperExclusive) => upperExclusive - 1,
      });

      const [first, second] = await Promise.all([
        firstService.startOrResume(validInput(CONCURRENT_PLAYER_ID)),
        secondService.startOrResume(validInput(CONCURRENT_PLAYER_ID)),
      ]);

      expect([first.outcome, second.outcome].sort()).toEqual([
        'created',
        'resumed',
      ]);

      expect(first.attempt).toEqual(second.attempt);

      const persisted = await pool.query<{
        attempt_count: string;
        choice_count: string;
        distinct_question_count: string;
        question_count: string;
      }>(
        `
          select
            (
              select count(*)::text
              from public.challenge_attempts
              where player_id = $1
                and event_id = $2
            ) as attempt_count,
            (
              select count(*)::text
              from public.attempt_questions question
              join public.challenge_attempts attempt
                on attempt.id = question.attempt_id
              where attempt.player_id = $1
                and attempt.event_id = $2
            ) as question_count,
            (
              select count(distinct question.source_question_id)::text
              from public.attempt_questions question
              join public.challenge_attempts attempt
                on attempt.id = question.attempt_id
              where attempt.player_id = $1
                and attempt.event_id = $2
            ) as distinct_question_count,
            (
              select count(*)::text
              from public.attempt_question_choices choice
              join public.attempt_questions question
                on question.id = choice.attempt_question_id
              join public.challenge_attempts attempt
                on attempt.id = question.attempt_id
              where attempt.player_id = $1
                and attempt.event_id = $2
            ) as choice_count
        `,
        [CONCURRENT_PLAYER_ID, EVENT_ID],
      );

      expect(persisted.rows[0]).toEqual({
        attempt_count: '1',
        question_count: '5',
        distinct_question_count: '5',
        choice_count: '20',
      });
    }, 30_000);

    it('persists an accepted answer using the server receipt timestamp', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        ANSWER_PLAYER_ID,
        'answer-persist',
      );

      const question = attempt.questions[0];
      const choice = question?.choices[0];

      if (!question || !choice) {
        throw new Error('Expected a persisted challenge question and choice.');
      }

      const result = await submitNonFinalizingAnswer(pool, {
        playerId: ANSWER_PLAYER_ID,
        attemptId: attempt.attemptId,
        attemptQuestionId: question.attemptQuestionId,
        choiceId: choice.choiceId,
        receivedAt: ANSWER_RECEIVED_AT,
      });

      expect(result).toEqual({
        outcome: 'accepted',
        answeredCount: 1,
        finalizationReason: null,
      });

      const persisted = await pool.query<{
        answered_at: Date;
        selected_choice_id: string;
      }>(
        `
          select
            answer.selected_choice_id::text,
            answer.answered_at
          from public.attempt_answers answer
          join public.attempt_questions question
            on question.id = answer.attempt_question_id
          where question.attempt_id = $1::uuid
        `,
        [attempt.attemptId],
      );

      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]?.selected_choice_id).toBe(choice.choiceId);
      expect(persisted.rows[0]?.answered_at.toISOString()).toBe(
        ANSWER_RECEIVED_AT.toISOString(),
      );
    }, 30_000);

    it('treats the same persisted answer as idempotent', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        DUPLICATE_PLAYER_ID,
        'answer-duplicate',
      );

      const question = attempt.questions[0];
      const choice = question?.choices[0];

      if (!question || !choice) {
        throw new Error('Expected a persisted challenge question and choice.');
      }

      const input: LockChallengeAnswerInput = {
        playerId: DUPLICATE_PLAYER_ID,
        attemptId: attempt.attemptId,
        attemptQuestionId: question.attemptQuestionId,
        choiceId: choice.choiceId,
        receivedAt: ANSWER_RECEIVED_AT,
      };

      await expect(
        submitNonFinalizingAnswer(pool, input),
      ).resolves.toMatchObject({
        outcome: 'accepted',
        answeredCount: 1,
      });

      await expect(
        submitNonFinalizingAnswer(pool, {
          ...input,
          receivedAt: new Date('2026-09-01T10:01:10.000Z'),
        }),
      ).resolves.toEqual({
        outcome: 'idempotent',
        answeredCount: 1,
        finalizationReason: null,
      });

      const persisted = await countPersistedAnswers(pool, attempt.attemptId);

      expect(persisted).toBe(1);
    }, 30_000);

    it('rejects a different choice after an answer has been locked', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        '00000000-0000-4000-8000-000000000175',
        'answer-locked',
      );

      const question = attempt.questions[0];
      const firstChoice = question?.choices[0];
      const secondChoice = question?.choices[1];

      if (!question || !firstChoice || !secondChoice) {
        throw new Error('Expected two persisted challenge choices.');
      }

      await submitNonFinalizingAnswer(pool, {
        playerId: '00000000-0000-4000-8000-000000000175',
        attemptId: attempt.attemptId,
        attemptQuestionId: question.attemptQuestionId,
        choiceId: firstChoice.choiceId,
        receivedAt: ANSWER_RECEIVED_AT,
      });

      await expect(
        submitNonFinalizingAnswer(pool, {
          playerId: '00000000-0000-4000-8000-000000000175',
          attemptId: attempt.attemptId,
          attemptQuestionId: question.attemptQuestionId,
          choiceId: secondChoice.choiceId,
          receivedAt: new Date('2026-09-01T10:01:05.000Z'),
        }),
      ).rejects.toBeInstanceOf(ChallengeAnswerLockedError);

      const persisted = await pool.query<{
        selected_choice_id: string;
      }>(
        `
          select answer.selected_choice_id::text
          from public.attempt_answers answer
          join public.attempt_questions question
            on question.id = answer.attempt_question_id
          where question.attempt_id = $1::uuid
        `,
        [attempt.attemptId],
      );

      expect(persisted.rows).toEqual([
        {
          selected_choice_id: firstChoice.choiceId,
        },
      ]);
    }, 30_000);

    it('does not allow another player to submit against an owned attempt', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        WRONG_OWNER_PLAYER_ID,
        'answer-owner',
      );

      await insertPlayer(pool, WRONG_OWNER_INTRUDER_ID, 'answer-intruder');

      const question = attempt.questions[0];
      const choice = question?.choices[0];

      if (!question || !choice) {
        throw new Error('Expected a persisted challenge question and choice.');
      }

      await expect(
        submitNonFinalizingAnswer(pool, {
          playerId: WRONG_OWNER_INTRUDER_ID,
          attemptId: attempt.attemptId,
          attemptQuestionId: question.attemptQuestionId,
          choiceId: choice.choiceId,
          receivedAt: ANSWER_RECEIVED_AT,
        }),
      ).rejects.toBeInstanceOf(ChallengeAttemptNotFoundError);

      expect(await countPersistedAnswers(pool, attempt.attemptId)).toBe(0);
    }, 30_000);

    it('rejects a choice belonging to a different attempt question', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        BINDING_PLAYER_ID,
        'answer-binding',
      );

      const firstQuestion = attempt.questions[0];
      const secondQuestion = attempt.questions[1];
      const wrongChoice = secondQuestion?.choices[0];

      if (!firstQuestion || !secondQuestion || !wrongChoice) {
        throw new Error('Expected persisted challenge questions and choices.');
      }

      await expect(
        submitNonFinalizingAnswer(pool, {
          playerId: BINDING_PLAYER_ID,
          attemptId: attempt.attemptId,
          attemptQuestionId: firstQuestion.attemptQuestionId,
          choiceId: wrongChoice.choiceId,
          receivedAt: ANSWER_RECEIVED_AT,
        }),
      ).rejects.toBeInstanceOf(InvalidChallengeAnswerError);

      expect(await countPersistedAnswers(pool, attempt.attemptId)).toBe(0);
    }, 30_000);

    it('serializes concurrent different-choice submissions so exactly one answer wins', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        CONCURRENT_ANSWER_PLAYER_ID,
        'answer-concurrent',
      );

      const question = attempt.questions[0];
      const firstChoice = question?.choices[0];
      const secondChoice = question?.choices[1];

      if (!question || !firstChoice || !secondChoice) {
        throw new Error('Expected two persisted challenge choices.');
      }

      const firstInput: LockChallengeAnswerInput = {
        playerId: CONCURRENT_ANSWER_PLAYER_ID,
        attemptId: attempt.attemptId,
        attemptQuestionId: question.attemptQuestionId,
        choiceId: firstChoice.choiceId,
        receivedAt: ANSWER_RECEIVED_AT,
      };

      const secondInput: LockChallengeAnswerInput = {
        ...firstInput,
        choiceId: secondChoice.choiceId,
      };

      const results = await Promise.allSettled([
        submitNonFinalizingAnswer(pool, firstInput),
        submitNonFinalizingAnswer(pool, secondInput),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (fulfilled[0]?.status !== 'fulfilled') {
        throw new Error('Expected one successful concurrent answer.');
      }

      if (rejected[0]?.status !== 'rejected') {
        throw new Error('Expected one rejected concurrent answer.');
      }

      expect(fulfilled[0].value).toMatchObject({
        outcome: 'accepted',
        answeredCount: 1,
      });

      expect(rejected[0].reason).toBeInstanceOf(ChallengeAnswerLockedError);

      const persisted = await pool.query<{
        selected_choice_id: string;
      }>(
        `
          select answer.selected_choice_id::text
          from public.attempt_answers answer
          join public.attempt_questions question
            on question.id = answer.attempt_question_id
          where question.attempt_id = $1::uuid
        `,
        [attempt.attemptId],
      );

      expect(persisted.rows).toHaveLength(1);
      expect([firstChoice.choiceId, secondChoice.choiceId]).toContain(
        persisted.rows[0]?.selected_choice_id,
      );
    }, 30_000);

    it('does not persist an answer received at the deadline', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        EXPIRED_ANSWER_PLAYER_ID,
        'answer-expired',
      );

      const question = attempt.questions[0];
      const choice = question?.choices[0];

      if (!question || !choice) {
        throw new Error('Expected a persisted challenge question and choice.');
      }

      const client = await pool.connect();

      try {
        await client.query('begin');

        const result = await lockChallengeAnswer(client, {
          playerId: EXPIRED_ANSWER_PLAYER_ID,
          attemptId: attempt.attemptId,
          attemptQuestionId: question.attemptQuestionId,
          choiceId: choice.choiceId,
          receivedAt: new Date(attempt.deadline),
        });

        expect(result).toEqual({
          outcome: 'expired',
          finalizationReason: 'timeout',
        });

        // This test isolates answer-lock expiry classification. Defensive timeout
        // completion through the concrete finalizer is covered by the fetch test below.
        await client.query('rollback');
      } finally {
        client.release();
      }

      expect(await countPersistedAnswers(pool, attempt.attemptId)).toBe(0);
    }, 30_000);

    it('returns one stable completed review from the fifth answer and completed GET', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        FIFTH_ANSWER_PLAYER_ID,
        'fifth-answer-review',
      );

      const answerChoices = await pool.query<{
        attempt_question_id: string;
        choice_id: string;
      }>(
        `
          select distinct on (question.position)
            question.id::text as attempt_question_id,
            choice.id::text as choice_id
          from public.attempt_questions question
          join public.attempt_question_choices choice
            on choice.attempt_question_id = question.id
          join private.challenge_answer_keys answer_key
            on answer_key.question_id = question.source_question_id
          where question.attempt_id = $1::uuid
            and choice.source_choice_id <> answer_key.accepted_choice_id
          order by question.position, choice.display_position
        `,
        [attempt.attemptId],
      );

      expect(answerChoices.rows).toHaveLength(5);

      const finalizer = createChallengeAttemptCompletionFinalizer({
        randomInt: () => 0,
      });
      const answerService = createChallengeAnswerSubmissionService(pool, {
        finalizer,
        clock: () => ANSWER_RECEIVED_AT,
      });
      const submissionResults: Awaited<
        ReturnType<typeof answerService.submitAnswer>
      >[] = [];

      for (const [index, answer] of answerChoices.rows.entries()) {
        const result = await answerService.submitAnswer({
          playerId: FIFTH_ANSWER_PLAYER_ID,
          attemptId: attempt.attemptId,
          attemptQuestionId: answer.attempt_question_id,
          choiceId: answer.choice_id,
        });
        submissionResults.push(result);

        if (index < 4) {
          expect(result.status).toBe('in_progress');
          expect(result).not.toHaveProperty('review');
          expect(result).not.toHaveProperty('scoreCorrect');
          expect(result).not.toHaveProperty('reward');
        }
      }

      const fifthAnswer = answerChoices.rows[4];

      if (!fifthAnswer) {
        throw new Error('Expected the fifth persisted answer choice.');
      }

      const completedFromPost = submissionResults[4];

      if (
        !completedFromPost ||
        completedFromPost.status !== 'completed' ||
        completedFromPost.format !== 'multiple_choice'
      ) {
        throw new Error('Expected the fifth answer to complete the attempt.');
      }

      expect(completedFromPost.completionReason).toBe('answered');
      expect(completedFromPost.review).toHaveLength(5);
      expect(
        completedFromPost.review.every(
          (entry) =>
            entry.selectedChoice !== null &&
            entry.selectedChoice.choiceId !== entry.correctChoice.choiceId &&
            entry.isCorrect === false,
        ),
      ).toBe(true);
      expect(completedFromPost.scoreCorrect).toBe(0);

      const fetchService = createChallengeAttemptFetchService(pool, {
        finalizer,
        clock: () => {
          throw new Error('Completed GET must not consult the clock.');
        },
      });

      const completedFromGet = await fetchService.fetchAttempt({
        playerId: FIFTH_ANSWER_PLAYER_ID,
        attemptId: attempt.attemptId,
      });
      const completedRetry = await answerService.submitAnswer({
        playerId: FIFTH_ANSWER_PLAYER_ID,
        attemptId: attempt.attemptId,
        attemptQuestionId: fifthAnswer.attempt_question_id,
        choiceId: fifthAnswer.choice_id,
      });

      expect(completedFromGet).toEqual(completedFromPost);
      expect(completedRetry).toEqual(completedFromPost);
    }, 45_000);

    it('defensively finalizes an expired fetched attempt exactly once', async () => {
      const attempt = await createAttemptForPlayer(
        pool,
        FETCH_TIMEOUT_PLAYER_ID,
        'fetch-timeout',
      );

      const acceptedChoice = await pool.query<{
        attempt_question_id: string;
        choice_id: string;
      }>(
        `
          select
            question.id::text as attempt_question_id,
            choice.id::text as choice_id
          from public.attempt_questions question
          join public.attempt_question_choices choice
            on choice.attempt_question_id = question.id
          join private.challenge_answer_keys answer_key
            on answer_key.question_id = question.source_question_id
          and answer_key.accepted_choice_id = choice.source_choice_id
          where question.attempt_id = $1::uuid
            and question.position = 1
          limit 1
        `,
        [attempt.attemptId],
      );

      const accepted = acceptedChoice.rows[0];

      if (!accepted) {
        throw new Error(
          'Expected an accepted persisted choice for timeout scoring.',
        );
      }

      await submitNonFinalizingAnswer(pool, {
        playerId: FETCH_TIMEOUT_PLAYER_ID,
        attemptId: attempt.attemptId,
        attemptQuestionId: accepted.attempt_question_id,
        choiceId: accepted.choice_id,
        receivedAt: ANSWER_RECEIVED_AT,
      });

      expect(await countPersistedAnswers(pool, attempt.attemptId)).toBe(1);

      const finalizer = createChallengeAttemptCompletionFinalizer({
        randomInt: () => 0,
      });

      const fetchService = createChallengeAttemptFetchService(pool, {
        finalizer,
        clock: () => new Date(attempt.deadline),
      });

      const input = {
        playerId: FETCH_TIMEOUT_PLAYER_ID,
        attemptId: attempt.attemptId,
      };

      const [first, second] = await Promise.all([
        fetchService.fetchAttempt(input),
        fetchService.fetchAttempt(input),
      ]);

      expect(first).toEqual(second);

      expect(first).toMatchObject({
        attemptId: attempt.attemptId,
        eventId: EVENT_ID,
        status: 'completed',
        completionReason: 'timeout',
        totalQuestions: 5,
        scoreCorrect: 1,
        reward: {
          cards: [],
        },
      });

      if (first.status !== 'completed' || first.format !== 'multiple_choice') {
        throw new Error('Expected timeout fetch to return completed state.');
      }

      expect(first.review).toHaveLength(5);
      expect(first.review[0]).toMatchObject({
        attemptQuestionId: accepted.attempt_question_id,
        selectedChoice: {
          choiceId: accepted.choice_id,
        },
        correctChoice: {
          choiceId: accepted.choice_id,
        },
        isCorrect: true,
      });
      expect(
        first.review
          .slice(1)
          .every(
            (entry) =>
              entry.selectedChoice === null && entry.isCorrect === false,
          ),
      ).toBe(true);
      expect(
        first.review.every((entry) => entry.correctChoice.text.length > 0),
      ).toBe(true);
      expect(first.review.filter((entry) => entry.isCorrect)).toHaveLength(
        first.scoreCorrect,
      );

      const persisted = await pool.query<{
        card_count: string;
        coins_awarded: number;
        completion_count: string;
        completion_reason: string;
        ledger_count: string;
        point_award_count: string;
        score_correct: number;
        status: string;
        wallet_balance: number | null;
      }>(
        `
          select
            attempt.status,
            attempt.completion_reason,
            attempt.score_correct,
            (
              select count(*)::text
              from public.event_completions completion
              where completion.attempt_id = attempt.id
            ) as completion_count,
            (
              select completion.coins_awarded
              from public.event_completions completion
              where completion.attempt_id = attempt.id
            ) as coins_awarded,
            (
              select count(*)::text
              from public.coin_ledger_entries ledger
              join public.event_completions completion
                on completion.id = ledger.completion_id
              where completion.attempt_id = attempt.id
            ) as ledger_count,
            (
              select wallet.coin_balance
              from public.player_wallets wallet
              where wallet.player_id = attempt.player_id
            ) as wallet_balance,
            (
              select count(*)::text
              from public.player_point_awards award
              join public.event_completions completion
                on completion.id = award.event_completion_id
              where completion.attempt_id = attempt.id
            ) as point_award_count,
            (
              select count(*)::text
              from public.player_cards owned
              join public.event_completions completion
                on completion.id = owned.source_completion_id
              where completion.attempt_id = attempt.id
            ) as card_count
          from public.challenge_attempts attempt
          where attempt.id = $1::uuid
            and attempt.player_id = $2::uuid
        `,
        [attempt.attemptId, FETCH_TIMEOUT_PLAYER_ID],
      );

      expect(persisted.rows[0]).toEqual({
        status: 'completed',
        completion_reason: 'timeout',
        score_correct: 1,
        completion_count: '1',
        coins_awarded: 0,
        ledger_count: '0',
        wallet_balance: null,
        point_award_count: '1',
        card_count: '0',
      });
    }, 45_000);
  },
);

function validInput(playerId: string): StartChallengeAttemptInput {
  return {
    playerId,
    eventId: EVENT_ID,
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: '2026-09-01T09:59:30.000Z',
  };
}

async function createAttemptForPlayer(
  pool: ReturnType<typeof createDatabasePool>,
  playerId: string,
  subjectSuffix: string,
) {
  await insertPlayer(pool, playerId, subjectSuffix);

  const service = createChallengeAttemptStartService(pool, {
    clock: () => STARTED_AT,
    movementEvidenceService: createTestMovementEvidenceService(pool),
    randomIndex: () => 0,
  });

  const result = await service.startOrResume(validInput(playerId));

  if (
    result.outcome !== 'created' ||
    result.attempt.format !== 'multiple_choice'
  ) {
    throw new Error('Expected a newly created challenge attempt.');
  }

  return result.attempt;
}

function createTestMovementEvidenceService(
  pool: ReturnType<typeof createDatabasePool>,
) {
  return createMovementEvidenceService(pool, {
    // Test-only permissive threshold; production has no default.
    maxPlausibleJourneySpeedMetresPerSecond: 1_000,
  });
}

async function submitNonFinalizingAnswer(
  pool: ReturnType<typeof createDatabasePool>,
  input: LockChallengeAnswerInput,
) {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const result = await lockChallengeAnswer(client, input);

    if (
      result.outcome === 'expired' ||
      ('finalizationReason' in result && result.finalizationReason !== null)
    ) {
      throw new Error(
        'Test helper cannot commit an answer requiring finalization.',
      );
    }

    await client.query('commit');

    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original test failure.
    }

    throw error;
  } finally {
    client.release();
  }
}

async function countPersistedAnswers(
  pool: ReturnType<typeof createDatabasePool>,
  attemptId: string,
): Promise<number> {
  const result = await pool.query<{
    answer_count: number;
  }>(
    `
      select count(answer.attempt_question_id)::int as answer_count
      from public.attempt_questions question
      join public.attempt_answers answer
        on answer.attempt_question_id = question.id
      where question.attempt_id = $1::uuid
    `,
    [attemptId],
  );

  return result.rows[0]?.answer_count ?? 0;
}

async function insertPlayer(
  pool: ReturnType<typeof createDatabasePool>,
  playerId: string,
  subjectSuffix: string,
) {
  await pool.query(
    `
      insert into public.players (
        id,
        auth_issuer,
        auth_subject,
        role,
        lifecycle_status
      )
      values ($1, $2, $3, 'player', 'active')
    `,
    [playerId, 'https://auth.example.test/', `auth0|${subjectSuffix}`],
  );
}

async function seedPublishedChallenge(
  client: Parameters<Parameters<typeof withDatabaseClient>[1]>[0],
) {
  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.events (
          id,
          title,
          location,
          radius_metres,
          starts_at,
          ends_at,
          is_published,
          authoring_status,
          publication_provenance
        )
        values (
          $1,
          'Challenge start integration event',
          st_setsrid(
            st_makepoint(28.03038, -26.19205),
            4326
          )::geography,
          75,
          '2026-09-01T09:00:00.000Z',
          '2026-09-01T11:00:00.000Z',
          true,
          'published',
          'controlled_seed'
        )
      `,
      [EVENT_ID],
    );

    await client.query(
      `
        insert into public.event_challenges (
          id,
          event_id,
          format,
          status
        )
        values ($1, $2, 'multiple_choice', 'draft')
      `,
      [CHALLENGE_ID, EVENT_ID],
    );

    const difficulties = [1, 1, 2, 2, 3, 3] as const;

    for (let questionNumber = 1; questionNumber <= 6; questionNumber += 1) {
      const questionId = sourceQuestionId(questionNumber);

      await client.query(
        `
          insert into public.challenge_questions (
            id,
            challenge_id,
            prompt,
            difficulty,
            status
          )
          values ($1, $2, $3, $4, 'draft')
        `,
        [
          questionId,
          CHALLENGE_ID,
          `Question ${questionNumber}`,
          difficulties[questionNumber - 1],
        ],
      );

      for (let choiceNumber = 1; choiceNumber <= 4; choiceNumber += 1) {
        await client.query(
          `
            insert into public.challenge_choices (
              id,
              question_id,
              authoring_position,
              choice_text
            )
            values ($1, $2, $3, $4)
          `,
          [
            sourceChoiceId(questionNumber, choiceNumber),
            questionId,
            choiceNumber,
            `Choice ${questionNumber}.${choiceNumber}`,
          ],
        );
      }

      await client.query(
        `
          insert into private.challenge_answer_keys (
            question_id,
            accepted_choice_id
          )
          values ($1, $2)
        `,
        [questionId, sourceChoiceId(questionNumber, 1)],
      );
    }

    await client.query(
      `
        update public.challenge_questions
        set
          status = 'published',
          version = version + 1,
          publication_provenance = 'controlled_seed',
          updated_at = now()
        where challenge_id = $1
      `,
      [CHALLENGE_ID],
    );

    await client.query(
      `
        update public.event_challenges
        set
          status = 'published',
          version = version + 1,
          publication_provenance = 'controlled_seed',
          updated_at = now()
        where id = $1
      `,
      [CHALLENGE_ID],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function sourceQuestionId(questionNumber: number) {
  return `30000000-0000-4000-8001-${String(questionNumber).padStart(12, '0')}`;
}

function sourceChoiceId(questionNumber: number, choiceNumber: number) {
  return `30000000-0000-4001-${String(questionNumber).padStart(
    4,
    '0',
  )}-${String(choiceNumber).padStart(12, '0')}`;
}
