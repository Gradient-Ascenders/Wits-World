import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryResultRow } from 'pg';

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
import { runSeeds } from '../src/database/seeds.js';
import {
  createCpuMatchService,
  CpuMatchNotFoundError,
  type CpuMatchDatabase,
} from '../src/matches/cpu-match-service.js';

const PLAYER_ID = 'b1000000-0000-4000-8000-000000000001';
const OTHER_PLAYER_ID = 'b1000000-0000-4000-8000-000000000002';
const VISIBILITY_PLAYER_ID = 'b1000000-0000-4000-8000-000000000003';
const GRANT_ID = 'b2000000-0000-4000-8000-000000000001';
const DECK_ID = 'b3000000-0000-4000-8000-000000000001';
const OWNED_CARD_IDS = [1, 2, 3, 4, 5].map(
  (value) => `b4000000-0000-4000-8000-${String(value).padStart(12, '0')}`,
);

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'CPU match persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let matchId: string;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_matches_${Date.now()}_${process.pid}`;

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
      await runSeeds(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);

      await pool.query(
        `
        insert into public.players (
          id, auth_issuer, auth_subject, role
        ) values
          ($1, 'https://issuer.example/', 'cpu-match-player', 'player'),
          ($2, 'https://issuer.example/', 'other-cpu-match-player', 'player'),
          ($3, 'https://issuer.example/', 'visibility-cpu-match-player', 'player')
      `,
        [PLAYER_ID, OTHER_PLAYER_ID, VISIBILITY_PLAYER_ID],
      );

      await pool.query(
        `
        insert into public.player_starter_grants (id, player_id, affinity)
        values ($1, $2, 'wit')
      `,
        [GRANT_ID, PLAYER_ID],
      );

      const definitions = await pool.query<{
        id: string;
        category: 'creature' | 'power';
      }>(
        `
        select id::text, category
        from public.card_definitions
        where is_active = true
          and rarity = 'common'
          and affinity = 'wit'
        order by category, name, id
      `,
      );

      const selectedDefinitions = [
        ...definitions.rows
          .filter((row) => row.category === 'creature')
          .slice(0, 3),
        ...definitions.rows
          .filter((row) => row.category === 'power')
          .slice(0, 2),
      ];

      for (const [index, definition] of selectedDefinitions.entries()) {
        await pool.query(
          `
          insert into public.player_cards (
            id, player_id, card_definition_id, acquisition_kind,
            source_starter_grant_id
          ) values ($1, $2, $3, 'starter', $4)
        `,
          [OWNED_CARD_IDS[index], PLAYER_ID, definition.id, GRANT_ID],
        );
      }

      await pool.query(
        `
        insert into public.player_decks (id, player_id, name)
        values ($1, $2, 'Integration deck')
      `,
        [DECK_ID, PLAYER_ID],
      );

      for (const [index, ownedCardId] of OWNED_CARD_IDS.entries()) {
        await pool.query(
          `
          insert into public.player_deck_cards (
            deck_id, player_id, owned_card_id, position
          ) values ($1, $2, $3, $4)
        `,
          [DECK_ID, PLAYER_ID, ownedCardId, index + 1],
        );
      }

      await pool.query(
        `
        insert into public.player_deck_selections (player_id, deck_id)
        values ($1, $2)
      `,
        [PLAYER_ID, DECK_ID],
      );
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

    it('recovers after a committed create response is discarded without creating another match', async () => {
      const service = createCpuMatchService(pool, {
        clock: { now: () => new Date('2026-08-16T00:00:00.000Z') },
        randomInt: () => 0,
      });

      const created = await service.createMatch({
        playerId: PLAYER_ID,
        deckId: DECK_ID,
      });
      matchId = created.matchId;

      const recoveredAfterLostResponse =
        await service.getActiveMatch(PLAYER_ID);

      expect(recoveredAfterLostResponse).toMatchObject({
        matchId: created.matchId,
        status: created.status,
        version: created.version,
        winner: created.winner,
        completedAt: created.completedAt,
        state: created.state,
        lastAction: created.lastAction,
      });
      expect(recoveredAfterLostResponse.matchId).toBe(matchId);

      const activeMatchCount = await pool.query<{ count: string }>(
        `
          select count(*)::text as count
          from public.cpu_matches
          where player_id = $1::uuid
            and status = 'active'
        `,
        [PLAYER_ID],
      );
      expect(activeMatchCount.rows[0]?.count).toBe('1');

      const initialAction = created.state.legalActions[0];

      expect(initialAction).toMatchObject({
        type: 'select_initial_creature',
      });

      const transitioned = await service.submitAction({
        playerId: PLAYER_ID,
        matchId,
        submissionId: 'b5000000-0000-4000-8000-000000000001',
        expectedVersion: created.version,
        action: initialAction as {
          type: 'select_initial_creature';
          creatureId: string;
        },
      });

      expect(transitioned.version).toBe(1);
      expect(transitioned.state.phase).toBe('active');

      const recoveredAfterAction = await service.getActiveMatch(PLAYER_ID);
      expect(recoveredAfterAction).toEqual(transitioned);
      expect(recoveredAfterAction.matchId).toBe(matchId);

      const counts = await pool.query<{
        actions: string;
        cards: string;
        rounds: string;
      }>(
        `
        select
          (select count(*) from public.cpu_match_actions)::text as actions,
          (select count(*) from public.cpu_match_cards)::text as cards,
          (select count(*) from public.cpu_match_rounds)::text as rounds
      `,
      );

      expect(counts.rows[0]).toEqual({
        actions: '2',
        cards: '10',
        rounds: '1',
      });
    }, 30_000);

    it('hides an uncommitted creation and recovers that exact match after commit', async () => {
      const creatingClient = await pool.connect();
      const service = createCpuMatchService(pool, { randomInt: () => 0 });
      let visibilityMatchId: string | undefined;
      let committed = false;

      try {
        await creatingClient.query('begin');
        const inserted = await creatingClient.query<{ id: string }>(
          `
            insert into public.cpu_matches (player_id, state)
            select $1::uuid, state
            from public.cpu_matches
            where id = $2::uuid
            returning id::text
          `,
          [VISIBILITY_PLAYER_ID, matchId],
        );
        visibilityMatchId = inserted.rows[0]?.id;

        expect(visibilityMatchId).toBeDefined();
        await expect(
          service.getActiveMatch(VISIBILITY_PLAYER_ID),
        ).rejects.toBeInstanceOf(CpuMatchNotFoundError);

        await creatingClient.query('commit');
        committed = true;

        const recovered = await service.getActiveMatch(VISIBILITY_PLAYER_ID);
        expect(recovered.matchId).toBe(visibilityMatchId);
      } finally {
        if (!committed) {
          await creatingClient.query('rollback');
        }
        creatingClient.release();

        if (committed && visibilityMatchId) {
          await pool.query(
            'delete from public.cpu_matches where id = $1::uuid',
            [visibilityMatchId],
          );
        }
      }
    });

    it('isolates recovery by authenticated player ownership', async () => {
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      await expect(
        service.getActiveMatch(OTHER_PLAYER_ID),
      ).rejects.toBeInstanceOf(CpuMatchNotFoundError);

      const ownerMatch = await service.getActiveMatch(PLAYER_ID);
      expect(ownerMatch.matchId).toBe(matchId);
    });

    it('returns the same persisted match to concurrent recovery reads', async () => {
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      const [first, second] = await Promise.all([
        service.getActiveMatch(PLAYER_ID),
        service.getActiveMatch(PLAYER_ID),
      ]);

      expect(first).toEqual(second);
      expect(first.matchId).toBe(matchId);
      expect(first.version).toBe(1);
    });

    it('keeps a direct read coherent when a commit lands between possible read round trips', async () => {
      const service = createCpuMatchService(pool, { randomInt: () => 0 });
      const before = await service.getMatch(PLAYER_ID, matchId);
      const updatingClient = await pool.connect();
      let committed = false;
      let matchReadCount = 0;

      try {
        await updatingClient.query('begin');
        await updatingClient.query(
          `
            update public.cpu_matches
               set version = version + 1,
                   state = jsonb_set(state, '{turnNumber}', '99'::jsonb),
                   updated_at = now()
             where id = $1::uuid
          `,
          [matchId],
        );
        await updatingClient.query(
          `
            update public.cpu_match_actions
               set result = jsonb_set(result, '{action}', '{"type":"timeout"}'::jsonb)
             where id = (
               select id
               from public.cpu_match_actions
               where match_id = $1::uuid
               order by sequence desc
               limit 1
             )
          `,
          [matchId],
        );

        // Commit after the first query has captured its rows. A coherent
        // one-statement read remains old/old; the former second action lookup
        // would instead observe the new action and return a mixed response.
        const commitDuringReadDatabase: CpuMatchDatabase = {
          connect: async () => {
            const readClient = await pool.connect();

            return {
              query: async <T extends QueryResultRow>(
                statement: string,
                values?: unknown[],
              ) => {
                const result = await readClient.query<T>(statement, values);

                if (statement.includes('from public.cpu_matches')) {
                  matchReadCount += 1;
                  if (!committed) {
                    await updatingClient.query('commit');
                    committed = true;
                  }
                }

                return result;
              },
              release: () => readClient.release(),
            };
          },
        };
        const concurrentService = createCpuMatchService(
          commitDuringReadDatabase,
          { randomInt: () => 0 },
        );

        const readAcrossCommit = await concurrentService.getMatch(
          PLAYER_ID,
          matchId,
        );

        expect(committed).toBe(true);
        expect(matchReadCount).toBe(1);
        expect(readAcrossCommit.version).toBe(before.version);
        expect(readAcrossCommit.state.turnNumber).toBe(before.state.turnNumber);
        expect(readAcrossCommit.lastAction).toEqual(before.lastAction);

        const after = await service.getMatch(PLAYER_ID, matchId);
        expect(after.version).toBe(before.version + 1);
        expect(after.state.turnNumber).toBe(99);
        expect(after.lastAction?.action).toEqual({ type: 'timeout' });
      } finally {
        if (!committed) {
          await updatingClient.query('rollback');
        }
        updatingClient.release();
      }

      await expect(
        service.getMatch(OTHER_PLAYER_ID, matchId),
      ).rejects.toBeInstanceOf(CpuMatchNotFoundError);
    });

    it('rejects a second active match for the same player', async () => {
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      await expect(
        service.createMatch({
          playerId: PLAYER_ID,
          deckId: DECK_ID,
        }),
      ).rejects.toThrow('already has an active CPU match');
    });

    it('does not recover a completed match as active', async () => {
      await pool.query(
        `
          update public.cpu_matches
             set status = 'completed',
                 state = state || '{
                   "phase": "completed",
                   "currentSide": null,
                   "replacementSide": null,
                   "winner": "player"
                 }'::jsonb,
                 winner = 'player',
                 turn_started_at = null,
                 turn_deadline = null,
                 completed_at = now(),
                 updated_at = now()
           where id = $1::uuid
        `,
        [matchId],
      );

      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      await expect(service.getActiveMatch(PLAYER_ID)).rejects.toBeInstanceOf(
        CpuMatchNotFoundError,
      );

      const completed = await service.getMatch(PLAYER_ID, matchId);
      expect(completed).toMatchObject({
        matchId,
        status: 'completed',
        winner: 'player',
      });
    });

    it('keeps the stored match after the saved deck is deleted', async () => {
      await pool.query('delete from public.player_decks where id = $1', [
        DECK_ID,
      ]);

      const match = await pool.query<{ count: string }>(
        `
        select count(*)::text as count
        from public.cpu_matches
        where player_id = $1
      `,
        [PLAYER_ID],
      );

      expect(match.rows[0]?.count).toBe('1');
    });
  },
);
