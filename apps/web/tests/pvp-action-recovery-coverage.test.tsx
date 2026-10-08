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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Route, Router } from 'wouter';

import PvpMatchPage from '../src/pages/PvpMatchPage';
import {
  PVP_MATCH_ID,
  pvpMatch,
  pvpMatchResponse,
  pvpProblemResponse,
} from './fixtures/pvp';
import { uuid } from './fixtures/matches';

const apiBaseUrl = 'https://api.example.test/api/v1';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
});

function renderMatch() {
  window.history.replaceState({}, '', `/matches/pvp/${PVP_MATCH_ID}`);
  return render(
    <Auth0Context.Provider
      value={
        {
          ...initialContext,
          getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
          isAuthenticated: true,
          isLoading: false,
        } as Auth0ContextInterface
      }
    >
      <Router>
        <Route path="/matches/pvp/:matchId">
          <PvpMatchPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

it('retries an ambiguous move with its original submission after unchanged reconciliation', async () => {
  const user = userEvent.setup();
  const initial = pvpMatch();
  const move = initial.state.self.creatures[0]!.moves[0]!;
  const confirmed = pvpMatch({
    currentActor: 'opponent',
    legalActions: [],
    version: initial.version + 1,
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(pvpMatchResponse(initial))
    .mockRejectedValueOnce(new TypeError('connection interrupted'))
    .mockResolvedValueOnce(pvpMatchResponse(initial))
    .mockResolvedValueOnce(pvpMatchResponse(confirmed));
  vi.stubGlobal('fetch', fetchMock);
  renderMatch();

  await screen.findByRole('heading', { name: 'Your turn' }, { timeout: 1_000 });
  await user.click(
    await screen.findByRole(
      'button',
      { name: new RegExp(move.name) },
      { timeout: 1_000 },
    ),
  );
  await screen.findByRole('button', { name: 'Retry action' });
  const firstBody = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
  await user.click(screen.getByRole('button', { name: 'Retry action' }));
  await screen.findByRole('heading', { name: 'Opponent’s turn' });

  expect(JSON.parse(String(fetchMock.mock.calls[3]![1]!.body))).toEqual(
    firstBody,
  );
  expect(firstBody).toMatchObject({
    action: { moveId: move.id, type: 'use_move' },
    expectedVersion: initial.version,
    submissionId: expect.any(String),
  });
});

it('accepts a completed result when a stale forfeit is reconciled', async () => {
  const user = userEvent.setup();
  const initial = pvpMatch();
  const completed = pvpMatch({
    canResign: false,
    completionReason: 'voluntary_resignation',
    currentActor: null,
    legalActions: [],
    outcome: 'win',
    status: 'completed',
    turnDeadline: null,
    version: initial.version + 1,
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(initial))
      .mockResolvedValueOnce(
        pvpProblemResponse('PVP_MATCH_VERSION_CONFLICT', 409),
      )
      .mockResolvedValueOnce(pvpMatchResponse(completed)),
  );
  renderMatch();

  await user.click(
    await screen.findByRole('button', { name: 'Forfeit battle' }),
  );
  await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));

  expect(
    await screen.findByRole('region', { name: 'Victory' }),
  ).toHaveTextContent('Your opponent forfeited.');
});

it('ignores a late action response after navigation to another match', async () => {
  const user = userEvent.setup();
  const otherMatchId = uuid(2800);
  const initial = pvpMatch();
  const otherMatch = pvpMatch({
    matchId: otherMatchId,
    opponent: { playerName: 'new_opponent' },
    state: {
      opponent: { ...initial.state.opponent, playerName: 'new_opponent' },
    },
  });
  let resolveLate!: (response: Response) => void;
  const lateResponse = new Promise<Response>((resolve) => {
    resolveLate = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(pvpMatchResponse(initial))
    .mockImplementationOnce(() => lateResponse)
    .mockResolvedValueOnce(pvpMatchResponse(otherMatch));
  vi.stubGlobal('fetch', fetchMock);
  renderMatch();

  const move = initial.state.self.creatures[0]!.moves[0]!;
  await screen.findByRole('heading', { name: 'Your turn' }, { timeout: 1_000 });
  await user.click(
    await screen.findByRole(
      'button',
      { name: new RegExp(move.name) },
      { timeout: 1_000 },
    ),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  window.history.pushState({}, '', `/matches/pvp/${otherMatchId}`);
  fireEvent(window, new PopStateEvent('popstate'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(String(fetchMock.mock.calls[2]![0])).toContain(otherMatchId);
  await screen.findByText('Against new_opponent', {}, { timeout: 1_000 });

  await act(async () =>
    resolveLate(
      pvpMatchResponse(
        pvpMatch({
          currentActor: 'opponent',
          legalActions: [],
          opponent: { playerName: 'late_old_opponent' },
          state: {
            opponent: {
              ...initial.state.opponent,
              playerName: 'late_old_opponent',
            },
          },
          version: initial.version + 1,
        }),
      ),
    ),
  );

  expect(screen.getByText('Against new_opponent')).toBeVisible();
  expect(screen.queryByText('Against late_old_opponent')).toBeNull();
});
