import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';

import { createDemandScheduler } from '../database/demand-scheduler.js';
import {
  createPoolRunObserver,
  observeRollback,
  type PoolTelemetryLogger,
} from '../database/pool-observability.js';
import type {
  GameplayActivitySnapshot,
  GameplayActivityStore,
  GameplayWorkerKind,
} from './gameplay-activity-store.js';

export const GAMEPLAY_COORDINATION_POLL_INTERVAL_MS = 10_000;
const ADVISORY_LOCK_CLASS = 1_468_503_121;
const workerIds: Record<GameplayWorkerKind, number> = { live: 1, ranked: 2 };
const workers: readonly GameplayWorkerKind[] = ['live', 'ranked'];

export interface GameplayMutationPermit {
  enter(client: pg.PoolClient): Promise<void>;
  finish(): Promise<void>;
}

export interface GameplayMutationGuard {
  begin(): Promise<GameplayMutationPermit>;
}

interface Logger extends PoolTelemetryLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export class GameplayCoordinationUnavailable extends Error {
  constructor() {
    super('Gameplay scheduling is temporarily unavailable. Please try again.');
    this.name = 'GameplayCoordinationUnavailable';
  }
}

export function gameplayCoordinationNamespace(
  connectionString: string,
): string {
  const url = new URL(connectionString);
  const hostname = url.hostname.replace(/-pooler(?=\.)/u, '');
  return createHash('sha256')
    .update(JSON.stringify([hostname, url.port || '5432', url.pathname]))
    .digest('hex')
    .slice(0, 32);
}

export function createGameplayMutationGuard(
  store: GameplayActivityStore,
  kinds: readonly GameplayWorkerKind[],
  logger: Logger,
): GameplayMutationGuard {
  const ordered = workers.filter((worker) => kinds.includes(worker));
  if (ordered.length === 0) throw new Error('A gameplay worker is required.');
  return {
    async begin() {
      const token = randomUUID();
      try {
        await store.begin(ordered, token);
      } catch {
        throw new GameplayCoordinationUnavailable();
      }
      return {
        async enter(client) {
          // Readers must hold the exclusive counterpart before declaring idle.
          for (const worker of ordered) {
            await client.query('select pg_advisory_xact_lock_shared($1, $2)', [
              ADVISORY_LOCK_CLASS,
              workerIds[worker],
            ]);
          }
          try {
            if (await store.contains(ordered, token)) return;
          } catch {
            // No mutation may commit if its durable pre-write signal is lost.
          }
          throw new GameplayCoordinationUnavailable();
        },
        async finish() {
          try {
            await store.finish(ordered, token);
          } catch {
            // The persistent intent remains discoverable if post-commit cleanup
            // fails; it is recovered under the exclusive PostgreSQL guard.
            logger.error({}, 'Gameplay mutation signal cleanup failed.');
          }
        },
      };
    },
  };
}

// Only for maintenance that cannot introduce pending work into an idle database.
export function createGameplayExistingWorkGuard(
  worker: GameplayWorkerKind,
): GameplayMutationGuard {
  return {
    async begin() {
      return {
        async enter(client) {
          await client.query('select pg_advisory_xact_lock_shared($1, $2)', [
            ADVISORY_LOCK_CLASS,
            workerIds[worker],
          ]);
        },
        async finish() {},
      };
    },
  };
}

export interface GameplayIdleResult {
  idle: boolean;
  nextSweep: boolean | number;
}

export interface GameplayCoordination {
  start(): void;
  stop(): Promise<void>;
  observeActive(worker: GameplayWorkerKind, active: boolean): Promise<void>;
  confirmIdle(
    worker: GameplayWorkerKind,
    probe: (client: pg.PoolClient) => Promise<boolean | number>,
  ): Promise<GameplayIdleResult>;
}

export function createGameplayCoordination(
  database: Pick<pg.Pool, 'connect'>,
  store: GameplayActivityStore,
  wakes: Record<GameplayWorkerKind, { wake(): void }>,
  logger: Logger,
): GameplayCoordination {
  const locallyActive: Record<GameplayWorkerKind, boolean> = {
    live: false,
    ranked: false,
  };
  let previousEpoch: string | undefined;
  const monitorObservation = createPoolRunObserver(
    'coordination_monitor',
    logger,
  );
  const idleObservations = {
    ranked: createPoolRunObserver('ranked_coordination', logger),
    live: createPoolRunObserver('live_coordination', logger),
  };

  function wakeFrom(snapshot: GameplayActivitySnapshot): void {
    const reset = previousEpoch !== snapshot.epoch;
    previousEpoch = snapshot.epoch;
    for (const worker of workers) {
      if (reset || (snapshot[worker].active && !locallyActive[worker])) {
        wakes[worker].wake();
      }
    }
  }

  const monitor = createDemandScheduler({
    activeIntervalMs: GAMEPLAY_COORDINATION_POLL_INTERVAL_MS,
    idleIntervalMs: GAMEPLAY_COORDINATION_POLL_INTERVAL_MS,
    onCoalesced: () => monitorObservation.skipped(),
    run: async () => {
      wakeFrom(await monitorObservation.run(() => store.read()));
      return false;
    },
    onError: () => {
      // Availability loss must restore fast DB discovery, never a long sleep.
      for (const worker of workers) wakes[worker].wake();
      logger.error(
        {},
        'Gameplay coordination unavailable; scanning persisted work.',
      );
    },
  });

  return {
    start: monitor.start,
    async stop() {
      await monitor.stop();
      monitorObservation.flush();
      idleObservations.ranked.flush();
      idleObservations.live.flush();
    },
    async observeActive(worker, active) {
      if (active && !locallyActive[worker]) {
        try {
          await store.markActive(worker);
        } catch {
          logger.error({}, 'Gameplay active-work publication failed.');
          return;
        }
      }
      locallyActive[worker] = active;
    },
    async confirmIdle(worker, probe) {
      return idleObservations[worker].run(async () => {
        let client: pg.PoolClient | undefined;
        let open = false;
        let destroy = false;
        try {
          client = await database.connect();
          await client.query('begin');
          open = true;
          const lock = await client.query<{ acquired: boolean }>(
            'select pg_try_advisory_xact_lock($1, $2) as acquired',
            [ADVISORY_LOCK_CLASS, workerIds[worker]],
          );
          if (!lock.rows[0]?.acquired) return { idle: false, nextSweep: true };

          // The exclusive lock fences every in-flight writer and any delayed
          // producer must revalidate its intent after taking the shared lock.
          await store.removeAbandoned(worker);
          const snapshot = await store.read();
          const nextSweep = await probe(client);
          if (nextSweep === true || !(await store.tryIdle(worker, snapshot))) {
            return { idle: false, nextSweep: true };
          }
          locallyActive[worker] = false;
          return { idle: true, nextSweep };
        } catch {
          idleObservations[worker].failed();
          logger.error(
            {},
            'Gameplay idle confirmation failed; retaining fast scans.',
          );
          return { idle: false, nextSweep: true };
        } finally {
          if (client) {
            if (open) {
              try {
                const acquired = client;
                await observeRollback(() => acquired.query('rollback'));
              } catch {
                destroy = true;
              }
            }
            client.release(destroy || undefined);
          }
        }
      });
    },
  };
}
