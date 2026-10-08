import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';
import ExplorePage from '../src/pages/ExplorePage';

const apiBaseUrl = 'https://api.example.test/api/v1';
const event = {
  availability: 'active',
  description: 'A campus recovery event.',
  endsAt: '2099-09-01T00:00:00.000Z',
  eventId: '00000000-0000-4000-8000-000000000018',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000Z',
  title: 'Coverage Quest',
} as const;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function mapController(): MapController {
  return {
    focusPoint: vi.fn(() => true),
    onError: vi.fn(),
    onLoad: (listener) => listener(),
    recenterReportedLocation: vi.fn(() => true),
    remove: vi.fn(),
    setFollowStateListener: vi.fn(),
    setPointSelectionListener: vi.fn(),
    setReportedLocation: vi.fn(),
    setPoints: vi.fn(),
    setSelectedPoint: vi.fn(),
  };
}

function renderExplore() {
  const auth = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
  const mapFactory: MapFactory = vi.fn(async () => mapController());
  return render(
    <Auth0Context.Provider value={auth}>
      <ExplorePage
        apiBaseUrl={apiBaseUrl}
        locationPermissionProvider={vi.fn().mockResolvedValue('denied')}
        mapFactory={mapFactory}
        mapboxAccessToken="pk.test-token"
      />
    </Auth0Context.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Explore recovery boundaries', () => {
  it('recovers event discovery after an unavailable response and a user retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 'EVENT_DISCOVERY_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(json({ events: [event], requestId: 'events-ok' }));
    vi.stubGlobal('fetch', fetchMock);
    renderExplore();

    await user.click(await screen.findByRole('button', { name: /^Events/ }));
    expect(
      await screen.findByText('Check your connection and try again.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry events' }));

    expect(await screen.findByText(event.title)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the actual authorization recovery guidance and can retry the request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json({ code: 'EVENT_DISCOVERY_UNAVAILABLE' }, 401),
      )
      .mockImplementationOnce(() =>
        json({ events: [event], requestId: 'recovered' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderExplore();

    await user.click(await screen.findByRole('button', { name: /^Events/ }));
    expect(
      await screen.findByText(
        'Your session could not load events. Try again, or sign out and sign in again.',
      ),
    ).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Retry events' }),
    );
    expect(await screen.findByText(event.title)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
