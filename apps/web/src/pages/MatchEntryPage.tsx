import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { QuestMarker } from '../components/branding/QuestMarker';
import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';

import { DeckApiError, listSavedDecks, type SavedDeck } from '../api/decks';
import {
  getActiveCpuMatch,
  listCpuMatchHistory,
  MatchApiError,
  recoverOrCreateCpuMatch,
  type CpuMatch,
  type CpuMatchHistoryItem,
} from '../api/matches';
import {
  listActivePvpMatches,
  listPvpHistory,
  type PvpHistorySummary,
  type PvpMatchSummary,
} from '../api/pvp';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import {
  BattleResultSummary,
  formatMatchDate,
  mergeBattleHistory,
  type BattleHistoryItem,
} from '../components/matches/MatchResultSummary';
import './matches.css';

type EntryState =
  | { status: 'loading' }
  | {
      activeMatch: CpuMatch | null;
      deck: SavedDeck | null;
      status: 'ready';
    }
  | { error: MatchApiError; status: 'error' };

type RecentResultsState =
  | { status: 'loading' }
  | { battles: BattleHistoryItem[]; partial: boolean; status: 'ready' }
  | { status: 'unavailable' };

type PlayerBattlesState =
  | { status: 'loading' }
  | { hasMore: boolean; matches: PvpMatchSummary[]; status: 'ready' }
  | { status: 'unavailable' };

const recentBattleLimit = 5;
const activeBattleLimit = 20;

export default function MatchEntryPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [, navigate] = useLocation();
  const [state, setState] = useState<EntryState>({ status: 'loading' });
  const [recentResults, setRecentResults] = useState<RecentResultsState>({
    status: 'loading',
  });
  const [playerBattles, setPlayerBattles] = useState<PlayerBattlesState>({
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [reauthFailed, setReauthFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const stateHeading = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => request.current?.abort();
  }, []);

  const loadEntry = useCallback(
    async (signal: AbortSignal) => {
      const active = await getActiveCpuMatch({
        apiBaseUrl,
        getAccessToken,
        signal,
      });
      if (signal.aborted) {
        return;
      }

      if (active) {
        setState({ activeMatch: active, deck: null, status: 'ready' });
        return;
      }

      const decks = await listSavedDecks({
        apiBaseUrl,
        getAccessToken,
        signal,
      });

      if (!signal.aborted) {
        setState({
          activeMatch: null,
          deck: decks.find((deck) => deck.isSelected) ?? null,
          status: 'ready',
        });
      }
    },
    [apiBaseUrl, getAccessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
    setRecentResults({ status: 'loading' });
    setPlayerBattles({ status: 'loading' });

    void loadEntry(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ error: toMatchError(error), status: 'error' });
      }
    });

    void listActivePvpMatches({
      apiBaseUrl,
      getAccessToken,
      limit: activeBattleLimit,
      signal: controller.signal,
    })
      .then((page) => {
        if (!controller.signal.aborted) {
          setPlayerBattles({
            hasMore: page.nextCursor !== null,
            matches: page.items,
            status: 'ready',
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPlayerBattles({ status: 'unavailable' });
        }
      });

    void loadRecentBattles({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setRecentResults(result);
      }
    });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, loadEntry, revision]);

  useEffect(() => {
    if (state.status !== 'loading') {
      stateHeading.current?.focus();
    }
  }, [state.status]);

  async function startMatch(deck: SavedDeck) {
    if (isStarting) {
      return;
    }

    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setIsStarting(true);
    setReauthFailed(false);

    try {
      const match = await recoverOrCreateCpuMatch({
        apiBaseUrl,
        deckId: deck.deckId,
        getAccessToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        navigate(`/matches/${match.matchId}`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ error: toMatchError(error), status: 'error' });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) {
          setIsStarting(false);
        }
      }
    }
  }

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({ appState: { returnTo: '/matches' } });
    } catch {
      setReauthFailed(true);
    }
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Checking for an active match"
        description="Loading your current battle and selected deck…"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <div className="matches-page">
        <MatchErrorState
          error={state.error}
          onRetry={() => setRevision((value) => value + 1)}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
          ref={stateHeading}
          title="Battles could not be prepared"
        />
      </div>
    );
  }

  return (
    <div className="matches-page">
      <header className="matches-page__header">
        <h1
          ref={(node) => {
            stateHeading.current = node;
          }}
          tabIndex={-1}
        >
          Battles
        </h1>
        <p className="lead">Choose how you want to play.</p>
      </header>

      <div className="match-dashboard">
        <div className="battle-mode-grid">
          <StartMatchPanel
            activeMatch={state.activeMatch}
            deck={state.deck}
            isStarting={isStarting}
            onStart={startMatch}
          />
          <PlayerBattlePanel state={playerBattles} />
        </div>

        <RecentResults state={recentResults} />
      </div>
    </div>
  );
}

function StartMatchPanel({
  activeMatch,
  deck,
  isStarting,
  onStart,
}: {
  activeMatch: CpuMatch | null;
  deck: SavedDeck | null;
  isStarting: boolean;
  onStart: (deck: SavedDeck) => Promise<void>;
}) {
  return (
    <section
      aria-labelledby="cpu-battle-title"
      className={`battle-mode-card${activeMatch ? ' battle-mode-card--active' : ''}`}
    >
      <div className="battle-mode-card__intro">
        <h2 id="cpu-battle-title">CPU Battle</h2>
        <p>Battle the computer with your selected deck.</p>
      </div>

      {activeMatch ? (
        <>
          <div className="battle-mode-card__state">
            <strong>
              {formatMatchPhase(activeMatch)} · Turn{' '}
              {activeMatch.state.turnNumber}
            </strong>
            <span>
              Started{' '}
              <time dateTime={activeMatch.startedAt}>
                {formatMatchDate(activeMatch.startedAt)}
              </time>
            </span>
          </div>
          <div className="battle-mode-card__actions">
            <Link className="button" href={`/matches/${activeMatch.matchId}`}>
              Resume CPU battle
            </Link>
          </div>
        </>
      ) : deck ? (
        <>
          <div className="battle-mode-card__state">
            <span>Selected deck</span>
            <strong>{deck.name}</strong>
            <small>
              {deck.cards.length} cards · {deck.totalPoints} rarity points
            </small>
          </div>
          <div className="battle-mode-card__actions">
            <button
              className="button"
              disabled={isStarting}
              onClick={() => void onStart(deck)}
              type="button"
            >
              {isStarting ? 'Preparing battle…' : 'Start CPU battle'}
            </button>
            <Link className="button button--quiet" href="/decks">
              Review selected deck
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="battle-mode-card__state">
            <strong>No deck selected</strong>
            <span>Choose a saved deck before starting.</span>
          </div>
          <div className="battle-mode-card__actions">
            <Link className="button" href="/decks">
              Choose deck
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function PlayerBattlePanel({ state }: { state: PlayerBattlesState }) {
  const featuredMatch =
    state.status === 'ready'
      ? (state.matches.find((match) => match.currentActor === 'self') ??
        state.matches[0])
      : undefined;

  return (
    <section
      aria-labelledby="player-battles-title"
      className={`battle-mode-card${featuredMatch ? ' battle-mode-card--active' : ''}`}
    >
      <div className="battle-mode-card__intro">
        <h2 id="player-battles-title">Player Battles</h2>
        <p>Challenge another player and take turns when you are ready.</p>
      </div>
      {state.status === 'loading' ? (
        <div className="battle-mode-card__state" role="status">
          <strong>Checking active battles…</strong>
          <span>Your invitations and matches are still available.</span>
        </div>
      ) : state.status === 'unavailable' ? (
        <div className="battle-mode-card__state" role="status">
          <strong>Battle status unavailable</strong>
          <span>Open player battles to retry.</span>
        </div>
      ) : featuredMatch ? (
        <div className="battle-mode-card__state">
          <strong>
            {featuredMatch.currentActor === 'self'
              ? 'Your turn'
              : 'Waiting for opponent'}
          </strong>
          <span>
            Against {featuredMatch.opponent.playerName} · Deadline{' '}
            <time dateTime={featuredMatch.turnDeadline}>
              {formatMatchDate(featuredMatch.turnDeadline)}
            </time>
          </span>
          {state.hasMore ? (
            <small>More active player battles are waiting.</small>
          ) : state.matches.length > 1 ? (
            <small>
              {state.matches.length - 1} more active player{' '}
              {state.matches.length === 2 ? 'battle' : 'battles'}
            </small>
          ) : null}
        </div>
      ) : (
        <div className="battle-mode-card__state">
          <strong>Invites and active matches</strong>
          <span>Manage challenges and continue player battles.</span>
        </div>
      )}
      <div className="battle-mode-card__actions">
        {featuredMatch ? (
          <Link
            className="button"
            href={`/matches/pvp/${featuredMatch.matchId}`}
          >
            Continue player battle
          </Link>
        ) : null}
        <Link
          className={`button${featuredMatch ? ' button--quiet' : ''}`}
          href="/matches/pvp"
        >
          {featuredMatch ? 'View all player battles' : 'Open player battles'}
        </Link>
      </div>
    </section>
  );
}

function RecentResults({ state }: { state: RecentResultsState }) {
  return (
    <section aria-labelledby="recent-results-title" className="recent-results">
      <div className="recent-results__heading">
        <h2 id="recent-results-title">Recent battles</h2>
        <Link className="button button--quiet" href="/matches/history">
          View history
        </Link>
      </div>

      {state.status === 'loading' ? (
        <div
          aria-live="polite"
          className="recent-results__empty state-message state-loading state-loading--subtle"
          role="status"
        >
          <h3>
            <QuestMarker />
            Loading recent results
          </h3>
          <p>Loading your latest CPU and player battles…</p>
        </div>
      ) : state.status === 'unavailable' ? (
        <div
          className="recent-results__empty state-message state-message--info"
          role="status"
        >
          <StateIcon tone="info" />
          <h3>Recent results unavailable</h3>
          <p>
            Try the full history again without interrupting an active battle.
          </p>
        </div>
      ) : state.battles.length === 0 ? (
        <div className="recent-results__empty state-message state-message--empty">
          <StateIcon tone="empty" />
          <h3>
            {state.partial
              ? 'Some recent results unavailable'
              : 'No completed battles yet'}
          </h3>
          <p>
            {state.partial
              ? 'Showing no results until the remaining battle history can be checked.'
              : 'Finish a CPU or player battle to see your result here.'}
          </p>
        </div>
      ) : (
        <>
          {state.partial ? (
            <p className="recent-results__notice" role="status">
              Some battle history is temporarily unavailable. Showing the
              results that loaded.
            </p>
          ) : null}
          <ol aria-label="Recent battle results" className="recent-match-list">
            {state.battles.map((battle) => (
              <li key={`${battle.kind}-${battle.match.matchId}`}>
                <BattleResultSummary battle={battle} compact headingLevel={3} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

async function loadRecentBattles({
  apiBaseUrl,
  getAccessToken,
  signal,
}: {
  apiBaseUrl: string;
  getAccessToken: ReturnType<typeof useApiAccessToken>;
  signal: AbortSignal;
}): Promise<RecentResultsState> {
  const [cpuResult, playerResult] = await Promise.allSettled([
    listCpuMatchHistory({ apiBaseUrl, getAccessToken, signal }),
    listPvpHistory({
      apiBaseUrl,
      getAccessToken,
      limit: recentBattleLimit,
      signal,
    }),
  ]);

  if (cpuResult.status === 'rejected' && playerResult.status === 'rejected') {
    return { status: 'unavailable' };
  }

  const cpuMatches: CpuMatchHistoryItem[] =
    cpuResult.status === 'fulfilled' ? cpuResult.value : [];
  const playerMatches: PvpHistorySummary[] =
    playerResult.status === 'fulfilled' ? playerResult.value.items : [];

  return {
    battles: mergeBattleHistory(cpuMatches, playerMatches).slice(
      0,
      recentBattleLimit,
    ),
    partial:
      cpuResult.status === 'rejected' || playerResult.status === 'rejected',
    status: 'ready',
  };
}

function formatMatchPhase(match: CpuMatch) {
  if (match.state.phase === 'initial_selection') {
    return 'Opening selection';
  }
  if (match.state.phase === 'replacement') {
    return 'Replacement required';
  }
  if (match.state.currentSide === 'player') {
    return 'Your turn';
  }
  if (match.state.currentSide === 'cpu') {
    return 'CPU turn';
  }
  return 'Battle in progress';
}

function toMatchError(error: unknown) {
  if (error instanceof MatchApiError) {
    return error;
  }
  if (error instanceof DeckApiError && error.failure === 'authorization') {
    return new MatchApiError('authorization');
  }
  return new MatchApiError('unavailable');
}
