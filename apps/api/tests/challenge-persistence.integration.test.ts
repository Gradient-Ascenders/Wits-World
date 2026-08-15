import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import {
  createDatabasePool,
  withDatabaseClient,
} from '../src/database/connection.js';
import {
  runMigrations,
  type MigrationResult,
} from '../src/database/migrations.js';
import { createChallengeAttemptCompletionFinalizer } from '../src/challenges/challenge-attempt-completion-finalizer.js';
import { RewardCatalogUnavailableError } from '../src/challenges/challenge-reward-policy.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

const PLAYER_ID = '10000000-0000-4000-8000-000000000001';
const EVENT_ID = '20000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '30000000-0000-4000-8000-000000000001';
const INVALID_CHALLENGE_ID = '30000000-0000-4000-8000-000000000002';
const ATTEMPT_ID = '40000000-0000-4000-8000-000000000001';
const CONCURRENT_PLAYER_ID = '10000000-0000-4000-8000-000000000002';
const CONCURRENT_ATTEMPT_ID = '40000000-0000-4000-8000-000000000002';
const ROLLBACK_PLAYER_ID = '10000000-0000-4000-8000-000000000003';
const ROLLBACK_ATTEMPT_ID = '40000000-0000-4000-8000-000000000003';
const CARD_ID = '50000000-0000-4000-8000-000000000001';
const STARTER_GRANT_ID = '60000000-0000-4000-8000-000000000001';
const SECOND_CARD_ID = '50000000-0000-4000-8000-000000000002';

describe.skipIf(!runIntegrationTests)(
  'challenge persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let migrationResult: MigrationResult;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
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

      migrationResult = await runMigrations(temporaryConfig);
    }, 45_000);

    afterAll(async () => {
      if (!administrationConfig || !temporaryDatabaseName) {
        return;
      }

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('applies the persistence migrations in dependency order', async () => {
      expect(migrationResult).toEqual({
        applied: [
          '0001_enable_postgis.sql',
          '0002_create_events.sql',
          '0003_create_players.sql',
          '0004_create_account_deletion_requests.sql',
          '0005_create_challenge_definitions.sql',
          '0006_create_challenge_attempts.sql',
          '0007_create_cards_rewards_and_ownership.sql',
          '0008_allow_multiple_event_reward_cards.sql',
          '0009_create_card_catalogue_and_starter_grants.sql',
          '0010_add_card_modifier_metadata.sql',
          '0011_create_saved_decks.sql',
          '0012_add_author_content_foundation.sql',
          '0013_harden_author_challenge_lifecycle.sql',
        ],
        skipped: [],
      });

      await expect(runMigrations(temporaryConfig)).resolves.toEqual({
        applied: [],
        skipped: [
          '0001_enable_postgis.sql',
          '0002_create_events.sql',
          '0003_create_players.sql',
          '0004_create_account_deletion_requests.sql',
          '0005_create_challenge_definitions.sql',
          '0006_create_challenge_attempts.sql',
          '0007_create_cards_rewards_and_ownership.sql',
          '0008_allow_multiple_event_reward_cards.sql',
          '0009_create_card_catalogue_and_starter_grants.sql',
          '0010_add_card_modifier_metadata.sql',
          '0011_create_saved_decks.sql',
          '0012_add_author_content_foundation.sql',
          '0013_harden_author_challenge_lifecycle.sql',
        ],
      });
    }, 30_000);

    it('enforces challenge publication and attempt snapshot invariants', async () => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values ($1, 'https://issuer.example/', 'subject-1', 'player')`,
          [PLAYER_ID],
        );
        await client.query(
          `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at, is_published
         ) values (
           $1, 'Persistence test event',
           st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
           75, '2026-08-01T00:00:00Z', '2026-08-25T00:00:00Z', true
         )`,
          [EVENT_ID],
        );
        await client.query(
          `insert into public.event_challenges (id, event_id) values ($1, $2)`,
          [CHALLENGE_ID, EVENT_ID],
        );

        const questionIds: string[] = [];

        for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
          const questionId = `31000000-0000-4000-8000-${String(
            questionNumber,
          ).padStart(12, '0')}`;
          questionIds.push(questionId);

          await client.query(
            `insert into public.challenge_questions (
             id, challenge_id, prompt, difficulty
           ) values ($1, $2, $3, $4)`,
            [
              questionId,
              CHALLENGE_ID,
              `Persistence question ${questionNumber}`,
              questionNumber % 3 || 3,
            ],
          );

          const choiceIds: string[] = [];
          for (let choiceNumber = 1; choiceNumber <= 4; choiceNumber += 1) {
            const choiceId = `32000000-0000-4000-8000-${String(
              questionNumber * 10 + choiceNumber,
            ).padStart(12, '0')}`;
            choiceIds.push(choiceId);

            await client.query(
              `insert into public.challenge_choices (
               id, question_id, authoring_position, choice_text
             ) values ($1, $2, $3, $4)`,
              [choiceId, questionId, choiceNumber, `Choice ${choiceNumber}`],
            );
          }

          await client.query(
            `insert into private.challenge_answer_keys (
             question_id, accepted_choice_id
           ) values ($1, $2)`,
            [questionId, choiceIds[0]],
          );
          await client.query(
            `update public.challenge_questions
              set status = 'published', updated_at = now()
            where id = $1`,
            [questionId],
          );
        }

        await client.query(
          `update public.event_challenges
            set status = 'published', updated_at = now()
          where id = $1`,
          [CHALLENGE_ID],
        );

        const invalidChallenge = await client.query(
          `insert into public.event_challenges (id, event_id)
         values ($1, $2)`,
          [INVALID_CHALLENGE_ID, EVENT_ID],
        );

        expect(invalidChallenge.rowCount).toBe(1);
        await expect(
          client.query(
            `update public.event_challenges
              set status = 'published', updated_at = now()
            where id = $1`,
            [INVALID_CHALLENGE_ID],
          ),
        ).rejects.toThrow();

        await client.query('begin');
        try {
          await client.query(
            `insert into public.challenge_attempts (
             id, player_id, event_id, challenge_id,
             started_at, deadline, time_limit_seconds, average_difficulty
           ) values (
             $1, $2, $3, $4,
             '2026-08-10T12:00:00Z', '2026-08-10T12:02:00Z', 120, 2.00
           )`,
            [ATTEMPT_ID, PLAYER_ID, EVENT_ID, CHALLENGE_ID],
          );

          for (const [questionIndex, questionId] of questionIds.entries()) {
            const attemptQuestionId = `41000000-0000-4000-8000-${String(
              questionIndex + 1,
            ).padStart(12, '0')}`;
            const choices = await client.query<{
              choice_text: string;
              id: string;
            }>(
              `select id, choice_text
               from public.challenge_choices
              where question_id = $1
              order by authoring_position`,
              [questionId],
            );

            await client.query(
              `insert into public.attempt_questions (
               id, attempt_id, source_question_id, position,
               prompt_snapshot, difficulty_snapshot
             ) values ($1, $2, $3, $4, $5, $6)`,
              [
                attemptQuestionId,
                ATTEMPT_ID,
                questionId,
                questionIndex + 1,
                `Persistence question ${questionIndex + 1}`,
                (questionIndex + 1) % 3 || 3,
              ],
            );

            for (const [choiceIndex, choice] of choices.rows.entries()) {
              const attemptChoiceId = `42000000-0000-4000-8000-${String(
                (questionIndex + 1) * 10 + choiceIndex + 1,
              ).padStart(12, '0')}`;
              await client.query(
                `insert into public.attempt_question_choices (
                 id, attempt_question_id, source_question_id,
                 source_choice_id, display_position, choice_text_snapshot
               ) values ($1, $2, $3, $4, $5, $6)`,
                [
                  attemptChoiceId,
                  attemptQuestionId,
                  questionId,
                  choice.id,
                  choiceIndex + 1,
                  choice.choice_text,
                ],
              );
            }
          }

          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        }

        await expect(
          client.query(
            `insert into public.challenge_attempts (
             id, player_id, event_id, challenge_id,
             started_at, deadline, time_limit_seconds, average_difficulty
           ) values (
             gen_random_uuid(), $1, $2, $3,
             '2026-08-10T12:00:00Z', '2026-08-10T12:02:00Z', 120, 2.00
           )`,
            [PLAYER_ID, EVENT_ID, CHALLENGE_ID],
          ),
        ).rejects.toThrow();

        const snapshotCounts = await client.query<{
          choices: string;
          questions: string;
        }>(
          `select
           (select count(*)::text from public.attempt_questions where attempt_id = $1) as questions,
           (select count(*)::text
              from public.attempt_question_choices choices
              join public.attempt_questions questions
                on questions.id = choices.attempt_question_id
             where questions.attempt_id = $1) as choices`,
          [ATTEMPT_ID],
        );
        expect(snapshotCounts.rows[0]).toEqual({
          choices: '20',
          questions: '5',
        });

        const firstQuestion = await client.query<{ id: string }>(
          `select id
           from public.attempt_question_choices
          where attempt_question_id = (
            select id from public.attempt_questions
             where attempt_id = $1 and position = 1
          )
          order by display_position
          limit 1`,
          [ATTEMPT_ID],
        );
        const firstAttemptQuestion = await client.query<{ id: string }>(
          `select id
           from public.attempt_questions
          where attempt_id = $1 and position = 1`,
          [ATTEMPT_ID],
        );

        await client.query(
          `insert into public.attempt_answers (
           attempt_question_id, selected_choice_id
         ) values ($1, $2)`,
          [firstAttemptQuestion.rows[0]?.id, firstQuestion.rows[0]?.id],
        );
        await expect(
          client.query(
            `insert into public.attempt_answers (
             attempt_question_id, selected_choice_id
           ) values ($1, $2)`,
            [firstAttemptQuestion.rows[0]?.id, firstQuestion.rows[0]?.id],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(
            `update public.attempt_answers
                set answered_at = now()
              where attempt_question_id = $1`,
            [firstAttemptQuestion.rows[0]?.id],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(
            `delete from public.attempt_answers
              where attempt_question_id = $1`,
            [firstAttemptQuestion.rows[0]?.id],
          ),
        ).rejects.toThrow();
      });
    }, 45_000);

    it('finalizes one completion, prevents duplicate coins, and allows duplicate card grants', async () => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        const cardResult = await client.query(
          `insert into public.card_definitions (
           id, name, category, affinity, rarity, hp, power, description
         ) values
           ($1, 'Persistence Spark', 'creature', 'spark', 'common', 100, 10,
            'A card used by the persistence test'),
           ($2, 'Persistence Spark Copy', 'creature', 'spark', 'common', 110, 12,
            'A second card used by the persistence test')
         returning id`,
          [CARD_ID, SECOND_CARD_ID],
        );
        expect(cardResult.rows).toHaveLength(2);

        const finalizer = createChallengeAttemptCompletionFinalizer({
          randomInt: () => 0,
        });

        await client.query('begin');
        try {
          await finalizer.finalizeAttempt(client, {
            playerId: PLAYER_ID,
            attemptId: ATTEMPT_ID,
            completionReason: 'answered',
            scoreCorrect: 5,
            completedAt: new Date('2026-08-10T12:01:00Z'),
          });
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        }

        const completion = await client.query<{ id: string }>(
          `select id from public.event_completions where attempt_id = $1`,
          [ATTEMPT_ID],
        );
        const completionId = completion.rows[0]?.id;
        expect(completionId).toBeTruthy();

        await client.query('begin');
        try {
          await finalizer.finalizeAttempt(client, {
            playerId: PLAYER_ID,
            attemptId: ATTEMPT_ID,
            completionReason: 'answered',
            scoreCorrect: 5,
            completedAt: new Date('2026-08-10T12:01:00Z'),
          });
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        }

        await expect(
          client.query(
            `update public.challenge_attempts
                set score_correct = 4
              where id = $1`,
            [ATTEMPT_ID],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(
            `update public.challenge_attempts
                set average_difficulty = 1.00
              where id = $1`,
            [ATTEMPT_ID],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(`delete from public.challenge_attempts where id = $1`, [
            ATTEMPT_ID,
          ]),
        ).rejects.toThrow();
        await expect(
          client.query(
            `update public.event_completions
                set score_correct = 4
              where id = $1`,
            [completionId],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(`delete from public.event_completions where id = $1`, [
            completionId,
          ]),
        ).rejects.toThrow();

        const finalizedSnapshot = await client.query<{
          choice_id: string;
          question_id: string;
        }>(
          `select
             questions.id as question_id,
             choices.id as choice_id
           from public.attempt_questions questions
           join public.attempt_question_choices choices
             on choices.attempt_question_id = questions.id
          where questions.attempt_id = $1
            and questions.position = 1
            and choices.display_position = 1`,
          [ATTEMPT_ID],
        );
        const unansweredSnapshot = await client.query<{
          choice_id: string;
          question_id: string;
        }>(
          `select
             questions.id as question_id,
             choices.id as choice_id
           from public.attempt_questions questions
           join public.attempt_question_choices choices
             on choices.attempt_question_id = questions.id
          where questions.attempt_id = $1
            and questions.position = 2
            and choices.display_position = 1`,
          [ATTEMPT_ID],
        );

        const finalizedQuestion = finalizedSnapshot.rows[0];
        const unansweredQuestion = unansweredSnapshot.rows[0];
        expect(finalizedQuestion).toBeDefined();
        expect(unansweredQuestion).toBeDefined();

        await expect(
          client.query(
            `update public.attempt_questions
                set prompt_snapshot = 'Changed after completion'
              where id = $1`,
            [finalizedQuestion?.question_id],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(`delete from public.attempt_questions where id = $1`, [
            finalizedQuestion?.question_id,
          ]),
        ).rejects.toThrow();
        await expect(
          client.query(
            `update public.attempt_question_choices
                set choice_text_snapshot = 'Changed after completion'
              where id = $1`,
            [finalizedQuestion?.choice_id],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(
            `delete from public.attempt_question_choices where id = $1`,
            [finalizedQuestion?.choice_id],
          ),
        ).rejects.toThrow();
        await expect(
          client.query(
            `insert into public.attempt_answers (
             attempt_question_id, selected_choice_id
           ) values ($1, $2)`,
            [unansweredQuestion?.question_id, unansweredQuestion?.choice_id],
          ),
        ).rejects.toThrow();

        const wallet = await client.query<{ coin_balance: number }>(
          `select coin_balance from public.player_wallets where player_id = $1`,
          [PLAYER_ID],
        );
        expect(wallet.rows[0]?.coin_balance).toBe(63);

        const ledger = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.coin_ledger_entries
            where completion_id = $1`,
          [completionId],
        );
        expect(ledger.rows[0]?.count).toBe('1');

        await expect(
          client.query(
            `insert into public.coin_ledger_entries (
             player_id, amount, reason, completion_id
           ) values ($1, 63, 'event_reward', $2)`,
            [PLAYER_ID, completionId],
          ),
        ).rejects.toThrow();

        await client.query(
          `insert into public.player_starter_grants (id, player_id, affinity)
           values ($1, $2, 'spark')`,
          [STARTER_GRANT_ID, PLAYER_ID],
        );
        await client.query(
          `insert into public.player_cards (
           player_id, card_definition_id, source_starter_grant_id,
           acquisition_kind
         ) values ($1, $2, $3, 'starter')`,
          [PLAYER_ID, CARD_ID, STARTER_GRANT_ID],
        );
        await expect(
          client.query(
            `insert into public.player_cards (
             player_id, card_definition_id, source_starter_grant_id,
             acquisition_kind
           ) values ($1, $2, $3, 'starter')`,
            [PLAYER_ID, CARD_ID, STARTER_GRANT_ID],
          ),
        ).rejects.toThrow();

        const ownedCards = await client.query<{ count: string }>(
          `select count(*)::text as count
           from public.player_cards
          where player_id = $1 and card_definition_id = $2`,
          [PLAYER_ID, CARD_ID],
        );
        expect(ownedCards.rows[0]?.count).toBe('3');

        const eventRewardCards = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.player_cards
            where source_completion_id = $1`,
          [completionId],
        );
        expect(eventRewardCards.rows[0]?.count).toBe('2');

        await expect(
          client.query(
            `insert into public.event_completions (
             attempt_id, player_id, event_id, score_correct,
             average_difficulty, coins_awarded, reward_policy_version
           ) values ($1, $2, $3, 5, 2.00, 63, 'basic-v1')`,
            [ATTEMPT_ID, PLAYER_ID, EVENT_ID],
          ),
        ).rejects.toThrow();
      });
    }, 45_000);

    it('converges concurrent finalization on one completion and reward', async () => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values ($1, 'https://issuer.example/', 'subject-concurrent', 'player')`,
          [CONCURRENT_PLAYER_ID],
        );
        await insertAttemptWithSnapshots(client, {
          attemptId: CONCURRENT_ATTEMPT_ID,
          playerId: CONCURRENT_PLAYER_ID,
          attemptQuestionPrefix: '43000000-0000-4000-8000',
          attemptChoicePrefix: '44000000-0000-4000-8000',
          promptPrefix: 'Concurrent persistence question',
        });
      });

      const pool = createDatabasePool(temporaryConfig);
      const [firstClient, secondClient] = await Promise.all([
        pool.connect(),
        pool.connect(),
      ]);
      const finalizer = createChallengeAttemptCompletionFinalizer({
        randomInt: () => 0,
      });
      const input = {
        playerId: CONCURRENT_PLAYER_ID,
        attemptId: CONCURRENT_ATTEMPT_ID,
        completionReason: 'answered' as const,
        scoreCorrect: 5,
        completedAt: new Date('2026-08-10T12:01:00Z'),
      };

      try {
        await Promise.all([
          firstClient.query('begin'),
          secondClient.query('begin'),
        ]);

        // Keep the winning transaction open while the second finalizer races
        // on the completion uniqueness constraint.
        await finalizer.finalizeAttempt(firstClient, input);
        const concurrentFinalization = finalizer.finalizeAttempt(
          secondClient,
          input,
        );
        await firstClient.query('commit');
        await concurrentFinalization;
        await secondClient.query('commit');
      } catch (error) {
        await Promise.allSettled([
          firstClient.query('rollback'),
          secondClient.query('rollback'),
        ]);
        throw error;
      } finally {
        firstClient.release();
        secondClient.release();
        await pool.end();
      }

      await withDatabaseClient(temporaryConfig, async (client) => {
        const completionCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.event_completions
            where attempt_id = $1`,
          [CONCURRENT_ATTEMPT_ID],
        );
        expect(completionCount.rows[0]?.count).toBe('1');

        const wallet = await client.query<{ coin_balance: number }>(
          `select coin_balance
             from public.player_wallets
            where player_id = $1`,
          [CONCURRENT_PLAYER_ID],
        );
        expect(wallet.rows[0]?.coin_balance).toBe(63);

        const ledgerCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.coin_ledger_entries
            where player_id = $1`,
          [CONCURRENT_PLAYER_ID],
        );
        expect(ledgerCount.rows[0]?.count).toBe('1');

        const cardCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.player_cards
            where player_id = $1`,
          [CONCURRENT_PLAYER_ID],
        );
        expect(cardCount.rows[0]?.count).toBe('2');
      });
    }, 45_000);

    it('rolls back unavailable catalogue rewards without completing the attempt', async () => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values ($1, 'https://issuer.example/', 'subject-rollback', 'player')`,
          [ROLLBACK_PLAYER_ID],
        );
        await insertAttemptWithSnapshots(client, {
          attemptId: ROLLBACK_ATTEMPT_ID,
          playerId: ROLLBACK_PLAYER_ID,
          attemptQuestionPrefix: '45000000-0000-4000-8000',
          attemptChoicePrefix: '46000000-0000-4000-8000',
          promptPrefix: 'Rollback persistence question',
        });

        const finalizer = createChallengeAttemptCompletionFinalizer({
          randomInt: () => 0,
        });

        await client.query('begin');
        try {
          await client.query(
            `update public.card_definitions
                set is_active = false
              where rarity = 'common'`,
          );
          await expect(
            finalizer.finalizeAttempt(client, {
              playerId: ROLLBACK_PLAYER_ID,
              attemptId: ROLLBACK_ATTEMPT_ID,
              completionReason: 'answered',
              scoreCorrect: 3,
              completedAt: new Date('2026-08-10T12:01:00Z'),
            }),
          ).rejects.toBeInstanceOf(RewardCatalogUnavailableError);
        } finally {
          await client.query('rollback');
        }

        const attempt = await client.query<{ status: string }>(
          `select status from public.challenge_attempts where id = $1`,
          [ROLLBACK_ATTEMPT_ID],
        );
        expect(attempt.rows[0]?.status).toBe('in_progress');

        const completionCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.event_completions
            where attempt_id = $1`,
          [ROLLBACK_ATTEMPT_ID],
        );
        expect(completionCount.rows[0]?.count).toBe('0');

        const walletCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.player_wallets
            where player_id = $1`,
          [ROLLBACK_PLAYER_ID],
        );
        expect(walletCount.rows[0]?.count).toBe('0');

        const ledgerCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.coin_ledger_entries
            where player_id = $1`,
          [ROLLBACK_PLAYER_ID],
        );
        expect(ledgerCount.rows[0]?.count).toBe('0');

        const cardCount = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.player_cards
            where player_id = $1`,
          [ROLLBACK_PLAYER_ID],
        );
        expect(cardCount.rows[0]?.count).toBe('0');
      });
    }, 45_000);
  },
);

interface AttemptFixtureOptions {
  attemptChoicePrefix: string;
  attemptId: string;
  attemptQuestionPrefix: string;
  playerId: string;
  promptPrefix: string;
}

async function insertAttemptWithSnapshots(
  client: pg.PoolClient,
  options: AttemptFixtureOptions,
): Promise<void> {
  await client.query('begin');

  try {
    await client.query(
      `insert into public.challenge_attempts (
       id, player_id, event_id, challenge_id,
       started_at, deadline, time_limit_seconds, average_difficulty
     ) values (
       $1, $2, $3, $4,
       '2026-08-10T12:00:00Z', '2026-08-10T12:02:00Z', 120, 2.00
     )`,
      [options.attemptId, options.playerId, EVENT_ID, CHALLENGE_ID],
    );

    for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
      const sourceQuestionId = `31000000-0000-4000-8000-${String(
        questionNumber,
      ).padStart(12, '0')}`;
      const attemptQuestionId = `${options.attemptQuestionPrefix}-${String(
        questionNumber,
      ).padStart(12, '0')}`;

      await client.query(
        `insert into public.attempt_questions (
         id, attempt_id, source_question_id, position,
         prompt_snapshot, difficulty_snapshot
       ) values ($1, $2, $3, $4, $5, 2)`,
        [
          attemptQuestionId,
          options.attemptId,
          sourceQuestionId,
          questionNumber,
          `${options.promptPrefix} ${questionNumber}`,
        ],
      );

      for (let choiceNumber = 1; choiceNumber <= 4; choiceNumber += 1) {
        const sourceChoiceId = `32000000-0000-4000-8000-${String(
          questionNumber * 10 + choiceNumber,
        ).padStart(12, '0')}`;
        const attemptChoiceId = `${options.attemptChoicePrefix}-${String(
          questionNumber * 10 + choiceNumber,
        ).padStart(12, '0')}`;

        await client.query(
          `insert into public.attempt_question_choices (
           id, attempt_question_id, source_question_id,
           source_choice_id, display_position, choice_text_snapshot
         ) values ($1, $2, $3, $4, $5, $6)`,
          [
            attemptChoiceId,
            attemptQuestionId,
            sourceQuestionId,
            sourceChoiceId,
            choiceNumber,
            `Fixture choice ${choiceNumber}`,
          ],
        );
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
