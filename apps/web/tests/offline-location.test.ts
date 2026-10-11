import { describe, expect, it } from 'vitest';
import {
  BrowserLocationError,
  type LocationClaim,
} from '../src/browser-location';
import {
  checkOfflineLocation,
  offlineDistanceMetres,
  offlineLocationMessage,
  OfflineLocationError,
} from '../src/offline/location';

const now = Date.parse('2026-10-11T10:00:00Z');
const event = {
  eventId: 'event',
  version: 1,
  title: 'Great Hall',
  description: null,
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 60,
};
const position: LocationClaim = {
  latitude: event.latitude,
  longitude: event.longitude,
  accuracyMetres: 10,
  acquiredAt: new Date(now).toISOString(),
};

function reason(claim: LocationClaim, starting = true, options = {}) {
  try {
    checkOfflineLocation(claim, event, starting, { now, ...options });
  } catch (error) {
    if (error instanceof OfflineLocationError) return error.reason;
    throw error;
  }
  return 'valid';
}

describe('offline location policy parity', () => {
  it.each([0, 10, 120])(
    'accepts exact coordinates with reported accuracy %s',
    (accuracyMetres) => {
      expect(offlineDistanceMetres(position, event)).toBe(0);
      expect(reason({ ...position, accuracyMetres })).toBe('valid');
    },
  );
  it('distinguishes uncertainty from range and reports the actual accuracy ceiling', () => {
    const imprecise = { ...position, accuracyMetres: 149 };
    expect(reason(imprecise)).toBe('accuracy');
    expect(() => checkOfflineLocation(imprecise, event, true, { now })).toThrow(
      '120 metres or better; this reading reports 149 metres',
    );
    expect(reason({ ...position, latitude: position.latitude + 0.01 })).toBe(
      'range',
    );
    // A legacy finish outside the arrival circle is governed by server movement checks.
    expect(
      reason({ ...position, latitude: position.latitude + 0.01 }, false),
    ).toBe('valid');
  });
  it.each([
    { latitude: NaN },
    { latitude: 91 },
    { longitude: Infinity },
    { longitude: -181 },
  ])('rejects invalid coordinates %j', (values) => {
    expect(reason({ ...position, ...values })).toBe('coordinates');
  });
  it.each([-1, NaN, Infinity])(
    'rejects invalid accuracy %s',
    (accuracyMetres) => {
      expect(reason({ ...position, accuracyMetres })).toBe('accuracy');
    },
  );
  it('checks actual acquisition time without rewriting stale or future timestamps', () => {
    expect(
      reason({
        ...position,
        acquiredAt: new Date(now - 120_000).toISOString(),
      }),
    ).toBe('valid');
    expect(
      reason({
        ...position,
        acquiredAt: new Date(now - 120_001).toISOString(),
      }),
    ).toBe('stale');
    expect(reason({ ...position, acquiredAt: 'invalid' })).toBe('stale');
    expect(
      reason({ ...position, acquiredAt: new Date(now + 1).toISOString() }),
    ).toBe('future');
    expect(
      reason(position, true, { validFrom: new Date(now + 1).toISOString() }),
    ).toBe('before-event');
    expect(
      reason(position, false, {
        previousAcquiredAt: new Date(now + 1).toISOString(),
      }),
    ).toBe('sequence');
  });
  it('permits only the signed arrival reuse window when explicitly selected', () => {
    const recorded = {
      ...position,
      acquiredAt: new Date(now - 300_000).toISOString(),
    };
    expect(reason(recorded)).toBe('stale');
    expect(
      reason(recorded, true, {
        maxAgeMs: 300_000,
        validFrom: new Date(now - 3600_000).toISOString(),
      }),
    ).toBe('valid');
    expect(
      reason(
        { ...recorded, acquiredAt: new Date(now - 300_001).toISOString() },
        true,
        { maxAgeMs: 300_000 },
      ),
    ).toBe('stale');
  });
  it.each([
    'denied',
    'timeout',
    'unavailable',
    'unsupported',
    'blocked',
  ] as const)('provides distinct recovery for %s', (failure) => {
    expect(offlineLocationMessage(new BrowserLocationError(failure))).not.toBe(
      'The browser could not provide a usable location.',
    );
  });
});
