import type pg from 'pg';

import type { DatabaseConfig } from '../config/database.js';
import { type DatabaseClientRunner, withDatabaseClient } from './connection.js';

export interface AuthIssuerRemapResult {
  applied: boolean;
  database: string;
  hostname: string;
  matchingPlayers: number;
  updatedPlayers: number;
}

interface RemapAuthIssuerOptions {
  apply: boolean;
  confirmDatabase: string;
  confirmHostname: string;
  databaseConfig: DatabaseConfig;
  fromIssuer: string;
  toIssuer: string;
}

interface CountRow {
  count: number;
}

const IDENTITY_REMAP_LOCK_KEY = 9_160_005;

export async function remapAuthIssuer(
  options: RemapAuthIssuerOptions,
  runWithClient: DatabaseClientRunner = withDatabaseClient,
): Promise<AuthIssuerRemapResult> {
  return runWithClient(options.databaseConfig, async (client) => {
    const database = await readDatabaseName(client);
    const hostname = readDatabaseHostname(options.databaseConfig);

    if (
      database !== options.confirmDatabase ||
      hostname !== options.confirmHostname
    ) {
      throw new Error(
        'The connected database name or hostname does not match the explicit confirmation.',
      );
    }

    if (!options.apply) {
      const matchingPlayers = await inspectIssuerState(client, options);

      return {
        applied: false,
        database,
        hostname,
        matchingPlayers,
        updatedPlayers: 0,
      };
    }

    await client.query('begin');

    try {
      await client.query('select pg_advisory_xact_lock($1)', [
        IDENTITY_REMAP_LOCK_KEY,
      ]);
      await client.query('lock table public.players in access exclusive mode');

      const matchingPlayers = await inspectIssuerState(client, options);
      const updateResult = await client.query(
        `
          update public.players
             set auth_issuer = $2,
                 updated_at = now()
           where auth_issuer = $1
        `,
        [options.fromIssuer, options.toIssuer],
      );
      const updatedPlayers = updateResult.rowCount ?? 0;

      if (updatedPlayers !== matchingPlayers) {
        throw new Error(
          'Auth0 issuer remap changed an unexpected number of players.',
        );
      }

      const remainingPlayers = await countPlayersForIssuer(
        client,
        options.fromIssuer,
      );
      const targetPlayers = await countPlayersForIssuer(
        client,
        options.toIssuer,
      );

      if (remainingPlayers !== 0 || targetPlayers !== matchingPlayers) {
        throw new Error('Auth0 issuer remap verification failed.');
      }

      await client.query('commit');

      return {
        applied: true,
        database,
        hostname,
        matchingPlayers,
        updatedPlayers,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

function readDatabaseHostname(databaseConfig: DatabaseConfig): string {
  const connectionUrl = new URL(databaseConfig.connectionString);

  if (!connectionUrl.hostname) {
    throw new Error('Could not identify the configured database hostname.');
  }

  return connectionUrl.hostname.toLowerCase();
}

async function inspectIssuerState(
  client: pg.PoolClient,
  options: Pick<RemapAuthIssuerOptions, 'fromIssuer' | 'toIssuer'>,
): Promise<number> {
  const matchingPlayers = await countPlayersForIssuer(
    client,
    options.fromIssuer,
  );
  const targetPlayers = await countPlayersForIssuer(client, options.toIssuer);

  if (matchingPlayers === 0) {
    throw new Error(
      'No players use the old Auth0 issuer; verify the exact source issuer before cutover.',
    );
  }

  if (targetPlayers !== 0) {
    throw new Error(
      'The new Auth0 issuer already has local players; reconcile them before cutover.',
    );
  }

  return matchingPlayers;
}

async function readDatabaseName(client: pg.PoolClient): Promise<string> {
  const result = await client.query<{ database: string }>(
    'select current_database() as database',
  );
  const database = result.rows[0]?.database;

  if (!database) {
    throw new Error('Could not identify the connected database.');
  }

  return database;
}

async function countPlayersForIssuer(
  client: pg.PoolClient,
  issuer: string,
): Promise<number> {
  const result = await client.query<CountRow>(
    `select count(*)::integer as count
       from public.players
      where auth_issuer = $1`,
    [issuer],
  );
  const count = result.rows[0]?.count;

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('Could not count players for the Auth0 issuer.');
  }

  return count;
}
