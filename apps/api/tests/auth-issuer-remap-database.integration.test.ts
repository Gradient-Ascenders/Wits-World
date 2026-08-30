import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDatabaseConfig,
  loadApiEnvironment,
  type DatabaseConfig,
} from '../src/config/database.js';
import { remapAuthIssuer } from '../src/database/auth-issuer-remap-procedure.js';
import { withDatabaseClient } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';

const FROM_ISSUER = 'https://tenant.example.test/';
const TO_ISSUER = 'https://login.wits-world.example/';
const FIRST_PLAYER_ID = '91000000-0000-4000-8000-000000000001';
const SECOND_PLAYER_ID = '91000000-0000-4000-8000-000000000002';
const DESTINATION_PLAYER_ID = '91000000-0000-4000-8000-000000000003';
const FIRST_STARTER_GRANT_ID = '91000000-0000-4000-8000-000000000004';
const SECOND_STARTER_GRANT_ID = '91000000-0000-4000-8000-000000000005';
const ORIGINAL_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');

const runIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!runIntegrationTests)(
  'Auth0 issuer remap database integration',
  () => {
    let administrationConfig: DatabaseConfig;
    let temporaryConfig: DatabaseConfig;
    let temporaryDatabaseName: string;

    beforeAll(async () => {
      loadApiEnvironment();

      administrationConfig = buildDatabaseConfig({ target: 'test' });
      temporaryDatabaseName = `wits_quest_auth_issuer_${Date.now()}_${process.pid}`;

      await withDatabaseClient(administrationConfig, async (client) => {
        await client.query(`create database ${temporaryDatabaseName}`);
      });

      const temporaryUrl = new URL(administrationConfig.connectionString);
      temporaryUrl.pathname = `/${temporaryDatabaseName}`;
      temporaryConfig = {
        ...administrationConfig,
        connectionString: temporaryUrl.toString(),
      };

      await runMigrations(temporaryConfig);
    }, 45_000);

    beforeEach(async () => {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          'drop trigger if exists test_skip_auth_issuer_remap on public.players',
        );
        await client.query(
          'drop function if exists public.test_skip_auth_issuer_remap()',
        );
        await client.query('truncate table public.players cascade');
      });
    }, 30_000);

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

    it('performs a dry run without changing identities or linked data', async () => {
      await seedSourcePlayers();
      const before = await readPersistedState();

      await expect(remapAuthIssuer(remapOptions(false))).resolves.toEqual({
        applied: false,
        database: temporaryDatabaseName,
        hostname: databaseHostname(),
        matchingPlayers: 2,
        updatedPlayers: 0,
      });

      await expect(readPersistedState()).resolves.toEqual(before);
    }, 30_000);

    it('remaps the real schema while preserving player identities and linked data', async () => {
      await seedSourcePlayers();

      await expect(remapAuthIssuer(remapOptions(true))).resolves.toEqual({
        applied: true,
        database: temporaryDatabaseName,
        hostname: databaseHostname(),
        matchingPlayers: 2,
        updatedPlayers: 2,
      });

      const state = await readPersistedState();

      expect(state.players).toEqual([
        {
          authIssuer: TO_ISSUER,
          authSubject: 'auth0|remap-one',
          id: FIRST_PLAYER_ID,
          role: 'player',
          updatedAt: expect.any(Date),
        },
        {
          authIssuer: TO_ISSUER,
          authSubject: 'auth0|remap-two',
          id: SECOND_PLAYER_ID,
          role: 'author',
          updatedAt: expect.any(Date),
        },
      ]);
      expect(
        state.players.every(({ updatedAt }) => updatedAt > ORIGINAL_UPDATED_AT),
      ).toBe(true);
      expect(state.starterGrants).toEqual([
        { affinity: 'wit', playerId: FIRST_PLAYER_ID },
        { affinity: 'spark', playerId: SECOND_PLAYER_ID },
      ]);
    }, 30_000);

    it('rejects a populated destination issuer without changing either identity set', async () => {
      await seedSourcePlayers();
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status
           ) values ($1, $2, $3, 'player', 'active')`,
          [DESTINATION_PLAYER_ID, TO_ISSUER, 'auth0|destination-player'],
        );
      });

      await expect(remapAuthIssuer(remapOptions(true))).rejects.toThrow(
        'The new Auth0 issuer already has local players; reconcile them before cutover.',
      );

      const issuers = await withDatabaseClient(
        temporaryConfig,
        async (client) =>
          client.query<{ auth_issuer: string; id: string }>(
            `select id::text, auth_issuer
               from public.players
              order by id`,
          ),
      );

      expect(issuers.rows).toEqual([
        { auth_issuer: FROM_ISSUER, id: FIRST_PLAYER_ID },
        { auth_issuer: FROM_ISSUER, id: SECOND_PLAYER_ID },
        { auth_issuer: TO_ISSUER, id: DESTINATION_PLAYER_ID },
      ]);
    }, 30_000);

    it('rolls back a partial issuer rewrite when bounded verification fails', async () => {
      await seedSourcePlayers();
      await installSkippedRowTrigger();

      await expect(remapAuthIssuer(remapOptions(true))).rejects.toThrow(
        'Auth0 issuer remap changed an unexpected number of players.',
      );

      const state = await readPersistedState();

      expect(state.players).toEqual([
        {
          authIssuer: FROM_ISSUER,
          authSubject: 'auth0|remap-one',
          id: FIRST_PLAYER_ID,
          role: 'player',
          updatedAt: ORIGINAL_UPDATED_AT,
        },
        {
          authIssuer: FROM_ISSUER,
          authSubject: 'auth0|remap-two',
          id: SECOND_PLAYER_ID,
          role: 'author',
          updatedAt: ORIGINAL_UPDATED_AT,
        },
      ]);
      expect(state.starterGrants).toEqual([
        { affinity: 'wit', playerId: FIRST_PLAYER_ID },
        { affinity: 'spark', playerId: SECOND_PLAYER_ID },
      ]);
    }, 30_000);

    function remapOptions(apply: boolean) {
      return {
        apply,
        confirmDatabase: temporaryDatabaseName,
        confirmHostname: databaseHostname(),
        databaseConfig: temporaryConfig,
        fromIssuer: FROM_ISSUER,
        toIssuer: TO_ISSUER,
      };
    }

    function databaseHostname() {
      return new URL(temporaryConfig.connectionString).hostname.toLowerCase();
    }

    async function seedSourcePlayers() {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(
          `insert into public.players (
             id,
             auth_issuer,
             auth_subject,
             role,
             lifecycle_status,
             updated_at
           ) values
             ($1, $3, 'auth0|remap-one', 'player', 'active', $4),
             ($2, $3, 'auth0|remap-two', 'author', 'active', $4)`,
          [FIRST_PLAYER_ID, SECOND_PLAYER_ID, FROM_ISSUER, ORIGINAL_UPDATED_AT],
        );
        await client.query(
          `insert into public.player_starter_grants (id, player_id, affinity)
           values ($1, $3, 'wit'), ($2, $4, 'spark')`,
          [
            FIRST_STARTER_GRANT_ID,
            SECOND_STARTER_GRANT_ID,
            FIRST_PLAYER_ID,
            SECOND_PLAYER_ID,
          ],
        );
      });
    }

    async function installSkippedRowTrigger() {
      await withDatabaseClient(temporaryConfig, async (client) => {
        await client.query(`
          create function public.test_skip_auth_issuer_remap()
          returns trigger
          language plpgsql
          as $function$
          begin
            if new.auth_issuer = '${TO_ISSUER}'
              and old.auth_subject = 'auth0|remap-two'
            then
              return null;
            end if;

            return new;
          end;
          $function$
        `);
        await client.query(`
          create trigger test_skip_auth_issuer_remap
          before update of auth_issuer on public.players
          for each row
          execute function public.test_skip_auth_issuer_remap()
        `);
      });
    }

    async function readPersistedState() {
      return withDatabaseClient(temporaryConfig, async (client) => {
        const players = await client.query<{
          auth_issuer: string;
          auth_subject: string;
          id: string;
          role: string;
          updated_at: Date;
        }>(
          `select
             id::text,
             auth_issuer,
             auth_subject,
             role,
             updated_at
           from public.players
           where id in ($1, $2)
           order by id`,
          [FIRST_PLAYER_ID, SECOND_PLAYER_ID],
        );
        const starterGrants = await client.query<{
          affinity: string;
          player_id: string;
        }>(
          `select player_id::text, affinity
             from public.player_starter_grants
            where player_id in ($1, $2)
            order by player_id`,
          [FIRST_PLAYER_ID, SECOND_PLAYER_ID],
        );

        return {
          players: players.rows.map((row) => ({
            authIssuer: row.auth_issuer,
            authSubject: row.auth_subject,
            id: row.id,
            role: row.role,
            updatedAt: row.updated_at,
          })),
          starterGrants: starterGrants.rows.map((row) => ({
            affinity: row.affinity,
            playerId: row.player_id,
          })),
        };
      });
    }
  },
);
