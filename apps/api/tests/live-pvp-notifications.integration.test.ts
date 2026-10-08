import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDatabaseConfig,
  buildListenerDatabaseConfig,
  loadApiEnvironment,
} from '../src/config/database.js';
import {
  createDatabasePool,
  createListenerDatabasePool,
} from '../src/database/connection.js';
import { withPoolObservation } from '../src/database/pool-observability.js';
import { createLivePvpNotificationListener } from '../src/matches/live-pvp-notifications.js';
import {
  LIVE_PVP_NOTIFY_CHANNEL,
  LIVE_PVP_PRESENCE_NOTIFY_CHANNEL,
} from '../src/matches/live-pvp-service.js';

describe.skipIf(process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true')(
  'isolated disposable PostgreSQL notification sessions',
  () => {
    it('delivers committed hints to two listeners, ignores rollback, recovers an owned session and shuts down', async () => {
      loadApiEnvironment();
      const testConfig = buildDatabaseConfig({ target: 'test' });
      // Explicit test-only input, not a runtime fallback or endpoint derivation.
      const listenerConfig = buildListenerDatabaseConfig({
        LISTENER_DATABASE_URL: testConfig.connectionString,
      });
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const shared = createDatabasePool(testConfig, { logger });
      const pools = [
        createListenerDatabasePool(listenerConfig, { logger }),
        createListenerDatabasePool(listenerConfig, { logger }),
      ];
      let ownBackendPid = 0;
      let identifySession: Promise<void> | undefined;
      pools[0]!.on('acquire', (client) => {
        // BackendKeyData can identify a proxy, not the PostgreSQL process.
        // This diagnostic query runs only on this disposable test's session.
        identifySession = client
          .query<{ pid: number }>('select pg_backend_pid() as pid')
          .then((result) => {
            ownBackendPid = result.rows[0]!.pid;
          });
      });
      const gateways = pools.map(() => ({
        broadcastMatch: vi.fn().mockResolvedValue(undefined),
        broadcastPresence: vi.fn().mockResolvedValue(undefined),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      }));
      const listeners = pools.map((pool, index) =>
        createLivePvpNotificationListener(pool, gateways[index]!, logger),
      );
      const held: pg.PoolClient[] = [];
      const matchId = randomUUID();
      const notify = (
        client: pg.PoolClient,
        channel: string,
        version: number,
      ) =>
        client.query('select pg_notify($1, $2)', [
          channel,
          JSON.stringify({ matchId, version }),
        ]);
      try {
        await Promise.all(listeners.map((listener) => listener.start()));
        await identifySession;
        expect(
          pools.every(
            (pool) =>
              pool.options.max === 1 &&
              pool.totalCount === 1 &&
              pool.idleCount === 0,
          ),
        ).toBe(true);
        expect(shared.options.max).toBe(4);
        // All four shared slots remain available to request/maintenance work.
        for (let index = 0; index < 4; index++)
          held.push(
            await withPoolObservation(
              index === 0 ? 'ranked_maintenance' : 'request',
              () => shared.connect(),
              logger,
            ),
          );
        const writer = held[0]!;
        expect(shared.totalCount).toBe(4);
        await writer.query('begin');
        await notify(writer, LIVE_PVP_NOTIFY_CHANNEL, 9);
        await writer.query('rollback');
        await writer.query('begin');
        await notify(writer, LIVE_PVP_NOTIFY_CHANNEL, 10);
        await writer.query('commit');
        await vi.waitUntil(
          () =>
            gateways.every((gateway) =>
              gateway.broadcastMatch.mock.calls.some(
                ([id, version]) => id === matchId && version === 10,
              ),
            ),
          { timeout: 5_000 },
        );
        // The committed hint is an ordering barrier for this writer's rollback.
        for (const gateway of gateways)
          expect(
            gateway.broadcastMatch.mock.calls.some(
              ([id, version]) => id === matchId && version === 9,
            ),
          ).toBe(false);
        await notify(writer, LIVE_PVP_PRESENCE_NOTIFY_CHANNEL, 11);
        await vi.waitUntil(
          () =>
            gateways.every((gateway) =>
              gateway.broadcastPresence.mock.calls.some(
                ([id]) => id === matchId,
              ),
            ),
          { timeout: 5_000 },
        );
        vi.advanceTimersByTime(60_000);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'pool_summary',
            pool_role: 'shared',
            listener_holds_count: 0,
            request_holds_count: 3,
            maintenance_holds_count: 1,
          }),
          'PostgreSQL pool observation',
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'pool_summary',
            pool_role: 'listener',
            listener_holds_count: 1,
            totalCount: 1,
            idleCount: 0,
          }),
          'PostgreSQL pool observation',
        );
        const oldPid = ownBackendPid;
        expect(Number.isInteger(oldPid) && oldPid > 0).toBe(true);
        // Terminate only the session this test acquired on the approved test DB.
        await writer.query('select pg_terminate_backend($1)', [oldPid]);
        await vi.waitUntil(
          () => gateways[0]!.recoverNotificationGap.mock.calls.length === 1,
          { timeout: 10_000 },
        );
        await identifySession;
        expect(ownBackendPid !== oldPid).toBe(true);
        await notify(writer, LIVE_PVP_NOTIFY_CHANNEL, 12);
        await vi.waitUntil(
          () =>
            gateways.every((gateway) =>
              gateway.broadcastMatch.mock.calls.some(
                ([id, version]) => id === matchId && version === 12,
              ),
            ),
          { timeout: 5_000 },
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'listener_destroy',
            pool_role: 'listener',
          }),
          'PostgreSQL pool observation',
        );
        await Promise.all(listeners.map((listener) => listener.stop()));
        expect(
          pools.every(
            (pool) => pool.idleCount === 1 && pool.waitingCount === 0,
          ),
        ).toBe(true);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'pool_summary',
            pool_role: 'listener',
            active_holds_count: 0,
            listener_holds_count: 0,
          }),
          'PostgreSQL pool observation',
        );
        // Demand-driven idle release must allow a ready subscription to reuse
        // the dedicated session without duplicating notification handlers.
        await Promise.all(listeners.map((listener) => listener.start(true)));
        expect(pools.every((pool) => pool.idleCount === 0)).toBe(true);
        const previousDeliveries = gateways.map(
          (gateway) => gateway.broadcastMatch.mock.calls.length,
        );
        await notify(writer, LIVE_PVP_NOTIFY_CHANNEL, 13);
        await vi.waitUntil(
          () =>
            gateways.every(
              (gateway, index) =>
                gateway.broadcastMatch.mock.calls.length ===
                previousDeliveries[index]! + 1,
            ),
          { timeout: 5_000 },
        );
        expect(shared.options.max).toBe(4);
        expect(pools.every((pool) => pool.options.max === 1)).toBe(true);
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(matchId);
      } finally {
        try {
          await Promise.all(listeners.map((listener) => listener.stop()));
        } finally {
          await Promise.all(pools.map((pool) => pool.end()));
          for (const client of held) client.release();
          await shared.end();
          vi.useRealTimers();
        }
      }
      expect(pools.every((pool) => pool.ended)).toBe(true);
      expect(shared.ended).toBe(true);
      try {
        // Even a late readiness caller cannot reopen an ended direct pool.
        await expect(listeners[0]!.start(true)).rejects.toThrow(
          'Live PvP notification listener is unavailable.',
        );
        expect(pools[0]!.totalCount).toBe(0);
      } finally {
        await listeners[0]!.stop();
      }
    }, 30_000);
  },
);
