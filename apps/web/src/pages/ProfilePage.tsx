import { createAppDateTimeFormatter } from '../date-time';
import { StateIcon } from '../components/StatusMessage';
import { LoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import { CrownIcon, MedalIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import {
  listProgressionStandings,
  ProgressionApiError,
  type ProgressionStandings,
  type StandingsEntry,
  type StandingsPeriod,
} from '../api/progression';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { PlayerShowcase } from '../components/profile/PlayerShowcase';
import { Link } from 'wouter';
import './profile.css';

interface ProfilePageProps {
  apiBaseUrl: string;
  playerName?: string;
}

type ResourceState<T> =
  | { status: 'loading' }
  | { error: ProgressionApiError; status: 'error' }
  | { data: T; status: 'ready' };

interface StandingsQuery {
  period: StandingsPeriod;
  month?: string;
  page: number;
}

const STANDINGS_PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat('en-ZA');
const monthFormatter = createAppDateTimeFormatter('en-ZA', {
  month: 'long',
  year: 'numeric',
});

export default function ProfilePage({
  apiBaseUrl,
  playerName,
}: ProfilePageProps) {
  return <PlayerShowcase apiBaseUrl={apiBaseUrl} playerName={playerName} />;
}

export function CampusStandings({ apiBaseUrl }: { apiBaseUrl: string }) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [standingsQuery, setStandingsQuery] = useState<StandingsQuery>({
    page: 1,
    period: 'all_time',
  });
  const [standings, setStandings] = useState<
    ResourceState<ProgressionStandings>
  >({ status: 'loading' });
  const [standingsRevision, setStandingsRevision] = useState(0);
  const [reauthFailed, setReauthFailed] = useState(false);
  const standingsHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusStandings = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setStandings({ status: 'loading' });

    void listProgressionStandings({
      apiBaseUrl,
      getAccessToken,
      ...(standingsQuery.month === undefined
        ? {}
        : { month: standingsQuery.month }),
      page: standingsQuery.page,
      pageSize: STANDINGS_PAGE_SIZE,
      period: standingsQuery.period,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setStandings({ data, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStandings({ error: toProgressionError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, standingsQuery, standingsRevision]);

  useEffect(() => {
    if (shouldFocusStandings.current && standings.status !== 'loading') {
      shouldFocusStandings.current = false;
      standingsHeading.current?.focus();
    }
  }, [standings.status]);

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({ appState: { returnTo: '/leaderboard' } });
    } catch {
      setReauthFailed(true);
    }
  }

  function selectStandingsPeriod(period: StandingsPeriod) {
    if (period === standingsQuery.period) return;
    shouldFocusStandings.current = true;
    setStandingsQuery({
      ...(period === 'monthly' ? { month: currentJohannesburgMonth() } : {}),
      page: 1,
      period,
    });
  }

  function changePage(page: number) {
    shouldFocusStandings.current = true;
    setStandingsQuery((current) => ({ ...current, page }));
  }

  function retryStandings() {
    shouldFocusStandings.current = true;
    setStandingsRevision((revision) => revision + 1);
  }

  return (
    <section
      aria-busy={standings.status === 'loading' ? 'true' : undefined}
      aria-describedby="standings-context"
      aria-labelledby="standings-heading"
      className="progression-section standings-section"
    >
      <div className="progression-section__heading standings-section__heading">
        <h2 id="standings-heading" ref={standingsHeading} tabIndex={-1}>
          Campus standings
        </h2>
        {standings.status === 'ready' ? (
          <p className="progression-section__summary">
            You are{' '}
            <span
              aria-label={`rank ${numberFormatter.format(standings.data.currentPlayer.rank)}`}
            >
              #{numberFormatter.format(standings.data.currentPlayer.rank)}
            </span>
          </p>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only" id="standings-context">
        {standings.status === 'ready'
          ? standingsTitle(standings.data)
          : 'Standings period and results'}
      </p>

      <div
        aria-label="Standings period"
        className="standings-period"
        role="group"
      >
        <button
          aria-pressed={standingsQuery.period === 'all_time'}
          disabled={standings.status === 'loading'}
          onClick={() => selectStandingsPeriod('all_time')}
          type="button"
        >
          All time
        </button>
        <button
          aria-pressed={standingsQuery.period === 'monthly'}
          disabled={standings.status === 'loading'}
          onClick={() => selectStandingsPeriod('monthly')}
          type="button"
        >
          This month
        </button>
      </div>

      {standings.status === 'loading' ? (
        <ProgressionLoadingState label="Loading standings" />
      ) : standings.status === 'error' ? (
        <ProgressionErrorState
          context="standings"
          error={standings.error}
          onRetry={retryStandings}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
        />
      ) : (
        <StandingsResults
          onPageChange={changePage}
          standings={standings.data}
        />
      )}
    </section>
  );
}

function StandingsResults({
  onPageChange,
  standings,
}: {
  onPageChange: (page: number) => void;
  standings: ProgressionStandings;
}) {
  const currentPlayerOnPage = standings.entries.some(
    (entry) => entry.isCurrentPlayer,
  );
  const { page, totalPages } = standings.pagination;

  return (
    <div className="standings-results">
      {standings.entries.length === 0 ? (
        <div className="progression-empty-state standings-empty-state state-message state-message--empty">
          <StateIcon tone="empty" />
          <h3>No players appear on this page</h3>
          <p>
            Use the available page controls or choose another standings period.
            Your standing is shown separately below.
          </p>
        </div>
      ) : null}

      <div className="standings-table">
        <div aria-hidden="true" className="standings-table__header">
          <span>Rank</span>
          <span>Player</span>
          <span>Points</span>
          <span>Streak</span>
          <span>Best</span>
        </div>
        <ul aria-label="Player standings" className="standings-list">
          {standings.entries.map((entry, index) => (
            <StandingRow
              entry={entry}
              key={`${entry.rank}-${entry.playerName ?? 'deleted'}-${index}`}
            />
          ))}
        </ul>
      </div>

      {!currentPlayerOnPage ? (
        <aside
          aria-current="true"
          aria-label="Your standing"
          className="standing-row standing--current-player standing--outside-page"
          data-rank={standings.currentPlayer.rank}
        >
          <StandingRowContent entry={standings.currentPlayer} />
        </aside>
      ) : null}

      <nav aria-label="Standings pages" className="standings-pagination">
        <button
          className="button button--quiet"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          Previous
        </button>
        <p aria-live="polite">
          Page {numberFormatter.format(page)} of{' '}
          {numberFormatter.format(totalPages)}
        </p>
        <button
          className="button button--quiet"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          Next
        </button>
      </nav>
    </div>
  );
}

function StandingRow({ entry }: { entry: StandingsEntry }) {
  return (
    <li
      aria-current={entry.isCurrentPlayer ? 'true' : undefined}
      aria-label={entry.isCurrentPlayer ? 'Your standing' : undefined}
      className={`standing-row ${entry.isCurrentPlayer ? 'standing--current-player' : ''}`.trim()}
      data-rank={entry.rank}
    >
      <StandingRowContent entry={entry} />
    </li>
  );
}

function StandingRowContent({ entry }: { entry: StandingsEntry }) {
  return (
    <>
      <div className="standing__rank" data-rank={entry.rank}>
        {entry.rank <= 3 ? (
          entry.rank === 1 ? (
            <CrownIcon aria-hidden="true" size={20} weight="duotone" />
          ) : (
            <MedalIcon aria-hidden="true" size={20} weight="duotone" />
          )
        ) : null}
        <strong aria-label={`Rank ${numberFormatter.format(entry.rank)}`}>
          <span aria-hidden="true">#{numberFormatter.format(entry.rank)}</span>
        </strong>
      </div>
      <div className="standing__identity">
        <strong>
          {entry.playerName === null ? (
            <>
              <span>Deleted player</span>
              <span className="sr-only">, anonymous tombstone</span>
            </>
          ) : (
            <Link href={`/players/${encodeURIComponent(entry.playerName)}`}>
              {entry.playerName}
            </Link>
          )}
        </strong>
        {entry.isCurrentPlayer ? (
          <span className="standing__you">You</span>
        ) : null}
      </div>
      <dl className="standing__metrics standing__metrics--desktop">
        <div>
          <dt>Points</dt>
          <dd>{numberFormatter.format(entry.points)}</dd>
        </div>
        <div>
          <dt>Current streak</dt>
          <dd>{formatDays(entry.currentStreak)}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{formatDays(entry.longestStreak)}</dd>
        </div>
      </dl>
      <div className="standing__metrics--mobile">
        <p>{numberFormatter.format(entry.points)} points</p>
        <p>
          {numberFormatter.format(entry.currentStreak)} day streak
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>Best{' '}
          {formatDays(entry.longestStreak)}
        </p>
      </div>
    </>
  );
}

function ProgressionLoadingState({ label }: { label: string }) {
  return <LoadingState label={`${label}…`} />;
}

function ProgressionErrorState({
  context,
  error,
  onRetry,
  onSignIn,
  reauthFailed,
}: {
  context: 'profile' | 'standings';
  error: ProgressionApiError;
  onRetry: () => void;
  onSignIn: () => Promise<void>;
  reauthFailed: boolean;
}) {
  const authorization = error.failure === 'authorization';
  const accountUnavailable = error.failure === 'account-unavailable';
  const malformed = error.failure === 'malformed';
  const title = accountUnavailable
    ? context === 'profile'
      ? 'This progression profile is unavailable'
      : 'No active standing is available'
    : authorization
      ? 'Your session has expired'
      : malformed
        ? 'Progression data could not be displayed'
        : context === 'profile'
          ? 'Your progression profile could not load'
          : 'Standings could not load';
  const detail = accountUnavailable
    ? context === 'profile'
      ? 'The server did not return an active player profile. Deleted and pending-deletion accounts remain private.'
      : 'Only active players receive a live rank. Deleted and pending-deletion accounts do not appear in standings.'
    : authorization
      ? 'Sign in again to load your progression.'
      : malformed
        ? 'Your progression could not be displayed. Try loading it again.'
        : 'Check your connection and try again. Your points, rank, streaks, and achievements remain unchanged on the server.';

  return (
    <div
      className="progression-inline-state state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
      <h3>{title}</h3>
      <p>{detail}</p>
      {error.requestId ? (
        <p className="progression-support-reference">
          Support reference: {error.requestId}
        </p>
      ) : null}
      <div className="progression-inline-state__actions">
        {authorization ? (
          <button
            className="button"
            onClick={() => void onSignIn()}
            type="button"
          >
            Sign in again
          </button>
        ) : (
          <button className="button" onClick={onRetry} type="button">
            Try again
          </button>
        )}
      </div>
      {reauthFailed && authorization ? (
        <p>Sign-in could not start. Try again.</p>
      ) : null}
    </div>
  );
}

function currentJohannesburgMonth() {
  const parts = createAppDateTimeFormatter('en-ZA', {
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  return year && month ? `${year}-${month}` : '';
}

function standingsTitle(standings: ProgressionStandings) {
  if (standings.period === 'all_time') {
    return 'All-time standings';
  }

  const [year, month] = standings.month!.split('-').map(Number);
  return `${monthFormatter.format(new Date(Date.UTC(year!, month! - 1, 1)))} standings`;
}

function formatDays(value: number) {
  return `${numberFormatter.format(value)} ${value === 1 ? 'day' : 'days'}`;
}

function toProgressionError(error: unknown) {
  return error instanceof ProgressionApiError
    ? error
    : new ProgressionApiError('unavailable');
}
