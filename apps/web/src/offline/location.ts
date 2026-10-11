import { BrowserLocationError, type LocationClaim } from '../browser-location';
import type { OfflinePack } from './store';

export const OFFLINE_LOCATION_MAX_AGE_MS = 120_000;

export class OfflineLocationError extends Error {
  constructor(
    public readonly reason:
      | 'coordinates'
      | 'accuracy'
      | 'range'
      | 'stale'
      | 'future'
      | 'before-event'
      | 'sequence',
    message: string,
  ) {
    super(message);
    this.name = 'OfflineLocationError';
  }
}

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
  {
    now = Date.now(),
    maxAgeMs = OFFLINE_LOCATION_MAX_AGE_MS,
    validFrom,
    previousAcquiredAt,
  }: {
    now?: number;
    maxAgeMs?: number;
    validFrom?: string;
    previousAcquiredAt?: string;
  } = {},
) {
  if (
    !Number.isFinite(location.latitude) ||
    Math.abs(location.latitude) > 90 ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.longitude) > 180
  ) {
    throw new OfflineLocationError(
      'coordinates',
      'The browser returned invalid coordinates. Request your location again.',
    );
  }
  const acquired = Date.parse(location.acquiredAt);
  const age = now - acquired;
  if (!Number.isFinite(age) || age > maxAgeMs) {
    throw new OfflineLocationError(
      'stale',
      'This location reading is too old. Request a fresh location and try again.',
    );
  }
  if (age < 0) {
    throw new OfflineLocationError(
      'future',
      'The location reading is ahead of the device clock. Check automatic date and time, then retry location.',
    );
  }
  if (validFrom && acquired < Date.parse(validFrom)) {
    throw new OfflineLocationError(
      'before-event',
      'This location was recorded before the event opened. Request a fresh location and try again.',
    );
  }
  if (previousAcquiredAt && acquired < Date.parse(previousAcquiredAt)) {
    throw new OfflineLocationError(
      'sequence',
      'This location predates your arrival reading. Request a fresh location and try again.',
    );
  }
  const maximumAccuracy = Math.min(150, 2 * event.radiusMetres);
  if (
    !Number.isFinite(location.accuracyMetres) ||
    location.accuracyMetres < 0 ||
    location.accuracyMetres > maximumAccuracy
  ) {
    throw new OfflineLocationError(
      'accuracy',
      `Your location is too imprecise for this event. Reported accuracy must be ${maximumAccuracy} metres or better${Number.isFinite(location.accuracyMetres) && location.accuracyMetres >= 0 ? `; this reading reports ${Math.ceil(location.accuracyMetres)} metres` : ''}. Move to an open area and retry location.`,
    );
  }
  const distance = offlineDistanceMetres(location, event);
  if (
    !Number.isFinite(distance) ||
    (starting && distance > event.radiusMetres)
  ) {
    throw new OfflineLocationError(
      'range',
      `Move within ${event.radiusMetres} metres of this event before starting its saved challenge. This reading is about ${Math.round(distance)} metres away.`,
    );
  }
}

export function offlineLocationMessage(error: Error): string {
  if (!(error instanceof BrowserLocationError)) return error.message;
  switch (error.failure) {
    case 'denied':
      return 'Location access is denied. Allow location access in your browser settings, then try again.';
    case 'timeout':
      return 'Your reported location took too long. Move to an open area and try again.';
    case 'unsupported':
      return 'This browser cannot provide location. Use a browser with location support.';
    case 'blocked':
      return 'Location is blocked in this browser. Check the site permissions before trying again.';
    case 'unavailable':
      return 'Your reported location is unavailable. Check that location services are on and try again.';
  }
}
