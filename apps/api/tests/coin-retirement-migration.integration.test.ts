import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

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
import { createAccountDeletionLifecycle } from '../src/players/account-deletion-lifecycle.js';

const COIN_RETIREMENT_MIGRATION = '0034_retire_coin_rewards.sql';
const DELETED_IDENTITY_DENIAL_MIGRATION =
  '0035_deny_deleted_identity_tokens.sql';
const MIGRATION_NAMES = [
  COIN_RETIREMENT_MIGRATION,
  DELETED_IDENTITY_DENIAL_MIGRATION,
];
const LEGACY_PLAYER_ID = '19300000-0000-4000-8000-000000000001';
const LEGACY_EVENT_ID = '19300000-0000-4000-8000-000000000002';
const LEGACY_CHALLENGE_ID = '19300000-0000-4000-8000-000000000003';
const LEGACY_ATTEMPT_ID = '19300000-0000-4000-8000-000000000004';
const LEGACY_COMPLETION_ID = '19300000-0000-4000-8000-000000000005';
const NEW_PLAYER_ID = '19300000-0000-4000-8000-000000000006';
const NEW_EVENT_ID = '19300000-0000-4000-8000-000000000007';
const NEW_CHALLENGE_ID = '19300000-0000-4000-8000-000000000008';
const NEW_ATTEMPT_ID = '19300000-0000-4000-8000-000000000009';
const NEW_COMPLETION_ID = '19300000-0000-4000-8000-000000000010';
const DELETION_ID = '19300000-0000-4000-8000-000000000011';
const LEGACY_ISSUER = 'https://legacy.example.test/';
const LEGACY_SUBJECT = 'auth0|legacy-coin-player';

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

describe.skipIf(!runIntegrationTests)('coin retirement migration', () => {
  it('preserves legacy history, blocks new coin activity, and keeps wallet deletion working', async () => {
    await withPreRetirementDatabase(async (databaseConfig, directory) => {
      await seedLegacyCoinHistory(databaseConfig);

      await Promise.all(
        MIGRATION_NAMES.map((name) =>
          copyFile(join(getMigrationsDirectory(), name), join(directory, name)),
        ),
      );

      await expect(runMigrations(databaseConfig, directory)).resolves.toEqual(
        expect.objectContaining({ applied: MIGRATION_NAMES }),
      );

      await withDatabaseClient(databaseConfig, async (client) => {
        const legacy = await client.query<{
          coin_balance: number;
          coins_awarded: number;
          ledger_amount: number;
        }>(
          `select
             completion.coins_awarded,
             wallet.coin_balance,
             ledger.amount as ledger_amount
           from public.event_completions completion
           join public.player_wallets wallet
             on wallet.player_id = completion.player_id
           join public.coin_ledger_entries ledger
             on ledger.completion_id = completion.id
          where completion.id = $1::uuid`,
          [LEGACY_COMPLETION_ID],
        );
        expect(legacy.rows).toEqual([
          { coin_balance: 63, coins_awarded: 63, ledger_amount: 63 },
        ]);

        const constraint = await client.query<{ convalidated: boolean }>(
          `select convalidated
             from pg_constraint
            where conname = 'event_completions_retired_coin_award_check'`,
        );
        expect(constraint.rows).toEqual([{ convalidated: false }]);

        await expect(
          client.query(
            `update public.player_wallets set coin_balance = 64
              where player_id = $1::uuid`,
            [LEGACY_PLAYER_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });
        await expect(
          client.query(
            `delete from public.player_wallets
              where player_id = $1::uuid`,
            [LEGACY_PLAYER_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });
        await expect(
          client.query(
            `insert into public.player_wallets (player_id, coin_balance)
             values ($1, 1)`,
            [NEW_PLAYER_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });
        await expect(
          client.query(
            `update public.coin_ledger_entries set amount = 64
              where completion_id = $1::uuid`,
            [LEGACY_COMPLETION_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });
        await expect(
          client.query(
            `delete from public.coin_ledger_entries
              where completion_id = $1::uuid`,
            [LEGACY_COMPLETION_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });
        await expect(
          client.query(
            `insert into public.coin_ledger_entries (
               player_id, amount, reason
             ) values ($1, 1, 'manual_adjustment')`,
            [NEW_PLAYER_ID],
          ),
        ).rejects.toMatchObject({ code: '55006' });

        await expect(
          client.query(
            `insert into public.event_completions (
               id, attempt_id, player_id, event_id, score_correct,
               average_difficulty, coins_awarded, reward_policy_version
             ) values ($1, $2, $3, $4, 5, 2.00, 1, 'points-cards-v2')`,
            [NEW_COMPLETION_ID, NEW_ATTEMPT_ID, NEW_PLAYER_ID, NEW_EVENT_ID],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'event_completions_retired_coin_award_check',
        });

        await expect(
          client.query(
            `insert into public.event_completions (
               id, attempt_id, player_id, event_id, score_correct,
               average_difficulty, coins_awarded, reward_policy_version
             ) values ($1, $2, $3, $4, 5, 2.00, 0, 'points-cards-v2')`,
            [NEW_COMPLETION_ID, NEW_ATTEMPT_ID, NEW_PLAYER_ID, NEW_EVENT_ID],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
      });

      const pool = createDatabasePool(databaseConfig);

      try {
        const lifecycle = createAccountDeletionLifecycle(pool, {
          clock: () => new Date('2026-08-30T10:00:00.000Z'),
          createId: () => DELETION_ID,
        });
        const requested = await lifecycle.request({
          issuer: LEGACY_ISSUER,
          subject: LEGACY_SUBJECT,
        });

        await expect(lifecycle.complete(requested.id)).resolves.toMatchObject({
          id: DELETION_ID,
          status: 'completed',
        });
      } finally {
        await pool.end();
      }

      await withDatabaseClient(databaseConfig, async (client) => {
        const retained = await client.query<{
          coins_awarded: number;
          ledger_entries: string;
          lifecycle_status: string;
          wallets: string;
        }>(
          `select
             player.lifecycle_status,
             completion.coins_awarded,
             (select count(*)::text from public.player_wallets wallet
               where wallet.player_id = player.id) as wallets,
             (select count(*)::text from public.coin_ledger_entries ledger
               where ledger.completion_id = completion.id) as ledger_entries
           from public.players player
           join public.event_completions completion
             on completion.player_id = player.id
          where player.id = $1::uuid`,
          [LEGACY_PLAYER_ID],
        );
        expect(retained.rows).toEqual([
          {
            coins_awarded: 63,
            ledger_entries: '1',
            lifecycle_status: 'deleted',
            wallets: '0',
          },
        ]);
      });

      await expect(runMigrations(databaseConfig, directory)).resolves.toEqual(
        expect.objectContaining({
          applied: [],
          skipped: expect.arrayContaining(MIGRATION_NAMES),
        }),
      );
    });
  }, 60_000);
});

async function withPreRetirementDatabase(
  callback: (
    databaseConfig: DatabaseConfig,
    directory: string,
  ) => Promise<void>,
) {
  loadApiEnvironment();
  const administrationConfig = buildDatabaseConfig({ target: 'test' });
  const databaseName = `wits_quest_coin_retirement_${Date.now()}_${process.pid}_${databaseNumber++}`;
  const directory = await mkdtemp(join(tmpdir(), 'wits-coin-retirement-'));
  temporaryDirectories.push(directory);

  const migrationNames = (await readdir(getMigrationsDirectory())).filter(
    (name) => name.endsWith('.sql') && name < COIN_RETIREMENT_MIGRATION,
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

async function seedLegacyCoinHistory(databaseConfig: DatabaseConfig) {
  await withDatabaseClient(databaseConfig, async (client) => {
    await client.query(
      `insert into public.players (
         id, auth_issuer, auth_subject, player_name, role, lifecycle_status
       ) values
         ($1, $3, $4, 'legacycoinplayer', 'player', 'active'),
         ($2, 'https://new.example.test/', 'auth0|new-player',
          'newcoinplayer', 'player', 'active')`,
      [LEGACY_PLAYER_ID, NEW_PLAYER_ID, LEGACY_ISSUER, LEGACY_SUBJECT],
    );

    await client.query(
      `insert into public.events (
         id, title, location, radius_metres, starts_at, ends_at, is_published
       ) values
         ($1, 'Legacy coin event',
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75, '2026-01-01', '2027-01-01', false),
         ($2, 'New points event',
          st_setsrid(st_makepoint(28.03038, -26.19205), 4326)::geography,
          75, '2026-01-01', '2027-01-01', false)`,
      [LEGACY_EVENT_ID, NEW_EVENT_ID],
    );
    await client.query(
      `insert into public.event_challenges (id, event_id, status)
       values ($1, $2, 'draft'), ($3, $4, 'draft')`,
      [LEGACY_CHALLENGE_ID, LEGACY_EVENT_ID, NEW_CHALLENGE_ID, NEW_EVENT_ID],
    );

    await client.query(
      'alter table public.challenge_attempts disable trigger challenge_attempts_snapshot_integrity',
    );
    try {
      await client.query(
        `insert into public.challenge_attempts (
           id, player_id, event_id, challenge_id, status, started_at,
           deadline, time_limit_seconds, average_difficulty, completed_at,
           completion_reason, score_correct
         ) values
           ($1, $2, $3, $4, 'completed', '2026-08-01T10:00:00Z',
            '2026-08-01T10:01:30Z', 90, 2.00, '2026-08-01T10:01:00Z',
            'answered', 5),
           ($5, $6, $7, $8, 'completed', '2026-08-02T10:00:00Z',
            '2026-08-02T10:01:30Z', 90, 2.00, '2026-08-02T10:01:00Z',
            'answered', 5)`,
        [
          LEGACY_ATTEMPT_ID,
          LEGACY_PLAYER_ID,
          LEGACY_EVENT_ID,
          LEGACY_CHALLENGE_ID,
          NEW_ATTEMPT_ID,
          NEW_PLAYER_ID,
          NEW_EVENT_ID,
          NEW_CHALLENGE_ID,
        ],
      );
    } finally {
      await client.query(
        'alter table public.challenge_attempts enable trigger challenge_attempts_snapshot_integrity',
      );
    }

    await client.query(
      `insert into public.event_completions (
         id, attempt_id, player_id, event_id, score_correct,
         average_difficulty, coins_awarded, reward_policy_version,
         completed_at
       ) values ($1, $2, $3, $4, 5, 2.00, 63, 'basic-v1',
                 '2026-08-01T10:01:00Z')`,
      [
        LEGACY_COMPLETION_ID,
        LEGACY_ATTEMPT_ID,
        LEGACY_PLAYER_ID,
        LEGACY_EVENT_ID,
      ],
    );
    await client.query(
      `insert into public.player_wallets (player_id, coin_balance)
       values ($1, 63)`,
      [LEGACY_PLAYER_ID],
    );
    await client.query(
      `insert into public.coin_ledger_entries (
         player_id, amount, reason, completion_id
       ) values ($1, 63, 'event_reward', $2)`,
      [LEGACY_PLAYER_ID, LEGACY_COMPLETION_ID],
    );
  });
}
