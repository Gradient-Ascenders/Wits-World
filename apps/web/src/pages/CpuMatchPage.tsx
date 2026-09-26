import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import {
  ArrowDown,
  ArrowUp,
  Flag,
  Lightning,
  Heart,
  CaretDown,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Link, useParams } from 'wouter';

import {
  getCpuMatch,
  forfeitCpuMatch,
  MatchApiError,
  submitCpuMatchAction,
  type BattleLogEvent,
  type CpuMatch,
  type CpuMatchIntent,
} from '../api/matches';
import { prefersReducedMotion } from '../accessibility/preferences';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import { ResignMatchDialog } from '../components/matches/ResignMatchDialog';
import {
  BattleOutcomePanel,
  BattleShellHeader,
  BattleStatusDock,
} from '../components/matches/BattleShell';
import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
  BattleResolution,
  type BattleFeedbackTone,
  type BattleResolutionMoment,
} from '../components/matches/BattlePresentation';
import {
  battleLogMessage,
  battleLogRows,
  battleLogStat,
} from '../battle/log-presentation';
import './matches.css';

interface MatchRouteParams {
  matchId: string;
}

type RequestStatus = 'loading' | 'ready' | 'reconciling' | 'submitting';
type ApplyMatchResult = 'applied' | 'obsolete' | 'wrong-route';
type RequestKind = 'action' | 'forfeit';
type PresentationMode = 'opening' | 'turn';

export default function CpuMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<MatchRouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [match, setMatch] = useState<CpuMatch | null>(null);
  const [presentedMatch, setPresentedMatch] = useState<CpuMatch | null>(null);
  const [error, setError] = useState<MatchApiError | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading your battle.');
  const [requestKind, setRequestKind] = useState<RequestKind>('action');
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [battleBeats, setBattleBeats] = useState<BattleLogEvent[]>([]);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(null);
  const [presentationMode, setPresentationMode] =
    useState<PresentationMode | null>(null);
  const [revision, setRevision] = useState(0);
  const [reauthFailed, setReauthFailed] = useState(false);
  const mounted = useRef(true);
  const routeMatchId = useRef(matchId);
  const matchRef = useRef<CpuMatch | null>(null);
  const presentationActive = useRef(false);
  const presentationTarget = useRef<CpuMatch | null>(null);
  const nextGeneration = useRef(0);
  const latestAppliedGeneration = useRef(0);
  const appliedRevision = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const phaseHeading = useRef<HTMLHeadingElement | null>(null);
  const alert = useRef<HTMLElement | null>(null);
  const forfeitTrigger = useRef<HTMLButtonElement | null>(null);

  routeMatchId.current = matchId;

  const advancePresentation = useCallback(() => {
    setActiveBeatIndex((current) => {
      if (current !== null && current + 1 < battleBeats.length) {
        return current + 1;
      }

      const target = presentationTarget.current;
      if (target) {
        setPresentedMatch(target);
        setStatusMessage(getMatchStatusMessage(target));
      }
      if (presentationMode === 'opening') {
        queueMicrotask(() => phaseHeading.current?.focus());
      }
      presentationActive.current = false;
      presentationTarget.current = null;
      setPresentationMode(null);
      return null;
    });
  }, [battleBeats.length, presentationMode]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);

  const applyMatch = useCallback(
    (next: CpuMatch, generation: number): ApplyMatchResult => {
      if (!mounted.current || next.matchId !== routeMatchId.current) {
        return 'wrong-route';
      }

      const current = matchRef.current;
      if (current?.status === 'completed') {
        return 'obsolete';
      }
      if (current && next.version < current.version) {
        return 'obsolete';
      }
      if (
        current &&
        next.version === current.version &&
        generation < latestAppliedGeneration.current
      ) {
        return 'obsolete';
      }

      const phaseChanged = current?.state.phase !== next.state.phase;
      const newEvents = current ? newBattleLogEvents(current, next) : [];
      matchRef.current = next;
      latestAppliedGeneration.current = Math.max(
        latestAppliedGeneration.current,
        generation,
      );
      appliedRevision.current += 1;
      setMatch(next);
      setError(null);

      if (current && newEvents.length > 0) {
        const visibleBeats = newEvents.filter((event) => event.kind !== 'turn');
        const mode: PresentationMode =
          current.state.phase === 'initial_selection' &&
          next.state.phase !== 'initial_selection'
            ? 'opening'
            : 'turn';
        const nextBeats = orderPresentationBeats(
          visibleBeats.length > 0 ? visibleBeats : newEvents,
          mode,
        );
        presentationActive.current = true;
        presentationTarget.current = next;
        setPresentedMatch(current);
        setPresentationMode(mode);
        setBattleBeats(nextBeats);
        setActiveBeatIndex(0);
        setStatusMessage(presentationMessage(nextBeats[0]!, mode));
      } else {
        presentationActive.current = false;
        presentationTarget.current = null;
        setPresentedMatch(next);
        setPresentationMode(null);
        setBattleBeats([]);
        setActiveBeatIndex(null);
        setStatusMessage(getMatchStatusMessage(next));
      }

      if (phaseChanged || next.status === 'completed') {
        queueMicrotask(() => phaseHeading.current?.focus());
      }
      return 'applied';
    },
    [],
  );

  useEffect(() => {
    if (activeBeatIndex === null) return;
    const activeBeat = battleBeats[activeBeatIndex];
    const target = presentationTarget.current;
    if (!activeBeat || !target || !presentationMode) return;

    setPresentedMatch((current) =>
      current
        ? applyPresentationBeat(
            current,
            target,
            activeBeat,
            battleBeats.slice(activeBeatIndex + 1),
          )
        : current,
    );
    setStatusMessage(presentationMessage(activeBeat, presentationMode));

    const timeout = window.setTimeout(
      () => {
        advancePresentation();
      },
      presentationBeatDelay(activeBeat, presentationMode),
    );
    return () => window.clearTimeout(timeout);
  }, [activeBeatIndex, advancePresentation, battleBeats, presentationMode]);

  const finishMatchResponse = useCallback((result: ApplyMatchResult) => {
    if (result === 'wrong-route') {
      return;
    }
    if (result === 'obsolete' && matchRef.current) {
      setStatusMessage(getMatchStatusMessage(matchRef.current));
    }
    setRequestStatus('ready');
  }, []);

  const canApplyFailure = useCallback(
    (generation: number, stateRevisionAtStart: number) =>
      mounted.current &&
      matchRef.current?.status !== 'completed' &&
      generation >= latestAppliedGeneration.current &&
      appliedRevision.current === stateRevisionAtStart,
    [],
  );

  const loadMatch = useCallback(
    async (signal: AbortSignal, announceLoading = true) => {
      const generation = ++nextGeneration.current;
      const stateRevisionAtStart = appliedRevision.current;
      if (announceLoading) {
        setRequestStatus('loading');
        setStatusMessage('Loading your battle.');
      }

      try {
        const loaded = await getCpuMatch({
          apiBaseUrl,
          getAccessToken,
          matchId,
          signal,
        });
        if (!signal.aborted) {
          finishMatchResponse(applyMatch(loaded, generation));
        }
      } catch (nextError) {
        if (
          !signal.aborted &&
          canApplyFailure(generation, stateRevisionAtStart)
        ) {
          setError(toMatchError(nextError));
          setRequestStatus('ready');
          queueMicrotask(() => alert.current?.focus());
        }
      }
    },
    [
      apiBaseUrl,
      applyMatch,
      canApplyFailure,
      finishMatchResponse,
      getAccessToken,
      matchId,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    actionRequest.current?.abort();
    actionRequest.current = null;
    matchRef.current = null;
    presentationActive.current = false;
    presentationTarget.current = null;
    latestAppliedGeneration.current = 0;
    appliedRevision.current = 0;
    setMatch(null);
    setPresentedMatch(null);
    setBattleBeats([]);
    setActiveBeatIndex(null);
    setPresentationMode(null);
    setError(null);
    void loadMatch(controller.signal);
    return () => controller.abort();
  }, [loadMatch, revision]);

  async function submitAction(action: CpuMatchIntent) {
    const current = matchRef.current;
    if (
      !current ||
      current.status === 'completed' ||
      requestStatus !== 'ready' ||
      presentationActive.current ||
      error !== null ||
      !(
        current.state.phase === 'initial_selection' ||
        current.state.currentSide === 'player'
      ) ||
      actionRequest.current !== null ||
      !isLegalIntent(current, action)
    ) {
      return;
    }

    const controller = new AbortController();
    actionRequest.current = controller;
    const generation = ++nextGeneration.current;
    const stateRevisionAtStart = appliedRevision.current;
    setError(null);
    setRequestKind('action');
    setRequestStatus('submitting');
    setStatusMessage('Applying your action…');

    try {
      const response = await submitCpuMatchAction({
        action,
        apiBaseUrl,
        expectedVersion: current.version,
        getAccessToken,
        matchId,
        signal: controller.signal,
        submissionId: crypto.randomUUID(),
      });
      if (!controller.signal.aborted) {
        finishMatchResponse(applyMatch(response, generation));
      }
    } catch (nextError) {
      if (controller.signal.aborted) {
        return;
      }
      const matchError = toMatchError(nextError);
      if (
        matchError.failure === 'stale-action' ||
        matchError.failure === 'illegal-action' ||
        matchError.failure === 'completed'
      ) {
        setRequestStatus('reconciling');
        setStatusMessage(
          'The battle changed while you were choosing. Checking the latest battle; your action will not be repeated.',
        );
        const reconciliationGeneration = ++nextGeneration.current;
        try {
          const reconciled = await getCpuMatch({
            apiBaseUrl,
            getAccessToken,
            matchId,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            const result = applyMatch(reconciled, reconciliationGeneration);
            finishMatchResponse(result);
            if (result === 'applied') {
              setStatusMessage(
                'The battle changed while you were choosing. Review the latest available actions before continuing.',
              );
              queueMicrotask(() => phaseHeading.current?.focus());
            }
          }
        } catch (recoveryError) {
          if (!controller.signal.aborted) {
            setError(toMatchError(recoveryError));
            setRequestStatus('ready');
            queueMicrotask(() => alert.current?.focus());
          }
        }
      } else if (canApplyFailure(generation, stateRevisionAtStart)) {
        setError(matchError);
        setRequestStatus('ready');
        setStatusMessage(
          'We could not confirm what happened. Check the latest battle before choosing again.',
        );
        queueMicrotask(() => alert.current?.focus());
      }
    } finally {
      if (actionRequest.current === controller) {
        actionRequest.current = null;
      }
    }
  }

  async function submitForfeit() {
    const current = matchRef.current;
    if (
      !current ||
      current.status === 'completed' ||
      requestStatus !== 'ready' ||
      presentationActive.current ||
      error !== null ||
      actionRequest.current !== null
    ) {
      return;
    }

    const controller = new AbortController();
    actionRequest.current = controller;
    const generation = ++nextGeneration.current;
    const stateRevisionAtStart = appliedRevision.current;
    setError(null);
    setRequestKind('forfeit');
    setRequestStatus('submitting');
    setStatusMessage('Submitting your forfeit…');

    try {
      const response = await forfeitCpuMatch({
        apiBaseUrl,
        expectedVersion: current.version,
        getAccessToken,
        matchId,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        const result = applyMatch(response, generation);
        finishMatchResponse(result);
        if (result === 'applied') {
          setForfeitOpen(false);
          setStatusMessage(getMatchStatusMessage(response));
        }
      }
    } catch (nextError) {
      if (controller.signal.aborted) return;
      const matchError = toMatchError(nextError);
      if (
        matchError.failure === 'stale-action' ||
        matchError.failure === 'completed'
      ) {
        setRequestStatus('reconciling');
        setStatusMessage(
          'The battle changed before the forfeit was confirmed. Checking the saved result…',
        );
        const reconciliationGeneration = ++nextGeneration.current;
        try {
          const reconciled = await getCpuMatch({
            apiBaseUrl,
            getAccessToken,
            matchId,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            const result = applyMatch(reconciled, reconciliationGeneration);
            finishMatchResponse(result);
            if (result === 'applied') setForfeitOpen(false);
          }
        } catch (recoveryError) {
          if (!controller.signal.aborted) {
            setError(toMatchError(recoveryError));
            setRequestStatus('ready');
          }
        }
      } else if (canApplyFailure(generation, stateRevisionAtStart)) {
        setError(matchError);
        setRequestStatus('ready');
        setStatusMessage(
          'The forfeit outcome could not be confirmed. Reload the battle before trying again.',
        );
      }
    } finally {
      if (actionRequest.current === controller) {
        actionRequest.current = null;
      }
    }
  }

  async function startSignIn() {
    setReauthFailed(false);
    try {
      await loginWithRedirect({
        appState: { returnTo: `/matches/${matchId}` },
      });
    } catch {
      setReauthFailed(true);
    }
  }

  if (requestStatus === 'loading' && match === null) {
    return (
      <PageLoadingState
        title="Loading your Practice battle"
        description="Restoring your cards and current turn…"
      />
    );
  }

  if (match === null && error) {
    return (
      <div className="matches-page">
        <MatchErrorState
          error={error}
          onRetry={() => setRevision((value) => value + 1)}
          onSignIn={startSignIn}
          reauthFailed={reauthFailed}
          ref={alert}
        />
      </div>
    );
  }

  if (!match) {
    return null;
  }

  const requestBusy =
    requestStatus === 'submitting' || requestStatus === 'reconciling';
  const presenting = activeBeatIndex !== null;
  const busy = requestBusy || presenting;
  const viewMatch = presentedMatch ?? match;
  const activeBeat = presenting ? (battleBeats[activeBeatIndex] ?? null) : null;
  const activeSide = activeBeat
    ? presentationActor(battleBeats, activeBeat)
    : viewMatch.state.currentSide;
  const phaseTitle = activeBeat
    ? presentationTitle(activeBeat, activeSide, presentationMode)
    : getPhaseTitle(viewMatch);
  const phasePrompt = activeBeat
    ? presentationMessage(activeBeat, presentationMode ?? 'turn')
    : getPhasePrompt(viewMatch);
  const turnIndicator = error
    ? 'SYNC REQUIRED'
    : activeBeat
      ? presentationTurnIndicator(activeSide, presentationMode)
      : getTurnIndicator(viewMatch, requestBusy);
  const selectionPhase =
    viewMatch.state.phase === 'initial_selection' ||
    viewMatch.state.phase === 'replacement';
  const activePlayerCreature = viewMatch.state.player.creatures.find(
    (creature) => creature.id === viewMatch.state.player.activeCreatureId,
  );
  const latestEvents = latestBattleLogEvents(
    viewMatch.battleLog.flatMap((group) => group.events),
  );
  const resolutionEvents = presenting ? battleBeats : latestEvents;
  const resolutionMoments = resolutionEvents.map((event) =>
    cpuResolutionMoment(event, presentationMode),
  );
  const playerFeedback = battleFeedback(activeBeat, 'player');
  const cpuFeedback = battleFeedback(activeBeat, 'cpu');
  const actionLockReason = battleActionLockReason({
    activeSide,
    error: error !== null,
    presentationMode,
    presenting,
    requestStatus,
  });

  return (
    <div
      className={`matches-page battle-page battle-page--${viewMatch.status === 'completed' ? 'completed' : 'live'}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>

      <BattleShellHeader
        backHref="/matches"
        backLabel="Save and exit"
        description={phasePrompt}
        headingRef={phaseHeading}
        mode="Practice"
        opponentLabel="Against CPU"
        title={phaseTitle}
        turnNumber={viewMatch.state.turnNumber}
      />

      <BattleStatusDock
        detail={
          activeBeat
            ? presentationMessage(activeBeat, presentationMode ?? 'turn')
            : practiceStatusDetail(viewMatch, requestBusy, error !== null)
        }
        label={sentenceCaseStatus(turnIndicator)}
        timing={{
          detail: 'Progress saves automatically.',
          label: 'Untimed',
        }}
        tone={
          error
            ? 'danger'
            : viewMatch.status === 'completed'
              ? 'complete'
              : activeSide === 'player' || selectionPhase
                ? 'player'
                : 'opponent'
        }
      />

      {error ? (
        <section
          className="match-inline-alert state-message state-message--error"
          ref={alert}
          role="alert"
          tabIndex={-1}
        >
          <StateIcon tone="error" />
          <strong>
            {requestKind === 'forfeit'
              ? 'Forfeit not confirmed.'
              : 'Action not confirmed.'}
          </strong>{' '}
          {error.failure === 'authorization'
            ? 'Your session expired. Sign in again before continuing.'
            : 'Your last confirmed battle is shown below. Check it before trying another action.'}
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
                Check battle again
              </button>
            )}
          </div>
        </section>
      ) : null}

      {viewMatch.status === 'completed' ? (
        <div className="battle-completed-layout">
          <CompletedMatch match={viewMatch} />
          <BattleSideRail match={viewMatch} />
        </div>
      ) : (
        <div className="battle-live-layout">
          <section
            aria-label="Current battlefield"
            className={`battle-stage battle-stage--${activeSide ?? 'selection'}${presenting ? ' battle-stage--resolving' : ''}`}
          >
            <div aria-hidden="true" className="battle-stage__field-lines" />
            <div className="battle-stage__label">
              <span>Current battlefield</span>
              <strong>
                {selectionPhase
                  ? 'Deployment phase'
                  : activeSide === 'player'
                    ? 'Player initiative'
                    : 'CPU initiative'}
              </strong>
            </div>
            <div className="battle-arena">
              <BattleCombatant
                creature={activePlayerCreature ?? null}
                emptyText={
                  viewMatch.state.phase === 'replacement'
                    ? 'Defeated Creature removed. Choose a replacement.'
                    : 'Choose your initial Creature.'
                }
                heading="You"
                isActing={activeSide === 'player'}
                isDimmed={presenting && activeSide === 'cpu'}
                isEntering={
                  presentationMode === 'opening' &&
                  activeBeat?.kind === 'action' &&
                  activeBeat.side === 'player'
                }
                isResolving={presenting}
                feedbackKey={activeBeat?.id}
                feedbackText={playerFeedback?.label}
                feedbackTone={playerFeedback?.tone}
                visualSide="player"
              />
              <BattleResolution
                activeIndex={activeBeatIndex}
                activeMoment={
                  activeBeat
                    ? cpuResolutionMoment(activeBeat, presentationMode)
                    : null
                }
                heading={
                  presentationMode === 'opening'
                    ? 'Battle opening'
                    : 'Latest resolution'
                }
                moments={resolutionMoments}
              />
              <BattleCombatant
                creature={viewMatch.state.cpu.activeCreature}
                emptyText="The CPU Creature has not been revealed yet."
                heading="CPU"
                isActing={activeSide === 'cpu'}
                isDimmed={presenting && activeSide === 'player'}
                isEntering={
                  presentationMode === 'opening' &&
                  activeBeat?.kind === 'action' &&
                  activeBeat.side === 'cpu'
                }
                isResolving={presenting}
                feedbackKey={activeBeat?.id}
                feedbackText={cpuFeedback?.label}
                feedbackTone={cpuFeedback?.tone}
                visualSide="cpu"
              />
            </div>
          </section>

          <BattleActionPanel
            activeCreatureId={viewMatch.state.player.activeCreatureId}
            busy={busy}
            inputBlocked={
              requestStatus !== 'ready' || presenting || error !== null
            }
            creatures={viewMatch.state.player.creatures}
            currentActor={
              viewMatch.state.phase === 'initial_selection' ||
              viewMatch.state.currentSide === 'player'
            }
            idPrefix="cpu"
            key={`${viewMatch.state.phase}:${activePlayerCreature?.id ?? 'none'}`}
            legalActions={viewMatch.state.legalActions}
            lockReason={actionLockReason}
            onAction={(action) => void submitAction(action)}
            opponentLabel="the CPU"
            phase={
              viewMatch.state.phase === 'completed'
                ? 'active'
                : viewMatch.state.phase
            }
            powerCards={viewMatch.state.player.powerCards}
          />

          <BattleSideRail
            forfeitDisabled={busy || error !== null}
            forfeitTrigger={forfeitTrigger}
            match={viewMatch}
            onForfeit={() => setForfeitOpen(true)}
          />
        </div>
      )}

      {forfeitOpen ? (
        <ResignMatchDialog
          busy={requestStatus === 'submitting' && requestKind === 'forfeit'}
          onCancel={() => setForfeitOpen(false)}
          onConfirm={() => void submitForfeit()}
          opponentLabel="the CPU"
          returnFocusRef={forfeitTrigger}
        />
      ) : null}
    </div>
  );
}

function getMatchStatusMessage(match: CpuMatch) {
  if (match.status === 'completed') {
    return `Battle completed. ${match.winner === 'player' ? 'You won.' : 'The CPU won.'} The result is saved.`;
  }
  if (match.state.phase === 'replacement') {
    return 'Your Creature was defeated. Choose an available replacement.';
  }
  if (match.state.phase === 'initial_selection') {
    return 'Choose your first Creature.';
  }
  return match.state.currentSide === 'player'
    ? 'Your turn. Choose an available action.'
    : 'The CPU is taking its turn.';
}

function BattleSideRail({
  forfeitDisabled = false,
  forfeitTrigger,
  match,
  onForfeit,
}: {
  forfeitDisabled?: boolean;
  forfeitTrigger?: RefObject<HTMLButtonElement | null>;
  match: CpuMatch;
  onForfeit?: () => void;
}) {
  return (
    <aside
      aria-label="Battle activity and controls"
      className="battle-side-rail"
    >
      <header className="battle-side-rail__heading">
        <h2>Activity</h2>
      </header>

      <BattleLog groups={match.battleLog} />

      {match.state.phase !== 'initial_selection' &&
      match.state.phase !== 'replacement' ? (
        <BattleBench
          creatures={match.state.player.creatures}
          activeCreatureId={match.state.player.activeCreatureId}
        />
      ) : null}
      <CpuReserveSummary match={match} />
      {match.status === 'active' && onForfeit ? (
        <button
          aria-label="Forfeit battle"
          className="battle-side-rail__forfeit"
          disabled={forfeitDisabled}
          onClick={onForfeit}
          ref={forfeitTrigger}
          type="button"
        >
          <Flag aria-hidden="true" size={17} /> Forfeit
        </button>
      ) : null}
    </aside>
  );
}

function BattleLog({ groups }: { groups: CpuMatch['battleLog'] }) {
  const body = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const events = groups.flatMap((group) => group.events);
  const latest = latestBattleLogEvents(events);
  const latestId = events.at(-1)?.id ?? 'empty';

  const scrollToLatest = useCallback(() => {
    const container = body.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToLatest();
  }, [latestId, scrollToLatest]);

  return (
    <details
      className="battle-log battle-rail-card"
      open={open}
      onKeyDown={closeDisclosureOnEscape}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) queueMicrotask(scrollToLatest);
      }}
    >
      <summary>
        <span className="battle-log__summary-label">
          Latest
          <strong>
            <span aria-hidden="true">{events.length}</span>
            <span className="sr-only">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </span>
          </strong>
        </span>
        <span className="battle-log__preview">
          {latest.length > 0
            ? latest.map(({ message }) => battleLogMessage(message)).join(' ')
            : 'No actions yet.'}
        </span>
        <CaretDown
          className="battle-log__toggle"
          aria-hidden="true"
          size={16}
        />
      </summary>

      <div
        aria-label="Complete battle activity"
        aria-live="polite"
        aria-relevant="additions"
        className="battle-log__body"
        ref={body}
        role="log"
        tabIndex={0}
      >
        {groups.length === 0 ? (
          <div className="battle-log-empty">
            <strong>No actions recorded yet</strong>
            <span>Your battle history begins with the first choice.</span>
          </div>
        ) : (
          <ol className="battle-log__groups">
            {groups.map((group) => (
              <li className="battle-log__group" key={group.id}>
                <h3>{group.label}</h3>
                <ol>
                  {battleLogRows(group.events).map((event) => (
                    <li
                      className={`battle-log__event battle-log__event--${event.kind} battle-log__event--${event.side ?? 'neutral'}`}
                      key={event.id}
                    >
                      {battleLogMessage(event.message)}
                      {event.effects.length > 0 && (
                        <span className="battle-log__effects">
                          {event.effects.map((effect) => (
                            <BattleLogEffect
                              key={effect.id}
                              message={effect.message}
                            />
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

function latestBattleLogEvents(events: readonly BattleLogEvent[]) {
  const sequence = events.at(-1)?.sequence;
  if (sequence === undefined) return [];

  const current = events.filter((event) => event.sequence === sequence);
  const action = current.find((event) => event.kind === 'action');
  const outcome = current.find(
    (event) => event.kind !== 'action' && event.kind !== 'turn',
  );
  return [action, outcome].filter(
    (event): event is BattleLogEvent => event !== undefined,
  );
}

function newBattleLogEvents(current: CpuMatch, next: CpuMatch) {
  const currentIds = new Set(
    current.battleLog.flatMap((group) => group.events.map((event) => event.id)),
  );
  return next.battleLog
    .flatMap((group) => group.events)
    .filter((event) => !currentIds.has(event.id));
}

function orderPresentationBeats(
  events: readonly BattleLogEvent[],
  mode: PresentationMode,
) {
  if (mode !== 'opening') return [...events];

  const cpuEntrance = events.find(
    (event) =>
      event.side === 'cpu' &&
      event.kind === 'action' &&
      /\b(?:revealed|sent out)\b/iu.test(event.message),
  );
  const playerEntrance = events.find(
    (event) =>
      event.side === 'player' &&
      event.kind === 'action' &&
      /\b(?:selected|sent out)\b/iu.test(event.message),
  );
  const entrances = [cpuEntrance, playerEntrance].filter(
    (event): event is BattleLogEvent => event !== undefined,
  );
  const entranceIds = new Set(entrances.map((event) => event.id));
  return [
    ...entrances,
    ...events.filter((event) => !entranceIds.has(event.id)),
  ];
}

function presentationMessage(event: BattleLogEvent, mode: PresentationMode) {
  if (mode === 'opening') {
    const cpuName = /^CPU (?:revealed|sent out) (.+)\.$/u.exec(
      event.message,
    )?.[1];
    if (cpuName) return `Opponent sent out ${cpuName}!`;

    const playerName = /^Player (?:selected|sent out) (.+)\.$/u.exec(
      event.message,
    )?.[1];
    if (playerName) return `Go, ${playerName}!`;
  }
  return battleLogMessage(event.message);
}

function presentationBeatDelay(event: BattleLogEvent, mode: PresentationMode) {
  if (prefersReducedMotion()) return 1_000;
  if (mode === 'opening') return 1_800;
  if (event.kind === 'defeat' || event.kind === 'result') return 1_900;
  if (event.kind === 'action') return 1_700;
  return 1_600;
}

function presentationActor(
  events: readonly BattleLogEvent[],
  activeEvent: BattleLogEvent,
) {
  return (
    events.find(
      (event) =>
        event.sequence === activeEvent.sequence && event.kind === 'action',
    )?.side ?? activeEvent.side
  );
}

function presentationTitle(
  event: BattleLogEvent,
  actor: 'cpu' | 'player' | null,
  mode: PresentationMode | null,
) {
  if (mode === 'opening') {
    return actor === 'cpu'
      ? 'Opponent sends out a Creature'
      : 'Your Creature enters battle';
  }
  if (event.kind === 'defeat') return 'A Creature was defeated';
  return actor === 'cpu' ? 'CPU move' : 'Your move';
}

function presentationTurnIndicator(
  actor: 'cpu' | 'player' | null,
  mode: PresentationMode | null,
) {
  if (mode === 'opening') return 'BATTLE OPENING';
  return actor === 'cpu' ? 'CPU IS MOVING' : 'YOUR MOVE';
}

function battleActionLockReason({
  activeSide,
  error,
  presentationMode,
  presenting,
  requestStatus,
}: {
  activeSide: 'cpu' | 'player' | null;
  error: boolean;
  presentationMode: PresentationMode | null;
  presenting: boolean;
  requestStatus: RequestStatus;
}) {
  if (error) return 'Check the latest battle before acting';
  if (requestStatus === 'submitting') return 'Confirming your move…';
  if (requestStatus === 'reconciling') return 'Checking the battle…';
  if (presenting && presentationMode === 'opening') return 'Battle opening…';
  if (presenting)
    return activeSide === 'cpu' ? 'CPU is moving…' : 'Your move is resolving…';
  if (activeSide === 'cpu') return 'CPU is choosing…';
  return undefined;
}

function applyPresentationBeat(
  current: CpuMatch,
  target: CpuMatch,
  event: BattleLogEvent,
  futureEvents: readonly BattleLogEvent[],
) {
  const next = structuredClone(current);
  const entrance =
    event.kind === 'action' &&
    /\b(?:selected|revealed|sent out)\b/iu.test(event.message);

  if (entrance && event.side === 'cpu') {
    next.state.cpu.activeCreature = target.state.cpu.activeCreature
      ? reconstructCreatureBeforeEvents(
          target.state.cpu.activeCreature,
          'cpu',
          futureEvents,
        )
      : null;
    next.state.selections.cpu = target.state.selections.cpu;
  }
  if (entrance && event.side === 'player') {
    next.state.player.activeCreatureId = target.state.player.activeCreatureId;
    next.state.selections.player = target.state.selections.player;
  }

  const stat = battleLogStat(event.message);
  if (stat && event.side) {
    updateActiveCreature(next, event.side, (creature) => {
      const signedValue =
        Number(stat.value) * (stat.direction === 'up' ? 1 : -1);
      if (stat.resource === 'HP') {
        creature.currentHp = Math.min(
          creature.maxHp,
          Math.max(0, creature.currentHp + signedValue),
        );
      } else {
        creature.remainingPower = Math.min(
          creature.maxPower,
          Math.max(0, creature.remainingPower + signedValue),
        );
      }
    });
  }

  if (
    event.side &&
    (event.kind === 'effect_expired' ||
      /\bgained Damage\b/iu.test(event.message))
  ) {
    const targetCreature = activeCreature(target, event.side);
    if (targetCreature) {
      updateActiveCreature(next, event.side, (creature) => {
        creature.activeModifiers = structuredClone(
          targetCreature.activeModifiers,
        );
      });
    }
  }

  if (event.kind === 'defeat' && event.side) {
    updateActiveCreature(next, event.side, (creature) => {
      creature.currentHp = 0;
      creature.defeated = true;
    });
  }

  return next;
}

function activeCreature(match: CpuMatch, side: 'cpu' | 'player') {
  if (side === 'cpu') return match.state.cpu.activeCreature;
  return match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );
}

function reconstructCreatureBeforeEvents(
  target: CpuMatch['state']['player']['creatures'][number],
  side: 'cpu' | 'player',
  events: readonly BattleLogEvent[],
) {
  const creature = structuredClone(target);
  creature.activeModifiers = [];
  creature.defeated = false;
  for (const event of [...events].reverse()) {
    if (event.side !== side) continue;
    const stat = battleLogStat(event.message);
    if (!stat) continue;
    const signedValue = Number(stat.value) * (stat.direction === 'up' ? -1 : 1);
    if (stat.resource === 'HP') {
      creature.currentHp = Math.min(
        creature.maxHp,
        Math.max(0, creature.currentHp + signedValue),
      );
    } else {
      creature.remainingPower = Math.min(
        creature.maxPower,
        Math.max(0, creature.remainingPower + signedValue),
      );
    }
  }
  return creature;
}

function updateActiveCreature(
  match: CpuMatch,
  side: 'cpu' | 'player',
  update: (creature: CpuMatch['state']['player']['creatures'][number]) => void,
) {
  const creature = activeCreature(match, side);
  if (creature) update(creature);
}

function cpuResolutionMoment(
  event: BattleLogEvent,
  mode: PresentationMode | null,
): BattleResolutionMoment {
  const stat = battleLogStat(event.message);
  return {
    id: event.id,
    message: presentationMessage(event, mode ?? 'turn'),
    stat: stat
      ? {
          direction: stat.direction,
          resource: stat.resource === 'HP' ? 'HP' : 'Power',
          value: stat.value,
        }
      : null,
    tone: battleEventTone(event),
  };
}

function battleEventTone(event: BattleLogEvent): BattleFeedbackTone {
  const modifier = /\bgained Damage ([+−-]\d+%)/u.exec(event.message)?.[1];
  if (modifier?.startsWith('+')) return 'buff';
  if (modifier) return 'debuff';
  const stat = battleLogStat(event.message);
  if (stat?.direction === 'up') return 'heal';
  if (/\bspent\b/iu.test(event.message)) return 'cost';
  if (stat?.direction === 'down') return 'damage';
  if (event.kind === 'defeat') return 'defeat';
  if (event.kind === 'action') return 'action';
  return 'status';
}

function battleFeedback(event: BattleLogEvent | null, side: 'player' | 'cpu') {
  if (!event || event.side !== side) return undefined;
  const stat = battleLogStat(event.message);
  const tone = battleEventTone(event);
  if (stat) {
    return {
      label: `${stat.direction === 'up' ? '+' : '−'}${stat.value} ${stat.resource}`,
      tone,
    };
  }
  const modifier = /\bgained Damage ([+−-]\d+%)/u.exec(event.message)?.[1];
  if (modifier) return { label: `Damage ${modifier}`, tone };
  if (event.kind === 'defeat') return { label: 'Defeated', tone };
  if (event.kind === 'action') {
    return { label: side === 'player' ? 'Your move' : 'CPU move', tone };
  }
  return { label: 'Effect applied', tone };
}

function CpuReserveSummary({ match }: { match: CpuMatch }) {
  const creatures = match.state.cpu.remainingCreatureCount;
  const powerCards = match.state.cpu.remainingPowerCardCount;

  return (
    <details className="battle-rail-card cpu-reserve">
      <summary>
        <span>CPU reserve</span>
        <strong>
          <span aria-hidden="true">
            {creatures} · {powerCards} Power
          </span>
          <span className="sr-only">
            {creatures} Creature{creatures === 1 ? '' : 's'} and {powerCards}{' '}
            Power cards
          </span>
        </strong>
      </summary>
      <p>Unplayed CPU cards stay hidden until they are revealed in battle.</p>
    </details>
  );
}

function CompletedMatch({ match }: { match: CpuMatch }) {
  const playerWon = match.winner === 'player';
  return (
    <BattleOutcomePanel
      action={
        <Link className="button" href="/matches">
          Play another battle
        </Link>
      }
      facts={[
        {
          label: 'Winner',
          value: match.winner ? sideLabel(match.winner) : 'Not returned',
        },
        { label: 'Final turn', value: match.state.turnNumber },
        {
          label: 'Completed',
          value: match.completedAt
            ? formatDate(match.completedAt)
            : 'Not returned',
        },
      ]}
      mode="Practice"
      summary={
        playerWon
          ? 'You defeated the CPU. This result is saved in your battle history.'
          : 'The CPU won this battle. This result is saved in your battle history.'
      }
      title={playerWon ? 'Practice victory' : 'Practice complete'}
      titleId="completed-match-title"
      tone={playerWon ? 'victory' : 'defeat'}
    >
      <details className="completed-match__context">
        <summary>About this result</summary>
        <p>
          Review every confirmed turn here or return to it from Battle history.
        </p>
      </details>
    </BattleOutcomePanel>
  );
}

function isLegalIntent(match: CpuMatch, intent: CpuMatchIntent) {
  return match.state.legalActions.some((legal) => sameIntent(legal, intent));
}

function sameIntent(left: CpuMatchIntent, right: CpuMatchIntent) {
  if (left.type !== right.type) return false;
  if ('creatureId' in left && 'creatureId' in right)
    return left.creatureId === right.creatureId;
  if ('moveId' in left && 'moveId' in right)
    return left.moveId === right.moveId;
  if ('powerCardId' in left && 'powerCardId' in right)
    return left.powerCardId === right.powerCardId;
  return false;
}

function getPhaseTitle(match: CpuMatch) {
  if (match.status === 'completed')
    return match.winner === 'player' ? 'Battle won' : 'Battle complete';
  if (match.state.phase === 'initial_selection')
    return 'Choose your opening Creature';
  if (match.state.phase === 'replacement') return 'Replacement required';
  return match.state.currentSide === 'player'
    ? 'Your turn'
    : 'CPU turn resolving';
}

function getTurnIndicator(match: CpuMatch, busy: boolean) {
  if (match.status === 'completed') return 'Completed';
  if (busy) return 'PROCESSING YOUR ACTION…';
  if (
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement'
  ) {
    return match.state.legalActions.length > 0
      ? 'YOUR TURN'
      : "OPPONENT'S TURN";
  }
  return match.state.currentSide === 'player' &&
    match.state.legalActions.length > 0
    ? 'YOUR TURN'
    : "OPPONENT'S TURN";
}

function getPhasePrompt(match: CpuMatch) {
  if (match.state.phase === 'initial_selection') return null;
  if (match.state.phase === 'replacement') {
    return 'Your active Creature was defeated. Choose an available replacement.';
  }
  if (match.status !== 'completed' && match.state.currentSide === 'cpu') {
    return 'Your actions will be available after the CPU acts.';
  }
  return null;
}

function sideLabel(side: 'cpu' | 'player') {
  return side === 'player' ? 'You' : 'CPU';
}

function sentenceCaseStatus(value: string | null) {
  if (!value) return 'Battle ready';
  return value
    .toLocaleLowerCase()
    .replace(/^./u, (character) => character.toLocaleUpperCase());
}

function practiceStatusDetail(
  match: CpuMatch,
  busy: boolean,
  hasError: boolean,
) {
  if (hasError) return 'Reload the latest confirmed state before acting.';
  if (busy) return 'Your choice is being confirmed.';
  if (match.status === 'completed') return 'The result is saved.';
  if (match.state.phase === 'replacement')
    return 'Choose an available replacement Creature.';
  if (match.state.phase === 'initial_selection')
    return 'Choose your opening Creature.';
  return match.state.currentSide === 'player'
    ? 'Choose one available action.'
    : 'Your actions return after the CPU acts.';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function closeDisclosureOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== 'Escape' || !event.currentTarget.open) return;
  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector('summary')?.focus();
}

function toMatchError(error: unknown) {
  return error instanceof MatchApiError
    ? error
    : new MatchApiError('unavailable');
}

function BattleLogEffect({ message }: { message: string }) {
  const stat = battleLogStat(message);
  if (!stat) return <span>{battleLogMessage(message)}</span>;
  const Direction = stat.direction === 'up' ? ArrowUp : ArrowDown;
  const Resource = stat.resource === 'HP' ? Heart : Lightning;
  return (
    <span className={`battle-log__stat battle-log__stat--${stat.direction}`}>
      <span className="sr-only">{battleLogMessage(message)}</span>
      <span aria-hidden="true" className="battle-log__stat-visual">
        <span>{stat.creature}</span>
        <span className="battle-log__stat-value">
          <Resource size={15} weight="fill" />
          <Direction size={14} weight="bold" />
          {stat.value} {stat.resource}
        </span>
      </span>
    </span>
  );
}
