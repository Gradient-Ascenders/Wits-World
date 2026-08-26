import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUTH0_DATABASE_CONNECTION_STRATEGY } from '../src/auth/interactive-player-claims.js';
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
import { getMigrationsDirectory } from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import { createPlayerIdentityService } from '../src/players/player-identity.js';

const ISSUER = 'https://auth.example.test/';
const PLAYER_ID = 'd1000000-0000-4000-8000-000000000001';
const DELETION_ID = 'd1100000-0000-4000-8000-000000000001';
const COMPLETED_EVENT_ID = 'd2000000-0000-4000-8000-000000000001';
const ACTIVE_EVENT_ID = 'd2000000-0000-4000-8000-000000000002';
const COMPLETED_CHALLENGE_ID = 'd3000000-0000-4000-8000-000000000001';
const ACTIVE_CHALLENGE_ID = 'd3000000-0000-4000-8000-000000000002';
const COMPLETED_ATTEMPT_ID = 'd4000000-0000-4000-8000-000000000001';
const ACTIVE_ATTEMPT_ID = 'd4000000-0000-4000-8000-000000000002';
const COMPLETION_ID = 'd5000000-0000-4000-8000-000000000001';
const STARTER_GRANT_ID = 'd6000000-0000-4000-8000-000000000001';
const DECK_ID = 'd7000000-0000-4000-8000-000000000001';
const ACTIVE_MATCH_ID = 'd8000000-0000-4000-8000-000000000001';
const COMPLETED_MATCH_ID = 'd8000000-0000-4000-8000-000000000002';

const ROLLBACK_PLAYER_ID = 'd1000000-0000-4000-8000-000000000002';
const ROLLBACK_DELETION_ID = 'd1100000-0000-4000-8000-000000000002';
const ROLLBACK_GRANT_ID = 'd6000000-0000-4000-8000-000000000002';

const CONCURRENT_PLAYER_ID = 'd1000000-0000-4000-8000-000000000003';
const CONCURRENT_DELETION_ID = 'd1100000-0000-4000-8000-000000000003';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'account deletion persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_deletion_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(
        '0024_complete_account_deletion_retention.sql',
      );

      await runSeeds(temporaryConfig);
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

    it('deletes owned and active data while retaining anonymous completed history', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-history',
      };

      await withDatabaseClient(temporaryConfig, async (client) => {
        await seedCompletePlayerJourney(client, identity.subject);
      });

      await expect(
        pool.query(
          `
            delete from public.attempt_answers answer
            using public.attempt_questions question
            where answer.attempt_question_id = question.id
              and question.attempt_id = $1::uuid
          `,
          [COMPLETED_ATTEMPT_ID],
        ),
      ).rejects.toThrow();

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T12:00:00.000Z'),
        createId: () => DELETION_ID,
      });

      const requested = await lifecycle.request(identity);
      const completed = await lifecycle.complete(requested.id);

      expect(completed).toMatchObject({
        id: DELETION_ID,
        status: 'completed',
        completedAt: new Date('2026-08-26T12:00:00.000Z'),
        failureReason: null,
      });
      await expect(lifecycle.complete(requested.id)).resolves.toEqual(
        completed,
      );

      const player = await pool.query<{
        auth_issuer: string | null;
        auth_subject: string | null;
        deletion_request_id: string | null;
        lifecycle_status: string;
        player_name: string | null;
        role: string | null;
      }>(
        `
          select
            auth_issuer,
            auth_subject,
            deletion_request_id,
            lifecycle_status,
            player_name,
            role
          from public.players
          where id = $1::uuid
        `,
        [PLAYER_ID],
      );

      expect(player.rows[0]).toEqual({
        auth_issuer: null,
        auth_subject: null,
        deletion_request_id: null,
        lifecycle_status: 'deleted',
        player_name: null,
        role: null,
      });

      const deletedData = await pool.query<Record<string, string>>(
        `
          select
            (select count(*)::text from public.player_cards
              where player_id = $1::uuid) as owned_cards,
            (select count(*)::text from public.player_starter_grants
              where player_id = $1::uuid) as starter_grants,
            (select count(*)::text from public.player_decks
              where player_id = $1::uuid) as decks,
            (select count(*)::text from public.player_deck_cards
              where player_id = $1::uuid) as deck_cards,
            (select count(*)::text from public.player_deck_selections
              where player_id = $1::uuid) as deck_selections,
            (select count(*)::text from public.player_wallets
              where player_id = $1::uuid) as wallets,
            (select count(*)::text
               from public.attempt_answers answer
               join public.attempt_questions question
                 on question.id = answer.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as answers,
            (select count(*)::text
               from public.attempt_questions question
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as question_snapshots,
            (select count(*)::text
               from public.attempt_question_choices choice
               join public.attempt_questions question
                 on question.id = choice.attempt_question_id
               join public.challenge_attempts attempt
                 on attempt.id = question.attempt_id
              where attempt.player_id = $1::uuid) as choice_snapshots,
            (select count(*)::text from public.challenge_attempts
              where player_id = $1::uuid and status = 'in_progress')
              as active_attempts,
            (select count(*)::text from public.cpu_matches
              where player_id = $1::uuid and status = 'active')
              as active_matches
        `,
        [PLAYER_ID],
      );

      expect(deletedData.rows[0]).toEqual({
        owned_cards: '0',
        starter_grants: '0',
        decks: '0',
        deck_cards: '0',
        deck_selections: '0',
        wallets: '0',
        answers: '0',
        question_snapshots: '0',
        choice_snapshots: '0',
        active_attempts: '0',
        active_matches: '0',
      });

      const retainedData = await pool.query<Record<string, string>>(
        `
          select
            (select count(*)::text from public.challenge_attempts
              where id = $2::uuid and player_id = $1::uuid
                and status = 'completed') as completed_attempts,
            (select count(*)::text from public.event_completions
              where id = $3::uuid and player_id = $1::uuid)
              as completions,
            (select count(*)::text from public.coin_ledger_entries
              where player_id = $1::uuid and completion_id = $3::uuid)
              as ledger_entries,
            (select count(*)::text from public.event_completion_card_rewards
              where completion_id = $3::uuid) as card_reward_outcomes,
            (select count(*)::text from public.cpu_matches
              where id = $4::uuid and player_id = $1::uuid
                and status = 'completed') as completed_matches,
            (select count(*)::text from public.cpu_match_cards
              where match_id = $4::uuid) as completed_match_cards,
            (select count(*)::text from public.cpu_match_rounds
              where match_id = $4::uuid) as completed_match_rounds,
            (select count(*)::text from public.cpu_match_actions
              where match_id = $4::uuid) as completed_match_actions,
            (select count(*)::text from public.author_content_audit
              where actor_player_id = $1::uuid) as author_audits,
            (select count(*)::text from public.events
              where id in ($5::uuid, $6::uuid)) as retained_events,
            (select count(*)::text from public.event_challenges
              where id in ($7::uuid, $8::uuid)) as retained_challenges
        `,
        [
          PLAYER_ID,
          COMPLETED_ATTEMPT_ID,
          COMPLETION_ID,
          COMPLETED_MATCH_ID,
          COMPLETED_EVENT_ID,
          ACTIVE_EVENT_ID,
          COMPLETED_CHALLENGE_ID,
          ACTIVE_CHALLENGE_ID,
        ],
      );

      expect(retainedData.rows[0]).toEqual({
        completed_attempts: '1',
        completions: '1',
        ledger_entries: '1',
        card_reward_outcomes: '1',
        completed_matches: '1',
        completed_match_cards: '1',
        completed_match_rounds: '1',
        completed_match_actions: '1',
        author_audits: '1',
        retained_events: '2',
        retained_challenges: '2',
      });

      const retainedMatch = await pool.query<{
        player_deck_id: string | null;
      }>(`select player_deck_id from public.cpu_matches where id = $1::uuid`, [
        COMPLETED_MATCH_ID,
      ]);
      expect(retainedMatch.rows[0]?.player_deck_id).toBeNull();

      const rejoined = await createPlayerIdentityService(pool).resolve({
        connectionStrategy: AUTH0_DATABASE_CONNECTION_STRATEGY,
        issuer: identity.issuer,
        subject: identity.subject,
        playerName: 'deleted_author',
      });

      expect(rejoined).toMatchObject({
        playerName: 'deleted_author',
        role: 'player',
        lifecycleStatus: 'active',
      });
      expect(rejoined.id).not.toBe(PLAYER_ID);

      const newProgress = await pool.query<{ count: string }>(
        `
          select (
            (select count(*) from public.player_cards where player_id = $1::uuid)
            + (select count(*) from public.player_decks where player_id = $1::uuid)
            + (select count(*) from public.challenge_attempts where player_id = $1::uuid)
            + (select count(*) from public.cpu_matches where player_id = $1::uuid)
          )::text as count
        `,
        [rejoined.id],
      );
      expect(newProgress.rows[0]?.count).toBe('0');
    }, 45_000);

    it('rolls back partial cleanup and succeeds on retry', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-rollback',
      };
      const definition = await loadStarterDefinitions(pool, 1);
      const cardDefinition = definition[0];

      if (!cardDefinition) {
        throw new Error('Expected a seeded card definition.');
      }

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, player_name, role, lifecycle_status
          ) values ($1, $2, $3, 'rollback_player', 'player', 'active')
        `,
        [ROLLBACK_PLAYER_ID, identity.issuer, identity.subject],
      );
      await pool.query(
        `
          insert into public.player_starter_grants (id, player_id, affinity)
          values ($1, $2, 'wit')
        `,
        [ROLLBACK_GRANT_ID, ROLLBACK_PLAYER_ID],
      );
      await pool.query(
        `
          insert into public.player_cards (
            player_id, card_definition_id, source_starter_grant_id,
            acquisition_kind
          ) values ($1, $2, $3, 'starter')
        `,
        [ROLLBACK_PLAYER_ID, cardDefinition.id, ROLLBACK_GRANT_ID],
      );
      await pool.query(
        `
          insert into public.player_wallets (player_id, coin_balance)
          values ($1, 25)
        `,
        [ROLLBACK_PLAYER_ID],
      );

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T13:00:00.000Z'),
        createId: () => ROLLBACK_DELETION_ID,
      });
      const requested = await lifecycle.request(identity);

      await pool.query(`
        create function private.reject_wallet_cleanup_for_test()
        returns trigger
        language plpgsql
        as $$
        begin
          raise exception 'forced account cleanup failure';
        end;
        $$;

        create trigger reject_wallet_cleanup_for_test
        before delete on public.player_wallets
        for each row execute function private.reject_wallet_cleanup_for_test();
      `);

      try {
        await expect(lifecycle.complete(requested.id)).rejects.toThrow(
          'forced account cleanup failure',
        );

        const rolledBack = await pool.query<{
          cards: string;
          lifecycle_status: string;
          request_status: string;
          wallets: string;
        }>(
          `
            select
              player.lifecycle_status,
              deletion.status as request_status,
              (select count(*)::text from public.player_cards
                where player_id = player.id) as cards,
              (select count(*)::text from public.player_wallets
                where player_id = player.id) as wallets
            from public.players player
            join public.account_deletion_requests deletion
              on deletion.id = player.deletion_request_id
            where player.id = $1::uuid
          `,
          [ROLLBACK_PLAYER_ID],
        );

        expect(rolledBack.rows[0]).toEqual({
          cards: '1',
          lifecycle_status: 'deletion_pending',
          request_status: 'pending',
          wallets: '1',
        });
      } finally {
        await pool.query(`
          drop trigger if exists reject_wallet_cleanup_for_test
            on public.player_wallets;
          drop function if exists private.reject_wallet_cleanup_for_test();
        `);
      }

      await lifecycle.markRetryPending(requested.id, 'local_cleanup_failed');
      await expect(lifecycle.complete(requested.id)).resolves.toMatchObject({
        id: ROLLBACK_DELETION_ID,
        status: 'completed',
      });

      const retried = await pool.query<{
        cards: string;
        lifecycle_status: string;
        wallets: string;
      }>(
        `
          select
            player.lifecycle_status,
            (select count(*)::text from public.player_cards
              where player_id = player.id) as cards,
            (select count(*)::text from public.player_wallets
              where player_id = player.id) as wallets
          from public.players player
          where player.id = $1::uuid
        `,
        [ROLLBACK_PLAYER_ID],
      );

      expect(retried.rows[0]).toEqual({
        cards: '0',
        lifecycle_status: 'deleted',
        wallets: '0',
      });
    }, 30_000);

    it('serializes concurrent completion calls onto one tombstone', async () => {
      const identity = {
        issuer: ISSUER,
        subject: 'auth0|account-deletion-concurrent',
      };

      await pool.query(
        `
          insert into public.players (
            id, auth_issuer, auth_subject, role, lifecycle_status
          ) values ($1, $2, $3, 'player', 'active')
        `,
        [CONCURRENT_PLAYER_ID, identity.issuer, identity.subject],
      );
      await pool.query(
        `
          insert into public.player_wallets (player_id, coin_balance)
          values ($1, 10)
        `,
        [CONCURRENT_PLAYER_ID],
      );

      const lifecycle = createAccountDeletionLifecycle(pool, {
        clock: () => new Date('2026-08-26T14:00:00.000Z'),
        createId: () => CONCURRENT_DELETION_ID,
      });
      const requested = await lifecycle.request(identity);

      const results = await Promise.all([
        lifecycle.complete(requested.id),
        lifecycle.complete(requested.id),
      ]);

      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toMatchObject({
        id: CONCURRENT_DELETION_ID,
        status: 'completed',
      });

      const persisted = await pool.query<{
        audits: string;
        lifecycle_status: string;
        wallets: string;
      }>(
        `
          select
            player.lifecycle_status,
            (select count(*)::text from public.account_deletion_requests
              where id = $2::uuid) as audits,
            (select count(*)::text from public.player_wallets
              where player_id = player.id) as wallets
          from public.players player
          where player.id = $1::uuid
        `,
        [CONCURRENT_PLAYER_ID, CONCURRENT_DELETION_ID],
      );

      expect(persisted.rows[0]).toEqual({
        audits: '1',
        lifecycle_status: 'deleted',
        wallets: '0',
      });
    }, 30_000);

    it('backfills card reward outcomes when upgrading a current schema', async () => {
      const existingDatabaseName = `wits_quest_deletion_upgrade_${Date.now()}_${process.pid}`;
      const migrationDirectory = await mkdtemp(
        join(tmpdir(), 'wits-deletion-migrations-'),
      );
      const existingUrl = new URL(administrationConfig.connectionString);
      existingUrl.pathname = `/${existingDatabaseName}`;
      const existingConfig = {
        ...administrationConfig,
        connectionString: existingUrl.toString(),
      };

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${existingDatabaseName}`);
      });

      try {
        const migrations = await readdir(getMigrationsDirectory());
        await Promise.all(
          migrations
            .filter((name) => name.endsWith('.sql') && name < '0024_')
            .map((name) =>
              copyFile(
                join(getMigrationsDirectory(), name),
                join(migrationDirectory, name),
              ),
            ),
        );

        await runMigrations(existingConfig, migrationDirectory);
        await runSeeds(existingConfig);

        const upgradePlayerId = 'e1000000-0000-4000-8000-000000000001';
        const upgradeEventId = 'e2000000-0000-4000-8000-000000000001';
        const upgradeChallengeId = 'e3000000-0000-4000-8000-000000000001';
        const upgradeAttemptId = 'e4000000-0000-4000-8000-000000000001';
        const upgradeCompletionId = 'e5000000-0000-4000-8000-000000000001';

        await withDatabaseClient(existingConfig, async (client) => {
          await client.query(
            `
              insert into public.players (
                id, auth_issuer, auth_subject, role, lifecycle_status
              ) values ($1, $2, 'auth0|upgrade-player', 'player', 'active')
            `,
            [upgradePlayerId, ISSUER],
          );
          await seedPublishedChallenge(client, {
            challengeId: upgradeChallengeId,
            eventId: upgradeEventId,
            namespace: 'e3100001',
            title: 'Deletion upgrade challenge',
          });
          await seedAttempt(client, {
            attemptId: upgradeAttemptId,
            challengeId: upgradeChallengeId,
            eventId: upgradeEventId,
            namespace: 'e4100001',
            playerId: upgradePlayerId,
            answerCount: 5,
          });
          await completeAttempt(client, {
            attemptId: upgradeAttemptId,
            completionId: upgradeCompletionId,
            includeRetainedCardReward: false,
            playerId: upgradePlayerId,
          });
        });

        await expect(runMigrations(existingConfig)).resolves.toMatchObject({
          applied: expect.arrayContaining([
            '0024_complete_account_deletion_retention.sql',
          ]),
        });

        await withDatabaseClient(existingConfig, async (client) => {
          const retained = await client.query<{
            awarded_at: Date;
            card_definition_id: string;
            reward_position: number;
          }>(
            `
              select reward_position, card_definition_id::text, awarded_at
              from public.event_completion_card_rewards
              where completion_id = $1::uuid
            `,
            [upgradeCompletionId],
          );

          expect(retained.rows).toHaveLength(1);
          expect(retained.rows[0]).toMatchObject({
            reward_position: 1,
            card_definition_id: expect.any(String),
            awarded_at: expect.any(Date),
          });
        });
      } finally {
        await withDatabaseClient(administrationConfig, async (client) => {
          await client.query(
            `drop database if exists ${existingDatabaseName} with (force)`,
          );
        });
        await rm(migrationDirectory, { force: true, recursive: true });
      }
    }, 45_000);
  },
);

async function seedCompletePlayerJourney(
  client: pg.PoolClient,
  authSubject: string,
): Promise<void> {
  await client.query(
    `
      insert into public.players (
        id, auth_issuer, auth_subject, player_name, role, lifecycle_status
      ) values ($1, $2, $3, 'deleted_author', 'author', 'active')
    `,
    [PLAYER_ID, ISSUER, authSubject],
  );

  await seedPublishedChallenge(client, {
    challengeId: COMPLETED_CHALLENGE_ID,
    eventId: COMPLETED_EVENT_ID,
    namespace: 'd3100001',
    title: 'Completed deletion challenge',
  });
  await seedPublishedChallenge(client, {
    challengeId: ACTIVE_CHALLENGE_ID,
    eventId: ACTIVE_EVENT_ID,
    namespace: 'd3100002',
    title: 'Active deletion challenge',
  });

  const definitions = await loadStarterDefinitions(client, 5);

  if (definitions.length !== 5) {
    throw new Error('Expected five seeded starter definitions.');
  }

  await client.query(
    `
      insert into public.player_starter_grants (id, player_id, affinity)
      values ($1, $2, 'wit')
    `,
    [STARTER_GRANT_ID, PLAYER_ID],
  );

  const ownedCardIds: string[] = [];

  for (const [index, definition] of definitions.entries()) {
    const ownedCardId = fixtureUuid('d6100001', index + 1);
    ownedCardIds.push(ownedCardId);
    await client.query(
      `
        insert into public.player_cards (
          id,
          player_id,
          card_definition_id,
          source_starter_grant_id,
          acquisition_kind
        ) values ($1, $2, $3, $4, 'starter')
      `,
      [ownedCardId, PLAYER_ID, definition.id, STARTER_GRANT_ID],
    );
  }

  await client.query(
    `
      insert into public.player_wallets (player_id, coin_balance)
      values ($1, 150)
    `,
    [PLAYER_ID],
  );
  await client.query(
    `
      insert into public.player_decks (id, player_id, name)
      values ($1, $2, 'Deletion retention deck')
    `,
    [DECK_ID, PLAYER_ID],
  );

  for (const [index, ownedCardId] of ownedCardIds.entries()) {
    await client.query(
      `
        insert into public.player_deck_cards (
          deck_id, player_id, owned_card_id, position
        ) values ($1, $2, $3, $4)
      `,
      [DECK_ID, PLAYER_ID, ownedCardId, index + 1],
    );
  }

  await client.query(
    `
      insert into public.player_deck_selections (player_id, deck_id)
      values ($1, $2)
    `,
    [PLAYER_ID, DECK_ID],
  );

  await seedAttempt(client, {
    attemptId: COMPLETED_ATTEMPT_ID,
    challengeId: COMPLETED_CHALLENGE_ID,
    eventId: COMPLETED_EVENT_ID,
    namespace: 'd4100001',
    playerId: PLAYER_ID,
    answerCount: 5,
  });
  await completeAttempt(client, {
    attemptId: COMPLETED_ATTEMPT_ID,
    completionId: COMPLETION_ID,
    includeRetainedCardReward: true,
    playerId: PLAYER_ID,
  });

  await seedAttempt(client, {
    attemptId: ACTIVE_ATTEMPT_ID,
    challengeId: ACTIVE_CHALLENGE_ID,
    eventId: ACTIVE_EVENT_ID,
    namespace: 'd4100002',
    playerId: PLAYER_ID,
    answerCount: 1,
  });

  await seedMatches(client, ownedCardIds[0]!, definitions[0]!.id);

  await client.query(
    `
      insert into public.author_content_audit (
        id, actor_player_id, entity_type, entity_id, action, occurred_at
      ) values (
        $1, $2, 'event', $3, 'publish', '2026-08-26T10:00:00.000Z'
      )
    `,
    ['d9000000-0000-4000-8000-000000000001', PLAYER_ID, COMPLETED_EVENT_ID],
  );
}

async function seedPublishedChallenge(
  client: pg.PoolClient,
  input: {
    challengeId: string;
    eventId: string;
    namespace: string;
    title: string;
  },
): Promise<void> {
  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.events (
          id, title, location, radius_metres, starts_at, ends_at, is_published
        ) values (
          $1,
          $2,
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75,
          '2026-08-01T00:00:00.000Z',
          '2026-09-01T00:00:00.000Z',
          true
        )
      `,
      [input.eventId, input.title],
    );
    await client.query(
      `
        insert into public.event_challenges (id, event_id, format, status)
        values ($1, $2, 'multiple_choice', 'draft')
      `,
      [input.challengeId, input.eventId],
    );

    for (let questionNumber = 1; questionNumber <= 5; questionNumber += 1) {
      const questionId = fixtureUuid(input.namespace, questionNumber);

      await client.query(
        `
          insert into public.challenge_questions (
            id, challenge_id, prompt, difficulty, explanation, status
          ) values ($1, $2, $3, 2, $4, 'draft')
        `,
        [
          questionId,
          input.challengeId,
          `${input.title} question ${questionNumber}`,
          `${input.title} explanation ${questionNumber}`,
        ],
      );

      for (let choiceNumber = 1; choiceNumber <= 4; choiceNumber += 1) {
        await client.query(
          `
            insert into public.challenge_choices (
              id, question_id, authoring_position, choice_text
            ) values ($1, $2, $3, $4)
          `,
          [
            fixtureUuid(
              incrementNamespace(input.namespace),
              questionNumber * 10 + choiceNumber,
            ),
            questionId,
            choiceNumber,
            `${input.title} choice ${questionNumber}.${choiceNumber}`,
          ],
        );
      }

      await client.query(
        `
          insert into private.challenge_answer_keys (
            question_id, accepted_choice_id
          ) values ($1, $2)
        `,
        [
          questionId,
          fixtureUuid(
            incrementNamespace(input.namespace),
            questionNumber * 10 + 1,
          ),
        ],
      );
    }

    await client.query(
      `
        update public.challenge_questions
           set status = 'published', updated_at = now()
         where challenge_id = $1
      `,
      [input.challengeId],
    );
    await client.query(
      `
        update public.event_challenges
           set status = 'published', updated_at = now()
         where id = $1
      `,
      [input.challengeId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedAttempt(
  client: pg.PoolClient,
  input: {
    attemptId: string;
    challengeId: string;
    eventId: string;
    namespace: string;
    playerId: string;
    answerCount: number;
  },
): Promise<void> {
  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.challenge_attempts (
          id,
          player_id,
          event_id,
          challenge_id,
          started_at,
          deadline,
          time_limit_seconds,
          average_difficulty,
          created_at,
          updated_at
        ) values (
          $1, $2, $3, $4,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:02:00.000Z',
          120,
          2.00,
          '2026-08-26T10:00:00.000Z',
          '2026-08-26T10:00:00.000Z'
        )
      `,
      [input.attemptId, input.playerId, input.eventId, input.challengeId],
    );

    const questions = await client.query<{
      difficulty: number;
      id: string;
      prompt: string;
    }>(
      `
        select id::text, prompt, difficulty
        from public.challenge_questions
        where challenge_id = $1::uuid
        order by id
      `,
      [input.challengeId],
    );

    for (const [questionIndex, question] of questions.rows.entries()) {
      const attemptQuestionId = fixtureUuid(input.namespace, questionIndex + 1);
      await client.query(
        `
          insert into public.attempt_questions (
            id,
            attempt_id,
            source_question_id,
            position,
            prompt_snapshot,
            difficulty_snapshot
          ) values ($1, $2, $3, $4, $5, $6)
        `,
        [
          attemptQuestionId,
          input.attemptId,
          question.id,
          questionIndex + 1,
          question.prompt,
          question.difficulty,
        ],
      );

      const choices = await client.query<{
        choice_text: string;
        id: string;
      }>(
        `
          select id::text, choice_text
          from public.challenge_choices
          where question_id = $1::uuid
          order by authoring_position
        `,
        [question.id],
      );

      let selectedChoiceId: string | null = null;

      for (const [choiceIndex, choice] of choices.rows.entries()) {
        const attemptChoiceId = fixtureUuid(
          incrementNamespace(input.namespace),
          (questionIndex + 1) * 10 + choiceIndex + 1,
        );
        selectedChoiceId ??= attemptChoiceId;

        await client.query(
          `
            insert into public.attempt_question_choices (
              id,
              attempt_question_id,
              source_question_id,
              source_choice_id,
              display_position,
              choice_text_snapshot
            ) values ($1, $2, $3, $4, $5, $6)
          `,
          [
            attemptChoiceId,
            attemptQuestionId,
            question.id,
            choice.id,
            choiceIndex + 1,
            choice.choice_text,
          ],
        );
      }

      if (questionIndex < input.answerCount && selectedChoiceId) {
        await client.query(
          `
            insert into public.attempt_answers (
              attempt_question_id, selected_choice_id, answered_at
            ) values ($1, $2, '2026-08-26T10:01:00.000Z')
          `,
          [attemptQuestionId, selectedChoiceId],
        );
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function completeAttempt(
  client: pg.PoolClient,
  input: {
    attemptId: string;
    completionId: string;
    includeRetainedCardReward: boolean;
    playerId: string;
  },
): Promise<void> {
  const rewardCard = await client.query<{ id: string }>(
    `
      select id::text
      from public.card_definitions
      where rarity = 'rare'
        and is_active = true
      order by id
      limit 1
    `,
  );
  const cardDefinitionId = rewardCard.rows[0]?.id;

  if (!cardDefinitionId) {
    throw new Error('Expected a seeded reward card definition.');
  }

  await client.query('begin');

  try {
    await client.query(
      `
        insert into public.event_completions (
          id,
          attempt_id,
          player_id,
          event_id,
          score_correct,
          average_difficulty,
          coins_awarded,
          reward_policy_version,
          completed_at
        )
        select
          $1,
          attempt.id,
          attempt.player_id,
          attempt.event_id,
          5,
          attempt.average_difficulty,
          50,
          'basic-v1',
          '2026-08-26T10:01:30.000Z'
        from public.challenge_attempts attempt
        where attempt.id = $2::uuid
          and attempt.player_id = $3::uuid
      `,
      [input.completionId, input.attemptId, input.playerId],
    );
    await client.query(
      `
        insert into public.coin_ledger_entries (
          player_id, amount, reason, completion_id, created_at
        ) values (
          $1, 50, 'event_reward', $2, '2026-08-26T10:01:30.000Z'
        )
      `,
      [input.playerId, input.completionId],
    );
    await client.query(
      `
        insert into public.player_cards (
          player_id,
          card_definition_id,
          source_completion_id,
          acquisition_kind,
          acquired_at
        ) values (
          $1, $2, $3, 'event_reward', '2026-08-26T10:01:30.000Z'
        )
      `,
      [input.playerId, cardDefinitionId, input.completionId],
    );
    await client.query(
      `
        update public.challenge_attempts
           set status = 'completed',
               completed_at = '2026-08-26T10:01:30.000Z',
               completion_reason = 'answered',
               score_correct = 5,
               updated_at = '2026-08-26T10:01:30.000Z'
         where id = $1::uuid
      `,
      [input.attemptId],
    );

    if (input.includeRetainedCardReward) {
      await client.query(
        `
          insert into public.event_completion_card_rewards (
            completion_id,
            reward_position,
            card_definition_id,
            awarded_at
          ) values ($1, 1, $2, '2026-08-26T10:01:30.000Z')
        `,
        [input.completionId, cardDefinitionId],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function seedMatches(
  client: pg.PoolClient,
  ownedCardId: string,
  cardDefinitionId: string,
): Promise<void> {
  const activeRoundId = 'd8100000-0000-4000-8000-000000000001';
  const completedRoundId = 'd8100000-0000-4000-8000-000000000002';

  await client.query(
    `
      insert into public.cpu_matches (
        id, player_id, player_deck_id, status, state,
        started_at, created_at, updated_at
      ) values (
        $1, $2, $3, 'active', '{}'::jsonb,
        '2026-08-26T10:03:00.000Z',
        '2026-08-26T10:03:00.000Z',
        '2026-08-26T10:03:00.000Z'
      )
    `,
    [ACTIVE_MATCH_ID, PLAYER_ID, DECK_ID],
  );
  await client.query(
    `
      insert into public.cpu_matches (
        id, player_id, player_deck_id, status, state, winner,
        started_at, completed_at, created_at, updated_at
      ) values (
        $1, $2, $3, 'completed', '{}'::jsonb, 'player',
        '2026-08-26T09:00:00.000Z',
        '2026-08-26T09:10:00.000Z',
        '2026-08-26T09:00:00.000Z',
        '2026-08-26T09:10:00.000Z'
      )
    `,
    [COMPLETED_MATCH_ID, PLAYER_ID, DECK_ID],
  );

  for (const matchId of [ACTIVE_MATCH_ID, COMPLETED_MATCH_ID]) {
    await client.query(
      `
        insert into public.cpu_match_cards (
          id, match_id, side, position, owned_card_id,
          card_definition_id, snapshot
        ) values (
          gen_random_uuid(), $1, 'player', 1, $2, $3, '{}'::jsonb
        )
      `,
      [matchId, ownedCardId, cardDefinitionId],
    );
  }

  await client.query(
    `
      insert into public.cpu_match_rounds (
        id, match_id, round_number, state_before, state_after, result
      ) values
        ($1, $3, 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
        ($2, $4, 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    `,
    [activeRoundId, completedRoundId, ACTIVE_MATCH_ID, COMPLETED_MATCH_ID],
  );
  await client.query(
    `
      insert into public.cpu_match_actions (
        id, match_id, round_id, sequence, side, submission_id,
        action, result, response
      ) values
        (gen_random_uuid(), $3, $1, 1, 'player', gen_random_uuid(),
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
        (gen_random_uuid(), $4, $2, 1, 'player', gen_random_uuid(),
         '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
    `,
    [activeRoundId, completedRoundId, ACTIVE_MATCH_ID, COMPLETED_MATCH_ID],
  );
}

async function loadStarterDefinitions(
  database: Pick<pg.Pool, 'query'> | pg.PoolClient,
  limit: number,
): Promise<Array<{ id: string }>> {
  const result = await database.query<{ id: string }>(
    `
      select id::text
      from public.card_definitions
      where affinity = 'wit'
        and rarity = 'common'
        and is_active = true
      order by category, id
      limit $1
    `,
    [limit],
  );

  return result.rows;
}

function fixtureUuid(namespace: string, value: number): string {
  return `${namespace}-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function incrementNamespace(namespace: string): string {
  return (Number.parseInt(namespace, 16) + 1).toString(16).padStart(8, '0');
}
