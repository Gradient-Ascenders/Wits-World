import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import { AppRoutes } from '../src/App';
import { getSafeReturnTo } from '../src/auth/AuthProvider';
import { useApiAccessToken } from '../src/auth/useApiAccessToken';

const apiBaseUrl = 'https://api.example.test/api/v1';
const mapboxAccessToken = 'pk.test-token';

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

  it('renders the protected route for an authenticated player', async () => {
    renderRoute(
      '/explore',
      createAuthValue({
        isAuthenticated: true,
        user: { name: 'Kevin', sub: 'auth0|player' },
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
    expect(screen.getByText('Signed in as')).toHaveTextContent(
      'Signed in as Kevin',
    );
  });

  it('signs out through Auth0 and returns to the public origin', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderRoute(
      '/',
      createAuthValue({
        isAuthenticated: true,
        logout,
        user: { name: 'Kevin', sub: 'auth0|player' },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
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
});
