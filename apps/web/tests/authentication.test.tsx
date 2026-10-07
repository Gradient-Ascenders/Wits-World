import 'fake-indexeddb/auto';
import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';
import { getSafeReturnTo, returnToWitsQuest } from '../src/auth/AuthProvider';
import { bindAuthenticatedPlayer } from '../src/auth/player-session-binding';
import { useApiAccessToken } from '../src/auth/useApiAccessToken';
import type {
  LocationObservationProvider,
  LocationPermissionProvider,
} from '../src/browser-location';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';
const playerAId = '6fe7dc26-cdea-4275-a2df-861724137cbc';
const playerBId = '5a78ce0d-d15f-4039-ac4a-3c59d1c591c2';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

vi.mock(
  '../src/components/exploration/map-provider',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../src/components/exploration/map-provider')
      >();

    return {
      ...actual,
      createMapboxMap: vi.fn(async () => ({
        onError: vi.fn(),
        onLoad: vi.fn(),
        remove: vi.fn(),
        setReportedLocation: vi.fn(),
        setPoints: vi.fn(),
      })),
    };
  },
);

function createAuthValue(
  overrides: Partial<Auth0ContextInterface> = {},
): Auth0ContextInterface {
  return {
    ...initialContext,
    isLoading: false,
    ...overrides,
  } as Auth0ContextInterface;
}

function renderRoute(
  path: string,
  authValue: Auth0ContextInterface,
  locationProviders: {
    observation?: LocationObservationProvider;
    permission?: LocationPermissionProvider;
  } = {},
) {
  window.history.replaceState({}, '', path);

  return render(routeTree(authValue, locationProviders));
}

function routeTree(
  authValue: Auth0ContextInterface,
  locationProviders: {
    observation?: LocationObservationProvider;
    permission?: LocationPermissionProvider;
  } = {},
) {
  return (
    <Auth0Context.Provider value={authValue}>
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          locationObservationProvider={locationProviders.observation}
          locationPermissionProvider={locationProviders.permission}
          mapboxAccessToken={mapboxAccessToken}
        />
      </Router>
    </Auth0Context.Provider>
  );
}

function mockCurrentPlayer(
  playerId = playerAId,
  playerName: string | null = 'test-player',
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.endsWith('/auth/me')) {
      return new Response(
        JSON.stringify({
          connectionStrategy: playerName === null ? 'google-oauth2' : 'auth0',
          playerName,
          playerNameSetupRequired: playerName === null,
          id: playerId,
          lifecycleStatus: 'active',
          requestId: 'authentication-test-request',
          role: 'player',
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ events: [], requestId: 'events-test-request' }),
      { status: 200 },
    );
  });
}

async function openAccountDisclosure(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('button', {
    name: /(?:^Account|, account) menu$/u,
  });
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

describe('player authentication', () => {
  it('keeps protected content hidden while authentication loads', () => {
    renderRoute('/explore', createAuthValue({ isLoading: true }));

    expect(screen.getByText('Restoring session…')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByText('Checking your sign-in status')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Explore' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Author' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Public' }),
    ).not.toBeInTheDocument();
  });

  it('does not flash signed-out or protected navigation on Home while Auth0 restores', async () => {
    renderRoute('/', createAuthValue({ isLoading: true }));

    expect(await screen.findByText('Restoring session…')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in to play' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Player' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Explore' }),
    ).not.toBeInTheDocument();
  });

  it('directs an unauthenticated player to Universal Login', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    renderRoute('/explore', createAuthValue({ loginWithRedirect }));

    await user.click(
      screen.getByRole('button', { name: 'Sign in to explore' }),
    );

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
    });
  });

  it('retains the expected player binding after silent restoration signs out', async () => {
    expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

    renderRoute('/explore', createAuthValue());

    expect(
      await screen.findByRole('button', { name: 'Sign in to explore' }),
    ).toBeVisible();
    expect(bindAuthenticatedPlayer(playerBId)).toBe('mismatched');
  });

  it('allows a deliberate account switch after silent restoration signs out', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

    renderRoute('/explore', createAuthValue({ loginWithRedirect }));

    await user.click(screen.getByRole('button', { name: 'Switch account' }));

    await vi.waitFor(() =>
      expect(loginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: '/explore' },
        authorizationParams: { prompt: 'login' },
      }),
    );
    expect(bindAuthenticatedPlayer(playerBId)).toBe('matched');
  });

  it('protects a direct challenge route and preserves it after sign-in', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    const challengePath =
      '/challenge-attempts/31000000-0000-4000-8000-000000000001';

    renderRoute(challengePath, createAuthValue({ loginWithRedirect }));

    expect(
      screen.getByRole('button', { name: 'Sign in to explore' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Sign in to explore' }),
    );

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: challengePath },
    });
  });

  it('protects the collection route and returns there after sign-in', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    renderRoute('/collection', createAuthValue({ loginWithRedirect }));

    await user.click(
      screen.getByRole('button', { name: 'Sign in to view your collection' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/collection' },
    });
  });

  it('protects the saved-decks route and returns there after sign-in', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    renderRoute('/collection/decks', createAuthValue({ loginWithRedirect }));

    await user.click(
      screen.getByRole('button', {
        name: 'Sign in to manage your saved decks',
      }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/collection/decks' },
    });
  });

  it('protects the progression profile route and returns there after sign-in', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    renderRoute('/profile', createAuthValue({ loginWithRedirect }));

    await user.click(
      screen.getByRole('button', {
        name: 'Sign in to view your progression profile',
      }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/profile' },
    });
  });

  it('shows a safe recoverable message for an authentication error', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    renderRoute(
      '/explore',
      createAuthValue({
        error: new Error('provider-detail-that-must-not-be-shown'),
        loginWithRedirect,
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not complete sign-in',
    );
    expect(
      screen.queryByText('provider-detail-that-must-not-be-shown'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try sign-in again' }));
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
    });
  });

  it('shows a recoverable authentication error on a public route', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    renderRoute(
      '/',
      createAuthValue({
        error: new Error('provider-detail-that-must-not-be-shown'),
        loginWithRedirect,
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in is unavailable right now.',
    );
    expect(
      screen.queryByText('provider-detail-that-must-not-be-shown'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try sign-in again' }));
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
    });
  });

  it.each([
    { emailClaims: { email_verified: true }, label: 'email_verified: true' },
    { emailClaims: { email_verified: false }, label: 'email_verified: false' },
    { emailClaims: {}, label: 'no email_verified claim' },
  ])(
    'renders the protected route for an authenticated player with $label',
    async ({ emailClaims }) => {
      const user = userEvent.setup();
      mockCurrentPlayer();
      expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

      renderRoute(
        '/explore',
        createAuthValue({
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
          user: { name: 'Kevin', sub: 'auth0|player', ...emailClaims },
        }),
      );

      expect(
        await screen.findByRole(
          'heading',
          {
            level: 1,
            name: 'Explore the campus map',
          },
          { timeout: 5_000 },
        ),
      ).toBeVisible();
      await openAccountDisclosure(user);
      expect(
        screen
          .getByText('test-player', {
            selector: '.account-control__identity strong',
          })
          .closest('.account-control__identity'),
      ).toHaveTextContent('Signed in as test-player');
      expect(screen.queryByText('Kevin')).not.toBeInTheDocument();
    },
  );

  it('renders the authoritative player name instead of Auth0 name or email', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer(playerAId, 'naledi-star');

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        user: {
          email: 'player@example.test',
          name: 'player@example.test',
          sub: 'auth0|player',
        },
      }),
    );

    await openAccountDisclosure(user);
    expect(
      screen
        .getByText('naledi-star', {
          selector: '.account-control__identity strong',
        })
        .closest('.account-control__identity'),
    ).toHaveTextContent('Signed in as naledi-star');
    expect(screen.queryByText('player@example.test')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /player name/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Signed in as naledi-star' }),
    ).not.toBeInTheDocument();
    const playerNavigations = screen.getAllByRole('navigation', {
      name: 'Player',
    });
    for (const playerNavigation of playerNavigations) {
      expect(
        within(playerNavigation)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Explore', 'Collection', 'Battles', 'Leaderboard']);
      for (const link of within(playerNavigation).getAllByRole('link')) {
        expect(link.querySelector('.primary-navigation__icon')).toHaveAttribute(
          'aria-hidden',
          'true',
        );
      }
    }
    expect(screen.getAllByRole('link', { name: 'Explore' })[0]).toHaveAttribute(
      'href',
      '/explore',
    );
  });

  it('closes the account disclosure with Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer();

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    const trigger = await openAccountDisclosure(user);
    expect(screen.getByRole('link', { name: /Player profile/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();

    let escapeWasHandled = false;
    const observeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escapeWasHandled = event.defaultPrevented;
    };
    document.addEventListener('keydown', observeEscape);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', observeEscape);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /Player profile/ })).toBeNull();
    expect(trigger).toHaveFocus();
    expect(escapeWasHandled).toBe(true);
  });

  it('opens profile and account destinations from the disclosure without adding them to primary navigation', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer();

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await openAccountDisclosure(user);
    expect(
      screen.getByRole('link', {
        name: 'Player profile, Progress and achievements',
      }),
    ).toHaveAttribute('href', '/profile');
    await user.click(
      screen.getByRole('link', {
        name: 'Account settings, Security and account',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/account');
    for (const playerNavigation of screen.getAllByRole('navigation', {
      name: 'Player',
    })) {
      expect(
        within(playerNavigation).queryByRole('link', {
          name: 'Account settings',
        }),
      ).not.toBeInTheDocument();
      expect(
        within(playerNavigation).queryByRole('link', {
          name: 'Player profile',
        }),
      ).not.toBeInTheDocument();
    }
  });

  it.each([
    {
      activeLabel: 'Explore',
      path: '/challenge-attempts/31000000-0000-4000-8000-000000000001',
    },
    { activeLabel: 'Battles', path: '/matches/history' },
  ])(
    'keeps $activeLabel active on the grouped $path route',
    async ({ activeLabel, path }) => {
      mockCurrentPlayer();

      renderRoute(
        path,
        createAuthValue({
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
        }),
      );

      await screen.findByRole('button', { name: /account menu$/u });
      const activeLinks = screen.getAllByRole('link', { name: activeLabel });
      expect(activeLinks).toHaveLength(2);
      for (const activeLink of activeLinks) {
        expect(activeLink).toHaveAttribute('aria-current', 'page');
      }
    },
  );

  it('keeps Explore navigation available from Home for Player Name onboarding', async () => {
    mockCurrentPlayer(playerAId, null);

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    expect(
      (await screen.findAllByRole('link', { name: 'Explore' }))[0],
    ).toHaveAttribute('href', '/explore');
  });

  it('requires a Google player with no name to complete setup before gameplay', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer(playerAId, null);

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        user: {
          email: 'google-player@example.test',
          name: 'Google Profile Name',
          sub: 'google-oauth2|player',
        },
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Choose your Player Name' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus map' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('google-player@example.test'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Google Profile Name')).not.toBeInTheDocument();
    await openAccountDisclosure(user);
    expect(
      screen.getByRole('button', { name: 'Choose Player Name' }),
    ).toBeVisible();
  });

  it('does not mount live location before Player Name setup is complete', async () => {
    mockCurrentPlayer(playerAId, null);
    const locationObservationProvider: LocationObservationProvider = vi.fn(() =>
      vi.fn(),
    );

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
      {
        observation: locationObservationProvider,
        permission: vi.fn().mockResolvedValue('granted'),
      },
    );

    expect(
      await screen.findByRole('heading', { name: 'Choose your Player Name' }),
    ).toBeVisible();
    expect(locationObservationProvider).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus map' }),
    ).not.toBeInTheDocument();
  });

  it('lets an already-configured Google player bypass setup', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer(playerAId, 'configured-google');

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        user: {
          email: 'private-google@example.test',
          name: 'Google Profile Name',
          sub: 'google-oauth2|configured-player',
        },
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Explore the campus map' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveClass('main-content--explore');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await openAccountDisclosure(user);
    expect(
      screen.getByText('configured-google', {
        selector: '.account-control__identity strong',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Choose your Player Name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('private-google@example.test'),
    ).not.toBeInTheDocument();
  });

  it('preserves the Player Name input after validation and conflict errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            connectionStrategy: 'google-oauth2',
            id: playerAId,
            lifecycleStatus: 'active',
            playerName: null,
            playerNameSetupRequired: true,
            requestId: 'setup-required',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/auth/me/player-name')) {
        return new Response(
          JSON.stringify({
            code: 'PLAYER_NAME_CONFLICT',
            detail: 'That Player Name is already in use.',
          }),
          { status: 409 },
        );
      }

      return new Response('{}', { status: 200 });
    });
    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );
    const input = await screen.findByRole('textbox', { name: 'Player Name' });

    await user.type(input, 'ab');
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));
    expect(screen.getByRole('alert')).toHaveTextContent('3–20 characters');
    expect(input).toHaveValue('ab');

    await user.clear(input);
    await user.type(input, 'bob@example.com');
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'cannot be in email or phone number format',
    );
    expect(input).toHaveValue('bob@example.com');

    await user.clear(input);
    await user.type(input, 'Reserved_Name');
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already in use',
    );
    expect(input).toHaveValue('Reserved_Name');
  });

  it('updates the current player and resumes the intended route after setup', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            connectionStrategy: 'google-oauth2',
            id: playerAId,
            lifecycleStatus: 'active',
            playerName: null,
            playerNameSetupRequired: true,
            requestId: 'setup-required',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/auth/me/player-name')) {
        expect(init?.method).toBe('PUT');
        expect(JSON.parse(String(init?.body))).toEqual({
          playerName: 'new_google_player',
        });
        return new Response(
          JSON.stringify({
            connectionStrategy: 'google-oauth2',
            id: playerAId,
            lifecycleStatus: 'active',
            playerName: 'new_google_player',
            playerNameSetupRequired: false,
            requestId: 'setup-complete',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({ events: [], requestId: 'events-after-setup' }),
        { status: 200 },
      );
    });
    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'New_Google_Player',
    );
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));

    expect(
      await screen.findByRole('heading', { name: 'Explore the campus map' }),
    ).toBeVisible();
    await openAccountDisclosure(user);
    expect(
      screen.getByText('new_google_player', {
        selector: '.account-control__identity strong',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Player Name' }),
    ).not.toBeInTheDocument();
  });

  it('reloads the current player when another tab already completed setup', async () => {
    const user = userEvent.setup();
    let currentPlayerRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        currentPlayerRequests += 1;
        const setupRequired = currentPlayerRequests === 1;

        return new Response(
          JSON.stringify({
            connectionStrategy: 'google-oauth2',
            id: playerAId,
            lifecycleStatus: 'active',
            playerName: setupRequired ? null : 'chosen-in-another-tab',
            playerNameSetupRequired: setupRequired,
            requestId: setupRequired ? 'setup-required' : 'setup-reloaded',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/auth/me/player-name')) {
        return new Response(
          JSON.stringify({
            code: 'PLAYER_NAME_ALREADY_ASSIGNED',
            detail: 'Player Name is already assigned.',
          }),
          { status: 409 },
        );
      }

      return new Response(
        JSON.stringify({ events: [], requestId: 'events-after-reload' }),
        { status: 200 },
      );
    });
    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'stale-choice',
    );
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));

    expect(
      await screen.findByRole('heading', { name: 'Explore the campus map' }),
    ).toBeVisible();
    await openAccountDisclosure(user);
    expect(
      screen.getByText('chosen-in-another-tab', {
        selector: '.account-control__identity strong',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Player Name' }),
    ).not.toBeInTheDocument();
    expect(currentPlayerRequests).toBe(2);
  });

  it('does not apply a completed setup response after auth becomes anonymous', async () => {
    const user = userEvent.setup();
    let completeSave!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            connectionStrategy: 'google-oauth2',
            id: playerAId,
            lifecycleStatus: 'active',
            playerName: null,
            playerNameSetupRequired: true,
            requestId: 'setup-required',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      return new Promise<Response>((resolve) => {
        completeSave = resolve;
      });
    });
    const authenticated = createAuthValue({
      getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
      isAuthenticated: true,
    });
    const view = renderRoute('/explore', authenticated);

    await user.type(
      await screen.findByRole('textbox', { name: 'Player Name' }),
      'stale-player',
    );
    await user.click(screen.getByRole('button', { name: 'Enter Wits World' }));
    view.rerender(routeTree(createAuthValue()));
    completeSave(
      new Response(
        JSON.stringify({
          connectionStrategy: 'google-oauth2',
          id: playerAId,
          lifecycleStatus: 'active',
          playerName: 'stale-player',
          playerNameSetupRequired: false,
          requestId: 'late-save',
          role: 'player',
        }),
        { status: 200 },
      ),
    );

    expect(
      await screen.findByRole('button', { name: 'Sign in to explore' }),
    ).toBeVisible();
    expect(screen.queryByText('stale-player')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'honours continue=%s after warning about failed offline cleanup during sign-out',
    async (proceed) => {
      const user = userEvent.setup();
      const logout = vi.fn().mockResolvedValue(undefined);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(proceed);
      mockCurrentPlayer();
      expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');
      renderRoute(
        '/explore',
        createAuthValue({
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
          logout,
        }),
      );
      await openAccountDisclosure(user);
      vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'InvalidStateError');
      });
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      await vi.waitFor(() =>
        expect(confirm).toHaveBeenCalledWith(
          expect.stringContaining('Continue to sign out anyway?'),
        ),
      );
      if (proceed) await vi.waitFor(() => expect(logout).toHaveBeenCalled());
      else expect(logout).not.toHaveBeenCalled();
      expect(
        window.localStorage.getItem('wits-world.authenticated-player-id'),
      ).toBe(proceed ? null : playerAId);
    },
  );

  it('signs out from Player Name setup without showing profile identity', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    mockCurrentPlayer(playerAId, null);
    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout,
      }),
    );

    await openAccountDisclosure(user);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      }),
    );
  });

  it('signs out through Auth0 and returns to the public origin', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    mockCurrentPlayer();
    expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout,
        user: { name: 'Kevin', sub: 'auth0|player' },
      }),
    );

    await openAccountDisclosure(user);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      }),
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps account controls and product navigation hidden while the player restores', () => {
    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn(
          () => new Promise<never>(() => undefined),
        ),
        isAuthenticated: true,
        logout: vi.fn().mockResolvedValue(undefined),
        user: { name: 'Unconfirmed account', sub: 'auth0|unconfirmed' },
      }),
    );

    expect(screen.getByText('Confirming your Wits World player')).toBeVisible();
    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Restoring session…')).toHaveAttribute(
      'role',
      'status',
    );
    expect(
      screen.queryByRole('navigation', { name: 'Player' }),
    ).not.toBeInTheDocument();
  });

  it('keeps logout available when restored API authorization fails', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockRejectedValue(new Error('expired')),
        isAuthenticated: true,
        logout,
        user: { name: 'Unconfirmed account', sub: 'auth0|unconfirmed' },
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Your player session could not be restored',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus map' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    await openAccountDisclosure(user);
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut).toBeVisible();

    await user.click(signOut);
    await vi.waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      }),
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps logout available when current-player restoration is unavailable', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('unavailable', { status: 503 }),
    );

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout,
        user: { name: 'Unconfirmed account', sub: 'auth0|unconfirmed' },
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Your player session could not be restored',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    await openAccountDisclosure(user);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('identifies a current-player identity conflict and offers sign-out', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'PLAYER_NAME_CONFLICT',
          detail: 'Safe conflict detail.',
          requestId: 'identity-conflict-request',
          status: 409,
          title: 'Player name conflict',
          type: 'https://wits.world/problems/player_name_conflict',
        }),
        { status: 409 },
      ),
    );

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout,
      }),
    );

    expect(
      await screen.findByText(/Player Name is already linked/),
    ).toBeVisible();
    expect(
      document.querySelector('.main-content--explore'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Hide header for more map space' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      }),
    );
  });

  it('does not repeat a failed restore when Auth0 callback identities change', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unavailable', { status: 503 }));
    const view = renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout: vi.fn().mockResolvedValue(undefined),
      }),
    );

    expect(
      await screen.findByText(
        'We could not load your player account. Check your connection and try again.',
      ),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();

    view.rerender(
      routeTree(
        createAuthValue({
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
          logout: vi.fn().mockResolvedValue(undefined),
        }),
      ),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('signs out instead of substituting a different restored player', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    mockCurrentPlayer(playerBId);
    expect(bindAuthenticatedPlayer(playerAId)).toBe('matched');

    renderRoute(
      '/explore',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
        logout,
        user: { name: 'Different account', sub: 'auth0|different' },
      }),
    );

    expect(
      await screen.findByText(/did not match the Wits World player/),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus map' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Signed in as')).not.toBeInTheDocument();
    await openAccountDisclosure(user);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await vi.waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      }),
    );
  });

  it('exposes access-token retrieval without rendering or storing the token', async () => {
    const getAccessTokenSilently = vi
      .fn()
      .mockResolvedValue('private-access-token');
    const authValue = createAuthValue({ getAccessTokenSilently });

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <Auth0Context.Provider value={authValue}>
          {children}
        </Auth0Context.Provider>
      );
    }

    const { result } = renderHook(() => useApiAccessToken(), {
      wrapper: Wrapper,
    });

    await expect(result.current()).resolves.toBe('private-access-token');
    expect(getAccessTokenSilently).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent('private-access-token');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('allows only internal post-login return paths', () => {
    expect(getSafeReturnTo({ returnTo: '/explore?event=demo' })).toBe(
      '/explore?event=demo',
    );
    expect(getSafeReturnTo({ returnTo: '//malicious.example' })).toBe('/');
    expect(getSafeReturnTo({ returnTo: '/\\malicious.example' })).toBe('/');
    expect(getSafeReturnTo({ returnTo: 'https://malicious.example' })).toBe(
      '/',
    );
    expect(getSafeReturnTo()).toBe('/');
  });

  it('restores the validated route after the Auth0 callback', () => {
    const routeChange = vi.fn();
    window.addEventListener('popstate', routeChange);

    returnToWitsQuest({ returnTo: '/decks?view=active#saved' });

    expect(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    ).toBe('/decks?view=active#saved');
    expect(routeChange).toHaveBeenCalledOnce();
    window.removeEventListener('popstate', routeChange);
  });
});
