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
import {
  readGameplayWork,
  type GameplayWorkSnapshot,
} from './gameplay-work.js';
import type { GameplayWorkerKind } from './gameplay-activity-store.js';
import type { LivePvpGateway } from './live-pvp-gateway.js';

export const GAMEPLAY_WORK_NOTIFY_CHANNEL = 'witsworld_gameplay_work';

const RECONNECT_DELAY_MS = 5_000;
const MATCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LivePvpNotificationListener {
  start(requireReady?: boolean): Promise<void>;
  stop(): Promise<void>;
  startCoordination(): Promise<void>;
  stopCoordination(): Promise<void>;
  readGameplayWork(): Promise<GameplayWorkSnapshot>;
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
  coordination: {
    onWake?: (worker: GameplayWorkerKind) => void;
    onReady?: () => void;
    onUnavailable?: () => void;
  } = {},
): LivePvpNotificationListener {
  let client: pg.PoolClient | undefined;
  let detachClientHandlers: (() => void) | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let stopped = true;
  let gatewayRequested = false;
  let coordinationRequested = false;
  let coordinationListening = false;
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

  function sessionQuery(active: pg.PoolClient, text: string) {
    if (!coordinationRequested && !coordinationListening)
      return active.query(text);
    const query = { text, query_timeout: 1_000 };
    return active.query(query);
  }

  async function connectListener(): Promise<void> {
    if (stopped) return;
    clearReconnectTimer();
    if (connecting) return connecting;
    if (client) {
      if (coordinationRequested && !coordinationListening) {
        try {
          await sessionQuery(client, `listen ${GAMEPLAY_WORK_NOTIFY_CHANNEL}`);
          coordinationListening = true;
          coordination.onReady?.();
        } catch (error) {
          const failed = client;
          client = undefined;
          detachClientHandlers?.();
          detachClientHandlers = undefined;
          recoveryRequired = true;
          failed.release(true);
          lifecycle('listener_destroy', error, 'query');
          throw error;
        }
      }
      return;
    }

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
          if (released) return;
          if (
            coordinationRequested &&
            notification.channel === GAMEPLAY_WORK_NOTIFY_CHANNEL
          ) {
            if (
              notification.payload === 'ranked' ||
              notification.payload === 'live'
            )
              coordination.onWake?.(notification.payload);
            return;
          }
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
          coordinationListening = false;
          if (coordinationRequested) coordination.onUnavailable?.();
          lifecycle('listener_client_error', error, 'client');
          destroy();
          if (!stopped) scheduleReconnect();
        };
        const onEnd = () => onError(new Error('Notification session ended.'));
        next.on('end', onEnd);
        next.on('notification', onNotification);
        next.on('error', onError);

        await sessionQuery(next, `listen ${LIVE_PVP_NOTIFY_CHANNEL}`);
        await sessionQuery(next, `listen ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`);
        if (coordinationRequested) {
          await sessionQuery(next, `listen ${GAMEPLAY_WORK_NOTIFY_CHANNEL}`);
          coordinationListening = true;
        }
        listening = true;
        client = next;
        detachClientHandlers = () => {
          next.off('notification', onNotification);
          next.off('error', onError);
          next.off('end', onEnd);
        };
        lifecycle('listener_listen_success');
        if (coordinationRequested) coordination.onReady?.();
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
        coordinationListening = false;
        if (coordinationRequested) coordination.onUnavailable?.();
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

  async function disconnectListener(): Promise<void> {
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
      await sessionQuery(active, `unlisten ${LIVE_PVP_NOTIFY_CHANNEL}`);
      await sessionQuery(
        active,
        `unlisten ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`,
      );
      if (coordinationListening)
        await sessionQuery(active, `unlisten ${GAMEPLAY_WORK_NOTIFY_CHANNEL}`);
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
      coordinationListening = false;
      detach?.();
      active.release(unlistened ? undefined : true);
      lifecycle(unlistened ? 'listener_release' : 'listener_destroy');
    }
  }

  return {
    async start(requireReady = false) {
      return serializeLifecycle(async () => {
        gatewayRequested = true;
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
        gatewayRequested = false;
        if (!coordinationRequested) await disconnectListener();
      });
    },
    async startCoordination() {
      return serializeLifecycle(async () => {
        coordinationRequested = true;
        stopped = false;
        try {
          await connectListener();
        } catch {
          recoveryRequired = true;
          coordination.onUnavailable?.();
          scheduleReconnect();
          throw new Error('PostgreSQL gameplay listener is unavailable.');
        }
      });
    },
    async stopCoordination() {
      return serializeLifecycle(async () => {
        coordinationRequested = false;
        if (!gatewayRequested) await disconnectListener();
        else if (client && coordinationListening) {
          const active = client;
          try {
            await sessionQuery(
              active,
              `unlisten ${GAMEPLAY_WORK_NOTIFY_CHANNEL}`,
            );
            coordinationListening = false;
          } catch (error) {
            client = undefined;
            detachClientHandlers?.();
            detachClientHandlers = undefined;
            coordinationListening = false;
            recoveryRequired = true;
            active.release(true);
            lifecycle('listener_destroy', error, 'query');
            scheduleReconnect();
            // Retain only the safe category, matching listener shutdown errors.
            const cleanupError = new Error(
              'PostgreSQL gameplay listener cleanup failed.',
              {
                cause: {
                  error_category: classifyDatabaseError(error, 'query'),
                },
              },
            );
            throw cleanupError;
          }
        }
      });
    },
    async readGameplayWork() {
      return serializeLifecycle(async () => {
        const active = client;
        if (
          stopped ||
          !coordinationRequested ||
          !coordinationListening ||
          !active
        )
          throw new Error('PostgreSQL gameplay listener is unavailable.');
        try {
          const snapshot = await readGameplayWork(active);
          if (client !== active || stopped)
            throw new Error('PostgreSQL gameplay listener generation changed.');
          return snapshot;
        } catch (error) {
          if (client === active) {
            client = undefined;
            detachClientHandlers?.();
            detachClientHandlers = undefined;
            coordinationListening = false;
            recoveryRequired = true;
            active.release(true);
            lifecycle('listener_destroy', error, 'query');
            coordination.onUnavailable?.();
            scheduleReconnect();
          }
          // Driver messages and SQL details must not reach the server logger.
          const discoveryError = new Error(
            'PostgreSQL gameplay discovery failed.',
            {
              cause: { error_category: classifyDatabaseError(error, 'query') },
            },
          );
          throw discoveryError;
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
