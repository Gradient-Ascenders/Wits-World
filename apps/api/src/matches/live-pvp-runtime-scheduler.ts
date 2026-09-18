import type { LivePvpDeadlineProcessor } from './live-pvp-deadline-processor.js';
import type { LivePvpService } from './live-pvp-service.js';

export const MIN_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS = 250;
export const MAX_LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS = 5_000;
export const MIN_LIVE_PVP_CLEANUP_INTERVAL_MS = 60_000;

export interface LivePvpRuntimeScheduler {
  start(): void;
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

  let deadlineTimer: NodeJS.Timeout | undefined;
  let cleanupTimer: NodeJS.Timeout | undefined;
  let activeDeadlineRun: Promise<void> | undefined;
  let activeCleanupRun: Promise<void> | undefined;

  async function runDeadlines(): Promise<void> {
    if (activeDeadlineRun) return activeDeadlineRun;
    activeDeadlineRun = (async () => {
      try {
        const result = await deadlineProcessor.runOnce();
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
        logger.error({}, 'Live PvP deadline sweep failed.');
      }
    })();
    try {
      await activeDeadlineRun;
    } finally {
      activeDeadlineRun = undefined;
    }
  }

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
      if (deadlineTimer || cleanupTimer) return;
      void runDeadlines();
      void runCleanup();
      deadlineTimer = setInterval(
        () => void runDeadlines(),
        options.deadlineSweepIntervalMs,
      );
      cleanupTimer = setInterval(
        () => void runCleanup(),
        options.transientCleanupIntervalMs,
      );
      deadlineTimer.unref();
      cleanupTimer.unref();
    },

    async stop() {
      if (deadlineTimer) clearInterval(deadlineTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      deadlineTimer = undefined;
      cleanupTimer = undefined;
      await Promise.all([
        activeDeadlineRun ?? Promise.resolve(),
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
