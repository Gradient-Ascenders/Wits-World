import { createHash } from 'node:crypto';

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
import {
  createCardEvolutionService,
  EvolutionCopiesDeckLockedError,
  EvolutionNotAvailableError,
  EvolutionReplayConflictError,
  InsufficientEvolutionCopiesError,
} from '../src/cards/card-evolution.js';
import { createDeckService } from '../src/cards/deck-service.js';
import type { OwnedCard } from '../src/cards/card-types.js';
import {
  completeCatalogueCardIds as canonicalCardIds,
  completeCatalogueCards,
} from './fixtures/complete-card-catalogue.js';

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
const EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000012';
const LOCKED_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000013';
const CONCURRENT_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000014';
const INSUFFICIENT_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000015';
const ROLLBACK_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000016';
const REPLAY_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000017';
const DECK_RACE_EVOLUTION_PLAYER_ID = '70000000-0000-4000-8000-000000000018';
const QUILLIP_DEFINITION_ID = '84790040-6ea8-6155-c4b7-dec3a22ac3ab';
const QUILLUME_DEFINITION_ID = '33546c11-4a85-7d2b-ad67-df2684ae1039';
const REPLAY_TARGET_DEFINITION_ID = 'e6000000-0000-4000-8000-000000000070';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const APPROVED_CATALOGUE_EXECUTION_SHA256 =
  'd84f604ae30cf8f40a3b725949a5b9094346f8854fa764e35003cdc7802be042';

describe.skipIf(!runIntegrationTests)('card catalogue integration', () => {
  let administrationConfig: DatabaseConfig;
  let migrationResult: MigrationResult;
  let temporaryConfig: DatabaseConfig;
  let temporaryDatabaseName: string;
  let cataloguePool: ReturnType<typeof createDatabasePool>;
  let starterService: ReturnType<typeof createStarterGrantService>;
  let collectionService: ReturnType<typeof createCardCollectionService>;
  let evolutionService: ReturnType<typeof createCardEvolutionService>;

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
    evolutionService = createCardEvolutionService(cataloguePool);

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
    expect(migrationResult.applied).toContain(
      '0041_complete_card_catalogue.sql',
    );
    expect(migrationResult.applied).toContain(
      '0042_implement_card_evolution.sql',
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

  it('seeds the exact approved 30-card release with eligibility and evolution metadata', async () => {
    const definitions = await cataloguePool.query<{
      affinity: string | null;
      category: string;
      cpu_eligible: boolean;
      evolves_from_definition_id: string | null;
      hp: number | null;
      id: string;
      name: string;
      power: number | null;
      rarity: string;
      reward_eligible: boolean;
      starter_eligible: boolean;
    }>(
      `select id::text, name, category, affinity, rarity, hp, power,
              starter_eligible, reward_eligible, cpu_eligible,
              evolves_from_definition_id::text
         from public.card_definitions
        where catalogue_class = 'ordinary'
          and is_active = true
          and authoring_status = 'published'
        order by id`,
      [],
    );

    expect(definitions.rows).toEqual(
      completeCatalogueCards
        .map((card) => ({
          affinity: card.affinity,
          category: card.category,
          cpu_eligible: card.cpuEligible,
          evolves_from_definition_id: card.evolvesFromDefinitionId,
          hp: card.hp,
          id: card.id,
          name: card.name,
          power: card.power,
          rarity: card.rarity,
          reward_eligible: card.rewardEligible,
          starter_eligible: card.starterEligible,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it('keeps every Creature battle-ready with four moves and ordered executable effects', async () => {
    const result = await cataloguePool.query<{
      creature_count: number;
      invalid_count: number;
    }>(
      `select
         count(*)::int as creature_count,
         count(*) filter (
           where move_count <> 4
              or positions <> array[1, 2, 3, 4]::smallint[]
              or moves_without_effects <> 0
         )::int as invalid_count
       from (
         select definition.id,
                count(move.*)::int as move_count,
                array_agg(move.position order by move.position) as positions,
                count(*) filter (
                  where not exists (
                    select 1
                      from public.card_move_effects effect
                     where effect.card_move_id = move.id
                       and btrim(effect.rules_text) <> ''
                  )
                )::int as moves_without_effects
           from public.card_definitions definition
           left join public.card_moves move
             on move.card_definition_id = definition.id
          where definition.id = any($1::uuid[])
            and definition.category = 'creature'
          group by definition.id
       ) creatures`,
      [canonicalCardIds],
    );

    expect(result.rows).toEqual([{ creature_count: 24, invalid_count: 0 }]);
  });

  it('matches the exact approved move costs and ordered effect metadata', async () => {
    const result = await cataloguePool.query<{
      effect_count: number;
      execution_contract: string;
    }>(
      `with execution_effects as (
         select definition.id::text as card_definition_id,
                definition.name as card_name,
                definition.category,
                move.position as source_position,
                move.name as source_name,
                move.move_type as source_type,
                move.power_cost,
                move.effect_type as legacy_effect_type,
                move.effect_value as legacy_effect_value,
                move.modifier_stat as legacy_modifier_stat,
                move.modifier_operation as legacy_modifier_operation,
                move.modifier_duration_turns as legacy_modifier_duration_turns,
                move.rules_text as source_rules_text,
                effect.position as effect_position,
                effect.effect_code,
                effect.effect_value,
                effect.effect_config::text as effect_config,
                effect.rules_text as effect_rules_text
           from public.card_definitions definition
           join public.card_moves move
             on move.card_definition_id = definition.id
           join public.card_move_effects effect
             on effect.card_move_id = move.id
            and effect.card_definition_id = definition.id
          where definition.id = any($1::uuid[])
         union all
         select definition.id::text,
                definition.name,
                definition.category,
                effect.position,
                null,
                null,
                null,
                effect.effect_type,
                effect.effect_value,
                effect.modifier_stat,
                effect.modifier_operation,
                effect.modifier_duration_turns,
                null,
                effect.position,
                effect.effect_code,
                effect.effect_value,
                effect.effect_config::text,
                effect.rules_text
           from public.card_definitions definition
           join public.card_effects effect
             on effect.card_definition_id = definition.id
          where definition.id = any($1::uuid[])
       )
       select count(*)::int as effect_count,
              jsonb_agg(
                to_jsonb(execution_effects)
                order by card_definition_id, source_position, effect_position
              )::text as execution_contract
         from execution_effects`,
      [canonicalCardIds],
    );
    const contract = result.rows[0];

    expect(contract?.effect_count).toBeGreaterThan(100);
    expect(
      createHash('sha256')
        .update(contract?.execution_contract ?? '')
        .digest('hex'),
    ).toBe(APPROVED_CATALOGUE_EXECUTION_SHA256);
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

  it('seeds the approved rarity distribution and shared typeless starters', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        category: string;
        count: string;
        rarity: string;
      }>(
        `select category, rarity, count(*)::text as count
           from public.card_definitions
          where is_active = true
            and catalogue_class = 'ordinary'
          group by category, rarity
          order by category, rarity`,
      );

      expect(result.rows).toEqual([
        { category: 'creature', count: '11', rarity: 'common' },
        { category: 'creature', count: '5', rarity: 'epic' },
        { category: 'creature', count: '3', rarity: 'legendary' },
        { category: 'creature', count: '5', rarity: 'rare' },
        { category: 'power', count: '3', rarity: 'common' },
        { category: 'power', count: '1', rarity: 'epic' },
        { category: 'power', count: '1', rarity: 'legendary' },
        { category: 'power', count: '1', rarity: 'rare' },
      ]);

      const starters = await client.query<{
        affinity: string | null;
        category: string;
        count: string;
      }>(
        `select affinity, category, count(*)::text as count
           from public.card_definitions
          where starter_eligible = true
          group by affinity, category
          order by affinity nulls last, category`,
      );
      expect(starters.rows).toEqual([
        { affinity: 'grit', category: 'creature', count: '3' },
        { affinity: 'spark', category: 'creature', count: '3' },
        { affinity: 'wit', category: 'creature', count: '3' },
        { affinity: null, category: 'power', count: '2' },
      ]);
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
    expect(first.grant.cards.every((card) => card.rarity === 'common')).toBe(
      true,
    );
    expect(
      first.grant.cards
        .filter((card) => card.category === 'creature')
        .every((card) => card.affinity === 'wit'),
    ).toBe(true);
    expect(
      first.grant.cards
        .filter((card) => card.category === 'power')
        .every((card) => card.affinity === null),
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
          where (
              definition.category = 'creature'
              and definition.affinity = 'spirit'
            )
             or definition.id in (
               '0d28241f-a4f2-2cf3-52bc-dee1633b3316'::uuid,
               'b7485793-8432-2db9-5f99-974164efa788'::uuid
             )
          order by definition.category, definition.id`,
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
    expect(
      collection.every((card) =>
        card.category === 'creature'
          ? card.affinity === 'spirit'
          : card.affinity === null,
      ),
    ).toBe(true);
  });

  it('stores complete ordered Power-card effects and player-readable rules', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const result = await client.query<{
        effect_code: string;
        effect_value: number | null;
        position: number;
        rules_text: string;
      }>(
        `select effect.position,
                effect.effect_code,
                effect.effect_value,
                effect.rules_text
           from public.card_effects effect
           join public.card_definitions definition
             on definition.id = effect.card_definition_id
          where definition.name = 'Grand Strategy'
          order by effect.position`,
      );

      expect(result.rows).toEqual([
        {
          effect_code: 'heal',
          effect_value: 20,
          position: 1,
          rules_text: 'Heal the active Creature by 20 HP.',
        },
        {
          effect_code: 'power_change',
          effect_value: 3,
          position: 2,
          rules_text: 'Restore 3 Power to the active Creature.',
        },
        {
          effect_code: 'damage_modifier',
          effect_value: 20,
          position: 3,
          rules_text:
            'The active Creature deals 20% more damage during its next 2 turns.',
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
    expect(result.grant.cards.every((card) => card.rarity === 'common')).toBe(
      true,
    );
    expect(
      result.grant.cards
        .filter((card) => card.category === 'creature')
        .every((card) => card.affinity === 'grit'),
    ).toBe(true);
    expect(
      result.grant.cards
        .filter((card) => card.category === 'power')
        .every((card) => card.affinity === null),
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

  it('atomically consumes the three newest eligible copies and replays by submission id', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      EVOLUTION_PLAYER_ID,
      'evolution-player',
    );
    const copies = await insertEvolutionRewardCopies(
      temporaryConfig,
      EVOLUTION_PLAYER_ID,
      'e1000000',
      4,
    );
    const submissionId = 'e1000000-0000-4000-8000-000000000090';

    const preview = await evolutionService.previewEvolution(
      EVOLUTION_PLAYER_ID,
      QUILLIP_DEFINITION_ID,
    );

    expect(preview).toMatchObject({
      copiesRequired: 3,
      ownedCopyCount: 4,
      eligibleCopyCount: 4,
      deckLockedCopyCount: 0,
      canEvolve: true,
      unavailableReason: null,
      target: {
        cardDefinitionId: QUILLUME_DEFINITION_ID,
        rarity: 'epic',
        deckPointCost: 3,
      },
    });

    const result = await evolutionService.evolveCards({
      playerId: EVOLUTION_PLAYER_ID,
      submissionId,
      sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
    });

    expect(result.replayed).toBe(false);
    expect(result.consumedOwnedCardIds).toEqual(copies.slice(1).reverse());
    expect(result.newCard).toMatchObject({
      cardDefinitionId: QUILLUME_DEFINITION_ID,
      acquisitionKind: 'evolution',
    });

    await expect(
      evolutionService.evolveCards({
        playerId: EVOLUTION_PLAYER_ID,
        submissionId,
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
    ).resolves.toMatchObject({
      evolutionId: result.evolutionId,
      replayed: true,
      consumedOwnedCardIds: result.consumedOwnedCardIds,
      newCard: { ownedCardId: result.newCard.ownedCardId },
    });

    await expect(
      evolutionService.evolveCards({
        playerId: EVOLUTION_PLAYER_ID,
        submissionId,
        sourceCardDefinitionId: QUILLUME_DEFINITION_ID,
      }),
    ).rejects.toBeInstanceOf(EvolutionReplayConflictError);

    const ownership = await cataloguePool.query<{
      card_definition_id: string;
      count: string;
    }>(
      `select card_definition_id::text, count(*)::text
         from public.player_cards
        where player_id = $1::uuid
        group by card_definition_id
        order by card_definition_id`,
      [EVOLUTION_PLAYER_ID],
    );

    expect(ownership.rows).toEqual([
      { card_definition_id: QUILLUME_DEFINITION_ID, count: '1' },
      { card_definition_id: QUILLIP_DEFINITION_ID, count: '1' },
    ]);

    const starter = await starterService.selectStarter({
      playerId: EVOLUTION_PLAYER_ID,
      affinity: 'wit',
    });
    const starterCreatures = starter.grant.cards.filter(
      (card) => card.category === 'creature',
    );
    const starterPowerCards = starter.grant.cards.filter(
      (card) => card.category === 'power',
    );
    const deck = await createDeckService(cataloguePool).createDeck({
      playerId: EVOLUTION_PLAYER_ID,
      name: 'Evolved deck',
      ownedCardIds: [
        result.newCard.ownedCardId,
        ...starterCreatures.slice(0, 2).map((card) => card.ownedCardId),
        ...starterPowerCards.map((card) => card.ownedCardId),
      ],
    });

    expect(deck).toMatchObject({ totalPoints: 7 });
    expect(deck.cards).toContainEqual(
      expect.objectContaining({
        ownedCardId: result.newCard.ownedCardId,
        cardDefinitionId: QUILLUME_DEFINITION_ID,
        rarity: 'epic',
      }),
    );
  }, 30_000);

  it('replays the immutable grant after the evolved owned copy is later consumed', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      REPLAY_EVOLUTION_PLAYER_ID,
      'replay-evolution-player',
    );
    await insertEvolutionRewardCopies(
      temporaryConfig,
      REPLAY_EVOLUTION_PLAYER_ID,
      'e6000000',
      3,
    );
    const submissionId = 'e6000000-0000-4000-8000-000000000090';
    const original = await evolutionService.evolveCards({
      playerId: REPLAY_EVOLUTION_PLAYER_ID,
      submissionId,
      sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
    });

    await cataloguePool.query(
      `insert into public.card_definitions (
         id, name, category, affinity, rarity, hp, power, description,
         is_active, authoring_status, publication_provenance, catalogue_class,
         starter_eligible, reward_eligible, cpu_eligible,
         evolves_from_definition_id, evolution_copies_required
       ) values (
         $1::uuid, 'Replay-only evolution target', 'creature', 'wit',
         'legendary', 100, 3, 'Test-only second-stage evolution target.',
         false, 'draft', null, 'ordinary', false, false, false,
         $2::uuid, 3
       )`,
      [REPLAY_TARGET_DEFINITION_ID, QUILLUME_DEFINITION_ID],
    );
    await cataloguePool.query(
      `insert into public.card_moves (
         id, card_definition_id, position, name, move_type, effect_type,
         effect_value, modifier_stat, modifier_operation,
         modifier_duration_turns, power_cost, rules_text
       )
       select
         gen_random_uuid(), $1::uuid, position, name, move_type, effect_type,
         effect_value, modifier_stat, modifier_operation,
         modifier_duration_turns, power_cost, rules_text
       from public.card_moves
       where card_definition_id = $2::uuid
       order by position`,
      [REPLAY_TARGET_DEFINITION_ID, QUILLUME_DEFINITION_ID],
    );
    await cataloguePool.query(
      `update public.card_definitions
          set authoring_status = 'published',
              publication_provenance = 'controlled_seed',
              is_active = true,
              version = version + 1,
              updated_at = now()
        where id = $1::uuid`,
      [REPLAY_TARGET_DEFINITION_ID],
    );
    await cataloguePool.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, source_completion_id,
         acquisition_kind, acquired_at
       ) values
         ('e6000000-0000-4000-8000-000000000020', $1::uuid, $2::uuid,
          'e6000000-0000-4000-8000-000000000004', 'event_reward',
          '2026-09-06T08:02:00.000Z'),
         ('e6000000-0000-4000-8000-000000000021', $1::uuid, $2::uuid,
          'e6000000-0000-4000-8000-000000000004', 'event_reward',
          '2026-09-06T08:03:00.000Z')`,
      [REPLAY_EVOLUTION_PLAYER_ID, QUILLUME_DEFINITION_ID],
    );

    const laterEvolution = await evolutionService.evolveCards({
      playerId: REPLAY_EVOLUTION_PLAYER_ID,
      submissionId: 'e6000000-0000-4000-8000-000000000091',
      sourceCardDefinitionId: QUILLUME_DEFINITION_ID,
    });

    expect(laterEvolution.consumedOwnedCardIds).toContain(
      original.newCard.ownedCardId,
    );

    await expect(
      evolutionService.evolveCards({
        playerId: REPLAY_EVOLUTION_PLAYER_ID,
        submissionId,
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
    ).resolves.toEqual({
      ...original,
      replayed: true,
    });
  }, 30_000);

  it('rejects a non-source definition and fewer than three owned copies', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      INSUFFICIENT_EVOLUTION_PLAYER_ID,
      'insufficient-evolution-player',
    );
    await insertEvolutionRewardCopies(
      temporaryConfig,
      INSUFFICIENT_EVOLUTION_PLAYER_ID,
      'e4000000',
      2,
    );

    await expect(
      evolutionService.evolveCards({
        playerId: INSUFFICIENT_EVOLUTION_PLAYER_ID,
        submissionId: 'e4000000-0000-4000-8000-000000000090',
        sourceCardDefinitionId: QUILLUME_DEFINITION_ID,
      }),
    ).rejects.toBeInstanceOf(EvolutionNotAvailableError);

    await expect(
      evolutionService.evolveCards({
        playerId: INSUFFICIENT_EVOLUTION_PLAYER_ID,
        submissionId: 'e4000000-0000-4000-8000-000000000091',
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
    ).rejects.toBeInstanceOf(InsufficientEvolutionCopiesError);
  }, 30_000);

  it('reports deck-locked source copies without consuming any ownership', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      LOCKED_EVOLUTION_PLAYER_ID,
      'locked-evolution-player',
    );
    const copies = await insertEvolutionRewardCopies(
      temporaryConfig,
      LOCKED_EVOLUTION_PLAYER_ID,
      'e2000000',
      3,
    );
    const deckId = 'e2000000-0000-4000-8000-000000000080';

    await cataloguePool.query(
      `insert into public.player_decks (id, player_id, name)
       values ($1::uuid, $2::uuid, 'Protected copies')`,
      [deckId, LOCKED_EVOLUTION_PLAYER_ID],
    );
    await cataloguePool.query(
      `insert into public.player_deck_cards (
         deck_id, player_id, owned_card_id, position
       ) values ($1::uuid, $2::uuid, $3::uuid, 1)`,
      [deckId, LOCKED_EVOLUTION_PLAYER_ID, copies[0]],
    );

    await expect(
      evolutionService.previewEvolution(
        LOCKED_EVOLUTION_PLAYER_ID,
        QUILLIP_DEFINITION_ID,
      ),
    ).resolves.toMatchObject({
      ownedCopyCount: 3,
      eligibleCopyCount: 2,
      deckLockedCopyCount: 1,
      canEvolve: false,
      unavailableReason: 'saved_deck_lock',
    });

    await expect(
      evolutionService.evolveCards({
        playerId: LOCKED_EVOLUTION_PLAYER_ID,
        submissionId: 'e2000000-0000-4000-8000-000000000090',
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
    ).rejects.toBeInstanceOf(EvolutionCopiesDeckLockedError);

    const remaining = await cataloguePool.query<{ count: string }>(
      `select count(*)::text as count
         from public.player_cards
        where player_id = $1::uuid
          and card_definition_id = $2::uuid`,
      [LOCKED_EVOLUTION_PLAYER_ID, QUILLIP_DEFINITION_ID],
    );
    expect(remaining.rows[0]?.count).toBe('3');
  }, 30_000);

  it('keeps ownership and saved decks consistent when deck save races evolution', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      DECK_RACE_EVOLUTION_PLAYER_ID,
      'deck-race-evolution-player',
    );
    const copies = await insertEvolutionRewardCopies(
      temporaryConfig,
      DECK_RACE_EVOLUTION_PLAYER_ID,
      'e7000000',
      3,
    );
    const deckId = 'e7000000-0000-4000-8000-000000000080';

    await cataloguePool.query(
      `insert into public.player_decks (id, player_id, name)
       values ($1::uuid, $2::uuid, 'Concurrent protection')`,
      [deckId, DECK_RACE_EVOLUTION_PLAYER_ID],
    );

    const [evolutionAttempt, deckSaveAttempt] = await Promise.allSettled([
      evolutionService.evolveCards({
        playerId: DECK_RACE_EVOLUTION_PLAYER_ID,
        submissionId: 'e7000000-0000-4000-8000-000000000090',
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
      cataloguePool.query(
        `insert into public.player_deck_cards (
           deck_id, player_id, owned_card_id, position
         ) values ($1::uuid, $2::uuid, $3::uuid, 1)`,
        [deckId, DECK_RACE_EVOLUTION_PLAYER_ID, copies[0]],
      ),
    ]);

    expect(
      [evolutionAttempt, deckSaveAttempt].filter(
        (attempt) => attempt.status === 'fulfilled',
      ),
    ).toHaveLength(1);

    if (evolutionAttempt.status === 'fulfilled') {
      expect(deckSaveAttempt).toMatchObject({
        status: 'rejected',
        reason: {
          code: '23503',
          constraint: 'player_deck_cards_owned_copy_fk',
        },
      });
    } else {
      expect(evolutionAttempt.reason).toBeInstanceOf(
        EvolutionCopiesDeckLockedError,
      );
      expect(deckSaveAttempt.status).toBe('fulfilled');
    }

    const persisted = await cataloguePool.query<{
      deck_membership_count: string;
      evolution_count: string;
      source_count: string;
      target_count: string;
    }>(
      `select
         (select count(*) from public.card_evolution_transactions
           where player_id = $1::uuid)::text as evolution_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $2::uuid)::text as source_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $3::uuid)::text as target_count,
         (select count(*) from public.player_deck_cards
           where player_id = $1::uuid
             and owned_card_id = $4::uuid)::text as deck_membership_count`,
      [
        DECK_RACE_EVOLUTION_PLAYER_ID,
        QUILLIP_DEFINITION_ID,
        QUILLUME_DEFINITION_ID,
        copies[0],
      ],
    );

    expect(persisted.rows[0]).toEqual(
      evolutionAttempt.status === 'fulfilled'
        ? {
            deck_membership_count: '0',
            evolution_count: '1',
            source_count: '0',
            target_count: '1',
          }
        : {
            deck_membership_count: '1',
            evolution_count: '0',
            source_count: '3',
            target_count: '0',
          },
    );
  }, 30_000);

  it('serializes concurrent evolutions so three copies produce one target', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      CONCURRENT_EVOLUTION_PLAYER_ID,
      'concurrent-evolution-player',
    );
    await insertEvolutionRewardCopies(
      temporaryConfig,
      CONCURRENT_EVOLUTION_PLAYER_ID,
      'e3000000',
      3,
    );

    const attempts = await Promise.allSettled([
      evolutionService.evolveCards({
        playerId: CONCURRENT_EVOLUTION_PLAYER_ID,
        submissionId: 'e3000000-0000-4000-8000-000000000090',
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
      evolutionService.evolveCards({
        playerId: CONCURRENT_EVOLUTION_PLAYER_ID,
        submissionId: 'e3000000-0000-4000-8000-000000000091',
        sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
      }),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(InsufficientEvolutionCopiesError),
    });

    const persisted = await cataloguePool.query<{
      evolution_count: string;
      source_count: string;
      target_count: string;
    }>(
      `select
         (select count(*) from public.card_evolution_transactions
           where player_id = $1::uuid)::text as evolution_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $2::uuid)::text as source_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $3::uuid)::text as target_count`,
      [
        CONCURRENT_EVOLUTION_PLAYER_ID,
        QUILLIP_DEFINITION_ID,
        QUILLUME_DEFINITION_ID,
      ],
    );

    expect(persisted.rows[0]).toEqual({
      evolution_count: '1',
      source_count: '0',
      target_count: '1',
    });
  }, 30_000);

  it('rolls back consumption and history when the evolved grant fails', async () => {
    await insertCataloguePlayer(
      temporaryConfig,
      ROLLBACK_EVOLUTION_PLAYER_ID,
      'rollback-evolution-player',
    );
    await insertEvolutionRewardCopies(
      temporaryConfig,
      ROLLBACK_EVOLUTION_PLAYER_ID,
      'e5000000',
      3,
    );
    await cataloguePool.query(`
      create function public.reject_test_evolution_grant()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'forced evolution grant failure';
      end;
      $$;

      create trigger reject_test_evolution_grant
      before insert on public.player_cards
      for each row
      when (new.acquisition_kind = 'evolution')
      execute function public.reject_test_evolution_grant();
    `);

    try {
      await expect(
        evolutionService.evolveCards({
          playerId: ROLLBACK_EVOLUTION_PLAYER_ID,
          submissionId: 'e5000000-0000-4000-8000-000000000090',
          sourceCardDefinitionId: QUILLIP_DEFINITION_ID,
        }),
      ).rejects.toThrow('forced evolution grant failure');
    } finally {
      await cataloguePool.query(
        'drop trigger reject_test_evolution_grant on public.player_cards',
      );
      await cataloguePool.query(
        'drop function public.reject_test_evolution_grant()',
      );
    }

    const persisted = await cataloguePool.query<{
      consumption_count: string;
      evolution_count: string;
      source_count: string;
      target_count: string;
    }>(
      `select
         (select count(*) from public.card_evolution_transactions
           where player_id = $1::uuid)::text as evolution_count,
         (select count(*) from public.card_evolution_consumptions
           where player_id = $1::uuid)::text as consumption_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $2::uuid)::text as source_count,
         (select count(*) from public.player_cards
           where player_id = $1::uuid
             and card_definition_id = $3::uuid)::text as target_count`,
      [
        ROLLBACK_EVOLUTION_PLAYER_ID,
        QUILLIP_DEFINITION_ID,
        QUILLUME_DEFINITION_ID,
      ],
    );

    expect(persisted.rows[0]).toEqual({
      consumption_count: '0',
      evolution_count: '0',
      source_count: '3',
      target_count: '0',
    });
  }, 30_000);

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
      rulesText: move.rulesText ?? null,
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
      rulesText: effect.rulesText ?? null,
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

async function insertEvolutionRewardCopies(
  config: DatabaseConfig,
  playerId: string,
  namespace: string,
  copyCount: number,
): Promise<string[]> {
  const eventId = `${namespace}-0000-4000-8000-000000000001`;
  const challengeId = `${namespace}-0000-4000-8000-000000000002`;
  const attemptId = `${namespace}-0000-4000-8000-000000000003`;
  const completionId = `${namespace}-0000-4000-8000-000000000004`;
  const ownedCardIds = Array.from(
    { length: copyCount },
    (_, index) =>
      `${namespace}-0000-4000-8000-${String(10 + index).padStart(12, '0')}`,
  );

  await withDatabaseClient(config, async (client) => {
    await client.query('begin');

    try {
      await client.query(
        `insert into public.events (
           id, title, location, radius_metres, starts_at, ends_at, is_published,
           authoring_status, publication_provenance
         ) values (
           $1::uuid,
           'Evolution fixture',
           st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
           75,
           '2026-01-01T00:00:00.000Z',
           '2027-01-01T00:00:00.000Z',
           true,
           'published',
           'controlled_seed'
         )`,
        [eventId],
      );
      await client.query(
        `insert into public.event_challenges (id, event_id, status)
         values ($1::uuid, $2::uuid, 'draft')`,
        [challengeId, eventId],
      );
      await client.query(
        'alter table public.challenge_attempts disable trigger challenge_attempts_snapshot_integrity',
      );
      await client.query(
        `insert into public.challenge_attempts (
           id, player_id, event_id, challenge_id, status, started_at,
           deadline, time_limit_seconds, average_difficulty, completed_at,
           completion_reason, score_correct, created_at, updated_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'completed',
           '2026-08-15T08:00:00.000Z', '2026-08-15T08:01:30.000Z',
           90, 1.00, '2026-08-15T08:01:00.000Z', 'answered', 5,
           '2026-08-15T08:00:00.000Z', '2026-08-15T08:01:00.000Z'
         )`,
        [attemptId, playerId, eventId, challengeId],
      );
      await client.query(
        'alter table public.challenge_attempts enable trigger challenge_attempts_snapshot_integrity',
      );
      await client.query(
        `insert into public.event_completions (
           id, attempt_id, player_id, event_id, score_correct,
           average_difficulty, coins_awarded, reward_policy_version,
           completed_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, 5,
           1.00, 0, 'evolution-test', '2026-08-15T08:01:00.000Z'
         )`,
        [completionId, attemptId, playerId, eventId],
      );

      for (const [index, ownedCardId] of ownedCardIds.entries()) {
        await client.query(
          `insert into public.player_cards (
             id, player_id, card_definition_id, source_completion_id,
             acquisition_kind, acquired_at
           ) values (
             $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'event_reward',
             '2026-08-15T08:02:00.000Z'::timestamptz
               + ($5::int * interval '1 minute')
           )`,
          [ownedCardId, playerId, QUILLIP_DEFINITION_ID, completionId, index],
        );
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });

  return ownedCardIds;
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
