import {
  Auth0Context,
  initialContext,
  type Auth0ContextInterface,
} from '@auth0/auth0-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import CpuMatchPage from '../src/pages/CpuMatchPage';
import {
  activeMatch,
  MATCH_ID,
  matchResponse,
  problemResponse,
} from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';

function auth(): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  } as Auth0ContextInterface;
}

function renderCpuMatch(authValue = auth()) {
  window.history.replaceState({}, '', `/matches/cpu/${MATCH_ID}`);
  return render(
    <Auth0Context.Provider value={authValue}>
      <Router>
        <Route path="/matches/cpu/:matchId">
          <CpuMatchPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CPU movement action recovery', () => {
  it('reconciles a stale move from the authoritative match without replaying it', async () => {
    const user = userEvent.setup();
    const latest = activeMatch(5);
    latest.state.currentSide = 'cpu';
    latest.state.legalActions = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_STALE_ACTION', 409))
      .mockResolvedValueOnce(matchResponse(latest));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch();

    await user.click(
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    );

    const turnHeading = await screen.findByRole('heading', {
      name: "Opponent's turn",
    });
    await waitFor(() => expect(document.activeElement).toBe(turnHeading));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]).toEqual([
      `${apiBaseUrl}/matches/${MATCH_ID}/actions`,
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(fetchMock.mock.calls[2]).toEqual([
      `${apiBaseUrl}/matches/${MATCH_ID}`,
      expect.objectContaining({ method: 'GET' }),
    ]);
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('keeps the confirmed match visible when stale-move reconciliation also fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_STALE_ACTION', 409))
      .mockResolvedValueOnce(problemResponse('CPU_MATCH_UNAVAILABLE', 503));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch();

    await user.click(
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action not confirmed.',
    );
    expect(
      screen.getByRole('heading', { name: 'Battle needs sync' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Check battle again' }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('offers recoverable sign-in when the move request reports an expired session', async () => {
    const user = userEvent.setup();
    const authValue = auth();
    vi.mocked(authValue.loginWithRedirect).mockRejectedValueOnce(
      new Error('Authentication unavailable'),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(activeMatch(4)))
      .mockResolvedValueOnce(problemResponse('UNAUTHORIZED', 401));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch(authValue);

    await user.click(
      await screen.findByRole('button', { name: /Knowledge Strike 1/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session expired. Sign in again before continuing.',
    );
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));

    await waitFor(() =>
      expect(authValue.loginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: `/matches/${MATCH_ID}` },
      }),
    );
    expect(authValue.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: `/matches/${MATCH_ID}` },
    });
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeEnabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session expired.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('restores authoritative modifiers when an effect-expired event is presented', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const initial = activeMatch(4);
    const player = initial.state.player.creatures[0]!;
    player.activeModifiers = [
      {
        operation: 'multiply',
        percentage: 10,
        remainingTurns: 1,
        stat: 'damage_multiplier',
      },
    ];

    const latest = activeMatch(5);
    latest.state.player.creatures[0]!.activeModifiers = [];
    latest.battleLog = [
      {
        events: [
          {
            creatureId: player.id,
            id: '5:0',
            kind: 'effect_expired',
            message: "Player's Wit Creature no longer has Damage +10%.",
            sequence: 5,
            side: 'player',
          },
        ],
        id: 'turn-2',
        label: 'Turn 2',
        turnNumber: 2,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(matchResponse(initial))
      .mockResolvedValueOnce(matchResponse(latest));
    vi.stubGlobal('fetch', fetchMock);
    renderCpuMatch();

    expect(await screen.findByText('Damage +10% · 1 turn')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: /Knowledge Strike 1/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Damage +10% · 1 turn'),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByText(/no longer has Damage \+10%/i).length,
    ).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
