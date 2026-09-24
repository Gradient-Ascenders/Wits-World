import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import {
  listCpuMatchHistory,
  MatchApiError,
  type CpuMatchHistoryItem,
} from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import { MatchResultSummary } from '../components/matches/MatchResultSummary';
import './matches.css';

type HistoryState =
  | { status: 'loading' }
  | { matches: CpuMatchHistoryItem[]; status: 'ready' }
  | { error: MatchApiError; status: 'error' };

export default function MatchHistoryPage({
  apiBaseUrl,
}: {
  apiBaseUrl: string;
}) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [reauthFailed, setReauthFailed] = useState(false);
  const resultHeading = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    void listCpuMatchHistory({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((matches) => {
        if (!controller.signal.aborted) {
          setState({ matches, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: toMatchError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, revision]);

  useEffect(() => {
    if (state.status !== 'loading') {
      resultHeading.current?.focus();
    }
  }, [state.status]);

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({
        appState: { returnTo: '/matches/history' },
      });
    } catch {
      setReauthFailed(true);
    }
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Loading your completed matches"
        description="Loading your saved CPU battles…"
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
          ref={resultHeading}
          title="Match history could not load"
        />
      </div>
    );
  }

  return (
    <div className="matches-page">
      <header className="matches-page__header">
        <p className="eyebrow">Private match record</p>
        <h1
          ref={(node) => {
            resultHeading.current = node;
          }}
          tabIndex={-1}
        >
          Completed CPU matches
        </h1>
        <p className="lead">
          Revisit your completed battles and see how each match ended.
        </p>
      </header>

      <div className="match-page-actions">
        <Link className="button" href="/matches">
          Continue or start a battle
        </Link>
        <Link className="button button--quiet" href="/matches/pvp">
          Player battle history
        </Link>
      </div>

      {state.matches.length === 0 ? (
        <section
          className="match-empty state-message state-message--empty"
          aria-labelledby="empty-history-title"
        >
          <StateIcon tone="empty" />
          <h2 id="empty-history-title">No completed matches yet</h2>
          <p>Finish a CPU battle to see your result here.</p>
        </section>
      ) : (
        <ol aria-label="Completed CPU matches" className="match-history-list">
          {state.matches.map((match) => (
            <li key={match.matchId}>
              <MatchResultSummary match={match} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function toMatchError(error: unknown) {
  return error instanceof MatchApiError
    ? error
    : new MatchApiError('unavailable');
}
