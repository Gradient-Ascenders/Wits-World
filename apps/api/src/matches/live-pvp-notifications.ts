import type pg from 'pg';

import {
  LIVE_PVP_NOTIFY_CHANNEL,
  LIVE_PVP_PRESENCE_NOTIFY_CHANNEL,
} from './live-pvp-service.js';
import type { LivePvpGateway } from './live-pvp-gateway.js';

const RECONNECT_DELAY_MS = 5_000;
const MATCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LivePvpNotificationListener {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface LivePvpNotificationLogger {
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export function createLivePvpNotificationListener(
  database: Pick<pg.Pool, 'connect'>,
  gateway: Pick<
    LivePvpGateway,
    'broadcastMatch' | 'broadcastPresence' | 'recoverNotificationGap'
  >,
  logger: LivePvpNotificationLogger = console,
): LivePvpNotificationListener {
  let client: pg.PoolClient | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let stopped = true;
  let connecting: Promise<void> | undefined;
  let recoveryRequired = false;

  async function connectListener(): Promise<void> {
    if (stopped || client || connecting) return connecting;
    connecting = (async () => {
      const next = await database.connect();
      try {
        next.on('notification', (notification: pg.Notification) => {
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
            logger.warn(
              {
                matchId: event.matchId,
                version: event.version,
                channel: notification.channel,
              },
              'Live PvP notification fan-out failed.',
            ),
          );
        });
        next.on('error', () => {
          if (client !== next) return;
          client = undefined;
          recoveryRequired = true;
          next.release(true);
          if (!stopped) scheduleReconnect();
        });

        await next.query(`listen ${LIVE_PVP_NOTIFY_CHANNEL}`);
        await next.query(`listen ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`);
        client = next;
        logger.info({}, 'Live PvP PostgreSQL notification listener started.');

        if (recoveryRequired) {
          recoveryRequired = false;
          await gateway.recoverNotificationGap();
          logger.info(
            {},
            'Live PvP sockets were reset after notification-listener recovery.',
          );
        }
      } catch (error) {
        if (client === next) client = undefined;
        next.release(true);
        throw error;
      }
    })();
    try {
      await connecting;
    } finally {
      connecting = undefined;
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connectListener().catch(() => {
        recoveryRequired = true;
        logger.error({}, 'Live PvP notification listener reconnect failed.');
        scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
    reconnectTimer.unref();
  }

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      try {
        await connectListener();
      } catch {
        recoveryRequired = true;
        logger.error({}, 'Live PvP notification listener failed to start.');
        scheduleReconnect();
      }
    },

    async stop() {
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
      client = undefined;
      if (!active) return;
      try {
        await active.query(`unlisten ${LIVE_PVP_NOTIFY_CHANNEL}`);
        await active.query(`unlisten ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`);
      } finally {
        active.release();
      }
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
