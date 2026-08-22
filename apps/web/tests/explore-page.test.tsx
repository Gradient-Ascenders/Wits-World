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
const mapboxAccessToken = 'pk.test-token';
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

function createMapFactory(
  setPoints = vi.fn(),
  setReportedLocation = vi.fn(),
): MapFactory {
  return vi.fn(async () => {
    const controller: MapController = {
      onError: vi.fn(),
      onLoad(listener) {
        listener();
      },
      remove: vi.fn(),
      setReportedLocation,
      setPoints,
    };

    return controller;
  });
}

function renderExplore(
  mapFactory: MapFactory,
  authValue = createAuthValue(),
  locationClaimProvider = vi.fn().mockResolvedValue(claim),
  onChallengeStarted = vi.fn(),
) {
  return render(
    <Auth0Context.Provider value={authValue}>
      <ExplorePage
        apiBaseUrl={apiBaseUrl}
        locationClaimProvider={locationClaimProvider}
        mapFactory={mapFactory}
        mapboxAccessToken={mapboxAccessToken}
        onChallengeStarted={onChallengeStarted}
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('authenticated campus event discovery', () => {
  it('loads the seeded event into the map and text fallback', async () => {
    const setPoints = vi.fn();
    const mapFactory = createMapFactory(setPoints);
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
        accessToken: mapboxAccessToken,
        bearing: 20,
        center: [28.03038, -26.19205],
        pitch: 52,
        standardConfig: {
          lightPreset: 'dusk',
          show3dBuildings: true,
          show3dLandmarks: true,
          show3dObjects: true,
          show3dTrees: true,
          showPedestrianRoads: true,
        },
        styleUrl: 'mapbox://styles/mapbox/standard',
        zoom: 16.5,
      });
      expect(setPoints).toHaveBeenCalledWith([
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
      const setReportedLocation = vi.fn();
      const reportedLocation = {
        latitude: claim.latitude,
        longitude: claim.longitude,
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(eligibilityResponse(apiResult));
      vi.stubGlobal('fetch', fetchMock);

      renderExplore(
        createMapFactory(vi.fn(), setReportedLocation),
        createAuthValue(),
        locationClaimProvider,
      );

      const action = await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      });
      expect(locationClaimProvider).not.toHaveBeenCalled();
      expect(setReportedLocation).not.toHaveBeenCalledWith(reportedLocation);

      await user.click(action);

      expect(await screen.findByText(expectedMessage)).toBeVisible();
      expect(locationClaimProvider).toHaveBeenCalledOnce();
      expect(setReportedLocation).toHaveBeenCalledWith(reportedLocation);
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${apiBaseUrl}/events/${event.eventId}/eligibility`,
        expect.objectContaining({
          body: JSON.stringify(claim),
          method: 'POST',
        }),
      );
    },
  );

  it('keeps precise location claims out of browser storage and console output', async () => {
    const user = userEvent.setup();
    const consoleSpies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(
          eligibilityResponse({ reachable: true, status: 'reachable' }),
        ),
    );

    renderExplore(createMapFactory());
    await user.click(
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );

    expect(
      await screen.findByText(
        'This event is reachable from your reported location.',
      ),
    ).toBeVisible();

    const storageOutput = [
      ...readStorage(window.localStorage),
      ...readStorage(window.sessionStorage),
    ].join('\n');
    const consoleOutput = JSON.stringify(
      consoleSpies.flatMap((spy) => spy.mock.calls),
    );

    for (const sensitiveValue of [
      String(claim.latitude),
      String(claim.longitude),
      String(claim.accuracyMetres),
      claim.acquiredAt,
    ]) {
      expect(storageOutput).not.toContain(sensitiveValue);
      expect(consoleOutput).not.toContain(sensitiveValue);
    }
  });

  it('explains permission denial without calling the eligibility API', async () => {
    const user = userEvent.setup();
    const locationClaimProvider = vi
      .fn()
      .mockRejectedValue(new BrowserLocationError('denied'));
    const fetchMock = vi.fn().mockResolvedValue(discoveryResponse());
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(createMapFactory(), createAuthValue(), locationClaimProvider);
    await user.click(
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
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
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );

    expect(
      await screen.findByText('Getting your location took too long.'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: `Check again for ${event.title}`,
      }),
    );

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
        await screen.findByRole('button', {
          name: `Check reachability for ${event.title}`,
        }),
      );

      expect(await screen.findByText(message)).toBeVisible();
      expect(
        screen.getByRole('button', {
          name: `Check again for ${event.title}`,
        }),
      ).toBeEnabled();
    },
  );

  it('presents an event removed after discovery as unavailable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );

    renderExplore(createMapFactory());
    await user.click(
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );

    expect(
      await screen.findByText('This event is not available right now.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Its availability may have changed since the event list loaded.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Reachability could not be checked.'),
    ).not.toBeInTheDocument();
  });

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
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );

    expect(
      await screen.findByText('Reachability could not be checked.'),
    ).toBeVisible();
    expect(
      screen.queryByText('private upstream detail'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Check again for ${event.title}`,
      }),
    ).toBeEnabled();
  });

  it('starts a challenge only after the API reports the event reachable', async () => {
    const user = userEvent.setup();
    const locationClaimProvider = vi.fn().mockResolvedValue(claim);
    const onChallengeStarted = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        eligibilityResponse({ reachable: true, status: 'reachable' }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            answeredCount: 0,
            attemptId: '31000000-0000-4000-8000-000000000001',
            deadline: '2099-09-01T10:02:00.000Z',
            eventId: event.eventId,
            format: 'multiple_choice',
            questions: Array.from({ length: 5 }, (_, index) => ({
              answeredAt: null,
              attemptQuestionId: `32000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              choices: Array.from({ length: 4 }, (_, choiceIndex) => ({
                choiceId: `33000000-0000-4000-${String(index + 1).padStart(4, '0')}-${String(choiceIndex + 1).padStart(12, '0')}`,
                text: `Choice ${choiceIndex + 1}`,
              })),
              position: index + 1,
              prompt: `Question ${index + 1}`,
              selectedChoiceId: null,
            })),
            requestId: 'request-start',
            startedAt: '2099-09-01T10:00:00.000Z',
            status: 'in_progress',
            totalQuestions: 5,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(
      createMapFactory(),
      createAuthValue(),
      locationClaimProvider,
      onChallengeStarted,
    );

    await user.click(
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(locationClaimProvider).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/challenge-attempts`,
      expect.objectContaining({ body: JSON.stringify(claim), method: 'POST' }),
    );
    expect(onChallengeStarted).toHaveBeenCalledWith(
      '31000000-0000-4000-8000-000000000001',
    );
  });

  it('preserves a fresh-start reachability failure for the player', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        eligibilityResponse({ reachable: true, status: 'reachable' }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'EVENT_NOT_REACHABLE',
            detail: 'Safe test detail.',
            requestId: 'request-start-rejected',
            status: 403,
            title: 'Event not reachable',
            type: 'https://wits.world/problems/event-not-reachable',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 403 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderExplore(createMapFactory());
    await user.click(
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );

    expect(
      await screen.findByText(
        'This event is not reachable from your reported location.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('The challenge could not start.'),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      'a denied browser location',
      new BrowserLocationError('denied'),
      undefined,
      'Location permission was denied.',
    ],
    [
      'a timed-out browser location',
      new BrowserLocationError('timeout'),
      undefined,
      'Getting your location took too long.',
    ],
    [
      'an unavailable browser location',
      new BrowserLocationError('unavailable'),
      undefined,
      'Your browser could not provide a usable location.',
    ],
    [
      'an authentication failure',
      undefined,
      problemResponse('UNAUTHENTICATED', 401),
      'Your session could not check this event.',
    ],
    [
      'an unavailable event',
      undefined,
      problemResponse('CHALLENGE_UNAVAILABLE', 409),
      'This event is not available right now.',
    ],
    [
      'a stale location request',
      undefined,
      problemResponse('LOCATION_RETRY_REQUIRED', 409),
      'That location reading could not be used.',
    ],
    [
      'a network failure',
      undefined,
      new TypeError('network interrupted'),
      'The challenge could not start.',
    ],
  ] as const)(
    'preserves %s when starting a challenge',
    async (_name, locationError, startError, expectedTitle) => {
      const user = userEvent.setup();
      const locationClaimProvider = vi
        .fn()
        .mockResolvedValueOnce(claim)
        .mockImplementationOnce(() => {
          if (locationError !== undefined) {
            return Promise.reject(locationError);
          }

          return Promise.resolve(claim);
        });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(
          eligibilityResponse({ reachable: true, status: 'reachable' }),
        );

      if (startError instanceof Response) {
        fetchMock.mockResolvedValueOnce(startError);
      } else if (startError !== undefined) {
        fetchMock.mockRejectedValueOnce(startError);
      }

      vi.stubGlobal('fetch', fetchMock);
      renderExplore(
        createMapFactory(),
        createAuthValue(),
        locationClaimProvider,
      );

      await user.click(
        await screen.findByRole('button', {
          name: `Check reachability for ${event.title}`,
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: `Start challenge for ${event.title}`,
        }),
      );

      expect(await screen.findByText(expectedTitle)).toBeVisible();
      expect(
        screen.getByRole('button', {
          name: `Check again for ${event.title}`,
        }),
      ).toBeEnabled();
    },
  );

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
      await screen.findByRole('button', {
        name: `Check reachability for ${event.title}`,
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const signal = fetchMock.mock.calls[1]?.[1]?.signal;

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});

function readStorage(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index) ?? '';
    return `${key}:${storage.getItem(key) ?? ''}`;
  });
}

function problemResponse(code: string, status: number): Response {
  return new Response(
    JSON.stringify({
      code,
      detail: 'Safe test problem.',
      requestId: 'request-start-problem',
      status,
      title: 'Challenge start problem',
      type: 'https://wits.world/problems/challenge-start',
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  );
}
