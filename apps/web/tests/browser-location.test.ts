import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserLocationError,
  getBrowserLocationPermission,
  observeBrowserLocation,
  requestBrowserLocation,
} from '../src/browser-location';

afterEach(() => {
  vi.useRealTimers();
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

  it('bounds a browser that never calls back and ignores its late result after retry', async () => {
    vi.useFakeTimers();
    let lateSuccess!: PositionCallback;
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((success: PositionCallback) => {
        lateSuccess = success;
      })
      .mockImplementationOnce((success: PositionCallback) => {
        success(createPosition());
      });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const stalled = requestBrowserLocation();
    const rejected = expect(stalled).rejects.toMatchObject({
      failure: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    await expect(requestBrowserLocation()).resolves.toMatchObject({
      accuracyMetres: 12,
    });
    lateSuccess(createPosition());
    expect(vi.getTimerCount()).toBe(0);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('cancels a location request and ignores late callbacks', async () => {
    vi.useFakeTimers();
    let lateSuccess!: PositionCallback;
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          lateSuccess = success;
        }),
      },
    });
    const controller = new AbortController();
    const request = requestBrowserLocation(controller.signal);
    const rejected = expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await rejected;
    lateSuccess(createPosition());
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      requestBrowserLocation(controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('cleans up the deadline when geolocation throws synchronously', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(() => {
          throw new Error('Blocked');
        }),
      },
    });
    await expect(requestBrowserLocation()).rejects.toMatchObject({
      failure: 'blocked',
    });
    expect(vi.getTimerCount()).toBe(0);
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

describe('live browser location observation', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEV_GEO_LAT', '');
    vi.stubEnv('VITE_DEV_GEO_LNG', '');
    vi.stubEnv('VITE_DEV_GEO_ACCURACY', '');
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
  });

  it('uses one high-accuracy watcher and clears it exactly once', () => {
    let success: PositionCallback = () => undefined;
    const watchPosition = vi.fn((nextSuccess: PositionCallback) => {
      success = nextSuccess;
      return 42;
    });
    const clearWatch = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: { clearWatch, watchPosition },
    });
    const onLocation = vi.fn();
    const stop = observeBrowserLocation({ onError: vi.fn(), onLocation });

    success(createPosition());
    expect(onLocation).toHaveBeenCalledWith({
      accuracyMetres: 12,
      acquiredAt: '2026-08-08T10:30:00.000Z',
      latitude: -26.19205,
      longitude: 28.03038,
    });
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );

    stop();
    stop();
    expect(clearWatch).toHaveBeenCalledOnce();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it('maps watcher failures and rejects invalid updates', () => {
    let success: PositionCallback = () => undefined;
    let failure: PositionErrorCallback = () => undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        clearWatch: vi.fn(),
        watchPosition: vi.fn(
          (
            nextSuccess: PositionCallback,
            nextFailure: PositionErrorCallback,
          ) => {
            success = nextSuccess;
            failure = nextFailure;
            return 1;
          },
        ),
      },
    });
    const onError = vi.fn();
    observeBrowserLocation({ onError, onLocation: vi.fn() });

    success(
      createPosition({ coords: { ...createPosition().coords, latitude: 100 } }),
    );
    failure({ code: 3 } as GeolocationPositionError);
    expect(onError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ failure: 'unavailable' }),
    );
    expect(onError).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ failure: 'timeout' }),
    );
  });

  it('reads granted, denied, and prompt permission without prompting', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' });
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: { query },
    });
    await expect(getBrowserLocationPermission()).resolves.toBe('granted');
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
  });

  it('falls back to unknown when permission state cannot be pre-read', async () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    await expect(getBrowserLocationPermission()).resolves.toBe('unknown');
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
