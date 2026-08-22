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

const PUBLISHED_EDGE_ID = 'a0ef723b-0b3f-498f-96e7-1f56a21cb3a1';
const RETIRED_EDGE_ID = '4f4baa5d-e31b-44d9-b743-29b4d0db67fd';
const REMEDIATION_MIGRATION = '0017_resolve_edge_card_definition_name.sql';
const UNIQUENESS_MIGRATION = '0018_enforce_card_definition_name_uniqueness.sql';

const PLAYER_ID = 'a7000000-0000-4000-8000-000000000001';
const STARTER_GRANT_ID = 'a7000000-0000-4000-8000-000000000002';
const OWNED_CARD_ID = 'a7000000-0000-4000-8000-000000000003';
const DECK_ID = 'a7000000-0000-4000-8000-000000000004';
const MATCH_ID = 'a7000000-0000-4000-8000-000000000005';

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
  'card-definition Edge name remediation migration',
  () => {
    it('renames only the approved retired definition and preserves its references', async () => {
      await withPreRemediationDatabase(async (databaseConfig, directory) => {
        await seedExpectedEdgeDefinitions(databaseConfig);
        await addNameMigrations(directory);

        await expect(runMigrations(databaseConfig, directory)).resolves.toEqual(
          expect.objectContaining({
            applied: [REMEDIATION_MIGRATION, UNIQUENESS_MIGRATION],
          }),
        );

        await withDatabaseClient(databaseConfig, async (client) => {
          const definitions = await client.query<{
            authoring_status: string;
            id: string;
            is_active: boolean;
            name: string;
          }>(
            `select id::text, name, authoring_status, is_active
               from public.card_definitions
              where id in ($1::uuid, $2::uuid)
              order by id`,
            [PUBLISHED_EDGE_ID, RETIRED_EDGE_ID],
          );

          expect(definitions.rows).toEqual([
            {
              id: RETIRED_EDGE_ID,
              name: 'Edge Legacy',
              authoring_status: 'retired',
              is_active: false,
            },
            {
              id: PUBLISHED_EDGE_ID,
              name: 'Edge',
              authoring_status: 'published',
              is_active: true,
            },
          ]);

          const references = await client.query<{
            card_definition_id: string;
            deck_reference_count: string;
            move_reference_count: string;
            owned_card_id: string;
            snapshot: { definitionId: string; name: string };
          }>(
            `select
               owned.card_definition_id::text,
               owned.id::text as owned_card_id,
               count(deck_card.owned_card_id)::text as deck_reference_count,
               (select count(*)::text
                  from public.card_moves
                 where card_definition_id = owned.card_definition_id) as move_reference_count,
               (select snapshot
                  from public.cpu_match_cards
                 where match_id = $2::uuid
                   and card_definition_id = owned.card_definition_id) as snapshot
             from public.player_cards owned
             left join public.player_deck_cards deck_card
               on deck_card.owned_card_id = owned.id
             where owned.id = $1::uuid
             group by owned.card_definition_id, owned.id`,
            [OWNED_CARD_ID, MATCH_ID],
          );

          expect(references.rows).toEqual([
            {
              card_definition_id: RETIRED_EDGE_ID,
              owned_card_id: OWNED_CARD_ID,
              deck_reference_count: '1',
              move_reference_count: '1',
              snapshot: {
                definitionId: RETIRED_EDGE_ID,
                name: 'Edge',
              },
            },
          ]);

          const duplicateGroups = await client.query<{ count: string }>(
            `select count(*)::text as count
               from (
                 select lower(btrim(name))
                   from public.card_definitions
                  group by lower(btrim(name))
                 having count(*) > 1
               ) duplicate_groups`,
          );

          expect(duplicateGroups.rows).toEqual([{ count: '0' }]);

          const uniquenessIndex = await client.query<{ count: string }>(
            `select count(*)::text as count
               from pg_class
              where relname = 'card_definitions_normalized_name_unique_idx'`,
          );

          expect(uniquenessIndex.rows).toEqual([{ count: '1' }]);
        });

        await expect(runMigrations(databaseConfig, directory)).resolves.toEqual(
          expect.objectContaining({
            applied: [],
            skipped: expect.arrayContaining([
              REMEDIATION_MIGRATION,
              UNIQUENESS_MIGRATION,
            ]),
          }),
        );
      });
    }, 45_000);

    it('fails and rolls back when the expected retired record has changed', async () => {
      await withPreRemediationDatabase(async (databaseConfig, directory) => {
        await seedExpectedEdgeDefinitions(databaseConfig, {
          retiredName: 'Unexpected Edge',
        });
        await addRemediationMigration(directory);

        await expect(runMigrations(databaseConfig, directory)).rejects.toThrow(
          'expected retired Edge definition',
        );

        await withDatabaseClient(databaseConfig, async (client) => {
          const state = await client.query<{
            migration_count: string;
            name: string;
          }>(
            `select
               (select count(*)::text
                  from public.schema_migrations
                 where name = $1) as migration_count,
               (select name
                  from public.card_definitions
                 where id = $2::uuid) as name`,
            [REMEDIATION_MIGRATION, RETIRED_EDGE_ID],
          );

          expect(state.rows).toEqual([
            {
              migration_count: '0',
              name: 'Unexpected Edge',
            },
          ]);
        });
      });
    }, 45_000);
  },
);

async function withPreRemediationDatabase(
  callback: (
    databaseConfig: DatabaseConfig,
    directory: string,
  ) => Promise<void>,
) {
  loadApiEnvironment();
  const administrationConfig = buildDatabaseConfig({ target: 'test' });
  const databaseName = `wits_quest_edge_remediation_${Date.now()}_${process.pid}_${databaseNumber++}`;
  const directory = await createPreRemediationMigrationDirectory();

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

async function createPreRemediationMigrationDirectory() {
  const directory = await mkdtemp(
    join(tmpdir(), 'wits-world-edge-remediation-'),
  );
  temporaryDirectories.push(directory);

  const sourceDirectory = getMigrationsDirectory();
  const migrationNames = (await readdir(sourceDirectory)).filter(
    (name) => name.endsWith('.sql') && name < REMEDIATION_MIGRATION,
  );

  await Promise.all(
    migrationNames.map((name) =>
      copyFile(join(sourceDirectory, name), join(directory, name)),
    ),
  );

  return directory;
}

async function addRemediationMigration(directory: string) {
  await copyFile(
    join(getMigrationsDirectory(), REMEDIATION_MIGRATION),
    join(directory, REMEDIATION_MIGRATION),
  );
}

async function addNameMigrations(directory: string) {
  await addRemediationMigration(directory);
  await copyFile(
    join(getMigrationsDirectory(), UNIQUENESS_MIGRATION),
    join(directory, UNIQUENESS_MIGRATION),
  );
}

async function seedExpectedEdgeDefinitions(
  databaseConfig: DatabaseConfig,
  options: { retiredName?: string } = {},
) {
  const retiredName = options.retiredName ?? 'Edge';

  await withDatabaseClient(databaseConfig, async (client) => {
    await client.query(
      `insert into public.card_definitions (
         id, name, category, affinity, rarity, hp, power, description,
         is_active, authoring_status
       ) values
         ($1::uuid, $2, 'creature', 'wit', 'common', 100, 10,
          'Retired Edge fixture.', false, 'draft'),
         ($3::uuid, 'Edge', 'creature', 'spark', 'rare', 120, 20,
          'Published Edge fixture.', false, 'draft')`,
      [RETIRED_EDGE_ID, retiredName, PUBLISHED_EDGE_ID],
    );

    await client.query(
      `insert into public.card_moves (
         card_definition_id, position, name, move_type, effect_type,
         effect_value, power_cost
       ) values
         ($1::uuid, 1, 'Retired move', 'basic', 'damage', 10, 1),
         ($2::uuid, 1, 'Published move', 'basic', 'damage', 10, 1)`,
      [RETIRED_EDGE_ID, PUBLISHED_EDGE_ID],
    );

    await client.query(
      `update public.card_definitions
          set authoring_status = case
                when id = $1::uuid then 'retired'
                when id = $2::uuid then 'published'
              end,
              is_active = id = $2::uuid
        where id in ($1::uuid, $2::uuid)`,
      [RETIRED_EDGE_ID, PUBLISHED_EDGE_ID],
    );

    await client.query(
      `insert into public.players (id, auth_issuer, auth_subject, role)
       values ($1::uuid, 'https://issuer.example/', 'edge-remediation', 'player')`,
      [PLAYER_ID],
    );
    await client.query(
      `insert into public.player_starter_grants (id, player_id, affinity)
       values ($1::uuid, $2::uuid, 'wit')`,
      [STARTER_GRANT_ID, PLAYER_ID],
    );
    await client.query(
      `insert into public.player_cards (
         id, player_id, card_definition_id, acquisition_kind,
         source_starter_grant_id
       ) values ($1::uuid, $2::uuid, $3::uuid, 'starter', $4::uuid)`,
      [OWNED_CARD_ID, PLAYER_ID, RETIRED_EDGE_ID, STARTER_GRANT_ID],
    );
    await client.query(
      `insert into public.player_decks (id, player_id, name)
       values ($1::uuid, $2::uuid, 'Edge fixture deck')`,
      [DECK_ID, PLAYER_ID],
    );
    await client.query(
      `insert into public.player_deck_cards (deck_id, player_id, owned_card_id, position)
       values ($1::uuid, $2::uuid, $3::uuid, 1)`,
      [DECK_ID, PLAYER_ID, OWNED_CARD_ID],
    );
    await client.query(
      `insert into public.cpu_matches (
         id, player_id, status, state, winner, completed_at
       ) values ($1::uuid, $2::uuid, 'completed', '{}'::jsonb, 'cpu', now())`,
      [MATCH_ID, PLAYER_ID],
    );
    await client.query(
      `insert into public.cpu_match_cards (
         match_id, side, position, card_definition_id, snapshot
       ) values ($1::uuid, 'cpu', 1, $2::uuid, $3::jsonb)`,
      [
        MATCH_ID,
        RETIRED_EDGE_ID,
        JSON.stringify({ definitionId: RETIRED_EDGE_ID, name: 'Edge' }),
      ],
    );
  });
}
