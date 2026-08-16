import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';

import { DeckApiError, listSavedDecks, type SavedDeck } from '../api/decks';
import {
  getActiveCpuMatch,
  MatchApiError,
  recoverOrCreateCpuMatch,
} from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import './matches.css';

type EntryState =
  | { status: 'loading' }
  | { deck: SavedDeck | null; status: 'ready' }
  | { error: MatchApiError; status: 'error' };

export default function MatchEntryPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [, navigate] = useLocation();
  const [state, setState] = useState<EntryState>({ status: 'loading' });
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
      if (active && !signal.aborted) {
        navigate(`/matches/${active.matchId}`, { replace: true });
        return;
      }

      if (signal.aborted) {
        return;
      }

      const decks = await listSavedDecks({
        apiBaseUrl,
        getAccessToken,
        signal,
      });
      if (!signal.aborted) {
        setState({
          deck: decks.find((deck) => deck.isSelected) ?? null,
          status: 'ready',
        });
      }
    },
    [apiBaseUrl, getAccessToken, navigate],
  );

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });

    void loadEntry(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ error: toMatchError(error), status: 'error' });
      }
    });

    return () => controller.abort();
  }, [loadEntry, revision]);

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
          <p>
            Loading the server’s current unfinished battle before offering a new
            one…
          </p>
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
        <p className="eyebrow">CPU battle</p>
        <h1
          ref={(node) => {
            stateHeading.current = node;
          }}
          tabIndex={-1}
        >
          Enter the battle arena
        </h1>
        <p className="lead">
          Wits World checks for an unfinished match first. New battles use your
          selected server-validated deck.
        </p>
      </header>

      <section className="match-entry-card" aria-labelledby="match-entry-title">
        <div>
          <p className="eyebrow">Selected deck</p>
          <h2 id="match-entry-title">
            {state.deck ? `${state.deck.name} is ready` : 'Select a deck first'}
          </h2>
          <p>
            {state.deck
              ? 'The API will revalidate this active deck and snapshot its cards when the match is created.'
              : 'Choose one saved deck before starting a new CPU match.'}
          </p>
        </div>
        {state.deck ? (
          <button
            className="button"
            disabled={isStarting}
            onClick={() => void startMatch(state.deck!)}
            type="button"
          >
            {isStarting ? 'Reconciling and starting…' : 'Start CPU match'}
          </button>
        ) : (
          <Link className="button" href="/decks">
            Choose a deck
          </Link>
        )}
      </section>

      <section
        className="history-callout"
        aria-labelledby="history-callout-title"
      >
        <div>
          <p className="eyebrow">Saved results</p>
          <h2 id="history-callout-title">Completed match history</h2>
          <p>Review private, persisted CPU match results from the server.</p>
        </div>
        <Link className="button button--quiet" href="/matches/history">
          View match history
        </Link>
      </section>
    </div>
  );
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
