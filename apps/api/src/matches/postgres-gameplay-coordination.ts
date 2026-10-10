import { createDemandScheduler } from '../database/demand-scheduler.js';
import type { GameplayWorkerKind } from './gameplay-activity-store.js';
import type {
  LivePvpNotificationListener,
  LivePvpNotificationLogger,
} from './live-pvp-notifications.js';

export const POSTGRES_GAMEPLAY_RECONCILIATION_MS = 10_000;

/** Notifications accelerate discovery; reconciliation repairs missing hints. */
export function createPostgresGameplayCoordination(
  listener: Pick<
    LivePvpNotificationListener,
    'startCoordination' | 'stopCoordination' | 'readGameplayWork'
  >,
  workers: Record<GameplayWorkerKind, { wake(): void }>,
  logger: LivePvpNotificationLogger,
) {
  let started = false;
  let lifecycle = Promise.resolve();
  function serialize(operation: () => Promise<void>): Promise<void> {
    const result = lifecycle.then(operation, operation);
    lifecycle = result.catch(() => undefined);
    return result;
  }
  const locallyActive: Record<GameplayWorkerKind, boolean> = {
    live: false,
    ranked: false,
  };
  let probes = 0;
  let failures = 0;
  let notifications = 0;
  let elapsed = 0;
  let maximum = 0;
  const wakeBoth = () => {
    workers.live.wake();
    workers.ranked.wake();
  };
  const monitor = createDemandScheduler({
    activeIntervalMs: POSTGRES_GAMEPLAY_RECONCILIATION_MS,
    idleIntervalMs: POSTGRES_GAMEPLAY_RECONCILIATION_MS,
    run: async () => {
      const begin = performance.now();
      try {
        const state = await listener.readGameplayWork();
        if (started) {
          if (state.live && !locallyActive.live) workers.live.wake();
          if (
            !locallyActive.ranked &&
            (state.ranked === true ||
              (typeof state.ranked === 'number' &&
                state.ranked <= POSTGRES_GAMEPLAY_RECONCILIATION_MS))
          )
            workers.ranked.wake();
        }
      } catch {
        failures += 1;
        // No Redis read and no idle claim. Existing workers probe persisted work.
        if (started) wakeBoth();
      } finally {
        probes += 1;
        const duration = performance.now() - begin;
        elapsed += duration;
        maximum = Math.max(maximum, duration);
        if (probes % 6 === 0) flush();
      }
      // A failing monitor still retries at ten seconds, without error backoff.
      return Math.max(
        1,
        Math.ceil(
          POSTGRES_GAMEPLAY_RECONCILIATION_MS - (performance.now() - begin),
        ),
      );
    },
    onError: () => {
      if (started) wakeBoth();
    },
  });
  function flush() {
    logger.info(
      {
        event: 'postgres_gameplay_coordination_summary',
        probes,
        failures,
        notifications,
        probe_total_ms: elapsed,
        probe_max_ms: maximum,
      },
      'PostgreSQL gameplay coordination',
    );
    probes = failures = notifications = elapsed = maximum = 0;
  }
  return {
    start() {
      return serialize(async () => {
        if (started) return;
        started = true;
        try {
          await listener.startCoordination();
        } catch {
          if (started) wakeBoth();
        }
        if (started) monitor.start();
      });
    },
    wake(worker: GameplayWorkerKind) {
      if (!started) return;
      notifications += 1;
      workers[worker].wake();
    },
    observeActive(worker: GameplayWorkerKind, active: boolean) {
      locallyActive[worker] = active;
    },
    ready() {
      if (started) {
        locallyActive.live = locallyActive.ranked = false;
        wakeBoth();
        monitor.wake();
      }
    },
    unavailable() {
      if (started) wakeBoth();
    },
    stop() {
      return serialize(async () => {
        started = false;
        await monitor.stop();
        await listener.stopCoordination();
        if (probes || failures || notifications) flush();
      });
    },
  };
}
