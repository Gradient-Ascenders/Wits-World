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
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const originalDialogShowModal = HTMLDialogElement.prototype.showModal;

beforeEach(() => {
  // Freeze only Date: normal UI timers still run, while fixtures never expire.
  // The deadline-specific test opts into fake timers and advances them itself.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
});

afterEach(() => {
  if (originalDialogShowModal) {
    HTMLDialogElement.prototype.showModal = originalDialogShowModal;
  } else {
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>)
      .showModal;
  }
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
  it('uses the shared page loading layout while initial data is loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>(() => undefined)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);

    const loadingState = screen.getByRole('status');
    expect(loadingState).toHaveClass('page-loading-state');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Loading Player Battles',
      }),
    ).toBeVisible();
    expect(loadingState).toHaveTextContent(
      'Checking whose turn it is and which challenges need a response…',
    );
    expect(
      screen.queryByRole('navigation', { name: 'Player battle sections' }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to Battles' })).toBeNull();
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
      pvpInvitation({
        direction: 'outgoing',
        invitationId: uuid(2506),
        respondedAt: '2026-09-05T10:30:00.000Z',
        status: 'cancelled',
      }),
      pvpInvitation({
        canCancel: false,
        direction: 'outgoing',
        invitationId: uuid(2507),
        opponent: { playerName: 'legacy_player' },
      }),
    ];
    const responses = hubResponses({
      active: [activePvpSummary()],
      history: [
        pvpHistorySummary(
          pvpMatch({ matchId: uuid(2599), status: 'completed' }),
        ),
      ],
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
    const activeTab = screen.getByRole('tab', { name: 'Active 1' });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Active Player Battles' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Continue your turn' }),
    ).toHaveAttribute('href', `/matches/pvp/${PVP_MATCH_ID}`);
    expect(
      screen.getByRole('link', { name: 'Take your turn' }),
    ).toHaveAttribute('href', `/matches/pvp/${PVP_MATCH_ID}`);

    const invitationsTab = screen.getByRole('tab', {
      name: 'Invitations 1',
    });
    await user.click(invitationsTab);
    const incomingList = screen.getByRole('list', {
      name: 'Received player battle challenges',
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
    expect(within(sentList).getByText('Cancelled')).toBeVisible();
    expect(within(sentList).getAllByText('Pending response')).toHaveLength(2);
    expect(
      within(sentList).getByText('You cancelled this invitation.'),
    ).toBeVisible();
    expect(
      within(sentList).getByText(/accepted your challenge/i),
    ).toBeVisible();
    expect(
      within(incomingList).getByText('You declined this challenge.'),
    ).toBeVisible();
    expect(
      within(incomingList).getByText(
        'This invitation expired before it was accepted.',
      ),
    ).toBeVisible();
    expect(
      within(sentList).queryByRole('button', {
        name: 'Cancel challenge to legacy_player',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Active Player Battles' }),
    ).toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'History 1' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Recent player battles' }),
    ).toBeVisible();
    expect(screen.getByText('Won')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Active Player Battles' }),
    ).toBeNull();
  });

  it('removes accepted invitations when a refresh reports the match in history', async () => {
    const user = userEvent.setup();
    const accepted = pvpInvitation({
      status: 'accepted',
      matchId: PVP_MATCH_ID,
      respondedAt: '2026-09-05T08:30:00.000Z',
    });
    const responses = [
      ...hubResponses({
        incoming: [accepted],
        outgoing: [{ ...accepted, direction: 'outgoing' }],
        active: [activePvpSummary()],
      }),
      ...hubResponses({
        history: [
          pvpHistorySummary(
            pvpMatch({
              status: 'completed',
              completionReason: 'turn_forfeit',
              outcome: 'loss',
            }),
          ),
        ],
      }).slice(0, 4),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Active Player Battles' }),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /^Invitations / }));
    expect(
      await screen.findAllByRole('link', { name: 'Open match' }),
    ).toHaveLength(2);

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Open match' })).toBeNull(),
    );
    expect(screen.getByText('No received challenges.')).toBeVisible();
    expect(screen.getByText('No sent challenges.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'History 1' }));
    expect(screen.getByText('Your turn deadline expired')).toBeVisible();
  });

  it('keeps history compact while naming each player-facing completion reason', async () => {
    const user = userEvent.setup();
    const history = [
      pvpHistorySummary(
        pvpMatch({
          completionReason: 'defeat',
          matchId: uuid(2601),
          outcome: 'win',
          status: 'completed',
        }),
      ),
      pvpHistorySummary(
        pvpMatch({
          completionReason: 'voluntary_resignation',
          matchId: uuid(2602),
          outcome: 'loss',
          status: 'completed',
        }),
      ),
      pvpHistorySummary(
        pvpMatch({
          completionReason: 'turn_forfeit',
          matchId: uuid(2603),
          outcome: 'win',
          status: 'completed',
        }),
      ),
      pvpHistorySummary(
        pvpMatch({
          completionReason: 'account_deletion_forfeit',
          matchId: uuid(2604),
          outcome: 'win',
          status: 'completed',
        }),
      ),
    ];
    const responses = hubResponses({ history });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    );

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await user.click(await screen.findByRole('tab', { name: 'History 4' }));

    expect(screen.getByText('Won in battle')).toBeVisible();
    expect(screen.getByText('You forfeited')).toBeVisible();
    expect(screen.getByText('Opponent turn deadline expired')).toBeVisible();
    expect(screen.getByText('Opponent became unavailable')).toBeVisible();
    expect(document.body).not.toHaveTextContent(
      /voluntary_resignation|turn_forfeit|account_deletion_forfeit|account deletion|account deleted/i,
    );
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
        name: 'Load more received challenges',
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
          name: 'Received player battle challenges',
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
    await screen.findByRole('heading', { name: 'Received challenges' });
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

  it('cancels a sent pending invitation once and keeps its terminal record', async () => {
    const user = userEvent.setup();
    const invitation = pvpInvitation({ direction: 'outgoing' });
    const cancelled = pvpInvitation({
      canCancel: false,
      direction: 'outgoing',
      respondedAt: '2026-09-05T09:00:00.000Z',
      status: 'cancelled',
      version: 1,
    });
    let resolveCancellation!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveCancellation = resolve;
    });
    const fetchMock = vi.fn();
    for (const response of hubResponses({ outgoing: [invitation] })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    const cancel = await screen.findByRole('button', {
      name: 'Cancel challenge to wits_wanderer',
    });
    await user.click(cancel);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      screen.getByRole('button', { name: 'Keep challenge' }),
    ).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    ).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(
      screen.getByRole('button', { name: 'Keep challenge' }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    await user.click(screen.getByRole('button', { name: 'Keep challenge' }));
    expect(cancel).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await user.click(cancel);
    await user.dblClick(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      screen.getByText(/Cancelling your challenge to wits_wanderer/),
    ).toHaveAttribute('role', 'status');

    await act(async () => {
      resolveCancellation(invitationResponse(cancelled));
      await pending;
    });
    expect(
      await screen.findByText('Challenge to wits_wanderer cancelled.'),
    ).toBeVisible();
    expect(screen.getByText('You cancelled this invitation.')).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'Cancel challenge to wits_wanderer',
      }),
    ).toBeNull();
    expect(JSON.parse(String(fetchMock.mock.calls[5]![1]!.body))).toEqual({
      expectedVersion: 0,
      submissionId: expect.any(String),
    });
  });

  it('reconciles an ambiguous cancellation and retries the same submission safely', async () => {
    const user = userEvent.setup();
    const invitation = pvpInvitation({ direction: 'outgoing' });
    const cancelled = pvpInvitation({
      canCancel: false,
      direction: 'outgoing',
      respondedAt: '2026-09-05T09:00:00.000Z',
      status: 'cancelled',
      version: 1,
    });
    const fetchMock = vi.fn();
    for (const response of hubResponses({ outgoing: [invitation] })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockRejectedValueOnce(new TypeError('response interrupted'));
    for (const response of hubResponses({ outgoing: [invitation] }).slice(
      0,
      4,
    )) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockResolvedValueOnce(invitationResponse(cancelled));
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Cancel challenge to wits_wanderer',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Cancel challenge to wits_wanderer',
    });
    expect(retry).toHaveTextContent('Retry cancellation safely');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));

    const firstBody = JSON.parse(String(fetchMock.mock.calls[5]![1]!.body));
    await user.click(retry);
    await user.click(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );
    await screen.findByText('You cancelled this invitation.');
    const retryBody = JSON.parse(String(fetchMock.mock.calls[10]![1]!.body));
    expect(retryBody).toEqual(firstBody);
  });

  it('restores an accepted invitation when cancellation loses the race', async () => {
    const user = userEvent.setup();
    const invitation = pvpInvitation({ direction: 'outgoing' });
    const accepted = pvpInvitation({
      canCancel: false,
      direction: 'outgoing',
      matchId: PVP_MATCH_ID,
      respondedAt: '2026-09-05T09:00:00.000Z',
      status: 'accepted',
      version: 1,
    });
    const fetchMock = vi.fn();
    for (const response of hubResponses({ outgoing: [invitation] })) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockResolvedValueOnce(
      pvpProblemResponse('PVP_INVITATION_VERSION_CONFLICT', 409),
    );
    for (const response of hubResponses({ outgoing: [accepted] }).slice(0, 4)) {
      fetchMock.mockResolvedValueOnce(response);
    }
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches/pvp', <PvpHubPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Cancel challenge to wits_wanderer',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );

    expect(
      await screen.findByText(/was accepted before cancellation completed/i),
    ).toHaveAttribute('role', 'status');
    expect(screen.getByText('Accepted')).toBeVisible();
    expect(screen.getByText(/accepted your challenge/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open match' })).toHaveAttribute(
      'href',
      `/matches/pvp/${PVP_MATCH_ID}`,
    );
    expect(
      screen.queryByRole('button', {
        name: 'Cancel challenge to wits_wanderer',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/declined|expired|unavailable/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe('asynchronous PvP battle', () => {
  it('offers a confirmed forfeit on either turn and submits it once', async () => {
    const user = userEvent.setup();
    const active = pvpMatch({ currentActor: 'opponent', legalActions: [] });
    const resigned = pvpMatch({
      canResign: false,
      completedAt: '2026-09-05T10:00:00.000Z',
      completionReason: 'voluntary_resignation',
      currentActor: null,
      legalActions: [],
      outcome: 'loss',
      status: 'completed',
      turnDeadline: null,
      version: 4,
    });
    let resolveResignation!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResignation = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    const trigger = await screen.findByRole('button', {
      name: 'Forfeit battle',
    });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', {
      name: 'Forfeit this battle?',
    });
    expect(dialog).toHaveTextContent(/records a loss for you/i);
    const cancel = screen.getByRole('button', { name: 'Keep playing' });
    expect(cancel).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Forfeiting…' })).toBeDisabled();
    expect(screen.getByText('Recording your forfeit…')).toHaveAttribute(
      'role',
      'status',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
      expectedVersion: 3,
      submissionId: expect.any(String),
    });

    await act(async () => {
      resolveResignation(pvpMatchResponse(resigned));
      await pending;
    });
    expect(await screen.findByText('You forfeited this battle.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Forfeit battle' }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /resign|voluntary_resignation/i,
    );
  });

  it('does not offer forfeit without the API capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(pvpMatchResponse(pvpMatch({ canResign: false }))),
    );
    renderPvpMatch();

    await screen.findByRole('heading', { name: 'Your turn' });
    expect(
      screen.queryByRole('button', { name: 'Forfeit battle' }),
    ).not.toBeInTheDocument();
  });

  it('reconciles an ambiguous forfeit and retries the same submission', async () => {
    const user = userEvent.setup();
    const active = pvpMatch();
    const resigned = pvpMatch({
      canResign: false,
      completedAt: '2026-09-05T10:00:00.000Z',
      completionReason: 'voluntary_resignation',
      currentActor: null,
      legalActions: [],
      outcome: 'loss',
      status: 'completed',
      turnDeadline: null,
      version: 4,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockRejectedValueOnce(new TypeError('connection interrupted'))
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockResolvedValueOnce(pvpMatchResponse(resigned));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));
    const retry = await screen.findByRole('button', {
      name: 'Retry same forfeit safely',
    });
    const firstBody = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
    await user.click(retry);

    expect(await screen.findByText('You forfeited this battle.')).toBeVisible();
    const retryBody = JSON.parse(String(fetchMock.mock.calls[3]![1]!.body));
    expect(retryBody.submissionId).toBe(firstBody.submissionId);
    expect(retryBody.expectedVersion).toBe(firstBody.expectedVersion);
  });

  it('reconciles a stale forfeit without automatically resubmitting it', async () => {
    const user = userEvent.setup();
    const active = pvpMatch();
    const advanced = pvpMatch({ version: 4 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockResolvedValueOnce(
        pvpProblemResponse('PVP_MATCH_VERSION_CONFLICT', 409),
      )
      .mockResolvedValueOnce(pvpMatchResponse(advanced));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));

    await screen.findByText(/Battle updated/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      screen.queryByRole('button', {
        name: 'Retry same forfeit safely',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Forfeit battle' }),
    ).toBeEnabled();
  });

  it('shows the deadline result when forfeit loses the completion race', async () => {
    const user = userEvent.setup();
    const active = pvpMatch();
    const completed = pvpMatch({
      canResign: false,
      completionReason: 'turn_forfeit',
      currentActor: null,
      legalActions: [],
      outcome: 'loss',
      status: 'completed',
      turnDeadline: null,
      version: 4,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockResolvedValueOnce(pvpProblemResponse('PVP_MATCH_COMPLETED', 409))
      .mockResolvedValueOnce(pvpMatchResponse(completed));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Deadline defeat — match saved',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Your turn deadline expired, so you forfeited the battle.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/voluntary_resignation|turn_forfeit/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry same forfeit safely' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('waits for an opponent replacement without showing local controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        pvpMatchResponse(
          pvpMatch({
            currentActor: 'opponent',
            legalActions: [],
            state: { phase: 'replacement' },
          }),
        ),
      ),
    );
    renderPvpMatch();

    expect(
      await screen.findByRole('heading', {
        name: 'Opponent choosing a replacement',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'wits_wanderer is choosing a replacement',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('Waiting for wits_wanderer to choose a replacement.'),
    ).toHaveAttribute('role', 'status');
    expect(
      screen.queryByRole('list', { name: 'Your Creature choices' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Use as replacement/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the viewer replacement turn actionable', async () => {
    const match = pvpMatch();
    const defeated = match.state.self.creatures[0]!;
    const replacement = match.state.self.creatures[1]!;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        pvpMatchResponse(
          pvpMatch({
            currentActor: 'self',
            legalActions: [
              { creatureId: replacement.id, type: 'select_replacement' },
            ],
            state: {
              phase: 'replacement',
              self: {
                ...match.state.self,
                activeCreatureId: null,
                creatures: [
                  { ...defeated, currentHp: 0, defeated: true },
                  replacement,
                  match.state.self.creatures[2]!,
                ],
              },
            },
          }),
        ),
      ),
    );
    renderPvpMatch();

    expect(
      await screen.findByRole('heading', { name: 'Choose a replacement' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /Use as replacement Wit Creature 2/,
      }),
    ).toBeEnabled();
  });

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
    expect(
      screen.getByText(/Unplayed opponent cards stay hidden/),
    ).toBeVisible();
    expect(screen.queryByText(/opponent secret/i)).not.toBeInTheDocument();
  });

  it('uses authoritative rarity in the PvP Creature details dialog', async () => {
    const user = userEvent.setup();
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    const current = pvpMatch();
    current.state.self.creatures[0] = {
      ...current.state.self.creatures[0]!,
      affinity: 'spark',
      name: 'Arcayx',
      rarity: 'epic',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pvpMatchResponse(current)),
    );
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: 'View Arcayx details' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('battle-creature-dialog--epic');
    expect(dialog).toHaveTextContent('Epic Creature · Spark affinity');
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
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeVisible();
    await user.dblClick(move);
    expect(screen.getByText('Processing your action')).toBeVisible();
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

  it('stages confirmed PvP action history before handing over the turn', async () => {
    const initial = pvpMatch();
    const action = initial.legalActions[0]!;
    const opponent = initial.state.opponent.activeCreature!;
    const result = {
      action,
      defeatedCreatureId: null,
      effects: [
        {
          amount: 12,
          damageMultiplier: 1,
          effectId: uuid(2600),
          effectType: 'damage' as const,
          modifier: null,
          targetCreatureId: opponent.id,
          targetSide: 'opponent' as const,
        },
      ],
      side: 'self' as const,
      turnEnded: true,
      winner: null,
    };
    const resolved = pvpMatch({
      currentActor: 'opponent',
      history: [
        {
          createdAt: '2026-09-05T09:01:00.000Z',
          result,
          sequence: 4,
          turnNumber: 3,
        },
      ],
      lastAction: result,
      legalActions: [],
      state: {
        opponent: {
          ...initial.state.opponent,
          activeCreature: { ...opponent, currentHp: 88 },
        },
      },
      version: 4,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(pvpMatchResponse(initial))
        .mockResolvedValueOnce(pvpMatchResponse(resolved)),
    );
    renderPvpMatch();
    const move = await screen.findByRole('button', {
      name: /Knowledge Strike 1/,
    });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(move);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getAllByText('You used Knowledge Strike 1.'),
    ).not.toHaveLength(0);
    expect(move).toBeDisabled();
    expect(document.querySelector('.combatant--player')).toHaveClass(
      'combatant--acting',
    );
    expect(document.querySelector('.combatant--cpu')).toHaveClass(
      'combatant--dimmed',
    );
    expect(screen.getByLabelText('Grit Creature HP')).toHaveAttribute(
      'value',
      '100',
    );

    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    expect(screen.getByLabelText('Grit Creature HP')).toHaveAttribute(
      'value',
      '88',
    );
    expect(screen.getAllByText(/took 12 damage/).length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(1_600);
    });
    expect(
      screen.getByRole('heading', { name: 'Opponent’s turn' }),
    ).toHaveFocus();
  });

  it('does not start a deadline refresh while a move submission is pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    const pending = new Promise<Response>(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pvpMatchResponse(
          pvpMatch({ turnDeadline: '2026-09-05T09:00:01.000Z' }),
        ),
      )
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();
    await act(async () => Promise.resolve());
    const move = screen.getByRole('button', { name: /Knowledge Strike 1/ });
    act(() => move.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(move).toBeDisabled();
    expect(screen.getByText('Processing your action')).toBeVisible();
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
    expect(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeEnabled();
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
    expect(screen.getByText(/Battle updated/i)).toBeInTheDocument();
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

    const result = screen.getByRole('region', {
      name: 'Deadline defeat — match saved',
    });
    expect(
      within(result).getByText(/Your turn deadline expired/i),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'win',
      'turn_forfeit',
      'Your opponent’s turn deadline expired, so they forfeited the battle.',
    ],
    [
      'loss',
      'turn_forfeit',
      'Your turn deadline expired, so you forfeited the battle.',
    ],
    [
      'win',
      'account_deletion_forfeit',
      'Your opponent became unavailable, so the battle was forfeited.',
    ],
    [
      'loss',
      'account_deletion_forfeit',
      'Your account became unavailable, so the battle was forfeited.',
    ],
    ['win', 'voluntary_resignation', 'wits_wanderer forfeited the battle.'],
    ['loss', 'voluntary_resignation', 'You forfeited this battle.'],
    ['loss', 'defeat', 'wits_wanderer won the battle.'],
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
      const result = await screen.findByRole('region', {
        name: /match saved/i,
      });
      const battlefield = screen.getByRole('region', {
        name: 'Current battlefield',
      });
      expect(within(result).getByText(message)).toBeVisible();
      expect(
        within(battlefield).getByRole('heading', {
          name: /Battle (won|complete)/,
        }),
      ).toBeVisible();
      expect(within(battlefield).getByText('Final resolution')).toBeVisible();
      expect(within(battlefield).getByText('Match complete')).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Save and exit' }),
      ).toHaveAttribute('href', '/matches/pvp');
      expect(
        screen.queryByRole('region', { name: 'Battle status' }),
      ).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        /voluntary_resignation|turn_forfeit|account_deletion_forfeit|account deletion|account deleted/i,
      );
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
      await screen.findByRole('heading', {
        name: 'Player Battle could not load',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
  });
});
