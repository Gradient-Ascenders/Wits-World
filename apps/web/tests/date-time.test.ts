import { describe, expect, it } from 'vitest';
import {
  APP_TIME_ZONE,
  appCalendarDateBoundary,
  createAppDateTimeFormatter,
  parseAppDateTimeLocal,
  toAppDateTimeLocal,
} from '../src/date-time';

describe('campus date and time', () => {
  it('uses Johannesburg even if a caller supplies a different timezone', () => {
    const formatter = createAppDateTimeFormatter('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Los_Angeles',
    });
    expect(formatter.resolvedOptions().timeZone).toBe(APP_TIME_ZONE);
    expect(formatter.format(new Date('2026-09-30T23:30:00Z'))).toBe(
      '01/10/2026, 01:30',
    );
  });

  it.each([
    ['2026-09-30T23:30:00Z', '2026-10-01T01:30'],
    ['2026-01-01T00:00:00Z', '2026-01-01T02:00'],
    ['2026-06-01T00:00:00Z', '2026-06-01T02:00'],
    ['2028-02-28T22:00:00Z', '2028-02-29T00:00'],
  ])(
    'round trips %s through a Johannesburg scheduling input',
    (instant, input) => {
      expect(toAppDateTimeLocal(instant)).toBe(input);
      expect(parseAppDateTimeLocal(input).toISOString()).toBe(
        new Date(instant).toISOString(),
      );
    },
  );

  it.each([
    '',
    'not a date',
    '2026-02-30T10:00',
    '2026-01-01T24:00',
    '2026-01-01T00:00Z',
  ])('rejects invalid wall-clock input %s', (value) => {
    expect(Number.isNaN(parseAppDateTimeLocal(value).getTime())).toBe(true);
  });

  it('uses Johannesburg day boundaries for review filters without changing API instants', () => {
    expect(appCalendarDateBoundary('2026-10-01', 'start')).toBe(
      '2026-09-30T22:00:00.000Z',
    );
    expect(appCalendarDateBoundary('2026-10-01', 'end')).toBe(
      '2026-10-01T21:59:59.999Z',
    );
    expect(appCalendarDateBoundary('', 'start')).toBeUndefined();
  });
});
