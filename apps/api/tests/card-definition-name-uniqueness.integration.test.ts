import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorCardNameConflictError,
  createAuthorCardService,
  type AuthorCardService,
} from '../src/cards/author-card-service.js';
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
import { getMigrationsDirectory } from '../src/database/paths.js';

const AUTHOR_ONE_ID = 'a8000000-0000-4000-8000-000000000001';
const AUTHOR_TWO_ID = 'a8000000-0000-4000-8000-000000000002';
const UNIQUENESS_MIGRATION = '0018_enforce_card_definition_name_uniqueness.sql';
const NORMALIZED_NAME_INDEX = 'card_definitions_normalized_name_unique_idx';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'card-definition normalized name uniqueness',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;
    let service: AuthorCardService;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = databaseName('card_name_uniqueness');

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      temporaryConfig = databaseConfigFor(
        administrationConfig,
        temporaryDatabaseName,
      );
      await runMigrations(temporaryConfig);
      pool = createDatabasePool(temporaryConfig);
      service = createAuthorCardService(pool);

      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, role
         ) values
           ($1::uuid, 'https://auth.example.test/', 'name-author-one', 'author'),
           ($2::uuid, 'https://auth.example.test/', 'name-author-two', 'author')`,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID],
      );
    }, 45_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('installs the global expression unique index after migration 0017', async () => {
      const result = await pool.query<{
        index_definition: string;
        migration_name: string;
        previous_migration_name: string;
      }>(
        `select
           pg_get_indexdef(indexes.indexrelid) as index_definition,
           current_migration.name as migration_name,
           previous_migration.name as previous_migration_name
         from pg_index indexes
         join pg_class index_class
           on index_class.oid = indexes.indexrelid
         join public.schema_migrations current_migration
           on current_migration.name = $2
         join public.schema_migrations previous_migration
           on previous_migration.name = '0017_resolve_edge_card_definition_name.sql'
         where index_class.relname = $1`,
        [NORMALIZED_NAME_INDEX, UNIQUENESS_MIGRATION],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        migration_name: UNIQUENESS_MIGRATION,
        previous_migration_name: '0017_resolve_edge_card_definition_name.sql',
      });
      expect(result.rows[0]?.index_definition).toContain('lower(btrim(name))');
      expect(result.rows[0]?.index_definition).toContain('UNIQUE INDEX');
    }, 45_000);

    it('preserves display casing and rejects exact, case, and whitespace variants across drafts', async () => {
      const sentinel = await createPowerCard(service, '  Sentinel  ');

      expect(sentinel.name).toBe('Sentinel');

      for (const conflictingName of [
        'Sentinel',
        'sentinel',
        ' Sentinel ',
        'SENTINEL',
        'SeNtInEl',
      ]) {
        await expect(
          createPowerCard(service, conflictingName),
        ).rejects.toBeInstanceOf(AuthorCardNameConflictError);
      }

      const persisted = await pool.query<{
        definition_count: number;
        name: string;
      }>(
        `select count(*)::int as definition_count, min(name) as name
           from public.card_definitions
          where lower(btrim(name)) = 'sentinel'`,
      );

      expect(persisted.rows).toEqual([
        { definition_count: 1, name: 'Sentinel' },
      ]);
    }, 45_000);

    it('reserves published and retired names globally', async () => {
      const published = await createPowerCard(service, 'Published Reserve');
      await service.publishCard(AUTHOR_ONE_ID, published.id);

      await expect(
        createPowerCard(service, ' published reserve '),
      ).rejects.toBeInstanceOf(AuthorCardNameConflictError);

      const retired = await createPowerCard(service, 'Retired Reserve');
      await service.publishCard(AUTHOR_ONE_ID, retired.id);
      await service.retireCard(AUTHOR_TWO_ID, retired.id);

      await expect(
        createPowerCard(service, 'RETIRED RESERVE'),
      ).rejects.toBeInstanceOf(AuthorCardNameConflictError);
    }, 45_000);

    it('allows distinct names and same-record edits, including casing-only changes', async () => {
      const first = await createPowerCard(service, 'Casing Keeper');
      const distinct = await createPowerCard(service, 'Distinct Keeper');

      const casingOnly = await updatePowerCard(
        service,
        first.id,
        'casing keeper',
      );
      expect(casingOnly.name).toBe('casing keeper');

      const trimmed = await updatePowerCard(
        service,
        first.id,
        '  CASING KEEPER  ',
      );
      expect(trimmed.name).toBe('CASING KEEPER');

      await expect(
        updatePowerCard(service, distinct.id, ' casing keeper '),
      ).rejects.toBeInstanceOf(AuthorCardNameConflictError);

      const unchanged = await service.listCards();
      expect(unchanged.find((card) => card.id === distinct.id)?.name).toBe(
        'Distinct Keeper',
      );
      expect(
        unchanged.find((card) => card.id === distinct.id)?.effects,
      ).toHaveLength(1);
    }, 45_000);

    it('prevents direct SQL inserts and updates from bypassing the invariant', async () => {
      await insertDirectDefinition(pool, 'Direct Reserve');

      await expect(
        insertDirectDefinition(pool, ' direct reserve '),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: NORMALIZED_NAME_INDEX,
      });

      const source = await insertDirectDefinition(pool, 'Direct Update Source');

      await expect(
        pool.query(
          `update public.card_definitions
              set name = 'DIRECT RESERVE'
            where id = $1::uuid`,
          [source],
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: NORMALIZED_NAME_INDEX,
      });

      const persisted = await pool.query<{ name: string }>(
        `select name from public.card_definitions where id = $1::uuid`,
        [source],
      );
      expect(persisted.rows).toEqual([{ name: 'Direct Update Source' }]);
    }, 45_000);

    it('leaves owned-card references and historical match snapshots unchanged', async () => {
      const definition = await createPowerCard(service, 'Referenced Reserve');
      const snapshot = { definitionId: definition.id, name: definition.name };

      await pool.query(
        `insert into public.player_starter_grants (id, player_id, affinity)
         values
           ('a8100000-0000-4000-8000-000000000001'::uuid, $1::uuid, 'wit'),
           ('a8100000-0000-4000-8000-000000000002'::uuid, $2::uuid, 'wit')`,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID],
      );
      await pool.query(
        `insert into public.player_cards (
           id, player_id, card_definition_id, acquisition_kind,
           source_starter_grant_id
         ) values
           (
             'a8200000-0000-4000-8000-000000000001'::uuid,
             $1::uuid,
             $3::uuid,
             'starter',
             'a8100000-0000-4000-8000-000000000001'::uuid
           ),
           (
             'a8200000-0000-4000-8000-000000000002'::uuid,
             $2::uuid,
             $3::uuid,
             'starter',
             'a8100000-0000-4000-8000-000000000002'::uuid
           )`,
        [AUTHOR_ONE_ID, AUTHOR_TWO_ID, definition.id],
      );
      await pool.query(
        `insert into public.cpu_matches (
           id, player_id, status, state, winner, completed_at
         ) values (
           'a8300000-0000-4000-8000-000000000001'::uuid,
           $1::uuid,
           'completed',
           '{}'::jsonb,
           'cpu',
           now()
         )`,
        [AUTHOR_ONE_ID],
      );
      await pool.query(
        `insert into public.cpu_match_cards (
           match_id, side, position, card_definition_id, snapshot
         ) values (
           'a8300000-0000-4000-8000-000000000001'::uuid,
           'cpu',
           1,
           $1::uuid,
           $2::jsonb
         )`,
        [definition.id, JSON.stringify(snapshot)],
      );

      await expect(
        createPowerCard(service, ' referenced reserve '),
      ).rejects.toBeInstanceOf(AuthorCardNameConflictError);

      const references = await pool.query<{
        owned_count: number;
        snapshot: typeof snapshot;
      }>(
        `select
           (select count(*)::int
              from public.player_cards
             where card_definition_id = $1::uuid) as owned_count,
           (select snapshot
              from public.cpu_match_cards
             where match_id = 'a8300000-0000-4000-8000-000000000001'::uuid
               and card_definition_id = $1::uuid) as snapshot`,
        [definition.id],
      );

      expect(references.rows).toEqual([{ owned_count: 2, snapshot }]);
    }, 45_000);

    it('allows exactly one of two concurrent normalized-equivalent creates', async () => {
      const results = await Promise.allSettled([
        createPowerCard(service, 'Concurrent Sentinel'),
        createPowerCard(service, ' concurrent sentinel '),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: expect.any(AuthorCardNameConflictError),
      });

      const state = await pool.query<{
        audit_count: number;
        definition_count: number;
        effect_count: number;
      }>(
        `select
           (select count(*)::int
              from public.card_definitions
             where lower(btrim(name)) = 'concurrent sentinel') as definition_count,
           (select count(*)::int
              from public.card_effects effect
              join public.card_definitions definition
                on definition.id = effect.card_definition_id
             where lower(btrim(definition.name)) = 'concurrent sentinel') as effect_count,
           (select count(*)::int
              from public.author_content_audit audit
              join public.card_definitions definition
                on definition.id = audit.entity_id
             where audit.entity_type = 'card'
               and audit.action = 'create'
               and lower(btrim(definition.name)) = 'concurrent sentinel') as audit_count`,
      );

      expect(state.rows).toEqual([
        { audit_count: 1, definition_count: 1, effect_count: 1 },
      ]);
    }, 45_000);

    it('allows exactly one of two concurrent updates to claim a normalized name', async () => {
      const left = await createPowerCard(service, 'Concurrent Left');
      const right = await createPowerCard(service, 'Concurrent Right');

      const results = await Promise.allSettled([
        updatePowerCard(service, left.id, 'Shared Rename'),
        updatePowerCard(service, right.id, ' shared rename '),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({
        status: 'rejected',
        reason: expect.any(AuthorCardNameConflictError),
      });

      const state = await pool.query<{
        definition_count: number;
        effect_count: number;
        renamed_count: number;
      }>(
        `select
           count(*)::int as definition_count,
           count(*) filter (
             where lower(btrim(name)) = 'shared rename'
           )::int as renamed_count,
           (select count(*)::int
              from public.card_effects
             where card_definition_id in ($1::uuid, $2::uuid)) as effect_count
         from public.card_definitions
         where id in ($1::uuid, $2::uuid)`,
        [left.id, right.id],
      );

      expect(state.rows).toEqual([
        { definition_count: 2, effect_count: 2, renamed_count: 1 },
      ]);
    }, 45_000);
  },
);

describe.skipIf(!runIntegrationTests)(
  'card-definition uniqueness migration safety',
  () => {
    const temporaryDirectories: string[] = [];
    let administrationConfig: DatabaseConfig;
    let temporaryDatabaseName: string | undefined;

    afterAll(async () => {
      await Promise.all(
        temporaryDirectories.map((directory) =>
          rm(directory, { force: true, recursive: true }),
        ),
      );
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('fails transactionally when an unexpected normalized collision exists', async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = databaseName('card_name_collision');
      const databaseConfig = databaseConfigFor(
        administrationConfig,
        temporaryDatabaseName,
      );
      const directory = await mkdtemp(
        join(tmpdir(), 'wits-world-name-uniqueness-'),
      );
      temporaryDirectories.push(directory);

      const migrationNames = (await readdir(getMigrationsDirectory())).filter(
        (name) => name.endsWith('.sql') && name < UNIQUENESS_MIGRATION,
      );
      await Promise.all(
        migrationNames.map((name) =>
          copyFile(join(getMigrationsDirectory(), name), join(directory, name)),
        ),
      );

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });
      await runMigrations(databaseConfig, directory);

      await withDatabaseClient(databaseConfig, async (client) => {
        await client.query(
          `insert into public.card_definitions (
             name, category, affinity, rarity, hp, power
           ) values
             ('Unexpected Collision', 'power', 'wit', 'common', null, null),
             (' unexpected collision ', 'power', 'grit', 'common', null, null)`,
        );
      });

      await copyFile(
        join(getMigrationsDirectory(), UNIQUENESS_MIGRATION),
        join(directory, UNIQUENESS_MIGRATION),
      );

      await expect(runMigrations(databaseConfig, directory)).rejects.toThrow();

      await withDatabaseClient(databaseConfig, async (client) => {
        const state = await client.query<{
          definition_count: number;
          index_count: number;
          migration_count: number;
        }>(
          `select
             (select count(*)::int
                from public.card_definitions
               where lower(btrim(name)) = 'unexpected collision') as definition_count,
             (select count(*)::int
                from public.schema_migrations
               where name = $1) as migration_count,
             (select count(*)::int
                from pg_class
               where relname = $2) as index_count`,
          [UNIQUENESS_MIGRATION, NORMALIZED_NAME_INDEX],
        );

        expect(state.rows).toEqual([
          { definition_count: 2, index_count: 0, migration_count: 0 },
        ]);
      });
    }, 45_000);
  },
);

function powerCardInput(name: string) {
  return {
    actorPlayerId: AUTHOR_ONE_ID,
    name,
    category: 'power' as const,
    affinity: 'wit' as const,
    rarity: 'common' as const,
    hp: null,
    power: null,
    description: 'Focused normalized-name test card.',
    imageUrl: null,
    moves: [],
    effects: [
      {
        position: 1,
        effectType: 'heal' as const,
        effectValue: 1,
      },
    ],
  };
}

function createPowerCard(service: AuthorCardService, name: string) {
  return service.createCard(powerCardInput(name));
}

function updatePowerCard(
  service: AuthorCardService,
  cardId: string,
  name: string,
) {
  return service.updateCard({ ...powerCardInput(name), cardId });
}

async function insertDirectDefinition(
  pool: ReturnType<typeof createDatabasePool>,
  name: string,
) {
  const result = await pool.query<{ id: string }>(
    `insert into public.card_definitions (
       name, category, affinity, rarity, hp, power
     ) values ($1, 'power', 'wit', 'common', null, null)
     returning id::text`,
    [name],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error('Direct definition insert returned no identifier.');
  return id;
}

function databaseName(label: string) {
  return `wits_quest_${label}_${Date.now()}_${process.pid}`;
}

function databaseConfigFor(
  administrationConfig: DatabaseConfig,
  databaseNameValue: string,
): DatabaseConfig {
  const url = new URL(administrationConfig.connectionString);
  url.pathname = `/${databaseNameValue}`;
  return { ...administrationConfig, connectionString: url.toString() };
}
