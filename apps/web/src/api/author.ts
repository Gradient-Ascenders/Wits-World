import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';

export type AuthoringStatus =
  'draft' | 'in_review' | 'approved' | 'published' | 'retired';
export type PublicationProvenance = 'legacy' | 'controlled_seed' | 'reviewed';
export type ChallengeFormat = 'multiple_choice' | 'ordering';

export interface AuthorQuestionPerformanceItem {
  questionId: string;
  challengeId: string;
  eventId: string;
  eventTitle: string;
  prompt: string;
  format: ChallengeFormat;
  difficulty: 1 | 2 | 3;
  status: AuthoringStatus;
  answerCount: number;
  correctCount: number;
  incorrectCount: number;
  timeoutCount: number;
  correctRate: number;
  incorrectRate: number;
  hasSufficientSample: boolean;
  isProblematic: boolean;
}

export interface AuthorQuestionPerformancePage extends AuthorPage<AuthorQuestionPerformanceItem> {
  minimumSampleSize: 10;
  problematicIncorrectRate: 0.7;
}

export type AuthorAnalyticsLocationMode = 'all' | 'popular' | 'ignored';
export type AuthorAnalyticsQuestionClassification =
  'suppressed' | 'easy' | 'problematic' | 'normal';

export interface AuthorEventLocationAnalyticsItem {
  eventId: string;
  eventTitle: string;
  locationKind: 'authored' | 'placement_site';
  locationId: string;
  locationName: string;
  viewCount: number | null;
  eligibleCount: number | null;
  startCount: number | null;
  completionCount: number | null;
  suppressed: boolean;
}

export interface AuthorEventLocationAnalyticsPage extends AuthorPage<AuthorEventLocationAnalyticsItem> {
  minimumSampleSize: 10;
}

export interface AuthorAdvancedQuestionAnalyticsItem {
  questionId: string;
  challengeId: string;
  eventId: string;
  eventTitle: string;
  prompt: string;
  format: ChallengeFormat;
  difficulty: 1 | 2 | 3;
  status: AuthoringStatus;
  answerCount: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  timeoutCount: number | null;
  correctRate: number | null;
  incorrectRate: number | null;
  classification: AuthorAnalyticsQuestionClassification;
  suppressed: boolean;
}

export interface AuthorAdvancedQuestionAnalyticsPage extends AuthorPage<AuthorAdvancedQuestionAnalyticsItem> {
  minimumSampleSize: 10;
  easyCorrectRate: 0.9;
  problematicIncorrectRate: 0.7;
}

export interface AuthorCardIssuanceAnalyticsItem {
  cardDefinitionId: string;
  cardName: string;
  rarity: CardRarity;
  rewardEligible: boolean;
  issuanceCount: number | null;
  issuancesPer100Completions: number | null;
  suppressed: boolean;
}

export interface AuthorCardRarityAnalyticsItem {
  rarity: CardRarity;
  issuanceCount: number | null;
  issuancesPer100Completions: number | null;
  suppressed: boolean;
}

export interface AuthorCardIssuanceAnalyticsPage extends AuthorPage<AuthorCardIssuanceAnalyticsItem> {
  rarities: AuthorCardRarityAnalyticsItem[];
  minimumSampleSize: 10;
}
export type AuthorContentEntityType =
  'event' | 'challenge' | 'question' | 'card' | 'campaign';
export type AuthorContentAction =
  'create' | 'edit' | 'submit' | 'approve' | 'return' | 'publish' | 'retire';
export type AuthorTransitionAction = Extract<
  AuthorContentAction,
  'submit' | 'approve' | 'return' | 'publish' | 'retire'
>;

interface AuthorLifecycleMetadata {
  version: number;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publicationProvenance: PublicationProvenance | null;
}
export type AuthorApiFailure =
  | 'authorization'
  | 'conflict'
  | 'forbidden'
  | 'not-found'
  | 'not-ready'
  | 'unavailable'
  | 'validation';

export interface AuthorValidationFailure {
  field: string;
  message: string;
}

export class AuthorApiError extends Error {
  public constructor(
    public readonly failure: AuthorApiFailure,
    public readonly detail: string,
    public readonly requestId?: string,
    public readonly validation: readonly AuthorValidationFailure[] = [],
    public readonly code?: string,
  ) {
    super('The author request could not be completed.');
    this.name = 'AuthorApiError';
  }
}

export function isAuthorContentConflict(
  error: unknown,
): error is AuthorApiError {
  return (
    error instanceof AuthorApiError &&
    (error.code === 'CONTENT_STATE_CONFLICT' ||
      error.code === 'STALE_CONTENT_VERSION')
  );
}

export interface AuthorEvent extends AuthorLifecycleMetadata {
  authoringStatus: AuthoringStatus;
  createdAt: string;
  description: string | null;
  endsAt: string;
  eventId: string;
  isPublished: boolean;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  sourceUrls: string[];
  retiredAt: string | null;
  startsAt: string;
  title: string;
  updatedAt: string;
}

export interface AuthorEventInput {
  description?: string | null;
  endsAt: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  title: string;
}

export interface AuthorChallenge extends AuthorLifecycleMetadata {
  challengeId: string;
  createdAt: string;
  eventId: string;
  format: ChallengeFormat;
  status: AuthoringStatus;
  updatedAt: string;
}

export interface AuthorQuestionChoice {
  choiceId: string;
  position: number;
  text: string;
}

interface AuthorQuestionBase extends AuthorLifecycleMetadata {
  challengeId: string;
  createdAt: string;
  difficulty: 1 | 2 | 3;
  explanation: string | null;
  sourceUrls: string[];
  prompt: string;
  questionId: string;
  status: AuthoringStatus;
  updatedAt: string;
}

export interface AuthorMultipleChoiceQuestion extends AuthorQuestionBase {
  acceptedChoiceId: string | null;
  acceptedChoicePosition: number | null;
  choices: AuthorQuestionChoice[];
  format: 'multiple_choice';
}

export interface AuthorOrderingItem {
  itemId: string;
  position: number;
  text: string;
}

export interface AuthorOrderingQuestion extends AuthorQuestionBase {
  format: 'ordering';
  items: AuthorOrderingItem[];
}

export type AuthorQuestion =
  AuthorMultipleChoiceQuestion | AuthorOrderingQuestion;

interface AuthorQuestionInputBase {
  difficulty: 1 | 2 | 3;
  explanation: string;
  prompt: string;
}

export interface AuthorMultipleChoiceQuestionInput extends AuthorQuestionInputBase {
  acceptedChoicePosition: number;
  choices: string[];
  format: 'multiple_choice';
}

export interface AuthorOrderingQuestionInput extends AuthorQuestionInputBase {
  format: 'ordering';
  items: string[];
}

export type AuthorQuestionInput =
  AuthorMultipleChoiceQuestionInput | AuthorOrderingQuestionInput;

export type CardAffinity = 'grit' | 'mystic' | 'spark' | 'spirit' | 'wit';
export type CardCategory = 'creature' | 'power';
export type CardRarity = 'common' | 'epic' | 'legendary' | 'rare';
export type CardEffectType = 'buff' | 'damage' | 'debuff' | 'heal';
export type CardModifierStat = 'damage_multiplier' | 'hp' | 'power';
export type CardModifierOperation = 'add' | 'multiply';
export type CardMoveType = 'basic' | CardAffinity;

export interface AuthorCardMoveInput {
  effectType: CardEffectType;
  effectValue?: number | null;
  modifierDurationTurns?: number | null;
  modifierOperation?: CardModifierOperation | null;
  modifierStat?: CardModifierStat | null;
  moveType: CardMoveType;
  name: string;
  position: number;
  powerCost: number;
}

export interface AuthorCardEffectInput {
  effectType: CardEffectType;
  effectValue?: number | null;
  modifierDurationTurns?: number | null;
  modifierOperation?: CardModifierOperation | null;
  modifierStat?: CardModifierStat | null;
  position: number;
}

export interface AuthorCardMove extends AuthorCardMoveInput {
  effectValue: number | null;
  id: string;
  modifierDurationTurns: number | null;
  modifierOperation: CardModifierOperation | null;
  modifierStat: CardModifierStat | null;
}

export interface AuthorCardEffect extends AuthorCardEffectInput {
  effectValue: number | null;
  id: string;
  modifierDurationTurns: number | null;
  modifierOperation: CardModifierOperation | null;
  modifierStat: CardModifierStat | null;
}

export interface AuthorCardInput {
  affinity: CardAffinity | null;
  category: CardCategory;
  description?: string | null;
  effects: AuthorCardEffectInput[];
  hp: number | null;
  imageUrl?: string | null;
  moves: AuthorCardMoveInput[];
  name: string;
  power: number | null;
  rarity: CardRarity;
}

export interface AuthorCard extends AuthorLifecycleMetadata {
  affinity: CardAffinity | null;
  authoringStatus: AuthoringStatus;
  category: CardCategory;
  createdAt: string;
  description: string | null;
  effects: AuthorCardEffect[];
  hp: number | null;
  id: string;
  imageUrl: string | null;
  isActive: boolean;
  moves: AuthorCardMove[];
  name: string;
  power: number | null;
  rarity: CardRarity;
  updatedAt: string;
}

export interface AuthorCampaignEvent {
  authoringStatus: AuthoringStatus;
  endsAt: string;
  eventId: string;
  startsAt: string;
  title: string;
}

export interface AuthorCampaignTrail {
  status: 'draft' | 'published' | 'retired';
  title: string;
  trailId: string;
}

export interface AuthorCampaign extends AuthorLifecycleMetadata {
  campaignId: string;
  createdAt: string;
  description: string | null;
  endsAt: string;
  events: AuthorCampaignEvent[];
  publishedAt: string | null;
  retiredAt: string | null;
  startsAt: string;
  status: AuthoringStatus;
  title: string;
  trails: AuthorCampaignTrail[];
  updatedAt: string;
}

export interface AuthorCampaignInput {
  description?: string | null;
  endsAt: string;
  eventIds: string[];
  startsAt: string;
  title: string;
  trailIds: string[];
}

export interface AuthorTrailStep {
  eventId: string;
  eventStatus: 'draft' | 'published' | 'retired';
  position: number;
  title: string;
}

export interface AuthorTrail {
  createdAt: string;
  description: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
  status: 'draft' | 'published' | 'retired';
  steps: AuthorTrailStep[];
  title: string;
  trailId: string;
  updatedAt: string;
}

export interface AuthorReviewQueueItem {
  canReview: boolean;
  challengeId: string | null;
  entityId: string;
  entityType: AuthorContentEntityType;
  eventId: string | null;
  label: string;
  status: 'in_review';
  submittedAt: string;
  submittedBy: string;
  submittedByName: string;
  version: number;
}

export interface AuthorContentHistoryItem {
  action: AuthorContentAction;
  actorPlayerId: string;
  actorPlayerName: string;
  auditId: string;
  fromStatus: AuthoringStatus | null;
  note: string | null;
  occurredAt: string;
  resultingVersion: number;
  toStatus: AuthoringStatus;
}

export type TrustCaseStatus = 'open' | 'under_review' | 'resolved';
export type TrustCaseStatusFilter = TrustCaseStatus | 'active' | 'all';
export type TrustReviewBand =
  'normal' | 'observe' | 'review_required' | 'urgent_review';
export type TrustReviewAction =
  'continue_monitoring' | 'dismiss' | 'mark_false_positive' | 'restrict';
export type TrustRestrictionScope =
  | 'online_verification_required'
  | 'location_reward_challenge_hold'
  | 'new_competitive_match_hold';
export type TrustSignalType =
  | 'impossible_movement'
  | 'idempotency_payload_conflict'
  | 'submission_conflict_pattern'
  | 'opponent_concentration'
  | 'one_sided_outcome_pattern';

export interface TrustCaseQueueItem {
  activeRestrictionCount: number;
  band: TrustReviewBand;
  canReview: boolean;
  caseId: string;
  latestRestrictionExpiry: string | null;
  openedAt: string;
  playerId: string;
  playerName: string;
  policyVersion: string;
  score: number;
  status: TrustCaseStatus;
  updatedAt: string;
  version: number;
}

export interface TrustScoreExplanation {
  evaluatedAt: string;
  finalScore: number;
  movementPoints: number;
  opponentPatternPoints: number;
  reviewBand: TrustReviewBand;
  snapshotId: string;
  sourceSignalCount: number;
  submissionConflictPoints: number;
}

export interface TrustCaseEvidenceItem {
  basePoints: number;
  effectivePoints: number;
  evidenceId: string;
  expiresAt: string;
  observedAt: string;
  policyVersion: string;
  safeSourceType: string;
  severity: string;
  signalType: TrustSignalType;
  state: 'active' | 'adjusted_false_positive' | 'expired';
}

export interface TrustRestrictionItem {
  active: boolean;
  decisionId: string;
  effectiveExpiresAt: string;
  originalExpiresAt: string;
  restrictionId: string;
  scope: TrustRestrictionScope;
  startsAt: string;
}

export interface TrustCaseHistoryItem {
  actorPlayerId: string | null;
  actorPlayerName: string | null;
  actorType: 'author' | 'system';
  caseVersionAfter: number;
  caseVersionBefore: number;
  decisionId: string;
  decisionType: string;
  evidenceIds: string[];
  occurredAt: string;
  policyVersion: string;
  previousStatus: TrustCaseStatus | null;
  reasonCode: string;
  reasonNote: string | null;
  restrictions: TrustRestrictionItem[];
  resultingStatus: TrustCaseStatus;
}

export interface TrustCaseDetail extends TrustCaseQueueItem {
  evidence: TrustCaseEvidenceItem[];
  history: TrustCaseHistoryItem[];
  scoreExplanation: TrustScoreExplanation;
}

export interface TrustReviewDecisionInput {
  action: TrustReviewAction;
  durationHours?: number;
  evidenceIds?: string[];
  expectedVersion: number;
  reasonNote: string;
  restrictionScopes?: TrustRestrictionScope[];
}

export interface AuthorPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface AuthorContentByType {
  event: AuthorEvent;
  challenge: AuthorChallenge;
  question: AuthorQuestion;
  card: AuthorCard;
  campaign: AuthorCampaign;
}

interface RequestBase {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface RequestOptions extends RequestBase {
  body?: object;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
}

export async function listAuthorEvents(options: RequestBase) {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: '/author/events',
  });

  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw unavailableResponse();
  }

  requireRequestId(payload);
  return payload.events.map(parseAuthorEvent);
}

export async function createAuthorEvent(
  options: RequestBase & { input: AuthorEventInput },
) {
  return requestEvent({
    ...options,
    body: options.input,
    method: 'POST',
    path: '/author/events',
  });
}

export async function updateAuthorEvent(
  options: RequestBase & {
    eventId: string;
    expectedVersion: number;
    input: AuthorEventInput;
  },
) {
  return requestEvent({
    ...options,
    body: { ...options.input, expectedVersion: options.expectedVersion },
    method: 'PUT',
    path: `/author/events/${options.eventId}`,
  });
}

export async function publishAuthorEvent(
  options: RequestBase & { eventId: string; expectedVersion: number },
) {
  return requestEvent({
    ...options,
    body: { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/events/${options.eventId}/publish`,
  });
}

export async function retireAuthorEvent(
  options: RequestBase & { eventId: string; expectedVersion: number },
) {
  return requestEvent({
    ...options,
    body: { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/events/${options.eventId}/retire`,
  });
}

export async function listAuthorChallenges(
  options: RequestBase & { eventId: string },
) {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/events/${options.eventId}/challenges`,
  });

  if (!isRecord(payload) || !Array.isArray(payload.challenges)) {
    throw unavailableResponse();
  }

  requireRequestId(payload);
  return payload.challenges.map(parseAuthorChallenge);
}

export async function createAuthorChallenge(
  options: RequestBase & { eventId: string; format: ChallengeFormat },
) {
  const payload = await authorRequest({
    ...options,
    body: { format: options.format },
    method: 'POST',
    path: `/author/events/${options.eventId}/challenges`,
  });

  return parseEnvelope(payload, 'challenge', parseAuthorChallenge);
}

export async function publishAuthorChallenge(
  options: RequestBase & { challengeId: string; expectedVersion: number },
) {
  return requestChallengeLifecycle(options, 'publish');
}

export async function retireAuthorChallenge(
  options: RequestBase & { challengeId: string; expectedVersion: number },
) {
  return requestChallengeLifecycle(options, 'retire');
}

export async function listAuthorQuestions(
  options: RequestBase & { challengeId: string },
) {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/challenges/${options.challengeId}/questions`,
  });

  if (!isRecord(payload) || !Array.isArray(payload.questions)) {
    throw unavailableResponse();
  }

  requireRequestId(payload);
  return payload.questions.map(parseAuthorQuestion);
}

export async function listAuthorQuestionPerformance(
  options: RequestBase & {
    eventId?: string;
    challengeId?: string;
    format?: ChallengeFormat;
    difficulty?: 1 | 2 | 3;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorQuestionPerformancePage> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 25),
  });
  for (const [key, value] of Object.entries({
    eventId: options.eventId,
    challengeId: options.challengeId,
    format: options.format,
    difficulty: options.difficulty,
    from: options.from,
    to: options.to,
  })) {
    if (value !== undefined) params.set(key, String(value));
  }
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/question-performance?${params.toString()}`,
  });
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !isPositiveInteger(payload.page) ||
    !isPositiveInteger(payload.pageSize) ||
    !isNonNegativeInteger(payload.totalItems) ||
    !isNonNegativeInteger(payload.totalPages) ||
    payload.minimumSampleSize !== 10 ||
    payload.problematicIncorrectRate !== 0.7
  ) {
    throw unavailableResponse();
  }
  requireRequestId(payload);
  return {
    items: payload.items.map(parseQuestionPerformanceItem),
    page: payload.page,
    pageSize: payload.pageSize,
    totalItems: payload.totalItems,
    totalPages: payload.totalPages,
    minimumSampleSize: 10,
    problematicIncorrectRate: 0.7,
  };
}

export async function listAuthorEventLocationAnalytics(
  options: RequestBase & {
    fromDate?: string;
    toDate?: string;
    mode?: AuthorAnalyticsLocationMode;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorEventLocationAnalyticsPage> {
  const payload = await listAdvancedAnalyticsPage(
    options,
    '/author/analytics/event-locations',
    {
      fromDate: options.fromDate,
      toDate: options.toDate,
      mode: options.mode ?? 'all',
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 25,
    },
  );
  if (payload.minimumSampleSize !== 10) throw unavailableResponse();
  return {
    ...parseAnalyticsPage(payload, parseEventLocationAnalyticsItem),
    minimumSampleSize: 10,
  };
}

export async function listAuthorAdvancedQuestionAnalytics(
  options: RequestBase & {
    eventId?: string;
    challengeId?: string;
    format?: ChallengeFormat;
    difficulty?: 1 | 2 | 3;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorAdvancedQuestionAnalyticsPage> {
  const payload = await listAdvancedAnalyticsPage(
    options,
    '/author/analytics/questions',
    {
      eventId: options.eventId,
      challengeId: options.challengeId,
      format: options.format,
      difficulty: options.difficulty,
      fromDate: options.fromDate,
      toDate: options.toDate,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 25,
    },
  );
  if (
    payload.minimumSampleSize !== 10 ||
    payload.easyCorrectRate !== 0.9 ||
    payload.problematicIncorrectRate !== 0.7
  ) {
    throw unavailableResponse();
  }
  return {
    ...parseAnalyticsPage(payload, parseAdvancedQuestionAnalyticsItem),
    minimumSampleSize: 10,
    easyCorrectRate: 0.9,
    problematicIncorrectRate: 0.7,
  };
}

export async function listAuthorCardIssuanceAnalytics(
  options: RequestBase & {
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorCardIssuanceAnalyticsPage> {
  const payload = await listAdvancedAnalyticsPage(
    options,
    '/author/analytics/card-issuance',
    {
      fromDate: options.fromDate,
      toDate: options.toDate,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 25,
    },
  );
  if (
    payload.minimumSampleSize !== 10 ||
    !Array.isArray(payload.rarities) ||
    payload.rarities.length !== 4
  ) {
    throw unavailableResponse();
  }
  const rarities = payload.rarities.map(parseCardRarityAnalyticsItem);
  if (new Set(rarities.map((item) => item.rarity)).size !== 4) {
    throw unavailableResponse();
  }
  return {
    ...parseAnalyticsPage(payload, parseCardIssuanceAnalyticsItem),
    rarities,
    minimumSampleSize: 10,
  };
}

async function listAdvancedAnalyticsPage(
  options: RequestBase,
  path: string,
  values: Record<string, string | number | undefined>,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `${path}?${params.toString()}`,
  });
  if (!isRecord(payload)) throw unavailableResponse();
  requireRequestId(payload);
  return payload;
}

function parseAnalyticsPage<T>(
  payload: Record<string, unknown>,
  itemParser: (value: unknown) => T,
): AuthorPage<T> {
  if (
    !Array.isArray(payload.items) ||
    !isPositiveInteger(payload.page) ||
    !isPositiveInteger(payload.pageSize) ||
    payload.pageSize > 100 ||
    !isNonNegativeInteger(payload.totalItems) ||
    !isNonNegativeInteger(payload.totalPages)
  ) {
    throw unavailableResponse();
  }
  return {
    items: payload.items.map(itemParser),
    page: payload.page,
    pageSize: payload.pageSize,
    totalItems: payload.totalItems,
    totalPages: payload.totalPages,
  };
}

export async function createAuthorQuestion(
  options: RequestBase & {
    challengeId: string;
    input: AuthorQuestionInput;
  },
) {
  return requestQuestion({
    ...options,
    body: options.input,
    method: 'POST',
    path: `/author/challenges/${options.challengeId}/questions`,
  });
}

export async function updateAuthorQuestion(
  options: RequestBase & {
    expectedVersion: number;
    input: AuthorQuestionInput;
    questionId: string;
  },
) {
  return requestQuestion({
    ...options,
    body: { ...options.input, expectedVersion: options.expectedVersion },
    method: 'PUT',
    path: `/author/questions/${options.questionId}`,
  });
}

export async function publishAuthorQuestion(
  options: RequestBase & { questionId: string; expectedVersion: number },
) {
  return requestQuestionLifecycle(options, 'publish');
}

export async function retireAuthorQuestion(
  options: RequestBase & { questionId: string; expectedVersion: number },
) {
  return requestQuestionLifecycle(options, 'retire');
}

export async function listAuthorCards(options: RequestBase) {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: '/author/cards',
  });

  if (!isRecord(payload) || !Array.isArray(payload.cards)) {
    throw unavailableResponse();
  }

  requireRequestId(payload);
  return payload.cards.map(parseAuthorCard);
}

export async function createAuthorCard(
  options: RequestBase & { input: AuthorCardInput },
) {
  return requestCard({
    ...options,
    body: options.input,
    method: 'POST',
    path: '/author/cards',
  });
}

export async function updateAuthorCard(
  options: RequestBase & {
    cardId: string;
    expectedVersion: number;
    input: AuthorCardInput;
  },
) {
  return requestCard({
    ...options,
    body: { ...options.input, expectedVersion: options.expectedVersion },
    method: 'PUT',
    path: `/author/cards/${options.cardId}`,
  });
}

export async function publishAuthorCard(
  options: RequestBase & { cardId: string; expectedVersion: number },
) {
  return requestCardLifecycle(options, 'publish');
}

export async function retireAuthorCard(
  options: RequestBase & { cardId: string; expectedVersion: number },
) {
  return requestCardLifecycle(options, 'retire');
}

export async function listAuthorReviewQueue(
  options: RequestBase & {
    entityType?: AuthorContentEntityType;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorPage<AuthorReviewQueueItem>> {
  const query = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  if (options.entityType) query.set('entityType', options.entityType);
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/review-queue?${query.toString()}`,
  });
  return parsePage(payload, parseAuthorReviewQueueItem);
}

export async function listAuthorTrustCases(
  options: RequestBase & {
    band?: TrustReviewBand;
    page?: number;
    pageSize?: number;
    search?: string;
    status?: TrustCaseStatusFilter;
  },
): Promise<AuthorPage<TrustCaseQueueItem>> {
  const query = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
    status: options.status ?? 'active',
  });
  if (options.search) query.set('search', options.search);
  if (options.band) query.set('band', options.band);
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/trust-cases?${query.toString()}`,
  });
  return parsePage(payload, parseTrustCaseQueueItem);
}

export async function getAuthorTrustCase(
  options: RequestBase & { caseId: string },
): Promise<TrustCaseDetail> {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/trust-cases/${encodeURIComponent(options.caseId)}`,
  });
  return parseEnvelope(payload, 'case', parseTrustCaseDetail);
}

export async function recordAuthorTrustDecision(
  options: RequestBase & {
    caseId: string;
    input: TrustReviewDecisionInput;
  },
): Promise<TrustCaseDetail> {
  const payload = await authorRequest({
    ...options,
    body: options.input,
    method: 'POST',
    path: `/author/trust-cases/${encodeURIComponent(options.caseId)}/decisions`,
  });
  return parseEnvelope(payload, 'case', parseTrustCaseDetail);
}

export async function getAuthorContentHistory(
  options: RequestBase & {
    entityId: string;
    entityType: AuthorContentEntityType;
    page?: number;
    pageSize?: number;
  },
): Promise<AuthorPage<AuthorContentHistoryItem>> {
  const query = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  });
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: `/author/content/${options.entityType}/${options.entityId}/history?${query.toString()}`,
  });
  return parsePage(payload, parseAuthorContentHistoryItem);
}

export async function transitionAuthorContent<
  T extends AuthorContentEntityType,
>(
  options: RequestBase & {
    action: AuthorTransitionAction;
    entityId: string;
    entityType: T;
    expectedVersion: number;
    reason?: string;
  },
): Promise<AuthorContentByType[T]> {
  const collection = {
    event: 'events',
    challenge: 'challenges',
    question: 'questions',
    card: 'cards',
    campaign: 'campaigns',
  }[options.entityType];
  const payload = await authorRequest({
    ...options,
    body:
      options.action === 'return'
        ? { expectedVersion: options.expectedVersion, reason: options.reason }
        : { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/${collection}/${options.entityId}/${options.action}`,
  });
  return parseAuthorContentEnvelope(payload, options.entityType);
}

export async function listAuthorCampaigns(
  options: RequestBase,
): Promise<AuthorCampaign[]> {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: '/author/campaigns',
  });
  if (!isRecord(payload) || !Array.isArray(payload.campaigns)) {
    throw unavailableResponse();
  }
  requireRequestId(payload);
  return payload.campaigns.map(parseAuthorCampaign);
}

export async function createAuthorCampaign(
  options: RequestBase & { input: AuthorCampaignInput },
): Promise<AuthorCampaign> {
  return requestCampaign({
    ...options,
    body: options.input,
    method: 'POST',
    path: '/author/campaigns',
  });
}

export async function updateAuthorCampaign(
  options: RequestBase & {
    campaignId: string;
    expectedVersion: number;
    input: AuthorCampaignInput;
  },
): Promise<AuthorCampaign> {
  return requestCampaign({
    ...options,
    body: { ...options.input, expectedVersion: options.expectedVersion },
    method: 'PUT',
    path: `/author/campaigns/${options.campaignId}`,
  });
}

export async function listAuthorTrails(
  options: RequestBase,
): Promise<AuthorTrail[]> {
  const payload = await authorRequest({
    ...options,
    method: 'GET',
    path: '/author/trails',
  });
  if (!isRecord(payload) || !Array.isArray(payload.trails)) {
    throw unavailableResponse();
  }
  requireRequestId(payload);
  return payload.trails.map(parseAuthorTrail);
}

async function requestEvent(options: RequestOptions): Promise<AuthorEvent> {
  const payload = await authorRequest(options);
  return parseEnvelope(payload, 'event', parseAuthorEvent);
}

async function requestQuestion(
  options: RequestOptions,
): Promise<AuthorQuestion> {
  const payload = await authorRequest(options);
  return parseEnvelope(payload, 'question', parseAuthorQuestion);
}

async function requestCard(options: RequestOptions): Promise<AuthorCard> {
  const payload = await authorRequest(options);
  return parseEnvelope(payload, 'card', parseAuthorCard);
}

async function requestCampaign(
  options: RequestOptions,
): Promise<AuthorCampaign> {
  const payload = await authorRequest(options);
  return parseEnvelope(payload, 'campaign', parseAuthorCampaign);
}

async function requestChallengeLifecycle(
  options: RequestBase & { challengeId: string; expectedVersion: number },
  action: 'publish' | 'retire',
) {
  const payload = await authorRequest({
    ...options,
    body: { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/challenges/${options.challengeId}/${action}`,
  });
  return parseEnvelope(payload, 'challenge', parseAuthorChallenge);
}

async function requestQuestionLifecycle(
  options: RequestBase & { questionId: string; expectedVersion: number },
  action: 'publish' | 'retire',
) {
  return requestQuestion({
    ...options,
    body: { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/questions/${options.questionId}/${action}`,
  });
}

async function requestCardLifecycle(
  options: RequestBase & { cardId: string; expectedVersion: number },
  action: 'publish' | 'retire',
) {
  return requestCard({
    ...options,
    body: { expectedVersion: options.expectedVersion },
    method: 'POST',
    path: `/author/cards/${options.cardId}/${action}`,
  });
}

async function authorRequest({
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
    throw new AuthorApiError(
      'authorization',
      'Your session could not authorize this request.',
    );
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

    throw new AuthorApiError(
      'unavailable',
      'The API is unavailable. No content change was confirmed.',
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw unavailableResponse();
  }

  if (!response.ok) {
    throw parseAuthorError(response.status, payload);
  }

  return payload;
}

function parseAuthorError(status: number, payload: unknown): AuthorApiError {
  if (!isRecord(payload)) {
    return unavailableResponse();
  }

  const detail =
    typeof payload.detail === 'string'
      ? payload.detail
      : 'The API could not complete the request.';
  const requestId =
    typeof payload.requestId === 'string' ? payload.requestId : undefined;
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const validation = Array.isArray(payload.validation)
    ? payload.validation.flatMap((failure) => {
        if (
          isRecord(failure) &&
          typeof failure.field === 'string' &&
          typeof failure.message === 'string'
        ) {
          return [{ field: failure.field, message: failure.message }];
        }

        return [];
      })
    : [];

  if (status === 401) {
    return new AuthorApiError(
      'authorization',
      detail,
      requestId,
      validation,
      code,
    );
  }

  if (status === 403) {
    return new AuthorApiError('forbidden', detail, requestId, validation, code);
  }

  if (status === 404) {
    return new AuthorApiError('not-found', detail, requestId, validation, code);
  }

  if (status === 409) {
    return new AuthorApiError('conflict', detail, requestId, validation, code);
  }

  if (status === 422) {
    return new AuthorApiError('not-ready', detail, requestId, validation, code);
  }

  if (status === 400) {
    return new AuthorApiError(
      'validation',
      detail,
      requestId,
      validation,
      code,
    );
  }

  return new AuthorApiError('unavailable', detail, requestId, validation, code);
}

function parseEnvelope<T>(
  payload: unknown,
  key: string,
  parser: (value: unknown) => T,
): T {
  if (!isRecord(payload) || !(key in payload)) {
    throw unavailableResponse();
  }

  requireRequestId(payload);
  return parser(payload[key]);
}

function parseAuthorContentEnvelope<T extends AuthorContentEntityType>(
  payload: unknown,
  entityType: T,
): AuthorContentByType[T] {
  const parsers = {
    event: parseAuthorEvent,
    challenge: parseAuthorChallenge,
    question: parseAuthorQuestion,
    card: parseAuthorCard,
    campaign: parseAuthorCampaign,
  } as const;
  return parseEnvelope(
    payload,
    entityType,
    parsers[entityType] as (value: unknown) => AuthorContentByType[T],
  );
}

function parsePage<T>(
  payload: unknown,
  itemParser: (value: unknown) => T,
): AuthorPage<T> {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !isPositiveInteger(payload.page) ||
    !isPositiveInteger(payload.pageSize) ||
    !isNonNegativeInteger(payload.totalItems) ||
    !isNonNegativeInteger(payload.totalPages)
  ) {
    throw unavailableResponse();
  }
  requireRequestId(payload);
  return {
    items: payload.items.map(itemParser),
    page: payload.page,
    pageSize: payload.pageSize,
    totalItems: payload.totalItems,
    totalPages: payload.totalPages,
  };
}

function parseAuthorEvent(value: unknown): AuthorEvent {
  const sourceUrls =
    isRecord(value) && value.sourceUrls !== undefined ? value.sourceUrls : [];
  if (
    !isRecord(value) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.title) ||
    !isNullableString(value.description) ||
    !isCoordinate(value.latitude, -90, 90) ||
    !isCoordinate(value.longitude, -180, 180) ||
    !isPositiveInteger(value.radiusMetres) ||
    !isSourceUrls(sourceUrls) ||
    !isDateTime(value.startsAt) ||
    !isDateTime(value.endsAt) ||
    typeof value.isPublished !== 'boolean' ||
    !isStatus(value.authoringStatus) ||
    !isNullableDateTime(value.retiredAt) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !isLifecycleMetadata(value)
  ) {
    throw unavailableResponse();
  }

  return { ...(value as unknown as AuthorEvent), sourceUrls };
}

function parseAuthorChallenge(value: unknown): AuthorChallenge {
  if (
    !isRecord(value) ||
    !isUuid(value.challengeId) ||
    !isUuid(value.eventId) ||
    !isChallengeFormat(value.format) ||
    !isStatus(value.status) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !isLifecycleMetadata(value)
  ) {
    throw unavailableResponse();
  }

  return value as unknown as AuthorChallenge;
}

function parseAuthorQuestion(value: unknown): AuthorQuestion {
  const sourceUrls =
    isRecord(value) && value.sourceUrls !== undefined ? value.sourceUrls : [];
  if (
    !isRecord(value) ||
    !isUuid(value.questionId) ||
    !isUuid(value.challengeId) ||
    !isChallengeFormat(value.format) ||
    !isNonBlank(value.prompt) ||
    !isDifficulty(value.difficulty) ||
    !isNullableString(value.explanation) ||
    !isSourceUrls(sourceUrls) ||
    !isStatus(value.status) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !isLifecycleMetadata(value)
  ) {
    throw unavailableResponse();
  }

  if (value.format === 'ordering') {
    if (!Array.isArray(value.items)) {
      throw unavailableResponse();
    }

    const items = value.items.map(parseOrderingItem);

    if (
      items.length !== 4 ||
      new Set(items.map((item) => item.itemId)).size !== 4 ||
      new Set(items.map((item) => item.position)).size !== 4 ||
      !items.every((item, index) => item.position === index + 1)
    ) {
      throw unavailableResponse();
    }

    return {
      ...(value as unknown as AuthorOrderingQuestion),
      format: 'ordering',
      items,
      sourceUrls,
    };
  }

  if (
    !Array.isArray(value.choices) ||
    !isNullableUuid(value.acceptedChoiceId) ||
    !isNullableChoicePosition(value.acceptedChoicePosition)
  ) {
    throw unavailableResponse();
  }

  const choices = value.choices.map(parseQuestionChoice);
  const acceptedChoice = choices.find(
    (choice) => choice.position === value.acceptedChoicePosition,
  );

  if (
    choices.length !== 4 ||
    new Set(choices.map((choice) => choice.position)).size !== choices.length ||
    (value.acceptedChoiceId === null) !==
      (value.acceptedChoicePosition === null) ||
    (value.acceptedChoiceId !== null &&
      acceptedChoice?.choiceId !== value.acceptedChoiceId)
  ) {
    throw unavailableResponse();
  }

  return {
    ...(value as unknown as AuthorMultipleChoiceQuestion),
    format: 'multiple_choice',
    choices,
    sourceUrls,
  };
}

function isSourceUrls(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (sourceUrl) =>
        typeof sourceUrl === 'string' && /^https:\/\/\S+$/.test(sourceUrl),
    )
  );
}

function parseQuestionChoice(value: unknown): AuthorQuestionChoice {
  if (
    !isRecord(value) ||
    !isUuid(value.choiceId) ||
    !isChoicePosition(value.position) ||
    !isNonBlank(value.text)
  ) {
    throw unavailableResponse();
  }

  return value as unknown as AuthorQuestionChoice;
}

function parseOrderingItem(value: unknown): AuthorOrderingItem {
  if (
    !isRecord(value) ||
    !isUuid(value.itemId) ||
    !isChoicePosition(value.position) ||
    !isNonBlank(value.text)
  ) {
    throw unavailableResponse();
  }

  return value as unknown as AuthorOrderingItem;
}

function parseAuthorCard(value: unknown): AuthorCard {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isNonBlank(value.name) ||
    !isCategory(value.category) ||
    (value.category === 'creature'
      ? !isAffinity(value.affinity)
      : value.affinity !== null && !isAffinity(value.affinity)) ||
    !isRarity(value.rarity) ||
    !isNullableNonNegativeInteger(value.hp) ||
    !isNullableNonNegativeInteger(value.power) ||
    !isNullableString(value.description) ||
    !isNullableString(value.imageUrl) ||
    typeof value.isActive !== 'boolean' ||
    !Array.isArray(value.moves) ||
    !Array.isArray(value.effects) ||
    !isStatus(value.authoringStatus) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !isLifecycleMetadata(value)
  ) {
    throw unavailableResponse();
  }

  const moves = value.moves.map(parseCardMove);
  const effects = value.effects.map(parseCardEffect);

  return { ...(value as unknown as AuthorCard), effects, moves };
}

function parseAuthorCampaign(value: unknown): AuthorCampaign {
  if (
    !isRecord(value) ||
    !isUuid(value.campaignId) ||
    !isNonBlank(value.title) ||
    !isNullableString(value.description) ||
    !isStatus(value.status) ||
    !isDateTime(value.startsAt) ||
    !isDateTime(value.endsAt) ||
    !isNullableDateTime(value.publishedAt) ||
    !isNullableDateTime(value.retiredAt) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.trails) ||
    !isLifecycleMetadata(value)
  ) {
    throw unavailableResponse();
  }
  return {
    ...(value as unknown as AuthorCampaign),
    events: value.events.map(parseAuthorCampaignEvent),
    trails: value.trails.map(parseAuthorCampaignTrail),
  };
}

function parseAuthorCampaignEvent(value: unknown): AuthorCampaignEvent {
  if (
    !isRecord(value) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.title) ||
    !isStatus(value.authoringStatus) ||
    !isDateTime(value.startsAt) ||
    !isDateTime(value.endsAt)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorCampaignEvent;
}

function parseAuthorCampaignTrail(value: unknown): AuthorCampaignTrail {
  if (
    !isRecord(value) ||
    !isUuid(value.trailId) ||
    !isNonBlank(value.title) ||
    !isTrailStatus(value.status)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorCampaignTrail;
}

function parseAuthorTrail(value: unknown): AuthorTrail {
  if (
    !isRecord(value) ||
    !isUuid(value.trailId) ||
    !isNonBlank(value.title) ||
    !isNullableString(value.description) ||
    !isTrailStatus(value.status) ||
    !isNullableDateTime(value.publishedAt) ||
    !isNullableDateTime(value.retiredAt) ||
    !isDateTime(value.createdAt) ||
    !isDateTime(value.updatedAt) ||
    !Array.isArray(value.steps)
  ) {
    throw unavailableResponse();
  }
  return {
    ...(value as unknown as AuthorTrail),
    steps: value.steps.map(parseAuthorTrailStep),
  };
}

function parseAuthorTrailStep(value: unknown): AuthorTrailStep {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.position) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.title) ||
    !isTrailStatus(value.eventStatus)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorTrailStep;
}

function parseAuthorReviewQueueItem(value: unknown): AuthorReviewQueueItem {
  if (
    !isRecord(value) ||
    !isContentEntityType(value.entityType) ||
    !isUuid(value.entityId) ||
    !isNullableUuid(value.eventId) ||
    !isNullableUuid(value.challengeId) ||
    !isNonBlank(value.label) ||
    value.status !== 'in_review' ||
    !isNonNegativeInteger(value.version) ||
    !isUuid(value.submittedBy) ||
    !isNonBlank(value.submittedByName) ||
    !isDateTime(value.submittedAt) ||
    typeof value.canReview !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  if (
    (value.entityType === 'challenge' && value.eventId === null) ||
    (value.entityType === 'question' &&
      (value.eventId === null || value.challengeId === null))
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorReviewQueueItem;
}

function parseTrustCaseQueueItem(value: unknown): TrustCaseQueueItem {
  if (
    !isRecord(value) ||
    !isUuid(value.caseId) ||
    !isUuid(value.playerId) ||
    !isNonBlank(value.playerName) ||
    !isTrustCaseStatus(value.status) ||
    !isPositiveInteger(value.version) ||
    !isBoundedInteger(value.score, 0, 100) ||
    !isTrustReviewBand(value.band) ||
    !isNonBlank(value.policyVersion) ||
    !isDateTime(value.openedAt) ||
    !isDateTime(value.updatedAt) ||
    !isNonNegativeInteger(value.activeRestrictionCount) ||
    !isNullableDateTime(value.latestRestrictionExpiry) ||
    typeof value.canReview !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  return value as unknown as TrustCaseQueueItem;
}

function parseTrustCaseDetail(value: unknown): TrustCaseDetail {
  const queueItem = parseTrustCaseQueueItem(value);
  if (
    !isRecord(value) ||
    !isRecord(value.scoreExplanation) ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.history)
  ) {
    throw unavailableResponse();
  }
  return {
    ...queueItem,
    scoreExplanation: parseTrustScoreExplanation(value.scoreExplanation),
    evidence: value.evidence.map(parseTrustCaseEvidenceItem),
    history: value.history.map(parseTrustCaseHistoryItem),
  };
}

function parseTrustScoreExplanation(value: unknown): TrustScoreExplanation {
  if (
    !isRecord(value) ||
    !isUuid(value.snapshotId) ||
    !isDateTime(value.evaluatedAt) ||
    !isBoundedInteger(value.movementPoints, 0, 50) ||
    !isBoundedInteger(value.submissionConflictPoints, 0, 30) ||
    !isBoundedInteger(value.opponentPatternPoints, 0, 30) ||
    !isBoundedInteger(value.finalScore, 0, 100) ||
    !isTrustReviewBand(value.reviewBand) ||
    !isNonNegativeInteger(value.sourceSignalCount)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as TrustScoreExplanation;
}

function parseTrustCaseEvidenceItem(value: unknown): TrustCaseEvidenceItem {
  if (
    !isRecord(value) ||
    !isUuid(value.evidenceId) ||
    !isTrustSignalType(value.signalType) ||
    !isNonBlank(value.severity) ||
    !isBoundedInteger(value.basePoints, 1, 25) ||
    !isBoundedInteger(value.effectivePoints, 0, 25) ||
    !isDateTime(value.observedAt) ||
    !isDateTime(value.expiresAt) ||
    !isTrustEvidenceState(value.state) ||
    !isNonBlank(value.safeSourceType) ||
    !isNonBlank(value.policyVersion)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as TrustCaseEvidenceItem;
}

function parseTrustRestrictionItem(value: unknown): TrustRestrictionItem {
  if (
    !isRecord(value) ||
    !isUuid(value.restrictionId) ||
    !isUuid(value.decisionId) ||
    !isTrustRestrictionScope(value.scope) ||
    !isDateTime(value.startsAt) ||
    !isDateTime(value.originalExpiresAt) ||
    !isDateTime(value.effectiveExpiresAt) ||
    typeof value.active !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  return value as unknown as TrustRestrictionItem;
}

function parseTrustCaseHistoryItem(value: unknown): TrustCaseHistoryItem {
  if (
    !isRecord(value) ||
    !isUuid(value.decisionId) ||
    (value.actorType !== 'author' && value.actorType !== 'system') ||
    !isNullableUuid(value.actorPlayerId) ||
    !isNullableString(value.actorPlayerName) ||
    !isNonBlank(value.policyVersion) ||
    !isNonNegativeInteger(value.caseVersionBefore) ||
    !isPositiveInteger(value.caseVersionAfter) ||
    !isNonBlank(value.decisionType) ||
    !(
      value.previousStatus === null || isTrustCaseStatus(value.previousStatus)
    ) ||
    !isTrustCaseStatus(value.resultingStatus) ||
    !isNonBlank(value.reasonCode) ||
    !isNullableString(value.reasonNote) ||
    !Array.isArray(value.evidenceIds) ||
    !value.evidenceIds.every(isUuid) ||
    !Array.isArray(value.restrictions) ||
    !isDateTime(value.occurredAt)
  ) {
    throw unavailableResponse();
  }
  return {
    ...(value as unknown as TrustCaseHistoryItem),
    restrictions: value.restrictions.map(parseTrustRestrictionItem),
  };
}

function parseAuthorContentHistoryItem(
  value: unknown,
): AuthorContentHistoryItem {
  if (
    !isRecord(value) ||
    !isUuid(value.auditId) ||
    !isContentAction(value.action) ||
    !(value.fromStatus === null || isStatus(value.fromStatus)) ||
    !isStatus(value.toStatus) ||
    !isNonNegativeInteger(value.resultingVersion) ||
    !isNullableString(value.note) ||
    !isUuid(value.actorPlayerId) ||
    !isNonBlank(value.actorPlayerName) ||
    !isDateTime(value.occurredAt)
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorContentHistoryItem;
}

function parseEventLocationAnalyticsItem(
  value: unknown,
): AuthorEventLocationAnalyticsItem {
  if (
    !isRecord(value) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.eventTitle) ||
    (value.locationKind !== 'authored' &&
      value.locationKind !== 'placement_site') ||
    !isUuid(value.locationId) ||
    !isNonBlank(value.locationName) ||
    !isNullableNonNegativeInteger(value.viewCount) ||
    !isNullableNonNegativeInteger(value.eligibleCount) ||
    !isNullableNonNegativeInteger(value.startCount) ||
    !isNullableNonNegativeInteger(value.completionCount) ||
    typeof value.suppressed !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  const metrics = [
    value.viewCount,
    value.eligibleCount,
    value.startCount,
    value.completionCount,
  ];
  if (value.suppressed !== metrics.some((metric) => metric === null)) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorEventLocationAnalyticsItem;
}

function parseAdvancedQuestionAnalyticsItem(
  value: unknown,
): AuthorAdvancedQuestionAnalyticsItem {
  if (
    !isRecord(value) ||
    !isUuid(value.questionId) ||
    !isUuid(value.challengeId) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.eventTitle) ||
    !isNonBlank(value.prompt) ||
    !isChallengeFormat(value.format) ||
    !isDifficulty(value.difficulty) ||
    !isStatus(value.status) ||
    !isNullableNonNegativeInteger(value.answerCount) ||
    !isNullableNonNegativeInteger(value.correctCount) ||
    !isNullableNonNegativeInteger(value.incorrectCount) ||
    !isNullableNonNegativeInteger(value.timeoutCount) ||
    !isNullableRate(value.correctRate) ||
    !isNullableRate(value.incorrectRate) ||
    !isAnalyticsQuestionClassification(value.classification) ||
    typeof value.suppressed !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  const metrics = [
    value.answerCount,
    value.correctCount,
    value.incorrectCount,
    value.timeoutCount,
    value.correctRate,
    value.incorrectRate,
  ];
  if (
    value.suppressed !== (value.classification === 'suppressed') ||
    (value.suppressed && metrics.some((metric) => metric !== null)) ||
    (!value.suppressed && metrics.some((metric) => metric === null))
  ) {
    throw unavailableResponse();
  }
  if (
    !value.suppressed &&
    ((value.correctCount as number) + (value.incorrectCount as number) !==
      value.answerCount ||
      (value.timeoutCount as number) > (value.incorrectCount as number))
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorAdvancedQuestionAnalyticsItem;
}

function parseCardIssuanceAnalyticsItem(
  value: unknown,
): AuthorCardIssuanceAnalyticsItem {
  if (
    !isRecord(value) ||
    !isUuid(value.cardDefinitionId) ||
    !isNonBlank(value.cardName) ||
    !isRarity(value.rarity) ||
    typeof value.rewardEligible !== 'boolean' ||
    !isNullableNonNegativeInteger(value.issuanceCount) ||
    !isNullableNonNegativeNumber(value.issuancesPer100Completions) ||
    typeof value.suppressed !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  if (
    value.suppressed
      ? value.issuanceCount !== null ||
        value.issuancesPer100Completions !== null
      : value.issuanceCount === null
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorCardIssuanceAnalyticsItem;
}

function parseCardRarityAnalyticsItem(
  value: unknown,
): AuthorCardRarityAnalyticsItem {
  if (
    !isRecord(value) ||
    !isRarity(value.rarity) ||
    !isNullableNonNegativeInteger(value.issuanceCount) ||
    !isNullableNonNegativeNumber(value.issuancesPer100Completions) ||
    typeof value.suppressed !== 'boolean'
  ) {
    throw unavailableResponse();
  }
  if (
    value.suppressed
      ? value.issuanceCount !== null ||
        value.issuancesPer100Completions !== null
      : value.issuanceCount === null
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorCardRarityAnalyticsItem;
}

function parseQuestionPerformanceItem(
  value: unknown,
): AuthorQuestionPerformanceItem {
  if (
    !isRecord(value) ||
    !isUuid(value.questionId) ||
    !isUuid(value.challengeId) ||
    !isUuid(value.eventId) ||
    !isNonBlank(value.eventTitle) ||
    !isNonBlank(value.prompt) ||
    !isChallengeFormat(value.format) ||
    !isDifficulty(value.difficulty) ||
    !isStatus(value.status) ||
    !isNonNegativeInteger(value.answerCount) ||
    !isNonNegativeInteger(value.correctCount) ||
    !isNonNegativeInteger(value.incorrectCount) ||
    !isNonNegativeInteger(value.timeoutCount) ||
    !isRate(value.correctRate) ||
    !isRate(value.incorrectRate) ||
    typeof value.hasSufficientSample !== 'boolean' ||
    typeof value.isProblematic !== 'boolean' ||
    value.correctCount + value.incorrectCount !== value.answerCount ||
    value.timeoutCount > value.incorrectCount
  ) {
    throw unavailableResponse();
  }
  return value as unknown as AuthorQuestionPerformanceItem;
}

function parseCardMove(value: unknown): AuthorCardMove {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    !isNonBlank(value.name) ||
    !isMoveType(value.moveType) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns) ||
    !isNonNegativeInteger(value.powerCost)
  ) {
    throw unavailableResponse();
  }

  return value as unknown as AuthorCardMove;
}

function parseCardEffect(value: unknown): AuthorCardEffect {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isPositiveInteger(value.position) ||
    !isEffectType(value.effectType) ||
    !isNullableNonNegativeInteger(value.effectValue) ||
    !isNullableModifierStat(value.modifierStat) ||
    !isNullableModifierOperation(value.modifierOperation) ||
    !isNullablePositiveInteger(value.modifierDurationTurns)
  ) {
    throw unavailableResponse();
  }

  return value as unknown as AuthorCardEffect;
}

function requireRequestId(payload: Record<string, unknown>): void {
  if (typeof payload.requestId !== 'string') {
    throw unavailableResponse();
  }
}

function unavailableResponse(): AuthorApiError {
  return new AuthorApiError(
    'unavailable',
    'The API returned an unexpected response. No content change was confirmed.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
  );
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isCoordinate(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isNullableRate(value: unknown): value is number | null {
  return value === null || isRate(value);
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  );
}

function isAnalyticsQuestionClassification(
  value: unknown,
): value is AuthorAnalyticsQuestionClassification {
  return (
    value === 'suppressed' ||
    value === 'easy' ||
    value === 'problematic' ||
    value === 'normal'
  );
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isStatus(value: unknown): value is AuthoringStatus {
  return (
    value === 'draft' ||
    value === 'in_review' ||
    value === 'approved' ||
    value === 'published' ||
    value === 'retired'
  );
}

function isTrustCaseStatus(value: unknown): value is TrustCaseStatus {
  return value === 'open' || value === 'under_review' || value === 'resolved';
}

function isTrustReviewBand(value: unknown): value is TrustReviewBand {
  return (
    value === 'normal' ||
    value === 'observe' ||
    value === 'review_required' ||
    value === 'urgent_review'
  );
}

function isTrustSignalType(value: unknown): value is TrustSignalType {
  return (
    value === 'impossible_movement' ||
    value === 'idempotency_payload_conflict' ||
    value === 'submission_conflict_pattern' ||
    value === 'opponent_concentration' ||
    value === 'one_sided_outcome_pattern'
  );
}

function isTrustEvidenceState(
  value: unknown,
): value is TrustCaseEvidenceItem['state'] {
  return (
    value === 'active' ||
    value === 'adjusted_false_positive' ||
    value === 'expired'
  );
}

function isTrustRestrictionScope(
  value: unknown,
): value is TrustRestrictionScope {
  return (
    value === 'online_verification_required' ||
    value === 'location_reward_challenge_hold' ||
    value === 'new_competitive_match_hold'
  );
}

function isChallengeFormat(value: unknown): value is ChallengeFormat {
  return value === 'multiple_choice' || value === 'ordering';
}

function isTrailStatus(
  value: unknown,
): value is 'draft' | 'published' | 'retired' {
  return value === 'draft' || value === 'published' || value === 'retired';
}

function isContentEntityType(value: unknown): value is AuthorContentEntityType {
  return (
    value === 'event' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'card' ||
    value === 'campaign'
  );
}

function isContentAction(value: unknown): value is AuthorContentAction {
  return (
    value === 'create' ||
    value === 'edit' ||
    value === 'submit' ||
    value === 'approve' ||
    value === 'return' ||
    value === 'publish' ||
    value === 'retire'
  );
}

function isLifecycleMetadata(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeInteger(value.version) &&
    isNullableUuid(value.submittedBy) &&
    isNullableDateTime(value.submittedAt) &&
    isNullableUuid(value.reviewedBy) &&
    isNullableDateTime(value.reviewedAt) &&
    (value.publicationProvenance === null ||
      value.publicationProvenance === 'legacy' ||
      value.publicationProvenance === 'controlled_seed' ||
      value.publicationProvenance === 'reviewed')
  );
}

function isDifficulty(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isChoicePosition(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4
  );
}

function isNullableChoicePosition(value: unknown): value is number | null {
  return value === null || isChoicePosition(value);
}

function isCategory(value: unknown): value is CardCategory {
  return value === 'creature' || value === 'power';
}

function isAffinity(value: unknown): value is CardAffinity {
  return (
    value === 'wit' ||
    value === 'grit' ||
    value === 'spark' ||
    value === 'spirit' ||
    value === 'mystic'
  );
}

function isRarity(value: unknown): value is CardRarity {
  return (
    value === 'common' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary'
  );
}

function isMoveType(value: unknown): value is CardMoveType {
  return value === 'basic' || isAffinity(value);
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
): value is CardModifierOperation | null {
  return value === null || value === 'add' || value === 'multiply';
}
