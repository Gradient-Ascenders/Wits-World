import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
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
  description: null,
  endsAt: '2026-08-26T00:00:00.000+02:00',
  eventId: '00000000-0000-4000-8000-000000000018',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000+02:00',
  title: 'Sprint 1 Demo - Wits Great Hall',
} as const;

function createAuthValue(
  getAccessTokenSilently = vi.fn().mockResolvedValue('access-token'),
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently,
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
}

function createMapFactory(): MapFactory {
  return vi.fn(async () => {
    const controller: MapController = {
      onError: vi.fn(),
      onLoad(listener) {
        listener();
      },
      remove: vi.fn(),
    };

    return controller;
  });
}

function renderExplore(mapFactory: MapFactory, authValue = createAuthValue()) {
  return render(
    <Auth0Context.Provider value={authValue}>
      <ExplorePage apiBaseUrl={apiBaseUrl} mapFactory={mapFactory} />
    </Auth0Context.Provider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated campus event discovery', () => {
  it('loads the seeded event into the map and text fallback', async () => {
    const mapFactory = createMapFactory();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ events: [event], requestId: 'request-page-1' }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        ),
    );

    renderExplore(mapFactory);

    expect(screen.getByText('Loading published events…')).toHaveAttribute(
      'role',
      'status',
    );
    expect(
      await screen.findByRole('heading', { name: event.title }),
    ).toBeVisible();
    expect(screen.getByText('Available now')).toBeVisible();

    await waitFor(() => {
      const latestCall = vi.mocked(mapFactory).mock.lastCall;
      expect(latestCall?.[1]).toEqual({
        center: [28.03038, -26.19205],
        styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
        zoom: 16,
      });
      expect(latestCall?.[2]).toEqual([
        {
          id: event.eventId,
          label: event.title,
          latitude: event.latitude,
          longitude: event.longitude,
        },
      ]);
    });
  });

  it('offers a retry after an API failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ events: [event], requestId: 'request-page-2' }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(createMapFactory());

    expect(
      await screen.findByText('Events are unavailable right now.'),
    ).toBeVisible();
    expect(
      screen.getByText('Check your connection and try again.'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try loading events again' }),
    );

    expect(
      await screen.findByRole('heading', { name: event.title }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the event request when the page unmounts', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const view = renderExplore(createMapFactory());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});
