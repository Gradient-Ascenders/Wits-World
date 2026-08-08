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
import { BrowserLocationError } from '../src/browser-location';
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
const claim = {
  accuracyMetres: 12,
  acquiredAt: '2026-08-08T10:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
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

function renderExplore(
  mapFactory: MapFactory,
  authValue = createAuthValue(),
  locationClaimProvider = vi.fn().mockResolvedValue(claim),
) {
  return render(
    <Auth0Context.Provider value={authValue}>
      <ExplorePage
        apiBaseUrl={apiBaseUrl}
        locationClaimProvider={locationClaimProvider}
        mapFactory={mapFactory}
      />
    </Auth0Context.Provider>,
  );
}

function discoveryResponse(requestId = 'request-page-discovery'): Response {
  return new Response(JSON.stringify({ events: [event], requestId }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function eligibilityResponse(payload: object): Response {
  return new Response(
    JSON.stringify({
      eventId: event.eventId,
      requestId: 'request-page-eligibility',
      ...payload,
    }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
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

describe('player location eligibility', () => {
  it.each([
    [
      { reachable: true, status: 'reachable' },
      'This event is reachable from your reported location.',
    ],
    [
      { reachable: false, status: 'unreachable' },
      'This event is not reachable from your reported location.',
    ],
  ] as const)(
    'requests location only after an action and presents %s in text',
    async (apiResult, expectedMessage) => {
      const user = userEvent.setup();
      const locationClaimProvider = vi.fn().mockResolvedValue(claim);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(eligibilityResponse(apiResult));
      vi.stubGlobal('fetch', fetchMock);

      renderExplore(
        createMapFactory(),
        createAuthValue(),
        locationClaimProvider,
      );

      const action = await screen.findByRole('button', {
        name: 'Check reachability',
      });
      expect(locationClaimProvider).not.toHaveBeenCalled();

      await user.click(action);

      expect(await screen.findByText(expectedMessage)).toBeVisible();
      expect(locationClaimProvider).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${apiBaseUrl}/events/${event.eventId}/eligibility`,
        expect.objectContaining({
          body: JSON.stringify(claim),
          method: 'POST',
        }),
      );
    },
  );

  it('explains permission denial without calling the eligibility API', async () => {
    const user = userEvent.setup();
    const locationClaimProvider = vi
      .fn()
      .mockRejectedValue(new BrowserLocationError('denied'));
    const fetchMock = vi.fn().mockResolvedValue(discoveryResponse());
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(createMapFactory(), createAuthValue(), locationClaimProvider);
    await user.click(
      await screen.findByRole('button', { name: 'Check reachability' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied.',
    );
    expect(
      screen.getByText(/still browse events without sharing your location/i),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('offers a fresh retry after a geolocation timeout', async () => {
    const user = userEvent.setup();
    const locationClaimProvider = vi
      .fn()
      .mockRejectedValueOnce(new BrowserLocationError('timeout'))
      .mockResolvedValueOnce(claim);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        eligibilityResponse({ reachable: true, status: 'reachable' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(createMapFactory(), createAuthValue(), locationClaimProvider);
    await user.click(
      await screen.findByRole('button', { name: 'Check reachability' }),
    );

    expect(
      await screen.findByText('Getting your location took too long.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Check again' }));

    expect(
      await screen.findByText(
        'This event is reachable from your reported location.',
      ),
    ).toBeVisible();
    expect(locationClaimProvider).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      {
        reachable: null,
        reason: 'location_accuracy',
        status: 'retry',
      },
      'Your location is too uncertain to decide reachability.',
    ],
    [
      { reachable: null, reason: 'stale_location', status: 'retry' },
      'That location reading could not be used.',
    ],
    [
      { reachable: false, reason: 'ended', status: 'unavailable' },
      'This event is not available right now.',
    ],
  ] as const)(
    'presents the API retry state %s safely',
    async (result, message) => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(discoveryResponse())
          .mockResolvedValueOnce(eligibilityResponse(result)),
      );

      renderExplore(createMapFactory());
      await user.click(
        await screen.findByRole('button', { name: 'Check reachability' }),
      );

      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    },
  );

  it('shows a safe API failure and retry action', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(
          new Response('private upstream detail', { status: 503 }),
        ),
    );

    renderExplore(createMapFactory());
    await user.click(
      await screen.findByRole('button', { name: 'Check reachability' }),
    );

    expect(
      await screen.findByText('Reachability could not be checked.'),
    ).toBeVisible();
    expect(
      screen.queryByText('private upstream detail'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
  });

  it('aborts an eligibility request when the page unmounts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    const view = renderExplore(createMapFactory());
    await user.click(
      await screen.findByRole('button', { name: 'Check reachability' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const signal = fetchMock.mock.calls[1]?.[1]?.signal;

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});
