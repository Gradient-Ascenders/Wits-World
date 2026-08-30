import { useAuth0 } from '@auth0/auth0-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import {
  getCurrentProgressionProfile,
  listProgressionStandings,
  ProgressionApiError,
  type CurrentProgressionProfile,
  type ProgressionAchievement,
  type ProgressionStandings,
  type StandingsEntry,
  type StandingsPeriod,
} from '../api/progression';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import './profile.css';

interface ProfilePageProps {
  apiBaseUrl: string;
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
const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/u;
const numberFormatter = new Intl.NumberFormat('en-ZA');
const monthFormatter = new Intl.DateTimeFormat('en-ZA', {
  month: 'long',
  timeZone: 'Africa/Johannesburg',
  year: 'numeric',
});

export default function ProfilePage({ apiBaseUrl }: ProfilePageProps) {
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [profile, setProfile] = useState<
    ResourceState<CurrentProgressionProfile>
  >({ status: 'loading' });
  const [profileRevision, setProfileRevision] = useState(0);
  const [standingsQuery, setStandingsQuery] = useState<StandingsQuery>({
    page: 1,
    period: 'all_time',
  });
  const [standings, setStandings] = useState<
    ResourceState<ProgressionStandings>
  >({ status: 'loading' });
  const [standingsRevision, setStandingsRevision] = useState(0);
  const [draftPeriod, setDraftPeriod] = useState<StandingsPeriod>('all_time');
  const [draftMonth, setDraftMonth] = useState(currentJohannesburgMonth);
  const [monthError, setMonthError] = useState(false);
  const [reauthFailed, setReauthFailed] = useState(false);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusProfile = useRef(false);
  const standingsHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusStandings = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setProfile({ status: 'loading' });

    void getCurrentProgressionProfile({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setProfile({ data, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProfile({ error: toProgressionError(error), status: 'error' });
        }
      });

    return () => controller.abort();
  }, [apiBaseUrl, getAccessToken, profileRevision]);

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
    if (shouldFocusProfile.current && profile.status !== 'loading') {
      shouldFocusProfile.current = false;
      profileHeading.current?.focus();
    }
  }, [profile.status]);

  useEffect(() => {
    if (shouldFocusStandings.current && standings.status !== 'loading') {
      shouldFocusStandings.current = false;
      standingsHeading.current?.focus();
    }
  }, [standings.status]);

  async function startSignIn() {
    setReauthFailed(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/profile' } });
    } catch {
      setReauthFailed(true);
    }
  }

  function applyStandingsFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draftPeriod === 'monthly' && !monthPattern.test(draftMonth)) {
      setMonthError(true);
      return;
    }

    setMonthError(false);
    shouldFocusStandings.current = true;
    setStandingsQuery({
      ...(draftPeriod === 'monthly' ? { month: draftMonth } : {}),
      page: 1,
      period: draftPeriod,
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

  function retryProfile() {
    shouldFocusProfile.current = true;
    setProfileRevision((revision) => revision + 1);
  }

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <p className="eyebrow">Player progression</p>
        <h1>Your place in Wits Quest</h1>
        <p className="lead">
          See your server-recorded points, streaks, achievements, and standing.
        </p>
      </header>

      <section aria-labelledby="profile-summary-heading">
        <h2
          className="sr-only"
          id="profile-summary-heading"
          ref={profileHeading}
          tabIndex={-1}
        >
          Current player profile
        </h2>
        {profile.status === 'loading' ? (
          <ProgressionLoadingState label="Loading your progression profile" />
        ) : profile.status === 'error' ? (
          <ProgressionErrorState
            context="profile"
            error={profile.error}
            onRetry={retryProfile}
            onSignIn={startSignIn}
            reauthFailed={reauthFailed}
          />
        ) : (
          <ProfileSummary profile={profile.data} />
        )}
      </section>

      <div className="progression-detail-layout">
        <section
          aria-labelledby="achievements-heading"
          className="progression-section achievement-section"
        >
          <div className="progression-section__heading">
            <div>
              <p className="eyebrow">Milestones</p>
              <h2 id="achievements-heading">Achievements</h2>
            </div>
            {profile.status === 'ready' ? (
              <p>
                {numberFormatter.format(
                  profile.data.achievements.filter(
                    (achievement) => achievement.earned,
                  ).length,
                )}{' '}
                of {numberFormatter.format(profile.data.achievements.length)}{' '}
                earned
              </p>
            ) : null}
          </div>

          {profile.status === 'loading' ? (
            <ProgressionLoadingState label="Loading achievement progress" />
          ) : profile.status === 'error' ? (
            <p className="progression-dependent-state">
              Achievement progress will appear when your profile is available.
            </p>
          ) : profile.data.achievements.length === 0 ? (
            <div className="progression-empty-state">
              <h3>No achievements are available yet</h3>
              <p>
                Your points, rank, and streak remain visible while the active
                achievement catalogue is empty.
              </p>
            </div>
          ) : (
            <AchievementList achievements={profile.data.achievements} />
          )}
        </section>

        <section
          aria-busy={standings.status === 'loading' ? 'true' : undefined}
          aria-labelledby="standings-heading"
          className="progression-section standings-section"
        >
          <div className="progression-section__heading standings-section__heading">
            <div>
              <p className="eyebrow">Campus standings</p>
              <h2 id="standings-heading" ref={standingsHeading} tabIndex={-1}>
                {standings.status === 'ready'
                  ? standingsTitle(standings.data)
                  : 'Standings'}
              </h2>
            </div>
            {standings.status === 'ready' ? (
              <p>
                {numberFormatter.format(standings.data.pagination.totalPlayers)}{' '}
                {standings.data.pagination.totalPlayers === 1
                  ? 'player'
                  : 'players'}
              </p>
            ) : null}
          </div>

          <form
            aria-describedby="standings-filter-hint"
            className="standings-filter"
            onSubmit={applyStandingsFilter}
          >
            <div className="standings-filter__field">
              <label htmlFor="standings-period">Period</label>
              <select
                id="standings-period"
                onChange={(event) => {
                  setDraftPeriod(event.target.value as StandingsPeriod);
                  setMonthError(false);
                }}
                value={draftPeriod}
              >
                <option value="all_time">All time</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {draftPeriod === 'monthly' ? (
              <div className="standings-filter__field">
                <label htmlFor="standings-month">Month</label>
                <input
                  aria-describedby={
                    monthError ? 'standings-month-error' : undefined
                  }
                  aria-invalid={monthError ? 'true' : undefined}
                  id="standings-month"
                  onChange={(event) => {
                    setDraftMonth(event.target.value);
                    setMonthError(false);
                  }}
                  required
                  type="month"
                  value={draftMonth}
                />
              </div>
            ) : null}
            <button
              className="button button--quiet standings-filter__submit"
              disabled={standings.status === 'loading'}
              type="submit"
            >
              View standings
            </button>
            <p className="sr-only" id="standings-filter-hint">
              Choose all-time standings or a Johannesburg calendar month.
            </p>
            {monthError ? (
              <p
                className="standings-filter__error"
                id="standings-month-error"
                role="alert"
              >
                Choose a valid month.
              </p>
            ) : null}
          </form>

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
      </div>
    </div>
  );
}

function ProfileSummary({ profile }: { profile: CurrentProgressionProfile }) {
  return (
    <div className="progression-profile">
      <div className="progression-profile__identity">
        <p className="eyebrow">Current player</p>
        <h2>{profile.playerName}</h2>
        <p>
          Every value below comes from your authenticated progression record.
        </p>
      </div>
      <dl className="progression-stats">
        <ProgressionStat label="Points">
          {numberFormatter.format(profile.points)}
        </ProgressionStat>
        <ProgressionStat label="All-time rank">
          <span aria-label={`Rank ${numberFormatter.format(profile.rank)}`}>
            <span aria-hidden="true">
              #{numberFormatter.format(profile.rank)}
            </span>
          </span>
        </ProgressionStat>
        <ProgressionStat label="Current streak">
          {formatDays(profile.currentStreak)}
        </ProgressionStat>
        <ProgressionStat label="Longest streak">
          {formatDays(profile.longestStreak)}
        </ProgressionStat>
      </dl>
    </div>
  );
}

function ProgressionStat({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AchievementList({
  achievements,
}: {
  achievements: ProgressionAchievement[];
}) {
  return (
    <ul aria-label="Achievement progress" className="achievement-list">
      {achievements.map((achievement) => {
        const progressLabel = achievement.earned
          ? `Current ${numberFormatter.format(achievement.progress)} · target ${numberFormatter.format(achievement.target)}`
          : `${numberFormatter.format(achievement.progress)} of ${numberFormatter.format(achievement.target)}`;

        return (
          <li
            className={achievement.earned ? 'achievement--earned' : undefined}
            key={achievement.code}
          >
            <div className="achievement__heading">
              <h3>{achievement.title}</h3>
              <span className="achievement__status">
                {achievement.earned ? 'Earned' : 'Not yet earned'}
              </span>
            </div>
            <p>{achievement.description}</p>
            <div className="achievement__progress">
              <progress
                aria-label={`${achievement.title}: ${achievement.earned ? 'Earned' : 'Not yet earned'}, ${progressLabel}`}
                max={achievement.target}
                value={achievement.progress}
              />
              <span>{progressLabel}</span>
            </div>
          </li>
        );
      })}
    </ul>
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
      {!currentPlayerOnPage ? (
        <aside
          aria-label="Your standing"
          className="current-standing current-standing--outside-page"
        >
          <div>
            <p className="eyebrow">Your standing</p>
            <strong>{standings.currentPlayer.playerName}</strong>
            <p className="current-standing__rank">
              Rank{' '}
              <strong>
                {numberFormatter.format(standings.currentPlayer.rank)}
              </strong>
            </p>
          </div>
          <StandingMetrics entry={standings.currentPlayer} />
        </aside>
      ) : null}

      {standings.entries.length === 0 ? (
        <div className="progression-empty-state standings-empty-state">
          <h3>No players appear on this page</h3>
          <p>
            Use the available page controls or choose another standings period.
            Your authoritative standing remains shown above when available.
          </p>
        </div>
      ) : (
        <ul aria-label="Player standings" className="standings-list">
          {standings.entries.map((entry, index) => (
            <li
              aria-current={entry.isCurrentPlayer ? 'true' : undefined}
              className={
                entry.isCurrentPlayer ? 'standing--current-player' : undefined
              }
              key={`${entry.rank}-${entry.playerName ?? 'deleted'}-${index}`}
            >
              <div className="standing__rank">
                <span>Rank</span>
                <strong>{numberFormatter.format(entry.rank)}</strong>
              </div>
              <div className="standing__identity">
                <strong>
                  {entry.playerName === null ? (
                    <>
                      <span>Deleted player</span>
                      <span className="sr-only">, anonymous tombstone</span>
                    </>
                  ) : (
                    entry.playerName
                  )}
                </strong>
                {entry.isCurrentPlayer ? (
                  <span className="standing__you">Current player</span>
                ) : null}
              </div>
              <StandingMetrics entry={entry} />
            </li>
          ))}
        </ul>
      )}

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

function StandingMetrics({ entry }: { entry: StandingsEntry }) {
  return (
    <dl className="standing__metrics">
      <div>
        <dt>Points</dt>
        <dd>{numberFormatter.format(entry.points)}</dd>
      </div>
      <div>
        <dt>Current streak</dt>
        <dd>{formatDays(entry.currentStreak)}</dd>
      </div>
      <div>
        <dt>Longest streak</dt>
        <dd>{formatDays(entry.longestStreak)}</dd>
      </div>
    </dl>
  );
}

function ProgressionLoadingState({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="progression-inline-state progression-inline-state--loading"
      role="status"
    >
      <span aria-hidden="true" className="progression-loading-mark" />
      <p>{label}…</p>
    </div>
  );
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
      ? 'Sign in again to securely reload your server-recorded progression.'
      : malformed
        ? 'The server response did not match the privacy-safe progression contract, so Wits Quest did not show partial or guessed values.'
        : 'Check your connection and try again. Your points, rank, streaks, and achievements remain unchanged on the server.';

  return (
    <div className="progression-inline-state" role="alert">
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
  const parts = new Intl.DateTimeFormat('en-ZA', {
    month: '2-digit',
    timeZone: 'Africa/Johannesburg',
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
