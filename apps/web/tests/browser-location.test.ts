import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserLocationError,
  requestBrowserLocation,
} from '../src/browser-location';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('browser location claims', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEV_GEO_LAT', '');
    vi.stubEnv('VITE_DEV_GEO_LNG', '');
    vi.stubEnv('VITE_DEV_GEO_ACCURACY', '');
  });

  it('uses configured development coordinates without calling browser geolocation', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubEnv('VITE_DEV_GEO_LAT', '-33.9249');
    vi.stubEnv('VITE_DEV_GEO_LNG', '18.4241');
    vi.stubEnv('VITE_DEV_GEO_ACCURACY', '10');
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    await expect(requestBrowserLocation()).resolves.toMatchObject({
      accuracyMetres: 10,
      latitude: -33.9249,
      longitude: 18.4241,
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('requests a fresh high-accuracy position after invocation', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(createPosition());
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    await expect(requestBrowserLocation()).resolves.toEqual({
      accuracyMetres: 12,
      acquiredAt: '2026-08-08T10:30:00.000Z',
      latitude: -26.19205,
      longitude: 28.03038,
    });

    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );
  });

  it('uses browser geolocation outside development even when override values exist', async () => {
    const browserPosition = createPosition({
      coords: {
        accuracy: 7,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 1,
        longitude: 2,
        speed: null,
        toJSON: vi.fn(),
      },
      timestamp: Date.parse('2026-08-08T11:00:00.000Z'),
    });
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(browserPosition);
    });
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEV_GEO_LAT', '-33.9249');
    vi.stubEnv('VITE_DEV_GEO_LNG', '18.4241');
    vi.stubEnv('VITE_DEV_GEO_ACCURACY', '10');
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    await expect(requestBrowserLocation()).resolves.toEqual({
      accuracyMetres: 7,
      acquiredAt: '2026-08-08T11:00:00.000Z',
      latitude: 1,
      longitude: 2,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('maps geolocation error code %s to %s', async (code, failure) => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_success: PositionCallback, error: PositionErrorCallback) => {
            error({ code } as GeolocationPositionError);
          },
        ),
      },
    });

    await expect(requestBrowserLocation()).rejects.toMatchObject({ failure });
  });

  it('reports an unsupported browser without requesting anything', async () => {
    vi.stubGlobal('navigator', {});

    await expect(requestBrowserLocation()).rejects.toEqual(
      new BrowserLocationError('unsupported'),
    );
  });

  it('rejects invalid browser position values as unavailable', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(
            createPosition({
              coords: { ...createPosition().coords, accuracy: -1 },
            }),
          );
        }),
      },
    });

    await expect(requestBrowserLocation()).rejects.toMatchObject({
      failure: 'unavailable',
    });
  });
});

function createPosition(
  overrides: Partial<GeolocationPosition> = {},
): GeolocationPosition {
  return {
    ...overrides,
    coords: overrides.coords ?? {
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: -26.19205,
      longitude: 28.03038,
      speed: null,
      toJSON: vi.fn(),
    },
    timestamp: overrides.timestamp ?? Date.parse('2026-08-08T10:30:00.000Z'),
    toJSON: overrides.toJSON ?? vi.fn(),
  };
}
