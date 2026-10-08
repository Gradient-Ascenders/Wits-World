import type pg from 'pg';
import {
  observeDatabaseError,
  observeRollback,
} from '../database/pool-observability.js';
import type { GameplayMutationGuard } from './gameplay-coordination.js';

export type RankedDatabase = Pick<pg.Pool, 'connect' | 'query'> & {
  activityGuard?: GameplayMutationGuard;
  existingWorkGuard?: GameplayMutationGuard;
};
export type RankedClient = pg.PoolClient;

export async function rankedTransaction<T>(
  database: RankedDatabase,
  operation: (client: RankedClient) => Promise<T>,
  guard?: GameplayMutationGuard,
): Promise<T> {
  const permit = await (guard ?? database.activityGuard)?.begin();
  let client: RankedClient | undefined;
  let destroy = false;
  try {
    client = await database.connect();
    await client.query('begin');
    await permit?.enter(client);
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    observeDatabaseError(error, 'transaction');
    if (client) {
      try {
        await observeRollback(() => client!.query('rollback'));
      } catch {
        destroy = true;
      }
    }
    throw error;
  } finally {
    if (destroy) client?.release(true);
    else client?.release();
    await permit?.finish();
  }
}

export async function rankedDatabaseNow(client: RankedClient): Promise<Date> {
  const result = await client.query<{ now: Date }>(
    'select clock_timestamp() as now',
  );
  const now = result.rows[0]?.now;
  if (!now) throw new Error('PostgreSQL did not return its current time.');
  return now;
}

export class RankedError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RankedError';
  }
}

export function rankedUnavailable(): RankedError {
  return new RankedError(
    409,
    'RANKED_UNAVAILABLE',
    'Ranked matchmaking is currently unavailable.',
  );
}

export function rankedConflict(): RankedError {
  return new RankedError(
    409,
    'RANKED_STATE_CONFLICT',
    'The ranked request conflicts with the current queue state.',
  );
}
