import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserLocationError,
  type LocationClaim,
  type LocationClaimProvider,
  type LocationObservationHandlers,
  type LocationObservationProvider,
} from '../src/browser-location';
import type {
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';
import ExplorePage from '../src/pages/ExplorePage';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';
const event = {
  availability: 'active',
  description: 'A concise authored Great Hall quest.',
  endsAt: '2026-08-26T00:00:00.000+02:00',
  eventId: '00000000-0000-4000-8000-000000000018',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000+02:00',
  title: 'Great Hall Quest',
} as const;
const claim: LocationClaim = {
  accuracyMetres: 12,
  acquiredAt: '2026-08-23T10:30:00.000Z',
  latitude: -26.19205,
  longitude: 28.03038,
};

function createAuthValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
}

function createMapController(): MapController {
  return {
    focusPoint: vi.fn(() => true),
    onError: vi.fn(),
    onLoad(listener) {
      listener();
    },
    recenterReportedLocation: vi.fn(() => true),
    remove: vi.fn(),
    setFollowStateListener: vi.fn(),
    setPointSelectionListener: vi.fn(),
    setReportedLocation: vi.fn(),
    setPoints: vi.fn(),
    setSelectedPoint: vi.fn(),
  };
}

function createObservationHarness() {
  let handlers: LocationObservationHandlers | null = null;
  let active = false;
  const stop = vi.fn(() => {
    active = false;
  });
  const provider: LocationObservationProvider = vi.fn((nextHandlers) => {
    handlers = nextHandlers;
    active = true;
    return stop;
  });

  return {
    emit(nextClaim: LocationClaim) {
      if (active) {
        handlers?.onLocation(nextClaim);
      }
    },
    error(failure: BrowserLocationError['failure']) {
      if (active) {
        handlers?.onError(new BrowserLocationError(failure));
      }
    },
    provider,
    stop,
  };
}

interface RenderExploreOptions {
  locationClaimProvider?: LocationClaimProvider;
  mapController?: MapController;
  observation?: ReturnType<typeof createObservationHarness>;
  onChallengeStarted?: (attemptId: string) => void;
  permission?: 'denied' | 'granted' | 'prompt' | 'unknown';
  strict?: boolean;
}

function renderExplore({
  locationClaimProvider,
  mapController = createMapController(),
  observation = createObservationHarness(),
  onChallengeStarted = vi.fn(),
  permission = 'prompt',
  strict = false,
}: RenderExploreOptions = {}) {
  const mapFactory: MapFactory = vi.fn(async () => mapController);
  const page = (
    <Auth0Context.Provider value={createAuthValue()}>
      <ExplorePage
        apiBaseUrl={apiBaseUrl}
        locationClaimProvider={locationClaimProvider}
        locationObservationProvider={observation.provider}
        locationPermissionProvider={vi.fn().mockResolvedValue(permission)}
        mapFactory={mapFactory}
        mapboxAccessToken={mapboxAccessToken}
        onChallengeStarted={onChallengeStarted}
      />
    </Auth0Context.Provider>
  );

  return {
    ...render(strict ? <StrictMode>{page}</StrictMode> : page),
    mapController,
    mapFactory,
    observation,
  };
}

function discoveryResponse(): Response {
  return new Response(
    JSON.stringify({ events: [event], requestId: 'request-discovery' }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
  );
}

function eligibilityResponse(status: 'reachable' | 'unreachable'): Response {
  return new Response(
    JSON.stringify({
      eventId: event.eventId,
      reachable: status === 'reachable',
      requestId: 'request-eligibility',
      status,
    }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 },
  );
}

async function selectEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Events/ }));
  await user.click(screen.getByRole('button', { name: /View on map/i }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('live reported-location permission and lifecycle', () => {
  it('waits for a player gesture when permission is prompt or unknown', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(discoveryResponse())),
    );
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'prompt' });

    const enable = await screen.findByRole('button', {
      name: 'Enable live location',
    });
    expect(observation.provider).not.toHaveBeenCalled();
    await user.click(enable);
    expect(observation.provider).toHaveBeenCalledOnce();
  });

  it('starts once when granted, updates the marker, and cleans up on unmount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryResponse()));
    const observation = createObservationHarness();
    const mapController = createMapController();
    const view = renderExplore({
      mapController,
      observation,
      permission: 'granted',
    });

    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await waitFor(() =>
      expect(mapController.setReportedLocation).toHaveBeenCalledWith({
        latitude: claim.latitude,
        longitude: claim.longitude,
      }),
    );
    view.unmount();
    expect(observation.stop).toHaveBeenCalledOnce();
  });

  it('does not leave duplicate watchers after Strict Mode remounting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryResponse()));
    const observation = createObservationHarness();
    const view = renderExplore({
      observation,
      permission: 'granted',
      strict: true,
    });

    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    expect(observation.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(observation.stop).toHaveBeenCalledOnce();
  });

  it('pauses while hidden and restarts one watcher when visible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(discoveryResponse())),
    );
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(observation.stop).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(observation.provider).toHaveBeenCalledTimes(2);
  });

  it('keeps discovery available for denied, timeout, and unavailable states', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(discoveryResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const denied = createObservationHarness();
    const view = renderExplore({ observation: denied, permission: 'denied' });
    expect(
      await screen.findByRole('button', { name: 'Location access disabled' }),
    ).toBeDisabled();
    expect(denied.provider).not.toHaveBeenCalled();
    await selectEvent(user);
    expect(fetchMock).toHaveBeenCalledOnce();

    view.unmount();
    const timeout = createObservationHarness();
    const timeoutView = renderExplore({
      observation: timeout,
      permission: 'granted',
    });
    await waitFor(() => expect(timeout.provider).toHaveBeenCalledOnce());
    act(() => timeout.error('timeout'));
    expect(
      screen.getByRole('button', { name: 'Retry live location' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    expect(screen.getByText(event.title)).toBeVisible();

    timeoutView.unmount();
    const unavailable = createObservationHarness();
    renderExplore({ observation: unavailable, permission: 'granted' });
    await waitFor(() => expect(unavailable.provider).toHaveBeenCalledOnce());
    act(() => unavailable.error('unavailable'));
    expect(
      screen.getByText('Check device location services and retry.'),
    ).toBeVisible();
  });
});

describe('selected-event authoritative eligibility', () => {
  it.each(['reachable', 'unreachable'] as const)(
    'renders only the API %s result after selection',
    async (status) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(eligibilityResponse(status));
      vi.stubGlobal('fetch', fetchMock);
      const observation = createObservationHarness();
      renderExplore({ observation, permission: 'granted' });
      await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
      act(() => observation.emit(claim));
      await selectEvent(user);

      expect(
        await screen.findByText(
          status === 'reachable' ? 'In range' : 'Out of range',
        ),
      ).toBeVisible();
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${apiBaseUrl}/events/${event.eventId}/eligibility`,
        expect.objectContaining({
          body: JSON.stringify(claim),
          method: 'POST',
        }),
      );
    },
  );

  it('communicates the API accuracy retry without drawing an accuracy circle', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              eventId: event.eventId,
              reachable: null,
              reason: 'location_accuracy',
              requestId: 'request-accuracy',
              status: 'retry',
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        ),
    );
    const observation = createObservationHarness();
    const mapController = createMapController();
    renderExplore({ mapController, observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);

    expect(
      await screen.findByText('Location accuracy is too low.'),
    ).toBeVisible();
    expect(
      screen.getByText('Waiting for a better reported-location reading…'),
    ).toBeVisible();
    expect(mapController.setReportedLocation).toHaveBeenCalled();
  });

  it('communicates a too-fast journey as a neutral retry', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(discoveryResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              eventId: event.eventId,
              reachable: null,
              reason: 'journey_too_fast',
              requestId: 'request-journey',
              status: 'retry',
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        ),
    );
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);

    expect(
      await screen.findByText('Travel time needs another check.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'This event cannot be confirmed from recent reported-location activity yet. Wait briefly, then try again with a fresh reading.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /^Try again/ })).toBeEnabled();
  });

  it('forces an explicit eligibility retry without requiring movement', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(eligibilityResponse('reachable'));
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);

    expect(
      await screen.findByText('Range could not be checked.'),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: /^Try again/ }));

    expect(await screen.findByText('In range')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/eligibility`,
      expect.objectContaining({ body: JSON.stringify(claim), method: 'POST' }),
    );
  });

  it('uses the newest same-position claim for an explicit location retry', async () => {
    const initialClaim = freshClaim(-5_000);
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(eligibilityResponse('reachable'))
      .mockResolvedValueOnce(locationRetryRequiredResponse())
      .mockResolvedValueOnce(eligibilityResponse('reachable'));
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(initialClaim));
    await selectEvent(user);
    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );
    expect(
      await screen.findByText('Reported location needs refreshing.'),
    ).toBeVisible();

    const newerClaim = {
      ...initialClaim,
      acquiredAt: new Date().toISOString(),
    };
    act(() => observation.emit(newerClaim));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('button', { name: /^Try again/ }));
    expect(await screen.findByText('In range')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/eligibility`,
      expect.objectContaining({
        body: JSON.stringify(newerClaim),
        method: 'POST',
      }),
    );
  });

  it('coalesces meaningful updates and sends the newest claim after 15 seconds', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValue(eligibilityResponse('unreachable'));
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    vi.useFakeTimers();
    vi.setSystemTime(new Date());

    const moved = {
      ...claim,
      acquiredAt: '2026-08-23T10:30:05.000Z',
      latitude: claim.latitude + 0.0002,
    };
    const newest = {
      ...moved,
      acquiredAt: '2026-08-23T10:30:08.000Z',
      latitude: claim.latitude + 0.0003,
    };
    act(() => {
      observation.emit(moved);
      observation.emit(newest);
      vi.advanceTimersByTime(14_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/eligibility`,
      expect.objectContaining({ body: JSON.stringify(newest) }),
    );
  });

  it('updates the player marker for noisy readings without unlimited API calls', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValue(eligibilityResponse('reachable'));
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    const mapController = createMapController();
    renderExplore({ mapController, observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    act(() =>
      observation.emit({
        ...claim,
        acquiredAt: '2026-08-23T10:30:01.000Z',
        latitude: claim.latitude + 0.000001,
      }),
    );
    await waitFor(() =>
      expect(mapController.setReportedLocation).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: claim.latitude + 0.000001 }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps precise claims ephemeral and out of storage, URL, and logs', async () => {
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
        .mockResolvedValueOnce(eligibilityResponse('reachable')),
    );
    const observation = createObservationHarness();
    renderExplore({ observation, permission: 'granted' });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(claim));
    await selectEvent(user);
    await screen.findByText('In range');

    const persisted = [
      ...readStorage(window.localStorage),
      ...readStorage(window.sessionStorage),
      window.location.href,
      JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls)),
    ].join('\n');
    expect(persisted).not.toContain(String(claim.latitude));
    expect(persisted).not.toContain(String(claim.longitude));
    expect(persisted).not.toContain(claim.acquiredAt);
  });

  it('submits the latest claim through challenge start for a fresh server recheck', async () => {
    const user = userEvent.setup();
    const onChallengeStarted = vi.fn();
    const currentClaim = freshClaim();
    const locationClaimProvider = vi.fn<LocationClaimProvider>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(eligibilityResponse('reachable'))
      .mockResolvedValueOnce(challengeResponse());
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({
      observation,
      locationClaimProvider,
      onChallengeStarted,
      permission: 'granted',
    });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(currentClaim));
    await selectEvent(user);
    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/challenge-attempts`,
      expect.objectContaining({
        body: JSON.stringify(currentClaim),
        method: 'POST',
      }),
    );
    expect(locationClaimProvider).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onChallengeStarted).toHaveBeenCalledWith(
        '31000000-0000-4000-8000-000000000001',
      ),
    );
  });

  it('acquires a newer claim before challenge start when the watched claim is old', async () => {
    const user = userEvent.setup();
    const oldClaim = freshClaim(-180_000);
    const renewedClaim = freshClaim();
    const locationClaimProvider = vi
      .fn<LocationClaimProvider>()
      .mockResolvedValue(renewedClaim);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(eligibilityResponse('reachable'))
      .mockResolvedValueOnce(challengeResponse());
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({
      locationClaimProvider,
      observation,
      permission: 'granted',
    });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(oldClaim));
    await selectEvent(user);

    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );

    await waitFor(() => expect(locationClaimProvider).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${apiBaseUrl}/events/${event.eventId}/challenge-attempts`,
      expect.objectContaining({
        body: JSON.stringify(renewedClaim),
        method: 'POST',
      }),
    );
  });

  it('does not resubmit the same acquisition after a location retry response', async () => {
    const user = userEvent.setup();
    const initialClaim = freshClaim();
    const locationClaimProvider = vi
      .fn<LocationClaimProvider>()
      .mockResolvedValue(initialClaim);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(eligibilityResponse('reachable'))
      .mockResolvedValueOnce(locationRetryRequiredResponse());
    vi.stubGlobal('fetch', fetchMock);
    const observation = createObservationHarness();
    renderExplore({
      locationClaimProvider,
      observation,
      permission: 'granted',
    });
    await waitFor(() => expect(observation.provider).toHaveBeenCalledOnce());
    act(() => observation.emit(initialClaim));
    await selectEvent(user);
    await user.click(
      await screen.findByRole('button', {
        name: `Start challenge for ${event.title}`,
      }),
    );
    expect(
      await screen.findByText('Reported location needs refreshing.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^Try again/ }));
    await waitFor(() => expect(locationClaimProvider).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      await screen.findByText('Reported location needs refreshing.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^Try again/ }));
    await waitFor(() => expect(locationClaimProvider).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function freshClaim(offsetMilliseconds = 0): LocationClaim {
  return {
    ...claim,
    acquiredAt: new Date(Date.now() + offsetMilliseconds).toISOString(),
  };
}

function readStorage(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index) ?? '';
    return `${key}:${storage.getItem(key) ?? ''}`;
  });
}

function challengeResponse(): Response {
  return new Response(
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
          text: `Choice ${choiceIndex}`,
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
  );
}

function locationRetryRequiredResponse(): Response {
  return new Response(
    JSON.stringify({
      code: 'LOCATION_RETRY_REQUIRED',
      detail: 'A fresher reported location is required.',
      requestId: 'request-location-retry',
      status: 400,
      title: 'Location retry required',
    }),
    { headers: { 'Content-Type': 'application/problem+json' }, status: 400 },
  );
}
