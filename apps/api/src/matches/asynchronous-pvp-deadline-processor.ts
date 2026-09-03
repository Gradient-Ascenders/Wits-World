import type pg from 'pg';

import type {
  AsyncPvpDatabase,
  AsyncPvpService,
} from './asynchronous-pvp-service.js';

const BATCH_SIZE = 25;

export interface AsyncPvpDeadlineSweepResult {
  invitationsExpired: number;
  matchesForfeited: number;
  failures: number;
}

export interface AsyncPvpDeadlineProcessor {
  runOnce(): Promise<AsyncPvpDeadlineSweepResult>;
}

export interface AsyncPvpDeadlineLogger {
  error(context: Record<string, never>, message: string): void;
}

export function createAsyncPvpDeadlineProcessor(
  database: AsyncPvpDatabase,
  service: Pick<AsyncPvpService, 'expireInvitation' | 'forfeitOverdueMatch'>,
  logger: AsyncPvpDeadlineLogger,
): AsyncPvpDeadlineProcessor {
  return {
    async runOnce() {
      const invitationIds = await listDueIds(
        database,
        `select id::text
           from public.async_pvp_invitations
          where status = 'pending' and expires_at <= transaction_timestamp()
          order by expires_at, id
          limit $1`,
      );
      const matchIds = await listDueIds(
        database,
        `select id::text
           from public.async_pvp_matches
          where status = 'active' and turn_deadline <= transaction_timestamp()
          order by turn_deadline, id
          limit $1`,
      );

      let invitationsExpired = 0;
      let matchesForfeited = 0;
      let failures = 0;
      for (const id of invitationIds) {
        try {
          if (
            await transactItem(database, (client) =>
              service.expireInvitation(client, id),
            )
          ) {
            invitationsExpired += 1;
          }
        } catch {
          failures += 1;
          logger.error(
            {},
            'Asynchronous PvP invitation deadline finalization failed.',
          );
        }
      }
      for (const id of matchIds) {
        try {
          if (
            await transactItem(database, (client) =>
              service.forfeitOverdueMatch(client, id),
            )
          ) {
            matchesForfeited += 1;
          }
        } catch {
          failures += 1;
          logger.error(
            {},
            'Asynchronous PvP match deadline finalization failed.',
          );
        }
      }
      return { invitationsExpired, matchesForfeited, failures };
    },
  };
}

async function listDueIds(
  database: AsyncPvpDatabase,
  statement: string,
): Promise<string[]> {
  const client = await database.connect();
  try {
    const result = await client.query<{ id: string }>(statement, [BATCH_SIZE]);
    return result.rows.map((row) => row.id);
  } finally {
    client.release();
  }
}

async function transactItem<T>(
  database: AsyncPvpDatabase,
  operation: (client: {
    query<R extends pg.QueryResultRow>(
      statement: string,
      values?: unknown[],
    ): Promise<{ rows: R[]; rowCount?: number | null }>;
    release(): void;
  }) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
