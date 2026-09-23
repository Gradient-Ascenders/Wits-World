import { randomUUID } from 'node:crypto';

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
import { runMigrations } from '../src/database/migrations.js';
import { createDeveloperApiKeyService } from '../src/developer/developer-api-key-service.js';
import { createDeveloperPublicDataService } from '../src/developer/developer-public-data-service.js';
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const ISSUER = 'https://auth.example.test/';

describe.skipIf(!runIntegrationTests)(
  'developer API persistence integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;
    let pool: ReturnType<typeof createDatabasePool>;

    beforeAll(async () => {
      loadApiEnvironment();
      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_developer_api_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const url = new URL(administrationConfig.connectionString);
      url.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: url.toString(),
      };

      const migrationResult = await runMigrations(temporaryConfig);
      expect(migrationResult.applied).toContain(
        '0058_create_developer_api_access.sql',
      );
      pool = createDatabasePool(temporaryConfig);
    }, 120_000);

    afterAll(async () => {
      if (pool) await pool.end();
      if (!administrationConfig || !temporaryDatabaseName) return;
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${temporaryDatabaseName} with (force)`,
        );
      });
    }, 30_000);

    it('keeps hashed credentials private and enforces the five-active-key limit under concurrency', async () => {
      const playerId = randomUUID();
      await insertPlayer(playerId, 'dev_limit');
      const service = createDeveloperApiKeyService(pool);

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, index) =>
          service.createForPlayer(playerId, `Application ${index + 1}`),
        ),
      );

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(5);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);

      const stored = await pool.query<{
        count: number;
        min_hash_bytes: number;
        max_hash_bytes: number;
      }>(
        `select count(*)::integer as count,
                min(octet_length(secret_hash))::integer as min_hash_bytes,
                max(octet_length(secret_hash))::integer as max_hash_bytes
           from private.developer_api_keys
          where owner_player_id = $1::uuid
            and revoked_at is null`,
        [playerId],
      );
      expect(stored.rows[0]).toEqual({
        count: 5,
        min_hash_bytes: 32,
        max_hash_bytes: 32,
      });

      const publicGrant = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from information_schema.table_privileges
          where table_schema = 'private'
            and table_name = 'developer_api_keys'
            and grantee = 'PUBLIC'`,
      );
      expect(publicGrant.rows[0]?.count).toBe(0);
    });

    it('enforces key ownership and keeps revocation idempotent', async () => {
      const ownerId = randomUUID();
      const otherPlayerId = randomUUID();
      await insertPlayer(ownerId, 'dev_owner');
      await insertPlayer(otherPlayerId, 'dev_other');
      const service = createDeveloperApiKeyService(pool);
      const created = await service.createForPlayer(ownerId, 'Revocation test');

      await expect(
        service.revokeForPlayer(otherPlayerId, created.key.id),
      ).rejects.toMatchObject({ name: 'DeveloperApiKeyNotFoundError' });
      await expect(service.authenticate(created.apiKey)).resolves.toEqual({
        id: created.key.id,
        ownerPlayerId: ownerId,
      });

      const firstRevocation = await service.revokeForPlayer(
        ownerId,
        created.key.id,
      );
      const repeatedRevocation = await service.revokeForPlayer(
        ownerId,
        created.key.id,
      );

      expect(firstRevocation.status).toBe('revoked');
      expect(firstRevocation.revokedAt).not.toBeNull();
      expect(repeatedRevocation.revokedAt).toBe(firstRevocation.revokedAt);
      await expect(service.authenticate(created.apiKey)).resolves.toBeNull();
    });

    it('executes the public card and leaderboard projections against the migrated schema', async () => {
      const playerId = randomUUID();
      await insertPlayer(playerId, 'dev_public');
      const service = createDeveloperPublicDataService(pool, {
        list: async () => [],
      });

      const card = await service.getCard(
        '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
      );
      expect(card).toMatchObject({
        name: 'Quillip',
        category: 'creature',
        rarity: 'common',
      });
      expect(card).not.toHaveProperty('authoringStatus');
      expect(card).not.toHaveProperty('rewardEligible');

      const allTime = await service.listLeaderboard({
        period: 'all_time',
        page: 1,
        pageSize: 20,
      });
      expect(allTime.entries).toContainEqual(
        expect.objectContaining({ playerName: 'dev_public', points: 0 }),
      );

      const monthly = await service.listLeaderboard({
        period: 'monthly',
        month: '2026-09',
        page: 1,
        pageSize: 20,
      });
      expect(monthly.entries).toContainEqual(
        expect.objectContaining({ playerName: 'dev_public', points: 0 }),
      );
    });

    it('denies keys as soon as deletion starts and removes them during account cleanup', async () => {
      const playerId = randomUUID();
      const subject = `auth0|developer-delete-${Date.now()}`;
      await insertPlayer(playerId, 'dev_delete', subject);
      const service = createDeveloperApiKeyService(pool);
      const created = await service.createForPlayer(playerId, 'Deletion test');

      await expect(service.authenticate(created.apiKey)).resolves.toEqual({
        id: created.key.id,
        ownerPlayerId: playerId,
      });

      const lifecycle = createAccountDeletionLifecycle(pool);
      const request = await lifecycle.request({ issuer: ISSUER, subject });

      await expect(service.authenticate(created.apiKey)).resolves.toBeNull();

      await lifecycle.complete(request.id);
      const count = await pool.query<{ count: number }>(
        `select count(*)::integer as count
           from private.developer_api_keys
          where owner_player_id = $1::uuid`,
        [playerId],
      );
      expect(count.rows[0]?.count).toBe(0);
    });

    async function insertPlayer(
      playerId: string,
      playerName: string,
      subject = `auth0|${playerName}`,
    ) {
      await pool.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1::uuid, $2, $3, $4, 'player', 'active')`,
        [playerId, ISSUER, subject, playerName],
      );
    }
  },
);
