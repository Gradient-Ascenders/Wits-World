import { createPoolRunObserver } from '../database/pool-observability.js';
import type { FastifyBaseLogger } from 'fastify';

import type { PlacementService } from './placement-service.js';

const SWEEP_MS = 30 * 60 * 1000;

export function createPlacementScheduler(
  service: Pick<PlacementService, 'runScheduled' | 'nextBoundaryDelayMs'>,
  logger: Pick<FastifyBaseLogger, 'info' | 'warn'>,
) {
  let timer: NodeJS.Timeout | undefined;
  let boundaryTimer: NodeJS.Timeout | undefined;
  let started = false;
  let running: Promise<void> | undefined;
  const observation = createPoolRunObserver('placement_sweep', logger);
  const boundaryObservation = createPoolRunObserver(
    'placement_boundary',
    logger,
  );
  const run = () => {
    if (running) {
      observation.skipped();
      return running;
    }
    running = (async () => {
      const started = Date.now();
      try {
        const result = await observation.run(() => service.runScheduled());
        logger.info(
          { outcome: result.outcome, durationMs: Date.now() - started },
          'Event placement sweep completed',
        );
      } catch {
        logger.warn(
          { durationMs: Date.now() - started },
          'Event placement sweep failed',
        );
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  const scheduleBoundary = async () => {
    let delay = SWEEP_MS;
    try {
      delay = await boundaryObservation.run(() =>
        service.nextBoundaryDelayMs(),
      );
    } catch {
      logger.warn('Event placement boundary scheduling failed');
    }
    if (!started) return;
    boundaryTimer = setTimeout(() => {
      void run().finally(() => void scheduleBoundary());
    }, delay);
    boundaryTimer.unref();
  };
  return {
    start() {
      if (started) return;
      started = true;
      void run();
      void scheduleBoundary();
      timer = setInterval(() => void run(), SWEEP_MS);
      timer.unref();
    },
    async stop() {
      started = false;
      if (timer) clearInterval(timer);
      if (boundaryTimer) clearTimeout(boundaryTimer);
      timer = undefined;
      boundaryTimer = undefined;
      await running;
      observation.flush();
      boundaryObservation.flush();
    },
  };
}
