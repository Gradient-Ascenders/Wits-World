import { createAppDateTimeFormatter } from '../date-time';
import {
  ArrowRight,
  Broadcast,
  CaretDown,
  CheckCircle,
  Copy,
  Eye,
  Flag,
  Plugs,
  WarningCircle,
  Trophy,
  XCircle,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';

import {
  getRankedSettlement,
  LiveApiError,
  type LiveHistoryEntry,
  type LiveParticipantProjection,
  type LiveProjection,
  type RankedSettlement,
} from '../api/live';
import type { MatchCreature, CpuMatchIntent } from '../api/matches';
import {
  type ApiAccessTokenProvider,
  useApiAccessToken,
} from '../auth/useApiAccessToken';
import {
  LoadingState,
  PageLoadingState,
  UpdatingIndicator,
} from '../components/LoadingState';
import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
  CreatureDetailsPicture,
  BattleResolution,
  type BattleResolutionMoment,
} from '../components/matches/BattlePresentation';
import {
  BattleShellHeader,
  BattleStatusDock,
} from '../components/matches/BattleShell';
import { ResignMatchDialog } from '../components/matches/ResignMatchDialog';
import { useLiveBattleSession } from './useLiveBattleSession';
import './matches.css';

interface RouteParams {
  matchId: string;
}

export default function LiveMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<RouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const session = useLiveBattleSession({
    apiBaseUrl,
    getAccessToken,
    matchId,
  });
  const countdown = useAuthoritativeCountdown(
    session.match?.turnDeadline ?? null,
    session.serverNow,
  );
  const [confirmingResignation, setConfirmingResignation] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const resignTrigger = useRef<HTMLButtonElement | null>(null);
  const alert = useRef<HTMLDivElement | null>(null);
  const timerAnnouncement = useTimerAnnouncements(
    countdown.seconds,
    session.match,
  );
  const feedbackVersion = useLiveFeedback(session.match);

  useEffect(() => {
    if (session.connection === 'unrecoverable') alert.current?.focus();
  }, [session.connection]);

  useEffect(() => {
    if (session.match?.status === 'completed') setConfirmingResignation(false);
  }, [session.match?.status]);

  if (!session.match && session.connection !== 'unrecoverable') {
    return (
      <PageLoadingState
        title="Connecting…"
        description={
          session.feedback === 'Connecting…' ? undefined : session.feedback
        }
        escapeHref="/matches/live"
        escapeLabel="Return to Live Ranked"
        onRetry={session.recover}
      />
    );
  }

  if (session.connection === 'unrecoverable' || !session.match) {
    const authentication = session.error?.failure === 'authentication';
    return (
      <main className="matches-page live-match-page">
        <div
          className="match-inline-alert state-message state-message--error"
          ref={alert}
          role="alert"
          tabIndex={-1}
        >
          <WarningCircle size={24} aria-hidden="true" />
          <div>
            <h1>Live Ranked battle unavailable</h1>
            <p>{session.feedback}</p>
            <div className="match-state-actions">
              {authentication ? (
                <button
                  className="button"
                  onClick={() =>
                    void loginWithRedirect({
                      appState: { returnTo: `/matches/live/${matchId}` },
                    })
                  }
                  type="button"
                >
                  Sign in again
                </button>
              ) : (
                <button
                  className="button"
                  onClick={session.recover}
                  type="button"
                >
                  Retry recovery
                </button>
              )}
              <Link className="button button--quiet" href="/matches/live">
                Return to Live Ranked
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const match = session.match;
  if (match.status === 'completed') {
    return (
      <CompletedLiveBattle
        apiBaseUrl={apiBaseUrl}
        getAccessToken={getAccessToken}
        match={match}
      />
    );
  }
  const participant = match.role === 'participant' ? match : null;
  const spectator = match.role === 'spectator';
  const expired = match.status === 'active' && countdown.seconds <= 0;
  const inputBlocked =
    !participant ||
    session.connection !== 'connected' ||
    session.pending !== null ||
    expired;
  const combatants = battleCombatants(match);
  const opponentDisconnected = opponentIsDisconnected(
    participant,
    session.presence,
  );

  return (
    <main
      className={`matches-page battle-page live-match-page battle-page--live${spectator ? ' live-match-page--spectator' : ''}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {session.feedback} {timerAnnouncement}
      </p>
      <BattleShellHeader
        action={
          <button
            className="button button--quiet live-share-button"
            onClick={() => {
              const writeText = navigator.clipboard?.writeText.bind(
                navigator.clipboard,
              );
              if (!writeText) {
                setCopyStatus('failed');
                window.setTimeout(() => setCopyStatus('idle'), 3_000);
                return;
              }
              void writeText(window.location.href)
                .then(() => {
                  setCopyStatus('copied');
                  window.setTimeout(() => setCopyStatus('idle'), 2_000);
                })
                .catch(() => {
                  setCopyStatus('failed');
                  window.setTimeout(() => setCopyStatus('idle'), 3_000);
                });
            }}
            type="button"
          >
            {copyStatus === 'copied' ? (
              <CheckCircle size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {copyStatus === 'copied'
              ? 'Link copied'
              : copyStatus === 'failed'
                ? 'Copy failed'
                : 'Copy private link'}
          </button>
        }
        backHref="/matches/live"
        backLabel="Live Ranked"
        mode="Live Ranked"
        opponentLabel={liveOpponentLabel(match)}
        turnNumber={match.turnNumber}
      />

      <BattleStatusDock
        connection={<ConnectionBadge connection={session.connection} />}
        detail={authorityDetail(match)}
        label={titleCaseAuthorityLabel(authorityLabel(match))}
        timing={{
          detail: expired
            ? 'Updating battle…'
            : `Play by ${formatDate(match.turnDeadline!)}`,
          label: expired
            ? 'Deadline reached'
            : formatCountdown(countdown.seconds),
          tone: expired
            ? 'danger'
            : countdown.seconds <= 10
              ? 'warning'
              : undefined,
        }}
        tone={
          spectator
            ? 'spectator'
            : expired
              ? 'danger'
              : participant && ownsDecision(participant)
                ? 'player'
                : 'opponent'
        }
      />

      <TimeoutSummary match={match} />

      {session.connection === 'reconnecting' ? (
        <div
          className="live-status-banner live-status-banner--warning"
          role="status"
        >
          <Plugs size={22} aria-hidden="true" />
          <div>
            <strong>Reconnecting</strong>
            <span>
              You can review the last confirmed battlefield. Actions return when
              the live connection is ready.
            </span>
          </div>
          <button
            className="button button--quiet"
            onClick={session.recover}
            type="button"
          >
            Retry now
          </button>
        </div>
      ) : session.connection === 'recovered' ? (
        <div
          className="live-status-banner live-status-banner--success"
          role="status"
        >
          <CheckCircle size={22} aria-hidden="true" />
          <div>
            <strong>Battle recovered</strong>
            <span>You are back online with the latest battle.</span>
          </div>
        </div>
      ) : null}

      {opponentDisconnected ? (
        <div
          className="live-status-banner live-status-banner--warning"
          role="status"
        >
          <WarningCircle size={22} aria-hidden="true" />
          <div>
            <strong>Opponent connection lost</strong>
            <span>The turn timer keeps running while they reconnect.</span>
          </div>
        </div>
      ) : null}

      {session.pending ? (
        <div className="live-status-banner" role="status">
          <Broadcast size={22} aria-hidden="true" />
          <div>
            <strong>
              {session.pending.stage === 'acknowledged'
                ? 'Action accepted'
                : 'Submitting action'}
            </strong>
            <span>
              {session.pending.stage === 'acknowledged'
                ? 'Your action is being applied to the battlefield.'
                : 'Choose again when this action is confirmed.'}
            </span>
          </div>
        </div>
      ) : null}

      <div className="battle-live-layout live-battle-layout">
        <section
          aria-label="Current live battlefield"
          className={`battle-stage battle-stage--${combatants.one.acting ? 'player' : combatants.two.acting ? 'cpu' : 'selection'}`}
        >
          <div aria-hidden="true" className="battle-stage__field-lines" />
          <div className="battle-stage__label">
            <span>{spectator ? 'Public battlefield' : 'Live battlefield'}</span>
          </div>
          <h1 className="battle-stage__turn">
            {match.phase === 'initial_selection' &&
            participant &&
            ownsDecision(participant)
              ? 'Choose your first Creature'
              : match.phase === 'replacement' &&
                  participant?.currentActor === 'self'
                ? 'Choose a replacement'
                : titleCaseAuthorityLabel(authorityLabel(match))}
          </h1>
          <div className="battle-arena">
            <BattleCombatant
              creature={combatants.one.creature}
              emptyText={
                participant
                  ? match.phase === 'replacement'
                    ? 'Defeated Creature removed. Choose a replacement.'
                    : 'Choose your initial Creature.'
                  : 'This Creature has not been revealed yet.'
              }
              heading={combatants.one.label}
              isActing={combatants.one.acting}
              feedbackKey={feedbackVersion ?? undefined}
              {...liveCombatantFeedback(
                match,
                combatants.one.creature?.id,
                feedbackVersion,
              )}
              visualSide="player"
            />
            <BattleResolution
              activeIndex={null}
              activeMoment={null}
              emptyText={
                match.phase === 'initial_selection'
                  ? spectator
                    ? 'Opening choices stay hidden until both players are ready.'
                    : 'Choose your opening Creature. Both choices stay hidden until the battle begins.'
                  : 'No public battle action has been recorded yet.'
              }
              moments={liveResolutionMoments(match.history.at(-1), match)}
            />
            <BattleCombatant
              creature={combatants.two.creature}
              emptyText="This Creature has not been revealed yet."
              heading={combatants.two.label}
              isActing={combatants.two.acting}
              feedbackKey={feedbackVersion ?? undefined}
              {...liveCombatantFeedback(
                match,
                combatants.two.creature?.id,
                feedbackVersion,
              )}
              visualSide="cpu"
            />
          </div>
        </section>

        {participant ? (
          <BattleActionPanel
            activeCreatureId={participant.self.activeCreatureId}
            busy={session.pending !== null}
            creatures={participant.self.creatures}
            currentActor={ownsDecision(participant)}
            idPrefix="live"
            inputBlocked={inputBlocked}
            key={`${participant.phase}:${participant.self.activeCreatureId ?? 'none'}`}
            legalActions={participant.legalActions}
            lockReason={
              session.connection !== 'connected'
                ? 'Waiting for connection…'
                : expired
                  ? 'Updating battle…'
                  : undefined
            }
            onAction={(action: CpuMatchIntent) => session.submitAction(action)}
            opponentLabel={participant.opponent.playerName}
            phase={
              participant.phase === 'completed' ? 'active' : participant.phase
            }
            powerCards={participant.self.powerCards}
          />
        ) : (
          <section
            className="live-spectator-lock"
            aria-labelledby="spectator-lock-title"
          >
            <Eye size={30} aria-hidden="true" />
            <h2 id="spectator-lock-title">Watching live — read only</h2>
            <p>
              You can see the public battlefield and battle activity. Player
              hands, private choices, and actions stay private.
            </p>
          </section>
        )}

        <aside
          aria-label="Live battle activity and details"
          className="battle-side-rail live-side-rail"
        >
          <header className="battle-side-rail__heading">
            <h2>Activity</h2>
          </header>
          <LiveBattleHistory history={match.history} match={match} />
          {participant && match.phase === 'active' ? (
            <BattleBench
              activeCreatureId={participant.self.activeCreatureId}
              creatures={participant.self.creatures}
            />
          ) : spectator ? (
            <SpectatorPresence
              match={match as Extract<LiveProjection, { role: 'spectator' }>}
            />
          ) : null}
          <LiveMatchDetails match={match} />
          {participant ? (
            <button
              aria-label="Forfeit battle"
              className="battle-side-rail__forfeit"
              disabled={inputBlocked}
              onClick={() => setConfirmingResignation(true)}
              ref={resignTrigger}
              type="button"
            >
              <Flag aria-hidden="true" size={17} /> Forfeit
            </button>
          ) : null}
        </aside>
      </div>

      {confirmingResignation && participant ? (
        <ResignMatchDialog
          busy={session.pending !== null}
          onCancel={() => setConfirmingResignation(false)}
          onConfirm={() => {
            if (session.resign()) setConfirmingResignation(false);
          }}
          opponentLabel={participant.opponent.playerName}
          returnFocusRef={resignTrigger}
        />
      ) : null}
    </main>
  );
}

function ConnectionBadge({
  connection,
}: {
  connection: ReturnType<typeof useLiveBattleSession>['connection'];
}) {
  const label = {
    connecting: 'Connecting',
    connected: 'Connected',
    reconnecting: 'Reconnecting',
    recovered: 'Recovered',
    completed: 'Match complete',
    unrecoverable: 'Connection failed',
  }[connection];
  return (
    <div
      className={`live-connection-badge live-connection-badge--${connection}`}
    >
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}

function TimeoutSummary({ match }: { match: LiveProjection }) {
  const [one, two] =
    match.role === 'participant'
      ? [match.consecutiveTimeouts.self, match.consecutiveTimeouts.opponent]
      : [
          match.consecutiveTimeouts.playerOne,
          match.consecutiveTimeouts.playerTwo,
        ];
  if (one === 0 && two === 0) return null;
  return (
    <p className="live-timeout-summary">
      Consecutive misses: {match.role === 'participant' ? 'You' : 'Player one'}{' '}
      {one}/3 · {match.role === 'participant' ? 'Opponent' : 'Player two'} {two}
      /3
    </p>
  );
}

function LiveBattleHistory({
  history,
  match,
}: {
  history: LiveHistoryEntry[];
  match: LiveProjection;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [history.length]);
  return (
    <details
      className="battle-log battle-rail-card"
      onToggle={(event) => {
        if (event.currentTarget.open && body.current)
          body.current.scrollTop = body.current.scrollHeight;
      }}
    >
      <summary>
        <span className="battle-log__summary-label">
          Latest <strong>{history.length} events</strong>
        </span>
        <span className="battle-log__preview">
          {history.length
            ? historyLabel(history.at(-1)!, match)
            : 'No actions yet.'}
        </span>
      </summary>
      <div
        aria-label="Complete battle activity"
        className="battle-log__body"
        ref={body}
        role="log"
        tabIndex={0}
      >
        {history.length === 0 ? (
          <p>No public battle action has been committed yet.</p>
        ) : (
          <ol className="battle-log__groups">
            {history.map((entry, index) => (
              <li className="battle-log__group" key={`${index}-${entry.type}`}>
                <p>{historyLabel(entry, match)}</p>
                {entry.effects.length ? (
                  <ul className="battle-log__effects">
                    {liveResolutionMoments(entry, match)
                      .slice(1)
                      .map((moment) => (
                        <li key={moment.id}>{moment.message}</li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

function SpectatorPresence({
  match,
}: {
  match: Extract<LiveProjection, { role: 'spectator' }>;
}) {
  return (
    <section
      className="battle-rail-card live-presence"
      aria-labelledby="live-presence-title"
    >
      <h2 id="live-presence-title">Live presence</h2>
      <ul>
        <li>
          <span
            className={match.presence.playerOneConnected ? 'is-online' : ''}
          />
          {match.playerOne.playerName}:{' '}
          {match.presence.playerOneConnected ? 'connected' : 'disconnected'}
        </li>
        <li>
          <span
            className={match.presence.playerTwoConnected ? 'is-online' : ''}
          />
          {match.playerTwo.playerName}:{' '}
          {match.presence.playerTwoConnected ? 'connected' : 'disconnected'}
        </li>
        <li>
          <Eye size={17} aria-hidden="true" /> {match.presence.spectatorCount}{' '}
          watching
        </li>
      </ul>
    </section>
  );
}

function LiveMatchDetails({ match }: { match: LiveProjection }) {
  return (
    <details className="battle-details battle-rail-card">
      <summary>
        <span>Match details</span>
        <strong>Turn {match.turnNumber}</strong>
      </summary>
      <div className="battle-details__panel">
        <dl className="battle-meta">
          <div>
            <dt>Role</dt>
            <dd>{match.role === 'spectator' ? 'Watching' : 'Playing'}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDate(match.startedAt)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {match.turnDeadline ? formatDate(match.turnDeadline) : 'Complete'}
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}

function CompletedLiveBattle({
  apiBaseUrl,
  getAccessToken,
  match,
}: {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  match: LiveProjection;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const participant = match.role === 'participant';
  const title = participant
    ? match.outcome === 'win'
      ? 'Victory'
      : match.outcome === 'loss'
        ? 'Defeat'
        : 'Battle complete'
    : 'Battle complete';
  const OutcomeIcon =
    participant && match.outcome === 'win'
      ? Trophy
      : participant && match.outcome === 'loss'
        ? XCircle
        : Flag;
  const combatants = battleCombatants(match);
  const lastMoves = match.history
    .filter(
      (entry) => entry.type === 'participant_action' && entry.action !== null,
    )
    .slice(-2);
  const opponent = participant
    ? `Against ${match.opponent.playerName}`
    : match.winner
      ? `${match.winner === 'playerOne' ? match.playerOne.playerName : match.playerTwo.playerName} won`
      : `${match.playerOne.playerName} vs ${match.playerTwo.playerName}`;
  return (
    <main className="matches-page battle-page live-match-page battle-page--completed battle-report live-battle-report">
      <div className="battle-report__panel">
        <section
          aria-labelledby="live-complete-title"
          className="completed-match battle-report__outcome"
          data-outcome={participant ? match.outcome : undefined}
        >
          <div className="battle-report__result">
            <OutcomeIcon size={32} aria-hidden="true" />
            <h1 id="live-complete-title" ref={heading} tabIndex={-1}>
              {title}
            </h1>
          </div>
          <p className="battle-report__opponent">{opponent}</p>
          {match.completionReason && match.completionReason !== 'defeat' ? (
            <p className="battle-report__reason">{completionLabel(match)}</p>
          ) : null}
          <dl className="battle-report__facts">
            <div>
              <dt>Ended on turn</dt>
              <dd>{match.turnNumber}</dd>
            </div>
            {match.completedAt ? (
              <div>
                <dt className="sr-only">Completed</dt>
                <dd>
                  <time dateTime={match.completedAt}>
                    {formatDate(match.completedAt)}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
          {participant ? (
            <RankedSettlementSummary
              apiBaseUrl={apiBaseUrl}
              getAccessToken={getAccessToken}
              matchId={match.matchId}
            />
          ) : null}
          <Link
            className="button live-battle-report__return"
            href="/matches/live"
          >
            Back to Live Ranked
          </Link>
        </section>
        <section
          aria-labelledby="live-last-moves-title"
          className="battle-report__final-turn"
        >
          <div className="battle-report__section-heading">
            <h2 id="live-last-moves-title">Last moves</h2>
          </div>
          {lastMoves.length ? (
            <LiveRecordedActions entries={lastMoves} match={match} />
          ) : (
            <p className="battle-report__note">No moves recorded.</p>
          )}
          {combatants.one.creature || combatants.two.creature ? (
            <div className="battle-report__combatants">
              <LiveReportCombatant
                creature={combatants.one.creature}
                label={combatants.one.label}
              />
              <LiveReportCombatant
                creature={combatants.two.creature}
                label={combatants.two.label}
              />
            </div>
          ) : null}
        </section>
        {match.history.length ? (
          <details className="battle-report__disclosure">
            <summary>
              <span>Battle history</span>
              <CaretDown size={20} aria-hidden="true" />
            </summary>
            <div className="live-battle-report__history">
              <LiveRecordedActions entries={match.history} match={match} />
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}

function LiveRecordedActions({
  entries,
  match,
}: {
  entries: LiveHistoryEntry[];
  match: LiveProjection;
}) {
  return (
    <ol className="battle-report__events">
      {entries.map((entry, index) => (
        <li key={index}>
          <p>{historyLabel(entry, match)}</p>
          {liveResolutionMoments(entry, match)
            .slice(1)
            .map((moment) => (
              <p className="battle-report__effect" key={moment.id}>
                {moment.message}
              </p>
            ))}
        </li>
      ))}
    </ol>
  );
}

function LiveReportCombatant({
  creature,
  label,
}: {
  creature: MatchCreature | null;
  label: string;
}) {
  return (
    <section
      className="battle-report__combatant"
      aria-label={`${label}'s final Creature`}
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
                aria-label={`${creature.name} final HP`}
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
        <p className="battle-report__note">No Creature revealed.</p>
      )}
    </section>
  );
}

type SettlementState =
  | { status: 'loading' }
  | { error: LiveApiError; status: 'error' }
  | {
      data: RankedSettlement;
      status: 'ready';
      matchId: string;
      refreshing?: boolean;
      refreshError?: string;
    };

function RankedSettlementSummary({
  apiBaseUrl,
  getAccessToken,
  matchId,
}: {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  matchId: string;
}) {
  const [state, setState] = useState<SettlementState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let retry: number | undefined;

    async function loadSettlement() {
      setState((current) =>
        current.status === 'ready' &&
        current.matchId === matchId &&
        current.data.status === 'pending'
          ? { ...current, refreshing: true, refreshError: undefined }
          : current,
      );
      try {
        const data = await getRankedSettlement({
          apiBaseUrl,
          getAccessToken,
          matchId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState({ data, status: 'ready', matchId });
        if (data.status === 'pending') {
          retry = window.setTimeout(() => void loadSettlement(), 2_500);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        const error = toSettlementError(caught);
        setState((current) =>
          current.status === 'ready' &&
          current.matchId === matchId &&
          current.data.status === 'pending' &&
          error.failure === 'unavailable'
            ? {
                ...current,
                refreshing: false,
                refreshError:
                  'Rating update unavailable. Last check is pending.',
              }
            : { error, status: 'error' },
        );
      }
    }

    setState((current) =>
      current.status === 'ready' &&
      current.matchId === matchId &&
      current.data.status === 'pending'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );
    void loadSettlement();
    return () => {
      controller.abort();
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [apiBaseUrl, getAccessToken, matchId, revision]);

  if (
    state.status === 'loading' ||
    (state.status === 'ready' && state.matchId !== matchId)
  ) {
    return (
      <LoadingState
        className="ranked-settlement ranked-settlement--loading"
        label="Loading rating…"
      />
    );
  }

  if (state.status === 'error') {
    return (
      <section
        aria-labelledby="ranked-settlement-title"
        className="ranked-settlement"
      >
        <h2 id="ranked-settlement-title">Season rating</h2>
        <p>Rating unavailable.</p>
        <button
          className="button button--quiet"
          onClick={() => setRevision((value) => value + 1)}
          type="button"
        >
          Retry rating
        </button>
      </section>
    );
  }

  const settlement = state.data;
  const ratingReady =
    settlement.status === 'settled' &&
    settlement.ratingBefore !== null &&
    settlement.ratingAfter !== null &&
    settlement.appliedDelta !== null;

  return (
    <section
      aria-live={settlement.status === 'pending' ? 'polite' : undefined}
      aria-labelledby="ranked-settlement-title"
      className="ranked-settlement"
    >
      <h2 id="ranked-settlement-title">Season rating</h2>
      <UpdatingIndicator
        active={Boolean(state.refreshing)}
        label="Updating rating"
        error={state.refreshError}
        onRetry={() => setRevision((value) => value + 1)}
        announce={false}
      />
      {ratingReady ? (
        <p className="live-result-rating">
          <span>{numberFormatter.format(settlement.ratingBefore!)}</span>
          <ArrowRight size={18} aria-hidden="true" />
          <span className="sr-only">to</span>
          <strong>{numberFormatter.format(settlement.ratingAfter!)}</strong>
          <strong
            className="live-result-rating__delta"
            data-direction={settlement.appliedDelta! < 0 ? 'down' : 'up'}
          >
            {formatRatingDelta(settlement.appliedDelta!)}
            <span className="sr-only"> rating</span>
          </strong>
        </p>
      ) : !state.refreshError ? (
        <p role="status">Rating pending.</p>
      ) : null}
      {!state.refreshError ? (
        <TerritorySettlementResult settlement={settlement} />
      ) : null}
    </section>
  );
}

function TerritorySettlementResult({
  settlement,
}: {
  settlement: RankedSettlement;
}) {
  const territory = settlement.territory;
  if (!territory) return null;
  const detail =
    territory.outcome === 'pending'
      ? 'Influence pending.'
      : territory.outcome === 'lost'
        ? 'No influence awarded.'
        : territory.outcome === 'accepted'
          ? `+${numberFormatter.format(territory.influencePoints)} influence.`
          : territoryExclusionMessage(territory.exclusionReason);
  return (
    <p className="ranked-territory-result">
      <strong>{territory.zoneName}</strong>
      <span>{detail}</span>
    </p>
  );
}

function territoryExclusionMessage(
  reason: NonNullable<RankedSettlement['territory']>['exclusionReason'],
): string {
  return {
    daily_cap_reached: 'Daily influence limit reached.',
    placement_matches_remaining:
      'Complete placement matches to earn influence.',
    player_unavailable: 'Player territory record unavailable.',
    result_not_eligible: 'Result ineligible for influence.',
    zone_unavailable: 'Territory unavailable.',
  }[reason ?? 'result_not_eligible'];
}

const numberFormatter = new Intl.NumberFormat('en-ZA');

function formatRatingDelta(delta: number): string {
  if (delta > 0) return `+${numberFormatter.format(delta)}`;
  return numberFormatter.format(delta);
}

function toSettlementError(value: unknown): LiveApiError {
  return value instanceof LiveApiError
    ? value
    : new LiveApiError('unavailable');
}

function battleCombatants(match: LiveProjection) {
  if (match.role === 'spectator') {
    return {
      one: {
        acting: match.currentActor === 'playerOne',
        creature: match.playerOne.activeCreature,
        label: match.playerOne.playerName,
      },
      two: {
        acting: match.currentActor === 'playerTwo',
        creature: match.playerTwo.activeCreature,
        label: match.playerTwo.playerName,
      },
    };
  }
  const selfCreature =
    match.self.creatures.find(
      (creature) => creature.id === match.self.activeCreatureId,
    ) ?? null;
  return {
    one: {
      acting: ownsDecision(match),
      creature: selfCreature,
      label: 'You',
    },
    two: {
      acting: match.currentActor === 'opponent',
      creature: match.opponent.activeCreature,
      label: match.opponent.playerName,
    },
  };
}

function authorityLabel(match: LiveProjection): string {
  if (match.role === 'spectator') return 'WATCHING — READ ONLY';
  if (match.status === 'completed') return 'MATCH COMPLETE';
  if (match.phase === 'initial_selection')
    return ownsDecision(match)
      ? 'CHOOSE YOUR FIRST CREATURE'
      : 'WAITING FOR OPPONENT';
  if (match.currentActor === 'self') return 'YOUR TURN';
  return "OPPONENT'S TURN";
}

function ownsDecision(match: LiveParticipantProjection): boolean {
  return match.phase === 'initial_selection'
    ? match.legalActions.some(
        (action) => action.type === 'select_initial_creature',
      )
    : match.currentActor === 'self';
}

function authorityDetail(match: LiveProjection): string {
  if (match.role === 'spectator') {
    return 'Watching only. Player actions are unavailable.';
  }
  if (match.status === 'completed') return 'The final result is saved.';
  if (ownsDecision(match)) {
    return `${match.legalActions.length} available action${match.legalActions.length === 1 ? '' : 's'}. Choose before time runs out.`;
  }
  return `Waiting for ${match.opponent.playerName}.`;
}

function historyLabel(entry: LiveHistoryEntry, match: LiveProjection): string {
  const actor = entry.side ? sideLabel(entry.side, match) : 'The battle';
  if (entry.type === 'initial_selection_submitted') {
    return `${actor} chose an initial Creature${entry.automatic ? ' automatically when time expired' : ''}.`;
  }
  if (entry.type === 'automatic_initial_selection') {
    return `${actor} received an automatic initial Creature when time expired.`;
  }
  if (entry.type === 'automatic_replacement') {
    return `${actor} received an automatic replacement when time expired.`;
  }
  if (entry.type === 'timeout') {
    return `${actor} missed the decision deadline.`;
  }
  if (entry.type === 'voluntary_resignation') {
    return `${entry.loser ? sideLabel(entry.loser, match) : 'A player'} forfeited the battle.`;
  }
  if (entry.type === 'abandonment_forfeit') {
    return `${entry.loser ? sideLabel(entry.loser, match) : 'A player'} lost after three consecutive missed decisions.`;
  }
  if (entry.type === 'account_deletion_forfeit') {
    return 'The battle ended because a participant account became unavailable.';
  }
  const action = {
    select_initial_creature: 'selected an initial Creature',
    select_replacement: 'selected a replacement Creature',
    swap_creature: 'swapped in a Creature',
    use_move: 'used a move',
    use_power_card: 'used a Power card',
  }[entry.actionType ?? 'use_move'];
  const intent = entry.action;
  const creatures =
    match.role === 'participant'
      ? [
          ...match.self.creatures,
          match.opponent.activeCreature,
          ...match.opponent.defeatedCreatures,
        ]
      : [
          match.playerOne.activeCreature,
          ...match.playerOne.defeatedCreatures,
          match.playerTwo.activeCreature,
          ...match.playerTwo.defeatedCreatures,
        ];
  const powers =
    match.role === 'participant'
      ? [...match.self.powerCards, ...match.opponent.playedPowerCards]
      : [
          ...match.playerOne.playedPowerCards,
          ...match.playerTwo.playedPowerCards,
        ];
  if (intent && 'creatureId' in intent) {
    const creature = creatures.find(
      (candidate) => candidate?.id === intent.creatureId,
    );
    if (creature)
      return `${actor} ${entry.actionType === 'swap_creature' ? 'swapped in' : 'selected'} ${creature.name}.`;
  }
  if (intent?.type === 'use_move') {
    const move = creatures
      .flatMap((creature) => creature?.moves ?? [])
      .find((candidate) => candidate.id === intent.moveId);
    if (move) return `${actor} used ${move.name}.`;
  }
  if (intent?.type === 'use_power_card') {
    const power = powers.find(
      (candidate) => candidate.id === intent.powerCardId,
    );
    if (power) return `${actor} used ${power.name}.`;
  }
  return `${actor} ${action}.`;
}

function liveResolutionMoments(
  entry: LiveHistoryEntry | undefined,
  match: LiveProjection,
): BattleResolutionMoment[] {
  if (!entry) return [];
  return [
    { id: 'action', message: historyLabel(entry, match), tone: 'action' },
    ...entry.effects.map((effect, index): BattleResolutionMoment => {
      const target =
        match.role === 'participant' && effect.targetSide === match.selfSide
          ? 'Your Creature'
          : `${sideLabel(effect.targetSide, match)}'s Creature`;
      const amount = Math.abs(effect.amount);
      return {
        id: `effect-${index}`,
        tone: effect.effectType,
        message:
          effect.effectType === 'damage'
            ? `${target} took ${amount} damage.`
            : effect.effectType === 'heal'
              ? `${target} restored ${amount} HP.`
              : `${target} received a ${effect.effectType}.`,
        stat:
          effect.effectType === 'damage' || effect.effectType === 'heal'
            ? {
                direction: effect.effectType === 'heal' ? 'up' : 'down',
                resource: 'HP',
                value: amount,
              }
            : null,
      };
    }),
    ...(entry.defeatedCreatureId
      ? [
          {
            id: 'defeat',
            message: 'A Creature was defeated.',
            tone: 'defeat' as const,
          },
        ]
      : []),
  ];
}

function liveCombatantFeedback(
  match: LiveProjection,
  creatureId: string | undefined,
  version: string | null,
) {
  if (!version || !creatureId) return {};
  const entry = match.history.at(-1);
  const effect = entry?.effects
    .filter((candidate) => candidate.targetCreatureId === creatureId)
    .at(-1);
  if (!effect) return {};
  return {
    feedbackTone: effect.effectType,
    feedbackText:
      effect.effectType === 'damage'
        ? `−${Math.abs(effect.amount)} HP`
        : effect.effectType === 'heal'
          ? `+${Math.abs(effect.amount)} HP`
          : effect.effectType === 'buff'
            ? 'Buff applied'
            : 'Debuff applied',
  };
}

function useLiveFeedback(match: LiveProjection | null) {
  const previous = useRef<{ matchId: string; version: number } | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const matchId = match?.matchId;
  const matchVersion = match?.version;
  useEffect(() => {
    const before = previous.current;
    previous.current =
      matchId && matchVersion !== undefined
        ? { matchId, version: matchVersion }
        : null;
    setVersion(null);
    if (
      !matchId ||
      matchVersion === undefined ||
      before?.matchId !== matchId ||
      before.version >= matchVersion
    )
      return;
    setVersion(`${matchId}:${matchVersion}`);
    const timer = window.setTimeout(() => setVersion(null), 1_200);
    return () => window.clearTimeout(timer);
  }, [matchId, matchVersion]);
  return version;
}

function liveOpponentLabel(match: LiveProjection) {
  return match.role === 'participant'
    ? `Against ${match.opponent.playerName}`
    : 'Watching private battle';
}

function titleCaseAuthorityLabel(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/^./u, (character) => character.toLocaleUpperCase());
}

function sideLabel(
  side: 'playerOne' | 'playerTwo',
  match: LiveProjection,
): string {
  if (match.role === 'spectator') {
    return side === 'playerOne'
      ? match.playerOne.playerName
      : match.playerTwo.playerName;
  }
  return side === match.selfSide ? 'You' : match.opponent.playerName;
}

function opponentIsDisconnected(
  match: LiveParticipantProjection | null,
  presence: { playerOneConnected: boolean; playerTwoConnected: boolean } | null,
): boolean {
  if (!match || !presence || match.status === 'completed') return false;
  return match.selfSide === 'playerOne'
    ? !presence.playerTwoConnected
    : !presence.playerOneConnected;
}

function completionLabel(match: LiveProjection): string {
  if (match.completionReason === 'account_deletion_forfeit')
    return 'A player’s account became unavailable.';
  const loser =
    match.role === 'participant'
      ? match.outcome === 'win'
        ? 'Opponent'
        : match.outcome === 'loss'
          ? 'You'
          : 'A player'
      : match.winner === 'playerOne'
        ? match.playerTwo.playerName
        : match.winner === 'playerTwo'
          ? match.playerOne.playerName
          : 'A player';
  return match.completionReason === 'abandonment_forfeit'
    ? `${loser} missed three decisions.`
    : `${loser} forfeited.`;
}

function useAuthoritativeCountdown(
  deadline: string | null,
  serverNow: () => number,
) {
  const [seconds, setSeconds] = useState(() =>
    remainingSeconds(deadline, serverNow),
  );
  useEffect(() => {
    setSeconds(remainingSeconds(deadline, serverNow));
    if (!deadline) return;
    const timer = window.setInterval(
      () => setSeconds(remainingSeconds(deadline, serverNow)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [deadline, serverNow]);
  return { seconds };
}

function useTimerAnnouncements(seconds: number, match: LiveProjection | null) {
  const [message, setMessage] = useState('');
  const last = useRef<number | null>(null);
  const thresholds = useMemo(() => new Set([30, 10, 5, 0]), []);
  useEffect(() => {
    if (!match || match.status === 'completed') {
      last.current = null;
      setMessage('');
      return;
    }
    const canAnnounceZero =
      seconds !== 0 || (last.current !== null && last.current > 0);
    if (
      last.current !== seconds &&
      thresholds.has(seconds) &&
      canAnnounceZero
    ) {
      setMessage(
        seconds === 0
          ? 'Time expired. Updating battle…'
          : `${seconds} seconds remain to choose.`,
      );
    }
    last.current = seconds;
  }, [match, seconds, thresholds]);
  return message;
}

function remainingSeconds(deadline: string | null, serverNow: () => number) {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((Date.parse(deadline) - serverNow()) / 1_000));
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return createAppDateTimeFormatter(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
