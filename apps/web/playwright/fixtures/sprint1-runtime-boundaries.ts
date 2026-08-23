import 'mapbox-gl/dist/mapbox-gl.css';

import {
  BrowserLocationError,
  type LocationClaimProvider,
} from '../../src/browser-location';
import type {
  MapController,
  MapFactory,
  MapPoint,
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
  initialPoints,
  signal,
) => {
  if (signal.aborted) {
    throw new Error('Deterministic map creation was cancelled.');
  }

  const instanceId = `deterministic-${++mapInstance}`;
  container.dataset.mapProvider = instanceId;
  container.classList.add('deterministic-map');
  container.style.background =
    'radial-gradient(circle at 48% 42%, rgb(42 107 255 / 30%), transparent 22%), linear-gradient(145deg, #18304f, #071426 70%)';
  let points = initialPoints;
  let selectedPoint: MapPoint | null = null;
  let pointSelectionListener: ((pointId: string) => void) | null = null;
  let followStateListener: ((following: boolean) => void) | null = null;
  let hasLocation = false;
  let following = false;
  let playerPuck: HTMLElement | null = null;

  const markerLayer = document.createElement('div');
  markerLayer.dataset.deterministicMarkers = 'true';
  const radius = document.createElement('div');
  radius.dataset.deterministicEventRadius = 'true';
  Object.assign(radius.style, {
    background: 'rgb(42 107 255 / 15%)',
    border: '2px solid #d4af37',
    borderRadius: '50%',
    display: 'none',
    height: '160px',
    left: 'calc(48% - 80px)',
    pointerEvents: 'none',
    position: 'absolute',
    top: 'calc(42% - 80px)',
    width: '160px',
  });
  container.append(radius, markerLayer);

  const logoArea = document.createElement('div');
  logoArea.className = 'mapboxgl-ctrl-bottom-left';
  const logo = document.createElement('a');
  logo.className = 'mapboxgl-ctrl-logo';
  logo.href = 'https://www.mapbox.com/';
  logo.setAttribute('aria-label', 'Mapbox logo');
  logoArea.append(logo);
  const attributionArea = document.createElement('div');
  attributionArea.className = 'mapboxgl-ctrl-bottom-right';
  const attribution = document.createElement('details');
  attribution.className = 'mapboxgl-ctrl mapboxgl-ctrl-attrib mapboxgl-compact';
  attribution.innerHTML =
    '<summary aria-label="Show map attribution">ⓘ</summary><div class="mapboxgl-ctrl-attrib-inner"><a href="https://www.mapbox.com/about/maps/">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> <a href="https://apps.mapbox.com/feedback/">Improve this map</a></div>';
  attributionArea.append(attribution);
  const navigationArea = document.createElement('div');
  navigationArea.className = 'mapboxgl-ctrl-top-right';
  const navigationGroup = document.createElement('div');
  navigationGroup.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
  for (const [label, symbol] of [
    ['Zoom in', '+'],
    ['Zoom out', '−'],
    ['Reset map bearing and pitch', '↺'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.textContent = symbol;
    navigationGroup.append(button);
  }
  navigationArea.append(navigationGroup);
  container.append(logoArea, attributionArea, navigationArea);

  const renderMarkers = (): void => {
    markerLayer.replaceChildren();
    points.forEach((point, index) => {
      const button = document.createElement('button');
      const availability = point.availability ?? 'active';
      button.type = 'button';
      button.className = [
        'event-marker',
        `event-marker--${availability}`,
        selectedPoint?.id === point.id ? 'event-marker--selected' : '',
        point.reachable ? 'event-marker--reachable' : '',
      ]
        .filter(Boolean)
        .join(' ');
      button.setAttribute(
        'aria-label',
        `Select ${point.label}, ${availability === 'active' ? 'available now' : availability}`,
      );
      button.setAttribute(
        'aria-pressed',
        String(selectedPoint?.id === point.id),
      );
      Object.assign(button.style, {
        left: `${42 + index * 12}%`,
        position: 'absolute',
        top: `${36 + (index % 2) * 13}%`,
      });
      const markerBody = document.createElement('span');
      markerBody.className = 'event-marker__body';
      markerBody.setAttribute('aria-hidden', 'true');
      const markerGlyph = document.createElement('span');
      markerGlyph.className = 'event-marker__glyph';
      markerGlyph.textContent = '✦';
      markerBody.append(markerGlyph);
      button.append(markerBody);
      button.addEventListener('click', () =>
        pointSelectionListener?.(point.id),
      );
      markerLayer.append(button);
    });
  };
  renderMarkers();

  const stopFollowingOnPan = (event: PointerEvent): void => {
    if (event.target !== container || !following) {
      return;
    }
    following = false;
    container.dataset.mapFollowing = 'false';
    followStateListener?.(false);
  };
  container.addEventListener('pointerdown', stopFollowingOnPan);

  const controller: MapController = {
    onError: () => undefined,
    onLoad: (listener) => queueMicrotask(listener),
    recenterReportedLocation: () => {
      if (!hasLocation) return false;
      following = true;
      container.dataset.mapFollowing = 'true';
      followStateListener?.(true);
      return true;
    },
    remove: () => {
      container.removeEventListener('pointerdown', stopFollowingOnPan);
      playerPuck?.remove();
      markerLayer.remove();
      radius.remove();
      logoArea.remove();
      attributionArea.remove();
      navigationArea.remove();
      if (container.dataset.mapProvider === instanceId) {
        delete container.dataset.mapProvider;
        delete container.dataset.mapFollowing;
      }
    },
    setFollowStateListener: (listener) => {
      followStateListener = listener;
      listener?.(following);
    },
    setPointSelectionListener: (listener) => {
      pointSelectionListener = listener;
    },
    setPoints: (nextPoints) => {
      points = nextPoints;
      renderMarkers();
    },
    setReportedLocation: (coordinate) => {
      hasLocation = coordinate !== null;
      if (coordinate === null) {
        playerPuck?.remove();
        playerPuck = null;
        return;
      }
      if (playerPuck === null) {
        playerPuck = document.createElement('span');
        playerPuck.className = 'reported-location-pointer';
        playerPuck.dataset.mapReportedLocation = 'true';
        playerPuck.setAttribute('aria-hidden', 'true');
        Object.assign(playerPuck.style, {
          left: '52%',
          position: 'absolute',
          top: '48%',
        });
        container.append(playerPuck);
        following = true;
        container.dataset.mapFollowing = 'true';
        followStateListener?.(true);
      }
    },
    setSelectedPoint: (point) => {
      selectedPoint = point;
      radius.style.display = point === null ? 'none' : 'block';
      renderMarkers();
    },
  };

  return controller;
};
