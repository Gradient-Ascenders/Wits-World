import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserLocationError,
  requestBrowserLocation,
} from '../src/browser-location';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser location claims', () => {
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
