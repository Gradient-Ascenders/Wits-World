import type pg from 'pg';

export type RankedDatabase = Pick<pg.Pool, 'connect' | 'query'>;
export type RankedClient = pg.PoolClient;

export async function rankedTransaction<T>(
  database: RankedDatabase,
  operation: (client: RankedClient) => Promise<T>,
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
