import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import {
  MatchApiError,
  parseMatchCreature,
  parseMatchPowerCard,
  type MatchCreature,
  type MatchEffectModifier,
  type MatchPowerCard,
} from './matches';

const PVP_ACCEPT =
  'application/vnd.wits-world.pvp.v4+json, application/vnd.wits-world.pvp.v3+json;q=0.9, application/json;q=0.8';

export type PvpInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'invalidated';

export type PvpAction =
  | { creatureId: string; type: 'select_replacement' }
  | { creatureId: string; type: 'swap_creature' }
  | { moveId: string; type: 'use_move' }
  | { powerCardId: string; type: 'use_power_card' };

export interface PvpInvitation {
  canCancel: boolean;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  expiresAt: string;
  invitationId: string;
  matchId: string | null;
  opponent: { playerName: string };
  respondedAt: string | null;
  status: PvpInvitationStatus;
  version: number;
}

export interface PvpMatchSummary {
  currentActor: 'self' | 'opponent';
  matchId: string;
  mode: 'asynchronous';
  opponent: { playerName: string };
  status: 'active';
  turnDeadline: string;
  updatedAt: string;
  version: number;
}

export type PvpCompletionReason =
  | 'account_deletion_forfeit'
  | 'defeat'
  | 'turn_forfeit'
  | 'voluntary_resignation';

export interface PvpHistorySummary {
  completedAt: string;
  completionReason: PvpCompletionReason;
  matchId: string;
  mode: 'asynchronous';
  opponent: { playerName: string };
  outcome: 'loss' | 'win';
  startedAt: string;
  status: 'completed';
}

export interface PvpActionEffect {
  amount: number;
  damageMultiplier: number | null;
  effectId: string;
  effectType: 'buff' | 'damage' | 'debuff' | 'heal';
  modifier: MatchEffectModifier | null;
  targetCreatureId: string;
  targetSide: 'opponent' | 'self';
}

export interface PvpActionResult {
  action: PvpAction;
  defeatedCreatureId: string | null;
  effects: PvpActionEffect[];
  side: 'opponent' | 'self';
  turnEnded: boolean;
  winner: 'opponent' | 'self' | null;
}

export interface PvpActionHistoryEntry {
  createdAt: string;
  result: PvpActionResult;
  sequence: number;
  turnNumber: number;
}

export interface AsyncPvpMatch {
  canResign: boolean;
  completedAt: string | null;
  completionReason: PvpCompletionReason | null;
  currentActor: 'opponent' | 'self' | null;
  history: PvpActionHistoryEntry[];
  lastAction: PvpActionResult | null;
  legalActions: PvpAction[];
  matchId: string;
  mode: 'asynchronous';
  opponent: { playerName: string };
  outcome: 'loss' | 'win' | null;
  startedAt: string;
  state: {
    opponent: {
      activeCreature: MatchCreature | null;
      defeatedCreatures: MatchCreature[];
      playedPowerCards: MatchPowerCard[];
      playerName: string;
      remainingCreatureCount: number;
      remainingPowerCardCount: number;
    };
    phase: 'active' | 'completed' | 'replacement';
    self: {
      activeCreatureId: string | null;
      creatures: MatchCreature[];
      playerName: string;
      powerCards: MatchPowerCard[];
      usedPowerCardIds: string[];
    };
    turnNumber: number;
  };
  status: 'active' | 'completed';
  turnDeadline: string | null;
  updatedAt: string;
  version: number;
}

export interface PvpPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type PvpApiFailure =
  | 'already-pending'
  | 'authorization'
  | 'completed'
  | 'cancelled'
  | 'conflict'
  | 'deck-invalid'
  | 'expired'
  | 'illegal-action'
  | 'invalidated'
  | 'not-found'
  | 'player-unavailable'
  | 'stale'
  | 'unavailable'
  | 'validation';

export class PvpApiError extends Error {
  public constructor(
    public readonly failure: PvpApiFailure,
    public readonly options: {
      ambiguous?: boolean;
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The PvP request could not be completed.');
    this.name = 'PvpApiError';
  }
}

interface RequestOptions {
  apiBaseUrl: string;
  body?: object;
  getAccessToken: ApiAccessTokenProvider;
  method: 'GET' | 'POST';
  path: string;
  signal: AbortSignal;
}

interface BaseOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

export async function findPvpPlayer(
  options: BaseOptions & { playerName: string },
): Promise<string> {
  const query = new URLSearchParams({ playerName: options.playerName });
  const payload = await pvpRequest({
    ...options,
    method: 'GET',
    path: `/matches/pvp/players?${query.toString()}`,
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['playerName', 'requestId']) ||
    typeof payload.playerName !== 'string' ||
    typeof payload.requestId !== 'string'
  ) {
    throw new PvpApiError('unavailable');
  }
  return payload.playerName;
}

export async function createPvpInvitation(
  options: BaseOptions & {
    deckId: string;
    initialCreatureId: string;
    opponentPlayerName: string;
    submissionId: string;
  },
): Promise<PvpInvitation> {
  const payload = await pvpRequest({
    ...options,
    body: {
      deckId: options.deckId,
      initialCreatureId: options.initialCreatureId,
      opponentPlayerName: options.opponentPlayerName,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: '/matches/pvp/invitations',
  });
  return parseInvitationEnvelope(payload);
}

export async function listPvpInvitations(
  options: BaseOptions & {
    cursor?: string;
    direction?: 'incoming' | 'outgoing';
    limit?: number;
    status?: PvpInvitationStatus;
  },
): Promise<PvpPage<PvpInvitation>> {
  const query = pageQuery(options, ['direction', 'status']);
  const payload = await pvpRequest({
    ...options,
    method: 'GET',
    path: `/matches/pvp/invitations${query}`,
  });
  return parsePage(payload, 'invitations', parseInvitation);
}

export async function acceptPvpInvitation(
  options: BaseOptions & {
    deckId: string;
    expectedVersion: number;
    initialCreatureId: string;
    invitationId: string;
    submissionId: string;
  },
): Promise<{ invitation: PvpInvitation; match: AsyncPvpMatch }> {
  const payload = await pvpRequest({
    ...options,
    body: {
      deckId: options.deckId,
      expectedVersion: options.expectedVersion,
      initialCreatureId: options.initialCreatureId,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: `/matches/pvp/invitations/${encodeURIComponent(options.invitationId)}/accept`,
  });
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['invitation', 'match', 'requestId']) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    invitation: parseInvitation(payload.invitation),
    match: parsePvpMatch(payload.match),
  };
}

export async function declinePvpInvitation(
  options: BaseOptions & {
    expectedVersion: number;
    invitationId: string;
    submissionId: string;
  },
): Promise<PvpInvitation> {
  const payload = await pvpRequest({
    ...options,
    body: {
      expectedVersion: options.expectedVersion,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: `/matches/pvp/invitations/${encodeURIComponent(options.invitationId)}/decline`,
  });
  return parseInvitationEnvelope(payload);
}

export async function cancelPvpInvitation(
  options: BaseOptions & {
    expectedVersion: number;
    invitationId: string;
    submissionId: string;
  },
): Promise<PvpInvitation> {
  const payload = await pvpRequest({
    ...options,
    body: {
      expectedVersion: options.expectedVersion,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: `/matches/pvp/invitations/${encodeURIComponent(options.invitationId)}/cancel`,
  });
  return parseInvitationEnvelope(payload);
}

export async function listActivePvpMatches(
  options: BaseOptions & { cursor?: string; limit?: number },
): Promise<PvpPage<PvpMatchSummary>> {
  const payload = await pvpRequest({
    ...options,
    method: 'GET',
    path: `/matches/pvp${pageQuery(options)}`,
  });
  return parsePage(payload, 'matches', parseMatchSummary);
}

export async function listPvpHistory(
  options: BaseOptions & { cursor?: string; limit?: number },
): Promise<PvpPage<PvpHistorySummary>> {
  const payload = await pvpRequest({
    ...options,
    method: 'GET',
    path: `/matches/pvp/history${pageQuery(options)}`,
  });
  return parsePage(payload, 'matches', parseHistorySummary);
}

export async function getPvpMatch(
  options: BaseOptions & { matchId: string },
): Promise<AsyncPvpMatch> {
  const payload = await pvpRequest({
    ...options,
    method: 'GET',
    path: `/matches/pvp/${encodeURIComponent(options.matchId)}`,
  });
  const match = parsePvpMatch(payload);
  if (match.matchId !== options.matchId) throw new PvpApiError('unavailable');
  return match;
}

export async function submitPvpAction(
  options: BaseOptions & {
    action: PvpAction;
    expectedVersion: number;
    matchId: string;
    submissionId: string;
  },
): Promise<AsyncPvpMatch> {
  const payload = await pvpRequest({
    ...options,
    body: {
      action: options.action,
      expectedVersion: options.expectedVersion,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: `/matches/pvp/${encodeURIComponent(options.matchId)}/actions`,
  });
  const match = parsePvpMatch(payload);
  if (match.matchId !== options.matchId) throw new PvpApiError('unavailable');
  return match;
}

export async function resignPvpMatch(
  options: BaseOptions & {
    expectedVersion: number;
    matchId: string;
    submissionId: string;
  },
): Promise<AsyncPvpMatch> {
  const payload = await pvpRequest({
    ...options,
    body: {
      expectedVersion: options.expectedVersion,
      submissionId: options.submissionId,
    },
    method: 'POST',
    path: `/matches/pvp/${encodeURIComponent(options.matchId)}/resign`,
  });
  const match = parsePvpMatch(payload);
  if (match.matchId !== options.matchId) throw new PvpApiError('unavailable');
  return match;
}

async function pvpRequest({
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
    throw new PvpApiError('authorization');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: PVP_ACCEPT,
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new PvpApiError('unavailable', { ambiguous: method === 'POST' });
  }

  if (!response.ok) throw await parsePvpError(response);
  try {
    return await response.json();
  } catch {
    throw new PvpApiError('unavailable', { ambiguous: method === 'POST' });
  }
}

async function parsePvpError(response: Response): Promise<PvpApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new PvpApiError(
      response.status === 401 ? 'authorization' : 'unavailable',
    );
  }
  const code =
    isRecord(payload) && typeof payload.code === 'string'
      ? payload.code
      : undefined;
  const options = {
    code,
    detail:
      isRecord(payload) && typeof payload.detail === 'string'
        ? payload.detail
        : undefined,
    requestId:
      isRecord(payload) && typeof payload.requestId === 'string'
        ? payload.requestId
        : undefined,
  };
  if (response.status === 401) return new PvpApiError('authorization', options);
  const failures: Readonly<Record<string, PvpApiFailure>> = {
    PVP_ACTION_ILLEGAL: 'illegal-action',
    PVP_DECK_INVALID: 'deck-invalid',
    PVP_IDEMPOTENCY_CONFLICT: 'conflict',
    PVP_INVITATION_ALREADY_PENDING: 'already-pending',
    PVP_INVITATION_CANCELLED: 'cancelled',
    PVP_INVITATION_EXPIRED: 'expired',
    PVP_INVITATION_INVALIDATED: 'invalidated',
    PVP_INVITATION_NOT_FOUND: 'not-found',
    PVP_INVITATION_VERSION_CONFLICT: 'stale',
    PVP_MATCH_COMPLETED: 'completed',
    PVP_MATCH_NOT_FOUND: 'not-found',
    PVP_MATCH_VERSION_CONFLICT: 'stale',
    PVP_PLAYER_UNAVAILABLE: 'player-unavailable',
    VALIDATION_ERROR: 'validation',
  };
  return new PvpApiError(
    code === undefined ? 'unavailable' : (failures[code] ?? 'unavailable'),
    options,
  );
}

function parseInvitationEnvelope(payload: unknown): PvpInvitation {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['invitation', 'requestId']) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new PvpApiError('unavailable');
  }
  return parseInvitation(payload.invitation);
}

function parsePage<T>(
  payload: unknown,
  collectionKey: 'invitations' | 'matches',
  parseItem: (value: unknown) => T,
): PvpPage<T> {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [collectionKey, 'nextCursor', 'requestId']) ||
    !Array.isArray(payload[collectionKey]) ||
    (payload.nextCursor !== null && typeof payload.nextCursor !== 'string') ||
    typeof payload.requestId !== 'string'
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    items: payload[collectionKey].map(parseItem),
    nextCursor: payload.nextCursor,
  };
}

function parseInvitation(value: unknown): PvpInvitation {
  const invitationKeys = [
    'invitationId',
    'direction',
    'status',
    'version',
    'opponent',
    'createdAt',
    'expiresAt',
    'respondedAt',
    'matchId',
  ] as const;
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, invitationKeys) &&
      !hasExactKeys(value, [...invitationKeys, 'canCancel'])) ||
    (value.canCancel !== undefined && typeof value.canCancel !== 'boolean') ||
    !isUuid(value.invitationId) ||
    (value.direction !== 'incoming' && value.direction !== 'outgoing') ||
    !isInvitationStatus(value.status) ||
    !isNonNegativeInteger(value.version) ||
    !isOpponent(value.opponent) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.expiresAt) ||
    !isNullableDateTime(value.respondedAt) ||
    !isNullableUuid(value.matchId)
  ) {
    throw new PvpApiError('unavailable');
  }
  if (
    (value.status === 'pending' && value.respondedAt !== null) ||
    (value.status !== 'pending' && value.respondedAt === null) ||
    (value.status === 'accepted') !== (value.matchId !== null) ||
    (value.canCancel === true &&
      (value.direction !== 'outgoing' || value.status !== 'pending'))
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    canCancel: value.canCancel === true,
    createdAt: value.createdAt,
    direction: value.direction,
    expiresAt: value.expiresAt,
    invitationId: value.invitationId,
    matchId: value.matchId,
    opponent: value.opponent,
    respondedAt: value.respondedAt,
    status: value.status,
    version: value.version,
  };
}

function parseMatchSummary(value: unknown): PvpMatchSummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'matchId',
      'mode',
      'status',
      'version',
      'opponent',
      'currentActor',
      'turnDeadline',
      'updatedAt',
    ]) ||
    !isUuid(value.matchId) ||
    value.mode !== 'asynchronous' ||
    value.status !== 'active' ||
    !isNonNegativeInteger(value.version) ||
    !isOpponent(value.opponent) ||
    !isRelativeSide(value.currentActor) ||
    !isDateTime(value.turnDeadline) ||
    !isDateTime(value.updatedAt)
  ) {
    throw new PvpApiError('unavailable');
  }
  return value as unknown as PvpMatchSummary;
}

function parseHistorySummary(value: unknown): PvpHistorySummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'matchId',
      'mode',
      'status',
      'opponent',
      'outcome',
      'completionReason',
      'startedAt',
      'completedAt',
    ]) ||
    !isUuid(value.matchId) ||
    value.mode !== 'asynchronous' ||
    value.status !== 'completed' ||
    !isOpponent(value.opponent) ||
    (value.outcome !== 'win' && value.outcome !== 'loss') ||
    !isCompletionReason(value.completionReason) ||
    !isDateTime(value.startedAt) ||
    !isDateTime(value.completedAt)
  ) {
    throw new PvpApiError('unavailable');
  }
  return value as unknown as PvpHistorySummary;
}

function parsePvpMatch(value: unknown): AsyncPvpMatch {
  const legacyMatchKeys = [
    'matchId',
    'mode',
    'status',
    'version',
    'opponent',
    'currentActor',
    'turnDeadline',
    'state',
    'legalActions',
    'lastAction',
    'outcome',
    'completionReason',
    'startedAt',
    'updatedAt',
    'completedAt',
    'requestId',
  ] as const;
  const matchKeys = [...legacyMatchKeys, 'history'] as const;
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, matchKeys) &&
      !hasExactKeys(value, [...matchKeys, 'canResign']) &&
      !hasExactKeys(value, legacyMatchKeys) &&
      !hasExactKeys(value, [...legacyMatchKeys, 'canResign'])) ||
    (value.canResign !== undefined && typeof value.canResign !== 'boolean') ||
    !isUuid(value.matchId) ||
    value.mode !== 'asynchronous' ||
    (value.status !== 'active' && value.status !== 'completed') ||
    !isNonNegativeInteger(value.version) ||
    !isOpponent(value.opponent) ||
    !isNullableRelativeSide(value.currentActor) ||
    !isNullableDateTime(value.turnDeadline) ||
    !Array.isArray(value.legalActions) ||
    (value.history !== undefined && !Array.isArray(value.history)) ||
    (value.outcome !== null &&
      value.outcome !== 'win' &&
      value.outcome !== 'loss') ||
    (value.completionReason !== null &&
      !isCompletionReason(value.completionReason)) ||
    !isDateTime(value.startedAt) ||
    !isDateTime(value.updatedAt) ||
    !isNullableDateTime(value.completedAt) ||
    typeof value.requestId !== 'string'
  ) {
    throw new PvpApiError('unavailable');
  }
  const state = parseMatchState(value.state);
  const legalActions = value.legalActions.map(parsePvpAction);
  const history = Array.isArray(value.history)
    ? value.history.map(parseActionHistoryEntry)
    : [];
  const lastAction =
    value.lastAction === null ? null : parseActionResult(value.lastAction);
  if (
    (value.status === 'active' &&
      (value.currentActor === null ||
        value.turnDeadline === null ||
        value.outcome !== null ||
        value.completionReason !== null ||
        value.completedAt !== null ||
        state.phase === 'completed')) ||
    (value.status === 'completed' &&
      (value.currentActor !== null ||
        value.turnDeadline !== null ||
        value.outcome === null ||
        value.completionReason === null ||
        value.completedAt === null ||
        state.phase !== 'completed' ||
        legalActions.length !== 0 ||
        value.canResign === true)) ||
    (value.currentActor === 'opponent' && legalActions.length !== 0) ||
    history.some(
      (entry, index) =>
        entry.sequence > Number(value.version) ||
        (index > 0 && history[index - 1]!.sequence >= entry.sequence),
    ) ||
    state.opponent.playerName !== value.opponent.playerName
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    canResign: value.canResign === true,
    completedAt: value.completedAt,
    completionReason: value.completionReason,
    currentActor: value.currentActor,
    history,
    lastAction,
    legalActions,
    matchId: value.matchId,
    mode: 'asynchronous',
    opponent: value.opponent,
    outcome: value.outcome,
    startedAt: value.startedAt,
    state,
    status: value.status,
    turnDeadline: value.turnDeadline,
    updatedAt: value.updatedAt,
    version: value.version,
  } as AsyncPvpMatch;
}

function parseActionHistoryEntry(value: unknown): PvpActionHistoryEntry {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['sequence', 'turnNumber', 'createdAt', 'result']) ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !Number.isInteger(value.turnNumber) ||
    Number(value.turnNumber) < 1 ||
    !isDateTime(value.createdAt)
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    createdAt: value.createdAt,
    result: parseActionResult(value.result),
    sequence: Number(value.sequence),
    turnNumber: Number(value.turnNumber),
  };
}

function parseMatchState(value: unknown): AsyncPvpMatch['state'] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['phase', 'turnNumber', 'self', 'opponent']) ||
    !['active', 'completed', 'replacement'].includes(String(value.phase)) ||
    !Number.isInteger(value.turnNumber) ||
    Number(value.turnNumber) < 1 ||
    !isRecord(value.self) ||
    !hasExactKeys(value.self, [
      'playerName',
      'creatures',
      'powerCards',
      'usedPowerCardIds',
      'activeCreatureId',
    ]) ||
    typeof value.self.playerName !== 'string' ||
    !Array.isArray(value.self.creatures) ||
    !Array.isArray(value.self.powerCards) ||
    !isUuidArray(value.self.usedPowerCardIds) ||
    !isNullableUuid(value.self.activeCreatureId) ||
    !isRecord(value.opponent) ||
    !hasExactKeys(value.opponent, [
      'playerName',
      'activeCreature',
      'defeatedCreatures',
      'remainingCreatureCount',
      'playedPowerCards',
      'remainingPowerCardCount',
    ]) ||
    typeof value.opponent.playerName !== 'string' ||
    (value.opponent.activeCreature !== null &&
      !isRecord(value.opponent.activeCreature)) ||
    !Array.isArray(value.opponent.defeatedCreatures) ||
    !isNonNegativeInteger(value.opponent.remainingCreatureCount) ||
    !Array.isArray(value.opponent.playedPowerCards) ||
    !isNonNegativeInteger(value.opponent.remainingPowerCardCount)
  ) {
    throw new PvpApiError('unavailable');
  }
  try {
    return {
      opponent: {
        activeCreature:
          value.opponent.activeCreature === null
            ? null
            : parseMatchCreature(value.opponent.activeCreature),
        defeatedCreatures:
          value.opponent.defeatedCreatures.map(parseMatchCreature),
        playedPowerCards:
          value.opponent.playedPowerCards.map(parseMatchPowerCard),
        playerName: value.opponent.playerName,
        remainingCreatureCount: value.opponent.remainingCreatureCount,
        remainingPowerCardCount: value.opponent.remainingPowerCardCount,
      },
      phase: value.phase as AsyncPvpMatch['state']['phase'],
      self: {
        activeCreatureId: value.self.activeCreatureId,
        creatures: value.self.creatures.map(parseMatchCreature),
        playerName: value.self.playerName,
        powerCards: value.self.powerCards.map(parseMatchPowerCard),
        usedPowerCardIds: value.self.usedPowerCardIds,
      },
      turnNumber: Number(value.turnNumber),
    };
  } catch (error) {
    if (error instanceof MatchApiError) throw new PvpApiError('unavailable');
    throw error;
  }
}

function parseActionResult(value: unknown): PvpActionResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'side',
      'action',
      'effects',
      'defeatedCreatureId',
      'winner',
      'turnEnded',
    ]) ||
    !isRelativeSide(value.side) ||
    !Array.isArray(value.effects) ||
    !isNullableUuid(value.defeatedCreatureId) ||
    !isNullableRelativeSide(value.winner) ||
    typeof value.turnEnded !== 'boolean'
  ) {
    throw new PvpApiError('unavailable');
  }
  return {
    action: parsePvpAction(value.action),
    defeatedCreatureId: value.defeatedCreatureId,
    effects: value.effects.map(parseActionEffect),
    side: value.side,
    turnEnded: value.turnEnded,
    winner: value.winner,
  };
}

function parseActionEffect(value: unknown): PvpActionEffect {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'effectId',
      'effectType',
      'targetSide',
      'targetCreatureId',
      'amount',
      'damageMultiplier',
      'modifier',
    ]) ||
    typeof value.effectId !== 'string' ||
    value.effectId.trim() === '' ||
    !['buff', 'damage', 'debuff', 'heal'].includes(String(value.effectType)) ||
    !isRelativeSide(value.targetSide) ||
    !isUuid(value.targetCreatureId) ||
    !Number.isFinite(value.amount) ||
    (value.damageMultiplier !== null &&
      !Number.isFinite(value.damageMultiplier)) ||
    !isNullableEffectModifier(value.modifier)
  ) {
    throw new PvpApiError('unavailable');
  }
  return value as unknown as PvpActionEffect;
}

function parsePvpAction(value: unknown): PvpAction {
  if (!isRecord(value)) throw new PvpApiError('unavailable');
  if (
    (value.type === 'select_replacement' || value.type === 'swap_creature') &&
    hasExactKeys(value, ['type', 'creatureId']) &&
    isUuid(value.creatureId)
  ) {
    return { creatureId: value.creatureId, type: value.type };
  }
  if (
    value.type === 'use_move' &&
    hasExactKeys(value, ['type', 'moveId']) &&
    isUuid(value.moveId)
  ) {
    return { moveId: value.moveId, type: 'use_move' };
  }
  if (
    value.type === 'use_power_card' &&
    hasExactKeys(value, ['type', 'powerCardId']) &&
    isUuid(value.powerCardId)
  ) {
    return { powerCardId: value.powerCardId, type: 'use_power_card' };
  }
  throw new PvpApiError('unavailable');
}

function pageQuery(
  options: {
    cursor?: string;
    direction?: 'incoming' | 'outgoing';
    limit?: number;
    status?: PvpInvitationStatus;
  },
  extra: readonly string[] = [],
) {
  const query = new URLSearchParams();
  if (options.cursor !== undefined) query.set('cursor', options.cursor);
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  for (const key of extra) {
    const value = options[key as 'direction' | 'status'];
    if (typeof value === 'string') query.set(key, value);
  }
  const encoded = query.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

function isOpponent(value: unknown): value is { playerName: string } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['playerName']) &&
    typeof value.playerName === 'string' &&
    value.playerName.trim() !== ''
  );
}

function isNullableEffectModifier(
  value: unknown,
): value is MatchEffectModifier | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const validKeys =
    JSON.stringify(keys) === JSON.stringify(['operation', 'stat']) ||
    JSON.stringify(keys) ===
      JSON.stringify(['durationTurns', 'operation', 'stat']);
  return (
    validKeys &&
    ['damage_multiplier', 'hp', 'power'].includes(String(value.stat)) &&
    ['add', 'multiply'].includes(String(value.operation)) &&
    (value.durationTurns === undefined ||
      value.durationTurns === null ||
      (Number.isInteger(value.durationTurns) &&
        Number(value.durationTurns) > 0))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
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

function isUuidArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isUuid);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isRelativeSide(value: unknown): value is 'opponent' | 'self' {
  return value === 'opponent' || value === 'self';
}

function isNullableRelativeSide(
  value: unknown,
): value is 'opponent' | 'self' | null {
  return value === null || isRelativeSide(value);
}

function isInvitationStatus(value: unknown): value is PvpInvitationStatus {
  return [
    'accepted',
    'cancelled',
    'declined',
    'expired',
    'invalidated',
    'pending',
  ].includes(String(value));
}

function isCompletionReason(value: unknown): value is PvpCompletionReason {
  return [
    'account_deletion_forfeit',
    'defeat',
    'turn_forfeit',
    'voluntary_resignation',
  ].includes(String(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && dateTimePattern.test(value);
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}
