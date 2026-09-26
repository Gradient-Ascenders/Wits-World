import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Flag,
  Lightning,
  Heart,
  CaretDown,
  Sparkle,
  Sword,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
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
  type BattleFeedbackTone,
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

export default function CpuMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<MatchRouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [match, setMatch] = useState<CpuMatch | null>(null);
  const [error, setError] = useState<MatchApiError | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Loading your battle.');
  const [requestKind, setRequestKind] = useState<RequestKind>('action');
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [battleBeats, setBattleBeats] = useState<BattleLogEvent[]>([]);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [reauthFailed, setReauthFailed] = useState(false);
  const mounted = useRef(true);
  const routeMatchId = useRef(matchId);
  const matchRef = useRef<CpuMatch | null>(null);
  const nextGeneration = useRef(0);
  const latestAppliedGeneration = useRef(0);
  const appliedRevision = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const phaseHeading = useRef<HTMLHeadingElement | null>(null);
  const alert = useRef<HTMLElement | null>(null);
  const forfeitTrigger = useRef<HTMLButtonElement | null>(null);

  routeMatchId.current = matchId;

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

      if (newEvents.length > 0) {
        const visibleBeats = newEvents.filter((event) => event.kind !== 'turn');
        const nextBeats = visibleBeats.length > 0 ? visibleBeats : newEvents;
        setBattleBeats(nextBeats);
        setActiveBeatIndex(0);
        setStatusMessage(
          nextBeats.map((event) => battleLogMessage(event.message)).join(' '),
        );
      } else {
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
    const timeout = window.setTimeout(
      () => {
        setActiveBeatIndex((current) =>
          current !== null && current + 1 < battleBeats.length
            ? current + 1
            : null,
        );
      },
      prefersReducedMotion() ? 120 : 900,
    );
    return () => window.clearTimeout(timeout);
  }, [activeBeatIndex, battleBeats.length]);

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
    latestAppliedGeneration.current = 0;
    appliedRevision.current = 0;
    setMatch(null);
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

  const busy =
    requestStatus === 'submitting' || requestStatus === 'reconciling';
  const phaseTitle = getPhaseTitle(match);
  const phasePrompt = getPhasePrompt(match);
  const turnIndicator = error ? 'SYNC REQUIRED' : getTurnIndicator(match, busy);
  const selectionPhase =
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement';
  const activePlayerCreature = match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );
  const activeBeat =
    activeBeatIndex === null ? null : (battleBeats[activeBeatIndex] ?? null);
  const latestEvents = latestBattleLogEvents(
    match.battleLog.flatMap((group) => group.events),
  );
  const resolutionEvents = battleBeats.length > 0 ? battleBeats : latestEvents;
  const playerFeedback = battleFeedback(activeBeat, 'player');
  const cpuFeedback = battleFeedback(activeBeat, 'cpu');

  return (
    <div
      className={`matches-page battle-page battle-page--${match.status === 'completed' ? 'completed' : 'live'}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>

      <BattleShellHeader
        action={
          match.status === 'active' ? (
            <button
              className="battle-forfeit-trigger"
              disabled={busy || error !== null}
              onClick={() => setForfeitOpen(true)}
              ref={forfeitTrigger}
              type="button"
            >
              <Flag aria-hidden="true" size={18} /> Forfeit battle
            </button>
          ) : null
        }
        backHref="/matches"
        backLabel="Save and exit"
        description={phasePrompt}
        headingRef={phaseHeading}
        mode="Practice"
        opponentLabel="Against CPU"
        title={phaseTitle}
        turnNumber={match.state.turnNumber}
      />

      <BattleStatusDock
        detail={practiceStatusDetail(match, busy, error !== null)}
        label={sentenceCaseStatus(turnIndicator)}
        timing={{
          detail: 'Leave now and continue from the latest confirmed state.',
          label: 'No turn timer',
        }}
        tone={
          error
            ? 'danger'
            : match.status === 'completed'
              ? 'complete'
              : match.state.currentSide === 'player' || selectionPhase
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

      {match.status === 'completed' ? (
        <div className="battle-completed-layout">
          <CompletedMatch match={match} />
          <BattleSideRail match={match} />
        </div>
      ) : (
        <div className="battle-live-layout">
          <section
            aria-label="Current battlefield"
            className={`battle-stage battle-stage--${match.state.currentSide ?? 'selection'}`}
          >
            <div aria-hidden="true" className="battle-stage__field-lines" />
            <div className="battle-stage__label">
              <span>Current battlefield</span>
              <strong>
                {selectionPhase
                  ? 'Deployment phase'
                  : match.state.currentSide === 'player'
                    ? 'Player initiative'
                    : 'CPU initiative'}
              </strong>
            </div>
            <div className="battle-arena">
              <BattleCombatant
                creature={activePlayerCreature ?? null}
                emptyText={
                  match.state.phase === 'replacement'
                    ? 'Defeated Creature removed. Choose a replacement.'
                    : 'Choose your initial Creature.'
                }
                heading="You"
                isActing={match.state.currentSide === 'player'}
                feedbackKey={activeBeat?.id}
                feedbackText={playerFeedback?.label}
                feedbackTone={playerFeedback?.tone}
                visualSide="player"
              />
              <BattleResolution
                activeEventId={activeBeat?.id}
                events={resolutionEvents}
              />
              <BattleCombatant
                creature={match.state.cpu.activeCreature}
                emptyText="The CPU Creature has not been revealed yet."
                heading="CPU"
                isActing={match.state.currentSide === 'cpu'}
                feedbackKey={activeBeat?.id}
                feedbackText={cpuFeedback?.label}
                feedbackTone={cpuFeedback?.tone}
                visualSide="cpu"
              />
            </div>
          </section>

          <BattleActionPanel
            activeCreatureId={match.state.player.activeCreatureId}
            busy={busy}
            inputBlocked={requestStatus !== 'ready' || error !== null}
            creatures={match.state.player.creatures}
            currentActor={
              match.state.phase === 'initial_selection' ||
              match.state.currentSide === 'player'
            }
            idPrefix="cpu"
            key={`${match.state.phase}:${activePlayerCreature?.id ?? 'none'}`}
            legalActions={match.state.legalActions}
            onAction={(action) => void submitAction(action)}
            opponentLabel="the CPU"
            phase={
              match.state.phase === 'completed' ? 'active' : match.state.phase
            }
            powerCards={match.state.player.powerCards}
          />

          <BattleSideRail match={match} />
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

function BattleSideRail({ match }: { match: CpuMatch }) {
  return (
    <aside
      aria-label="Battle activity and details"
      className="battle-side-rail"
    >
      <header className="battle-side-rail__heading">
        <div>
          <h2>Battle activity</h2>
          <p>Review confirmed turns and your remaining cards.</p>
        </div>
        <Link
          aria-label="Match history"
          className="battle-side-rail__history"
          href="/matches/history"
        >
          Full history <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </header>

      <BattleLog groups={match.battleLog} />

      {match.state.phase !== 'initial_selection' &&
      match.state.phase !== 'replacement' ? (
        <BattleBench
          creatures={match.state.player.creatures}
          activeCreatureId={match.state.player.activeCreatureId}
        />
      ) : null}
      <BattleDetails match={match} />
      <CpuReserveSummary match={match} />
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
          Battle activity
          <strong>
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </strong>
        </span>
        <span className="battle-log__preview">
          {latest.length > 0
            ? latest.map(({ message }) => battleLogMessage(message)).join(' ')
            : 'No actions recorded yet.'}
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

function BattleResolution({
  activeEventId,
  events,
}: {
  activeEventId?: string;
  events: readonly BattleLogEvent[];
}) {
  const visible = events.slice(-3);
  return (
    <section
      aria-label="Latest battle resolution"
      className="battle-resolution"
    >
      <div className="battle-resolution__heading">
        <strong>Latest resolution</strong>
        <span>
          {visible.length > 0 ? 'Server confirmed' : 'Awaiting action'}
        </span>
      </div>
      {visible.length > 0 ? (
        <ol>
          {visible.map((event) => {
            const stat = battleLogStat(event.message);
            const tone = battleEventTone(event);
            const Icon =
              tone === 'heal'
                ? Heart
                : tone === 'damage' || tone === 'cost'
                  ? Sword
                  : Sparkle;
            return (
              <li
                className={event.id === activeEventId ? 'is-active' : undefined}
                data-tone={tone}
                key={event.id}
              >
                <Icon aria-hidden="true" size={16} weight="bold" />
                <span>{battleLogMessage(event.message)}</span>
                {stat ? (
                  <strong>
                    {stat.direction === 'up' ? '+' : '−'}
                    {stat.value} {stat.resource}
                  </strong>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>Your first confirmed action will appear here.</p>
      )}
    </section>
  );
}

function battleEventTone(event: BattleLogEvent): BattleFeedbackTone {
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
  if (event.kind === 'defeat') return { label: 'Defeated', tone };
  if (event.kind === 'action') {
    return { label: side === 'player' ? 'Your move' : 'CPU move', tone };
  }
  return { label: 'Effect applied', tone };
}

function BattleDetails({ match }: { match: CpuMatch }) {
  return (
    <details
      className="battle-details battle-rail-card"
      onKeyDown={closeDisclosureOnEscape}
    >
      <summary>
        <span>Battle details</span>
        <strong>Turn {match.state.turnNumber}</strong>
      </summary>
      <div className="battle-details__panel">
        <dl className="battle-meta">
          <div>
            <dt>Status</dt>
            <dd>
              {match.status === 'completed' ? 'Completed' : 'In progress'}
            </dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDate(match.startedAt)}</dd>
          </div>
          <div data-tone={match.state.turnDeadline ? 'timing' : undefined}>
            <dt>Turn deadline</dt>
            <dd>
              {match.state.turnDeadline
                ? formatDate(match.state.turnDeadline)
                : 'Not returned'}
            </dd>
          </div>
        </dl>
        <p>{getPhaseDescription(match)}</p>
      </div>
    </details>
  );
}

function CpuReserveSummary({ match }: { match: CpuMatch }) {
  const creatures = match.state.cpu.remainingCreatureCount;
  const powerCards = match.state.cpu.remainingPowerCardCount;

  return (
    <details className="battle-rail-card cpu-reserve">
      <summary>
        <span>CPU reserve</span>
        <strong>
          {creatures} Creature{creatures === 1 ? '' : 's'} · {powerCards} Power
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

function getPhaseDescription(match: CpuMatch) {
  if (match.status === 'completed')
    return 'This result is saved in Battle history.';
  if (match.state.phase === 'initial_selection')
    return 'Choose an available Creature to begin.';
  if (match.state.phase === 'replacement')
    return 'Choose an available replacement. This does not use your next normal turn.';
  if (match.state.turnDeadline)
    return `Play before ${formatDate(match.state.turnDeadline)}. A late choice may not be accepted.`;
  return 'Waiting for the next battle update.';
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
