import { useRef, useState, type KeyboardEvent } from 'react';

import type {
  CpuMatchIntent,
  MatchCreature,
  MatchPowerCard,
} from '../../api/matches';
import {
  describeActiveModifier,
  describeEffect,
} from '../../battle/effect-presentation';

export type BattleActionIntent = CpuMatchIntent;

interface BattleActionPanelProps {
  activeCreatureId: string | null;
  busy: boolean;
  creatures: MatchCreature[];
  currentActor: boolean;
  idPrefix: string;
  legalActions: readonly BattleActionIntent[];
  onAction: (action: BattleActionIntent) => void;
  opponentLabel: string;
  phase: 'active' | 'initial_selection' | 'replacement';
  powerCards: MatchPowerCard[];
}

export function BattleActionPanel({
  activeCreatureId,
  busy,
  creatures,
  currentActor,
  idPrefix,
  legalActions,
  onAction,
  opponentLabel,
  phase,
  powerCards,
}: BattleActionPanelProps) {
  const [category, setCategory] = useState<'moves' | 'power'>('moves');
  const movesTab = useRef<HTMLButtonElement | null>(null);
  const powerTab = useRef<HTMLButtonElement | null>(null);
  const opponentReplacement = phase === 'replacement' && !currentActor;
  const selectionPhase =
    phase === 'initial_selection' || (phase === 'replacement' && currentActor);
  const active = creatures.find((creature) => creature.id === activeCreatureId);
  const isLegal = (intent: BattleActionIntent) =>
    legalActions.some((legal) => sameIntent(legal, intent));
  const legalMoveCount = active
    ? active.moves.filter((move) =>
        isLegal({ moveId: move.id, type: 'use_move' }),
      ).length
    : 0;
  const legalPowerCount = powerCards.filter((card) =>
    isLegal({ powerCardId: card.id, type: 'use_power_card' }),
  ).length;
  const waiting = !selectionPhase && !currentActor;
  const creatureChoices = selectionPhase
    ? creatures
        .map((creature, index) => {
          const action: BattleActionIntent = {
            creatureId: creature.id,
            type:
              phase === 'replacement'
                ? 'select_replacement'
                : 'select_initial_creature',
          };
          return { action, creature, index, legal: isLegal(action) };
        })
        .sort((left, right) => Number(right.legal) - Number(left.legal))
    : [];
  const panelId = `${idPrefix}-battle-actions`;
  const movesTabId = `${idPrefix}-move-actions-tab`;
  const powerTabId = `${idPrefix}-power-actions-tab`;

  function selectCategory(next: 'moves' | 'power', moveFocus = false) {
    setCategory(next);
    if (moveFocus) {
      queueMicrotask(() =>
        (next === 'moves' ? movesTab.current : powerTab.current)?.focus(),
      );
    }
  }

  function handleCategoryKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'moves'
        : event.key === 'End'
          ? 'power'
          : event.key === 'ArrowLeft'
            ? category === 'moves'
              ? 'power'
              : 'moves'
            : category === 'power'
              ? 'moves'
              : 'power';
    selectCategory(next, true);
  }

  return (
    <section
      aria-busy={busy}
      aria-labelledby={panelId}
      className={`battle-actions${selectionPhase ? ' battle-actions--selection' : ''}`}
    >
      <div className="battle-actions__heading">
        <div>
          <p className="eyebrow">
            {waiting ? 'Battle controls' : 'Your action'}
          </p>
          <h2 id={panelId}>
            {opponentReplacement
              ? `${opponentLabel} is choosing a replacement`
              : selectionPhase
                ? phase === 'replacement'
                  ? 'Choose a replacement'
                  : 'Choose your first Creature'
                : waiting
                  ? 'Actions paused'
                  : 'Choose one legal action'}
          </h2>
        </div>
        {busy ? (
          <span className="battle-pending">Waiting for server…</span>
        ) : null}
      </div>

      {opponentReplacement ? (
        <div className="battle-action-content">
          <p className="battle-action-guidance" role="status">
            Waiting for {opponentLabel} to choose a replacement.
          </p>
        </div>
      ) : selectionPhase ? (
        <ul
          aria-label="Your Creature choices"
          className="battle-action-content creature-choice-list"
        >
          {creatureChoices.map(({ action, creature, index, legal }) => {
            const label = creatureLabel(creature, index);
            const reasonId = `${idPrefix}-creature-${creature.id}-reason`;
            return (
              <li key={creature.id}>
                <button
                  aria-describedby={legal ? undefined : reasonId}
                  aria-label={`${phase === 'replacement' ? 'Use as replacement' : 'Choose Creature'} ${label}. ${titleCase(creature.affinity)} affinity. HP ${creature.currentHp} of ${creature.maxHp}. Power ${creature.remainingPower} of ${creature.maxPower}.`}
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
                      {creature.activeModifiers.map((modifier, index) => (
                        <span key={index} role="listitem">
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
                  <small id={reasonId}>
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
              aria-controls={`${idPrefix}-move-actions-panel`}
              aria-selected={category === 'moves'}
              id={movesTabId}
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
              aria-controls={`${idPrefix}-power-actions-panel`}
              aria-selected={category === 'power'}
              id={powerTabId}
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
            {waiting ? (
              <p className="battle-action-guidance" role="status">
                Actions unlock when the server returns your turn after{' '}
                {opponentLabel} acts.
              </p>
            ) : null}

            <section
              aria-labelledby={movesTabId}
              hidden={category !== 'moves'}
              id={`${idPrefix}-move-actions-panel`}
              role="tabpanel"
            >
              {active ? (
                <ul className="battle-action-list">
                  {active.moves.map((move) => {
                    const action = {
                      moveId: move.id,
                      type: 'use_move' as const,
                    };
                    const legal = isLegal(action);
                    const reasonId = `${idPrefix}-move-${move.id}-reason`;
                    return (
                      <li key={move.id}>
                        <button
                          aria-describedby={legal ? undefined : reasonId}
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
                          <small id={reasonId}>
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
              aria-labelledby={powerTabId}
              hidden={category !== 'power'}
              id={`${idPrefix}-power-actions-panel`}
              role="tabpanel"
            >
              {powerCards.length > 0 ? (
                <ul className="battle-action-list">
                  {powerCards.map((card) => {
                    const action = {
                      powerCardId: card.id,
                      type: 'use_power_card' as const,
                    };
                    const legal = isLegal(action);
                    const reasonId = `${idPrefix}-power-${card.id}-reason`;
                    return (
                      <li key={card.id}>
                        <button
                          aria-describedby={legal ? undefined : reasonId}
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
                                card.effects.map((effect, index) => (
                                  <span key={index}>
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
                          <small id={reasonId}>
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

export function BattleCombatant({
  creature,
  emptyText,
  heading,
  isActing,
  visualSide,
}: {
  creature: MatchCreature | null;
  emptyText: string;
  heading: string;
  isActing: boolean;
  visualSide: 'cpu' | 'player';
}) {
  return (
    <article
      className={`combatant combatant--${visualSide}${isActing ? ' combatant--acting' : ''}`}
    >
      <div aria-hidden="true" className="combatant__presence">
        <div className="combatant__sigil">
          <span>
            {creature
              ? creatureMonogram(creature.name)
              : visualSide === 'cpu'
                ? '?'
                : '—'}
          </span>
          <small>
            {creature
              ? titleCase(creature.affinity)
              : visualSide === 'cpu'
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
              <section
                aria-label={`Active effects on ${creature.name}`}
                className="active-effects"
              >
                <strong>Active effects</strong>
                <ul>
                  {creature.activeModifiers.map((modifier, index) => (
                    <li key={index}>{describeActiveModifier(modifier)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <div aria-label={emptyText} className="hidden-card" role="img">
            <strong>
              {visualSide === 'cpu' ? 'Creature hidden' : 'No active Creature'}
            </strong>
            <p>{emptyText}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function sameIntent(left: BattleActionIntent, right: BattleActionIntent) {
  if (left.type !== right.type) return false;
  if ('creatureId' in left && 'creatureId' in right)
    return left.creatureId === right.creatureId;
  if ('moveId' in left && 'moveId' in right)
    return left.moveId === right.moveId;
  if ('powerCardId' in left && 'powerCardId' in right)
    return left.powerCardId === right.powerCardId;
  return false;
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
    .join('');
  return initials.toUpperCase() || '?';
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
