import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getPlayerTrail,
  listNearbyUnvisited,
  listPlayerTrails,
  NearbyUnvisitedError,
  TrailDiscoveryError,
} from '../src/api/trails';
import type { LocationClaim } from '../src/browser-location';

const apiBaseUrl = 'https://api.example.test/api/v1';
const getAccessToken = vi.fn().mockResolvedValue('access-token');
const signal = new AbortController().signal;
const trailId = '17700000-0000-4000-8000-000000000001';
const eventId = '17700000-0000-4000-8000-000000000002';
const claim: LocationClaim = {
  accuracyMetres: 12,
  acquiredAt: '2026-09-05T08:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
};

const summary = {
  availability: 'active',
  completedStepCount: 0,
  currentStepPosition: 1,
  description: 'Follow a clear campus story.',
  endsAt: null,
  progressStatus: 'in_progress',
  publicationStatus: 'published',
  startsAt: null,
  title: 'Campus History Trail',
  totalSteps: 1,
  trailId,
} as const;

const step = {
  completedAt: null,
  description: 'Begin at the Great Hall.',
  endsAt: '2026-10-01T00:00:00.000Z',
  eventId,
  latitude: -26.19205,
  longitude: 28.03038,
  position: 1,
  radiusMetres: 75,
  startsAt: '2026-09-01T00:00:00.000Z',
  state: 'current',
  title: 'Great Hall',
  unavailableReason: null,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  getAccessToken.mockClear();
});

describe('trail discovery client', () => {
  it('loads server-derived trail summaries and ordered detail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ requestId: 'list', trails: [summary] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          requestId: 'detail',
          trail: { ...summary, steps: [step] },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listPlayerTrails({ apiBaseUrl, getAccessToken, signal }),
    ).resolves.toEqual([summary]);
    await expect(
      getPlayerTrail({ apiBaseUrl, getAccessToken, signal, trailId }),
    ).resolves.toEqual({ ...summary, steps: [step] });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/trails/${trailId}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('rejects malformed or expanded payloads instead of rendering stale state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          requestId: 'malformed',
          trails: [{ ...summary, browserMayUnlock: true }],
        }),
      ),
    );

    await expect(
      listPlayerTrails({ apiBaseUrl, getAccessToken, signal }),
    ).rejects.toEqual(new TrailDiscoveryError('unavailable'));
  });

  it('treats a disappeared trail as a safe not-found state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(
      getPlayerTrail({ apiBaseUrl, getAccessToken, signal, trailId }),
    ).rejects.toEqual(new TrailDiscoveryError('not-found'));
  });
});

describe('nearby unvisited client', () => {
  it('submits only the reported-location claim and parses trail context', async () => {
    const nearby = {
      description: 'A nearby stop.',
      distanceMetres: 182.4,
      endsAt: step.endsAt,
      eventId,
      latitude: step.latitude,
      longitude: step.longitude,
      radiusMetres: step.radiusMetres,
      startsAt: step.startsAt,
      title: step.title,
      trailContexts: [
        { position: 1, title: summary.title, totalSteps: 5, trailId },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ events: [nearby], requestId: 'nearby' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listNearbyUnvisited({ apiBaseUrl, claim, getAccessToken, signal }),
    ).resolves.toEqual([nearby]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/events/nearby-unvisited`,
      expect.objectContaining({ body: JSON.stringify(claim), method: 'POST' }),
    );
  });

  it('turns an authoritative location retry into a recoverable client failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 422 })),
    );

    await expect(
      listNearbyUnvisited({ apiBaseUrl, claim, getAccessToken, signal }),
    ).rejects.toEqual(new NearbyUnvisitedError('location-retry'));
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
