import {
  MAX_NODE_TIMER_DELAY_MS,
  MIN_DATABASE_MAINTENANCE_INTERVAL_MS,
} from '../config/timers.js';
import type { AccountDeletionRetryProcessor } from './account-deletion-retry-processor.js';

export interface AccountDeletionRetryScheduler {
  start(): void;
  stop(): Promise<void>;
}

export interface AccountDeletionRetrySchedulerLogger {
  info(
    context: {
      attempted: number;
      completed: number;
      retryRequired: number;
      purgedAudits: number;
    },
    message: string,
  ): void;

  error(context: Record<string, never>, message: string): void;
}

interface CreateAccountDeletionRetrySchedulerOptions {
  intervalMs: number;
}

export function createAccountDeletionRetryScheduler(
  processor: AccountDeletionRetryProcessor,
  logger: AccountDeletionRetrySchedulerLogger,
  { intervalMs }: CreateAccountDeletionRetrySchedulerOptions,
): AccountDeletionRetryScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_DATABASE_MAINTENANCE_INTERVAL_MS ||
    intervalMs > MAX_NODE_TIMER_DELAY_MS
  ) {
    throw new Error(
      `Account deletion retry interval must be a safe integer between ${MIN_DATABASE_MAINTENANCE_INTERVAL_MS} and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }

  let timer: NodeJS.Timeout | undefined;
  let activeRun: Promise<void> | undefined;

  async function runSweep(): Promise<void> {
    if (activeRun) {
      return;
    }

    activeRun = (async () => {
      try {
        const result = await processor.runOnce();

        logger.info(
          {
            attempted: result.attempted,
            completed: result.completed,
            retryRequired: result.retryRequired,
            purgedAudits: result.purgedAudits,
          },
          'Account deletion retry sweep completed.',
        );
      } catch {
        logger.error({}, 'Account deletion retry sweep failed.');
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

      timer = setInterval(() => {
        void runSweep();
      }, intervalMs);

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
    },
  };
}
