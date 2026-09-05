import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { getMigrationsDirectory } from '../src/database/paths.js';
import {
  createPlayerIdentityService,
  PlayerNameConflictError,
} from '../src/players/player-identity.js';
import type { LocalPlayer } from '../src/players/types.js';

import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const ORIGINAL_PLAYER_NAME_POLICY_CHECKSUM =
  'f599515f61b897ea3737df05147a3354bcb630b4564e5550220e14cf742090af';
const TOKEN_ISSUED_AT = new Date('2026-08-30T12:00:00.000Z');

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
    expect(migrationResult.applied).toContain(
      '0019_add_player_display_name.sql',
    );
    expect(migrationResult.applied).toContain(
      '0020_replace_display_name_with_player_name.sql',
    );
    expect(migrationResult.applied).toContain(
      '0021_enforce_player_name_policy.sql',
    );
    expect(migrationResult.applied).toContain(
      '0022_tighten_player_name_policy.sql',
    );
    expect(migrationResult.applied).toContain(
      '0024_complete_account_deletion_retention.sql',
    );
    expect(migrationResult.applied).toContain(
      '0025_add_ordering_challenges.sql',
    );
    expect(migrationResult.applied).toContain(
      '0026_create_player_progression.sql',
    );
    expect(migrationResult.applied).toContain('0027_create_ordered_trails.sql');
    expect(migrationResult.applied).toContain(
      '0028_create_asynchronous_pvp_persistence.sql',
    );
    expect(migrationResult.applied).toContain(
      '0029_curate_author_content_lifecycle.sql',
    );
    expect(migrationResult.applied).toContain(
      '0030_create_campaign_scheduling.sql',
    );

    await withDatabaseClient(temporaryConfig, async (client) => {
      const relation = await client.query<{
        players_table: string | null;
      }>(`select to_regclass('public.players')::text as players_table`);

      expect(relation.rows[0]?.players_table).toBe('players');
    });
  });

  it('creates only the final player_name column', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const columns = await client.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'players'
            and column_name in ('display_name', 'player_name')
          order by column_name`,
      );

      expect(columns.rows).toEqual([{ column_name: 'player_name' }]);
    });
  });

  it('preserves the applied 0019 checksum and clears temporary values in 0020', async () => {
    const transitionDatabaseName = `wits_quest_player_transition_${Date.now()}_${process.pid}`;
    const migrationDirectory = await mkdtemp(
      join(tmpdir(), 'wits-player-migrations-'),
    );
    const transitionUrl = new URL(administrationConfig.connectionString);
    transitionUrl.pathname = `/${transitionDatabaseName}`;
    const transitionConfig = {
      ...administrationConfig,
      connectionString: transitionUrl.toString(),
    };

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(`create database ${transitionDatabaseName}`);
    });

    try {
      const migrations = await readdir(getMigrationsDirectory());
      await Promise.all(
        migrations
          .filter((name) => name.endsWith('.sql') && name < '0020_')
          .map((name) =>
            copyFile(
              join(getMigrationsDirectory(), name),
              join(migrationDirectory, name),
            ),
          ),
      );

      await runMigrations(transitionConfig, migrationDirectory);
      await withDatabaseClient(transitionConfig, async (client) => {
        await client.query(
          `insert into public.players (
             id, auth_issuer, auth_subject, display_name, role, lifecycle_status
           ) values ($1, $2, $3, $4, 'player', 'active')`,
          [
            '00000000-0000-4000-8000-000000000147',
            'https://auth.example.test/',
            'auth0|temporary-display-name',
            'Temporary Name',
          ],
        );
      });

      await expect(runMigrations(transitionConfig)).resolves.toMatchObject({
        applied: [
          '0020_replace_display_name_with_player_name.sql',
          '0021_enforce_player_name_policy.sql',
          '0022_tighten_player_name_policy.sql',
          '0023_rebalance_canonical_card_roster.sql',
          '0024_complete_account_deletion_retention.sql',
          '0025_add_ordering_challenges.sql',
          '0026_create_player_progression.sql',
          '0027_create_ordered_trails.sql',
          '0028_create_asynchronous_pvp_persistence.sql',
          '0029_curate_author_content_lifecycle.sql',
          '0030_create_campaign_scheduling.sql',
          '0031_create_movement_evidence.sql',
          '0032_add_movement_eligibility_decisions.sql',
          '0033_add_async_pvp_invitation_invalidation.sql',
          '0034_retire_coin_rewards.sql',
          '0035_deny_deleted_identity_tokens.sql',
          '0036_remove_duplicate_indexes.sql',
          '0037_add_async_pvp_voluntary_resignation.sql',
          '0038_add_question_performance_analytics_indexes.sql',
        ],
      });

      await withDatabaseClient(transitionConfig, async (client) => {
        const player = await client.query<{ player_name: string | null }>(
          `select player_name from public.players where id = $1`,
          ['00000000-0000-4000-8000-000000000147'],
        );
        expect(player.rows[0]?.player_name).toBeNull();
      });
    } finally {
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${transitionDatabaseName} with (force)`,
        );
      });
      await rm(migrationDirectory, { force: true, recursive: true });
    }
  }, 45_000);

  it('upgrades an original 0021 database through later migrations without changing history or player data', async () => {
    const existingDatabaseName = `wits_quest_player_0021_${Date.now()}_${process.pid}`;
    const migrationDirectory = await mkdtemp(
      join(tmpdir(), 'wits-player-0021-migrations-'),
    );
    const existingUrl = new URL(administrationConfig.connectionString);
    existingUrl.pathname = `/${existingDatabaseName}`;
    const existingConfig = {
      ...administrationConfig,
      connectionString: existingUrl.toString(),
    };

    await withDatabaseClient(administrationConfig, async (client) => {
      await client.query(`create database ${existingDatabaseName}`);
    });

    try {
      const migrations = await readdir(getMigrationsDirectory());
      await Promise.all(
        migrations
          .filter((name) => name.endsWith('.sql') && name < '0022_')
          .map((name) =>
            copyFile(
              join(getMigrationsDirectory(), name),
              join(migrationDirectory, name),
            ),
          ),
      );

      const originalResult = await runMigrations(
        existingConfig,
        migrationDirectory,
      );
      expect(originalResult.applied).toContain(
        '0021_enforce_player_name_policy.sql',
      );

      await withDatabaseClient(existingConfig, async (client) => {
        const recordedMigration = await client.query<{ checksum: string }>(
          `select checksum
             from public.schema_migrations
            where name = '0021_enforce_player_name_policy.sql'`,
        );
        expect(recordedMigration.rows).toEqual([
          { checksum: ORIGINAL_PLAYER_NAME_POLICY_CHECKSUM },
        ]);

        await client.query(
          `insert into public.players (
             id, auth_issuer, auth_subject, player_name, role, lifecycle_status
           ) values
             ($1, $2, $3, $4, 'author', 'active'),
             ($5, $6, $7, null, 'player', 'active')`,
          [
            '00000000-0000-4000-8000-000000000148',
            'https://auth.example.test/',
            'auth0|existing-0021-player',
            'normal_player',
            '00000000-0000-4000-8000-000000000149',
            'https://auth.example.test/',
            'google-oauth2|existing-0021-player',
          ],
        );

        await client.query(
          `insert into public.players (
             id, auth_issuer, auth_subject, player_name, role, lifecycle_status
           ) values ($1, $2, $3, $4, 'player', 'active')`,
          [
            '00000000-0000-4000-8000-000000000150',
            'https://auth.example.test/',
            'google-oauth2|email-shaped-before-0022',
            'bob@example.com',
          ],
        );
        await client.query(`delete from public.players where id = $1`, [
          '00000000-0000-4000-8000-000000000150',
        ]);
      });

      await expect(
        runMigrations(existingConfig, migrationDirectory),
      ).resolves.toMatchObject({
        applied: [],
        skipped: expect.arrayContaining([
          '0021_enforce_player_name_policy.sql',
        ]),
      });

      await expect(runMigrations(existingConfig)).resolves.toMatchObject({
        applied: [
          '0022_tighten_player_name_policy.sql',
          '0023_rebalance_canonical_card_roster.sql',
          '0024_complete_account_deletion_retention.sql',
          '0025_add_ordering_challenges.sql',
          '0026_create_player_progression.sql',
          '0027_create_ordered_trails.sql',
          '0028_create_asynchronous_pvp_persistence.sql',
          '0029_curate_author_content_lifecycle.sql',
          '0030_create_campaign_scheduling.sql',
          '0031_create_movement_evidence.sql',
          '0032_add_movement_eligibility_decisions.sql',
          '0033_add_async_pvp_invitation_invalidation.sql',
          '0034_retire_coin_rewards.sql',
          '0035_deny_deleted_identity_tokens.sql',
          '0036_remove_duplicate_indexes.sql',
          '0037_add_async_pvp_voluntary_resignation.sql',
          '0038_add_question_performance_analytics_indexes.sql',
        ],
      });

      await withDatabaseClient(existingConfig, async (client) => {
        const players = await client.query<{
          auth_issuer: string | null;
          auth_subject: string | null;
          id: string;
          lifecycle_status: string;
          player_name: string | null;
          role: string;
        }>(
          `select id, auth_issuer, auth_subject, player_name, role, lifecycle_status
             from public.players
            where id in ($1, $2)
            order by id`,
          [
            '00000000-0000-4000-8000-000000000148',
            '00000000-0000-4000-8000-000000000149',
          ],
        );
        expect(players.rows).toEqual([
          {
            auth_issuer: 'https://auth.example.test/',
            auth_subject: 'auth0|existing-0021-player',
            id: '00000000-0000-4000-8000-000000000148',
            lifecycle_status: 'active',
            player_name: 'normal_player',
            role: 'author',
          },
          {
            auth_issuer: 'https://auth.example.test/',
            auth_subject: 'google-oauth2|existing-0021-player',
            id: '00000000-0000-4000-8000-000000000149',
            lifecycle_status: 'active',
            player_name: null,
            role: 'player',
          },
        ]);

        const index = await client.query<{ indexdef: string }>(
          `select indexdef
             from pg_indexes
            where schemaname = 'public'
              and tablename = 'players'
              and indexname = 'players_player_name_case_insensitive_unique'`,
        );
        expect(index.rows[0]?.indexdef).toContain(
          'UNIQUE INDEX players_player_name_case_insensitive_unique',
        );
        expect(index.rows[0]?.indexdef).toContain('lower(player_name)');

        await expect(
          client.query(
            `insert into public.players (
               id, auth_issuer, auth_subject, player_name, role, lifecycle_status
             ) values ($1, $2, $3, $4, 'player', 'active')`,
            [
              '00000000-0000-4000-8000-000000000151',
              'https://auth.example.test/',
              'google-oauth2|email-shaped-after-0022',
              'bob@example.com',
            ],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    } finally {
      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(
          `drop database if exists ${existingDatabaseName} with (force)`,
        );
      });
      await rm(migrationDirectory, { force: true, recursive: true });
    }
  }, 60_000);

  it('provisions the trusted Auth0 player name through issuer and subject', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const service = createPlayerIdentityService(client);
      const player = await service.resolve({
        connectionStrategy: 'auth0',
        issuer: 'https://auth.example.test/',
        playerName: 'naledi',
        subject: 'auth0|new-player',
        tokenIssuedAt: TOKEN_ISSUED_AT,
      });

      const stored = await client.query<{
        auth_issuer: string;
        auth_subject: string;
        id: string;
        player_name: string;
      }>(
        `select id, auth_issuer, auth_subject, player_name
           from public.players
          where id = $1`,
        [player.id],
      );

      expect(stored.rows[0]).toEqual({
        auth_issuer: 'https://auth.example.test/',
        auth_subject: 'auth0|new-player',
        id: player.id,
        player_name: 'naledi',
      });
    });
  });

  it('provisions a Google player with NULL and preserves its assigned local name', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const service = createPlayerIdentityService(client);
      const identity = {
        connectionStrategy: 'google-oauth2' as const,
        issuer: 'https://auth.example.test/',
        playerName: null,
        subject: 'google-oauth2|new-player',
        tokenIssuedAt: TOKEN_ISSUED_AT,
      };

      const provisioned = await service.resolve(identity);
      expect(provisioned.playerName).toBeNull();

      const assigned = await service.assignInitialPlayerName(
        provisioned.id,
        '  Google_Player  ',
      );
      expect(assigned).toMatchObject({
        id: provisioned.id,
        playerName: 'google_player',
      });

      await expect(service.resolve(identity)).resolves.toMatchObject({
        id: provisioned.id,
        playerName: 'google_player',
      });

      const stored = await client.query<{
        auth_subject: string;
        player_name: string;
      }>(
        `select auth_subject, player_name
           from public.players
          where id = $1`,
        [provisioned.id],
      );
      expect(stored.rows[0]).toEqual({
        auth_subject: identity.subject,
        player_name: 'google_player',
      });
    });
  });

  it('fills a legacy NULL and synchronizes a later trusted claim without changing identity', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const playerId = '00000000-0000-4000-8000-000000000144';
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|player-name-invariants';
      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, role, lifecycle_status
         ) values ($1, $2, $3, 'author', 'active')`,
        [playerId, issuer, subject],
      );
      await client.query(
        `insert into public.player_starter_grants (id, player_id, affinity)
         values ('00000000-0000-4000-8000-000000000244', $1, 'wit')`,
        [playerId],
      );
      const service = createPlayerIdentityService(client);
      const populated = await service.resolve({
        connectionStrategy: 'auth0',
        issuer,
        playerName: 'professor-nova',
        subject,
        tokenIssuedAt: TOKEN_ISSUED_AT,
      });
      const synchronized = await service.resolve({
        connectionStrategy: 'auth0',
        issuer,
        playerName: 'professor-nova-2',
        subject,
        tokenIssuedAt: TOKEN_ISSUED_AT,
      });

      const stored = await client.query<{
        auth_issuer: string;
        auth_subject: string;
        player_name: string;
        id: string;
        lifecycle_status: string;
        role: string;
      }>(
        `select id, auth_issuer, auth_subject, role, lifecycle_status, player_name
           from public.players
          where id = $1`,
        [playerId],
      );

      expect(stored.rows[0]).toEqual({
        auth_issuer: issuer,
        auth_subject: subject,
        player_name: 'professor-nova-2',
        id: playerId,
        lifecycle_status: 'active',
        role: 'author',
      });
      expect(populated.id).toBe(playerId);
      expect(synchronized.id).toBe(playerId);

      const starterGrant = await client.query<{
        affinity: string;
        player_id: string;
      }>(
        `select player_id, affinity
           from public.player_starter_grants
          where player_id = $1`,
        [playerId],
      );
      expect(starterGrant.rows[0]).toEqual({
        affinity: 'wit',
        player_id: playerId,
      });
    });
  });

  it('leaves a matching trusted player name and update timestamp unchanged', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const playerId = '00000000-0000-4000-8000-000000000142';
      const issuer = 'https://auth.example.test/';
      const subject = 'auth0|stable-player-name';
      const originalUpdatedAt = new Date('2026-08-01T08:00:00.000Z');
      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status,
           updated_at
         ) values ($1, $2, $3, $4, 'player', 'active', $5)`,
        [playerId, issuer, subject, 'stableplayer', originalUpdatedAt],
      );

      const service = createPlayerIdentityService(client);
      await expect(
        service.resolve({
          connectionStrategy: 'auth0',
          issuer,
          playerName: 'stableplayer',
          subject,
          tokenIssuedAt: TOKEN_ISSUED_AT,
        }),
      ).resolves.toMatchObject({
        id: playerId,
        playerName: 'stableplayer',
      });

      const stored = await client.query<{
        player_name: string;
        updated_at: Date;
      }>(
        `select player_name, updated_at
           from public.players
          where id = $1`,
        [playerId],
      );
      expect(stored.rows[0]).toEqual({
        player_name: 'stableplayer',
        updated_at: originalUpdatedAt,
      });
    });
  });

  it.each([
    ['an empty value', ''],
    ['only whitespace', '   '],
    ['surrounding whitespace', ' naledi '],
    ['uppercase characters', 'Naledi'],
    ['control characters', 'naledi\nstar'],
    ['an email format', 'bob@example.com'],
    ['an email format with a single-label domain', 'player@example'],
    ['a phone number format', '+27123456789'],
    ['a phone number format without a plus', '27123456789'],
  ])(
    'rejects a player name with %s at the database boundary',
    async (_label, playerName) => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await expect(
          client.query(
            `insert into public.players (
             id, auth_issuer, auth_subject, role, lifecycle_status, player_name
           ) values ($1, $2, $3, 'player', 'active', $4)`,
            [
              '00000000-0000-4000-8000-000000000143',
              'https://auth.example.test/',
              `auth0|invalid-player-name-${playerName.length}`,
              playerName,
            ],
          ),
        ).rejects.toThrow();
      });
    },
  );

  it('enforces player-name uniqueness through direct SQL', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values ($1, $2, $3, $4, 'player', 'active')`,
        [
          '00000000-0000-4000-8000-000000000145',
          'https://auth.example.test/',
          'auth0|unique-name-winner',
          'caseplayer',
        ],
      );

      await expect(
        client.query(
          `insert into public.players (
             id, auth_issuer, auth_subject, player_name, role, lifecycle_status
           ) values ($1, $2, $3, $4, 'player', 'active')`,
          [
            '00000000-0000-4000-8000-000000000146',
            'https://auth.example.test/',
            'auth0|unique-name-loser',
            'caseplayer',
          ],
        ),
      ).rejects.toMatchObject({ code: '23505' });

      const losingIdentity = await client.query(
        `select id from public.players
          where auth_issuer = $1 and auth_subject = $2`,
        ['https://auth.example.test/', 'auth0|unique-name-loser'],
      );
      expect(losingIdentity.rowCount).toBe(0);
    });
  });

  it('rolls back a conflicting name synchronization without changing either identity', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const issuer = 'https://auth.example.test/';
      const winningPlayerId = '00000000-0000-4000-8000-000000000148';
      const losingPlayerId = '00000000-0000-4000-8000-000000000149';

      await client.query(
        `insert into public.players (
           id, auth_issuer, auth_subject, player_name, role, lifecycle_status
         ) values
           ($1, $3, 'auth0|sync-winner', 'reservedplayer', 'player', 'active'),
           ($2, $3, 'auth0|sync-loser', 'originalplayer', 'author', 'active')`,
        [winningPlayerId, losingPlayerId, issuer],
      );
      await client.query(
        `insert into public.player_starter_grants (id, player_id, affinity)
         values ('00000000-0000-4000-8000-000000000249', $1, 'spark')`,
        [losingPlayerId],
      );
      const service = createPlayerIdentityService(client);
      await expect(
        service.resolve({
          connectionStrategy: 'auth0',
          issuer,
          playerName: 'reservedplayer',
          subject: 'auth0|sync-loser',
          tokenIssuedAt: TOKEN_ISSUED_AT,
        }),
      ).rejects.toBeInstanceOf(PlayerNameConflictError);

      const players = await client.query<{
        auth_subject: string;
        id: string;
        player_name: string;
        role: string;
      }>(
        `select id, auth_subject, player_name, role
           from public.players
          where id in ($1, $2)
          order by id`,
        [winningPlayerId, losingPlayerId],
      );
      expect(players.rows).toEqual([
        {
          auth_subject: 'auth0|sync-winner',
          id: winningPlayerId,
          player_name: 'reservedplayer',
          role: 'player',
        },
        {
          auth_subject: 'auth0|sync-loser',
          id: losingPlayerId,
          player_name: 'originalplayer',
          role: 'author',
        },
      ]);

      const starterGrant = await client.query<{
        affinity: string;
        player_id: string;
      }>(
        `select player_id, affinity
           from public.player_starter_grants
          where player_id = $1`,
        [losingPlayerId],
      );
      expect(starterGrant.rows).toEqual([
        { affinity: 'spark', player_id: losingPlayerId },
      ]);
    });
  });

  it('rolls back the losing concurrent provisioning request without switching identity', async () => {
    const pool = createDatabasePool(temporaryConfig);

    try {
      const service = createPlayerIdentityService(pool);
      const principals = [
        {
          connectionStrategy: 'auth0',
          issuer: 'https://auth.example.test/',
          playerName: 'concurrentplayer',
          subject: 'auth0|concurrent-player-one',
          tokenIssuedAt: TOKEN_ISSUED_AT,
        },
        {
          connectionStrategy: 'auth0',
          issuer: 'https://auth.example.test/',
          playerName: 'concurrentplayer',
          subject: 'auth0|concurrent-player-two',
          tokenIssuedAt: TOKEN_ISSUED_AT,
        },
      ] as const;

      const results = await Promise.allSettled(
        principals.map((principal) => service.resolve(principal)),
      );
      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<LocalPlayer> =>
          result.status === 'fulfilled',
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(PlayerNameConflictError);

      const rows = await pool.query<{
        auth_subject: string;
        id: string;
      }>(
        `select id, auth_subject
           from public.players
          where lower(player_name) = lower($1)`,
        ['concurrentplayer'],
      );

      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.id).toBe(fulfilled[0]?.value.id);

      const winningIndex = results.findIndex(
        (result) => result.status === 'fulfilled',
      );
      expect(rows.rows[0]?.auth_subject).toBe(
        principals[winningIndex]?.subject,
      );
    } finally {
      await pool.end();
    }
  });

  it('allows exactly one concurrent Google player to claim a Player Name', async () => {
    const pool = createDatabasePool(temporaryConfig);

    try {
      const service = createPlayerIdentityService(pool);
      const players = await Promise.all(
        ['google-oauth2|claim-one', 'google-oauth2|claim-two'].map((subject) =>
          service.resolve({
            connectionStrategy: 'google-oauth2',
            issuer: 'https://auth.example.test/',
            playerName: null,
            subject,
            tokenIssuedAt: TOKEN_ISSUED_AT,
          }),
        ),
      );
      const results = await Promise.allSettled(
        players.map((player) =>
          service.assignInitialPlayerName(player.id, 'shared-google-name'),
        ),
      );

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(PlayerNameConflictError);

      const stored = await pool.query<{
        id: string;
        player_name: string | null;
      }>(
        `select id, player_name
           from public.players
          where id = any($1::uuid[])
          order by id`,
        [players.map((player) => player.id)],
      );
      expect(
        stored.rows.filter((player) => player.player_name !== null),
      ).toHaveLength(1);
      expect(
        stored.rows.filter((player) => player.player_name === null),
      ).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  it('does not bind a database identity to a Player Name reserved by Google', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      const service = createPlayerIdentityService(client);
      const googlePlayer = await service.resolve({
        connectionStrategy: 'google-oauth2',
        issuer: 'https://auth.example.test/',
        playerName: null,
        subject: 'google-oauth2|cross-provider-winner',
        tokenIssuedAt: TOKEN_ISSUED_AT,
      });
      await service.assignInitialPlayerName(
        googlePlayer.id,
        'cross-provider-name',
      );

      await expect(
        service.resolve({
          connectionStrategy: 'auth0',
          issuer: 'https://auth.example.test/',
          playerName: 'cross-provider-name',
          subject: 'auth0|cross-provider-loser',
          tokenIssuedAt: TOKEN_ISSUED_AT,
        }),
      ).rejects.toBeInstanceOf(PlayerNameConflictError);

      const losingIdentity = await client.query(
        `select id
           from public.players
          where auth_issuer = $1
            and auth_subject = $2`,
        ['https://auth.example.test/', 'auth0|cross-provider-loser'],
      );
      expect(losingIdentity.rowCount).toBe(0);
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
            connectionStrategy: 'auth0',
            issuer,
            playerName: 'concurrent-player',
            subject,
            tokenIssuedAt: TOKEN_ISSUED_AT,
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

      const denialColumns = await client.query<{ column_name: string }>(
        `
          select column_name
            from information_schema.columns
           where table_schema = 'private'
             and table_name = 'deleted_identity_token_denials'
           order by column_name
        `,
      );

      expect(denialColumns.rows.map((row) => row.column_name)).toEqual([
        'deletion_request_id',
        'expires_at',
        'identity_digest',
        'identity_salt',
        'tokens_issued_before',
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
          id, auth_issuer, auth_subject, role, lifecycle_status, player_name
        ) values ($1, $2, $3, 'author', 'active', 'professor-nova')`,
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
        player_name: string | null;
        role: string | null;
        lifecycle_status: string;
        deletion_request_id: string | null;
      }>(
        `select
          auth_issuer,
          auth_subject,
          player_name,
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
        player_name: null,
        role: null,
        lifecycle_status: 'deleted',
        deletion_request_id: null,
      });

      await expect(service.complete(requested.id)).resolves.toEqual(completed);
    });
  });

  it('purges expired token denials and only twelve-month-old completed audits', async () => {
    await withDatabaseClient(temporaryConfig, async (client) => {
      await client.query(
        `insert into public.account_deletion_requests (
          id, requested_at, completed_at, status
        ) values
          ($1, '2025-08-01T00:00:00Z', '2025-08-14T00:00:00Z', 'completed'),
          ($2, '2025-08-01T00:00:00Z', '2025-08-15T00:00:00Z', 'completed'),
          ($3, '2025-01-01T00:00:00Z', null, 'pending'),
          ($4, '2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z', 'completed')`,
        [
          '00000000-0000-4000-8000-000000000240',
          '00000000-0000-4000-8000-000000000241',
          '00000000-0000-4000-8000-000000000242',
          '00000000-0000-4000-8000-000000000243',
        ],
      );
      await client.query(
        `
          insert into private.deleted_identity_token_denials (
            deletion_request_id,
            identity_salt,
            identity_digest,
            tokens_issued_before,
            expires_at
          ) values (
            $1,
            decode(repeat('11', 32), 'hex'),
            decode(repeat('22', 32), 'hex'),
            '2026-07-02T00:00:00Z',
            '2026-08-01T00:00:00Z'
          )
        `,
        ['00000000-0000-4000-8000-000000000243'],
      );

      const service = createAccountDeletionLifecycle(createPoolFacade(client), {
        clock: () => new Date('2026-08-14T00:00:00.000Z'),
      });

      await expect(service.purgeExpiredCompleted()).resolves.toBe(1);

      const remaining = await client.query<{ id: string }>(
        `select id
          from public.account_deletion_requests
          where id in ($1, $2, $3, $4)
          order by id`,
        [
          '00000000-0000-4000-8000-000000000240',
          '00000000-0000-4000-8000-000000000241',
          '00000000-0000-4000-8000-000000000242',
          '00000000-0000-4000-8000-000000000243',
        ],
      );

      expect(remaining.rows.map((row) => row.id)).toEqual([
        '00000000-0000-4000-8000-000000000241',
        '00000000-0000-4000-8000-000000000242',
        '00000000-0000-4000-8000-000000000243',
      ]);

      const denials = await client.query<{ count: string }>(
        `select count(*)::text as count
           from private.deleted_identity_token_denials
          where deletion_request_id = $1`,
        ['00000000-0000-4000-8000-000000000243'],
      );
      expect(denials.rows[0]?.count).toBe('0');
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
