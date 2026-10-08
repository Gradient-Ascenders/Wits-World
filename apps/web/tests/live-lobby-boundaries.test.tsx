import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import LiveLobbyPage from '../src/pages/LiveLobbyPage';
import { BrowserLocationError } from '../src/browser-location';
import type { LocationClaimProvider } from '../src/browser-location';
import { buildSavedDeck, deckListResponse } from './fixtures/decks';
import {
  LIVE_MATCH_ID,
  queueState,
  rankedProfile,
  rankedSeason,
  rankedStandings,
  territoryZones,
} from './fixtures/live';
import { buildStarterCards } from './fixtures/cards';

const apiBaseUrl = 'https://api.example.test/api/v1';
const activeDeck = buildSavedDeck({ isSelected: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
});

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function authContext(
  getAccessTokenSilently = vi.fn().mockResolvedValue('access-token'),
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently,
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
}

function renderLobby(
  path = '/matches/live',
  getAccessTokenSilently?: Parameters<typeof authContext>[0],
  locationClaimProvider?: LocationClaimProvider,
) {
  window.history.replaceState({}, '', path);
  return render(
    <Auth0Context.Provider value={authContext(getAccessTokenSilently)}>
      <Router>
        <Route path="/matches/live">
          <LiveLobbyPage
            apiBaseUrl={apiBaseUrl}
            locationClaimProvider={locationClaimProvider}
          />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

function lobbyResponse(pathname: string) {
  if (pathname.endsWith('/cards/collection')) {
    return response({ cards: buildStarterCards(), requestId: 'cards' });
  }
  if (pathname.endsWith('/ranked/me')) return response(rankedProfile());
  if (pathname.endsWith('/ranked/standings')) {
    return response(rankedStandings());
  }
  if (pathname.endsWith('/territory/zones')) {
    return response({ zones: territoryZones() });
  }
  return null;
}

function installLobbyFetch(
  queueRequest: (
    method: string,
    pathname: string,
    init?: RequestInit,
  ) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/decks')) {
      return Promise.resolve(deckListResponse([activeDeck]));
    }
    if (url.pathname.endsWith('/ranked/seasons/current')) {
      return Promise.resolve(response({ season: rankedSeason() }));
    }
    if (
      url.pathname.startsWith('/api/v1/ranked/queue') ||
      url.pathname.startsWith('/api/v1/ranked/proposals/')
    ) {
      return Promise.resolve(
        queueRequest(init?.method ?? 'GET', url.pathname, init),
      );
    }
    const supplemental = lobbyResponse(url.pathname);
    if (supplemental) return Promise.resolve(supplemental);
    return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live lobby API boundaries', () => {
  it('cancels a search, permits a fresh attempt, and follows a matched participant into battle', async () => {
    const user = userEvent.setup();
    let joins = 0;
    const calls: Array<{ method: string; pathname: string; body?: unknown }> =
      [];
    installLobbyFetch((method, pathname, init) => {
      calls.push({
        method,
        pathname,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      if (method === 'POST' && pathname === '/api/v1/ranked/queue') {
        joins += 1;
        return response(
          joins === 1
            ? queueState({
                joinedAt: '2026-09-25T12:00:00.000Z',
                leaseExpiresAt: '2026-09-25T12:00:30.000Z',
                queueEntryId: '71000000-0000-4000-8000-000000000001',
                searchRange: 100,
                status: 'searching',
              })
            : queueState({ status: 'matched', matchId: LIVE_MATCH_ID }),
        );
      }
      if (method === 'DELETE')
        return response(queueState({ status: 'cancelled' }));
      return response(queueState());
    });

    renderLobby();
    await user.click(
      await screen.findByRole('button', { name: 'Find battle' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Finding opponent…' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel search' }));
    expect(
      await screen.findByText('Search ended', { selector: 'strong' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Find battle' }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/live/${LIVE_MATCH_ID}`),
    );
    expect(calls.filter((call) => call.method === 'POST')).toEqual([
      {
        method: 'POST',
        pathname: '/api/v1/ranked/queue',
        body: { deckId: activeDeck.deckId },
      },
      {
        method: 'POST',
        pathname: '/api/v1/ranked/queue',
        body: { deckId: activeDeck.deckId },
      },
    ]);
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('recovers a stale proposal conflict from the authoritative queue and accepts it', async () => {
    const user = userEvent.setup();
    let reads = 0;
    let accepts = 0;
    const proposalId = '71000000-0000-4000-8000-000000000002';
    const proposedQueue = (accepted = false) =>
      queueState({
        accepted,
        acceptanceDeadline: '2099-01-01T00:00:00.000Z',
        joinedAt: '2026-09-25T12:00:00.000Z',
        leaseExpiresAt: '2026-09-25T12:00:30.000Z',
        proposalId,
        queueEntryId: '71000000-0000-4000-8000-000000000001',
        searchRange: 100,
        status: 'proposed',
      });
    const fetchMock = installLobbyFetch((method, pathname) => {
      if (pathname === '/api/v1/ranked/queue' && method === 'GET') {
        reads += 1;
        return reads === 1 ? response(queueState()) : response(proposedQueue());
      }
      if (pathname.endsWith('/accept')) {
        accepts += 1;
        return response(proposedQueue(true));
      }
      if (method === 'POST' && pathname === '/api/v1/ranked/queue') {
        return response(
          {
            code: 'RANKED_QUEUE_CHANGED',
            detail: 'Search changed. Check its status and retry.',
          },
          409,
        );
      }
      return response(queueState());
    });

    renderLobby();
    await user.click(
      await screen.findByRole('button', { name: 'Find battle' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Opponent found' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Search changed. Check its status and retry.',
    );
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(
      await screen.findByRole('heading', { name: 'Match accepted' }),
    ).toBeVisible();
    expect(accepts).toBe(1);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        new URL(String(input)).pathname.endsWith(
          `/ranked/proposals/${proposalId}/accept`,
        ),
      ),
    ).toBe(true);
  });

  it('recovers a rejected access token through the visible ranked readiness retry', async () => {
    const user = userEvent.setup();
    const getToken = vi
      .fn(async () => 'access-token')
      .mockRejectedValueOnce(new Error('Login required'))
      .mockResolvedValue('recovered-token');
    installLobbyFetch((_method, pathname) => {
      if (pathname === '/api/v1/ranked/queue') return response(queueState());
      return response(queueState());
    });

    renderLobby('/matches/live', getToken);
    expect(
      await screen.findByRole('heading', {
        name: 'Live Ranked is unavailable',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Live Ranked' }),
    ).toBeVisible();
    expect(getToken).toHaveBeenCalled();
  });

  it('validates stale watch links, accepts a canonical battle URL, and surfaces clipboard denial', async () => {
    const user = userEvent.setup();
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks'))
          return Promise.resolve(deckListResponse([activeDeck]));
        if (pathname.endsWith('/ranked/queue'))
          return Promise.resolve(response(queueState()));
        if (pathname.endsWith('/ranked/seasons/current'))
          return Promise.resolve(response({ season: rankedSeason() }));
        const supplemental = lobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        return Promise.reject(new Error(`Unexpected request: ${pathname}`));
      }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const view = renderLobby('/matches/live?tab=watch');
    const input = await screen.findByRole('textbox', {
      name: 'Private battle link or ID',
    });
    await user.type(
      input,
      'https://witsworld.example/matches/live/not-a-match',
    );
    await user.click(screen.getByRole('button', { name: 'Watch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid battle link or ID.',
    );
    await user.clear(input);
    await user.type(
      input,
      `https://witsworld.example/matches/live/${LIVE_MATCH_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Watch' }));
    expect(window.location.pathname).toBe(`/matches/live/${LIVE_MATCH_ID}`);

    view.unmount();
    window.history.replaceState({}, '', '/matches/live?tab=watch');
    renderLobby('/matches/live?tab=watch');
    await user.click(
      await screen.findByRole('button', { name: 'Paste and watch' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clipboard blocked. Paste your link into the field.',
    );
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('retries a failed standings page and refreshes when its season is stale', async () => {
    const user = userEvent.setup();
    const nextSeason = rankedSeason({
      seasonId: '61000000-0000-4000-8000-000000000099',
    });
    let pageReads = 0;
    let seasonReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/decks'))
        return Promise.resolve(deckListResponse([activeDeck]));
      if (url.pathname.endsWith('/ranked/queue'))
        return Promise.resolve(response(queueState()));
      if (url.pathname.endsWith('/ranked/seasons/current')) {
        seasonReads += 1;
        return Promise.resolve(
          response({ season: seasonReads === 1 ? rankedSeason() : nextSeason }),
        );
      }
      if (url.pathname.endsWith('/ranked/me'))
        return Promise.resolve(
          response(
            rankedProfile({
              season: seasonReads > 1 ? nextSeason : rankedSeason(),
            }),
          ),
        );
      if (url.pathname.endsWith('/territory/zones'))
        return Promise.resolve(response({ zones: territoryZones() }));
      if (url.pathname.endsWith('/cards/collection'))
        return Promise.resolve(response({ cards: buildStarterCards() }));
      if (url.pathname.endsWith('/ranked/standings')) {
        if (url.searchParams.has('cursor')) {
          pageReads += 1;
          if (pageReads === 1) return Promise.reject(new TypeError('offline'));
          return Promise.resolve(
            response(
              rankedStandings({
                season: nextSeason,
                entries: [],
                nextCursor: null,
              }),
            ),
          );
        }
        if (seasonReads > 2) {
          return Promise.resolve(
            response(rankedStandings({ season: nextSeason, nextCursor: null })),
          );
        }
        return Promise.resolve(
          response(rankedStandings({ nextCursor: 'page-2' })),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLobby();
    await user.click(await screen.findByRole('tab', { name: 'Standings' }));
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more players. Retry or refresh.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Standings haven’t updated for this season'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refresh standings' }));
    await waitFor(() => expect(seasonReads).toBeGreaterThan(2));
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          new URL(String(input)).searchParams.get('cursor') === 'page-2',
      ),
    ).toBe(true);
  });

  it('moves focus through lobby tabs with arrow, Home, and End keys', async () => {
    const user = userEvent.setup();
    installLobbyFetch(() => response(queueState()));
    renderLobby();

    const play = await screen.findByRole('tab', { name: 'Play' });
    await user.click(play);
    await user.keyboard('{ArrowLeft}');
    const watch = screen.getByRole('tab', { name: 'Watch' });
    expect(watch).toHaveFocus();
    expect(watch).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('?tab=watch');

    await user.keyboard('{Home}');
    expect(play).toHaveFocus();
    expect(window.location.search).toBe('');
    await user.keyboard('{End}');
    expect(watch).toHaveFocus();
  });

  it('appends a successful standings page without replacing existing players', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/decks'))
          return Promise.resolve(deckListResponse([activeDeck]));
        if (url.pathname.endsWith('/ranked/queue'))
          return Promise.resolve(response(queueState()));
        if (url.pathname.endsWith('/ranked/seasons/current'))
          return Promise.resolve(response({ season: rankedSeason() }));
        if (url.pathname.endsWith('/ranked/me'))
          return Promise.resolve(response(rankedProfile()));
        if (url.pathname.endsWith('/territory/zones'))
          return Promise.resolve(response({ zones: territoryZones() }));
        if (url.pathname.endsWith('/cards/collection'))
          return Promise.resolve(response({ cards: buildStarterCards() }));
        if (url.pathname.endsWith('/ranked/standings')) {
          return Promise.resolve(
            url.searchParams.has('cursor')
              ? response(
                  rankedStandings({
                    entries: [
                      {
                        playerName: 'PageThree',
                        rank: 3,
                        rating: 1_170,
                        wins: 5,
                        losses: 4,
                        settledMatchCount: 9,
                      },
                    ],
                    nextCursor: null,
                  }),
                )
              : response(rankedStandings({ nextCursor: 'page-2' })),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
      }),
    );
    renderLobby();
    await user.click(await screen.findByRole('tab', { name: 'Standings' }));
    expect(await screen.findByText('CampusFox')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('PageThree')).toBeVisible();
    expect(screen.getByText('CampusFox')).toBeVisible();
    expect(screen.getByText('BraamBear')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('declines a current proposal through the ranked proposal API', async () => {
    const user = userEvent.setup();
    const proposalId = '71000000-0000-4000-8000-000000000003';
    const calls: Array<{ method: string; pathname: string; body?: unknown }> =
      [];
    const proposedQueue = queueState({
      acceptanceDeadline: '2099-01-01T00:00:00.000Z',
      joinedAt: '2026-09-25T12:00:00.000Z',
      leaseExpiresAt: '2026-09-25T12:00:30.000Z',
      proposalId,
      queueEntryId: '71000000-0000-4000-8000-000000000001',
      searchRange: 100,
      status: 'proposed',
    });
    installLobbyFetch((method, pathname, init) => {
      calls.push({
        method,
        pathname,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      if (pathname.endsWith('/ranked/queue')) return response(proposedQueue);
      if (pathname.endsWith('/decline')) {
        return response(queueState({ status: 'searching' }));
      }
      return response(queueState());
    });
    renderLobby();
    expect(
      await screen.findByRole('heading', { name: 'Opponent found' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Finding opponent…' }),
      ).toBeVisible(),
    );
    expect(calls).toContainEqual({
      method: 'POST',
      pathname: `/api/v1/ranked/proposals/${proposalId}/decline`,
    });
  });

  it('reports a failed territory claim and preserves the active territory context', async () => {
    const user = userEvent.setup();
    installLobbyFetch((method, pathname) => {
      if (method === 'POST' && pathname === '/api/v1/ranked/queue') {
        return response(
          {
            code: 'TERRITORY_NOT_ELIGIBLE',
            detail: 'Location is outside the active territory window.',
          },
          409,
        );
      }
      return response(queueState());
    });
    const claim = vi.fn().mockResolvedValue({
      accuracyMetres: 8,
      acquiredAt: '2026-09-25T12:00:00.000Z',
      latitude: -26.192,
      longitude: 28.03,
    });
    renderLobby('/matches/live', undefined, claim);
    const contest = await screen.findByRole('checkbox', {
      name: 'Contest territory',
    });
    await user.click(contest);
    await user.click(
      screen.getByRole('button', { name: 'Find territory battle' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location not confirmed. Move inside the territory or turn off Contest territory.',
    );
    expect(claim).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('checkbox', { name: 'Contest territory' }),
    ).toBeChecked();
  });

  it('maps a denied browser location claim to its recovery guidance', async () => {
    const user = userEvent.setup();
    installLobbyFetch(() => response(queueState()));
    const claim = vi
      .fn<LocationClaimProvider>()
      .mockRejectedValue(new BrowserLocationError('denied'));
    renderLobby('/matches/live', undefined, claim);
    await user.click(
      await screen.findByRole('checkbox', { name: 'Contest territory' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Find territory battle' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allow location access or turn off Contest territory.',
    );
    expect(claim).toHaveBeenCalledOnce();
  });

  it('retries queue status after polling and manual refresh failures', async () => {
    const user = userEvent.setup();
    let queueReads = 0;
    installLobbyFetch((method, pathname) => {
      if (pathname === '/api/v1/ranked/queue' && method === 'GET') {
        queueReads += 1;
        if (queueReads === 1) return response(queueState());
        if (queueReads < 4) return Promise.reject(new TypeError('offline'));
        return response(
          queueState({
            joinedAt: '2026-09-25T12:00:00.000Z',
            leaseExpiresAt: '2026-09-25T12:00:30.000Z',
            queueEntryId: '71000000-0000-4000-8000-000000000001',
            searchRange: 100,
            status: 'searching',
          }),
        );
      }
      if (method === 'POST' && pathname === '/api/v1/ranked/queue') {
        return response(
          queueState({
            joinedAt: '2026-09-25T12:00:00.000Z',
            leaseExpiresAt: '2026-09-25T12:00:30.000Z',
            queueEntryId: '71000000-0000-4000-8000-000000000001',
            searchRange: 100,
            status: 'searching',
          }),
        );
      }
      return response(queueState());
    });
    renderLobby();
    await user.click(
      await screen.findByRole('button', { name: 'Find battle' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Retry' }, { timeout: 6000 }),
    );
    expect(
      await screen.findByText('Still reconnecting. Keep this page open.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Finding opponent…' }),
    ).toBeVisible();
    expect(queueReads).toBe(4);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('handles paste when clipboard access is missing without navigating', async () => {
    const user = userEvent.setup();
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    installLobbyFetch(() => response(queueState()));
    Reflect.deleteProperty(navigator, 'clipboard');
    renderLobby('/matches/live?tab=watch');

    await user.click(
      await screen.findByRole('button', { name: 'Paste and watch' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Paste your battle link into the field.',
    );
    expect(window.location.pathname).toBe('/matches/live');
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    }
  });
});
