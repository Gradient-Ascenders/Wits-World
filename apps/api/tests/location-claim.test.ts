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
  it.each([
    [20, 75, 10, 'reachable'],
    [70, 75, 150, 'reachable'],
    [75, 75, 150, 'reachable'],
    [75.01, 75, 150, 'unreachable'],
    [110, 75, 10, 'unreachable'],
    [0, 75, 150.01, 'retry'],
    [110, 75, 150.01, 'retry'],
    [25, 25, 50, 'reachable'],
    [25, 25, 50.01, 'retry'],
    [100, 100, 150, 'reachable'],
    [100, 100, 150.01, 'retry'],
    [75, 75, 0, 'reachable'],
  ] as const)(
    'classifies distance %s, radius %s, accuracy %s as %s',
    (distance, radius, accuracy, status) => {
      expect(
        evaluateReachabilityWithAccuracy(distance, radius, accuracy),
      ).toEqual(
        status === 'retry'
          ? { status, reachable: null, reason: 'location_accuracy' }
          : { status, reachable: status === 'reachable' },
      );
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid reported accuracy %s',
    (accuracyMetres) => {
      expect(() =>
        evaluateReachabilityWithAccuracy(20, 75, accuracyMetres),
      ).toThrow(InvalidLocationClaimError);
    },
  );
});
