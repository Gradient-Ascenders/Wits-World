import { LoadingState } from '../components/LoadingState';
import { StatusMessage } from '../components/StatusMessage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  BrowserLocationError,
  requestBrowserLocation,
} from '../browser-location';
import { ChallengeQuestion } from '../components/challenge/ChallengeQuestion';
import { OrderingChallengeQuestion } from '../components/challenge/OrderingChallengeQuestion';
import { formatChallengeTime } from '../challenge-deadline';
import { useOffline } from './OfflineProvider';
import {
  boundOfflinePlayer,
  createLocalAttempt,
  finishLocalAttempt,
  readOfflineState,
  saveLocalAnswer,
  type CachedPack,
  type LocalAttempt,
} from './store';
import '../components/challenge/challenge.css';
import './offline.css';

type LocalState = Awaited<ReturnType<typeof readOfflineState>>;
function useLocalState() {
  const { revision } = useOffline();
  const [state, setState] = useState<LocalState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readOfflineState()
      .then((value) => {
        if (active) setState(value);
      })
      .catch(() => {
        if (active)
          setError('Device storage is unavailable. Connect to play online.');
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
  };
}

export function OfflineExploreGate({ children }: { children: ReactNode }) {
  const { online } = useOffline();
  return online ? children : <OfflineExplorePage />;
}

export function OfflineExplorePage() {
  const { state, error } = useLocalState();
  const { refresh, sync, online } = useOffline();
  const [, navigate] = useLocation();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function start(cached: CachedPack) {
    if (busy) return;
    setBusy(true);
    try {
      const location = await requestBrowserLocation();
      if (
        Date.now() < Date.parse(cached.pack.validFrom) ||
        Date.now() >= Date.parse(cached.pack.validUntil)
      )
        throw new Error('This saved event is not currently open.');
      const attempt = await createLocalAttempt(cached, location);
      refresh();
      navigate(`/offline-attempts/${attempt.clientAttemptId}`);
    } catch (failure) {
      setMessage(
        failure instanceof BrowserLocationError
          ? offlineLocationMessage(failure)
          : failure instanceof Error && !(failure instanceof DOMException)
            ? failure.message
            : 'This saved event could not open. Try again or reconnect to play online.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="challenge-page offline-page">
      <h1>Saved campus events</h1>
      <p>
        Answers stay on this device until the server can check them. Reconnect
        within 12 hours of completing a challenge.
      </p>
      {(error || message) && (
        <StatusMessage tone="error">{error || message}</StatusMessage>
      )}
      {!state ? (
        error ? null : (
          <LoadingState label="Loading saved events…" />
        )
      ) : !state.session ? (
        <p>
          Sign in while connected to prepare offline events on this device.{' '}
          <Link href="/explore">Return to explore</Link>
        </p>
      ) : (
        <>
          <p>
            Saved for {state.session.playerName}.{' '}
            {online
              ? 'Network detected; server connection not guaranteed.'
              : 'No connection.'}
          </p>
          <button className="button" onClick={() => void sync()} type="button">
            Sync saved attempts
          </button>
          <EventSchematic packs={state.packs} />
          {state.packs.length === 0 && (
            <p>
              No current events are saved. Connect and allow location access to
              prepare nearby events.
            </p>
          )}
          <ul className="offline-events">
            {state.packs.map((cached) => (
              <li key={cached.pack.packId}>
                <h2>{cached.pack.event.title}</h2>
                <p>{cached.pack.event.description}</p>
                <p>
                  Available until{' '}
                  {new Date(cached.pack.validUntil).toLocaleString()}.
                </p>
                <button
                  className="button"
                  disabled={
                    busy || Date.now() < Date.parse(cached.pack.validFrom)
                  }
                  onClick={() => void start(cached)}
                  type="button"
                >
                  Open saved challenge
                </button>
              </li>
            ))}
          </ul>
          <h2>Attempts on this device</h2>
          <ul>
            {state.attempts.map((attempt) => (
              <li key={attempt.clientAttemptId}>
                <Link href={`/offline-attempts/${attempt.clientAttemptId}`}>
                  {attempt.cached.pack.event.title}
                </Link>{' '}
                —{' '}
                {attempt.status === 'pending'
                  ? 'waiting for server validation'
                  : 'in progress'}
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
        </>
      )}
    </section>
  );
}

function EventSchematic({ packs }: { packs: CachedPack[] }) {
  if (!packs.length) return null;
  const latitudes = packs.map((item) => item.pack.event.latitude);
  const longitudes = packs.map((item) => item.pack.event.longitude);
  const south = Math.min(...latitudes),
    north = Math.max(...latitudes);
  const west = Math.min(...longitudes),
    east = Math.max(...longitudes);
  return (
    <figure>
      <svg
        viewBox="0 0 600 300"
        role="img"
        aria-label="Relative positions of saved events, north is up. Use the event list below for details."
      >
        <rect width="600" height="300" fill="#edf2ec" />
        <text x="12" y="22" fill="#193b32">
          N ↑
        </text>
        {packs.map(({ pack }, index) => {
          const x =
            50 +
            ((pack.event.longitude - west) / Math.max(east - west, 0.001)) *
              480;
          const y =
            250 -
            ((pack.event.latitude - south) / Math.max(north - south, 0.001)) *
              200;
          return (
            <g key={pack.packId}>
              <circle cx={x} cy={y} r="9" fill="#193b32" />
              <text x={x + 13} y={y + 5} fill="#193b32">
                {index + 1}. {pack.event.title.slice(0, 24)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        Saved event schematic. Relative positions only; this is not a walking
        route.
      </figcaption>
    </figure>
  );
}

export function OfflineAttemptPage() {
  const { clientAttemptId } = useParams<{ clientAttemptId: string }>();
  const { state, error } = useLocalState();
  const { refresh, sync } = useOffline();
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
  const question = attempt?.cached.pack.questions[attempt.answers.length];
  const deadline = attempt
    ? Date.parse(attempt.startedAt) +
      attempt.cached.pack.timeLimitSeconds * 1000
    : 0;
  const expired = now >= deadline;
  const heading = useRef<HTMLHeadingElement>(null);
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
    setBusy(true);
    try {
      const location = await requestBrowserLocation();
      await finishLocalAttempt(value.clientAttemptId, location);
      refresh();
      await sync();
    } catch {
      setMessage(
        'Your answers are saved. Location is needed to finish verification; retry when a location is available.',
      );
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      attempt?.status === 'active' &&
      (expired || attempt.answers.length === 5)
    )
      void finish(attempt);
    // Each deadline or answer-count transition requests at most one finish sample.
  }, [attempt?.status, attempt?.answers.length, expired]);
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
  if (!state && !error) return <LoadingState label="Loading saved attempt…" />;
  if (!attempt)
    return (
      <section className="challenge-page">
        <h1>
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
          <p>Saved on this device. Waiting for server validation.</p>
          <button className="button" onClick={() => void sync()} type="button">
            Sync now
          </button>
        </>
      ) : expired || !question ? (
        <>
          <p>Answers locked. Completing location evidence…</p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void finish(attempt)}
            type="button"
          >
            Retry location
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
