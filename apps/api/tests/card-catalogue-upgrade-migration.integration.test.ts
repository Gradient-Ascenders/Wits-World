import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { getMigrationsDirectory } from '../src/database/paths.js';

const CATALOGUE_MIGRATION = '0041_complete_card_catalogue.sql';
const LEGACY_POWER_CARD_ID = '23100000-0000-4000-8000-000000000001';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'complete catalogue upgrade migration',
  () => {
    it('grandfathers published Power cards while preserving authoring guards', async () => {
      loadApiEnvironment();
      const administrationConfig = buildDatabaseConfig({ target: 'test' });
      const databaseName = `wits_quest_catalogue_upgrade_${Date.now()}_${process.pid}`;
      const migrationDirectory = await mkdtemp(
        join(tmpdir(), 'wits-world-catalogue-upgrade-'),
      );
      const migrationNames = (await readdir(getMigrationsDirectory())).filter(
        (name) => name.endsWith('.sql') && name < CATALOGUE_MIGRATION,
      );

      await Promise.all(
        migrationNames.map((name) =>
          copyFile(
            join(getMigrationsDirectory(), name),
            join(migrationDirectory, name),
          ),
        ),
      );
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${databaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${databaseName}`;
      const databaseConfig: DatabaseConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      try {
        await runMigrations(databaseConfig, migrationDirectory);
        await insertPublishedLegacyPowerCard(databaseConfig);
        await copyFile(
          join(getMigrationsDirectory(), CATALOGUE_MIGRATION),
          join(migrationDirectory, CATALOGUE_MIGRATION),
        );

        await expect(
          runMigrations(databaseConfig, migrationDirectory),
        ).resolves.toEqual(
          expect.objectContaining({ applied: [CATALOGUE_MIGRATION] }),
        );

        await withDatabaseClient(databaseConfig, async (client) => {
          const definition = await client.query<{
            affinity: string | null;
            authoring_status: string;
            catalogue_class: string;
            is_active: boolean;
          }>(
            `select catalogue_class, affinity, authoring_status, is_active
               from public.card_definitions
              where id = $1::uuid`,
            [LEGACY_POWER_CARD_ID],
          );
          expect(definition.rows).toEqual([
            {
              affinity: 'wit',
              authoring_status: 'published',
              catalogue_class: 'special',
              is_active: true,
            },
          ]);

          const triggers = await client.query<{
            table_name: string;
            tgenabled: string;
            tgname: string;
          }>(
            `select tgrelid::regclass::text as table_name, tgname, tgenabled
               from pg_trigger
              where tgname = any($1::text[])
              order by tgname`,
            [
              [
                'card_definitions_authoring_lifecycle_immutability',
                'card_definitions_content_immutability',
                'card_definitions_curated_authoring_guard',
                'card_definitions_publication_readiness',
                'card_effects_content_immutability',
                'card_moves_content_immutability',
              ],
            ],
          );
          expect(triggers.rows).toEqual([
            {
              table_name: 'card_definitions',
              tgenabled: 'O',
              tgname: 'card_definitions_authoring_lifecycle_immutability',
            },
            {
              table_name: 'card_definitions',
              tgenabled: 'O',
              tgname: 'card_definitions_content_immutability',
            },
            {
              table_name: 'card_definitions',
              tgenabled: 'O',
              tgname: 'card_definitions_curated_authoring_guard',
            },
            {
              table_name: 'card_definitions',
              tgenabled: 'O',
              tgname: 'card_definitions_publication_readiness',
            },
            {
              table_name: 'card_effects',
              tgenabled: 'O',
              tgname: 'card_effects_content_immutability',
            },
            {
              table_name: 'card_moves',
              tgenabled: 'O',
              tgname: 'card_moves_content_immutability',
            },
          ]);

          await expect(
            client.query(
              `update public.card_definitions
                  set updated_at = updated_at
                where id = $1::uuid`,
              [LEGACY_POWER_CARD_ID],
            ),
          ).rejects.toThrow(
            'Author content version must increment exactly once',
          );
          await expect(
            client.query(
              `update public.card_effects
                  set effect_value = effect_value
                where card_definition_id = $1::uuid`,
              [LEGACY_POWER_CARD_ID],
            ),
          ).rejects.toThrow(
            `Moves and effects for non-draft card definition ${LEGACY_POWER_CARD_ID} are immutable`,
          );
        });
      } finally {
        await dropTemporaryDatabase(administrationConfig, databaseName);
        await rm(migrationDirectory, { force: true, recursive: true });
      }
    }, 120_000);
  },
);

async function dropTemporaryDatabase(
  administrationConfig: DatabaseConfig,
  databaseName: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${databaseName} with (force)`,
        );
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  throw new Error(`Could not remove temporary database ${databaseName}.`, {
    cause: lastError,
  });
}

async function insertPublishedLegacyPowerCard(
  databaseConfig: DatabaseConfig,
): Promise<void> {
  await withDatabaseClient(databaseConfig, async (client) => {
    await client.query(
      `insert into public.card_definitions (
         id, name, category, affinity, rarity, hp, power, description,
         image_url, is_active, authoring_status
       ) values (
         $1::uuid, 'Legacy Published Power', 'power', 'wit', 'common', null,
         null, 'Production-style Power card created before migration 0041.',
         null, false, 'draft'
       )`,
      [LEGACY_POWER_CARD_ID],
    );
    await client.query(
      `insert into public.card_effects (
         card_definition_id, position, effect_type, effect_value
       ) values ($1::uuid, 1, 'heal', 10)`,
      [LEGACY_POWER_CARD_ID],
    );
    await client.query(
      `update public.card_definitions
          set authoring_status = 'published',
              is_active = true,
              publication_provenance = 'controlled_seed',
              version = version + 1,
              updated_at = now()
        where id = $1::uuid`,
      [LEGACY_POWER_CARD_ID],
    );
  });
}
