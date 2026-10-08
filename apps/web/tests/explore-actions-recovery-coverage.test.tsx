import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserLocationError,
  type LocationClaim,
  type LocationObservationHandlers,
  type LocationObservationProvider,
} from '../src/browser-location';
import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';
import ExplorePage from '../src/pages/ExplorePage';

const apiBaseUrl = 'https://api.example.test/api/v1';
const eventId = '00000000-0000-4000-8000-000000000018';
const zoneId = '20000000-0000-4000-8000-000000000001';
const seasonId = '30000000-0000-4000-8000-000000000001';
const event = {
  availability: 'active',
  description: 'A campus recovery event.',
  endsAt: '2099-09-01T00:00:00.000Z',
  eventId,
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000Z',
  title: 'Coverage Quest',
} as const;
const claim: LocationClaim = {
  accuracyMetres: 12,
  acquiredAt: new Date().toISOString(),
  latitude: -26.19205,
  longitude: 28.03038,
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function controller(): MapController {
  return {
    focusPoint: vi.fn(() => true),
    focusRegion: vi.fn(() => true),
    onError: vi.fn(),
    onLoad: (listener) => listener(),
    recenterReportedLocation: vi.fn(() => true),
    remove: vi.fn(),
    setFollowStateListener: vi.fn(),
    setPointSelectionListener: vi.fn(),
    setPoints: vi.fn(),
    setRegionSelectionListener: vi.fn(),
    setRegions: vi.fn(),
    setReportedLocation: vi.fn(),
    setSelectedPoint: vi.fn(),
    setSelectedRegion: vi.fn(),
  };
}

function observationHarness() {
  let handlers: LocationObservationHandlers | null = null;
  let active = false;
  const provider: LocationObservationProvider = vi.fn((nextHandlers) => {
    handlers = nextHandlers;
    active = true;
    return vi.fn(() => {
      active = false;
    });
  });
  return {
    emitError(failure: BrowserLocationError['failure']) {
      if (active) handlers?.onError(new BrowserLocationError(failure));
    },
    emitLocation(nextClaim: LocationClaim) {
      if (active) handlers?.onLocation(nextClaim);
    },
    provider,
  };
}

function renderExplore(observation = observationHarness()) {
  const auth = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
  const mapFactory: MapFactory = vi.fn(async () => controller());
  render(
    <Auth0Context.Provider value={auth}>
      <ExplorePage
        apiBaseUrl={apiBaseUrl}
        locationObservationProvider={observation.provider}
        locationPermissionProvider={vi.fn().mockResolvedValue('granted')}
        mapFactory={mapFactory}
        mapboxAccessToken="pk.test-token"
      />
    </Auth0Context.Provider>,
  );
  return observation;
}

function territoryPayload() {
  return {
    geometry: {
      coordinates: [
        [
          [28.029, -26.193],
          [28.032, -26.193],
          [28.032, -26.19],
          [28.029, -26.193],
        ],
      ],
      type: 'Polygon',
    },
    name: 'East Campus',
    owner: { playerName: 'blue_witsie' },
    seasonId,
    status: 'active',
    windowEnd: '2026-09-26T15:00:00.000Z',
    windowStart: '2026-09-26T14:00:00.000Z',
    zoneId,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Explore action recovery', () => {
  it('turns a live watcher timeout into selected-event recovery guidance', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ events: [event], requestId: 'events' }));
    vi.stubGlobal('fetch', fetchMock);
    const observation = observationHarness();
    renderExplore(observation);
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());

    await user.click(await screen.findByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: /View on map/i }));
    act(() => observation.emitError('timeout'));

    expect(await screen.findByText('Location signal timed out.')).toBeVisible();
    expect(
      screen.getByText('The signal timed out. Move to an open area and retry.'),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('clears a selected event and aborts its unresolved eligibility request', async () => {
    const user = userEvent.setup();
    let eligibilitySignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/events')) {
        return Promise.resolve(json({ events: [event], requestId: 'events' }));
      }
      eligibilitySignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const observation = observationHarness();
    renderExplore(observation);
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emitLocation(claim));

    await user.click(await screen.findByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: /View on map/i }));
    await waitFor(() => expect(eligibilitySignal).toBeDefined());
    expect(await screen.findByText('Checking range…')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'All events' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Search campus events' }),
      'not a match',
    );

    expect(eligibilitySignal?.aborted).toBe(true);
    expect(
      screen.getByRole('heading', { name: 'Campus events' }),
    ).toBeVisible();
    expect(screen.getByText('No events match these filters.')).toBeVisible();
  });

  it('recovers trail browsing and opens current territory activity from its tab', async () => {
    const user = userEvent.setup();
    const trailId = '17700000-0000-4000-8000-000000000001';
    let trailRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/events')) {
        return Promise.resolve(json({ events: [event], requestId: 'events' }));
      }
      if (url.endsWith('/trails')) {
        trailRequests += 1;
        return Promise.resolve(
          trailRequests === 1
            ? json({ code: 'TRAIL_DISCOVERY_UNAVAILABLE' }, 503)
            : json({
                requestId: 'trails',
                trails: [
                  {
                    availability: 'active',
                    completedStepCount: 0,
                    currentStepPosition: 1,
                    description: 'A connected campus story.',
                    endsAt: null,
                    progressStatus: 'in_progress',
                    publicationStatus: 'published',
                    startsAt: null,
                    title: 'Campus History Trail',
                    totalSteps: 1,
                    trailId,
                  },
                ],
              }),
        );
      }
      if (url.endsWith('/territory/zones')) {
        return Promise.resolve(json({ zones: [territoryPayload()] }));
      }
      if (url.endsWith(`/territory/zones/${zoneId}`)) {
        return Promise.resolve(
          json({
            ...territoryPayload(),
            lastSettledAt: null,
            lifecycleVersion: 1,
          }),
        );
      }
      if (url.endsWith(`/territory/zones/${zoneId}/standings`)) {
        return Promise.resolve(
          json({
            activity: { contributors: 2, influence: 7 },
            seasonId,
            top: [{ influence: 7, rank: 1 }],
            viewer: {
              dailyCap: 10,
              influence: 3,
              remainingDailyInfluence: 7,
              todayInfluence: 3,
            },
            zoneId,
          }),
        );
      }
      if (url.endsWith(`/territory/zones/${zoneId}/history`)) {
        return Promise.resolve(
          json({
            entries: [
              {
                effectiveAt: '2026-09-26T14:00:05.000Z',
                owner: { playerName: 'blue_witsie' },
                seasonId,
                transitionKind: 'settlement',
              },
            ],
            zoneId,
          }),
        );
      }
      return Promise.resolve(json({ message: 'Not found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderExplore();

    await user.click(await screen.findByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Trails' }));
    expect(await screen.findByText('Trails could not load.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry trails' }));
    expect(await screen.findByText('Campus History Trail')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Territories' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Open East Campus, active, Owned by blue_witsie',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'This hour' }),
    ).toBeVisible();
    expect(screen.getByText('7 influence from 2 contributors')).toBeVisible();
    expect(screen.getByText('blue_witsie took ownership')).toBeVisible();
    expect(trailRequests).toBe(2);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(`/territory/zones/${zoneId}/history`),
      ),
    ).toBe(true);
  });
});
