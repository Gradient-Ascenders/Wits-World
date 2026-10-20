import type pg from 'pg';

import {
  currentPoolCategory,
  type PoolCategory,
} from './pool-observability.js';

// Deadline processing, placement boundaries, coordination and player requests
// retain direct admission. Routine work shares one of the existing four slots.
const routineCategories = new Set<PoolCategory>([
  'live_cleanup',
  'movement_retention',
  'trust_evaluation',
  'trust_retention',
  'placement_sweep',
  'account_deletion_retry',
  'trade_retention',
]);

/** Bound routine checkouts without adding connections or changing transactions. */
export function limitRoutineMaintenance(pool: pg.Pool): void {
  const connect = pool.connect.bind(pool);
  const end = pool.end.bind(pool);
  let active = false;
  let ending = false;
  const waiting: Array<{ start(): void; reject(error: Error): void }> = [];
  const endedError = () =>
    new Error('Cannot use a pool after calling end on the pool');
  const acquire = (): Promise<() => void> =>
    new Promise((resolve, reject) => {
      const start = () => {
        active = true;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          active = false;
          if (!ending) waiting.shift()?.start();
        });
      };
      if (ending) reject(endedError());
      else if (active) waiting.push({ start, reject });
      else start();
    });

  pool.connect = ((
    callback?: (
      error: Error | undefined,
      client?: pg.PoolClient,
      release?: pg.PoolClient['release'],
    ) => void,
  ) => {
    if (!routineCategories.has(currentPoolCategory())) {
      return callback ? connect(callback) : connect();
    }
    const checkout = acquire().then(async (leave) => {
      try {
        const client = await connect();
        const release = client.release;
        let released = false;
        client.release = function (error?: Error | boolean) {
          // Retire the permit before pg can hand this client to another caller.
          if (!released) {
            released = true;
            leave();
          }
          return release.call(client, error);
        };
        return client;
      } catch (error) {
        leave();
        throw error;
      }
    });
    if (callback) {
      void checkout.then(
        (client) => callback(undefined, client, client.release),
        (error: Error) => callback(error),
      );
      return;
    }
    return checkout;
  }) as pg.Pool['connect'];

  pool.end = ((callback?: () => void) => {
    ending = true;
    for (const entry of waiting.splice(0)) entry.reject(endedError());
    return callback ? end(callback) : end();
  }) as pg.Pool['end'];
}
