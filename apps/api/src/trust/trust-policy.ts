import { createHash } from 'node:crypto';

export const TRUST_POLICY_VERSION = 'trust-v1' as const;
export const TRUST_SIGNAL_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export const TRUST_CATEGORY_CAPS = {
  movement: 50,
  submissionConflicts: 30,
  opponentPatterns: 30,
} as const;

export type TrustSignalType =
  | 'impossible_movement'
  | 'idempotency_payload_conflict'
  | 'submission_conflict_pattern'
  | 'opponent_concentration'
  | 'one_sided_outcome_pattern';

export type TrustReviewBand =
  'normal' | 'observe' | 'review_required' | 'urgent_review';

export type TrustSignalSeverity =
  'moderate' | 'strong' | 'pattern' | 'conflict';

export interface TrustScoreSignal {
  id: string;
  signalType: TrustSignalType;
  basePoints: number;
  observedAt: Date;
  adjustedFalsePositive?: boolean;
}

export interface TrustScoreResult {
  policyVersion: typeof TRUST_POLICY_VERSION;
  evaluatedAt: Date;
  movementPoints: number;
  submissionConflictPoints: number;
  opponentPatternPoints: number;
  finalScore: number;
  reviewBand: TrustReviewBand;
  sourceSignalCount: number;
  calculationDigest: Buffer;
}

export function impossibleMovementSignal(
  requiredSpeedMetresPerSecond: number,
  maxPlausibleSpeedMetresPerSecond: number,
): { severity: 'moderate' | 'strong'; basePoints: 15 | 25 } {
  if (
    !Number.isFinite(requiredSpeedMetresPerSecond) ||
    !Number.isFinite(maxPlausibleSpeedMetresPerSecond) ||
    requiredSpeedMetresPerSecond <= maxPlausibleSpeedMetresPerSecond ||
    maxPlausibleSpeedMetresPerSecond <= 0
  ) {
    throw new RangeError(
      'Impossible movement requires a finite speed above the configured threshold.',
    );
  }

  return requiredSpeedMetresPerSecond > maxPlausibleSpeedMetresPerSecond * 2
    ? { severity: 'strong', basePoints: 25 }
    : { severity: 'moderate', basePoints: 15 };
}

export function calculateTrustScore(input: {
  evaluatedAt: Date;
  signals: readonly TrustScoreSignal[];
}): TrustScoreResult {
  if (!isFiniteDate(input.evaluatedAt)) {
    throw new RangeError('Trust evaluation time must be a valid date-time.');
  }

  const evaluationMs = input.evaluatedAt.getTime();
  const orderedSignals = [...input.signals].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  let movement = 0;
  let submission = 0;
  let opponent = 0;
  let sourceSignalCount = 0;

  for (const signal of orderedSignals) {
    validateSignal(signal);
    if (signal.observedAt.getTime() > evaluationMs) continue;
    if (signal.adjustedFalsePositive) continue;

    sourceSignalCount += 1;
    const points = effectiveSignalPoints(signal, input.evaluatedAt);
    if (points <= 0) continue;

    switch (categoryForSignal(signal.signalType)) {
      case 'movement':
        movement += points;
        break;
      case 'submission':
        submission += points;
        break;
      case 'opponent':
        opponent += points;
        break;
    }
  }

  const movementPoints = Math.min(TRUST_CATEGORY_CAPS.movement, movement);
  const submissionConflictPoints = Math.min(
    TRUST_CATEGORY_CAPS.submissionConflicts,
    submission,
  );
  const opponentPatternPoints = Math.min(
    TRUST_CATEGORY_CAPS.opponentPatterns,
    opponent,
  );
  const finalScore = Math.min(
    100,
    movementPoints + submissionConflictPoints + opponentPatternPoints,
  );

  const canonical = {
    policyVersion: TRUST_POLICY_VERSION,
    signals: orderedSignals.map((signal) => ({
      id: signal.id,
      type: signal.signalType,
      basePoints: signal.basePoints,
      observedAt: signal.observedAt.toISOString(),
      adjustedFalsePositive: signal.adjustedFalsePositive === true,
    })),
    movementPoints,
    submissionConflictPoints,
    opponentPatternPoints,
    finalScore,
  };

  return {
    policyVersion: TRUST_POLICY_VERSION,
    evaluatedAt: input.evaluatedAt,
    movementPoints,
    submissionConflictPoints,
    opponentPatternPoints,
    finalScore,
    reviewBand: reviewBandForScore(finalScore),
    sourceSignalCount,
    calculationDigest: createHash('sha256')
      .update(stableJson(canonical))
      .digest(),
  };
}

export function effectiveSignalPoints(
  signal: Pick<TrustScoreSignal, 'basePoints' | 'observedAt'>,
  evaluatedAt: Date,
): number {
  if (!Number.isInteger(signal.basePoints) || signal.basePoints <= 0) {
    throw new RangeError(
      'Trust signal base points must be a positive integer.',
    );
  }
  if (!isFiniteDate(signal.observedAt) || !isFiniteDate(evaluatedAt)) {
    throw new RangeError('Trust signal times must be valid date-times.');
  }

  const ageSeconds = Math.max(
    0,
    Math.floor((evaluatedAt.getTime() - signal.observedAt.getTime()) / 1000),
  );
  const remainingSeconds = Math.max(
    0,
    TRUST_SIGNAL_RETENTION_SECONDS - ageSeconds,
  );
  return Math.floor(
    (signal.basePoints * remainingSeconds) / TRUST_SIGNAL_RETENTION_SECONDS,
  );
}

export function reviewBandForScore(score: number): TrustReviewBand {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Trust score must be an integer from 0 through 100.');
  }
  if (score >= 75) return 'urgent_review';
  if (score >= 50) return 'review_required';
  if (score >= 25) return 'observe';
  return 'normal';
}

function categoryForSignal(
  type: TrustSignalType,
): 'movement' | 'submission' | 'opponent' {
  if (type === 'impossible_movement') return 'movement';
  if (
    type === 'idempotency_payload_conflict' ||
    type === 'submission_conflict_pattern'
  ) {
    return 'submission';
  }
  return 'opponent';
}

function validateSignal(signal: TrustScoreSignal): void {
  if (!signal.id || !isFiniteDate(signal.observedAt)) {
    throw new RangeError('Trust score signals require an id and valid time.');
  }
  if (!Number.isInteger(signal.basePoints) || signal.basePoints <= 0) {
    throw new RangeError(
      'Trust signal base points must be a positive integer.',
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isFiniteDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
