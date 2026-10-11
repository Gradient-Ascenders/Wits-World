import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  CheckCircle,
  LockSimple,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react';
import { LoadingState } from '../components/LoadingState';
import { StatusMessage } from '../components/StatusMessage';
import { requestBrowserLocation } from '../browser-location';
import { ChallengeQuestion } from '../components/challenge/ChallengeQuestion';
import { OrderingChallengeQuestion } from '../components/challenge/OrderingChallengeQuestion';
import { formatChallengeTime } from '../challenge-deadline';
import { useOffline } from './OfflineProvider';
import { checkOfflineLocation, offlineLocationMessage } from './location';
import {
  finishLocalAttempt,
  saveLocalAnswer,
  type LocalAttempt,
} from './store';
import {
  useLocalState,
  SyncFeedback,
  rejectionMessage,
} from './OfflineAttemptState';
import '../components/challenge/challenge.css';
import './offline.css';

export function OfflineAttemptPage() {
  const { clientAttemptId } = useParams<{ clientAttemptId: string }>();
  const { state, error, reading } = useLocalState();
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
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const resultState =
    receipt?.outcome ??
    (attempt?.status === 'active' && (expired || !question)
      ? 'locked'
      : attempt?.status);
  const currentAttemptSync = attempt
    ? attemptSync[attempt.clientAttemptId]
    : undefined;
  const serverConfirmed = currentAttemptSync?.status === 'confirmed';
  useEffect(() => {
    if (resultState && resultState !== 'active') resultHeading.current?.focus();
  }, [resultState]);
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
        checkOfflineLocation(location, value.cached.pack.event, false, {
          previousAcquiredAt: value.startLocation.acquiredAt,
        });
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
        failure instanceof Error && !(failure instanceof DOMException)
          ? `Your answers are saved. ${offlineLocationMessage(failure)}`
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
    if (!attempt || !question || busy || reading) return;
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
      <section
        className="challenge-page offline-play offline-play--loading"
        aria-busy="true"
      >
        <h1>Opening your saved challenge</h1>
        <p>
          Reading your progress from this device. Your original timer is kept.
        </p>
        <LoadingState
          label="Loading saved challenge…"
          onRetry={refresh}
          resetKey={revision}
        />
      </section>
    );
  if (!attempt)
    return (
      <section className="challenge-page offline-play offline-play--result offline-play--receipt">
        <div className="offline-play__result-heading">
          {receipt?.outcome === 'accepted' ? (
            <span className="offline-play__state-mark offline-play__state-mark--success">
              <CheckCircle aria-hidden="true" size={28} />
            </span>
          ) : (
            <span className="offline-play__state-mark offline-play__state-mark--warning">
              <WarningCircle aria-hidden="true" size={28} />
            </span>
          )}
          <div>
            <h1 className="status-title" tabIndex={-1} ref={resultHeading}>
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
          </div>
        </div>
        {error && (
          <button
            className="button button--secondary"
            onClick={refresh}
            type="button"
          >
            Retry device storage
          </button>
        )}
        {receipt && (
          <p className="offline-play__receipt-event">{receipt.title}</p>
        )}
        <nav
          aria-label="Continue after saved challenge"
          className="offline-play__result-actions"
        >
          {receipt?.outcome === 'accepted' && receipt.attemptId && (
            <Link
              className="button"
              href={`/challenge-attempts/${receipt.attemptId}`}
            >
              View confirmed result
            </Link>
          )}{' '}
          <Link className="button button--quiet" href="/offline">
            Saved events
          </Link>
        </nav>
      </section>
    );
  return (
    <section
      className={`challenge-page offline-play ${attempt.status === 'pending' ? 'offline-play--result' : ''}`}
    >
      <header className="challenge-header">
        <div>
          <p className="offline-play__mode">
            <WifiSlash aria-hidden="true" size={18} />
            Saved challenge
          </p>
          <h1>{attempt.cached.pack.event.title}</h1>
        </div>
        {attempt.status === 'active' && !expired && question && (
          <div
            role="timer"
            aria-label="Time remaining"
            className="challenge-timer"
          >
            <span aria-hidden="true">Time left</span>
            <time>
              {formatChallengeTime(
                Math.max(0, Math.ceil((deadline - now) / 1000)),
              )}
            </time>
          </div>
        )}
      </header>
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
      {attempt.status === 'pending' ? (
        <div className="offline-play__completion">
          <div className="offline-play__result-heading">
            <span className="offline-play__state-mark">
              <CheckCircle aria-hidden="true" size={28} />
            </span>
            <div>
              <h2 tabIndex={-1} ref={resultHeading}>
                {serverConfirmed
                  ? 'Attempt confirmed'
                  : currentAttemptSync?.status === 'syncing'
                    ? 'Checking answers…'
                    : 'Answers saved'}
              </h2>
              <p>
                {attempt.answers.length} of{' '}
                {attempt.cached.pack.questions.length} answers saved. You can
                leave this screen and return to your result.
              </p>
            </div>
          </div>
          <ol className="offline-play__steps" aria-label="Attempt status">
            <li className="offline-play__step offline-play__step--complete">
              <span aria-hidden="true">1</span>
              <strong>Arrival recorded</strong>
              <small>Complete</small>
            </li>
            <li className="offline-play__step offline-play__step--complete">
              <span aria-hidden="true">2</span>
              <strong>Answers saved</strong>
              <small>
                {attempt.answers.length} of{' '}
                {attempt.cached.pack.questions.length} stored
              </small>
            </li>
            <li
              aria-current={serverConfirmed ? undefined : 'step'}
              className={`offline-play__step ${
                serverConfirmed
                  ? 'offline-play__step--complete'
                  : 'offline-play__step--current'
              }`}
            >
              <span aria-hidden="true">3</span>
              <strong>Server confirmation</strong>
              <small>{serverConfirmed ? 'Complete' : 'Pending'}</small>
            </li>
          </ol>
          <SyncFeedback attempt={attempt} now={now} />
        </div>
      ) : expired || !question ? (
        <div className="offline-play__completion" aria-busy={busy}>
          <LockSimple
            className="offline-play__state-icon"
            aria-hidden="true"
            size={40}
          />
          <h2 tabIndex={-1} ref={resultHeading}>
            Answers locked
          </h2>
          <p>
            {attempt.answers.length} of {attempt.cached.pack.questions.length}{' '}
            answers saved.{' '}
            {expired
              ? 'The original timer has ended.'
              : 'All questions are complete.'}{' '}
            Your answers stay on this device while you finish.
          </p>
          {needsFinishLocation && (
            <p>
              This older download needs a fresh finishing location before the
              server can verify your result.
            </p>
          )}
          <p role="status">
            {message ||
              (needsFinishLocation
                ? busy
                  ? 'Answers locked. Completing location evidence…'
                  : 'Answers locked and saved. Location is still needed to finish.'
                : busy
                  ? 'Answers locked. Saving your attempt…'
                  : 'Answers locked and saved. Retry saving to complete this attempt on your device.')}
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
        </div>
      ) : (
        <>
          <div className="challenge-progress">
            <p>
              Question {attempt.answers.length + 1} of{' '}
              {attempt.cached.pack.questions.length} · {attempt.answers.length}{' '}
              of {attempt.cached.pack.questions.length} answers saved
            </p>
            <progress
              aria-label="Challenge progress"
              max={attempt.cached.pack.questions.length}
              value={attempt.answers.length}
            />
          </div>
          {attempt.cached.pack.format === 'ordering' ? (
            <OrderingChallengeQuestion
              compact
              headingRef={heading}
              isSubmitting={busy || reading}
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
              isSubmitting={busy || reading}
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
          <p role="status" className="offline-answer-feedback">
            {message ||
              'Each submitted answer saves on this device. Your result is checked when you reconnect.'}
          </p>
        </>
      )}
      <nav
        aria-label="Saved challenge navigation"
        className="offline-attempt__back"
      >
        <Link className="button button--quiet" href="/explore">
          Back to Explore
        </Link>
        <Link className="button button--quiet" href="/offline">
          Saved events and attempts
        </Link>
      </nav>
    </section>
  );
}
