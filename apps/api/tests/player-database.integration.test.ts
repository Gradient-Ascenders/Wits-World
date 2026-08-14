import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { withDatabaseClient } from '../src/database/connection.js';
import {
  runMigrations,
  type MigrationResult,
} from '../src/database/migrations.js';
import { createPlayerIdentityService } from '../src/players/player-identity.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)('player database integration', () => {
  let administrationConfig: DatabaseConfig;
  let migrationResult: MigrationResult;
  let temporaryConfig: DatabaseConfig;
  let temporaryDatabaseName: string;

  beforeAll(async () => {
    loadApiEnvironment();

    administrationConfig = buildDatabaseConfig({
      target: 'test',
    });

    temporaryDatabaseName = `wits_quest_player_${Date.now()}_${process.pid}`;

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
  }, 45_000);

  afterAll(async () => {
    if (!administrationConfig || !temporaryDatabaseName) {
      return;
    }

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(
        `drop database if exists ${temporaryDatabaseName} with (force)`,
      );
    });
  }, 30_000);

  it('creates the player schema on a clean database', async () => {
    expect(migrationResult.applied).toContain('0003_create_players.sql');

    await withDatabaseClient(temporaryConfig, async (client) => {
      const relation = await client.query<{
        players_table: string | null;
      }>(`select to_regclass('public.players')::text as players_table`);

      expect(relation.rows[0]?.players_table).toBe('players');
    });
  });

  it('prevents duplicate external identities', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id,
           auth_issuer,
           auth_subject,
           role,
           lifecycle_status
         ) values ($1, $2, $3, 'player', 'active')`,
        [
          '00000000-0000-4000-8000-000000000101',
          'https://auth.example.test/',
          'auth0|duplicate-player',
        ],
      );

      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, 'player', 'active')`,
          [
            '00000000-0000-4000-8000-000000000102',
            'https://auth.example.test/',
            'auth0|duplicate-player',
          ],
        ),
      ).rejects.toThrow();
    });
  });

  it('treats the same subject under different issuers as different identities', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id,
           auth_issuer,
           auth_subject,
           role,
           lifecycle_status
         ) values
           ($1, $3, $5, 'player', 'active'),
           ($2, $4, $5, 'player', 'active')`,
        [
          '00000000-0000-4000-8000-000000000103',
          '00000000-0000-4000-8000-000000000104',
          'https://tenant-one.example.test/',
          'https://tenant-two.example.test/',
          'auth0|shared-subject',
        ],
      );

      const players = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.players
          where auth_subject = $1`,
        ['auth0|shared-subject'],
      );

      expect(players.rows[0]?.count).toBe('2');
    });
  });

  it('allows only Player and Author roles', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id,
           auth_issuer,
           auth_subject,
           role,
           lifecycle_status
         ) values
           ($1, $3, $5, 'player', 'active'),
           ($2, $4, $6, 'author', 'active')`,
        [
          '00000000-0000-4000-8000-000000000105',
          '00000000-0000-4000-8000-000000000106',
          'https://auth.example.test/',
          'https://auth.example.test/',
          'auth0|role-player',
          'auth0|role-author',
        ],
      );

      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, 'administrator', 'active')`,
          [
            '00000000-0000-4000-8000-000000000107',
            'https://auth.example.test/',
            'auth0|administrator',
          ],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects unsupported lifecycle states', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, 'player', 'suspended')`,
          [
            '00000000-0000-4000-8000-000000000108',
            'https://auth.example.test/',
            'auth0|invalid-lifecycle',
          ],
        ),
      ).rejects.toThrow();
    });
  });

  it('allows a deletion-pending player to retain the external identity while locked', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, 'player', 'deletion_pending')`,
          [
            '00000000-0000-4000-8000-000000000109',
            'https://auth.example.test/',
            'auth0|pending-delete',
          ],
        ),
      ).resolves.toBeDefined();
    });
  });

  it('requires a deleted tombstone to contain no Auth0 identity or role', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, null, null, null, 'deleted')`,
          ['00000000-0000-4000-8000-000000000110'],
        ),
      ).resolves.toBeDefined();

      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, null, 'deleted')`,
          [
            '00000000-0000-4000-8000-000000000111',
            'https://auth.example.test/',
            'auth0|should-not-survive',
          ],
        ),
      ).rejects.toThrow();
    });
  });

  it('requires non-deleted players to have an external identity and role', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await expect(
        client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, null, null, 'player', 'active')`,
          ['00000000-0000-4000-8000-000000000112'],
        ),
      ).rejects.toThrow();
    });
  });

  it('permits a previously deleted identity to register as a completely new player', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|returning-person';

      await client.query(
        `insert into public.players (
           id,
           auth_issuer,
           auth_subject,
           role,
           lifecycle_status
         ) values ($1, $2, $3, 'player', 'active')`,
        ['00000000-0000-4000-8000-000000000113', issuer, subject],
      );

      await client.query(
        `update public.players
            set auth_issuer = null,
                auth_subject = null,
                role = null,
                lifecycle_status = 'deleted',
                updated_at = now()
          where id = $1`,
        ['00000000-0000-4000-8000-000000000113'],
      );

      await client.query(
        `insert into public.players (
           id,
           auth_issuer,
           auth_subject,
           role,
           lifecycle_status
         ) values ($1, $2, $3, 'player', 'active')`,
        ['00000000-0000-4000-8000-000000000114', issuer, subject],
      );

      const players = await client.query<{
        id: string;
        lifecycle_status: string;
      }>(
        `select id, lifecycle_status
           from public.players
          where id in ($1, $2)
          order by id`,
        [
          '00000000-0000-4000-8000-000000000113',
          '00000000-0000-4000-8000-000000000114',
        ],
      );

      expect(players.rows).toEqual([
        {
          id: '00000000-0000-4000-8000-000000000113',
          lifecycle_status: 'deleted',
        },
        {
          id: '00000000-0000-4000-8000-000000000114',
          lifecycle_status: 'active',
        },
      ]);
    });
  });

  it('resolves concurrent first requests to exactly one local player', async () => {
    const issuer = 'https://auth.example.test/';
    const subject = 'auth0|concurrent-player';

    await withDatabaseClient(temporaryConfig, async (client) => {
      const service = createPlayerIdentityService(client);

      const resolvedPlayers = await Promise.all(
        Array.from({ length: 5 }, () =>
          service.resolve({
            issuer,
            subject,
          }),
        ),
      );

      expect(new Set(resolvedPlayers.map((player) => player.id)).size).toBe(1);

      const persisted = await client.query<{ count: string }>(
        `select count(*)::text as count
           from public.players
          where auth_issuer = $1
            and auth_subject = $2`,
        [issuer, subject],
      );

      expect(persisted.rows[0]?.count).toBe('1');
    });
  });
});
