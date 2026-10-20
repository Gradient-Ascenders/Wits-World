import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { createAppDateTimeFormatter } from '../date-time';
import { Link, useLocation } from 'wouter';
import { LoadingState, UpdatingIndicator } from '../components/LoadingState';
import { StatusMessage } from '../components/StatusMessage';
import { SearchField } from '../components/fields/SearchField';
import { requestBrowserLocation } from '../browser-location';
import { OfflinePreparation, useOffline } from './OfflineProvider';
import { launchSavedChallenge } from './launch-saved-challenge';
import { offlineLocationMessage } from './location';
import { type CachedPack, type LocalAttempt } from './store';
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

type AttemptGroup = 'active' | 'attention' | 'pending';
type EventGroup = 'ready' | 'upcoming' | 'expired';

function canContinue(attempt: LocalAttempt, now: number) {
  return (
    attempt.status === 'active' &&
    attempt.answers.length < attempt.cached.pack.questions.length &&
    Date.parse(attempt.startedAt) +
      attempt.cached.pack.timeLimitSeconds * 1000 >
      now
  );
}

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
    canSync,
  } = useOffline();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const [launch, setLaunch] = useState<{
    packId: string;
    phase: 'location' | 'saving' | 'failed';
    message: string;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const [focusedAttempt, setFocusedAttempt] = useState<{
    attempt: LocalAttempt;
    group: AttemptGroup;
  } | null>(null);
  const [focusedEvent, setFocusedEvent] = useState<{
    cached: CachedPack;
    group: EventGroup;
  } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(timer);
      request.current?.abort();
    };
  }, []);
  async function play(cached: CachedPack) {
    if (request.current || reading) return;
    const controller = new AbortController();
    request.current = controller;
    setLaunch({
      packId: cached.pack.packId,
      phase: 'location',
      message: 'Checking location before starting your timer…',
    });
    try {
      const attempt = await launchSavedChallenge({
        cached,
        signal: controller.signal,
        acquireLocation: () => requestBrowserLocation(controller.signal),
        onSaving: () =>
          setLaunch({
            packId: cached.pack.packId,
            phase: 'saving',
            message: 'Saving your challenge on this device…',
          }),
      });
      refresh();
      navigate(`/offline-attempts/${attempt.clientAttemptId}`);
    } catch (failure) {
      if (!controller.signal.aborted)
        setLaunch({
          packId: cached.pack.packId,
          phase: 'failed',
          message:
            failure instanceof Error
              ? offlineLocationMessage(failure)
              : 'This saved challenge could not open. Try Play again.',
        });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  const availablePacks =
    state?.packs.filter(
      (cached) =>
        !state.attempts.some(
          (attempt) =>
            attempt.cached.pack.event.eventId === cached.pack.event.eventId,
        ),
    ) ?? [];
  const eventGroup = (cached: CachedPack): EventGroup =>
    Date.parse(cached.pack.validUntil) <= now
      ? 'expired'
      : Date.parse(cached.pack.validFrom) > now
        ? 'upcoming'
        : 'ready';
  const savedEvents = [...availablePacks];
  if (
    focusedEvent &&
    state?.session?.playerId === focusedEvent.cached.pack.playerId &&
    !savedEvents.some(
      (cached) =>
        cached.pack.event.eventId === focusedEvent.cached.pack.event.eventId,
    ) &&
    !state.attempts.some(
      (attempt) =>
        attempt.cached.pack.event.eventId ===
        focusedEvent.cached.pack.event.eventId,
    )
  )
    savedEvents.push(focusedEvent.cached);
  const events = savedEvents.filter((cached) =>
    `${cached.pack.event.title} ${cached.pack.event.description ?? ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  const eventsIn = (group: EventGroup) =>
    events
      .filter(
        (cached) =>
          (focusedEvent?.cached.pack.event.eventId === cached.pack.event.eventId
            ? focusedEvent.group
            : eventGroup(cached)) === group,
      )
      .sort(
        (a, b) =>
          Date.parse(
            group === 'upcoming' ? a.pack.validFrom : a.pack.validUntil,
          ) -
            Date.parse(
              group === 'upcoming' ? b.pack.validFrom : b.pack.validUntil,
            ) ||
          a.pack.event.title.localeCompare(b.pack.event.title) ||
          a.pack.event.eventId.localeCompare(b.pack.event.eventId),
      );
  const attempts = [...(state?.attempts ?? [])];
  if (
    focusedAttempt &&
    state?.session?.playerId === focusedAttempt.attempt.playerId &&
    !attempts.some(
      (attempt) =>
        attempt.clientAttemptId === focusedAttempt.attempt.clientAttemptId,
    )
  )
    attempts.push(focusedAttempt.attempt);
  attempts.sort(
    (a, b) =>
      Date.parse(a.startedAt) +
      a.cached.pack.timeLimitSeconds * 1_000 -
      (Date.parse(b.startedAt) + b.cached.pack.timeLimitSeconds * 1_000),
  );
  const attemptGroup = (attempt: LocalAttempt): AttemptGroup =>
    canContinue(attempt, now)
      ? 'active'
      : attemptSync[attempt.clientAttemptId]?.status === 'failed' ||
          attempt.status === 'active'
        ? 'attention'
        : 'pending';
  const attemptsIn = (group: AttemptGroup) =>
    attempts.filter(
      (attempt) =>
        (focusedAttempt?.attempt.clientAttemptId === attempt.clientAttemptId
          ? focusedAttempt.group
          : attemptGroup(attempt)) === group,
    );
  const ready = availablePacks.filter(
    (cached) => eventGroup(cached) === 'ready',
  );
  const rejected =
    state?.receipts.filter((receipt) => receipt.outcome !== 'accepted') ?? [];
  const confirmed =
    state?.receipts.filter((receipt) => receipt.outcome === 'accepted') ?? [];

  function renderAttempt(attempt: LocalAttempt, group: AttemptGroup) {
    const current = attemptSync[attempt.clientAttemptId];
    const receipt = state?.receipts.find(
      (item) => item.clientAttemptId === attempt.clientAttemptId,
    );
    const continuing = !receipt && canContinue(attempt, now);
    const locked = !receipt && attempt.status === 'active' && !continuing;
    const confirmedId =
      receipt?.outcome === 'accepted'
        ? receipt.attemptId
        : current?.status === 'confirmed'
          ? current.attemptId
          : undefined;
    const status = receipt
      ? receipt.outcome === 'accepted'
        ? 'Confirmed'
        : 'Could not confirm'
      : locked || current?.status === 'failed'
        ? 'Needs attention'
        : continuing
          ? 'In progress'
          : current?.status === 'syncing'
            ? 'Preparing your result'
            : current?.status === 'confirmed'
              ? 'Confirmed'
              : !online || connectionFailed
                ? 'Awaiting reconnection'
                : 'Awaiting confirmation';
    const action = confirmedId
      ? 'View confirmed result'
      : continuing
        ? 'Continue'
        : 'View saved';
    return (
      <li
        key={attempt.clientAttemptId}
        className={`offline-board__record${continuing ? ' offline-board__record--active' : ''}`}
        onFocusCapture={() => setFocusedAttempt({ attempt, group })}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocusedAttempt(null);
        }}
      >
        <div className="offline-board__row">
          <h3>{attempt.cached.pack.event.title}</h3>
          <div className="offline-board__timing">
            {continuing ? (
              <span
                className="offline-board__remaining"
                aria-label="Original challenge time remaining"
              >
                {formatRemainingTime(attempt, now)} remaining
              </span>
            ) : !receipt && !confirmedId && attempt.status === 'pending' ? (
              <ReconnectDeadline
                attempt={attempt}
                now={now}
                compact
                connected={online && !connectionFailed && canSync}
              />
            ) : (
              <span className="offline-board__status">{status}</span>
            )}
          </div>
          <p className="offline-board__metadata">
            {receipt
              ? rejectionMessage(receipt.outcome)
              : locked
                ? `${attempt.answers.length} answers saved. Finish saving this attempt to have it checked.`
                : continuing
                  ? `${attempt.answers.length} of ${attempt.cached.pack.questions.length} answers saved`
                  : (current?.message ?? 'Saved locally. No reward confirmed.')}
          </p>
          <Link
            className={`button offline-board__action${continuing ? '' : ' button--quiet'}`}
            href={
              confirmedId
                ? `/challenge-attempts/${confirmedId}`
                : `/offline-attempts/${attempt.clientAttemptId}`
            }
            aria-label={`${action}: ${attempt.cached.pack.event.title}`}
          >
            {action}
          </Link>
        </div>
      </li>
    );
  }

  function renderEvent(cached: CachedPack, group: EventGroup) {
    const expired = Date.parse(cached.pack.validUntil) <= now;
    const upcoming = Date.parse(cached.pack.validFrom) > now;
    const current = launch?.packId === cached.pack.packId ? launch : null;
    return (
      <li
        key={cached.pack.event.eventId}
        className="offline-board__record"
        onFocusCapture={() => setFocusedEvent({ cached, group })}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocusedEvent(null);
        }}
      >
        <div className="offline-board__row">
          <h3>{cached.pack.event.title}</h3>
          <p className="offline-board__timing">
            {expired ? (
              'Expired'
            ) : (
              <>
                {upcoming ? 'Opens ' : 'Until '}
                <time
                  dateTime={
                    upcoming ? cached.pack.validFrom : cached.pack.validUntil
                  }
                  title={formatSavedTime(
                    upcoming ? cached.pack.validFrom : cached.pack.validUntil,
                  )}
                >
                  {formatEventTime(
                    upcoming ? cached.pack.validFrom : cached.pack.validUntil,
                    now,
                  )}
                </time>
              </>
            )}
          </p>
          <details className="offline-board__metadata offline-record__details">
            <summary aria-label={`Event details: ${cached.pack.event.title}`}>
              {cached.pack.questions.length} questions ·{' '}
              {formatChallengeDuration(cached.pack.timeLimitSeconds)}
            </summary>
            {cached.pack.event.description && (
              <p>{cached.pack.event.description}</p>
            )}
            <p>Start within {cached.pack.event.radiusMetres} metres.</p>
            <p>
              Opens {formatSavedTime(cached.pack.validFrom)} · Download expires{' '}
              {formatSavedTime(cached.pack.validUntil)}.
            </p>
            {expired && <p>Reconnect to refresh this saved event.</p>}
          </details>
          {group === 'ready' ? (
            <button
              className={`button offline-board__action${active.length || attention.length || eventsIn('ready')[0] !== cached ? ' button--quiet' : ''}`}
              type="button"
              onClick={() => void play(cached)}
              disabled={
                expired ||
                upcoming ||
                reading ||
                (launch !== null && launch.phase !== 'failed')
              }
              aria-label={`${expired ? 'Expired' : current?.phase === 'location' ? 'Checking location' : current?.phase === 'saving' ? 'Saving' : 'Play'}: ${cached.pack.event.title}`}
              aria-describedby={`saved-feedback-${cached.pack.event.eventId} saved-location-hint`}
            >
              {expired
                ? 'Expired'
                : current?.phase === 'location'
                  ? 'Checking location…'
                  : current?.phase === 'saving'
                    ? 'Saving…'
                    : 'Play'}
            </button>
          ) : (
            <Link
              className="button button--quiet offline-board__action"
              href={`/explore?event=${cached.pack.event.eventId}`}
              aria-label={`View saved: ${cached.pack.event.title}`}
            >
              View details
            </Link>
          )}
        </div>
        {group === 'ready' && (
          <p
            id={`saved-feedback-${cached.pack.event.eventId}`}
            className={`offline-board__feedback${current?.phase === 'failed' ? ' offline-board__feedback--error' : ''}`}
            role="status"
          >
            {expired ? 'This download has expired.' : current?.message}
          </p>
        )}
      </li>
    );
  }

  const active = attemptsIn('active');
  const attention = attemptsIn('attention');
  const pending = attemptsIn('pending');
  const showSearch = availablePacks.length > 4 || query.length > 0;
  return (
    <section
      aria-labelledby="saved-events-title"
      className="offline-page offline-board"
    >
      <header className="offline-page__header offline-board__header">
        <h1 id="saved-events-title">Saved play</h1>
        <Link className="offline-board__return" href="/explore">
          <ArrowLeft aria-hidden="true" size={20} />
          Back to Explore
        </Link>
      </header>
      <OfflinePreparation
        detailed
        compact
        reading={!state && reading}
        savedEvents={availablePacks.length}
        readyEvents={ready.length}
        savedAttempts={state?.attempts.length ?? 0}
      />
      {error && (
        <StatusMessage tone="error">
          {error}
          <button
            className="button button--quiet"
            onClick={refresh}
            type="button"
          >
            Retry device storage
          </button>
        </StatusMessage>
      )}
      {!state ? (
        error ? null : (
          <LoadingState
            label="Loading saved events…"
            onRetry={refresh}
            resetKey={revision}
          />
        )
      ) : !state.session ? (
        <div className="offline-page__empty">
          <h2>No saved events on this device</h2>
          <p>
            {!online || connectionFailed
              ? 'Reconnect to save campus events here. Your device needs a connection for its first download.'
              : 'Open Explore while signed in to save campus events automatically. Location access is only needed when you play.'}
          </p>
          <Link className="button" href="/explore">
            Explore events
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section
              className="offline-board__section"
              aria-labelledby="saved-active-title"
            >
              <h2 id="saved-active-title" className="offline-board__heading">
                In progress
              </h2>
              <ul className="offline-board__records">
                {active.map((attempt) => renderAttempt(attempt, 'active'))}
              </ul>
            </section>
          )}
          {attention.length > 0 && (
            <section
              className="offline-board__section"
              aria-labelledby="saved-attention-title"
            >
              <h2 id="saved-attention-title" className="offline-board__heading">
                Needs attention
              </h2>
              <ul className="offline-board__records">
                {attention.map((attempt) =>
                  renderAttempt(attempt, 'attention'),
                )}
              </ul>
            </section>
          )}
          {(syncing || syncFailed || (pending.length > 0 && online)) && (
            <SyncFeedback controlsOnly connectionControl={false} />
          )}
          <UpdatingIndicator
            active={reading}
            label="Updating saved events"
            onRetry={refresh}
          />
          {showSearch && (
            <SearchField
              label="Search saved events"
              placeholder="Search saved events"
              value={query}
              onChange={setQuery}
            />
          )}
          {(['ready', 'upcoming'] as const).map((group) => {
            const records = eventsIn(group);
            if (!records.length) return null;
            return (
              <section
                key={group}
                className="offline-board__section"
                aria-labelledby={`saved-${group}-title`}
              >
                <h2
                  id={`saved-${group}-title`}
                  className="offline-board__heading"
                >
                  {group === 'ready' ? 'Ready to play' : 'Opening later'}
                  <span className="offline-page__count">{records.length}</span>
                </h2>
                <ul className="offline-board__records">
                  {records.map((cached) => renderEvent(cached, group))}
                </ul>
                {group === 'ready' && (
                  <p id="saved-location-hint" className="offline-board__hint">
                    Location is checked before your timer starts.
                  </p>
                )}
              </section>
            );
          })}
          {availablePacks.length === 0 && (
            <div className="offline-page__empty">
              <h2>
                {attempts.length
                  ? 'Find your next challenge'
                  : 'No saved events yet'}
              </h2>
              <p>
                {attempts.length
                  ? 'Your saved challenges stay here. Explore to find more events.'
                  : 'Open Explore while connected to save campus events automatically.'}
              </p>
              <Link
                className={`button${attempts.length ? ' button--quiet' : ''}`}
                href="/explore"
              >
                Explore events
              </Link>
            </div>
          )}
          {query.trim() && events.length === 0 && (
            <p role="status" className="offline-board__hint">
              No saved events match your search.
            </p>
          )}
          {pending.length > 0 && (
            <section
              className="offline-board__section"
              aria-labelledby="saved-pending-title"
            >
              <h2 id="saved-pending-title" className="offline-board__heading">
                Awaiting confirmation
              </h2>
              <ul className="offline-board__records">
                {pending.map((attempt) => renderAttempt(attempt, 'pending'))}
              </ul>
            </section>
          )}
          {eventsIn('expired').length > 0 && (
            <details className="offline-board__disclosure">
              <summary>
                Expired downloads
                <span className="offline-page__count">
                  {eventsIn('expired').length}
                </span>
              </summary>
              <ul className="offline-board__records">
                {eventsIn('expired').map((cached) =>
                  renderEvent(cached, 'expired'),
                )}
              </ul>
            </details>
          )}
          {confirmed.length + rejected.length > 0 && (
            <details className="offline-page__history offline-board__disclosure">
              <summary>
                Past results
                <span>
                  {confirmed.length} confirmed · {rejected.length} rejected
                </span>
              </summary>
              <ul className="offline-board__records">
                {[...confirmed, ...rejected]
                  .sort((a, b) => b.receivedAt - a.receivedAt)
                  .map((receipt) => (
                    <li
                      key={receipt.clientAttemptId}
                      className="offline-board__record"
                    >
                      <div className="offline-board__row">
                        <h3>{receipt.title}</h3>
                        <p className="offline-board__metadata">
                          {receipt.outcome === 'accepted'
                            ? 'Confirmed by Wits World'
                            : rejectionMessage(receipt.outcome)}
                        </p>
                        <Link
                          className="button button--quiet offline-board__action"
                          href={
                            receipt.outcome === 'accepted'
                              ? `/challenge-attempts/${receipt.attemptId}`
                              : `/offline-attempts/${receipt.clientAttemptId}`
                          }
                          aria-label={
                            receipt.outcome === 'accepted'
                              ? undefined
                              : `View saved: ${receipt.title}`
                          }
                        >
                          {receipt.outcome === 'accepted'
                            ? 'View confirmed result'
                            : 'View saved'}
                        </Link>
                      </div>
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <details className="offline-page__help offline-board__disclosure">
            <summary>About saved play</summary>
            <p>
              Saved events belong to {state.session.playerName} on this device.
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

function formatRemainingTime(attempt: LocalAttempt, now: number) {
  const seconds = Math.max(
    0,
    Math.ceil(
      (Date.parse(attempt.startedAt) +
        attempt.cached.pack.timeLimitSeconds * 1_000 -
        now) /
        1_000,
    ),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const eventDay = createAppDateTimeFormatter('en-GB', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});
const eventTime = createAppDateTimeFormatter(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const eventDateTime = createAppDateTimeFormatter(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatEventTime(value: string, now: number) {
  const time = new Date(value);
  return eventDay.format(time) === eventDay.format(now)
    ? eventTime.format(time)
    : eventDateTime.format(time);
}

function formatChallengeDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} timer`;
}
