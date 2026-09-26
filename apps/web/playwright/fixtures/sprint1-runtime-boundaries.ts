import 'mapbox-gl/dist/mapbox-gl.css';

import {
  BrowserLocationError,
  type LocationClaimProvider,
  type LocationObservationProvider,
} from '../../src/browser-location';
import type {
  MapArea,
  MapController,
  MapFactory,
  MapPoint,
} from '../../src/components/exploration/map-provider';

let mapInstance = 0;

export const locationClaimProvider: LocationClaimProvider = () =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          accuracyMetres: position.coords.accuracy,
          // Follow the page clock, including suites that freeze it explicitly.
          acquiredAt: new Date().toISOString(),
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

export const locationObservationProvider: LocationObservationProvider = ({
  onError,
  onLocation,
}) => {
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onLocation({
        accuracyMetres: position.coords.accuracy,
        acquiredAt: new Date().toISOString(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      onError(
        new BrowserLocationError(
          error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        ),
      );
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
};

export const mapFactory: MapFactory = async (
  container,
  config,
  initialPoints,
  signal,
) => {
  if (signal.aborted) {
    throw new Error('Deterministic map creation was cancelled.');
  }

  if (new URLSearchParams(window.location.search).has('map-failure')) {
    throw new Error('Deterministic map failure requested.');
  }

  const instanceId = `deterministic-${++mapInstance}`;
  container.dataset.mapProvider = instanceId;
  if (config.initialBounds) {
    container.dataset.mapInitialBounds = [
      ...config.initialBounds[0],
      ...config.initialBounds[1],
    ].join(',');
  } else {
    container.dataset.mapCameraCenter = config.center.join(',');
    container.dataset.mapCameraZoom = String(config.zoom);
  }
  container.classList.add('deterministic-map');
  container.style.background =
    'radial-gradient(circle at 48% 42%, rgb(42 107 255 / 30%), transparent 22%), linear-gradient(145deg, #18304f, #071426 70%)';
  let points = initialPoints;
  let areas: readonly MapArea[] = [];
  let selectedPoint: MapPoint | null = null;
  let focusedPointId: string | null = null;
  let pointSelectionListener: ((pointId: string) => void) | null = null;
  let coordinateSelectionListener:
    ((coordinate: { latitude: number; longitude: number }) => void) | null =
    null;
  let followStateListener: ((following: boolean) => void) | null = null;
  let hasLocation = false;
  let following = false;
  let playerPuck: HTMLElement | null = null;

  const markerLayer = document.createElement('div');
  markerLayer.dataset.deterministicMarkers = 'true';
  Object.assign(markerLayer.style, {
    inset: '0',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: '2',
  });
  const areaLayer = document.createElement('div');
  areaLayer.dataset.deterministicAreas = 'true';
  Object.assign(areaLayer.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    inset: '8%',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: '1',
  });
  const radius = document.createElement('div');
  radius.dataset.deterministicEventRadius = 'true';
  Object.assign(radius.style, {
    background: 'rgb(42 107 255 / 15%)',
    border: '2px solid #d4af37',
    borderRadius: '50%',
    display: 'none',
    pointerEvents: 'none',
    position: 'absolute',
  });
  container.append(radius, areaLayer, markerLayer);

  const renderAreas = (): void => {
    areaLayer.replaceChildren();
    areas.forEach((area) => {
      const zone = document.createElement('div');
      zone.dataset.areaState = area.state;
      zone.setAttribute('aria-hidden', 'true');
      zone.textContent = area.label;
      const color =
        area.state === 'served'
          ? '#54a8ff'
          : area.state === 'shortfall'
            ? '#e1a93a'
            : '#dc5b65';
      Object.assign(zone.style, {
        alignItems: 'end',
        background: `repeating-linear-gradient(135deg, transparent 0 18px, ${color}22 18px 20px)`,
        border: `2px ${area.state === 'served' ? 'solid' : area.state === 'shortfall' ? 'dashed' : 'dotted'} ${color}`,
        color: '#f7f3e7',
        display: 'flex',
        fontSize: '12px',
        fontWeight: '800',
        margin: '3%',
        padding: '12px',
        textShadow: '0 1px 3px #050b16',
      });
      areaLayer.append(zone);
    });
  };

  const coordinateAt = (clientX: number, clientY: number) => {
    const bounds = container.getBoundingClientRect();
    const horizontalPosition = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    const verticalPosition = Math.min(
      1,
      Math.max(0, (clientY - bounds.top) / bounds.height),
    );
    const southWest = config.initialBounds?.[0] ?? [
      config.center[0] - 0.005,
      config.center[1] - 0.005,
    ];
    const northEast = config.initialBounds?.[1] ?? [
      config.center[0] + 0.005,
      config.center[1] + 0.005,
    ];

    return {
      latitude: northEast[1] - verticalPosition * (northEast[1] - southWest[1]),
      longitude:
        southWest[0] + horizontalPosition * (northEast[0] - southWest[0]),
    };
  };

  const selectMapCoordinate = (event: MouseEvent): void => {
    if (
      (event.target as Element | null)?.closest(
        'button, a, details, .mapboxgl-ctrl',
      )
    ) {
      return;
    }
    coordinateSelectionListener?.(coordinateAt(event.clientX, event.clientY));
  };
  container.addEventListener('click', selectMapCoordinate);

  const pointPosition = (point: MapPoint) => {
    const horizontalPosition = config.initialBounds
      ? ((point.longitude - config.initialBounds[0][0]) /
          (config.initialBounds[1][0] - config.initialBounds[0][0])) *
        100
      : 48;
    const verticalPosition = config.initialBounds
      ? ((config.initialBounds[1][1] - point.latitude) /
          (config.initialBounds[1][1] - config.initialBounds[0][1])) *
        100
      : 42;

    return {
      horizontal:
        focusedPointId === point.id
          ? 48
          : Math.min(95, Math.max(5, finitePosition(horizontalPosition, 42))),
      vertical:
        focusedPointId === point.id
          ? 42
          : Math.min(95, Math.max(5, finitePosition(verticalPosition, 36))),
    };
  };

  const updateRadiusVisual = (): void => {
    if (selectedPoint?.radiusMetres === undefined) {
      radius.style.display = 'none';
      delete radius.dataset.radiusMetres;
      return;
    }

    const position = pointPosition(selectedPoint);
    const diameter = Math.min(
      220,
      Math.max(64, selectedPoint.radiusMetres * 2),
    );
    Object.assign(radius.style, {
      display: 'block',
      height: `${diameter}px`,
      left: `calc(${position.horizontal}% - ${diameter / 2}px)`,
      top: `calc(${position.vertical}% - ${diameter / 2}px)`,
      width: `${diameter}px`,
    });
    radius.dataset.radiusMetres = String(selectedPoint.radiusMetres);
  };

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
  const navigationControls: ReadonlyArray<readonly [string, string]> = [
    ['Zoom in', '+'],
    ['Zoom out', '−'],
    ...(config.showResetViewControl === false
      ? []
      : ([['Reset map bearing and pitch', '↺']] as const)),
  ];
  for (const [label, symbol] of navigationControls) {
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
      const selectable = point.selectable !== false;
      button.type = 'button';
      button.dataset.eventMarkerId = point.id;
      button.dataset.markerDraggable = String(point.draggable === true);
      button.dataset.markerLatitude = String(point.latitude);
      button.dataset.markerLongitude = String(point.longitude);
      button.dataset.trailState = point.trailState ?? '';
      button.className = [
        'event-marker',
        `event-marker--${availability}`,
        ...(point.placementStates ?? []).map(
          (state) => `event-marker--placement-${state}`,
        ),
        point.trailState ? `event-marker--trail-${point.trailState}` : '',
        selectedPoint?.id === point.id ? 'event-marker--selected' : '',
        point.reachable ? 'event-marker--reachable' : '',
      ]
        .filter(Boolean)
        .join(' ');
      button.disabled = !selectable;
      button.setAttribute(
        'aria-label',
        point.draggable
          ? `Focus ${point.label}. Drag the marker to adjust it, or use the coordinate fields for keyboard entry.`
          : point.trailState
            ? `${selectable ? 'Select ' : ''}${point.label}, ${point.trailState} trail stop`
            : `Select ${point.label}, ${availability === 'active' ? 'available now' : availability}`,
      );
      button.setAttribute(
        'aria-pressed',
        String(selectedPoint?.id === point.id),
      );
      const position = pointPosition(point);
      const applyFixtureSpread =
        !config.initialBounds && focusedPointId !== point.id;
      Object.assign(button.style, {
        cursor: point.draggable ? 'grab' : 'pointer',
        left: `${position.horizontal + (applyFixtureSpread ? index * 12 : 0)}%`,
        position: 'absolute',
        pointerEvents: 'auto',
        top: `${position.vertical + (applyFixtureSpread ? (index % 2) * 13 : 0)}%`,
      });
      const markerBody = document.createElement('span');
      markerBody.className = 'event-marker__body';
      markerBody.setAttribute('aria-hidden', 'true');
      const markerGlyph = document.createElement('span');
      markerGlyph.className = 'event-marker__glyph';
      markerGlyph.textContent = '✦';
      markerBody.append(markerGlyph);
      const markerLabel = document.createElement('span');
      markerLabel.className = 'event-marker__label';
      markerLabel.setAttribute('aria-hidden', 'true');
      markerLabel.textContent = point.label;
      button.append(markerBody, markerLabel);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        pointSelectionListener?.(point.id);
      });
      button.addEventListener('pointerdown', (event) => {
        if (!point.draggable) return;
        event.stopPropagation();
        const selectDraggedCoordinate = (pointerEvent: PointerEvent): void => {
          coordinateSelectionListener?.(
            coordinateAt(pointerEvent.clientX, pointerEvent.clientY),
          );
        };
        window.addEventListener('pointerup', selectDraggedCoordinate, {
          once: true,
        });
      });
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
    focusPoint: (point) => {
      focusedPointId = point.id;
      following = false;
      container.dataset.mapFollowing = 'false';
      container.dataset.mapFocusedEvent = point.id;
      container.dataset.mapCameraCenter = `${point.longitude},${point.latitude}`;
      container.dataset.mapCameraZoom = '17';
      followStateListener?.(false);
      updateRadiusVisual();
      renderMarkers();
      return true;
    },
    onError: () => undefined,
    onLoad: (listener) => {
      if (!new URLSearchParams(window.location.search).has('map-loading')) {
        queueMicrotask(listener);
      }
    },
    recenterReportedLocation: () => {
      if (!hasLocation) return false;
      following = true;
      container.dataset.mapFollowing = 'true';
      followStateListener?.(true);
      return true;
    },
    remove: () => {
      container.removeEventListener('click', selectMapCoordinate);
      container.removeEventListener('pointerdown', stopFollowingOnPan);
      playerPuck?.remove();
      markerLayer.remove();
      areaLayer.remove();
      radius.remove();
      logoArea.remove();
      attributionArea.remove();
      navigationArea.remove();
      if (container.dataset.mapProvider === instanceId) {
        delete container.dataset.mapProvider;
        delete container.dataset.mapInitialBounds;
        delete container.dataset.mapFollowing;
        delete container.dataset.mapFocusedEvent;
        delete container.dataset.mapCameraCenter;
        delete container.dataset.mapCameraZoom;
        delete container.dataset.mapSelectedCoordinate;
      }
    },
    setFollowStateListener: (listener) => {
      followStateListener = listener;
      listener?.(following);
    },
    setCoordinateSelectionListener: (listener) => {
      coordinateSelectionListener = listener;
    },
    setPointSelectionListener: (listener) => {
      pointSelectionListener = listener;
    },
    setAreas: (nextAreas) => {
      areas = nextAreas;
      renderAreas();
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
      updateRadiusVisual();
      if (point === null) {
        delete container.dataset.mapSelectedCoordinate;
      } else {
        container.dataset.mapSelectedCoordinate = `${point.longitude},${point.latitude}`;
      }
      renderMarkers();
    },
  };

  return controller;
};

function finitePosition(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
