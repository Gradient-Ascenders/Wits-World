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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function authValue(
  loginWithRedirect = vi.fn().mockResolvedValue(undefined),
): Auth0ContextInterface {
  return {
    ...initialContext,
    getAccessTokenSilently: vi.fn().mockResolvedValue('access-token'),
    isAuthenticated: true,
    isLoading: false,
    loginWithRedirect,
  } as Auth0ContextInterface;
}

function renderPvpMatch(loginWithRedirect?: Parameters<typeof authValue>[0]) {
  window.history.replaceState({}, '', `/matches/pvp/${PVP_MATCH_ID}`);
  return render(
    <Auth0Context.Provider value={authValue(loginWithRedirect)}>
      <Router>
        <Route path="/matches/pvp/:matchId">
          <PvpMatchPage apiBaseUrl={apiBaseUrl} />
        </Route>
      </Router>
    </Auth0Context.Provider>,
  );
}

describe('asynchronous PvP match boundaries', () => {
  it.each([
    {
      actionType: 'select_replacement' as const,
      label: 'forced replacement',
      phase: 'replacement' as const,
      resultMessage: 'Go, Wit Creature!',
    },
    {
      actionType: 'swap_creature' as const,
      label: 'voluntary swap',
      phase: 'active' as const,
      resultMessage: 'You swapped in Wit Creature.',
    },
  ])(
    'submits and presents a $label only after server confirmation',
    async ({ actionType, phase, resultMessage }) => {
      const user = userEvent.setup();
      const initial = pvpMatch();
      const outgoingCreature = initial.state.self.creatures[0]!;
      const replacement = initial.state.self.creatures[1]!;
      const action = { creatureId: replacement.id, type: actionType };
      const startingMatch = pvpMatch({
        legalActions: [action],
        state: {
          phase,
          self: {
            ...initial.state.self,
            activeCreatureId:
              phase === 'replacement' ? null : outgoingCreature.id,
            creatures:
              phase === 'replacement'
                ? [
                    { ...outgoingCreature, currentHp: 0, defeated: true },
                    replacement,
                    initial.state.self.creatures[2]!,
                  ]
                : initial.state.self.creatures,
          },
        },
      });
      const result = {
        action,
        defeatedCreatureId: null,
        effects: [],
        side: 'self' as const,
        turnEnded: true,
        winner: null,
      };
      const confirmed = pvpMatch({
        currentActor: 'opponent',
        history: [
          {
            createdAt: startingMatch.updatedAt,
            result,
            sequence: 4,
            turnNumber: 3,
          },
        ],
        lastAction: result,
        legalActions: [],
        state: {
          phase: 'active',
          self: {
            ...startingMatch.state.self,
            activeCreatureId: replacement.id,
          },
        },
        version: startingMatch.version + 1,
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(pvpMatchResponse(startingMatch))
        .mockResolvedValueOnce(pvpMatchResponse(confirmed));
      vi.stubGlobal('fetch', fetchMock);
      renderPvpMatch();

      const actionButton =
        actionType === 'select_replacement'
          ? await screen.findByRole('button', {
              name: /Use as replacement Wit Creature 2/,
            })
          : await (async () => {
              await screen.findByRole('heading', { name: 'Your turn' });
              await user.click(screen.getByRole('tab', { name: /^Swap/ }));
              return screen.getByRole('button', { name: /Wit Creature 2/ });
            })();
      await user.click(actionButton);

      const announcements = await screen.findAllByText(resultMessage);
      expect(announcements).toHaveLength(2);
      expect(
        await screen.findByRole('heading', { name: 'Opponent’s turn' }),
      ).toBeVisible();
      expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({
        action,
        expectedVersion: startingMatch.version,
        submissionId: expect.any(String),
      });
    },
  );

  it('stages a confirmed Power heal and announces its target feedback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    const base = pvpMatch();
    const initialCreature = base.state.self.creatures[0]!;
    const initial = pvpMatch({
      state: {
        self: {
          ...base.state.self,
          creatures: [
            { ...initialCreature, currentHp: 70 },
            ...base.state.self.creatures.slice(1),
          ],
        },
      },
    });
    const card = initial.state.self.powerCards[0]!;
    const creature = initial.state.self.creatures[0]!;
    const action = { powerCardId: card.id, type: 'use_power_card' as const };
    const result = {
      action,
      defeatedCreatureId: null,
      effects: [
        {
          amount: 10,
          damageMultiplier: null,
          effectId: uuid(2600),
          effectType: 'heal' as const,
          modifier: null,
          targetCreatureId: creature.id,
          targetSide: 'self' as const,
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
          createdAt: initial.updatedAt,
          result,
          sequence: 4,
          turnNumber: 3,
        },
      ],
      lastAction: result,
      legalActions: [],
      state: {
        self: {
          ...initial.state.self,
          creatures: [
            { ...creature, currentHp: 80 },
            ...initial.state.self.creatures.slice(1),
          ],
          usedPowerCardIds: [card.id],
        },
      },
      version: initial.version + 1,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(initial))
      .mockResolvedValueOnce(pvpMatchResponse(resolved));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /^Power/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Campus Renewal 1/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByText('You played Campus Renewal 1.')).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getAllByText('+10 HP')).toHaveLength(2);
    expect(
      screen.getAllByText('Your Wit Creature restored 10 HP.'),
    ).toHaveLength(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toMatchObject(
      {
        action,
        expectedVersion: initial.version,
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(
      screen.getByRole('heading', { name: 'Opponent’s turn' }),
    ).toBeVisible();
  });

  it('completes a waiting match when polling reports the opponent deleted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    const waiting = pvpMatch({ currentActor: 'opponent', legalActions: [] });
    const completed = pvpMatch({
      canResign: false,
      completionReason: 'account_deletion_forfeit',
      currentActor: null,
      legalActions: [],
      outcome: 'win',
      status: 'completed',
      turnDeadline: null,
      version: waiting.version + 1,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(waiting))
      .mockResolvedValueOnce(pvpMatchResponse(completed));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('heading', { name: 'Opponent’s turn' }),
    ).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByRole('region', { name: 'Victory' })).toHaveTextContent(
      'Your opponent became unavailable.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks an ambiguous forfeit after a failed reconciliation and accepts the deleted-opponent result', async () => {
    const user = userEvent.setup();
    const active = pvpMatch();
    const completed = pvpMatch({
      canResign: false,
      completionReason: 'account_deletion_forfeit',
      currentActor: null,
      legalActions: [],
      outcome: 'win',
      status: 'completed',
      turnDeadline: null,
      version: active.version + 1,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pvpMatchResponse(active))
      .mockRejectedValueOnce(new TypeError('connection interrupted'))
      .mockResolvedValueOnce(pvpProblemResponse('PVP_MATCH_UNAVAILABLE', 503))
      .mockResolvedValueOnce(pvpMatchResponse(completed));
    vi.stubGlobal('fetch', fetchMock);
    renderPvpMatch();

    await user.click(
      await screen.findByRole('button', { name: 'Forfeit battle' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm forfeit' }));
    expect(
      await screen.findByRole('button', { name: 'Check result' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Forfeit not confirmed.',
    );

    await user.click(screen.getByRole('button', { name: 'Check result' }));
    expect(
      await screen.findByRole('region', { name: 'Victory' }),
    ).toHaveTextContent('Your opponent became unavailable.');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps unrevealed opponent creatures and unplayed cards private while waiting', async () => {
    const hidden = pvpMatch({
      currentActor: 'opponent',
      legalActions: [],
      state: {
        opponent: {
          activeCreature: null,
          defeatedCreatures: [],
          playedPowerCards: [],
          playerName: 'wits_wanderer',
          remainingCreatureCount: 2,
          remainingPowerCardCount: 2,
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pvpMatchResponse(hidden)));
    renderPvpMatch();

    await screen.findByRole('heading', { name: 'Opponent’s turn' });
    expect(
      screen.getByText('Your opponent’s Creature has not been revealed yet.'),
    ).toBeVisible();
    await userEvent.setup().click(screen.getByText('Opponent reserve'));
    expect(screen.getByText('Unplayed cards are hidden.')).toBeVisible();
    expect(screen.queryByText('Grit Creature')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/opponent secret|unplayed card name/i),
    ).toBeNull();
  });

  it('recovers the sign-in prompt after authorization failure and reports redirect failure', async () => {
    const user = userEvent.setup();
    const loginWithRedirect = vi
      .fn()
      .mockRejectedValueOnce(new Error('redirect unavailable'))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pvpProblemResponse('AUTH_REQUIRED', 401)),
    );
    renderPvpMatch(loginWithRedirect);

    expect(
      await screen.findByRole('heading', { name: 'Couldn’t load battle' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(
      await screen.findByText('Couldn’t start sign-in. Try again.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    await waitFor(() =>
      expect(loginWithRedirect).toHaveBeenCalledWith({
        appState: { returnTo: `/matches/pvp/${PVP_MATCH_ID}` },
      }),
    );
  });
});
