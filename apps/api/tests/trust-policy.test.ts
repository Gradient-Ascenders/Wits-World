import { describe, expect, it } from 'vitest';

import {
  calculateTrustScore,
  effectiveSignalPoints,
  impossibleMovementSignal,
  reviewBandForScore,
  TRUST_SIGNAL_RETENTION_SECONDS,
  type TrustScoreSignal,
} from '../src/trust/trust-policy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const evaluation = new Date('2026-09-19T00:00:00.000Z');

function signal(
  id: string,
  signalType: TrustScoreSignal['signalType'],
  basePoints: number,
  ageDays = 0,
  adjustedFalsePositive = false,
): TrustScoreSignal {
  return {
    id,
    signalType,
    basePoints,
    observedAt: new Date(evaluation.getTime() - ageDays * DAY_MS),
    adjustedFalsePositive,
  };
}

describe('trust-v1 policy', () => {
  it('classifies impossible movement at the documented threshold', () => {
    expect(impossibleMovementSignal(10.1, 10)).toEqual({
      severity: 'moderate',
      basePoints: 15,
    });
    expect(impossibleMovementSignal(20, 10)).toEqual({
      severity: 'moderate',
      basePoints: 15,
    });
    expect(impossibleMovementSignal(20.0001, 10)).toEqual({
      severity: 'strong',
      basePoints: 25,
    });
  });

  it('decays linearly with an integer floor and reaches zero at 90 days', () => {
    expect(
      effectiveSignalPoints(
        { basePoints: 20, observedAt: evaluation },
        evaluation,
      ),
    ).toBe(20);
    expect(
      effectiveSignalPoints(
        {
          basePoints: 20,
          observedAt: new Date(evaluation.getTime() - 45 * DAY_MS),
        },
        evaluation,
      ),
    ).toBe(10);
    expect(
      effectiveSignalPoints(
        {
          basePoints: 25,
          observedAt: new Date(evaluation.getTime() - 45 * DAY_MS),
        },
        evaluation,
      ),
    ).toBe(12);
    expect(
      effectiveSignalPoints(
        {
          basePoints: 20,
          observedAt: new Date(
            evaluation.getTime() - TRUST_SIGNAL_RETENTION_SECONDS * 1000,
          ),
        },
        evaluation,
      ),
    ).toBe(0);
  });

  it('keeps weak opponent evidence below a severe review band on its own', () => {
    const result = calculateTrustScore({
      evaluatedAt: evaluation,
      signals: [
        signal('o1', 'opponent_concentration', 20),
        signal('o2', 'one_sided_outcome_pattern', 10),
      ],
    });

    expect(result).toMatchObject({
      opponentPatternPoints: 30,
      finalScore: 30,
      reviewBand: 'observe',
    });
  });

  it('applies category caps before the 100 point final cap', () => {
    const signals = [
      signal('m1', 'impossible_movement', 25),
      signal('m2', 'impossible_movement', 25),
      signal('m3', 'impossible_movement', 25),
      signal('s1', 'idempotency_payload_conflict', 10),
      signal('s2', 'idempotency_payload_conflict', 10),
      signal('s3', 'idempotency_payload_conflict', 10),
      signal('s4', 'submission_conflict_pattern', 10),
      signal('o1', 'opponent_concentration', 20),
      signal('o2', 'opponent_concentration', 20),
      signal('o3', 'one_sided_outcome_pattern', 10),
    ];

    const result = calculateTrustScore({ evaluatedAt: evaluation, signals });
    expect(result).toMatchObject({
      movementPoints: 50,
      submissionConflictPoints: 30,
      opponentPatternPoints: 30,
      finalScore: 100,
      reviewBand: 'urgent_review',
    });
  });

  it('ignores reviewed false positives without deleting the source signal', () => {
    const result = calculateTrustScore({
      evaluatedAt: evaluation,
      signals: [
        signal('a', 'impossible_movement', 25, 0, true),
        signal('b', 'idempotency_payload_conflict', 10),
      ],
    });
    expect(result.finalScore).toBe(10);
    expect(result.sourceSignalCount).toBe(1);
  });

  it('is deterministic regardless of evidence ordering', () => {
    const signals = [
      signal('b', 'idempotency_payload_conflict', 10),
      signal('a', 'impossible_movement', 25),
    ];
    const first = calculateTrustScore({ evaluatedAt: evaluation, signals });
    const second = calculateTrustScore({
      evaluatedAt: evaluation,
      signals: [...signals].reverse(),
    });
    expect(second.finalScore).toBe(first.finalScore);
    expect(second.calculationDigest.equals(first.calculationDigest)).toBe(true);
  });

  it('maps all documented band boundaries', () => {
    expect(reviewBandForScore(0)).toBe('normal');
    expect(reviewBandForScore(24)).toBe('normal');
    expect(reviewBandForScore(25)).toBe('observe');
    expect(reviewBandForScore(49)).toBe('observe');
    expect(reviewBandForScore(50)).toBe('review_required');
    expect(reviewBandForScore(74)).toBe('review_required');
    expect(reviewBandForScore(75)).toBe('urgent_review');
    expect(reviewBandForScore(100)).toBe('urgent_review');
  });
});
