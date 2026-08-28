import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import type {
  IControl,
  Map as MapboxMap,
  MapMouseEvent,
  Marker as MapboxMarker,
} from 'mapbox-gl/esm';

export interface MapPoint {
  availability?: 'active' | 'ended' | 'upcoming';
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres?: number;
  reachable?: boolean;
}

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export type MapboxLightPreset = 'dawn' | 'day' | 'dusk' | 'night';

export interface MapboxStandardConfiguration extends Record<string, unknown> {
  lightPreset: MapboxLightPreset;
  show3dBuildings: boolean;
  show3dLandmarks: boolean;
  show3dObjects: boolean;
  show3dTrees: boolean;
  showPedestrianRoads: boolean;
}

export type CampusFeatureKind =
  | 'accessible-entrance'
  | 'accessible-path'
  | 'boundary'
  | 'building'
  | 'entrance'
  | 'landmark'
  | 'pedestrian-path'
  | 'service';

export interface CampusFeatureProperties {
  approvedName?: string;
  buildingId?: string;
  heightM?: number;
  kind: CampusFeatureKind;
  verifiedLevels?: number;
}

export interface CampusDatasetMetadata {
  lastVerified: string;
  licence: string;
  source: string;
}

export type CampusDataset = FeatureCollection<
  Geometry,
  CampusFeatureProperties
>;

export interface CampusLayerConfiguration {
  dataset: CampusDataset;
  metadata: CampusDatasetMetadata;
  replaceStandardBuildings?: boolean;
}

export interface MapConfiguration {
  accessToken: string;
  bearing: number;
  campusLayer?: CampusLayerConfiguration;
  center: readonly [longitude: number, latitude: number];
  pitch: number;
  standardConfig: MapboxStandardConfiguration;
  styleUrl: string;
  zoom: number;
}

export interface MapController {
  focusPoint: (point: MapPoint) => boolean;
  onError: (listener: () => void) => void;
  onFatalError?: (listener: () => void) => void;
  onLoad: (listener: () => void) => void;
  remove: () => void;
  recenterReportedLocation?: () => boolean;
  setReportedLocation: (coordinate: MapCoordinate | null) => void;
  setCoordinateSelectionListener?: (
    listener: ((coordinate: MapCoordinate) => void) | null,
  ) => void;
  setFollowStateListener?: (
    listener: ((following: boolean) => void) | null,
  ) => void;
  setPointSelectionListener?: (
    listener: ((pointId: string) => void) | null,
  ) => void;
  setPoints: (points: readonly MapPoint[]) => void;
  setSelectedPoint?: (point: MapPoint | null) => void;
}

export type MapFactory = (
  container: HTMLElement,
  configuration: MapConfiguration,
  points: readonly MapPoint[],
  signal: AbortSignal,
) => Promise<MapController>;

const CAMPUS_DATA_SOURCE_ID = 'wits-campus-data';
const CAMPUS_BOUNDARY_LAYER_ID = 'wits-campus-boundaries';
const CAMPUS_BUILDING_CLIP_LAYER_ID = 'wits-campus-building-clip';
const CAMPUS_BUILDING_LAYER_ID = 'wits-campus-buildings';
const CAMPUS_LABEL_LAYER_ID = 'wits-campus-labels';
const CAMPUS_PATH_LAYER_ID = 'wits-campus-paths';
const CAMPUS_POINT_LAYER_ID = 'wits-campus-points';
const EVENT_RADIUS_SOURCE_ID = 'wits-selected-event-radius';
const EVENT_RADIUS_FILL_LAYER_ID = 'wits-selected-event-radius-fill';
const EVENT_RADIUS_LINE_LAYER_ID = 'wits-selected-event-radius-line';
const EARTH_RADIUS_METRES = 6_371_008.8;
const FOLLOW_MOVEMENT_METRES = 5;
const EVENT_FOCUS_ZOOM = 17;
const PLAYER_FOCUS_ZOOM = 17;

export function createGeodesicCircle(
  center: MapCoordinate,
  radiusMetres: number,
  vertices = 64,
): Feature<Polygon> {
  if (
    !Number.isFinite(center.latitude) ||
    center.latitude < -90 ||
    center.latitude > 90 ||
    !Number.isFinite(center.longitude) ||
    center.longitude < -180 ||
    center.longitude > 180 ||
    !Number.isFinite(radiusMetres) ||
    radiusMetres <= 0 ||
    !Number.isInteger(vertices) ||
    vertices < 16
  ) {
    throw new Error('A valid centre, radius, and vertex count are required.');
  }

  const latitude = degreesToRadians(center.latitude);
  const longitude = degreesToRadians(center.longitude);
  const angularDistance = radiusMetres / EARTH_RADIUS_METRES;
  const coordinates: [number, number][] = [];

  for (let index = 0; index <= vertices; index += 1) {
    const bearing = (index / vertices) * Math.PI * 2;
    const destinationLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const destinationLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) -
          Math.sin(latitude) * Math.sin(destinationLatitude),
      );

    coordinates.push([
      normalizeLongitude(radiansToDegrees(destinationLongitude)),
      radiansToDegrees(destinationLatitude),
    ]);
  }

  return {
    geometry: { coordinates: [coordinates], type: 'Polygon' },
    properties: { radiusMetres },
    type: 'Feature',
  };
}

function escapeAttributionText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

class ResetViewControl implements IControl {
  private button: HTMLButtonElement | undefined;
  private container: HTMLDivElement | undefined;
  private map: MapboxMap | undefined;

  public constructor(
    private readonly camera: Pick<MapConfiguration, 'bearing' | 'pitch'>,
  ) {}

  public onAdd(map: MapboxMap): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    this.button = document.createElement('button');
    this.button.className = 'mapboxgl-ctrl-reset-view';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Reset map bearing and pitch');
    this.button.title = 'Reset map bearing and pitch';
    this.button.textContent = '↺';
    this.button.addEventListener('click', this.resetCamera);
    this.container.append(this.button);

    return this.container;
  }

  public onRemove(): void {
    this.button?.removeEventListener('click', this.resetCamera);
    this.container?.remove();
    this.button = undefined;
    this.container = undefined;
    this.map = undefined;
  }

  private readonly resetCamera = (): void => {
    this.map?.jumpTo({
      bearing: this.camera.bearing,
      pitch: this.camera.pitch,
    });
  };
}

function addCampusDatasetLayers(
  map: MapboxMap,
  campusLayer: CampusLayerConfiguration,
): void {
  if (!map.getSource(CAMPUS_DATA_SOURCE_ID)) {
    map.addSource(CAMPUS_DATA_SOURCE_ID, {
      attribution: `${escapeAttributionText(campusLayer.metadata.source)} · ${escapeAttributionText(campusLayer.metadata.licence)} (verified ${escapeAttributionText(campusLayer.metadata.lastVerified)})`,
      data: campusLayer.dataset,
      type: 'geojson',
    });
  }

  if (
    campusLayer.replaceStandardBuildings &&
    !map.getLayer(CAMPUS_BUILDING_CLIP_LAYER_ID)
  ) {
    map.addLayer({
      filter: ['==', ['get', 'kind'], 'building'],
      id: CAMPUS_BUILDING_CLIP_LAYER_ID,
      layout: {
        'clip-layer-scope': ['basemap'],
        'clip-layer-types': ['model', 'symbol'],
      },
      slot: 'middle',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'clip',
    });
  }

  if (!map.getLayer(CAMPUS_BOUNDARY_LAYER_ID)) {
    map.addLayer({
      filter: ['==', ['get', 'kind'], 'boundary'],
      id: CAMPUS_BOUNDARY_LAYER_ID,
      paint: {
        'line-color': '#d4af37',
        'line-emissive-strength': 0.75,
        'line-opacity': 0.86,
        'line-width': 2,
      },
      slot: 'bottom',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'line',
    });
  }

  if (!map.getLayer(CAMPUS_PATH_LAYER_ID)) {
    map.addLayer({
      filter: [
        'match',
        ['get', 'kind'],
        ['accessible-path', 'pedestrian-path'],
        true,
        false,
      ],
      id: CAMPUS_PATH_LAYER_ID,
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'accessible-path',
          '#54a8ff',
          '#d4af37',
        ],
        'line-emissive-strength': 0.8,
        'line-opacity': 0.92,
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2, 19, 5],
      },
      slot: 'middle',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'line',
    });
  }

  if (!map.getLayer(CAMPUS_BUILDING_LAYER_ID)) {
    map.addLayer({
      filter: ['all', ['==', ['get', 'kind'], 'building'], ['has', 'heightM']],
      id: CAMPUS_BUILDING_LAYER_ID,
      paint: {
        'fill-extrusion-base': 0,
        'fill-extrusion-color': '#174a99',
        'fill-extrusion-emissive-strength': 0.35,
        'fill-extrusion-height': ['get', 'heightM'],
        'fill-extrusion-opacity': 0.86,
      },
      slot: 'middle',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'fill-extrusion',
    });
  }

  if (!map.getLayer(CAMPUS_POINT_LAYER_ID)) {
    map.addLayer({
      filter: [
        'match',
        ['get', 'kind'],
        ['accessible-entrance', 'entrance', 'landmark', 'service'],
        true,
        false,
      ],
      id: CAMPUS_POINT_LAYER_ID,
      paint: {
        'circle-color': [
          'match',
          ['get', 'kind'],
          'accessible-entrance',
          '#54a8ff',
          'service',
          '#d4af37',
          '#f7f3e7',
        ],
        'circle-emissive-strength': 0.7,
        'circle-radius': 4,
        'circle-stroke-color': '#050b16',
        'circle-stroke-width': 1.5,
      },
      slot: 'top',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'circle',
    });
  }

  if (!map.getLayer(CAMPUS_LABEL_LAYER_ID)) {
    map.addLayer({
      filter: ['has', 'approvedName'],
      id: CAMPUS_LABEL_LAYER_ID,
      layout: {
        'text-anchor': 'top',
        'text-field': ['get', 'approvedName'],
        'text-offset': [0, 0.8],
        'text-size': 12,
      },
      paint: {
        'text-color': '#f7f3e7',
        'text-emissive-strength': 0.75,
        'text-halo-color': '#050b16',
        'text-halo-width': 1.5,
      },
      slot: 'top',
      source: CAMPUS_DATA_SOURCE_ID,
      type: 'symbol',
    });
  }
}

function createController(
  map: MapboxMap,
  renderPoints: (points: readonly MapPoint[]) => void,
  markerInteraction: {
    listener: ((pointId: string) => void) | null;
    selectedPointId: string | null;
  },
  setSelectedRadius: (point: MapPoint | null) => void,
): MapController {
  let currentPoints: readonly MapPoint[] = [];
  let reportedLocation: MapCoordinate | null = null;
  let reportedLocationPointer: HTMLSpanElement | undefined;
  let reportedLocationListenersAttached = false;
  let followStateListener: ((following: boolean) => void) | null = null;
  let following = false;
  let hasReceivedFirstFix = false;
  let lastFollowedLocation: MapCoordinate | null = null;
  let coordinateSelectionListener:
    ((coordinate: MapCoordinate) => void) | null = null;

  const handleCoordinateSelection = (event: MapMouseEvent): void => {
    coordinateSelectionListener?.({
      latitude: event.lngLat.lat,
      longitude: event.lngLat.lng,
    });
  };

  const updateReportedLocationPointer = (): void => {
    if (reportedLocationPointer === undefined || reportedLocation === null) {
      return;
    }

    const projectedPoint = map.project([
      reportedLocation.longitude,
      reportedLocation.latitude,
    ]);
    reportedLocationPointer.style.transform = `translate3d(${projectedPoint.x}px, ${projectedPoint.y}px, 0) translate(-50%, -50%)`;
  };

  const setFollowing = (nextFollowing: boolean): void => {
    if (following === nextFollowing) {
      return;
    }

    following = nextFollowing;
    followStateListener?.(following);
  };

  const focusReportedLocation = (restoreZoom: boolean): boolean => {
    if (reportedLocation === null) {
      return false;
    }

    const zoom = restoreZoom
      ? Math.max(map.getZoom(), PLAYER_FOCUS_ZOOM)
      : undefined;
    map.easeTo({
      center: [reportedLocation.longitude, reportedLocation.latitude],
      duration: 700,
      ...(zoom === undefined ? {} : { zoom }),
    });
    lastFollowedLocation = reportedLocation;
    setFollowing(true);
    return true;
  };

  const focusPoint = (point: MapPoint): boolean => {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return false;
    }

    setFollowing(false);
    map.easeTo({
      center: [point.longitude, point.latitude],
      duration: 650,
      zoom: Math.max(map.getZoom(), EVENT_FOCUS_ZOOM),
    });
    return true;
  };

  const handleDeliberatePan = (): void => {
    setFollowing(false);
  };

  const detachReportedLocationListeners = (): void => {
    if (!reportedLocationListenersAttached) {
      return;
    }

    map.off('move', updateReportedLocationPointer);
    map.off('resize', updateReportedLocationPointer);
    reportedLocationListenersAttached = false;
  };

  const setReportedLocation = (coordinate: MapCoordinate | null): void => {
    reportedLocation = coordinate;

    if (coordinate === null) {
      reportedLocationPointer?.remove();
      reportedLocationPointer = undefined;
      detachReportedLocationListeners();
      hasReceivedFirstFix = false;
      lastFollowedLocation = null;
      setFollowing(false);
      return;
    }

    if (reportedLocationPointer === undefined) {
      reportedLocationPointer = document.createElement('span');
      reportedLocationPointer.className = 'reported-location-pointer';
      reportedLocationPointer.dataset.mapReportedLocation = 'true';
      reportedLocationPointer.setAttribute('aria-hidden', 'true');
      reportedLocationPointer.title = 'Reported location';
      map.getCanvasContainer().append(reportedLocationPointer);
    }

    if (!reportedLocationListenersAttached) {
      map.on('move', updateReportedLocationPointer);
      map.on('resize', updateReportedLocationPointer);
      reportedLocationListenersAttached = true;
    }

    updateReportedLocationPointer();

    if (!hasReceivedFirstFix) {
      hasReceivedFirstFix = true;
      focusReportedLocation(true);
      return;
    }

    if (
      following &&
      (lastFollowedLocation === null ||
        distanceBetweenCoordinatesMetres(lastFollowedLocation, coordinate) >=
          FOLLOW_MOVEMENT_METRES)
    ) {
      focusReportedLocation(false);
    }
  };

  map.on('dragstart', handleDeliberatePan);

  return {
    focusPoint,
    onError(listener) {
      map.on('error', listener);
    },
    onFatalError(listener) {
      map.on('webglcontextlost', listener);
    },
    onLoad(listener) {
      if (map.loaded()) {
        listener();
        return;
      }

      map.once('load', listener);
    },
    remove() {
      coordinateSelectionListener = null;
      followStateListener = null;
      markerInteraction.listener = null;
      map.off('click', handleCoordinateSelection);
      map.off('dragstart', handleDeliberatePan);
      setReportedLocation(null);
      renderPoints([]);
      map.remove();
    },
    recenterReportedLocation() {
      return focusReportedLocation(true);
    },
    setCoordinateSelectionListener(listener) {
      map.off('click', handleCoordinateSelection);
      coordinateSelectionListener = listener;

      if (listener !== null) {
        map.on('click', handleCoordinateSelection);
      }
    },
    setReportedLocation,
    setFollowStateListener(listener) {
      followStateListener = listener;
      listener?.(following);
    },
    setPointSelectionListener(listener) {
      markerInteraction.listener = listener;
    },
    setPoints(points) {
      currentPoints = points;
      renderPoints(points);
    },
    setSelectedPoint(point) {
      markerInteraction.selectedPointId = point?.id ?? null;
      setSelectedRadius(point);
      renderPoints(currentPoints);
    },
  };
}

export const createMapboxMap: MapFactory = async (
  container,
  configuration,
  points,
  signal,
) => {
  if (signal.aborted) {
    throw new Error('Map creation was cancelled.');
  }

  if (!configuration.accessToken.trim()) {
    throw new Error('Mapbox access token is not configured.');
  }

  const [mapboxgl] = await Promise.all([
    import('mapbox-gl/esm'),
    import('mapbox-gl/dist/mapbox-gl.css'),
  ]);

  if (signal.aborted) {
    throw new Error('Map creation was cancelled.');
  }

  const map = new mapboxgl.Map({
    accessToken: configuration.accessToken,
    attributionControl: false,
    bearing: configuration.bearing,
    center: [...configuration.center],
    config: {
      basemap: configuration.standardConfig,
    },
    container,
    performanceMetricsCollection: false,
    pitch: configuration.pitch,
    respectPrefersReducedMotion: true,
    style: configuration.styleUrl,
    zoom: configuration.zoom,
  });

  map.addControl(
    new mapboxgl.NavigationControl({
      showCompass: false,
      showZoom: true,
      visualizePitch: true,
    }),
    'top-right',
  );
  map.addControl(new ResetViewControl(configuration), 'top-right');
  map.addControl(
    new mapboxgl.AttributionControl({ compact: true }),
    'bottom-right',
  );

  const campusLayer = configuration.campusLayer;
  if (campusLayer) {
    map.on('style.load', () => {
      if (!signal.aborted) {
        addCampusDatasetLayers(map, campusLayer);
      }
    });
  }

  const markerInteraction = {
    listener: null as ((pointId: string) => void) | null,
    selectedPointId: null as string | null,
  };
  const markerRecords = new Map<
    string,
    { button: HTMLButtonElement; marker: MapboxMarker }
  >();
  const availabilityLabels = {
    active: 'available now',
    ended: 'ended',
    upcoming: 'upcoming',
  } as const;

  const renderPoints = (nextPoints: readonly MapPoint[]): void => {
    const pointIds = new Set(nextPoints.map((point) => point.id));

    for (const [pointId, record] of markerRecords) {
      if (!pointIds.has(pointId)) {
        record.marker.remove();
        markerRecords.delete(pointId);
      }
    }

    for (const point of nextPoints) {
      let record = markerRecords.get(point.id);

      if (record === undefined) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.eventMarkerId = point.id;
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
          markerInteraction.listener?.(point.id);
        });

        const marker = new mapboxgl.Marker({
          anchor: 'center',
          element: button,
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);
        record = { button, marker };
        markerRecords.set(point.id, record);
      } else {
        record.marker.setLngLat([point.longitude, point.latitude]);
      }

      const availability = point.availability ?? 'active';
      const selected = markerInteraction.selectedPointId === point.id;
      record.button.className = [
        'event-marker',
        `event-marker--${availability}`,
        selected ? 'event-marker--selected' : '',
        point.reachable ? 'event-marker--reachable' : '',
      ]
        .filter(Boolean)
        .join(' ');
      record.button.setAttribute(
        'aria-label',
        `Select ${point.label}, ${availabilityLabels[availability]}${point.reachable ? ', in range' : ''}`,
      );
      record.button.setAttribute('aria-pressed', String(selected));
      record.button.title = point.label;
      const markerLabel = record.button.querySelector('.event-marker__label');
      if (markerLabel !== null) {
        markerLabel.textContent = point.label;
      }
    }
  };

  let selectedRadiusPoint: MapPoint | null = null;
  const emptyRadius: FeatureCollection<Polygon> = {
    features: [],
    type: 'FeatureCollection',
  };
  const syncSelectedRadius = (): void => {
    const data: FeatureCollection<Polygon> = {
      features:
        selectedRadiusPoint === null ||
        selectedRadiusPoint.radiusMetres === undefined
          ? []
          : [
              createGeodesicCircle(
                selectedRadiusPoint,
                selectedRadiusPoint.radiusMetres,
              ),
            ],
      type: 'FeatureCollection',
    };
    const source = map.getSource(EVENT_RADIUS_SOURCE_ID) as
      { setData: (nextData: FeatureCollection<Polygon>) => void } | undefined;

    if (source === undefined) {
      map.addSource(EVENT_RADIUS_SOURCE_ID, {
        data: selectedRadiusPoint === null ? emptyRadius : data,
        type: 'geojson',
      });
    } else {
      source.setData(data);
    }

    if (!map.getLayer(EVENT_RADIUS_FILL_LAYER_ID)) {
      map.addLayer({
        id: EVENT_RADIUS_FILL_LAYER_ID,
        paint: {
          'fill-color': '#2a6bff',
          'fill-opacity': 0.2,
        },
        slot: 'middle',
        source: EVENT_RADIUS_SOURCE_ID,
        type: 'fill',
      });
    }

    if (!map.getLayer(EVENT_RADIUS_LINE_LAYER_ID)) {
      map.addLayer({
        id: EVENT_RADIUS_LINE_LAYER_ID,
        paint: {
          'line-color': '#d4af37',
          'line-emissive-strength': 0.75,
          'line-opacity': 0.9,
          'line-width': 2.5,
        },
        slot: 'middle',
        source: EVENT_RADIUS_SOURCE_ID,
        type: 'line',
      });
    }
  };

  map.on('style.load', syncSelectedRadius);
  if (map.isStyleLoaded()) {
    syncSelectedRadius();
  }

  const controller = createController(
    map,
    renderPoints,
    markerInteraction,
    (point) => {
      selectedRadiusPoint = point;
      if (map.isStyleLoaded()) {
        syncSelectedRadius();
      }
    },
  );
  controller.setPoints(points);

  return controller;
};

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function distanceBetweenCoordinatesMetres(
  first: MapCoordinate,
  second: MapCoordinate,
): number {
  const firstLatitude = degreesToRadians(first.latitude);
  const secondLatitude = degreesToRadians(second.latitude);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METRES *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}
