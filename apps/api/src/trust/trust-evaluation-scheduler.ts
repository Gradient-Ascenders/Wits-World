import type { FastifyBaseLogger } from 'fastify';

import {
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../config/timers.js';
import type { TrustService } from './trust-service.js';

export interface TrustEvaluationScheduler {
  start(): void;
  stop(): Promise<void>;
}

function errorContext(error: unknown): Record<string, unknown> {
  const code =
    error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,20}$/u.test(code)
    ? { databaseErrorCode: code }
    : {};
}

export function createTrustEvaluationScheduler(
  service: Pick<TrustService, 'evaluateMaintenanceBatch' | 'purgeExpiredData'>,
  logger: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  intervalMs: number,
): TrustEvaluationScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    intervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Trust evaluation interval must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;

  const run = async () => {
    if (running) return running;
    running = (async () => {
      try {
        const evaluated = await service.evaluateMaintenanceBatch();
        logger.info({ evaluated }, 'Trust evaluation maintenance completed');
      } catch (error) {
        logger.warn(errorContext(error), 'Trust evaluation maintenance failed');
      }

      try {
        const purged = await service.purgeExpiredData();
        logger.info({ purged }, 'Trust retention cleanup completed');
      } catch (error) {
        logger.warn(errorContext(error), 'Trust retention cleanup failed');
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };

  return {
    start() {
      if (timer || stopped) return;
      void run();
      timer = setInterval(() => void run(), intervalMs);
      timer.unref();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
