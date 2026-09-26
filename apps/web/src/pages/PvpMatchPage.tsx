import { StateIcon } from '../components/StatusMessage';
import { PageLoadingState } from '../components/LoadingState';
import { useAuth0 } from '@auth0/auth0-react';
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
} from '../api/pvp';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
  type BattleActionIntent,
} from '../components/matches/BattlePresentation';
import {
  BattleOutcomePanel,
  BattleShellHeader,
  BattleStatusDock,
} from '../components/matches/BattleShell';
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

export default function PvpMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<RouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [match, setMatch] = useState<AsyncPvpMatch | null>(null);
  const [error, setError] = useState<PvpApiError | null>(null);
  const [pollWarning, setPollWarning] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading');
  const [statusMessage, setStatusMessage] = useState(
    'Loading your player battle.',
  );
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
      setStatusMessage(matchStatusMessage(next));
      if (turnChanged) queueMicrotask(() => phaseHeading.current?.focus());
      return true;
    },
    [],
  );

  const refreshMatch = useCallback(
    async (options: { announce?: boolean; poll?: boolean } = {}) => {
      if (refreshRequest.current || mutation.current) return;
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
    appliedGeneration.current = 0;
    generation.current = 0;
    pollFailures.current = 0;
    setMatch(null);
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
    if (match?.status !== 'active' || match.currentActor !== 'opponent') return;
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
  }, [match?.currentActor, match?.status, refreshMatch]);

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
        setStatusMessage(
          'That action could not be confirmed. Checking the latest battle before you can act again…',
        );
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
              setStatusMessage(
                'The battle did not change. You can retry the same action without risking a duplicate.',
              );
            } else {
              setStatusMessage(
                'Battle updated. Review whose turn it is and the actions now available.',
              );
            }
          }
        } catch (recoveryError) {
          if (!controller.signal.aborted) setError(toPvpError(recoveryError));
        }
      } else {
        setError(parsed);
        setStatusMessage(
          'The action was not applied. The visible state remains unchanged.',
        );
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
        setStatusMessage(
          'The battle is still active. You can retry the same forfeit without recording it twice.',
        );
      } else {
        setStatusMessage(
          reconciled.status === 'completed'
            ? matchStatusMessage(reconciled)
            : 'Battle updated. Review it before choosing whether to forfeit.',
        );
      }
    } catch (recoveryError) {
      if (controller.signal.aborted) return;
      setResignationRecovery({ ...recovery, stage: 'check' });
      setError(toPvpError(recoveryError));
      setErrorContext('resignation');
      setStatusMessage(
        'The latest battle result could not be confirmed. Check again before retrying the forfeit.',
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
    setStatusMessage('Checking whether the forfeit was recorded…');
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
      mutation.current
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
    setStatusMessage('Recording your forfeit…');
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
        setStatusMessage(
          'We could not confirm the result. Checking the battle before you can try again…',
        );
        await reconcileResignation(recovery, controller);
      } else {
        setError(parsed);
        setErrorContext('resignation');
        setStatusMessage(
          'The forfeit was not recorded. You can continue from the battle shown.',
        );
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
        title="Loading your Player Battle"
        description="Restoring the current turn, deadline, and available actions…"
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
            Player Battle could not load
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
            <p role="alert">Sign-in could not start. Please try again.</p>
          ) : null}
        </section>
      </div>
    );
  }

  if (!match) return null;
  const busy =
    requestStatus === 'submitting' || requestStatus === 'reconciling';
  const selfCreature =
    match.state.self.creatures.find(
      (creature) => creature.id === match.state.self.activeCreatureId,
    ) ?? null;

  return (
    <div
      className={`matches-page battle-page pvp-battle-page battle-page--${match.status === 'completed' ? 'completed' : 'live'}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>
      <BattleShellHeader
        backHref="/matches/pvp"
        backLabel="Player Battles"
        description={
          match.status === 'active'
            ? 'Take your turn within 24 hours. Leaving this page does not pause the deadline.'
            : 'This result is saved in Battle history.'
        }
        headingRef={phaseHeading}
        mode="Player Battle"
        opponentLabel={`Against ${match.opponent.playerName}`}
        title={phaseTitle(match)}
        turnNumber={match.state.turnNumber}
      />

      <BattleStatusDock
        detail={playerBattleStatusDetail(
          match,
          busy,
          error !== null,
          countdown.expired,
        )}
        label={
          busy
            ? 'Processing your action'
            : error || (countdown.expired && match.status === 'active')
              ? 'Sync required'
              : match.status === 'completed'
                ? 'Battle complete'
                : match.currentActor === 'self' && match.legalActions.length > 0
                  ? 'Your turn'
                  : "Opponent's turn"
        }
        timing={
          match.status === 'active'
            ? {
                detail: `Play by ${formatDate(match.turnDeadline!)}`,
                label: countdown.expired ? 'Deadline reached' : countdown.label,
                tone: countdown.expired ? 'danger' : undefined,
              }
            : undefined
        }
        tone={
          error || countdown.expired
            ? 'danger'
            : match.status === 'completed'
              ? 'complete'
              : match.currentActor === 'self'
                ? 'player'
                : 'opponent'
        }
      />

      {pollWarning ? (
        <div className="pvp-poll-warning" role="status">
          <span>
            We could not check whether your opponent moved. Your last confirmed
            battle is shown.
          </span>
          <button
            className="button button--quiet"
            disabled={requestStatus === 'reconciling'}
            aria-busy={requestStatus === 'reconciling'}
            onClick={() => void refreshMatch({ announce: true })}
            type="button"
          >
            {requestStatus === 'reconciling'
              ? 'Checking updates…'
              : 'Retry now'}
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
          {errorMessage(error, errorContext)}
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
                Retry same forfeit safely
              </button>
            ) : resignationRecovery?.stage === 'check' ? (
              <button
                className="button"
                disabled={busy}
                onClick={() => void checkResignationState(resignationRecovery)}
                type="button"
              >
                Check battle result
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
                Retry same action safely
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
                Check battle again
              </button>
            )}
          </div>
        </div>
      ) : null}

      {match.status === 'completed' ? (
        <div className="battle-completed-layout">
          <CompletedPvpMatch match={match} />
          <PvpSideRail match={match} />
        </div>
      ) : (
        <div className="battle-live-layout">
          <section
            aria-label="Current battlefield"
            className={`battle-stage battle-stage--${match.currentActor === 'self' ? 'player' : 'cpu'}`}
          >
            <div aria-hidden="true" className="battle-stage__field-lines" />
            <div className="battle-stage__label">
              <span>Current battlefield</span>
              <strong>
                {match.currentActor === 'self'
                  ? 'Your initiative'
                  : `${match.opponent.playerName} to act`}
              </strong>
            </div>
            <div className="battle-arena">
              <BattleCombatant
                creature={selfCreature}
                emptyText="Choose a replacement for your defeated Creature."
                heading="You"
                isActing={match.currentActor === 'self'}
                visualSide="player"
              />
              <div aria-hidden="true" className="battle-versus">
                VS
              </div>
              <BattleCombatant
                creature={match.state.opponent.activeCreature}
                emptyText="Your opponent’s Creature has not been revealed yet."
                heading={match.opponent.playerName}
                isActing={match.currentActor === 'opponent'}
                visualSide="cpu"
              />
            </div>
          </section>

          <BattleActionPanel
            activeCreatureId={match.state.self.activeCreatureId}
            busy={busy}
            inputBlocked={
              requestStatus !== 'ready' || error !== null || countdown.expired
            }
            creatures={match.state.self.creatures}
            currentActor={match.currentActor === 'self'}
            idPrefix="pvp"
            key={`${match.state.phase}:${selfCreature?.id ?? 'none'}`}
            legalActions={match.legalActions}
            onAction={(action) => {
              const pvpAction = toPvpAction(action);
              if (pvpAction) void submitAction(pvpAction);
            }}
            opponentLabel={match.opponent.playerName}
            phase={
              match.state.phase === 'completed' ? 'active' : match.state.phase
            }
            powerCards={match.state.self.powerCards}
          />

          <PvpSideRail
            busy={busy}
            forfeitPending={
              requestStatus === 'submitting' && errorContext === 'resignation'
            }
            match={match}
            onResign={() => setConfirmingResignation(true)}
            resignTrigger={resignTrigger}
          />
        </div>
      )}
      {confirmingResignation && match.canResign ? (
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
  forfeitPending = false,
  match,
  onResign,
  resignTrigger,
}: {
  busy?: boolean;
  forfeitPending?: boolean;
  match: AsyncPvpMatch;
  onResign?: () => void;
  resignTrigger?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <aside
      aria-label="PvP match activity and details"
      className="battle-side-rail"
    >
      <section className="battle-rail-card pvp-activity">
        <p className="eyebrow">Latest activity</p>
        <h2>Match activity</h2>
        {match.lastAction ? (
          <p aria-live="polite">{lastActionLabel(match)}</p>
        ) : (
          <p>No battle action has been revealed yet.</p>
        )}
      </section>
      <BattleBench
        creatures={match.state.self.creatures}
        activeCreatureId={match.state.self.activeCreatureId}
      />
      <details className="battle-details battle-rail-card">
        <summary>
          <span>Match details</span>
          <strong>Turn {match.state.turnNumber}</strong>
        </summary>
        <div className="battle-details__panel">
          <dl className="battle-meta">
            <div>
              <dt>Opponent</dt>
              <dd>{match.opponent.playerName}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {match.status === 'completed'
                  ? 'Completed'
                  : match.currentActor === 'self'
                    ? 'Your turn'
                    : 'Opponent’s turn'}
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatDate(match.startedAt)}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                {match.turnDeadline
                  ? formatDate(match.turnDeadline)
                  : 'Completed'}
              </dd>
            </div>
          </dl>
        </div>
      </details>
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
        <p>Unplayed opponent cards stay hidden. Revealed cards appear here.</p>
        {match.state.opponent.playedPowerCards.length > 0 ? (
          <ul className="pvp-played-cards">
            {match.state.opponent.playedPowerCards.map((card) => (
              <li key={card.id}>{card.name} · played</li>
            ))}
          </ul>
        ) : null}
      </details>
      {match.canResign && onResign ? (
        <details className="battle-rail-card pvp-resign-card">
          <summary>Leave this battle</summary>
          <p className="eyebrow">Permanent match action</p>
          <h2>Forfeit battle</h2>
          <p>
            Forfeiting records an immediate loss and gives{' '}
            {match.opponent.playerName} the win.
          </p>
          <button
            className="button button--danger"
            disabled={busy}
            onClick={onResign}
            ref={resignTrigger}
            type="button"
          >
            {forfeitPending ? 'Forfeiting…' : 'Forfeit battle'}
          </button>
        </details>
      ) : null}
    </aside>
  );
}

function CompletedPvpMatch({ match }: { match: AsyncPvpMatch }) {
  const reason = completedReason(match);
  const playerWon = match.outcome === 'win';
  return (
    <BattleOutcomePanel
      action={
        <Link className="button" href="/matches/pvp">
          Return to Player Battles
        </Link>
      }
      facts={[
        { label: 'Opponent', value: match.opponent.playerName },
        { label: 'Final turn', value: match.state.turnNumber },
        {
          label: 'Completed',
          value: match.completedAt
            ? formatDate(match.completedAt)
            : 'Not returned',
        },
      ]}
      mode="Player Battle"
      summary={reason}
      title={completedResultTitle(match)}
      titleId="completed-pvp-title"
      tone={playerWon ? 'victory' : 'defeat'}
    >
      <details className="completed-match__context">
        <summary>About this result</summary>
        <p>
          This result is final. Refreshing cannot replay actions, change a
          forfeit, or reveal unplayed opponent cards.
        </p>
      </details>
    </BattleOutcomePanel>
  );
}

function playerBattleStatusDetail(
  match: AsyncPvpMatch,
  busy: boolean,
  hasError: boolean,
  expired: boolean,
) {
  if (hasError || expired) return 'Review the battle shown before acting.';
  if (busy) return 'Your choice is being confirmed.';
  if (match.status === 'completed') return 'The result is saved.';
  if (match.state.phase === 'replacement') {
    return match.currentActor === 'self'
      ? 'Choose an available replacement Creature.'
      : `${match.opponent.playerName} is choosing a replacement.`;
  }
  return match.currentActor === 'self'
    ? 'Choose one available action.'
    : `Waiting for ${match.opponent.playerName}. We’ll refresh automatically.`;
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
    return `Battle completed. ${completedReason(match)} The result is saved.`;
  if (match.state.phase === 'replacement')
    return match.currentActor === 'self'
      ? 'Your Creature was defeated. Choose an available replacement.'
      : 'Waiting for the opponent to choose a replacement.';
  return match.currentActor === 'self'
    ? 'Your turn. Choose an available action.'
    : `Waiting for ${match.opponent.playerName}. The battle will refresh automatically.`;
}

function lastActionLabel(match: AsyncPvpMatch) {
  const result = match.lastAction!;
  const actor = result.side === 'self' ? 'You' : match.opponent.playerName;
  const action =
    result.action.type === 'use_move'
      ? 'used a move'
      : result.action.type === 'use_power_card'
        ? 'played a Power card'
        : 'selected a replacement Creature';
  const outcome =
    result.winner === 'self'
      ? ' You won.'
      : result.winner === 'opponent'
        ? ` ${match.opponent.playerName} won.`
        : result.defeatedCreatureId
          ? ' A Creature was defeated.'
          : '';
  return `${actor} ${action}.${outcome}`;
}

function completedReason(match: AsyncPvpMatch) {
  if (match.completionReason === 'defeat')
    return match.outcome === 'win'
      ? `You defeated ${match.opponent.playerName}.`
      : `${match.opponent.playerName} won the battle.`;
  if (match.completionReason === 'account_deletion_forfeit')
    return match.outcome === 'win'
      ? 'Your opponent became unavailable, so the battle was forfeited.'
      : 'Your account became unavailable, so the battle was forfeited.';
  if (match.completionReason === 'voluntary_resignation')
    return match.outcome === 'win'
      ? `${match.opponent.playerName} forfeited the battle.`
      : 'You forfeited this battle.';
  return match.outcome === 'win'
    ? 'Your opponent’s turn deadline expired, so they forfeited the battle.'
    : 'Your turn deadline expired, so you forfeited the battle.';
}

function completedResultTitle(match: AsyncPvpMatch) {
  if (match.completionReason === 'voluntary_resignation')
    return match.outcome === 'win'
      ? 'Opponent forfeited — match saved'
      : 'You forfeited — match saved';
  if (match.completionReason === 'turn_forfeit')
    return match.outcome === 'win'
      ? 'Deadline victory — match saved'
      : 'Deadline defeat — match saved';
  if (match.completionReason === 'account_deletion_forfeit')
    return match.outcome === 'win'
      ? 'Opponent became unavailable — match saved'
      : 'Account became unavailable — match saved';
  return match.outcome === 'win'
    ? 'Victory — match saved'
    : 'Defeat — match saved';
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

function errorMessage(
  error: PvpApiError,
  context: 'action' | 'resignation' = 'action',
) {
  if (error.failure === 'authorization')
    return 'Your session expired. Sign in again before continuing.';
  if (error.failure === 'not-found')
    return 'This match is not available to the signed-in player.';
  if (error.failure === 'completed')
    return `The battle completed before that ${context === 'resignation' ? 'forfeit' : 'action'} arrived. Open its saved result.`;
  if (error.failure === 'stale' || error.failure === 'illegal-action')
    return 'The battle changed while you were choosing. Check whose turn it is and the actions now available.';
  if (error.options.ambiguous)
    return context === 'resignation'
      ? 'Your connection was interrupted. The result will be checked before you can retry the forfeit.'
      : 'Your connection was interrupted. The battle will be checked before you can retry the action.';
  return 'Check your connection, then reload the battle to continue.';
}

function toPvpError(error: unknown) {
  return error instanceof PvpApiError ? error : new PvpApiError('unavailable');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
