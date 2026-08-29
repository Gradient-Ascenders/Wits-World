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
import { starterPackageDefinitions } from '../src/cards/starter-packages.js';

import { createCardCollectionService } from '../src/cards/card-collection.js';
import type { OwnedCard } from '../src/cards/card-types.js';
import {
  canonicalCardIds,
  canonicalCreatures,
  canonicalPowerCards,
} from './fixtures/canonical-card-roster.js';

const PLAYER_ID = '70000000-0000-4000-8000-000000000001';
const CONCURRENT_PLAYER_ID = '70000000-0000-4000-8000-000000000002';
const COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000003';
const OTHER_COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000004';
const EMPTY_COLLECTION_PLAYER_ID = '70000000-0000-4000-8000-000000000005';
const MUTATION_RACE_PLAYER_ID = '70000000-0000-4000-8000-000000000006';
const OPTION_PLAYER_IDS = [
  '70000000-0000-4000-8000-000000000007',
  '70000000-0000-4000-8000-000000000008',
  '70000000-0000-4000-8000-000000000009',
] as const;
const HISTORICAL_SPIRIT_PLAYER_ID = '70000000-0000-4000-8000-000000000010';
const HISTORICAL_SPIRIT_GRANT_ID = '70000000-0000-4000-8000-000000000011';

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
    expect(migrationResult.applied).toContain(
      '0023_rebalance_canonical_card_roster.sql',
    );
    expect(
      migrationResult.applied.indexOf(
        '0017_resolve_edge_card_definition_name.sql',
      ),
    ).toBeLessThan(
      migrationResult.applied.indexOf(
        '0018_enforce_card_definition_name_uniqueness.sql',
      ),
    );
  });

  it('seeds the exact approved canonical IDs, stats, ordered moves, and ordered Power effects', async () => {
    const definitions = await cataloguePool.query<{
      affinity: string;
      category: string;
      hp: number | null;
      id: string;
      name: string;
      power: number | null;
      rarity: string;
    }>(
      `select id::text, name, category, affinity, rarity, hp, power
         from public.card_definitions
        where id = any($1::uuid[])
        order by id`,
      [canonicalCardIds],
    );
    const moves = await cataloguePool.query<{
      card_definition_id: string;
      effect_type: string;
      effect_value: number;
      modifier_duration_turns: number | null;
      modifier_operation: string | null;
      modifier_stat: string | null;
      move_type: string;
      name: string;
      position: number;
      power_cost: number;
    }>(
      `select card_definition_id::text, position, name, move_type,
              effect_type, effect_value, modifier_stat,
              modifier_operation, modifier_duration_turns, power_cost
         from public.card_moves
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position`,
      [canonicalCardIds],
    );
    const effects = await cataloguePool.query<{
      card_definition_id: string;
      effect_type: string;
      effect_value: number;
      modifier_duration_turns: number | null;
      modifier_operation: string | null;
      modifier_stat: string | null;
      position: number;
    }>(
      `select card_definition_id::text, position, effect_type, effect_value,
              modifier_stat, modifier_operation, modifier_duration_turns
         from public.card_effects
        where card_definition_id = any($1::uuid[])
        order by card_definition_id, position`,
      [canonicalCardIds],
    );

    expect(definitions.rows).toEqual(
      [
        ...canonicalCreatures.map((card) => ({
          id: card.id,
          name: card.name,
          category: 'creature',
          affinity: card.affinity,
          rarity: card.rarity,
          hp: card.hp,
          power: card.power,
        })),
        ...canonicalPowerCards.map((card) => ({
          id: card.id,
          name: card.name,
          category: 'power',
          affinity: card.affinity,
          rarity: card.rarity,
          hp: null,
          power: null,
        })),
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(moves.rows).toEqual(
      canonicalCreatures
        .flatMap((card) =>
          card.moves.map((move, index) => ({
            card_definition_id: card.id,
            position: index + 1,
            name: move[0],
            move_type: move[1],
            effect_type: move[2],
            effect_value: move[3],
            modifier_stat: move[4],
            modifier_operation: move[5],
            modifier_duration_turns: move[6],
            power_cost: move[7],
          })),
        )
        .sort(
          (left, right) =>
            left.card_definition_id.localeCompare(right.card_definition_id) ||
            left.position - right.position,
        ),
    );
    expect(effects.rows).toEqual(
      canonicalPowerCards
        .flatMap((card) =>
          card.effects.map((effect, index) => ({
            card_definition_id: card.id,
            position: index + 1,
            effect_type: effect[0],
            effect_value: effect[1],
            modifier_stat: effect[2],
            modifier_operation: effect[3],
            modifier_duration_turns: effect[4],
          })),
        )
        .sort(
          (left, right) =>
            left.card_definition_id.localeCompare(right.card_definition_id) ||
            left.position - right.position,
        ),
    );
  });

  it('keeps all 18 canonical Creatures battle-ready with four ordered, non-null moves', async () => {
    const result = await cataloguePool.query<{
      creature_count: number;
      invalid_count: number;
    }>(
      `select
         count(*)::int as creature_count,
         count(*) filter (
           where move_count <> 4
              or positions <> array[1, 2, 3, 4]::smallint[]
              or null_effect_count <> 0
         )::int as invalid_count
       from (
         select definition.id,
                count(move.*)::int as move_count,
                array_agg(move.position order by move.position) as positions,
                count(*) filter (where move.effect_value is null)::int
                  as null_effect_count
           from public.card_definitions definition
           left join public.card_moves move
             on move.card_definition_id = definition.id
          where definition.id = any($1::uuid[])
            and definition.category = 'creature'
          group by definition.id
       ) creatures`,
      [canonicalCardIds],
    );

    expect(result.rows).toEqual([{ creature_count: 18, invalid_count: 0 }]);
  });

  it('is repeatable without changing canonical definitions or ordered children', async () => {
    const before = await canonicalCatalogueFingerprint(cataloguePool);
    await runSeeds(temporaryConfig);
    const after = await canonicalCatalogueFingerprint(cataloguePool);

    expect(after).toEqual(before);
  });

  it('keeps deterministic catalogue seeds free of normalized duplicate names', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        duplicate_group_count: number;
      }>(
        `select count(*)::int as duplicate_group_count
           from (
             select lower(btrim(name))
               from public.card_definitions
              group by lower(btrim(name))
             having count(*) > 1
           ) duplicate_groups`,
      );

      expect(result.rows).toEqual([{ duplicate_group_count: 0 }]);
    });
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

  it('previews exactly the Spark, Grit, and Wit packages used by grants', async () => {
    const options = await starterService.listStarterOptions();

    expect(options.map((option) => option.affinity)).toEqual([
      'spark',
      'grit',
      'wit',
    ]);

    for (const [index, option] of options.entries()) {
      const playerId = OPTION_PLAYER_IDS[index];
      if (!playerId) {
        throw new Error('Missing starter-option test player.');
      }
      await insertCataloguePlayer(
        temporaryConfig,
        playerId,
        `starter-option-player-${index}`,
      );

      const selection = await starterService.selectStarter({
        playerId,
        affinity: option.affinity,
      });
      const configuredPackage = starterPackageDefinitions[option.affinity];
      const configuredDefinitionIds = [
        ...configuredPackage.creatureDefinitionIds,
        ...configuredPackage.powerCardDefinitionIds,
      ];
      const creatures = selection.grant.cards
        .filter((card) => card.category === 'creature')
        .map(toStarterCreaturePreview);
      const powerCards = selection.grant.cards
        .filter((card) => card.category === 'power')
        .map(toStarterPowerPreview);

      expect(option.composition).toEqual({
        creatureCount: 3,
        powerCardCount: 2,
      });
      expect(option.creatures).toEqual(creatures);
      expect(option.powerCards).toEqual(powerCards);
      expect(
        new Set(selection.grant.cards.map((card) => card.cardDefinitionId)),
      ).toEqual(new Set(configuredDefinitionIds));
    }
  }, 30_000);

  it('keeps a historical Spirit grant readable and idempotent', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      HISTORICAL_SPIRIT_PLAYER_ID,
      'historical-spirit-player',
    );
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.player_starter_grants (id, player_id, affinity)
         values ($1::uuid, $2::uuid, 'spirit')`,
        [HISTORICAL_SPIRIT_GRANT_ID, HISTORICAL_SPIRIT_PLAYER_ID],
      );
      await client.query(
        `insert into public.player_cards (
           player_id,
           card_definition_id,
           source_starter_grant_id,
           acquisition_kind
         )
         select $1::uuid, definition.id, $2::uuid, 'starter'
           from public.card_definitions definition
          where definition.is_active = true
            and definition.affinity = 'spirit'
            and definition.rarity = 'common'`,
        [HISTORICAL_SPIRIT_PLAYER_ID, HISTORICAL_SPIRIT_GRANT_ID],
      );
    });

    const retry = await starterService.selectStarter({
      playerId: HISTORICAL_SPIRIT_PLAYER_ID,
      affinity: 'spirit',
    });
    const collection = await collectionService.listOwnedCards(
      HISTORICAL_SPIRIT_PLAYER_ID,
    );

    expect(retry.created).toBe(false);
    expect(retry.grant).toMatchObject({
      affinity: 'spirit',
      cards: expect.arrayContaining([]),
    });
    expect(retry.grant.cards).toHaveLength(5);
    expect(collection).toHaveLength(5);
    expect(collection.every((card) => card.affinity === 'spirit')).toBe(true);
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
          effect_value: 15,
          modifier_duration_turns: 2,
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
          and affinity = 'grit'
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
              normalized.includes('definition.id = any($1::uuid[])') &&
              normalized.includes('for share of definition')
            ) {
              announceCandidateLocks();
              await selectionMayContinue;
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
      affinity: 'grit',
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
        (card) => card.affinity === 'grit' && card.rarity === 'common',
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

  it('keeps seeded active cards published in the authoring lifecycle', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        invalid_count: string;
      }>(
        `
          select count(*)::text as invalid_count
          from public.card_definitions
          where is_active is distinct from (authoring_status = 'published')
        `,
      );

      expect(result.rows[0]?.invalid_count).toBe('0');
    });
  });

  it('prevents published card content from being edited directly', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const card = await client.query<{
        id: string;
      }>(
        `
          select id::text as id
          from public.card_definitions
          where authoring_status = 'published'
          order by id
          limit 1
        `,
      );

      const cardId = card.rows[0]?.id;

      if (!cardId) {
        throw new Error('Expected a published seeded card.');
      }

      await expect(
        client.query(
          `
            update public.card_definitions
            set name = name || ' changed',
                updated_at = now()
            where id = $1::uuid
          `,
          [cardId],
        ),
      ).rejects.toThrow();
    });
  });

  it('allows published cards to retire but prevents republication', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query('begin');

      try {
        const card = await client.query<{
          id: string;
        }>(
          `
            select id::text as id
            from public.card_definitions
            where authoring_status = 'published'
            order by id
            limit 1
            for update
          `,
        );

        const cardId = card.rows[0]?.id;

        if (!cardId) {
          throw new Error('Expected a published seeded card.');
        }

        await client.query(
          `
            update public.card_definitions
            set authoring_status = 'retired',
                is_active = false,
                version = version + 1,
                updated_at = now()
            where id = $1::uuid
          `,
          [cardId],
        );

        await expect(
          client.query(
            `
              update public.card_definitions
              set authoring_status = 'published',
                  is_active = true,
                  updated_at = now()
              where id = $1::uuid
            `,
            [cardId],
          ),
        ).rejects.toThrow();
      } finally {
        await client.query('rollback');
      }
    });
  });
});

function toStarterCreaturePreview(card: OwnedCard) {
  return {
    name: card.name,
    hp: card.hp,
    power: card.power,
    moves: card.moves.map((move) => ({
      position: move.position,
      name: move.name,
      moveType: move.moveType,
      effectType: move.effectType,
      effectValue: move.effectValue,
      modifierStat: move.modifierStat,
      modifierOperation: move.modifierOperation,
      modifierDurationTurns: move.modifierDurationTurns,
      powerCost: move.powerCost,
    })),
  };
}

function toStarterPowerPreview(card: OwnedCard) {
  return {
    name: card.name,
    effects: card.effects.map((effect) => ({
      position: effect.position,
      effectType: effect.effectType,
      effectValue: effect.effectValue,
      modifierStat: effect.modifierStat,
      modifierOperation: effect.modifierOperation,
      modifierDurationTurns: effect.modifierDurationTurns,
    })),
  };
}

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

async function canonicalCatalogueFingerprint(
  pool: ReturnType<typeof createDatabasePool>,
) {
  const result = await pool.query<{ catalogue: unknown }>(
    `select jsonb_agg(to_jsonb(definition_snapshot) order by id) as catalogue
       from (
         select definition.id::text as id,
                definition.name,
                definition.category,
                definition.affinity,
                definition.rarity,
                definition.hp,
                definition.power,
                definition.description,
                definition.authoring_status,
                definition.is_active,
                coalesce((
                  select jsonb_agg(to_jsonb(move) - 'card_definition_id' order by move.position)
                    from public.card_moves move
                   where move.card_definition_id = definition.id
                ), '[]'::jsonb) as moves,
                coalesce((
                  select jsonb_agg(to_jsonb(effect) - 'card_definition_id' order by effect.position)
                    from public.card_effects effect
                   where effect.card_definition_id = definition.id
                ), '[]'::jsonb) as effects
           from public.card_definitions definition
          where definition.id = any($1::uuid[])
       ) definition_snapshot`,
    [canonicalCardIds],
  );

  return result.rows[0]?.catalogue;
}
