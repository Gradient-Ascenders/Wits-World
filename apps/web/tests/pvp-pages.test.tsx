import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import PvpHubPage from '../src/pages/PvpHubPage';
import PvpMatchPage from '../src/pages/PvpMatchPage';
import { deckListResponse, buildSavedDeck } from './fixtures/decks';
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
  PVP_MATCH_ID,
  pvpMatchResponse,
  pvpProblemResponse,
} from './fixtures/pvp';
import { uuid } from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.useRealTimers();
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

function renderPvpMatch() {
  return renderRoute(
    `/matches/pvp/${PVP_MATCH_ID}`,
    <Route path="/matches/pvp/:matchId">
      <PvpMatchPage apiBaseUrl={apiBaseUrl} />
    </Route>,
  );
}

function hubResponses({
  active = [],
  history = [],
  incoming = [],
  outgoing = [],
}: {
  active?: ReturnType<typeof activePvpSummary>[];
  history?: ReturnType<typeof pvpHistorySummary>[];
  incoming?: ReturnType<typeof pvpInvitation>[];
  outgoing?: ReturnType<typeof pvpInvitation>[];
} = {}) {
  return [
    invitationListResponse(incoming),
    invitationListResponse(outgoing),
    activePvpListResponse(active),
    pvpHistoryResponse(history),
    deckListResponse([buildSavedDeck()]),
  ];
}

describe('asynchronous player battle lobby', () => {
  it('uses the compact Player Battles shell while initial data is loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>(() => undefined)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Player Battles' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Challenge another explorer and take turns within 24 hours.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to Battles' }),
    ).toHaveAttribute('href', '/matches');
    const navigation = screen.getByRole('navigation', {
      name: 'Player battle sections',
    });
    for (const section of ['Invitations', 'Active', 'History']) {
      expect(within(navigation).getByText(section)).toBeVisible();
    }
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading player battles…',
    );
    expect(document.body).not.toHaveTextContent(/PvP hub|Loading your PvP/i);
    expect(document.querySelector('.match-state-panel')).toBeNull();
  });

  it('keeps tab and disclosure aria-controls targets mounted and synchronized', async () => {
    const user = userEvent.setup();
    const responses = hubResponses();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);

    const challengeButton = await screen.findByRole('button', {
      name: 'Challenge a player',
    });
    const challengePanelId = challengeButton.getAttribute('aria-controls')!;
    const challengePanel = document.getElementById(challengePanelId)!;
    expect(challengePanel).not.toBeNull();
    expect(challengeButton).toHaveAttribute('aria-expanded', 'false');
    expect(challengePanel.hidden).toBe(true);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      const panelId = tab.getAttribute('aria-controls')!;
      const panel = document.getElementById(panelId)!;
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect(panel.hidden).toBe(tab.getAttribute('aria-selected') !== 'true');
    }

    await user.click(screen.getByRole('tab', { name: 'Active 0' }));
    expect(document.getElementById('invitations-panel')!.hidden).toBe(true);
    expect(document.getElementById('active-panel')!.hidden).toBe(false);
    expect(document.getElementById('history-panel')!.hidden).toBe(true);

    await user.click(challengeButton);
    expect(challengeButton).toHaveAttribute('aria-expanded', 'true');
    expect(challengePanel.hidden).toBe(false);
    await user.click(challengeButton);
    expect(challengeButton).toHaveAttribute('aria-expanded', 'false');
    expect(challengePanel.hidden).toBe(true);
  });

  it('switches between invitations, active matches, and history', async () => {
    const user = userEvent.setup();
    const incoming = [
      pvpInvitation(),
      pvpInvitation({
        invitationId: uuid(2501),
        respondedAt: '2026-09-05T09:00:00.000Z',
        status: 'declined',
      }),
      pvpInvitation({
        invitationId: uuid(2502),
        respondedAt: '2026-09-06T08:00:00.000Z',
        status: 'expired',
      }),
    ];
    const outgoing = [
      pvpInvitation({ direction: 'outgoing', invitationId: uuid(2503) }),
      pvpInvitation({
        direction: 'outgoing',
        invitationId: uuid(2504),
        respondedAt: '2026-09-05T10:00:00.000Z',
        status: 'invalidated',
      }),
      pvpInvitation({
        direction: 'outgoing',
        invitationId: uuid(2505),
        matchId: PVP_MATCH_ID,
        respondedAt: '2026-09-05T10:00:00.000Z',
        status: 'accepted',
      }),
    ];
    const responses = hubResponses({
      active: [activePvpSummary()],
      history: [pvpHistorySummary()],
      incoming,
      outgoing,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('button', { name: 'Challenge a player' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Player Battles' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to Battles' }),
    ).toHaveAttribute('href', '/matches');
    expect(document.body).not.toHaveTextContent(/PvP hub|Asynchronous PvP/i);
    const invitationsTab = screen.getByRole('tab', {
      name: 'Invitations 1',
    });
    expect(invitationsTab).toHaveAttribute('aria-selected', 'true');
    const incomingList = screen.getByRole('list', {
      name: 'Incoming player battle invitations',
    });
    const sentList = screen.getByRole('list', {
      name: 'Sent player battle challenges',
    });
    expect(within(incomingList).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(incomingList).getByRole('button', { name: 'Accept' }),
    ).toBeVisible();
    expect(within(incomingList).getByText('Declined')).toBeVisible();
    expect(within(incomingList).getByText('Expired')).toBeVisible();
    expect(within(sentList).getByText('Unavailable')).toBeVisible();
    expect(within(sentList).getByText('Accepted')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your matches' })).toBeNull();

    const activeTab = screen.getByRole('tab', { name: 'Active 1' });
    await user.click(activeTab);
    expect(screen.getByRole('heading', { name: 'Your matches' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      `/matches/pvp/${PVP_MATCH_ID}`,
    );
    expect(screen.getByText('Your turn')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Invitations' })).toBeNull();

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'History 1' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Recent player battles' }),
    ).toBeVisible();
    expect(screen.getByText('Won')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your matches' })).toBeNull();
  });

  it('uses exact public Player Name lookup and API-validated deck/Creature challenge intent', async () => {
    const user = userEvent.setup();
    const deck = buildSavedDeck();
    const initial = hubResponses();
    const sent = pvpInvitation({ direction: 'outgoing' });
    const refreshed = hubResponses({ outgoing: [sent] });
    const fetchMock = vi.fn();
    for (const response of initial) fetchMock.mockResolvedValueOnce(response);
    fetchMock
      .mockResolvedValueOnce(playerLookupResponse())
      .mockResolvedValueOnce(invitationResponse(sent, 201));
    for (const response of refreshed) fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', { name: 'Challenge a player' }),
    );
    await screen.findByRole('heading', { name: 'Challenge a player' });
    await user.type(
      screen.getByLabelText('Exact Player Name'),
      'wits_wanderer',
    );
    await user.click(screen.getByRole('button', { name: 'Find player' }));
    expect(
      await screen.findAllByText(/is available to challenge/),
    ).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Battle deck'), deck.deckId);
    await user.click(screen.getByLabelText(new RegExp(deck.cards[0]!.name)));
    await user.click(screen.getByRole('button', { name: 'Send challenge' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(11));
    const body = JSON.parse(String(fetchMock.mock.calls[6]![1]!.body));
    expect(body).toEqual({
      deckId: deck.deckId,
      initialCreatureId: deck.cards[0]!.ownedCardId,
      opponentPlayerName: 'wits_wanderer',
      submissionId: expect.any(String),
    });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('winner');
  });

  it('loads later invitation pages only after explicit cursor navigation', async () => {
    const user = userEvent.setup();
    const first = pvpInvitation();
    const second = pvpInvitation({ invitationId: uuid(2510) });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(invitationListResponse([first], 'next-page'))
      .mockResolvedValueOnce(invitationListResponse([]))
      .mockResolvedValueOnce(activePvpListResponse([]))
      .mockResolvedValueOnce(pvpHistoryResponse([]))
      .mockResolvedValueOnce(deckListResponse([buildSavedDeck()]))
      .mockResolvedValueOnce(invitationListResponse([second]));
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Load more incoming invitations',
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const nextPageUrl = new URL(String(fetchMock.mock.calls[5]![0]));
    expect(nextPageUrl.searchParams.get('cursor')).toBe('next-page');
    expect(nextPageUrl.searchParams.get('direction')).toBe('incoming');
    expect(nextPageUrl.searchParams.get('limit')).toBe('50');
    expect(
      within(
        screen.getByRole('list', {
          name: 'Incoming player battle invitations',
        }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2);
  });

  it('prevents duplicate accept clicks and supports expiry recovery', async () => {
    const user = userEvent.setup();
    const invitation = pvpInvitation();
    const deck = buildSavedDeck();
    let resolveAccept!: (response: Response) => void;
    const acceptResponse = new Promise<Response>((resolve) => {
      resolveAccept = resolve;
    });
    const fetchMock = vi.fn();
    for (const response of hubResponses({ incoming: [invitation] })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockReturnValueOnce(acceptResponse);
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await screen.findByRole('heading', { name: 'Incoming' });
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.selectOptions(screen.getByLabelText('Battle deck'), deck.deckId);
    await user.click(screen.getByLabelText(new RegExp(deck.cards[0]!.name)));
    const accept = screen.getByRole('button', { name: 'Accept challenge' });
    await user.dblClick(accept);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    await act(async () => {
      resolveAccept(pvpProblemResponse('PVP_INVITATION_EXPIRED', 409));
      await acceptResponse;
    });
    expect(await screen.findByText(/invitation expired/i)).toBeVisible();
  });

  it('declines an incoming invitation once and refreshes its server state', async () => {
    const user = userEvent.setup();
    const invitation = pvpInvitation();
    const declined = pvpInvitation({
      respondedAt: '2026-09-05T09:00:00.000Z',
      status: 'declined',
      version: 1,
    });
    let resolveDecline!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveDecline = resolve;
    });
    const fetchMock = vi.fn();
    for (const response of hubResponses({ incoming: [invitation] })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockReturnValueOnce(pending);
    for (const response of hubResponses({ incoming: [declined] }).slice(0, 4)) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    const decline = await screen.findByRole('button', {
      name: 'Decline challenge from wits_wanderer',
    });
    await user.dblClick(decline);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    await act(async () => {
      resolveDecline(invitationResponse(declined));
      await pending;
    });
    expect(
      await screen.findByText('Challenge from wits_wanderer declined.'),
    ).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    expect(JSON.parse(String(fetchMock.mock.calls[5]![1]!.body))).toEqual({
      expectedVersion: 0,
      submissionId: expect.any(String),
    });
  });
});

describe('asynchronous PvP battle', () => {
  it('renders own turn legal move and Power actions without hidden opponent cards', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pvpMatchResponse(pvpMatch())),
    );
    renderPvpMatch();

    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: /^Power/ }));
    expect(
      screen.getByRole('button', { name: /Campus Renewal 1/ }),
    ).toBeEnabled();
    await user.click(screen.getByText('Opponent reserve'));
    expect(screen.getByText(/Only aggregate counts/)).toBeVisible();
    expect(screen.queryByText(/opponent secret/i)).not.toBeInTheDocument();
  });

  it('prevents duplicate action submission while a mutation is unresolved', async () => {
    const user = userEvent.setup();
    const initial = pvpMatch();
    let resolveAction!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveAction = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(initial))
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    const move = await screen.findByRole('button', {
      name: /Knowledge Strike 1/,
    });
    await user.dblClick(move);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(move).toBeDisabled();

    await act(async () => {
      resolveAction(
        pvpMatchResponse({
          ...initial,
          currentActor: 'opponent',
          legalActions: [],
          version: 4,
        }),
      );
      await pending;
    });
    expect(
      await screen.findByRole('heading', { name: 'Opponent’s turn' }),
    ).toBeVisible();
  });

  it('polls while waiting and reconciles to a new own turn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    const opponentTurn = pvpMatch({
      currentActor: 'opponent',
      legalActions: [],
    });
    const ownTurn = pvpMatch({ version: 4 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(opponentTurn))
      .mockResolvedValueOnce(pvpMatchResponse(ownTurn));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await act(async () => Promise.resolve());
    expect(
      screen.getByRole('heading', { name: 'Opponent’s turn' }),
    ).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reconciles a stale action without implying a duplicate action', async () => {
    const user = userEvent.setup();
    const initial = pvpMatch();
    const refreshed = pvpMatch({
      currentActor: 'opponent',
      legalActions: [],
      version: 4,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(initial))
      .mockResolvedValueOnce(
        pvpProblemResponse('PVP_MATCH_VERSION_CONFLICT', 409),
      )
      .mockResolvedValueOnce(pvpMatchResponse(refreshed));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Opponent’s turn' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText(/Authoritative state restored/i),
    ).toBeInTheDocument();
  });

  it('refreshes at the display deadline and accepts only the server result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    const active = pvpMatch({
      turnDeadline: '2026-09-05T09:00:01.000Z',
    });
    const completed = pvpMatch({
      completionReason: 'turn_forfeit',
      outcome: 'loss',
      status: 'completed',
      version: 4,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockResolvedValueOnce(pvpMatchResponse(completed));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await act(async () => Promise.resolve());
    expect(screen.getByText(/remaining/)).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });

    expect(
      screen.getByText(/Your 24-hour decision deadline expired/i),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['win', 'turn_forfeit', 'Your opponent missed'],
    ['loss', 'turn_forfeit', 'Your 24-hour decision deadline expired'],
    ['win', 'account_deletion_forfeit', 'became unavailable'],
    ['loss', 'defeat', 'won the battle'],
  ] as const)(
    'renders terminal %s / %s result',
    async (outcome, reason, message) => {
      const completed = pvpMatch({
        completionReason: reason,
        outcome,
        status: 'completed',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(pvpMatchResponse(completed)),
      );
      renderPvpMatch();
      expect(await screen.findByText(new RegExp(message, 'i'))).toBeVisible();
      expect(screen.getByText(/Persisted final result/)).toBeVisible();
    },
  );

  it('recovers an API load failure with a safe retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpProblemResponse('PVP_MATCH_NOT_FOUND', 404))
      .mockResolvedValueOnce(pvpMatchResponse(pvpMatch()));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();
    expect(
      await screen.findByRole('heading', { name: 'PvP match could not load' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
  });
});
