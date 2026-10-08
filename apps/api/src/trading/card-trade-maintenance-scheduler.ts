import { createPoolRunObserver } from '../database/pool-observability.js';
import type { FastifyBaseLogger } from 'fastify';

import {
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../config/timers.js';
import type { CardTradeService } from './card-trade-service.js';

export interface CardTradeMaintenanceScheduler {
  start(): void;
  stop(): Promise<void>;
}

export function createCardTradeMaintenanceScheduler(
  service: Pick<CardTradeService, 'expireDueTrades' | 'purgeTerminalTrades'>,
  logger: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  intervalMs: number,
): CardTradeMaintenanceScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    intervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Card trade maintenance interval must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;
  const workObservation = createPoolRunObserver('trade_expiry', logger);
  const retentionObservation = createPoolRunObserver('trade_retention', logger);

  const run = async () => {
    if (running) {
      workObservation.skipped();
      return running;
    }
    running = (async () => {
      try {
        const expired = await workObservation.run(() =>
          service.expireDueTrades(),
        );
        logger.info({ expired }, 'Card trade expiry maintenance completed');
      } catch {
        logger.warn({}, 'Card trade expiry maintenance failed');
      }

      try {
        const purged = await retentionObservation.run(() =>
          service.purgeTerminalTrades(),
        );
        logger.info({ purged }, 'Card trade retention cleanup completed');
      } catch {
        logger.warn({}, 'Card trade retention cleanup failed');
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
      workObservation.flush();
      retentionObservation.flush();
    },
  };
}
