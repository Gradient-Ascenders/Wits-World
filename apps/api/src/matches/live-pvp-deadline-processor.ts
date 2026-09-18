import {
  LIVE_PVP_MAX_CATCH_UP_TRANSITIONS,
  type LivePvpService,
} from './live-pvp-service.js';

export interface LivePvpDeadlineSweepResult {
  matchesScanned: number;
  transitionsCommitted: number;
  failures: number;
}

export interface LivePvpDeadlineProcessor {
  runOnce(): Promise<LivePvpDeadlineSweepResult>;
}

export interface LivePvpDeadlineLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export function createLivePvpDeadlineProcessor(
  service: Pick<LivePvpService, 'listDueMatchIds' | 'processOverdueMatch'>,
  logger: LivePvpDeadlineLogger,
): LivePvpDeadlineProcessor {
  return {
    async runOnce() {
      const ids = await service.listDueMatchIds(25);
      let transitionsCommitted = 0;
      let failures = 0;

      for (const matchId of ids) {
        try {
          for (
            let index = 0;
            index < LIVE_PVP_MAX_CATCH_UP_TRANSITIONS;
            index += 1
          ) {
            const result = await service.processOverdueMatch(matchId);
            if (!result.transitioned) break;
            transitionsCommitted += 1;
            if (result.completed) break;
          }
        } catch {
          failures += 1;
          logger.error({ matchId }, 'Live PvP deadline finalization failed.');
        }
      }

      return {
        matchesScanned: ids.length,
        transitionsCommitted,
        failures,
      };
    },
  };
}
