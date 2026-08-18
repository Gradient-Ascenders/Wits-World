import {
  BrowserLocationError,
  type LocationClaimProvider,
} from '../../src/browser-location';
import type {
  MapController,
  MapFactory,
} from '../../src/components/exploration/map-provider';

const E2E_ACQUIRED_AT = '2026-08-18T10:00:00.000Z';
let mapInstance = 0;

export const locationClaimProvider: LocationClaimProvider = () =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          accuracyMetres: position.coords.accuracy,
          acquiredAt: E2E_ACQUIRED_AT,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(
          new BrowserLocationError(
            error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
          ),
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });

export const mapFactory: MapFactory = async (
  container,
  _config,
  _points,
  signal,
) => {
  if (signal.aborted) {
    throw new Error('Deterministic map creation was cancelled.');
  }

  const instanceId = `deterministic-${++mapInstance}`;
  container.dataset.mapProvider = instanceId;

  const controller: MapController = {
    onError: () => undefined,
    onLoad: (listener) => queueMicrotask(listener),
    remove: () => {
      if (container.dataset.mapProvider === instanceId) {
        delete container.dataset.mapProvider;
      }
    },
    setPoints: () => undefined,
    setReportedLocation: () => undefined,
  };

  return controller;
};
