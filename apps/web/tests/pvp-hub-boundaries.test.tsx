import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';

import PvpHubPage from '../src/pages/PvpHubPage';
import { buildSavedDeck, deckListResponse } from './fixtures/decks';
import {
  activePvpListResponse,
  activePvpSummary,
  invitationListResponse,
  invitationResponse,
  playerLookupResponse,
  pvpHistoryResponse,
  pvpHistorySummary,
  pvpInvitation,
  pvpMatch,
  pvpProblemResponse,
} from './fixtures/pvp';
import { uuid } from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';
const deck = buildSavedDeck();

function renderHub(
  loginWithRedirect = vi.fn().mockResolvedValue(undefined),
  path = '/matches/pvp',
) {
  window.history.replaceState({}, '', path);
  const auth = {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect,
  } as Auth0ContextInterface;
  return render(
    <Auth0Context.Provider value={auth}>
      <Router>
        <PvpHubPage apiBaseUrl={apiBaseUrl} />
      </Router>
    </Auth0Context.Provider>,
  );
}

function installFetch(
  overrides: (
    url: URL,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const override = overrides(url, init);
    if (override !== undefined) return Promise.resolve(override);
    if (url.pathname.endsWith('/decks'))
      return Promise.resolve(deckListResponse([deck]));
    if (url.pathname.endsWith('/invitations'))
      return Promise.resolve(invitationListResponse([]));
    if (url.pathname.endsWith('/history'))
      return Promise.resolve(pvpHistoryResponse([]));
    if (url.pathname.endsWith('/matches/pvp'))
      return Promise.resolve(activePvpListResponse([]));
    return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('player battle hub recovery', () => {
  it('supports cyclic arrow navigation and Home/End across battle tabs without losing focus', async () => {
    const user = userEvent.setup();
    installFetch(() => undefined);
    renderHub();
    const tabs = within(
      await screen.findByRole('tablist', { name: 'Player battle sections' }),
    ).getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(tabs.at(-1)).toHaveFocus();
    expect(tabs.at(-1)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(tabs.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveFocus();
    await user.keyboard('a');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('recovers a deck-loading failure without showing a partially loaded hub', async () => {
    const user = userEvent.setup();
    let reads = 0;
    installFetch((url) => {
      if (url.pathname.endsWith('/decks') && ++reads === 1)
        return pvpProblemResponse('SERVICE_UNAVAILABLE', 503);
    });
    renderHub();
    expect(
      await screen.findByRole('heading', {
        name: 'Couldn’t load Player Battles',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('tab', { name: /^Active/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Player Battles' }),
    ).toBeVisible();
    expect(reads).toBe(2);
  });

  it('offers reauthentication after an unauthorized load and reports a failed redirect', async () => {
    const user = userEvent.setup();
    const login = vi
      .fn()
      .mockRejectedValue(new Error('identity provider unavailable'));
    installFetch((url) =>
      url.pathname.endsWith('/decks')
        ? pvpProblemResponse('AUTHENTICATION_REQUIRED', 401)
        : undefined,
    );
    renderHub(login);
    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(login).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('Couldn’t start sign-in. Try again.'),
    ).toBeVisible();
    expect(
      screen.queryByText('identity provider unavailable'),
    ).not.toBeInTheDocument();
  });

  it('retries a failed active page with the same cursor and deduplicates overlapping results', async () => {
    const user = userEvent.setup();
    const first = activePvpSummary();
    const second = activePvpSummary(
      pvpMatch({
        matchId: uuid(3101),
        opponent: { playerName: 'next_opponent' },
      }),
    );
    let pageReads = 0;
    const fetchMock = installFetch((url) => {
      if (url.pathname.endsWith('/matches/pvp')) {
        if (!url.searchParams.has('cursor'))
          return activePvpListResponse([first], 'active-next');
        pageReads += 1;
        if (pageReads === 1) return Promise.reject(new TypeError('offline'));
        return activePvpListResponse([first, second]);
      }
    });
    renderHub();
    await user.click(
      await screen.findByRole('button', { name: 'Load more active matches' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t connect',
    );
    expect(
      within(
        screen.getByRole('list', { name: 'Active player battles' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: 'Load more active matches' }),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('list', { name: 'Active player battles' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
    expect(
      screen.queryByRole('button', { name: 'Load more active matches' }),
    ).not.toBeInTheDocument();
    const cursors = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.searchParams.has('cursor'));
    expect(cursors.map((url) => url.searchParams.get('cursor'))).toEqual([
      'active-next',
      'active-next',
    ]);
  });

  it('loads later history and records the correct return state when inspecting its result', async () => {
    const user = userEvent.setup();
    const first = pvpHistorySummary();
    const second = pvpHistorySummary(
      pvpMatch({
        matchId: uuid(3102),
        status: 'completed',
        opponent: { playerName: 'later_opponent' },
      }),
    );
    installFetch((url) => {
      if (url.pathname.endsWith('/history'))
        return url.searchParams.has('cursor')
          ? pvpHistoryResponse([second])
          : pvpHistoryResponse([first], 'history-next');
    });
    renderHub(undefined, '/matches/pvp?section=history');
    await user.click(
      await screen.findByRole('button', { name: 'Load more match history' }),
    );
    const history = screen.getByRole('list', {
      name: 'Completed player battles',
    });
    await waitFor(() =>
      expect(within(history).getAllByRole('listitem')).toHaveLength(2),
    );
    const row = within(history).getByText('later_opponent').closest('a')!;
    await user.click(row);
    expect(window.location.pathname).toBe(`/matches/pvp/${second.matchId}`);
    expect(window.history.state.pvpHistoryReturn).toMatchObject({
      loadedCount: 2,
      matchId: second.matchId,
      returnHref: '/matches/pvp?section=history',
    });
  });

  it('reuses a challenge submission ID after an ambiguous failure instead of creating two invitations', async () => {
    const user = userEvent.setup();
    const outgoing = pvpInvitation({ direction: 'outgoing' });
    const submitted: unknown[] = [];
    let created = false;
    installFetch((url, init) => {
      if (url.pathname.endsWith('/players')) return playerLookupResponse();
      if (url.pathname.endsWith('/invitations') && init?.method === 'POST') {
        submitted.push(JSON.parse(String(init.body)));
        if (submitted.length === 1)
          return Promise.reject(new TypeError('connection interrupted'));
        created = true;
        return invitationResponse(outgoing, 201);
      }
      if (
        url.pathname.endsWith('/invitations') &&
        url.searchParams.get('direction') === 'outgoing'
      )
        return invitationListResponse(created ? [outgoing] : []);
    });
    renderHub();
    await user.type(
      await screen.findByLabelText('Player name'),
      'wits_wanderer',
    );
    await user.click(screen.getByRole('button', { name: 'Find player' }));
    await user.selectOptions(await screen.findByLabelText('Deck'), deck.deckId);
    await user.click(screen.getByLabelText(new RegExp(deck.cards[0]!.name)));
    await user.click(screen.getByRole('button', { name: 'Send challenge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can retry safely.',
    );
    await user.click(screen.getByRole('button', { name: 'Retry challenge' }));
    expect(
      await screen.findByText('Challenge sent to wits_wanderer.'),
    ).toBeVisible();
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
    expect(submitted[0]).toMatchObject({
      deckId: deck.deckId,
      initialCreatureId: deck.cards[0]!.ownedCardId,
      opponentPlayerName: 'wits_wanderer',
      submissionId: expect.any(String),
    });
  });

  it('refreshes a stale declined challenge without claiming a successful decline', async () => {
    const user = userEvent.setup();
    let stale = false;
    const invitation = pvpInvitation();
    const fetchMock = installFetch((url, init) => {
      if (url.pathname.endsWith('/decline')) {
        stale = true;
        expect(init?.method).toBe('POST');
        return pvpProblemResponse('PVP_INVITATION_VERSION_CONFLICT', 409);
      }
      if (
        url.pathname.endsWith('/invitations') &&
        url.searchParams.get('direction') === 'incoming'
      )
        return invitationListResponse([
          stale
            ? pvpInvitation({
                respondedAt: '2026-09-05T09:00:00.000Z',
                status: 'expired',
                version: 1,
              })
            : invitation,
        ]);
    });
    renderHub();
    await user.click(
      await screen.findByRole('button', {
        name: 'Decline challenge from wits_wanderer',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Battle updated. Check it and try again.',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: 'Decline challenge from wits_wanderer',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText('Challenge from wits_wanderer declined.'),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/decline'),
      ),
    ).toHaveLength(1);
  });
});
