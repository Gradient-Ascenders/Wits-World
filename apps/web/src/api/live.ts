import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import type { LocationClaim } from '../browser-location';
import {
  parseMatchCreature,
  parseMatchPowerCard,
  type CpuMatchIntent,
  type MatchCreature,
  type MatchPowerCard,
} from './matches';

export type LiveRole = 'participant' | 'spectator';
export type LivePhase =
  'initial_selection' | 'active' | 'replacement' | 'completed';
export type LiveCompletionReason =
  | 'defeat'
  | 'abandonment_forfeit'
  | 'voluntary_resignation'
  | 'account_deletion_forfeit';

export interface LiveOpponent {
  activeCreature: MatchCreature | null;
  defeatedCreatures: MatchCreature[];
  playerName: string;
  playedPowerCards: MatchPowerCard[];
  remainingCreatureCount: number;
  remainingPowerCardCount: number;
}

export interface LiveSelf {
  activeCreatureId: string | null;
  creatures: MatchCreature[];
  playerName: string;
  powerCards: MatchPowerCard[];
  usedPowerCardIds: string[];
}

export interface LiveHistoryEntry {
  actionType: CpuMatchIntent['type'] | null;
  automatic: boolean;
  loser: 'playerOne' | 'playerTwo' | null;
  side: 'playerOne' | 'playerTwo' | null;
  type:
    | 'initial_selection_submitted'
    | 'participant_action'
    | 'automatic_initial_selection'
    | 'automatic_replacement'
    | 'timeout'
    | 'abandonment_forfeit'
    | 'voluntary_resignation'
    | 'account_deletion_forfeit';
  winner: 'playerOne' | 'playerTwo' | null;
}

interface LiveProjectionBase {
  completedAt: string | null;
  completionReason: LiveCompletionReason | null;
  matchId: string;
  mode: 'live';
  phase: LivePhase;
  startedAt: string;
  status: 'active' | 'completed';
  turnDeadline: string | null;
  turnNumber: number;
  updatedAt: string;
  version: number;
}

export interface LiveParticipantProjection extends LiveProjectionBase {
  consecutiveTimeouts: { opponent: number; self: number };
  currentActor: 'self' | 'opponent' | null;
  history: LiveHistoryEntry[];
  lastAction: LiveHistoryEntry | null;
  legalActions: CpuMatchIntent[];
  opponent: LiveOpponent;
  outcome: 'win' | 'loss' | null;
  role: 'participant';
  self: LiveSelf;
  selfSide: 'playerOne' | 'playerTwo';
}

export interface LiveSpectatorProjection extends LiveProjectionBase {
  consecutiveTimeouts: { playerOne: number; playerTwo: number };
  currentActor: 'playerOne' | 'playerTwo' | null;
  history: LiveHistoryEntry[];
  playerOne: LiveOpponent;
  playerTwo: LiveOpponent;
  presence: {
    playerOneConnected: boolean;
    playerTwoConnected: boolean;
    spectatorCount: number;
  };
  role: 'spectator';
  winner: 'playerOne' | 'playerTwo' | null;
}

export type LiveProjection =
  LiveParticipantProjection | LiveSpectatorProjection;

export interface LiveProjectionResponse {
  match: LiveProjection;
  requestId: string;
  serverTime: string;
}

export interface LiveConnectionTicket {
  expiresAt: string;
  protocolVersion: 1;
  requestId: string;
  role: LiveRole;
  ticket: string;
  webSocketUrl: string;
}

export type RankedQueueStatus =
  | 'idle'
  | 'searching'
  | 'proposed'
  | 'matched'
  | 'cancelled'
  | 'expired'
  | 'restricted'
  | 'invalid_deck';

export interface RankedQueueState {
  acceptanceDeadline: string | null;
  accepted: boolean;
  joinedAt: string | null;
  leaseExpiresAt: string | null;
  matchId: string | null;
  proposalId: string | null;
  queueEntryId: string | null;
  searchRange: number | null;
  seasonId: string | null;
  status: RankedQueueStatus;
}

export interface RankedSeason {
  activatedAt: string | null;
  activeEndsAt: string | null;
  closedAt: string | null;
  name: string;
  policyVersion: string;
  seasonId: string;
  status: 'active' | 'closing';
}

export interface RankedProfile {
  losses: number;
  placementMatchesRemaining: number;
  provisional: boolean;
  rating: number | null;
  season: RankedSeason | null;
  settledMatchCount: number;
  wins: number;
}

export interface RankedStanding {
  losses: number;
  playerName: string;
  rank: number;
  rating: number;
  settledMatchCount: number;
  wins: number;
}

export interface RankedStandingsPage {
  entries: RankedStanding[];
  nextCursor: string | null;
  season: RankedSeason;
}

export type RankedTerritoryExclusionReason =
  | 'daily_cap_reached'
  | 'placement_matches_remaining'
  | 'player_unavailable'
  | 'result_not_eligible'
  | 'zone_unavailable';

export interface RankedTerritoryContribution {
  exclusionReason: RankedTerritoryExclusionReason | null;
  influencePoints: number;
  outcome: 'pending' | 'lost' | 'accepted' | 'excluded';
  zoneId: string;
  zoneName: string;
}

export interface RankedSettlement {
  appliedDelta: number | null;
  completionReason: LiveCompletionReason | null;
  matchId: string;
  outcome: 'win' | 'loss' | null;
  ratingAfter: number | null;
  ratingBefore: number | null;
  seasonId: string;
  settledAt: string | null;
  status: 'pending' | 'settled';
  territory: RankedTerritoryContribution | null;
}

export interface RankedTerritoryClaim extends LocationClaim {
  zoneId: string;
}

export type LiveApiFailure =
  | 'authentication'
  | 'authorization'
  | 'conflict'
  | 'invalid-deck'
  | 'location'
  | 'not-found'
  | 'restricted'
  | 'territory-ineligible'
  | 'territory-unavailable'
  | 'unavailable'
  | 'validation';

export class LiveApiError extends Error {
  constructor(
    readonly failure: LiveApiFailure,
    readonly options: {
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The live battle request could not be completed.');
    this.name = 'LiveApiError';
  }
}

interface BaseRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export async function getLiveProjection(
  options: BaseRequestOptions & { matchId: string },
): Promise<LiveProjectionResponse> {
  const payload = await requestJson({
    ...options,
    method: 'GET',
    path: `/matches/live/${encodeURIComponent(options.matchId)}`,
  });
  if (!isRecord(payload)) throw new LiveApiError('unavailable');
  const { requestId, serverTime, ...projection } = payload;
  if (typeof requestId !== 'string' || !isDateTime(serverTime)) {
    throw new LiveApiError('unavailable');
  }
  return {
    match: parseLiveProjection(projection),
    requestId,
    serverTime,
  };
}

export async function createLiveConnectionTicket(
  options: BaseRequestOptions & { matchId: string; role: LiveRole },
): Promise<LiveConnectionTicket> {
  const payload = await requestJson({
    ...options,
    body: { role: options.role },
    method: 'POST',
    path: `/matches/live/${encodeURIComponent(options.matchId)}/connection-tickets`,
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      'ticket',
      'role',
      'protocolVersion',
      'expiresAt',
      'webSocketUrl',
      'requestId',
    ]) ||
    typeof payload.ticket !== 'string' ||
    !isLiveRole(payload.role) ||
    payload.role !== options.role ||
    payload.protocolVersion !== 1 ||
    !isDateTime(payload.expiresAt) ||
    typeof payload.webSocketUrl !== 'string' ||
    typeof payload.requestId !== 'string'
  ) {
    throw new LiveApiError('unavailable');
  }
  return payload as unknown as LiveConnectionTicket;
}

export async function getRankedQueue(
  options: BaseRequestOptions,
): Promise<RankedQueueState> {
  return parseRankedQueue(
    await requestJson({ ...options, method: 'GET', path: '/ranked/queue' }),
  );
}

export async function getCurrentRankedSeason(
  options: BaseRequestOptions,
): Promise<RankedSeason | null> {
  const payload = await requestJson({
    ...options,
    method: 'GET',
    path: '/ranked/seasons/current',
  });
  if (!isRecord(payload) || !hasExactKeys(payload, ['season'])) {
    throw new LiveApiError('unavailable');
  }
  if (payload.season === null) return null;
  return parseRankedSeason(payload.season);
}

export async function joinRankedQueue(
  options: BaseRequestOptions & {
    deckId: string;
    territoryClaim?: RankedTerritoryClaim;
  },
): Promise<RankedQueueState> {
  return parseRankedQueue(
    await requestJson({
      ...options,
      body: {
        deckId: options.deckId,
        ...(options.territoryClaim
          ? { territoryClaim: options.territoryClaim }
          : {}),
      },
      method: 'POST',
      path: '/ranked/queue',
    }),
  );
}

export async function getRankedProfile(
  options: BaseRequestOptions,
): Promise<RankedProfile> {
  return parseRankedProfile(
    await requestJson({ ...options, method: 'GET', path: '/ranked/me' }),
  );
}

export async function listRankedStandings(
  options: BaseRequestOptions & { cursor?: string; limit?: number },
): Promise<RankedStandingsPage> {
  const limit = options.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new LiveApiError('validation');
  }
  const query = new URLSearchParams({ limit: String(limit) });
  if (options.cursor) query.set('cursor', options.cursor);
  return parseRankedStandingsPage(
    await requestJson({
      ...options,
      method: 'GET',
      path: `/ranked/standings?${query.toString()}`,
    }),
  );
}

export async function getRankedSettlement(
  options: BaseRequestOptions & { matchId: string },
): Promise<RankedSettlement> {
  return parseRankedSettlement(
    await requestJson({
      ...options,
      method: 'GET',
      path: `/ranked/matches/${encodeURIComponent(options.matchId)}/settlement`,
    }),
  );
}

export async function heartbeatRankedQueue(
  options: BaseRequestOptions,
): Promise<RankedQueueState> {
  return parseRankedQueue(
    await requestJson({
      ...options,
      method: 'POST',
      path: '/ranked/queue/heartbeat',
    }),
  );
}

export async function cancelRankedQueue(
  options: BaseRequestOptions,
): Promise<RankedQueueState> {
  return parseRankedQueue(
    await requestJson({ ...options, method: 'DELETE', path: '/ranked/queue' }),
  );
}

export async function resolveRankedProposal(
  options: BaseRequestOptions & {
    action: 'accept' | 'decline';
    proposalId: string;
  },
): Promise<RankedQueueState> {
  return parseRankedQueue(
    await requestJson({
      ...options,
      method: 'POST',
      path: `/ranked/proposals/${encodeURIComponent(options.proposalId)}/${options.action}`,
    }),
  );
}

export type LiveServerMessage =
  | {
      connectionId: string;
      match: LiveProjection;
      role: LiveRole;
      serverTime: string;
      type: 'connection.ready';
      version: number;
    }
  | {
      eventId: string;
      match: LiveProjection;
      previousVersion?: number;
      serverTime: string;
      type: 'match.snapshot' | 'match.transition';
      version: number;
    }
  | {
      eventId: string;
      participants: {
        playerOneConnected: boolean;
        playerTwoConnected: boolean;
      };
      serverTime: string;
      spectatorCount: number;
      type: 'presence.changed';
      version: number;
    }
  | {
      eventId: string;
      messageId: string;
      serverTime: string;
      type: 'action.acknowledged';
      version: number;
    }
  | {
      code: string;
      detail: string;
      messageId?: string;
      retryable: boolean;
      serverTime: string;
      type: 'error';
    };

export function parseLiveServerMessage(value: string): LiveServerMessage {
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    throw new LiveApiError('unavailable', {
      detail: 'The live connection returned invalid data.',
    });
  }
  if (!isRecord(payload) || payload.protocolVersion !== 1) {
    throw new LiveApiError('unavailable');
  }
  const message = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'protocolVersion'),
  );
  if (message.type === 'connection.ready') {
    assertKeys(message, [
      'type',
      'connectionId',
      'role',
      'serverTime',
      'version',
      'match',
    ]);
    const match = parseLiveProjection(message.match);
    if (
      typeof message.connectionId !== 'string' ||
      !isLiveRole(message.role) ||
      message.role !== match.role ||
      !isDateTime(message.serverTime) ||
      !isVersion(message.version) ||
      message.version !== match.version
    ) {
      throw new LiveApiError('unavailable');
    }
    return Object.assign({}, message, {
      match,
    }) as unknown as LiveServerMessage;
  }
  if (
    message.type === 'match.snapshot' ||
    message.type === 'match.transition'
  ) {
    const keys = [
      'type',
      'eventId',
      ...(message.type === 'match.transition' ? ['previousVersion'] : []),
      'version',
      'serverTime',
      'match',
    ];
    assertKeys(message, keys);
    const match = parseLiveProjection(message.match);
    if (
      !isUuid(message.eventId) ||
      !isVersion(message.version) ||
      message.version !== match.version ||
      !isDateTime(message.serverTime) ||
      (message.type === 'match.transition' &&
        !isVersion(message.previousVersion))
    ) {
      throw new LiveApiError('unavailable');
    }
    return Object.assign({}, message, {
      match,
    }) as unknown as LiveServerMessage;
  }
  if (message.type === 'presence.changed') {
    assertKeys(message, [
      'type',
      'eventId',
      'version',
      'serverTime',
      'participants',
      'spectatorCount',
    ]);
    if (
      !isUuid(message.eventId) ||
      !isVersion(message.version) ||
      !isDateTime(message.serverTime) ||
      !isPresenceParticipants(message.participants) ||
      !Number.isInteger(message.spectatorCount) ||
      Number(message.spectatorCount) < 0
    ) {
      throw new LiveApiError('unavailable');
    }
    return message as unknown as LiveServerMessage;
  }
  if (message.type === 'action.acknowledged') {
    assertKeys(message, [
      'type',
      'messageId',
      'eventId',
      'version',
      'serverTime',
    ]);
    if (
      !isUuid(message.messageId) ||
      !isUuid(message.eventId) ||
      !isVersion(message.version) ||
      !isDateTime(message.serverTime)
    ) {
      throw new LiveApiError('unavailable');
    }
    return message as unknown as LiveServerMessage;
  }
  if (message.type === 'error') {
    const validKeys = message.messageId
      ? ['type', 'messageId', 'code', 'detail', 'retryable', 'serverTime']
      : ['type', 'code', 'detail', 'retryable', 'serverTime'];
    assertKeys(message, validKeys);
    if (
      (message.messageId !== undefined && !isUuid(message.messageId)) ||
      typeof message.code !== 'string' ||
      typeof message.detail !== 'string' ||
      typeof message.retryable !== 'boolean' ||
      !isDateTime(message.serverTime)
    ) {
      throw new LiveApiError('unavailable');
    }
    return message as unknown as LiveServerMessage;
  }
  throw new LiveApiError('unavailable');
}

export function buildLiveWebSocketUrl(
  webSocketUrl: string,
  ticket: string,
): string {
  const url = new URL(webSocketUrl, window.location.href);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

function parseLiveProjection(value: unknown): LiveProjection {
  if (!isRecord(value) || value.mode !== 'live' || !isLiveRole(value.role)) {
    throw new LiveApiError('unavailable');
  }
  const common = parseProjectionCommon(value);
  if (value.role === 'participant') {
    assertKeys(value, [
      ...projectionCommonKeys,
      'role',
      'currentActor',
      'consecutiveTimeouts',
      'selfSide',
      'self',
      'opponent',
      'legalActions',
      'history',
      'lastAction',
      'outcome',
    ]);
    if (
      !isNullableEnum(value.currentActor, ['self', 'opponent']) ||
      !isParticipantTimeouts(value.consecutiveTimeouts) ||
      !isEnum(value.selfSide, ['playerOne', 'playerTwo']) ||
      !Array.isArray(value.legalActions) ||
      !Array.isArray(value.history) ||
      !isNullableEnum(value.outcome, ['win', 'loss'])
    ) {
      throw new LiveApiError('unavailable');
    }
    const history = value.history.map(parseHistoryEntry);
    const lastAction =
      value.lastAction === null ? null : parseHistoryEntry(value.lastAction);
    return {
      ...common,
      role: 'participant',
      currentActor: value.currentActor,
      consecutiveTimeouts: value.consecutiveTimeouts,
      selfSide: value.selfSide,
      self: parseSelf(value.self),
      opponent: parseOpponent(value.opponent),
      legalActions: value.legalActions.map(parseLiveAction),
      history,
      lastAction,
      outcome: value.outcome,
    };
  }
  assertKeys(value, [
    ...projectionCommonKeys,
    'role',
    'currentActor',
    'consecutiveTimeouts',
    'playerOne',
    'playerTwo',
    'history',
    'presence',
    'winner',
  ]);
  if (
    !isNullableEnum(value.currentActor, ['playerOne', 'playerTwo']) ||
    !isSpectatorTimeouts(value.consecutiveTimeouts) ||
    !Array.isArray(value.history) ||
    !isPresence(value.presence) ||
    !Number.isInteger(value.presence.spectatorCount) ||
    Number(value.presence.spectatorCount) < 0 ||
    !isNullableEnum(value.winner, ['playerOne', 'playerTwo'])
  ) {
    throw new LiveApiError('unavailable');
  }
  return {
    ...common,
    role: 'spectator',
    currentActor: value.currentActor,
    consecutiveTimeouts: value.consecutiveTimeouts,
    playerOne: parseOpponent(value.playerOne),
    playerTwo: parseOpponent(value.playerTwo),
    history: value.history.map(parseHistoryEntry),
    presence: value.presence,
    winner: value.winner,
  };
}

const projectionCommonKeys = [
  'matchId',
  'mode',
  'status',
  'version',
  'phase',
  'turnNumber',
  'turnDeadline',
  'completionReason',
  'startedAt',
  'updatedAt',
  'completedAt',
] as const;

function parseProjectionCommon(value: Record<string, unknown>) {
  if (
    !isUuid(value.matchId) ||
    !isEnum(value.status, ['active', 'completed']) ||
    !isVersion(value.version) ||
    !isEnum(value.phase, [
      'initial_selection',
      'active',
      'replacement',
      'completed',
    ]) ||
    !Number.isInteger(value.turnNumber) ||
    Number(value.turnNumber) < 0 ||
    !isNullableDateTime(value.turnDeadline) ||
    !isNullableEnum(value.completionReason, [
      'defeat',
      'abandonment_forfeit',
      'voluntary_resignation',
      'account_deletion_forfeit',
    ]) ||
    !isDateTime(value.startedAt) ||
    !isDateTime(value.updatedAt) ||
    !isNullableDateTime(value.completedAt)
  ) {
    throw new LiveApiError('unavailable');
  }
  return {
    matchId: value.matchId,
    mode: 'live' as const,
    status: value.status,
    version: value.version,
    phase: value.phase,
    turnNumber: Number(value.turnNumber),
    turnDeadline: value.turnDeadline,
    completionReason: value.completionReason,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt,
  };
}

function parseSelf(value: unknown): LiveSelf {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'playerName',
      'creatures',
      'powerCards',
      'usedPowerCardIds',
      'activeCreatureId',
    ]) ||
    typeof value.playerName !== 'string' ||
    !Array.isArray(value.creatures) ||
    !Array.isArray(value.powerCards) ||
    !Array.isArray(value.usedPowerCardIds) ||
    !value.usedPowerCardIds.every(isUuid) ||
    !isNullableUuid(value.activeCreatureId)
  ) {
    throw new LiveApiError('unavailable');
  }
  try {
    return {
      playerName: value.playerName,
      creatures: value.creatures.map(parseMatchCreature),
      powerCards: value.powerCards.map(parseMatchPowerCard),
      usedPowerCardIds: value.usedPowerCardIds,
      activeCreatureId: value.activeCreatureId,
    };
  } catch {
    throw new LiveApiError('unavailable');
  }
}

function parseOpponent(value: unknown): LiveOpponent {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'playerName',
      'activeCreature',
      'defeatedCreatures',
      'remainingCreatureCount',
      'playedPowerCards',
      'remainingPowerCardCount',
    ]) ||
    typeof value.playerName !== 'string' ||
    !Array.isArray(value.defeatedCreatures) ||
    !Array.isArray(value.playedPowerCards) ||
    !Number.isInteger(value.remainingCreatureCount) ||
    !Number.isInteger(value.remainingPowerCardCount)
  ) {
    throw new LiveApiError('unavailable');
  }
  try {
    return {
      playerName: value.playerName,
      activeCreature:
        value.activeCreature === null
          ? null
          : parseMatchCreature(value.activeCreature),
      defeatedCreatures: value.defeatedCreatures.map(parseMatchCreature),
      remainingCreatureCount: Number(value.remainingCreatureCount),
      playedPowerCards: value.playedPowerCards.map(parseMatchPowerCard),
      remainingPowerCardCount: Number(value.remainingPowerCardCount),
    };
  } catch {
    throw new LiveApiError('unavailable');
  }
}

function parseHistoryEntry(value: unknown): LiveHistoryEntry {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new LiveApiError('unavailable');
  }
  const allowedTypes: LiveHistoryEntry['type'][] = [
    'initial_selection_submitted',
    'participant_action',
    'automatic_initial_selection',
    'automatic_replacement',
    'timeout',
    'abandonment_forfeit',
    'voluntary_resignation',
    'account_deletion_forfeit',
  ];
  if (!allowedTypes.includes(value.type as LiveHistoryEntry['type'])) {
    throw new LiveApiError('unavailable');
  }
  const actionType =
    isRecord(value.action) &&
    isEnum(value.action.type, [
      'select_initial_creature',
      'select_replacement',
      'swap_creature',
      'use_move',
      'use_power_card',
      'timeout',
    ])
      ? value.action.type === 'timeout'
        ? null
        : value.action.type
      : null;
  return {
    actionType,
    automatic: value.automatic === true,
    loser: isEnum(value.loser, ['playerOne', 'playerTwo']) ? value.loser : null,
    side: isEnum(value.side, ['playerOne', 'playerTwo']) ? value.side : null,
    type: value.type as LiveHistoryEntry['type'],
    winner: isEnum(value.winner, ['playerOne', 'playerTwo'])
      ? value.winner
      : null,
  };
}

function parseLiveAction(value: unknown): CpuMatchIntent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new LiveApiError('unavailable');
  }
  if (
    (value.type === 'select_initial_creature' ||
      value.type === 'select_replacement' ||
      value.type === 'swap_creature') &&
    hasExactKeys(value, ['type', 'creatureId']) &&
    isUuid(value.creatureId)
  ) {
    return { type: value.type, creatureId: value.creatureId };
  }
  if (
    value.type === 'use_move' &&
    hasExactKeys(value, ['type', 'moveId']) &&
    isUuid(value.moveId)
  ) {
    return { type: 'use_move', moveId: value.moveId };
  }
  if (
    value.type === 'use_power_card' &&
    hasExactKeys(value, ['type', 'powerCardId']) &&
    isUuid(value.powerCardId)
  ) {
    return { type: 'use_power_card', powerCardId: value.powerCardId };
  }
  throw new LiveApiError('unavailable');
}

function parseRankedQueue(value: unknown): RankedQueueState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'status',
      'queueEntryId',
      'seasonId',
      'joinedAt',
      'leaseExpiresAt',
      'searchRange',
      'proposalId',
      'acceptanceDeadline',
      'accepted',
      'matchId',
    ]) ||
    !isEnum(value.status, [
      'idle',
      'searching',
      'proposed',
      'matched',
      'cancelled',
      'expired',
      'restricted',
      'invalid_deck',
    ]) ||
    !isNullableUuid(value.queueEntryId) ||
    !isNullableUuid(value.seasonId) ||
    !isNullableDateTime(value.joinedAt) ||
    !isNullableDateTime(value.leaseExpiresAt) ||
    (value.searchRange !== null && !Number.isInteger(value.searchRange)) ||
    !isNullableUuid(value.proposalId) ||
    !isNullableDateTime(value.acceptanceDeadline) ||
    typeof value.accepted !== 'boolean' ||
    !isNullableUuid(value.matchId)
  ) {
    throw new LiveApiError('unavailable');
  }
  return value as unknown as RankedQueueState;
}

function parseRankedSeason(value: unknown): RankedSeason {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'seasonId',
      'name',
      'status',
      'policyVersion',
      'activatedAt',
      'activeEndsAt',
      'closedAt',
    ]) ||
    !isUuid(value.seasonId) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isEnum(value.status, ['active', 'closing']) ||
    typeof value.policyVersion !== 'string' ||
    !isNullableDateTime(value.activatedAt) ||
    !isNullableDateTime(value.activeEndsAt) ||
    !isNullableDateTime(value.closedAt)
  ) {
    throw new LiveApiError('unavailable');
  }
  return value as unknown as RankedSeason;
}

function parseRankedProfile(value: unknown): RankedProfile {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'season',
      'rating',
      'wins',
      'losses',
      'settledMatchCount',
      'placementMatchesRemaining',
      'provisional',
    ]) ||
    (value.season !== null && !isRecord(value.season)) ||
    (value.rating !== null && !isRating(value.rating)) ||
    !isNonNegativeInteger(value.wins) ||
    !isNonNegativeInteger(value.losses) ||
    !isNonNegativeInteger(value.settledMatchCount) ||
    !isBoundedInteger(value.placementMatchesRemaining, 0, 5) ||
    typeof value.provisional !== 'boolean'
  ) {
    throw new LiveApiError('unavailable');
  }
  return {
    losses: value.losses,
    placementMatchesRemaining: value.placementMatchesRemaining,
    provisional: value.provisional,
    rating: value.rating,
    season: value.season === null ? null : parseRankedSeason(value.season),
    settledMatchCount: value.settledMatchCount,
    wins: value.wins,
  };
}

function parseRankedStanding(value: unknown): RankedStanding {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'playerName',
      'rank',
      'rating',
      'wins',
      'losses',
      'settledMatchCount',
    ]) ||
    typeof value.playerName !== 'string' ||
    value.playerName.trim() === '' ||
    !isPositiveInteger(value.rank) ||
    !isRating(value.rating) ||
    !isNonNegativeInteger(value.wins) ||
    !isNonNegativeInteger(value.losses) ||
    !isBoundedInteger(value.settledMatchCount, 5, Number.MAX_SAFE_INTEGER)
  ) {
    throw new LiveApiError('unavailable');
  }
  return value as unknown as RankedStanding;
}

function parseRankedStandingsPage(value: unknown): RankedStandingsPage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['season', 'entries', 'nextCursor']) ||
    !Array.isArray(value.entries) ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string')
  ) {
    throw new LiveApiError('unavailable');
  }
  return {
    entries: value.entries.map(parseRankedStanding),
    nextCursor: value.nextCursor,
    season: parseRankedSeason(value.season),
  };
}

function parseRankedSettlement(value: unknown): RankedSettlement {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'matchId',
      'seasonId',
      'status',
      'completionReason',
      'outcome',
      'ratingBefore',
      'ratingAfter',
      'appliedDelta',
      'settledAt',
      'territory',
    ]) ||
    !isUuid(value.matchId) ||
    !isUuid(value.seasonId) ||
    !isEnum(value.status, ['pending', 'settled']) ||
    !isNullableEnum(value.completionReason, [
      'defeat',
      'abandonment_forfeit',
      'voluntary_resignation',
      'account_deletion_forfeit',
    ]) ||
    !isNullableEnum(value.outcome, ['win', 'loss']) ||
    !isNullableInteger(value.ratingBefore) ||
    !isNullableInteger(value.ratingAfter) ||
    !isNullableInteger(value.appliedDelta) ||
    !isNullableDateTime(value.settledAt) ||
    (value.status === 'settled' &&
      (value.completionReason === null ||
        value.outcome === null ||
        value.ratingBefore === null ||
        value.ratingAfter === null ||
        value.appliedDelta === null ||
        value.settledAt === null))
  ) {
    throw new LiveApiError('unavailable');
  }
  return {
    appliedDelta: value.appliedDelta,
    completionReason: value.completionReason,
    matchId: value.matchId,
    outcome: value.outcome,
    ratingAfter: value.ratingAfter,
    ratingBefore: value.ratingBefore,
    seasonId: value.seasonId,
    settledAt: value.settledAt,
    status: value.status,
    territory:
      value.territory === null
        ? null
        : parseRankedTerritoryContribution(value.territory),
  };
}

function parseRankedTerritoryContribution(
  value: unknown,
): RankedTerritoryContribution {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'zoneId',
      'zoneName',
      'outcome',
      'influencePoints',
      'exclusionReason',
    ]) ||
    !isUuid(value.zoneId) ||
    typeof value.zoneName !== 'string' ||
    value.zoneName.trim() === '' ||
    !isEnum(value.outcome, ['pending', 'lost', 'accepted', 'excluded']) ||
    !isNonNegativeInteger(value.influencePoints) ||
    !isNullableEnum(value.exclusionReason, [
      'daily_cap_reached',
      'placement_matches_remaining',
      'player_unavailable',
      'result_not_eligible',
      'zone_unavailable',
    ])
  ) {
    throw new LiveApiError('unavailable');
  }
  return value as unknown as RankedTerritoryContribution;
}

async function requestJson(
  options: BaseRequestOptions & {
    body?: object;
    method: 'DELETE' | 'GET' | 'POST';
    path: string;
  },
): Promise<unknown> {
  let token: string;
  try {
    token = await options.getAccessToken();
  } catch {
    throw new LiveApiError('authentication');
  }
  let response: Response;
  try {
    response = await fetch(`${options.apiBaseUrl}${options.path}`, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new LiveApiError('unavailable');
  }
  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;
  const problem = isRecord(payload) ? payload : {};
  const code = typeof problem.code === 'string' ? problem.code : undefined;
  const detail =
    typeof problem.detail === 'string' ? problem.detail : undefined;
  const requestId =
    typeof problem.requestId === 'string' ? problem.requestId : undefined;
  const failure: LiveApiFailure =
    response.status === 401
      ? 'authentication'
      : code === 'RANKED_RESTRICTED'
        ? 'restricted'
        : response.status === 403
          ? 'authorization'
          : response.status === 404
            ? 'not-found'
            : code === 'RANKED_DECK_INVALID'
              ? 'invalid-deck'
              : code === 'TERRITORY_LOCATION_INVALID' ||
                  code === 'TERRITORY_LOCATION_REFRESH_REQUIRED'
                ? 'location'
                : code === 'TERRITORY_NOT_ELIGIBLE'
                  ? 'territory-ineligible'
                  : code === 'TERRITORY_CONFIGURATION_UNAVAILABLE'
                    ? 'territory-unavailable'
                    : response.status === 409
                      ? 'conflict'
                      : response.status === 400
                        ? 'validation'
                        : 'unavailable';
  throw new LiveApiError(failure, { code, detail, requestId });
}

function isParticipantTimeouts(
  value: unknown,
): value is { self: number; opponent: number } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['self', 'opponent']) &&
    isTimeoutCount(value.self) &&
    isTimeoutCount(value.opponent)
  );
}

function isSpectatorTimeouts(
  value: unknown,
): value is { playerOne: number; playerTwo: number } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['playerOne', 'playerTwo']) &&
    isTimeoutCount(value.playerOne) &&
    isTimeoutCount(value.playerTwo)
  );
}

function isPresence(value: unknown): value is {
  playerOneConnected: boolean;
  playerTwoConnected: boolean;
  spectatorCount: number;
} {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'playerOneConnected',
      'playerTwoConnected',
      'spectatorCount',
    ]) &&
    typeof value.playerOneConnected === 'boolean' &&
    typeof value.playerTwoConnected === 'boolean' &&
    Number.isInteger(value.spectatorCount) &&
    Number(value.spectatorCount) >= 0
  );
}

function isPresenceParticipants(value: unknown): value is {
  playerOneConnected: boolean;
  playerTwoConnected: boolean;
} {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['playerOneConnected', 'playerTwoConnected']) &&
    typeof value.playerOneConnected === 'boolean' &&
    typeof value.playerTwoConnected === 'boolean'
  );
}

function isTimeoutCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function isRating(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 100;
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || Number.isSafeInteger(value);
}

function assertKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  if (!hasExactKeys(value, expected)) throw new LiveApiError('unavailable');
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isLiveRole(value: unknown): value is LiveRole {
  return value === 'participant' || value === 'spectator';
}

function isEnum<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isNullableEnum<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T | null {
  return value === null || isEnum(value, values);
}
