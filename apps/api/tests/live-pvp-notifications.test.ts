import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createLivePvpNotificationListener } from '../src/matches/live-pvp-notifications.js';
import {
  LIVE_PVP_NOTIFY_CHANNEL,
  LIVE_PVP_PRESENCE_NOTIFY_CHANNEL,
} from '../src/matches/live-pvp-service.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

type Notification = { channel: string; payload?: string; processId: number };

class FakeListenerClient {
  query = vi.fn().mockResolvedValue({ rows: [] });
  release = vi.fn();
  private notificationHandler?: (notification: Notification) => void;
  private errorHandler?: (error?: unknown) => void;

  on(event: 'notification' | 'error', handler: (...args: never[]) => void) {
    if (event === 'notification') {
      this.notificationHandler = handler as unknown as (
        notification: Notification,
      ) => void;
    } else {
      this.errorHandler = handler as unknown as (error?: unknown) => void;
    }
    return this;
  }

  emitNotification(notification: Notification): void {
    this.notificationHandler?.(notification);
  }

  emitError(error?: unknown): void {
    this.errorHandler?.(error);
  }
}

describe('live PvP PostgreSQL fan-out', () => {
  it('logs allowlisted checkout, LISTEN, client-error, recovery and release events', async () => {
    vi.useFakeTimers();
    const first = new FakeListenerClient(),
      second = new FakeListenerClient();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const listener = createLivePvpNotificationListener(
      {
        connect: vi
          .fn()
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(second),
      } as unknown as Pick<pg.Pool, 'connect'>,
      {
        broadcastMatch: vi.fn(),
        broadcastPresence: vi.fn(),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      logger,
    );
    try {
      await listener.start();
      first.emitError(
        Object.assign(new Error('Connection terminated unexpectedly'), {
          password: 'private-marker',
          sql: 'private-marker',
          stack: 'private-marker',
        }),
      );
      await vi.advanceTimersByTimeAsync(5_000);
      await listener.stop();
      const events = logger.info.mock.calls
        .filter(([, message]) => message === 'PostgreSQL pool observation')
        .map(([fields]) => fields);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'listener_checkout_start',
            category: 'listener',
          }),
          expect.objectContaining({
            event: 'listener_checkout_success',
            checkout_ms: expect.any(Number),
          }),
          expect.objectContaining({ event: 'listener_listen_success' }),
          expect.objectContaining({
            event: 'listener_client_error',
            error_category: 'connection_terminated',
          }),
          expect.objectContaining({ event: 'listener_destroy' }),
          expect.objectContaining({ event: 'listener_reconnect' }),
          expect.objectContaining({ event: 'listener_recovered' }),
          expect.objectContaining({ event: 'listener_release' }),
        ]),
      );
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
        'private-marker',
      );
      expect(first.release).toHaveBeenCalledWith(true);
      expect(second.release).toHaveBeenCalledOnce();
    } finally {
      await listener.stop();
      vi.useRealTimers();
    }
  });

  it('classifies failed checkout and LISTEN without exporting exceptions', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = new FakeListenerClient();
    client.query.mockRejectedValueOnce(new Error('private-query-marker'));
    const connect = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('timeout exceeded when trying to connect'),
      )
      .mockResolvedValue(client);
    const gateway = {
      broadcastMatch: vi.fn(),
      broadcastPresence: vi.fn(),
      recoverNotificationGap: vi.fn(),
    };
    const listener = createLivePvpNotificationListener(
      { connect } as unknown as Pick<pg.Pool, 'connect'>,
      gateway,
      logger,
    );
    await listener.start();
    await listener.stop();
    const failedListen = createLivePvpNotificationListener(
      { connect } as unknown as Pick<pg.Pool, 'connect'>,
      gateway,
      logger,
    );
    await failedListen.start();
    await failedListen.stop();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'listener_checkout_failed',
        error_category: 'checkout_timeout',
      }),
      'PostgreSQL pool observation',
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'database_error',
        error_category: 'query_error',
      }),
      'PostgreSQL pool observation',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'private-query-marker',
    );
  });

  it('lets separate API instances reload the same committed version', async () => {
    const firstClient = new FakeListenerClient();
    const secondClient = new FakeListenerClient();
    const firstBroadcast = vi.fn().mockResolvedValue(undefined);
    const secondBroadcast = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const first = createLivePvpNotificationListener(
      {
        connect: vi
          .fn()
          .mockResolvedValue(firstClient as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      {
        broadcastMatch: firstBroadcast,
        broadcastPresence: vi.fn(),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      logger,
    );
    const second = createLivePvpNotificationListener(
      {
        connect: vi
          .fn()
          .mockResolvedValue(secondClient as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      {
        broadcastMatch: secondBroadcast,
        broadcastPresence: vi.fn(),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      logger,
    );

    await first.start();
    await second.start();

    const notification = {
      channel: LIVE_PVP_NOTIFY_CHANNEL,
      payload: JSON.stringify({ matchId: MATCH_ID, version: 8 }),
      processId: 123,
    };
    firstClient.emitNotification(notification);
    secondClient.emitNotification(notification);
    await Promise.resolve();
    await Promise.resolve();

    expect(firstBroadcast).toHaveBeenCalledWith(MATCH_ID, 8);
    expect(secondBroadcast).toHaveBeenCalledWith(MATCH_ID, 8);

    await first.stop();
    await second.stop();
    expect(firstClient.query).toHaveBeenCalledWith(
      `unlisten ${LIVE_PVP_NOTIFY_CHANNEL}`,
    );
    expect(firstClient.query).toHaveBeenCalledWith(
      `unlisten ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`,
    );
  });

  it('routes connection-generation and presence wake-ups without replaying a gameplay transition', async () => {
    const client = new FakeListenerClient();
    const broadcastMatch = vi.fn().mockResolvedValue(undefined);
    const broadcastPresence = vi.fn().mockResolvedValue(undefined);
    const listener = createLivePvpNotificationListener(
      {
        connect: vi.fn().mockResolvedValue(client as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      {
        broadcastMatch,
        broadcastPresence,
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    );
    await listener.start();

    client.emitNotification({
      channel: LIVE_PVP_PRESENCE_NOTIFY_CHANNEL,
      payload: JSON.stringify({ matchId: MATCH_ID, version: 7 }),
      processId: 2,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(broadcastPresence).toHaveBeenCalledWith(MATCH_ID);
    expect(broadcastMatch).not.toHaveBeenCalled();
    await listener.stop();
  });

  it('resets local sockets after a listener outage recovers so missed notifications cannot leave stale clients', async () => {
    vi.useFakeTimers();
    try {
      const firstClient = new FakeListenerClient();
      const recoveredClient = new FakeListenerClient();
      const recoverNotificationGap = vi.fn().mockResolvedValue(undefined);
      const connect = vi
        .fn()
        .mockResolvedValueOnce(firstClient as unknown as pg.PoolClient)
        .mockResolvedValueOnce(recoveredClient as unknown as pg.PoolClient);
      const listener = createLivePvpNotificationListener(
        { connect } as unknown as Pick<pg.Pool, 'connect'>,
        {
          broadcastMatch: vi.fn().mockResolvedValue(undefined),
          broadcastPresence: vi.fn().mockResolvedValue(undefined),
          recoverNotificationGap,
        },
        { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      );

      await listener.start();
      expect(recoverNotificationGap).not.toHaveBeenCalled();

      firstClient.emitError();
      await vi.advanceTimersByTimeAsync(5_000);

      expect(connect).toHaveBeenCalledTimes(2);
      expect(recoveredClient.query).toHaveBeenCalledWith(
        `listen ${LIVE_PVP_NOTIFY_CHANNEL}`,
      );
      expect(recoveredClient.query).toHaveBeenCalledWith(
        `listen ${LIVE_PVP_PRESENCE_NOTIFY_CHANNEL}`,
      );
      expect(recoverNotificationGap).toHaveBeenCalledOnce();

      await listener.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores malformed notification payloads', async () => {
    const client = new FakeListenerClient();
    const broadcastMatch = vi.fn();
    const listener = createLivePvpNotificationListener(
      {
        connect: vi.fn().mockResolvedValue(client as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      {
        broadcastMatch,
        broadcastPresence: vi.fn(),
        recoverNotificationGap: vi.fn().mockResolvedValue(undefined),
      },
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    );
    await listener.start();

    client.emitNotification({
      channel: LIVE_PVP_NOTIFY_CHANNEL,
      payload: '{bad-json',
      processId: 1,
    });
    await Promise.resolve();
    expect(broadcastMatch).not.toHaveBeenCalled();

    await listener.stop();
  });
});
