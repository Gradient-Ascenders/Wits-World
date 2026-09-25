import {
  ArrowLeft,
  Broadcast,
  CheckCircle,
  ClockCountdown,
  Copy,
  Eye,
  Plugs,
  WarningCircle,
} from '@phosphor-icons/react';
import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';

import type {
  LiveHistoryEntry,
  LiveParticipantProjection,
  LiveProjection,
} from '../api/live';
import type { CpuMatchIntent } from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BattleActionPanel,
  BattleBench,
  BattleCombatant,
} from '../components/matches/BattlePresentation';
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

  useEffect(() => {
    if (session.connection === 'unrecoverable') alert.current?.focus();
  }, [session.connection]);

  useEffect(() => {
    if (session.match?.status === 'completed') setConfirmingResignation(false);
  }, [session.match?.status]);

  if (!session.match && session.connection !== 'unrecoverable') {
    return (
      <main className="matches-page live-match-page">
        <Link className="battle-back-link" href="/matches/live">
          <ArrowLeft size={20} aria-hidden="true" /> Live lobby
        </Link>
        <section className="live-connection-stage" role="status">
          <span className="live-searching__signal" aria-hidden="true" />
          <h1>Connecting to live battle</h1>
          <p>{session.feedback}</p>
        </section>
      </main>
    );
  }

  if (session.connection === 'unrecoverable' || !session.match) {
    const authentication = session.error?.failure === 'authentication';
    return (
      <main className="matches-page live-match-page">
        <Link className="battle-back-link" href="/matches/live">
          <ArrowLeft size={20} aria-hidden="true" /> Live lobby
        </Link>
        <div
          className="match-inline-alert state-message state-message--error"
          ref={alert}
          role="alert"
          tabIndex={-1}
        >
          <WarningCircle size={24} aria-hidden="true" />
          <div>
            <h1>Live match unavailable</h1>
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
                Return to live lobby
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const match = session.match;
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
      className={`matches-page live-match-page${spectator ? ' live-match-page--spectator' : ''}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {session.feedback} {timerAnnouncement}
      </p>
      <header className="live-battle-header">
        <div className="live-battle-header__topline">
          <Link className="battle-back-link" href="/matches/live">
            <ArrowLeft size={20} aria-hidden="true" /> Live lobby
          </Link>
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
        </div>
        <div className="live-authority-strip">
          <div
            className={`live-role-cue live-role-cue--${authorityTone(match)}`}
          >
            {spectator ? (
              <Eye size={24} aria-hidden="true" />
            ) : (
              <Broadcast size={24} aria-hidden="true" />
            )}
            <div>
              <strong>{authorityLabel(match)}</strong>
              <span>{authorityDetail(match)}</span>
            </div>
          </div>
          <ConnectionBadge connection={session.connection} />
          {match.status === 'active' ? (
            <div
              aria-label={
                expired
                  ? 'Server decision deadline reached'
                  : `${countdown.seconds} seconds remain before the server deadline`
              }
              className={`live-authority-timer${expired ? ' live-authority-timer--expired' : ''}`}
              role="timer"
            >
              <ClockCountdown size={22} aria-hidden="true" />
              <div>
                <strong>
                  {expired ? 'SYNCING' : formatCountdown(countdown.seconds)}
                </strong>
                <span>
                  {expired
                    ? 'Deadline reached — waiting for server'
                    : `Server deadline ${formatDate(match.turnDeadline!)}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="live-authority-timer live-authority-timer--complete">
              <CheckCircle size={22} aria-hidden="true" />
              <div>
                <strong>FINAL</strong>
                <span>Server-confirmed result</span>
              </div>
            </div>
          )}
        </div>
        <div className="live-battle-title">
          <div>
            <h1>{battleTitle(match)}</h1>
            <p>
              Turn {match.turnNumber} · Version {match.version}
            </p>
          </div>
          <TimeoutSummary match={match} />
        </div>
      </header>

      {session.connection === 'reconnecting' ? (
        <div
          className="live-status-banner live-status-banner--warning"
          role="status"
        >
          <Plugs size={22} aria-hidden="true" />
          <div>
            <strong>Reconnecting to authority</strong>
            <span>
              The last confirmed battlefield remains visible. Actions stay
              locked until a fresh snapshot and subscription are ready.
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
            <span>The battlefield now reflects the latest server state.</span>
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
            <span>
              The server deadline continues and still controls the turn.
            </span>
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
                ? 'Waiting for the authoritative battlefield update.'
                : 'Battle controls are locked to prevent duplicate submissions.'}
            </span>
          </div>
        </div>
      ) : null}

      {match.status === 'completed' ? (
        <CompletedLiveBattle match={match} />
      ) : (
        <div className="battle-live-layout live-battle-layout">
          <section
            aria-label="Current live battlefield"
            className="battle-stage battle-stage--player"
          >
            <div aria-hidden="true" className="battle-stage__field-lines" />
            <div className="battle-stage__label">
              <span>
                {spectator ? 'Public battlefield' : 'Live battlefield'}
              </span>
              <strong>{authorityLabel(match)}</strong>
            </div>
            <div className="battle-arena">
              <BattleCombatant
                creature={combatants.one.creature}
                emptyText="This Creature has not been revealed by the server."
                heading={combatants.one.label}
                isActing={combatants.one.acting}
                visualSide="player"
              />
              <div aria-hidden="true" className="battle-versus">
                LIVE
              </div>
              <BattleCombatant
                creature={combatants.two.creature}
                emptyText="This Creature has not been revealed by the server."
                heading={combatants.two.label}
                isActing={combatants.two.acting}
                visualSide="cpu"
              />
            </div>
          </section>

          {participant ? (
            <BattleActionPanel
              activeCreatureId={participant.self.activeCreatureId}
              busy={session.pending !== null}
              creatures={participant.self.creatures}
              currentActor={participant.currentActor === 'self'}
              idPrefix="live"
              inputBlocked={inputBlocked}
              key={`${participant.phase}:${participant.self.activeCreatureId ?? 'none'}`}
              legalActions={participant.legalActions}
              onAction={(action: CpuMatchIntent) =>
                session.submitAction(action)
              }
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
                This view contains only the server’s public spectator
                projection. Hands, private choices, and player actions are not
                available here.
              </p>
            </section>
          )}

          <aside
            aria-label="Live battle activity and details"
            className="battle-side-rail live-side-rail"
          >
            <LiveBattleHistory history={match.history} match={match} />
            {participant ? (
              <BattleBench
                activeCreatureId={participant.self.activeCreatureId}
                creatures={participant.self.creatures}
              />
            ) : (
              <SpectatorPresence
                match={match as Extract<LiveProjection, { role: 'spectator' }>}
              />
            )}
            <LiveMatchDetails match={match} />
            {participant ? (
              <details className="battle-rail-card pvp-resign-card">
                <summary>Leave this battle</summary>
                <h2>Forfeit live battle</h2>
                <p>
                  The server records an immediate loss. Closing the browser does
                  not forfeit or pause the deadline.
                </p>
                <button
                  className="button button--danger"
                  disabled={inputBlocked}
                  onClick={() => setConfirmingResignation(true)}
                  ref={resignTrigger}
                  type="button"
                >
                  Forfeit battle
                </button>
              </details>
            ) : null}
          </aside>
        </div>
      )}

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
  return (
    <section
      className="battle-rail-card live-history"
      aria-labelledby="live-history-title"
    >
      <div className="live-history__heading">
        <h2 id="live-history-title">Battle activity</h2>
        <span>{history.length} events</span>
      </div>
      {history.length === 0 ? (
        <p>No public battle action has been committed yet.</p>
      ) : (
        <ol>
          {history.map((entry, index) => (
            <li key={`${index}-${entry.type}`}>
              <span>{index + 1}</span>
              <p>{historyLabel(entry, match)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
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
            <dd>{match.role === 'spectator' ? 'Spectator' : 'Participant'}</dd>
          </div>
          <div>
            <dt>State version</dt>
            <dd>{match.version}</dd>
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

function CompletedLiveBattle({ match }: { match: LiveProjection }) {
  const title =
    match.role === 'participant'
      ? match.outcome === 'win'
        ? 'You won the live battle'
        : 'You lost the live battle'
      : match.winner === 'playerOne'
        ? `${match.playerOne.playerName} won`
        : match.winner === 'playerTwo'
          ? `${match.playerTwo.playerName} won`
          : 'Live battle complete';
  return (
    <div className="battle-completed-layout">
      <section
        className="completed-match completed-match--player"
        aria-labelledby="live-complete-title"
      >
        <h1 id="live-complete-title">{title}</h1>
        <p>{completionLabel(match.completionReason)}</p>
        <p>
          This result came from the authoritative server state. Refreshing
          cannot replay an action or change the outcome.
        </p>
        <Link className="button" href="/matches/live">
          Return to live lobby
        </Link>
      </section>
      <LiveBattleHistory history={match.history} match={match} />
    </div>
  );
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
      acting: match.currentActor === 'self',
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

function authorityTone(match: LiveProjection) {
  if (match.role === 'spectator') return 'spectator';
  if (match.status === 'completed') return 'complete';
  return match.currentActor === 'self' ? 'self' : 'opponent';
}

function authorityLabel(match: LiveProjection): string {
  if (match.role === 'spectator') return 'WATCHING — READ ONLY';
  if (match.status === 'completed') return 'MATCH COMPLETE';
  if (match.currentActor === 'self') return 'YOUR TURN';
  return "OPPONENT'S TURN";
}

function authorityDetail(match: LiveProjection): string {
  if (match.role === 'spectator') {
    return 'Public projection only · no player actions';
  }
  if (match.status === 'completed') return 'Final server result';
  if (match.currentActor === 'self') {
    return `${match.legalActions.length} server-approved action${match.legalActions.length === 1 ? '' : 's'}`;
  }
  return `Waiting for ${match.opponent.playerName}`;
}

function battleTitle(match: LiveProjection): string {
  if (match.role === 'participant') {
    return `Live against ${match.opponent.playerName}`;
  }
  return `${match.playerOne.playerName} vs ${match.playerTwo.playerName}`;
}

function historyLabel(entry: LiveHistoryEntry, match: LiveProjection): string {
  const actor = entry.side ? sideLabel(entry.side, match) : 'The server';
  if (entry.type === 'initial_selection_submitted') {
    return `${actor} submitted an initial Creature${entry.automatic ? ' automatically at the deadline' : ''}.`;
  }
  if (entry.type === 'automatic_initial_selection') {
    return `${actor} received a server-selected initial Creature after the deadline.`;
  }
  if (entry.type === 'automatic_replacement') {
    return `${actor} received a server-selected replacement after the deadline.`;
  }
  if (entry.type === 'timeout') {
    return `${actor} missed the server decision deadline.`;
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
    use_move: 'used a move',
    use_power_card: 'used a Power card',
  }[entry.actionType ?? 'use_move'];
  return `${actor} ${action}.`;
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

function completionLabel(reason: LiveProjection['completionReason']): string {
  return {
    defeat: 'The opposing team was defeated.',
    abandonment_forfeit:
      'The match ended after three consecutive missed decisions.',
    voluntary_resignation: 'A participant forfeited the match.',
    account_deletion_forfeit: 'A participant account became unavailable.',
  }[reason ?? 'defeat'];
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
          ? 'Server deadline reached. Waiting for authoritative state.'
          : `${seconds} seconds remain before the server deadline.`,
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
