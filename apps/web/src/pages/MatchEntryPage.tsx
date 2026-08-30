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
      <div className="matches-page">
        <section aria-live="polite" className="match-state-panel" role="status">
          <p className="eyebrow">CPU battle</p>
          <h1>Checking for an active match</h1>
          <p>Loading the server’s current battle and selected deck…</p>
        </section>
      </div>
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
        <p className="eyebrow">Battle dashboard</p>
        <h1
          ref={(node) => {
            stateHeading.current = node;
          }}
          tabIndex={-1}
        >
          Battles
        </h1>
        <p className="lead">
          Resume an unfinished match, start with your selected deck, or review
          recent server-saved results.
        </p>
      </header>

      <div className="match-dashboard">
        {state.activeMatch ? (
          <ActiveMatchPanel match={state.activeMatch} />
        ) : (
          <StartMatchPanel
            deck={state.deck}
            isStarting={isStarting}
            onStart={startMatch}
          />
        )}

        <RecentResults state={recentResults} />
      </div>
    </div>
  );
}

function ActiveMatchPanel({ match }: { match: CpuMatch }) {
  return (
    <section
      aria-labelledby="active-match-title"
      className="match-dashboard__primary match-dashboard__primary--active"
    >
      <div className="match-dashboard__primary-heading">
        <div>
          <p className="eyebrow">Battle in progress</p>
          <h2 id="active-match-title">Resume your CPU battle</h2>
        </div>
        <span className="match-dashboard__status">Active</span>
      </div>
      <p>
        Finish this server-saved match before starting another. Your battle
        state is ready on the detailed match screen.
      </p>
      <dl className="match-dashboard__meta">
        <div>
          <dt>Phase</dt>
          <dd>{formatMatchPhase(match)}</dd>
        </div>
        <div>
          <dt>Turn</dt>
          <dd>{match.state.turnNumber}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>
            <time dateTime={match.startedAt}>
              {formatMatchDate(match.startedAt)}
            </time>
          </dd>
        </div>
      </dl>
      <div className="match-dashboard__actions">
        <Link className="button" href={`/matches/${match.matchId}`}>
          Resume battle
        </Link>
      </div>
    </section>
  );
}

function StartMatchPanel({
  deck,
  isStarting,
  onStart,
}: {
  deck: SavedDeck | null;
  isStarting: boolean;
  onStart: (deck: SavedDeck) => Promise<void>;
}) {
  return (
    <section
      aria-labelledby="match-entry-title"
      className="match-dashboard__primary"
    >
      <p className="eyebrow">Ready for a new match</p>
      <h2 id="match-entry-title">
        {deck ? 'Start a CPU battle' : 'Select a deck first'}
      </h2>
      {deck ? (
        <>
          <p>
            <strong>{deck.name}</strong> is selected. The server will revalidate
            it and snapshot its exact owned cards when the match starts.
          </p>
          <dl className="match-dashboard__meta match-dashboard__meta--deck">
            <div>
              <dt>Selected deck</dt>
              <dd>{deck.name}</dd>
            </div>
            <div>
              <dt>Cards</dt>
              <dd>{deck.cards.length}</dd>
            </div>
            <div>
              <dt>Rarity points</dt>
              <dd>{deck.totalPoints}</dd>
            </div>
          </dl>
          <div className="match-dashboard__actions">
            <button
              className="button"
              disabled={isStarting}
              onClick={() => void onStart(deck)}
              type="button"
            >
              {isStarting ? 'Reconciling and starting…' : 'Start CPU battle'}
            </button>
            <Link className="button button--quiet" href="/decks">
              Review selected deck
            </Link>
          </div>
        </>
      ) : (
        <>
          <p>
            Choose one saved deck before starting a CPU battle. Deck validation
            remains server-authoritative.
          </p>
          <div className="match-dashboard__actions">
            <Link className="button" href="/decks">
              Choose a deck
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function RecentResults({ state }: { state: RecentResultsState }) {
  return (
    <section aria-labelledby="recent-results-title" className="recent-results">
      <div className="recent-results__heading">
        <div>
          <p className="eyebrow">Saved results</p>
          <h2 id="recent-results-title">Recent battles</h2>
        </div>
        <Link className="button button--quiet" href="/matches/history">
          View full history
        </Link>
      </div>

      {state.status === 'loading' ? (
        <div aria-live="polite" className="recent-results__empty" role="status">
          <h3>Loading recent results</h3>
          <p>Retrieving your newest server-saved battles…</p>
        </div>
      ) : state.status === 'unavailable' ? (
        <div className="recent-results__empty" role="status">
          <h3>Recent results unavailable</h3>
          <p>
            The full archive can be retried without interrupting this match.
          </p>
        </div>
      ) : state.matches.length === 0 ? (
        <div className="recent-results__empty">
          <h3>No completed battles yet</h3>
          <p>Your newest server-saved results will appear here.</p>
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
