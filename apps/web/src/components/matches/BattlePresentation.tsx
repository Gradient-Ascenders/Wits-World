import { CardFrame } from '../cards/CardFrame';
import { battleArtwork } from '../../battle/card-artwork';
import { useCreatureSheet } from './useCreatureSheet';
import {
  ArrowRight,
  CaretDown,
  Heart,
  Lightning,
  Shield,
  Sword,
  TrendDown,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import type {
  CpuMatchIntent,
  MatchEffect,
  MatchCreature,
  MatchPowerCard,
} from '../../api/matches';
import {
  describeActiveModifier,
  describeEffect,
} from '../../battle/effect-presentation';

export type BattleActionIntent = CpuMatchIntent;
export type BattleFeedbackTone =
  'action' | 'cost' | 'damage' | 'defeat' | 'heal' | 'status';

interface BattleActionPanelProps {
  activeCreatureId: string | null;
  busy: boolean;
  creatures: MatchCreature[];
  currentActor: boolean;
  idPrefix: string;
  inputBlocked?: boolean;
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
  inputBlocked = false,
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
  const waiting = !currentActor;
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
          <h2 id={panelId}>
            {opponentReplacement
              ? `${opponentLabel} is choosing a replacement`
              : selectionPhase
                ? phase === 'replacement'
                  ? 'Choose a replacement'
                  : 'Choose your first Creature'
                : waiting
                  ? 'Actions paused'
                  : 'Choose your action'}
          </h2>
        </div>
        {busy ? <span className="battle-pending">Applying action…</span> : null}
      </div>

      {phase === 'replacement' && currentActor ? (
        <p className="battle-action-guidance">
          Choose a Creature to return to battle. Only available replacements can
          be selected.
        </p>
      ) : null}
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
                  aria-disabled={!legal || undefined}
                  aria-label={`${phase === 'replacement' ? 'Use as replacement' : 'Choose Creature'} ${label}. ${titleCase(creature.affinity)} affinity. HP ${creature.currentHp} of ${creature.maxHp}. Power ${creature.remainingPower} of ${creature.maxPower}.`}
                  className="creature-choice-control"
                  disabled={busy || inputBlocked || !currentActor}
                  onClick={() => {
                    if (legal) onAction(action);
                  }}
                  type="button"
                >
                  <span
                    className="creature-choice-control__artwork"
                    aria-hidden="true"
                  >
                    <BattleCreatureArtwork creature={creature} />
                  </span>
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
                    {legal && !busy ? (
                      <ArrowRight size={20} aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
                {!legal ? (
                  <small id={reasonId}>
                    {creature.defeated
                      ? 'This Creature is defeated.'
                      : 'This Creature cannot be selected right now.'}
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
              <Sword size={20} aria-hidden="true" /> Moves{' '}
              <span>{legalMoveCount}</span>
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
              <Lightning size={20} aria-hidden="true" /> Power{' '}
              <span>{legalPowerCount}</span>
            </button>
          </div>

          <div className="battle-action-content">
            {waiting ? (
              <p className="battle-action-guidance" role="status">
                Your actions will be available after {opponentLabel} acts.
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
                          aria-disabled={!legal || undefined}
                          className="battle-action-control"
                          disabled={busy || inputBlocked || !currentActor}
                          onClick={() => {
                            if (legal) onAction(action);
                          }}
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
                                  <BattleEffectPreview
                                    effect={effect}
                                    key={index}
                                  />
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
                            {waiting
                              ? 'Available actions update on your turn.'
                              : move.powerCost > active.remainingPower
                                ? `Costs ${move.powerCost} Power; ${active.remainingPower} remaining.`
                                : 'Unavailable this turn.'}
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
                          aria-disabled={!legal || undefined}
                          className="battle-action-control battle-action-control--power"
                          disabled={busy || inputBlocked || !currentActor}
                          onClick={() => {
                            if (legal) onAction(action);
                          }}
                          type="button"
                        >
                          <span className="battle-action-control__heading">
                            <strong>{card.name}</strong>
                            <span>
                              {card.affinity
                                ? titleCase(card.affinity)
                                : 'Typeless'}
                            </span>
                          </span>
                          <span className="battle-action-control__detail">
                            <span className="battle-effect-list">
                              {card.effects.length > 0 ? (
                                card.effects.map((effect, index) => (
                                  <BattleEffectPreview
                                    effect={effect}
                                    key={index}
                                  />
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
                            {waiting
                              ? 'Available actions update on your turn.'
                              : 'Unavailable this turn.'}
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
  feedbackKey,
  feedbackText,
  feedbackTone,
  visualSide,
}: {
  creature: MatchCreature | null;
  emptyText: string;
  heading: string;
  isActing: boolean;
  feedbackKey?: string;
  feedbackText?: string;
  feedbackTone?: BattleFeedbackTone;
  visualSide: 'cpu' | 'player';
}) {
  return (
    <article
      className={`combatant combatant--${visualSide}${isActing ? ' combatant--acting' : ''}${creature?.defeated ? ' combatant--defeated' : ''}`}
      data-feedback={feedbackTone}
    >
      <div className="combatant__presence">
        {creature ? (
          <CreatureDetailsPicture creature={creature} />
        ) : (
          <div className="combatant__sigil" aria-hidden="true">
            <span>{visualSide === 'cpu' ? '?' : '—'}</span>
          </div>
        )}
        {feedbackText ? (
          <span
            aria-hidden="true"
            className="combatant__feedback"
            key={feedbackKey}
          >
            {feedbackText}
          </span>
        ) : null}
      </div>
      <div className="combatant__hud">
        {creature ? <h2>{creature.name}</h2> : null}
        <div className="combatant__heading">
          <p className="combatant__side">
            {heading}
            {isActing ? ' · Active turn' : ''}
          </p>
          {creature ? (
            <span>{titleCase(creature.affinity)} affinity</span>
          ) : null}
        </div>
        {creature ? (
          <>
            {creature.defeated ? (
              <strong className="combatant__defeated">Defeated</strong>
            ) : null}
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

export function BattleBench({
  creatures,
  activeCreatureId,
}: {
  creatures: MatchCreature[];
  activeCreatureId: string | null;
}) {
  const bench = creatures.filter(
    (creature) => creature.id !== activeCreatureId,
  );
  return (
    <details className="battle-bench battle-rail-card">
      <summary>
        <span>Your bench</span>
        <span>
          {bench.length} Creatures <CaretDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <ul aria-label="Your bench Creatures">
        {bench.map((creature) => (
          <li key={creature.id}>
            <CreatureDetailsPicture creature={creature} />
            <div className="battle-bench__creature">
              <strong>
                {creatureLabel(creature, creatures.indexOf(creature))}
              </strong>
              <span>
                {creature.defeated
                  ? 'Defeated'
                  : `${titleCase(creature.affinity)} affinity`}
              </span>
              <span>
                HP {creature.currentHp} / {creature.maxHp} · Power{' '}
                {creature.remainingPower} / {creature.maxPower}
              </span>
              {creature.activeModifiers.map((modifier, index) => (
                <span key={index}>{describeActiveModifier(modifier)}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CreatureDetailsPicture({ creature }: { creature: MatchCreature }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useCreatureSheet(dialog, open);
  return (
    <>
      <button
        className="battle-picture-button"
        type="button"
        aria-label={`View ${creature.name} details`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BattleCreatureArtwork creature={creature} />
      </button>
      {open &&
        createPortal(
          <dialog
            className="battle-creature-dialog"
            ref={dialog}
            aria-labelledby={titleId}
            onClose={() => setOpen(false)}
          >
            <header>
              <span
                className="battle-creature-dialog__handle"
                aria-hidden="true"
              />
              <div>
                <h2 id={titleId}>{creature.name}</h2>
                <p className="battle-creature-dialog__subtitle">
                  {titleCase(creature.rarity)} Creature ·{' '}
                  {titleCase(creature.affinity)} affinity
                </p>
              </div>
              <button
                className="button button--quiet"
                type="button"
                aria-label="Close Creature details"
                onClick={() => dialog.current?.close()}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </header>
            <div className="battle-creature-dialog__body">
              <div className="battle-creature-dialog__overview">
                <BattleCreatureArtwork creature={creature} />
                <div>
                  {creature.defeated && <strong>Defeated</strong>}
                  <p className="battle-creature-dialog__stat-label">
                    Base stats
                  </p>
                  <dl className="battle-creature-dialog__stats">
                    <div>
                      <dt>HP</dt>
                      <dd>{creature.maxHp}</dd>
                    </div>
                    <div>
                      <dt>Power</dt>
                      <dd>{creature.maxPower}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              {creature.activeModifiers.length ? (
                <section className="battle-creature-dialog__effects">
                  <h3>Active effects</h3>
                  <ul>
                    {creature.activeModifiers.map((modifier, index) => (
                      <li key={index}>{describeActiveModifier(modifier)}</li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="battle-creature-dialog__empty">
                  No active effects.
                </p>
              )}
              <h3>Moves</h3>
              <ul className="battle-creature-dialog__moves">
                {creature.moves.map((move) => (
                  <li key={move.id}>
                    <strong>{move.name}</strong>
                    <span>{move.powerCost} Power</span>
                    <p>
                      {move.effects.length
                        ? move.effects.map(describeEffect).join(' · ')
                        : 'Effect details unavailable.'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

function BattleCreatureArtwork({ creature }: { creature: MatchCreature }) {
  const src = battleArtwork(creature.name);
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <CardFrame className="battle-creature-artwork" rarity={creature.rarity}>
      {src && src !== failedUrl ? (
        <img src={src} alt="" onError={() => setFailedUrl(src)} />
      ) : (
        <span className="combatant__sigil" aria-hidden="true">
          <span>{creatureMonogram(creature.name)}</span>
        </span>
      )}
    </CardFrame>
  );
}

function BattleEffectPreview({ effect }: { effect: MatchEffect }) {
  const Icon =
    effect.effectType === 'damage'
      ? Sword
      : effect.effectType === 'heal'
        ? Heart
        : effect.effectType === 'buff'
          ? Shield
          : TrendDown;
  return (
    <span
      className={`battle-effect-preview battle-effect-preview--${effect.effectType}`}
    >
      <Icon aria-hidden="true" size={15} weight="bold" />
      {describeEffect(effect)}
    </span>
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
