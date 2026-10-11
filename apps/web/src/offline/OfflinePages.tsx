import { LoadingState, UpdatingIndicator } from '../components/LoadingState';
import { StatusMessage } from '../components/StatusMessage';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { OfflinePreparation, useOffline } from './OfflineProvider';
import { SearchField } from '../components/fields/SearchField';
import {
  useLocalState,
  formatSavedTime,
  ReconnectDeadline,
  SyncFeedback,
  rejectionMessage,
} from './OfflineAttemptState';
export { OfflineAttemptPage } from './OfflineAttemptPage';
import '../components/challenge/challenge.css';
import './offline.css';

export function OfflineExplorePage() {
  const { state, error, reading } = useLocalState();
  const {
    refresh,
    revision,
    online,
    syncing,
    syncFailed,
    attemptSync = {},
    connectionFailed,
    retryConnection,
  } = useOffline();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const availablePacks =
    state?.packs.filter(
      (cached) =>
        !state.attempts.some(
          (attempt) =>
            attempt.cached.pack.event.eventId === cached.pack.event.eventId,
        ),
    ) ?? [];
  const events = availablePacks.filter((cached) =>
    `${cached.pack.event.title} ${cached.pack.event.description ?? ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <section aria-labelledby="saved-events-title" className="offline-page">
      <header className="offline-page__header">
        <h1 id="saved-events-title">Downloads & saved attempts</h1>
        <Link className="button button--quiet" href="/explore">
          Back to Explore
        </Link>
      </header>
      <OfflinePreparation detailed />
      {online && connectionFailed && (
        <StatusMessage tone="info">
          The server could not be reached. You can keep playing saved
          challenges.
          <button className="button button--quiet" onClick={retryConnection}>
            Retry connection
          </button>
        </StatusMessage>
      )}
      {error && (
        <StatusMessage tone="error">
          {error}
          {error && (
            <button
              className="button button--secondary"
              onClick={refresh}
              type="button"
            >
              Retry device storage
            </button>
          )}
        </StatusMessage>
      )}
      {!state && (syncFailed || syncing) && <SyncFeedback />}
      {!state ? (
        error ? null : (
          <LoadingState
            label="Loading saved events…"
            onRetry={refresh}
            resetKey={revision}
          />
        )
      ) : !state.session ? (
        <p>
          Sign in while connected to prepare offline events on this device.{' '}
          <Link href="/explore">Return to explore</Link>
        </p>
      ) : (
        <>
          <section
            className="offline-page__section"
            aria-labelledby="saved-attempts-title"
          >
            <h2 id="saved-attempts-title">Attempts on this device</h2>
            {state.attempts.length === 0 && state.receipts.length === 0 && (
              <p>No saved attempts yet.</p>
            )}
            <ul className="offline-records">
              {[...state.attempts]
                .sort(
                  (a, b) =>
                    Number(b.status === 'active') -
                      Number(a.status === 'active') ||
                    a.startedAt.localeCompare(b.startedAt),
                )
                .map((attempt) => (
                  <li key={attempt.clientAttemptId}>
                    <div className="offline-record__heading">
                      <Link
                        className="offline-record__title"
                        href={`/offline-attempts/${attempt.clientAttemptId}`}
                      >
                        {attempt.cached.pack.event.title}
                      </Link>
                      <span className="offline-record__status">
                        {attempt.status === 'active'
                          ? 'In progress'
                          : attemptSync[attempt.clientAttemptId]?.status ===
                              'syncing'
                            ? 'Checking answers'
                            : attemptSync[attempt.clientAttemptId]?.status ===
                                'confirmed'
                              ? 'Confirmed'
                              : attemptSync[attempt.clientAttemptId]?.status ===
                                  'failed'
                                ? 'Needs attention'
                                : 'Answers saved'}
                      </span>
                    </div>
                    <p>
                      {attemptSync[attempt.clientAttemptId]?.message ??
                        (attempt.status === 'pending'
                          ? 'Saved locally — pending server validation; no reward confirmed.'
                          : 'Continue your challenge. The original timer still applies.')}
                    </p>
                    {attempt.status === 'pending' && (
                      <ReconnectDeadline attempt={attempt} now={now} />
                    )}
                  </li>
                ))}
              {state.receipts.map((receipt) => (
                <li key={receipt.clientAttemptId}>
                  <div className="offline-record__heading">
                    <h3>{receipt.title}</h3>
                    <span className="offline-record__status">
                      {receipt.outcome === 'accepted'
                        ? 'Confirmed'
                        : 'Not accepted'}
                    </span>
                  </div>
                  {receipt.outcome === 'accepted' ? (
                    <Link href={`/challenge-attempts/${receipt.attemptId}`}>
                      View confirmed result
                    </Link>
                  ) : (
                    <span>{rejectionMessage(receipt.outcome)}</span>
                  )}
                </li>
              ))}
            </ul>
            {(state.attempts.some((attempt) => attempt.status === 'pending') ||
              syncing ||
              syncFailed) && <SyncFeedback controlsOnly />}
          </section>
          <section
            className="offline-page__section"
            aria-labelledby="downloaded-events-title"
          >
            <h2 id="downloaded-events-title">Downloaded events</h2>
            <UpdatingIndicator
              active={reading}
              label="Updating saved events"
              onRetry={refresh}
            />
            <SearchField
              label="Search saved events"
              placeholder="Search saved events"
              value={query}
              onChange={setQuery}
            />
            {availablePacks.length === 0 && (
              <p>
                No events are downloaded yet. Connect to prepare campus
                exploration automatically. Location access is not needed for
                downloads.
              </p>
            )}
            <ul className="offline-events">
              {events.map((cached) => (
                <li key={cached.pack.packId}>
                  <div className="offline-record__heading">
                    <h3>{cached.pack.event.title}</h3>
                    <span className="offline-record__status">
                      {Date.parse(cached.pack.validUntil) <= now
                        ? 'Expired'
                        : Date.parse(cached.pack.validFrom) > now
                          ? 'Upcoming'
                          : 'Downloaded'}
                    </span>
                  </div>
                  <p>
                    Start within {cached.pack.event.radiusMetres} metres of the
                    event · {cached.pack.questions.length} questions ·{' '}
                    {cached.pack.timeLimitSeconds} seconds.
                  </p>
                  <div className="offline-record__footer">
                    <span>
                      {Date.parse(cached.pack.validUntil) <= now
                        ? 'Reconnect to refresh this download.'
                        : Date.parse(cached.pack.validFrom) > now
                          ? `Opens ${formatSavedTime(cached.pack.validFrom)}`
                          : `Available until ${formatSavedTime(cached.pack.validUntil)}`}
                    </span>
                    <Link
                      className="button button--quiet"
                      aria-label={`Explore: ${cached.pack.event.title}`}
                      href={`/explore?event=${cached.pack.event.eventId}`}
                    >
                      Explore
                    </Link>
                  </div>
                  <details className="offline-record__details">
                    <summary>Event details</summary>
                    {cached.pack.event.description && (
                      <p>{cached.pack.event.description}</p>
                    )}
                    <p>
                      Opens {formatSavedTime(cached.pack.validFrom)} · Download
                      expires {formatSavedTime(cached.pack.validUntil)}.
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            {query && events.length === 0 && (
              <p>No saved events match your search.</p>
            )}
          </section>
          <details className="offline-page__help">
            <summary>About saved play</summary>
            <p>
              Downloads belong to {state.session.playerName} on this device.
              Answers stay here until the server can check them. Reconnect
              within 12 hours of completing a challenge; rewards appear only
              after confirmation.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
