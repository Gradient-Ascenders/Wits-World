import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LocationObservationProvider } from '../src/browser-location';
import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';
import ExplorePage from '../src/pages/ExplorePage';

const API_BASE_URL = 'https://api.example.test/api/v1';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SEASON_ID = '30000000-0000-4000-8000-000000000001';
const zone = {
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
  seasonId: SEASON_ID,
  status: 'active',
  windowEnd: '2026-09-26T15:00:00.000Z',
  windowStart: '2026-09-26T14:00:00.000Z',
  zoneId: ZONE_ID,
} as const;

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
}

function mapController(): MapController {
  return {
    focusPoint: vi.fn(() => true),
    focusRegion: vi.fn(() => true),
    onError: vi.fn(),
    onLoad(listener) {
      listener();
    },
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function territoryFetch() {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${API_BASE_URL}/events`) {
      return Promise.resolve(jsonResponse({ events: [], requestId: 'events' }));
    }
    if (url === `${API_BASE_URL}/territory/zones`) {
      return Promise.resolve(jsonResponse({ zones: [zone] }));
    }
    if (url === `${API_BASE_URL}/territory/zones/${ZONE_ID}`) {
      return Promise.resolve(
        jsonResponse({
          ...zone,
          lastSettledAt: '2026-09-26T14:00:05.000Z',
          lifecycleVersion: 3,
        }),
      );
    }
    if (url === `${API_BASE_URL}/territory/zones/${ZONE_ID}/standings`) {
      return Promise.resolve(
        jsonResponse({
          activity: { contributors: 4, influence: 9 },
          seasonId: SEASON_ID,
          top: [
            { influence: 4, rank: 1 },
            { influence: 3, rank: 2 },
          ],
          viewer: {
            dailyCap: 5,
            influence: 2,
            remainingDailyInfluence: 3,
            todayInfluence: 2,
          },
          zoneId: ZONE_ID,
        }),
      );
    }
    if (url === `${API_BASE_URL}/territory/zones/${ZONE_ID}/history`) {
      return Promise.resolve(
        jsonResponse({
          entries: [
            {
              effectiveAt: '2026-09-26T14:00:05.000Z',
              owner: { playerName: 'blue_witsie' },
              seasonId: SEASON_ID,
              transitionKind: 'settlement',
            },
          ],
          zoneId: ZONE_ID,
        }),
      );
    }
    return Promise.resolve(jsonResponse({ message: 'Not found' }, 404));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('territory exploration experience', () => {
  it('loads territories only on demand and exposes map-equivalent details in the list', async () => {
    const user = userEvent.setup();
    const fetchMock = territoryFetch();
    vi.stubGlobal('fetch', fetchMock);
    const controller = mapController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const locationObservationProvider: LocationObservationProvider = vi.fn(() =>
      vi.fn(),
    );

    render(
      <Auth0Context.Provider value={authValue()}>
        <ExplorePage
          apiBaseUrl={API_BASE_URL}
          locationObservationProvider={locationObservationProvider}
          locationPermissionProvider={vi.fn().mockResolvedValue('denied')}
          mapFactory={mapFactory}
          mapboxAccessToken="pk.test-token"
        />
      </Auth0Context.Provider>,
    );

    await screen.findByRole('button', { name: /Events —/ });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/territory/')),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: /Events —/ }));
    await user.click(screen.getByRole('button', { name: 'Territories' }));

    const zoneButton = await screen.findByRole('button', {
      name: 'Open East Campus, active, Owned by blue_witsie',
    });
    await waitFor(() =>
      expect(controller.setRegions).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: ZONE_ID, label: 'East Campus' }),
      ]),
    );

    await user.click(zoneButton);

    expect(await screen.findByText('Current contest')).toBeVisible();
    expect(screen.getByText('blue_witsie')).toBeVisible();
    expect(
      screen.getByText('9 accepted influence from 4 contributors'),
    ).toBeVisible();
    expect(screen.getByText('2 / 5')).toBeVisible();
    expect(screen.getByText('blue_witsie took ownership')).toBeVisible();
    expect(controller.focusRegion).toHaveBeenCalledWith(
      expect.objectContaining({ id: ZONE_ID }),
    );
    expect(
      screen.queryByRole('button', { name: /contest/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the zone summary usable when one detail section fails', async () => {
    const user = userEvent.setup();
    const fetchMock = territoryFetch();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/standings')) {
        return Promise.resolve(jsonResponse({ message: 'Unavailable' }, 503));
      }
      return territoryFetch().getMockImplementation()!(input);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <Auth0Context.Provider value={authValue()}>
        <ExplorePage
          apiBaseUrl={API_BASE_URL}
          locationObservationProvider={vi.fn(() => vi.fn())}
          locationPermissionProvider={vi.fn().mockResolvedValue('denied')}
          mapFactory={vi.fn(async () => mapController())}
          mapboxAccessToken="pk.test-token"
        />
      </Auth0Context.Provider>,
    );

    await user.click(await screen.findByRole('button', { name: /Events —/ }));
    await user.click(screen.getByRole('button', { name: 'Territories' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Open East Campus, active, Owned by blue_witsie',
      }),
    );

    expect(await screen.findByText('East Campus')).toBeVisible();
    expect(
      screen.getByText('Current standings could not be refreshed.'),
    ).toBeVisible();
    expect(screen.getByText('blue_witsie took ownership')).toBeVisible();
  });
});
