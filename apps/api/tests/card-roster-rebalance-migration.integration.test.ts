import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';
import { runSeeds } from '../src/database/seeds.js';
import {
  canonicalCreatures,
  canonicalPowerCards,
} from './fixtures/canonical-card-roster.js';

const ROSTER_MIGRATION = '0023_rebalance_canonical_card_roster.sql';
const CANONICAL_ID = 'eca9b943-9e05-834e-c85c-1175001d897c';
const PLAYER_ID = 'a2300000-0000-4000-8000-000000000001';
const GRANT_ID = 'a2300000-0000-4000-8000-000000000002';
const OWNED_CARD_ID = 'a2300000-0000-4000-8000-000000000003';
const MATCH_ID = 'a2300000-0000-4000-8000-000000000004';
const ROUND_ID = 'a2300000-0000-4000-8000-000000000005';
const ACTION_ID = 'a2300000-0000-4000-8000-000000000006';
const ARBITRARY_CARD_ID = 'a2300000-0000-4000-8000-000000000007';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

const temporaryDirectories: string[] = [];
let databaseNumber = 0;

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe.skipIf(!runIntegrationTests)(
  'canonical card-roster rebalance migration',
  () => {
    it('updates only stable definitions while preserving ownership and all historical match records', async () => {
      await withPreRosterMigrationDatabase(
        async (databaseConfig, directory) => {
          await runSeeds(databaseConfig);
          await plantCanonicalRoster(databaseConfig);
          await plantLegacyCatalogueAndHistory(databaseConfig);

          const historyBefore = await loadHistoricalRecords(databaseConfig);
          await copyFile(
            join(getMigrationsDirectory(), ROSTER_MIGRATION),
            join(directory, ROSTER_MIGRATION),
          );

          await expect(
            runMigrations(databaseConfig, directory),
          ).resolves.toEqual(
            expect.objectContaining({ applied: [ROSTER_MIGRATION] }),
          );

          await withDatabaseClient(databaseConfig, async (client) => {
            const definition = await client.query<{
              hp: number;
              id: string;
              move_count: number;
              power: number;
            }>(
              `select definition.id::text,
                    definition.hp,
                    definition.power,
                    count(move.*)::int as move_count
               from public.card_definitions definition
               join public.card_moves move
                 on move.card_definition_id = definition.id
              where definition.id = $1::uuid
              group by definition.id`,
              [CANONICAL_ID],
            );
            const expected = canonicalCreatures.find(
              (card) => card.id === CANONICAL_ID,
            );

            expect(definition.rows).toEqual([
              {
                id: CANONICAL_ID,
                hp: expected?.hp,
                power: expected?.power,
                move_count: 4,
              },
            ]);

            const owned = await client.query<{
              card_definition_id: string;
              id: string;
            }>(
              `select id::text, card_definition_id::text
               from public.player_cards
              where id = $1::uuid`,
              [OWNED_CARD_ID],
            );
            expect(owned.rows).toEqual([
              { id: OWNED_CARD_ID, card_definition_id: CANONICAL_ID },
            ]);

            const arbitrary = await client.query<{
              description: string;
              hp: number;
              name: string;
            }>(
              `select name, hp, description
               from public.card_definitions
              where id = $1::uuid`,
              [ARBITRARY_CARD_ID],
            );
            expect(arbitrary.rows).toEqual([
              {
                name: 'Author Draft Outside Canonical Roster',
                hp: 123,
                description:
                  'Must remain byte-for-byte outside migration scope.',
              },
            ]);
          });

          expect(await loadHistoricalRecords(databaseConfig)).toEqual(
            historyBefore,
          );

          await expect(runSeeds(databaseConfig)).resolves.toEqual(
            expect.objectContaining({
              applied: expect.arrayContaining([
                '0002_basic_card_catalogue.sql',
              ]),
            }),
          );
          expect(await loadHistoricalRecords(databaseConfig)).toEqual(
            historyBefore,
          );
        },
      );
    }, 60_000);
  },
);

async function withPreRosterMigrationDatabase(
  callback: (
    databaseConfig: DatabaseConfig,
    directory: string,
  ) => Promise<void>,
) {
  loadApiEnvironment();
  const administrationConfig = buildDatabaseConfig({ target: 'test' });
  const databaseName = `wits_quest_roster_rebalance_${Date.now()}_${process.pid}_${databaseNumber++}`;
  const directory = await mkdtemp(
    join(tmpdir(), 'wits-world-roster-rebalance-'),
  );
  temporaryDirectories.push(directory);

  const migrationNames = (await readdir(getMigrationsDirectory())).filter(
    (name) => name.endsWith('.sql') && name < ROSTER_MIGRATION,
  );
  await Promise.all(
    migrationNames.map((name) =>
      copyFile(join(getMigrationsDirectory(), name), join(directory, name)),
    ),
  );

  await withDatabaseClient(administrationConfig, async (client) => {
    await client.query(`create database ${databaseName}`);
  });

  const temporaryUrl = new URL(administrationConfig.connectionString);
  temporaryUrl.pathname = `/${databaseName}`;
  const databaseConfig = {
    ...administrationConfig,
    connectionString: temporaryUrl.toString(),
  };

  try {
    await runMigrations(databaseConfig, directory);
    await callback(databaseConfig, directory);
  } finally {
    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${databaseName} with (force)`,
      );
    });
  }
}

async function plantCanonicalRoster(databaseConfig: DatabaseConfig) {
  const definitions = [
    ...canonicalCreatures.map((card) => ({
      affinity: card.affinity,
      category: 'creature',
      description: `${card.name} historical seed fixture.`,
      hp: card.hp,
      id: card.id,
      name: card.name,
      power: card.power,
      rarity: card.rarity,
    })),
    ...canonicalPowerCards.map((card) => ({
      affinity: card.affinity,
      category: 'power',
      description: `${card.name} historical seed fixture.`,
      hp: null,
      id: card.id,
      name: card.name,
      power: null,
      rarity: card.rarity,
    })),
  ];
  const moves = canonicalCreatures.flatMap((card) =>
    card.moves.map((move, index) => ({
      card_definition_id: card.id,
      effect_type: move[2],
      effect_value: move[3],
      modifier_duration_turns: move[6],
      modifier_operation: move[5],
      modifier_stat: move[4],
      move_type: move[1],
      name: move[0],
      position: index + 1,
      power_cost: move[7],
    })),
  );
  const effects = canonicalPowerCards.flatMap((card) =>
    card.effects.map((effect, index) => ({
      card_definition_id: card.id,
      effect_type: effect[0],
      effect_value: effect[1],
      modifier_duration_turns: effect[4],
      modifier_operation: effect[3],
      modifier_stat: effect[2],
      position: index + 1,
    })),
  );

  await withDatabaseClient(databaseConfig, async (client) => {
    await client.query('begin');
    try {
      await client.query(
        `insert into public.card_definitions (
           id, name, category, affinity, rarity, hp, power, description,
           image_url, is_active, authoring_status
         )
         select card.id::uuid, card.name, card.category, card.affinity,
                card.rarity, card.hp, card.power, card.description,
                null, false, 'draft'
           from jsonb_to_recordset($1::jsonb) as card(
             id text,
             name text,
             category text,
             affinity text,
             rarity text,
             hp integer,
             power integer,
             description text
           )`,
        [JSON.stringify(definitions)],
      );
      await client.query(
        `insert into public.card_moves (
           card_definition_id, position, name, move_type, effect_type,
           effect_value, modifier_stat, modifier_operation,
           modifier_duration_turns, power_cost
         )
         select move.card_definition_id::uuid, move.position, move.name,
                move.move_type, move.effect_type, move.effect_value,
                move.modifier_stat, move.modifier_operation,
                move.modifier_duration_turns, move.power_cost
           from jsonb_to_recordset($1::jsonb) as move(
             card_definition_id text,
             position smallint,
             name text,
             move_type text,
             effect_type text,
             effect_value integer,
             modifier_stat text,
             modifier_operation text,
             modifier_duration_turns integer,
             power_cost integer
           )`,
        [JSON.stringify(moves)],
      );
      await client.query(
        `insert into public.card_effects (
           card_definition_id, position, effect_type, effect_value,
           modifier_stat, modifier_operation, modifier_duration_turns
         )
         select effect.card_definition_id::uuid, effect.position,
                effect.effect_type, effect.effect_value, effect.modifier_stat,
                effect.modifier_operation, effect.modifier_duration_turns
           from jsonb_to_recordset($1::jsonb) as effect(
             card_definition_id text,
             position smallint,
             effect_type text,
             effect_value integer,
             modifier_stat text,
             modifier_operation text,
             modifier_duration_turns integer
           )`,
        [JSON.stringify(effects)],
      );
      await client.query(
        `update public.card_definitions
            set is_active = true,
                authoring_status = 'published'
          where authoring_status = 'draft'`,
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

async function plantLegacyCatalogueAndHistory(databaseConfig: DatabaseConfig) {
  const historicalSnapshot = {
    cardDefinitionId: CANONICAL_ID,
    name: 'Spark Creature 1',
    category: 'creature',
    affinity: 'spark',
    rarity: 'common',
    battleCard: {
      id: CANONICAL_ID,
      affinity: 'spark',
      maxHp: 90,
      maxPower: 11,
      moves: [
        {
          id: '1b8b8dc8-184b-51ff-8ffb-f817c97fe3f0',
          name: 'Training Strike',
          moveType: 'basic',
          powerCost: 1,
          effects: [
            {
              id: '1b8b8dc8-184b-51ff-8ffb-f817c97fe3f0',
              effectType: 'damage',
              effectValue: 10,
            },
          ],
        },
      ],
    },
  };

  await withDatabaseClient(databaseConfig, async (client) => {
    await client.query(
      `alter table public.card_definitions disable trigger card_definitions_content_immutability`,
    );
    await client.query(
      `alter table public.card_moves disable trigger card_moves_content_immutability`,
    );
    try {
      await client.query(
        `delete from public.card_moves where card_definition_id = $1::uuid`,
        [CANONICAL_ID],
      );
      await client.query(
        `insert into public.card_moves (
           id, card_definition_id, position, name, move_type,
           effect_type, effect_value, power_cost
         ) values
           (md5('wits-world-basic-move:' || $1 || ':basic')::uuid,
            $1::uuid, 1, 'Training Strike', 'basic', 'damage', 10, 1),
           (md5('wits-world-basic-move:' || $1 || ':affinity')::uuid,
            $1::uuid, 2, 'Spark Strike', 'spark', 'damage', 15, 2)`,
        [CANONICAL_ID],
      );
      await client.query(
        `update public.card_definitions
            set hp = 90,
                power = 11,
                description = 'Common starter Creature for the Spark affinity.'
          where id = $1::uuid`,
        [CANONICAL_ID],
      );
    } finally {
      await client.query(
        `alter table public.card_definitions enable trigger card_definitions_content_immutability`,
      );
      await client.query(
        `alter table public.card_moves enable trigger card_moves_content_immutability`,
      );
    }

    await client.query(
      `insert into public.card_definitions (
         id, name, category, affinity, rarity, hp, power, description
       ) values (
         $1::uuid, 'Author Draft Outside Canonical Roster', 'creature',
         'wit', 'common', 123, 7,
         'Must remain byte-for-byte outside migration scope.'
       )`,
      [ARBITRARY_CARD_ID],
    );
    await client.query(
      `insert into public.players (id, auth_issuer, auth_subject, role)
       values ($1::uuid, 'https://issuer.example/', 'roster-migration', 'player')`,
      [PLAYER_ID],
    );
    await client.query(
      `insert into public.player_starter_grants (id, player_id, affinity)
       values ($1::uuid, $2::uuid, 'spark')`,
      [GRANT_ID, PLAYER_ID],
    );
    await client.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, acquisition_kind,
         source_starter_grant_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'starter', $4::uuid)`,
      [OWNED_CARD_ID, PLAYER_ID, CANONICAL_ID, GRANT_ID],
    );
    await client.query(
      `insert into public.cpu_matches (
         id, player_id, status, state, version, winner, completed_at
       ) values (
         $1::uuid, $2::uuid, 'completed', $3::jsonb, 2, 'player',
         '2026-08-20T10:05:00.000Z'::timestamptz
       )`,
      [
        MATCH_ID,
        PLAYER_ID,
        JSON.stringify({ phase: 'completed', turnNumber: 2 }),
      ],
    );
    await client.query(
      `insert into public.cpu_match_cards (
         match_id, side, position, owned_card_id, card_definition_id, snapshot
       ) values ($1::uuid, 'player', 1, $2::uuid, $3::uuid, $4::jsonb)`,
      [
        MATCH_ID,
        OWNED_CARD_ID,
        CANONICAL_ID,
        JSON.stringify(historicalSnapshot),
      ],
    );
    await client.query(
      `insert into public.cpu_match_rounds (
         id, match_id, round_number, state_before, state_after, result, created_at
       ) values (
         $1::uuid, $2::uuid, 1, $3::jsonb, $4::jsonb, $5::jsonb,
         '2026-08-20T10:01:00.000Z'::timestamptz
       )`,
      [
        ROUND_ID,
        MATCH_ID,
        JSON.stringify({ phase: 'active', turnNumber: 1 }),
        JSON.stringify({ phase: 'completed', turnNumber: 2 }),
        JSON.stringify({ winner: 'player' }),
      ],
    );
    await client.query(
      `insert into public.cpu_match_actions (
         id, match_id, round_id, sequence, side, submission_id,
         action, result, response, created_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 1, 'player', null,
         $4::jsonb, $5::jsonb, $6::jsonb,
         '2026-08-20T10:01:00.000Z'::timestamptz
       )`,
      [
        ACTION_ID,
        MATCH_ID,
        ROUND_ID,
        JSON.stringify({
          type: 'use_move',
          moveId: historicalSnapshot.battleCard.moves[0]?.id,
        }),
        JSON.stringify({ damage: 10 }),
        JSON.stringify({ status: 'completed' }),
      ],
    );
  });
}

async function loadHistoricalRecords(databaseConfig: DatabaseConfig) {
  return withDatabaseClient(databaseConfig, async (client) => {
    const result = await client.query<{
      actions: unknown;
      cards: unknown;
      matches: unknown;
      rounds: unknown;
    }>(
      `select
         (select jsonb_agg(to_jsonb(match_row) order by id)
            from (select * from public.cpu_matches where id = $1::uuid) match_row) as matches,
         (select jsonb_agg(to_jsonb(card_row) order by id)
            from (select * from public.cpu_match_cards where match_id = $1::uuid) card_row) as cards,
         (select jsonb_agg(to_jsonb(round_row) order by id)
            from (select * from public.cpu_match_rounds where match_id = $1::uuid) round_row) as rounds,
         (select jsonb_agg(to_jsonb(action_row) order by id)
            from (select * from public.cpu_match_actions where match_id = $1::uuid) action_row) as actions`,
      [MATCH_ID],
    );

    return result.rows[0];
  });
}
