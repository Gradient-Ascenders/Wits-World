export const battleSides = ['player', 'cpu'] as const;

export type BattleSide = (typeof battleSides)[number];

export const battlePhases = [
  'initial_selection',
  'active',
  'replacement',
  'completed',
] as const;

export type BattlePhase = (typeof battlePhases)[number];

export interface BattleTimerConfig {
  pvpTurnSeconds: number;
  cpuTurnSeconds: number;
}

export const basicTurnTimerConfig: Readonly<BattleTimerConfig> = {
  pvpTurnSeconds: 60,
  cpuTurnSeconds: 90,
};

export const cardAffinities = [
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
] as const;

export type CardAffinity = (typeof cardAffinities)[number];

export const moveTypes = ['basic', ...cardAffinities] as const;

export type MoveType = (typeof moveTypes)[number];

export const effectTypes = ['damage', 'debuff', 'heal', 'buff'] as const;

export type EffectType = (typeof effectTypes)[number];

export const effectCodes = [
  'damage',
  'heal',
  'power_change',
  'damage_modifier',
  'incoming_damage_modifier',
  'poison',
  'stun',
  'dodge',
  'reflect',
  'lifesteal',
  'restore_power_to_max',
  'self_damage',
  'swap_hp_percentages',
] as const;

export type EffectCode = (typeof effectCodes)[number];

export const effectTargets = ['self', 'opponent', 'both'] as const;

export type EffectTarget = (typeof effectTargets)[number];

export const modifierStats = ['hp', 'power', 'damage_multiplier'] as const;

export type ModifierStat = (typeof modifierStats)[number];

export const modifierOperations = ['add', 'multiply'] as const;

export type ModifierOperation = (typeof modifierOperations)[number];

export interface BattleModifierSpec {
  readonly stat: ModifierStat;
  readonly operation: ModifierOperation;
  readonly durationTurns?: number | null;
}

export interface BattleEffect {
  readonly id: string;
  readonly effectType: EffectType;
  readonly effectValue: number | null;
  readonly modifier?: BattleModifierSpec;
  readonly effectCode?: EffectCode;
  readonly target?: EffectTarget;
  readonly durationTurns?: number | null;
  readonly charges?: number | null;
  readonly neutral?: boolean;
  readonly bypassDefense?: boolean;
  readonly minimumHpExclusive?: number;
  readonly cannotDefeat?: boolean;
  readonly immunityAfterRecovery?: boolean;
}

export interface BattleMove {
  readonly id: string;
  readonly name: string;
  readonly moveType: MoveType;
  readonly powerCost: number;
  readonly effects: readonly BattleEffect[];
}

export interface BattleCreatureCard {
  readonly id: string;
  readonly affinity: CardAffinity;
  readonly maxHp: number;
  readonly maxPower: number;
  readonly moves: readonly BattleMove[];
}

export interface BattlePowerCard {
  readonly id: string;
  readonly affinity: CardAffinity | null;
  readonly effects: readonly BattleEffect[];
}

export interface BattleDeck {
  readonly creatureCards: readonly BattleCreatureCard[];
  readonly powerCards: readonly BattlePowerCard[];
}

export interface BattleModifier {
  readonly id: string;
  readonly stat:
    | ModifierStat
    | 'incoming_damage_multiplier'
    | 'poison'
    | 'stun'
    | 'dodge'
    | 'reflect'
    | 'lifesteal';
  readonly operation: ModifierOperation;
  readonly value: number;
  readonly remainingTurns: number | null;
  readonly remainingCharges?: number | null;
  readonly cannotDefeat?: boolean;
  readonly immunityAfterRecovery?: boolean;
  readonly createdOnTurn: number;
}

export interface BattleCreatureState {
  readonly card: BattleCreatureCard;
  readonly currentHp: number;
  readonly remainingPower: number;
  readonly defeated: boolean;
  readonly modifiers: readonly BattleModifier[];
  readonly stunImmune?: boolean;
}

export interface BattleParticipantState {
  readonly creatures: readonly BattleCreatureState[];
  readonly powerCards: readonly BattlePowerCard[];
  readonly usedPowerCardIds: readonly string[];
  readonly activeCreatureId: string | null;
}

export interface BattleSelections {
  readonly player: string | null;
  readonly cpu: string | null;
}

export type BattleAction =
  | { type: 'select_initial_creature'; creatureId: string }
  | { type: 'select_replacement'; creatureId: string }
  | { type: 'swap_creature'; creatureId: string }
  | { type: 'use_move'; moveId: string }
  | { type: 'use_power_card'; powerCardId: string }
  | { type: 'timeout' };

export interface BattleState {
  // Persisted states without this field retain the original five-affinity cycle.
  readonly affinityRulesVersion?: 1 | 2;
  readonly phase: BattlePhase;
  readonly turnNumber: number;
  readonly currentSide: BattleSide | null;
  readonly replacementSide: BattleSide | null;
  readonly replacementQueue?: readonly BattleSide[];
  readonly resumeSideAfterReplacement?: BattleSide | null;
  readonly firstSide: BattleSide | null;
  readonly selections: BattleSelections;
  readonly participants: Readonly<Record<BattleSide, BattleParticipantState>>;
  readonly winner: BattleSide | null;
}

export interface AppliedEffect {
  readonly effectId: string;
  readonly effectType: EffectType;
  readonly effectCode?: EffectCode;
  readonly targetSide: BattleSide;
  readonly targetCreatureId: string;
  readonly amount: number;
  readonly damageMultiplier: number | null;
}

export interface ExpiredEffect {
  readonly effectId: string;
  readonly targetSide: BattleSide;
  readonly targetCreatureId: string;
  readonly damageMultiplier: number | null;
}

export interface BattleActionResult {
  readonly side: BattleSide;
  readonly action: BattleAction;
  readonly effects: readonly AppliedEffect[];
  readonly expiredEffects: readonly ExpiredEffect[];
  readonly defeatedCreatureId: string | null;
  readonly winner: BattleSide | null;
  readonly turnEnded: boolean;
}

export interface BattleTransition {
  readonly state: BattleState;
  readonly result: BattleActionResult;
}

export type RandomInt = (maxExclusive: number) => number;
