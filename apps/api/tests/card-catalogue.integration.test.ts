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
import {
  runMigrations,
  type MigrationResult,
} from '../src/database/migrations.js';
import { runSeeds } from '../src/database/seeds.js';
import {
  createStarterGrantService,
  StarterAlreadyClaimedError,
  type StarterGrantDatabase,
} from '../src/cards/starter-grant.js';

import { createCardCollectionService } from '../src/cards/card-collection.js';

const PLAYER_ID = '70000000-0000-4000-8000-000000000001';
const CONCURRENT_PLAYER_ID = '70000000-0000-4000-8000-000000000002';
const COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000003';
const OTHER_COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000004';
const EMPTY_COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000005';
const MUTATION_RACE_PLAYER_ID = '70000000-0000-4000-8000-000000000006';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('card catalogue integration', () => {
  let administrationConfig: DatabaseConfig;
  let migrationResult: MigrationResult;
  let temporaryConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let cataloguePool: ReturnType<typeof createDatabasePool>;
  let starterService: ReturnType<typeof createStarterGrantService>;
  let collectionService: ReturnType<typeof createCardCollectionService>;

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
    collectionService = createCardCollectionService(cataloguePool);

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
    expect(migrationResult.applied).toContain(
      '0010_add_card_modifier_metadata.sql',
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

  it('seeds modifier metadata for battle-ready Buff effects', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        effect_value: number | null;
        modifier_duration_turns: number | null;
        modifier_operation: string | null;
        modifier_stat: string | null;
      }>(
        `select effect.effect_value,
                effect.modifier_stat,
                effect.modifier_operation,
                effect.modifier_duration_turns
           from public.card_effects effect
           join public.card_definitions definition
             on definition.id = effect.card_definition_id
          where definition.name = 'Spark Legendary Power'
            and effect.effect_type = 'buff'
          order by effect.position`,
      );

      expect(result.rows).toEqual([
        {
          effect_value: 3,
          modifier_duration_turns: null,
          modifier_operation: 'multiply',
          modifier_stat: 'damage_multiplier',
        },
      ]);
    });
  });

  it('rejects Buff effects without modifier metadata at database level', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const powerCard = await client.query<{ id: string }>(
        `select id::text as id
           from public.card_definitions
          where category = 'power'
          limit 1`,
      );

      await expect(
        client.query(
          `insert into public.card_effects (
             id, card_definition_id, position, effect_type, effect_value
           ) values (
             '71000000-0000-4000-8000-000000000002',
             $1,
             99,
             'buff',
             3
           )`,
          [powerCard.rows[0]?.id],
        ),
      ).rejects.toThrow();
    });
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
  }, 30_000);

  it('holds selected definitions stable until the starter grant commits', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      MUTATION_RACE_PLAYER_ID,
      'catalogue-mutation-race-player',
    );

    const candidate = await cataloguePool.query<{ id: string }>(
      `
        select id::text as id
        from public.card_definitions
        where is_active = true
          and affinity = 'spirit'
          and category = 'creature'
          and rarity = 'common'
        order by id
        limit 1
      `,
    );
    const candidateId = candidate.rows[0]?.id;

    expect(candidateId).toBeDefined();

    let announceCandidateLocks!: () => void;
    const candidateLocksAcquired = new Promise<void>((resolve) => {
      announceCandidateLocks = resolve;
    });
    let continueSelection!: () => void;
    const selectionMayContinue = new Promise<void>((resolve) => {
      continueSelection = resolve;
    });
    let candidateQueryCount = 0;
    const pausingDatabase: StarterGrantDatabase = {
      async connect() {
        const client = await cataloguePool.connect();

        return {
          async query<T extends pg.QueryResultRow>(
            statement: string,
            values?: unknown[],
          ) {
            const result = await client.query<T>(statement, values);
            const normalized = statement.toLowerCase();

            if (
              normalized.includes('from public.card_definitions') &&
              normalized.includes('limit $3') &&
              normalized.includes('for share')
            ) {
              candidateQueryCount += 1;

              if (candidateQueryCount === 2) {
                announceCandidateLocks();
                await selectionMayContinue;
              }
            }

            return { rows: result.rows };
          },
          release() {
            client.release();
          },
        };
      },
    };
    const pausingStarterService = createStarterGrantService(pausingDatabase);
    const selection = pausingStarterService.selectStarter({
      playerId: MUTATION_RACE_PLAYER_ID,
      affinity: 'spirit',
    });

    await candidateLocksAcquired;

    try {
      await expect(
        withDatabaseClient(temporaryConfig, async (client) => {
          await client.query(`set lock_timeout = '250ms'`);
          await client.query(
            `update public.card_definitions
                set rarity = 'rare'
              where id = $1::uuid`,
            [candidateId],
          );
        }),
      ).rejects.toMatchObject({ code: '55P03' });
    } finally {
      continueSelection();
    }

    const result = await selection;

    expect(result.created).toBe(true);
    expect(result.grant.cards).toHaveLength(5);
    expect(
      result.grant.cards.every(
        (card) => card.affinity === 'spirit' && card.rarity === 'common',
      ),
    ).toBe(true);
    expect(
      result.grant.cards.filter((card) => card.category === 'creature'),
    ).toHaveLength(3);
    expect(
      result.grant.cards.filter((card) => card.category === 'power'),
    ).toHaveLength(2);
    expect(
      new Set(result.grant.cards.map((card) => card.cardDefinitionId)).size,
    ).toBe(5);
  }, 30_000);

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
  it('returns an empty collection for a player with no owned cards', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      EMPTY_COLLECTION_PLAYER_ID,
      'empty-collection-player',
    );

    await expect(
      collectionService.listOwnedCards(EMPTY_COLLECTION_PLAYER_ID),
    ).resolves.toEqual([]);
  });

  it('returns only the authenticated player owned copies in stable newest-first order', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      COLLECTION_PLAYER_ID,
      'collection-player',
    );
    await insertCataloguePlayer(
      temporaryConfig,
      OTHER_COLLECTION_PLAYER_ID,
      'other-collection-player',
    );

    const ownGrant = await starterService.selectStarter({
      playerId: COLLECTION_PLAYER_ID,
      affinity: 'spark',
    });

    const otherGrant = await starterService.selectStarter({
      playerId: OTHER_COLLECTION_PLAYER_ID,
      affinity: 'spark',
    });

    expect(ownGrant.grant.cards).toHaveLength(5);
    expect(otherGrant.grant.cards).toHaveLength(5);

    // Both players deliberately own the same five definitions. Their individual
    // ownership-copy identifiers must nevertheless remain isolated.
    expect(
      new Set(ownGrant.grant.cards.map((card) => card.cardDefinitionId)),
    ).toEqual(
      new Set(otherGrant.grant.cards.map((card) => card.cardDefinitionId)),
    );

    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `
          with ranked as (
            select
              id,
              row_number() over (order by id) as position
            from public.player_cards
            where player_id = $1::uuid
          )
          update public.player_cards owned
          set acquired_at =
            '2026-08-15T10:00:00.000Z'::timestamptz
            + (ranked.position::int * interval '1 minute')
          from ranked
          where owned.id = ranked.id
        `,
        [COLLECTION_PLAYER_ID],
      );
    });

    const cards = await collectionService.listOwnedCards(COLLECTION_PLAYER_ID);

    expect(cards).toHaveLength(5);

    const expected = await cataloguePool.query<{
      acquired_at: Date;
      card_definition_id: string;
      owned_card_id: string;
    }>(
      `
        select
          id::text as owned_card_id,
          card_definition_id::text as card_definition_id,
          acquired_at
        from public.player_cards
        where player_id = $1::uuid
        order by acquired_at desc, id desc
      `,
      [COLLECTION_PLAYER_ID],
    );

    expect(cards.map((card) => card.ownedCardId)).toEqual(
      expected.rows.map((card) => card.owned_card_id),
    );

    expect(cards.map((card) => card.cardDefinitionId)).toEqual(
      expected.rows.map((card) => card.card_definition_id),
    );

    expect(cards.map((card) => card.acquiredAt)).toEqual(
      expected.rows.map((card) => card.acquired_at.toISOString()),
    );

    const otherOwnership = new Set(
      otherGrant.grant.cards.map((card) => card.ownedCardId),
    );

    expect(cards.some((card) => otherOwnership.has(card.ownedCardId))).toBe(
      false,
    );

    expect(cards.every((card) => card.acquisitionKind === 'starter')).toBe(
      true,
    );

    expect(cards.every((card) => !('playerId' in card))).toBe(true);
    expect(cards.every((card) => !('sourceStarterGrantId' in card))).toBe(true);
    expect(cards.every((card) => !('sourceCompletionId' in card))).toBe(true);
  }, 30_000);

  it('loads gameplay and display metadata from the shared catalogue model', async () => {
    const cards = await collectionService.listOwnedCards(COLLECTION_PLAYER_ID);

    const creature = cards.find((card) => card.category === 'creature');
    const powerCard = cards.find((card) => card.category === 'power');

    expect(creature).toBeDefined();
    expect(powerCard).toBeDefined();

    expect(creature).toMatchObject({
      hp: expect.any(Number),
      power: expect.any(Number),
      moves: expect.any(Array),
      effects: [],
    });

    expect(creature?.moves.length).toBeGreaterThan(0);

    expect(creature?.moves[0]).toHaveProperty('modifierStat');
    expect(creature?.moves[0]).toHaveProperty('modifierOperation');
    expect(creature?.moves[0]).toHaveProperty('modifierDurationTurns');

    expect(powerCard).toMatchObject({
      hp: null,
      power: null,
      moves: [],
      effects: expect.any(Array),
    });

    expect(powerCard?.effects.length).toBeGreaterThan(0);

    expect(powerCard?.effects[0]).toHaveProperty('modifierStat');
    expect(powerCard?.effects[0]).toHaveProperty('modifierOperation');
    expect(powerCard?.effects[0]).toHaveProperty('modifierDurationTurns');
  });
});

async function insertCataloguePlayer(
  config: DatabaseConfig,
  playerId: string,
  subject: string,
) {
  await withDatabaseClient(config, async (client) => {
    await client.query(
      `
        insert into public.players (
          id,
          auth_issuer,
          auth_subject,
          role
        )
        values (
          $1::uuid,
          'https://issuer.example/',
          $2,
          'player'
        )
      `,
      [playerId, subject],
    );
  });
}
