import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
import { createProgressionPersistence } from '../src/progression/progression-persistence.js';

const MIGRATION_NAME = '0028_create_asynchronous_pvp_persistence.sql';
const PRE_MIGRATION_PLAYER_ID = '17900000-0000-4000-8000-000000000001';
const PRE_MIGRATION_MATCH_ID = '17900000-0000-4000-8000-000000000002';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface CardDefinitionFixture extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  rarity: 'common';
}

interface PendingInvitationFixture {
  invitationId: string;
  challengerPlayerId: string;
  recipientPlayerId: string;
  challengerSnapshotId: string;
  createSubmissionId: string;
}

interface AcceptedMatchFixture extends PendingInvitationFixture {
  matchId: string;
  recipientSnapshotId: string;
}

describe.skipIf(!runIntegrationTests)(
  'asynchronous PvP persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let preMigrationDirectory: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let cardDefinitions: CardDefinitionFixture[];

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_async_pvp_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      preMigrationDirectory = await copyPrePvpMigrations();
      await runMigrations(temporaryConfig, preMigrationDirectory);
      const preMigrationPool = createDatabasePool(temporaryConfig);

      try {
        await seedRetainedCpuProgression(preMigrationPool);
      } finally {
        await preMigrationPool.end();
      }

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toEqual([MIGRATION_NAME]);

      pool = createDatabasePool(temporaryConfig);
      const retainedAward = await pool.query<{
        cpu_match_id: string;
        points_awarded: number;
      }>(
        `select cpu_match_id::text, points_awarded
           from public.player_point_awards
          where cpu_match_id = $1::uuid`,
        [PRE_MIGRATION_MATCH_ID],
      );
      expect(retainedAward.rows).toEqual([
        {
          cpu_match_id: PRE_MIGRATION_MATCH_ID,
          points_awarded: 25,
        },
      ]);

      await runSeeds(temporaryConfig);
      const definitions = await pool.query<CardDefinitionFixture>(
        `select id::text, category, affinity, rarity
           from public.card_definitions
          where is_active = true
            and rarity = 'common'
          order by category, affinity, name, id`,
      );
      cardDefinitions = [
        ...definitions.rows
          .filter((definition) => definition.category === 'creature')
          .slice(0, 3),
        ...definitions.rows
          .filter((definition) => definition.category === 'power')
          .slice(0, 2),
      ];

      expect(cardDefinitions).toHaveLength(5);
    }, 90_000);

    afterAll(async () => {
      if (pool) {
        await pool.end();
      }

      if (preMigrationDirectory) {
        await rm(preMigrationDirectory, { force: true, recursive: true });
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

    it('keeps private state separate and creates the required access indexes', async () => {
      const privateTables = await pool.query<{ table_name: string }>(
        `select table_name
           from information_schema.tables
          where table_schema = 'private'
            and table_name like 'async_pvp_%'
          order by table_name`,
      );
      expect(privateTables.rows.map((row) => row.table_name)).toEqual([
        'async_pvp_deck_snapshot_cards',
        'async_pvp_deck_snapshots',
        'async_pvp_match_states',
        'async_pvp_match_transitions',
        'async_pvp_submission_receipts',
      ]);

      const publicColumns = await pool.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name in ('async_pvp_invitations', 'async_pvp_matches')`,
      );
      expect(publicColumns.rows.map((row) => row.column_name)).not.toEqual(
        expect.arrayContaining([
          'battle_state',
          'card_snapshot',
          'committed_response',
          'state_before',
          'state_after',
        ]),
      );

      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
           from pg_indexes
          where schemaname in ('public', 'private')
            and tablename like 'async_pvp_%'`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'async_pvp_invitations_pending_pair_unique_idx',
          'async_pvp_invitations_overdue_idx',
          'async_pvp_invitations_recipient_list_idx',
          'async_pvp_match_participants_player_idx',
          'async_pvp_matches_active_idx',
          'async_pvp_matches_history_idx',
          'async_pvp_matches_overdue_idx',
          'async_pvp_match_actions_history_idx',
          'async_pvp_submission_receipts_actor_operation_unique',
        ]),
      );
    });

    it('enforces one pending invitation per unordered pair and one logical submission', async () => {
      const challengerPlayerId = await insertPlayer(pool, 'pair_challenger');
      const recipientPlayerId = await insertPlayer(pool, 'pair_recipient');
      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId,
        recipientPlayerId,
      });

      await expect(
        pool.query(
          `insert into public.async_pvp_invitations (
             challenger_player_id,
             recipient_player_id
           ) values ($1::uuid, $2::uuid)`,
          [recipientPlayerId, challengerPlayerId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_invitations_pending_pair_unique_idx',
      });

      await expect(
        pool.query(
          `insert into private.async_pvp_submission_receipts (
             actor_player_id,
             operation,
             submission_id,
             invitation_id,
             payload_hash,
             committed_response
           ) values ($1::uuid, 'invitation_create', $2::uuid, $3::uuid, $4, '{}')`,
          [
            challengerPlayerId,
            invitation.createSubmissionId,
            invitation.invitationId,
            'b'.repeat(64),
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_submission_receipts_actor_operation_unique',
      });

      await expect(
        pool.query(
          `insert into private.async_pvp_submission_receipts (
             actor_player_id,
             operation,
             submission_id,
             invitation_id,
             payload_hash,
             committed_response
           ) values ($1::uuid, 'invitation_create', $2::uuid, $3::uuid, $4, '{}')`,
          [
            challengerPlayerId,
            randomUUID(),
            invitation.invitationId,
            'c'.repeat(64),
          ],
        ),
      ).rejects.toThrow('duplicate operation receipts');

      await expect(
        pool.query(
          `update public.async_pvp_invitations
              set expires_at = expires_at + interval '1 hour'
            where id = $1::uuid`,
          [invitation.invitationId],
        ),
      ).rejects.toThrow('identity is immutable');
    });

    it('persists complete snapshots, accepted state, actions, and replay receipts', async () => {
      const match = await createAcceptedMatch(pool, cardDefinitions);
      const action = await appendAction(pool, match);

      const stored = await pool.query<{
        version: number;
        current_player_id: string;
        action_count: string;
        transition_count: string;
        receipt_count: string;
      }>(
        `select
           match.version,
           match.current_player_id::text,
           count(distinct action.id)::text as action_count,
           count(distinct transition.action_id)::text as transition_count,
           count(distinct receipt.id)::text as receipt_count
         from public.async_pvp_matches match
         join public.async_pvp_match_actions action
           on action.match_id = match.id
         join private.async_pvp_match_transitions transition
           on transition.action_id = action.id
         join private.async_pvp_submission_receipts receipt
           on receipt.match_id = match.id
          and receipt.submission_id = action.submission_id
        where match.id = $1::uuid
        group by match.id`,
        [match.matchId],
      );
      expect(stored.rows).toEqual([
        {
          version: 1,
          current_player_id: match.recipientPlayerId,
          action_count: '1',
          transition_count: '1',
          receipt_count: '1',
        },
      ]);

      await expect(
        pool.query(
          `update private.async_pvp_deck_snapshot_cards
              set card_snapshot = '{"tampered":true}'::jsonb
            where snapshot_id = $1::uuid`,
          [match.challengerSnapshotId],
        ),
      ).rejects.toThrow('deck snapshots are immutable');
      await expect(
        pool.query(
          `update public.async_pvp_match_actions
              set public_result = '{"tampered":true}'::jsonb
            where id = $1::uuid`,
          [action.actionId],
        ),
      ).rejects.toThrow('action history is immutable');
      await expect(
        pool.query(
          `insert into public.async_pvp_match_actions (
             match_id,
             sequence,
             actor_player_id,
             submission_id,
             expected_version,
             action,
             public_result
           ) values ($1::uuid, 2, $2::uuid, $3::uuid, 1, '{}', '{}')`,
          [match.matchId, match.challengerPlayerId, action.submissionId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_match_actions_submission_unique',
      });
    });

    it('rejects incomplete snapshots, invalid deadlines, and wrong receipt actors', async () => {
      const challengerPlayerId = await insertPlayer(pool, 'invalid_challenger');
      const recipientPlayerId = await insertPlayer(pool, 'invalid_recipient');
      const client = await pool.connect();

      try {
        await client.query('begin');
        const invitationId = randomUUID();
        await client.query(
          `insert into public.async_pvp_invitations (
             id,
             challenger_player_id,
             recipient_player_id
           ) values ($1::uuid, $2::uuid, $3::uuid)`,
          [invitationId, challengerPlayerId, recipientPlayerId],
        );
        await insertDeckSnapshot(client, cardDefinitions.slice(0, 4), {
          invitationId,
          playerId: challengerPlayerId,
          participantRole: 'challenger',
        });
        await insertReceipt(client, {
          actorPlayerId: challengerPlayerId,
          operation: 'invitation_create',
          submissionId: randomUUID(),
          invitationId,
        });
        await expect(client.query('commit')).rejects.toThrow(
          'violates Basic deck rules',
        );
        await client.query('rollback');
      } finally {
        client.release();
      }

      const invitation = await createPendingInvitation(pool, cardDefinitions, {
        challengerPlayerId,
        recipientPlayerId,
      });
      const wrongActorClient = await pool.connect();

      try {
        await wrongActorClient.query('begin');
        await wrongActorClient.query(
          `update public.async_pvp_invitations
              set status = 'declined',
                  version = 1,
                  responded_at = now(),
                  updated_at = now()
            where id = $1::uuid`,
          [invitation.invitationId],
        );
        await insertReceipt(wrongActorClient, {
          actorPlayerId: challengerPlayerId,
          operation: 'invitation_decline',
          submissionId: randomUUID(),
          invitationId: invitation.invitationId,
        });
        await expect(wrongActorClient.query('commit')).rejects.toThrow(
          'has the wrong actor',
        );
        await wrongActorClient.query('rollback');
      } finally {
        wrongActorClient.release();
      }

      await expect(
        pool.query(
          `insert into public.async_pvp_matches (
             invitation_id,
             current_player_id,
             decision_started_at,
             turn_deadline
           ) values (
             $1::uuid,
             $2::uuid,
             now(),
             now() + interval '23 hours'
           )`,
          [invitation.invitationId, challengerPlayerId],
        ),
      ).rejects.toMatchObject({
        constraint: 'async_pvp_matches_deadline_check',
      });
    });

    it.each([
      ['defeat', 'async_pvp_defeat_win', 'async_pvp_defeat_loss'],
      [
        'turn_forfeit',
        'async_pvp_turn_forfeit_win',
        'async_pvp_turn_forfeit_loss',
      ],
      [
        'account_deletion_forfeit',
        'async_pvp_account_deletion_forfeit_win',
        'async_pvp_account_deletion_forfeit_loss',
      ],
    ] as const)(
      'records % progression as 25/0 exactly once for both participants',
      async (completionReason, winningRule, losingRule) => {
        const match = await createAcceptedMatch(pool, cardDefinitions);
        await completeMatch(pool, match, completionReason);
        const progression = createProgressionPersistence();

        const [first, replay] = await Promise.all([
          progression.recordAsynchronousPvpCompletion(pool, match.matchId),
          progression.recordAsynchronousPvpCompletion(pool, match.matchId),
        ]);
        const allResults = [...first, ...replay];
        expect(first.map((award) => award.ruleCode)).toEqual(
          expect.arrayContaining([winningRule, losingRule]),
        );
        expect(first.map((award) => award.pointsAwarded).sort()).toEqual([
          0, 25,
        ]);
        expect(allResults.filter((award) => award.wasCreated)).toHaveLength(2);

        const persisted = await pool.query<{
          player_id: string;
          points_awarded: number;
          activity_count: number;
        }>(
          `select
             award.player_id::text,
             award.points_awarded,
             activity.completed_activity_count as activity_count
           from public.player_point_awards award
           join public.player_activity_days activity
             on activity.player_id = award.player_id
            and activity.activity_day = award.activity_day
          where award.async_pvp_match_id = $1::uuid
          order by award.player_id`,
          [match.matchId],
        );
        expect(persisted.rows).toHaveLength(2);
        expect(persisted.rows.map((row) => row.activity_count)).toEqual([1, 1]);

        await expect(
          pool.query(
            `update public.player_point_awards
                set points_awarded = 99
              where async_pvp_match_id = $1::uuid`,
            [match.matchId],
          ),
        ).rejects.toThrow('immutable');
        await expect(
          pool.query(
            `update public.async_pvp_matches
                set updated_at = now()
              where id = $1::uuid`,
            [match.matchId],
          ),
        ).rejects.toThrow('Completed asynchronous PvP match');

        if (completionReason === 'turn_forfeit') {
          await expectLateTerminalAction(pool, match);
        }
      },
    );

    it('uses bounded overdue indexes for invitation and match deadline work', async () => {
      const client = await pool.connect();

      try {
        await client.query('set enable_seqscan = off');
        const invitations = await client.query<{ 'QUERY PLAN': string }>(
          `explain
           select id
             from public.async_pvp_invitations
            where status = 'pending'
              and expires_at <= now()
            order by expires_at, id
            limit 25`,
        );
        const matches = await client.query<{ 'QUERY PLAN': string }>(
          `explain
           select id
             from public.async_pvp_matches
            where status = 'active'
              and turn_deadline <= now()
            order by turn_deadline, id
            limit 25`,
        );

        expect(
          invitations.rows.map((row) => row['QUERY PLAN']).join('\n'),
        ).toContain('async_pvp_invitations_overdue_idx');
        expect(
          matches.rows.map((row) => row['QUERY PLAN']).join('\n'),
        ).toContain('async_pvp_matches_overdue_idx');
      } finally {
        client.release();
      }
    });
  },
);

async function copyPrePvpMigrations(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(join(tmpdir(), 'wits-pvp-migrations-'));
  const migrationNames = await readdir(sourceDirectory);

  await Promise.all(
    migrationNames
      .filter((name) => name.endsWith('.sql') && name !== MIGRATION_NAME)
      .map((name) =>
        copyFile(join(sourceDirectory, name), join(targetDirectory, name)),
      ),
  );

  return targetDirectory;
}

async function seedRetainedCpuProgression(
  database: Pick<pg.Pool, 'query'>,
): Promise<void> {
  await database.query(
    `insert into public.players (
       id,
       auth_issuer,
       auth_subject,
       player_name,
       role
     ) values (
       $1::uuid,
       'https://issuer.example/',
       'auth0|pre-pvp-player',
       'pre_pvp_player',
       'player'
     )`,
    [PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `insert into public.cpu_matches (
       id,
       player_id,
       status,
       state,
       version,
       winner,
       started_at,
       completed_at,
       created_at,
       updated_at
     ) values (
       $1::uuid,
       $2::uuid,
       'completed',
       '{}',
       1,
       'player',
       '2026-08-20T10:00:00.000Z',
       '2026-08-20T10:10:00.000Z',
       '2026-08-20T10:00:00.000Z',
       '2026-08-20T10:10:00.000Z'
     )`,
    [PRE_MIGRATION_MATCH_ID, PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `select *
       from private.record_cpu_match_progression($1::uuid)`,
    [PRE_MIGRATION_MATCH_ID],
  );
}

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  namePrefix: string,
): Promise<string> {
  const playerId = randomUUID();
  const suffix = playerId.replaceAll('-', '').slice(0, 8);
  const playerName = `pvp_${suffix}`;

  await database.query(
    `insert into public.players (
       id,
       auth_issuer,
       auth_subject,
       player_name,
       role
     ) values ($1::uuid, 'https://issuer.example/', $2, $3, 'player')`,
    [playerId, `auth0|${namePrefix}_${suffix}`, playerName],
  );

  return playerId;
}

async function createPendingInvitation(
  database: pg.Pool,
  definitions: readonly CardDefinitionFixture[],
  players?: {
    challengerPlayerId: string;
    recipientPlayerId: string;
  },
): Promise<PendingInvitationFixture> {
  const challengerPlayerId =
    players?.challengerPlayerId ??
    (await insertPlayer(database, 'pvp_challenger'));
  const recipientPlayerId =
    players?.recipientPlayerId ??
    (await insertPlayer(database, 'pvp_recipient'));
  const invitationId = randomUUID();
  const createSubmissionId = randomUUID();
  const client = await database.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_invitations (
         id,
         challenger_player_id,
         recipient_player_id
       ) values ($1::uuid, $2::uuid, $3::uuid)`,
      [invitationId, challengerPlayerId, recipientPlayerId],
    );
    const challengerSnapshotId = await insertDeckSnapshot(client, definitions, {
      invitationId,
      playerId: challengerPlayerId,
      participantRole: 'challenger',
    });
    await insertReceipt(client, {
      actorPlayerId: challengerPlayerId,
      operation: 'invitation_create',
      submissionId: createSubmissionId,
      invitationId,
    });
    await client.query('commit');

    return {
      invitationId,
      challengerPlayerId,
      recipientPlayerId,
      challengerSnapshotId,
      createSubmissionId,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createAcceptedMatch(
  database: pg.Pool,
  definitions: readonly CardDefinitionFixture[],
): Promise<AcceptedMatchFixture> {
  const invitation = await createPendingInvitation(database, definitions);
  const matchId = randomUUID();
  const client = await database.connect();

  try {
    await client.query('begin');
    const recipientSnapshotId = await insertDeckSnapshot(client, definitions, {
      invitationId: invitation.invitationId,
      playerId: invitation.recipientPlayerId,
      participantRole: 'recipient',
    });
    await client.query(
      `insert into public.async_pvp_matches (
         id,
         invitation_id,
         current_player_id,
         decision_started_at,
         turn_deadline,
         started_at,
         created_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         '2026-08-29T10:00:00.000Z',
         '2026-08-30T10:00:00.000Z',
         '2026-08-29T10:00:00.000Z',
         '2026-08-29T10:00:00.000Z',
         '2026-08-29T10:00:00.000Z'
       )`,
      [matchId, invitation.invitationId, invitation.challengerPlayerId],
    );
    await client.query(
      `insert into public.async_pvp_match_participants (
         match_id,
         player_id,
         engine_side,
         deck_snapshot_id
       ) values
         ($1::uuid, $2::uuid, 'player', $3::uuid),
         ($1::uuid, $4::uuid, 'cpu', $5::uuid)`,
      [
        matchId,
        invitation.challengerPlayerId,
        invitation.challengerSnapshotId,
        invitation.recipientPlayerId,
        recipientSnapshotId,
      ],
    );
    await client.query(
      `insert into private.async_pvp_match_states (
         match_id,
         version,
         battle_state,
         updated_at
       ) values (
         $1::uuid,
         0,
         '{"phase":"active","turnNumber":1}',
         '2026-08-29T10:00:00.000Z'
       )`,
      [matchId],
    );
    await client.query(
      `update public.async_pvp_invitations
          set status = 'accepted',
              version = 1,
              match_id = $2::uuid,
              responded_at = '2026-08-29T10:00:00.000Z',
              updated_at = '2026-08-29T10:00:00.000Z'
        where id = $1::uuid`,
      [invitation.invitationId, matchId],
    );
    await insertReceipt(client, {
      actorPlayerId: invitation.recipientPlayerId,
      operation: 'invitation_accept',
      submissionId: randomUUID(),
      invitationId: invitation.invitationId,
    });
    await client.query('commit');

    return {
      ...invitation,
      matchId,
      recipientSnapshotId,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function insertDeckSnapshot(
  client: Pick<pg.PoolClient, 'query'>,
  definitions: readonly CardDefinitionFixture[],
  input: {
    invitationId: string;
    playerId: string;
    participantRole: 'challenger' | 'recipient';
  },
): Promise<string> {
  const snapshotId = randomUUID();
  const snapshotCardIds = definitions.map(() => randomUUID());

  await client.query(
    `insert into private.async_pvp_deck_snapshots (
       id,
       invitation_id,
       player_id,
       participant_role,
       source_deck_id,
       initial_creature_card_id
     ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid)`,
    [
      snapshotId,
      input.invitationId,
      input.playerId,
      input.participantRole,
      randomUUID(),
      snapshotCardIds[0],
    ],
  );

  for (const [index, definition] of definitions.entries()) {
    const battleCardId = randomUUID();
    await client.query(
      `insert into private.async_pvp_deck_snapshot_cards (
         id,
         snapshot_id,
         position,
         battle_card_id,
         source_owned_card_id,
         source_card_definition_id,
         category,
         affinity,
         rarity,
         card_snapshot
       ) values (
         $1::uuid,
         $2::uuid,
         $3,
         $4::uuid,
         $5::uuid,
         $6::uuid,
         $7,
         $8,
         $9,
         $10::jsonb
       )`,
      [
        snapshotCardIds[index],
        snapshotId,
        index + 1,
        battleCardId,
        randomUUID(),
        definition.id,
        definition.category,
        definition.affinity,
        definition.rarity,
        JSON.stringify({
          id: battleCardId,
          name: `Snapshot card ${index + 1}`,
          category: definition.category,
          affinity: definition.affinity,
          rarity: definition.rarity,
        }),
      ],
    );
  }

  return snapshotId;
}

async function insertReceipt(
  client: Pick<pg.PoolClient, 'query'>,
  input: {
    actorPlayerId: string;
    operation:
      | 'invitation_create'
      | 'invitation_accept'
      | 'invitation_decline'
      | 'match_action';
    submissionId: string;
    invitationId?: string;
    matchId?: string;
  },
): Promise<void> {
  await client.query(
    `insert into private.async_pvp_submission_receipts (
       actor_player_id,
       operation,
       submission_id,
       invitation_id,
       match_id,
       payload_hash,
       committed_response
     ) values (
       $1::uuid,
       $2,
       $3::uuid,
       $4::uuid,
       $5::uuid,
       $6,
       $7::jsonb
     )`,
    [
      input.actorPlayerId,
      input.operation,
      input.submissionId,
      input.invitationId ?? null,
      input.matchId ?? null,
      'a'.repeat(64),
      JSON.stringify({ persisted: true }),
    ],
  );
}

async function appendAction(
  database: pg.Pool,
  match: AcceptedMatchFixture,
): Promise<{ actionId: string; submissionId: string }> {
  const client = await database.connect();
  const actionId = randomUUID();
  const submissionId = randomUUID();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_match_actions (
         id,
         match_id,
         sequence,
         actor_player_id,
         submission_id,
         expected_version,
         action,
         public_result,
         created_at
       ) values (
         $1::uuid,
         $2::uuid,
         1,
         $3::uuid,
         $4::uuid,
         0,
         '{"type":"use_move","moveId":"10000000-0000-4000-8000-000000000001"}',
         '{"type":"move_resolved"}',
         '2026-08-29T11:00:00.000Z'
       )`,
      [actionId, match.matchId, match.challengerPlayerId, submissionId],
    );
    await client.query(
      `insert into private.async_pvp_match_transitions (
         action_id,
         match_id,
         state_before,
         state_after,
         authoritative_result,
         created_at
       ) values (
         $1::uuid,
         $2::uuid,
         '{"phase":"active","turnNumber":1}',
         '{"phase":"active","turnNumber":2}',
         '{"type":"move_resolved"}',
         '2026-08-29T11:00:00.000Z'
       )`,
      [actionId, match.matchId],
    );
    await insertReceipt(client, {
      actorPlayerId: match.challengerPlayerId,
      operation: 'match_action',
      submissionId,
      matchId: match.matchId,
    });
    await client.query(
      `update private.async_pvp_match_states
          set version = 1,
              battle_state = '{"phase":"active","turnNumber":2}',
              updated_at = '2026-08-29T11:00:00.000Z'
        where match_id = $1::uuid`,
      [match.matchId],
    );
    await client.query(
      `update public.async_pvp_matches
          set version = 1,
              current_player_id = $2::uuid,
              decision_started_at = '2026-08-29T11:00:00.000Z',
              turn_deadline = '2026-08-30T11:00:00.000Z',
              updated_at = '2026-08-29T11:00:00.000Z'
        where id = $1::uuid`,
      [match.matchId, match.recipientPlayerId],
    );
    await client.query('commit');

    return { actionId, submissionId };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function completeMatch(
  database: pg.Pool,
  match: AcceptedMatchFixture,
  completionReason: 'defeat' | 'turn_forfeit' | 'account_deletion_forfeit',
): Promise<void> {
  const client = await database.connect();
  const terminalActionId = randomUUID();
  const terminalSubmissionId = randomUUID();

  try {
    await client.query('begin');
    if (completionReason === 'defeat') {
      await client.query(
        `insert into public.async_pvp_match_actions (
           id,
           match_id,
           sequence,
           actor_player_id,
           submission_id,
           expected_version,
           action,
           public_result,
           created_at
         ) values (
           $1::uuid,
           $2::uuid,
           1,
           $3::uuid,
           $4::uuid,
           0,
           '{"type":"use_move","moveId":"10000000-0000-4000-8000-000000000002"}',
           '{"type":"match_completed"}',
           '2026-08-29T11:00:00.000Z'
         )`,
        [
          terminalActionId,
          match.matchId,
          match.challengerPlayerId,
          terminalSubmissionId,
        ],
      );
      await client.query(
        `insert into private.async_pvp_match_transitions (
           action_id,
           match_id,
           state_before,
           state_after,
           authoritative_result,
           created_at
         ) values (
           $1::uuid,
           $2::uuid,
           '{"phase":"active","turnNumber":1}',
           '{"phase":"completed","turnNumber":1}',
           '{"type":"match_completed"}',
           '2026-08-29T11:00:00.000Z'
         )`,
        [terminalActionId, match.matchId],
      );
      await insertReceipt(client, {
        actorPlayerId: match.challengerPlayerId,
        operation: 'match_action',
        submissionId: terminalSubmissionId,
        matchId: match.matchId,
      });
    }
    await client.query(
      `update private.async_pvp_match_states
          set version = 1,
              battle_state = '{"phase":"completed","turnNumber":1}',
              updated_at = '2026-08-29T11:00:00.000Z'
        where match_id = $1::uuid`,
      [match.matchId],
    );
    await client.query(
      `update public.async_pvp_match_participants
          set outcome = case
            when player_id = $2::uuid then 'win'
            else 'loss'
          end
        where match_id = $1::uuid`,
      [match.matchId, match.challengerPlayerId],
    );
    await client.query(
      `update public.async_pvp_matches
          set status = 'completed',
              version = 1,
              current_player_id = null,
              winner_player_id = $2::uuid,
              completion_reason = $3,
              decision_started_at = null,
              turn_deadline = null,
              completed_at = '2026-08-29T11:00:00.000Z',
              updated_at = '2026-08-29T11:00:00.000Z'
        where id = $1::uuid`,
      [match.matchId, match.challengerPlayerId, completionReason],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function expectLateTerminalAction(
  database: pg.Pool,
  match: AcceptedMatchFixture,
): Promise<void> {
  const client = await database.connect();
  const actionId = randomUUID();
  const submissionId = randomUUID();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.async_pvp_match_actions (
         id,
         match_id,
         sequence,
         actor_player_id,
         submission_id,
         expected_version,
         action,
         public_result
       ) values (
         $1::uuid,
         $2::uuid,
         2,
         $3::uuid,
         $4::uuid,
         1,
         '{"type":"use_move"}',
         '{"type":"move_resolved"}'
       )`,
      [actionId, match.matchId, match.recipientPlayerId, submissionId],
    );
    await client.query(
      `insert into private.async_pvp_match_transitions (
         action_id,
         match_id,
         state_before,
         state_after,
         authoritative_result
       ) values ($1::uuid, $2::uuid, '{}', '{}', '{}')`,
      [actionId, match.matchId],
    );
    await insertReceipt(client, {
      actorPlayerId: match.recipientPlayerId,
      operation: 'match_action',
      submissionId,
      matchId: match.matchId,
    });
    await expect(client.query('commit')).rejects.toThrow(
      'does not belong to its committed version',
    );
    await client.query('rollback');
  } finally {
    client.release();
  }
}
