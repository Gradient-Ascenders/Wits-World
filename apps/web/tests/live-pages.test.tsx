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
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import LiveLobbyPage from '../src/pages/LiveLobbyPage';
import LiveMatchPage from '../src/pages/LiveMatchPage';
import { deckListResponse, buildSavedDeck } from './fixtures/decks';
import { buildCard, buildStarterCards } from './fixtures/cards';
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  rankedProfile,
  queueState,
  rankedSettlement,
  rankedSeason,
  rankedStandings,
  readyMessage,
  spectatorProjection,
  territoryZones,
  ticketResponse,
  transitionMessage,
} from './fixtures/live';

const apiBaseUrl = 'https://api.example.test/api/v1';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emit(value: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal(
    'crypto',
    Object.assign({}, crypto, {
      randomUUID: vi
        .fn()
        .mockReturnValue('70000000-0000-4000-8000-000000000001'),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function authValue(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
}

function renderRoute(path: string, element: ReactNode) {
  window.history.replaceState({}, '', path);
  return render(
    <Auth0Context.Provider value={authValue()}>
      <Router>{element}</Router>
    </Auth0Context.Provider>,
  );
}

function renderLiveMatch() {
  return renderRoute(
    `/matches/live/${LIVE_MATCH_ID}`,
    <Route path="/matches/live/:matchId">
      <LiveMatchPage apiBaseUrl={apiBaseUrl} />
    </Route>,
  );
}

function liveFetch(snapshots: Record<string, unknown>[]) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = new URL(String(input)).pathname;
    if (
      pathname.endsWith(`/matches/live/${LIVE_MATCH_ID}`) &&
      (!init?.method || init.method === 'GET')
    ) {
      const snapshot = snapshots.shift();
      if (!snapshot) throw new Error('No live snapshot fixture remains.');
      return Promise.resolve(projectionResponse(snapshot));
    }
    if (pathname.endsWith('/connection-tickets')) {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve(ticketResponse(body.role));
    }
    if (pathname.endsWith(`/ranked/matches/${LIVE_MATCH_ID}/settlement`)) {
      return Promise.resolve(jsonResponse(rankedSettlement()));
    }
    throw new Error(`Unexpected live request: ${String(input)}`);
  });
}

function rankedLobbyResponse(pathname: string, hasSeason = true) {
  if (pathname.endsWith('/cards/collection')) {
    return jsonResponse({ cards: buildStarterCards(), requestId: 'cards' });
  }
  if (pathname.endsWith('/ranked/me')) {
    return jsonResponse(
      hasSeason
        ? rankedProfile()
        : rankedProfile({
            season: null,
            rating: null,
            wins: 0,
            losses: 0,
            settledMatchCount: 0,
            placementMatchesRemaining: 5,
            provisional: true,
          }),
    );
  }
  if (pathname.endsWith('/ranked/standings')) {
    return hasSeason
      ? jsonResponse(rankedStandings())
      : jsonResponse(
          {
            code: 'RANKED_SEASON_UNAVAILABLE',
            detail: 'No ranked season is active.',
          },
          409,
        );
  }
  if (pathname.endsWith('/territory/zones')) {
    return jsonResponse({ zones: territoryZones() });
  }
  return null;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function connect(projection: Record<string, unknown>) {
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => FakeWebSocket.instances[0]!.emit(readyMessage(projection)));
  await screen.findByText('Connected');
  return FakeWebSocket.instances[0]!;
}

describe('live lobby and battle experience', () => {
  it('loads approved deck artwork while card details are pending and preserves it on failure', async () => {
    const deck = buildSavedDeck({ isSelected: true });
    deck.cards[0] = {
      ...deck.cards[0]!,
      cardDefinitionId: '84790040-6ea8-6155-c4b7-dec3a22ac3ab',
      name: 'Quillip',
    };
    // A matching name alone must never supply art for an unknown definition.
    deck.cards[1] = { ...deck.cards[1]!, name: 'Quillip' };
    let rejectCollection!: (reason: Error) => void;
    const collection = new Promise<Response>((_, reject) => {
      rejectCollection = reject;
    });
    let collectionRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/cards/collection')) {
          if (++collectionRequests === 1) return collection;
          return Promise.resolve(
            jsonResponse({
              cards: buildStarterCards().map((card, index) => ({
                ...card,
                cardDefinitionId: deck.cards[index]!.cardDefinitionId,
                name: deck.cards[index]!.name,
                imageUrl: '/cards/ciphra.webp',
              })),
              requestId: 'recovered-card-details',
            }),
          );
        }
        if (pathname.endsWith('/decks'))
          return Promise.resolve(deckListResponse([deck]));
        if (pathname.endsWith('/ranked/queue'))
          return Promise.resolve(jsonResponse(queueState()));
        if (pathname.endsWith('/ranked/seasons/current'))
          return Promise.resolve(jsonResponse({ season: rankedSeason() }));
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );
    const { container } = renderRoute(
      '/matches/live',
      <LiveLobbyPage apiBaseUrl={apiBaseUrl} />,
    );
    await screen.findByRole('heading', { name: deck.name });
    const image = container.querySelector('.live-deck-fan__card--1 img');
    expect(image).toHaveAttribute('src', '/cards/quillip.webp');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('srcset', expect.stringContaining('192w'));
    expect(container.querySelector('.live-deck-fan__card--2 img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Find battle' })).toBeEnabled();
    // Artwork renders before the authenticated collection fetch starts.
    // Reject only after fetch has returned this deferred response to its caller.
    await waitFor(() => expect(collectionRequests).toBe(1));
    await act(async () =>
      rejectCollection(new Error('Collection unavailable')),
    );
    expect(
      await screen.findByText('Card details couldn’t load.'),
    ).toBeVisible();
    expect(container.querySelector('.live-deck-fan__card--1 img')).toBe(image);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const card = await screen.findByRole('button', {
      name: 'View Quillip details, card 1',
    });
    expect(card.querySelector('img')).toHaveAttribute(
      'src',
      '/cards/ciphra.webp',
    );
    fireEvent.click(card);
    expect(screen.getByRole('dialog', { name: 'Quillip' })).toBeVisible();
    expect(screen.getByText('91')).toBeVisible();
  });

  it('enters ranked search with only the selected deck and opens private spectator links', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true, name: 'Braamfontein Set' });
    const otherDeck = buildSavedDeck({ name: 'Unselected deck' });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/cards/collection')) {
        return Promise.resolve(
          jsonResponse({
            cards: [
              buildCard(99, {
                cardDefinitionId: deck.cards[0]!.cardDefinitionId,
                hp: 999,
              }),
              ...buildStarterCards().reverse(),
            ],
            requestId: 'active-deck-cards',
          }),
        );
      }
      if (pathname.endsWith('/decks')) {
        return Promise.resolve(deckListResponse([otherDeck, deck]));
      }
      if (pathname.endsWith('/ranked/seasons/current')) {
        return Promise.resolve(
          new Response(JSON.stringify({ season: rankedSeason() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (pathname.endsWith('/ranked/queue') && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              queueState({
                status: 'searching',
                queueEntryId: '71000000-0000-4000-8000-000000000001',
                joinedAt: '2026-09-25T12:00:00.000Z',
                leaseExpiresAt: '2026-09-25T12:00:30.000Z',
                searchRange: 100,
              }),
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (pathname.endsWith('/ranked/queue')) {
        return Promise.resolve(
          new Response(JSON.stringify(queueState()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      const supplemental = rankedLobbyResponse(pathname);
      if (supplemental) return Promise.resolve(supplemental);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Live Ranked' }),
    ).toBeVisible();
    expect(screen.getByText('Season rating').parentElement).toHaveTextContent(
      /1\s248/,
    );
    expect(screen.getByText('7 wins · 3 losses')).toBeVisible();
    expect(screen.getByRole('heading', { name: deck.name })).toBeVisible();
    expect(screen.queryByText(otherDeck.name)).not.toBeInTheDocument();
    const firstCard = await screen.findByRole('button', {
      name: `View ${deck.cards[0]!.name} details, card 1`,
    });
    expect(
      screen
        .getAllByRole('button', { name: /^View .* details, card/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(
      deck.cards.map(
        (card) => `View ${card.name} details, card ${card.position}`,
      ),
    );
    await user.click(firstCard);
    expect(
      screen.getByRole('dialog', { name: deck.cards[0]!.name }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Moves' })).toBeVisible();
    expect(screen.getByText('91')).toBeVisible();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(firstCard).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('dialog', { name: deck.cards[0]!.name }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: `Close ${deck.cards[0]!.name} details`,
      }),
    );
    expect(screen.getByRole('link', { name: 'Change deck' })).toHaveAttribute(
      'href',
      '/collection/decks',
    );
    const playTab = screen.getByRole('tab', { name: 'Play' });
    const standingsTab = screen.getByRole('tab', { name: 'Standings' });
    const watchTab = screen.getByRole('tab', { name: 'Watch' });
    expect(playTab).toHaveAttribute('aria-selected', 'true');
    expect(standingsTab).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.queryByRole('heading', { name: 'Season standings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/one minute per turn/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find battle' }));
    expect(await screen.findByText('Finding opponent…')).toBeVisible();
    expect(screen.queryByText(/rating range/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Change deck' }),
    ).not.toBeInTheDocument();
    const join = fetchMock.mock.calls.find(
      ([input, init]) =>
        new URL(String(input)).pathname.endsWith('/ranked/queue') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(join?.[1]?.body))).toEqual({
      deckId: deck.deckId,
    });

    await user.click(standingsTab);
    expect(window.location.search).toBe('?tab=standings');
    expect(screen.getByRole('button', { name: 'Cancel search' })).toBeEnabled();
    expect(
      screen.getByRole('heading', { name: 'Season standings' }),
    ).toBeVisible();
    standingsTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(watchTab).toHaveAttribute('aria-selected', 'true');
    expect(watchTab).toHaveFocus();
    expect(window.location.search).toBe('?tab=watch');

    await navigator.clipboard.writeText(
      `https://witsworld.co.za/matches/live/${LIVE_MATCH_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Paste and watch' }));
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/live/${LIVE_MATCH_ID}`),
    );
  });

  it('shows deck selection without a pretend hand when no deck is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks'))
          return Promise.resolve(deckListResponse([buildSavedDeck()]));
        if (pathname.endsWith('/ranked/queue'))
          return Promise.resolve(jsonResponse(queueState()));
        if (pathname.endsWith('/ranked/seasons/current'))
          return Promise.resolve(jsonResponse({ season: rankedSeason() }));
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );
    const { container } = renderRoute(
      '/matches/live',
      <LiveLobbyPage apiBaseUrl={apiBaseUrl} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'No deck selected' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Select deck' })).toHaveAttribute(
      'href',
      '/collection/decks',
    );
    expect(
      screen.queryByRole('button', { name: 'Find battle' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.live-deck-fan')).toBeNull();
  });

  it('requests a fresh location only after territory contesting is selected', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    const locationClaimProvider = vi.fn().mockResolvedValue({
      accuracyMetres: 18,
      acquiredAt: '2026-09-25T12:00:00.000Z',
      latitude: -26.1919,
      longitude: 28.0301,
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/decks')) {
        return Promise.resolve(deckListResponse([deck]));
      }
      if (pathname.endsWith('/ranked/seasons/current')) {
        return Promise.resolve(jsonResponse({ season: rankedSeason() }));
      }
      if (pathname.endsWith('/ranked/queue') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(queueState({ status: 'searching' })),
        );
      }
      if (pathname.endsWith('/ranked/queue')) {
        return Promise.resolve(jsonResponse(queueState()));
      }
      const supplemental = rankedLobbyResponse(pathname);
      if (supplemental) return Promise.resolve(supplemental);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      '/matches/live',
      <LiveLobbyPage
        apiBaseUrl={apiBaseUrl}
        locationClaimProvider={locationClaimProvider}
      />,
    );

    const contest = await screen.findByRole('checkbox', {
      name: /contest territory/i,
    });
    expect(locationClaimProvider).not.toHaveBeenCalled();
    await user.click(contest);
    expect(
      screen.queryByRole('combobox', { name: 'Territory' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Find territory battle',
      }),
    );

    await waitFor(() => expect(locationClaimProvider).toHaveBeenCalledOnce());
    const join = fetchMock.mock.calls.find(
      ([input, init]) =>
        new URL(String(input)).pathname.endsWith('/ranked/queue') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(join?.[1]?.body))).toEqual({
      deckId: deck.deckId,
      territoryClaim: {
        accuracyMetres: 18,
        acquiredAt: '2026-09-25T12:00:00.000Z',
        latitude: -26.1919,
        longitude: 28.0301,
        zoneId: territoryZones()[0]!.zoneId,
      },
    });
    expect(await screen.findByText(/contesting library lawns/i)).toBeVisible();
  });

  it('shows when no active territory is detected at the current location', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    const locationClaimProvider = vi.fn().mockResolvedValue({
      accuracyMetres: 12,
      acquiredAt: '2026-09-25T12:00:00.000Z',
      latitude: -26.2,
      longitude: 28.04,
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/decks')) {
        return Promise.resolve(deckListResponse([deck]));
      }
      if (pathname.endsWith('/ranked/seasons/current')) {
        return Promise.resolve(jsonResponse({ season: rankedSeason() }));
      }
      if (pathname.endsWith('/ranked/queue')) {
        if (init?.method === 'POST') {
          throw new Error(
            'Queue request must not be sent without a territory.',
          );
        }
        return Promise.resolve(jsonResponse(queueState()));
      }
      const supplemental = rankedLobbyResponse(pathname);
      if (supplemental) return Promise.resolve(supplemental);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      '/matches/live',
      <LiveLobbyPage
        apiBaseUrl={apiBaseUrl}
        locationClaimProvider={locationClaimProvider}
      />,
    );

    await user.click(
      await screen.findByRole('checkbox', {
        name: /contest territory/i,
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Find territory battle',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No active territory found. Move inside one or turn off Contest territory.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          new URL(String(input)).pathname.endsWith('/ranked/queue') &&
          init?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('explains an expired search without implying a ranked penalty', async () => {
    const deck = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks')) {
          return Promise.resolve(deckListResponse([deck]));
        }
        if (pathname.endsWith('/ranked/seasons/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ season: rankedSeason() }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (pathname.endsWith('/ranked/queue')) {
          return Promise.resolve(
            new Response(JSON.stringify(queueState({ status: 'expired' })), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByText('Search expired', { selector: 'strong' }),
    ).toBeVisible();
    expect(screen.getByText(/your rating is unchanged/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Find battle' })).toBeEnabled();
  });

  it('keeps recovery guidance visible when matchmaking refresh is interrupted', async () => {
    const deck = buildSavedDeck({ isSelected: true });
    let queueReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks')) {
          return Promise.resolve(deckListResponse([deck]));
        }
        if (pathname.endsWith('/ranked/seasons/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ season: rankedSeason() }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (pathname.endsWith('/ranked/queue')) {
          queueReads += 1;
          if (queueReads > 1) {
            return Promise.reject(new TypeError('Connection interrupted'));
          }
          return Promise.resolve(
            new Response(
              JSON.stringify(
                queueState({
                  status: 'searching',
                  queueEntryId: '71000000-0000-4000-8000-000000000001',
                  joinedAt: '2026-09-25T12:00:00.000Z',
                  leaseExpiresAt: '2026-09-25T12:00:30.000Z',
                  searchRange: 100,
                }),
              ),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(await screen.findByText('Finding opponent…')).toBeVisible();
    expect(
      await screen.findByText('Reconnecting…', undefined, {
        timeout: 3_500,
      }),
    ).toBeVisible();
    expect(screen.getByText(/keep this page open/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('keeps match acceptance reachable across lobby tabs with the real deadline and cooldown', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks')) {
          return Promise.resolve(deckListResponse([deck]));
        }
        if (pathname.endsWith('/ranked/seasons/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ season: rankedSeason() }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (pathname.endsWith('/ranked/queue')) {
          return Promise.resolve(
            new Response(
              JSON.stringify(
                queueState({
                  status: 'proposed',
                  proposalId: '71000000-0000-4000-8000-000000000002',
                  acceptanceDeadline: '2026-09-25T12:00:20.000Z',
                }),
              ),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('heading', { name: 'Opponent found' }),
    ).toBeVisible();
    expect(screen.getByText(/adds a 30-second wait/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    for (const tab of ['Standings', 'Watch']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(
        screen.getByRole('heading', { name: 'Opponent found' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    }
  });

  it('refreshes every season projection when a new season becomes active', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    let hasSeason = false;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/decks')) {
        return Promise.resolve(deckListResponse([deck]));
      }
      if (pathname.endsWith('/ranked/queue')) {
        return Promise.resolve(
          jsonResponse(
            queueState({
              seasonId: hasSeason ? rankedSeason().seasonId : null,
            }),
          ),
        );
      }
      if (pathname.endsWith('/ranked/seasons/current')) {
        return Promise.resolve(
          jsonResponse({ season: hasSeason ? rankedSeason() : null }),
        );
      }
      const supplemental = rankedLobbyResponse(pathname, hasSeason);
      if (supplemental) return Promise.resolve(supplemental);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByText('No active season. Check back later.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Find battle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ranked season' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Refresh season' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(screen.getByText('Standings return next season')).toBeVisible();

    hasSeason = true;
    await user.click(screen.getByRole('tab', { name: 'Play' }));
    await user.click(screen.getByRole('button', { name: 'Refresh season' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Braamfontein Test Season',
      }),
    ).toBeVisible();
    expect(screen.getByText('Season rating').parentElement).toHaveTextContent(
      /1\s248/,
    );
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(await screen.findByText('CampusFox')).toBeVisible();

    for (const path of [
      '/ranked/seasons/current',
      '/ranked/me',
      '/ranked/standings',
    ]) {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          new URL(String(input)).pathname.endsWith(path),
        ),
      ).toHaveLength(2);
    }
  });

  it('refreshes at the season boundary and hides mismatched rollover snapshots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    const deck = buildSavedDeck({ isSelected: true });
    const seasonA = rankedSeason({
      activeEndsAt: '2026-09-26T12:00:01.000Z',
      name: 'Season A',
      seasonId: '61000000-0000-4000-8000-000000000001',
    });
    const seasonB = rankedSeason({
      activeEndsAt: '2026-10-26T12:00:00.000Z',
      name: 'Season B',
      seasonId: '61000000-0000-4000-8000-000000000002',
    });
    let refreshCycle = 0;
    const projectedSeason = () => (refreshCycle === 0 ? seasonA : seasonB);
    const projectedProfileSeason = () =>
      refreshCycle === 1 ? seasonA : projectedSeason();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/decks')) {
        return Promise.resolve(deckListResponse([deck]));
      }
      if (pathname.endsWith('/ranked/queue')) {
        return Promise.resolve(
          jsonResponse(queueState({ seasonId: projectedSeason().seasonId })),
        );
      }
      if (pathname.endsWith('/ranked/seasons/current')) {
        return Promise.resolve(jsonResponse({ season: projectedSeason() }));
      }
      if (pathname.endsWith('/ranked/me')) {
        const projected = projectedProfileSeason();
        return Promise.resolve(
          jsonResponse(
            rankedProfile({
              rating: projected.seasonId === seasonA.seasonId ? 1_111 : 2_222,
              season: projected,
            }),
          ),
        );
      }
      if (pathname.endsWith('/ranked/standings')) {
        const projected = projectedProfileSeason();
        return Promise.resolve(
          jsonResponse(
            rankedStandings({
              entries: [
                {
                  losses: 1,
                  playerName:
                    projected.seasonId === seasonA.seasonId
                      ? 'SeasonAPlayer'
                      : 'SeasonBPlayer',
                  rank: 1,
                  rating:
                    projected.seasonId === seasonA.seasonId ? 1_111 : 2_222,
                  settledMatchCount: 6,
                  wins: 5,
                },
              ],
              season: projected,
            }),
          ),
        );
      }
      if (pathname.endsWith('/territory/zones')) {
        return Promise.resolve(jsonResponse({ zones: territoryZones() }));
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: 'Season A' })).toBeVisible();
    expect(screen.getByText('Season rating').parentElement).toHaveTextContent(
      /1\s111/,
    );

    refreshCycle = 1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole('heading', { name: 'Season B' })).toBeVisible();
    expect(
      screen.getByText('Your record hasn’t updated for this season.'),
    ).toBeVisible();
    expect(screen.queryByText(/1\s111/)).not.toBeInTheDocument();
    expect(screen.queryByText(/wins ·.*losses/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(
      screen.getByText('Standings haven’t updated for this season'),
    ).toBeVisible();
    expect(screen.queryByText('SeasonAPlayer')).not.toBeInTheDocument();

    refreshCycle = 2;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh record' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Season rating').parentElement).toHaveTextContent(
      /2\s222/,
    );
    expect(screen.getByText('SeasonBPlayer')).toBeVisible();
    expect(screen.queryByText('SeasonAPlayer')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        new URL(String(input)).pathname.endsWith('/ranked/seasons/current'),
      ),
    ).toHaveLength(3);
  });

  it('shows a safe ranked conflict beside the restored join control', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks')) {
          return Promise.resolve(deckListResponse([deck]));
        }
        if (pathname.endsWith('/ranked/seasons/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ season: rankedSeason() }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (pathname.endsWith('/ranked/queue') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: 'RANKED_COOLDOWN',
                detail: 'Ranked matchmaking is temporarily unavailable.',
                requestId: 'ranked-conflict-request',
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (pathname.endsWith('/ranked/queue')) {
          return Promise.resolve(
            new Response(JSON.stringify(queueState()), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        const supplemental = rankedLobbyResponse(pathname);
        if (supplemental) return Promise.resolve(supplemental);
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);
    const join = await screen.findByRole('button', {
      name: 'Find battle',
    });
    await user.click(join);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ranked matchmaking is temporarily unavailable.',
      ),
    );
    expect(join).toBeEnabled();
  });

  it('locks immediately, prevents duplicate actions, and reconciles a stale action from authority', async () => {
    const initial = participantProjection();
    const recovered = participantProjection({
      version: 5,
      currentActor: 'opponent',
      legalActions: [],
      history: [
        ...(initial.history as unknown[]),
        {
          type: 'participant_action',
          side: 'playerOne',
          action: {
            type: 'use_move',
            moveId: '12000000-0000-4000-8000-000000000001',
          },
          defeatedCreatureId: null,
          winner: null,
          turnEnded: true,
          effects: [],
        },
      ],
      lastAction: {
        type: 'participant_action',
        side: 'playerOne',
        action: {
          type: 'use_move',
          moveId: '12000000-0000-4000-8000-000000000001',
        },
        defeatedCreatureId: null,
        winner: null,
        turnEnded: true,
        effects: [],
      },
    });
    vi.stubGlobal('fetch', liveFetch([initial, recovered]));
    renderLiveMatch();
    const socket = await connect(initial);
    const action = await screen.findByRole('button', {
      name: /Knowledge Strike 1/i,
    });

    fireEvent.click(action);
    fireEvent.click(action);
    expect(socket.sent).toHaveLength(1);
    expect(action).toBeDisabled();
    expect(screen.getByText('Submitting action')).toBeVisible();

    const submitted = JSON.parse(socket.sent[0]!);
    act(() =>
      socket.emit({
        protocolVersion: 1,
        type: 'error',
        messageId: submitted.messageId,
        code: 'LIVE_VERSION_CONFLICT',
        detail: 'The live match advanced before this action.',
        retryable: true,
        serverTime: '2026-09-25T12:00:04.000Z',
      }),
    );

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    act(() => FakeWebSocket.instances[1]!.emit(readyMessage(recovered)));
    expect(await screen.findByText('Battle recovered')).toBeVisible();
    expect(screen.getAllByText("OPPONENT'S TURN").length).toBeGreaterThan(0);
    expect(screen.getByText('You used a move.')).toBeVisible();
  });

  it('recovers after transport loss, reports dropout and timeout, then renders the terminal server result', async () => {
    const initial = participantProjection();
    const restored = participantProjection({ version: 4 });
    const completed = participantProjection({
      version: 5,
      status: 'completed',
      phase: 'completed',
      currentActor: null,
      turnDeadline: null,
      legalActions: [],
      outcome: 'win',
      completionReason: 'abandonment_forfeit',
      completedAt: '2026-09-25T12:01:00.000Z',
      consecutiveTimeouts: { self: 0, opponent: 3 },
      history: [
        {
          type: 'abandonment_forfeit',
          loser: 'playerTwo',
          winner: 'playerOne',
        },
      ],
      lastAction: {
        type: 'abandonment_forfeit',
        loser: 'playerTwo',
        winner: 'playerOne',
      },
    });
    vi.stubGlobal('fetch', liveFetch([initial, restored]));
    renderLiveMatch();
    const first = await connect(initial);

    act(() =>
      first.emit({
        protocolVersion: 1,
        type: 'presence.changed',
        eventId: '72000000-0000-4000-8000-000000000001',
        version: 4,
        serverTime: '2026-09-25T12:00:05.000Z',
        participants: {
          playerOneConnected: true,
          playerTwoConnected: false,
        },
        spectatorCount: 1,
      }),
    );
    expect(await screen.findByText('Opponent connection lost')).toBeVisible();
    expect(screen.getByText(/turn timer keeps running/i)).toBeVisible();

    act(() => first.serverClose());
    expect(
      await screen.findByText('Reconnecting', {
        selector: '.live-status-banner strong',
      }),
    ).toBeVisible();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    act(() => FakeWebSocket.instances[1]!.emit(readyMessage(restored)));
    expect(await screen.findByText('Battle recovered')).toBeVisible();

    act(() =>
      FakeWebSocket.instances[1]!.emit(transitionMessage(completed, 4)),
    );
    expect(
      await screen.findByRole('heading', { name: 'You won the live battle' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(/three consecutive missed decisions/i).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByRole('heading', { name: 'Season settlement' }),
    ).toBeVisible();
    expect(screen.getByText('+24')).toBeVisible();
    expect(screen.getByText('+30 influence awarded.')).toBeVisible();
  });

  it('keeps spectator mode unmistakably read-only and renders only the public projection', async () => {
    const spectator = spectatorProjection();
    vi.stubGlobal('fetch', liveFetch([spectator]));
    renderLiveMatch();
    await connect(spectator);

    expect(screen.getAllByText('WATCHING — READ ONLY').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole('heading', { name: 'Watching live — read only' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(/public battlefield and battle activity/i),
    ).toHaveLength(2);
    expect(screen.queryByText('Bench')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Forfeit battle/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Choose your action/i }),
    ).not.toBeInTheDocument();
  });
});
