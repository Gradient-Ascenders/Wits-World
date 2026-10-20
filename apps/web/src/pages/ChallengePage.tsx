import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { QuestMarker } from '../components/branding/QuestMarker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';

import {
  ChallengeApiError,
  getChallengeAttempt,
  submitChallengeAnswer,
  type InProgressChallengeAttempt,
  type MultipleChoiceChallengeQuestion,
  type OrderingChallengeQuestion,
  type PlayerSafeChallengeAttempt,
} from '../api/challenges';
import {
  describeChallengeTime,
  formatChallengeTime,
  remainingChallengeSeconds,
} from '../challenge-deadline';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { ChallengeQuestion } from '../components/challenge/ChallengeQuestion';
import { OrderingChallengeQuestion as OrderingChallengeQuestionView } from '../components/challenge/OrderingChallengeQuestion';
import { ChallengeResult } from '../components/challenge/ChallengeResult';
import '../components/challenge/challenge.css';

interface ChallengePageProps {
  apiBaseUrl: string;
}

type ChallengeViewState = 'expired' | 'loading' | 'ready' | 'submitting';

interface ChallengeRouteParams {
  attemptId: string;
}

export default function ChallengePage({ apiBaseUrl }: ChallengePageProps) {
  const { attemptId } = useParams<ChallengeRouteParams>();
  const getAccessToken = useApiAccessToken();
  const [attempt, setAttempt] = useState<PlayerSafeChallengeAttempt | null>(
    null,
  );
  const [error, setError] = useState<ChallengeApiError | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [orderedItemIds, setOrderedItemIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [viewState, setViewState] = useState<ChallengeViewState>('loading');
  const [reloadRevision, setReloadRevision] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isTimeoutChecking, setIsTimeoutChecking] = useState(false);
  const mounted = useRef(true);
  const attemptRef = useRef<PlayerSafeChallengeAttempt | null>(null);
  const nextRequestGeneration = useRef(0);
  const latestAppliedGeneration = useRef(0);
  const appliedStateRevision = useRef(0);
  const terminalState = useRef(false);
  const timeoutMode = useRef(false);
  const timeoutRequest = useRef<AbortController | null>(null);
  const answerRequest = useRef<AbortController | null>(null);
  const lastTimerAnnouncement = useRef<number | null>(null);
  const timerDeadline = useRef<string | null>(null);
  const questionHeading = useRef<HTMLHeadingElement | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const timeoutHeading = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusQuestion = useRef(false);
  const shouldFocusResult = useRef(false);
  const shouldFocusTimeout = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      timeoutRequest.current?.abort();
      answerRequest.current?.abort();
    };
  }, []);

  const fetchAttempt = useCallback(
    async (signal: AbortSignal) => {
      return getChallengeAttempt({
        apiBaseUrl,
        attemptId,
        getAccessToken,
        signal,
      });
    },
    [apiBaseUrl, attemptId, getAccessToken],
  );

  const applyAttempt = useCallback(
    (
      nextAttempt: PlayerSafeChallengeAttempt,
      requestGeneration: number,
    ): boolean => {
      if (!mounted.current) {
        return false;
      }

      if (terminalState.current) {
        return false;
      }

      const currentAttempt = attemptRef.current;

      if (currentAttempt?.status === 'completed') {
        return false;
      }

      if (nextAttempt.status === 'in_progress' && currentAttempt !== null) {
        if (currentAttempt.status === 'in_progress') {
          if (nextAttempt.answeredCount < currentAttempt.answeredCount) {
            return false;
          }

          if (
            nextAttempt.answeredCount === currentAttempt.answeredCount &&
            requestGeneration < latestAppliedGeneration.current
          ) {
            return false;
          }
        }
      }

      if (
        currentQuestionId(currentAttempt) !== currentQuestionId(nextAttempt)
      ) {
        setSelectedChoiceId(null);
        const nextQuestion = findCurrentQuestion(nextAttempt);
        setOrderedItemIds(
          nextQuestion?.format === 'ordering'
            ? nextQuestion.question.items.map((item) => item.itemId)
            : [],
        );
      }

      attemptRef.current = nextAttempt;
      latestAppliedGeneration.current = Math.max(
        latestAppliedGeneration.current,
        requestGeneration,
      );
      appliedStateRevision.current += 1;
      setAttempt(nextAttempt);
      setError(null);
      setRemainingSeconds(
        nextAttempt.status === 'in_progress'
          ? remainingChallengeSeconds(nextAttempt.deadline)
          : 0,
      );
      return true;
    },
    [],
  );

  const canApplyRequestFailure = useCallback(
    (requestGeneration: number, stateRevisionAtStart: number) => {
      return (
        mounted.current &&
        !terminalState.current &&
        attemptRef.current?.status !== 'completed' &&
        requestGeneration >= latestAppliedGeneration.current &&
        appliedStateRevision.current === stateRevisionAtStart
      );
    },
    [],
  );

  const showTerminalError = useCallback(
    (
      nextError: ChallengeApiError,
      requestGeneration: number,
      stateRevisionAtStart: number,
    ) => {
      if (!canApplyRequestFailure(requestGeneration, stateRevisionAtStart)) {
        return;
      }

      terminalState.current = true;
      timeoutMode.current = false;
      timeoutRequest.current?.abort();
      answerRequest.current?.abort();
      attemptRef.current = null;
      setAttempt(null);
      setSelectedChoiceId(null);
      setOrderedItemIds([]);
      setError(nextError);
      setViewState('ready');
      setStatusMessage(
        'This challenge is no longer available for this session.',
      );
    },
    [canApplyRequestFailure],
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = ++nextRequestGeneration.current;
    const stateRevisionAtStart = appliedStateRevision.current;

    setViewState('loading');
    setError(null);
    setStatusMessage('Loading saved challenge…');

    void fetchAttempt(controller.signal)
      .then((nextAttempt) => {
        if (
          controller.signal.aborted ||
          !applyAttempt(nextAttempt, requestGeneration)
        ) {
          return;
        }

        if (nextAttempt.status === 'completed') {
          timeoutMode.current = false;
          shouldFocusResult.current = true;
          setStatusMessage('Your challenge result is ready.');
          setViewState('ready');
          return;
        }

        const nextQuestion = findCurrentQuestion(nextAttempt);
        shouldFocusQuestion.current = nextQuestion !== undefined;
        setStatusMessage(
          nextQuestion
            ? `Challenge ready. Question ${nextQuestion.question.position} of ${nextAttempt.totalQuestions}.`
            : 'Answers saved. Checking result…',
        );
        setViewState(timeoutMode.current ? 'expired' : 'ready');
      })
      .catch((nextError: unknown) => {
        if (
          controller.signal.aborted ||
          !canApplyRequestFailure(requestGeneration, stateRevisionAtStart)
        ) {
          return;
        }

        const challengeError = toChallengeError(nextError);

        if (isTerminalChallengeError(challengeError)) {
          showTerminalError(
            challengeError,
            requestGeneration,
            stateRevisionAtStart,
          );
          return;
        }

        setError(challengeError);
        setViewState('ready');
      });

    return () => controller.abort();
  }, [
    applyAttempt,
    canApplyRequestFailure,
    fetchAttempt,
    reloadRevision,
    showTerminalError,
  ]);

  const reconcileTimeout = useCallback(async () => {
    if (
      timeoutMode.current ||
      timeoutRequest.current !== null ||
      attemptRef.current?.status === 'completed'
    ) {
      return;
    }

    const controller = new AbortController();
    const requestGeneration = ++nextRequestGeneration.current;
    const stateRevisionAtStart = appliedStateRevision.current;
    timeoutRequest.current = controller;
    timeoutMode.current = true;
    shouldFocusTimeout.current = true;
    setIsTimeoutChecking(true);
    setViewState('expired');
    setStatusMessage('Time ended. Checking result…');

    try {
      const nextAttempt = await fetchAttempt(controller.signal);

      if (
        controller.signal.aborted ||
        !applyAttempt(nextAttempt, requestGeneration)
      ) {
        return;
      }

      if (nextAttempt.status === 'in_progress') {
        setViewState('expired');
        setStatusMessage(
          'Time has ended. The server is still confirming your saved result.',
        );
      } else {
        timeoutMode.current = false;
        shouldFocusResult.current = true;
        setStatusMessage('Your challenge result is ready.');
      }
    } catch (nextError) {
      if (
        !controller.signal.aborted &&
        canApplyRequestFailure(requestGeneration, stateRevisionAtStart)
      ) {
        const challengeError = toChallengeError(nextError);

        if (isTerminalChallengeError(challengeError)) {
          showTerminalError(
            challengeError,
            requestGeneration,
            stateRevisionAtStart,
          );
        } else {
          setError(challengeError);
          setViewState('expired');
          setStatusMessage(
            'Time has ended. We could not check your result yet.',
          );
        }
      }
    } finally {
      if (timeoutRequest.current === controller) {
        timeoutRequest.current = null;
        if (mounted.current) {
          setIsTimeoutChecking(false);
        }
      }
    }
  }, [applyAttempt, canApplyRequestFailure, fetchAttempt, showTerminalError]);

  useEffect(() => {
    if (attempt?.status !== 'in_progress') {
      return;
    }

    if (timerDeadline.current !== attempt.deadline) {
      timerDeadline.current = attempt.deadline;
      lastTimerAnnouncement.current = null;
    }

    const updateTimer = () => {
      const nextRemaining = remainingChallengeSeconds(attempt.deadline);
      setRemainingSeconds(nextRemaining);

      if (
        (nextRemaining === 30 || nextRemaining === 10) &&
        lastTimerAnnouncement.current !== nextRemaining
      ) {
        lastTimerAnnouncement.current = nextRemaining;
        setStatusMessage(describeChallengeTime(nextRemaining));
      }

      if (nextRemaining === 0 && !timeoutMode.current) {
        void reconcileTimeout();
      }
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 1_000);
    document.addEventListener('visibilitychange', updateTimer);
    window.addEventListener('focus', updateTimer);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', updateTimer);
      window.removeEventListener('focus', updateTimer);
    };
  }, [attempt, reconcileTimeout]);

  const currentQuestion = findCurrentQuestion(attempt);

  useEffect(() => {
    if (
      shouldFocusQuestion.current &&
      currentQuestion !== undefined &&
      viewState === 'ready'
    ) {
      shouldFocusQuestion.current = false;
      questionHeading.current?.focus();
    }
  }, [currentQuestion, viewState]);

  useEffect(() => {
    if (shouldFocusResult.current && attempt?.status === 'completed') {
      shouldFocusResult.current = false;
      resultHeading.current?.focus();
    }
  }, [attempt]);

  useEffect(() => {
    if (shouldFocusTimeout.current && viewState === 'expired') {
      shouldFocusTimeout.current = false;
      timeoutHeading.current?.focus();
    }
  }, [viewState]);

  const submitAnswer = useCallback(async () => {
    if (
      attempt?.status !== 'in_progress' ||
      currentQuestion === undefined ||
      viewState !== 'ready' ||
      answerRequest.current !== null ||
      (currentQuestion.format === 'multiple_choice' &&
        selectedChoiceId === null) ||
      (currentQuestion.format === 'ordering' && orderedItemIds.length !== 4)
    ) {
      return;
    }

    setViewState('submitting');
    setError(null);
    setStatusMessage('Saving your answer…');
    const controller = new AbortController();
    const requestGeneration = ++nextRequestGeneration.current;
    const stateRevisionAtStart = appliedStateRevision.current;
    answerRequest.current = controller;

    try {
      const nextAttempt =
        currentQuestion.format === 'ordering'
          ? await submitChallengeAnswer({
              apiBaseUrl,
              attemptId: attempt.attemptId,
              attemptQuestionId: currentQuestion.question.attemptQuestionId,
              format: 'ordering',
              getAccessToken,
              itemIds: orderedItemIds,
              signal: controller.signal,
            })
          : await submitChallengeAnswer({
              apiBaseUrl,
              attemptId: attempt.attemptId,
              attemptQuestionId: currentQuestion.question.attemptQuestionId,
              choiceId: selectedChoiceId!,
              format: 'multiple_choice',
              getAccessToken,
              signal: controller.signal,
            });

      if (
        controller.signal.aborted ||
        !applyAttempt(nextAttempt, requestGeneration)
      ) {
        return;
      }

      setSelectedChoiceId(null);

      if (nextAttempt.status === 'completed') {
        setOrderedItemIds([]);
        timeoutMode.current = false;
        shouldFocusResult.current = true;
        setViewState('ready');
        setStatusMessage('Your challenge result is ready.');
      } else if (timeoutMode.current) {
        setViewState('expired');
        setStatusMessage('Time ended. Checking result…');
      } else {
        shouldFocusQuestion.current = true;
        const nextQuestion = findCurrentQuestion(nextAttempt);
        setStatusMessage(
          nextQuestion
            ? `Answer saved. Question ${nextQuestion.question.position} of ${nextAttempt.totalQuestions}.`
            : 'Answer saved. Checking result…',
        );
        setViewState('ready');
      }
    } catch (nextError) {
      if (
        controller.signal.aborted ||
        !canApplyRequestFailure(requestGeneration, stateRevisionAtStart)
      ) {
        return;
      }

      const challengeError = toChallengeError(nextError);

      if (isTerminalChallengeError(challengeError)) {
        showTerminalError(
          challengeError,
          requestGeneration,
          stateRevisionAtStart,
        );
        return;
      }

      if (
        challengeError.failure === 'answer-locked' ||
        challengeError.failure === 'attempt-completed'
      ) {
        setStatusMessage(
          'This challenge changed elsewhere. Refreshing your saved progress…',
        );
        setViewState('loading');
        setReloadRevision((revision) => revision + 1);
        return;
      }

      if (timeoutMode.current) {
        setViewState('expired');
        setStatusMessage('Time ended. Checking result…');
        return;
      }

      setError(challengeError);
      setViewState('ready');
      setStatusMessage(
        'We could not confirm your answer. Retry to check your saved progress.',
      );
    } finally {
      if (answerRequest.current === controller) {
        answerRequest.current = null;
      }
    }
  }, [
    applyAttempt,
    apiBaseUrl,
    canApplyRequestFailure,
    attempt,
    currentQuestion,
    getAccessToken,
    orderedItemIds,
    selectedChoiceId,
    showTerminalError,
    viewState,
  ]);

  if (error !== null && attempt === null) {
    return (
      <ChallengeError
        error={error}
        onRetry={() => setReloadRevision((revision) => revision + 1)}
      />
    );
  }

  if (attempt?.status === 'completed') {
    return (
      <div className="challenge-page challenge-page--result">
        <div aria-live="polite" className="sr-only" role="status">
          {statusMessage}
        </div>
        <ChallengeResult
          attempt={attempt}
          headingRef={resultHeading}
          apiBaseUrl={apiBaseUrl}
        />
      </div>
    );
  }

  if (attempt === null || viewState === 'loading') {
    return (
      <PageLoadingState
        title="Loading challenge"
        onRetry={
          attempt === null
            ? () => setReloadRevision((value) => value + 1)
            : undefined
        }
        resetKey={`${attemptId}:${reloadRevision}`}
      />
    );
  }

  if (viewState === 'expired') {
    return (
      <section
        aria-live="polite"
        className="challenge-panel challenge-page"
        aria-busy={isTimeoutChecking}
        role="status"
      >
        <p className="eyebrow">Challenge time ended</p>
        {isTimeoutChecking ? <QuestMarker /> : null}
        <h1 className="status-title" ref={timeoutHeading} tabIndex={-1}>
          Checking result
        </h1>
        <p>{statusMessage}</p>
        <button
          className="button"
          disabled={isTimeoutChecking}
          onClick={() => {
            timeoutMode.current = false;
            void reconcileTimeout();
          }}
          type="button"
        >
          {isTimeoutChecking ? 'Checking result…' : 'Check result again'}
        </button>
      </section>
    );
  }

  if (currentQuestion === undefined) {
    return (
      <PageLoadingState
        className="challenge-result-loading"
        title="Checking result"
        description="Answers saved."
      >
        <button
          className="button"
          onClick={() => setReloadRevision((revision) => revision + 1)}
          type="button"
        >
          Refresh result
        </button>
      </PageLoadingState>
    );
  }

  const isSubmitting = viewState === 'submitting';
  const questionKey = `${attempt.attemptId}:${currentQuestion.question.position}`;

  return (
    <div className="challenge-page">
      <div aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </div>
      <section className="challenge-panel">
        <header className="challenge-header">
          <div>
            <p className="eyebrow">Campus challenge</p>
            <h1>
              {attempt.format === 'ordering'
                ? 'Five-question ordering challenge'
                : 'Five-question quiz'}
            </h1>
          </div>
          <div
            aria-label={describeChallengeTime(remainingSeconds)}
            className="challenge-timer"
            role="timer"
          >
            <span className="sr-only">Time remaining</span>
            <time>{formatChallengeTime(remainingSeconds)}</time>
          </div>
        </header>

        <div className="challenge-progress">
          <p>
            {attempt.answeredCount} of {attempt.totalQuestions} answers saved
          </p>
          <progress
            aria-label="Challenge progress"
            max={attempt.totalQuestions}
            value={attempt.answeredCount}
          />
        </div>

        <div key={questionKey}>
          {currentQuestion.format === 'ordering' ? (
            <OrderingChallengeQuestionView
              headingRef={questionHeading}
              isSubmitting={isSubmitting}
              itemIds={orderedItemIds}
              onOrderChange={setOrderedItemIds}
              onSubmit={() => void submitAnswer()}
              question={currentQuestion.question}
              totalQuestions={attempt.totalQuestions}
            />
          ) : (
            <ChallengeQuestion
              headingRef={questionHeading}
              isSubmitting={isSubmitting}
              onSelectChoice={setSelectedChoiceId}
              onSubmit={() => void submitAnswer()}
              question={currentQuestion.question}
              selectedChoiceId={selectedChoiceId}
              totalQuestions={attempt.totalQuestions}
            />
          )}
        </div>

        {error !== null ? (
          <div
            className="challenge-panel--alert state-message state-message--error"
            role="alert"
          >
            <StateIcon tone="error" />
            <p>{messageForChallengeError(error)}</p>
            <button
              className="button button--quiet"
              onClick={() => void submitAnswer()}
              type="button"
            >
              Retry answer
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ChallengeError({
  error,
  onRetry,
}: {
  error: ChallengeApiError;
  onRetry: () => void;
}) {
  const isMissing = error.failure === 'attempt-not-found';
  const requiresRefresh = error.failure === 'client-upgrade-required';
  const canReturnToExplore = isMissing || error.failure === 'authorization';

  return (
    <section
      className="challenge-panel challenge-panel--alert challenge-page state-message state-message--error"
      role="alert"
    >
      <p className="eyebrow">Challenge unavailable</p>
      <h1>
        {isMissing
          ? 'This challenge is not available'
          : requiresRefresh
            ? 'Refresh Wits World to continue'
            : 'We could not load your challenge'}
      </h1>
      <p>{messageForChallengeError(error)}</p>
      {canReturnToExplore ? (
        <Link className="button button--link" href="/explore">
          Return to explore
        </Link>
      ) : (
        <button
          className="button"
          onClick={requiresRefresh ? () => window.location.reload() : onRetry}
          type="button"
        >
          {requiresRefresh ? 'Refresh Wits World' : 'Try again'}
        </button>
      )}
    </section>
  );
}

function toChallengeError(error: unknown): ChallengeApiError {
  return error instanceof ChallengeApiError
    ? error
    : new ChallengeApiError('unavailable');
}

function isTerminalChallengeError(error: ChallengeApiError): boolean {
  return (
    error.failure === 'attempt-not-found' ||
    error.failure === 'authorization' ||
    error.failure === 'client-upgrade-required'
  );
}

function currentQuestionId(
  attempt: PlayerSafeChallengeAttempt | null,
): string | null {
  return findCurrentQuestion(attempt)?.question.attemptQuestionId ?? null;
}

type CurrentQuestion =
  | {
      format: 'multiple_choice';
      question: MultipleChoiceChallengeQuestion;
    }
  | { format: 'ordering'; question: OrderingChallengeQuestion };

function findCurrentQuestion(
  attempt: PlayerSafeChallengeAttempt | null,
): CurrentQuestion | undefined {
  if (attempt?.status !== 'in_progress') return undefined;

  return attempt.format === 'ordering'
    ? orderingCurrentQuestion(attempt)
    : multipleChoiceCurrentQuestion(attempt);
}

function orderingCurrentQuestion(
  attempt: Extract<InProgressChallengeAttempt, { format: 'ordering' }>,
): CurrentQuestion | undefined {
  const question = attempt.questions.find(
    (candidate) => candidate.selectedItemIds === null,
  );
  return question ? { format: 'ordering', question } : undefined;
}

function multipleChoiceCurrentQuestion(
  attempt: Extract<InProgressChallengeAttempt, { format: 'multiple_choice' }>,
): CurrentQuestion | undefined {
  const question = attempt.questions.find(
    (candidate) => candidate.selectedChoiceId === null,
  );
  return question ? { format: 'multiple_choice', question } : undefined;
}

function messageForChallengeError(error: ChallengeApiError): string {
  if (error.failure === 'authorization') {
    return 'Your session could not load this challenge. Try again, or sign out and sign in again.';
  }

  if (error.failure === 'attempt-not-found') {
    return 'This saved challenge could not be found for your account.';
  }

  if (error.failure === 'client-upgrade-required') {
    return 'This version cannot safely continue the challenge. Refresh before submitting another answer.';
  }

  return 'Check your connection and try again. Your saved answers and rewards remain protected.';
}
