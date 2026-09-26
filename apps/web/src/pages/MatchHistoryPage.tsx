import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

import { listCpuMatchHistory, MatchApiError } from '../api/matches';
import {
  listPvpHistory,
  PvpApiError,
  type PvpHistorySummary,
} from '../api/pvp';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import {
  BattleResultSummary,
  mergeBattleHistory,
  type BattleHistoryItem,
} from '../components/matches/MatchResultSummary';
import './matches.css';

type HistoryState =
  | { status: 'loading' }
  | {
      battles: BattleHistoryItem[];
      partial: boolean;
      playerNextCursor: string | null;
      playerPageStatus: 'idle' | 'loading' | 'error';
      status: 'ready';
    }
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
  const paginationRequest = useRef<AbortController | null>(null);
  const requestedPlayerCursors = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    paginationRequest.current?.abort();
    paginationRequest.current = null;
    requestedPlayerCursors.current.clear();
    setState({ status: 'loading' });

    void loadBattleHistory({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: toMatchError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, revision]);

  useEffect(
    () => () => {
      paginationRequest.current?.abort();
    },
    [],
  );

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

  async function loadMorePlayerHistory() {
    if (
      state.status !== 'ready' ||
      state.playerNextCursor === null ||
      state.playerPageStatus === 'loading'
    ) {
      return;
    }

    const cursor = state.playerNextCursor;
    if (requestedPlayerCursors.current.has(cursor)) {
      setState((current) =>
        current.status === 'ready'
          ? { ...current, playerNextCursor: null, playerPageStatus: 'error' }
          : current,
      );
      return;
    }

    requestedPlayerCursors.current.add(cursor);
    const controller = new AbortController();
    paginationRequest.current?.abort();
    paginationRequest.current = controller;
    setState((current) =>
      current.status === 'ready'
        ? { ...current, playerPageStatus: 'loading' }
        : current,
    );

    try {
      const page = await listPvpHistory({
        apiBaseUrl,
        cursor,
        getAccessToken,
        limit: 50,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const repeatedCursor =
        page.nextCursor !== null &&
        requestedPlayerCursors.current.has(page.nextCursor);
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              battles: mergePlayerHistoryPage(current.battles, page.items),
              playerNextCursor: repeatedCursor ? null : page.nextCursor,
              playerPageStatus: repeatedCursor ? 'error' : 'idle',
            }
          : current,
      );
    } catch {
      if (!controller.signal.aborted) {
        requestedPlayerCursors.current.delete(cursor);
        setState((current) =>
          current.status === 'ready'
            ? { ...current, playerPageStatus: 'error' }
            : current,
        );
      }
    } finally {
      if (paginationRequest.current === controller) {
        paginationRequest.current = null;
      }
    }
  }

  if (state.status === 'loading') {
    return (
      <PageLoadingState
        title="Loading your battle history"
        description="Loading your completed Practice and Player Battles…"
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

  const visibleBattles = historyWithinLoadedPlayerBoundary(
    state.battles,
    state.playerNextCursor !== null || state.playerPageStatus === 'error',
  );

  return (
    <div className="matches-page">
      <header className="matches-page__header match-history-header">
        <div>
          <h1
            ref={(node) => {
              resultHeading.current = node;
            }}
            tabIndex={-1}
          >
            Battle history
          </h1>
          <p className="lead">
            Scan every Practice and Player Battle by result, opponent, and time.
          </p>
        </div>
        <Link className="button" href="/matches">
          Back to battles
        </Link>
      </header>

      {state.partial ? (
        <div className="match-inline-alert" role="status">
          <StateIcon tone="info" />
          <div>
            <h2>Some history could not load</h2>
            <p>Showing the battle results that are currently available.</p>
          </div>
          <button
            className="button button--quiet"
            onClick={() => setRevision((value) => value + 1)}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {visibleBattles.length === 0 ? (
        <section
          className="match-empty state-message state-message--empty"
          aria-labelledby="empty-history-title"
        >
          <StateIcon tone="empty" />
          <h2 id="empty-history-title">No completed matches yet</h2>
          <p>Finish a Practice or Player Battle to see your result here.</p>
        </section>
      ) : (
        <ol aria-label="Completed battles" className="match-history-list">
          {visibleBattles.map((battle) => (
            <li key={`${battle.kind}-${battle.match.matchId}`}>
              <BattleResultSummary battle={battle} />
            </li>
          ))}
        </ol>
      )}

      {state.playerNextCursor !== null ? (
        <div className="match-history-pagination">
          {state.playerPageStatus === 'error' ? (
            <p role="alert">
              More player battles could not load. Your current history is still
              available.
            </p>
          ) : null}
          <button
            className="button button--quiet"
            disabled={state.playerPageStatus === 'loading'}
            onClick={() => void loadMorePlayerHistory()}
            type="button"
          >
            {state.playerPageStatus === 'loading'
              ? 'Loading more battles…'
              : state.playerPageStatus === 'error'
                ? 'Retry more battles'
                : 'Load more battles'}
          </button>
        </div>
      ) : state.playerPageStatus === 'error' ? (
        <p className="match-history-pagination" role="alert">
          More player battles could not be loaded. The results above are still
          available.
        </p>
      ) : null}
    </div>
  );
}

function toMatchError(error: unknown) {
  if (error instanceof PvpApiError && error.failure === 'authorization') {
    return new MatchApiError('authorization');
  }
  return error instanceof MatchApiError
    ? error
    : new MatchApiError('unavailable');
}

async function loadBattleHistory({
  apiBaseUrl,
  getAccessToken,
  signal,
}: {
  apiBaseUrl: string;
  getAccessToken: ReturnType<typeof useApiAccessToken>;
  signal: AbortSignal;
}): Promise<HistoryState> {
  const [cpuResult, playerResult] = await Promise.allSettled([
    listCpuMatchHistory({ apiBaseUrl, getAccessToken, signal }),
    listPvpHistory({ apiBaseUrl, getAccessToken, limit: 50, signal }),
  ]);

  if (cpuResult.status === 'rejected' && playerResult.status === 'rejected') {
    const errors = [cpuResult.reason, playerResult.reason];
    const authorizationError = errors.find(
      (error) =>
        (error instanceof MatchApiError && error.failure === 'authorization') ||
        (error instanceof PvpApiError && error.failure === 'authorization'),
    );
    throw toMatchError(authorizationError ?? errors[0]);
  }

  return {
    battles: mergeBattleHistory(
      cpuResult.status === 'fulfilled' ? cpuResult.value : [],
      playerResult.status === 'fulfilled' ? playerResult.value.items : [],
    ),
    partial:
      cpuResult.status === 'rejected' || playerResult.status === 'rejected',
    playerNextCursor:
      playerResult.status === 'fulfilled'
        ? playerResult.value.nextCursor
        : null,
    playerPageStatus: 'idle',
    status: 'ready',
  };
}

function mergePlayerHistoryPage(
  battles: BattleHistoryItem[],
  playerMatches: PvpHistorySummary[],
) {
  const cpuMatches = battles
    .filter((battle) => battle.kind === 'cpu')
    .map((battle) => battle.match);
  const existingPlayerMatches = battles
    .filter((battle) => battle.kind === 'player')
    .map((battle) => battle.match);
  const playerById = new Map(
    [...existingPlayerMatches, ...playerMatches].map((match) => [
      match.matchId,
      match,
    ]),
  );

  return mergeBattleHistory(cpuMatches, [...playerById.values()]);
}

function historyWithinLoadedPlayerBoundary(
  battles: BattleHistoryItem[],
  playerHistoryIncomplete: boolean,
) {
  if (!playerHistoryIncomplete) return battles;

  const oldestLoadedPlayerTime = battles.reduce<number | null>(
    (oldest, battle) => {
      if (battle.kind !== 'player') return oldest;
      const completedAt = new Date(battle.match.completedAt).getTime();
      return oldest === null ? completedAt : Math.min(oldest, completedAt);
    },
    null,
  );

  if (oldestLoadedPlayerTime === null) return [];

  return battles.filter(
    (battle) =>
      battle.kind === 'player' ||
      new Date(battle.match.completedAt).getTime() >= oldestLoadedPlayerTime,
  );
}
