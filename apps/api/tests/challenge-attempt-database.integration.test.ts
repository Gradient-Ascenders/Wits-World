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

const EVENT_ID = '00000000-0000-4000-8000-000000000065';
const CHALLENGE_ID = '30000000-0000-4000-8000-000000000065';

const CREATE_PLAYER_ID = '00000000-0000-4000-8000-000000000165';
const RESUME_PLAYER_ID = '00000000-0000-4000-8000-000000000166';
const CONCURRENT_PLAYER_ID = '00000000-0000-4000-8000-000000000167';

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
    }, 45_000);

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
        randomIndex: () => 0,
      });

      const result = await service.startOrResume(validInput(CREATE_PLAYER_ID));

      expect(result.outcome).toBe('created');

      if (result.outcome !== 'created') {
        throw new Error('Expected a newly created challenge attempt.');
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
        randomIndex: () => 0,
      });

      const secondService = createChallengeAttemptStartService(pool, {
        clock: () => STARTED_AT,
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
          is_published
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
          true
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
