import { createHash, randomUUID } from 'node:crypto';
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
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';
import {
  createLivePvpService,
  type LivePvpDatabase,
} from '../src/matches/live-pvp-service.js';

const MIGRATION_NAME = '0044_create_live_pvp_persistence.sql';
const PRE_MIGRATION_PLAYER_ID = '25100000-0000-4000-8000-000000000001';
const PRE_MIGRATION_CPU_MATCH_ID = '25100000-0000-4000-8000-000000000002';
const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

interface CardDefinitionFixture extends pg.QueryResultRow {
  id: string;
  category: 'creature' | 'power';
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic' | null;
  rarity: 'common';
}

interface PlayerFixture {
  id: string;
  issuer: string;
  subject: string;
}

interface LiveMatchFixture {
  matchId: string;
  playerOne: PlayerFixture;
  playerTwo: PlayerFixture;
  playerOneSnapshotId: string;
  playerTwoSnapshotId: string;
}

interface RedeemedAccessRow extends pg.QueryResultRow {
  access_id: string;
  match_id: string;
  participant_generation: string | number | null;
  player_id: string;
  role: 'participant' | 'spectator';
}

describe.skipIf(!runIntegrationTests)(
  'live PvP persistence integration',
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
      temporaryDatabaseName = `wits_quest_live_pvp_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      preMigrationDirectory = await copyPreLivePvpMigrations();
      await runMigrations(temporaryConfig, preMigrationDirectory);
      const preMigrationPool = createDatabasePool(temporaryConfig);

      try {
        await seedRetainedCpuProgression(preMigrationPool);
      } finally {
        await preMigrationPool.end();
      }

      await copyFile(
        join(getMigrationsDirectory(), MIGRATION_NAME),
        join(preMigrationDirectory, MIGRATION_NAME),
      );

      await expect(
        runMigrations(temporaryConfig, preMigrationDirectory),
      ).resolves.toEqual({
        applied: [MIGRATION_NAME],
        skipped: expect.any(Array),
      });

      const rerun = await runMigrations(temporaryConfig, preMigrationDirectory);
      expect(rerun.applied).toEqual([]);
      expect(rerun.skipped).toContain(MIGRATION_NAME);

      await verifyCleanMigration(administrationConfig);

      pool = createDatabasePool(temporaryConfig);

      const retainedAward = await pool.query<{
        cpu_match_id: string;
        points_awarded: number;
      }>(
        `select cpu_match_id::text, points_awarded
         from public.player_point_awards
        where cpu_match_id = $1::uuid`,
        [PRE_MIGRATION_CPU_MATCH_ID],
      );
      expect(retainedAward.rows).toEqual([
        {
          cpu_match_id: PRE_MIGRATION_CPU_MATCH_ID,
          points_awarded: 25,
        },
      ]);

      await runSeeds(temporaryConfig);
      const definitions = await pool.query<CardDefinitionFixture>(
        `select id::text, category, affinity, rarity
         from public.card_definitions
        where is_active = true
          and rarity = 'common'
        order by category, affinity nulls last, name, id`,
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
    }, 180_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (preMigrationDirectory) {
        await rm(preMigrationDirectory, { force: true, recursive: true });
      }
      if (!administrationConfig || !temporaryDatabaseName) return;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('keeps security-sensitive live state private and creates the required indexes', async () => {
      const privateTables = await pool.query<{ table_name: string }>(
        `select table_name
         from information_schema.tables
        where table_schema = 'private'
          and table_name like 'live_pvp_%'
        order by table_name`,
      );
      expect(privateTables.rows.map((row) => row.table_name)).toEqual([
        'live_pvp_completion_sources',
        'live_pvp_connection_access',
        'live_pvp_connection_tickets',
        'live_pvp_deck_snapshot_cards',
        'live_pvp_deck_snapshots',
        'live_pvp_match_states',
        'live_pvp_match_transitions',
        'live_pvp_submission_receipts',
      ]);

      const ticketColumns = await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
        where table_schema = 'private'
          and table_name = 'live_pvp_connection_tickets'
        order by ordinal_position`,
      );
      expect(ticketColumns.rows.map((row) => row.column_name)).toContain(
        'ticket_digest',
      );
      expect(ticketColumns.rows.map((row) => row.column_name)).not.toEqual(
        expect.arrayContaining([
          'ticket',
          'access_token',
          'auth_subject',
          'email',
          'ip_address',
        ]),
      );

      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
         from pg_indexes
        where schemaname in ('public', 'private')
          and tablename like 'live_pvp_%'`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          'live_pvp_match_participants_player_idx',
          'live_pvp_matches_active_idx',
          'live_pvp_matches_history_idx',
          'live_pvp_matches_overdue_idx',
          'live_pvp_match_actions_history_idx',
          'live_pvp_connection_tickets_expiry_idx',
          'live_pvp_connection_tickets_purge_idx',
          'live_pvp_connection_access_one_participant_open_idx',
          'live_pvp_connection_access_purge_idx',
          'live_pvp_submission_receipts_lookup_idx',
        ]),
      );
    }, 30_000);

    it('requires exactly two complete shared-rule deck snapshots and one current state', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);

      const persisted = await pool.query<{
        participant_count: string;
        snapshot_card_count: string;
        state_version: number;
        turn_seconds: string;
      }>(
        `select
         (select count(*)::text
            from public.live_pvp_match_participants participant
           where participant.match_id = match.id) as participant_count,
         (select count(*)::text
            from private.live_pvp_deck_snapshot_cards card
            join private.live_pvp_deck_snapshots snapshot
              on snapshot.id = card.snapshot_id
           where snapshot.match_id = match.id) as snapshot_card_count,
         state.version as state_version,
         extract(epoch from (match.turn_deadline - match.decision_started_at))::text
           as turn_seconds
       from public.live_pvp_matches match
       join private.live_pvp_match_states state on state.match_id = match.id
       where match.id = $1::uuid`,
        [fixture.matchId],
      );
      expect(persisted.rows).toEqual([
        {
          participant_count: '2',
          snapshot_card_count: '10',
          state_version: 0,
          turn_seconds: '60.000000',
        },
      ]);

      await expect(
        pool.query(
          `delete from private.live_pvp_deck_snapshot_cards
          where snapshot_id = $1::uuid and position = 5`,
          [fixture.playerOneSnapshotId],
        ),
      ).rejects.toThrow('Live PvP deck snapshots are immutable');
    }, 30_000);

    it('redeems tickets once, advances participant generations, and supersedes older access', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const firstTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );

      const race = await Promise.allSettled([
        redeemTicket(pool, firstTicket),
        redeemTicket(pool, firstTicket),
      ]);
      expect(
        race.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        race.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const firstAccess = (
        race.find(
          (result) => result.status === 'fulfilled',
        ) as PromiseFulfilledResult<RedeemedAccessRow[]>
      ).value[0]!;
      expect(Number(firstAccess.participant_generation)).toBe(1);

      const secondTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const secondAccess = (await redeemTicket(pool, secondTicket))[0]!;
      expect(Number(secondAccess.participant_generation)).toBe(2);

      const state = await pool.query<{
        connection_generation: string | number;
        open_count: string;
        superseded_count: string;
      }>(
        `select participant.connection_generation,
              (select count(*)::text
                 from private.live_pvp_connection_access access
                where access.match_id = participant.match_id
                  and access.player_id = participant.player_id
                  and access.closed_at is null) as open_count,
              (select count(*)::text
                 from private.live_pvp_connection_access access
                where access.match_id = participant.match_id
                  and access.player_id = participant.player_id
                  and access.close_reason = 'superseded') as superseded_count
         from public.live_pvp_match_participants participant
        where participant.match_id = $1::uuid
          and participant.player_id = $2::uuid`,
        [fixture.matchId, fixture.playerOne.id],
      );
      expect(state.rows[0]).toMatchObject({
        open_count: '1',
        superseded_count: '1',
      });
      expect(Number(state.rows[0]!.connection_generation)).toBe(2);

      const expiredTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerTwo.id,
        'participant',
      );
      const expiredTicketLifetime = await pool.query<{ expires_at: Date }>(
        `select expires_at
           from private.live_pvp_connection_tickets
          where ticket_digest = $1::bytea`,
        [expiredTicket],
      );
      await expect(
        redeemTicket(
          pool,
          expiredTicket,
          new Date(expiredTicketLifetime.rows[0]!.expires_at.getTime() + 1),
        ),
      ).rejects.toThrow('connection ticket has expired');

      const nonParticipant = await insertPlayer(pool, 'ticket_viewer');
      await expect(
        insertConnectionTicket(
          pool,
          fixture.matchId,
          nonParticipant.id,
          'participant',
        ),
      ).rejects.toThrow('does not belong to a match participant');
    }, 30_000);

    it('samples ticket expiry only after player and match lifecycle locks are acquired', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const ticket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerTwo.id,
        'participant',
      );
      const lifetime = await pool.query<{ expires_at: Date }>(
        `select expires_at
           from private.live_pvp_connection_tickets
          where ticket_digest = $1::bytea`,
        [ticket],
      );
      const expiredAt = new Date(lifetime.rows[0]!.expires_at.getTime() + 1);
      const blocker = await pool.connect();

      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
             from public.live_pvp_matches
            where id = $1::uuid
            for update`,
          [fixture.matchId],
        );

        let settled = false;
        const redemption = redeemTicket(pool, ticket, expiredAt).then(
          (rows) => ({ ok: true as const, rows }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        void redemption.finally(() => {
          settled = true;
        });

        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);
        await blocker.query('commit');

        const outcome = await redemption;
        expect(outcome.ok).toBe(false);
        if (outcome.ok) {
          throw new Error('Expected blocked ticket redemption to expire');
        }
        expect(String(outcome.error)).toContain(
          'connection ticket has expired',
        );
      } catch (error) {
        await blocker.query('rollback');
        throw error;
      } finally {
        blocker.release();
      }

      const persisted = await pool.query<{
        access_count: string;
        connection_generation: string | number;
        redeemed_at: Date | null;
      }>(
        `select ticket.redeemed_at,
                participant.connection_generation,
                (select count(*)::text
                   from private.live_pvp_connection_access access
                  where access.ticket_id = ticket.id) as access_count
           from private.live_pvp_connection_tickets ticket
           join public.live_pvp_match_participants participant
             on participant.match_id = ticket.match_id
            and participant.player_id = ticket.player_id
          where ticket.ticket_digest = $1::bytea`,
        [ticket],
      );
      expect(persisted.rows).toEqual([
        {
          access_count: '0',
          connection_generation: '0',
          redeemed_at: null,
        },
      ]);
    }, 30_000);

    it('starts ticket lifetime only after mint lifecycle locks are acquired', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const blocker = await pool.connect();

      try {
        await blocker.query('begin');
        await blocker.query(
          `select id
             from public.live_pvp_matches
            where id = $1::uuid
            for update`,
          [fixture.matchId],
        );

        let settled = false;
        const mint = insertConnectionTicket(
          pool,
          fixture.matchId,
          fixture.playerTwo.id,
          'participant',
        );
        void mint.finally(() => {
          settled = true;
        });

        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);

        const releaseClock = await blocker.query<{ released_after: Date }>(
          `select clock_timestamp() as released_after`,
        );
        await blocker.query('commit');

        const ticket = await mint;
        const lifetime = await pool.query<{
          created_at: Date;
          expires_at: Date;
          purge_after: Date;
        }>(
          `select created_at, expires_at, purge_after
             from private.live_pvp_connection_tickets
            where ticket_digest = $1::bytea`,
          [ticket],
        );
        const row = lifetime.rows[0]!;

        expect(row.created_at.getTime()).toBeGreaterThanOrEqual(
          releaseClock.rows[0]!.released_after.getTime(),
        );
        expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(
          60_000,
        );
        expect(row.purge_after.getTime() - row.expires_at.getTime()).toBe(
          24 * 60 * 60 * 1000,
        );
      } catch (error) {
        await blocker.query('rollback');
        throw error;
      } finally {
        blocker.release();
      }
    }, 30_000);

    it('uses persisted generations to supersede an older runtime connection', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const service = createLivePvpService(pool);
      const firstTicket = await service.mintConnectionTicket({
        matchId: fixture.matchId,
        playerId: fixture.playerOne.id,
        requestedRole: 'participant',
      });
      const firstConnection = await service.redeemConnectionTicket(
        firstTicket.ticket,
      );
      const secondTicket = await service.mintConnectionTicket({
        matchId: fixture.matchId,
        playerId: fixture.playerOne.id,
        requestedRole: 'participant',
      });
      const secondConnection = await service.redeemConnectionTicket(
        secondTicket.ticket,
      );

      expect(secondConnection.participantGeneration).toBe(
        (firstConnection.participantGeneration ?? 0) + 1,
      );
      await expect(
        service.submitAction({
          matchId: fixture.matchId,
          playerId: fixture.playerOne.id,
          connectionGeneration: firstConnection.participantGeneration!,
          messageId: randomUUID(),
          expectedVersion: 0,
          action: {
            type: 'select_initial_creature',
            creatureId: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({ code: 'LIVE_CONNECTION_SUPERSEDED' });

      const resignation = await service.resign({
        matchId: fixture.matchId,
        playerId: fixture.playerOne.id,
        connectionGeneration: secondConnection.participantGeneration!,
        messageId: randomUUID(),
        expectedVersion: 0,
      });
      expect(resignation.acknowledgement.version).toBe(1);
      expect(resignation.replayed).toBe(false);
    }, 30_000);

    it('pins spectator history to the already-loaded authoritative match version', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const spectator = await insertPlayer(
        pool,
        'projection_version_spectator',
      );
      const participantTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const [participantAccess] = await redeemTicket(pool, participantTicket);
      const participantGeneration = Number(
        participantAccess!.participant_generation,
      );
      let advancedBetweenReads = false;

      const racingDatabase = {
        async connect() {
          const client = await pool.connect();
          return {
            async query(statement: string, values?: unknown[]) {
              if (
                !advancedBetweenReads &&
                statement.includes('from public.live_pvp_match_actions') &&
                statement.includes('order by sequence')
              ) {
                advancedBetweenReads = true;
                await commitParticipantTransition(pool, {
                  matchId: fixture.matchId,
                  actorPlayerId: fixture.playerOne.id,
                  expectedVersion: 0,
                  connectionGeneration: participantGeneration,
                });
              }
              return client.query(statement, values as never[] | undefined);
            },
            release() {
              client.release();
            },
          };
        },
        query(statement: string, values?: unknown[]) {
          return pool.query(statement, values as never[] | undefined);
        },
      } as unknown as LivePvpDatabase;

      const service = createLivePvpService(racingDatabase);
      const projection = await service.getProjection({
        matchId: fixture.matchId,
        playerId: spectator.id,
      });

      expect(advancedBetweenReads).toBe(true);
      expect(projection).toMatchObject({
        role: 'spectator',
        version: 0,
        history: [],
      });

      const persisted = await pool.query<{ version: number }>(
        `select version from public.live_pvp_matches where id = $1::uuid`,
        [fixture.matchId],
      );
      expect(persisted.rows[0]?.version).toBe(1);
    }, 30_000);

    it('reads participant metadata from the same database snapshot as the advertised match version', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const participantTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const [participantAccess] = await redeemTicket(pool, participantTicket);
      const participantGeneration = Number(
        participantAccess!.participant_generation,
      );
      let advancedBetweenReads = false;

      const racingDatabase = {
        async connect() {
          const client = await pool.connect();
          return {
            async query(statement: string, values?: unknown[]) {
              if (
                !advancedBetweenReads &&
                statement.includes(
                  'from public.live_pvp_match_participants participant',
                ) &&
                statement.includes('join public.players player')
              ) {
                advancedBetweenReads = true;
                await commitParticipantTransition(pool, {
                  matchId: fixture.matchId,
                  actorPlayerId: fixture.playerOne.id,
                  expectedVersion: 0,
                  connectionGeneration: participantGeneration,
                  participantTimeoutCountAfter: 1,
                });
              }
              return client.query(statement, values as never[] | undefined);
            },
            release() {
              client.release();
            },
          };
        },
        query(statement: string, values?: unknown[]) {
          return pool.query(statement, values as never[] | undefined);
        },
      } as unknown as LivePvpDatabase;

      const service = createLivePvpService(racingDatabase);
      const projection = await service.getProjection({
        matchId: fixture.matchId,
        playerId: fixture.playerOne.id,
      });

      expect(advancedBetweenReads).toBe(true);
      expect(projection).toMatchObject({
        role: 'participant',
        version: 0,
        consecutiveTimeouts: { self: 0, opponent: 0 },
      });

      const persisted = await pool.query<{
        version: number;
        consecutive_timeout_count: number;
      }>(
        `select match.version,
                participant.consecutive_timeout_count
           from public.live_pvp_matches match
           join public.live_pvp_match_participants participant
             on participant.match_id = match.id
            and participant.player_id = $2::uuid
          where match.id = $1::uuid`,
        [fixture.matchId, fixture.playerOne.id],
      );
      expect(persisted.rows[0]).toMatchObject({
        version: 1,
        consecutive_timeout_count: 1,
      });
    }, 30_000);

    it('rejects nonparticipant mutation storage and rolls the attempted transition back', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const nonParticipant = await insertPlayer(pool, 'mutation_viewer');

      await expect(
        commitParticipantTransition(pool, {
          matchId: fixture.matchId,
          actorPlayerId: nonParticipant.id,
          expectedVersion: 0,
          connectionGeneration: 1,
        }),
      ).rejects.toThrow('actor is not a participant');

      const match = await pool.query<{ version: number }>(
        `select version
         from public.live_pvp_matches
        where id = $1::uuid`,
        [fixture.matchId],
      );
      expect(match.rows).toEqual([{ version: 0 }]);
    }, 30_000);

    it('rejects stale connection generations and serializes same-version writes', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const firstTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const firstAccess = (await redeemTicket(pool, firstTicket))[0]!;
      const generationOne = Number(firstAccess.participant_generation);

      await commitParticipantTransition(pool, {
        matchId: fixture.matchId,
        actorPlayerId: fixture.playerOne.id,
        expectedVersion: 0,
        connectionGeneration: generationOne,
      });

      const secondTicket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const secondAccess = (await redeemTicket(pool, secondTicket))[0]!;
      const generationTwo = Number(secondAccess.participant_generation);
      expect(generationTwo).toBe(generationOne + 1);

      await expect(
        commitParticipantTransition(pool, {
          matchId: fixture.matchId,
          actorPlayerId: fixture.playerOne.id,
          expectedVersion: 1,
          connectionGeneration: generationOne,
        }),
      ).rejects.toThrow('superseded connection generation');

      await commitParticipantTransition(pool, {
        matchId: fixture.matchId,
        actorPlayerId: fixture.playerOne.id,
        expectedVersion: 1,
        connectionGeneration: generationTwo,
      });

      const competing = await Promise.allSettled([
        commitParticipantTransition(pool, {
          matchId: fixture.matchId,
          actorPlayerId: fixture.playerOne.id,
          expectedVersion: 2,
          connectionGeneration: generationTwo,
        }),
        commitParticipantTransition(pool, {
          matchId: fixture.matchId,
          actorPlayerId: fixture.playerOne.id,
          expectedVersion: 2,
          connectionGeneration: generationTwo,
        }),
      ]);
      expect(
        competing.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        competing.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const persisted = await pool.query<{
        action_count: string;
        state_version: number;
        version: number;
      }>(
        `select match.version,
              state.version as state_version,
              (select count(*)::text
                 from public.live_pvp_match_actions action
                where action.match_id = match.id) as action_count
         from public.live_pvp_matches match
         join private.live_pvp_match_states state on state.match_id = match.id
        where match.id = $1::uuid`,
        [fixture.matchId],
      );
      expect(persisted.rows).toEqual([
        { action_count: '3', state_version: 3, version: 3 },
      ]);
    }, 30_000);

    it('retains canonical idempotency receipts without allowing duplicate logical messages', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const ticket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const access = (await redeemTicket(pool, ticket))[0]!;
      const messageId = randomUUID();
      const payloadHash = hashPayload('same-payload');

      const committed = await commitParticipantTransition(pool, {
        matchId: fixture.matchId,
        actorPlayerId: fixture.playerOne.id,
        expectedVersion: 0,
        connectionGeneration: Number(access.participant_generation),
        messageId,
        payloadHash,
      });

      const receipt = await pool.query<{
        committed_event_id: string;
        payload_hash: string;
        committed_acknowledgement: { messageId?: string };
      }>(
        `select committed_event_id::text, payload_hash, committed_acknowledgement
         from private.live_pvp_submission_receipts
        where match_id = $1::uuid
          and actor_player_id = $2::uuid
          and operation = 'action_submit'
          and message_id = $3::uuid`,
        [fixture.matchId, fixture.playerOne.id, messageId],
      );
      expect(receipt.rows).toEqual([
        {
          committed_event_id: committed.eventId,
          payload_hash: payloadHash,
          committed_acknowledgement: { messageId },
        },
      ]);

      await expect(
        pool.query(
          `insert into private.live_pvp_submission_receipts (
           match_id, actor_player_id, operation, message_id, expected_version,
           connection_generation, payload_hash, committed_event_id,
           committed_acknowledgement
         ) values (
           $1::uuid, $2::uuid, 'action_submit', $3::uuid, 0,
           $4, $5, $6::uuid, '{}'::jsonb
         )`,
          [
            fixture.matchId,
            fixture.playerOne.id,
            messageId,
            Number(access.participant_generation),
            hashPayload('different-payload'),
            committed.eventId,
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'live_pvp_submission_receipts_message_unique',
      });
    }, 30_000);

    it('keeps terminal history immutable and records exactly two completion sources without inventing point awards', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const ticket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      await redeemTicket(pool, ticket);
      await completeMatchBySystemForfeit(pool, fixture, fixture.playerOne.id);

      const persisted = await pool.query<{
        completion_reason: string;
        source_count: string;
        award_count: string;
        open_access_count: string;
        match_completed_access_count: string;
      }>(
        `select match.completion_reason,
              (select count(*)::text
                 from private.live_pvp_completion_sources source
                where source.match_id = match.id) as source_count,
              (select count(*)::text
                 from public.player_point_awards award
                where award.player_id in (
                  select participant.player_id
                    from public.live_pvp_match_participants participant
                   where participant.match_id = match.id
                )
                ) as award_count,
              (select count(*)::text
                 from private.live_pvp_connection_access access
                where access.match_id = match.id
                  and access.closed_at is null) as open_access_count,
              (select count(*)::text
                 from private.live_pvp_connection_access access
                where access.match_id = match.id
                  and access.close_reason = 'match_completed')
                as match_completed_access_count
         from public.live_pvp_matches match
        where match.id = $1::uuid`,
        [fixture.matchId],
      );
      expect(persisted.rows).toEqual([
        {
          completion_reason: 'account_deletion_forfeit',
          source_count: '2',
          award_count: '0',
          open_access_count: '0',
          match_completed_access_count: '1',
        },
      ]);

      await expect(
        pool.query(
          `update public.live_pvp_matches
            set updated_at = updated_at + interval '1 second'
          where id = $1::uuid`,
          [fixture.matchId],
        ),
      ).rejects.toThrow('Completed live PvP match');

      await expect(
        pool.query(
          `update public.live_pvp_match_actions
            set public_result = public_result
          where match_id = $1::uuid`,
          [fixture.matchId],
        ),
      ).rejects.toThrow('public action history is immutable');

      await expect(
        pool.query(
          `update public.live_pvp_match_participants
              set consecutive_timeout_count = consecutive_timeout_count + 1,
                  connection_generation = connection_generation + 1
            where match_id = $1::uuid
              and player_id = $2::uuid`,
          [fixture.matchId, fixture.playerOne.id],
        ),
      ).rejects.toThrow('Terminal live PvP participant history is immutable');

      await expect(
        pool.query(
          `insert into private.live_pvp_completion_sources (
           match_id, player_id, outcome, completion_reason, occurred_at
         )
         select match_id, player_id, outcome, 'account_deletion_forfeit', now()
           from public.live_pvp_match_participants
          where match_id = $1::uuid
          limit 1`,
          [fixture.matchId],
        ),
      ).rejects.toMatchObject({
        constraint: 'live_pvp_completion_sources_pkey',
      });
    }, 30_000);

    it('blocks account deletion until active live matches are finalized, then removes transient access while retaining anonymous history', async () => {
      const active = await createLiveMatch(pool, cardDefinitions);
      const lifecycle = createAccountDeletionLifecycle(pool);

      await expect(
        lifecycle.request({
          issuer: active.playerOne.issuer,
          subject: active.playerOne.subject,
        }),
      ).rejects.toThrow(
        'Active live PvP matches must be finalized before account deletion can begin',
      );

      await expect(
        pool.query<{ lifecycle_status: string }>(
          `select lifecycle_status
           from public.players
          where id = $1::uuid`,
          [active.playerOne.id],
        ),
      ).resolves.toMatchObject({ rows: [{ lifecycle_status: 'active' }] });

      const ticket = await insertConnectionTicket(
        pool,
        active.matchId,
        active.playerOne.id,
        'participant',
      );
      await redeemTicket(pool, ticket);
      await completeMatchBySystemForfeit(pool, active, active.playerOne.id);

      const request = await lifecycle.request({
        issuer: active.playerOne.issuer,
        subject: active.playerOne.subject,
      });
      await lifecycle.complete(request.id);

      const retained = await pool.query<{
        access_count: string;
        action_count: string;
        completion_source_count: string;
        lifecycle_status: string;
        player_name: string | null;
        snapshot_count: string;
        ticket_count: string;
      }>(
        `select player.lifecycle_status,
              player.player_name,
              (select count(*)::text
                 from private.live_pvp_connection_tickets ticket
                where ticket.player_id = player.id) as ticket_count,
              (select count(*)::text
                 from private.live_pvp_connection_access access
                where access.player_id = player.id) as access_count,
              (select count(*)::text
                 from private.live_pvp_deck_snapshots snapshot
                where snapshot.match_id = $2::uuid) as snapshot_count,
              (select count(*)::text
                 from public.live_pvp_match_actions action
                where action.match_id = $2::uuid) as action_count,
              (select count(*)::text
                 from private.live_pvp_completion_sources source
                where source.match_id = $2::uuid) as completion_source_count
         from public.players player
        where player.id = $1::uuid`,
        [active.playerOne.id, active.matchId],
      );
      expect(retained.rows).toEqual([
        {
          access_count: '0',
          action_count: '1',
          completion_source_count: '2',
          lifecycle_status: 'deleted',
          player_name: null,
          snapshot_count: '2',
          ticket_count: '0',
        },
      ]);
    }, 30_000);

    it('revokes open spectator authorization on account deletion while preserving the final completed projection path', async () => {
      const active = await createLiveMatch(pool, cardDefinitions);
      const completed = await createLiveMatch(pool, cardDefinitions);
      const spectator = await insertPlayer(pool, 'deletion_spectator');
      const service = createLivePvpService(pool);

      const activeTicket = await service.mintConnectionTicket({
        matchId: active.matchId,
        playerId: spectator.id,
        requestedRole: 'spectator',
      });
      const activeConnection = await service.redeemConnectionTicket(
        activeTicket.ticket,
      );
      await expect(
        service.getProjectionForConnection(activeConnection),
      ).resolves.toMatchObject({ role: 'spectator', status: 'active' });

      const completedTicket = await service.mintConnectionTicket({
        matchId: completed.matchId,
        playerId: spectator.id,
        requestedRole: 'spectator',
      });
      const completedConnection = await service.redeemConnectionTicket(
        completedTicket.ticket,
      );
      await completeMatchBySystemForfeit(
        pool,
        completed,
        completed.playerOne.id,
      );
      await expect(
        service.getProjectionForConnection(completedConnection),
      ).resolves.toMatchObject({ role: 'spectator', status: 'completed' });

      const listener = await pool.connect();
      try {
        await listener.query('listen live_pvp_presence_changed');
        const presenceNotification = new Promise<pg.Notification>(
          (resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    'Timed out waiting for live PvP presence notification.',
                  ),
                ),
              5_000,
            );
            const onNotification = (notification: pg.Notification) => {
              if (notification.channel !== 'live_pvp_presence_changed') return;
              const payload = notification.payload
                ? (JSON.parse(notification.payload) as { matchId?: string })
                : {};
              if (payload.matchId !== active.matchId) return;
              clearTimeout(timeout);
              listener.off('notification', onNotification);
              resolve(notification);
            };
            listener.on('notification', onNotification);
          },
        );

        const lifecycle = createAccountDeletionLifecycle(pool, {
          finalizeDependentGameplay: async (client, playerId, requestedAt) => {
            await service.finalizeAccountDeletion(
              client,
              playerId,
              requestedAt,
            );
          },
        });
        await lifecycle.request({
          issuer: spectator.issuer,
          subject: spectator.subject,
        });

        await expect(presenceNotification).resolves.toMatchObject({
          channel: 'live_pvp_presence_changed',
        });
        await expect(
          service.getProjectionForConnection(activeConnection),
        ).rejects.toMatchObject({ code: 'LIVE_AUTHENTICATION_REQUIRED' });
      } finally {
        await listener.query('unlisten live_pvp_presence_changed');
        listener.release();
      }
    }, 30_000);

    it('purges closed access and expired ticket digests only after the 24-hour retention boundary', async () => {
      await pool.query(`delete from private.live_pvp_connection_access`);
      await pool.query(`delete from private.live_pvp_connection_tickets`);

      const fixture = await createLiveMatch(pool, cardDefinitions);
      const spectator = await insertPlayer(pool, 'retention_spectator');
      const ticket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        spectator.id,
        'spectator',
      );
      const redeemed = await redeemTicket(pool, ticket);
      const accessId = redeemed[0]!.access_id;

      await pool.query(
        `select private.close_live_pvp_connection_access(
         $1::uuid,
         'transport_closed'
       )`,
        [accessId],
      );

      const retention = await pool.query<{
        access_purge_after: Date;
        ticket_purge_after: Date;
      }>(
        `select access.purge_after as access_purge_after,
                ticket.purge_after as ticket_purge_after
           from private.live_pvp_connection_access access
           join private.live_pvp_connection_tickets ticket
             on ticket.id = access.ticket_id
          where access.id = $1::uuid`,
        [accessId],
      );
      const accessPurgeAfter = retention.rows[0]!.access_purge_after;
      const ticketPurgeAfter = retention.rows[0]!.ticket_purge_after;
      expect(accessPurgeAfter.getTime()).toBeLessThan(
        ticketPurgeAfter.getTime(),
      );

      const before = await purgeTransientAccess(
        pool,
        new Date(accessPurgeAfter.getTime() - 1),
      );
      expect(before).toEqual({ accessRowsDeleted: 0, ticketRowsDeleted: 0 });

      // PostgreSQL timestamps have microsecond precision while node-postgres maps
      // timestamptz values to millisecond-precision Date objects. Step one
      // millisecond beyond the returned boundary so the test cannot land just
      // before the stored purge_after value after precision truncation.
      const accessDueAt = new Date(accessPurgeAfter.getTime() + 1);
      const ticketDueAt = new Date(ticketPurgeAfter.getTime() + 1);

      const accessDue = await purgeTransientAccess(pool, accessDueAt);
      expect(accessDue).toEqual({ accessRowsDeleted: 1, ticketRowsDeleted: 0 });

      const ticketDue = await purgeTransientAccess(pool, ticketDueAt);
      expect(ticketDue).toEqual({ accessRowsDeleted: 0, ticketRowsDeleted: 1 });

      const retry = await purgeTransientAccess(pool, ticketDueAt);
      expect(retry).toEqual({ accessRowsDeleted: 0, ticketRowsDeleted: 0 });
    }, 30_000);

    it('reloads committed live state, generations, receipts, and history from a fresh database pool', async () => {
      const fixture = await createLiveMatch(pool, cardDefinitions);
      const ticket = await insertConnectionTicket(
        pool,
        fixture.matchId,
        fixture.playerOne.id,
        'participant',
      );
      const access = (await redeemTicket(pool, ticket))[0]!;
      await commitParticipantTransition(pool, {
        matchId: fixture.matchId,
        actorPlayerId: fixture.playerOne.id,
        expectedVersion: 0,
        connectionGeneration: Number(access.participant_generation),
      });

      const reopenedPool = createDatabasePool(temporaryConfig);
      try {
        const recovered = await reopenedPool.query<{
          action_count: string;
          connection_generation: string | number;
          receipt_count: string;
          state_version: number;
          turn_deadline: Date;
          version: number;
        }>(
          `select match.version,
                match.turn_deadline,
                state.version as state_version,
                participant.connection_generation,
                (select count(*)::text
                   from public.live_pvp_match_actions action
                  where action.match_id = match.id) as action_count,
                (select count(*)::text
                   from private.live_pvp_submission_receipts receipt
                  where receipt.match_id = match.id) as receipt_count
           from public.live_pvp_matches match
           join private.live_pvp_match_states state on state.match_id = match.id
           join public.live_pvp_match_participants participant
             on participant.match_id = match.id
            and participant.player_id = $2::uuid
          where match.id = $1::uuid`,
          [fixture.matchId, fixture.playerOne.id],
        );
        expect(recovered.rows[0]).toMatchObject({
          action_count: '1',
          receipt_count: '1',
          state_version: 1,
          version: 1,
        });
        expect(Number(recovered.rows[0]!.connection_generation)).toBe(1);
        expect(recovered.rows[0]!.turn_deadline).toBeInstanceOf(Date);
      } finally {
        await reopenedPool.end();
      }
    }, 30_000);
  },
);

async function verifyCleanMigration(
  administrationConfig: DatabaseConfig,
): Promise<void> {
  const databaseName = `wits_quest_live_pvp_clean_${Date.now()}_${process.pid}`;

  await withDatabaseClient(administrationConfig, async (client) => {
    await client.query(`create database ${databaseName}`);
  });

  const databaseUrl = new URL(administrationConfig.connectionString);
  databaseUrl.pathname = `/${databaseName}`;
  const databaseConfig: DatabaseConfig = {
    ...administrationConfig,
    connectionString: databaseUrl.toString(),
  };

  try {
    const firstRun = await runMigrations(databaseConfig);
    expect(firstRun.applied).toContain(MIGRATION_NAME);

    const secondRun = await runMigrations(databaseConfig);
    expect(secondRun.applied).toEqual([]);
    expect(secondRun.skipped).toContain(MIGRATION_NAME);
  } finally {
    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${databaseName} with (force)`,
      );
    });
  }
}

async function copyPreLivePvpMigrations(): Promise<string> {
  const sourceDirectory = getMigrationsDirectory();
  const targetDirectory = await mkdtemp(
    join(tmpdir(), 'wits-live-pvp-migrations-'),
  );
  const migrationNames = await readdir(sourceDirectory);

  await Promise.all(
    migrationNames
      .filter((name) => name.endsWith('.sql') && name < MIGRATION_NAME)
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
       id, auth_issuer, auth_subject, player_name, role
     ) values (
       $1::uuid,
       'https://issuer.example/',
       'auth0|pre-live-player',
       'pre_live_player',
       'player'
     )`,
    [PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `insert into public.cpu_matches (
       id, player_id, status, state, version, winner,
       started_at, completed_at, created_at, updated_at
     ) values (
       $1::uuid, $2::uuid, 'completed', '{}'::jsonb, 1, 'player',
       '2026-09-01T10:00:00.000Z', '2026-09-01T10:10:00.000Z',
       '2026-09-01T10:00:00.000Z', '2026-09-01T10:10:00.000Z'
     )`,
    [PRE_MIGRATION_CPU_MATCH_ID, PRE_MIGRATION_PLAYER_ID],
  );
  await database.query(
    `select * from private.record_cpu_match_progression($1::uuid)`,
    [PRE_MIGRATION_CPU_MATCH_ID],
  );
}

async function insertPlayer(
  database: Pick<pg.Pool, 'query'>,
  label: string,
): Promise<PlayerFixture> {
  const id = randomUUID();
  const issuer = 'https://issuer.example/';
  const subject = `auth0|${label}-${id}`;
  await database.query(
    `insert into public.players (
       id, auth_issuer, auth_subject, player_name, role
     ) values ($1::uuid, $2, $3, $4, 'player')`,
    [id, issuer, subject, `${label.slice(0, 10)}_${id.slice(0, 6)}`],
  );
  return { id, issuer, subject };
}

async function createLiveMatch(
  database: Pick<pg.Pool, 'connect' | 'query'>,
  definitions: readonly CardDefinitionFixture[],
): Promise<LiveMatchFixture> {
  const playerOne = await insertPlayer(database, 'live_one');
  const playerTwo = await insertPlayer(database, 'live_two');
  const matchId = randomUUID();
  const playerOneSnapshotId = randomUUID();
  const playerTwoSnapshotId = randomUUID();
  const decisionStartedAt = new Date();
  const turnDeadline = new Date(decisionStartedAt.getTime() + 60_000);
  const client = await database.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.live_pvp_matches (
         id, status, version, phase, current_actor_player_id,
         decision_started_at, turn_deadline, started_at, created_at, updated_at
       ) values (
         $1::uuid, 'active', 0, 'initial_selection', null,
         $2::timestamptz, $3::timestamptz, $2::timestamptz,
         $2::timestamptz, $2::timestamptz
       )`,
      [matchId, decisionStartedAt, turnDeadline],
    );

    await insertDeckSnapshot(client, {
      snapshotId: playerOneSnapshotId,
      matchId,
      playerId: playerOne.id,
      side: 'player_one',
      definitions,
    });
    await insertDeckSnapshot(client, {
      snapshotId: playerTwoSnapshotId,
      matchId,
      playerId: playerTwo.id,
      side: 'player_two',
      definitions,
    });

    await client.query(
      `insert into public.live_pvp_match_participants (
         match_id, player_id, participant_side, deck_snapshot_id
       ) values
         ($1::uuid, $2::uuid, 'player_one', $3::uuid),
         ($1::uuid, $4::uuid, 'player_two', $5::uuid)`,
      [
        matchId,
        playerOne.id,
        playerOneSnapshotId,
        playerTwo.id,
        playerTwoSnapshotId,
      ],
    );
    await client.query(
      `insert into private.live_pvp_match_states (
         match_id, version, battle_state, updated_at
       ) values ($1::uuid, 0, $2::jsonb, $3::timestamptz)`,
      [
        matchId,
        JSON.stringify(createProjectionReadyBattleState()),
        decisionStartedAt,
      ],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return {
    matchId,
    playerOne,
    playerTwo,
    playerOneSnapshotId,
    playerTwoSnapshotId,
  };
}

async function insertDeckSnapshot(
  client: pg.PoolClient,
  input: {
    snapshotId: string;
    matchId: string;
    playerId: string;
    side: 'player_one' | 'player_two';
    definitions: readonly CardDefinitionFixture[];
  },
): Promise<void> {
  await client.query(
    `insert into private.live_pvp_deck_snapshots (
       id, match_id, player_id, participant_side, source_deck_id
     ) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
    [input.snapshotId, input.matchId, input.playerId, input.side, randomUUID()],
  );

  for (const [index, definition] of input.definitions.entries()) {
    const battleCardId = randomUUID();
    await client.query(
      `insert into private.live_pvp_deck_snapshot_cards (
         snapshot_id, position, battle_card_id, source_owned_card_id,
         source_card_definition_id, category, affinity, rarity, card_snapshot
       ) values (
         $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid,
         $6, $7, $8, $9::jsonb
       )`,
      [
        input.snapshotId,
        index + 1,
        battleCardId,
        randomUUID(),
        definition.id,
        definition.category,
        definition.affinity,
        definition.rarity,
        JSON.stringify({ id: battleCardId, category: definition.category }),
      ],
    );
  }
}

function createProjectionReadyBattleState() {
  const participantState = () => ({
    creatures: [0, 1, 2].map(() => ({
      card: {
        id: randomUUID(),
        affinity: 'wit',
        maxHp: 10,
        maxPower: 10,
        moves: [],
      },
      currentHp: 10,
      remainingPower: 10,
      defeated: false,
      modifiers: [],
    })),
    powerCards: [0, 1].map(() => ({
      id: randomUUID(),
      affinity: null,
      effects: [],
    })),
    usedPowerCardIds: [],
    activeCreatureId: null,
  });

  return {
    phase: 'initial_selection',
    affinityRulesVersion: 2,
    turnNumber: 0,
    currentSide: null,
    replacementSide: null,
    firstSide: null,
    selections: { player: null, cpu: null },
    participants: {
      player: participantState(),
      cpu: participantState(),
    },
    winner: null,
  };
}

async function insertConnectionTicket(
  database: Pick<pg.Pool, 'query'>,
  matchId: string,
  playerId: string,
  role: 'participant' | 'spectator',
): Promise<Buffer> {
  const digest = createHash('sha256')
    .update(`${randomUUID()}-${matchId}-${playerId}`)
    .digest();

  await database.query(
    `insert into private.live_pvp_connection_tickets (
       ticket_digest, match_id, player_id, role
     ) values ($1::bytea, $2::uuid, $3::uuid, $4)`,
    [digest, matchId, playerId, role],
  );

  return digest;
}

async function redeemTicket(
  database: Pick<pg.Pool, 'query'>,
  digest: Buffer,
  now?: Date,
): Promise<RedeemedAccessRow[]> {
  const result = now
    ? await database.query<RedeemedAccessRow>(
        `select access_id::text, match_id::text, player_id::text, role,
                participant_generation
           from private.redeem_live_pvp_connection_ticket(
             $1::bytea,
             $2::timestamptz
           )`,
        [digest, now],
      )
    : await database.query<RedeemedAccessRow>(
        `select access_id::text, match_id::text, player_id::text, role,
                participant_generation
           from private.redeem_live_pvp_connection_ticket($1::bytea)`,
        [digest],
      );
  return result.rows;
}

async function commitParticipantTransition(
  database: Pick<pg.Pool, 'connect'>,
  input: {
    matchId: string;
    actorPlayerId: string;
    expectedVersion: number;
    connectionGeneration: number;
    messageId?: string;
    payloadHash?: string;
    participantTimeoutCountAfter?: number;
  },
): Promise<{ eventId: string; version: number }> {
  const client = await database.connect();
  const eventId = randomUUID();
  const messageId = input.messageId ?? randomUUID();
  const payloadHash = input.payloadHash ?? hashPayload(messageId);
  const committedVersion = input.expectedVersion + 1;

  try {
    await client.query('begin');
    const updated = await client.query<{ version: number }>(
      `update public.live_pvp_matches
          set version = version + 1,
              updated_at = clock_timestamp()
        where id = $1::uuid
          and status = 'active'
          and version = $2
        returning version`,
      [input.matchId, input.expectedVersion],
    );
    if (updated.rows.length !== 1) {
      throw new Error('Live PvP expected version is stale.');
    }

    await client.query(
      `update private.live_pvp_match_states
          set version = $2,
              battle_state = jsonb_set(
                battle_state,
                '{lastCommittedVersion}',
                to_jsonb($2::integer),
                true
              ),
              updated_at = clock_timestamp()
        where match_id = $1::uuid`,
      [input.matchId, committedVersion],
    );
    if (input.participantTimeoutCountAfter !== undefined) {
      await client.query(
        `update public.live_pvp_match_participants
            set consecutive_timeout_count = $3,
                updated_at = clock_timestamp()
          where match_id = $1::uuid
            and player_id = $2::uuid`,
        [
          input.matchId,
          input.actorPlayerId,
          input.participantTimeoutCountAfter,
        ],
      );
    }

    await client.query(
      `insert into public.live_pvp_match_actions (
         id, match_id, sequence, previous_version, committed_version,
         transition_kind, actor_player_id, public_result
       ) values (
         $1::uuid, $2::uuid, $3, $4, $3,
         'participant_action', $5::uuid, $6::jsonb
       )`,
      [
        eventId,
        input.matchId,
        committedVersion,
        input.expectedVersion,
        input.actorPlayerId,
        JSON.stringify({ type: 'selection_submitted' }),
      ],
    );
    await client.query(
      `insert into private.live_pvp_match_transitions (
         action_id, match_id, state_before, state_after,
         authoritative_result, server_randomness,
         participant_connection_generation
       ) values (
         $1::uuid, $2::uuid, $3::jsonb, $4::jsonb,
         $5::jsonb, '{}'::jsonb, $6
       )`,
      [
        eventId,
        input.matchId,
        JSON.stringify({ version: input.expectedVersion }),
        JSON.stringify({ version: committedVersion }),
        JSON.stringify({ accepted: true }),
        input.connectionGeneration,
      ],
    );
    await client.query(
      `insert into private.live_pvp_submission_receipts (
         match_id, actor_player_id, operation, message_id, expected_version,
         connection_generation, payload_hash, committed_event_id,
         committed_acknowledgement
       ) values (
         $1::uuid, $2::uuid, 'action_submit', $3::uuid, $4,
         $5, $6, $7::uuid, $8::jsonb
       )`,
      [
        input.matchId,
        input.actorPlayerId,
        messageId,
        input.expectedVersion,
        input.connectionGeneration,
        payloadHash,
        eventId,
        JSON.stringify({ messageId }),
      ],
    );
    await client.query('commit');
    return { eventId, version: committedVersion };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function completeMatchBySystemForfeit(
  database: Pick<pg.Pool, 'connect'>,
  fixture: LiveMatchFixture,
  losingPlayerId: string,
): Promise<void> {
  const client = await database.connect();
  const winnerPlayerId =
    fixture.playerOne.id === losingPlayerId
      ? fixture.playerTwo.id
      : fixture.playerOne.id;
  const eventId = randomUUID();
  const completedAt = new Date();

  try {
    await client.query('begin');
    const match = await client.query<{ version: number }>(
      `select version
         from public.live_pvp_matches
        where id = $1::uuid
        for update`,
      [fixture.matchId],
    );
    const previousVersion = match.rows[0]!.version;
    const committedVersion = previousVersion + 1;

    await client.query(
      `update public.live_pvp_matches
          set status = 'completed',
              version = $2,
              phase = 'completed',
              current_actor_player_id = null,
              decision_started_at = null,
              turn_deadline = null,
              winner_player_id = $3::uuid,
              completion_reason = 'account_deletion_forfeit',
              completed_at = $4::timestamptz,
              updated_at = $4::timestamptz
        where id = $1::uuid`,
      [fixture.matchId, committedVersion, winnerPlayerId, completedAt],
    );
    await client.query(
      `update private.live_pvp_match_states
          set version = $2,
              battle_state = jsonb_set(
                battle_state,
                '{phase}',
                '"completed"'::jsonb,
                true
              ),
              updated_at = $3::timestamptz
        where match_id = $1::uuid`,
      [fixture.matchId, committedVersion, completedAt],
    );
    await client.query(
      `update public.live_pvp_match_participants
          set outcome = case when player_id = $2::uuid then 'win' else 'loss' end,
              updated_at = $3::timestamptz
        where match_id = $1::uuid`,
      [fixture.matchId, winnerPlayerId, completedAt],
    );
    await client.query(
      `insert into public.live_pvp_match_actions (
         id, match_id, sequence, previous_version, committed_version,
         transition_kind, actor_player_id, public_result, created_at
       ) values (
         $1::uuid, $2::uuid, $3, $4, $3,
         'account_deletion_forfeit', null, $5::jsonb, $6::timestamptz
       )`,
      [
        eventId,
        fixture.matchId,
        committedVersion,
        previousVersion,
        JSON.stringify({ completionReason: 'account_deletion_forfeit' }),
        completedAt,
      ],
    );
    await client.query(
      `insert into private.live_pvp_match_transitions (
         action_id, match_id, state_before, state_after,
         authoritative_result, server_randomness,
         participant_connection_generation, created_at
       ) values (
         $1::uuid, $2::uuid, $3::jsonb, $4::jsonb,
         $5::jsonb, '{}'::jsonb, null, $6::timestamptz
       )`,
      [
        eventId,
        fixture.matchId,
        JSON.stringify({ version: previousVersion }),
        JSON.stringify({ version: committedVersion, phase: 'completed' }),
        JSON.stringify({ winnerPlayerId }),
        completedAt,
      ],
    );
    await client.query(
      `insert into private.live_pvp_completion_sources (
         match_id, player_id, outcome, completion_reason, occurred_at
       )
       select participant.match_id,
              participant.player_id,
              participant.outcome,
              'account_deletion_forfeit',
              $2::timestamptz
         from public.live_pvp_match_participants participant
        where participant.match_id = $1::uuid`,
      [fixture.matchId, completedAt],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function purgeTransientAccess(
  database: Pick<pg.Pool, 'query'>,
  now: Date,
): Promise<{ accessRowsDeleted: number; ticketRowsDeleted: number }> {
  const result = await database.query<{
    access_rows_deleted: number;
    ticket_rows_deleted: number;
  }>(
    `select access_rows_deleted, ticket_rows_deleted
       from private.purge_live_pvp_transient_access($1::timestamptz)`,
    [now],
  );
  return {
    accessRowsDeleted: Number(result.rows[0]!.access_rows_deleted),
    ticketRowsDeleted: Number(result.rows[0]!.ticket_rows_deleted),
  };
}

function hashPayload(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
