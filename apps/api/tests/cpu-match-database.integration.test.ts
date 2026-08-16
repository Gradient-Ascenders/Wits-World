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
import { runSeeds } from '../src/database/seeds.js';
import { createCpuMatchService } from '../src/matches/cpu-match-service.js';

const PLAYER_ID = 'b1000000-0000-4000-8000-000000000001';
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
        ) values ($1, 'https://issuer.example/', 'cpu-match-player', 'player')
      `,
        [PLAYER_ID],
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

    it('creates a match, snapshots cards, and persists the first transition', async () => {
      const service = createCpuMatchService(pool, {
        clock: { now: () => new Date('2026-08-16T00:00:00.000Z') },
        randomInt: () => 0,
      });

      const created = await service.createMatch({
        playerId: PLAYER_ID,
        deckId: DECK_ID,
      });
      const initialAction = created.state.legalActions[0];

      expect(initialAction).toMatchObject({
        type: 'select_initial_creature',
      });

      const transitioned = await service.submitAction({
        playerId: PLAYER_ID,
        matchId: created.matchId,
        submissionId: 'b5000000-0000-4000-8000-000000000001',
        expectedVersion: created.version,
        action: initialAction as {
          type: 'select_initial_creature';
          creatureId: string;
        },
      });

      expect(transitioned.version).toBe(1);
      expect(transitioned.state.phase).toBe('active');

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
