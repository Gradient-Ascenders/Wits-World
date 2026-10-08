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
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import MatchHistoryPage from '../src/pages/MatchHistoryPage';
import {
  historyItem,
  historyResponse,
  problemResponse,
  uuid,
} from './fixtures/matches';
import {
  pvpHistoryResponse,
  pvpHistorySummary,
  pvpMatch,
  pvpProblemResponse,
} from './fixtures/pvp';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('match history recovery coverage', () => {
  it('retries a partial history read and replaces its warning with recovered results', async () => {
    const user = userEvent.setup();
    const cpuHistory = historyItem();
    const playerHistory = pvpHistorySummary();
    let cpuRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/matches/pvp/history')) {
        return Promise.resolve(pvpHistoryResponse([playerHistory]));
      }
      cpuRequests += 1;
      return Promise.resolve(
        cpuRequests === 1
          ? problemResponse('CPU_HISTORY_UNAVAILABLE', 503)
          : historyResponse([cpuHistory]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHistory();

    expect(
      await screen.findByText('Some history could not load.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'wits_wanderer' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeVisible();
    expect(screen.queryByText('Some history could not load.')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'wits_wanderer' }),
    ).toBeVisible();
    expect(cpuRequests).toBe(2);
  });

  it('prefers the expired session when both reads fail and reports redirect failure', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi
      .fn()
      .mockRejectedValue(new Error('redirect unavailable'));
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        return Promise.resolve(
          path.endsWith('/matches/pvp/history')
            ? pvpProblemResponse('SESSION_EXPIRED', 401)
            : problemResponse('FORBIDDEN', 403),
        );
      }),
    );

    renderHistory(authValue({ loginWithRedirect }));

    expect(
      await screen.findByRole('heading', {
        name: 'Match history could not load',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/matches/history' },
    });
    expect(
      await screen.findByText('Sign-in could not start. Try again.'),
    ).toBeVisible();
  });

  it('retries a fully failed history read from its error state', async () => {
    const user = userEvent.setup();
    let available = false;
    const player = pvpHistorySummary();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (!available) {
          return Promise.resolve(
            path.endsWith('/matches/pvp/history')
              ? pvpProblemResponse('PLAYER_HISTORY_UNAVAILABLE', 503)
              : problemResponse('CPU_HISTORY_UNAVAILABLE', 503),
          );
        }
        return Promise.resolve(
          path.endsWith('/matches/pvp/history')
            ? pvpHistoryResponse([player])
            : historyResponse([historyItem()]),
        );
      }),
    );

    renderHistory();
    expect(
      await screen.findByRole('heading', {
        name: 'Match history could not load',
      }),
    ).toBeVisible();
    available = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'wits_wanderer' }),
    ).toBeVisible();
  });

  it('offers a retry after the loading state has waited for recovery', async () => {
    vi.useFakeTimers();
    let requests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests += 1;
      if (requests <= 2) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }
      return Promise.resolve(
        new URL(String(input)).pathname.endsWith('/matches/pvp/history')
          ? pvpHistoryResponse([])
          : historyResponse([]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderHistory();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    vi.useRealTimers();

    expect(
      await screen.findByRole('heading', { name: 'No completed battles yet' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries the failed async cursor without dropping loaded entries', async () => {
    const user = userEvent.setup();
    const firstPlayer = pvpHistorySummary(
      pvpMatch({
        completedAt: '2026-09-11T09:00:00.000Z',
        matchId: uuid(8101),
        status: 'completed',
      }),
    );
    const nextPlayer = pvpHistorySummary(
      pvpMatch({
        completedAt: '2026-09-10T12:00:00.000Z',
        matchId: uuid(8102),
        status: 'completed',
      }),
    );
    const oldCpu = {
      ...historyItem(),
      completedAt: '2026-09-09T09:00:00.000Z',
      matchId: uuid(8103),
    };
    let cursorAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/matches/pvp/history')) {
        if (!url.searchParams.has('cursor')) {
          return Promise.resolve(pvpHistoryResponse([firstPlayer], 'cursor-a'));
        }
        cursorAttempts += 1;
        return Promise.resolve(
          cursorAttempts === 1
            ? pvpProblemResponse('PLAYER_HISTORY_UNAVAILABLE', 503)
            : pvpHistoryResponse([nextPlayer]),
        );
      }
      return Promise.resolve(historyResponse([oldCpu]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHistory();

    const history = await screen.findByRole('list', {
      name: 'Completed battles',
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Load more battles' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'More player battles could not load.',
    );
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Retry more battles' }),
    ).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'CPU' })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Retry more battles' }),
    );

    await waitFor(() =>
      expect(within(history).getAllByRole('listitem')).toHaveLength(3),
    );
    expect(cursorAttempts).toBe(2);
    expect(
      within(history)
        .getAllByRole('link', { name: 'View battle' })
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      `/matches/pvp/${firstPlayer.matchId}`,
      `/matches/pvp/${nextPlayer.matchId}`,
      `/matches/${oldCpu.matchId}`,
    ]);
  });

  it('rejects a concurrent request for a claimed cursor and retains loaded entries', async () => {
    const firstPlayer = pvpHistorySummary(
      pvpMatch({
        completedAt: '2026-09-11T09:00:00.000Z',
        matchId: uuid(8151),
        status: 'completed',
      }),
    );
    let cursorSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/matches/pvp/history')) {
          if (!url.searchParams.has('cursor')) {
            return Promise.resolve(
              pvpHistoryResponse([firstPlayer], 'cursor-cycle'),
            );
          }
          cursorSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            cursorSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
        }
        return Promise.resolve(historyResponse([]));
      }),
    );

    renderHistory();
    const history = await screen.findByRole('list', {
      name: 'Completed battles',
    });
    const loadMore = screen.getByRole('button', { name: 'Load more battles' });
    act(() => {
      fireEvent.click(loadMore);
      fireEvent.click(loadMore);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'More player battles could not load. Refresh to try again.',
    );
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /more battles/i })).toBeNull();
    expect(cursorSignal?.aborted).toBe(false);
  });

  it('navigates by keyboard and restores focus after fetching the missing return page', async () => {
    const user = userEvent.setup();
    const firstPlayer = pvpHistorySummary(
      pvpMatch({
        matchId: uuid(8201),
        opponent: { playerName: 'First Rival' },
        status: 'completed',
      }),
    );
    const returnPlayer = pvpHistorySummary(
      pvpMatch({
        matchId: uuid(8202),
        opponent: { playerName: 'Return Rival' },
        status: 'completed',
      }),
    );
    const loginState = {
      pvpHistoryReturn: {
        loadedCount: 2,
        matchId: returnPlayer.matchId,
        returnHref: '/matches/history' as const,
        scrollY: 420,
      },
    };
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/matches/pvp/history')) {
          return Promise.resolve(
            url.searchParams.has('cursor')
              ? pvpHistoryResponse([returnPlayer])
              : pvpHistoryResponse([firstPlayer], 'cursor-return'),
          );
        }
        return Promise.resolve(historyResponse([]));
      }),
    );

    renderHistory(authValue(), loginState);

    const returnHeading = await screen.findByRole('heading', {
      name: 'Return Rival',
    });
    const returnLink = returnHeading.closest('a');
    expect(returnLink).not.toBeNull();
    await waitFor(() => expect(returnLink).toHaveFocus());
    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'instant' });

    const firstLink = screen
      .getByRole('heading', { name: 'First Rival' })
      .closest('a');
    expect(firstLink).not.toBeNull();
    fireEvent.click(firstLink!, { button: 0, ctrlKey: true });
    expect(window.location.pathname).toBe('/matches/history');
    firstLink!.focus();
    await user.keyboard('{Enter}');
    expect(window.location.pathname).toBe(
      `/matches/pvp/${firstPlayer.matchId}`,
    );
    expect(window.history.state.pvpHistoryReturn).toMatchObject({
      loadedCount: 2,
      matchId: firstPlayer.matchId,
      returnHref: '/matches/history',
      scrollY: expect.any(Number),
    });
  });
});

function renderHistory(
  authentication = authValue(),
  historyState: Record<string, unknown> = {},
) {
  window.history.replaceState(historyState, '', '/matches/history');
  return render(
    <Auth0Context.Provider value={authentication}>
      <Router>
        <Route path="/matches/history">
          <MatchHistoryPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

function authValue(
  overrides: Partial<Auth0ContextInterface> = {},
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Auth0ContextInterface;
}
