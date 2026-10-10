import { LoadingState, UpdatingIndicator } from '../components/LoadingState';
import { createAppDateTimeFormatter } from '../date-time';
import { StatusMessage } from '../components/StatusMessage';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  BrowserLocationError,
  requestBrowserLocation,
} from '../browser-location';
import { ChallengeQuestion } from '../components/challenge/ChallengeQuestion';
import { OrderingChallengeQuestion } from '../components/challenge/OrderingChallengeQuestion';
import { formatChallengeTime } from '../challenge-deadline';
import { OfflinePreparation, useOffline } from './OfflineProvider';
import { SearchField } from '../components/fields/SearchField';
import { checkOfflineLocation } from './location';
import {
  boundOfflinePlayer,
  finishLocalAttempt,
  readOfflineState,
  saveLocalAnswer,
  type LocalAttempt,
} from './store';
import '../components/challenge/challenge.css';
import './offline.css';

type LocalState = Awaited<ReturnType<typeof readOfflineState>>;
export function useLocalState() {
  const { revision } = useOffline();
  const [state, setState] = useState<LocalState | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(true);
  useEffect(() => {
    let active = true;
    setError('');
    setReading(true);
    void readOfflineState()
      .then((value) => {
        if (active) setState(value);
      })
      .catch(() => {
        if (active)
          setError('Device storage is unavailable. Connect to play online.');
      })
      .finally(() => {
        if (active) setReading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return {
    state:
      state?.session && state.session.playerId !== boundOfflinePlayer()
        ? { session: undefined, packs: [], attempts: [], receipts: [] }
        : state,
    error,
    reading,
  };
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
    retryConnection,
  } = useOffline();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const events =
    state?.packs.filter(
      (cached) =>
        !state.attempts.some(
          (attempt) =>
            attempt.cached.pack.event.eventId === cached.pack.event.eventId,
        ) &&
        `${cached.pack.event.title} ${cached.pack.event.description ?? ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase().trim()),
    ) ?? [];
  return (
    <section
      aria-labelledby="saved-events-title"
      className="challenge-page offline-page"
    >
      <h1 id="saved-events-title">Downloads & saved attempts</h1>
      <p>
        <Link className="button" href="/explore">
          Back to Explore
        </Link>
      </p>
      <OfflinePreparation detailed />
      {online && connectionFailed && (
        <p>
          {connectionFailed &&
            'The server could not be reached. You can keep playing saved challenges. '}
          <button className="button button--quiet" onClick={retryConnection}>
            Retry connection
          </button>
        </p>
      )}
      <p>
        Answers stay on this device until the server can check them. Reconnect
        within 12 hours of completing a challenge.
      </p>
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
      {((state?.attempts.length ?? 0) > 0 || syncing || syncFailed) && (
        <SyncFeedback label="Sync saved attempts" />
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
        <p>
          Sign in while connected to prepare offline events on this device.{' '}
          <Link href="/explore">Return to explore</Link>
        </p>
      ) : (
        <>
          <p>Downloads belong to {state.session.playerName} on this device.</p>
          <h2>Attempts on this device</h2>
          {state.attempts.length === 0 && state.receipts.length === 0 && (
            <p>No saved attempts yet.</p>
          )}
          <ul>
            {state.attempts.map((attempt) => (
              <li key={attempt.clientAttemptId}>
                <Link href={`/offline-attempts/${attempt.clientAttemptId}`}>
                  {attempt.cached.pack.event.title}
                </Link>{' '}
                —{' '}
                {attemptSync[attempt.clientAttemptId]?.message ??
                  (attempt.status === 'pending'
                    ? 'Saved locally — pending server validation; no reward confirmed.'
                    : 'in progress')}
              </li>
            ))}
          </ul>
          <ul>
            {state.receipts.map((receipt) => (
              <li key={receipt.clientAttemptId}>
                {receipt.title}:{' '}
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
          <h2>Downloaded events</h2>
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
          {state.packs.length === 0 && (
            <p>
              No events are downloaded yet. Connect to prepare campus
              exploration automatically. Location access is not needed for
              downloads.
            </p>
          )}
          <ul className="offline-events">
            {events.map((cached) => (
              <li key={cached.pack.packId}>
                <h2>{cached.pack.event.title}</h2>
                <p>{cached.pack.event.description}</p>
                <p>
                  {Date.parse(cached.pack.validUntil) <= now
                    ? 'Expired. Opened '
                    : Date.parse(cached.pack.validFrom) > now
                      ? 'Opens '
                      : 'Available now. Opened '}
                  {createAppDateTimeFormatter(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(cached.pack.validFrom))}
                  .
                </p>
                <p>
                  Start within {cached.pack.event.radiusMetres} metres of the
                  event. {cached.pack.questions.length} questions ·{' '}
                  {cached.pack.timeLimitSeconds} seconds.
                </p>
                <p>
                  Available until{' '}
                  {createAppDateTimeFormatter(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(cached.pack.validUntil))}
                  .
                </p>
                <p>
                  {Date.parse(cached.pack.validUntil) <= now
                    ? 'Expired. Reconnect to refresh this download.'
                    : 'Downloaded.'}{' '}
                  Open this event in{' '}
                  <Link href={`/explore?event=${cached.pack.event.eventId}`}>
                    Explore
                  </Link>
                  .
                </p>
              </li>
            ))}
          </ul>
          {query && events.length === 0 && (
            <p>No saved events match your search.</p>
          )}
        </>
      )}
    </section>
  );
}

function SyncFeedback({ label }: { label: string }) {
  const {
    syncing,
    syncMessage,
    syncFailed,
    sync,
    cancelSync,
    online,
    canSync,
    restoreSession,
  } = useOffline();
  return (
    <div aria-busy={syncing}>
      {syncMessage && (
        <StatusMessage tone={syncFailed ? 'error' : 'info'} role={undefined}>
          {syncMessage}
        </StatusMessage>
      )}
      {online && !canSync ? (
        <button
          className="button"
          onClick={() => void restoreSession()}
          type="button"
        >
          Sign in to check answers
        </button>
      ) : syncFailed ? (
        <button
          className="button"
          disabled={syncing || !online}
          onClick={() => void sync()}
          type="button"
        >
          {syncing
            ? 'Syncing saved attempts…'
            : syncFailed
              ? 'Retry sync'
              : label}
        </button>
      ) : null}
      {syncing && (
        <button
          className="button button--secondary"
          onClick={cancelSync}
          type="button"
        >
          Cancel sync
        </button>
      )}
      {!syncFailed && (
        <p>
          {online
            ? 'Saved answers are checked automatically when your account is connected.'
            : 'Answers saved. We’ll check them when you reconnect.'}
        </p>
      )}
    </div>
  );
}

export function OfflineAttemptPage() {
  const { clientAttemptId } = useParams<{ clientAttemptId: string }>();
  const { state, error } = useLocalState();
  const { refresh, revision, sync, attemptSync = {} } = useOffline();
  const attempt = state?.attempts.find(
    (item) => item.clientAttemptId === clientAttemptId,
  );
  const receipt = state?.receipts.find(
    (item) => item.clientAttemptId === clientAttemptId,
  );
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);
  const finishRequest = useRef<AbortController | null>(null);
  const automaticFinish = useRef<string | null>(null);
  const question = attempt?.cached.pack.questions[attempt.answers.length];
  const deadline = attempt
    ? Date.parse(attempt.startedAt) +
      attempt.cached.pack.timeLimitSeconds * 1000
    : 0;
  const expired = now >= deadline;
  const needsFinishLocation =
    attempt?.cached.pack.locationPolicy !== 'arrival-v1';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    automaticFinish.current = null;
    setBusy(false);
    setMessage('');
    return () => {
      finishRequest.current?.abort();
      finishRequest.current = null;
      finishing.current = false;
    };
  }, [clientAttemptId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setSelected(null);
    setOrder(question?.options.map((item) => item.id) ?? []);
    heading.current?.focus();
  }, [question?.id]);
  async function finish(value: LocalAttempt) {
    if (finishing.current) return;
    finishing.current = true;
    const controller = new AbortController();
    finishRequest.current = controller;
    setBusy(true);
    const requiresLocation = value.cached.pack.locationPolicy !== 'arrival-v1';
    setMessage(
      requiresLocation
        ? 'Getting your location. Your answers are saved on this device.'
        : 'Saving your completed attempt. Your answers are saved on this device.',
    );
    try {
      const location = requiresLocation
        ? await requestBrowserLocation(controller.signal)
        : undefined;
      controller.signal.throwIfAborted();
      if (location)
        checkOfflineLocation(location, value.cached.pack.event, false);
      await finishLocalAttempt(value.clientAttemptId, location);
      controller.signal.throwIfAborted();
      setMessage(
        'Answers saved on this device. Waiting for server validation.',
      );
      refresh();
      // A slow server must not keep the local location step busy.
      void sync();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setMessage(
        failure instanceof BrowserLocationError
          ? `Your answers are saved. ${offlineLocationMessage(failure)}`
          : failure instanceof Error && !(failure instanceof DOMException)
            ? failure.message
            : requiresLocation
              ? 'Your answers are saved. Location is needed to finish verification; retry when a location is available.'
              : 'Your answers are saved, but the completed attempt could not be finalised on this device. Retry saving.',
      );
    } finally {
      if (finishRequest.current === controller) {
        finishRequest.current = null;
        finishing.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    if (
      attempt?.status === 'active' &&
      (expired || attempt.answers.length === 5) &&
      automaticFinish.current !== attempt.clientAttemptId
    ) {
      automaticFinish.current = attempt.clientAttemptId;
      void finish(attempt);
    }
    // A failed automatic sample waits for an explicit retry, not another tick.
  }, [
    attempt?.clientAttemptId,
    attempt?.status,
    attempt?.answers.length,
    expired,
  ]);
  async function answer() {
    if (!attempt || !question || busy) return;
    setBusy(true);
    try {
      await saveLocalAnswer(
        attempt.clientAttemptId,
        question.id,
        attempt.cached.pack.format === 'ordering'
          ? order
          : selected
            ? [selected]
            : [],
      );
      setMessage('Answer saved on this device.');
      refresh();
    } catch (failure) {
      setMessage(
        failure instanceof Error && !(failure instanceof DOMException)
          ? failure.message
          : 'Could not save this answer.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!state && !error)
    return (
      <section className="challenge-page challenge-panel">
        <h1>Saved attempt</h1>
        <LoadingState
          label="Loading saved challenge…"
          onRetry={refresh}
          resetKey={revision}
        />
      </section>
    );
  if (!attempt)
    return (
      <section className="challenge-page">
        <h1 className="status-title">
          {receipt?.outcome === 'accepted'
            ? 'Attempt confirmed'
            : 'Saved attempt'}
        </h1>
        <p>
          {error ||
            (receipt
              ? rejectionMessage(receipt.outcome)
              : 'This attempt is not available for the current local account.')}
        </p>
        {error && (
          <button
            className="button button--secondary"
            onClick={refresh}
            type="button"
          >
            Retry device storage
          </button>
        )}
        {receipt?.attemptId && (
          <Link href={`/challenge-attempts/${receipt.attemptId}`}>
            View confirmed result
          </Link>
        )}{' '}
        <Link href="/offline">Saved events</Link>
      </section>
    );
  return (
    <section className="challenge-page challenge-panel">
      <h1>{attempt.cached.pack.event.title}</h1>
      <p role="status">
        {message ||
          'Offline attempt — answers are provisional until the server checks them.'}
      </p>
      {attempt.status === 'pending' ? (
        <>
          <p>
            {attemptSync[attempt.clientAttemptId]?.message ??
              'Saved on this device. Pending server validation; no reward confirmed.'}
          </p>
          <SyncFeedback label="Sync now" />
        </>
      ) : expired || !question ? (
        <>
          <p>
            {needsFinishLocation
              ? busy
                ? 'Answers locked. Completing location evidence…'
                : 'Answers locked and saved. Location is still needed to finish.'
              : busy
                ? 'Answers locked. Saving your attempt…'
                : 'Answers locked and saved. Retry saving to complete this attempt on your device.'}
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void finish(attempt)}
            type="button"
          >
            {needsFinishLocation
              ? busy
                ? 'Getting location…'
                : 'Retry location'
              : busy
                ? 'Saving attempt…'
                : 'Retry saving'}
          </button>
        </>
      ) : (
        <>
          <p role="timer" aria-label="Time remaining">
            {formatChallengeTime(
              Math.max(0, Math.ceil((deadline - now) / 1000)),
            )}
          </p>
          {attempt.cached.pack.format === 'ordering' ? (
            <OrderingChallengeQuestion
              headingRef={heading}
              isSubmitting={busy}
              itemIds={order}
              onOrderChange={setOrder}
              onSubmit={() => void answer()}
              totalQuestions={5}
              question={{
                attemptQuestionId: question.id,
                prompt: question.prompt,
                position: attempt.answers.length + 1,
                answeredAt: null,
                selectedItemIds: null,
                items: question.options.map((item) => ({
                  itemId: item.id,
                  text: item.text,
                })),
              }}
            />
          ) : (
            <ChallengeQuestion
              headingRef={heading}
              isSubmitting={busy}
              selectedChoiceId={selected}
              onSelectChoice={setSelected}
              onSubmit={() => void answer()}
              totalQuestions={5}
              question={{
                attemptQuestionId: question.id,
                prompt: question.prompt,
                position: attempt.answers.length + 1,
                answeredAt: null,
                selectedChoiceId: null,
                choices: question.options.map((item) => ({
                  choiceId: item.id,
                  text: item.text,
                })),
              }}
            />
          )}
        </>
      )}
      <p>
        <Link href="/offline">Saved events and attempts</Link>
      </p>
    </section>
  );
}

function rejectionMessage(code: string) {
  if (code === 'accepted') return 'The server has confirmed your result.';
  if (code === 'OFFLINE_SYNC_EXPIRED')
    return 'The 12-hour sync window has ended. No reward was issued.';
  if (code === 'OFFLINE_ATTEMPT_CONFLICT')
    return 'An attempt already exists for this event. No second reward was issued.';
  if (
    code.includes('LOCATION') ||
    code.includes('JOURNEY') ||
    code.includes('MOVEMENT') ||
    code.includes('UNREACHABLE')
  )
    return 'The server could not verify your location or movement. No reward was issued.';
  return 'The server could not validate this saved attempt. No reward was issued.';
}

function offlineLocationMessage(error: BrowserLocationError): string {
  switch (error.failure) {
    case 'denied':
      return 'Location access is denied. Allow location access in your browser settings to start a saved event.';
    case 'timeout':
      return 'Your reported location took too long. Move to an open area and try again.';
    case 'unsupported':
      return 'This browser cannot provide location. Use a browser with location support to start a saved event.';
    case 'blocked':
      return 'Location is blocked in this browser. Check the site permissions before trying again.';
    case 'unavailable':
      return 'Your reported location is unavailable. Check that location services are on and try again.';
  }
}
