import {
  cardAffinities,
  cardCategories,
  cardRarities,
  effectTypes,
  moveTypes,
  type CardCategory,
  type CardDefinition,
  type EffectType,
  type MoveType,
} from './card-types.js';

export interface CardDefinitionInput {
  name: string;
  category: CardCategory;
  affinity: CardDefinition['affinity'];
  rarity: CardDefinition['rarity'];
  hp: number | null;
  power: number | null;
  description?: string | null;
  imageUrl?: string | null;
  moves?: CardMoveInput[];
  effects?: CardEffectInput[];
}

export interface CardMoveInput {
  position: number;
  name: string;
  moveType: MoveType;
  effectType: EffectType;
  effectValue?: number | null;
  powerCost: number;
}

export interface CardEffectInput {
  position: number;
  effectType: EffectType;
  effectValue?: number | null;
}

export class InvalidCardDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCardDefinitionError';
  }
}

export function validateCardDefinition(input: CardDefinitionInput): void {
  assertNonBlank(input.name, 'Card name');
  assertEnum(input.category, cardCategories, 'Card category');
  assertEnum(input.affinity, cardAffinities, 'Card affinity');
  assertEnum(input.rarity, cardRarities, 'Card rarity');

  if (input.category === 'creature') {
    assertPositiveInteger(input.hp, 'Creature HP');
    assertNonNegativeInteger(input.power, 'Creature Power');

    const moves = input.moves ?? [];
    if (moves.length === 0) {
      throw new InvalidCardDefinitionError(
        'Creature cards must define at least one move.',
      );
    }

    if ((input.effects ?? []).length > 0) {
      throw new InvalidCardDefinitionError(
        'Creature cards cannot define Power-card effects.',
      );
    }

    validateMoves(moves);
    return;
  }

  if (input.hp !== null || input.power !== null) {
    throw new InvalidCardDefinitionError(
      'Power cards cannot define Creature HP or Power.',
    );
  }

  if ((input.moves ?? []).length > 0) {
    throw new InvalidCardDefinitionError(
      'Power cards cannot define Creature moves.',
    );
  }

  const effects = input.effects ?? [];
  if (effects.length === 0) {
    throw new InvalidCardDefinitionError(
      'Power cards must define at least one effect.',
    );
  }

  validateEffects(effects);
}

function validateMoves(moves: CardMoveInput[]): void {
  const positions = new Set<number>();

  for (const move of moves) {
    assertPositiveInteger(move.position, 'Move position');
    assertUniquePosition(positions, move.position, 'move');
    assertNonBlank(move.name, 'Move name');
    assertEnum(move.moveType, moveTypes, 'Move type');
    assertEnum(move.effectType, effectTypes, 'Move effect type');
    assertOptionalNonNegativeInteger(move.effectValue, 'Move effect value');
    assertNonNegativeInteger(move.powerCost, 'Move Power cost');
  }
}

function validateEffects(effects: CardEffectInput[]): void {
  const positions = new Set<number>();

  for (const effect of effects) {
    assertPositiveInteger(effect.position, 'Effect position');
    assertUniquePosition(positions, effect.position, 'effect');
    assertEnum(effect.effectType, effectTypes, 'Effect type');
    assertOptionalNonNegativeInteger(effect.effectValue, 'Effect value');
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new InvalidCardDefinitionError(`${label} is invalid.`);
  }
}

function assertNonBlank(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidCardDefinitionError(`${label} must not be blank.`);
  }
}

function assertPositiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new InvalidCardDefinitionError(
      `${label} must be a positive integer.`,
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new InvalidCardDefinitionError(
      `${label} must be a non-negative integer.`,
    );
  }
}

function assertOptionalNonNegativeInteger(value: unknown, label: string): void {
  if (value !== null && value !== undefined) {
    assertNonNegativeInteger(value, label);
  }
}

function assertUniquePosition(
  positions: Set<number>,
  position: number,
  label: string,
): void {
  if (positions.has(position)) {
    throw new InvalidCardDefinitionError(
      `Each ${label} position must be unique.`,
    );
  }

  positions.add(position);
}
