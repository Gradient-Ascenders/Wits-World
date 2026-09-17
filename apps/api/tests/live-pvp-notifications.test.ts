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
  private errorHandler?: () => void;

  on(event: 'notification' | 'error', handler: (...args: never[]) => void) {
    if (event === 'notification') {
      this.notificationHandler = handler as unknown as (
        notification: Notification,
      ) => void;
    } else {
      this.errorHandler = handler as unknown as () => void;
    }
    return this;
  }

  emitNotification(notification: Notification): void {
    this.notificationHandler?.(notification);
  }
}

describe('live PvP PostgreSQL fan-out', () => {
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
      { broadcastMatch: firstBroadcast, broadcastPresence: vi.fn() },
      logger,
    );
    const second = createLivePvpNotificationListener(
      {
        connect: vi
          .fn()
          .mockResolvedValue(secondClient as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      { broadcastMatch: secondBroadcast, broadcastPresence: vi.fn() },
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
      { broadcastMatch, broadcastPresence },
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

  it('ignores malformed notification payloads', async () => {
    const client = new FakeListenerClient();
    const broadcastMatch = vi.fn();
    const listener = createLivePvpNotificationListener(
      {
        connect: vi.fn().mockResolvedValue(client as unknown as pg.PoolClient),
      } as unknown as Pick<pg.Pool, 'connect'>,
      { broadcastMatch, broadcastPresence: vi.fn() },
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
