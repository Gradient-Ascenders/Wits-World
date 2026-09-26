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
import {
  LIVE_MATCH_ID,
  participantProjection,
  projectionResponse,
  queueState,
  rankedSeason,
  readyMessage,
  spectatorProjection,
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
    throw new Error(`Unexpected live request: ${String(input)}`);
  });
}

async function connect(projection: Record<string, unknown>) {
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  act(() => FakeWebSocket.instances[0]!.emit(readyMessage(projection)));
  await screen.findByText('Connected');
  return FakeWebSocket.instances[0]!;
}

describe('live lobby and battle experience', () => {
  it('enters ranked search with only the selected deck and opens private spectator links', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck({ isSelected: true, name: 'Braamfontein Set' });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Live Ranked' }),
    ).toBeVisible();
    expect(screen.getByText(/one minute for each decision/i)).toBeVisible();
    expect(
      screen.getByText(/first five results each season are placement matches/i),
    ).toBeVisible();
    expect(
      screen.getByText(/leaving while searching has no cooldown/i),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Find ranked battle' }),
    );
    expect(await screen.findByText('Searching for an opponent')).toBeVisible();
    expect(screen.getByText(/no cooldown or rating change/i)).toBeVisible();
    const join = fetchMock.mock.calls.find(
      ([input, init]) =>
        new URL(String(input)).pathname.endsWith('/ranked/queue') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(join?.[1]?.body))).toEqual({
      deckId: deck.deckId,
    });

    await navigator.clipboard.writeText(
      `https://witsworld.co.za/matches/live/${LIVE_MATCH_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Paste and watch' }));
    expect(window.location.pathname).toBe(`/matches/live/${LIVE_MATCH_ID}`);
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
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(await screen.findByText('Your search expired')).toBeVisible();
    expect(screen.getByText(/your rating did not change/i)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Find ranked battle' }),
    ).toBeEnabled();
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
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(await screen.findByText('Searching for an opponent')).toBeVisible();
    expect(
      await screen.findByText('Checking your place in matchmaking', undefined, {
        timeout: 3_500,
      }),
    ).toBeVisible();
    expect(screen.getByText(/do not need to join again/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeEnabled();
  });

  it('explains the acceptance window and cooldown before a ranked battle begins', async () => {
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
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('heading', { name: 'Opponent found' }),
    ).toBeVisible();
    expect(
      screen.getByText(/pauses matchmaking for 30 seconds/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept match' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
  });

  it('disables ranked entry with visible guidance when no season is active', async () => {
    const deck = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname.endsWith('/decks')) {
          return Promise.resolve(deckListResponse([deck]));
        }
        if (pathname.endsWith('/ranked/queue')) {
          return Promise.resolve(
            new Response(JSON.stringify(queueState({ seasonId: null })), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (pathname.endsWith('/ranked/seasons/current')) {
          return Promise.resolve(
            new Response(JSON.stringify({ season: null }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByText(
        'No ranked season is active. Matchmaking will open when the next season begins.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Find ranked battle' }),
    ).toBeDisabled();
    expect(screen.getByText('No active season')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Check season again' }),
    ).toBeEnabled();
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
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );

    renderRoute('/matches/live', <LiveLobbyPage apiBaseUrl={apiBaseUrl} />);
    const join = await screen.findByRole('button', {
      name: 'Find ranked battle',
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
