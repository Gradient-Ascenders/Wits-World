import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  createAuthorChallengeService,
} from '../src/challenges/author-challenge-service.js';
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

const AUTHOR_ONE_ID = 'e1000000-0000-4000-8000-000000000001';
const AUTHOR_TWO_ID = 'e1000000-0000-4000-8000-000000000002';
const PLAYER_ID = 'e1000000-0000-4000-8000-000000000003';

const EVENT_ID = 'e2000000-0000-4000-8000-000000000001';
const SECOND_EVENT_ID = 'e2000000-0000-4000-8000-000000000002';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'author challenge database integration',
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

      temporaryDatabaseName = `wits_quest_author_challenges_${Date.now()}_${process.pid}`;

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

      pool = createDatabasePool(temporaryConfig);

      await seedFoundation();
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

    it('creates a draft challenge and exposes its Author-visible question answer key', async () => {
      const service = createAuthorChallengeService(pool);

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId: EVENT_ID,
      });

      expect(challenge).toMatchObject({
        eventId: EVENT_ID,
        format: 'multiple_choice',
        status: 'draft',
      });

      const question = await service.createQuestion({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: challenge.challengeId,
        prompt: '  Where is the Great Hall?  ',
        difficulty: 2,
        explanation: '  The Great Hall is on East Campus.  ',
        choices: ['East Campus', 'West Campus', 'Parktown', 'Braamfontein'],
        acceptedChoicePosition: 1,
      });

      expect(question).toMatchObject({
        challengeId: challenge.challengeId,
        prompt: 'Where is the Great Hall?',
        difficulty: 2,
        explanation: 'The Great Hall is on East Campus.',
        status: 'draft',
        acceptedChoicePosition: 1,
      });

      expect(question.choices).toHaveLength(4);
      expect(question.acceptedChoiceId).toBe(question.choices[0]?.choiceId);

      const answerKey = await pool.query<{
        accepted_choice_id: string;
      }>(
        `
          select accepted_choice_id::text
          from private.challenge_answer_keys
          where question_id = $1::uuid
        `,
        [question.questionId],
      );

      expect(answerKey.rows).toEqual([
        {
          accepted_choice_id: question.choices[0]?.choiceId,
        },
      ]);

      const listed = await service.listQuestions(challenge.challengeId);

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        questionId: question.questionId,
        acceptedChoiceId: question.choices[0]?.choiceId,
        acceptedChoicePosition: 1,
      });

      const audits = await pool.query<{
        action: string;
        actor_player_id: string;
        entity_type: string;
      }>(
        `
          select
            actor_player_id::text,
            entity_type,
            action
          from public.author_content_audit
          where entity_id in ($1::uuid, $2::uuid)
          order by occurred_at, id
        `,
        [challenge.challengeId, question.questionId],
      );

      expect(audits.rows).toEqual([
        {
          actor_player_id: AUTHOR_ONE_ID,
          entity_type: 'challenge',
          action: 'create',
        },
        {
          actor_player_id: AUTHOR_ONE_ID,
          entity_type: 'question',
          action: 'create',
        },
      ]);
    }, 45_000);

    it('replaces a draft question choices and answer key atomically', async () => {
      const service = createAuthorChallengeService(pool);

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId: SECOND_EVENT_ID,
      });

      const created = await service.createQuestion({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: challenge.challengeId,
        prompt: 'Original prompt',
        difficulty: 1,
        explanation: 'Original explanation',
        choices: ['Original A', 'Original B', 'Original C', 'Original D'],
        acceptedChoicePosition: 1,
      });

      const originalChoiceIds = created.choices.map(
        (choice) => choice.choiceId,
      );

      const updated = await service.updateQuestion({
        actorPlayerId: AUTHOR_TWO_ID,
        questionId: created.questionId,
        prompt: 'Updated prompt',
        difficulty: 3,
        explanation: 'Updated explanation',
        choices: ['Updated A', 'Updated B', 'Updated C', 'Updated D'],
        acceptedChoicePosition: 3,
      });

      expect(updated).toMatchObject({
        questionId: created.questionId,
        prompt: 'Updated prompt',
        difficulty: 3,
        explanation: 'Updated explanation',
        acceptedChoicePosition: 3,
      });

      expect(updated.choices.map((choice) => choice.text)).toEqual([
        'Updated A',
        'Updated B',
        'Updated C',
        'Updated D',
      ]);

      expect(updated.acceptedChoiceId).toBe(updated.choices[2]?.choiceId);

      expect(
        updated.choices.every(
          (choice) => !originalChoiceIds.includes(choice.choiceId),
        ),
      ).toBe(true);

      const editAudit = await pool.query<{
        actor_player_id: string;
      }>(
        `
          select actor_player_id::text
          from public.author_content_audit
          where entity_type = 'question'
            and entity_id = $1::uuid
            and action = 'edit'
        `,
        [created.questionId],
      );

      expect(editAudit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);

    it('requires five published complete questions before publishing a challenge', async () => {
      const service = createAuthorChallengeService(pool);

      const eventResult = await pool.query<{
        event_id: string;
      }>(
        `
          insert into public.events (
            title,
            location,
            radius_metres,
            starts_at,
            ends_at
          )
          values (
            'Challenge readiness event',
            st_setsrid(
              st_makepoint(28.031, -26.193),
              4326
            )::geography,
            75,
            '2026-09-10T08:00:00Z',
            '2026-09-10T12:00:00Z'
          )
          returning id::text as event_id
        `,
      );

      const eventId = eventResult.rows[0]?.event_id;

      if (!eventId) {
        throw new Error('Expected challenge readiness event.');
      }

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
      });

      await expect(
        service.publishChallenge(AUTHOR_ONE_ID, challenge.challengeId),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);

      const questions = [];

      for (let number = 1; number <= 5; number += 1) {
        const question = await service.createQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          prompt: `Author question ${number}`,
          difficulty: (((number - 1) % 3) + 1) as 1 | 2 | 3,
          explanation: `Explanation ${number}`,
          choices: [
            `Choice ${number}.1`,
            `Choice ${number}.2`,
            `Choice ${number}.3`,
            `Choice ${number}.4`,
          ],
          acceptedChoicePosition: ((number - 1) % 4) + 1,
        });

        questions.push(question);

        await service.publishQuestion(AUTHOR_ONE_ID, question.questionId);
      }

      const published = await service.publishChallenge(
        AUTHOR_TWO_ID,
        challenge.challengeId,
      );

      expect(published).toMatchObject({
        challengeId: challenge.challengeId,
        status: 'published',
      });

      const persistedQuestions = await service.listQuestions(
        challenge.challengeId,
      );

      expect(persistedQuestions).toHaveLength(5);

      expect(
        persistedQuestions.every(
          (question) =>
            question.status === 'published' &&
            question.choices.length === 4 &&
            question.acceptedChoiceId !== null &&
            question.acceptedChoicePosition !== null &&
            question.explanation !== null,
        ),
      ).toBe(true);

      const publishAudit = await pool.query<{
        actor_player_id: string;
      }>(
        `
          select actor_player_id::text
          from public.author_content_audit
          where entity_type = 'challenge'
            and entity_id = $1::uuid
            and action = 'publish'
        `,
        [challenge.challengeId],
      );

      expect(publishAudit.rows).toEqual([
        {
          actor_player_id: AUTHOR_TWO_ID,
        },
      ]);
    }, 45_000);

    it('prevents published questions from being edited through the service', async () => {
      const service = createAuthorChallengeService(pool);

      const eventResult = await createTemporaryEvent(
        'Published question immutability',
      );

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId: eventResult,
      });

      const question = await service.createQuestion({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: challenge.challengeId,
        prompt: 'Immutable prompt',
        difficulty: 2,
        explanation: 'Immutable explanation',
        choices: ['A', 'B', 'C', 'D'],
        acceptedChoicePosition: 2,
      });

      await service.publishQuestion(AUTHOR_ONE_ID, question.questionId);

      await expect(
        service.updateQuestion({
          actorPlayerId: AUTHOR_TWO_ID,
          questionId: question.questionId,
          prompt: 'Changed prompt',
          difficulty: 2,
          explanation: 'Changed explanation',
          choices: ['W', 'X', 'Y', 'Z'],
          acceptedChoicePosition: 4,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);
    }, 45_000);

    it('prevents a published challenge from reverting, moving events, or being deleted', async () => {
      const service = createAuthorChallengeService(pool);

      const eventId = await createTemporaryEvent('Challenge lifecycle source');
      const targetEventId = await createTemporaryEvent(
        'Challenge lifecycle target',
      );

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
      });

      for (let number = 1; number <= 5; number += 1) {
        const question = await service.createQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          prompt: `Lifecycle question ${number}`,
          difficulty: 1,
          explanation: `Lifecycle explanation ${number}`,
          choices: ['A', 'B', 'C', 'D'],
          acceptedChoicePosition: 1,
        });

        await service.publishQuestion(AUTHOR_ONE_ID, question.questionId);
      }

      await service.publishChallenge(AUTHOR_ONE_ID, challenge.challengeId);

      await expect(
        pool.query(
          `
            update public.event_challenges
            set status = 'draft',
                updated_at = now()
            where id = $1::uuid
          `,
          [challenge.challengeId],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `
            update public.event_challenges
            set event_id = $2::uuid,
                updated_at = now()
            where id = $1::uuid
          `,
          [challenge.challengeId, targetEventId],
        ),
      ).rejects.toThrow();

      await expect(
        pool.query(
          `
            delete from public.event_challenges
            where id = $1::uuid
          `,
          [challenge.challengeId],
        ),
      ).rejects.toThrow();

      const persisted = await pool.query<{
        event_id: string;
        status: string;
      }>(
        `
          select
            event_id::text,
            status
          from public.event_challenges
          where id = $1::uuid
        `,
        [challenge.challengeId],
      );

      expect(persisted.rows).toEqual([
        {
          event_id: eventId,
          status: 'published',
        },
      ]);
    }, 45_000);

    it('retires published challenge content without allowing republication', async () => {
      const service = createAuthorChallengeService(pool);

      const eventId = await createTemporaryEvent('Retired challenge event');

      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
      });

      for (let number = 1; number <= 5; number += 1) {
        const question = await service.createQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          prompt: `Retirement question ${number}`,
          difficulty: 1,
          explanation: `Retirement explanation ${number}`,
          choices: ['A', 'B', 'C', 'D'],
          acceptedChoicePosition: 1,
        });

        await service.publishQuestion(AUTHOR_ONE_ID, question.questionId);
      }

      await service.publishChallenge(AUTHOR_ONE_ID, challenge.challengeId);

      const retired = await service.retireChallenge(
        AUTHOR_TWO_ID,
        challenge.challengeId,
      );

      expect(retired.status).toBe('retired');

      await expect(
        service.publishChallenge(AUTHOR_ONE_ID, challenge.challengeId),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);

      await expect(
        pool.query(
          `
            update public.event_challenges
            set status = 'published',
                updated_at = now()
            where id = $1::uuid
          `,
          [challenge.challengeId],
        ),
      ).rejects.toThrow();
    }, 45_000);

    it('rolls back challenge creation when the audit actor is a Player', async () => {
      const service = createAuthorChallengeService(pool);

      const before = await pool.query<{
        challenge_count: number;
      }>(
        `
          select count(*)::int as challenge_count
          from public.event_challenges
          where event_id = $1::uuid
        `,
        [EVENT_ID],
      );

      await expect(
        service.createChallenge({
          actorPlayerId: PLAYER_ID,
          eventId: EVENT_ID,
        }),
      ).rejects.toThrow();

      const after = await pool.query<{
        challenge_count: number;
      }>(
        `
          select count(*)::int as challenge_count
          from public.event_challenges
          where event_id = $1::uuid
        `,
        [EVENT_ID],
      );

      expect(after.rows[0]?.challenge_count).toBe(
        before.rows[0]?.challenge_count,
      );
    }, 45_000);

    async function seedFoundation(): Promise<void> {
      await pool.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role
          )
          values
            (
              $1::uuid,
              'https://auth.example.test/',
              'author-challenge-one',
              'author'
            ),
            (
              $2::uuid,
              'https://auth.example.test/',
              'author-challenge-two',
              'author'
            ),
            (
              $3::uuid,
              'https://auth.example.test/',
              'author-challenge-player',
              'player'
            )
        `,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID, PLAYER_ID],
      );

      await pool.query(
        `
          insert into public.events (
            id,
            title,
            location,
            radius_metres,
            starts_at,
            ends_at
          )
          values
            (
              $1::uuid,
              'Author challenge event',
              st_setsrid(
                st_makepoint(28.03038, -26.19205),
                4326
              )::geography,
              75,
              '2026-09-01T08:00:00Z',
              '2026-09-01T12:00:00Z'
            ),
            (
              $2::uuid,
              'Second author challenge event',
              st_setsrid(
                st_makepoint(28.031, -26.193),
                4326
              )::geography,
              75,
              '2026-09-02T08:00:00Z',
              '2026-09-02T12:00:00Z'
            )
        `,
        [EVENT_ID, SECOND_EVENT_ID],
      );
    }

    async function createTemporaryEvent(title: string): Promise<string> {
      const result = await pool.query<{
        event_id: string;
      }>(
        `
          insert into public.events (
            title,
            location,
            radius_metres,
            starts_at,
            ends_at
          )
          values (
            $1,
            st_setsrid(
              st_makepoint(28.03038, -26.19205),
              4326
            )::geography,
            75,
            '2026-10-01T08:00:00Z',
            '2026-10-01T12:00:00Z'
          )
          returning id::text as event_id
        `,
        [title],
      );

      const eventId = result.rows[0]?.event_id;

      if (!eventId) {
        throw new Error('Expected temporary event.');
      }

      return eventId;
    }
  },
);
