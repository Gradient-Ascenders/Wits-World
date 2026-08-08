export interface LocationClaim {
  accuracyMetres: number;
  acquiredAt: string;
  latitude: number;
  longitude: number;
}

export type BrowserLocationFailure =
  'denied' | 'timeout' | 'unavailable' | 'unsupported';

export class BrowserLocationError extends Error {
  public constructor(public readonly failure: BrowserLocationFailure) {
    super('The browser could not provide a usable location.');
    this.name = 'BrowserLocationError';
  }
}

export type LocationClaimProvider = () => Promise<LocationClaim>;

const LOCATION_TIMEOUT_MS = 10_000;

export function requestBrowserLocation(): Promise<LocationClaim> {
  if (!('geolocation' in navigator) || navigator.geolocation === undefined) {
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
