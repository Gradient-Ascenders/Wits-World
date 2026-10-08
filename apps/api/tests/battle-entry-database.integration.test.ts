import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { PoolClient } from 'pg';
import {
  buildDatabaseConfig,
  loadApiEnvironment,
} from '../src/config/database.js';
import { createDatabasePool } from '../src/database/connection.js';
import {
  createCpuMatchService,
  type CpuMatchClient,
  type CpuMatchService,
} from '../src/matches/cpu-match-service.js';

// Run the production SELECTs against disposable, session-local tables only.
// No migration, seed, public-table write or administrative database privilege.
describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'compact entry PostgreSQL semantics',
  () => {
    let pool: ReturnType<typeof createDatabasePool>;
    let client: PoolClient;
    let service: CpuMatchService;
    const player = 'a1000000-0000-4000-8000-000000000001';
    const other = 'a1000000-0000-4000-8000-000000000002';
    const deck = 'a2000000-0000-4000-8000-000000000001';
    const match = 'a3000000-0000-4000-8000-000000000001';
    beforeAll(() => {
      loadApiEnvironment();
      pool = createDatabasePool(buildDatabaseConfig({ target: 'test' }));
    });
    beforeEach(async () => {
      client = await pool.connect();
      await client.query('begin');
      await client.query(`
      create temporary table cpu_matches (id uuid primary key, player_id uuid, status text,
        winner text, started_at timestamptz, completed_at timestamptz, state jsonb) on commit drop;
      create temporary table cpu_match_rounds (id uuid, match_id uuid) on commit drop;
      create temporary table player_decks (id uuid primary key, player_id uuid, name text) on commit drop;
      create temporary table player_deck_selections (player_id uuid primary key, deck_id uuid) on commit drop;
    `);
      service = createCpuMatchService({
        connect: async () =>
          ({
            query: (statement, values) =>
              client.query(statement.replaceAll('public.', 'pg_temp.'), values),
            release: () => {},
          }) as CpuMatchClient,
      });
    });
    afterEach(async () => {
      if (client) {
        try {
          await client.query('rollback');
        } finally {
          client.release();
        }
      }
    });
    afterAll(async () => {
      await pool?.end();
    });

    it('scopes ownership and reflects selected-deck and active-match changes without caching', async () => {
      await client.query('insert into pg_temp.player_decks values ($1,$2,$3)', [
        deck,
        player,
        'Campus Five',
      ]);
      await client.query(
        'insert into pg_temp.player_deck_selections values ($1,$2)',
        [player, deck],
      );
      expect(await service.getBattleEntrySummary(other)).toEqual({
        activeMatch: null,
        selectedDeck: null,
      });
      expect(
        (await service.getBattleEntrySummary(player)).selectedDeck?.name,
      ).toBe('Campus Five');
      await client.query(
        `insert into pg_temp.cpu_matches values ($1,$2,'active',null,now(),null,
      '{"phase":"active","turnNumber":3,"currentSide":"cpu"}')`,
        [match, player],
      );
      expect(await service.getBattleEntrySummary(player)).toMatchObject({
        activeMatch: {
          matchId: match,
          state: { turnNumber: 3, currentSide: 'cpu' },
        },
        selectedDeck: null,
      });
      await client.query(
        "update pg_temp.cpu_matches set status='completed',winner='player',completed_at=now() where id=$1",
        [match],
      );
      expect(
        (await service.getBattleEntrySummary(player)).selectedDeck?.deckId,
      ).toBe(deck);
      await client.query('delete from pg_temp.player_deck_selections');
      expect(
        (await service.getBattleEntrySummary(player)).selectedDeck,
      ).toBeNull();
    });

    it('limits before counting rounds and orders equal completion timestamps deterministically', async () => {
      await client.query(
        `insert into pg_temp.cpu_matches
      select ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'completed','player',
        '2026-10-01'::timestamptz,'2026-10-08'::timestamptz,'{}'::jsonb
      from generate_series(1,25) n`,
        [player],
      );
      await client.query(
        'insert into pg_temp.cpu_match_rounds select id,id from pg_temp.cpu_matches',
      );
      const result = await service.listHistorySummaries(player, 5);
      expect(result).toHaveLength(5);
      expect(result.map((r) => r.matchId.slice(-2))).toEqual([
        '25',
        '24',
        '23',
        '22',
        '21',
      ]);
      expect(result.every((r) => r.roundCount === 1 && !('rounds' in r))).toBe(
        true,
      );
      expect(await service.listHistorySummaries(other, 5)).toEqual([]);
    });

    it('reads fresh history on repeated visits after new results are persisted', async () => {
      expect(await service.listHistorySummaries(player, 5)).toEqual([]);
      await client.query(
        "insert into pg_temp.cpu_matches values ($1,$2,'completed','cpu',now(),now(),'{}')",
        [match, player],
      );
      expect(await service.listHistorySummaries(player, 5)).toMatchObject([
        { matchId: match, winner: 'cpu', roundCount: 0 },
      ]);
    });
  },
);
