import { useAuth0 } from '@auth0/auth0-react';
import {
  CheckIcon,
  CrownIcon,
  MedalIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

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

  function selectStandingsPeriod(period: StandingsPeriod) {
    if (period === standingsQuery.period) {
      return;
    }

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

  function retryProfile() {
    shouldFocusProfile.current = true;
    setProfileRevision((revision) => revision + 1);
  }

  return (
    <div className="profile-page">
      <section
        className="profile-overview"
        aria-labelledby="profile-summary-heading"
      >
        <header className="profile-page__header">
          <span className="profile-avatar" aria-hidden="true">
            {profile.status === 'ready' ? (
              profile.data.playerName
                .split(/[^\p{L}\p{N}]+/u)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => Array.from(part)[0])
                .join('')
                .toLocaleUpperCase()
            ) : (
              <UserIcon size={24} />
            )}
          </span>
          <div>
            <p className="eyebrow">Player profile</p>
            <h1 id="profile-summary-heading" ref={profileHeading} tabIndex={-1}>
              {profile.status === 'ready'
                ? profile.data.playerName
                : 'Player profile'}
            </h1>
            <p className="lead">Your Wits Quest progression</p>
          </div>
        </header>

        <div>
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
        </div>
      </section>

      <section
        aria-labelledby="achievements-heading"
        className="progression-section achievement-section"
      >
        <div className="progression-section__heading">
          <div>
            <h2 id="achievements-heading">Achievements</h2>
            <p>Keep exploring Wits Quest to unlock more.</p>
          </div>
          {profile.status === 'ready' ? (
            <p className="progression-section__summary">
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
              Your progress is saved here. Explore campus to find your next
              challenge.
            </p>
          </div>
        ) : (
          <AchievementList achievements={profile.data.achievements} />
        )}
      </section>

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
    </div>
  );
}

function ProfileSummary({ profile }: { profile: CurrentProgressionProfile }) {
  return (
    <div className="progression-profile">
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
        <ProgressionStat label="Best streak">
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
        const accessibleProgressLabel = achievement.earned
          ? `current progress ${numberFormatter.format(achievement.progress)}, target ${numberFormatter.format(achievement.target)}`
          : progressLabel;

        return (
          <li
            className={achievement.earned ? 'achievement--earned' : undefined}
            key={achievement.code}
          >
            <span aria-hidden="true" className="achievement__badge">
              <MedalIcon size={24} />
            </span>
            <div className="achievement__heading">
              <h3>{achievement.title}</h3>
              <span className="achievement__status">
                {achievement.earned ? (
                  <>
                    Earned
                    <CheckIcon aria-hidden="true" size={16} />
                  </>
                ) : (
                  'In progress'
                )}
              </span>
            </div>
            <p>{achievement.description}</p>
            <div className="achievement__progress">
              <progress
                aria-label={`${achievement.title}: ${achievement.earned ? 'Earned' : 'In progress'}, ${accessibleProgressLabel}`}
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
      {standings.entries.length === 0 ? (
        <div className="progression-empty-state standings-empty-state">
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
            entry.playerName
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
