import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export interface MapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface MapConfiguration {
  center: readonly [longitude: number, latitude: number];
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

function createController(
  map: MapLibreMap,
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
      map.remove();
    },
    setPoints,
  };
}

export const createMapLibreMap: MapFactory = async (
  container,
  configuration,
  points,
  signal,
) => {
  const [maplibre] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);

  if (signal.aborted) {
    throw new Error('Map creation was cancelled.');
  }

  maplibre.setWorkerUrl(mapLibreWorkerUrl);

  const map = new maplibre.Map({
    attributionControl: { compact: false },
    center: [...configuration.center],
    container,
    style: configuration.styleUrl,
    zoom: configuration.zoom,
  });

  map.addControl(
    new maplibre.NavigationControl({ showCompass: false }),
    'top-right',
  );

  let markers: MapLibreMarker[] = [];
  const setPoints = (nextPoints: readonly MapPoint[]) => {
    for (const marker of markers) {
      marker.remove();
    }

    markers = nextPoints.map((point) => {
      const markerElement = document.createElement('span');
      markerElement.className = 'event-marker';
      markerElement.setAttribute('aria-hidden', 'true');
      markerElement.title = point.label;

      return new maplibre.Marker({ anchor: 'bottom', element: markerElement })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
    });
  };

  setPoints(points);

  return createController(map, setPoints);
};
