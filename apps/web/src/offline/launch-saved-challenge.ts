import {
  requestBrowserLocation,
  type LocationClaim,
} from '../browser-location';
import { checkOfflineLocation } from './location';
import {
  createLocalAttempt,
  OFFLINE_ARRIVAL_WINDOW_MS,
  type CachedPack,
} from './store';

/** Shared by Explore and Saved play; never bypasses the signed pack's policy. */
export async function launchSavedChallenge({
  cached,
  arrival,
  acquireLocation = requestBrowserLocation,
  signal,
  onSaving,
}: {
  cached: CachedPack;
  arrival?: LocationClaim | null;
  acquireLocation?: () => Promise<LocationClaim>;
  signal: AbortSignal;
  onSaving?: () => void;
}) {
  const maximumAge =
    cached.pack.locationPolicy === 'arrival-v1'
      ? OFFLINE_ARRIVAL_WINDOW_MS
      : 105_000;
  const validFrom =
    cached.pack.locationPolicy === 'arrival-v1'
      ? cached.pack.validFrom
      : undefined;
  let reusable = false;
  if (arrival) {
    try {
      checkOfflineLocation(arrival, cached.pack.event, true, {
        maxAgeMs: maximumAge,
        validFrom,
      });
      reusable =
        Date.parse(arrival.acquiredAt) >= Date.parse(cached.pack.validFrom);
    } catch {
      /* Acquire a fresh reading. */
    }
  }
  const claim = reusable && arrival ? arrival : await acquireLocation();
  signal.throwIfAborted();
  checkOfflineLocation(claim, cached.pack.event, true, {
    maxAgeMs: reusable ? maximumAge : undefined,
    validFrom,
  });
  onSaving?.();
  const attempt = await createLocalAttempt(cached, claim);
  signal.throwIfAborted();
  return attempt;
}
