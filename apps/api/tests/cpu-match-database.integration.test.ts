import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryResultRow } from 'pg';

import {
  applyBattleAction,
  createBattleState,
  type BattleCreatureCard,
  type BattleDeck,
  type BattlePowerCard,
  type BattleState,
} from '@wits-world/game-rules';

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
  CpuMatchVersionConflictError,
  type CpuMatchClient,
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

    it('persists a normal player move and CPU response as two ordered actions with one receipt', async () => {
      const battle = activeBattle(1, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const service = createCpuMatchService(pool, { randomInt: () => 0 });
      const input = {
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(301_001),
        expectedVersion: 0,
        action: { type: 'use_move' as const, moveId: battle.playerMoveId },
      };

      const response = await service.submitAction(input);
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(response).toMatchObject({ status: 'active', version: 1 });
      expect(persisted.match).toMatchObject({
        status: 'active',
        version: 1,
        winner: null,
      });
      expect(persisted.rounds).toHaveLength(1);
      expect(persisted.actions.map(({ sequence }) => sequence)).toEqual([1, 2]);
      expect(persisted.actions.map(({ side }) => side)).toEqual([
        'player',
        'cpu',
      ]);
      expect(persisted.actions.map(({ action }) => action.type)).toEqual([
        'use_move',
        'use_move',
      ]);
      expect(persisted.actions[0]).toMatchObject({
        submission_id: input.submissionId,
        response,
      });
      expect(persisted.actions[1]).toMatchObject({
        submission_id: null,
        response: null,
      });

      const duplicate = await service.submitAction(input);
      const afterDuplicate = await loadActionPersistence(pool, fixture.matchId);
      expect(duplicate).toEqual(response);
      expect(afterDuplicate).toEqual(persisted);
    });

    it('keeps sequences contiguous when a two-action round is followed by CPU replacement and a CPU move', async () => {
      const battle = initialBattle(2, { playerDamage: 10, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      const selected = await service.submitAction({
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(302_001),
        expectedVersion: 0,
        action: {
          type: 'select_initial_creature',
          creatureId: battle.playerCreatureId,
        },
      });
      const moved = await service.submitAction({
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(302_002),
        expectedVersion: selected.version,
        action: { type: 'use_move', moveId: battle.playerMoveId },
      });
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(moved.state.phase).toBe('active');
      expect(moved.state.currentSide).toBe('player');
      expect(persisted.actions.map(({ sequence }) => sequence)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(persisted.actions.map(({ round_number }) => round_number)).toEqual(
        [1, 1, 2, 2, 2],
      );
      expect(persisted.actions.map(({ action }) => action.type)).toEqual([
        'select_initial_creature',
        'select_initial_creature',
        'use_move',
        'select_replacement',
        'use_move',
      ]);
      expect(persisted.actions.map(({ side }) => side)).toEqual([
        'player',
        'cpu',
        'player',
        'cpu',
        'cpu',
      ]);
      expect(
        persisted.actions.filter(({ submission_id }) => submission_id !== null),
      ).toHaveLength(2);
      expect(
        persisted.actions.filter(({ response }) => response !== null),
      ).toHaveLength(2);
    });

    it('persists a player-completed terminal match atomically', async () => {
      const battle = activeBattle(3, { playerDamage: 10, cpuDamage: 1 });
      const terminalState = withLastCreature(battle.state, 'cpu');
      const fixture = await insertActionMatch(pool, terminalState);
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      const response = await service.submitAction({
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(303_001),
        expectedVersion: 0,
        action: { type: 'use_move', moveId: battle.playerMoveId },
      });
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(response).toMatchObject({
        status: 'completed',
        version: 1,
        winner: 'player',
        completedAt: expect.any(String),
        state: { phase: 'completed', currentSide: null },
      });
      expect(persisted.match).toMatchObject({
        status: 'completed',
        version: 1,
        winner: 'player',
        state: { phase: 'completed', winner: 'player' },
      });
      expect(persisted.match.completed_at).toBeInstanceOf(Date);
      expect(persisted.actions).toHaveLength(1);
      expect(persisted.actions[0]?.result).toMatchObject({ winner: 'player' });
      expect(persisted.rounds[0]?.state_after).toEqual(persisted.match.state);
    });

    it('persists a CPU-completed terminal match atomically', async () => {
      const battle = activeBattle(4, { playerDamage: 0, cpuDamage: 10 });
      const terminalState = withLastCreature(battle.state, 'player');
      const fixture = await insertActionMatch(pool, terminalState);
      const service = createCpuMatchService(pool, { randomInt: () => 0 });

      const response = await service.submitAction({
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(304_001),
        expectedVersion: 0,
        action: { type: 'use_move', moveId: battle.playerMoveId },
      });
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(response).toMatchObject({
        status: 'completed',
        version: 1,
        winner: 'cpu',
        completedAt: expect.any(String),
        state: { phase: 'completed', currentSide: null },
      });
      expect(persisted.match).toMatchObject({
        status: 'completed',
        version: 1,
        winner: 'cpu',
        state: { phase: 'completed', winner: 'cpu' },
      });
      expect(persisted.actions.map(({ side }) => side)).toEqual([
        'player',
        'cpu',
      ]);
      expect(persisted.actions[1]?.result).toMatchObject({ winner: 'cpu' });
    });

    it('returns one committed response to two concurrent identical submissions', async () => {
      const battle = activeBattle(5, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const firstAtPersistence = deferred<void>();
      const releaseFirst = deferred<void>();
      const secondAtLock = deferred<void>();
      let secondAcquiredLock = false;

      const firstService = createCpuMatchService(
        interceptDatabase(pool, {
          beforeQuery: async (statement) => {
            if (statement.includes('with sequence_base as materialized')) {
              firstAtPersistence.resolve();
              await releaseFirst.promise;
            }
          },
        }),
        { randomInt: () => 0 },
      );
      const secondService = createCpuMatchService(
        interceptDatabase(pool, {
          beforeQuery: async (statement) => {
            if (statement.includes('for update')) secondAtLock.resolve();
          },
          afterQuery: async (statement) => {
            if (statement.includes('for update')) secondAcquiredLock = true;
          },
        }),
        { randomInt: () => 0 },
      );
      const input = {
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(305_001),
        expectedVersion: 0,
        action: { type: 'use_move' as const, moveId: battle.playerMoveId },
      };

      const first = firstService.submitAction(input);
      await firstAtPersistence.promise;
      const second = secondService.submitAction(input);
      await secondAtLock.promise;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(secondAcquiredLock).toBe(false);

      releaseFirst.resolve();
      const [firstResponse, secondResponse] = await Promise.all([
        first,
        second,
      ]);
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(secondAcquiredLock).toBe(true);
      expect(secondResponse).toEqual(firstResponse);
      expect(persisted.match.version).toBe(1);
      expect(persisted.rounds).toHaveLength(1);
      expect(persisted.actions).toHaveLength(2);
    });

    it('serializes concurrent different submissions and rejects the stale request', async () => {
      const battle = activeBattle(6, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const firstAtPersistence = deferred<void>();
      const releaseFirst = deferred<void>();
      const secondAtLock = deferred<void>();
      const firstService = createCpuMatchService(
        interceptDatabase(pool, {
          beforeQuery: async (statement) => {
            if (statement.includes('with sequence_base as materialized')) {
              firstAtPersistence.resolve();
              await releaseFirst.promise;
            }
          },
        }),
        { randomInt: () => 0 },
      );
      const secondService = createCpuMatchService(
        interceptDatabase(pool, {
          beforeQuery: async (statement) => {
            if (statement.includes('for update')) secondAtLock.resolve();
          },
        }),
        { randomInt: () => 0 },
      );
      const shared = {
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        expectedVersion: 0,
        action: { type: 'use_move' as const, moveId: battle.playerMoveId },
      };

      const first = firstService.submitAction({
        ...shared,
        submissionId: integrationUuid(306_001),
      });
      await firstAtPersistence.promise;
      const second = secondService.submitAction({
        ...shared,
        submissionId: integrationUuid(306_002),
      });
      await secondAtLock.promise;
      releaseFirst.resolve();

      await expect(first).resolves.toMatchObject({ version: 1 });
      await expect(second).rejects.toBeInstanceOf(CpuMatchVersionConflictError);
      const persisted = await loadActionPersistence(pool, fixture.matchId);
      expect(persisted.match.version).toBe(1);
      expect(persisted.rounds).toHaveLength(1);
      expect(persisted.actions).toHaveLength(2);
    });

    it('rolls back all combined writes when match persistence fails', async () => {
      const battle = activeBattle(7, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const triggerName = 'cpu_match_latency_fail_update';
      const functionName = 'cpu_match_latency_fail_update';

      await pool.query(`
        create function public.${functionName}()
        returns trigger
        language plpgsql
        as $function$
        begin
          if new.id = '${fixture.matchId}'::uuid then
            raise exception 'injected CPU match persistence failure';
          end if;
          return new;
        end
        $function$
      `);
      await pool.query(`
        create trigger ${triggerName}
        before update on public.cpu_matches
        for each row execute function public.${functionName}()
      `);

      try {
        const service = createCpuMatchService(pool, { randomInt: () => 0 });
        await expect(
          service.submitAction({
            playerId: fixture.playerId,
            matchId: fixture.matchId,
            submissionId: integrationUuid(307_001),
            expectedVersion: 0,
            action: { type: 'use_move', moveId: battle.playerMoveId },
          }),
        ).rejects.toThrow('injected CPU match persistence failure');

        const persisted = await loadActionPersistence(pool, fixture.matchId);
        expect(persisted.match).toMatchObject({
          version: 0,
          state: battle.state,
        });
        expect(persisted.rounds).toEqual([]);
        expect(persisted.actions).toEqual([]);
      } finally {
        await pool.query(`drop trigger ${triggerName} on public.cpu_matches`);
        await pool.query(`drop function public.${functionName}()`);
      }
    });

    it('rolls back successful writes when returned persistence invariants fail', async () => {
      const battle = activeBattle(8, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state);
      const database = interceptDatabase(pool, {
        afterQuery: async (statement, result) => {
          if (statement.includes('with sequence_base as materialized')) {
            const row = result.rows[0] as { match_update_count?: number };
            row.match_update_count = 0;
          }
        },
      });
      const service = createCpuMatchService(database, { randomInt: () => 0 });

      await expect(
        service.submitAction({
          playerId: fixture.playerId,
          matchId: fixture.matchId,
          submissionId: integrationUuid(308_001),
          expectedVersion: 0,
          action: { type: 'use_move', moveId: battle.playerMoveId },
        }),
      ).rejects.toThrow('transition persistence invariant failed');

      const persisted = await loadActionPersistence(pool, fixture.matchId);
      expect(persisted.match).toMatchObject({
        version: 0,
        state: battle.state,
      });
      expect(persisted.rounds).toEqual([]);
      expect(persisted.actions).toEqual([]);
    });

    it('keeps timeout substitution server-controlled in the combined persistence path', async () => {
      const battle = activeBattle(9, { playerDamage: 1, cpuDamage: 1 });
      const fixture = await insertActionMatch(pool, battle.state, {
        deadline: new Date('2026-08-16T00:00:00.000Z'),
      });
      const service = createCpuMatchService(pool, {
        clock: { now: () => new Date('2026-08-16T00:00:01.000Z') },
        randomInt: () => 0,
      });

      await service.submitAction({
        playerId: fixture.playerId,
        matchId: fixture.matchId,
        submissionId: integrationUuid(309_001),
        expectedVersion: 0,
        action: { type: 'use_move', moveId: battle.playerMoveId },
      });
      const persisted = await loadActionPersistence(pool, fixture.matchId);

      expect(persisted.actions[0]).toMatchObject({
        side: 'player',
        action: { type: 'timeout' },
        result: { action: { type: 'timeout' } },
      });
      expect(persisted.actions[1]?.side).toBe('cpu');
    });

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

let actionFixtureSequence = 0;

function initialBattle(
  seed: number,
  damage: { cpuDamage: number; playerDamage: number },
) {
  const playerDeck = battleDeck(400_000 + seed * 100, damage.playerDamage);
  const cpuDeck = battleDeck(500_000 + seed * 100, damage.cpuDamage);

  return {
    state: createBattleState(playerDeck, cpuDeck),
    playerCreatureId: playerDeck.creatureCards[0]!.id,
    playerMoveId: playerDeck.creatureCards[0]!.moves[0]!.id,
    cpuCreatureId: cpuDeck.creatureCards[0]!.id,
  };
}

function activeBattle(
  seed: number,
  damage: { cpuDamage: number; playerDamage: number },
) {
  const battle = initialBattle(seed, damage);
  let state = applyBattleAction(
    battle.state,
    'player',
    {
      type: 'select_initial_creature',
      creatureId: battle.playerCreatureId,
    },
    () => 0,
  ).state;
  state = applyBattleAction(
    state,
    'cpu',
    { type: 'select_initial_creature', creatureId: battle.cpuCreatureId },
    () => 0,
  ).state;

  return { ...battle, state };
}

function battleDeck(base: number, damage: number): BattleDeck {
  const creatureCards: BattleCreatureCard[] = [0, 1, 2].map((index) => ({
    id: integrationUuid(base + index),
    affinity: 'wit',
    maxHp: 10,
    maxPower: 10,
    moves: [
      {
        id: integrationUuid(base + 10 + index),
        name: 'Persistence strike',
        moveType: 'basic',
        powerCost: 0,
        effects: [
          {
            id: integrationUuid(base + 20 + index),
            effectType: 'damage',
            effectValue: damage,
          },
        ],
      },
    ],
  }));
  const powerCards: BattlePowerCard[] = [0, 1].map((index) => ({
    id: integrationUuid(base + 30 + index),
    affinity: 'wit',
    effects: [
      {
        id: integrationUuid(base + 40 + index),
        effectType: 'heal',
        effectValue: 1,
      },
    ],
  }));

  return { creatureCards, powerCards };
}

function withLastCreature(state: BattleState, side: 'cpu' | 'player') {
  const participant = state.participants[side];
  const creatures = participant.creatures.map((creature, index) => ({
    ...creature,
    currentHp: index === 0 ? 1 : 0,
    defeated: index !== 0,
  }));

  return {
    ...state,
    participants: {
      ...state.participants,
      [side]: {
        ...participant,
        activeCreatureId: creatures[0]!.card.id,
        creatures,
      },
    },
  } satisfies BattleState;
}

async function insertActionMatch(
  pool: ReturnType<typeof createDatabasePool>,
  state: BattleState,
  options: { deadline?: Date } = {},
) {
  actionFixtureSequence += 1;
  const playerId = integrationUuid(100_000 + actionFixtureSequence);
  const matchId = integrationUuid(200_000 + actionFixtureSequence);
  const active = state.phase === 'active';
  const deadline = active
    ? (options.deadline ?? new Date('2030-01-01T00:00:00.000Z'))
    : null;

  await pool.query(
    `
      insert into public.players (
        id, auth_issuer, auth_subject, role, lifecycle_status
      ) values ($1, 'https://issuer.example/', $2, 'player', 'active')
    `,
    [playerId, `cpu-action-persistence-${actionFixtureSequence}`],
  );
  await pool.query(
    `
      insert into public.cpu_matches (
        id, player_id, state, turn_started_at, turn_deadline
      ) values ($1, $2, $3::jsonb, $4, $5)
    `,
    [
      matchId,
      playerId,
      JSON.stringify(state),
      active ? new Date('2026-08-16T00:00:00.000Z') : null,
      deadline,
    ],
  );

  return { matchId, playerId };
}

async function loadActionPersistence(
  pool: ReturnType<typeof createDatabasePool>,
  matchId: string,
) {
  const match = await pool.query<{
    completed_at: Date | null;
    state: BattleState;
    status: 'active' | 'completed';
    version: number;
    winner: 'cpu' | 'player' | null;
  }>(
    `
      select status, state, version, winner, completed_at
      from public.cpu_matches
      where id = $1::uuid
    `,
    [matchId],
  );
  const rounds = await pool.query<{
    id: string;
    round_number: number;
    state_after: BattleState;
  }>(
    `
      select id::text, round_number, state_after
      from public.cpu_match_rounds
      where match_id = $1::uuid
      order by round_number
    `,
    [matchId],
  );
  const actions = await pool.query<{
    action: { type: string };
    response: unknown;
    result: { action: { type: string }; winner: 'cpu' | 'player' | null };
    round_number: number;
    sequence: number;
    side: 'cpu' | 'player';
    submission_id: string | null;
  }>(
    `
      select
        action.sequence,
        action.side,
        action.submission_id::text,
        action.action,
        action.result,
        action.response,
        round.round_number
      from public.cpu_match_actions action
      join public.cpu_match_rounds round on round.id = action.round_id
      where action.match_id = $1::uuid
      order by action.sequence
    `,
    [matchId],
  );

  const matchRow = match.rows[0];
  if (!matchRow) throw new Error('CPU action test match was not found.');

  return { match: matchRow, rounds: rounds.rows, actions: actions.rows };
}

interface QueryInterceptors {
  afterQuery?: (
    statement: string,
    result: { rows: QueryResultRow[] },
  ) => Promise<void>;
  beforeQuery?: (statement: string) => Promise<void>;
}

function interceptDatabase(
  pool: ReturnType<typeof createDatabasePool>,
  interceptors: QueryInterceptors,
): CpuMatchDatabase {
  return {
    connect: async () => {
      const client = await pool.connect();
      const intercepted: CpuMatchClient = {
        query: async <T extends QueryResultRow>(
          statement: string,
          values?: unknown[],
        ) => {
          await interceptors.beforeQuery?.(statement);
          const result = await client.query<T>(statement, values);
          await interceptors.afterQuery?.(
            statement,
            result as { rows: QueryResultRow[] },
          );
          return result;
        },
        release: () => client.release(),
      };
      return intercepted;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function integrationUuid(value: number) {
  return `c0000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
