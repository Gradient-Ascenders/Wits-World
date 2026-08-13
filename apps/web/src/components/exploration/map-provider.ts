import type { Map as MapLibreMap } from 'maplibre-gl';

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
}

export type MapFactory = (
  container: HTMLElement,
  configuration: MapConfiguration,
  points: readonly MapPoint[],
) => Promise<MapController>;

function createController(map: MapLibreMap): MapController {
  return {
    onError(listener) {
      map.on('error', listener);
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
  };
}

export const createMapLibreMap: MapFactory = async (
  container,
  configuration,
  points,
) => {
  const maplibre = await import('maplibre-gl');
  await import('maplibre-gl/dist/maplibre-gl.css');

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

  for (const point of points) {
    const markerElement = document.createElement('span');
    markerElement.className = 'event-marker';
    markerElement.setAttribute('aria-hidden', 'true');
    markerElement.title = point.label;

    new maplibre.Marker({ anchor: 'bottom', element: markerElement })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
  }

  return createController(map);
};
