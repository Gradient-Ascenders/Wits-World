export interface LocationClaim {
  accuracyMetres: number;
  acquiredAt: string;
  latitude: number;
  longitude: number;
}

export type BrowserLocationFailure =
  'blocked' | 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export type BrowserLocationPermission =
  'denied' | 'granted' | 'prompt' | 'unknown';

export class BrowserLocationError extends Error {
  public constructor(public readonly failure: BrowserLocationFailure) {
    super('The browser could not provide a usable location.');
    this.name = 'BrowserLocationError';
  }
}

export type LocationClaimProvider = () => Promise<LocationClaim>;

export interface LocationObservationHandlers {
  onError: (error: BrowserLocationError) => void;
  onLocation: (claim: LocationClaim) => void;
}

export type LocationObservationProvider = (
  handlers: LocationObservationHandlers,
) => () => void;

export type LocationPermissionProvider =
  () => Promise<BrowserLocationPermission>;

const LOCATION_TIMEOUT_MS = 10_000;
const LOCATION_WATCH_TIMEOUT_MS = 15_000;

export function isBrowserLocationSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'geolocation' in navigator &&
    navigator.geolocation !== undefined
  );
}

export async function getBrowserLocationPermission(): Promise<BrowserLocationPermission> {
  if (!isBrowserLocationSupported()) {
    return 'unknown';
  }

  if (navigator.permissions?.query === undefined) {
    return 'unknown';
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });

    if (
      result.state === 'denied' ||
      result.state === 'granted' ||
      result.state === 'prompt'
    ) {
      return result.state;
    }
  } catch {
    // Some browsers expose Permissions without accepting "geolocation".
  }

  return 'unknown';
}

export const observeBrowserLocation: LocationObservationProvider = ({
  onError,
  onLocation,
}) => {
  const developmentOverride = getDevelopmentLocationOverride();

  if (developmentOverride !== null) {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        onLocation(developmentOverride);
      }
    });
    return () => {
      active = false;
    };
  }

  if (!isBrowserLocationSupported()) {
    queueMicrotask(() => onError(new BrowserLocationError('unsupported')));
    return () => undefined;
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    queueMicrotask(() => onError(new BrowserLocationError('blocked')));
    return () => undefined;
  }

  let watchId: number;

  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const claim = toLocationClaim(position);

        if (claim === null) {
          onError(new BrowserLocationError('unavailable'));
          return;
        }

        onLocation(claim);
      },
      (error) => {
        onError(new BrowserLocationError(toLocationFailure(error.code)));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: LOCATION_WATCH_TIMEOUT_MS,
      },
    );
  } catch {
    queueMicrotask(() => onError(new BrowserLocationError('blocked')));
    return () => undefined;
  }

  let active = true;
  return () => {
    if (!active) {
      return;
    }

    active = false;
    navigator.geolocation.clearWatch(watchId);
  };
};

export function requestBrowserLocation(): Promise<LocationClaim> {
  const developmentOverride = getDevelopmentLocationOverride();

  if (developmentOverride !== null) {
    return Promise.resolve(developmentOverride);
  }

  if (!isBrowserLocationSupported()) {
    return Promise.reject(new BrowserLocationError('unsupported'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const claim = toLocationClaim(position);

        if (claim === null) {
          reject(new BrowserLocationError('unavailable'));
          return;
        }

        resolve(claim);
      },
      (error) => {
        reject(new BrowserLocationError(toLocationFailure(error.code)));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: LOCATION_TIMEOUT_MS,
      },
    );
  });
}

function getDevelopmentLocationOverride(): LocationClaim | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const latitude = readDevelopmentCoordinate(import.meta.env.VITE_DEV_GEO_LAT);
  const longitude = readDevelopmentCoordinate(import.meta.env.VITE_DEV_GEO_LNG);
  const accuracyMetres = readDevelopmentCoordinate(
    import.meta.env.VITE_DEV_GEO_ACCURACY,
  );

  if (
    latitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    accuracyMetres === null ||
    accuracyMetres < 0
  ) {
    return null;
  }

  return {
    accuracyMetres,
    acquiredAt: new Date().toISOString(),
    latitude,
    longitude,
  };
}

function readDevelopmentCoordinate(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toLocationClaim(position: GeolocationPosition): LocationClaim | null {
  const { accuracy, latitude, longitude } = position.coords;
  const acquiredAt = new Date(position.timestamp);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    Number.isNaN(acquiredAt.getTime())
  ) {
    return null;
  }

  return {
    accuracyMetres: accuracy,
    acquiredAt: acquiredAt.toISOString(),
    latitude,
    longitude,
  };
}

function toLocationFailure(code: number): BrowserLocationFailure {
  if (code === 1) {
    return 'denied';
  }

  if (code === 3) {
    return 'timeout';
  }

  return 'unavailable';
}
