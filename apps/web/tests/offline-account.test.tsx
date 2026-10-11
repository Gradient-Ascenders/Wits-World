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
import { Router } from 'wouter';
import { useCurrentPlayer } from '../src/auth/CurrentPlayerProvider';
import {
  bindAuthenticatedPlayer,
  clearAuthenticatedPlayerBinding,
} from '../src/auth/player-session-binding';
import { AppShell } from '../src/components/AppShell';
import { OfflineProvider } from '../src/offline/OfflineProvider';
import { saveOfflineSession } from '../src/offline/store';
import * as offlineStore from '../src/offline/store';

vi.mock('../src/auth/CurrentPlayerProvider', () => ({
  useCurrentPlayer: vi.fn(),
}));
vi.mock('../src/auth/useApiAccessToken', () => ({
  useApiAccessToken: () => vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.mocked(useCurrentPlayer).mockReturnValue({
    state: { status: 'anonymous' },
    reload: vi.fn(),
    setupPlayerName: vi.fn(),
  });
  window.history.replaceState({}, '', '/offline');
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

async function saveAccount(name = 'Ari') {
  const playerId = crypto.randomUUID();
  bindAuthenticatedPlayer(playerId);
  await saveOfflineSession(playerId, name);
  return playerId;
}

function renderHeader(overrides: Partial<Auth0ContextInterface> = {}) {
  const auth = {
    ...initialContext,
    isLoading: false,
    ...overrides,
  } as Auth0ContextInterface;
  return render(
    <Auth0Context.Provider value={auth}>
      <Router>
        <OfflineProvider apiBaseUrl="https://api.example.test/api/v1">
          <AppShell>
            <h1>Saved play</h1>
          </AppShell>
        </OfflineProvider>
      </Router>
    </Auth0Context.Provider>,
  );
}

function openOfflineMenu() {
  fireEvent.click(screen.getByRole('button', { name: /offline account menu/ }));
}

describe('saved offline account header', () => {
  it('does not suggest signing in when the network is connected but the API is unavailable', async () => {
    await saveAccount();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.mocked(useCurrentPlayer).mockReturnValue({
      state: { status: 'error', failure: 'unavailable' },
      reload: vi.fn(),
      setupPlayerName: vi.fn(),
    });
    renderHeader();
    await screen.findByText(/Playing offline as/);
    openOfflineMenu();
    expect(
      screen.queryByRole('button', { name: 'Restore online session' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Downloads & saved attempts' }),
    ).toBeVisible();
  });

  it('keeps the full Explore layout when the saved account cannot reach the identity API', async () => {
    await saveAccount();
    window.history.replaceState({}, '', '/explore');
    vi.mocked(useCurrentPlayer).mockReturnValue({
      state: {
        status: 'error',
        failure: 'unavailable',
      },
      reload: vi.fn(),
      setupPlayerName: vi.fn(),
    });
    renderHeader();
    await screen.findByText(/Playing offline as/);
    expect(screen.getByRole('main')).toHaveClass('main-content--explore');
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it.each([
    {},
    { isLoading: true },
    { error: new Error('Auth0 is unreachable') },
  ])(
    'shows the saved account without claiming online authentication: %j',
    async (auth) => {
      await saveAccount();
      const loginWithRedirect = vi.fn();
      renderHeader({ ...auth, loginWithRedirect });
      expect(await screen.findByText(/Playing offline as/)).toHaveTextContent(
        'Playing offline as Ari',
      );
      openOfflineMenu();
      expect(
        screen.getByRole('link', { name: 'Downloads & saved attempts' }),
      ).toHaveAttribute('href', '/offline');
      expect(
        screen.getByText('Reconnect to restore online access.'),
      ).toBeVisible();
      expect(screen.queryByText('Restoring session…')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Switch account' }),
      ).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Player' })).toBeNull();
      expect(loginWithRedirect).not.toHaveBeenCalled();
    },
  );

  it('offers online session restoration after reconnection without clearing the saved account', async () => {
    const playerId = await saveAccount();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    renderHeader({ loginWithRedirect });
    await screen.findByText(/Playing offline as/);
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    openOfflineMenu();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore online session' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: {
        returnTo: `${window.location.pathname}${window.location.search}`,
      },
    });
    expect(
      window.localStorage.getItem('wits-world.authenticated-player-id'),
    ).toBe(playerId);
  });

  it('removes the old identity immediately when the device account binding changes', async () => {
    await saveAccount();
    renderHeader();
    await screen.findByText(/Playing offline as/);
    await act(async () => {
      clearAuthenticatedPlayerBinding();
      bindAuthenticatedPlayer(crypto.randomUUID());
    });
    expect(screen.queryByText(/Playing offline as/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  it('can explicitly sign out locally without trying to open Auth0 while offline', async () => {
    await saveAccount();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderHeader({ logout });
    await screen.findByText(/Playing offline as/);
    openOfflineMenu();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign out on this device' }),
      );
    });
    await waitFor(() =>
      expect(logout).toHaveBeenCalledWith({
        openUrl: false,
        logoutParams: { returnTo: window.location.origin },
      }),
    );
    expect(
      window.localStorage.getItem('wits-world.authenticated-player-id'),
    ).toBeNull();
    expect(screen.queryByText(/Playing offline as/)).toBeNull();
  });

  it('retains the account when the pending-work sign-out warning is cancelled', async () => {
    const playerId = await saveAccount();
    vi.spyOn(offlineStore, 'confirmOfflineSignOut').mockResolvedValue(
      'cancelled',
    );
    const logout = vi.fn();
    renderHeader({ logout });
    await screen.findByText(/Playing offline as/);
    openOfflineMenu();
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign out on this device' }),
      ),
    );
    expect(logout).not.toHaveBeenCalled();
    expect(
      window.localStorage.getItem('wits-world.authenticated-player-id'),
    ).toBe(playerId);
    expect(screen.getByText(/Playing offline as/)).toHaveTextContent('Ari');
  });

  it('does not expose another saved identity to a different authenticated player', async () => {
    await saveAccount();
    vi.mocked(useCurrentPlayer).mockReturnValue({
      state: {
        status: 'ready',
        player: {
          id: crypto.randomUUID(),
          playerName: 'Other player',
          playerNameSetupRequired: false,
          connectionStrategy: 'auth0',
          lifecycleStatus: 'active',
          role: 'player',
        },
      },
      reload: vi.fn(),
      setupPlayerName: vi.fn(),
    });
    renderHeader({ isAuthenticated: true });
    expect(
      await screen.findByRole('button', { name: 'Other player, account menu' }),
    ).toBeVisible();
    expect(screen.queryByText(/Playing offline as/)).toBeNull();
  });
});
