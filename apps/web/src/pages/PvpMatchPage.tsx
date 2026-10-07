import { createAppDateTimeFormatter } from '../date-time';
import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
import {
  ArrowLeft,
  CaretDown,
  Flag,
  Trophy,
  XCircle,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link, useParams } from 'wouter';

import {
  getPvpMatch,
  PvpApiError,
  resignPvpMatch,
  submitPvpAction,
  type AsyncPvpMatch,
  type PvpAction,
  type PvpActionEffect,
  type PvpActionHistoryEntry,
  type PvpActionResult,
} from '../api/pvp';
import type { MatchCreature } from '../api/matches';
import { prefersReducedMotion } from '../accessibility/preferences';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
  BattleResolution,
  CreatureDetailsPicture,
  type BattleActionIntent,
  type BattleFeedbackTone,
  type BattleResolutionMoment,
} from '../components/matches/BattlePresentation';
import { BattleShellHeader } from '../components/matches/BattleShell';
import { pvpHistoryNavigationState } from '../components/matches/pvp-history-navigation';
import { ResignMatchDialog } from '../components/matches/ResignMatchDialog';
import './matches.css';

interface RouteParams {
  matchId: string;
}

interface ActionAttempt {
  action: PvpAction;
  expectedVersion: number;
  submissionId: string;
}

interface ResignationAttempt {
  expectedVersion: number;
  submissionId: string;
}

interface ResignationRecovery {
  attempt: ResignationAttempt;
  error: PvpApiError;
  stage: 'check' | 'retry';
}

type RequestStatus = 'loading' | 'ready' | 'reconciling' | 'submitting';

interface PvpPresentationMoment extends BattleResolutionMoment {
  action?: PvpAction;
  actorSide: 'opponent' | 'self';
  entranceSide?: 'opponent' | 'self';
  effect?: PvpActionEffect;
  kind: 'action' | 'defeat' | 'effect' | 'result';
  targetCreatureId?: string;
  targetSide?: 'opponent' | 'self';
}

export default function PvpMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<RouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [match, setMatch] = useState<AsyncPvpMatch | null>(null);
  const [presentedMatch, setPresentedMatch] = useState<AsyncPvpMatch | null>(
    null,
  );
  const [presentationMoments, setPresentationMoments] = useState<
    PvpPresentationMoment[]
  >([]);
  const [activeMomentIndex, setActiveMomentIndex] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<PvpApiError | null>(null);
  const [pollWarning, setPollWarning] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading battle.');
  const [revision, setRevision] = useState(0);
  const [reauthFailed, setReauthFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState<ActionAttempt | null>(null);
  const [confirmingResignation, setConfirmingResignation] = useState(false);
  const [errorContext, setErrorContext] = useState<'action' | 'resignation'>(
    'action',
  );
  const [resignationRecovery, setResignationRecovery] =
    useState<ResignationRecovery | null>(null);
  const matchRef = useRef<AsyncPvpMatch | null>(null);
  const presentationActive = useRef(false);
  const presentationTarget = useRef<AsyncPvpMatch | null>(null);
  const routeMatchId = useRef(matchId);
  const mounted = useRef(true);
  const mutation = useRef<AbortController | null>(null);
  const refreshRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const appliedGeneration = useRef(0);
  const pollFailures = useRef(0);
  const phaseHeading = useRef<HTMLHeadingElement | null>(null);
  const alert = useRef<HTMLDivElement | null>(null);
  const resignTrigger = useRef<HTMLButtonElement | null>(null);
  const countdown = useDeadlineCountdown(match?.turnDeadline ?? null);
  routeMatchId.current = matchId;

  const advancePresentation = useCallback(() => {
    setActiveMomentIndex((current) => {
      if (current !== null && current + 1 < presentationMoments.length) {
        return current + 1;
      }
      const target = presentationTarget.current;
      if (target) {
        setPresentedMatch(target);
        setStatusMessage(matchStatusMessage(target));
      }
      presentationActive.current = false;
      presentationTarget.current = null;
      queueMicrotask(() => phaseHeading.current?.focus());
      return null;
    });
  }, [presentationMoments.length]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      presentationActive.current = false;
      mutation.current?.abort();
      refreshRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!match?.canResign) setConfirmingResignation(false);
  }, [match?.canResign]);

  const applyMatch = useCallback(
    (next: AsyncPvpMatch, responseGeneration: number) => {
      if (!mounted.current || next.matchId !== routeMatchId.current)
        return false;
      const current = matchRef.current;
      if (current?.status === 'completed') return false;
      if (current && next.version < current.version) return false;
      if (
        current &&
        next.version === current.version &&
        responseGeneration < appliedGeneration.current
      )
        return false;
      const turnChanged =
        current?.version !== next.version ||
        current?.currentActor !== next.currentActor ||
        current?.status !== next.status;
      matchRef.current = next;
      appliedGeneration.current = Math.max(
        appliedGeneration.current,
        responseGeneration,
      );
      setMatch(next);
      setError(null);
      setRetryAttempt(null);
      setResignationRecovery(null);
      const previousSequences = new Set(
        current?.history.map((entry) => entry.sequence) ?? [],
      );
      const newEntries = current
        ? next.history.filter((entry) => !previousSequences.has(entry.sequence))
        : [];
      const nextMoments = newEntries.flatMap((entry) =>
        pvpPresentationMoments(entry, next),
      );
      if (current && nextMoments.length > 0) {
        presentationActive.current = true;
        presentationTarget.current = next;
        setPresentedMatch(current);
        setPresentationMoments(nextMoments);
        setActiveMomentIndex(0);
        setStatusMessage(nextMoments[0]!.message);
      } else {
        presentationActive.current = false;
        presentationTarget.current = null;
        setPresentedMatch(next);
        setPresentationMoments([]);
        setActiveMomentIndex(null);
        setStatusMessage(matchStatusMessage(next));
        if (turnChanged) queueMicrotask(() => phaseHeading.current?.focus());
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    if (activeMomentIndex === null) return;
    const moment = presentationMoments[activeMomentIndex];
    const target = presentationTarget.current;
    if (!moment || !target) return;
    setPresentedMatch((current) =>
      current ? applyPvpPresentationMoment(current, target, moment) : current,
    );
    setStatusMessage(moment.message);
    const timeout = window.setTimeout(
      advancePresentation,
      pvpPresentationDelay(moment),
    );
    return () => window.clearTimeout(timeout);
  }, [activeMomentIndex, advancePresentation, presentationMoments]);

  const refreshMatch = useCallback(
    async (options: { announce?: boolean; poll?: boolean } = {}) => {
      if (
        refreshRequest.current ||
        mutation.current ||
        presentationActive.current
      )
        return;
      const controller = new AbortController();
      refreshRequest.current = controller;
      const responseGeneration = ++generation.current;
      if (options.announce) {
        setRequestStatus('reconciling');
        setStatusMessage('Checking for battle updates…');
      }
      try {
        const next = await getPvpMatch({
          apiBaseUrl,
          getAccessToken,
          matchId,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          applyMatch(next, responseGeneration);
          pollFailures.current = 0;
          setPollWarning(false);
          setRequestStatus('ready');
        }
      } catch (nextError) {
        if (controller.signal.aborted) return;
        const parsed = toPvpError(nextError);
        if (options.poll && matchRef.current) {
          pollFailures.current += 1;
          setPollWarning(true);
        } else {
          setError(parsed);
          setRequestStatus('ready');
        }
      } finally {
        if (refreshRequest.current === controller) {
          refreshRequest.current = null;
        }
      }
    },
    [apiBaseUrl, applyMatch, getAccessToken, matchId],
  );

  useEffect(() => {
    const controller = new AbortController();
    mutation.current?.abort();
    mutation.current = null;
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    matchRef.current = null;
    presentationActive.current = false;
    presentationTarget.current = null;
    appliedGeneration.current = 0;
    generation.current = 0;
    pollFailures.current = 0;
    setMatch(null);
    setPresentedMatch(null);
    setPresentationMoments([]);
    setActiveMomentIndex(null);
    setError(null);
    setPollWarning(false);
    setConfirmingResignation(false);
    setResignationRecovery(null);
    setRequestStatus('loading');
    const responseGeneration = ++generation.current;
    void getPvpMatch({
      apiBaseUrl,
      getAccessToken,
      matchId,
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          applyMatch(next, responseGeneration);
          setRequestStatus('ready');
        }
      })
      .catch((nextError: unknown) => {
        if (!controller.signal.aborted) {
          setError(toPvpError(nextError));
          setRequestStatus('ready');
        }
      });
    return () => controller.abort();
  }, [apiBaseUrl, applyMatch, getAccessToken, matchId, revision]);

  useEffect(() => {
    if (
      match?.status !== 'active' ||
      match.currentActor !== 'opponent' ||
      activeMomentIndex !== null
    )
      return;
    let stopped = false;
    let timer = 0;
    const schedule = () => {
      const delays = [5_000, 10_000, 20_000, 30_000];
      const delay = delays[Math.min(pollFailures.current, delays.length - 1)]!;
      timer = window.setTimeout(async () => {
        if (stopped) return;
        if (document.visibilityState === 'visible') {
          await refreshMatch({ poll: true });
        }
        if (
          !stopped &&
          matchRef.current?.status === 'active' &&
          matchRef.current.currentActor === 'opponent'
        )
          schedule();
      }, delay);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible')
        void refreshMatch({ poll: true });
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeMomentIndex, match?.currentActor, match?.status, refreshMatch]);

  useEffect(() => {
    if (match?.status !== 'active' || !match.turnDeadline) return;
    const delay =
      Math.max(0, new Date(match.turnDeadline).getTime() - Date.now()) + 100;
    const timer = window.setTimeout(
      () => void refreshMatch({ poll: true }),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [match?.status, match?.turnDeadline, refreshMatch]);

  async function submitAction(action: PvpAction, attempt?: ActionAttempt) {
    const current = matchRef.current;
    if (
      !current ||
      current.status !== 'active' ||
      current.currentActor !== 'self' ||
      mutation.current ||
      presentationActive.current ||
      requestStatus !== 'ready' ||
      (!attempt && error !== null) ||
      (current.turnDeadline !== null &&
        Date.parse(current.turnDeadline) <= Date.now()) ||
      !isLegalAction(current, action)
    )
      return;
    const nextAttempt = attempt ?? {
      action,
      expectedVersion: current.version,
      submissionId: crypto.randomUUID(),
    };
    const controller = new AbortController();
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    mutation.current = controller;
    const responseGeneration = ++generation.current;
    setError(null);
    setErrorContext('action');
    setRetryAttempt(null);
    setRequestStatus('submitting');
    setStatusMessage('Applying your action…');
    try {
      const response = await submitPvpAction({
        ...nextAttempt,
        apiBaseUrl,
        getAccessToken,
        matchId,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        applyMatch(response, responseGeneration);
        setRequestStatus('ready');
      }
    } catch (nextError) {
      if (controller.signal.aborted) return;
      const parsed = toPvpError(nextError);
      if (
        parsed.options.ambiguous ||
        ['completed', 'illegal-action', 'stale'].includes(parsed.failure)
      ) {
        setRequestStatus('reconciling');
        setStatusMessage('Action not confirmed. Checking the battle…');
        try {
          const reconciled = await getPvpMatch({
            apiBaseUrl,
            getAccessToken,
            matchId,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            const unchanged =
              reconciled.version === nextAttempt.expectedVersion &&
              reconciled.status === 'active';
            applyMatch(reconciled, ++generation.current);
            if (
              parsed.options.ambiguous &&
              unchanged &&
              isLegalAction(reconciled, nextAttempt.action)
            ) {
              setRetryAttempt(nextAttempt);
              setError(parsed);
              setStatusMessage('Battle unchanged. You can retry the action.');
            } else {
              setStatusMessage('Battle updated. Check your turn and actions.');
            }
          }
        } catch (recoveryError) {
          if (!controller.signal.aborted) setError(toPvpError(recoveryError));
        }
      } else {
        setError(parsed);
        setStatusMessage('Action not applied.');
      }
      setRequestStatus('ready');
    } finally {
      if (mutation.current === controller) mutation.current = null;
    }
  }

  async function reconcileResignation(
    recovery: ResignationRecovery,
    controller: AbortController,
  ) {
    try {
      const reconciled = await getPvpMatch({
        apiBaseUrl,
        getAccessToken,
        matchId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const unchanged =
        reconciled.version === recovery.attempt.expectedVersion &&
        reconciled.status === 'active' &&
        reconciled.canResign;
      applyMatch(reconciled, ++generation.current);
      if (recovery.error.options.ambiguous && unchanged) {
        setResignationRecovery({ ...recovery, stage: 'retry' });
        setError(recovery.error);
        setErrorContext('resignation');
        setStatusMessage('Battle unchanged. You can retry the forfeit.');
      } else {
        setStatusMessage(
          reconciled.status === 'completed'
            ? matchStatusMessage(reconciled)
            : 'Battle updated. Review before forfeiting.',
        );
      }
    } catch (recoveryError) {
      if (controller.signal.aborted) return;
      setResignationRecovery({ ...recovery, stage: 'check' });
      setError(toPvpError(recoveryError));
      setErrorContext('resignation');
      setStatusMessage(
        'Result unconfirmed. Check again before retrying the forfeit.',
      );
    }
  }

  async function checkResignationState(recovery: ResignationRecovery) {
    if (mutation.current) return;
    const controller = new AbortController();
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    mutation.current = controller;
    setRequestStatus('reconciling');
    setError(null);
    setStatusMessage('Checking the result…');
    try {
      await reconcileResignation(recovery, controller);
    } finally {
      if (mutation.current === controller) mutation.current = null;
      setRequestStatus('ready');
    }
  }

  async function submitResignation(attempt?: ResignationAttempt) {
    const current = matchRef.current;
    if (
      !current ||
      current.status !== 'active' ||
      !current.canResign ||
      mutation.current ||
      presentationActive.current
    )
      return;
    const nextAttempt = attempt ?? {
      expectedVersion: current.version,
      submissionId: crypto.randomUUID(),
    };
    const controller = new AbortController();
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    mutation.current = controller;
    const responseGeneration = ++generation.current;
    setConfirmingResignation(false);
    setError(null);
    setErrorContext('resignation');
    setRetryAttempt(null);
    setResignationRecovery(null);
    setRequestStatus('submitting');
    setStatusMessage('Forfeiting…');
    try {
      const response = await resignPvpMatch({
        ...nextAttempt,
        apiBaseUrl,
        getAccessToken,
        matchId,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        applyMatch(response, responseGeneration);
        setRequestStatus('ready');
      }
    } catch (nextError) {
      if (controller.signal.aborted) return;
      const parsed = toPvpError(nextError);
      if (
        parsed.options.ambiguous ||
        ['completed', 'stale'].includes(parsed.failure)
      ) {
        const recovery: ResignationRecovery = {
          attempt: nextAttempt,
          error: parsed,
          stage: 'check',
        };
        setResignationRecovery(parsed.options.ambiguous ? recovery : null);
        setRequestStatus('reconciling');
        setStatusMessage('Forfeit not confirmed. Checking the battle…');
        await reconcileResignation(recovery, controller);
      } else {
        setError(parsed);
        setErrorContext('resignation');
        setStatusMessage('Forfeit not recorded. Battle unchanged.');
      }
      setRequestStatus('ready');
    } finally {
      if (mutation.current === controller) mutation.current = null;
    }
  }

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({
        appState: { returnTo: `/matches/pvp/${matchId}` },
      });
    } catch {
      setReauthFailed(true);
    }
  }

  if (requestStatus === 'loading' && !match) {
    return (
      <PageLoadingState
        title="Loading battle"
        onRetry={() => setRevision((value) => value + 1)}
        resetKey={`${matchId}:${revision}`}
      />
    );
  }

  if (!match && error) {
    return (
      <div className="matches-page">
        <section
          className="match-state-panel state-message state-message--error"
          role="alert"
        >
          <StateIcon tone="error" />
          <h1 ref={phaseHeading} tabIndex={-1}>
            Couldn’t load battle
          </h1>
          <p>{errorMessage(error)}</p>
          <div className="match-state-actions">
            {error.failure === 'authorization' ? (
              <button
                className="button"
                onClick={() => void startSignIn()}
                type="button"
              >
                Sign in again
              </button>
            ) : (
              <button
                className="button"
                onClick={() => setRevision((value) => value + 1)}
                type="button"
              >
                Try again
              </button>
            )}
            <Link className="button button--quiet" href="/matches/pvp">
              Back to Player Battles
            </Link>
          </div>
          {reauthFailed ? (
            <p role="alert">Couldn’t start sign-in. Try again.</p>
          ) : null}
        </section>
      </div>
    );
  }

  if (!match) return null;
  const requestBusy =
    requestStatus === 'submitting' || requestStatus === 'reconciling';
  const presenting = activeMomentIndex !== null;
  const busy = requestBusy || presenting;
  const viewMatch = presentedMatch ?? match;
  const activeMoment = presenting
    ? (presentationMoments[activeMomentIndex] ?? null)
    : null;
  const activeSide = activeMoment?.actorSide ?? viewMatch.currentActor;
  const battlefieldTitle = activeMoment
    ? pvpPresentationTitle(activeMoment)
    : error
      ? 'Refresh battle'
      : requestBusy
        ? errorContext === 'resignation'
          ? 'Recording forfeit'
          : 'Processing your action'
        : countdown.expired && viewMatch.status === 'active'
          ? 'Deadline reached'
          : phaseTitle(viewMatch);
  const battlefieldTone =
    viewMatch.status === 'completed'
      ? viewMatch.outcome === 'win'
        ? 'player'
        : 'cpu'
      : activeSide === 'self'
        ? 'player'
        : 'cpu';
  const selfCreature =
    viewMatch.state.self.creatures.find(
      (creature) => creature.id === viewMatch.state.self.activeCreatureId,
    ) ?? null;
  const latestMoments = viewMatch.history.flatMap((entry) =>
    pvpPresentationMoments(entry, viewMatch),
  );
  const selfFeedback = pvpBattleFeedback(activeMoment, 'self');
  const opponentFeedback = pvpBattleFeedback(activeMoment, 'opponent');
  const actionLockReason = pvpActionLockReason({
    activeSide,
    error: error !== null,
    presenting,
    requestStatus,
  });

  if (viewMatch.status === 'completed') {
    return (
      <CompletedPvpMatch
        headingRef={phaseHeading}
        match={viewMatch}
        statusMessage={statusMessage}
      />
    );
  }

  return (
    <div className="matches-page battle-page pvp-battle-page battle-page--live">
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>
      <BattleShellHeader
        backHref="/matches/pvp"
        backLabel="Player Battles"
        mode="Player Battle"
        opponentLabel={`Against ${viewMatch.opponent.playerName}`}
        turnNumber={viewMatch.state.turnNumber}
      />

      {pollWarning ? (
        <div className="pvp-poll-warning" role="status">
          <span>Couldn’t refresh. Showing the last update.</span>
          <button
            className="button button--quiet"
            disabled={requestStatus === 'reconciling'}
            aria-busy={requestStatus === 'reconciling'}
            onClick={() => void refreshMatch({ announce: true })}
            type="button"
          >
            {requestStatus === 'reconciling' ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      ) : null}

      {error ? (
        <div
          className="match-inline-alert state-message state-message--error"
          ref={alert}
          role="alert"
          tabIndex={-1}
        >
          <StateIcon tone="error" />
          <strong>
            {errorContext === 'resignation'
              ? 'Forfeit not confirmed.'
              : 'Action not confirmed.'}
          </strong>{' '}
          {retryAttempt || resignationRecovery?.stage === 'retry'
            ? 'The battle is unchanged. You can retry.'
            : errorMessage(error)}
          <div className="match-state-actions">
            {resignationRecovery?.stage === 'retry' ? (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void submitResignation(resignationRecovery.attempt)
                }
                type="button"
              >
                Retry forfeit
              </button>
            ) : resignationRecovery?.stage === 'check' ? (
              <button
                className="button"
                disabled={busy}
                onClick={() => void checkResignationState(resignationRecovery)}
                type="button"
              >
                Check result
              </button>
            ) : retryAttempt ? (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void submitAction(retryAttempt.action, retryAttempt)
                }
                type="button"
              >
                Retry action
              </button>
            ) : error.failure === 'authorization' ? (
              <button
                className="button"
                onClick={() => void startSignIn()}
                type="button"
              >
                Sign in again
              </button>
            ) : (
              <button
                className="button"
                onClick={() => void refreshMatch({ announce: true })}
                type="button"
              >
                Refresh battle
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="battle-live-layout">
        <section
          aria-label="Current battlefield"
          className={`battle-stage battle-stage--${battlefieldTone}${presenting ? ' battle-stage--resolving' : ''}`}
        >
          <div aria-hidden="true" className="battle-stage__field-lines" />
          <div className="battle-stage__label">
            <span>Current battlefield</span>
          </div>
          <h1 className="battle-stage__turn" ref={phaseHeading} tabIndex={-1}>
            {battlefieldTitle}
          </h1>
          <div className="battle-arena">
            <BattleCombatant
              creature={selfCreature}
              emptyText="Choose a replacement for your defeated Creature."
              heading="You"
              isActing={activeSide === 'self'}
              isDimmed={presenting && activeSide === 'opponent'}
              isEntering={activeMoment?.entranceSide === 'self'}
              isResolving={presenting}
              feedbackKey={activeMoment?.id}
              feedbackText={selfFeedback?.label}
              feedbackTone={selfFeedback?.tone}
              visualSide="player"
            />
            <BattleResolution
              activeIndex={activeMomentIndex}
              activeMoment={activeMoment}
              moments={presenting ? presentationMoments : latestMoments}
            />
            <BattleCombatant
              creature={viewMatch.state.opponent.activeCreature}
              emptyText="Your opponent’s Creature has not been revealed yet."
              heading={viewMatch.opponent.playerName}
              isActing={activeSide === 'opponent'}
              isDimmed={presenting && activeSide === 'self'}
              isEntering={activeMoment?.entranceSide === 'opponent'}
              isResolving={presenting}
              feedbackKey={activeMoment?.id}
              feedbackText={opponentFeedback?.label}
              feedbackTone={opponentFeedback?.tone}
              visualSide="cpu"
            />
          </div>
        </section>

        <BattleActionPanel
          activeCreatureId={viewMatch.state.self.activeCreatureId}
          busy={busy}
          inputBlocked={
            requestStatus !== 'ready' ||
            presenting ||
            error !== null ||
            countdown.expired
          }
          creatures={viewMatch.state.self.creatures}
          currentActor={viewMatch.currentActor === 'self'}
          idPrefix="pvp"
          key={`${viewMatch.state.phase}:${selfCreature?.id ?? 'none'}`}
          legalActions={viewMatch.legalActions}
          lockReason={actionLockReason}
          onAction={(action) => {
            const pvpAction = toPvpAction(action);
            if (pvpAction) void submitAction(pvpAction);
          }}
          opponentLabel={viewMatch.opponent.playerName}
          phase={
            viewMatch.state.phase === 'completed'
              ? 'active'
              : viewMatch.state.phase
          }
          powerCards={viewMatch.state.self.powerCards}
        />

        <PvpSideRail
          busy={busy}
          deadline={
            viewMatch.status === 'active' && viewMatch.turnDeadline
              ? {
                  detail: `Play by ${formatDate(viewMatch.turnDeadline)}`,
                  expired: countdown.expired,
                  label: countdown.label,
                }
              : undefined
          }
          forfeitPending={
            requestStatus === 'submitting' && errorContext === 'resignation'
          }
          match={viewMatch}
          onResign={
            viewMatch.status === 'active'
              ? () => setConfirmingResignation(true)
              : undefined
          }
          resignTrigger={resignTrigger}
        />
      </div>
      {confirmingResignation && match.canResign && !presenting ? (
        <ResignMatchDialog
          busy={busy}
          onCancel={() => setConfirmingResignation(false)}
          onConfirm={() => void submitResignation()}
          opponentLabel={match.opponent.playerName}
          returnFocusRef={resignTrigger}
        />
      ) : null}
    </div>
  );
}

function PvpSideRail({
  busy = false,
  deadline,
  forfeitPending = false,
  match,
  onResign,
  resignTrigger,
}: {
  busy?: boolean;
  deadline?: { detail: string; expired: boolean; label: string };
  forfeitPending?: boolean;
  match: AsyncPvpMatch;
  onResign?: () => void;
  resignTrigger?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <aside
      aria-label="Battle activity and controls"
      className="battle-side-rail"
    >
      <header className="battle-side-rail__heading">
        <h2>Activity</h2>
      </header>
      <PvpBattleLog match={match} />
      {deadline ? (
        <section
          aria-label="Turn deadline"
          className="battle-rail-card pvp-turn-deadline"
          data-expired={deadline.expired || undefined}
        >
          <span>Turn deadline</span>
          <strong>{deadline.label}</strong>
          <small>{deadline.detail}</small>
        </section>
      ) : null}
      {match.state.phase !== 'replacement' ? (
        <BattleBench
          creatures={match.state.self.creatures}
          activeCreatureId={match.state.self.activeCreatureId}
        />
      ) : null}
      <details className="battle-rail-card cpu-reserve">
        <summary>
          <span>Opponent reserve</span>
          <strong>
            {match.state.opponent.remainingCreatureCount} Creature
            {match.state.opponent.remainingCreatureCount === 1
              ? ''
              : 's'} · {match.state.opponent.remainingPowerCardCount} Power
          </strong>
        </summary>
        <p>Unplayed cards are hidden.</p>
        {match.state.opponent.playedPowerCards.length > 0 ? (
          <ul className="pvp-played-cards">
            {match.state.opponent.playedPowerCards.map((card) => (
              <li key={card.id}>{card.name}</li>
            ))}
          </ul>
        ) : null}
      </details>
      {match.canResign && onResign ? (
        <button
          aria-label={forfeitPending ? 'Forfeiting…' : 'Forfeit battle'}
          className="battle-side-rail__forfeit"
          disabled={busy}
          onClick={onResign}
          ref={resignTrigger}
          type="button"
        >
          <Flag aria-hidden="true" size={17} />
          {forfeitPending ? 'Forfeiting…' : 'Forfeit'}
        </button>
      ) : null}
    </aside>
  );
}

function PvpBattleLog({ match }: { match: AsyncPvpMatch }) {
  const latest = match.history.at(-1);
  const groups = groupPvpHistory(match.history);
  return (
    <details className="battle-log battle-rail-card">
      <summary>
        <span className="battle-log__summary-label">
          <span>Latest</span>
          <strong>
            {match.history.length} action{match.history.length === 1 ? '' : 's'}
          </strong>
        </span>
        <CaretDown
          aria-hidden="true"
          className="battle-log__toggle"
          size={16}
        />
        <span className="battle-log__preview">
          {latest ? pvpActionMessage(latest.result, match) : 'No actions yet.'}
        </span>
      </summary>
      <div
        aria-label="Battle activity"
        aria-live="polite"
        aria-relevant="additions"
        className="battle-log__body"
        role="log"
        tabIndex={0}
      >
        {groups.length > 0 ? (
          <ol className="battle-log__groups">
            {groups.map((group) => (
              <li className="battle-log__group" key={group.turnNumber}>
                <h3>Turn {group.turnNumber}</h3>
                <ol>
                  {group.entries.map((entry) => (
                    <li
                      className={`battle-log__event battle-log__event--action battle-log__event--${entry.result.side === 'self' ? 'player' : 'cpu'}`}
                      key={entry.sequence}
                    >
                      <span>{pvpActionMessage(entry.result, match)}</span>
                      {entry.result.effects.length > 0 ? (
                        <span className="battle-log__effects">
                          {entry.result.effects.map((effect) => (
                            <span key={effect.effectId}>
                              {pvpEffectMessage(effect, match)}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        ) : (
          <p>No actions yet.</p>
        )}
      </div>
    </details>
  );
}

function CompletedPvpMatch({
  headingRef,
  match,
  statusMessage,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  match: AsyncPvpMatch;
  statusMessage: string;
}) {
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
  const playerWon = match.outcome === 'win';
  const OutcomeIcon = playerWon ? Trophy : XCircle;
  const groups = groupPvpHistory(match.history);
  const finalTurn = groups.at(-1);
  const returnState = pvpHistoryNavigationState();
  const returnHref =
    returnState?.pvpHistoryReturn.returnHref ?? '/matches/pvp?section=history';
  const opponentCreatures = pvpSideCreatures(match, 'opponent');
  const selfCreature =
    match.state.self.creatures.find(
      (creature) => creature.id === match.state.self.activeCreatureId,
    ) ?? null;
  const opponentCreature =
    match.state.opponent.activeCreature ??
    match.state.opponent.defeatedCreatures[0] ??
    null;
  return (
    <div className="matches-page battle-page pvp-battle-page battle-page--completed battle-report">
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>
      <Link
        className="battle-report__back"
        href={returnHref}
        state={returnState}
      >
        <ArrowLeft size={20} aria-hidden="true" /> Battle history
      </Link>
      <div className="battle-report__panel">
        <section
          aria-labelledby="completed-pvp-title"
          className="completed-match battle-report__outcome"
          data-outcome={match.outcome}
        >
          <div className="battle-report__result">
            <OutcomeIcon size={32} aria-hidden="true" />
            <h1 id="completed-pvp-title" ref={headingRef} tabIndex={-1}>
              {playerWon ? 'Victory' : 'Defeat'}
            </h1>
          </div>
          <p className="battle-report__opponent">
            Against {match.opponent.playerName}
          </p>
          {match.completionReason !== 'defeat' ? (
            <p className="battle-report__reason">{completedReason(match)}</p>
          ) : null}
          <dl className="battle-report__facts">
            <div>
              <dt>Completed</dt>
              <dd>
                {match.completedAt ? (
                  <time dateTime={match.completedAt}>
                    {formatDate(match.completedAt)}
                  </time>
                ) : (
                  'Unavailable'
                )}
              </dd>
            </div>
            {match.state.turnNumber !== finalTurn?.turnNumber ? (
              <div>
                <dt>Ended on turn</dt>
                <dd>{match.state.turnNumber}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section
          aria-labelledby="pvp-final-turn-title"
          className="battle-report__final-turn"
        >
          <div className="battle-report__section-heading">
            <h2 id="pvp-final-turn-title">Last moves</h2>
            {finalTurn ? <span>Turn {finalTurn.turnNumber}</span> : null}
          </div>
          {match.completionReason !== 'defeat' && finalTurn ? (
            <p className="battle-report__note">Before the forfeit.</p>
          ) : null}
          {finalTurn ? (
            <PvpRecordedActions entries={finalTurn.entries} match={match} />
          ) : (
            <p className="battle-report__note">No moves recorded.</p>
          )}
          <div className="battle-report__combatants">
            <PvpReportCombatant creature={selfCreature} label="You" />
            <PvpReportCombatant
              creature={opponentCreature}
              label={match.opponent.playerName}
            />
          </div>
        </section>

        {groups.length > 0 ? (
          <details className="battle-report__disclosure">
            <summary>
              <span>Turn history</span>
              <CaretDown size={20} aria-hidden="true" />
            </summary>
            <ol className="battle-report__turns">
              {groups.map((group) => (
                <li key={group.turnNumber}>
                  <h3>Turn {group.turnNumber}</h3>
                  <PvpRecordedActions entries={group.entries} match={match} />
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <details className="battle-report__disclosure">
          <summary>
            <span>Cards</span>
            <CaretDown size={20} aria-hidden="true" />
          </summary>
          <div className="battle-report__card-groups">
            <section aria-label="Your creatures">
              <h3>Your creatures</h3>
              <PvpReportCreatures creatures={match.state.self.creatures} />
            </section>
            <section aria-label="Revealed opponent cards">
              <h3>Revealed opponent cards</h3>
              {opponentCreatures.length > 0 ? (
                <PvpReportCreatures creatures={opponentCreatures} />
              ) : (
                <p className="battle-report__note">No revealed creatures.</p>
              )}
              {match.state.opponent.playedPowerCards.length > 0 ? (
                <>
                  <h3>Played Power cards</h3>
                  <ul className="battle-report__power-cards">
                    {match.state.opponent.playedPowerCards.map((card) => (
                      <li key={card.id}>{card.name}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}

function PvpReportCombatant({
  creature,
  label,
}: {
  creature: MatchCreature | null;
  label: string;
}) {
  return (
    <section
      aria-label={`${label} battle Creature`}
      className="battle-report__combatant"
    >
      <h3>{label}</h3>
      {creature ? (
        <>
          <p className="battle-report__creature-name">{creature.name}</p>
          <div className="battle-report__portrait">
            <CreatureDetailsPicture creature={creature} />
            <div className="battle-report__hp">
              <div>
                <span>HP</span>
                <strong>
                  {creature.currentHp} / {creature.maxHp}
                </strong>
              </div>
              <meter
                aria-label={`${label}: ${creature.name} HP`}
                min={0}
                max={creature.maxHp}
                value={creature.currentHp}
              />
            </div>
          </div>
          {creature.defeated ? (
            <p className="battle-report__defeated">Defeated</p>
          ) : null}
        </>
      ) : (
        <p className="battle-report__note">No creature recorded.</p>
      )}
    </section>
  );
}

function PvpRecordedActions({
  entries,
  match,
}: {
  entries: PvpActionHistoryEntry[];
  match: AsyncPvpMatch;
}) {
  return (
    <ol className="battle-report__events">
      {entries.map((entry) => (
        <li key={entry.sequence}>
          <p>{pvpActionMessage(entry.result, match)}</p>
          {entry.result.effects.map((effect) => (
            <p className="battle-report__effect" key={effect.effectId}>
              {pvpEffectMessage(effect, match)}
            </p>
          ))}
          {entry.result.defeatedCreatureId ? (
            <p className="battle-report__effect">
              {pvpCreature(match, 'self', entry.result.defeatedCreatureId)
                ?.name ??
                pvpCreature(match, 'opponent', entry.result.defeatedCreatureId)
                  ?.name ??
                'A Creature'}{' '}
              was defeated.
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function PvpReportCreatures({ creatures }: { creatures: MatchCreature[] }) {
  return (
    <ul className="battle-report__cards">
      {creatures.map((creature) => (
        <li key={creature.id}>
          <CreatureDetailsPicture creature={creature} />
          <div>
            <strong>{creature.name}</strong>
            <span>
              {creature.defeated
                ? 'Defeated'
                : `${creature.currentHp} / ${creature.maxHp} HP`}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function useDeadlineCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!deadline) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [deadline]);
  if (!deadline) return { expired: false, label: 'No active deadline' };
  const remaining = new Date(deadline).getTime() - now;
  if (remaining <= 0) return { expired: true, label: 'Deadline reached' };
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return {
    expired: false,
    label:
      hours > 0
        ? `${hours}h ${minutes}m remaining`
        : `${minutes}m ${seconds}s remaining`,
  };
}

function phaseTitle(match: AsyncPvpMatch) {
  if (match.status === 'completed')
    return match.outcome === 'win' ? 'Battle won' : 'Battle complete';
  if (match.state.phase === 'replacement')
    return match.currentActor === 'self'
      ? 'Replacement required'
      : 'Opponent choosing a replacement';
  return match.currentActor === 'self' ? 'Your turn' : 'Opponent’s turn';
}

function matchStatusMessage(match: AsyncPvpMatch) {
  if (match.status === 'completed')
    return `Battle complete. ${completedReason(match)}`;
  if (match.state.phase === 'replacement')
    return match.currentActor === 'self'
      ? 'Your Creature was defeated. Choose an available replacement.'
      : 'Opponent choosing replacement…';
  return match.currentActor === 'self'
    ? 'Your turn. Choose an available action.'
    : `Waiting for ${match.opponent.playerName}. The battle will refresh automatically.`;
}

function pvpPresentationMoments(
  entry: PvpActionHistoryEntry,
  match: AsyncPvpMatch,
): PvpPresentationMoment[] {
  const result = entry.result;
  const moments: PvpPresentationMoment[] = [
    {
      action: result.action,
      actorSide: result.side,
      entranceSide:
        result.action.type === 'select_replacement' ||
        result.action.type === 'swap_creature'
          ? result.side
          : undefined,
      id: `${entry.sequence}-action`,
      kind: 'action',
      message: pvpActionMessage(result, match),
      tone: 'action',
    },
  ];
  result.effects.forEach((effect, index) => {
    moments.push({
      actorSide: result.side,
      effect,
      id: `${entry.sequence}-effect-${effect.effectId}-${index}`,
      kind: 'effect',
      message: pvpEffectMessage(effect, match),
      stat: pvpEffectStat(effect),
      targetCreatureId: effect.targetCreatureId,
      targetSide: effect.targetSide,
      tone: pvpEffectTone(effect),
    });
  });
  if (result.defeatedCreatureId) {
    const targetSide = pvpCreature(match, 'self', result.defeatedCreatureId)
      ? 'self'
      : 'opponent';
    const defeated = pvpCreature(match, targetSide, result.defeatedCreatureId);
    moments.push({
      actorSide: result.side,
      id: `${entry.sequence}-defeat`,
      kind: 'defeat',
      message: defeated
        ? `${defeated.name} was defeated.`
        : 'A Creature was defeated.',
      targetCreatureId: result.defeatedCreatureId,
      targetSide,
      tone: 'defeat',
    });
  }
  if (result.winner) {
    moments.push({
      actorSide: result.side,
      id: `${entry.sequence}-result`,
      kind: 'result',
      message:
        result.winner === 'self'
          ? 'You won the battle.'
          : `${match.opponent.playerName} won the battle.`,
      tone: 'status',
    });
  }
  return moments;
}

function pvpActionMessage(result: PvpActionResult, match: AsyncPvpMatch) {
  const actor = result.side === 'self' ? 'You' : match.opponent.playerName;
  const action = result.action;
  if (action.type === 'use_move') {
    const move = pvpSideCreatures(match, result.side)
      .flatMap((creature) => creature.moves)
      .find((candidate) => candidate.id === action.moveId);
    return `${actor} used ${move?.name ?? 'a move'}.`;
  }
  if (action.type === 'use_power_card') {
    const cards =
      result.side === 'self'
        ? match.state.self.powerCards
        : match.state.opponent.playedPowerCards;
    const card = cards.find((candidate) => candidate.id === action.powerCardId);
    return `${actor} played ${card?.name ?? 'a Power card'}.`;
  }
  const creature = pvpCreature(match, result.side, action.creatureId);
  if (action.type === 'swap_creature') {
    return result.side === 'self'
      ? `You swapped in ${creature?.name ?? 'a Creature'}.`
      : `${actor} swapped in ${creature?.name ?? 'a Creature'}.`;
  }
  return result.side === 'self'
    ? `Go, ${creature?.name ?? 'Creature'}!`
    : `${actor} sent out ${creature?.name ?? 'a Creature'}!`;
}

function pvpEffectMessage(effect: PvpActionEffect, match: AsyncPvpMatch) {
  const target = pvpTargetLabel(match, effect);
  const amount = Math.abs(effect.amount);
  if (effect.effectType === 'damage') return `${target} took ${amount} damage.`;
  if (effect.effectType === 'heal') return `${target} restored ${amount} HP.`;
  if (effect.modifier?.stat === 'hp')
    return effect.effectType === 'buff'
      ? `${target} restored ${amount} HP.`
      : `${target} lost ${amount} HP.`;
  if (effect.modifier?.stat === 'power')
    return effect.effectType === 'buff'
      ? `${target} restored ${amount} Power.`
      : `${target} lost ${amount} Power.`;
  if (effect.modifier?.stat === 'damage_multiplier') {
    const direction = effect.effectType === 'buff' ? 'increased' : 'decreased';
    const turns = effect.modifier.durationTurns;
    const duration =
      turns == null
        ? 'for the battle'
        : `for ${turns} ${turns === 1 ? 'turn' : 'turns'}`;
    return `${target} damage ${direction} by ${amount}% ${duration}.`;
  }
  return `${target} received a ${effect.effectType}.`;
}

function pvpTargetLabel(match: AsyncPvpMatch, effect: PvpActionEffect) {
  const creature = pvpCreature(
    match,
    effect.targetSide,
    effect.targetCreatureId,
  );
  if (effect.targetSide === 'self')
    return creature ? `Your ${creature.name}` : 'Your Creature';
  return creature
    ? `${match.opponent.playerName}’s ${creature.name}`
    : `${match.opponent.playerName}’s Creature`;
}

function pvpSideCreatures(match: AsyncPvpMatch, side: 'opponent' | 'self') {
  if (side === 'self') return match.state.self.creatures;
  return [
    ...(match.state.opponent.activeCreature
      ? [match.state.opponent.activeCreature]
      : []),
    ...match.state.opponent.defeatedCreatures,
  ];
}

function pvpCreature(
  match: AsyncPvpMatch,
  side: 'opponent' | 'self',
  creatureId: string,
) {
  return (
    pvpSideCreatures(match, side).find(
      (creature) => creature.id === creatureId,
    ) ?? null
  );
}

function pvpEffectStat(
  effect: PvpActionEffect,
): BattleResolutionMoment['stat'] {
  const resource =
    effect.effectType === 'damage' || effect.effectType === 'heal'
      ? 'HP'
      : effect.modifier?.stat === 'hp'
        ? 'HP'
        : effect.modifier?.stat === 'power'
          ? 'Power'
          : null;
  if (!resource) return null;
  return {
    direction:
      effect.effectType === 'heal' || effect.effectType === 'buff'
        ? 'up'
        : 'down',
    resource,
    value: Math.abs(effect.amount),
  };
}

function pvpEffectTone(effect: PvpActionEffect): BattleFeedbackTone {
  return effect.effectType;
}

function pvpPresentationDelay(moment: PvpPresentationMoment) {
  if (prefersReducedMotion()) return 1_000;
  if (moment.kind === 'defeat' || moment.kind === 'result') return 1_900;
  if (moment.kind === 'action') return 1_700;
  return 1_600;
}

function pvpPresentationTitle(moment: PvpPresentationMoment) {
  if (moment.kind === 'defeat') return 'A Creature was defeated';
  if (moment.kind === 'result') return 'Battle decided';
  return moment.actorSide === 'self' ? 'Your move' : 'Opponent move';
}

function pvpActionLockReason({
  activeSide,
  error,
  presenting,
  requestStatus,
}: {
  activeSide: 'opponent' | 'self' | null;
  error: boolean;
  presenting: boolean;
  requestStatus: RequestStatus;
}) {
  if (error) return 'Check the latest battle before acting';
  if (requestStatus === 'submitting') return 'Confirming your move…';
  if (requestStatus === 'reconciling') return 'Checking the battle…';
  if (presenting)
    return activeSide === 'self'
      ? 'Your move is resolving…'
      : 'Opponent is moving…';
  if (activeSide === 'opponent') return 'Waiting for your opponent…';
  return undefined;
}

function applyPvpPresentationMoment(
  current: AsyncPvpMatch,
  target: AsyncPvpMatch,
  moment: PvpPresentationMoment,
) {
  const next = structuredClone(current);
  if (moment.kind === 'action' && moment.action) {
    if (
      moment.action.type === 'select_replacement' ||
      moment.action.type === 'swap_creature'
    ) {
      if (moment.actorSide === 'self') {
        next.state.self.activeCreatureId = target.state.self.activeCreatureId;
      } else {
        next.state.opponent.activeCreature = structuredClone(
          target.state.opponent.activeCreature,
        );
      }
    }
    if (moment.action.type === 'use_power_card') {
      if (moment.actorSide === 'self') {
        next.state.self.usedPowerCardIds = [
          ...target.state.self.usedPowerCardIds,
        ];
        next.state.self.powerCards = structuredClone(
          target.state.self.powerCards,
        );
      } else {
        next.state.opponent.playedPowerCards = structuredClone(
          target.state.opponent.playedPowerCards,
        );
        next.state.opponent.remainingPowerCardCount =
          target.state.opponent.remainingPowerCardCount;
      }
    }
  }

  if (moment.effect && moment.targetCreatureId && moment.targetSide) {
    const stat = pvpEffectStat(moment.effect);
    updatePvpCreature(
      next,
      moment.targetSide,
      moment.targetCreatureId,
      (creature) => {
        if (stat) {
          const delta =
            Math.abs(Number(stat.value)) * (stat.direction === 'up' ? 1 : -1);
          if (stat.resource === 'HP') {
            creature.currentHp = Math.min(
              creature.maxHp,
              Math.max(0, creature.currentHp + delta),
            );
          } else {
            creature.remainingPower = Math.min(
              creature.maxPower,
              Math.max(0, creature.remainingPower + delta),
            );
          }
        }
        if (moment.effect?.modifier?.stat === 'damage_multiplier') {
          const confirmed = pvpCreature(
            target,
            moment.targetSide!,
            moment.targetCreatureId!,
          );
          if (confirmed) {
            creature.activeModifiers = structuredClone(
              confirmed.activeModifiers,
            );
          }
        }
      },
    );
  }

  if (
    moment.kind === 'defeat' &&
    moment.targetCreatureId &&
    moment.targetSide
  ) {
    updatePvpCreature(
      next,
      moment.targetSide,
      moment.targetCreatureId,
      (creature) => {
        creature.currentHp = 0;
        creature.defeated = true;
      },
    );
  }
  return next;
}

function updatePvpCreature(
  match: AsyncPvpMatch,
  side: 'opponent' | 'self',
  creatureId: string,
  update: (creature: MatchCreature) => void,
) {
  const creature = pvpCreature(match, side, creatureId);
  if (creature) update(creature);
}

function pvpBattleFeedback(
  moment: PvpPresentationMoment | null,
  side: 'opponent' | 'self',
) {
  if (!moment) return undefined;
  if (moment.kind === 'action' && moment.actorSide === side) {
    return {
      label: side === 'self' ? 'Your move' : 'Opponent move',
      tone: moment.tone,
    };
  }
  if (moment.targetSide !== side) return undefined;
  if (moment.stat) {
    return {
      label: `${moment.stat.direction === 'up' ? '+' : '−'}${moment.stat.value} ${moment.stat.resource}`,
      tone: moment.tone,
    };
  }
  if (moment.kind === 'defeat') return { label: 'Defeated', tone: moment.tone };
  return { label: 'Effect applied', tone: moment.tone };
}

function groupPvpHistory(history: readonly PvpActionHistoryEntry[]) {
  const groups = new Map<number, PvpActionHistoryEntry[]>();
  history.forEach((entry) => {
    const entries = groups.get(entry.turnNumber) ?? [];
    entries.push(entry);
    groups.set(entry.turnNumber, entries);
  });
  return [...groups.entries()].map(([turnNumber, entries]) => ({
    entries,
    turnNumber,
  }));
}

function completedReason(match: AsyncPvpMatch) {
  if (match.completionReason === 'defeat')
    return match.outcome === 'win'
      ? `You defeated ${match.opponent.playerName}.`
      : `${match.opponent.playerName} won the battle.`;
  if (match.completionReason === 'account_deletion_forfeit')
    return match.outcome === 'win'
      ? 'Your opponent became unavailable.'
      : 'Your account became unavailable.';
  if (match.completionReason === 'voluntary_resignation')
    return match.outcome === 'win'
      ? 'Your opponent forfeited.'
      : 'You forfeited.';
  return match.outcome === 'win'
    ? 'Your opponent’s turn deadline expired.'
    : 'Your turn deadline expired.';
}

function isLegalAction(match: AsyncPvpMatch, action: PvpAction) {
  return match.legalActions.some((legal) => sameAction(legal, action));
}

function sameAction(left: PvpAction, right: PvpAction) {
  if (left.type !== right.type) return false;
  if ('creatureId' in left && 'creatureId' in right)
    return left.creatureId === right.creatureId;
  if ('moveId' in left && 'moveId' in right)
    return left.moveId === right.moveId;
  if ('powerCardId' in left && 'powerCardId' in right)
    return left.powerCardId === right.powerCardId;
  return false;
}

function toPvpAction(action: BattleActionIntent): PvpAction | null {
  return action.type === 'select_initial_creature' ? null : action;
}

function errorMessage(error: PvpApiError) {
  if (error.failure === 'authorization')
    return 'Your session expired. Sign in again.';
  if (error.failure === 'not-found')
    return 'This battle isn’t available to your account.';
  if (error.failure === 'completed')
    return 'This battle has ended. Refresh to see the result.';
  if (error.failure === 'stale' || error.failure === 'illegal-action')
    return 'The battle changed. Refresh to see available actions.';
  if (error.options.ambiguous)
    return 'The result is unknown. Refresh before retrying.';
  return 'Check your connection and try again.';
}

function toPvpError(error: unknown) {
  return error instanceof PvpApiError ? error : new PvpApiError('unavailable');
}

function formatDate(value: string) {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
