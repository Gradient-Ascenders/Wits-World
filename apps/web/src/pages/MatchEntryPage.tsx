import { LoadingState } from '../components/LoadingState';
import { READ_TIMEOUT_MS } from '../components/loading-policy';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link, useLocation } from 'wouter';

import { DeckApiError, listSavedDecks, type SavedDeck } from '../api/decks';
import {
  getActiveCpuMatchEntry,
  listCpuMatchHistory,
  MatchApiError,
  recoverOrCreateCpuMatch,
  type CpuMatchEntry,
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
  BattleHistoryList,
  formatMatchDate,
  mergeBattleHistory,
  type BattleHistoryItem,
} from '../components/matches/MatchResultSummary';
import './matches.css';

type EntryState =
  | { status: 'loading' }
  | {
      activeMatch: CpuMatchEntry | null;
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
      const active = await getActiveCpuMatchEntry({
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
    const timeout = window.setTimeout(() => {
      controller.abort();
      setState({
        error: new MatchApiError('unavailable', {
          code: 'MATCH_ENTRY_TIMEOUT',
        }),
        status: 'error',
      });
    }, READ_TIMEOUT_MS);

    void loadEntry(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: toMatchError(error), status: 'error' });
        }
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadEntry, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setRecentResults({ status: 'loading' });
    setPlayerBattles({ status: 'loading' });

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
  }, [apiBaseUrl, getAccessToken]);

  useEffect(() => {
    if (state.status === 'error' && document.activeElement === document.body) {
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

  return (
    <div className="matches-page match-dashboard-page">
      <header className="matches-page__header">
        <h1>Battles</h1>
      </header>

      <div className="match-dashboard">
        <div className="battle-mode-grid">
          <LiveBattlePanel />
          <PlayerBattlePanel state={playerBattles} />
          <StartMatchPanel
            state={state}
            revision={revision}
            onRetry={() => setRevision((value) => value + 1)}
            onSignIn={startSignIn}
            reauthFailed={reauthFailed}
            errorRef={stateHeading}
            isStarting={isStarting}
            onStart={startMatch}
          />
        </div>

        <RecentResults state={recentResults} />
      </div>
    </div>
  );
}

function LiveBattlePanel() {
  return (
    <section
      aria-labelledby="live-battles-title"
      className="battle-mode-card battle-mode-card--live"
    >
      <div className="battle-mode-card__intro">
        <h2 id="live-battles-title">Live Ranked</h2>
        <p>Compete for a seasonal rating. One minute per turn.</p>
      </div>
      <div className="battle-mode-card__actions">
        <Link className="button" href="/matches/live">
          Play or watch live
        </Link>
      </div>
    </section>
  );
}

function StartMatchPanel({
  state,
  revision,
  onRetry,
  onSignIn,
  reauthFailed,
  errorRef,
  isStarting,
  onStart,
}: {
  state: EntryState;
  revision: number;
  onRetry: () => void;
  onSignIn: () => Promise<void>;
  reauthFailed: boolean;
  errorRef: RefObject<HTMLElement | null>;
  isStarting: boolean;
  onStart: (deck: SavedDeck) => Promise<void>;
}) {
  const activeMatch = state.status === 'ready' ? state.activeMatch : null;
  const deck = state.status === 'ready' ? state.deck : null;
  return (
    <section aria-labelledby="cpu-battle-title" className="battle-mode-card">
      <div className="battle-mode-card__intro">
        <h2 id="cpu-battle-title">CPU battle</h2>
        <p>Practise against the computer.</p>
      </div>

      {state.status === 'loading' ? (
        <LoadingState
          label="Checking your current CPU battle and selected deck…"
          onRetry={onRetry}
          resetKey={revision}
        />
      ) : state.status === 'error' ? (
        <MatchErrorState
          error={state.error}
          onRetry={onRetry}
          onSignIn={onSignIn}
          reauthFailed={reauthFailed}
          ref={errorRef}
          headingLevel={3}
          compact
          title="CPU battle could not be prepared"
          description={
            state.error.options.code === 'MATCH_ENTRY_TIMEOUT'
              ? 'Checking your current CPU battle and selected deck timed out. Retry this read or choose another battle mode.'
              : undefined
          }
        />
      ) : activeMatch ? (
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
            <span>
              Selected deck: <strong>{deck.name}</strong>
            </span>
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
            <Link className="button button--quiet" href="/collection/decks">
              Change deck
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="battle-mode-card__state">
            <strong>No deck selected</strong>
          </div>
          <div className="battle-mode-card__actions">
            <Link className="button" href="/collection/decks">
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
      className="battle-mode-card"
    >
      <div className="battle-mode-card__intro">
        <h2 id="player-battles-title">Player Battles</h2>
        <p>Challenge a player and take turns.</p>
      </div>
      {state.status === 'loading' ? (
        <LoadingState label="Checking active battles…" />
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
            <small>More active battles</small>
          ) : state.matches.length > 1 ? (
            <small>
              {state.matches.length - 1} more active{' '}
              {state.matches.length === 2 ? 'battle' : 'battles'}
            </small>
          ) : null}
        </div>
      ) : null}
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
        <LoadingState label="Loading recent results" />
      ) : state.status === 'unavailable' ? (
        <div className="recent-results__empty" role="status">
          <p>
            Recent results unavailable. Try{' '}
            <Link href="/matches/history">battle history</Link>.
          </p>
        </div>
      ) : state.battles.length === 0 ? (
        <div
          className="recent-results__empty"
          role={state.partial ? 'status' : undefined}
        >
          <p>
            {state.partial
              ? 'Some recent results unavailable'
              : 'No completed battles yet'}
          </p>
        </div>
      ) : (
        <>
          {state.partial ? (
            <p className="recent-results__notice" role="status">
              Some recent results are unavailable.
            </p>
          ) : null}
          <BattleHistoryList
            battles={state.battles}
            headingLevel={3}
            label="Recent battle results"
          />
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

function formatMatchPhase(match: CpuMatchEntry) {
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
