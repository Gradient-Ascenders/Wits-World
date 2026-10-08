import type pg from 'pg';
import {
  classifyDatabaseError,
  emitPoolEvent,
  poolSnapshot,
  withPoolObservation,
  type PoolEvent,
  type PoolSnapshot,
} from '../database/pool-observability.js';

import {
  LIVE_PVP_NOTIFY_CHANNEL,
  LIVE_PVP_PRESENCE_NOTIFY_CHANNEL,
} from './live-pvp-service.js';
import type { LivePvpGateway } from './live-pvp-gateway.js';

const RECONNECT_DELAY_MS = 5_000;
const MATCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LivePvpNotificationListener {
  start(requireReady?: boolean): Promise<void>;
  stop(): Promise<void>;
}

export interface LivePvpNotificationLogger {
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export function createLivePvpNotificationListener(
  database: Pick<pg.Pool, 'connect'> & Partial<PoolSnapshot>,
  gateway: Pick<
    LivePvpGateway,
    'broadcastMatch' | 'broadcastPresence' | 'recoverNotificationGap'
  >,
  logger: LivePvpNotificationLogger = console,
): LivePvpNotificationListener {
  let client: pg.PoolClient | undefined;
  let detachClientHandlers: (() => void) | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let stopped = true;
  let connecting: Promise<void> | undefined;
  let recoveryRequired = false;
  let lifecycleQueue = Promise.resolve();
  const lifecycle = (
    event: PoolEvent,
    error?: unknown,
    stage: 'checkout' | 'query' | 'client' | 'transaction' = 'checkout',
    checkoutMs?: number,
  ) => {
    emitPoolEvent(logger, {
      event,
      category: 'listener',
      pool_role: 'listener',
      ...(typeof database.totalCount === 'number'
        ? poolSnapshot(database)
        : {}),
      ...(checkoutMs === undefined ? {} : { checkout_ms: checkoutMs }),
      ...(error === undefined && event !== 'listener_client_error'
        ? {}
        : { error_category: classifyDatabaseError(error, stage) }),
    });
  };

  function serializeLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = lifecycleQueue.then(operation, operation);
    lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  async function connectListener(): Promise<void> {
    if (stopped) return;
    clearReconnectTimer();
    if (connecting) return connecting;
    if (client) return;

    const attempt = (async () => {
      lifecycle('listener_checkout_start');
      const checkoutStarted = performance.now();
      let next: pg.PoolClient;
      try {
        next = await withPoolObservation(
          'listener',
          () => database.connect(),
          logger,
        );
        lifecycle(
          'listener_checkout_success',
          undefined,
          'checkout',
          performance.now() - checkoutStarted,
        );
      } catch (error) {
        lifecycle(
          'listener_checkout_failed',
          error,
          'checkout',
          performance.now() - checkoutStarted,
        );
        throw error;
      }
      let listening = false;
      let released = false;
      const destroy = () => {
        if (released) return;
        released = true;
        next.release(true);
        lifecycle('listener_destroy');
      };
      try {
        const onNotification = (notification: pg.Notification) => {
          if (
            notification.channel !== LIVE_PVP_NOTIFY_CHANNEL &&
            notification.channel !== LIVE_PVP_PRESENCE_NOTIFY_CHANNEL
          ) {
            return;
          }
          const event = parseNotification(notification.payload);
          if (!event) return;
          const broadcast =
            notification.channel === LIVE_PVP_NOTIFY_CHANNEL
              ? gateway.broadcastMatch(event.matchId, event.version)
              : gateway.broadcastPresence(event.matchId);
          void broadcast.catch(() =>
            logger.warn({}, 'Live PvP notification fan-out failed.'),
          );
        };
        const onError = (error: unknown) => {
          if (client !== next) return;
          client = undefined;
          detachClientHandlers = undefined;
          recoveryRequired = true;
          lifecycle('listener_client_error', error, 'client');
          destroy();
          if (!stopped) scheduleReconnect();
        };
        next.on('notification', onNotification);
        next.on('error', onError);

        await next.query(`listen ${LIVE_PVP_NOTIFY_CHANNEL}`);
        await next.query(`listen ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`);
        listening = true;
        client = next;
        detachClientHandlers = () => {
          next.off('notification', onNotification);
          next.off('error', onError);
        };
        lifecycle('listener_listen_success');
        logger.info({}, 'Live PvP PostgreSQL notification listener started.');

        if (recoveryRequired) {
          recoveryRequired = false;
          await gateway.recoverNotificationGap();
          lifecycle('listener_recovered');
          logger.info(
            {},
            'Live PvP sockets were reset after notification-listener recovery.',
          );
        }
      } catch (error) {
        lifecycle('database_error', error, listening ? 'transaction' : 'query');
        if (client === next) {
          client = undefined;
          detachClientHandlers = undefined;
        }
        destroy();
        throw error;
      }
    })();
    connecting = attempt;
    try {
      await attempt;
    } finally {
      if (connecting === attempt) connecting = undefined;
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      lifecycle('listener_reconnect');
      void connectListener().catch(() => {
        recoveryRequired = true;
        logger.error({}, 'Live PvP notification listener reconnect failed.');
        scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
    reconnectTimer.unref();
  }

  return {
    async start(requireReady = false) {
      return serializeLifecycle(async () => {
        stopped = false;
        clearReconnectTimer();
        try {
          await connectListener();
        } catch {
          recoveryRequired = true;
          logger.error({}, 'Live PvP notification listener failed to start.');
          scheduleReconnect();
          if (requireReady) {
            throw new Error('Live PvP notification listener is unavailable.');
          }
        }
      });
    },

    async stop() {
      return serializeLifecycle(async () => {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        if (connecting) {
          try {
            await connecting;
          } catch {
            // Startup failure is already logged and shutdown is best-effort.
          }
        }
        const active = client;
        const detach = detachClientHandlers;
        client = undefined;
        detachClientHandlers = undefined;
        if (!active) return;
        let unlistened = false;
        try {
          await active.query(`unlisten ${LIVE_PVP_NOTIFY_CHANNEL}`);
          await active.query(`unlisten ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`);
          unlistened = true;
        } catch (error) {
          lifecycle('database_error', error, 'query');
          // Shutdown errors may reach the server logger. Preserve only the safe
          // classification, never the driver's message, stack or connection data.
          const cleanupError = new Error(
            'Live PvP notification listener cleanup failed.',
            {
              cause: { error_category: classifyDatabaseError(error, 'query') },
            },
          );
          throw cleanupError;
        } finally {
          detach?.();
          active.release(unlistened ? undefined : true);
          lifecycle(unlistened ? 'listener_release' : 'listener_destroy');
        }
      });
    },
  };
}

function parseNotification(
  payload: string | undefined,
): { matchId: string; version: number } | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.matchId !== 'string' ||
      !MATCH_ID_PATTERN.test(record.matchId) ||
      typeof record.version !== 'number' ||
      !Number.isSafeInteger(record.version) ||
      record.version < 0
    ) {
      return null;
    }
    return { matchId: record.matchId, version: record.version };
  } catch {
    return null;
  }
}
