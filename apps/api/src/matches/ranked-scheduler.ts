import type { RankedService } from './ranked-service.js';
import {
  maintainRankedSeasons,
  type RankedSeasonMaintenanceResult,
} from './ranked-season-service.js';
import type { RankedDatabase } from './ranked-database.js';
import type { RankedReadService } from './ranked-read-service.js';
import { createPoolRunObserver } from '../database/pool-observability.js';
import { createDemandScheduler } from '../database/demand-scheduler.js';
import { nextRankedSweep } from './gameplay-work.js';
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
  wake(): void;
  stop(): Promise<void>;
}

function errorContext(error: unknown): Record<string, unknown> {
  const code =
    error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,20}$/u.test(code)
    ? { databaseErrorCode: code }
    : {};
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
  options: {
    nextSweep?: () => Promise<boolean | number>;
    onMatchesCreated?: () => void;
  } = {},
): RankedScheduler {
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 250 ||
    intervalMs > 30_000
  ) {
    throw new Error('RANKED_SWEEP_INTERVAL_MS must be between 250 and 30000.');
  }
  let active: Promise<RankedSweepResult> | undefined;
  let lastSnapshotCleanupAt = 0;
  let lastTerritoryMaintenanceAt = 0;
  const observation = createPoolRunObserver('ranked_maintenance', logger);

  async function runOnce(forceMaintenance = false): Promise<RankedSweepResult> {
    if (active) {
      observation.skipped();
      return active;
    }
    active = observation.run(async () => {
      const season = await maintainRankedSeasons(database);
      const expiredEntries = await service.expireQueueEntries();
      const resolvedProposals = await service.expireProposals();
      let pairedPlayers = 0;
      for (let index = 0; index < 10; index += 1) {
        if (!(await service.pairOnce())) break;
        pairedPlayers += 2;
      }
      if (pairedPlayers > 0) options.onMatchesCreated?.();
      let expiredSnapshots = 0;
      if (forceMaintenance || Date.now() - lastSnapshotCleanupAt >= 60_000) {
        expiredSnapshots = await reads.cleanupExpiredSnapshots();
        lastSnapshotCleanupAt = Date.now();
      }
      let territorySettlements = 0;
      let cancelledTerritoryContenders = 0;
      let expiredTerritoryGrants = 0;
      if (
        forceMaintenance ||
        Date.now() - lastTerritoryMaintenanceAt >= 60_000
      ) {
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
    });
    try {
      return await active;
    } finally {
      active = undefined;
    }
  }

  let forceMaintenance = true;
  let nextBoundaryAt: number | undefined;
  const scheduler = createDemandScheduler({
    activeIntervalMs: intervalMs,
    idleIntervalMs: intervalMs,
    run: async () => {
      const next = await (options.nextSweep?.() ?? nextRankedSweep(database));
      const now = Date.now();
      // A fresh probe can already point to the following territory window.
      const boundaryDue =
        (nextBoundaryAt !== undefined && now >= nextBoundaryAt) ||
        (typeof next === 'number' && next <= 1);
      nextBoundaryAt = typeof next === 'number' ? now + next : undefined;
      const maintenanceDue =
        now - lastSnapshotCleanupAt >= 60_000 ||
        now - lastTerritoryMaintenanceAt >= 60_000;
      if (next === true || forceMaintenance || boundaryDue || maintenanceDue) {
        const result = await runOnce(forceMaintenance || boundaryDue);
        // A capped catch-up batch must drain before returning to idle probes.
        forceMaintenance =
          result.pairedPlayers >= 20 || result.territorySettlements >= 24;
      }
      if (forceMaintenance || next === true) return true;
      // Without durable cross-instance wakes, keep discovering remote commits
      // even when the next known season/territory boundary is much later.
      return typeof next === 'number' ? Math.min(next, intervalMs) : false;
    },
    onError: (error) =>
      logger.error(errorContext(error), 'Ranked maintenance sweep failed.'),
  });

  return {
    runOnce,
    start: scheduler.start,
    wake: scheduler.wake,
    async stop() {
      await scheduler.stop();
      await active;
    },
  };
}
