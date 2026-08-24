import { IllegalBattleActionError, InvalidBattleSetupError } from './errors.js';
import {
  cardAffinities,
  effectTypes,
  modifierOperations,
  modifierStats,
  moveTypes,
  type BattleAction,
  type AppliedEffect,
  type BattleCreatureCard,
  type BattleCreatureState,
  type BattleDeck,
  type BattleEffect,
  type BattleModifier,
  type BattleParticipantState,
  type BattlePowerCard,
  type BattleSide,
  type BattleState,
  type BattleTransition,
  type CardAffinity,
  type MoveType,
  type RandomInt,
} from './types.js';

const deckCreatureCount = 3;
const deckPowerCardCount = 2;

interface MutableCreatureState extends Omit<
  BattleCreatureState,
  'currentHp' | 'remainingPower' | 'defeated' | 'modifiers'
> {
  currentHp: number;
  remainingPower: number;
  defeated: boolean;
  modifiers: BattleModifier[];
}

interface MutableParticipantState {
  creatures: MutableCreatureState[];
  powerCards: BattlePowerCard[];
  usedPowerCardIds: string[];
  activeCreatureId: string | null;
}

interface MutableBattleState {
  phase: BattleState['phase'];
  turnNumber: number;
  currentSide: BattleSide | null;
  replacementSide: BattleSide | null;
  firstSide: BattleSide | null;
  selections: { player: string | null; cpu: string | null };
  participants: Record<BattleSide, MutableParticipantState>;
  winner: BattleSide | null;
}

export function getTypeMultiplier(
  attacker: MoveType,
  defender: CardAffinity,
): 0.75 | 1 | 1.5 {
  if (attacker === 'basic' || attacker === defender) {
    return 1;
  }

  const attackerIndex = cardAffinities.indexOf(attacker);
  const defenderIndex = cardAffinities.indexOf(defender);

  if ((attackerIndex + 1) % cardAffinities.length === defenderIndex) {
    return 1.5;
  }

  if (
    (attackerIndex - 1 + cardAffinities.length) % cardAffinities.length ===
    defenderIndex
  ) {
    return 0.75;
  }

  return 1;
}

export function getEffectDamageMultiplier(
  effectType: 'buff' | 'debuff',
  effectValue: number,
): number {
  return effectType === 'buff'
    ? 1 + effectValue / 100
    : Math.max(0, 1 - effectValue / 100);
}

export function validateBattleDeck(deck: BattleDeck): void {
  if (deck.creatureCards.length !== deckCreatureCount) {
    throw new InvalidBattleSetupError(
      `A Basic deck must contain exactly ${deckCreatureCount} Creature cards.`,
    );
  }

  if (deck.powerCards.length !== deckPowerCardCount) {
    throw new InvalidBattleSetupError(
      `A Basic deck must contain exactly ${deckPowerCardCount} Power cards.`,
    );
  }

  const cardIds = new Set<string>();

  for (const creature of deck.creatureCards) {
    if (cardIds.has(creature.id)) {
      throw new InvalidBattleSetupError(
        `Card instance ${creature.id} appears more than once in the deck.`,
      );
    }

    cardIds.add(creature.id);
    validateCreatureCard(creature);
  }

  for (const powerCard of deck.powerCards) {
    if (cardIds.has(powerCard.id)) {
      throw new InvalidBattleSetupError(
        `Card instance ${powerCard.id} appears more than once in the deck.`,
      );
    }

    cardIds.add(powerCard.id);
    validatePowerCard(powerCard);
  }
}

export function createBattleState(
  playerDeck: BattleDeck,
  cpuDeck: BattleDeck,
): BattleState {
  validateBattleDeck(playerDeck);
  validateBattleDeck(cpuDeck);

  return {
    phase: 'initial_selection',
    turnNumber: 0,
    currentSide: null,
    replacementSide: null,
    firstSide: null,
    selections: {
      player: null,
      cpu: null,
    },
    participants: {
      player: createParticipantState(playerDeck),
      cpu: createParticipantState(cpuDeck),
    },
    winner: null,
  };
}

export function getLegalActions(
  state: BattleState,
  side: BattleSide,
): readonly BattleAction[] {
  if (state.phase === 'completed') {
    return [];
  }

  if (state.phase === 'initial_selection') {
    if (state.selections[side] !== null) {
      return [];
    }

    return state.participants[side].creatures
      .filter((creature) => !creature.defeated)
      .map((creature) => ({
        type: 'select_initial_creature' as const,
        creatureId: creature.card.id,
      }));
  }

  if (state.phase === 'replacement') {
    if (state.replacementSide !== side) {
      return [];
    }

    return state.participants[side].creatures
      .filter(
        (creature) =>
          !creature.defeated &&
          creature.card.id !== state.participants[side].activeCreatureId,
      )
      .map((creature) => ({
        type: 'select_replacement' as const,
        creatureId: creature.card.id,
      }));
  }

  if (state.currentSide !== side || state.phase !== 'active') {
    return [];
  }

  const participant = state.participants[side];
  const activeCreature = getActiveCreature(participant);

  if (!activeCreature) {
    return [];
  }

  const moveActions = activeCreature.card.moves
    .filter((move) => move.powerCost <= activeCreature.remainingPower)
    .map((move) => ({
      type: 'use_move' as const,
      moveId: move.id,
    }));

  const powerCardActions = participant.powerCards
    .filter((card) => !participant.usedPowerCardIds.includes(card.id))
    .map((card) => ({
      type: 'use_power_card' as const,
      powerCardId: card.id,
    }));

  return [...moveActions, ...powerCardActions];
}

export function chooseCpuAction(
  state: BattleState,
  randomInt: RandomInt,
): BattleAction | null {
  if (state.phase === 'completed') {
    return null;
  }

  const actions = getLegalActions(state, 'cpu');

  if (actions.length === 0) {
    if (state.phase === 'active' && state.currentSide === 'cpu') {
      return { type: 'timeout' };
    }

    throw new IllegalBattleActionError(
      'The CPU has no legal action in the current phase.',
    );
  }

  const action = actions[checkedRandomIndex(randomInt, actions.length)];

  if (!action) {
    throw new IllegalBattleActionError(
      'The CPU action list did not contain the selected action.',
    );
  }

  return action;
}

export function applyBattleAction(
  state: BattleState,
  side: BattleSide,
  action: BattleAction,
  randomInt: RandomInt,
): BattleTransition {
  const draft = cloneState(state);

  if (action.type === 'timeout') {
    assertActiveTurn(draft, side);
    return finishNormalTurn(draft, side, action, []);
  }

  if (draft.phase === 'initial_selection') {
    return applyInitialSelection(draft, side, action, randomInt);
  }

  if (draft.phase === 'replacement') {
    return applyReplacement(draft, side, action);
  }

  assertActiveTurn(draft, side);

  if (action.type === 'use_move') {
    return applyMove(draft, side, action);
  }

  if (action.type === 'use_power_card') {
    return applyPowerCard(draft, side, action);
  }

  throw new IllegalBattleActionError(
    'The selected action is not legal in the current battle phase.',
  );
}

function validateCreatureCard(card: BattleCreatureCard): void {
  assertNonBlank(card.id, 'Creature card ID');
  assertEnum(card.affinity, cardAffinities, 'Creature affinity');
  assertPositiveInteger(card.maxHp, 'Creature maximum HP');
  assertNonNegativeInteger(card.maxPower, 'Creature maximum Power');

  if (card.moves.length === 0) {
    throw new InvalidBattleSetupError(
      `Creature card ${card.id} must define at least one move.`,
    );
  }

  const moveIds = new Set<string>();

  for (const move of card.moves) {
    if (moveIds.has(move.id)) {
      throw new InvalidBattleSetupError(
        `Move instance ${move.id} appears more than once on card ${card.id}.`,
      );
    }

    moveIds.add(move.id);
    assertNonBlank(move.id, 'Move ID');
    assertNonBlank(move.name, 'Move name');
    assertEnum(move.moveType, moveTypes, 'Move type');
    assertNonNegativeInteger(move.powerCost, 'Move Power cost');

    if (move.effects.length === 0) {
      throw new InvalidBattleSetupError(
        `Move ${move.id} must define at least one effect.`,
      );
    }

    validateEffects(move.effects, `move ${move.id}`);
  }
}

function validatePowerCard(card: BattlePowerCard): void {
  assertNonBlank(card.id, 'Power card ID');
  assertEnum(card.affinity, cardAffinities, 'Power card affinity');

  if (card.effects.length === 0) {
    throw new InvalidBattleSetupError(
      `Power card ${card.id} must define at least one effect.`,
    );
  }

  validateEffects(card.effects, `Power card ${card.id}`);
}

function validateEffects(
  effects: readonly BattleEffect[],
  source: string,
): void {
  const effectIds = new Set<string>();

  for (const effect of effects) {
    if (effectIds.has(effect.id)) {
      throw new InvalidBattleSetupError(
        `Effect instance ${effect.id} appears more than once on ${source}.`,
      );
    }

    effectIds.add(effect.id);
    assertNonBlank(effect.id, 'Effect ID');
    assertEnum(effect.effectType, effectTypes, 'Effect type');

    if (effect.effectValue === null) {
      throw new InvalidBattleSetupError(
        `Effect ${effect.id} must define an effect value before battle use.`,
      );
    }

    assertNonNegativeInteger(effect.effectValue, 'Effect value');

    if (effect.effectType === 'damage' || effect.effectType === 'heal') {
      if (effect.modifier) {
        throw new InvalidBattleSetupError(
          `Effect ${effect.id} cannot combine a direct effect with a modifier.`,
        );
      }

      continue;
    }

    if (!effect.modifier) {
      throw new InvalidBattleSetupError(
        `Effect ${effect.id} requires a Buff or Debuff modifier definition.`,
      );
    }

    assertEnum(effect.modifier.stat, modifierStats, 'Modifier stat');
    assertEnum(
      effect.modifier.operation,
      modifierOperations,
      'Modifier operation',
    );

    if (
      (effect.modifier.stat === 'hp' || effect.modifier.stat === 'power') &&
      effect.modifier.operation !== 'add'
    ) {
      throw new InvalidBattleSetupError(
        `Effect ${effect.id} must add to HP or Power.`,
      );
    }

    if (
      effect.modifier.stat === 'damage_multiplier' &&
      effect.modifier.operation !== 'multiply'
    ) {
      throw new InvalidBattleSetupError(
        `Effect ${effect.id} must multiply damage strength.`,
      );
    }

    if (
      effect.modifier.stat !== 'damage_multiplier' &&
      effect.modifier.durationTurns !== undefined &&
      effect.modifier.durationTurns !== null
    ) {
      throw new InvalidBattleSetupError(
        `Effect ${effect.id} can only give damage modifiers a duration.`,
      );
    }

    if (
      effect.modifier.durationTurns !== undefined &&
      effect.modifier.durationTurns !== null
    ) {
      assertPositiveInteger(
        effect.modifier.durationTurns,
        'Modifier duration in turns',
      );
    }
  }
}

function createParticipantState(deck: BattleDeck): MutableParticipantState {
  return {
    creatures: deck.creatureCards.map((card) => ({
      card,
      currentHp: card.maxHp,
      remainingPower: card.maxPower,
      defeated: false,
      modifiers: [],
    })),
    powerCards: [...deck.powerCards],
    usedPowerCardIds: [],
    activeCreatureId: null,
  };
}

function applyInitialSelection(
  draft: MutableBattleState,
  side: BattleSide,
  action: BattleAction,
  randomInt: RandomInt,
): BattleTransition {
  if (action.type !== 'select_initial_creature') {
    throw new IllegalBattleActionError(
      'A player must select an initial Creature before taking a turn.',
    );
  }

  if (draft.selections[side] !== null) {
    throw new IllegalBattleActionError(
      'The initial Creature has already been selected.',
    );
  }

  const creature = findAvailableCreature(
    draft.participants[side],
    action.creatureId,
  );
  draft.selections[side] = creature.card.id;

  const bothSelected =
    draft.selections.player !== null && draft.selections.cpu !== null;

  if (bothSelected) {
    draft.participants.player.activeCreatureId = draft.selections.player;
    draft.participants.cpu.activeCreatureId = draft.selections.cpu;
    draft.phase = 'active';
    draft.turnNumber = 1;
    draft.firstSide = checkedRandomIndex(randomInt, 2) === 0 ? 'player' : 'cpu';
    draft.currentSide = draft.firstSide;
  }

  return transition(draft, side, action, [], null, null, false);
}

function applyReplacement(
  draft: MutableBattleState,
  side: BattleSide,
  action: BattleAction,
): BattleTransition {
  if (action.type !== 'select_replacement') {
    throw new IllegalBattleActionError(
      'A defeated Creature must be replaced before the next normal turn.',
    );
  }

  if (draft.replacementSide !== side) {
    throw new IllegalBattleActionError(
      'Only the player whose Creature was defeated may replace it.',
    );
  }

  const creature = findAvailableCreature(
    draft.participants[side],
    action.creatureId,
  );
  draft.participants[side].activeCreatureId = creature.card.id;
  draft.replacementSide = null;
  draft.phase = 'active';
  draft.currentSide = side;

  return transition(draft, side, action, [], null, null, false);
}

function applyMove(
  draft: MutableBattleState,
  side: BattleSide,
  action: Extract<BattleAction, { type: 'use_move' }>,
): BattleTransition {
  const participant = draft.participants[side];
  const activeCreature = getActiveCreature(participant);

  if (!activeCreature) {
    throw new IllegalBattleActionError(
      'An active Creature is required to use a move.',
    );
  }

  const move = activeCreature.card.moves.find(
    (candidate) => candidate.id === action.moveId,
  );

  if (!move || move.powerCost > activeCreature.remainingPower) {
    throw new IllegalBattleActionError(
      'The selected move is not legal for the active Creature.',
    );
  }

  activeCreature.remainingPower -= move.powerCost;
  const effects = applyEffects(draft, side, move.effects, move.moveType);
  const defeatedCreatureId = findNewlyDefeatedOpponent(draft, side);

  return finishNormalTurn(draft, side, action, effects, defeatedCreatureId);
}

function applyPowerCard(
  draft: MutableBattleState,
  side: BattleSide,
  action: Extract<BattleAction, { type: 'use_power_card' }>,
): BattleTransition {
  const participant = draft.participants[side];

  if (!getActiveCreature(participant)) {
    throw new IllegalBattleActionError(
      'An active Creature is required to use a Power card.',
    );
  }

  const powerCard = participant.powerCards.find(
    (candidate) => candidate.id === action.powerCardId,
  );

  if (!powerCard || participant.usedPowerCardIds.includes(powerCard.id)) {
    throw new IllegalBattleActionError(
      'The selected Power card is not available in this battle.',
    );
  }

  participant.usedPowerCardIds.push(powerCard.id);
  const effects = applyEffects(
    draft,
    side,
    powerCard.effects,
    powerCard.affinity,
  );
  const defeatedCreatureId = findNewlyDefeatedOpponent(draft, side);

  return finishNormalTurn(draft, side, action, effects, defeatedCreatureId);
}

function applyEffects(
  draft: MutableBattleState,
  side: BattleSide,
  effects: readonly BattleEffect[],
  sourceType: MoveType | CardAffinity,
): AppliedEffect[] {
  const appliedEffects: AppliedEffect[] = [];

  for (const effect of effects) {
    const targetSide =
      effect.effectType === 'damage' || effect.effectType === 'debuff'
        ? opponentOf(side)
        : side;
    const targetParticipant = draft.participants[targetSide];
    const targetCreature = getActiveCreature(targetParticipant);

    if (!targetCreature || targetCreature.defeated) {
      continue;
    }

    const amount = effect.effectValue;

    if (amount === null) {
      throw new IllegalBattleActionError(
        `Effect ${effect.id} is missing an executable value.`,
      );
    }

    if (effect.effectType === 'damage') {
      const damage = Math.floor(
        amount *
          getTypeMultiplier(
            sourceType === 'basic' ? 'basic' : sourceType,
            targetCreature.card.affinity,
          ) *
          getDamageMultiplier(getActiveCreature(draft.participants[side])),
      );
      targetCreature.currentHp = Math.max(0, targetCreature.currentHp - damage);
      markDefeatedIfNecessary(targetCreature);
      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: damage,
        damageMultiplier: null,
      });
      continue;
    }

    if (effect.effectType === 'heal') {
      const healed = Math.min(
        amount,
        targetCreature.card.maxHp - targetCreature.currentHp,
      );
      targetCreature.currentHp += healed;
      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: healed,
        damageMultiplier: null,
      });
      continue;
    }

    const modifier = effect.modifier;

    if (!modifier) {
      throw new IllegalBattleActionError(
        `Effect ${effect.id} is missing its modifier definition.`,
      );
    }

    if (modifier.stat === 'hp' || modifier.stat === 'power') {
      const signedAmount = effect.effectType === 'buff' ? amount : -amount;
      if (modifier.stat === 'hp') {
        targetCreature.currentHp = Math.min(
          targetCreature.card.maxHp,
          Math.max(0, targetCreature.currentHp + signedAmount),
        );
        markDefeatedIfNecessary(targetCreature);
      } else {
        targetCreature.remainingPower = Math.min(
          targetCreature.card.maxPower,
          Math.max(0, targetCreature.remainingPower + signedAmount),
        );
      }

      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: signedAmount,
        damageMultiplier: null,
      });
      continue;
    }

    const factor = getEffectDamageMultiplier(effect.effectType, amount);

    targetCreature.modifiers = [
      ...targetCreature.modifiers,
      {
        id: effect.id,
        stat: modifier.stat,
        operation: modifier.operation,
        value: factor,
        remainingTurns: modifier.durationTurns ?? null,
        createdOnTurn: draft.turnNumber,
      },
    ];
    appliedEffects.push({
      effectId: effect.id,
      effectType: effect.effectType,
      targetSide,
      targetCreatureId: targetCreature.card.id,
      amount,
      damageMultiplier: factor,
    });
  }

  return appliedEffects;
}

function finishNormalTurn(
  draft: MutableBattleState,
  side: BattleSide,
  action: BattleAction,
  effects: readonly AppliedEffect[],
  defeatedCreatureId: string | null = null,
): BattleTransition {
  decrementExpiredModifiers(draft.participants[side], draft.turnNumber);
  draft.turnNumber += 1;

  if (defeatedCreatureId !== null) {
    const opponent = opponentOf(side);
    const opponentParticipant = draft.participants[opponent];
    const hasRemainingCreature = opponentParticipant.creatures.some(
      (creature) => !creature.defeated,
    );

    opponentParticipant.activeCreatureId = null;

    if (!hasRemainingCreature) {
      draft.phase = 'completed';
      draft.currentSide = null;
      draft.replacementSide = null;
      draft.winner = side;
      return transition(
        draft,
        side,
        action,
        effects,
        defeatedCreatureId,
        side,
        true,
      );
    }

    draft.phase = 'replacement';
    draft.currentSide = opponent;
    draft.replacementSide = opponent;
    return transition(
      draft,
      side,
      action,
      effects,
      defeatedCreatureId,
      null,
      true,
    );
  }

  draft.currentSide = opponentOf(side);
  return transition(draft, side, action, effects, null, null, true);
}

function transition(
  draft: MutableBattleState,
  side: BattleSide,
  action: BattleAction,
  effects: readonly AppliedEffect[],
  defeatedCreatureId: string | null,
  winner: BattleSide | null,
  turnEnded: boolean,
): BattleTransition {
  return {
    state: draft as BattleState,
    result: {
      side,
      action,
      effects,
      defeatedCreatureId,
      winner,
      turnEnded,
    },
  };
}

function assertActiveTurn(draft: MutableBattleState, side: BattleSide): void {
  if (draft.phase !== 'active' || draft.currentSide !== side) {
    throw new IllegalBattleActionError(
      'The side cannot act during the current battle phase.',
    );
  }
}

function findAvailableCreature(
  participant: MutableParticipantState,
  creatureId: string,
): MutableCreatureState {
  const creature = participant.creatures.find(
    (candidate) => candidate.card.id === creatureId,
  );

  if (!creature || creature.defeated) {
    throw new IllegalBattleActionError(
      `Creature ${creatureId} is not available for selection.`,
    );
  }

  return creature;
}

function getActiveCreature(
  participant: MutableParticipantState,
): MutableCreatureState | null;
function getActiveCreature(
  participant: BattleParticipantState,
): BattleCreatureState | null;
function getActiveCreature(
  participant: BattleParticipantState | MutableParticipantState,
): BattleCreatureState | MutableCreatureState | null {
  if (participant.activeCreatureId === null) {
    return null;
  }

  return (
    participant.creatures.find(
      (creature) => creature.card.id === participant.activeCreatureId,
    ) ?? null
  );
}

function findNewlyDefeatedOpponent(
  draft: MutableBattleState,
  attackingSide: BattleSide,
): string | null {
  const opponent = draft.participants[opponentOf(attackingSide)];
  const active = getActiveCreature(opponent);

  return active?.defeated ? active.card.id : null;
}

function markDefeatedIfNecessary(creature: MutableCreatureState): void {
  if (creature.currentHp === 0) {
    creature.defeated = true;
    creature.modifiers = [];
  }
}

function decrementExpiredModifiers(
  participant: MutableParticipantState,
  currentTurn: number,
): void {
  const active = getActiveCreature(participant);

  if (!active) {
    return;
  }

  active.modifiers = active.modifiers.flatMap((modifier) => {
    if (
      modifier.remainingTurns === null ||
      modifier.createdOnTurn >= currentTurn
    ) {
      return [modifier];
    }

    const remainingTurns = modifier.remainingTurns - 1;
    return remainingTurns > 0 ? [{ ...modifier, remainingTurns }] : [];
  });
}

function getDamageMultiplier(
  creature: BattleCreatureState | MutableCreatureState | null,
): number {
  if (!creature) {
    return 1;
  }

  return creature.modifiers
    .filter(
      (modifier) =>
        modifier.stat === 'damage_multiplier' &&
        modifier.operation === 'multiply',
    )
    .reduce((total, modifier) => total * modifier.value, 1);
}

function cloneState(state: BattleState): MutableBattleState {
  return {
    phase: state.phase,
    turnNumber: state.turnNumber,
    currentSide: state.currentSide,
    replacementSide: state.replacementSide,
    firstSide: state.firstSide,
    selections: { ...state.selections },
    participants: {
      player: cloneParticipant(state.participants.player),
      cpu: cloneParticipant(state.participants.cpu),
    },
    winner: state.winner,
  };
}

function cloneParticipant(
  participant: BattleParticipantState,
): MutableParticipantState {
  return {
    creatures: participant.creatures.map((creature) => ({
      card: creature.card,
      currentHp: creature.currentHp,
      remainingPower: creature.remainingPower,
      defeated: creature.defeated,
      modifiers: creature.modifiers.map((modifier) => ({ ...modifier })),
    })),
    powerCards: [...participant.powerCards],
    usedPowerCardIds: [...participant.usedPowerCardIds],
    activeCreatureId: participant.activeCreatureId,
  };
}

function opponentOf(side: BattleSide): BattleSide {
  return side === 'player' ? 'cpu' : 'player';
}

function checkedRandomIndex(
  randomInt: RandomInt,
  maxExclusive: number,
): number {
  const index = randomInt(maxExclusive);

  if (!Number.isInteger(index) || index < 0 || index >= maxExclusive) {
    throw new IllegalBattleActionError(
      'The injected random source returned an invalid action index.',
    );
  }

  return index;
}

function assertNonBlank(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidBattleSetupError(`${label} must not be blank.`);
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new InvalidBattleSetupError(`${label} is invalid.`);
  }
}

function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new InvalidBattleSetupError(`${label} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new InvalidBattleSetupError(
      `${label} must be a non-negative integer.`,
    );
  }
}
