export const PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS = 120_000;

export type LocationRetryReason =
  'future_acquisition_time' | 'stale_location' | 'location_accuracy';

export type LocationTimingResult =
  | {
      outcome: 'valid';
    }
  | {
      outcome: 'retry';
      reason: 'future_acquisition_time' | 'stale_location';
    };

export type ReachabilityResult =
  | {
      status: 'reachable';
      reachable: true;
    }
  | {
      status: 'unreachable';
      reachable: false;
    }
  | {
      status: 'retry';
      reachable: null;
      reason: 'location_accuracy';
    };

export class InvalidLocationClaimError extends RangeError {
  constructor(
    public readonly field: 'accuracyMetres' | 'acquiredAt',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidLocationClaimError';
  }
}

export function evaluateLocationTiming(
  acquiredAt: string,
  receivedAt: Date,
  maxAgeMs = PROVISIONAL_MAX_LOCATION_CLAIM_AGE_MS,
): LocationTimingResult {
  const acquiredAtMilliseconds = Date.parse(acquiredAt);

  if (!Number.isFinite(acquiredAtMilliseconds)) {
    throw new InvalidLocationClaimError(
      'acquiredAt',
      'Acquisition timestamp must be a valid date-time.',
    );
  }

  const ageMilliseconds = receivedAt.getTime() - acquiredAtMilliseconds;

  if (ageMilliseconds < 0) {
    return {
      outcome: 'retry',
      reason: 'future_acquisition_time',
    };
  }

  if (ageMilliseconds > maxAgeMs) {
    return {
      outcome: 'retry',
      reason: 'stale_location',
    };
  }

  return {
    outcome: 'valid',
  };
}

export function evaluateReachabilityWithAccuracy(
  distanceMetres: number,
  radiusMetres: number,
  accuracyMetres: number,
): ReachabilityResult {
  if (!Number.isFinite(accuracyMetres) || accuracyMetres < 0) {
    throw new InvalidLocationClaimError(
      'accuracyMetres',
      'Reported accuracy must be a finite non-negative number.',
    );
  }

  if (distanceMetres + accuracyMetres <= radiusMetres) {
    return {
      status: 'reachable',
      reachable: true,
    };
  }

  if (distanceMetres - accuracyMetres > radiusMetres) {
    return {
      status: 'unreachable',
      reachable: false,
    };
  }

  return {
    status: 'retry',
    reachable: null,
    reason: 'location_accuracy',
  };
}
