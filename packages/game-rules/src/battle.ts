import { IllegalBattleActionError, InvalidBattleSetupError } from './errors.js';
import {
  cardAffinities,
  effectCodes,
  effectTargets,
  effectTypes,
  modifierOperations,
  modifierStats,
  moveTypes,
  type BattleAction,
  type BattleActionResult,
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
  type EffectCode,
  type MoveType,
  type RandomInt,
} from './types.js';

const deckCreatureCount = 3;
const deckPowerCardCount = 2;

interface MutableCreatureState extends Omit<
  BattleCreatureState,
  'currentHp' | 'remainingPower' | 'defeated' | 'modifiers' | 'stunImmune'
> {
  currentHp: number;
  remainingPower: number;
  defeated: boolean;
  modifiers: BattleModifier[];
  stunImmune: boolean;
}

interface MutableParticipantState {
  creatures: MutableCreatureState[];
  powerCards: BattlePowerCard[];
  usedPowerCardIds: string[];
  activeCreatureId: string | null;
}

interface MutableBattleState {
  affinityRulesVersion?: 1 | 2;
  phase: BattleState['phase'];
  turnNumber: number;
  currentSide: BattleSide | null;
  replacementSide: BattleSide | null;
  replacementQueue?: BattleSide[];
  resumeSideAfterReplacement?: BattleSide | null;
  firstSide: BattleSide | null;
  selections: { player: string | null; cpu: string | null };
  participants: Record<BattleSide, MutableParticipantState>;
  winner: BattleSide | null;
}

export function getTypeMultiplier(
  attacker: MoveType,
  defender: CardAffinity,
  affinityRulesVersion: 1 | 2 = 2,
): 0.75 | 1 | 1.5 {
  if (attacker === 'basic' || attacker === defender) {
    return 1;
  }

  if (affinityRulesVersion === 2) {
    return affinityMatchups[attacker][defender];
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

const affinityMatchups = {
  wit: { wit: 1, grit: 1.5, spark: 0.75, spirit: 1, mystic: 1 },
  grit: { wit: 0.75, grit: 1, spark: 1.5, spirit: 0.75, mystic: 1.5 },
  spark: { wit: 1.5, grit: 0.75, spark: 1, spirit: 1.5, mystic: 0.75 },
  spirit: { wit: 1, grit: 1.5, spark: 0.75, spirit: 1, mystic: 1.5 },
  mystic: { wit: 1, grit: 0.75, spark: 1.5, spirit: 1.5, mystic: 1 },
} as const satisfies Record<CardAffinity, Record<CardAffinity, 0.75 | 1 | 1.5>>;

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
    affinityRulesVersion: 2,
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
    .filter(
      (move) =>
        !hasModifier(activeCreature, 'stun') &&
        isMoveCurrentlyLegal(activeCreature, move),
    )
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
    return applyMove(draft, side, action, randomInt);
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

  if (card.moves.length !== 4) {
    throw new InvalidBattleSetupError(
      `Creature card ${card.id} must define exactly four moves before battle use.`,
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
  if (card.affinity !== null) {
    assertEnum(card.affinity, cardAffinities, 'Power card affinity');
  }

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

    if (effect.effectCode !== undefined) {
      validateExecutableEffect(effect);
      continue;
    }

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

function validateExecutableEffect(effect: BattleEffect): void {
  assertEnum(effect.effectCode, effectCodes, 'Effect code');
  if (effect.target !== undefined) {
    assertEnum(effect.target, effectTargets, 'Effect target');
  }

  if (
    effect.effectValue === null &&
    effect.effectCode !== 'restore_power_to_max' &&
    effect.effectCode !== 'swap_hp_percentages'
  ) {
    throw new InvalidBattleSetupError(
      `Effect ${effect.id} must define an effect value before battle use.`,
    );
  }

  if (effect.effectValue !== null) {
    assertNonNegativeInteger(effect.effectValue, 'Effect value');
  }
  if (effect.durationTurns !== undefined && effect.durationTurns !== null) {
    assertPositiveInteger(effect.durationTurns, 'Effect duration in turns');
  }
  if (effect.charges !== undefined && effect.charges !== null) {
    assertPositiveInteger(effect.charges, 'Effect charge count');
  }
  if (
    effect.minimumHpExclusive !== undefined &&
    (!Number.isInteger(effect.minimumHpExclusive) ||
      effect.minimumHpExclusive < 0)
  ) {
    throw new InvalidBattleSetupError(
      'Effect minimum HP must be a non-negative integer.',
    );
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
      stunImmune: false,
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

  const remainingQueue = (draft.replacementQueue ?? []).filter(
    (candidate) => candidate !== side,
  );
  if (remainingQueue.length > 0) {
    draft.replacementQueue = remainingQueue;
    draft.replacementSide = remainingQueue[0] ?? null;
    draft.currentSide = draft.replacementSide;
  } else {
    draft.replacementQueue = [];
    draft.replacementSide = null;
    draft.phase = 'active';
    draft.currentSide = draft.resumeSideAfterReplacement ?? side;
    draft.resumeSideAfterReplacement = null;
  }

  return transition(draft, side, action, [], null, null, false);
}

function applyMove(
  draft: MutableBattleState,
  side: BattleSide,
  action: Extract<BattleAction, { type: 'use_move' }>,
  randomInt: RandomInt,
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

  if (!move || !isMoveCurrentlyLegal(activeCreature, move)) {
    throw new IllegalBattleActionError(
      'The selected move is not legal for the active Creature.',
    );
  }

  activeCreature.remainingPower -= move.powerCost;
  const isDamagingMove = move.effects.some(
    (effect) => resolveEffectCode(effect) === 'damage',
  );

  const effects = applyEffects(
    draft,
    side,
    move.effects,
    move.moveType,
    'creature',
    randomInt,
  );
  applyPostMoveEffects(draft, side, effects, isDamagingMove);
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
    powerCard.affinity ?? 'basic',
    'power',
  );
  const defeatedCreatureId = findNewlyDefeatedOpponent(draft, side);

  return finishNormalTurn(draft, side, action, effects, defeatedCreatureId);
}

function applyEffects(
  draft: MutableBattleState,
  side: BattleSide,
  effects: readonly BattleEffect[],
  sourceType: MoveType | CardAffinity,
  sourceKind: 'creature' | 'power',
  randomInt?: RandomInt,
): AppliedEffect[] {
  const appliedEffects: AppliedEffect[] = [];

  for (const effect of effects) {
    if (isBattleOutcomeDecided(draft)) {
      break;
    }

    const effectCode = resolveEffectCode(effect);
    if (effectCode === 'swap_hp_percentages') {
      applyHpPercentageSwap(draft, effect, appliedEffects);
      continue;
    }

    const targetSide = resolveTargetSide(effect, side);
    const targetParticipant = draft.participants[targetSide];
    const targetCreature = getActiveCreature(targetParticipant);

    if (!targetCreature || targetCreature.defeated) {
      continue;
    }

    const amount = effect.effectValue ?? 0;

    if (effectCode === 'damage') {
      const dodge =
        sourceKind === 'creature' &&
        targetSide === opponentOf(side) &&
        randomInt
          ? consumeDodge(targetCreature, randomInt)
          : { dodged: false, effectId: null };

      if (dodge.dodged) {
        appliedEffects.push({
          effectId: dodge.effectId ?? 'dodge',
          effectType: 'buff',
          effectCode: 'dodge',
          targetSide,
          targetCreatureId: targetCreature.card.id,
          amount: 1,
          damageMultiplier: null,
        });
        continue;
      }

      const affinityMultiplier = effect.neutral
        ? 1
        : getTypeMultiplier(
            sourceType === 'basic' ? 'basic' : sourceType,
            targetCreature.card.affinity,
            draft.affinityRulesVersion ?? 1,
          );
      const attackerMultiplier =
        sourceKind === 'creature'
          ? getDamageMultiplier(getActiveCreature(draft.participants[side]))
          : 1;
      const incomingMultiplier =
        sourceKind === 'creature'
          ? getIncomingDamageMultiplier(targetCreature)
          : 1;
      const damage = Math.floor(
        amount * affinityMultiplier * attackerMultiplier * incomingMultiplier,
      );
      targetCreature.currentHp = Math.max(0, targetCreature.currentHp - damage);
      markDefeatedIfNecessary(targetCreature);
      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        effectCode,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: damage,
        damageMultiplier:
          affinityMultiplier * attackerMultiplier * incomingMultiplier,
      });
      continue;
    }

    if (effectCode === 'heal') {
      const healed = Math.min(
        amount,
        targetCreature.card.maxHp - targetCreature.currentHp,
      );
      targetCreature.currentHp += healed;
      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        effectCode,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: healed,
        damageMultiplier: null,
      });
      continue;
    }

    if (effectCode === 'power_change') {
      const signedAmount = effect.effectType === 'buff' ? amount : -amount;
      targetCreature.remainingPower = Math.min(
        targetCreature.card.maxPower,
        Math.max(0, targetCreature.remainingPower + signedAmount),
      );

      appliedEffects.push({
        effectId: effect.id,
        effectType: effect.effectType,
        effectCode,
        targetSide,
        targetCreatureId: targetCreature.card.id,
        amount: signedAmount,
        damageMultiplier: null,
      });
      continue;
    }

    if (effectCode === 'restore_power_to_max') {
      const restored =
        targetCreature.card.maxPower - targetCreature.remainingPower;
      targetCreature.remainingPower = targetCreature.card.maxPower;
      appliedEffects.push(
        toAppliedEffect(
          effect,
          effectCode,
          targetSide,
          targetCreature,
          restored,
        ),
      );
      continue;
    }

    if (effectCode === 'self_damage') {
      const previousHp = targetCreature.currentHp;
      targetCreature.currentHp = Math.max(0, previousHp - amount);
      markDefeatedIfNecessary(targetCreature);
      appliedEffects.push(
        toAppliedEffect(
          effect,
          effectCode,
          targetSide,
          targetCreature,
          previousHp - targetCreature.currentHp,
        ),
      );
      continue;
    }

    if (effectCode === 'stun' && targetCreature.stunImmune) {
      appliedEffects.push(
        toAppliedEffect(effect, effectCode, targetSide, targetCreature, 0),
      );
      continue;
    }

    const modifier = createExecutableModifier(
      effect,
      effectCode,
      draft.turnNumber,
    );
    addOrRefreshModifier(targetCreature, modifier);
    appliedEffects.push({
      effectId: effect.id,
      effectType: effect.effectType,
      effectCode,
      targetSide,
      targetCreatureId: targetCreature.card.id,
      amount,
      damageMultiplier:
        effectCode === 'damage_modifier' ||
        effectCode === 'incoming_damage_modifier'
          ? modifier.value
          : null,
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
  if (defeatedCreatureId !== null) {
    const opponent = opponentOf(side);
    const opponentParticipant = draft.participants[opponent];
    const hasRemainingCreature = opponentParticipant.creatures.some(
      (creature) => !creature.defeated,
    );

    if (!hasRemainingCreature) {
      const expiredEffects: BattleActionResult['expiredEffects'] = [];
      draft.turnNumber += 1;
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
        expiredEffects,
      );
    }
  }

  const resolvedEffects = [...effects];
  const expiredEffects = decrementExpiredModifiers(
    draft.participants[side],
    side,
    draft.turnNumber,
    resolvedEffects,
  );
  draft.turnNumber += 1;

  const actingActive = getActiveCreature(draft.participants[side]);
  const poisonedDefeat = actingActive?.defeated ? actingActive.card.id : null;
  const opponent = opponentOf(side);
  const defeatedSides = [opponent, side].filter((candidate) => {
    const active = getActiveCreature(draft.participants[candidate]);
    return active?.defeated === true;
  });

  const sideHasCreature = draft.participants[side].creatures.some(
    (creature) => !creature.defeated,
  );
  const opponentHasCreature = draft.participants[opponent].creatures.some(
    (creature) => !creature.defeated,
  );

  if (!sideHasCreature || !opponentHasCreature) {
    const winner = !opponentHasCreature ? side : opponent;
    draft.phase = 'completed';
    draft.currentSide = null;
    draft.replacementSide = null;
    draft.replacementQueue = [];
    draft.resumeSideAfterReplacement = null;
    draft.winner = winner;
    return transition(
      draft,
      side,
      action,
      resolvedEffects,
      defeatedCreatureId ?? poisonedDefeat,
      winner,
      true,
      expiredEffects,
    );
  }

  if (defeatedSides.length > 0) {
    for (const defeatedSide of defeatedSides) {
      const active = getActiveCreature(draft.participants[defeatedSide]);
      if (active) {
        active.modifiers = [];
      }
      draft.participants[defeatedSide].activeCreatureId = null;
    }
    draft.phase = 'replacement';
    draft.replacementQueue = defeatedSides;
    draft.replacementSide = defeatedSides[0] ?? null;
    draft.currentSide = draft.replacementSide;
    draft.resumeSideAfterReplacement = opponent;
    return transition(
      draft,
      side,
      action,
      resolvedEffects,
      defeatedCreatureId ?? poisonedDefeat,
      null,
      true,
      expiredEffects,
    );
  }

  draft.currentSide = opponent;
  return transition(
    draft,
    side,
    action,
    resolvedEffects,
    null,
    null,
    true,
    expiredEffects,
  );
}

function transition(
  draft: MutableBattleState,
  side: BattleSide,
  action: BattleAction,
  effects: readonly AppliedEffect[],
  defeatedCreatureId: string | null,
  winner: BattleSide | null,
  turnEnded: boolean,
  expiredEffects: BattleActionResult['expiredEffects'] = [],
): BattleTransition {
  return {
    state: draft as BattleState,
    result: {
      side,
      action,
      effects,
      expiredEffects,
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

function isBattleOutcomeDecided(draft: MutableBattleState): boolean {
  return (['player', 'cpu'] as const).some(
    (side) =>
      !draft.participants[side].creatures.some(
        (creature) => !creature.defeated,
      ),
  );
}

function markDefeatedIfNecessary(creature: MutableCreatureState): void {
  if (creature.currentHp === 0) {
    creature.defeated = true;
  }
}

function decrementExpiredModifiers(
  participant: MutableParticipantState,
  side: BattleSide,
  currentTurn: number,
  appliedEffects: AppliedEffect[],
): BattleActionResult['expiredEffects'] {
  const active = getActiveCreature(participant);

  if (!active) {
    return [];
  }

  const expiredEffects: Array<BattleActionResult['expiredEffects'][number]> =
    [];

  active.modifiers = active.modifiers.flatMap((modifier) => {
    if (
      modifier.remainingTurns === null ||
      modifier.createdOnTurn >= currentTurn
    ) {
      return [modifier];
    }

    if (modifier.stat === 'poison') {
      const damage = Math.min(active.currentHp, modifier.value);
      active.currentHp -= damage;
      appliedEffects.push({
        effectId: modifier.id,
        effectType: 'debuff',
        effectCode: 'poison',
        targetSide: side,
        targetCreatureId: active.card.id,
        amount: damage,
        damageMultiplier: null,
      });
    }

    const remainingTurns = modifier.remainingTurns - 1;
    if (remainingTurns > 0) {
      return [{ ...modifier, remainingTurns }];
    }

    if (modifier.stat === 'stun' && modifier.immunityAfterRecovery) {
      active.stunImmune = true;
    }

    expiredEffects.push({
      effectId: modifier.id,
      targetSide: side,
      targetCreatureId: active.card.id,
      damageMultiplier:
        modifier.stat === 'damage_multiplier' ? modifier.value : null,
    });
    return [];
  });

  markDefeatedIfNecessary(active);

  return expiredEffects;
}

function resolveEffectCode(effect: BattleEffect): EffectCode {
  if (effect.effectCode !== undefined) {
    return effect.effectCode;
  }
  if (effect.effectType === 'damage' || effect.effectType === 'heal') {
    return effect.effectType;
  }
  if (effect.modifier?.stat === 'power') {
    return 'power_change';
  }
  if (effect.modifier?.stat === 'hp') {
    return effect.effectType === 'buff' ? 'heal' : 'damage';
  }
  return 'damage_modifier';
}

function resolveTargetSide(
  effect: BattleEffect,
  actingSide: BattleSide,
): BattleSide {
  if (effect.target === 'self') {
    return actingSide;
  }
  if (effect.target === 'opponent') {
    return opponentOf(actingSide);
  }
  return effect.effectType === 'damage' || effect.effectType === 'debuff'
    ? opponentOf(actingSide)
    : actingSide;
}

function createExecutableModifier(
  effect: BattleEffect,
  effectCode: EffectCode,
  currentTurn: number,
): BattleModifier {
  const amount = effect.effectValue ?? 0;
  const common = {
    id: effect.id,
    operation: 'multiply' as const,
    remainingTurns:
      effect.durationTurns ?? effect.modifier?.durationTurns ?? null,
    remainingCharges: effect.charges ?? null,
    cannotDefeat: effect.cannotDefeat,
    immunityAfterRecovery: effect.immunityAfterRecovery,
    createdOnTurn: currentTurn,
  };

  switch (effectCode) {
    case 'damage_modifier':
      return {
        ...common,
        stat: 'damage_multiplier',
        value:
          effect.effectType === 'debuff'
            ? Math.max(0, 1 - amount / 100)
            : 1 + amount / 100,
      };
    case 'incoming_damage_modifier':
      return {
        ...common,
        stat: 'incoming_damage_multiplier',
        value: Math.max(0, 1 - amount / 100),
      };
    case 'poison':
      return { ...common, stat: 'poison', operation: 'add', value: amount };
    case 'stun':
      return { ...common, stat: 'stun', operation: 'add', value: 1 };
    case 'dodge':
      return { ...common, stat: 'dodge', operation: 'add', value: amount };
    case 'reflect':
      return { ...common, stat: 'reflect', operation: 'add', value: amount };
    case 'lifesteal':
      return { ...common, stat: 'lifesteal', operation: 'add', value: amount };
    default:
      throw new IllegalBattleActionError(
        `Effect ${effect.id} uses an unsupported modifier code.`,
      );
  }
}

function addOrRefreshModifier(
  creature: MutableCreatureState,
  modifier: BattleModifier,
): void {
  const exclusiveStatus = ['poison', 'stun', 'dodge', 'reflect', 'lifesteal'];
  const existingIndex = creature.modifiers.findIndex((candidate) =>
    exclusiveStatus.includes(modifier.stat)
      ? candidate.stat === modifier.stat
      : candidate.id === modifier.id,
  );

  if (existingIndex < 0) {
    creature.modifiers.push(modifier);
    return;
  }
  creature.modifiers[existingIndex] = modifier;
}

function hasModifier(
  creature: BattleCreatureState | MutableCreatureState,
  stat: BattleModifier['stat'],
): boolean {
  return creature.modifiers.some((modifier) => modifier.stat === stat);
}

function isMoveCurrentlyLegal(
  creature: BattleCreatureState | MutableCreatureState,
  move: BattleCreatureCard['moves'][number],
): boolean {
  if (move.powerCost > creature.remainingPower) {
    return false;
  }
  return move.effects.every((effect) => {
    if (resolveEffectCode(effect) !== 'self_damage') {
      return true;
    }
    const minimum = effect.minimumHpExclusive ?? effect.effectValue ?? 0;
    return creature.currentHp > minimum;
  });
}

function consumeDodge(
  creature: MutableCreatureState,
  randomInt: RandomInt,
): { dodged: boolean; effectId: string | null } {
  const modifier = creature.modifiers.find(
    (candidate) => candidate.stat === 'dodge',
  );
  if (!modifier) {
    return { dodged: false, effectId: null };
  }
  creature.modifiers = creature.modifiers.filter(
    (candidate) => candidate !== modifier,
  );
  return {
    dodged: checkedRandomIndex(randomInt, 100) < modifier.value,
    effectId: modifier.id,
  };
}

function consumeOffensiveCharges(
  creature: MutableCreatureState,
  damagingMove: boolean,
  currentTurn: number,
): void {
  if (!damagingMove) {
    return;
  }
  consumeModifierCharges(creature, ['damage_multiplier'], currentTurn);
}

function consumeModifierCharges(
  creature: MutableCreatureState,
  stats: readonly BattleModifier['stat'][],
  createdBeforeTurn?: number,
): void {
  creature.modifiers = creature.modifiers.flatMap((modifier) => {
    if (
      !stats.includes(modifier.stat) ||
      (createdBeforeTurn !== undefined &&
        modifier.createdOnTurn >= createdBeforeTurn) ||
      modifier.remainingCharges === null ||
      modifier.remainingCharges === undefined
    ) {
      return [modifier];
    }
    const remainingCharges = modifier.remainingCharges - 1;
    return remainingCharges > 0 ? [{ ...modifier, remainingCharges }] : [];
  });
}

function applyPostMoveEffects(
  draft: MutableBattleState,
  side: BattleSide,
  effects: AppliedEffect[],
  damagingMove: boolean,
): void {
  if (!damagingMove) {
    return;
  }
  const attacker = getActiveCreature(draft.participants[side]);
  const defender = getActiveCreature(draft.participants[opponentOf(side)]);
  if (!attacker || !defender) {
    return;
  }

  const damageDealt = effects
    .filter(
      (effect) =>
        effect.effectCode === 'damage' &&
        effect.targetSide === opponentOf(side),
    )
    .reduce((total, effect) => total + effect.amount, 0);
  consumeOffensiveCharges(attacker, true, draft.turnNumber);

  if (damageDealt === 0) {
    return;
  }

  const reflect = defender.modifiers.find(
    (modifier) => modifier.stat === 'reflect',
  );
  const lifesteal = attacker.modifiers.find(
    (modifier) =>
      modifier.stat === 'lifesteal' &&
      modifier.createdOnTurn < draft.turnNumber,
  );

  if (reflect && damageDealt > 0) {
    const requested = Math.floor((damageDealt * reflect.value) / 100);
    const reflected = reflect.cannotDefeat
      ? Math.min(requested, Math.max(0, attacker.currentHp - 1))
      : Math.min(requested, attacker.currentHp);
    attacker.currentHp -= reflected;
    markDefeatedIfNecessary(attacker);
    effects.push({
      effectId: reflect.id,
      effectType: 'buff',
      effectCode: 'reflect',
      targetSide: side,
      targetCreatureId: attacker.card.id,
      amount: reflected,
      damageMultiplier: null,
    });
  }

  if (lifesteal && damageDealt > 0 && !attacker.defeated) {
    const requested = Math.floor((damageDealt * lifesteal.value) / 100);
    const healed = Math.min(
      requested,
      attacker.card.maxHp - attacker.currentHp,
    );
    attacker.currentHp += healed;
    effects.push({
      effectId: lifesteal.id,
      effectType: 'buff',
      effectCode: 'lifesteal',
      targetSide: side,
      targetCreatureId: attacker.card.id,
      amount: healed,
      damageMultiplier: null,
    });
  }

  consumeModifierCharges(defender, ['incoming_damage_multiplier', 'reflect']);
  consumeModifierCharges(attacker, ['lifesteal'], draft.turnNumber);
}

function getIncomingDamageMultiplier(
  creature: BattleCreatureState | MutableCreatureState,
): number {
  return creature.modifiers
    .filter((modifier) => modifier.stat === 'incoming_damage_multiplier')
    .reduce((total, modifier) => total * modifier.value, 1);
}

function toAppliedEffect(
  effect: BattleEffect,
  effectCode: EffectCode,
  targetSide: BattleSide,
  targetCreature: BattleCreatureState | MutableCreatureState,
  amount: number,
): AppliedEffect {
  return {
    effectId: effect.id,
    effectType: effect.effectType,
    effectCode,
    targetSide,
    targetCreatureId: targetCreature.card.id,
    amount,
    damageMultiplier: null,
  };
}

function applyHpPercentageSwap(
  draft: MutableBattleState,
  effect: BattleEffect,
  appliedEffects: AppliedEffect[],
): void {
  const player = getActiveCreature(draft.participants.player);
  const cpu = getActiveCreature(draft.participants.cpu);
  if (!player || !cpu || player.defeated || cpu.defeated) {
    throw new IllegalBattleActionError(
      'Both sides need an active Creature to swap HP percentages.',
    );
  }

  const playerPercentage = player.currentHp / player.card.maxHp;
  const cpuPercentage = cpu.currentHp / cpu.card.maxHp;
  const nextPlayerHp = Math.max(
    1,
    Math.floor(player.card.maxHp * cpuPercentage),
  );
  const nextCpuHp = Math.max(1, Math.floor(cpu.card.maxHp * playerPercentage));
  const changes: Array<[BattleSide, MutableCreatureState, number]> = [
    ['player', player, nextPlayerHp],
    ['cpu', cpu, nextCpuHp],
  ];
  for (const [targetSide, creature, nextHp] of changes) {
    const changedBy = nextHp - creature.currentHp;
    creature.currentHp = nextHp;
    appliedEffects.push(
      toAppliedEffect(
        effect,
        'swap_hp_percentages',
        targetSide,
        creature,
        changedBy,
      ),
    );
  }
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
    ...(state.affinityRulesVersion === undefined
      ? {}
      : { affinityRulesVersion: state.affinityRulesVersion }),
    phase: state.phase,
    turnNumber: state.turnNumber,
    currentSide: state.currentSide,
    replacementSide: state.replacementSide,
    ...(state.replacementQueue === undefined
      ? {}
      : { replacementQueue: [...state.replacementQueue] }),
    ...(state.resumeSideAfterReplacement === undefined
      ? {}
      : { resumeSideAfterReplacement: state.resumeSideAfterReplacement }),
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
      stunImmune: creature.stunImmune ?? false,
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
