import { MAX_NODE_TIMER_DELAY_MS } from '../config/timers.js';

export interface DemandSchedulerOptions {
  activeIntervalMs: number;
  idleIntervalMs: number;
  run: () => Promise<boolean | number>;
  onError: (error: unknown) => void;
  onCoalesced?: () => void;
}

export interface DemandScheduler {
  start(): void;
  wake(): void;
  stop(): Promise<void>;
}

export function createDemandScheduler(
  options: DemandSchedulerOptions,
): DemandScheduler {
  let started = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let executing = false;
  let wakePending = false;
  let wakeGeneration: number | undefined;

  function observeCoalesced(): void {
    try {
      options.onCoalesced?.();
    } catch {
      /* Observation cannot affect scheduling. */
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function schedule(delayMs: number, scheduledGeneration: number): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (started && generation === scheduledGeneration) {
        launchRun(scheduledGeneration);
      }
    }, delayMs);
    timer.unref?.();
  }

  function launchRun(runGeneration: number): void {
    if (!started || generation !== runGeneration) {
      return;
    }

    if (inFlight) {
      observeCoalesced();
      // Wakes before the probe starts are covered by that probe; later wakes
      // need a follow-up so a concurrent commit cannot be missed.
      if (executing) {
        wakePending = true;
        wakeGeneration = runGeneration;
      }
      return;
    }

    let remains = false;
    let failed = false;
    let explicitDelayMs: number | undefined;
    const execution: Promise<void> = Promise.resolve()
      .then(() => {
        executing = true;
        return options.run();
      })
      .then((result) => {
        if (typeof result === 'boolean') {
          remains = result;
          return;
        }

        if (
          Number.isSafeInteger(result) &&
          result >= 1 &&
          result <= MAX_NODE_TIMER_DELAY_MS
        ) {
          explicitDelayMs = result;
          return;
        }

        throw new Error(
          `Demand scheduler run returned an invalid delay; expected an integer between 1 and ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
        );
      })
      .catch((error: unknown) => {
        failed = true;
        try {
          options.onError(error);
        } catch {
          // Reporting failures must not prevent the scheduler from recovering.
        }
      })
      .finally(() => {
        if (inFlight === execution) {
          inFlight = undefined;
          executing = false;
        }

        if (!started) {
          return;
        }

        if (generation !== runGeneration) {
          if (wakeGeneration === generation) {
            wakePending = false;
            wakeGeneration = undefined;
          }
          launchRun(generation);
          return;
        }

        if (wakePending && wakeGeneration === runGeneration) {
          wakePending = false;
          wakeGeneration = undefined;
          launchRun(runGeneration);
          return;
        }

        schedule(
          failed || remains
            ? options.activeIntervalMs
            : (explicitDelayMs ?? options.idleIntervalMs),
          runGeneration,
        );
      });

    inFlight = execution;
  }

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      generation += 1;
      clearTimer();
      if (inFlight) {
        observeCoalesced();
        wakePending = true;
        wakeGeneration = generation;
      } else {
        launchRun(generation);
      }
    },

    wake() {
      if (!started) {
        return;
      }

      clearTimer();
      if (inFlight) {
        observeCoalesced();
        if (executing) {
          wakePending = true;
          wakeGeneration = generation;
        }
      } else {
        launchRun(generation);
      }
    },

    async stop() {
      started = false;
      generation += 1;
      clearTimer();
      wakePending = false;
      wakeGeneration = undefined;

      const activeRun = inFlight;
      if (activeRun) {
        await activeRun;
      }
    },
  };
}
