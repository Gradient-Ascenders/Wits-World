import type { RankedService } from './ranked-service.js';
import {
  maintainRankedSeasons,
  type RankedSeasonMaintenanceResult,
} from './ranked-season-service.js';
import type { RankedDatabase } from './ranked-database.js';
import type { RankedReadService } from './ranked-read-service.js';
import {
  cancelExpiredTerritoryContenders,
  cleanupExpiredTerritoryGrants,
} from '../territory/territory-grants.js';
import { maintainTerritorySettlements } from '../territory/territory-settlement.js';

export interface RankedSweepResult {
  season: RankedSeasonMaintenanceResult;
  expiredEntries: number;
  resolvedProposals: number;
  pairedPlayers: number;
  expiredSnapshots: number;
  territorySettlements: number;
  cancelledTerritoryContenders: number;
  expiredTerritoryGrants: number;
}

export interface RankedScheduler {
  runOnce(): Promise<RankedSweepResult>;
  start(): void;
  stop(): Promise<void>;
}

export function createRankedScheduler(
  database: RankedDatabase,
  service: RankedService,
  reads: RankedReadService,
  logger: {
    info(context: Record<string, unknown>, message: string): void;
    error(context: Record<string, unknown>, message: string): void;
  },
  intervalMs: number,
): RankedScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 250 ||
    intervalMs > 30_000
  ) {
    throw new Error('RANKED_SWEEP_INTERVAL_MS must be between 250 and 30000.');
  }
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<RankedSweepResult> | undefined;
  let lastSnapshotCleanupAt = 0;
  let lastTerritoryMaintenanceAt = 0;

  async function runOnce(): Promise<RankedSweepResult> {
    if (active) return active;
    active = (async () => {
      const season = await maintainRankedSeasons(database);
      const expiredEntries = await service.expireQueueEntries();
      const resolvedProposals = await service.expireProposals();
      let pairedPlayers = 0;
      for (let index = 0; index < 10; index += 1) {
        if (!(await service.pairOnce())) break;
        pairedPlayers += 2;
      }
      let expiredSnapshots = 0;
      if (Date.now() - lastSnapshotCleanupAt >= 60_000) {
        expiredSnapshots = await reads.cleanupExpiredSnapshots();
        lastSnapshotCleanupAt = Date.now();
      }
      let territorySettlements = 0;
      let cancelledTerritoryContenders = 0;
      let expiredTerritoryGrants = 0;
      if (Date.now() - lastTerritoryMaintenanceAt >= 60_000) {
        cancelledTerritoryContenders =
          await cancelExpiredTerritoryContenders(database);
        territorySettlements = (await maintainTerritorySettlements(database))
          .settledWindows;
        expiredTerritoryGrants = await cleanupExpiredTerritoryGrants(database);
        lastTerritoryMaintenanceAt = Date.now();
      }
      const result = {
        season,
        expiredEntries,
        resolvedProposals,
        pairedPlayers,
        expiredSnapshots,
        territorySettlements,
        cancelledTerritoryContenders,
        expiredTerritoryGrants,
      };
      if (
        season.startedClosing ||
        season.closedSeason ||
        season.activatedSeason ||
        expiredEntries ||
        resolvedProposals ||
        pairedPlayers ||
        expiredSnapshots ||
        territorySettlements ||
        cancelledTerritoryContenders ||
        expiredTerritoryGrants
      ) {
        logger.info(result, 'Ranked maintenance sweep completed.');
      }
      return result;
    })();
    try {
      return await active;
    } finally {
      active = undefined;
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      void runOnce().catch(() =>
        logger.error({}, 'Ranked maintenance sweep failed.'),
      );
      timer = setInterval(() => {
        void runOnce().catch(() =>
          logger.error({}, 'Ranked maintenance sweep failed.'),
        );
      }, intervalMs);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await active;
    },
  };
}
