import 'fake-indexeddb/auto';
import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineProvider } from '../src/offline/OfflineProvider';
import ExplorePage from '../src/pages/ExplorePage';
import {
  clearOfflineData,
  readOfflineState,
  replacePacks,
  saveOfflineCatalogue,
  saveOfflineSession,
  type CachedPack,
} from '../src/offline/store';
import {
  BrowserLocationError,
  type LocationClaim,
  type LocationObservationHandlers,
} from '../src/browser-location';

const token = vi.hoisted(() => vi.fn(async () => 'token'));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => token,
}));
vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: () => ({
    state: { status: 'ready', player: { id: 'player', playerName: 'Ari' } },
    reload: vi.fn(),
  }),
}));

let cached: CachedPack;
let online: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await clearOfflineData();
  localStorage.setItem('wits-world.authenticated-player-id', 'player');
  window.history.replaceState({}, '', '/explore?event=event');
  await saveOfflineSession('player', 'Ari');
  cached = {
    packToken: 'signed',
    pack: {
      version: 1,
      packId: 'pack',
      playerId: 'player',
      locationPolicy: 'arrival-v1',
      issuedAt: new Date(Date.now() - 10_000).toISOString(),
      validFrom: new Date(Date.now() - 10_000).toISOString(),
      validUntil: new Date(Date.now() + 3600_000).toISOString(),
      event: {
        eventId: 'event',
        version: 1,
        title: 'Great Hall visit',
        description: 'A campus challenge',
        latitude: -26.19205,
        longitude: 28.03038,
        radiusMetres: 75,
      },
      challengeId: 'challenge',
      challengeVersion: 1,
      format: 'multiple_choice',
      timeLimitSeconds: 90,
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `q${index}`,
        version: 1,
        difficulty: 1,
        prompt: `Question ${index}`,
        options: Array.from({ length: 4 }, (_, option) => ({
          id: `q${index}o${option}`,
          text: `Option ${option}`,
        })),
      })),
    },
  };
  await replacePacks('player', [cached]);
  await saveOfflineCatalogue('player', [
    {
      ...cached.pack.event,
      availability: 'active',
      startsAt: cached.pack.validFrom,
      endsAt: cached.pack.validUntil,
    },
  ]);
  online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function mount(
  claimProvider = vi.fn(async () => ({
    latitude: -26.19205,
    longitude: 28.03038,
    accuracyMetres: 10,
    acquiredAt: new Date().toISOString(),
  })),
  observation?: (handlers: LocationObservationHandlers) => () => void,
) {
  const auth = {
    ...initialContext,
    isAuthenticated: true,
    isLoading: false,
  } as Auth0ContextInterface;
  return render(
    <Auth0Context.Provider value={auth}>
      <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
        <ExplorePage
          apiBaseUrl="https://api.example.test/api/v1"
          mapboxAccessToken="fixture"
          locationClaimProvider={claimProvider}
          locationPermissionProvider={async () =>
            observation ? 'granted' : 'prompt'
          }
          locationObservationProvider={observation ?? (() => () => {})}
          mapFactory={async () => ({
            onLoad: (callback) => callback(),
            onError: () => {},
            setPoints: () => {},
            setReportedLocation: () => {},
            remove: () => {},
            focusPoint: () => true,
          })}
        />
      </OfflineProvider>
    </Auth0Context.Provider>,
  );
}
describe('one exploration journey', () => {
  it('explains the legacy finishing-location contract instead of promising the new indoor arrival window', async () => {
    delete cached.pack.locationPolicy;
    await replacePacks('player', [cached]);
    mount();
    await screen.findByText(/older download also needs a finishing location/);
    expect(
      screen.queryByText(/recorded arrival is valid for five minutes/),
    ).toBeNull();
  });

  it('opens a downloaded challenge from cached Explore without a redirect or preparation/check button', async () => {
    const location = vi.fn(async () => ({
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 10,
      acquiredAt: new Date().toISOString(),
    }));
    mount(location);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled();
    expect(
      screen.getByRole('group', { name: /Downloaded campus map/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Check my location' }),
    ).toBeNull();
    expect(window.location.pathname).toBe('/explore');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/offline-attempts\//),
    );
    expect((await readOfflineState()).attempts).toHaveLength(1);
    expect(location).toHaveBeenCalledOnce();
  });
  it('does not consume an attempt for distant or imprecise arrival', async () => {
    const location = vi.fn(async () => ({
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 300,
      acquiredAt: new Date().toISOString(),
    }));
    mount(location);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByText(/too imprecise/);
    expect((await readOfflineState()).attempts).toHaveLength(0);
    expect(window.location.pathname).toBe('/explore');
  });
  it('reuses recorded event arrival indoors and labels a failed live location honestly', async () => {
    let handlers!: LocationObservationHandlers;
    const location = vi.fn(async () => {
      throw new BrowserLocationError('timeout');
    });
    mount(location, (value) => {
      handlers = value;
      return () => {};
    });
    await screen.findByRole('button', { name: 'Play' });
    const arrival: LocationClaim = {
      latitude: -26.19205,
      longitude: 28.03038,
      accuracyMetres: 10,
      acquiredAt: new Date().toISOString(),
    };
    await act(async () => {
      handlers.onLocation(arrival);
    });
    await act(async () => {
      handlers.onError(new BrowserLocationError('unavailable'));
    });
    expect(screen.getAllByText('Last known location').length).toBeGreaterThan(
      0,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/offline-attempts\//),
    );
    expect(location).not.toHaveBeenCalled();
    expect((await readOfflineState()).attempts[0]?.startLocation).toEqual(
      arrival,
    );
  });
  it('preserves the selected event and search state on reconnect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith('/events')
                ? {
                    events: [
                      {
                        ...cached.pack.event,
                        availability: 'active',
                        startsAt: cached.pack.validFrom,
                        endsAt: cached.pack.validUntil,
                      },
                    ],
                    requestId: 'fixture',
                  }
                : { packs: [cached] },
            ),
            { status: 200 },
          ),
      ),
    );
    mount();
    await screen.findByRole('button', { name: 'Play' });
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeEnabled();
    expect(
      screen.getByRole('heading', { name: 'Great Hall visit' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/explore');
  });
});
