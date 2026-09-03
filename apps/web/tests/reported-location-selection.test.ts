import { describe, expect, it } from 'vitest';

import type { LocationClaim } from '../src/browser-location';
import { selectReportedLocation } from '../src/reported-location-selection';

function claim(
  acquiredAt: string,
  accuracyMetres: number,
  latitude = -26.19205,
): LocationClaim {
  return {
    accuracyMetres,
    acquiredAt,
    latitude,
    longitude: 28.03038,
  };
}

describe('reported location selection', () => {
  it('does not replace a recent accurate fix with a degraded callback', () => {
    const accurate = claim('2026-09-03T10:00:00.000Z', 8);
    const degraded = claim('2026-09-03T10:00:02.000Z', 60, -26.1915);

    const result = selectReportedLocation([accurate], degraded);

    expect(result.selected).toBe(accurate);
  });

  it('prefers a similarly accurate newer fix so normal movement remains live', () => {
    const previous = claim('2026-09-03T10:00:00.000Z', 10);
    const newer = claim('2026-09-03T10:00:02.000Z', 11, -26.1919);

    const result = selectReportedLocation([previous], newer);

    expect(result.selected).toBe(newer);
  });

  it('expires old fixes instead of retaining the best reading indefinitely', () => {
    const old = claim('2026-09-03T10:00:00.000Z', 3);
    const current = claim('2026-09-03T10:00:11.000Z', 35, -26.1917);

    const result = selectReportedLocation([old], current);

    expect(result.samples).toEqual([current]);
    expect(result.selected).toBe(current);
  });
});
