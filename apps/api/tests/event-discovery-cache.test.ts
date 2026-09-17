import { describe, expect, it, vi } from 'vitest';

import {
  createCachedEventDiscoveryService,
  type PlayerEvent,
} from '../src/events/event-discovery.js';

const activeEvent: PlayerEvent = {
  eventId: '5a34e93c-5213-4b4a-a983-a0b66fe57059',
  title: 'Great Hall challenge',
  description: null,
  latitude: -26.1929,
  longitude: 28.0305,
  radiusMetres: 50,
  startsAt: '2026-09-17T08:00:00.000Z',
  endsAt: '2026-09-17T12:00:00.000Z',
  availability: 'active',
};

describe('cached event discovery', () => {
  it('reuses a successful discovery result within its bounded lifetime', async () => {
    let now = new Date('2026-09-17T10:00:00.000Z');
    const list = vi.fn().mockResolvedValue([activeEvent]);
    const service = createCachedEventDiscoveryService(
      { list },
      { clock: () => now, maxAgeMs: 5_000 },
    );

    const first = await service.list();
    first[0]!.title = 'Caller mutation';
    now = new Date('2026-09-17T10:00:04.999Z');

    await expect(service.list()).resolves.toEqual([activeEvent]);
    expect(list).toHaveBeenCalledTimes(1);

    now = new Date('2026-09-17T10:00:05.000Z');
    await service.list();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('expires at an event transition instead of returning a stale availability', async () => {
    let now = new Date('2026-09-17T10:00:00.000Z');
    const upcomingEvent = {
      ...activeEvent,
      startsAt: '2026-09-17T10:00:02.000Z',
      availability: 'upcoming' as const,
    };
    const list = vi.fn().mockResolvedValue([upcomingEvent]);
    const service = createCachedEventDiscoveryService(
      { list },
      { clock: () => now, maxAgeMs: 5_000 },
    );

    await service.list();
    now = new Date(upcomingEvent.startsAt);
    await service.list();

    expect(list).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent loads and retries after a failed load', async () => {
    let resolveLoad: ((events: PlayerEvent[]) => void) | undefined;
    const pendingLoad = new Promise<PlayerEvent[]>((resolve) => {
      resolveLoad = resolve;
    });
    const list = vi
      .fn()
      .mockReturnValueOnce(pendingLoad)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([activeEvent]);
    const service = createCachedEventDiscoveryService(
      { list },
      { maxAgeMs: 0 },
    );

    const first = service.list();
    const concurrent = service.list();
    resolveLoad?.([activeEvent]);

    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      [activeEvent],
      [activeEvent],
    ]);
    expect(list).toHaveBeenCalledTimes(1);

    await expect(service.list()).rejects.toThrow('database unavailable');
    await expect(service.list()).resolves.toEqual([activeEvent]);
    expect(list).toHaveBeenCalledTimes(3);
  });
});
