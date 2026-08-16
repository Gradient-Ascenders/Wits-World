import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export const cardAffinities = [
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
] as const;

export type CardAffinity = (typeof cardAffinities)[number];
export type CardCategory = 'creature' | 'power';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardEffectType = 'buff' | 'damage' | 'debuff' | 'heal';
export type CardModifierStat = 'damage_multiplier' | 'hp' | 'power';

export interface CardMove {
  effectType: CardEffectType;
  effectValue: number | null;
  id: string;
  modifierDurationTurns: number | null;
  modifierOperation: 'add' | 'multiply' | null;
  modifierStat: CardModifierStat | null;
  moveType: 'basic' | CardAffinity;
  name: string;
  position: number;
  powerCost: number;
}

export interface CardEffect {
  effectType: CardEffectType;
  effectValue: number | null;
  id: string;
  modifierDurationTurns: number | null;
  modifierOperation: 'add' | 'multiply' | null;
  modifierStat: CardModifierStat | null;
  position: number;
}

export interface OwnedCard {
  acquiredAt: string;
  acquisitionKind: 'event_reward' | 'starter';
  affinity: CardAffinity;
  cardDefinitionId: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  imageUrl: string | null;
  isActive: boolean;
  moves: CardMove[];
  name: string;
  ownedCardId: string;
  power: number | null;
  rarity: CardRarity;
}

export interface StarterGrant {
  affinity: CardAffinity;
  cards: OwnedCard[];
  grantedAt: string;
  starterGrantId: string;
}

const collectionResponseKeys = ['cards', 'requestId'] as const;
const starterResponseKeys = [
  'affinity',
  'cards',
  'grantedAt',
  'requestId',
  'starterGrantId',
] as const;
const ownedCardKeys = [
  'acquiredAt',
  'acquisitionKind',
  'affinity',
  'cardDefinitionId',
  'category',
  'description',
  'effects',
  'hp',
  'imageUrl',
  'isActive',
  'moves',
  'name',
  'ownedCardId',
  'power',
  'rarity',
] as const;
const moveKeys = [
  'effectType',
  'effectValue',
  'id',
  'modifierDurationTurns',
  'modifierOperation',
  'modifierStat',
  'moveType',
  'name',
  'position',
  'powerCost',
] as const;
const effectKeys = [
  'effectType',
  'effectValue',
  'id',
  'modifierDurationTurns',
  'modifierOperation',
  'modifierStat',
  'position',
] as const;

const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

export type CardApiFailure =
  | 'authorization'
  | 'starter-already-claimed'
  | 'starter-unavailable'
  | 'unavailable';

export class CardApiError extends Error {
  public constructor(
    public readonly failure: CardApiFailure,
    public readonly requestId?: string,
  ) {
    super('The card request could not be completed.');
    this.name = 'CardApiError';
  }
}

interface CardRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface SelectStarterOptions extends CardRequestOptions {
  affinity: CardAffinity;
}

export async function listOwnedCards({
  apiBaseUrl,
  getAccessToken,
  signal,
}: CardRequestOptions): Promise<OwnedCard[]> {
  const payload = await cardRequest({
    apiBaseUrl,
    getAccessToken,
    method: 'GET',
    path: '/cards/collection',
    signal,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, collectionResponseKeys) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.cards)
  ) {
    throw new CardApiError('unavailable');
  }

  return payload.cards.map(parseOwnedCard);
}

export async function selectStarter({
  affinity,
  apiBaseUrl,
  getAccessToken,
  signal,
}: SelectStarterOptions): Promise<StarterGrant> {
  const payload = await cardRequest({
    apiBaseUrl,
    body: { affinity },
    getAccessToken,
    method: 'POST',
    path: '/cards/starter',
    signal,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, starterResponseKeys) ||
    !isUuid(payload.starterGrantId) ||
    payload.affinity !== affinity ||
    !isDateTime(payload.grantedAt) ||
    !Array.isArray(payload.cards) ||
    payload.cards.length !== 5 ||
    typeof payload.requestId !== 'string'
  ) {
    throw new CardApiError('unavailable');
  }

  const cards = payload.cards.map(parseOwnedCard);

  if (!isValidStarterGrant(cards, affinity)) {
    throw new CardApiError('unavailable');
  }

  return {
    affinity,
    cards,
    grantedAt: payload.grantedAt,
    starterGrantId: payload.starterGrantId,
  };
}

interface RequestOptions extends CardRequestOptions {
  body?: object;
  method: 'GET' | 'POST';
  path: string;
}

async function cardRequest({
  apiBaseUrl,
  body,
  getAccessToken,
  method,
  path,
  signal,
}: RequestOptions): Promise<unknown> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new CardApiError('authorization');
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method,
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new CardApiError('unavailable');
  }

  if (!response.ok) {
    throw await parseCardError(response);
  }

  try {
    return await response.json();
  } catch {
    throw new CardApiError('unavailable');
  }
}

async function parseCardError(response: Response): Promise<CardApiError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return new CardApiError(
      response.status === 401 ? 'authorization' : 'unavailable',
    );
  }

  const code = isRecord(payload) ? payload.code : undefined;
  const requestId =
    isRecord(payload) && typeof payload.requestId === 'string'
      ? payload.requestId
      : undefined;

  if (response.status === 401) {
    return new CardApiError('authorization', requestId);
  }

  if (response.status === 409 && code === 'STARTER_ALREADY_CLAIMED') {
    return new CardApiError('starter-already-claimed', requestId);
  }

  if (response.status === 409 && code === 'STARTER_CATALOGUE_UNAVAILABLE') {
    return new CardApiError('starter-unavailable', requestId);
  }

  return new CardApiError('unavailable', requestId);
}

function parseOwnedCard(value: unknown): OwnedCard {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ownedCardKeys) ||
    !isUuid(value.ownedCardId) ||
    !isUuid(value.cardDefinitionId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isCardCategory(value.category) ||
    !isCardAffinity(value.affinity) ||
    !isCardRarity(value.rarity) ||
    !isNullablePositiveInteger(value.hp) ||
    !isNullableNonNegativeInteger(value.power) ||
    (value.description !== null && typeof value.description !== 'string') ||
    (value.imageUrl !== null && typeof value.imageUrl !== 'string') ||
    typeof value.isActive !== 'boolean' ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.effects) ||
    (value.acquisitionKind !== 'starter' &&
      value.acquisitionKind !== 'event_reward') ||
    !isDateTime(value.acquiredAt)
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    acquiredAt: value.acquiredAt,
    acquisitionKind: value.acquisitionKind,
    affinity: value.affinity,
    cardDefinitionId: value.cardDefinitionId,
    category: value.category,
    description: value.description,
    effects: value.effects.map(parseEffect),
    hp: value.hp,
    imageUrl: value.imageUrl,
    isActive: value.isActive,
    moves: value.moves.map(parseMove),
    name: value.name,
    ownedCardId: value.ownedCardId,
    power: value.power,
    rarity: value.rarity,
  };
}

function parseMove(value: unknown): CardMove {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, moveKeys) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isMoveType(value.moveType) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns) ||
    !isNonNegativeInteger(value.powerCost)
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    effectType: value.effectType,
    effectValue: value.effectValue,
    id: value.id,
    modifierDurationTurns: value.modifierDurationTurns,
    modifierOperation: value.modifierOperation,
    modifierStat: value.modifierStat,
    moveType: value.moveType,
    name: value.name,
    position: value.position,
    powerCost: value.powerCost,
  };
}

function parseEffect(value: unknown): CardEffect {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, effectKeys) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns)
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    effectType: value.effectType,
    effectValue: value.effectValue,
    id: value.id,
    modifierDurationTurns: value.modifierDurationTurns,
    modifierOperation: value.modifierOperation,
    modifierStat: value.modifierStat,
    position: value.position,
  };
}

function isValidStarterGrant(cards: OwnedCard[], affinity: CardAffinity) {
  const creatureCount = cards.filter(
    (card) => card.category === 'creature',
  ).length;
  const powerCount = cards.filter((card) => card.category === 'power').length;
  const definitionIds = new Set(
    cards.map((card) => card.cardDefinitionId.toLowerCase()),
  );
  const ownedCardIds = new Set(
    cards.map((card) => card.ownedCardId.toLowerCase()),
  );

  return (
    cards.length === 5 &&
    creatureCount === 3 &&
    powerCount === 2 &&
    cards.every(
      (card) =>
        card.acquisitionKind === 'starter' &&
        card.affinity === affinity &&
        card.rarity === 'common',
    ) &&
    definitionIds.size === 5 &&
    ownedCardIds.size === 5
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value);

  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = dateTimePattern.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1]! &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isCardAffinity(value: unknown): value is CardAffinity {
  return cardAffinities.some((affinity) => affinity === value);
}

function isCardCategory(value: unknown): value is CardCategory {
  return value === 'creature' || value === 'power';
}

function isCardRarity(value: unknown): value is CardRarity {
  return (
    value === 'common' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary'
  );
}

function isMoveType(value: unknown): value is CardMove['moveType'] {
  return value === 'basic' || isCardAffinity(value);
}

function isEffectType(value: unknown): value is CardEffectType {
  return (
    value === 'damage' ||
    value === 'debuff' ||
    value === 'heal' ||
    value === 'buff'
  );
}

function isNullableModifierStat(
  value: unknown,
): value is CardModifierStat | null {
  return (
    value === null ||
    value === 'hp' ||
    value === 'power' ||
    value === 'damage_multiplier'
  );
}

function isNullableModifierOperation(
  value: unknown,
): value is CardMove['modifierOperation'] {
  return value === null || value === 'add' || value === 'multiply';
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}
