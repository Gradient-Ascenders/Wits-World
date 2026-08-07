import { describe, expect, it } from 'vitest';

import {
  evaluateLocationTiming,
  evaluateReachabilityWithAccuracy,
  InvalidLocationClaimError,
} from '../src/events/location-claim.js';

describe('location claim timing', () => {
  const receivedAt = new Date('2026-08-10T12:00:00.000Z');

  it('accepts a fresh claim', () => {
    expect(
      evaluateLocationTiming('2026-08-10T11:59:30.000Z', receivedAt, 120_000),
    ).toEqual({
      outcome: 'valid',
    });
  });

  it('returns retry for a stale claim', () => {
    expect(
      evaluateLocationTiming('2026-08-10T11:57:59.000Z', receivedAt, 120_000),
    ).toEqual({
      outcome: 'retry',
      reason: 'stale_location',
    });
  });

  it('returns retry for a future claim', () => {
    expect(
      evaluateLocationTiming('2026-08-10T12:00:01.000Z', receivedAt, 120_000),
    ).toEqual({
      outcome: 'retry',
      reason: 'future_acquisition_time',
    });
  });

  it('rejects a malformed timestamp', () => {
    expect(() =>
      evaluateLocationTiming('not-a-date', receivedAt, 120_000),
    ).toThrow(InvalidLocationClaimError);
  });
});

describe('accuracy-aware reachability', () => {
  it('is reachable when the whole accuracy envelope fits inside the radius', () => {
    expect(evaluateReachabilityWithAccuracy(20, 75, 10)).toEqual({
      status: 'reachable',
      reachable: true,
    });
  });

  it('is unreachable when the whole accuracy envelope is outside the radius', () => {
    expect(evaluateReachabilityWithAccuracy(110, 75, 10)).toEqual({
      status: 'unreachable',
      reachable: false,
    });
  });

  it('returns retry when the accuracy envelope crosses the event boundary', () => {
    expect(evaluateReachabilityWithAccuracy(70, 75, 10)).toEqual({
      status: 'retry',
      reachable: null,
      reason: 'location_accuracy',
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid reported accuracy %s',
    (accuracyMetres) => {
      expect(() =>
        evaluateReachabilityWithAccuracy(20, 75, accuracyMetres),
      ).toThrow(InvalidLocationClaimError);
    },
  );
});
