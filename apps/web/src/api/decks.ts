import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import {
  cardAffinities,
  type CardAffinity,
  type CardCategory,
  type CardRarity,
} from './cards';

export interface SavedDeckCard {
  affinity: CardAffinity | null;
  cardDefinitionId: string;
  category: CardCategory;
  name: string;
  ownedCardId: string;
  position: number;
  rarity: CardRarity;
}

export interface SavedDeck {
  cards: SavedDeckCard[];
  createdAt: string;
  deckId: string;
  isSelected: boolean;
  name: string;
  totalPoints: number;
  updatedAt: string;
}

export interface SaveDeckInput {
  name: string;
  ownedCardIds: string[];
}

export type DeckApiFailure =
  | 'authorization'
  | 'cards-unavailable'
  | 'composition'
  | 'copy-duplicated'
  | 'name'
  | 'not-found'
  | 'point-cap'
  | 'size'
  | 'unavailable'
  | 'validation';

export class DeckApiError extends Error {
  public constructor(
    public readonly failure: DeckApiFailure,
    public readonly options: {
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The saved deck request could not be completed.');
    this.name = 'DeckApiError';
  }
}

interface DeckRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface DeckMutationOptions extends DeckRequestOptions {
  deckId: string;
}

interface SaveDeckOptions extends DeckRequestOptions {
  deck: SaveDeckInput;
}

interface UpdateDeckOptions extends SaveDeckOptions {
  deckId: string;
}

const listResponseKeys = ['decks', 'requestId'] as const;
const deckResponseKeys = [
  'cards',
  'createdAt',
  'deckId',
  'isSelected',
  'name',
  'requestId',
  'totalPoints',
  'updatedAt',
] as const;
const savedDeckKeys = deckResponseKeys.filter((key) => key !== 'requestId');
const savedDeckCardKeys = [
  'affinity',
  'cardDefinitionId',
  'category',
  'name',
  'ownedCardId',
  'position',
  'rarity',
] as const;

const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

export async function listSavedDecks(
  options: DeckRequestOptions,
): Promise<SavedDeck[]> {
  const payload = await deckRequest({
    ...options,
    method: 'GET',
    path: '/decks',
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, listResponseKeys) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.decks)
  ) {
    throw new DeckApiError('unavailable');
  }

  const decks = payload.decks.map(parseSavedDeck);

  if (decks.filter((deck) => deck.isSelected).length > 1) {
    throw new DeckApiError('unavailable');
  }

  return decks;
}

export async function createSavedDeck({
  deck,
  ...options
}: SaveDeckOptions): Promise<SavedDeck> {
  return saveDeckRequest({
    ...options,
    body: deck,
    method: 'POST',
    path: '/decks',
  });
}

export async function updateSavedDeck({
  deck,
  deckId,
  ...options
}: UpdateDeckOptions): Promise<SavedDeck> {
  return saveDeckRequest({
    ...options,
    body: deck,
    method: 'PUT',
    path: `/decks/${encodeURIComponent(deckId)}`,
  });
}

export async function selectSavedDeck({
  deckId,
  ...options
}: DeckMutationOptions): Promise<SavedDeck> {
  const selected = await saveDeckRequest({
    ...options,
    method: 'PUT',
    path: `/decks/${encodeURIComponent(deckId)}/selection`,
  });

  if (selected.deckId !== deckId || !selected.isSelected) {
    throw new DeckApiError('unavailable');
  }

  return selected;
}

export async function deleteSavedDeck({
  deckId,
  ...options
}: DeckMutationOptions): Promise<void> {
  await deckRequest({
    ...options,
    expectEmptyResponse: true,
    method: 'DELETE',
    path: `/decks/${encodeURIComponent(deckId)}`,
  });
}

interface RequestOptions extends DeckRequestOptions {
  body?: object;
  expectEmptyResponse?: boolean;
  method: 'DELETE' | 'GET' | 'POST' | 'PUT';
  path: string;
}

async function saveDeckRequest(options: RequestOptions): Promise<SavedDeck> {
  const payload = await deckRequest(options);

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, deckResponseKeys) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new DeckApiError('unavailable');
  }

  return parseSavedDeck({
    cards: payload.cards,
    createdAt: payload.createdAt,
    deckId: payload.deckId,
    isSelected: payload.isSelected,
    name: payload.name,
    totalPoints: payload.totalPoints,
    updatedAt: payload.updatedAt,
  });
}

async function deckRequest({
  apiBaseUrl,
  body,
  expectEmptyResponse = false,
  getAccessToken,
  method,
  path,
  signal,
}: RequestOptions): Promise<unknown> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new DeckApiError('authorization');
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

    throw new DeckApiError('unavailable');
  }

  if (!response.ok) {
    throw await parseDeckError(response);
  }

  if (expectEmptyResponse) {
    if (response.status !== 204) {
      throw new DeckApiError('unavailable');
    }

    return undefined;
  }

  try {
    return await response.json();
  } catch {
    throw new DeckApiError('unavailable');
  }
}

async function parseDeckError(response: Response): Promise<DeckApiError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return new DeckApiError(
      response.status === 401 ? 'authorization' : 'unavailable',
    );
  }

  const code =
    isRecord(payload) && typeof payload.code === 'string'
      ? payload.code
      : undefined;
  const detail =
    isRecord(payload) && typeof payload.detail === 'string'
      ? payload.detail
      : undefined;
  const requestId =
    isRecord(payload) && typeof payload.requestId === 'string'
      ? payload.requestId
      : undefined;
  const options = { code, detail, requestId };

  if (response.status === 401) {
    return new DeckApiError('authorization', options);
  }

  const failures: Readonly<Record<string, DeckApiFailure>> = {
    DECK_COMPOSITION_INVALID: 'composition',
    DECK_COPY_DUPLICATED: 'copy-duplicated',
    DECK_NOT_FOUND: 'not-found',
    DECK_POINT_CAP_EXCEEDED: 'point-cap',
    DECK_SIZE_INVALID: 'size',
    INVALID_DECK_CARDS: 'cards-unavailable',
    INVALID_DECK_NAME: 'name',
    VALIDATION_ERROR: 'validation',
  };

  return new DeckApiError(
    code === undefined ? 'unavailable' : (failures[code] ?? 'unavailable'),
    options,
  );
}

function parseSavedDeck(value: unknown): SavedDeck {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, savedDeckKeys) ||
    !isUuid(value.deckId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    typeof value.isSelected !== 'boolean' ||
    !Number.isInteger(value.totalPoints) ||
    Number(value.totalPoints) < 5 ||
    Number(value.totalPoints) > 10 ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !Array.isArray(value.cards) ||
    value.cards.length !== 5
  ) {
    throw new DeckApiError('unavailable');
  }

  const cards = value.cards.map(parseSavedDeckCard);
  const positions = new Set(cards.map((card) => card.position));
  const ownedCardIds = new Set(
    cards.map((card) => card.ownedCardId.toLowerCase()),
  );

  if (positions.size !== 5 || ownedCardIds.size !== 5) {
    throw new DeckApiError('unavailable');
  }

  return {
    cards: [...cards].sort((left, right) => left.position - right.position),
    createdAt: value.createdAt,
    deckId: value.deckId,
    isSelected: value.isSelected,
    name: value.name,
    totalPoints: Number(value.totalPoints),
    updatedAt: value.updatedAt,
  };
}

function parseSavedDeckCard(value: unknown): SavedDeckCard {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, savedDeckCardKeys) ||
    !Number.isInteger(value.position) ||
    Number(value.position) < 1 ||
    Number(value.position) > 5 ||
    !isUuid(value.ownedCardId) ||
    !isUuid(value.cardDefinitionId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isCardCategory(value.category) ||
    (value.category === 'creature'
      ? !isCardAffinity(value.affinity)
      : value.affinity !== null && !isCardAffinity(value.affinity)) ||
    !isCardRarity(value.rarity)
  ) {
    throw new DeckApiError('unavailable');
  }

  return {
    affinity: isCardAffinity(value.affinity) ? value.affinity : null,
    cardDefinitionId: value.cardDefinitionId,
    category: value.category,
    name: value.name,
    ownedCardId: value.ownedCardId,
    position: Number(value.position),
    rarity: value.rarity,
  };
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

function isCardCategory(value: unknown): value is CardCategory {
  return value === 'creature' || value === 'power';
}

function isCardAffinity(value: unknown): value is CardAffinity {
  return cardAffinities.some((affinity) => affinity === value);
}

function isCardRarity(value: unknown): value is CardRarity {
  return (
    value === 'common' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary'
  );
}
