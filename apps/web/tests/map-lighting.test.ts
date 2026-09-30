import { describe, expect, it } from 'vitest';
import { getCampusLightPreset } from '../src/components/exploration/map-lighting';

describe('Johannesburg map lighting periods', () => {
  it.each([
    ['02:59:59', 'night'], // 04:59 Johannesburg
    ['03:00:00', 'dawn'], // 05:00
    ['04:59:59', 'dawn'],
    ['05:00:00', 'day'], // 07:00
    ['14:59:59', 'day'],
    ['15:00:00', 'dusk'], // 17:00
    ['16:59:59', 'dusk'],
    ['17:00:00', 'night'], // 19:00
    ['21:59:59', 'night'],
    ['22:00:00', 'night'], // midnight
  ])('selects %s UTC as %s', (time, preset) => {
    expect(getCampusLightPreset(new Date(`2026-09-30T${time}Z`))).toBe(preset);
  });
});
