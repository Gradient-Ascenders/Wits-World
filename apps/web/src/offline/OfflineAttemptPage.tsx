import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  CheckCircle,
  LockSimple,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import { LoadingState } from '../components/LoadingState';
import { StatusMessage } from '../components/StatusMessage';
import {
  requestBrowserLocation,
  type LocationClaim,
} from '../browser-location';
import { ChallengeQuestion } from '../components/challenge/ChallengeQuestion';
import { OrderingChallengeQuestion } from '../components/challenge/OrderingChallengeQuestion';
import { formatChallengeTime } from '../challenge-deadline';
import { useOffline } from './OfflineProvider';
import {
  checkOfflineLocation,
  offlineLocationMessage,
  OFFLINE_LOCATION_MAX_AGE_MS,
} from './location';
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
  const {
    refresh,
    revision,
    sync,
    syncing,
    attemptSync = {},
    online,
    connectionFailed,
    canSync,
  } = useOffline();
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
  const [finishStage, setFinishStage] = useState<'location' | 'saving'>(
    'location',
  );
  const [finishProblem, setFinishProblem] = useState<
    'location' | 'saving' | null
  >(null);
  const finishingLocation = useRef<LocationClaim | undefined>(undefined);
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
  const processing =
    (currentAttemptSync?.status === 'syncing' ||
      (syncing && currentAttemptSync?.status === 'pending')) &&
    online &&
    !connectionFailed &&
    canSync;
  useEffect(() => {
    if (resultState && resultState !== 'active') resultHeading.current?.focus();
  }, [resultState]);
  useEffect(() => {
    automaticFinish.current = null;
    setBusy(false);
    setMessage('');
    setFinishProblem(null);
    finishingLocation.current = undefined;
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
    if (
      finishingLocation.current &&
      Date.now() - Date.parse(finishingLocation.current.acquiredAt) >
        OFFLINE_LOCATION_MAX_AGE_MS
    )
      finishingLocation.current = undefined;
    const requiresLocation =
      value.cached.pack.locationPolicy !== 'arrival-v1' &&
      !finishingLocation.current;
    let stage: 'location' | 'saving' = requiresLocation ? 'location' : 'saving';
    setFinishStage(stage);
    setFinishProblem(null);
    setMessage(
      requiresLocation
        ? 'Checking location. Your answers are saved on this device.'
        : 'Saving your completed attempt on this device…',
    );
    try {
      const location = requiresLocation
        ? await requestBrowserLocation(controller.signal)
        : finishingLocation.current;
      controller.signal.throwIfAborted();
      if (location)
        checkOfflineLocation(location, value.cached.pack.event, false, {
          previousAcquiredAt: value.startLocation.acquiredAt,
        });
      finishingLocation.current = location;
      stage = 'saving';
      setFinishStage(stage);
      setMessage('Saving your completed attempt on this device…');
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
      setFinishProblem(stage);
      setMessage(
        stage === 'location' &&
          failure instanceof Error &&
          !(failure instanceof DOMException)
          ? `Your answers are saved. ${offlineLocationMessage(failure)}`
          : stage === 'location'
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
        className="challenge-page challenge-panel offline-play offline-play--loading"
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
      <section className="challenge-page challenge-result offline-play offline-play--result offline-play--receipt">
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
                : receipt
                  ? 'Attempt rejected'
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
      className={`challenge-page challenge-panel offline-play ${attempt.status === 'pending' ? 'offline-play--result' : ''}`}
    >
      <header className="challenge-header">
        <div>
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
            <span
              className={`offline-play__state-mark${processing ? ' offline-play__state-mark--loading' : serverConfirmed ? ' offline-play__state-mark--success' : ''}`}
            >
              {processing ? (
                <SpinnerGap aria-hidden="true" size={36} />
              ) : (
                <CheckCircle aria-hidden="true" size={28} />
              )}
            </span>
            <div>
              <h2 tabIndex={-1} ref={resultHeading}>
                {serverConfirmed
                  ? 'Attempt confirmed'
                  : processing
                    ? 'Preparing your result…'
                    : !online || connectionFailed
                      ? 'Awaiting reconnection'
                      : 'Answers saved'}
              </h2>
              <p>
                {attempt.answers.length} of{' '}
                {attempt.cached.pack.questions.length} answers saved.{' '}
                {processing
                  ? currentAttemptSync?.status === 'syncing'
                    ? 'The server is checking your answers and preparing your result.'
                    : 'Your saved answers are waiting to be sent to the server.'
                  : 'You can leave this screen and return to your result.'}
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
                  : processing
                    ? 'offline-play__step--current offline-play__step--processing'
                    : 'offline-play__step--current'
              }`}
            >
              <span aria-hidden="true">3</span>
              <strong>Your result</strong>
              <small>
                {serverConfirmed
                  ? 'Complete'
                  : processing
                    ? currentAttemptSync?.status === 'syncing'
                      ? 'Preparing…'
                      : 'Queued'
                    : 'Pending'}
              </small>
            </li>
          </ol>
          <SyncFeedback attempt={attempt} now={now} />
          {serverConfirmed && currentAttemptSync?.attemptId && (
            <Link
              className="button"
              href={`/challenge-attempts/${currentAttemptSync.attemptId}`}
            >
              View confirmed result
            </Link>
          )}
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
          <p role="status" className="offline-answer-feedback">
            {message ||
              (needsFinishLocation
                ? busy
                  ? 'Checking location. Your answers are saved on this device.'
                  : 'This older saved event needs a fresh finishing location. Retry location to have your answers checked.'
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
            {(
              busy
                ? finishStage === 'location'
                : finishProblem === 'location' ||
                  (needsFinishLocation && finishProblem !== 'saving')
            )
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
              totalQuestions={attempt.cached.pack.questions.length}
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
              totalQuestions={attempt.cached.pack.questions.length}
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
