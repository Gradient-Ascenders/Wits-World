import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export const cardAffinities = [
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
] as const;

export type CardAffinity = (typeof cardAffinities)[number];
export type StarterAffinity = Extract<CardAffinity, 'spark' | 'grit' | 'wit'>;
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
  rulesText?: string | null;
}

export interface CardEffect {
  effectType: CardEffectType;
  effectValue: number | null;
  id: string;
  modifierDurationTurns: number | null;
  modifierOperation: 'add' | 'multiply' | null;
  modifierStat: CardModifierStat | null;
  position: number;
  rulesText?: string | null;
}

export interface CardPresentation {
  affinity: CardAffinity | null;
  cardDefinitionId: string;
  category: CardCategory;
  description: string | null;
  effects: CardEffect[];
  hp: number | null;
  imageAlt?: string | null;
  imageUrl: string | null;
  isActive: boolean;
  moves: CardMove[];
  name: string;
  power: number | null;
  rarity: CardRarity;
}

export interface OwnedCard extends CardPresentation {
  acquiredAt: string;
  acquisitionKind: 'event_reward' | 'evolution' | 'starter' | 'trade';
  ownedCardId: string;
}

export interface EvolutionCardDefinition extends CardPresentation {
  deckPointCost: number;
}

export interface EvolutionOwnedCopy {
  acquiredAt: string;
  acquisitionKind: OwnedCard['acquisitionKind'];
  eligible: boolean;
  lockReason: 'saved_deck' | 'trade_reservation' | null;
  ownedCardId: string;
}

export interface CardEvolutionPreview {
  canEvolve: boolean;
  copies: EvolutionOwnedCopy[];
  copiesRequired: 3;
  deckLockedCopyCount: number;
  tradeReservedCopyCount: number;
  eligibleCopyCount: number;
  ownedCopyCount: number;
  requestId: string;
  source: EvolutionCardDefinition;
  target: EvolutionCardDefinition;
  unavailableReason:
    'insufficient_copies' | 'saved_deck_lock' | 'trade_reservation' | null;
}

export interface CardEvolutionResult {
  completedAt: string;
  consumedOwnedCardIds: [string, string, string];
  evolutionId: string;
  newCard: OwnedCard;
  replayed: boolean;
  requestId: string;
  sourceCardDefinitionId: string;
  submissionId: string;
  target: EvolutionCardDefinition;
}

export interface StarterGrant {
  affinity: CardAffinity;
  cards: OwnedCard[];
  grantedAt: string;
  starterGrantId: string;
}

export type StarterPreviewMove = Omit<CardMove, 'id'>;
export type StarterPreviewEffect = Omit<CardEffect, 'id'>;

export interface StarterOption {
  affinity: StarterAffinity;
  composition: {
    creatureCount: 3;
    powerCardCount: 2;
  };
  creatures: {
    hp: number;
    moves: StarterPreviewMove[];
    name: string;
    power: number;
  }[];
  description: string;
  highlights: [string, string, string];
  powerCards: {
    effects: StarterPreviewEffect[];
    name: string;
  }[];
  title: string;
}

const collectionResponseKeys = ['cards', 'requestId'] as const;
const starterResponseKeys = [
  'affinity',
  'cards',
  'grantedAt',
  'requestId',
  'starterGrantId',
] as const;
const starterOptionsResponseKeys = ['options', 'requestId'] as const;
const evolutionPreviewResponseKeys = [
  'canEvolve',
  'copies',
  'copiesRequired',
  'deckLockedCopyCount',
  'tradeReservedCopyCount',
  'eligibleCopyCount',
  'ownedCopyCount',
  'requestId',
  'source',
  'target',
  'unavailableReason',
] as const;
const evolutionResultResponseKeys = [
  'completedAt',
  'consumedOwnedCardIds',
  'evolutionId',
  'newCard',
  'replayed',
  'requestId',
  'sourceCardDefinitionId',
  'submissionId',
  'target',
] as const;
const evolutionDefinitionKeys = [
  'affinity',
  'cardDefinitionId',
  'category',
  'deckPointCost',
  'description',
  'effects',
  'hp',
  'imageAlt',
  'imageUrl',
  'isActive',
  'moves',
  'name',
  'power',
  'rarity',
] as const;
const evolutionCopyKeys = [
  'acquiredAt',
  'acquisitionKind',
  'eligible',
  'lockReason',
  'ownedCardId',
] as const;
const starterOptionKeys = [
  'affinity',
  'composition',
  'creatures',
  'description',
  'highlights',
  'powerCards',
  'title',
] as const;
const starterCompositionKeys = ['creatureCount', 'powerCardCount'] as const;
const starterCreatureKeys = ['hp', 'moves', 'name', 'power'] as const;
const starterPowerCardKeys = ['effects', 'name'] as const;
const ownedCardKeys = [
  'acquiredAt',
  'acquisitionKind',
  'affinity',
  'cardDefinitionId',
  'category',
  'description',
  'effects',
  'hp',
  'imageAlt',
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
  'rulesText',
] as const;
const effectKeys = [
  'effectType',
  'effectValue',
  'id',
  'modifierDurationTurns',
  'modifierOperation',
  'modifierStat',
  'position',
  'rulesText',
] as const;
const previewMoveKeys = moveKeys.filter((key) => key !== 'id');
const previewEffectKeys = effectKeys.filter((key) => key !== 'id');

const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

export type CardApiFailure =
  | 'account-unavailable'
  | 'authorization'
  | 'evolution-deck-locked'
  | 'evolution-trade-reserved'
  | 'evolution-insufficient-copies'
  | 'evolution-not-available'
  | 'evolution-replay-conflict'
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
  affinity: StarterAffinity;
}

interface PreviewEvolutionOptions extends CardRequestOptions {
  sourceCardDefinitionId: string;
}

interface EvolveCardsOptions extends PreviewEvolutionOptions {
  submissionId: string;
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

export async function listStarterOptions({
  apiBaseUrl,
  getAccessToken,
  signal,
}: CardRequestOptions): Promise<StarterOption[]> {
  const payload = await cardRequest({
    apiBaseUrl,
    getAccessToken,
    method: 'GET',
    path: '/cards/starter-options',
    signal,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, starterOptionsResponseKeys) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.options) ||
    payload.options.length !== 3
  ) {
    throw new CardApiError('unavailable');
  }

  const options = payload.options.map(parseStarterOption);

  if (new Set(options.map((option) => option.affinity)).size !== 3) {
    throw new CardApiError('unavailable');
  }

  return options;
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

export async function previewCardEvolution({
  apiBaseUrl,
  getAccessToken,
  signal,
  sourceCardDefinitionId,
}: PreviewEvolutionOptions): Promise<CardEvolutionPreview> {
  const payload = await cardRequest({
    apiBaseUrl,
    getAccessToken,
    method: 'GET',
    path: `/cards/evolutions/${encodeURIComponent(sourceCardDefinitionId)}/preview`,
    signal,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, evolutionPreviewResponseKeys) ||
    typeof payload.requestId !== 'string' ||
    payload.copiesRequired !== 3 ||
    !isNonNegativeInteger(payload.ownedCopyCount) ||
    !isNonNegativeInteger(payload.eligibleCopyCount) ||
    !isNonNegativeInteger(payload.deckLockedCopyCount) ||
    !isNonNegativeInteger(payload.tradeReservedCopyCount) ||
    !Array.isArray(payload.copies) ||
    typeof payload.canEvolve !== 'boolean' ||
    (payload.unavailableReason !== null &&
      payload.unavailableReason !== 'insufficient_copies' &&
      payload.unavailableReason !== 'saved_deck_lock' &&
      payload.unavailableReason !== 'trade_reservation')
  ) {
    throw new CardApiError('unavailable');
  }

  const source = parseEvolutionDefinition(payload.source);
  const target = parseEvolutionDefinition(payload.target);
  const copies = payload.copies.map(parseEvolutionCopy);
  const eligibleCopyCount = copies.filter((copy) => copy.eligible).length;
  const deckLockedCopyCount = copies.filter(
    (copy) => copy.lockReason === 'saved_deck',
  ).length;
  const tradeReservedCopyCount = copies.filter(
    (copy) => copy.lockReason === 'trade_reservation',
  ).length;
  const expectedReason =
    eligibleCopyCount >= 3
      ? null
      : copies.length >= 3 && tradeReservedCopyCount > 0
        ? 'trade_reservation'
        : copies.length >= 3 && deckLockedCopyCount > 0
          ? 'saved_deck_lock'
          : 'insufficient_copies';

  if (
    source.cardDefinitionId !== sourceCardDefinitionId ||
    source.cardDefinitionId === target.cardDefinitionId ||
    new Set(copies.map((copy) => copy.ownedCardId)).size !== copies.length ||
    payload.ownedCopyCount !== copies.length ||
    payload.eligibleCopyCount !== eligibleCopyCount ||
    payload.deckLockedCopyCount !== deckLockedCopyCount ||
    payload.tradeReservedCopyCount !== tradeReservedCopyCount ||
    payload.canEvolve !== eligibleCopyCount >= 3 ||
    payload.unavailableReason !== expectedReason
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    canEvolve: payload.canEvolve,
    copies,
    copiesRequired: 3,
    deckLockedCopyCount,
    tradeReservedCopyCount,
    eligibleCopyCount,
    ownedCopyCount: copies.length,
    requestId: payload.requestId,
    source,
    target,
    unavailableReason: payload.unavailableReason,
  };
}

export async function evolveCards({
  apiBaseUrl,
  getAccessToken,
  signal,
  sourceCardDefinitionId,
  submissionId,
}: EvolveCardsOptions): Promise<CardEvolutionResult> {
  const payload = await cardRequest({
    apiBaseUrl,
    body: { submissionId, sourceCardDefinitionId },
    getAccessToken,
    method: 'POST',
    path: '/cards/evolutions',
    signal,
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, evolutionResultResponseKeys) ||
    !isUuid(payload.evolutionId) ||
    payload.submissionId !== submissionId ||
    payload.sourceCardDefinitionId !== sourceCardDefinitionId ||
    !Array.isArray(payload.consumedOwnedCardIds) ||
    payload.consumedOwnedCardIds.length !== 3 ||
    !payload.consumedOwnedCardIds.every(isUuid) ||
    new Set(payload.consumedOwnedCardIds).size !== 3 ||
    !isDateTime(payload.completedAt) ||
    typeof payload.replayed !== 'boolean' ||
    typeof payload.requestId !== 'string'
  ) {
    throw new CardApiError('unavailable');
  }

  const target = parseEvolutionDefinition(payload.target);
  const newCard = parseOwnedCard(payload.newCard);

  if (
    newCard.acquisitionKind !== 'evolution' ||
    newCard.cardDefinitionId !== target.cardDefinitionId
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    completedAt: payload.completedAt,
    consumedOwnedCardIds: payload.consumedOwnedCardIds as [
      string,
      string,
      string,
    ],
    evolutionId: payload.evolutionId,
    newCard,
    replayed: payload.replayed,
    requestId: payload.requestId,
    sourceCardDefinitionId,
    submissionId,
    target,
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

  const evolutionFailures: Record<string, CardApiFailure> = {
    ACCOUNT_UNAVAILABLE: 'account-unavailable',
    EVOLUTION_COPIES_DECK_LOCKED: 'evolution-deck-locked',
    EVOLUTION_COPIES_TRADE_RESERVED: 'evolution-trade-reserved',
    EVOLUTION_COPIES_INSUFFICIENT: 'evolution-insufficient-copies',
    EVOLUTION_NOT_AVAILABLE: 'evolution-not-available',
    EVOLUTION_REPLAY_CONFLICT: 'evolution-replay-conflict',
  };

  if (typeof code === 'string' && evolutionFailures[code]) {
    return new CardApiError(evolutionFailures[code], requestId);
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
  const legacyKeys = ownedCardKeys.filter((key) => key !== 'imageAlt');
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, ownedCardKeys) && !hasExactKeys(value, legacyKeys)) ||
    !isUuid(value.ownedCardId) ||
    !isUuid(value.cardDefinitionId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isCardCategory(value.category) ||
    (value.category === 'creature'
      ? !isCardAffinity(value.affinity)
      : value.affinity !== null && !isCardAffinity(value.affinity)) ||
    !isCardRarity(value.rarity) ||
    !isNullablePositiveInteger(value.hp) ||
    !isNullableNonNegativeInteger(value.power) ||
    (value.description !== null && typeof value.description !== 'string') ||
    (value.imageAlt !== undefined &&
      value.imageAlt !== null &&
      typeof value.imageAlt !== 'string') ||
    (value.imageUrl !== null && typeof value.imageUrl !== 'string') ||
    typeof value.isActive !== 'boolean' ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.effects) ||
    (value.acquisitionKind !== 'starter' &&
      value.acquisitionKind !== 'event_reward' &&
      value.acquisitionKind !== 'evolution' &&
      value.acquisitionKind !== 'trade') ||
    !isDateTime(value.acquiredAt)
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    acquiredAt: value.acquiredAt,
    acquisitionKind: value.acquisitionKind,
    affinity: isCardAffinity(value.affinity) ? value.affinity : null,
    cardDefinitionId: value.cardDefinitionId,
    category: value.category,
    description: value.description,
    effects: value.effects.map(parseEffect),
    hp: value.hp,
    ...(value.imageAlt === undefined
      ? {}
      : { imageAlt: value.imageAlt as string | null }),
    imageUrl: value.imageUrl,
    isActive: value.isActive,
    moves: value.moves.map(parseMove),
    name: value.name,
    ownedCardId: value.ownedCardId,
    power: value.power,
    rarity: value.rarity,
  };
}

function parseEvolutionDefinition(value: unknown): EvolutionCardDefinition {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, evolutionDefinitionKeys) ||
    !isUuid(value.cardDefinitionId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isCardCategory(value.category) ||
    (value.category === 'creature'
      ? !isCardAffinity(value.affinity)
      : value.affinity !== null && !isCardAffinity(value.affinity)) ||
    !isCardRarity(value.rarity) ||
    !isNullablePositiveInteger(value.hp) ||
    !isNullableNonNegativeInteger(value.power) ||
    (value.description !== null && typeof value.description !== 'string') ||
    (value.imageAlt !== null && typeof value.imageAlt !== 'string') ||
    (value.imageUrl !== null && typeof value.imageUrl !== 'string') ||
    typeof value.isActive !== 'boolean' ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.effects) ||
    !Number.isInteger(value.deckPointCost) ||
    Number(value.deckPointCost) < 1 ||
    Number(value.deckPointCost) > 4
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    affinity: isCardAffinity(value.affinity) ? value.affinity : null,
    cardDefinitionId: value.cardDefinitionId,
    category: value.category,
    deckPointCost: value.deckPointCost as number,
    description: value.description,
    effects: value.effects.map(parseEffect),
    hp: value.hp,
    imageAlt: value.imageAlt,
    imageUrl: value.imageUrl,
    isActive: value.isActive,
    moves: value.moves.map(parseMove),
    name: value.name,
    power: value.power,
    rarity: value.rarity,
  };
}

function parseEvolutionCopy(value: unknown): EvolutionOwnedCopy {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, evolutionCopyKeys) ||
    !isUuid(value.ownedCardId) ||
    !isDateTime(value.acquiredAt) ||
    (value.acquisitionKind !== 'starter' &&
      value.acquisitionKind !== 'event_reward' &&
      value.acquisitionKind !== 'evolution' &&
      value.acquisitionKind !== 'trade') ||
    typeof value.eligible !== 'boolean' ||
    (value.lockReason !== null &&
      value.lockReason !== 'saved_deck' &&
      value.lockReason !== 'trade_reservation') ||
    value.eligible !== (value.lockReason === null)
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    acquiredAt: value.acquiredAt,
    acquisitionKind: value.acquisitionKind,
    eligible: value.eligible,
    lockReason: value.lockReason,
    ownedCardId: value.ownedCardId,
  };
}

function parseStarterOption(value: unknown): StarterOption {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, starterOptionKeys) ||
    !isStarterAffinity(value.affinity) ||
    typeof value.title !== 'string' ||
    value.title.trim() === '' ||
    typeof value.description !== 'string' ||
    value.description.trim() === '' ||
    !Array.isArray(value.highlights) ||
    value.highlights.length !== 3 ||
    !value.highlights.every(
      (highlight) => typeof highlight === 'string' && highlight.trim() !== '',
    ) ||
    !isRecord(value.composition) ||
    !hasExactKeys(value.composition, starterCompositionKeys) ||
    value.composition.creatureCount !== 3 ||
    value.composition.powerCardCount !== 2 ||
    !Array.isArray(value.creatures) ||
    value.creatures.length !== 3 ||
    !Array.isArray(value.powerCards) ||
    value.powerCards.length !== 2
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    affinity: value.affinity,
    composition: { creatureCount: 3, powerCardCount: 2 },
    creatures: value.creatures.map(parseStarterCreature),
    description: value.description,
    highlights: value.highlights as [string, string, string],
    powerCards: value.powerCards.map(parseStarterPowerCard),
    title: value.title,
  };
}

function parseStarterCreature(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, starterCreatureKeys) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isPositiveInteger(value.hp) ||
    !isNonNegativeInteger(value.power) ||
    !Array.isArray(value.moves) ||
    value.moves.length !== 4
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    hp: value.hp,
    moves: value.moves.map(parseStarterPreviewMove),
    name: value.name,
    power: value.power,
  };
}

function parseStarterPowerCard(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, starterPowerCardKeys) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !Array.isArray(value.effects) ||
    value.effects.length === 0
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    effects: value.effects.map(parseStarterPreviewEffect),
    name: value.name,
  };
}

function parseMove(value: unknown): CardMove {
  const legacyKeys = moveKeys.filter((key) => key !== 'rulesText');
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, moveKeys) && !hasExactKeys(value, legacyKeys)) ||
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
    !isNonNegativeInteger(value.powerCost) ||
    (value.rulesText !== undefined &&
      value.rulesText !== null &&
      typeof value.rulesText !== 'string')
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
    ...(value.rulesText === undefined
      ? {}
      : { rulesText: value.rulesText as string | null }),
  };
}

function parseEffect(value: unknown): CardEffect {
  const legacyKeys = effectKeys.filter((key) => key !== 'rulesText');
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, effectKeys) && !hasExactKeys(value, legacyKeys)) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns) ||
    (value.rulesText !== undefined &&
      value.rulesText !== null &&
      typeof value.rulesText !== 'string')
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
    ...(value.rulesText === undefined
      ? {}
      : { rulesText: value.rulesText as string | null }),
  };
}

function parseStarterPreviewMove(value: unknown): StarterPreviewMove {
  const legacyKeys = previewMoveKeys.filter((key) => key !== 'rulesText');
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, previewMoveKeys) &&
      !hasExactKeys(value, legacyKeys)) ||
    !isPositiveInteger(value.position) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isMoveType(value.moveType) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns) ||
    !isNonNegativeInteger(value.powerCost) ||
    (value.rulesText !== undefined &&
      value.rulesText !== null &&
      typeof value.rulesText !== 'string')
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    effectType: value.effectType,
    effectValue: value.effectValue,
    modifierDurationTurns: value.modifierDurationTurns,
    modifierOperation: value.modifierOperation,
    modifierStat: value.modifierStat,
    moveType: value.moveType,
    name: value.name,
    position: value.position,
    powerCost: value.powerCost,
    ...(value.rulesText === undefined
      ? {}
      : { rulesText: value.rulesText as string | null }),
  };
}

function parseStarterPreviewEffect(value: unknown): StarterPreviewEffect {
  const legacyKeys = previewEffectKeys.filter((key) => key !== 'rulesText');
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, previewEffectKeys) &&
      !hasExactKeys(value, legacyKeys)) ||
    !isPositiveInteger(value.position) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns) ||
    (value.rulesText !== undefined &&
      value.rulesText !== null &&
      typeof value.rulesText !== 'string')
  ) {
    throw new CardApiError('unavailable');
  }

  return {
    effectType: value.effectType,
    effectValue: value.effectValue,
    modifierDurationTurns: value.modifierDurationTurns,
    modifierOperation: value.modifierOperation,
    modifierStat: value.modifierStat,
    position: value.position,
    ...(value.rulesText === undefined
      ? {}
      : { rulesText: value.rulesText as string | null }),
  };
}

function isValidStarterGrant(cards: OwnedCard[], affinity: StarterAffinity) {
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
        (card.category === 'creature'
          ? card.affinity === affinity
          : card.affinity === null || card.affinity === affinity) &&
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

function isStarterAffinity(value: unknown): value is StarterAffinity {
  return value === 'spark' || value === 'grit' || value === 'wit';
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
