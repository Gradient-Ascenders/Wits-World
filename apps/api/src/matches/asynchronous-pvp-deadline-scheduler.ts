import { createPoolRunObserver } from '../database/pool-observability.js';
import {
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../config/timers.js';
import type { AsyncPvpDeadlineProcessor } from './asynchronous-pvp-deadline-processor.js';

export const MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS =
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS;

export interface AsyncPvpDeadlineScheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface AsyncPvpDeadlineSchedulerLogger {
  info(context: object, message: string): void;
  error(context: Record<string, never>, message: string): void;
}

export function createAsyncPvpDeadlineScheduler(
  processor: AsyncPvpDeadlineProcessor,
  logger: AsyncPvpDeadlineSchedulerLogger,
  intervalMs: number,
): AsyncPvpDeadlineScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS ||
    intervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Asynchronous PvP deadline interval must be a safe integer between ${MIN_ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }
  let timer: NodeJS.Timeout | undefined;
  let activeRun: Promise<void> | undefined;
  const observation = createPoolRunObserver('async_pvp_deadline', logger);
  async function run(): Promise<void> {
    if (activeRun) {
      observation.skipped();
      return;
    }
    activeRun = (async () => {
      try {
        const result = await observation.run(async () => {
          const result = await processor.runOnce();
          if (result.failures > 0) observation.failed();
          return result;
        });
        logger.info(result, 'Asynchronous PvP deadline sweep completed.');
      } catch {
        logger.error({}, 'Asynchronous PvP deadline sweep failed.');
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
      if (timer) return;
      void run();
      timer = setInterval(() => void run(), intervalMs);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (activeRun) await activeRun;
      observation.flush();
    },
  };
}
