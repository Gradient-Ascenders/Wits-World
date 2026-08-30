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
  MatchApiError,
  submitCpuMatchAction,
  type BattleLogEvent,
  type CpuMatch,
  type CpuMatchIntent,
  type MatchCreature,
} from '../api/matches';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { MatchErrorState } from '../components/matches/MatchErrorState';
import {
  describeActiveModifier,
  describeEffect,
} from '../battle/effect-presentation';
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
  const phasePrompt = getPhasePrompt(match);
  const turnIndicator = getTurnIndicator(match, busy);
  const selectionPhase =
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement';
  const activePlayerCreature = match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );

  return (
    <div
      className={`matches-page battle-page battle-page--${match.status === 'completed' ? 'completed' : 'live'}`}
    >
      <p aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </p>

      <header className="battle-header">
        <Link className="battle-back-link" href="/matches">
          <span aria-hidden="true">←</span> Battles
        </Link>

        <div className="battle-header__phase">
          <div className="battle-header__context">
            <p className="eyebrow">CPU battle</p>
            <span>Turn {match.state.turnNumber}</span>
          </div>
          <div className="battle-header__title-row">
            <h1 ref={phaseHeading} tabIndex={-1}>
              {phaseTitle}
            </h1>
            {turnIndicator ? (
              <span className="battle-turn-indicator">{turnIndicator}</span>
            ) : null}
          </div>
          {phasePrompt ? (
            <p className="battle-phase-prompt">{phasePrompt}</p>
          ) : null}
        </div>
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
              <Combatant
                creature={activePlayerCreature ?? null}
                emptyText={
                  match.state.phase === 'replacement'
                    ? 'Defeated Creature removed. Choose a replacement.'
                    : 'Choose your initial Creature.'
                }
                heading="You"
                isActing={match.state.currentSide === 'player'}
                side="player"
              />
              <div aria-hidden="true" className="battle-versus">
                VS
              </div>
              <Combatant
                creature={match.state.cpu.activeCreature}
                emptyText="The CPU Creature remains hidden until the server reveals it."
                heading="CPU"
                isActing={match.state.currentSide === 'cpu'}
                side="cpu"
              />
            </div>
          </section>

          <ActionPanel
            busy={busy}
            key={`${match.state.phase}:${activePlayerCreature?.id ?? 'none'}`}
            match={match}
            onAction={(action) => void submitAction(action)}
          />

          <BattleSideRail match={match} />
        </div>
      )}
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

function BattleSideRail({ match }: { match: CpuMatch }) {
  return (
    <aside aria-label="Battle history and details" className="battle-side-rail">
      <header className="battle-side-rail__heading">
        <div>
          <p className="eyebrow">Authoritative record</p>
          <h2>Battle log</h2>
        </div>
        <Link
          aria-label="Match history"
          className="battle-side-rail__history"
          href="/matches/history"
        >
          Full history <span aria-hidden="true">→</span>
        </Link>
      </header>

      <BattleLog groups={match.battleLog} />

      <BattleDetails match={match} />
      <CpuReserveSummary match={match} />
    </aside>
  );
}

function BattleLog({ groups }: { groups: CpuMatch['battleLog'] }) {
  const body = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 64rem)').matches,
  );
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

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 64rem)');
    const syncWithViewport = () => setOpen(media.matches);
    media.addEventListener('change', syncWithViewport);
    return () => media.removeEventListener('change', syncWithViewport);
  }, []);

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
          Latest outcome
          <strong>
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </strong>
        </span>
        <span className="battle-log__preview">
          {latest.length > 0
            ? latest.map(({ message }) => message).join(' ')
            : 'No actions recorded yet.'}
        </span>
      </summary>

      <div
        aria-label="Complete authoritative battle log"
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
            <span>
              Server outcomes will appear here after the first choice.
            </span>
          </div>
        ) : (
          <ol className="battle-log__groups">
            {groups.map((group) => (
              <li className="battle-log__group" key={group.id}>
                <h3>{group.label}</h3>
                <ol>
                  {group.events.map((event) => (
                    <li
                      className={`battle-log__event battle-log__event--${event.kind} battle-log__event--${event.side ?? 'neutral'}`}
                      key={event.id}
                    >
                      {event.message}
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

function BattleDetails({ match }: { match: CpuMatch }) {
  return (
    <details
      className="battle-details battle-rail-card"
      onKeyDown={closeDisclosureOnEscape}
    >
      <summary>
        <span>Battle details</span>
        <strong>
          Turn {match.state.turnNumber} · v{match.version}
        </strong>
      </summary>
      <div className="battle-details__panel">
        <dl className="battle-meta">
          <div>
            <dt>Match version</dt>
            <dd>{match.version}</dd>
          </div>
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
          <div>
            <dt>Server deadline</dt>
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
      <p>
        Unplayed CPU identities and card details remain intentionally hidden by
        the server.
      </p>
    </details>
  );
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
  const [category, setCategory] = useState<'moves' | 'power'>('moves');
  const movesTab = useRef<HTMLButtonElement | null>(null);
  const powerTab = useRef<HTMLButtonElement | null>(null);
  const selectionPhase =
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement';
  const active = match.state.player.creatures.find(
    (creature) => creature.id === match.state.player.activeCreatureId,
  );
  const legalMoveCount = active
    ? active.moves.filter((move) =>
        isLegalIntent(match, { moveId: move.id, type: 'use_move' }),
      ).length
    : 0;
  const legalPowerCount = match.state.player.powerCards.filter((card) =>
    isLegalIntent(match, {
      powerCardId: card.id,
      type: 'use_power_card',
    }),
  ).length;
  const cpuResolving = !selectionPhase && match.state.currentSide !== 'player';
  const creatureChoices = selectionPhase
    ? match.state.player.creatures
        .map((creature, index) => {
          const action: CpuMatchIntent = {
            creatureId: creature.id,
            type:
              match.state.phase === 'replacement'
                ? 'select_replacement'
                : 'select_initial_creature',
          };
          return {
            action,
            creature,
            index,
            legal: isLegalIntent(match, action),
          };
        })
        .sort((left, right) => Number(right.legal) - Number(left.legal))
    : [];

  function selectCategory(next: 'moves' | 'power', moveFocus = false) {
    setCategory(next);
    if (moveFocus) {
      queueMicrotask(() =>
        (next === 'moves' ? movesTab.current : powerTab.current)?.focus(),
      );
    }
  }

  function handleCategoryKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let next: 'moves' | 'power';
    if (event.key === 'Home') {
      next = 'moves';
    } else if (event.key === 'End') {
      next = 'power';
    } else if (event.key === 'ArrowLeft') {
      next = category === 'moves' ? 'power' : 'moves';
    } else {
      next = category === 'power' ? 'moves' : 'power';
    }
    selectCategory(next, true);
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby="battle-actions-title"
      className={`battle-actions${selectionPhase ? ' battle-actions--selection' : ''}`}
    >
      <div className="battle-actions__heading">
        <div>
          <p className="eyebrow">
            {cpuResolving ? 'Battle controls' : 'Your action'}
          </p>
          <h2 id="battle-actions-title">
            {selectionPhase
              ? match.state.phase === 'replacement'
                ? 'Choose a replacement'
                : 'Choose your first Creature'
              : cpuResolving
                ? 'Actions paused'
                : 'Choose one legal action'}
          </h2>
        </div>
        {busy ? (
          <span className="battle-pending">Waiting for server…</span>
        ) : null}
      </div>

      {selectionPhase ? (
        <ul
          className="battle-action-content creature-choice-list"
          aria-label="Your Creature choices"
        >
          {creatureChoices.map(({ action, creature, index, legal }) => {
            const label = creatureLabel(creature, index);
            return (
              <li key={creature.id}>
                <button
                  aria-describedby={
                    legal ? undefined : `creature-${creature.id}-reason`
                  }
                  aria-label={`${match.state.phase === 'replacement' ? 'Use as replacement' : 'Choose Creature'} ${label}. ${titleCase(creature.affinity)} affinity. HP ${creature.currentHp} of ${creature.maxHp}. Power ${creature.remainingPower} of ${creature.maxPower}.`}
                  className="creature-choice-control"
                  disabled={busy || !legal}
                  onClick={() => onAction(action)}
                  type="button"
                >
                  <span className="creature-choice-control__heading">
                    <strong>{label}</strong>
                    <span>{titleCase(creature.affinity)}</span>
                  </span>
                  <span className="creature-choice-control__vitals">
                    <span className="creature-choice-control__hp">
                      <span>
                        <span>HP</span>
                        <strong>
                          {creature.currentHp} / {creature.maxHp}
                        </strong>
                      </span>
                      <progress
                        aria-label={`${label} HP`}
                        max={creature.maxHp}
                        value={creature.currentHp}
                      />
                    </span>
                    <span className="creature-choice-control__power">
                      <span>Power</span>
                      <strong>
                        {creature.remainingPower} / {creature.maxPower}
                      </strong>
                    </span>
                  </span>
                  {creature.activeModifiers.length > 0 ? (
                    <span
                      aria-label={`Active effects on ${label}`}
                      className="creature-choice-control__effects"
                      role="list"
                    >
                      {creature.activeModifiers.map((modifier, effectIndex) => (
                        <span key={effectIndex} role="listitem">
                          {describeActiveModifier(modifier)}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="creature-choice-control__cue"
                  >
                    {busy ? 'Waiting…' : legal ? 'Select' : 'Unavailable'}
                    {legal && !busy ? <span>→</span> : null}
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
        <div className="battle-action-browser">
          <div
            aria-label="Action type"
            className="battle-action-switch"
            role="tablist"
          >
            <button
              aria-controls="move-actions-panel"
              aria-selected={category === 'moves'}
              id="move-actions-tab"
              onClick={() => selectCategory('moves')}
              onKeyDown={handleCategoryKeyDown}
              ref={movesTab}
              role="tab"
              tabIndex={category === 'moves' ? 0 : -1}
              type="button"
            >
              Moves <span>{legalMoveCount}</span>
            </button>
            <button
              aria-controls="power-actions-panel"
              aria-selected={category === 'power'}
              id="power-actions-tab"
              onClick={() => selectCategory('power')}
              onKeyDown={handleCategoryKeyDown}
              ref={powerTab}
              role="tab"
              tabIndex={category === 'power' ? 0 : -1}
              type="button"
            >
              Power <span>{legalPowerCount}</span>
            </button>
          </div>

          <div className="battle-action-content">
            {cpuResolving ? (
              <p className="battle-action-guidance" role="status">
                Actions unlock when the server returns your turn.
              </p>
            ) : null}

            <section
              aria-labelledby="move-actions-tab"
              hidden={category !== 'moves'}
              id="move-actions-panel"
              role="tabpanel"
            >
              {active ? (
                <ul className="battle-action-list">
                  {active.moves.map((move) => {
                    const action = {
                      moveId: move.id,
                      type: 'use_move' as const,
                    };
                    const legal = isLegalIntent(match, action);
                    return (
                      <li key={move.id}>
                        <button
                          aria-describedby={
                            legal ? undefined : `move-${move.id}-reason`
                          }
                          className="battle-action-control"
                          disabled={busy || !legal}
                          onClick={() => onAction(action)}
                          type="button"
                        >
                          <span className="battle-action-control__heading">
                            <strong>{move.name}</strong>
                            <span>{titleCase(move.moveType)}</span>
                          </span>
                          <span className="battle-action-control__detail">
                            <span className="battle-effect-list">
                              {move.effects.length > 0 ? (
                                move.effects.map((effect, index) => (
                                  <span key={index}>
                                    {describeEffect(effect)}
                                  </span>
                                ))
                              ) : (
                                <span>Effect details unavailable</span>
                              )}
                            </span>
                            <span className="battle-action-control__cost">
                              {move.powerCost} Power
                            </span>
                          </span>
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
                <p className="battle-action-guidance">
                  No active Creature is available for a move.
                </p>
              )}
            </section>

            <section
              aria-labelledby="power-actions-tab"
              hidden={category !== 'power'}
              id="power-actions-panel"
              role="tabpanel"
            >
              {match.state.player.powerCards.length > 0 ? (
                <ul className="battle-action-list">
                  {match.state.player.powerCards.map((card) => {
                    const action = {
                      powerCardId: card.id,
                      type: 'use_power_card' as const,
                    };
                    const legal = isLegalIntent(match, action);
                    return (
                      <li key={card.id}>
                        <button
                          aria-describedby={
                            legal ? undefined : `power-${card.id}-reason`
                          }
                          className="battle-action-control battle-action-control--power"
                          disabled={busy || !legal}
                          onClick={() => onAction(action)}
                          type="button"
                        >
                          <span className="battle-action-control__heading">
                            <strong>{card.name}</strong>
                            <span>{titleCase(card.affinity)}</span>
                          </span>
                          <span className="battle-action-control__detail">
                            <span className="battle-effect-list">
                              {card.effects.length > 0 ? (
                                card.effects.map((effect, effectIndex) => (
                                  <span key={effectIndex}>
                                    {describeEffect(effect)}
                                  </span>
                                ))
                              ) : (
                                <span>Effect details unavailable</span>
                              )}
                            </span>
                            <span className="battle-action-control__availability">
                              {!card.available
                                ? 'Already used'
                                : legal
                                  ? 'Available · One use'
                                  : 'Unavailable · One use'}
                            </span>
                          </span>
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
              ) : (
                <p className="battle-action-guidance">
                  No Power cards remain in your match deck.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

function Combatant({
  creature,
  emptyText,
  heading,
  isActing,
  side,
}: {
  creature: MatchCreature | null;
  emptyText: string;
  heading: string;
  isActing: boolean;
  side: 'cpu' | 'player';
}) {
  return (
    <article
      className={`combatant combatant--${side}${isActing ? ' combatant--acting' : ''}`}
    >
      <div aria-hidden="true" className="combatant__presence">
        <div className="combatant__sigil">
          <span>
            {creature
              ? creatureMonogram(creature.name)
              : side === 'cpu'
                ? '?'
                : '—'}
          </span>
          <small>
            {creature
              ? titleCase(creature.affinity)
              : side === 'cpu'
                ? 'Hidden'
                : 'Awaiting'}
          </small>
        </div>
        <span className="combatant__platform" />
      </div>

      <div className="combatant__hud">
        <div className="combatant__heading">
          <p className="eyebrow">{heading}</p>
          {creature ? (
            <span>{titleCase(creature.affinity)} affinity</span>
          ) : null}
        </div>
        {creature ? (
          <>
            <h2>{creature.name}</h2>
            <div className="combatant__vitals">
              <div className="combatant__meter">
                <span>HP</span>
                <strong>
                  {creature.currentHp} / {creature.maxHp}
                </strong>
                <progress
                  aria-label={`${creature.name} HP`}
                  max={creature.maxHp}
                  value={creature.currentHp}
                />
              </div>
              <div className="combatant__power">
                <span>Power</span>
                <strong>
                  {creature.remainingPower} / {creature.maxPower}
                </strong>
              </div>
            </div>
            {creature.activeModifiers.length > 0 ? (
              <ActiveEffects
                label={creature.name}
                modifiers={creature.activeModifiers}
              />
            ) : null}
          </>
        ) : (
          <div className="hidden-card" role="img" aria-label={emptyText}>
            <strong>
              {side === 'cpu' ? 'Creature hidden' : 'No active Creature'}
            </strong>
            <p>{emptyText}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function ActiveEffects({
  label,
  modifiers,
}: {
  label: string;
  modifiers: MatchCreature['activeModifiers'];
}) {
  return (
    <section
      aria-label={`Active effects on ${label}`}
      className="active-effects"
    >
      <strong>Active effects</strong>
      <ul>
        {modifiers.map((modifier, index) => (
          <li key={index}>{describeActiveModifier(modifier)}</li>
        ))}
      </ul>
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
      <details className="completed-match__context">
        <summary>About this result</summary>
        <p>
          This is the server-returned final result. Refreshing this route will
          load the same completed match; no score or statistics are
          reconstructed in the browser.
        </p>
      </details>
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

function getTurnIndicator(match: CpuMatch, busy: boolean) {
  if (match.status === 'completed') return 'Completed';
  if (busy) return 'Waiting for server';
  if (
    match.state.phase === 'initial_selection' ||
    match.state.phase === 'replacement'
  ) {
    return null;
  }
  return match.state.currentSide === 'player' ? 'Action ready' : 'CPU acting';
}

function getPhasePrompt(match: CpuMatch) {
  if (match.state.phase === 'initial_selection') return null;
  if (match.state.phase === 'replacement') {
    return 'Your active Creature was defeated. Choose a legal replacement.';
  }
  if (match.status !== 'completed' && match.state.currentSide === 'cpu') {
    return 'Your controls remain locked until the server returns your turn.';
  }
  return null;
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

function creatureLabel(creature: MatchCreature, index: number) {
  const genericName = `${titleCase(creature.affinity)} Creature`;
  return creature.name === genericName
    ? `${genericName} ${index + 1}`
    : creature.name;
}

function creatureMonogram(name: string) {
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  return initials || '?';
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
