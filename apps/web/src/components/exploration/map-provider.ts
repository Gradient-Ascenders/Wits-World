import type { FeatureCollection, Geometry } from 'geojson';
import type {
  IControl,
  Map as MapboxMap,
  Marker as MapboxMarker,
} from 'mapbox-gl/esm';

export interface MapPoint {
  id: string;
  label: string;
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
  onError: (listener: () => void) => void;
  onLoad: (listener: () => void) => void;
  remove: () => void;
  setPoints: (points: readonly MapPoint[]) => void;
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
  setPoints: (points: readonly MapPoint[]) => void,
): MapController {
  return {
    onError(listener) {
      map.on('error', listener);
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
      setPoints([]);
      map.remove();
    },
    setPoints,
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
      showCompass: true,
      showZoom: true,
      visualizePitch: true,
    }),
    'top-right',
  );
  map.addControl(new ResetViewControl(configuration), 'top-right');
  map.addControl(
    new mapboxgl.AttributionControl({ compact: false }),
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

  let markers: MapboxMarker[] = [];
  const setPoints = (nextPoints: readonly MapPoint[]) => {
    for (const marker of markers) {
      marker.remove();
    }

    markers = nextPoints.map((point) => {
      const markerElement = document.createElement('span');
      markerElement.className = 'event-marker';
      markerElement.setAttribute('aria-hidden', 'true');
      markerElement.title = point.label;

      return new mapboxgl.Marker({ anchor: 'bottom', element: markerElement })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
    });
  };

  setPoints(points);

  return createController(map, setPoints);
};
