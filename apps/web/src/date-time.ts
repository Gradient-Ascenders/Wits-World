/** Campus time is independent of the player's device timezone. */
export const APP_TIME_ZONE = 'Africa/Johannesburg';

export function createAppDateTimeFormatter(
  locales: Intl.LocalesArgument | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locales, {
    ...options,
    timeZone: APP_TIME_ZONE,
  });
}

const inputFormatter = createAppDateTimeFormatter('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Convert an API instant to the wall-clock value used by datetime-local. */
export function toAppDateTimeLocal(value: string): string {
  const parts = Object.fromEntries(
    inputFormatter
      .formatToParts(new Date(value))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Modern Johannesburg schedules use SAST (UTC+02:00), with no DST. */
export function parseAppDateTimeLocal(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(NaN);
  const date = new Date(`${value}+02:00`);
  if (
    !Number.isFinite(date.getTime()) ||
    toAppDateTimeLocal(date.toISOString()) !== value
  ) {
    return new Date(NaN);
  }
  return date;
}

export function appCalendarDateBoundary(
  value: string,
  edge: 'start' | 'end',
): string | undefined {
  if (!value) return undefined;
  const start = parseAppDateTimeLocal(`${value}T00:00`);
  return new Date(
    start.getTime() + (edge === 'end' ? 86_400_000 - 1 : 0),
  ).toISOString();
}
