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
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import {
  formatMatchDate,
  MatchResultSummary,
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
  | { matches: CpuMatchHistoryItem[]; status: 'ready' }
  | { status: 'unavailable' };

const recentMatchLimit = 3;

export default function MatchEntryPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [, navigate] = useLocation();
  const [state, setState] = useState<EntryState>({ status: 'loading' });
  const [recentResults, setRecentResults] = useState<RecentResultsState>({
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

    void loadEntry(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ error: toMatchError(error), status: 'error' });
      }
    });

    void listCpuMatchHistory({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((matches) => {
        if (!controller.signal.aborted) {
          setRecentResults({
            matches: newestMatches(matches).slice(0, recentMatchLimit),
            status: 'ready',
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecentResults({ status: 'unavailable' });
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
        {state.activeMatch ? (
          <ActiveMatchPanel match={state.activeMatch} />
        ) : null}
        <div className="battle-mode-grid">
          <StartMatchPanel
            activeMatch={state.activeMatch}
            deck={state.deck}
            isStarting={isStarting}
            onStart={startMatch}
          />
          <PlayerBattlePanel />
        </div>

        <RecentResults state={recentResults} />
      </div>
    </div>
  );
}

function ActiveMatchPanel({ match }: { match: CpuMatch }) {
  return (
    <section
      aria-labelledby="continue-playing-title"
      className="continue-playing"
      id="continue-playing"
    >
      <h2 id="continue-playing-title">Continue playing</h2>
      <div className="continue-playing__row">
        <div>
          <h3>Match against CPU</h3>
          <p>
            {formatMatchPhase(match)} · Turn {match.state.turnNumber} · Started{' '}
            <time dateTime={match.startedAt}>
              {formatMatchDate(match.startedAt)}
            </time>
          </p>
        </div>
        <Link className="button" href={`/matches/${match.matchId}`}>
          Resume battle
        </Link>
      </div>
    </section>
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
    <section aria-labelledby="cpu-battle-title" className="battle-mode-card">
      <div className="battle-mode-card__intro">
        <h2 id="cpu-battle-title">CPU Battle</h2>
        <p>Battle the computer with your selected deck.</p>
      </div>

      {activeMatch ? (
        <div className="battle-mode-card__state">
          <strong>Battle in progress</strong>
          <span>Your unfinished battle is ready to resume.</span>
        </div>
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

function PlayerBattlePanel() {
  return (
    <section
      aria-labelledby="player-battles-title"
      className="battle-mode-card"
    >
      <div className="battle-mode-card__intro">
        <h2 id="player-battles-title">Player Battles</h2>
        <p>Challenge another player and take turns when you are ready.</p>
      </div>
      <div className="battle-mode-card__state">
        <strong>Invites and active matches</strong>
        <span>Manage challenges and continue player battles.</span>
      </div>
      <div className="battle-mode-card__actions">
        <Link className="button" href="/matches/pvp">
          Open player battles
        </Link>
      </div>
    </section>
  );
}

function RecentResults({ state }: { state: RecentResultsState }) {
  return (
    <section aria-labelledby="recent-results-title" className="recent-results">
      <div className="recent-results__heading">
        <h2 id="recent-results-title">Recent CPU battles</h2>
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
          <p>Loading your recent CPU battles…</p>
        </div>
      ) : state.status === 'unavailable' ? (
        <div
          className="recent-results__empty state-message state-message--info"
          role="status"
        >
          <StateIcon tone="info" />
          <h3>Recent results unavailable</h3>
          <p>
            The full archive can be retried without interrupting this match.
          </p>
        </div>
      ) : state.matches.length === 0 ? (
        <div className="recent-results__empty state-message state-message--empty">
          <StateIcon tone="empty" />
          <h3>No completed battles yet</h3>
          <p>Finish a CPU battle to see your result here.</p>
        </div>
      ) : (
        <ol aria-label="Recent CPU match results" className="recent-match-list">
          {state.matches.map((match) => (
            <li key={match.matchId}>
              <MatchResultSummary compact headingLevel={3} match={match} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function newestMatches(matches: CpuMatchHistoryItem[]) {
  return [...matches].sort(
    (left, right) =>
      new Date(right.completedAt).getTime() -
      new Date(left.completedAt).getTime(),
  );
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
