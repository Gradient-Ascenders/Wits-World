import type { LivePvpDeadlineProcessor } from './live-pvp-deadline-processor.js';
import type { LivePvpService } from './live-pvp-service.js';
import { createPoolRunObserver } from '../database/pool-observability.js';
import { createDemandScheduler } from '../database/demand-scheduler.js';
import { DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS } from '../config/timers.js';

export const MIN_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS = 250;
export const MAX_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS = 5_000;
export const MIN_LIVE_PVP_CLEANUP_INTERVAL_MS = 60_000;

export interface LivePvpRuntimeScheduler {
  start(): void;
  wake(): void;
  stop(): Promise<void>;
}

export interface LivePvpRuntimeSchedulerLogger {
  info(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export function createLivePvpRuntimeScheduler(
  deadlineProcessor: LivePvpDeadlineProcessor,
  cleanupService: Pick<LivePvpService, 'purgeTransientAccess'>,
  logger: LivePvpRuntimeSchedulerLogger,
  options: {
    deadlineSweepIntervalMs: number;
    transientCleanupIntervalMs: number;
    hasActiveWork?: () => Promise<boolean>;
    onWorkState?: (active: boolean) => Promise<void>;
    coordinatedIdle?: boolean;
  },
): LivePvpRuntimeScheduler {
  validateInterval(
    options.deadlineSweepIntervalMs,
    MIN_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS,
    MAX_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS,
    'Live PvP deadline sweep interval',
  );
  validateInterval(
    options.transientCleanupIntervalMs,
    MIN_LIVE_PVP_CLEANUP_INTERVAL_MS,
    2_147_483_647,
    'Live PvP transient cleanup interval',
  );

  let cleanupTimer: NodeJS.Timeout | undefined;
  let activeDeadlineRun: Promise<void> | undefined;
  let activeCleanupRun: Promise<void> | undefined;
  const observation = createPoolRunObserver('live_deadline', logger);

  async function runDeadlines(): Promise<boolean> {
    if (activeDeadlineRun) {
      observation.skipped();
      await activeDeadlineRun;
      return true;
    }
    const pending = (await options.hasActiveWork?.()) ?? true;
    await options.onWorkState?.(pending);
    if (!pending) return false;
    activeDeadlineRun = observation.run(async () => {
      try {
        const result = await deadlineProcessor.runOnce();
        if (result.failures > 0) observation.failed();
        if (result.transitionsCommitted > 0 || result.failures > 0) {
          logger.info(
            {
              matchesScanned: result.matchesScanned,
              transitionsCommitted: result.transitionsCommitted,
              failures: result.failures,
            },
            'Live PvP deadline sweep completed.',
          );
        }
      } catch {
        observation.failed();
        throw new Error('Live PvP deadline sweep failed.');
      }
    });
    try {
      await activeDeadlineRun;
    } finally {
      activeDeadlineRun = undefined;
    }
    return true;
  }

  const deadlines = createDemandScheduler({
    activeIntervalMs: options.deadlineSweepIntervalMs,
    // Long idle sleeps require durable cross-instance coordination. Standalone
    // polling retains the original correctness-safe discovery cadence.
    idleIntervalMs: options.coordinatedIdle
      ? DEFAULT_DATABASE_MAINTENANCE_INTERVAL_MS
      : options.deadlineSweepIntervalMs,
    run: runDeadlines,
    onError: () => logger.error({}, 'Live PvP deadline sweep failed.'),
  });

  async function runCleanup(): Promise<void> {
    if (activeCleanupRun) return activeCleanupRun;
    activeCleanupRun = (async () => {
      try {
        const result = await cleanupService.purgeTransientAccess();
        if (result.accessRowsDeleted > 0 || result.ticketRowsDeleted > 0) {
          logger.info(
            {
              accessRowsDeleted: result.accessRowsDeleted,
              ticketRowsDeleted: result.ticketRowsDeleted,
            },
            'Live PvP transient cleanup completed.',
          );
        }
      } catch {
        logger.error({}, 'Live PvP transient cleanup failed.');
      }
    })();
    try {
      await activeCleanupRun;
    } finally {
      activeCleanupRun = undefined;
    }
  }

  return {
    start() {
      if (cleanupTimer) return;
      deadlines.start();
      void runCleanup();
      cleanupTimer = setInterval(
        () => void runCleanup(),
        options.transientCleanupIntervalMs,
      );
      cleanupTimer.unref();
    },

    wake() {
      deadlines.wake();
    },

    async stop() {
      if (cleanupTimer) clearInterval(cleanupTimer);
      cleanupTimer = undefined;
      await Promise.all([
        deadlines.stop(),
        activeCleanupRun ?? Promise.resolve(),
      ]);
    },
  };
}

function validateInterval(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be a safe integer between ${minimum} and ${maximum} milliseconds.`,
    );
  }
}
