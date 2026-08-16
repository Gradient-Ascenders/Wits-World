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

import CpuMatchPage from '../src/pages/CpuMatchPage';
import MatchEntryPage from '../src/pages/MatchEntryPage';
import MatchHistoryPage from '../src/pages/MatchHistoryPage';
import { deckListResponse, buildSavedDeck } from './fixtures/decks';
import {
  actionResult,
  activeMatch,
  buildMatch,
  completedMatch,
  historyItem,
  historyResponse,
  MATCH_ID,
  matchResponse,
  noActiveResponse,
  problemResponse,
} from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

function renderRoute(
  path: string,
  element: ReactNode,
  authentication = authValue(),
) {
  window.history.replaceState({}, '', path);
  return render(
    <Auth0Context.Provider value={authentication}>
      <Router>{element}</Router>
    </Auth0Context.Provider>,
  );
}

describe('CPU match entry and history', () => {
  it('resumes an active match before loading decks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(matchResponse(activeMatch(3)));
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/${MATCH_ID}`),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows no-selected-deck recovery and starts from #73 selected deck', async () => {
    const user = userEvent.setup();
    const selected = buildSavedDeck({ isSelected: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(deckListResponse([selected]))
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(matchResponse(buildMatch(), 201));
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: `${selected.name} is ready` }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start CPU match' }));

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/${MATCH_ID}`),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1]!.body))).toEqual({
      deckId: selected.deckId,
    });
  });

  it('aborts an unresolved match start when the entry page unmounts', async () => {
    const user = userEvent.setup();
    const selected = buildSavedDeck({ isSelected: true });
    let resolveOldRequest!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => {
      resolveOldRequest = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(deckListResponse([selected]))
      .mockReturnValueOnce(oldRequest);
    vi.stubGlobal('fetch', fetchMock);

    const view = renderRoute(
      '/matches',
      <MatchEntryPage apiBaseUrl={apiBaseUrl} />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Start CPU match' }),
    );
    const oldSignal = fetchMock.mock.calls[2]![1]!.signal as AbortSignal;

    view.unmount();
    expect(oldSignal.aborted).toBe(true);

    await act(async () => {
      resolveOldRequest(matchResponse(activeMatch(3)));
      await oldRequest;
    });

    expect(window.location.pathname).toBe('/matches');
    expect(
      screen.queryByRole('heading', { name: 'Enter the battle arena' }),
    ).not.toBeInTheDocument();
  });

  it('shows an explicit deck choice when no active or selected deck exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(noActiveResponse())
        .mockResolvedValueOnce(deckListResponse([])),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Select a deck first' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Choose a deck' })).toHaveAttribute(
      'href',
      '/decks',
    );
  });

  it('renders empty private history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(historyResponse([])));
    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'No completed matches yet' }),
    ).toBeVisible();
  });

  it('keeps the loading state useful and retries an active-match network failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(matchResponse(activeMatch(4)));
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      screen.getByRole('heading', { name: 'Checking for an active match' }),
    ).toBeVisible();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(
      screen.getByRole('heading', { name: 'Battles could not be prepared' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/${MATCH_ID}`),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('defers selected-deck rejection to the API and routes the player back to decks', async () => {
    const user = userEvent.setup();
    const selected = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(noActiveResponse())
        .mockResolvedValueOnce(deckListResponse([selected]))
        .mockResolvedValueOnce(noActiveResponse())
        .mockResolvedValueOnce(problemResponse('INVALID_MATCH_DECK', 400)),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', { name: 'Start CPU match' }),
    );

    expect(
      await screen.findByText(/server rejected the selected deck/i),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Review saved decks' }),
    ).toHaveAttribute('href', '/decks');
  });

  it('renders populated private history with completed detail links', async () => {
    const item = historyItem();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(historyResponse([item])));
    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Victory' }),
    ).toBeVisible();
    expect(screen.getByText('Player won')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'View saved match' }),
    ).toHaveAttribute('href', `/matches/${MATCH_ID}`);
  });

  it('offers secure reauthentication when private history returns 401', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problemResponse('SESSION_EXPIRED', 401)),
    );

    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
      authValue({ loginWithRedirect }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Sign in again' }),
    );
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/matches/history' },
    });
  });
});

describe('authoritative CPU battle page', () => {
  it('selects an initial Creature by keyboard and renders returned legal move and Power controls', async () => {
    const user = userEvent.setup();
    const initial = buildMatch();
    const active = activeMatch(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(initial))
      .mockResolvedValueOnce(matchResponse(active));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    const choose = await screen.findAllByRole('button', {
      name: /Choose Creature/,
    });
    choose[0]!.focus();
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Use Knowledge Strike 1/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Use Power card 1' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Use Power card 2' }),
    ).toBeDisabled();
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
    expect(body).toMatchObject({
      action: initial.state.legalActions[0],
      expectedVersion: 0,
      submissionId: expect.any(String),
    });
    expect(body).not.toHaveProperty('winner');
    expect(body).not.toHaveProperty('score');
  });

  it('prevents duplicate action submission while the server request is in flight', async () => {
    const user = userEvent.setup();
    let resolveAction!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveAction = resolve;
    });
    const active = activeMatch();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(active))
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    const move = await screen.findByRole('button', {
      name: /Use Knowledge Strike 1/,
    });
    await user.dblClick(move);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(move).toBeDisabled();

    resolveAction(matchResponse(activeMatch(2)));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Match version 2',
    );
  });

  it('aborts an obsolete action when the detail route changes', async () => {
    const user = userEvent.setup();
    const otherMatchId = '00000000-0000-4000-8000-000000009999';
    const otherMatch = { ...activeMatch(7), matchId: otherMatchId };
    let resolveOldAction!: (response: Response) => void;
    const oldAction = new Promise<Response>((resolve) => {
      resolveOldAction = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(1)))
      .mockReturnValueOnce(oldAction)
      .mockResolvedValueOnce(matchResponse(otherMatch));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    await user.click(
      await screen.findByRole('button', { name: /Use Knowledge Strike 1/ }),
    );
    const oldSignal = fetchMock.mock.calls[1]![1]!.signal as AbortSignal;

    window.history.pushState({}, '', `/matches/${otherMatchId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(oldSignal.aborted).toBe(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolveOldAction(matchResponse(activeMatch(8)));

    expect(
      await screen.findByRole('button', { name: /Use Knowledge Strike 1/ }),
    ).toBeEnabled();
    expect(
      within(screen.getByText('Match version').parentElement!).getByText('7'),
    ).toBeVisible();
  });

  it('recovers a stale action without replaying it and rejects older versions', async () => {
    const user = userEvent.setup();
    const current = activeMatch(4);
    const reconciled = activeMatch(2);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(current))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_STALE_ACTION', 409))
      .mockResolvedValueOnce(matchResponse(reconciled));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    const move = await screen.findByRole('button', {
      name: /Use Knowledge Strike 1/,
    });
    await user.click(move);

    expect(
      await screen.findByText('Your turn. Match version 4.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText('Match version').parentElement!).getByText('4'),
    ).toBeVisible();
    expect(move).toBeEnabled();
    expect(move).toHaveFocus();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('presents defeat, keyboard replacement, continuation, and authoritative completion', async () => {
    const user = userEvent.setup();
    const active = activeMatch(2);
    const defeated = active.state.player.creatures[0]!;
    const replacement = active.state.player.creatures[1]!;
    const replacementState = buildMatch({
      lastAction: actionResult(
        {
          moveId: active.state.cpu.activeCreature!.moves[0]!.id,
          type: 'use_move',
        },
        { defeatedCreatureId: defeated.id, side: 'cpu' },
      ),
      state: {
        ...active.state,
        currentSide: 'player',
        legalActions: [
          { creatureId: replacement.id, type: 'select_replacement' },
        ],
        phase: 'replacement',
        player: {
          ...active.state.player,
          activeCreatureId: null,
          creatures: [
            { ...defeated, currentHp: 0, defeated: true },
            replacement,
            active.state.player.creatures[2]!,
          ],
        },
        replacementSide: 'player',
        turnNumber: 3,
      },
      version: 3,
    });
    const continued = activeMatch(4);
    continued.state.player.activeCreatureId = replacement.id;
    continued.state.player.creatures = replacementState.state.player.creatures;
    continued.state.legalActions = [
      { moveId: replacement.moves[0]!.id, type: 'use_move' },
    ];
    const finished = completedMatch(5);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(replacementState))
      .mockResolvedValueOnce(matchResponse(continued))
      .mockResolvedValueOnce(matchResponse(finished));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    expect(
      await screen.findByRole('heading', { name: 'Replacement required' }),
    ).toBeVisible();
    const replace = screen.getByRole('button', {
      name: /Use as replacement\s*Wit Creature 2/,
    });
    replace.focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { name: 'Your turn' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: /Use Knowledge Strike 2/ }),
    );

    expect(
      await screen.findByRole('heading', { name: /Victory — match saved/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Use Knowledge/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open saved match history' }),
    ).toBeVisible();
  });

  it('loads persisted completed detail and offers reauthentication after API 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(matchResponse(completedMatch())),
    );
    const { unmount } = renderMatchPage();
    expect(
      await screen.findByRole('heading', { name: /Victory — match saved/ }),
    ).toBeVisible();
    unmount();

    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(problemResponse('SESSION_EXPIRED', 401)),
    );
    renderMatchPage(authValue({ loginWithRedirect }));
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Sign in again' }));
    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: `/matches/${MATCH_ID}` },
    });
  });
});

function renderMatchPage(authentication = authValue()) {
  return renderRoute(
    `/matches/${MATCH_ID}`,
    <Route path="/matches/:matchId">
      <CpuMatchPage apiBaseUrl={apiBaseUrl} />
    </Route>,
    authentication,
  );
}
