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
import {
  runMigrations,
  type MigrationResult,
} from '../src/database/migrations.js';
import { runSeeds } from '../src/database/seeds.js';
import {
  createStarterGrantService,
  StarterAlreadyClaimedError,
} from '../src/cards/starter-grant.js';

const PLAYER_ID = '70000000-0000-4000-8000-000000000001';
const CONCURRENT_PLAYER_ID = '70000000-0000-4000-8000-000000000002';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('card catalogue integration', () => {
  let administrationConfig: DatabaseConfig;
  let migrationResult: MigrationResult;
  let temporaryConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let cataloguePool: ReturnType<typeof createDatabasePool>;
  let starterService: ReturnType<typeof createStarterGrantService>;

  beforeAll(async () => {
    loadApiEnvironment();
    administrationConfig = buildDatabaseConfig({ target: 'test' });
    temporaryDatabaseName = `wits_quest_cards_${Date.now()}_${process.pid}`;

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
    await runSeeds(temporaryConfig);
    await runSeeds(temporaryConfig);

    cataloguePool = createDatabasePool(temporaryConfig);
    starterService = createStarterGrantService(cataloguePool);

    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values ($1, 'https://issuer.example/', 'catalogue-player', 'player')`,
        [PLAYER_ID],
      );
    });
  }, 45_000);

  afterAll(async () => {
    if (cataloguePool) {
      await cataloguePool.end();
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

  it('applies the catalogue migration and seeds every starter affinity', () => {
    expect(migrationResult.applied).toContain(
      '0009_create_card_catalogue_and_starter_grants.sql',
    );
  });

  it('seeds 3 Common Creatures and 2 Common Power cards for each affinity', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        affinity: string;
        category: string;
        count: string;
        rarity: string;
      }>(
        `select affinity, category, rarity, count(*)::text as count
           from public.card_definitions
          where is_active = true
          group by affinity, category, rarity
          order by affinity, category, rarity`,
      );

      const commonStarterRows = result.rows.filter(
        (row) => row.rarity === 'common',
      );
      expect(commonStarterRows).toHaveLength(10);

      for (const affinity of ['wit', 'grit', 'spark', 'spirit', 'mystic']) {
        expect(
          commonStarterRows.find(
            (row) => row.affinity === affinity && row.category === 'creature',
          )?.count,
        ).toBe('3');
        expect(
          commonStarterRows.find(
            (row) => row.affinity === affinity && row.category === 'power',
          )?.count,
        ).toBe('2');
      }

      expect(result.rows.filter((row) => row.rarity !== 'common')).toHaveLength(
        6,
      );
    });
  });

  it('grants exactly five distinct cards and makes retries idempotent', async () => {
    const first = await starterService.selectStarter({
      playerId: PLAYER_ID,
      affinity: 'wit',
    });
    const retry = await starterService.selectStarter({
      playerId: PLAYER_ID,
      affinity: 'wit',
    });

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(first.grant).toEqual(retry.grant);
    expect(first.grant.cards).toHaveLength(5);
    expect(
      new Set(first.grant.cards.map((card) => card.cardDefinitionId)).size,
    ).toBe(5);
    expect(
      first.grant.cards.filter((card) => card.category === 'creature'),
    ).toHaveLength(3);
    expect(
      first.grant.cards.filter((card) => card.category === 'power'),
    ).toHaveLength(2);
    expect(
      first.grant.cards.every(
        (card) => card.affinity === 'wit' && card.rarity === 'common',
      ),
    ).toBe(true);

    await expect(
      starterService.selectStarter({
        playerId: PLAYER_ID,
        affinity: 'spark',
      }),
    ).rejects.toBeInstanceOf(StarterAlreadyClaimedError);
  });

  it('converges concurrent starter requests on one grant', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values ($1, 'https://issuer.example/', 'catalogue-player-2', 'player')`,
        [CONCURRENT_PLAYER_ID],
      );
    });

    const [first, second] = await Promise.all([
      starterService.selectStarter({
        playerId: CONCURRENT_PLAYER_ID,
        affinity: 'grit',
      }),
      starterService.selectStarter({
        playerId: CONCURRENT_PLAYER_ID,
        affinity: 'grit',
      }),
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.grant).toEqual(second.grant);

    await withDatabaseClient(temporaryConfig, async (client) => {
      const grantCount = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.player_starter_grants
          where player_id = $1`,
        [CONCURRENT_PLAYER_ID],
      );
      const cardCount = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.player_cards
          where player_id = $1 and acquisition_kind = 'starter'`,
        [CONCURRENT_PLAYER_ID],
      );

      expect(grantCount.rows[0]?.count).toBe('1');
      expect(cardCount.rows[0]?.count).toBe('5');
    });
  });

  it('rejects invalid card category relationships at database level', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const powerCard = await client.query<{ id: string }>(
        `select id::text as id
           from public.card_definitions
          where category = 'power'
          limit 1`,
      );
      const moveId = '71000000-0000-4000-8000-000000000001';

      await expect(
        client.query(
          `insert into public.card_moves (
             id, card_definition_id, position, name, move_type,
             effect_type, effect_value, power_cost
           ) values ($1, $2, 1, 'Invalid move', 'basic', 'damage', 1, 1)`,
          [moveId, powerCard.rows[0]?.id],
        ),
      ).rejects.toThrow();
    });
  });
});
