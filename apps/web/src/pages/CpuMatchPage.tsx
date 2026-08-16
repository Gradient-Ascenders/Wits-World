import { useAuth0 } from '@auth0/auth0-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';

import {
  getCpuMatch,
  MatchApiError,
  submitCpuMatchAction,
  type CpuMatch,
  type CpuMatchIntent,
  type MatchActionResult,
  type MatchCreature,
} from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import './matches.css';

interface MatchRouteParams {
  matchId: string;
}

type RequestStatus = 'loading' | 'ready' | 'reconciling' | 'submitting';
type ApplyMatchResult = 'applied' | 'obsolete' | 'wrong-route';

export default function CpuMatchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { matchId } = useParams<MatchRouteParams>();
  const getAccessToken = useApiAccessToken();
  const { loginWithRedirect } = useAuth0();
  const [match, setMatch] = useState<CpuMatch | null>(null);
  const [error, setError] = useState<MatchApiError | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading');
  const [statusMessage, setStatusMessage] = useState(
    'Loading the authoritative match.',
  );
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

  routeMatchId.current = matchId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      actionRequest.current?.abort();
    };
  }, []);

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
      matchRef.current = next;
      latestAppliedGeneration.current = Math.max(
        latestAppliedGeneration.current,
        generation,
      );
      appliedRevision.current += 1;
      setMatch(next);
      setError(null);

      setStatusMessage(getMatchStatusMessage(next));

      if (phaseChanged || next.status === 'completed') {
        queueMicrotask(() => phaseHeading.current?.focus());
      }
      return 'applied';
    },
    [],
  );

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
        setStatusMessage('Loading the authoritative match.');
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
      requestStatus === 'submitting' ||
      requestStatus === 'reconciling' ||
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
    setRequestStatus('submitting');
    setStatusMessage('Submitting your intent. Waiting for the server outcome…');

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
          'The match changed before that intent was accepted. Reloading server state; the action will not be replayed.',
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
                'Authoritative match state restored. Review the current legal actions before continuing.',
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
          'The action was not applied. The visible match state is unchanged.',
        );
        queueMicrotask(() => alert.current?.focus());
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
      <div className="matches-page">
        <section aria-live="polite" className="match-state-panel" role="status">
          <p className="eyebrow">CPU battle</p>
          <h1>Loading saved match state</h1>
          <p>
            Retrieving the authoritative version, legal actions, and revealed
            cards…
          </p>
        </section>
      </div>
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
  const activePlayerCreature = match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );

  return (
    <div className="matches-page battle-page">
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>

      <header className="battle-header">
        <div>
          <p className="eyebrow">Server-authoritative CPU battle</p>
          <h1 ref={phaseHeading} tabIndex={-1}>
            {phaseTitle}
          </h1>
          <p>{getPhaseDescription(match)}</p>
        </div>
        <dl className="battle-meta">
          <div>
            <dt>Match version</dt>
            <dd>{match.version}</dd>
          </div>
          <div>
            <dt>Turn</dt>
            <dd>{match.state.turnNumber}</dd>
          </div>
          <div>
            <dt>Current side</dt>
            <dd>
              {match.state.currentSide
                ? sideLabel(match.state.currentSide)
                : 'None'}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {match.status === 'completed' ? 'Completed' : 'In progress'}
            </dd>
          </div>
        </dl>
      </header>

      {error ? (
        <section
          className="match-inline-alert"
          ref={alert}
          role="alert"
          tabIndex={-1}
        >
          <strong>Action not applied.</strong>{' '}
          {error.failure === 'authorization'
            ? 'Your session expired. Sign in again before continuing.'
            : 'The server state shown below was not changed. Reload it before trying another intent.'}
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
                Reload match state
              </button>
            )}
          </div>
        </section>
      ) : null}

      {match.status === 'completed' ? (
        <CompletedMatch match={match} />
      ) : (
        <>
          <section aria-label="Current combatants" className="battle-arena">
            <Combatant
              creature={activePlayerCreature ?? null}
              emptyText={
                match.state.phase === 'replacement'
                  ? 'Defeated Creature removed. Choose a replacement.'
                  : 'Choose your initial Creature.'
              }
              heading="Your current Creature"
            />
            <div aria-hidden="true" className="battle-versus">
              VS
            </div>
            <Combatant
              creature={match.state.cpu.activeCreature}
              emptyText="The CPU Creature remains hidden until the server reveals it."
              heading="CPU current Creature"
            />
          </section>

          <section
            className="cpu-hidden-state"
            aria-labelledby="cpu-hidden-title"
          >
            <h2 id="cpu-hidden-title">CPU deck information</h2>
            <p>
              {match.state.cpu.remainingCreatureCount} CPU Creature
              {match.state.cpu.remainingCreatureCount === 1 ? '' : 's'} remain.
              Unplayed identities and card details are hidden by the server.
            </p>
            <p>
              {match.state.cpu.remainingPowerCardCount} unplayed CPU Power card
              {match.state.cpu.remainingPowerCardCount === 1 ? '' : 's'} remain
              hidden.
            </p>
          </section>

          <ActionPanel
            busy={busy}
            match={match}
            onAction={(action) => void submitAction(action)}
          />
        </>
      )}

      {match.lastAction ? <OutcomePanel result={match.lastAction} /> : null}

      <div className="match-page-actions">
        <Link className="button button--quiet" href="/matches/history">
          Match history
        </Link>
        <Link className="button button--quiet" href="/matches">
          Battles
        </Link>
      </div>
    </div>
  );
}

function getMatchStatusMessage(match: CpuMatch) {
  if (match.status === 'completed') {
    return `Match completed. ${match.winner === 'player' ? 'You won.' : 'The CPU won.'} The result is saved.`;
  }
  if (match.state.phase === 'replacement') {
    return 'Your Creature was defeated. Choose a legal replacement.';
  }
  if (match.state.phase === 'initial_selection') {
    return 'Choose one of the server-provided initial Creatures.';
  }
  return match.state.currentSide === 'player'
    ? `Your turn. Match version ${match.version}.`
    : 'The server is resolving the CPU turn.';
}

function ActionPanel({
  busy,
  match,
  onAction,
}: {
  busy: boolean;
  match: CpuMatch;
  onAction: (action: CpuMatchIntent) => void;
}) {
  const selectionPhase =
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement';
  const active = match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );

  return (
    <section className="battle-actions" aria-labelledby="battle-actions-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Permitted intent</p>
          <h2 id="battle-actions-title">
            {selectionPhase
              ? match.state.phase === 'replacement'
                ? 'Choose a replacement'
                : 'Choose your first Creature'
              : 'Choose one legal action'}
          </h2>
        </div>
        {busy ? (
          <span className="battle-pending">Waiting for server…</span>
        ) : null}
      </div>

      {selectionPhase ? (
        <ul className="creature-choice-list" aria-label="Your Creature choices">
          {match.state.player.creatures.map((creature, index) => {
            const action: CpuMatchIntent = {
              creatureId: creature.id,
              type:
                match.state.phase === 'replacement'
                  ? 'select_replacement'
                  : 'select_initial_creature',
            };
            const legal = isLegalIntent(match, action);
            return (
              <li key={creature.id}>
                <CreatureSummary
                  creature={creature}
                  label={creatureLabel(creature, index)}
                />
                <button
                  aria-describedby={
                    legal ? undefined : `creature-${creature.id}-reason`
                  }
                  className="button"
                  disabled={busy || !legal}
                  onClick={() => onAction(action)}
                  type="button"
                >
                  {match.state.phase === 'replacement'
                    ? 'Use as replacement'
                    : 'Choose Creature'}
                  <span className="sr-only">
                    {' '}
                    {creatureLabel(creature, index)}
                  </span>
                </button>
                {!legal ? (
                  <small id={`creature-${creature.id}-reason`}>
                    {creature.defeated
                      ? 'Unavailable because the server reports this Creature defeated.'
                      : 'Not included in the current server-provided legal actions.'}
                  </small>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="normal-actions">
          <section aria-labelledby="move-actions-title">
            <h3 id="move-actions-title">Creature moves</h3>
            {active ? (
              <ul>
                {active.moves.map((move) => {
                  const action = { moveId: move.id, type: 'use_move' as const };
                  const legal = isLegalIntent(match, action);
                  return (
                    <li key={move.id}>
                      <div>
                        <strong>{move.name}</strong>
                        <span>
                          {titleCase(move.moveType)} move · {move.powerCost}{' '}
                          Power
                        </span>
                      </div>
                      <button
                        aria-describedby={
                          legal ? undefined : `move-${move.id}-reason`
                        }
                        className="button"
                        disabled={busy || !legal}
                        onClick={() => onAction(action)}
                        type="button"
                      >
                        Use {move.name}
                      </button>
                      {!legal ? (
                        <small id={`move-${move.id}-reason`}>
                          Not currently legal according to the server.
                        </small>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No active Creature is available for a move.</p>
            )}
          </section>

          <section aria-labelledby="power-actions-title">
            <h3 id="power-actions-title">Power cards</h3>
            <ul>
              {match.state.player.powerCards.map((card, index) => {
                const action = {
                  powerCardId: card.id,
                  type: 'use_power_card' as const,
                };
                const legal = isLegalIntent(match, action);
                return (
                  <li key={card.id}>
                    <div>
                      <strong>
                        {titleCase(card.affinity)} Power card {index + 1}
                      </strong>
                      <span>
                        {card.available ? 'Available' : 'Already used'}
                      </span>
                    </div>
                    <button
                      aria-describedby={
                        legal ? undefined : `power-${card.id}-reason`
                      }
                      className="button"
                      disabled={busy || !legal}
                      onClick={() => onAction(action)}
                      type="button"
                    >
                      Use Power card {index + 1}
                    </button>
                    {!legal ? (
                      <small id={`power-${card.id}-reason`}>
                        Not currently legal according to the server.
                      </small>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}

function Combatant({
  creature,
  emptyText,
  heading,
}: {
  creature: MatchCreature | null;
  emptyText: string;
  heading: string;
}) {
  return (
    <article className="combatant">
      <p className="eyebrow">{heading}</p>
      {creature ? (
        <>
          <h2>{titleCase(creature.affinity)} Creature</h2>
          <CreatureSummary
            creature={creature}
            label={`${titleCase(creature.affinity)} Creature`}
          />
        </>
      ) : (
        <div className="hidden-card" role="img" aria-label={emptyText}>
          <strong>Identity hidden</strong>
          <p>{emptyText}</p>
        </div>
      )}
    </article>
  );
}

function CreatureSummary({
  creature,
  label,
}: {
  creature: MatchCreature;
  label: string;
}) {
  return (
    <div
      className={`creature-summary${creature.defeated ? ' creature-summary--defeated' : ''}`}
    >
      <strong>{label}</strong>
      <span>
        {creature.defeated ? 'Defeated' : 'Available'} ·{' '}
        {titleCase(creature.affinity)} affinity
      </span>
      <label>
        HP {creature.currentHp} of {creature.maxHp}
        <progress max={creature.maxHp} value={creature.currentHp} />
      </label>
      <span>
        Power {creature.remainingPower} of {creature.maxPower}
      </span>
    </div>
  );
}

function OutcomePanel({ result }: { result: MatchActionResult }) {
  return (
    <section className="outcome-panel" aria-labelledby="last-outcome-title">
      <p className="eyebrow">Latest authoritative outcome</p>
      <h2 id="last-outcome-title">{describeAction(result)}</h2>
      {result.effects.length === 0 ? (
        <p>No stat effect was returned for this action.</p>
      ) : (
        <ul>
          {result.effects.map((effect) => (
            <li key={effect.effectId}>
              {sideLabel(effect.targetSide)} received {effect.effectType}{' '}
              {effect.amount}.
            </li>
          ))}
        </ul>
      )}
      {result.defeatedCreatureId ? (
        <p>
          <strong>A Creature was defeated.</strong> The server determines
          whether replacement or completion follows.
        </p>
      ) : null}
      {result.winner ? (
        <p>
          <strong>{sideLabel(result.winner)} won the match.</strong>
        </p>
      ) : null}
    </section>
  );
}

function CompletedMatch({ match }: { match: CpuMatch }) {
  return (
    <section
      className={`completed-match completed-match--${match.winner}`}
      aria-labelledby="completed-match-title"
    >
      <p className="eyebrow">Persisted final result</p>
      <h2 id="completed-match-title">
        {match.winner === 'player'
          ? 'Victory — match saved'
          : 'CPU victory — match saved'}
      </h2>
      <p>
        This is the server-returned final result. Refreshing this route will
        load the same completed match; no score or statistics are reconstructed
        in the browser.
      </p>
      <dl>
        <div>
          <dt>Winner</dt>
          <dd>{match.winner ? sideLabel(match.winner) : 'Not returned'}</dd>
        </div>
        <div>
          <dt>Final turn</dt>
          <dd>{match.state.turnNumber}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>
            {match.completedAt ? formatDate(match.completedAt) : 'Not returned'}
          </dd>
        </div>
      </dl>
      <Link className="button" href="/matches/history">
        Open saved match history
      </Link>
    </section>
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

function getPhaseDescription(match: CpuMatch) {
  if (match.status === 'completed')
    return 'The authoritative result is saved in your private match history.';
  if (match.state.phase === 'initial_selection')
    return 'Select only from the initial choices returned in legalActions.';
  if (match.state.phase === 'replacement')
    return 'The server reports a defeat. Choose one currently legal replacement; replacement does not consume the resumed normal turn.';
  if (match.state.turnDeadline)
    return `The server deadline for this turn is ${formatDate(match.state.turnDeadline)}. A late intent may be stored as a timeout by the API.`;
  return 'Waiting for the authoritative next action state.';
}

function describeAction(result: MatchActionResult) {
  const actor = sideLabel(result.side);
  const labels: Record<MatchActionResult['action']['type'], string> = {
    select_initial_creature: 'selected an opening Creature',
    select_replacement: 'accepted a replacement Creature',
    timeout: 'turn ended by server timeout',
    use_move: 'used a Creature move',
    use_power_card: 'used a Power card',
  };
  return `${actor} ${labels[result.action.type]}`;
}

function creatureLabel(creature: MatchCreature, index: number) {
  return `${titleCase(creature.affinity)} Creature ${index + 1}`;
}

function sideLabel(side: 'cpu' | 'player') {
  return side === 'player' ? 'Player' : 'CPU';
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function toMatchError(error: unknown) {
  return error instanceof MatchApiError
    ? error
    : new MatchApiError('unavailable');
}
