import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
} from 'geojson';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { prefersReducedMotion } from '../../accessibility/preferences';
import { getCampusLightPreset, type MapboxLightPreset } from './map-lighting';
export type { MapboxLightPreset } from './map-lighting';
import type {
  IControl,
  ExpressionSpecification,
  LayerSpecification,
  Map as MapboxMap,
  MapMouseEvent,
  Marker as MapboxMarker,
  MarkerOptions,
} from 'mapbox-gl/esm';

export interface MapPoint {
  availability?: 'active' | 'ended' | 'upcoming';
  draggable?: boolean;
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres?: number;
  reachable?: boolean;
  selectable?: boolean;
  placementStates?: readonly PlacementMapState[];
  trailPosition?: number;
  trailState?: 'completed' | 'current' | 'locked' | 'retired' | 'unavailable';
}

export type PlacementMapState =
  'candidate' | 'current' | 'excluded' | 'overridden' | 'proposed';

export interface MapArea {
  geometry: MultiPolygon | Polygon;
  id: string;
  label: string;
  state: 'served' | 'shortfall' | 'unserved';
}

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  geometry: Polygon | MultiPolygon;
  id: string;
  label: string;
  ownerLabel: string | null;
  status: 'active' | 'suspended';
}

export interface ReportedMapLocation extends MapCoordinate {
  accuracyMetres: number;
}

export type MapBounds = readonly [
  southWest: readonly [longitude: number, latitude: number],
  northEast: readonly [longitude: number, latitude: number],
];

export interface MapLayerVisibility {
  events: boolean;
  radius: boolean;
  territories: boolean;
  details: boolean;
  labels: boolean;
}

export const DEFAULT_MAP_LAYER_VISIBILITY: MapLayerVisibility = {
  events: true,
  radius: true,
  territories: true,
  details: true,
  labels: true,
};

export const MOBILE_2D_MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

export interface MapboxStandardConfiguration extends Record<string, unknown> {
  lightPreset?: MapboxLightPreset;
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
  initialBounds?: MapBounds;
  initialBoundsPadding?: number;
  pitch: number;
  showResetViewControl?: boolean;
  standardConfig: MapboxStandardConfiguration;
  styleUrl: string;
  zoom: number;
}

export interface MapController {
  focusPoint: (point: MapPoint) => boolean;
  focusRegion?: (region: MapRegion) => boolean;
  onError: (listener: () => void) => void;
  onFatalError?: (listener: () => void) => void;
  onLoad: (listener: () => void) => void;
  remove: () => void;
  resize?: (padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }) => void;
  recenterReportedLocation?: () => boolean;
  setReportedLocation: (coordinate: ReportedMapLocation | null) => void;
  setCoordinateSelectionListener?: (
    listener: ((coordinate: MapCoordinate) => void) | null,
  ) => void;
  setAreas?: (areas: readonly MapArea[]) => void;
  setFollowStateListener?: (
    listener: ((following: boolean) => void) | null,
  ) => void;
  setPointSelectionListener?: (
    listener: ((pointId: string) => void) | null,
  ) => void;
  setPoints: (points: readonly MapPoint[]) => void;
  setLayerVisibility?: (visibility: MapLayerVisibility) => void;
  setRegions?: (regions: readonly MapRegion[]) => void;
  setRegionSelectionListener?: (
    listener: ((regionId: string) => void) | null,
  ) => void;
  setSelectedRegion?: (region: MapRegion | null) => void;
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
const TERRITORY_SOURCE_ID = 'wits-territory-regions';
const TERRITORY_FILL_LAYER_ID = 'wits-territory-fill';
const TERRITORY_LINE_LAYER_ID = 'wits-territory-line';
const TERRITORY_SUSPENDED_LINE_LAYER_ID = 'wits-territory-suspended-line';
const TERRITORY_SELECTED_LINE_LAYER_ID = 'wits-territory-selected-line';
const TERRITORY_LABEL_LAYER_ID = 'wits-territory-label';
const PLACEMENT_AREA_SOURCE_ID = 'wits-placement-areas';
const PLACEMENT_AREA_FILL_LAYER_ID = 'wits-placement-area-fill';
const PLACEMENT_AREA_SERVED_LAYER_ID = 'wits-placement-area-served';
const PLACEMENT_AREA_SHORTFALL_LAYER_ID = 'wits-placement-area-shortfall';
const PLACEMENT_AREA_UNSERVED_LAYER_ID = 'wits-placement-area-unserved';
const PLACEMENT_AREA_LABEL_LAYER_ID = 'wits-placement-area-label';
const EARTH_RADIUS_METRES = 6_371_008.8;
const MIN_FOLLOW_MOVEMENT_METRES = 10;
const MAX_FOLLOW_MOVEMENT_METRES = 40;
const LIVE_FOLLOW_DURATION_MS = 250;
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
  private iconRoot: Root | undefined;
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
    this.iconRoot = createRoot(this.button);
    this.iconRoot.render(
      createElement(ArrowCounterClockwise, { size: 20, 'aria-hidden': true }),
    );
    this.button.addEventListener('click', this.resetCamera);
    this.container.append(this.button);

    return this.container;
  }

  public onRemove(): void {
    const iconRoot = this.iconRoot;
    queueMicrotask(() => iconRoot?.unmount());
    this.iconRoot = undefined;
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

function addApplicationLayer(
  map: MapboxMap,
  layer: LayerSpecification,
  usesStandardBasemap: boolean,
): void {
  if (usesStandardBasemap) {
    map.addLayer(layer);
    return;
  }

  // Classic styles use ordinary ordering: context below roads, geometry below
  // labels, and application labels above the basemap.
  const { slot, ...classicLayer } = layer;
  const beforeId = map
    .getStyle()
    .layers?.find(
      (candidate) =>
        !candidate.id.startsWith('wits-') &&
        (slot === 'bottom'
          ? candidate.type === 'line'
          : slot === 'middle' && candidate.type === 'symbol'),
    )?.id;
  map.addLayer(classicLayer, beforeId);
}

function addCampusDatasetLayers(
  map: MapboxMap,
  campusLayer: CampusLayerConfiguration,
  usesStandardBasemap: boolean,
): void {
  if (!map.getSource(CAMPUS_DATA_SOURCE_ID)) {
    map.addSource(CAMPUS_DATA_SOURCE_ID, {
      attribution: `${escapeAttributionText(campusLayer.metadata.source)} · ${escapeAttributionText(campusLayer.metadata.licence)} (verified ${escapeAttributionText(campusLayer.metadata.lastVerified)})`,
      data: campusLayer.dataset,
      type: 'geojson',
    });
  }

  if (
    usesStandardBasemap &&
    campusLayer.replaceStandardBuildings &&
    !map.getLayer(CAMPUS_BUILDING_CLIP_LAYER_ID)
  ) {
    addApplicationLayer(
      map,
      {
        filter: ['==', ['get', 'kind'], 'building'],
        id: CAMPUS_BUILDING_CLIP_LAYER_ID,
        layout: {
          'clip-layer-scope': ['basemap'],
          'clip-layer-types': ['model', 'symbol'],
        },
        slot: 'middle',
        source: CAMPUS_DATA_SOURCE_ID,
        type: 'clip',
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(CAMPUS_BOUNDARY_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
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
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(CAMPUS_PATH_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
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
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(CAMPUS_BUILDING_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
        filter: [
          'all',
          ['==', ['get', 'kind'], 'building'],
          ['has', 'heightM'],
        ],
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
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(CAMPUS_POINT_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
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
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(CAMPUS_LABEL_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
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
      },
      usesStandardBasemap,
    );
  }
}

function syncPlacementAreas(
  map: MapboxMap,
  areas: readonly MapArea[],
  usesStandardBasemap: boolean,
): void {
  const data: FeatureCollection<MultiPolygon | Polygon> = {
    features: areas.map((area) => ({
      geometry: area.geometry,
      properties: {
        id: area.id,
        label: area.label,
        state: area.state,
      },
      type: 'Feature',
    })),
    type: 'FeatureCollection',
  };
  const source = map.getSource(PLACEMENT_AREA_SOURCE_ID) as
    | { setData: (nextData: FeatureCollection<MultiPolygon | Polygon>) => void }
    | undefined;

  if (source === undefined) {
    map.addSource(PLACEMENT_AREA_SOURCE_ID, { data, type: 'geojson' });
  } else {
    source.setData(data);
  }

  if (!map.getLayer(PLACEMENT_AREA_FILL_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
        id: PLACEMENT_AREA_FILL_LAYER_ID,
        paint: {
          'fill-color': [
            'match',
            ['get', 'state'],
            'served',
            '#2a6bff',
            'shortfall',
            '#e1a93a',
            '#dc5b65',
          ],
          'fill-opacity': 0.12,
        },
        slot: 'middle',
        source: PLACEMENT_AREA_SOURCE_ID,
        type: 'fill',
      },
      usesStandardBasemap,
    );
  }

  const lines = [
    {
      color: '#54a8ff',
      dash: [1, 0.01] as [number, number],
      id: PLACEMENT_AREA_SERVED_LAYER_ID,
      state: 'served',
    },
    {
      color: '#e1a93a',
      dash: [3, 2] as [number, number],
      id: PLACEMENT_AREA_SHORTFALL_LAYER_ID,
      state: 'shortfall',
    },
    {
      color: '#dc5b65',
      dash: [1, 2] as [number, number],
      id: PLACEMENT_AREA_UNSERVED_LAYER_ID,
      state: 'unserved',
    },
  ] as const;
  for (const line of lines) {
    if (map.getLayer(line.id)) continue;
    addApplicationLayer(
      map,
      {
        filter: ['==', ['get', 'state'], line.state],
        id: line.id,
        paint: {
          'line-color': line.color,
          'line-dasharray': line.dash,
          'line-emissive-strength': 0.7,
          'line-opacity': 0.95,
          'line-width': 2.5,
        },
        slot: 'top',
        source: PLACEMENT_AREA_SOURCE_ID,
        type: 'line',
      },
      usesStandardBasemap,
    );
  }

  if (!map.getLayer(PLACEMENT_AREA_LABEL_LAYER_ID)) {
    addApplicationLayer(
      map,
      {
        id: PLACEMENT_AREA_LABEL_LAYER_ID,
        layout: {
          'symbol-placement': 'point',
          'text-field': ['get', 'label'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#f7f3e7',
          'text-emissive-strength': 0.75,
          'text-halo-color': '#050b16',
          'text-halo-width': 1.5,
        },
        slot: 'top',
        source: PLACEMENT_AREA_SOURCE_ID,
        type: 'symbol',
      },
      usesStandardBasemap,
    );
  }
}

function createController(
  map: MapboxMap,
  MarkerConstructor: new (options?: MarkerOptions) => MapboxMarker,
  renderPoints: (points: readonly MapPoint[]) => void,
  updateMarkerSelection: (
    previousId: string | null,
    nextId: string | null,
  ) => void,
  markerInteraction: {
    coordinateSelectionListener: ((coordinate: MapCoordinate) => void) | null;
    listener: ((pointId: string) => void) | null;
    selectedPointId: string | null;
  },
  setSelectedRadius: (point: MapPoint | null) => void,
  regionInteraction: {
    listener: ((regionId: string) => void) | null;
    selectedRegionId: string | null;
  },
  renderRegions: (regions: readonly MapRegion[]) => void,
  setSelectedRegion: (region: MapRegion | null) => void,
  renderAreas: (areas: readonly MapArea[]) => void,
): MapController {
  let reportedLocation: ReportedMapLocation | null = null;
  let reportedLocationPointer: HTMLSpanElement | undefined;
  let reportedLocationMarker: MapboxMarker | undefined;
  let followStateListener: ((following: boolean) => void) | null = null;
  let following = false;
  let hasReceivedFirstFix = false;
  let lastFollowedLocation: ReportedMapLocation | null = null;
  const handleCoordinateSelection = (event: MapMouseEvent): void => {
    markerInteraction.coordinateSelectionListener?.({
      latitude: event.lngLat.lat,
      longitude: event.lngLat.lng,
    });
  };

  const setFollowing = (nextFollowing: boolean): void => {
    if (following === nextFollowing) {
      return;
    }

    following = nextFollowing;
    followStateListener?.(following);
  };

  const focusReportedLocation = (
    restoreZoom: boolean,
    duration = 700,
  ): boolean => {
    if (reportedLocation === null) {
      return false;
    }

    const zoom = restoreZoom
      ? Math.max(map.getZoom(), PLAYER_FOCUS_ZOOM)
      : undefined;
    const camera = {
      center: [reportedLocation.longitude, reportedLocation.latitude] as [
        number,
        number,
      ],
      ...(zoom === undefined ? {} : { zoom }),
    };
    if (prefersReducedMotion()) map.jumpTo(camera);
    else map.easeTo({ ...camera, duration });
    lastFollowedLocation = reportedLocation;
    setFollowing(true);
    return true;
  };

  const focusPoint = (point: MapPoint): boolean => {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return false;
    }

    setFollowing(false);
    const camera = {
      center: [point.longitude, point.latitude] as [number, number],
      zoom: Math.max(map.getZoom(), EVENT_FOCUS_ZOOM),
    };
    if (prefersReducedMotion()) map.jumpTo(camera);
    else map.easeTo({ ...camera, duration: 650 });
    return true;
  };

  const focusRegion = (region: MapRegion): boolean => {
    const bounds = boundsForRegion(region);
    if (bounds === null) return false;
    setFollowing(false);
    map.fitBounds(bounds, {
      duration: prefersReducedMotion() ? 0 : 650,
      maxZoom: 17,
      padding: 72,
    });
    return true;
  };

  const handleDeliberatePan = (): void => {
    setFollowing(false);
  };

  const setReportedLocation = (
    coordinate: ReportedMapLocation | null,
  ): void => {
    reportedLocation = coordinate;

    if (coordinate === null) {
      reportedLocationMarker?.remove();
      reportedLocationMarker = undefined;
      reportedLocationPointer?.remove();
      reportedLocationPointer = undefined;
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
      reportedLocationMarker = new MarkerConstructor({
        anchor: 'center',
        draggable: false,
        element: reportedLocationPointer,
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([coordinate.longitude, coordinate.latitude])
        .addTo(map);
    } else {
      reportedLocationMarker?.setLngLat([
        coordinate.longitude,
        coordinate.latitude,
      ]);
    }

    if (!hasReceivedFirstFix) {
      hasReceivedFirstFix = true;
      focusReportedLocation(true);
      return;
    }

    if (
      following &&
      (lastFollowedLocation === null ||
        distanceBetweenCoordinatesMetres(lastFollowedLocation, coordinate) >=
          followMovementThresholdMetres(lastFollowedLocation, coordinate))
    ) {
      focusReportedLocation(false, LIVE_FOLLOW_DURATION_MS);
    }
  };

  map.on('dragstart', handleDeliberatePan);

  return {
    focusPoint,
    focusRegion,
    resize(padding) {
      map.resize();
      if (padding) map.setPadding(padding);
    },
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
      markerInteraction.coordinateSelectionListener = null;
      followStateListener = null;
      markerInteraction.listener = null;
      regionInteraction.listener = null;
      map.off('click', handleCoordinateSelection);
      map.off('dragstart', handleDeliberatePan);
      setReportedLocation(null);
      renderAreas([]);
      renderPoints([]);
      renderRegions([]);
      map.remove();
    },
    recenterReportedLocation() {
      return focusReportedLocation(true);
    },
    setCoordinateSelectionListener(listener) {
      map.off('click', handleCoordinateSelection);
      markerInteraction.coordinateSelectionListener = listener;

      if (listener !== null) {
        map.on('click', handleCoordinateSelection);
      }
    },
    setAreas(areas) {
      renderAreas(areas);
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
      renderPoints(points);
    },
    setRegions(regions) {
      renderRegions(regions);
    },
    setRegionSelectionListener(listener) {
      regionInteraction.listener = listener;
    },
    setSelectedRegion(region) {
      regionInteraction.selectedRegionId = region?.id ?? null;
      setSelectedRegion(region);
    },
    setSelectedPoint(point) {
      const previousId = markerInteraction.selectedPointId;
      const nextId = point?.id ?? null;
      markerInteraction.selectedPointId = nextId;
      setSelectedRadius(point);
      if (previousId !== nextId) updateMarkerSelection(previousId, nextId);
    },
  };
}

function boundsForRegion(
  region: MapRegion,
): [[number, number], [number, number]] | null {
  const positions: Array<readonly number[]> = [];
  collectPositions(region.geometry.coordinates, positions);
  const valid = positions.filter(
    (position) =>
      position.length >= 2 &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1]),
  );
  if (valid.length === 0) return null;
  const longitudes = valid.map((position) => position[0]!);
  const latitudes = valid.map((position) => position[1]!);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

function collectPositions(
  value: unknown,
  positions: Array<readonly number[]>,
): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) {
    positions.push(value);
    return;
  }
  for (const nested of value) collectPositions(nested, positions);
}

function followMovementThresholdMetres(
  previous: ReportedMapLocation,
  next: ReportedMapLocation,
): number {
  const averageAccuracy = (previous.accuracyMetres + next.accuracyMetres) / 2;
  return Math.min(
    MAX_FOLLOW_MOVEMENT_METRES,
    Math.max(MIN_FOLLOW_MOVEMENT_METRES, averageAccuracy),
  );
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

  const initialCamera = configuration.initialBounds
    ? {
        bounds: configuration.initialBounds.map((coordinate) => [
          coordinate[0],
          coordinate[1],
        ]) as [[number, number], [number, number]],
        fitBoundsOptions: {
          padding: configuration.initialBoundsPadding ?? 24,
        },
      }
    : {
        center: [...configuration.center] as [number, number],
        zoom: configuration.zoom,
      };

  const usesStandardBasemap =
    configuration.styleUrl === 'mapbox://styles/mapbox/standard';
  const initialLightPreset = getCampusLightPreset();
  const map = new mapboxgl.Map({
    accessToken: configuration.accessToken,
    attributionControl: false,
    bearing: configuration.bearing,
    ...(usesStandardBasemap && {
      config: {
        basemap: {
          ...configuration.standardConfig,
          lightPreset: initialLightPreset,
        },
      },
    }),
    container,
    performanceMetricsCollection: false,
    pitch: configuration.pitch,
    respectPrefersReducedMotion: true,
    style: configuration.styleUrl,
    ...initialCamera,
  });

  map.addControl(
    new mapboxgl.NavigationControl({
      showCompass: false,
      showZoom: true,
      visualizePitch: true,
    }),
    'top-right',
  );
  if (configuration.showResetViewControl !== false) {
    map.addControl(new ResetViewControl(configuration), 'top-right');
  }
  map.addControl(
    new mapboxgl.AttributionControl({ compact: true }),
    'bottom-right',
  );

  const campusLayer = configuration.campusLayer;
  if (campusLayer) {
    map.on('style.load', () => {
      if (!signal.aborted) {
        addCampusDatasetLayers(map, campusLayer, usesStandardBasemap);
      }
    });
  }

  let layerVisibility = DEFAULT_MAP_LAYER_VISIBILITY;
  const markerInteraction = {
    coordinateSelectionListener: null as
      ((coordinate: MapCoordinate) => void) | null,
    listener: null as ((pointId: string) => void) | null,
    selectedPointId: null as string | null,
  };
  const regionInteraction = {
    listener: null as ((regionId: string) => void) | null,
    selectedRegionId: null as string | null,
  };
  const markerRecords = new Map<
    string,
    {
      button: HTMLButtonElement;
      handleDragEnd: () => void;
      marker: MapboxMarker;
    }
  >();
  const availabilityLabels = {
    active: 'available now',
    ended: 'ended',
    upcoming: 'upcoming',
  } as const;
  const trailStateLabels = {
    completed: 'completed trail stop',
    current: 'current trail stop',
    locked: 'locked trail stop',
    retired: 'retired trail stop',
    unavailable: 'unavailable trail stop',
  } as const;

  const renderPoints = (nextPoints: readonly MapPoint[]): void => {
    const pointIds = new Set(nextPoints.map((point) => point.id));

    for (const [pointId, record] of markerRecords) {
      if (!pointIds.has(pointId)) {
        record.marker.off('dragend', record.handleDragEnd);
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

        const marker: MapboxMarker = new mapboxgl.Marker({
          anchor: 'center',
          draggable: point.draggable === true,
          element: button,
        })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);
        const handleDragEnd = (): void => {
          const coordinate = marker.getLngLat();
          markerInteraction.coordinateSelectionListener?.({
            latitude: coordinate.lat,
            longitude: coordinate.lng,
          });
        };
        marker.on('dragend', handleDragEnd);
        record = { button, handleDragEnd, marker };
        markerRecords.set(point.id, record);
      } else {
        record.marker.setLngLat([point.longitude, point.latitude]);
        record.marker.setDraggable(point.draggable === true);
      }

      const availability = point.availability ?? 'active';
      const selected = markerInteraction.selectedPointId === point.id;
      const selectable = point.selectable !== false;
      record.button.className = [
        ...Array.from(record.button.classList).filter((name) =>
          name.startsWith('mapboxgl-'),
        ),
        'event-marker',
        `event-marker--${availability}`,
        point.trailState ? `event-marker--trail-${point.trailState}` : '',
        point.trailPosition === undefined ? '' : 'event-marker--numbered',
        ...(point.placementStates ?? []).map(
          (state) => `event-marker--placement-${state}`,
        ),
        selected ? 'event-marker--selected' : '',
        point.draggable ? 'event-marker--draggable' : '',
        point.reachable ? 'event-marker--reachable' : '',
      ]
        .filter(Boolean)
        .join(' ');
      record.button.disabled = !selectable;
      // Mapbox gives custom marker elements role="img" when constructing them.
      // These markers are interactive controls, including for keyboard users.
      record.button.setAttribute('role', 'button');
      record.button.dataset.trailState = point.trailState ?? '';
      record.button.dataset.trailPosition = String(point.trailPosition ?? '');
      record.button.dataset.placementStates =
        point.placementStates?.join(' ') ?? '';
      record.button.setAttribute(
        'aria-label',
        point.draggable
          ? `Focus ${point.label}. Drag the marker to adjust it, or use the coordinate fields for keyboard entry.`
          : point.trailState
            ? `${selectable ? 'Select ' : ''}${point.trailPosition === undefined ? '' : `Stop ${point.trailPosition}: `}${point.label}, ${trailStateLabels[point.trailState]}`
            : `Select ${point.label}, ${availabilityLabels[availability]}${point.reachable ? ', in range' : ''}`,
      );
      record.button.setAttribute('aria-pressed', String(selected));
      record.button.title = point.label;
      record.button.style.display = layerVisibility.events ? '' : 'none';
      const markerGlyph = record.button.querySelector('.event-marker__glyph');
      if (markerGlyph !== null) {
        markerGlyph.textContent = String(point.trailPosition ?? '');
      }
      const markerLabel = record.button.querySelector('.event-marker__label');
      if (markerLabel !== null) {
        markerLabel.textContent = point.label;
      }
    }
  };

  const updateMarkerSelection = (
    previousId: string | null,
    nextId: string | null,
  ): void => {
    for (const id of [previousId, nextId]) {
      if (id === null) continue;
      const button = markerRecords.get(id)?.button;
      if (!button) continue;
      const selected = id === nextId;
      button.classList.toggle('event-marker--selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  let currentRegions: readonly MapRegion[] = [];
  let overlayUpdatePending = false;
  let overlayUpdatesStopped = false;
  const updateOverlayWhenReady = (update: () => void): void => {
    if (overlayUpdatesStopped || signal.aborted) return;
    if (map.isStyleLoaded()) update();
    else overlayUpdatePending = true;
  };
  let territoryHandlersBound = false;
  const emptyRegions: FeatureCollection<Polygon | MultiPolygon> = {
    features: [],
    type: 'FeatureCollection',
  };
  const handleRegionSelect = (
    event: MapMouseEvent & { features?: Array<{ properties?: unknown }> },
  ): void => {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id === 'string') regionInteraction.listener?.(id);
  };
  const handleRegionEnter = (): void => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const handleRegionLeave = (): void => {
    map.getCanvas().style.cursor = '';
  };
  const syncRegions = (): void => {
    const data: FeatureCollection<Polygon | MultiPolygon> = {
      features: (layerVisibility.territories ? currentRegions : []).map(
        (region) => ({
          geometry: region.geometry,
          properties: {
            id: region.id,
            label: region.label,
            mapLabel: `${region.label}\n${
              region.status === 'suspended'
                ? 'Suspended'
                : region.ownerLabel
                  ? `Owned by ${region.ownerLabel}`
                  : 'Unclaimed'
            }`,
            ownerLabel: region.ownerLabel,
            selected: region.id === regionInteraction.selectedRegionId,
            status: region.status,
          },
          type: 'Feature',
        }),
      ),
      type: 'FeatureCollection',
    };
    const source = map.getSource(TERRITORY_SOURCE_ID) as
      | {
          setData: (
            nextData: FeatureCollection<Polygon | MultiPolygon>,
          ) => void;
        }
      | undefined;
    // Unrequested overlays have no features to display. Create them on the
    // first visible data update, retaining existing sources when cleared.
    if (source === undefined && data.features.length === 0) return;
    if (source === undefined) {
      map.addSource(TERRITORY_SOURCE_ID, {
        data: currentRegions.length === 0 ? emptyRegions : data,
        type: 'geojson',
      });
    } else {
      source.setData(data);
    }

    if (!map.getLayer(TERRITORY_FILL_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          id: TERRITORY_FILL_LAYER_ID,
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'status'], 'suspended'],
              '#7f8b9d',
              '#2a6bff',
            ],
            'fill-opacity': [
              'case',
              ['==', ['get', 'status'], 'suspended'],
              0.08,
              0.16,
            ],
          },
          slot: 'middle',
          source: TERRITORY_SOURCE_ID,
          type: 'fill',
        },
        usesStandardBasemap,
      );
    }
    if (!map.getLayer(TERRITORY_LINE_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          filter: [
            'all',
            ['==', ['get', 'status'], 'active'],
            ['==', ['get', 'selected'], false],
          ],
          id: TERRITORY_LINE_LAYER_ID,
          paint: {
            'line-color': '#e0c46c',
            'line-emissive-strength': 0.45,
            'line-opacity': 0.96,
            'line-width': 2.5,
          },
          slot: 'middle',
          source: TERRITORY_SOURCE_ID,
          type: 'line',
        },
        usesStandardBasemap,
      );
    }
    if (!map.getLayer(TERRITORY_SUSPENDED_LINE_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          filter: [
            'all',
            ['==', ['get', 'status'], 'suspended'],
            ['==', ['get', 'selected'], false],
          ],
          id: TERRITORY_SUSPENDED_LINE_LAYER_ID,
          paint: {
            'line-color': '#b3bdcc',
            'line-dasharray': [2, 2],
            'line-emissive-strength': 0.3,
            'line-opacity': 0.94,
            'line-width': 2.5,
          },
          slot: 'middle',
          source: TERRITORY_SOURCE_ID,
          type: 'line',
        },
        usesStandardBasemap,
      );
    }
    if (!map.getLayer(TERRITORY_SELECTED_LINE_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          filter: ['==', ['get', 'selected'], true],
          id: TERRITORY_SELECTED_LINE_LAYER_ID,
          paint: {
            'line-blur': 0.4,
            'line-color': '#54a8ff',
            'line-emissive-strength': 0.8,
            'line-opacity': 1,
            'line-width': 4,
          },
          slot: 'middle',
          source: TERRITORY_SOURCE_ID,
          type: 'line',
        },
        usesStandardBasemap,
      );
    }
    if (!map.getLayer(TERRITORY_LABEL_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          id: TERRITORY_LABEL_LAYER_ID,
          layout: {
            'text-field': ['get', 'mapLabel'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-line-height': 1.25,
            'text-size': 12,
          },
          paint: {
            'text-color': '#f7f3e7',
            'text-emissive-strength': 0.7,
            'text-halo-color': '#050b16',
            'text-halo-width': 1.75,
          },
          slot: 'top',
          source: TERRITORY_SOURCE_ID,
          type: 'symbol',
        },
        usesStandardBasemap,
      );
    }
    if (!territoryHandlersBound) {
      territoryHandlersBound = true;
      map.on('click', TERRITORY_FILL_LAYER_ID, handleRegionSelect);
      map.on('mouseenter', TERRITORY_FILL_LAYER_ID, handleRegionEnter);
      map.on('mouseleave', TERRITORY_FILL_LAYER_ID, handleRegionLeave);
    }
  };

  const renderRegions = (regions: readonly MapRegion[]): void => {
    currentRegions = regions;
    updateOverlayWhenReady(syncRegions);
  };

  map.on('style.load', syncRegions);
  if (map.isStyleLoaded()) syncRegions();

  let selectedRadiusPoint: MapPoint | null = null;
  const emptyRadius: FeatureCollection<Polygon> = {
    features: [],
    type: 'FeatureCollection',
  };
  const syncSelectedRadius = (): void => {
    const data: FeatureCollection<Polygon> = {
      features:
        !layerVisibility.radius ||
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

    if (source === undefined && data.features.length === 0) return;
    if (source === undefined) {
      map.addSource(EVENT_RADIUS_SOURCE_ID, {
        data: selectedRadiusPoint === null ? emptyRadius : data,
        type: 'geojson',
      });
    } else {
      source.setData(data);
    }

    if (!map.getLayer(EVENT_RADIUS_FILL_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          id: EVENT_RADIUS_FILL_LAYER_ID,
          paint: {
            'fill-color': '#2a6bff',
            'fill-opacity': 0.2,
          },
          slot: 'middle',
          source: EVENT_RADIUS_SOURCE_ID,
          type: 'fill',
        },
        usesStandardBasemap,
      );
    }

    if (!map.getLayer(EVENT_RADIUS_LINE_LAYER_ID)) {
      addApplicationLayer(
        map,
        {
          id: EVENT_RADIUS_LINE_LAYER_ID,
          paint: {
            'line-color': '#54a8ff',
            'line-emissive-strength': 0.75,
            'line-opacity': 0.9,
            'line-width': 2.5,
          },
          slot: 'middle',
          source: EVENT_RADIUS_SOURCE_ID,
          type: 'line',
        },
        usesStandardBasemap,
      );
    }
  };

  map.on('style.load', syncSelectedRadius);
  if (map.isStyleLoaded()) {
    syncSelectedRadius();
  }

  let currentAreas: readonly MapArea[] = [];
  const renderAreas = (areas: readonly MapArea[]): void => {
    currentAreas = areas;
    if (map.isStyleLoaded() && areas.length > 0) {
      syncPlacementAreas(map, areas, usesStandardBasemap);
      return;
    }
    const source = map.getSource(PLACEMENT_AREA_SOURCE_ID) as
      | {
          setData: (
            nextData: FeatureCollection<MultiPolygon | Polygon>,
          ) => void;
        }
      | undefined;
    source?.setData({ features: [], type: 'FeatureCollection' });
  };
  map.on('style.load', () => {
    if (currentAreas.length > 0)
      syncPlacementAreas(map, currentAreas, usesStandardBasemap);
  });

  const controller = createController(
    map,
    mapboxgl.Marker,
    renderPoints,
    updateMarkerSelection,
    markerInteraction,
    (point) => {
      selectedRadiusPoint = point;
      updateOverlayWhenReady(syncSelectedRadius);
    },
    regionInteraction,
    renderRegions,
    (region) => {
      regionInteraction.selectedRegionId = region?.id ?? null;
      updateOverlayWhenReady(syncRegions);
    },
    renderAreas,
  );
  const setBasemapProperty = (key: string, value: unknown): void => {
    // Standard setters re-evaluate style dependencies even for equal values.
    if (map.getConfigProperty('basemap', key) !== value) {
      map.setConfigProperty('basemap', key, value);
    }
  };
  const setLayerVisibility = (
    layerId: string,
    visibility: 'none' | 'visible' | ExpressionSpecification | undefined,
  ): void => {
    const current = map.getLayoutProperty(layerId, 'visibility') ?? 'visible';
    if (current !== visibility) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  };
  if (usesStandardBasemap) {
    let lightingStopped = false;
    let appliedLightPreset = initialLightPreset;
    const syncLighting = (force = false): void => {
      if (lightingStopped || signal.aborted || !map.isStyleLoaded()) return;
      const lightPreset = getCampusLightPreset();
      if (!force && lightPreset === appliedLightPreset) return;
      setBasemapProperty('lightPreset', lightPreset);
      appliedLightPreset = lightPreset;
    };
    const refreshLighting = (): void => syncLighting();
    const lightingInterval = window.setInterval(refreshLighting, 60_000);
    const stopLighting = (): void => {
      lightingStopped = true;
      window.clearInterval(lightingInterval);
      document.removeEventListener('visibilitychange', refreshLighting);
      window.removeEventListener('focus', refreshLighting);
      signal.removeEventListener('abort', stopLighting);
    };
    document.addEventListener('visibilitychange', refreshLighting);
    window.addEventListener('focus', refreshLighting);
    signal.addEventListener('abort', stopLighting, { once: true });
    map.on('style.load', () => syncLighting(true));
    map.on('remove', stopLighting);
    const removeMap = controller.remove;
    controller.remove = () => {
      stopLighting();
      removeMap();
    };
  }
  const classicLabelVisibility = new Map<
    string,
    'none' | 'visible' | ExpressionSpecification
  >();
  const syncBasemapVisibility = (): void => {
    if (usesStandardBasemap) {
      for (const key of [
        'show3dObjects',
        'show3dBuildings',
        'show3dLandmarks',
        'show3dTrees',
      ] as const) {
        setBasemapProperty(
          key,
          layerVisibility.details && configuration.standardConfig[key],
        );
      }
      for (const key of [
        'showPlaceLabels',
        'showPointOfInterestLabels',
        'showRoadLabels',
        'showTransitLabels',
      ]) {
        setBasemapProperty(
          key,
          layerVisibility.labels && configuration.standardConfig[key] !== false,
        );
      }
    } else {
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type !== 'symbol' || layer.id.startsWith('wits-')) continue;
        if (!classicLabelVisibility.has(layer.id)) {
          classicLabelVisibility.set(
            layer.id,
            layer.layout?.visibility ?? 'visible',
          );
        }
        setLayerVisibility(
          layer.id,
          layerVisibility.labels
            ? classicLabelVisibility.get(layer.id)
            : 'none',
        );
      }
    }
    if (map.getLayer(CAMPUS_BUILDING_LAYER_ID)) {
      setLayerVisibility(
        CAMPUS_BUILDING_LAYER_ID,
        layerVisibility.details ? 'visible' : 'none',
      );
    }
    if (map.getLayer(CAMPUS_LABEL_LAYER_ID)) {
      setLayerVisibility(
        CAMPUS_LABEL_LAYER_ID,
        layerVisibility.labels ? 'visible' : 'none',
      );
    }
  };
  map.on('style.load', () => {
    // Earlier style.load handlers already applied the latest overlay data.
    overlayUpdatePending = false;
    syncBasemapVisibility();
  });
  const flushPendingOverlayUpdate = (): void => {
    if (
      !overlayUpdatePending ||
      overlayUpdatesStopped ||
      signal.aborted ||
      !map.isStyleLoaded()
    )
      return;
    // Clear before writes: setData/config changes may emit data synchronously.
    overlayUpdatePending = false;
    syncSelectedRadius();
    syncRegions();
    syncBasemapVisibility();
  };
  // Source-worker activity can make isStyleLoaded false without a style reload.
  // Replay only pending state; unconditional setData here would create a loop.
  map.on('data', flushPendingOverlayUpdate);
  map.on('idle', flushPendingOverlayUpdate);
  const removeMap = controller.remove;
  controller.remove = () => {
    overlayUpdatesStopped = true;
    overlayUpdatePending = false;
    map.off('data', flushPendingOverlayUpdate);
    map.off('idle', flushPendingOverlayUpdate);
    removeMap();
  };
  controller.setLayerVisibility = (visibility) => {
    const basemapChanged =
      visibility.details !== layerVisibility.details ||
      visibility.labels !== layerVisibility.labels;
    layerVisibility = visibility;
    for (const { button } of markerRecords.values()) {
      button.style.display = visibility.events ? '' : 'none';
    }
    updateOverlayWhenReady(() => {
      syncSelectedRadius();
      syncRegions();
      if (basemapChanged) syncBasemapVisibility();
    });
  };
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
