import { createPoolRunObserver } from '../database/pool-observability.js';
import type { MovementEvidenceService } from './movement-evidence.js';

// Node timers use a signed 32-bit millisecond delay. Larger values are reduced
// to 1 ms by Node, so reject them before scheduling database work.
export { MAX_NODE_TIMER_DELAY_MS } from '../config/timers.js';
import {
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../config/timers.js';

export const MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS =
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS;

export interface MovementEvidenceCleanupScheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface MovementEvidenceCleanupLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, never>, message: string): void;
}

export function createMovementEvidenceCleanupScheduler(
  service: Pick<MovementEvidenceService, 'purgeExpired'>,
  logger: MovementEvidenceCleanupLogger,
  intervalMs: number,
): MovementEvidenceCleanupScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS ||
    intervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Movement evidence cleanup interval must be a safe integer between ${MIN_MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  let timer: NodeJS.Timeout | undefined;
  let activeRun: Promise<void> | undefined;
  const observation = createPoolRunObserver('movement_retention', logger);

  async function runSweep(): Promise<void> {
    if (activeRun) {
      observation.skipped();
      return;
    }

    activeRun = (async () => {
      try {
        const deleted = await observation.run(() => service.purgeExpired());
        logger.info(
          { deleted },
          'Expired movement evidence cleanup completed.',
        );
      } catch {
        logger.error({}, 'Expired movement evidence cleanup failed.');
      }
    })();

    try {
      await activeRun;
    } finally {
      activeRun = undefined;
    }
  }

  return {
    start() {
      if (timer) {
        return;
      }

      void runSweep();
      timer = setInterval(() => void runSweep(), intervalMs);
      timer.unref();
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }

      if (activeRun) {
        await activeRun;
      }
      observation.flush();
    },
  };
}
