import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorContentNotReadyError,
  AuthorContentStateConflictError,
  createAuthorChallengeService,
  type AuthorChallengeQuestion,
  type AuthorMultipleChoiceQuestion,
  type AuthorOrderingQuestion,
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
import { calculateChallengeAttemptScore } from '../src/challenges/challenge-attempt-marking.js';
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
    }, 180_000);

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
      assertMultipleChoiceQuestion(question);

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
      assertMultipleChoiceQuestion(listed[0]);

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
    }, 180_000);

    it('creates, publishes, and reads a complete ordering challenge', async () => {
      const service = createAuthorChallengeService(pool);
      const eventId = await createTemporaryEvent('Ordering challenge event');
      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
        format: 'ordering',
      });

      expect(challenge.format).toBe('ordering');

      const createdQuestions: AuthorOrderingQuestion[] = [];

      for (let number = 1; number <= 5; number += 1) {
        const question = await service.createQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          format: 'ordering',
          prompt: `Order these steps ${number}`,
          difficulty: (((number - 1) % 3) + 1) as 1 | 2 | 3,
          explanation: `Ordering explanation ${number}`,
          items: [
            `Step ${number}.1`,
            `Step ${number}.2`,
            `Step ${number}.3`,
            `Step ${number}.4`,
          ],
        });

        assertOrderingQuestion(question);
        createdQuestions.push(question);
        await publishQuestionThroughReview(service, question.questionId);
      }

      const published = await publishChallengeThroughReview(
        service,
        challenge.challengeId,
      );
      const listed = await service.listQuestions(challenge.challengeId);

      expect(published).toMatchObject({
        format: 'ordering',
        status: 'published',
      });
      expect(listed).toHaveLength(5);

      for (const [questionIndex, question] of listed.entries()) {
        assertOrderingQuestion(question);
        expect(question.items).toHaveLength(4);
        expect(question.items.map((item) => item.position)).toEqual([
          1, 2, 3, 4,
        ]);
        expect(question.items.map((item) => item.text)).toEqual(
          createdQuestions[questionIndex]?.items.map((item) => item.text),
        );
      }

      const answerKeys = await pool.query<{
        key_count: number;
        distinct_positions: number;
      }>(
        `
          select
            count(*)::int as key_count,
            count(distinct key.correct_position)::int as distinct_positions
          from private.challenge_ordering_answer_keys key
          join public.challenge_ordering_items item
            on item.id = key.item_id
          join public.challenge_questions question
            on question.id = item.question_id
          where question.challenge_id = $1::uuid
        `,
        [challenge.challengeId],
      );

      expect(answerKeys.rows).toEqual([
        {
          key_count: 20,
          distinct_positions: 4,
        },
      ]);

      await expect(
        pool.query(
          `insert into public.challenge_choices (
             question_id, authoring_position, choice_text
           ) values ($1::uuid, 1, 'Wrong format child')`,
          [createdQuestions[0]?.questionId],
        ),
      ).rejects.toThrow();

      const orderingAttemptId = 'e4000000-0000-4000-8000-000000000001';
      const firstAttemptQuestionId = 'e5000000-0000-4000-8000-000000000001';
      const secondAttemptQuestionId = 'e5000000-0000-4000-8000-000000000002';
      const firstAttemptItemIds: string[] = [];
      const secondAttemptItemIds: string[] = [];
      const snapshotClient = await pool.connect();

      try {
        await snapshotClient.query('begin');
        await snapshotClient.query(
          `insert into public.challenge_attempts (
             id, player_id, event_id, challenge_id, started_at, deadline,
             time_limit_seconds, average_difficulty
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid,
             '2026-10-01T10:00:00Z', '2026-10-01T10:02:00Z', 120, 2
           )`,
          [orderingAttemptId, PLAYER_ID, eventId, challenge.challengeId],
        );

        for (const [questionIndex, question] of createdQuestions.entries()) {
          const attemptQuestionId = `e5000000-0000-4000-8000-${String(
            questionIndex + 1,
          ).padStart(12, '0')}`;
          await snapshotClient.query(
            `insert into public.attempt_questions (
               id, attempt_id, source_question_id, position, prompt_snapshot,
               difficulty_snapshot, explanation_snapshot
             ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7)`,
            [
              attemptQuestionId,
              orderingAttemptId,
              question.questionId,
              questionIndex + 1,
              question.prompt,
              question.difficulty,
              question.explanation,
            ],
          );

          for (const [itemIndex, item] of question.items.entries()) {
            const snapshotItemId = `e6000000-0000-4000-${String(
              questionIndex + 1,
            ).padStart(4, '0')}-${String(itemIndex + 1).padStart(12, '0')}`;
            await snapshotClient.query(
              `insert into public.attempt_question_ordering_items (
                 id, attempt_question_id, source_question_id, source_item_id,
                 display_position, item_text_snapshot
               ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6)`,
              [
                snapshotItemId,
                attemptQuestionId,
                question.questionId,
                item.itemId,
                itemIndex + 1,
                item.text,
              ],
            );

            if (questionIndex === 0) {
              firstAttemptItemIds.push(snapshotItemId);
            } else if (questionIndex === 1) {
              secondAttemptItemIds.push(snapshotItemId);
            }
          }
        }

        await snapshotClient.query('commit');
      } catch (error) {
        await snapshotClient.query('rollback');
        throw error;
      } finally {
        snapshotClient.release();
      }

      const incompleteAnswerClient = await pool.connect();
      try {
        await incompleteAnswerClient.query('begin');
        await incompleteAnswerClient.query(
          `insert into public.attempt_ordering_answers (attempt_question_id)
           values ($1::uuid)`,
          [firstAttemptQuestionId],
        );
        for (let position = 1; position <= 3; position += 1) {
          await incompleteAnswerClient.query(
            `insert into public.attempt_ordering_answer_items (
               attempt_question_id, selected_item_id, submitted_position
             ) values ($1::uuid, $2::uuid, $3)`,
            [
              firstAttemptQuestionId,
              firstAttemptItemIds[position - 1],
              position,
            ],
          );
        }

        await expect(incompleteAnswerClient.query('commit')).rejects.toThrow();
        await incompleteAnswerClient.query('rollback');
      } finally {
        incompleteAnswerClient.release();
      }

      const completeAnswerClient = await pool.connect();
      try {
        await completeAnswerClient.query('begin');
        await completeAnswerClient.query(
          `insert into public.attempt_ordering_answers (attempt_question_id)
           values ($1::uuid)`,
          [firstAttemptQuestionId],
        );
        for (let position = 1; position <= 4; position += 1) {
          await completeAnswerClient.query(
            `insert into public.attempt_ordering_answer_items (
               attempt_question_id, selected_item_id, submitted_position
             ) values ($1::uuid, $2::uuid, $3)`,
            [
              firstAttemptQuestionId,
              firstAttemptItemIds[position - 1],
              position,
            ],
          );
        }
        await completeAnswerClient.query('commit');
      } catch (error) {
        await completeAnswerClient.query('rollback');
        throw error;
      } finally {
        completeAnswerClient.release();
      }

      await expect(
        pool.query(
          `update public.attempt_ordering_answer_items
              set submitted_position = 2
            where attempt_question_id = $1::uuid
              and submitted_position = 1`,
          [firstAttemptQuestionId],
        ),
      ).rejects.toThrow();

      const incorrectAnswerClient = await pool.connect();
      try {
        await incorrectAnswerClient.query('begin');
        await incorrectAnswerClient.query(
          `insert into public.attempt_ordering_answers (attempt_question_id)
           values ($1::uuid)`,
          [secondAttemptQuestionId],
        );
        const incorrectOrder = [
          secondAttemptItemIds[1]!,
          secondAttemptItemIds[0]!,
          secondAttemptItemIds[2]!,
          secondAttemptItemIds[3]!,
        ];
        for (const [index, itemId] of incorrectOrder.entries()) {
          await incorrectAnswerClient.query(
            `insert into public.attempt_ordering_answer_items (
               attempt_question_id, selected_item_id, submitted_position
             ) values ($1::uuid, $2::uuid, $3)`,
            [secondAttemptQuestionId, itemId, index + 1],
          );
        }
        await incorrectAnswerClient.query('commit');
      } catch (error) {
        await incorrectAnswerClient.query('rollback');
        throw error;
      } finally {
        incorrectAnswerClient.release();
      }

      await expect(
        calculateChallengeAttemptScore(pool, orderingAttemptId),
      ).resolves.toEqual({
        totalQuestions: 5,
        answeredCount: 2,
        scoreCorrect: 1,
      });
    }, 180_000);

    it('prevents choices, answer keys, and ordering rows from being re-parented out of published questions', async () => {
      const service = createAuthorChallengeService(pool);
      const eventId = await createTemporaryEvent(
        'Published question reparenting event',
      );
      const multipleChoiceChallenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
      });
      const publishedMultipleChoice = await service.createQuestion({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: multipleChoiceChallenge.challengeId,
        prompt: 'Protected multiple-choice question',
        difficulty: 1,
        explanation: 'Published child rows must remain attached.',
        choices: ['A', 'B', 'C', 'D'],
        acceptedChoicePosition: 1,
      });
      assertMultipleChoiceQuestion(publishedMultipleChoice);
      await publishQuestionThroughReview(
        service,
        publishedMultipleChoice.questionId,
      );
      const draftMultipleChoice = await pool.query<{
        question_id: string;
      }>(
        `insert into public.challenge_questions (
           challenge_id, prompt, difficulty, explanation
         ) values ($1::uuid, 'Draft multiple-choice target', 1, 'Draft target')
         returning id::text question_id`,
        [multipleChoiceChallenge.challengeId],
      );
      const draftMultipleChoiceId = draftMultipleChoice.rows[0]?.question_id;
      if (!draftMultipleChoiceId) {
        throw new Error('Expected a draft multiple-choice target.');
      }
      const draftChoice = await pool.query<{ choice_id: string }>(
        `insert into public.challenge_choices (
           question_id, authoring_position, choice_text
         ) values ($1::uuid, 1, 'Draft accepted choice')
         returning id::text choice_id`,
        [draftMultipleChoiceId],
      );

      await expect(
        pool.query(
          `update public.challenge_choices
              set question_id = $2::uuid,
                  authoring_position = 2
            where id = $1::uuid`,
          [publishedMultipleChoice.choices[1]!.choiceId, draftMultipleChoiceId],
        ),
      ).rejects.toThrow(/non-draft question/i);
      await expect(
        pool.query(
          `update private.challenge_answer_keys
              set question_id = $2::uuid,
                  accepted_choice_id = $3::uuid
            where question_id = $1::uuid`,
          [
            publishedMultipleChoice.questionId,
            draftMultipleChoiceId,
            draftChoice.rows[0]?.choice_id,
          ],
        ),
      ).rejects.toThrow(/non-draft question/i);

      const orderingChallenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
        format: 'ordering',
      });
      const publishedOrdering = await service.createQuestion({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: orderingChallenge.challengeId,
        format: 'ordering',
        prompt: 'Protected ordering question',
        difficulty: 1,
        explanation: 'Published ordering rows must remain attached.',
        items: ['First', 'Second', 'Third', 'Fourth'],
      });
      assertOrderingQuestion(publishedOrdering);
      await publishQuestionThroughReview(service, publishedOrdering.questionId);
      const draftOrdering = await pool.query<{ question_id: string }>(
        `insert into public.challenge_questions (
           challenge_id, prompt, difficulty, explanation
         ) values ($1::uuid, 'Draft ordering target', 1, 'Draft target')
         returning id::text question_id`,
        [orderingChallenge.challengeId],
      );
      const draftOrderingId = draftOrdering.rows[0]?.question_id;
      if (!draftOrderingId) {
        throw new Error('Expected a draft ordering target.');
      }
      const draftOrderingItem = await pool.query<{ item_id: string }>(
        `insert into public.challenge_ordering_items (question_id, item_text)
         values ($1::uuid, 'Draft ordering item')
         returning id::text item_id`,
        [draftOrderingId],
      );

      await expect(
        pool.query(
          `update public.challenge_ordering_items
              set question_id = $2::uuid
            where id = $1::uuid`,
          [publishedOrdering.items[0]!.itemId, draftOrderingId],
        ),
      ).rejects.toThrow(/non-draft question/i);
      await expect(
        pool.query(
          `update private.challenge_ordering_answer_keys
              set question_id = $2::uuid,
                  item_id = $3::uuid,
                  correct_position = 1
            where question_id = $1::uuid
              and item_id = $4::uuid`,
          [
            publishedOrdering.questionId,
            draftOrderingId,
            draftOrderingItem.rows[0]?.item_id,
            publishedOrdering.items[0]!.itemId,
          ],
        ),
      ).rejects.toThrow(/non-draft question/i);
    }, 180_000);

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
      assertMultipleChoiceQuestion(created);

      const originalChoiceIds = created.choices.map(
        (choice) => choice.choiceId,
      );

      const updated = await service.updateQuestion({
        expectedVersion: 0,
        actorPlayerId: AUTHOR_TWO_ID,
        questionId: created.questionId,
        prompt: 'Updated prompt',
        difficulty: 3,
        explanation: 'Updated explanation',
        choices: ['Updated A', 'Updated B', 'Updated C', 'Updated D'],
        acceptedChoicePosition: 3,
      });
      assertMultipleChoiceQuestion(updated);

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
    }, 180_000);

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

      await service.submitChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 0,
      });
      await expect(
        service.approveChallenge({
          actorPlayerId: AUTHOR_TWO_ID,
          challengeId: challenge.challengeId,
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(AuthorContentNotReadyError);

      await service.returnChallenge({
        actorPlayerId: AUTHOR_TWO_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 1,
        note: 'Add the required published questions.',
      });

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

        await publishQuestionThroughReview(service, question.questionId);
      }

      await service.submitChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 2,
      });
      await service.approveChallenge({
        actorPlayerId: AUTHOR_TWO_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 3,
      });
      const published = await service.publishChallenge({
        actorPlayerId: AUTHOR_TWO_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 4,
      });

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
            question.format === 'multiple_choice' &&
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
    }, 180_000);

    it('serializes concurrent sibling challenge publication through their event', async () => {
      const eventId = await createTemporaryEvent(
        'Concurrent sibling challenge publication event',
      );
      const firstService = createAuthorChallengeService(pool);
      const secondPool = createDatabasePool(temporaryConfig);
      const secondService = createAuthorChallengeService(secondPool);

      try {
        const [firstChallenge, secondChallenge] = await Promise.all([
          firstService.createChallenge({
            actorPlayerId: AUTHOR_ONE_ID,
            eventId,
          }),
          secondService.createChallenge({
            actorPlayerId: AUTHOR_TWO_ID,
            eventId,
          }),
        ]);

        await seedControlledPublishedQuestions(
          firstChallenge.challengeId,
          'First sibling',
        );
        await seedControlledPublishedQuestions(
          secondChallenge.challengeId,
          'Second sibling',
        );

        await firstService.submitChallenge({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: firstChallenge.challengeId,
          expectedVersion: 0,
        });
        await firstService.approveChallenge({
          actorPlayerId: AUTHOR_TWO_ID,
          challengeId: firstChallenge.challengeId,
          expectedVersion: 1,
        });
        await secondService.submitChallenge({
          actorPlayerId: AUTHOR_TWO_ID,
          challengeId: secondChallenge.challengeId,
          expectedVersion: 0,
        });
        await secondService.approveChallenge({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: secondChallenge.challengeId,
          expectedVersion: 1,
        });

        const results = await Promise.allSettled([
          firstService.publishChallenge({
            actorPlayerId: AUTHOR_ONE_ID,
            challengeId: firstChallenge.challengeId,
            expectedVersion: 2,
          }),
          secondService.publishChallenge({
            actorPlayerId: AUTHOR_TWO_ID,
            challengeId: secondChallenge.challengeId,
            expectedVersion: 2,
          }),
        ]);

        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect(rejected).toMatchObject({
          reason: expect.any(AuthorContentNotReadyError),
        });

        const persisted = await pool.query<{
          approved_count: number;
          published_count: number;
        }>(
          `select
             count(*) filter (where status = 'approved')::int approved_count,
             count(*) filter (where status = 'published')::int published_count
           from public.event_challenges
           where event_id = $1::uuid`,
          [eventId],
        );
        expect(persisted.rows[0]).toEqual({
          approved_count: 1,
          published_count: 1,
        });
      } finally {
        await secondPool.end();
      }
    }, 180_000);

    it('serializes concurrent question retirement so a published challenge keeps five questions', async () => {
      const service = createAuthorChallengeService(pool);
      const eventId = await createTemporaryEvent(
        'Concurrent question retirement event',
      );
      const challenge = await service.createChallenge({
        actorPlayerId: AUTHOR_ONE_ID,
        eventId,
      });
      const questionIds: string[] = [];

      for (let number = 1; number <= 6; number += 1) {
        const question = await service.createQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          prompt: `Concurrent retirement question ${number}`,
          difficulty: 1,
          explanation: `Concurrent retirement explanation ${number}`,
          choices: ['A', 'B', 'C', 'D'],
          acceptedChoicePosition: 1,
        });
        questionIds.push(question.questionId);
        await publishQuestionThroughReview(service, question.questionId);
      }

      await publishChallengeThroughReview(service, challenge.challengeId);

      const results = await Promise.allSettled([
        service.retireQuestion({
          actorPlayerId: AUTHOR_ONE_ID,
          questionId: questionIds[0]!,
          expectedVersion: 3,
        }),
        service.retireQuestion({
          actorPlayerId: AUTHOR_TWO_ID,
          questionId: questionIds[1]!,
          expectedVersion: 3,
        }),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        reason: expect.any(AuthorContentNotReadyError),
      });

      const persisted = await pool.query<{ published_count: number }>(
        `select count(*)::int published_count
         from public.challenge_questions
         where challenge_id = $1::uuid and status = 'published'`,
        [challenge.challengeId],
      );
      expect(persisted.rows[0]?.published_count).toBe(5);
    }, 180_000);

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

      await publishQuestionThroughReview(service, question.questionId);

      await expect(
        service.updateQuestion({
          expectedVersion: 3,
          actorPlayerId: AUTHOR_TWO_ID,
          questionId: question.questionId,
          prompt: 'Changed prompt',
          difficulty: 2,
          explanation: 'Changed explanation',
          choices: ['W', 'X', 'Y', 'Z'],
          acceptedChoicePosition: 4,
        }),
      ).rejects.toBeInstanceOf(AuthorContentStateConflictError);
    }, 180_000);

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

        await publishQuestionThroughReview(service, question.questionId);
      }

      await publishChallengeThroughReview(service, challenge.challengeId);

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
    }, 180_000);

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

        await publishQuestionThroughReview(service, question.questionId);
      }

      await publishChallengeThroughReview(service, challenge.challengeId);

      const retired = await service.retireChallenge({
        actorPlayerId: AUTHOR_TWO_ID,
        challengeId: challenge.challengeId,
        expectedVersion: 3,
      });

      expect(retired.status).toBe('retired');

      await expect(
        service.publishChallenge({
          actorPlayerId: AUTHOR_ONE_ID,
          challengeId: challenge.challengeId,
          expectedVersion: 4,
        }),
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
    }, 180_000);

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
    }, 180_000);

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

    async function seedControlledPublishedQuestions(
      challengeId: string,
      promptPrefix: string,
    ): Promise<void> {
      for (let number = 1; number <= 5; number += 1) {
        const insertedQuestion = await pool.query<{ question_id: string }>(
          `insert into public.challenge_questions (
             challenge_id, prompt, difficulty, explanation
           ) values ($1::uuid, $2, 1, $3)
           returning id::text question_id`,
          [
            challengeId,
            `${promptPrefix} question ${number}`,
            `${promptPrefix} explanation ${number}`,
          ],
        );
        const questionId = insertedQuestion.rows[0]?.question_id;
        if (!questionId) {
          throw new Error('Expected a seeded sibling challenge question.');
        }

        const insertedChoices = await pool.query<{ choice_id: string }>(
          `insert into public.challenge_choices (
             question_id, authoring_position, choice_text
           )
           select $1::uuid, position, $2 || ' choice ' || position
           from generate_series(1, 4) position
           returning id::text choice_id, authoring_position`,
          [questionId, `${promptPrefix} ${number}`],
        );
        const acceptedChoiceId = insertedChoices.rows[0]?.choice_id;
        if (!acceptedChoiceId) {
          throw new Error('Expected a seeded sibling challenge choice.');
        }

        await pool.query(
          `insert into private.challenge_answer_keys (
             question_id, accepted_choice_id
           ) values ($1::uuid, $2::uuid)`,
          [questionId, acceptedChoiceId],
        );
        await pool.query(
          `update public.challenge_questions
              set status = 'published',
                  version = version + 1,
                  publication_provenance = 'controlled_seed'
            where id = $1::uuid`,
          [questionId],
        );
      }
    }
  },
);

function assertMultipleChoiceQuestion(
  question: AuthorChallengeQuestion | undefined,
): asserts question is AuthorMultipleChoiceQuestion {
  if (!question || question.format !== 'multiple_choice') {
    throw new Error('Expected a multiple-choice author question.');
  }
}

async function publishQuestionThroughReview(
  service: ReturnType<typeof createAuthorChallengeService>,
  questionId: string,
) {
  await service.submitQuestion({
    actorPlayerId: AUTHOR_ONE_ID,
    expectedVersion: 0,
    questionId,
  });
  await service.approveQuestion({
    actorPlayerId: AUTHOR_TWO_ID,
    expectedVersion: 1,
    questionId,
  });
  return service.publishQuestion({
    actorPlayerId: AUTHOR_ONE_ID,
    expectedVersion: 2,
    questionId,
  });
}

async function publishChallengeThroughReview(
  service: ReturnType<typeof createAuthorChallengeService>,
  challengeId: string,
) {
  await service.submitChallenge({
    actorPlayerId: AUTHOR_ONE_ID,
    challengeId,
    expectedVersion: 0,
  });
  await service.approveChallenge({
    actorPlayerId: AUTHOR_TWO_ID,
    challengeId,
    expectedVersion: 1,
  });
  return service.publishChallenge({
    actorPlayerId: AUTHOR_ONE_ID,
    challengeId,
    expectedVersion: 2,
  });
}

function assertOrderingQuestion(
  question: AuthorChallengeQuestion | undefined,
): asserts question is AuthorOrderingQuestion {
  if (!question || question.format !== 'ordering') {
    throw new Error('Expected an ordering author question.');
  }
}
