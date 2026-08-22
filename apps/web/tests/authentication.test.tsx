import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';
import { getSafeReturnTo, returnToWitsQuest } from '../src/auth/AuthProvider';
import { bindAuthenticatedPlayer } from '../src/auth/player-session-binding';
import {
  CurrentPlayerProvider,
  useCurrentPlayer,
} from '../src/auth/CurrentPlayerProvider';
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

  return render(
    <Auth0Context.Provider value={authValue}>
      <Router>
        <AppRoutes
          apiBaseUrl={apiBaseUrl}
          mapboxAccessToken={mapboxAccessToken}
        />
      </Router>
    </Auth0Context.Provider>,
  );
}

function CurrentPlayerHarness({
  onUpdateStarted,
}: {
  onUpdateStarted: (update: Promise<unknown>) => void;
}) {
  const { reload, state, updateDisplayName } = useCurrentPlayer();
  const stateLabel =
    state.status === 'ready'
      ? `${state.player.id}:${state.player.displayName ?? 'unnamed'}`
      : state.status === 'error'
        ? `error:${state.failure}`
        : state.status;

  return (
    <>
      <output aria-label="Current player state">{stateLabel}</output>
      <button
        disabled={state.status !== 'ready'}
        onClick={() => {
          const update = updateDisplayName(
            'Updated Player',
            new AbortController().signal,
          );
          onUpdateStarted(update);
          void update.catch(() => undefined);
        }}
        type="button"
      >
        Start display-name save
      </button>
      <button onClick={reload} type="button">
        Reload current player
      </button>
    </>
  );
}

function currentPlayerHarnessTree(
  authValue: Auth0ContextInterface,
  onUpdateStarted: (update: Promise<unknown>) => void,
) {
  return (
    <Auth0Context.Provider value={authValue}>
      <CurrentPlayerProvider apiBaseUrl={apiBaseUrl}>
        <CurrentPlayerHarness onUpdateStarted={onUpdateStarted} />
      </CurrentPlayerProvider>
    </Auth0Context.Provider>
  );
}

function currentPlayerResponse(
  id: string,
  displayName: string | null,
  requestId: string,
) {
  return new Response(
    JSON.stringify({
      displayName,
      id,
      lifecycleStatus: 'active',
      requestId,
      role: 'player',
    }),
    { status: 200 },
  );
}

function mockCurrentPlayer(
  playerId = playerAId,
  initialDisplayName: string | null = null,
) {
  let displayName = initialDisplayName;

  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith('/auth/me/display-name')) {
        const body = JSON.parse(String(init?.body)) as { displayName: string };

        if (body.displayName.trim().length < 2) {
          return new Response(
            JSON.stringify({
              code: 'INVALID_DISPLAY_NAME',
              detail:
                'Display name must be at least 2 characters after trimming.',
            }),
            { status: 400 },
          );
        }

        displayName = body.displayName.trim();

        return new Response(
          JSON.stringify({
            displayName,
            id: playerId,
            lifecycleStatus: 'active',
            requestId: 'display-name-test-request',
            role: 'player',
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            displayName,
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

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your sign-in status',
    );
    expect(
      screen.queryByRole('heading', { name: 'Explore the campus' }),
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
      expect(screen.getByRole('button', { name: 'Signed in' })).toBeVisible();
      expect(screen.queryByText('Kevin')).not.toBeInTheDocument();
    },
  );

  it('renders the authoritative display name instead of Auth0 name or email', async () => {
    mockCurrentPlayer(playerAId, 'Naledi 星');

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
      await screen.findByRole('button', { name: 'Signed in as Naledi 星' }),
    ).toBeVisible();
    expect(screen.queryByText('player@example.test')).not.toBeInTheDocument();
  });

  it('uses a neutral account label when the local display name is absent', async () => {
    mockCurrentPlayer();

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
      await screen.findByRole('button', { name: 'Signed in' }),
    ).toBeVisible();
    expect(screen.queryByText('player@example.test')).not.toBeInTheDocument();
  });

  it('edits and immediately renders the authoritative saved display name', async () => {
    const user = userEvent.setup();
    const fetch = mockCurrentPlayer(playerAId, 'Naledi');

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Signed in as Naledi' }),
    );
    const input = screen.getByRole('textbox', { name: 'Display name' });
    expect(input).toHaveValue('Naledi');

    await user.clear(input);
    await user.type(input, '  Naledi Star  ');
    await user.click(screen.getByRole('button', { name: 'Save player name' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Display name saved.',
    );
    expect(
      screen.getByRole('button', { name: 'Signed in as Naledi Star' }),
    ).toBeVisible();
    expect(input).toHaveValue('Naledi Star');
    expect(fetch).toHaveBeenCalledWith(
      `${apiBaseUrl}/auth/me/display-name`,
      expect.objectContaining({
        body: JSON.stringify({ displayName: '  Naledi Star  ' }),
        method: 'PUT',
      }),
    );
  });

  it('shows validation accessibly and preserves invalid input', async () => {
    const user = userEvent.setup();
    mockCurrentPlayer(playerAId, 'Naledi');

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Signed in as Naledi' }),
    );
    const input = screen.getByRole('textbox', { name: 'Display name' });
    await user.clear(input);
    await user.type(input, ' A ');
    await user.click(screen.getByRole('button', { name: 'Save player name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Display name must be at least 2 characters after trimming.',
    );
    expect(input).toHaveValue(' A ');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('aborts an in-flight display-name save when the editor closes', async () => {
    const user = userEvent.setup();
    let saveSignal: AbortSignal | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith('/auth/me/display-name')) {
        saveSignal = init?.signal ?? undefined;

        return new Promise<Response>((_resolve, reject) => {
          saveSignal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        });
      }

      if (url.endsWith('/auth/me')) {
        return currentPlayerResponse(playerAId, 'Player A', 'current-player');
      }

      return new Response(
        JSON.stringify({ events: [], requestId: 'events-test-request' }),
        { status: 200 },
      );
    });

    renderRoute(
      '/',
      createAuthValue({
        getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
        isAuthenticated: true,
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Signed in as Player A' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save player name' }));
    await waitFor(() => expect(saveSignal).toBeDefined());
    await user.click(
      screen.getByRole('button', { name: 'Close player-name editor' }),
    );

    expect(saveSignal?.aborted).toBe(true);
    expect(
      screen.queryByRole('heading', { name: 'Player name' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Signed in as Player A' }),
    );
    expect(
      screen.getByRole('button', { name: 'Save player name' }),
    ).toBeEnabled();
  });

  it('does not let a stale display-name response overwrite a newer player', async () => {
    const user = userEvent.setup();
    let currentPlayerLoads = 0;
    let finishPlayerASave: (() => void) | undefined;
    let playerASave: Promise<unknown> | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith('/auth/me/display-name')) {
        return new Promise<Response>((resolve) => {
          finishPlayerASave = () =>
            resolve(
              currentPlayerResponse(playerAId, 'Updated Player', 'stale-save'),
            );
        });
      }

      currentPlayerLoads += 1;
      return currentPlayerResponse(
        currentPlayerLoads === 1 ? playerAId : playerBId,
        currentPlayerLoads === 1 ? 'Player A' : 'Player B',
        `current-player-${currentPlayerLoads}`,
      );
    });

    const authValue = createAuthValue({
      getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
      isAuthenticated: true,
      logout: vi.fn().mockResolvedValue(undefined),
    });
    render(
      currentPlayerHarnessTree(authValue, (update) => {
        playerASave = update;
      }),
    );

    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent(`${playerAId}:Player A`);
    await user.click(
      screen.getByRole('button', { name: 'Start display-name save' }),
    );
    await waitFor(() => expect(finishPlayerASave).toBeTypeOf('function'));

    window.localStorage.clear();
    await user.click(
      screen.getByRole('button', { name: 'Reload current player' }),
    );
    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent(`${playerBId}:Player B`);

    await act(async () => {
      finishPlayerASave?.();
      await playerASave;
    });

    expect(screen.getByLabelText('Current player state')).toHaveTextContent(
      `${playerBId}:Player B`,
    );
    expect(screen.queryByText(new RegExp(playerAId))).not.toBeInTheDocument();
  });

  it('does not let a stale display-name response restore an anonymous session', async () => {
    const user = userEvent.setup();
    let finishSave: (() => void) | undefined;
    let save: Promise<unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/auth/me/display-name')) {
        return new Promise<Response>((resolve) => {
          finishSave = () =>
            resolve(currentPlayerResponse(playerAId, 'Player A', 'stale-save'));
        });
      }

      return currentPlayerResponse(playerAId, 'Player A', 'current-player');
    });

    const authenticated = createAuthValue({
      getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
      isAuthenticated: true,
    });
    const onUpdateStarted = (update: Promise<unknown>) => {
      save = update;
    };
    const view = render(
      currentPlayerHarnessTree(authenticated, onUpdateStarted),
    );

    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent(`${playerAId}:Player A`);
    await user.click(
      screen.getByRole('button', { name: 'Start display-name save' }),
    );
    await waitFor(() => expect(finishSave).toBeTypeOf('function'));

    view.rerender(currentPlayerHarnessTree(createAuthValue(), onUpdateStarted));
    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent('anonymous');

    await act(async () => {
      finishSave?.();
      await save;
    });

    expect(screen.getByLabelText('Current player state')).toHaveTextContent(
      'anonymous',
    );
  });

  it('moves the current player to terminal authorization state when a save is unauthorized', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/me/display-name')
        ? new Response('{}', { status: 401 })
        : currentPlayerResponse(playerAId, 'Player A', 'current-player'),
    );

    render(
      currentPlayerHarnessTree(
        createAuthValue({
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
        }),
        () => undefined,
      ),
    );

    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent(`${playerAId}:Player A`);
    await user.click(
      screen.getByRole('button', { name: 'Start display-name save' }),
    );

    expect(
      await screen.findByLabelText('Current player state'),
    ).toHaveTextContent('error:authorization');
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

  it('keeps logout available while the authenticated player is loading', () => {
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
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
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
