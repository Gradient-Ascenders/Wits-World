import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import { cardAffinities, type CardAffinity } from './cards';

export type BattleSide = 'cpu' | 'player';
export type BattlePhase =
  'active' | 'completed' | 'initial_selection' | 'replacement';

export type CpuMatchIntent =
  | { creatureId: string; type: 'select_initial_creature' }
  | { creatureId: string; type: 'select_replacement' }
  | { moveId: string; type: 'use_move' }
  | { powerCardId: string; type: 'use_power_card' };

export type CpuMatchAction = CpuMatchIntent | { type: 'timeout' };

export interface MatchMove {
  effects: MatchEffect[];
  id: string;
  moveType: 'basic' | CardAffinity;
  name: string;
  powerCost: number;
}

export interface MatchEffectModifier {
  durationTurns?: number | null;
  operation: 'add' | 'multiply';
  stat: 'damage_multiplier' | 'hp' | 'power';
}

export interface MatchEffect {
  damageMultiplier: number | null;
  effectType: 'buff' | 'damage' | 'debuff' | 'heal';
  effectValue: number | null;
  modifier: MatchEffectModifier | null;
}

export interface MatchActiveModifier {
  operation: 'add' | 'multiply';
  percentage: number | null;
  remainingCharges?: number | null;
  remainingTurns: number | null;
  stat:
    | 'damage_multiplier'
    | 'dodge'
    | 'hp'
    | 'incoming_damage_multiplier'
    | 'lifesteal'
    | 'poison'
    | 'power'
    | 'reflect'
    | 'stun';
  value?: number;
}

export interface MatchCreature {
  activeModifiers: MatchActiveModifier[];
  affinity: CardAffinity;
  currentHp: number;
  defeated: boolean;
  id: string;
  maxHp: number;
  maxPower: number;
  moves: MatchMove[];
  name: string;
  remainingPower: number;
}

export interface MatchPowerCard {
  affinity: CardAffinity | null;
  available: boolean;
  id: string;
  effects: MatchEffect[];
  name: string;
}

export interface AppliedMatchEffect {
  amount: number;
  damageMultiplier: number | null;
  effectId: string;
  effectType: 'buff' | 'damage' | 'debuff' | 'heal';
  modifier: MatchEffectModifier | null;
  targetCreatureId: string;
  targetSide: BattleSide;
}

export interface ExpiredMatchEffect {
  damageMultiplier: number | null;
  effectId: string;
  targetCreatureId: string;
  targetSide: BattleSide;
}

export interface MatchActionResult {
  action: CpuMatchAction;
  defeatedCreatureId: string | null;
  effects: AppliedMatchEffect[];
  expiredEffects: ExpiredMatchEffect[];
  side: BattleSide;
  turnEnded: boolean;
  winner: BattleSide | null;
}

export type BattleLogEventKind =
  'action' | 'defeat' | 'effect' | 'effect_expired' | 'result' | 'turn';

export interface BattleLogEvent {
  id: string;
  kind: BattleLogEventKind;
  message: string;
  sequence: number;
  side: BattleSide | null;
}

export interface BattleLogGroup {
  events: BattleLogEvent[];
  id: string;
  label: string;
  turnNumber: number;
}

export interface CpuMatchState {
  cpu: {
    activeCreature: MatchCreature | null;
    defeatedCreatures: MatchCreature[];
    remainingCreatureCount: number;
    remainingPowerCardCount: number;
    usedPowerCardIds: string[];
  };
  currentSide: BattleSide | null;
  firstSide: BattleSide | null;
  legalActions: CpuMatchIntent[];
  phase: BattlePhase;
  player: {
    activeCreatureId: string | null;
    creatures: MatchCreature[];
    powerCards: MatchPowerCard[];
    usedPowerCardIds: string[];
  };
  replacementSide: BattleSide | null;
  selections: { cpu: string | null; player: string | null };
  turnDeadline: string | null;
  turnNumber: number;
}

export interface CpuMatch {
  battleLog: BattleLogGroup[];
  completedAt: string | null;
  lastAction: MatchActionResult | null;
  matchId: string;
  startedAt: string;
  state: CpuMatchState;
  status: 'active' | 'completed';
  version: number;
  winner: BattleSide | null;
}

export interface CpuMatchHistoryAction {
  action: CpuMatchAction;
  createdAt: string;
  result: MatchActionResult;
  sequence: number;
  side: BattleSide;
  submissionId: string | null;
}

export interface CpuMatchHistoryRound {
  actions: CpuMatchHistoryAction[];
  createdAt: string;
  result: MatchActionResult[];
  roundNumber: number;
}

export interface CpuMatchHistoryItem {
  completedAt: string;
  matchId: string;
  rounds: CpuMatchHistoryRound[];
  startedAt: string;
  status: 'completed';
  winner: BattleSide;
}

export type MatchApiFailure =
  | 'already-active'
  | 'authorization'
  | 'completed'
  | 'deck-invalid'
  | 'illegal-action'
  | 'not-found'
  | 'stale-action'
  | 'unavailable'
  | 'validation';

export class MatchApiError extends Error {
  public constructor(
    public readonly failure: MatchApiFailure,
    public readonly options: {
      ambiguous?: boolean;
      code?: string;
      detail?: string;
      requestId?: string;
    } = {},
  ) {
    super(options.detail ?? 'The CPU match request could not be completed.');
    this.name = 'MatchApiError';
  }
}

interface MatchRequestOptions {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface CreateMatchOptions extends MatchRequestOptions {
  deckId: string;
}

interface GetMatchOptions extends MatchRequestOptions {
  matchId: string;
}

interface SubmitActionOptions extends GetMatchOptions {
  action: CpuMatchIntent;
  expectedVersion: number;
  submissionId: string;
}

const matchKeys = [
  'battleLog',
  'completedAt',
  'lastAction',
  'matchId',
  'requestId',
  'startedAt',
  'state',
  'status',
  'version',
  'winner',
] as const;
const stateKeys = [
  'cpu',
  'currentSide',
  'firstSide',
  'legalActions',
  'phase',
  'player',
  'replacementSide',
  'selections',
  'turnDeadline',
  'turnNumber',
] as const;
const creatureKeys = [
  'activeModifiers',
  'affinity',
  'currentHp',
  'defeated',
  'id',
  'maxHp',
  'maxPower',
  'moves',
  'name',
  'remainingPower',
] as const;
const legacyCreatureKeys = creatureKeys.filter(
  (key) => key !== 'activeModifiers' && key !== 'name',
);
const resultKeys = [
  'action',
  'defeatedCreatureId',
  'effects',
  'expiredEffects',
  'side',
  'turnEnded',
  'winner',
] as const;
const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

export async function getActiveCpuMatch(
  options: MatchRequestOptions,
): Promise<CpuMatch | null> {
  try {
    return requireActiveMatch(
      await requestMatch({
        ...options,
        method: 'GET',
        path: '/matches/cpu',
      }),
    );
  } catch (error) {
    if (error instanceof MatchApiError && error.failure === 'not-found') {
      return null;
    }
    throw error;
  }
}

export async function getCpuMatch({ matchId, ...options }: GetMatchOptions) {
  return requireRequestedMatch(
    await requestMatch({
      ...options,
      method: 'GET',
      path: `/matches/${encodeURIComponent(matchId)}`,
    }),
    matchId,
  );
}

export async function createCpuMatch({
  deckId,
  ...options
}: CreateMatchOptions): Promise<CpuMatch> {
  try {
    return requireActiveMatch(
      await requestMatch({
        ...options,
        body: { deckId },
        method: 'POST',
        path: '/matches/cpu',
      }),
    );
  } catch (error) {
    if (
      error instanceof MatchApiError &&
      error.failure === 'unavailable' &&
      error.options.code === undefined
    ) {
      throw new MatchApiError('unavailable', {
        ...error.options,
        ambiguous: true,
      });
    }
    throw error;
  }
}

export async function submitCpuMatchAction({
  action,
  expectedVersion,
  matchId,
  submissionId,
  ...options
}: SubmitActionOptions) {
  return requireRequestedMatch(
    await requestMatch({
      ...options,
      body: { action, expectedVersion, submissionId },
      method: 'POST',
      path: `/matches/${encodeURIComponent(matchId)}/actions`,
    }),
    matchId,
  );
}

export async function listCpuMatchHistory(
  options: MatchRequestOptions,
): Promise<CpuMatchHistoryItem[]> {
  const payload = await matchRequest({
    ...options,
    method: 'GET',
    path: '/matches/history',
  });

  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['matches', 'requestId']) ||
    typeof payload.requestId !== 'string' ||
    !Array.isArray(payload.matches)
  ) {
    throw new MatchApiError('unavailable');
  }

  return payload.matches.map(parseHistoryItem);
}

export async function recoverOrCreateCpuMatch(
  options: CreateMatchOptions,
): Promise<CpuMatch> {
  const active = await getActiveCpuMatch(options);
  if (active) {
    return active;
  }

  try {
    return await createCpuMatch(options);
  } catch (error) {
    if (
      !(error instanceof MatchApiError) ||
      (error.failure !== 'already-active' && !error.options.ambiguous)
    ) {
      throw error;
    }

    const recovered = await reconcileAmbiguousCreation(options);
    if (recovered) {
      return recovered;
    }
    throw error;
  }
}

async function reconcileAmbiguousCreation(
  options: MatchRequestOptions,
): Promise<CpuMatch | null> {
  for (const delayMs of [0, 250, 750]) {
    if (delayMs > 0) {
      await abortableDelay(delayMs, options.signal);
    }
    const active = await getActiveCpuMatch(options);
    if (active) {
      return active;
    }
  }
  return null;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface RawRequestOptions extends MatchRequestOptions {
  body?: object;
  method: 'GET' | 'POST';
  path: string;
}

async function requestMatch(options: RawRequestOptions): Promise<CpuMatch> {
  return parseMatch(await matchRequest(options));
}

function requireActiveMatch(match: CpuMatch): CpuMatch {
  if (
    match.status !== 'active' ||
    match.winner !== null ||
    match.completedAt !== null
  ) {
    throw new MatchApiError('unavailable');
  }
  return match;
}

function requireRequestedMatch(match: CpuMatch, matchId: string): CpuMatch {
  if (match.matchId !== matchId) {
    throw new MatchApiError('unavailable');
  }
  return match;
}

async function matchRequest({
  apiBaseUrl,
  body,
  getAccessToken,
  method,
  path,
  signal,
}: RawRequestOptions): Promise<unknown> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new MatchApiError('authorization');
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
    throw new MatchApiError('unavailable');
  }

  if (!response.ok) {
    throw await parseMatchError(response);
  }

  try {
    return await response.json();
  } catch {
    throw new MatchApiError('unavailable');
  }
}

async function parseMatchError(response: Response): Promise<MatchApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new MatchApiError(
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
  const mapped: Readonly<Record<string, MatchApiFailure>> = {
    CPU_MATCH_ALREADY_ACTIVE: 'already-active',
    CPU_MATCH_COMPLETED: 'completed',
    CPU_MATCH_NOT_FOUND: 'not-found',
    CPU_MATCH_STALE_ACTION: 'stale-action',
    ILLEGAL_CPU_MATCH_ACTION: 'illegal-action',
    INVALID_MATCH_DECK: 'deck-invalid',
    VALIDATION_ERROR: 'validation',
  };

  return new MatchApiError(
    response.status === 401
      ? 'authorization'
      : code === undefined
        ? 'unavailable'
        : (mapped[code] ?? 'unavailable'),
    { code, detail, requestId },
  );
}

function parseMatch(payload: unknown): CpuMatch {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, matchKeys) ||
    !isUuid(payload.matchId) ||
    (payload.status !== 'active' && payload.status !== 'completed') ||
    !isNonNegativeInteger(payload.version) ||
    !isNullableSide(payload.winner) ||
    !isDateTime(payload.startedAt) ||
    !isNullableDateTime(payload.completedAt) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new MatchApiError('unavailable');
  }

  const state = parseState(payload.state);
  const battleLog = parseBattleLog(payload.battleLog);
  const lastAction =
    payload.lastAction === null ? null : parseActionResult(payload.lastAction);

  if (
    (payload.status === 'active' &&
      (payload.winner !== null ||
        payload.completedAt !== null ||
        state.phase === 'completed')) ||
    (payload.status === 'completed' &&
      (payload.winner === null ||
        payload.completedAt === null ||
        state.phase !== 'completed' ||
        state.legalActions.length !== 0))
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    battleLog,
    completedAt: payload.completedAt,
    lastAction,
    matchId: payload.matchId,
    startedAt: payload.startedAt,
    state,
    status: payload.status,
    version: payload.version,
    winner: payload.winner,
  };
}

function parseState(value: unknown): CpuMatchState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, stateKeys) ||
    !isPhase(value.phase) ||
    !isNonNegativeInteger(value.turnNumber) ||
    !isNullableSide(value.currentSide) ||
    !isNullableSide(value.replacementSide) ||
    !isNullableSide(value.firstSide) ||
    !isNullableDateTime(value.turnDeadline) ||
    !Array.isArray(value.legalActions) ||
    !isRecord(value.selections) ||
    !hasExactKeys(value.selections, ['cpu', 'player']) ||
    !isNullableUuid(value.selections.cpu) ||
    !isNullableUuid(value.selections.player)
  ) {
    throw new MatchApiError('unavailable');
  }

  const player = parsePlayer(value.player);
  const cpu = parseCpu(value.cpu);
  const legalActions = value.legalActions.map(parseIntent);

  return {
    cpu,
    currentSide: value.currentSide,
    firstSide: value.firstSide,
    legalActions,
    phase: value.phase,
    player,
    replacementSide: value.replacementSide,
    selections: value.selections as {
      cpu: string | null;
      player: string | null;
    },
    turnDeadline: value.turnDeadline,
    turnNumber: value.turnNumber,
  };
}

function parsePlayer(value: unknown): CpuMatchState['player'] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'activeCreatureId',
      'creatures',
      'powerCards',
      'usedPowerCardIds',
    ]) ||
    !isNullableUuid(value.activeCreatureId) ||
    !Array.isArray(value.creatures) ||
    !Array.isArray(value.powerCards) ||
    !isUuidArray(value.usedPowerCardIds)
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    activeCreatureId: value.activeCreatureId,
    creatures: value.creatures.map(parseMatchCreature),
    powerCards: value.powerCards.map(parseMatchPowerCard),
    usedPowerCardIds: value.usedPowerCardIds,
  };
}

function parseCpu(value: unknown): CpuMatchState['cpu'] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'activeCreature',
      'defeatedCreatures',
      'remainingCreatureCount',
      'remainingPowerCardCount',
      'usedPowerCardIds',
    ]) ||
    (value.activeCreature !== null && !isRecord(value.activeCreature)) ||
    !Array.isArray(value.defeatedCreatures) ||
    !isNonNegativeInteger(value.remainingCreatureCount) ||
    !isNonNegativeInteger(value.remainingPowerCardCount) ||
    !isUuidArray(value.usedPowerCardIds)
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    activeCreature:
      value.activeCreature === null
        ? null
        : parseMatchCreature(value.activeCreature),
    defeatedCreatures: value.defeatedCreatures.map(parseMatchCreature),
    remainingCreatureCount: value.remainingCreatureCount,
    remainingPowerCardCount: value.remainingPowerCardCount,
    usedPowerCardIds: value.usedPowerCardIds,
  };
}

export function parseMatchCreature(value: unknown): MatchCreature {
  const currentShape = isRecord(value) && hasExactKeys(value, creatureKeys);
  const legacyShape =
    isRecord(value) && hasExactKeys(value, legacyCreatureKeys);
  if (
    !isRecord(value) ||
    (!currentShape && !legacyShape) ||
    !isUuid(value.id) ||
    !isAffinity(value.affinity) ||
    !isNonNegativeInteger(value.maxHp) ||
    !isNonNegativeInteger(value.maxPower) ||
    !isNonNegativeInteger(value.currentHp) ||
    !isNonNegativeInteger(value.remainingPower) ||
    typeof value.defeated !== 'boolean' ||
    !Array.isArray(value.moves) ||
    (currentShape &&
      (typeof value.name !== 'string' ||
        value.name.trim() === '' ||
        !Array.isArray(value.activeModifiers)))
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    activeModifiers: currentShape
      ? (value.activeModifiers as unknown[]).map(parseActiveModifier)
      : [],
    affinity: value.affinity,
    currentHp: value.currentHp,
    defeated: value.defeated,
    id: value.id,
    maxHp: value.maxHp,
    maxPower: value.maxPower,
    moves: value.moves.map(parseMove),
    name: currentShape
      ? String(value.name)
      : `${titleCase(value.affinity)} Creature`,
    remainingPower: value.remainingPower,
  };
}

function parseMove(value: unknown): MatchMove {
  const currentKeys = [
    'effects',
    'id',
    'moveType',
    'name',
    'powerCost',
  ] as const;
  const legacyKeys = ['id', 'moveType', 'name', 'powerCost'] as const;
  const currentShape = isRecord(value) && hasExactKeys(value, currentKeys);
  if (
    !isRecord(value) ||
    (!currentShape && !hasExactKeys(value, legacyKeys)) ||
    !isUuid(value.id) ||
    (value.moveType !== 'basic' && !isAffinity(value.moveType)) ||
    typeof value.name !== 'string' ||
    value.name.trim() === '' ||
    !isNonNegativeInteger(value.powerCost) ||
    (currentShape && !Array.isArray(value.effects))
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    effects: currentShape
      ? (value.effects as unknown[]).map(parseBattleEffect)
      : [],
    id: value.id,
    moveType: value.moveType,
    name: value.name,
    powerCost: value.powerCost,
  } as MatchMove;
}

export function parseMatchPowerCard(value: unknown): MatchPowerCard {
  const currentKeys = [
    'affinity',
    'available',
    'effects',
    'id',
    'name',
  ] as const;
  const legacyKeys = ['affinity', 'available', 'id'] as const;
  const currentShape = isRecord(value) && hasExactKeys(value, currentKeys);
  if (
    !isRecord(value) ||
    (!currentShape && !hasExactKeys(value, legacyKeys)) ||
    !isUuid(value.id) ||
    (value.affinity !== null && !isAffinity(value.affinity)) ||
    typeof value.available !== 'boolean' ||
    (currentShape &&
      (typeof value.name !== 'string' ||
        value.name.trim() === '' ||
        !Array.isArray(value.effects)))
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    affinity: value.affinity,
    available: value.available,
    effects: currentShape
      ? (value.effects as unknown[]).map(parseBattleEffect)
      : [],
    id: value.id,
    name: currentShape
      ? String(value.name)
      : value.affinity
        ? `${titleCase(value.affinity)} Power card`
        : 'Power card',
  } as MatchPowerCard;
}

function parseIntent(value: unknown): CpuMatchIntent {
  const action = parseAction(value);
  if (action.type === 'timeout') {
    throw new MatchApiError('unavailable');
  }
  return action;
}

function parseAction(value: unknown): CpuMatchAction {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new MatchApiError('unavailable');
  }
  if (value.type === 'timeout' && hasExactKeys(value, ['type'])) {
    return { type: 'timeout' };
  }
  if (
    (value.type === 'select_initial_creature' ||
      value.type === 'select_replacement') &&
    hasExactKeys(value, ['creatureId', 'type']) &&
    isUuid(value.creatureId)
  ) {
    return { creatureId: value.creatureId, type: value.type };
  }
  if (
    value.type === 'use_move' &&
    hasExactKeys(value, ['moveId', 'type']) &&
    isUuid(value.moveId)
  ) {
    return { moveId: value.moveId, type: 'use_move' };
  }
  if (
    value.type === 'use_power_card' &&
    hasExactKeys(value, ['powerCardId', 'type']) &&
    isUuid(value.powerCardId)
  ) {
    return { powerCardId: value.powerCardId, type: 'use_power_card' };
  }
  throw new MatchApiError('unavailable');
}

function parseActionResult(value: unknown): MatchActionResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, resultKeys) ||
    !isSide(value.side) ||
    !Array.isArray(value.effects) ||
    !Array.isArray(value.expiredEffects) ||
    !isNullableUuid(value.defeatedCreatureId) ||
    !isNullableSide(value.winner) ||
    typeof value.turnEnded !== 'boolean'
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    action: parseAction(value.action),
    defeatedCreatureId: value.defeatedCreatureId,
    effects: value.effects.map(parseEffect),
    expiredEffects: value.expiredEffects.map(parseExpiredEffect),
    side: value.side,
    turnEnded: value.turnEnded,
    winner: value.winner,
  };
}

function parseExpiredEffect(value: unknown): ExpiredMatchEffect {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'damageMultiplier',
      'effectId',
      'targetCreatureId',
      'targetSide',
    ]) ||
    (value.damageMultiplier !== null &&
      (!Number.isFinite(value.damageMultiplier) ||
        Number(value.damageMultiplier) < 0)) ||
    !isUuid(value.effectId) ||
    !isUuid(value.targetCreatureId) ||
    !isSide(value.targetSide)
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    damageMultiplier:
      value.damageMultiplier === null ? null : Number(value.damageMultiplier),
    effectId: value.effectId,
    targetCreatureId: value.targetCreatureId,
    targetSide: value.targetSide,
  };
}

function parseBattleLog(value: unknown): BattleLogGroup[] {
  if (!Array.isArray(value)) {
    throw new MatchApiError('unavailable');
  }

  const groups = value.map(parseBattleLogGroup);
  const groupIds = new Set<string>();
  const eventIds = new Set<string>();
  let previousTurn = -1;
  let previousSequence = 0;

  for (const group of groups) {
    if (groupIds.has(group.id) || group.turnNumber <= previousTurn) {
      throw new MatchApiError('unavailable');
    }
    groupIds.add(group.id);
    previousTurn = group.turnNumber;

    for (const event of group.events) {
      if (eventIds.has(event.id) || event.sequence < previousSequence) {
        throw new MatchApiError('unavailable');
      }
      eventIds.add(event.id);
      previousSequence = event.sequence;
    }
  }

  return groups;
}

function parseBattleLogGroup(value: unknown): BattleLogGroup {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['events', 'id', 'label', 'turnNumber']) ||
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    !isNonNegativeInteger(value.turnNumber) ||
    !Array.isArray(value.events) ||
    value.events.length === 0 ||
    value.id !==
      (value.turnNumber === 0 ? 'opening' : `turn-${value.turnNumber}`) ||
    value.label !==
      (value.turnNumber === 0 ? 'Opening' : `Turn ${value.turnNumber}`)
  ) {
    throw new MatchApiError('unavailable');
  }

  return {
    events: value.events.map(parseBattleLogEvent),
    id: value.id,
    label: value.label,
    turnNumber: value.turnNumber,
  };
}

function parseBattleLogEvent(value: unknown): BattleLogEvent {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'kind', 'message', 'sequence', 'side']) ||
    typeof value.id !== 'string' ||
    value.id.trim() === '' ||
    !isBattleLogEventKind(value.kind) ||
    typeof value.message !== 'string' ||
    value.message.trim() === '' ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !isNullableSide(value.side)
  ) {
    throw new MatchApiError('unavailable');
  }

  return value as unknown as BattleLogEvent;
}

function isBattleLogEventKind(value: unknown): value is BattleLogEventKind {
  return [
    'action',
    'defeat',
    'effect',
    'effect_expired',
    'result',
    'turn',
  ].includes(String(value));
}

function parseEffect(value: unknown): AppliedMatchEffect {
  const currentKeys = [
    'amount',
    'damageMultiplier',
    'effectId',
    'effectType',
    'modifier',
    'targetCreatureId',
    'targetSide',
  ] as const;
  const legacyKeys = currentKeys.filter((key) => key !== 'modifier');
  const currentShape = isRecord(value) && hasExactKeys(value, currentKeys);
  if (
    !isRecord(value) ||
    (!currentShape && !hasExactKeys(value, legacyKeys)) ||
    !Number.isFinite(value.amount) ||
    (value.damageMultiplier !== null &&
      !Number.isFinite(value.damageMultiplier)) ||
    !isUuid(value.effectId) ||
    !['buff', 'damage', 'debuff', 'heal'].includes(String(value.effectType)) ||
    !isUuid(value.targetCreatureId) ||
    !isSide(value.targetSide) ||
    (currentShape && !isNullableEffectModifier(value.modifier))
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    amount: Number(value.amount),
    damageMultiplier:
      value.damageMultiplier === null ? null : Number(value.damageMultiplier),
    effectId: value.effectId,
    effectType: value.effectType,
    modifier: currentShape
      ? (value.modifier as MatchEffectModifier | null)
      : null,
    targetCreatureId: value.targetCreatureId,
    targetSide: value.targetSide,
  } as AppliedMatchEffect;
}

function parseBattleEffect(value: unknown): MatchEffect {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'damageMultiplier',
      'effectType',
      'effectValue',
      'modifier',
    ]) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableEffectModifier(value.modifier) ||
    (value.damageMultiplier !== null &&
      (!Number.isFinite(value.damageMultiplier) ||
        Number(value.damageMultiplier) < 0)) ||
    (value.modifier?.stat === 'damage_multiplier') !==
      (value.damageMultiplier !== null) ||
    ((value.effectType === 'damage' || value.effectType === 'heal') &&
      value.modifier !== null)
  ) {
    throw new MatchApiError('unavailable');
  }

  return value as unknown as MatchEffect;
}

function parseActiveModifier(value: unknown): MatchActiveModifier {
  const currentKeys = [
    'operation',
    'percentage',
    'remainingCharges',
    'remainingTurns',
    'stat',
    'value',
  ] as const;
  const legacyKeys = [
    'operation',
    'percentage',
    'remainingTurns',
    'stat',
  ] as const;
  const currentShape = isRecord(value) && hasExactKeys(value, currentKeys);
  if (
    !isRecord(value) ||
    (!currentShape && !hasExactKeys(value, legacyKeys)) ||
    (!currentShape &&
      (value.stat !== 'damage_multiplier' || value.operation !== 'multiply')) ||
    ![
      'damage_multiplier',
      'dodge',
      'hp',
      'incoming_damage_multiplier',
      'lifesteal',
      'poison',
      'power',
      'reflect',
      'stun',
    ].includes(String(value.stat)) ||
    !['add', 'multiply'].includes(String(value.operation)) ||
    (value.percentage !== null && !Number.isInteger(value.percentage)) ||
    (value.remainingTurns !== null &&
      (!Number.isInteger(value.remainingTurns) ||
        Number(value.remainingTurns) <= 0)) ||
    (currentShape &&
      (!Number.isFinite(value.value) ||
        Number(value.value) < 0 ||
        (value.remainingCharges !== null &&
          (!Number.isInteger(value.remainingCharges) ||
            Number(value.remainingCharges) <= 0))))
  ) {
    throw new MatchApiError('unavailable');
  }

  if (!currentShape) {
    return {
      operation: 'multiply',
      percentage: Number(value.percentage),
      remainingCharges: null,
      remainingTurns: value.remainingTurns as number | null,
      stat: 'damage_multiplier',
      value: 1 + Number(value.percentage) / 100,
    };
  }

  return value as unknown as MatchActiveModifier;
}

function isNullableEffectModifier(
  value: unknown,
): value is MatchEffectModifier | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;

  const keys = Object.keys(value).sort();
  const requiredKeys = ['operation', 'stat'];
  const withDurationKeys = ['durationTurns', 'operation', 'stat'];
  if (
    JSON.stringify(keys) !== JSON.stringify(requiredKeys) &&
    JSON.stringify(keys) !== JSON.stringify(withDurationKeys)
  ) {
    return false;
  }

  if (
    !['damage_multiplier', 'hp', 'power'].includes(String(value.stat)) ||
    !['add', 'multiply'].includes(String(value.operation)) ||
    (value.durationTurns !== undefined &&
      value.durationTurns !== null &&
      (!Number.isInteger(value.durationTurns) ||
        Number(value.durationTurns) <= 0))
  ) {
    return false;
  }

  if (value.stat === 'damage_multiplier') {
    return value.operation === 'multiply';
  }

  return value.operation === 'add' && value.durationTurns == null;
}

function isEffectType(value: unknown): value is MatchEffect['effectType'] {
  return ['buff', 'damage', 'debuff', 'heal'].includes(String(value));
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parseHistoryItem(value: unknown): CpuMatchHistoryItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'completedAt',
      'matchId',
      'rounds',
      'startedAt',
      'status',
      'winner',
    ]) ||
    !isUuid(value.matchId) ||
    value.status !== 'completed' ||
    !isSide(value.winner) ||
    !isDateTime(value.startedAt) ||
    !isDateTime(value.completedAt) ||
    !Array.isArray(value.rounds)
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    completedAt: value.completedAt,
    matchId: value.matchId,
    rounds: value.rounds.map(parseHistoryRound),
    startedAt: value.startedAt,
    status: 'completed',
    winner: value.winner,
  };
}

function parseHistoryRound(value: unknown): CpuMatchHistoryRound {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['actions', 'createdAt', 'result', 'roundNumber']) ||
    !Number.isInteger(value.roundNumber) ||
    Number(value.roundNumber) < 1 ||
    !isDateTime(value.createdAt) ||
    !Array.isArray(value.actions) ||
    !Array.isArray(value.result)
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    actions: value.actions.map(parseHistoryAction),
    createdAt: value.createdAt,
    result: value.result.map(parseActionResult),
    roundNumber: Number(value.roundNumber),
  };
}

function parseHistoryAction(value: unknown): CpuMatchHistoryAction {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'action',
      'createdAt',
      'result',
      'sequence',
      'side',
      'submissionId',
    ]) ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !isSide(value.side) ||
    !isNullableUuid(value.submissionId) ||
    !isDateTime(value.createdAt)
  ) {
    throw new MatchApiError('unavailable');
  }
  return {
    action: parseAction(value.action),
    createdAt: value.createdAt,
    result: parseActionResult(value.result),
    sequence: Number(value.sequence),
    side: value.side,
    submissionId: value.submissionId,
  };
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

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isUuidArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isUuid);
}

function isSide(value: unknown): value is BattleSide {
  return value === 'cpu' || value === 'player';
}

function isNullableSide(value: unknown): value is BattleSide | null {
  return value === null || isSide(value);
}

function isPhase(value: unknown): value is BattlePhase {
  return ['active', 'completed', 'initial_selection', 'replacement'].includes(
    String(value),
  );
}

function isAffinity(value: unknown): value is CardAffinity {
  return cardAffinities.some((affinity) => affinity === value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && dateTimePattern.test(value);
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}
