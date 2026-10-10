import type { LocationClaim } from '../browser-location';
import type { OfflinePack } from './store';

export function offlineDistanceMetres(
  location: Pick<LocationClaim, 'latitude' | 'longitude'>,
  event: Pick<OfflinePack['event'], 'latitude' | 'longitude'>,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(event.latitude - location.latitude);
  const longitude = radians(event.longitude - location.longitude);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(location.latitude)) *
      Math.cos(radians(event.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** An early usability check; the server still verifies every saved claim. */
export function checkOfflineLocation(
  location: LocationClaim,
  event: OfflinePack['event'],
  starting: boolean,
) {
  if (
    !Number.isFinite(location.accuracyMetres) ||
    location.accuracyMetres < 0 ||
    location.accuracyMetres > Math.min(150, 2 * event.radiusMetres)
  ) {
    throw new Error(
      'Your location is too imprecise for this event. Your answers are kept; move to an open area and retry location.',
    );
  }
  const distance = offlineDistanceMetres(location, event);
  if (
    !Number.isFinite(distance) ||
    (starting && distance > event.radiusMetres)
  ) {
    throw new Error(
      `Move within ${event.radiusMetres} metres of this event before starting its saved challenge.`,
    );
  }
}
