import type { ApiAccessTokenProvider } from '../auth/useApiAccessToken';
import type { LocationClaim } from '../browser-location';

export interface ChallengeChoice {
  choiceId: string;
  text: string;
}

export interface ChallengeQuestion {
  answeredAt: string | null;
  attemptQuestionId: string;
  choices: ChallengeChoice[];
  position: number;
  prompt: string;
  selectedChoiceId: string | null;
}

export interface InProgressChallengeAttempt {
  answeredCount: number;
  attemptId: string;
  deadline: string;
  eventId: string;
  format: 'multiple_choice';
  questions: ChallengeQuestion[];
  startedAt: string;
  status: 'in_progress';
  totalQuestions: 5;
}

export interface CompletedChallengeCard {
  affinity: 'wit' | 'grit' | 'spark' | 'spirit' | 'mystic';
  cardDefinitionId: string;
  category: 'creature' | 'power';
  name: string;
  ownedCardId: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface CompletedChallengeQuestionReview {
  attemptQuestionId: string;
  correctChoice: ChallengeChoice;
  isCorrect: boolean;
  position: number;
  prompt: string;
  selectedChoice: ChallengeChoice | null;
}

export interface CompletedChallengeAttempt {
  attemptId: string;
  completedAt: string;
  completionReason: 'answered' | 'timeout';
  eventId: string;
  format: 'multiple_choice';
  review: CompletedChallengeQuestionReview[];
  reward: { cards: CompletedChallengeCard[]; coinsAwarded: number };
  scoreCorrect: number;
  status: 'completed';
  totalQuestions: 5;
}

export type PlayerSafeChallengeAttempt =
  CompletedChallengeAttempt | InProgressChallengeAttempt;

export type ChallengeApiFailure =
  | 'answer-locked'
  | 'attempt-completed'
  | 'attempt-not-found'
  | 'authorization'
  | 'event-not-reachable'
  | 'event-unavailable'
  | 'location-retry'
  | 'unavailable'
  | 'validation';

export class ChallengeApiError extends Error {
  public constructor(
    public readonly failure: ChallengeApiFailure,
    public readonly requestId?: string,
  ) {
    super('The challenge request could not be completed.');
    this.name = 'ChallengeApiError';
  }
}

interface ChallengeRequestBase {
  apiBaseUrl: string;
  getAccessToken: ApiAccessTokenProvider;
  signal: AbortSignal;
}

interface StartChallengeAttemptOptions extends ChallengeRequestBase {
  claim: LocationClaim;
  eventId: string;
}

interface GetChallengeAttemptOptions extends ChallengeRequestBase {
  attemptId: string;
}

interface SubmitChallengeAnswerOptions extends ChallengeRequestBase {
  attemptId: string;
  attemptQuestionId: string;
  choiceId: string;
}

export async function startChallengeAttempt({
  apiBaseUrl,
  claim,
  eventId,
  getAccessToken,
  signal,
}: StartChallengeAttemptOptions): Promise<PlayerSafeChallengeAttempt> {
  return requestAttempt({
    apiBaseUrl,
    body: claim,
    getAccessToken,
    method: 'POST',
    path: `/events/${eventId}/challenge-attempts`,
    signal,
  });
}

export async function getChallengeAttempt({
  apiBaseUrl,
  attemptId,
  getAccessToken,
  signal,
}: GetChallengeAttemptOptions): Promise<PlayerSafeChallengeAttempt> {
  return requestAttempt({
    apiBaseUrl,
    getAccessToken,
    method: 'GET',
    path: `/challenge-attempts/${attemptId}`,
    signal,
  });
}

export async function submitChallengeAnswer({
  apiBaseUrl,
  attemptId,
  attemptQuestionId,
  choiceId,
  getAccessToken,
  signal,
}: SubmitChallengeAnswerOptions): Promise<PlayerSafeChallengeAttempt> {
  return requestAttempt({
    apiBaseUrl,
    body: { attemptQuestionId, choiceId },
    getAccessToken,
    method: 'POST',
    path: `/challenge-attempts/${attemptId}/answers`,
    signal,
  });
}

interface RequestAttemptOptions extends ChallengeRequestBase {
  body?: object;
  method: 'GET' | 'POST';
  path: string;
}

async function requestAttempt({
  apiBaseUrl,
  body,
  getAccessToken,
  method,
  path,
  signal,
}: RequestAttemptOptions): Promise<PlayerSafeChallengeAttempt> {
  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch {
    throw new ChallengeApiError('authorization');
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

    throw new ChallengeApiError('unavailable');
  }

  if (!response.ok) {
    throw await parseChallengeError(response);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ChallengeApiError('unavailable');
  }

  return parseChallengeAttempt(payload);
}

async function parseChallengeError(
  response: Response,
): Promise<ChallengeApiError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return new ChallengeApiError(
      response.status === 401 ? 'authorization' : 'unavailable',
    );
  }

  const code = isRecord(payload) ? payload.code : undefined;
  const requestId =
    isRecord(payload) && typeof payload.requestId === 'string'
      ? payload.requestId
      : undefined;

  if (response.status === 401) {
    return new ChallengeApiError('authorization', requestId);
  }

  if (code === 'ATTEMPT_NOT_FOUND') {
    return new ChallengeApiError('attempt-not-found', requestId);
  }

  if (code === 'ANSWER_LOCKED') {
    return new ChallengeApiError('answer-locked', requestId);
  }

  if (code === 'ATTEMPT_COMPLETED') {
    return new ChallengeApiError('attempt-completed', requestId);
  }

  if (code === 'EVENT_NOT_REACHABLE') {
    return new ChallengeApiError('event-not-reachable', requestId);
  }

  if (
    code === 'EVENT_NOT_ACTIVE' ||
    code === 'CHALLENGE_UNAVAILABLE' ||
    code === 'EVENT_NOT_FOUND'
  ) {
    return new ChallengeApiError('event-unavailable', requestId);
  }

  if (code === 'LOCATION_RETRY_REQUIRED') {
    return new ChallengeApiError('location-retry', requestId);
  }

  if (response.status === 400) {
    return new ChallengeApiError('validation', requestId);
  }

  return new ChallengeApiError('unavailable', requestId);
}

function parseChallengeAttempt(payload: unknown): PlayerSafeChallengeAttempt {
  if (!isRecord(payload) || typeof payload.requestId !== 'string') {
    throw new ChallengeApiError('unavailable');
  }

  if (payload.status === 'in_progress') {
    return parseInProgressAttempt(payload);
  }

  if (payload.status === 'completed') {
    return parseCompletedAttempt(payload);
  }

  throw new ChallengeApiError('unavailable');
}

function parseInProgressAttempt(
  payload: Record<string, unknown>,
): InProgressChallengeAttempt {
  if (
    !isUuid(payload.attemptId) ||
    !isUuid(payload.eventId) ||
    payload.format !== 'multiple_choice' ||
    !isDateTime(payload.startedAt) ||
    !isDateTime(payload.deadline) ||
    payload.totalQuestions !== 5 ||
    !isAnswerCount(payload.answeredCount) ||
    !Array.isArray(payload.questions) ||
    payload.questions.length !== 5 ||
    hasForbiddenActiveAttemptFeedback(payload)
  ) {
    throw new ChallengeApiError('unavailable');
  }

  const questions = payload.questions.map(parseQuestion);

  if (
    new Set(questions.map((question) => question.position)).size !== 5 ||
    !questions.every((question, index) => question.position === index + 1) ||
    questions.filter((question) => question.selectedChoiceId !== null)
      .length !== payload.answeredCount
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return {
    answeredCount: payload.answeredCount,
    attemptId: payload.attemptId,
    deadline: payload.deadline,
    eventId: payload.eventId,
    format: 'multiple_choice',
    questions,
    startedAt: payload.startedAt,
    status: 'in_progress',
    totalQuestions: 5,
  };
}

function parseQuestion(payload: unknown): ChallengeQuestion {
  if (
    !isRecord(payload) ||
    !isUuid(payload.attemptQuestionId) ||
    !isQuestionPosition(payload.position) ||
    typeof payload.prompt !== 'string' ||
    payload.prompt.trim() === '' ||
    !Array.isArray(payload.choices) ||
    payload.choices.length !== 4 ||
    !isNullableUuid(payload.selectedChoiceId) ||
    !isNullableDateTime(payload.answeredAt) ||
    hasForbiddenActiveAttemptFeedback(payload)
  ) {
    throw new ChallengeApiError('unavailable');
  }

  const choices = payload.choices.map(parseChoice);

  if (
    new Set(choices.map((choice) => choice.choiceId)).size !== 4 ||
    (payload.selectedChoiceId !== null &&
      !choices.some((choice) => choice.choiceId === payload.selectedChoiceId))
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return {
    answeredAt: payload.answeredAt,
    attemptQuestionId: payload.attemptQuestionId,
    choices,
    position: payload.position,
    prompt: payload.prompt,
    selectedChoiceId: payload.selectedChoiceId,
  };
}

function parseChoice(payload: unknown): ChallengeChoice {
  if (
    !isRecord(payload) ||
    !isUuid(payload.choiceId) ||
    typeof payload.text !== 'string' ||
    payload.text.trim() === '' ||
    hasForbiddenActiveAttemptFeedback(payload)
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return { choiceId: payload.choiceId, text: payload.text };
}

function parseCompletedAttempt(
  payload: Record<string, unknown>,
): CompletedChallengeAttempt {
  if (
    !hasOnlyKeys(payload, [
      'attemptId',
      'completedAt',
      'completionReason',
      'eventId',
      'format',
      'requestId',
      'review',
      'reward',
      'scoreCorrect',
      'status',
      'totalQuestions',
    ]) ||
    !isUuid(payload.attemptId) ||
    !isUuid(payload.eventId) ||
    payload.format !== 'multiple_choice' ||
    !isDateTime(payload.completedAt) ||
    !isCompletionReason(payload.completionReason) ||
    payload.totalQuestions !== 5 ||
    !isAnswerCount(payload.scoreCorrect) ||
    !Array.isArray(payload.review) ||
    payload.review.length !== 5 ||
    !isRecord(payload.reward) ||
    !hasOnlyKeys(payload.reward, ['cards', 'coinsAwarded']) ||
    !isNonNegativeInteger(payload.reward.coinsAwarded) ||
    !Array.isArray(payload.reward.cards) ||
    payload.reward.cards.length > 2
  ) {
    throw new ChallengeApiError('unavailable');
  }

  const review = payload.review.map(parseCompletedQuestionReview);

  if (
    new Set(review.map((question) => question.position)).size !== 5 ||
    !review.every((question, index) => question.position === index + 1) ||
    review.filter((question) => question.isCorrect).length !==
      payload.scoreCorrect
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return {
    attemptId: payload.attemptId,
    completedAt: payload.completedAt,
    completionReason: payload.completionReason,
    eventId: payload.eventId,
    format: 'multiple_choice',
    review,
    reward: {
      cards: payload.reward.cards.map(parseRewardCard),
      coinsAwarded: payload.reward.coinsAwarded,
    },
    scoreCorrect: payload.scoreCorrect,
    status: 'completed',
    totalQuestions: 5,
  };
}

function parseCompletedQuestionReview(
  payload: unknown,
): CompletedChallengeQuestionReview {
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, [
      'attemptQuestionId',
      'position',
      'prompt',
      'selectedChoice',
      'correctChoice',
      'isCorrect',
    ]) ||
    !isUuid(payload.attemptQuestionId) ||
    !isQuestionPosition(payload.position) ||
    typeof payload.prompt !== 'string' ||
    payload.prompt.trim() === '' ||
    (payload.selectedChoice !== null && !isRecord(payload.selectedChoice)) ||
    !isRecord(payload.correctChoice) ||
    typeof payload.isCorrect !== 'boolean'
  ) {
    throw new ChallengeApiError('unavailable');
  }

  const selectedChoice =
    payload.selectedChoice === null
      ? null
      : parseCompletedReviewChoice(payload.selectedChoice);
  const correctChoice = parseCompletedReviewChoice(payload.correctChoice);

  return {
    attemptQuestionId: payload.attemptQuestionId,
    correctChoice,
    isCorrect: payload.isCorrect,
    position: payload.position,
    prompt: payload.prompt,
    selectedChoice,
  };
}

function parseCompletedReviewChoice(payload: Record<string, unknown>) {
  if (
    !hasOnlyKeys(payload, ['choiceId', 'text']) ||
    !isUuid(payload.choiceId) ||
    typeof payload.text !== 'string' ||
    payload.text.trim() === ''
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return { choiceId: payload.choiceId, text: payload.text };
}

function parseRewardCard(payload: unknown): CompletedChallengeCard {
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, [
      'affinity',
      'cardDefinitionId',
      'category',
      'name',
      'ownedCardId',
      'rarity',
    ]) ||
    !isUuid(payload.ownedCardId) ||
    !isUuid(payload.cardDefinitionId) ||
    typeof payload.name !== 'string' ||
    payload.name.trim() === '' ||
    !isCardCategory(payload.category) ||
    !isAffinity(payload.affinity) ||
    !isRarity(payload.rarity)
  ) {
    throw new ChallengeApiError('unavailable');
  }

  return {
    affinity: payload.affinity,
    cardDefinitionId: payload.cardDefinitionId,
    category: payload.category,
    name: payload.name,
    ownedCardId: payload.ownedCardId,
    rarity: payload.rarity,
  };
}

function hasForbiddenActiveAttemptFeedback(
  payload: Record<string, unknown>,
): boolean {
  return [
    'acceptedChoiceId',
    'answerCorrect',
    'answerKey',
    'cards',
    'coinsAwarded',
    'correctAnswer',
    'correctAnswers',
    'correctChoice',
    'correctChoiceId',
    'explanation',
    'isCorrect',
    'review',
    'reward',
    'scoreCorrect',
  ].some((key) => key in payload);
}

function hasOnlyKeys(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(payload).every((key) => allowedKeys.includes(key));
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

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isAnswerCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 5
  );
}

function isQuestionPosition(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isCompletionReason(value: unknown): value is 'answered' | 'timeout' {
  return value === 'answered' || value === 'timeout';
}

function isCardCategory(value: unknown): value is 'creature' | 'power' {
  return value === 'creature' || value === 'power';
}

function isAffinity(
  value: unknown,
): value is CompletedChallengeCard['affinity'] {
  return (
    value === 'wit' ||
    value === 'grit' ||
    value === 'spark' ||
    value === 'spirit' ||
    value === 'mystic'
  );
}

function isRarity(value: unknown): value is CompletedChallengeCard['rarity'] {
  return (
    value === 'common' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary'
  );
}
