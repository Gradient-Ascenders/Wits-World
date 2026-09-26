import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import type { CardAffinity, CardCategory, CardRarity } from './cards';

export type CardTradeStatus =
  'open' | 'completed' | 'declined' | 'cancelled' | 'expired' | 'invalidated';

export interface TradeCardDefinition {
  affinity: CardAffinity | null;
  cardDefinitionId: string;
  category: CardCategory;
  imageAlt: string | null;
  imageUrl: string | null;
  name: string;
  rarity: CardRarity;
}

export interface TradeOfferedCopy extends TradeCardDefinition {
  ownedCardId: string;
}

export interface TradeRequestedDefinition extends TradeCardDefinition {
  quantity: number;
}

export interface TradeParty {
  accepted: boolean;
  imbalanceAcknowledged: boolean;
  offeredCopies: TradeOfferedCopy[];
  rarityPoints: number;
  requestedDefinitions: TradeRequestedDefinition[];
}

export interface CardTrade {
  complete: boolean;
  counterparty: TradeParty;
  counterpartyPlayerName: string;
  createdAt: string;
  expiresAt: string;
  imbalanceWarningRequired: boolean;
  role: 'sender' | 'recipient';
  self: TradeParty;
  settlement: { completedAt: string } | null;
  status: CardTradeStatus;
  terminalAt: string | null;
  tradeId: string;
  version: number;
}

export interface TradeSummary {
  counterpartyPlayerName: string;
  createdAt: string;
  direction: 'received' | 'sent';
  expiresAt: string;
  status: CardTradeStatus;
  terminalAt: string | null;
  tradeId: string;
  version: number;
}

export interface TradePage {
  hasMore: boolean;
  items: TradeSummary[];
  page: number;
  pageSize: number;
}

export type TradeSelectionAvailability =
  | 'available'
  | 'selected_here'
  | 'saved_deck'
  | 'gameplay_commitment'
  | 'other_trade'
  | 'inactive_definition'
  | 'collection_minimum';

export type TradeSelectionIssue =
  | 'offer_required'
  | 'request_required'
  | 'copy_limit'
  | 'request_limit'
  | 'unavailable_copy'
  | 'definition_unavailable'
  | 'collection_minimum';

export interface TradeSelectionCopy extends TradeOfferedCopy {
  availability: TradeSelectionAvailability;
}

export interface TradeSelectionPreview {
  imbalanceWarningRequired: boolean;
  issues: TradeSelectionIssue[];
  limits: {
    maximumCopiesPerSide: number;
    minimumCreatureCopies: number;
    minimumPowerCopies: number;
  };
  offeredRarityPoints: number;
  ownedCopies: TradeSelectionCopy[];
  requestedDefinitions: TradeRequestedDefinition[];
  requestedRarityPoints: number;
  valid: boolean;
}

export interface RequestedDefinitionInput {
  cardDefinitionId: string;
  quantity: number;
}

export type TradeApiFailure =
  | 'authorization'
  | 'recent-authentication'
  | 'validation'
  | 'not-found'
  | 'player-unavailable'
  | 'action-not-allowed'
  | 'player-limit'
  | 'daily-limit'
  | 'copy-conflict'
  | 'stale'
  | 'not-open'
  | 'incomplete'
  | 'imbalance-acknowledgement'
  | 'inventory-minimum'
  | 'idempotency-conflict'
  | 'rate-limit'
  | 'unavailable';

export class TradeApiError extends Error {
  public constructor(
    public readonly failure: TradeApiFailure,
    public readonly options: {
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The card trade request could not be completed.');
    this.name = 'TradeApiError';
  }
}

interface RequestOptions {
  apiBaseUrl: string;
  body?: object;
  getAccessToken: ApiAccessTokenProvider;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  signal: AbortSignal;
}

interface BaseOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

const cardKeys = [
  'affinity',
  'cardDefinitionId',
  'category',
  'imageAlt',
  'imageUrl',
  'name',
  'rarity',
] as const;
const offeredCopyKeys = [...cardKeys, 'ownedCardId'] as const;
const requestedDefinitionKeys = [...cardKeys, 'quantity'] as const;
const partyKeys = [
  'accepted',
  'imbalanceAcknowledged',
  'offeredCopies',
  'rarityPoints',
  'requestedDefinitions',
] as const;
const tradeKeys = [
  'complete',
  'counterparty',
  'counterpartyPlayerName',
  'createdAt',
  'expiresAt',
  'imbalanceWarningRequired',
  'role',
  'self',
  'settlement',
  'status',
  'terminalAt',
  'tradeId',
  'version',
] as const;
const summaryKeys = [
  'counterpartyPlayerName',
  'createdAt',
  'direction',
  'expiresAt',
  'status',
  'terminalAt',
  'tradeId',
  'version',
] as const;
const statuses = new Set<CardTradeStatus>([
  'open',
  'completed',
  'declined',
  'cancelled',
  'expired',
  'invalidated',
]);
const categories = new Set<CardCategory>(['creature', 'power']);
const affinities = new Set<CardAffinity>([
  'wit',
  'grit',
  'spark',
  'spirit',
  'mystic',
]);
const rarities = new Set<CardRarity>(['common', 'rare', 'epic', 'legendary']);
const availabilities = new Set<TradeSelectionAvailability>([
  'available',
  'selected_here',
  'saved_deck',
  'gameplay_commitment',
  'other_trade',
  'inactive_definition',
  'collection_minimum',
]);
const issues = new Set<TradeSelectionIssue>([
  'offer_required',
  'request_required',
  'copy_limit',
  'request_limit',
  'unavailable_copy',
  'definition_unavailable',
  'collection_minimum',
]);

export async function listTradingCatalogue(
  options: BaseOptions,
): Promise<TradeCardDefinition[]> {
  const payload = await tradeRequest({
    ...options,
    method: 'GET',
    path: '/cards/trading-catalogue',
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['definitions', 'requestId']) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.definitions)
  ) {
    throw new TradeApiError('unavailable');
  }
  return payload.definitions.map((definition) => {
    if (!isRecord(definition) || !hasExactKeys(definition, cardKeys)) {
      throw new TradeApiError('unavailable');
    }
    return parseDefinition(definition);
  });
}

export async function listTrades(
  options: BaseOptions & {
    direction?: 'received' | 'sent';
    page?: number;
    pageSize?: number;
    status?: CardTradeStatus;
  },
): Promise<TradePage> {
  const query = new URLSearchParams();
  if (options.direction) query.set('direction', options.direction);
  if (options.status) query.set('status', options.status);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('pageSize', String(options.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const payload = await tradeRequest({
    ...options,
    method: 'GET',
    path: `/trades${suffix}`,
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      'hasMore',
      'items',
      'page',
      'pageSize',
      'requestId',
    ]) ||
    typeof payload.requestId !== 'string' ||
    typeof payload.hasMore !== 'boolean' ||
    !isPositiveInteger(payload.page) ||
    !isPositiveInteger(payload.pageSize) ||
    !Array.isArray(payload.items)
  ) {
    throw new TradeApiError('unavailable');
  }
  return {
    hasMore: payload.hasMore,
    items: payload.items.map(parseSummary),
    page: payload.page,
    pageSize: payload.pageSize,
  };
}

export async function getTrade(
  options: BaseOptions & { tradeId: string },
): Promise<CardTrade> {
  return tradeEnvelope(
    await tradeRequest({
      ...options,
      method: 'GET',
      path: `/trades/${encodeURIComponent(options.tradeId)}`,
    }),
  );
}

export async function previewTradeSelection(
  options: BaseOptions & {
    expectedVersion?: number;
    offeredOwnedCardIds: string[];
    requestedDefinitions: RequestedDefinitionInput[];
    tradeId?: string;
  },
): Promise<TradeSelectionPreview> {
  const payload = await tradeRequest({
    ...options,
    body: {
      ...(options.tradeId ? { tradeId: options.tradeId } : {}),
      ...(options.expectedVersion
        ? { expectedVersion: options.expectedVersion }
        : {}),
      offeredOwnedCardIds: options.offeredOwnedCardIds,
      requestedDefinitions: options.requestedDefinitions,
    },
    method: 'POST',
    path: '/trades/selection-preview',
  });
  return parseSelectionPreview(payload);
}

export async function createTrade(
  options: BaseOptions & {
    offeredOwnedCardIds: string[];
    recipientPlayerName: string;
    requestedDefinitions: RequestedDefinitionInput[];
    submissionId: string;
  },
): Promise<CardTrade> {
  return mutateTrade(options, '/trades', 'POST', {
    offeredOwnedCardIds: options.offeredOwnedCardIds,
    recipientPlayerName: options.recipientPlayerName,
    requestedDefinitions: options.requestedDefinitions,
    submissionId: options.submissionId,
  });
}

export async function reviseTrade(
  options: BaseOptions & {
    expectedVersion: number;
    offeredOwnedCardIds: string[];
    requestedDefinitions: RequestedDefinitionInput[];
    submissionId: string;
    tradeId: string;
  },
): Promise<CardTrade> {
  return mutateTrade(
    options,
    `/trades/${encodeURIComponent(options.tradeId)}`,
    'PUT',
    {
      expectedVersion: options.expectedVersion,
      offeredOwnedCardIds: options.offeredOwnedCardIds,
      requestedDefinitions: options.requestedDefinitions,
      submissionId: options.submissionId,
    },
  );
}

export async function acknowledgeTradeImbalance(
  options: BaseOptions & {
    expectedVersion: number;
    submissionId: string;
    tradeId: string;
  },
): Promise<CardTrade> {
  return versionedMutation(options, 'imbalance-acknowledgement');
}

export async function acceptTrade(
  options: BaseOptions & {
    expectedVersion: number;
    reauthenticationToken: string;
    submissionId: string;
    tradeId: string;
  },
): Promise<CardTrade> {
  return mutateTrade(
    options,
    `/trades/${encodeURIComponent(options.tradeId)}/accept`,
    'POST',
    {
      expectedVersion: options.expectedVersion,
      reauthenticationToken: options.reauthenticationToken,
      submissionId: options.submissionId,
    },
  );
}

export async function declineTrade(
  options: BaseOptions & { submissionId: string; tradeId: string },
): Promise<CardTrade> {
  return terminalMutation(options, 'decline');
}

export async function cancelTrade(
  options: BaseOptions & { submissionId: string; tradeId: string },
): Promise<CardTrade> {
  return terminalMutation(options, 'cancel');
}

async function versionedMutation(
  options: BaseOptions & {
    expectedVersion: number;
    submissionId: string;
    tradeId: string;
  },
  action: 'imbalance-acknowledgement',
) {
  return mutateTrade(
    options,
    `/trades/${encodeURIComponent(options.tradeId)}/${action}`,
    'POST',
    {
      expectedVersion: options.expectedVersion,
      submissionId: options.submissionId,
    },
  );
}

async function terminalMutation(
  options: BaseOptions & { submissionId: string; tradeId: string },
  action: 'cancel' | 'decline',
) {
  return mutateTrade(
    options,
    `/trades/${encodeURIComponent(options.tradeId)}/${action}`,
    'POST',
    { submissionId: options.submissionId },
  );
}

async function mutateTrade(
  options: BaseOptions,
  path: string,
  method: 'POST' | 'PUT',
  body: object,
) {
  return tradeEnvelope(await tradeRequest({ ...options, body, method, path }));
}

function tradeEnvelope(payload: unknown): CardTrade {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['requestId', 'trade']) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new TradeApiError('unavailable');
  }
  return parseTrade(payload.trade);
}

async function tradeRequest({
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
    throw new TradeApiError('authorization');
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
    if (signal.aborted) throw error;
    throw new TradeApiError('unavailable');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw parseTradeError(response, payload);
  return payload;
}

function parseTradeError(response: Response, payload: unknown): TradeApiError {
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
  const failureByCode: Record<string, TradeApiFailure> = {
    RECENT_AUTHENTICATION_REQUIRED: 'recent-authentication',
    VALIDATION_ERROR: 'validation',
    TRADE_NOT_FOUND: 'not-found',
    TRADE_PLAYER_UNAVAILABLE: 'player-unavailable',
    TRADE_ACTION_NOT_ALLOWED: 'action-not-allowed',
    TRADE_PLAYER_LIMIT_REACHED: 'player-limit',
    TRADE_DAILY_LIMIT_REACHED: 'daily-limit',
    TRADE_COPY_CONFLICT: 'copy-conflict',
    TRADE_VERSION_STALE: 'stale',
    TRADE_NOT_OPEN: 'not-open',
    TRADE_INCOMPLETE: 'incomplete',
    TRADE_IMBALANCE_ACK_REQUIRED: 'imbalance-acknowledgement',
    TRADE_INVENTORY_MINIMUM: 'inventory-minimum',
    TRADE_IDEMPOTENCY_CONFLICT: 'idempotency-conflict',
  };
  const failure =
    (code ? failureByCode[code] : undefined) ??
    (response.status === 401 || response.status === 403
      ? 'authorization'
      : response.status === 404
        ? 'not-found'
        : response.status === 429
          ? 'rate-limit'
          : response.status === 400
            ? 'validation'
            : 'unavailable');
  return new TradeApiError(failure, { code, detail, requestId });
}

function parseTrade(value: unknown): CardTrade {
  if (!isRecord(value) || !hasExactKeys(value, tradeKeys)) {
    throw new TradeApiError('unavailable');
  }
  if (
    typeof value.tradeId !== 'string' ||
    (value.role !== 'sender' && value.role !== 'recipient') ||
    typeof value.counterpartyPlayerName !== 'string' ||
    !isStatus(value.status) ||
    !isPositiveInteger(value.version) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.expiresAt) ||
    !(value.terminalAt === null || isDateTime(value.terminalAt)) ||
    typeof value.complete !== 'boolean' ||
    typeof value.imbalanceWarningRequired !== 'boolean'
  ) {
    throw new TradeApiError('unavailable');
  }
  const settlement = value.settlement;
  if (!(
    settlement === null ||
    (isRecord(settlement) &&
      hasExactKeys(settlement, ['completedAt']) &&
      isDateTime(settlement.completedAt))
  )) {
    throw new TradeApiError('unavailable');
  }
  return {
    complete: value.complete,
    counterparty: parseParty(value.counterparty),
    counterpartyPlayerName: value.counterpartyPlayerName,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    imbalanceWarningRequired: value.imbalanceWarningRequired,
    role: value.role,
    self: parseParty(value.self),
    settlement: settlement as { completedAt: string } | null,
    status: value.status,
    terminalAt: value.terminalAt,
    tradeId: value.tradeId,
    version: value.version,
  };
}

function parseParty(value: unknown): TradeParty {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, partyKeys) ||
    typeof value.accepted !== 'boolean' ||
    typeof value.imbalanceAcknowledged !== 'boolean' ||
    !Array.isArray(value.offeredCopies) ||
    !Array.isArray(value.requestedDefinitions) ||
    !isNonNegativeInteger(value.rarityPoints)
  ) {
    throw new TradeApiError('unavailable');
  }
  return {
    accepted: value.accepted,
    imbalanceAcknowledged: value.imbalanceAcknowledged,
    offeredCopies: value.offeredCopies.map(parseOfferedCopy),
    rarityPoints: value.rarityPoints,
    requestedDefinitions: value.requestedDefinitions.map(parseRequested),
  };
}

function parseSummary(value: unknown): TradeSummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, summaryKeys) ||
    typeof value.tradeId !== 'string' ||
    (value.direction !== 'received' && value.direction !== 'sent') ||
    !isStatus(value.status) ||
    !isPositiveInteger(value.version) ||
    typeof value.counterpartyPlayerName !== 'string' ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.expiresAt) ||
    !(value.terminalAt === null || isDateTime(value.terminalAt))
  ) {
    throw new TradeApiError('unavailable');
  }
  return value as unknown as TradeSummary;
}

function parseSelectionPreview(payload: unknown): TradeSelectionPreview {
  const keys = [
    'imbalanceWarningRequired',
    'issues',
    'limits',
    'offeredRarityPoints',
    'ownedCopies',
    'requestedDefinitions',
    'requestedRarityPoints',
    'requestId',
    'valid',
  ] as const;
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, keys) ||
    typeof payload.requestId !== 'string' ||
    typeof payload.valid !== 'boolean' ||
    typeof payload.imbalanceWarningRequired !== 'boolean' ||
    !isNonNegativeInteger(payload.offeredRarityPoints) ||
    !isNonNegativeInteger(payload.requestedRarityPoints) ||
    !Array.isArray(payload.issues) ||
    !payload.issues.every(
      (issue): issue is TradeSelectionIssue =>
        typeof issue === 'string' && issues.has(issue as TradeSelectionIssue),
    ) ||
    !Array.isArray(payload.ownedCopies) ||
    !Array.isArray(payload.requestedDefinitions) ||
    !isRecord(payload.limits) ||
    !hasExactKeys(payload.limits, [
      'maximumCopiesPerSide',
      'minimumCreatureCopies',
      'minimumPowerCopies',
    ]) ||
    !isPositiveInteger(payload.limits.maximumCopiesPerSide) ||
    !isNonNegativeInteger(payload.limits.minimumCreatureCopies) ||
    !isNonNegativeInteger(payload.limits.minimumPowerCopies)
  ) {
    throw new TradeApiError('unavailable');
  }
  return {
    imbalanceWarningRequired: payload.imbalanceWarningRequired,
    issues: payload.issues,
    limits: {
      maximumCopiesPerSide: payload.limits.maximumCopiesPerSide,
      minimumCreatureCopies: payload.limits.minimumCreatureCopies,
      minimumPowerCopies: payload.limits.minimumPowerCopies,
    },
    offeredRarityPoints: payload.offeredRarityPoints,
    ownedCopies: payload.ownedCopies.map((copy) => {
      if (
        !isRecord(copy) ||
        !hasExactKeys(copy, [...offeredCopyKeys, 'availability']) ||
        typeof copy.availability !== 'string' ||
        !availabilities.has(copy.availability as TradeSelectionAvailability)
      ) {
        throw new TradeApiError('unavailable');
      }
      const { availability, ...offeredCopy } = copy;
      return {
        ...parseOfferedCopy(offeredCopy),
        availability: availability as TradeSelectionAvailability,
      };
    }),
    requestedDefinitions: payload.requestedDefinitions.map(parseRequested),
    requestedRarityPoints: payload.requestedRarityPoints,
    valid: payload.valid,
  };
}

function parseOfferedCopy(value: unknown): TradeOfferedCopy {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, offeredCopyKeys) ||
    typeof value.ownedCardId !== 'string'
  ) {
    throw new TradeApiError('unavailable');
  }
  return { ...parseDefinition(value), ownedCardId: value.ownedCardId };
}

function parseRequested(value: unknown): TradeRequestedDefinition {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, requestedDefinitionKeys) ||
    !isPositiveInteger(value.quantity)
  ) {
    throw new TradeApiError('unavailable');
  }
  return { ...parseDefinition(value), quantity: value.quantity };
}

function parseDefinition(value: unknown): TradeCardDefinition {
  if (
    !isRecord(value) ||
    !cardKeys.every((key) => key in value) ||
    typeof value.cardDefinitionId !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.category !== 'string' ||
    !categories.has(value.category as CardCategory) ||
    !(
      value.affinity === null ||
      (typeof value.affinity === 'string' &&
        affinities.has(value.affinity as CardAffinity))
    ) ||
    typeof value.rarity !== 'string' ||
    !rarities.has(value.rarity as CardRarity) ||
    !(value.imageUrl === null || typeof value.imageUrl === 'string') ||
    !(value.imageAlt === null || typeof value.imageAlt === 'string')
  ) {
    throw new TradeApiError('unavailable');
  }
  return {
    affinity: value.affinity as CardAffinity | null,
    cardDefinitionId: value.cardDefinitionId,
    category: value.category as CardCategory,
    imageAlt: value.imageAlt as string | null,
    imageUrl: value.imageUrl as string | null,
    name: value.name,
    rarity: value.rarity as CardRarity,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isStatus(value: unknown): value is CardTradeStatus {
  return typeof value === 'string' && statuses.has(value as CardTradeStatus);
}
