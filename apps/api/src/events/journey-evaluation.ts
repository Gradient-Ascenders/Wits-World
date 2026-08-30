export interface JourneyEvaluationInput {
  distanceMetres: number;
  previousAccuracyMetres: number;
  currentAccuracyMetres: number;
  previousReceivedAt: Date;
  currentReceivedAt: Date;
  maxPlausibleSpeedMetresPerSecond: number;
}

export interface JourneyEvaluationResult {
  outcome: 'plausible' | 'too_fast';
  distanceMetres: number;
  uncertaintyAdjustedDistanceMetres: number;
  elapsedMilliseconds: number;
  requiredSpeedMetresPerSecond: number | null;
  maxPlausibleSpeedMetresPerSecond: number;
}

export class InvalidJourneyEvaluationError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJourneyEvaluationError';
  }
}

export function evaluateJourney(
  input: JourneyEvaluationInput,
): JourneyEvaluationResult {
  validateNonNegativeFinite(input.distanceMetres, 'Distance');
  validateNonNegativeFinite(
    input.previousAccuracyMetres,
    'Previous reported accuracy',
  );
  validateNonNegativeFinite(
    input.currentAccuracyMetres,
    'Current reported accuracy',
  );

  if (
    !Number.isFinite(input.maxPlausibleSpeedMetresPerSecond) ||
    input.maxPlausibleSpeedMetresPerSecond <= 0
  ) {
    throw new InvalidJourneyEvaluationError(
      'Maximum plausible journey speed must be a finite number greater than zero.',
    );
  }

  const previousReceivedAt = input.previousReceivedAt.getTime();
  const currentReceivedAt = input.currentReceivedAt.getTime();

  if (
    !Number.isFinite(previousReceivedAt) ||
    !Number.isFinite(currentReceivedAt)
  ) {
    throw new InvalidJourneyEvaluationError(
      'Journey receipt timestamps must be valid date-times.',
    );
  }

  const elapsedMilliseconds = Math.max(
    0,
    currentReceivedAt - previousReceivedAt,
  );
  const uncertaintyAdjustedDistanceMetres = Math.max(
    0,
    input.distanceMetres -
      input.previousAccuracyMetres -
      input.currentAccuracyMetres,
  );
  const requiredSpeedMetresPerSecond =
    elapsedMilliseconds === 0
      ? null
      : uncertaintyAdjustedDistanceMetres / (elapsedMilliseconds / 1_000);
  const outcome =
    uncertaintyAdjustedDistanceMetres === 0 ||
    (requiredSpeedMetresPerSecond !== null &&
      requiredSpeedMetresPerSecond <= input.maxPlausibleSpeedMetresPerSecond)
      ? 'plausible'
      : 'too_fast';

  return {
    outcome,
    distanceMetres: input.distanceMetres,
    uncertaintyAdjustedDistanceMetres,
    elapsedMilliseconds,
    requiredSpeedMetresPerSecond,
    maxPlausibleSpeedMetresPerSecond: input.maxPlausibleSpeedMetresPerSecond,
  };
}

function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidJourneyEvaluationError(
      `${label} must be a finite non-negative number.`,
    );
  }
}
