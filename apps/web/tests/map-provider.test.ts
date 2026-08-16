import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMapboxMap,
  type CampusDataset,
} from '../src/components/exploration/map-provider';

const mapboxState = vi.hoisted(() => ({
  addLayer: vi.fn(),
  addSource: vi.fn(),
  canvasContainer: null as HTMLDivElement | null,
  controls: [] as Array<{ onAdd?: (map: unknown) => HTMLElement }>,
  handlers: new Map<string, (...args: never[]) => void>(),
  isLoaded: false,
  jumpTo: vi.fn(),
  mapConstructor: vi.fn(),
  markerConstructor: vi.fn(),
  markerRemove: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  project: vi.fn(() => ({ x: 120, y: 80 })),
  remove: vi.fn(),
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

vi.mock('mapbox-gl/esm', () => ({
  AttributionControl: class {},
  Map: class {
    public constructor(options: unknown) {
      mapboxState.mapConstructor(options);
    }

    public addControl(control: { onAdd?: (map: unknown) => HTMLElement }) {
      mapboxState.controls.push(control);
    }

    public addLayer = mapboxState.addLayer;

    public addSource = mapboxState.addSource;

    public getLayer() {
      return undefined;
    }

    public getSource() {
      return undefined;
    }

    public getCanvasContainer() {
      return mapboxState.canvasContainer ?? document.createElement('div');
    }

    public jumpTo = mapboxState.jumpTo;

    public loaded() {
      return mapboxState.isLoaded;
    }

    public on = (event: string, listener: (...args: never[]) => void) => {
      mapboxState.on(event, listener);
      mapboxState.handlers.set(event, listener);
    };

    public once = (event: string, listener: (...args: never[]) => void) => {
      mapboxState.once(event, listener);
      mapboxState.handlers.set(event, listener);
    };

    public off = mapboxState.off;

    public project = mapboxState.project;

    public remove = mapboxState.remove;
  },
  Marker: class {
    public constructor() {
      mapboxState.markerConstructor();
    }

    public addTo() {
      return this;
    }

    public remove = mapboxState.markerRemove;

    public setLngLat() {
      return this;
    }
  },
  NavigationControl: class {},
}));

const configuration = {
  accessToken: 'pk.test-token',
  bearing: 20,
  center: [28.03038, -26.19205] as const,
  pitch: 52,
  standardConfig: {
    lightPreset: 'dusk' as const,
    show3dBuildings: true,
    show3dLandmarks: true,
    show3dObjects: true,
    show3dTrees: true,
    showPedestrianRoads: true,
  },
  styleUrl: 'mapbox://styles/mapbox/standard',
  zoom: 16.5,
};

beforeEach(() => {
  mapboxState.canvasContainer = document.createElement('div');
  mapboxState.controls.length = 0;
  mapboxState.handlers.clear();
  mapboxState.isLoaded = false;
  mapboxState.addLayer.mockClear();
  mapboxState.addSource.mockClear();
  mapboxState.jumpTo.mockClear();
  mapboxState.mapConstructor.mockClear();
  mapboxState.markerConstructor.mockClear();
  mapboxState.markerRemove.mockClear();
  mapboxState.off.mockClear();
  mapboxState.on.mockClear();
  mapboxState.once.mockClear();
  mapboxState.project.mockClear();
  mapboxState.remove.mockClear();
});

describe('Mapbox Standard provider', () => {
  it('fails before construction when the public token is absent', async () => {
    await expect(
      createMapboxMap(
        document.createElement('div'),
        { ...configuration, accessToken: ' ' },
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow('Mapbox access token is not configured.');

    expect(mapboxState.mapConstructor).not.toHaveBeenCalled();
  });

  it('constructs Mapbox with Standard 3D configuration and no telemetry collection', async () => {
    await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );

    expect(mapboxState.mapConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'pk.test-token',
        bearing: 20,
        config: { basemap: configuration.standardConfig },
        performanceMetricsCollection: false,
        pitch: 52,
        respectPrefersReducedMotion: true,
        style: 'mapbox://styles/mapbox/standard',
        zoom: 16.5,
      }),
    );
  });

  it('reports a map that loaded before the consumer registered its listener', async () => {
    mapboxState.isLoaded = true;
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onLoad(listener);

    expect(listener).toHaveBeenCalledOnce();
    expect(mapboxState.once).not.toHaveBeenCalled();
  });

  it('waits for Mapbox when the map has not loaded yet', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onLoad(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(mapboxState.once).toHaveBeenCalledWith('load', listener);
  });

  it('reports provider errors and WebGL context loss', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onError(listener);

    expect(mapboxState.on).toHaveBeenCalledWith('error', listener);
    expect(mapboxState.on).toHaveBeenCalledWith('webglcontextlost', listener);
  });

  it('renders the reported location as a local overlay without a Mapbox marker', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );

    controller.setReportedLocation({
      latitude: -26.19205,
      longitude: 28.03038,
    });

    const pointer = mapboxState.canvasContainer?.querySelector(
      '[data-map-reported-location]',
    );
    expect(pointer).toHaveAttribute('aria-hidden', 'true');
    expect(pointer).toHaveAttribute('title', 'Reported location');
    expect(mapboxState.project).toHaveBeenCalledWith([28.03038, -26.19205]);
    expect(pointer).toHaveStyle(
      'transform: translate3d(120px, 80px, 0) translate(-50%, -100%)',
    );
    expect(mapboxState.markerConstructor).not.toHaveBeenCalled();

    controller.setReportedLocation(null);

    expect(
      mapboxState.canvasContainer?.querySelector(
        '[data-map-reported-location]',
      ),
    ).not.toBeInTheDocument();
  });

  it('reports optional author coordinate selection without making the map required', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.setCoordinateSelectionListener?.(listener);
    expect(mapboxState.on).toHaveBeenCalledWith('click', expect.any(Function));

    const clickHandler = mapboxState.handlers.get('click') as
      ((event: { lngLat: { lat: number; lng: number } }) => void) | undefined;
    clickHandler?.({ lngLat: { lat: -26.1915, lng: 28.031 } });

    expect(listener).toHaveBeenCalledWith({
      latitude: -26.1915,
      longitude: 28.031,
    });
    controller.setCoordinateSelectionListener?.(null);
    expect(mapboxState.off).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('provides an accessible reset control for bearing and pitch', async () => {
    await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );

    const resetControl = mapboxState.controls.find((control) => control.onAdd);
    const controlContainer = resetControl?.onAdd?.({
      jumpTo: mapboxState.jumpTo,
    });
    const button = controlContainer?.querySelector('button');

    expect(button).toHaveAttribute('aria-label', 'Reset map bearing and pitch');
    button?.click();
    expect(mapboxState.jumpTo).toHaveBeenCalledWith({ bearing: 20, pitch: 52 });
  });

  it('adds a future licensed campus dataset through Standard slots without deriving unapproved building heights', async () => {
    const dataset = {
      features: [
        {
          geometry: {
            coordinates: [],
            type: 'Polygon',
          },
          properties: {
            approvedName: 'Approved building name',
            buildingId: 'building-001',
            heightM: 12,
            kind: 'building',
          },
          type: 'Feature',
        },
      ],
      type: 'FeatureCollection',
    } as CampusDataset;

    await createMapboxMap(
      document.createElement('div'),
      {
        ...configuration,
        campusLayer: {
          dataset,
          metadata: {
            lastVerified: '2026-08-13',
            licence: 'Pending licensed source',
            source: 'Pending licensed Wits dataset',
          },
          replaceStandardBuildings: true,
        },
      },
      [],
      new AbortController().signal,
    );

    mapboxState.handlers.get('style.load')?.();

    expect(mapboxState.addSource).toHaveBeenCalledWith(
      'wits-campus-data',
      expect.objectContaining({
        attribution:
          'Pending licensed Wits dataset · Pending licensed source (verified 2026-08-13)',
        data: dataset,
        type: 'geojson',
      }),
    );
    const layers = mapboxState.addLayer.mock.calls.map(([layer]) => layer);
    const buildingLayer = layers.find(
      (layer) => layer.id === 'wits-campus-buildings',
    );
    const clipLayer = layers.find(
      (layer) => layer.id === 'wits-campus-building-clip',
    );

    expect(buildingLayer).toMatchObject({
      paint: {
        'fill-extrusion-height': ['get', 'heightM'],
      },
      slot: 'middle',
      type: 'fill-extrusion',
    });
    expect(buildingLayer).not.toHaveProperty(
      'paint.fill-extrusion-height',
      expect.arrayContaining(['get', 'levels']),
    );
    expect(clipLayer).toMatchObject({
      layout: {
        'clip-layer-scope': ['basemap'],
        'clip-layer-types': ['model', 'symbol'],
      },
      slot: 'middle',
      type: 'clip',
    });
  });

  it('does not construct a map after an aborted lazy import and does not call the live network', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      createMapboxMap(
        document.createElement('div'),
        configuration,
        [],
        abortController.signal,
      ),
    ).rejects.toThrow('Map creation was cancelled.');

    expect(mapboxState.mapConstructor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('cleans up the Mapbox map and event markers', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [
        {
          id: 'event-1',
          label: 'Event 1',
          latitude: -26.19205,
          longitude: 28.03038,
        },
      ],
      new AbortController().signal,
    );

    controller.setReportedLocation({
      latitude: -26.19205,
      longitude: 28.03038,
    });
    controller.remove();
    expect(mapboxState.markerRemove).toHaveBeenCalledOnce();
    expect(
      mapboxState.canvasContainer?.querySelector(
        '[data-map-reported-location]',
      ),
    ).not.toBeInTheDocument();
    expect(mapboxState.remove).toHaveBeenCalledOnce();
  });
});
