import { createAppDateTimeFormatter } from '../../date-time';

export type MapboxLightPreset = 'dawn' | 'day' | 'dusk' | 'night';

const hourFormatter = createAppDateTimeFormatter('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Fixed campus-time periods, not a seasonal sunrise/sunset calculation. */
export function getCampusLightPreset(
  now: Date = new Date(),
): MapboxLightPreset {
  const hour = Number(hourFormatter.format(now));
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}
