import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import * as authentication from '../src/api/authentication';
import { CurrentPlayerProvider } from '../src/auth/CurrentPlayerProvider';
import { ProtectedRoute } from '../src/components/auth/ProtectedRoute';
import { READ_TIMEOUT_MS } from '../src/components/loading-policy';

const player: authentication.CurrentPlayer = {
  connectionStrategy: 'auth0',
  id: '6fe7dc26-cdea-4275-a2df-861724137cbc',
  lifecycleStatus: 'active',
  playerName: 'test-player',
  playerNameSetupRequired: false,
  role: 'player',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderProtected(overrides: Partial<Auth0ContextInterface> = {}) {
  return render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
          isLoading: false,
          ...overrides,
        } as Auth0ContextInterface
      }
    >
      <Router>
        <CurrentPlayerProvider apiBaseUrl="https://api.example.test/api/v1">
          <ProtectedRoute>
            <h1>Protected player content</h1>
          </ProtectedRoute>
        </CurrentPlayerProvider>
      </Router>
    </Auth0Context.Provider>,
  );
}

describe('authentication loading recovery', () => {
  it('offers recovery while Auth0 is still pending and keeps protected content hidden', async () => {
    vi.useFakeTimers();
    renderProtected({ isLoading: true });

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(8_000));

    expect(
      screen.getByText(/This is taking longer than expected/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.queryByRole('heading', { name: 'Protected player content' }),
    ).toBeNull();
  });

  it('bounds a stalled token request and permits a fresh identity check', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ...player, requestId: 'retry-request' })),
      );
    const getAccessTokenSilently = vi
      .fn()
      .mockImplementationOnce(() => new Promise<never>(() => undefined))
      .mockResolvedValue('access-token');
    renderProtected({ getAccessTokenSilently });

    await act(() => vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS));
    expect(
      screen.getByRole('heading', {
        name: 'Your player session could not be restored',
      }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Protected player content' }),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Check session again' }),
      );
    });

    expect(
      screen.getByRole('heading', { name: 'Protected player content' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts a superseded read and ignores its late completion after retry', async () => {
    vi.useFakeTimers();
    let finishFirst!: (value: authentication.CurrentPlayer) => void;
    let firstSignal: AbortSignal | undefined;
    const getPlayer = vi
      .spyOn(authentication, 'getCurrentPlayer')
      .mockImplementationOnce(({ signal }) => {
        firstSignal = signal;
        return new Promise((resolve) => {
          finishFirst = resolve;
        });
      })
      .mockResolvedValue(player);
    renderProtected();

    await act(() => vi.advanceTimersByTimeAsync(8_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(getPlayer).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('heading', { name: 'Protected player content' }),
    ).toBeVisible();

    await act(async () => {
      finishFirst({ ...player, id: '5a78ce0d-d15f-4039-ac4a-3c59d1c591c2' });
    });
    expect(
      screen.getByRole('heading', { name: 'Protected player content' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
