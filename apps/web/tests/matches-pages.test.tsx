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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import CpuMatchPage from '../src/pages/CpuMatchPage';
import MatchEntryPage from '../src/pages/MatchEntryPage';
import MatchHistoryPage from '../src/pages/MatchHistoryPage';
import {
  resetAccessibilityPreferences,
  updateAccessibilityPreferences,
} from '../src/accessibility/preferences';
import { deckListResponse, buildSavedDeck } from './fixtures/decks';
import {
  actionResult,
  activeMatch,
  buildCreature,
  buildMatch,
  completedMatch,
  historyItem,
  historyResponse,
  MATCH_ID,
  matchResponse,
  noActiveResponse,
  problemResponse,
  uuid,
} from './fixtures/matches';
import {
  activePvpListResponse,
  activePvpSummary,
  pvpMatch,
  pvpHistoryResponse,
  pvpHistorySummary,
} from './fixtures/pvp';

const apiBaseUrl = 'https://api.example.test/api/v1';

afterEach(() => {
  vi.useRealTimers();
  resetAccessibilityPreferences();
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

function withPvpDefaults(
  cpuFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  options: {
    active?: ReturnType<typeof activePvpSummary>[];
    history?: ReturnType<typeof pvpHistorySummary>[];
  } = {},
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith('/matches/pvp/history')) {
      return Promise.resolve(pvpHistoryResponse(options.history ?? []));
    }
    if (pathname.endsWith('/matches/pvp')) {
      return Promise.resolve(activePvpListResponse(options.active ?? []));
    }
    return cpuFetch(input, init);
  });
}

describe('CPU match entry and history', () => {
  it('presents an active match for explicit resume without loading decks or offering start', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(3)))
      .mockResolvedValueOnce(historyResponse([]));
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock));

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('heading', { name: 'Practice' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Practice' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Player Battles' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Live Ranked' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Play or watch live' }),
    ).toHaveAttribute('href', '/matches/live');
    const liveHeading = screen.getByRole('heading', {
      name: 'Live Ranked',
    });
    const playerHeading = screen.getByRole('heading', {
      name: 'Player Battles',
    });
    const cpuHeading = screen.getByRole('heading', { name: 'Practice' });
    expect(
      liveHeading.compareDocumentPosition(playerHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      playerHeading.compareDocumentPosition(cpuHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/matches');
    expect(
      screen.queryByRole('button', { name: 'Start Practice battle' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/matches/history');

    await user.click(
      screen.getByRole('link', { name: 'Resume Practice battle' }),
    );
    expect(window.location.pathname).toBe(`/matches/${MATCH_ID}`);
  });

  it('keeps an active player battle inside the Player Battles card', async () => {
    const match = activePvpSummary();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(historyResponse([]))
      .mockResolvedValueOnce(deckListResponse([]));
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock, { active: [match] }));

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    const playerCard = (
      await screen.findByRole('heading', { name: 'Player Battles' })
    ).closest('section')!;
    expect(within(playerCard).getByText('Your turn')).toBeVisible();
    expect(
      within(playerCard).getByRole('link', {
        name: 'Continue player battle',
      }),
    ).toHaveAttribute('href', `/matches/pvp/${match.matchId}`);
    expect(screen.queryByText('Continue playing')).not.toBeInTheDocument();
  });

  it('keeps active-match recovery available when recent results fail', async () => {
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(
        vi
          .fn()
          .mockResolvedValueOnce(matchResponse(activeMatch(3)))
          .mockResolvedValueOnce(
            problemResponse('CPU_MATCH_HISTORY_UNAVAILABLE', 503),
          ),
      ),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('link', { name: 'Resume Practice battle' }),
    ).toBeVisible();
    expect(screen.getByText('Some recent results unavailable')).toBeVisible();
  });

  it('offers Resume while recent results remain unresolved and aborts both on unmount', async () => {
    const unresolvedHistory = new Promise<Response>(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(3)))
      .mockReturnValueOnce(unresolvedHistory);
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock));

    const view = renderRoute(
      '/matches',
      <MatchEntryPage apiBaseUrl={apiBaseUrl} />,
    );

    expect(
      await screen.findByRole('link', { name: 'Resume Practice battle' }),
    ).toBeVisible();
    expect(screen.getByText('Loading recent results')).toBeVisible();

    const activeSignal = fetchMock.mock.calls[0]![1]!.signal as AbortSignal;
    const historySignal = fetchMock.mock.calls[1]![1]!.signal as AbortSignal;
    view.unmount();
    expect(activeSignal.aborted).toBe(true);
    expect(historySignal.aborted).toBe(true);
  });

  it('offers Start while recent results remain unresolved', async () => {
    const selected = buildSavedDeck({ isSelected: true });
    const unresolvedHistory = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(
        vi
          .fn()
          .mockResolvedValueOnce(noActiveResponse())
          .mockReturnValueOnce(unresolvedHistory)
          .mockResolvedValueOnce(deckListResponse([selected])),
      ),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    expect(
      await screen.findByRole('button', { name: 'Start Practice battle' }),
    ).toBeEnabled();
    expect(screen.getByText('Loading recent results')).toBeVisible();
  });

  it('shows no-selected-deck recovery and starts from #73 selected deck', async () => {
    const user = userEvent.setup();
    const selected = buildSavedDeck({ isSelected: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(historyResponse([]))
      .mockResolvedValueOnce(deckListResponse([selected]))
      .mockResolvedValueOnce(noActiveResponse())
      .mockResolvedValueOnce(matchResponse(buildMatch(), 201));
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock));

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Practice' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open player battles' }),
    ).toHaveAttribute('href', '/matches/pvp');
    expect(screen.queryByText('Asynchronous PvP')).not.toBeInTheDocument();
    expect(screen.queryByText('Continue playing')).not.toBeInTheDocument();
    expect(screen.getAllByText(selected.name).length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', { name: 'Start Practice battle' }),
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/matches/${MATCH_ID}`),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[4]![1]!.body))).toEqual({
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
      .mockResolvedValueOnce(historyResponse([]))
      .mockResolvedValueOnce(deckListResponse([selected]))
      .mockReturnValueOnce(oldRequest);
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock));

    const view = renderRoute(
      '/matches',
      <MatchEntryPage apiBaseUrl={apiBaseUrl} />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Start Practice battle' }),
    );
    const oldSignal = fetchMock.mock.calls[3]![1]!.signal as AbortSignal;

    view.unmount();
    expect(oldSignal.aborted).toBe(true);

    await act(async () => {
      resolveOldRequest(matchResponse(activeMatch(3)));
      await oldRequest;
    });

    expect(window.location.pathname).toBe('/matches');
    expect(
      screen.queryByRole('heading', { name: 'Battles' }),
    ).not.toBeInTheDocument();
  });

  it('shows an explicit deck choice when no active or selected deck exists', async () => {
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(
        vi
          .fn()
          .mockResolvedValueOnce(noActiveResponse())
          .mockResolvedValueOnce(historyResponse([]))
          .mockResolvedValueOnce(deckListResponse([])),
      ),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      await screen.findByRole('heading', { name: 'Practice' }),
    ).toBeVisible();
    expect(screen.getByText('No deck selected')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Choose deck' })).toHaveAttribute(
      'href',
      '/decks',
    );
  });

  it('renders empty private history', async () => {
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(vi.fn().mockResolvedValue(historyResponse([]))),
    );
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
      .mockResolvedValueOnce(historyResponse([]))
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(historyResponse([]));
    vi.stubGlobal('fetch', withPvpDefaults(fetchMock));

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    expect(
      screen.getByRole('heading', { name: 'Checking for an active match' }),
    ).toBeVisible();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(
      screen.getByRole('heading', { name: 'Battles could not be prepared' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Practice' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/matches');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('defers selected-deck rejection to the API and routes the player back to decks', async () => {
    const user = userEvent.setup();
    const selected = buildSavedDeck({ isSelected: true });
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(
        vi
          .fn()
          .mockResolvedValueOnce(noActiveResponse())
          .mockResolvedValueOnce(historyResponse([]))
          .mockResolvedValueOnce(deckListResponse([selected]))
          .mockResolvedValueOnce(noActiveResponse())
          .mockResolvedValueOnce(problemResponse('INVALID_MATCH_DECK', 400)),
      ),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);
    await user.click(
      await screen.findByRole('button', { name: 'Start Practice battle' }),
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
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(vi.fn().mockResolvedValue(historyResponse([item]))),
    );
    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
    );
    expect(await screen.findByRole('heading', { name: 'CPU' })).toBeVisible();
    expect(screen.getByText('Won')).toBeVisible();
    expect(
      within(screen.getByRole('listitem')).getByText('Rounds'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'View battle' })).toHaveAttribute(
      'href',
      `/matches/${MATCH_ID}`,
    );
  });

  it('withholds older CPU results until newer paginated player battles load', async () => {
    const user = userEvent.setup();
    const cpu = {
      ...historyItem(),
      completedAt: '2026-09-10T09:00:00.000Z',
      matchId: uuid(1700),
    };
    const firstPlayer = pvpHistorySummary(
      pvpMatch({
        completedAt: '2026-09-11T09:00:00.000Z',
        matchId: uuid(1701),
        status: 'completed',
      }),
    );
    const secondPlayer = pvpHistorySummary(
      pvpMatch({
        completedAt: '2026-09-10T12:00:00.000Z',
        matchId: uuid(1702),
        status: 'completed',
      }),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/matches/pvp/history')) {
        return Promise.resolve(
          url.searchParams.get('cursor') === 'next-page'
            ? pvpHistoryResponse([secondPlayer])
            : pvpHistoryResponse([firstPlayer], 'next-page'),
        );
      }
      return Promise.resolve(historyResponse([cpu]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
    );

    const history = await screen.findByRole('list', {
      name: 'Completed battles',
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(history)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/matches/pvp/${firstPlayer.matchId}`]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Load more battles' }));

    await waitFor(() =>
      expect(within(history).getAllByRole('listitem')).toHaveLength(3),
    );
    expect(within(history).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(history)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      `/matches/pvp/${firstPlayer.matchId}`,
      `/matches/pvp/${secondPlayer.matchId}`,
      `/matches/${cpu.matchId}`,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps loaded history visible when a later player-history page fails', async () => {
    const user = userEvent.setup();
    const player = pvpHistorySummary();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/matches/pvp/history')) {
        return Promise.resolve(
          url.searchParams.has('cursor')
            ? problemResponse('PLAYER_HISTORY_UNAVAILABLE', 503)
            : pvpHistoryResponse([player], 'next-page'),
        );
      }
      return Promise.resolve(historyResponse([historyItem()]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(
      '/matches/history',
      <MatchHistoryPage apiBaseUrl={apiBaseUrl} />,
    );
    const history = await screen.findByRole('list', {
      name: 'Completed battles',
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Load more battles' }));

    expect(
      await screen.findByText(/More player battles could not load/),
    ).toBeVisible();
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Retry more battles' }),
    ).toBeEnabled();
  });

  it('shows the five newest battles across both modes and links to the full archive', async () => {
    const base = historyItem();
    const matches = [
      { ...base, completedAt: '2026-08-12T12:00:00.000Z', matchId: uuid(1501) },
      { ...base, completedAt: '2026-08-16T12:00:00.000Z', matchId: uuid(1502) },
      { ...base, completedAt: '2026-08-14T12:00:00.000Z', matchId: uuid(1503) },
      { ...base, completedAt: '2026-08-15T12:00:00.000Z', matchId: uuid(1504) },
      { ...base, completedAt: '2026-08-13T12:00:00.000Z', matchId: uuid(1505) },
    ];
    vi.stubGlobal(
      'fetch',
      withPvpDefaults(
        vi
          .fn()
          .mockResolvedValueOnce(noActiveResponse())
          .mockResolvedValueOnce(historyResponse(matches))
          .mockResolvedValueOnce(deckListResponse([])),
        {
          history: [
            pvpHistorySummary(
              pvpMatch({
                completedAt: '2026-08-17T12:00:00.000Z',
                matchId: uuid(1600),
                opponent: { playerName: 'campus_champion' },
                status: 'completed',
              }),
            ),
          ],
        },
      ),
    );

    renderRoute('/matches', <MatchEntryPage apiBaseUrl={apiBaseUrl} />);

    const recent = await screen.findByRole('list', {
      name: 'Recent battle results',
    });
    expect(within(recent).getAllByRole('listitem')).toHaveLength(5);
    const newestResult = within(recent).getAllByRole('listitem')[0]!;
    expect(
      within(newestResult).getByRole('heading', {
        name: 'campus_champion',
      }),
    ).toBeVisible();
    expect(within(newestResult).getByText('Won')).toBeVisible();
    expect(
      within(newestResult).getByLabelText('Not available'),
    ).toHaveTextContent('—');
    const resultLinks = within(recent).getAllByRole('link', {
      name: 'View battle',
    });
    expect(resultLinks.map((link) => link.getAttribute('href'))).toEqual([
      `/matches/pvp/${uuid(1600)}`,
      `/matches/${uuid(1502)}`,
      `/matches/${uuid(1504)}`,
      `/matches/${uuid(1503)}`,
      `/matches/${uuid(1505)}`,
    ]);
    expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute(
      'href',
      '/matches/history',
    );
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
  it.each([
    {
      side: 'player' as const,
      title: 'Your turn',
      stageClass: 'battle-stage--player',
    },
    {
      side: 'cpu' as const,
      title: "Opponent's turn",
      stageClass: 'battle-stage--cpu',
    },
  ])(
    'shows the $side turn inside the battlefield without the status strip',
    async ({ side, title, stageClass }) => {
      const match = activeMatch();
      match.state.currentSide = side;
      if (side === 'cpu') match.state.legalActions = [];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

      renderMatchPage();

      const heading = await screen.findByRole('heading', {
        name: title,
        level: 1,
      });
      const stage = screen.getByRole('region', { name: 'Current battlefield' });
      expect(stage).toContainElement(heading);
      expect(stage).toHaveClass(stageClass);
      expect(
        screen.queryByRole('region', { name: 'Battle status' }),
      ).toBeNull();
      expect(screen.queryByText('Untimed')).toBeNull();
    },
  );

  it.each([
    {
      appMotion: 'reduce' as const,
      beatDelay: 1_000,
      description: 'app reduce over OS normal',
      osReduced: false,
    },
    {
      appMotion: 'full' as const,
      beatDelay: 1_700,
      description: 'app full over OS reduce',
      osReduced: true,
    },
  ])(
    'applies $description to battle-beat timing',
    async ({ appMotion, beatDelay, osReduced }) => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({ matches: osReduced }),
      );
      updateAccessibilityPreferences({ motion: appMotion });
      const next = activeMatch(2);
      next.battleLog = [
        {
          events: [
            {
              id: '2:0',
              kind: 'action',
              message: "Player's Wit Creature used Knowledge Strike 1.",
              sequence: 2,
              side: 'player',
            },
            {
              id: '2:1',
              kind: 'effect',
              message: "CPU's Grit Creature took 12 damage.",
              sequence: 2,
              side: 'cpu',
            },
          ],
          id: 'turn-2',
          label: 'Turn 2',
          turnNumber: 2,
        },
      ];
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(matchResponse(activeMatch(1)))
          .mockResolvedValueOnce(matchResponse(next)),
      );
      const timeout = vi.spyOn(window, 'setTimeout');

      renderMatchPage();
      await user.click(
        await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
      );

      await waitFor(() =>
        expect(timeout).toHaveBeenCalledWith(expect.any(Function), beatDelay),
      );
    },
  );

  it('paces the opening as opponent first, then player, before unlocking moves', async () => {
    const initial = buildMatch({ version: 1 });
    const opened = activeMatch(2);
    opened.battleLog = [
      {
        events: [
          {
            id: '1:0',
            kind: 'action',
            message: 'Player selected Wit Creature.',
            sequence: 1,
            side: 'player',
          },
          {
            id: '2:0',
            kind: 'action',
            message: 'CPU revealed Grit Creature.',
            sequence: 2,
            side: 'cpu',
          },
          {
            id: '2:1',
            kind: 'turn',
            message: 'Turn 1 began. Player has the first action.',
            sequence: 2,
            side: 'player',
          },
        ],
        id: 'opening',
        label: 'Opening',
        turnNumber: 0,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(initial))
        .mockResolvedValueOnce(matchResponse(opened)),
    );

    renderMatchPage();
    const creatureChoice = await screen.findByRole('button', {
      name: /Choose Creature Wit Creature 1/,
    });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(creatureChoice);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getAllByText('Opponent sent out Grit Creature!').length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('.combatant--cpu')).toHaveClass(
      'combatant--acting',
      'combatant--entering',
    );
    expect(
      screen.getByRole('button', { name: /Choose Creature Wit Creature 1/ }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'Show the next confirmed battle moment',
      }),
    ).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_800);
    });
    expect(screen.getAllByText('Go, Wit Creature!').length).toBeGreaterThan(0);
    expect(document.querySelector('.combatant--player')).toHaveClass(
      'combatant--acting',
      'combatant--entering',
    );
    expect(document.querySelector('.combatant--cpu')).toHaveClass(
      'combatant--dimmed',
    );

    await act(async () => {
      vi.advanceTimersByTime(1_800);
    });
    expect(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeEnabled();
  });

  it('stages player and CPU actions, impacts, and control locking in order', async () => {
    const current = activeMatch(1);
    const resolved = activeMatch(2);
    resolved.state.cpu.activeCreature!.currentHp = 88;
    resolved.state.player.creatures[0]!.currentHp = 90;
    resolved.battleLog = [
      {
        events: [
          {
            id: '3:0',
            kind: 'action',
            message: "Player's Wit Creature used Knowledge Strike 1.",
            sequence: 3,
            side: 'player',
          },
          {
            id: '3:1',
            kind: 'effect',
            message: "CPU's Grit Creature took 12 damage.",
            sequence: 3,
            side: 'cpu',
          },
          {
            id: '4:0',
            kind: 'action',
            message: "CPU's Grit Creature used Counter.",
            sequence: 4,
            side: 'cpu',
          },
          {
            id: '4:1',
            kind: 'effect',
            message: "Player's Wit Creature took 10 damage.",
            sequence: 4,
            side: 'player',
          },
        ],
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(current))
        .mockResolvedValueOnce(matchResponse(resolved)),
    );

    renderMatchPage();
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
      screen.getAllByText('Your Wit Creature used Knowledge Strike 1.').length,
    ).toBeGreaterThan(0);
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

    const advance = (milliseconds: number) =>
      act(async () => {
        vi.advanceTimersByTime(milliseconds);
      });
    await advance(1_700);
    expect(screen.getByLabelText('Grit Creature HP')).toHaveAttribute(
      'value',
      '88',
    );
    await advance(1_600);
    expect(
      screen.getAllByText('The CPU’s Grit Creature used Counter.').length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('.combatant--cpu')).toHaveClass(
      'combatant--acting',
    );
    expect(document.querySelector('.combatant--player')).toHaveClass(
      'combatant--dimmed',
    );
    await advance(1_700);
    expect(screen.getByLabelText('Wit Creature HP')).toHaveAttribute(
      'value',
      '90',
    );
    await advance(1_600);
    expect(move).toBeEnabled();
  });

  it('shows the swapped Creature before the CPU acts and keeps outgoing effects on the old Creature', async () => {
    const current = activeMatch(1);
    const [outgoing, incoming] = current.state.player.creatures;
    incoming!.currentHp = 70;
    current.state.legalActions = [
      { type: 'swap_creature', creatureId: incoming!.id },
    ];
    const resolved = structuredClone(current);
    resolved.version = 2;
    resolved.state.player.activeCreatureId = incoming!.id;
    resolved.state.player.creatures[0]!.currentHp = 92;
    resolved.state.player.creatures[1]!.currentHp = 60;
    resolved.battleLog = [
      {
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
        events: [
          {
            id: '3:0',
            kind: 'action',
            message: 'Player swapped in Wit Creature.',
            sequence: 3,
            side: 'player',
            creatureId: incoming!.id,
          },
          {
            id: '3:1',
            kind: 'effect',
            message: "Player's Wit Creature took 8 damage.",
            sequence: 3,
            side: 'player',
            creatureId: outgoing!.id,
          },
          {
            id: '4:0',
            kind: 'action',
            message: "CPU's Grit Creature used Counter.",
            sequence: 4,
            side: 'cpu',
          },
          {
            id: '4:1',
            kind: 'effect',
            message: "Player's Wit Creature took 10 damage.",
            sequence: 4,
            side: 'player',
            creatureId: incoming!.id,
          },
        ],
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(matchResponse(current))
        .mockResolvedValueOnce(matchResponse(resolved)),
    );

    renderMatchPage();
    await userEvent
      .setup()
      .click(await screen.findByRole('tab', { name: /Swap/ }));
    const swap = screen.getByRole('button', { name: /Wit Creature 2/ });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(swap);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getAllByText('You swapped in Wit Creature.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText('Wit Creature HP')).toHaveAttribute(
      'value',
      '70',
    );
    expect(document.querySelector('.combatant--player')).toHaveClass(
      'combatant--acting',
    );
    expect(document.querySelector('.combatant--cpu')).toHaveClass(
      'combatant--dimmed',
    );

    await act(async () => vi.advanceTimersByTime(1_700));
    expect(screen.getByLabelText('Wit Creature HP')).toHaveAttribute(
      'value',
      '70',
    );
    await act(async () => vi.advanceTimersByTime(1_600));
    expect(
      screen.getAllByText('The CPU’s Grit Creature used Counter.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText('Wit Creature HP')).toHaveAttribute(
      'value',
      '70',
    );
    await act(async () => vi.advanceTimersByTime(1_700));
    expect(screen.getByLabelText('Wit Creature HP')).toHaveAttribute(
      'value',
      '60',
    );
  });

  it('requires confirmation and records a CPU forfeit through the match API', async () => {
    const user = userEvent.setup();
    const active = activeMatch(4);
    const forfeited = completedMatch(5);
    forfeited.winner = 'cpu';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(active))
      .mockResolvedValueOnce(matchResponse(forfeited));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    const forfeit = await screen.findByRole('button', {
      name: 'Forfeit battle',
    });
    expect(forfeit).toHaveTextContent('Forfeit');
    expect(forfeit.closest('.battle-side-rail')).not.toBeNull();
    expect(document.querySelector('.battle-details')).toBeNull();
    await user.click(forfeit);
    expect(
      screen.getByRole('heading', { name: 'Forfeit this battle?' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));

    expect(
      await screen.findByRole('heading', { name: 'Practice complete' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiBaseUrl}/matches/${MATCH_ID}/forfeit`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 4 }),
      }),
    );
  });

  it('shows a concurrent player victory returned by the forfeit request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(matchResponse(completedMatch(5)));
    vi.stubGlobal('fetch', fetchMock);

    renderMatchPage();
    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));

    expect(
      await screen.findByRole('heading', { name: 'Practice victory' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Battle completed. You won. The result is saved.',
    );
    expect(screen.queryByText(/Battle forfeited/)).not.toBeInTheDocument();
  });

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
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeEnabled();
    const powerTab = screen.getByRole('tab', { name: /^Power/ });
    expect(
      document.getElementById(powerTab.getAttribute('aria-controls')!),
    ).toBeInTheDocument();
    await user.click(powerTab);
    expect(powerTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('button', { name: /Campus Renewal 1/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Campus Renewal 2/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
    expect(body).toMatchObject({
      action: initial.state.legalActions[0],
      expectedVersion: 0,
      submissionId: expect.any(String),
    });
    expect(body).not.toHaveProperty('winner');
    expect(body).not.toHaveProperty('score');
  });

  it('renders effect-rich legal, unavailable, used, and active modifier states', async () => {
    const match = activeMatch(3);
    const player = match.state.player.creatures[0]!;
    const cpu = buildCreature(20, {
      activeModifiers: [
        {
          operation: 'multiply',
          percentage: -100,
          remainingTurns: 2,
          stat: 'damage_multiplier',
        },
      ],
      affinity: 'grit',
      name: 'Braam Sentinel',
    });
    player.activeModifiers = [
      {
        operation: 'multiply',
        percentage: 10,
        remainingTurns: 2,
        stat: 'damage_multiplier',
      },
      {
        operation: 'multiply',
        percentage: 10,
        remainingTurns: null,
        stat: 'damage_multiplier',
      },
    ];
    player.moves = [
      {
        effects: [
          {
            damageMultiplier: null,
            effectType: 'damage',
            effectValue: 7,
            modifier: null,
          },
        ],
        id: player.moves[0]!.id,
        moveType: 'basic',
        name: 'Measured Strike',
        powerCost: 0,
      },
      {
        effects: [
          {
            damageMultiplier: 0.85,
            effectType: 'debuff',
            effectValue: 15,
            modifier: {
              durationTurns: 3,
              operation: 'multiply',
              stat: 'damage_multiplier',
            },
          },
        ],
        id: '00000000-0000-4000-8000-000000001299',
        moveType: 'grit',
        name: 'Brace',
        powerCost: 11,
      },
    ];
    match.state.cpu.activeCreature = cpu;
    match.state.selections.cpu = cpu.id;
    match.state.legalActions = [
      { moveId: player.moves[0]!.id, type: 'use_move' },
      {
        powerCardId: match.state.player.powerCards[0]!.id,
        type: 'use_power_card',
      },
    ];
    match.state.player.powerCards[0] = {
      affinity: 'wit',
      available: true,
      effects: [
        {
          damageMultiplier: null,
          effectType: 'damage',
          effectValue: 8,
          modifier: null,
        },
        {
          damageMultiplier: null,
          effectType: 'buff',
          effectValue: 3,
          modifier: {
            durationTurns: null,
            operation: 'add',
            stat: 'power',
          },
        },
      ],
      id: match.state.player.powerCards[0]!.id,
      name: 'Tactical Surge',
    };
    match.state.player.powerCards[1] = {
      ...match.state.player.powerCards[1]!,
      available: false,
      name: 'Spent Insight',
    };
    match.state.player.usedPowerCardIds = [
      match.state.player.powerCards[1]!.id,
    ];
    match.lastAction = actionResult(
      {
        powerCardId: match.state.player.powerCards[0]!.id,
        type: 'use_power_card',
      },
      {
        effects: [
          {
            amount: -2,
            damageMultiplier: null,
            effectId: '00000000-0000-4000-8000-000000001399',
            effectType: 'debuff',
            modifier: {
              durationTurns: null,
              operation: 'add',
              stat: 'power',
            },
            targetCreatureId: cpu.id,
            targetSide: 'cpu',
          },
        ],
      },
    );
    match.battleLog = [
      {
        events: [
          {
            id: '3:0',
            kind: 'action',
            message: 'Player used Tactical Surge.',
            sequence: 3,
            side: 'player',
          },
          {
            id: '3:1',
            kind: 'effect',
            message: "CPU's Braam Sentinel lost 2 Power.",
            sequence: 3,
            side: 'cpu',
          },
        ],
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

    renderMatchPage();

    const zeroCost = await screen.findByRole('button', {
      name: /Measured Strike.*Basic.*7 base damage.*0 Power/i,
    });
    expect(zeroCost).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: /Brace.*Grit.*Opponent damage −15%.*3 turns.*11 Power/i,
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    await userEvent.setup().click(screen.getByRole('tab', { name: /^Power/ }));
    const powerCard = screen.getByRole('button', {
      name: /Tactical Surge.*Wit.*8 base damage.*Restore 3 Power.*Available.*One use/i,
    });
    expect(powerCard).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Spent Insight.*Already used/i }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Damage +10% · 2 turns')).toBeVisible();
    expect(screen.getByText('Damage +10% · Rest of battle')).toBeVisible();
    expect(screen.getByText('Damage −100% · 2 turns')).toBeVisible();
    expect(screen.getAllByLabelText(/Active effects on/)).toHaveLength(2);
    expect(document.querySelector('.battle-log > summary')).toHaveTextContent(
      'You used Tactical Surge. The CPU’s Braam Sentinel lost 2 Power.',
    );
  });

  it('renders the complete grouped authoritative log in persisted sequence order', async () => {
    const match = activeMatch(4);
    match.battleLog = [
      {
        events: [
          {
            id: '1:0',
            kind: 'action',
            message: 'Player selected Grit Creature 3.',
            sequence: 1,
            side: 'player',
          },
          {
            id: '2:0',
            kind: 'action',
            message: 'CPU revealed Mystic Creature 1.',
            sequence: 2,
            side: 'cpu',
          },
          {
            id: '2:1',
            kind: 'turn',
            message: 'Turn 1 began. Player has the first action.',
            sequence: 2,
            side: 'player',
          },
        ],
        id: 'opening',
        label: 'Opening',
        turnNumber: 0,
      },
      {
        events: [
          {
            id: '3:0',
            kind: 'action',
            message: 'Player used Grit Power 2.',
            sequence: 3,
            side: 'player',
          },
          {
            id: '3:1',
            kind: 'effect',
            message: "CPU's Mystic Creature 1 took 14 damage.",
            sequence: 3,
            side: 'cpu',
          },
          {
            id: '3:2',
            kind: 'effect',
            message: "Player's Grit Creature 3 restored 6 HP.",
            sequence: 3,
            side: 'player',
          },
          {
            id: '3:3',
            kind: 'effect_expired',
            message: "Player's Grit Creature 3 no longer has Damage +10%.",
            sequence: 3,
            side: 'player',
          },
        ],
        id: 'turn-1',
        label: 'Turn 1',
        turnNumber: 1,
      },
      {
        events: [
          {
            id: '4:0',
            kind: 'action',
            message: "CPU's Mystic Creature 1 used Quiet Counter.",
            sequence: 4,
            side: 'cpu',
          },
          {
            id: '4:1',
            kind: 'defeat',
            message: "Player's Grit Creature 3 was defeated.",
            sequence: 4,
            side: 'player',
          },
        ],
        id: 'turn-2',
        label: 'Turn 2',
        turnNumber: 2,
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(matchResponse(match)));

    renderMatchPage();

    await screen.findByRole('heading', { name: 'Your turn' });
    const summary = document.querySelector<HTMLElement>(
      '.battle-log > summary',
    )!;
    expect(summary).toHaveTextContent(
      'The CPU’s Mystic Creature 1 used Quiet Counter. Your Grit Creature 3 was defeated.',
    );
    await userEvent.setup().click(summary);
    const log = screen.getByRole('log', {
      name: 'Complete battle activity',
    });
    expect(log).toHaveAttribute('tabindex', '0');
    expect(
      Array.from(log.querySelectorAll('.battle-log__event')).map((event) => {
        const copy = event.cloneNode(true) as HTMLElement;
        copy
          .querySelectorAll('[aria-hidden="true"]')
          .forEach((node) => node.remove());
        return copy.textContent?.trim();
      }),
    ).toEqual([
      'You selected Grit Creature 3.',
      'CPU revealed Mystic Creature 1.',
      'Turn 1 began. Player has the first action.',
      'You used Grit Power 2.The CPU’s Mystic Creature 1 took 14 damage.Your Grit Creature 3 restored 6 HP.',
      'Your Grit Creature 3 no longer has Damage +10%.',
      'The CPU’s Mystic Creature 1 used Quiet Counter.',
      'Your Grit Creature 3 was defeated.',
    ]);
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
      name: /Knowledge Strike 1/,
    });
    await user.dblClick(move);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(move).toBeDisabled();

    resolveAction(matchResponse(activeMatch(2)));
    expect(await screen.findByRole('status')).toHaveTextContent('Your turn');
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
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    );
    const oldSignal = fetchMock.mock.calls[1]![1]!.signal as AbortSignal;

    window.history.pushState({}, '', `/matches/${otherMatchId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(oldSignal.aborted).toBe(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolveOldAction(matchResponse(activeMatch(8)));

    expect(
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    ).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
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
      name: /Knowledge Strike 1/,
    });
    await user.click(move);

    expect(
      await screen.findByText('Your turn. Choose an available action.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your turn');
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
      screen.getByRole('button', { name: /Knowledge Strike 2/ }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Practice victory' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Knowledge Strike/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /history/i }),
    ).not.toBeInTheDocument();
    const finalAction = document.querySelector<HTMLElement>(
      '.battle-log > summary',
    );
    expect(finalAction).toHaveTextContent(
      'Your Wit Creature used Knowledge Strike 1. The CPU’s Grit Creature was defeated.',
    );
    await user.click(finalAction!);
    expect(screen.getByRole('log')).toHaveTextContent('You won the battle.');
  });

  it('loads persisted completed detail and offers reauthentication after API 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(matchResponse(completedMatch())),
    );
    const { unmount } = renderMatchPage();
    expect(
      await screen.findByRole('heading', { name: 'Practice victory' }),
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
