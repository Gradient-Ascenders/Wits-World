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
import { createPlayerIdentityService } from '../src/players/player-identity.js';

import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

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

  it('allows a deletion-pending player to retain the external identity while linked to a deletion request', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const deletionRequestId = '00000000-0000-4000-8000-000000000209';

      await client.query(
        `insert into public.account_deletion_requests (
          id,
          requested_at,
          status
        ) values ($1, now(), 'pending')`,
        [deletionRequestId],
      );

      await expect(
        client.query(
          `insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role,
            lifecycle_status,
            deletion_request_id
          ) values ($1, $2, $3, 'player', 'deletion_pending', $4)`,
          [
            '00000000-0000-4000-8000-000000000109',
            'https://auth.example.test/',
            'auth0|pending-delete',
            deletionRequestId,
          ],
        ),
      ).resolves.toBeDefined();

      const player = await client.query<{
        auth_issuer: string | null;
        auth_subject: string | null;
        deletion_request_id: string | null;
        lifecycle_status: string;
      }>(
        `select
          auth_issuer,
          auth_subject,
          deletion_request_id,
          lifecycle_status
        from public.players
        where id = $1`,
        ['00000000-0000-4000-8000-000000000109'],
      );

      expect(player.rows[0]).toEqual({
        auth_issuer: 'https://auth.example.test/',
        auth_subject: 'auth0|pending-delete',
        deletion_request_id: deletionRequestId,
        lifecycle_status: 'deletion_pending',
      });
    });
  });

  it('rejects a deletion-pending player without a deletion request', async () => {
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
            '00000000-0000-4000-8000-000000000119',
            'https://auth.example.test/',
            'auth0|untracked-delete',
          ],
        ),
      ).rejects.toThrow();
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
    const pool = createDatabasePool(temporaryConfig);

    try {
      const service = createPlayerIdentityService(pool);

      const resolvedPlayers = await Promise.all(
        Array.from({ length: 5 }, () =>
          service.resolve({
            issuer,
            subject,
          }),
        ),
      );

      expect(new Set(resolvedPlayers.map((player) => player.id)).size).toBe(1);

      const persisted = await pool.query<{ count: string }>(
        `select count(*)::text as count
          from public.players
          where auth_issuer = $1
            and auth_subject = $2`,
        [issuer, subject],
      );

      expect(persisted.rows[0]?.count).toBe('1');
    } finally {
      await pool.end();
    }
  });

  it('keeps the retained deletion audit free of player identity columns', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const columns = await client.query<{ column_name: string }>(
        `
          select column_name
            from information_schema.columns
          where table_schema = 'public'
            and table_name = 'account_deletion_requests'
          order by column_name
        `,
      );

      expect(columns.rows.map((row) => row.column_name)).toEqual([
        'completed_at',
        'failure_reason',
        'id',
        'requested_at',
        'status',
      ]);
    });
  });

  it('atomically marks an active player deletion-pending and creates the audit record', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const playerId = '00000000-0000-4000-8000-000000000120';
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|delete-player';

      await client.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role,
            lifecycle_status
          )
          values ($1, $2, $3, 'player', 'active')
        `,
        [playerId, issuer, subject],
      );

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        clock: () => new Date('2026-08-14T01:30:00.000Z'),
        createId: () => '00000000-0000-4000-8000-000000000220',
      });

      const deletionRequest = await service.request({
        issuer,
        subject,
      });

      expect(deletionRequest).toEqual({
        id: '00000000-0000-4000-8000-000000000220',
        requestedAt: new Date('2026-08-14T01:30:00.000Z'),
        completedAt: null,
        status: 'pending',
        failureReason: null,
      });

      const player = await client.query<{
        deletion_request_id: string | null;
        lifecycle_status: string;
      }>(
        `
          select lifecycle_status, deletion_request_id
            from public.players
          where id = $1
        `,
        [playerId],
      );

      expect(player.rows[0]).toEqual({
        deletion_request_id: '00000000-0000-4000-8000-000000000220',
        lifecycle_status: 'deletion_pending',
      });
    });
  });

  it('returns the existing deletion request when deletion is already pending', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const playerId = '00000000-0000-4000-8000-000000000121';
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|repeat-delete';

      await client.query(
        `
          insert into public.players (
            id,
            auth_issuer,
            auth_subject,
            role,
            lifecycle_status
          )
          values ($1, $2, $3, 'player', 'active')
        `,
        [playerId, issuer, subject],
      );

      let createdIds = 0;

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        createId: () => {
          createdIds += 1;
          return `00000000-0000-4000-8000-${String(300 + createdIds).padStart(
            12,
            '0',
          )}`;
        },
      });

      const first = await service.request({
        issuer,
        subject,
      });

      const second = await service.request({
        issuer,
        subject,
      });

      expect(second.id).toBe(first.id);
      expect(createdIds).toBe(1);

      const audits = await client.query<{ count: string }>(
        `
          select count(*)::text as count
            from public.account_deletion_requests
          where id = $1
        `,
        [first.id],
      );

      expect(audits.rows[0]?.count).toBe('1');
    });
  });

  it('records only a safe failure reason while keeping deletion pending', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|retry-delete';

      await client.query(
        `insert into public.players (
          id, auth_issuer, auth_subject, role, lifecycle_status
        ) values ($1, $2, $3, 'player', 'active')`,
        ['00000000-0000-4000-8000-000000000130', issuer, subject],
      );

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        createId: () => '00000000-0000-4000-8000-000000000230',
      });

      const requested = await service.request({ issuer, subject });

      const failed = await service.markRetryPending(
        requested.id,
        'auth0_deletion_failed',
      );

      expect(failed).toMatchObject({
        id: requested.id,
        status: 'retry_pending',
        failureReason: 'auth0_deletion_failed',
        completedAt: null,
      });

      const player = await client.query<{
        auth_subject: string | null;
        lifecycle_status: string;
      }>(
        `select auth_subject, lifecycle_status
          from public.players
          where id = $1`,
        ['00000000-0000-4000-8000-000000000130'],
      );

      expect(player.rows[0]).toEqual({
        auth_subject: subject,
        lifecycle_status: 'deletion_pending',
      });
    });
  });

  it('completes deletion by anonymising the player and unlinking the audit', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|complete-delete';

      await client.query(
        `insert into public.players (
          id, auth_issuer, auth_subject, role, lifecycle_status
        ) values ($1, $2, $3, 'author', 'active')`,
        ['00000000-0000-4000-8000-000000000131', issuer, subject],
      );

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        clock: () => new Date('2026-08-14T02:00:00.000Z'),
        createId: () => '00000000-0000-4000-8000-000000000231',
      });

      const requested = await service.request({ issuer, subject });
      const completed = await service.complete(requested.id);

      expect(completed).toMatchObject({
        id: requested.id,
        status: 'completed',
        completedAt: new Date('2026-08-14T02:00:00.000Z'),
        failureReason: null,
      });

      const player = await client.query<{
        auth_issuer: string | null;
        auth_subject: string | null;
        role: string | null;
        lifecycle_status: string;
        deletion_request_id: string | null;
      }>(
        `select
          auth_issuer,
          auth_subject,
          role,
          lifecycle_status,
          deletion_request_id
        from public.players
        where id = $1`,
        ['00000000-0000-4000-8000-000000000131'],
      );

      expect(player.rows[0]).toEqual({
        auth_issuer: null,
        auth_subject: null,
        role: null,
        lifecycle_status: 'deleted',
        deletion_request_id: null,
      });

      await expect(service.complete(requested.id)).resolves.toEqual(completed);
    });
  });

  it('purges only completed deletion audits older than twelve months', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.account_deletion_requests (
          id, requested_at, completed_at, status
        ) values
          ($1, '2025-08-01T00:00:00Z', '2025-08-13T00:00:00Z', 'completed'),
          ($2, '2025-08-01T00:00:00Z', '2025-08-15T00:00:00Z', 'completed'),
          ($3, '2025-01-01T00:00:00Z', null, 'pending')`,
        [
          '00000000-0000-4000-8000-000000000240',
          '00000000-0000-4000-8000-000000000241',
          '00000000-0000-4000-8000-000000000242',
        ],
      );

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        clock: () => new Date('2026-08-14T00:00:00.000Z'),
      });

      await expect(service.purgeExpiredCompleted()).resolves.toBe(1);

      const remaining = await client.query<{ id: string }>(
        `select id
          from public.account_deletion_requests
          where id in ($1, $2, $3)
          order by id`,
        [
          '00000000-0000-4000-8000-000000000240',
          '00000000-0000-4000-8000-000000000241',
          '00000000-0000-4000-8000-000000000242',
        ],
      );

      expect(remaining.rows.map((row) => row.id)).toEqual([
        '00000000-0000-4000-8000-000000000241',
        '00000000-0000-4000-8000-000000000242',
      ]);
    });
  });

  it('discovers pending deletion work for automatic retry', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|restart-delete';

      await client.query(
        `insert into public.players (
          id,
          auth_issuer,
          auth_subject,
          role,
          lifecycle_status
        ) values ($1, $2, $3, 'player', 'active')`,
        ['00000000-0000-4000-8000-000000000150', issuer, subject],
      );

      const lifecycle = createAccountDeletionLifecycle(
        createPoolFacade(client),
        {
          createId: () => '00000000-0000-4000-8000-000000000250',
        },
      );

      const requested = await lifecycle.request({
        issuer,
        subject,
      });

      const work = await lifecycle.listProcessable();

      expect(work).toContainEqual({
        deletionId: requested.id,
        identity: {
          issuer,
          subject,
        },
        status: 'pending',
      });
    });
  });
});

function createPoolFacade(
  client: Parameters<Parameters<typeof withDatabaseClient>[1]>[0],
) {
  return {
    async connect() {
      return {
        query: client.query.bind(client),
        release() {},
      } as typeof client;
    },
  };
}
