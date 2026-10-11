import { useEffect, useState } from 'react';
import { createAppDateTimeFormatter } from '../date-time';
import { StatusMessage } from '../components/StatusMessage';
import { READ_TIMEOUT_MS } from '../components/loading-policy';
import { useOffline } from './OfflineProvider';
import {
  boundOfflinePlayer,
  readOfflineState,
  type LocalAttempt,
} from './store';

type LocalState = Awaited<ReturnType<typeof readOfflineState>>;

export function formatSavedTime(value: string | number) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

// Match the server's derived completion, not the time of a delayed GPS finish.
function reconnectDeadline(attempt: LocalAttempt) {
  const deadline =
    Date.parse(attempt.startedAt) + attempt.cached.pack.timeLimitSeconds * 1000;
  const complete =
    attempt.answers.length === 5 &&
    attempt.answers.every((answer) => Date.parse(answer.answeredAt) < deadline);
  const completedAt = complete
    ? Date.parse(attempt.answers.at(-1)!.answeredAt)
    : deadline;
  const latestCompletion =
    Date.parse(attempt.cached.pack.validUntil) +
    attempt.cached.pack.timeLimitSeconds * 1000;
  const value = Math.min(completedAt, latestCompletion) + 12 * 60 * 60 * 1000;
  return Number.isFinite(value) ? value : null;
}

export function ReconnectDeadline({
  attempt,
  now,
  compact = false,
}: {
  attempt: LocalAttempt;
  now: number;
  compact?: boolean;
}) {
  const deadline = reconnectDeadline(attempt);
  if (deadline === null) return null;
  const day = createAppDateTimeFormatter(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const sameDay = day.format(new Date(deadline)) === day.format(new Date(now));
  return (
    <p className="offline-deadline">
      {now > deadline
        ? 'The reconnect window has ended. Connect to check the final outcome.'
        : 'Reconnect before '}
      {now <= deadline && (
        <time
          dateTime={new Date(deadline).toISOString()}
          title={formatSavedTime(deadline)}
        >
          {compact && sameDay
            ? createAppDateTimeFormatter(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }).format(new Date(deadline))
            : formatSavedTime(deadline)}
        </time>
      )}
      {now <= deadline && '.'}
    </p>
  );
}
export function useLocalState() {
  const { revision } = useOffline();
  const binding = boundOfflinePlayer();
  const [state, setState] = useState<LocalState | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(true);
  useEffect(() => {
    let active = true;
    setError('');
    setReading(true);
    const timer = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setReading(false);
      setError(
        'Device storage is taking too long. Retry to recover your saved progress.',
      );
    }, READ_TIMEOUT_MS);
    void readOfflineState()
      .then((value) => {
        if (active) {
          setOwner(binding);
          setState(value);
        }
      })
      .catch(() => {
        if (active)
          setError('Device storage is unavailable. Connect to play online.');
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setReading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [revision, binding]);
  return {
    state: owner === binding ? state : null,
    error,
    reading,
  };
}

export function SyncFeedback({
  controlsOnly = false,
  connectionControl = true,
  attempt,
  now = Date.now(),
}: {
  controlsOnly?: boolean;
  connectionControl?: boolean;
  attempt?: LocalAttempt;
  now?: number;
}) {
  const {
    syncing,
    syncMessage,
    syncFailed,
    sync,
    cancelSync,
    online,
    canSync,
    connectionFailed,
    restoreSession,
    attemptSync,
    retryConnection,
  } = useOffline();
  const current = attempt ? attemptSync[attempt.clientAttemptId] : undefined;
  const failed = attempt
    ? current?.status === 'failed' ||
      (current?.status === 'confirmed' && syncFailed)
    : syncFailed;
  return (
    <div className="offline-sync" aria-busy={syncing}>
      {!controlsOnly &&
      (current?.message || (!attempt && syncFailed && syncMessage)) ? (
        <StatusMessage tone={failed ? 'error' : 'info'} role={undefined}>
          <strong>{current?.message || syncMessage}</strong>
        </StatusMessage>
      ) : (
        !controlsOnly && (
          <p className="offline-sync__summary">
            Saved on this device. Pending server validation; no reward
            confirmed.
          </p>
        )
      )}
      {attempt && <ReconnectDeadline attempt={attempt} now={now} />}
      <div className="offline-sync__actions">
        {online && connectionFailed && connectionControl ? (
          <button className="button" onClick={retryConnection} type="button">
            Retry connection
          </button>
        ) : online && !connectionFailed && !canSync ? (
          <button
            className="button"
            onClick={() => void restoreSession()}
            type="button"
          >
            Sign in to check answers
          </button>
        ) : failed && !connectionFailed ? (
          <button
            className={`button${controlsOnly || current?.status === 'confirmed' ? ' button--quiet' : ''}`}
            disabled={syncing || !online}
            onClick={() => void sync()}
            type="button"
          >
            {syncing ? 'Syncing saved attempts…' : 'Retry sync'}
          </button>
        ) : null}
        {syncing && (
          <button
            className="button button--quiet"
            onClick={cancelSync}
            type="button"
          >
            Cancel sync
          </button>
        )}
      </div>
    </div>
  );
}

export function rejectionMessage(code: string) {
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
