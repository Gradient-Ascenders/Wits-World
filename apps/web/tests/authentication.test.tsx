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

function renderRoute(path: string, authValue: Auth0ContextInterface) {
  window.history.replaceState({}, '', path);

  return render(routeTree(authValue));
}

function routeTree(authValue: Auth0ContextInterface) {
  return (
    <Auth0Context.Provider value={authValue}>
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
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

    await user.click(
      screen.getByRole('button', { name: 'Use a different account' }),
    );

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/explore' },
      authorizationParams: { prompt: 'login' },
    });
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

    renderRoute('/decks', createAuthValue({ loginWithRedirect }));

    await user.click(
      screen.getByRole('button', {
        name: 'Sign in to manage your saved decks',
      }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/decks' },
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
      expect(
        screen.getByText('test-player').closest('.account-control__identity'),
      ).toHaveTextContent('Signed in as test-player');
      expect(screen.queryByText('Kevin')).not.toBeInTheDocument();
    },
  );

  it('renders the authoritative player name instead of Auth0 name or email', async () => {
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

    expect(
      (await screen.findByText('naledi-star')).closest(
        '.account-control__identity',
      ),
    ).toHaveTextContent('Signed in as naledi-star');
    expect(screen.queryByText('player@example.test')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /player name/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Signed in as naledi-star' }),
    ).not.toBeInTheDocument();
    const playerNavigation = screen.getByRole('navigation', {
      name: 'Player',
    });
    expect(
      within(playerNavigation)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Explore', 'Collection', 'Decks', 'Battles']);
    expect(
      within(screen.getByRole('main')).getByRole('link', {
        name: 'Explore campus',
      }),
    ).toHaveAttribute('href', '/explore');
  });

  it('keeps Player Name onboarding on the protected Explore path from Home', async () => {
    mockCurrentPlayer(playerAId, null);

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    expect(
      await within(screen.getByRole('main')).findByRole('link', {
        name: 'Choose Player Name',
      }),
    ).toHaveAttribute('href', '/explore');
  });

  it('requires a Google player with no name to complete setup before gameplay', async () => {
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
    expect(
      screen.getByRole('button', { name: 'Choose Player Name' }),
    ).toBeVisible();
  });

  it('lets an already-configured Google player bypass setup', async () => {
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
    expect(screen.getByText('configured-google')).toBeVisible();
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
    expect(screen.getByText('new_google_player')).toBeVisible();
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
    expect(screen.getByText('chosen-in-another-tab')).toBeVisible();
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

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
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

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
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

    expect(
      screen.getByRole('heading', {
        name: 'Confirming your Wits World player',
      }),
    ).toBeVisible();
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
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut).toBeVisible();

    await user.click(signOut);
    expect(logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps logout available when current-player restoration is unavailable', async () => {
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
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('signs out instead of substituting a different restored player', async () => {
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
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
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
