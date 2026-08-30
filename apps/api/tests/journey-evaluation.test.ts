import { describe, expect, it } from 'vitest';

import {
  evaluateJourney,
  InvalidJourneyEvaluationError,
} from '../src/events/journey-evaluation.js';

const PREVIOUS_RECEIVED_AT = new Date('2026-08-30T10:00:00.000Z');
const CURRENT_RECEIVED_AT = new Date('2026-08-30T10:00:10.000Z');

describe('journey evaluation', () => {
  it('subtracts both reported accuracy envelopes from the travel distance', () => {
    expect(
      evaluateJourney(
        validInput({
          distanceMetres: 120,
          previousAccuracyMetres: 10,
          currentAccuracyMetres: 20,
        }),
      ),
    ).toMatchObject({
      outcome: 'plausible',
      uncertaintyAdjustedDistanceMetres: 90,
      requiredSpeedMetresPerSecond: 9,
    });
  });

  it('accepts the exact configured speed boundary', () => {
    expect(
      evaluateJourney(
        validInput({
          distanceMetres: 120,
          previousAccuracyMetres: 10,
          currentAccuracyMetres: 10,
        }),
      ).outcome,
    ).toBe('plausible');
  });

  it('rejects a journey just above the configured speed boundary', () => {
    expect(
      evaluateJourney(
        validInput({
          distanceMetres: 120.001,
          previousAccuracyMetres: 10,
          currentAccuracyMetres: 10,
        }),
      ).outcome,
    ).toBe('too_fast');
  });

  it('accepts zero adjusted distance at zero elapsed server time', () => {
    expect(
      evaluateJourney(
        validInput({
          distanceMetres: 20,
          currentReceivedAt: PREVIOUS_RECEIVED_AT,
        }),
      ),
    ).toMatchObject({
      outcome: 'plausible',
      elapsedMilliseconds: 0,
      requiredSpeedMetresPerSecond: null,
      uncertaintyAdjustedDistanceMetres: 0,
    });
  });

  it('rejects positive adjusted distance at zero elapsed server time', () => {
    expect(
      evaluateJourney(
        validInput({
          distanceMetres: 20.001,
          currentReceivedAt: PREVIOUS_RECEIVED_AT,
          previousAccuracyMetres: 0,
          currentAccuracyMetres: 0,
        }),
      ).outcome,
    ).toBe('too_fast');
  });

  it('does not allow negative server elapsed time to create an allowance', () => {
    expect(
      evaluateJourney(
        validInput({
          currentReceivedAt: new Date('2026-08-30T09:59:59.000Z'),
        }),
      ),
    ).toMatchObject({
      outcome: 'too_fast',
      elapsedMilliseconds: 0,
    });
  });

  it.each([
    ['distanceMetres', Number.NaN],
    ['previousAccuracyMetres', -1],
    ['currentAccuracyMetres', Number.POSITIVE_INFINITY],
    ['maxPlausibleSpeedMetresPerSecond', 0],
  ] as const)('rejects invalid %s', (field, value) => {
    expect(() => evaluateJourney(validInput({ [field]: value }))).toThrow(
      InvalidJourneyEvaluationError,
    );
  });
});

function validInput(
  overrides: Partial<Parameters<typeof evaluateJourney>[0]> = {},
): Parameters<typeof evaluateJourney>[0] {
  return {
    distanceMetres: 120,
    previousAccuracyMetres: 10,
    currentAccuracyMetres: 10,
    previousReceivedAt: PREVIOUS_RECEIVED_AT,
    currentReceivedAt: CURRENT_RECEIVED_AT,
    maxPlausibleSpeedMetresPerSecond: 10,
    ...overrides,
  };
}
