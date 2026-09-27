import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMapboxMap,
  type CampusDataset,
  type MapRegion,
} from '../src/components/exploration/map-provider';

const mapboxState = vi.hoisted(() => ({
  addLayer: vi.fn(),
  addSource: vi.fn(),
  attributionOptions: [] as unknown[],
  canvasContainer: null as HTMLDivElement | null,
  controls: [] as Array<{ onAdd?: (map: unknown) => HTMLElement }>,
  easeTo: vi.fn(),
  fitBounds: vi.fn(),
  handlers: new Map<string, (...args: never[]) => void>(),
  isLoaded: false,
  isStyleLoaded: false,
  jumpTo: vi.fn(),
  mapConstructor: vi.fn(),
  markerConstructor: vi.fn(),
  markerDragEnd: null as (() => void) | null,
  markerElements: [] as HTMLElement[],
  markerLngLat: { lat: -26.19205, lng: 28.03038 },
  markerOff: vi.fn(),
  markerOn: vi.fn(),
  markerRemove: vi.fn(),
  markerSetDraggable: vi.fn(),
  markerSetLngLat: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  project: vi.fn(() => ({ x: 120, y: 80 })),
  remove: vi.fn(),
  resize: vi.fn(),
  setPadding: vi.fn(),
  sources: new Map<string, unknown>(),
  layers: new Set<string>(),
}));

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

vi.mock('mapbox-gl/esm', () => ({
  AttributionControl: class {
    public constructor(options: unknown) {
      mapboxState.attributionOptions.push(options);
    }
  },
  Map: class {
    public constructor(options: unknown) {
      mapboxState.mapConstructor(options);
    }

    public addControl(control: { onAdd?: (map: unknown) => HTMLElement }) {
      mapboxState.controls.push(control);
    }

    public addLayer = mapboxState.addLayer;

    public addSource = mapboxState.addSource;

    public getLayer(layerId: string) {
      return mapboxState.layers.has(layerId) ? {} : undefined;
    }

    public getSource(sourceId: string) {
      return mapboxState.sources.get(sourceId);
    }

    public getCanvasContainer() {
      return mapboxState.canvasContainer ?? document.createElement('div');
    }

    public easeTo = mapboxState.easeTo;

    public fitBounds = mapboxState.fitBounds;

    public getCanvas() {
      return mapboxState.canvasContainer ?? document.createElement('div');
    }

    public getZoom() {
      return 16.5;
    }

    public isStyleLoaded() {
      return mapboxState.isStyleLoaded;
    }

    public jumpTo = mapboxState.jumpTo;

    public loaded() {
      return mapboxState.isLoaded;
    }

    public on = (
      event: string,
      layerOrListener: string | ((...args: never[]) => void),
      layerListener?: (...args: never[]) => void,
    ) => {
      if (layerListener === undefined) {
        mapboxState.on(event, layerOrListener);
      } else {
        mapboxState.on(event, layerOrListener, layerListener);
      }
      const layer =
        typeof layerOrListener === 'string' ? layerOrListener : null;
      const listener = layer === null ? layerOrListener : layerListener;
      if (typeof listener !== 'function') return this;
      const key = layer === null ? event : `${event}:${layer}`;
      const previous = mapboxState.handlers.get(key);
      mapboxState.handlers.set(key, (...args: never[]) => {
        previous?.(...args);
        listener(...args);
      });
      return this;
    };

    public once = (event: string, listener: (...args: never[]) => void) => {
      mapboxState.once(event, listener);
      mapboxState.handlers.set(event, listener);
    };

    public off = mapboxState.off;

    public project = mapboxState.project;

    public remove = mapboxState.remove;
    public resize = mapboxState.resize;
    public setPadding = mapboxState.setPadding;
  },
  Marker: class {
    private readonly element?: HTMLElement;

    public constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element;
      mapboxState.markerConstructor(options);
      if (options?.element) {
        options.element.setAttribute('role', 'img');
        options.element.classList.add(
          'mapboxgl-marker',
          'mapboxgl-marker-anchor-center',
        );
        mapboxState.markerElements.push(options.element);
      }
    }

    public addTo() {
      if (this.element) {
        mapboxState.canvasContainer?.append(this.element);
      }
      return this;
    }

    public getLngLat() {
      return mapboxState.markerLngLat;
    }

    public off = (event: string, listener: () => void) => {
      mapboxState.markerOff(event, listener);
      if (event === 'dragend' && mapboxState.markerDragEnd === listener) {
        mapboxState.markerDragEnd = null;
      }
      return this;
    };

    public on = (event: string, listener: () => void) => {
      mapboxState.markerOn(event, listener);
      if (event === 'dragend') mapboxState.markerDragEnd = listener;
      return this;
    };

    public remove = () => {
      this.element?.remove();
      mapboxState.markerRemove();
    };

    public setDraggable = (draggable: boolean) => {
      mapboxState.markerSetDraggable(draggable);
      return this;
    };

    public setLngLat(coordinate: [number, number]) {
      mapboxState.markerSetLngLat(coordinate);
      mapboxState.markerLngLat = { lat: coordinate[1], lng: coordinate[0] };
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
  mapboxState.attributionOptions.length = 0;
  mapboxState.controls.length = 0;
  mapboxState.handlers.clear();
  mapboxState.sources.clear();
  mapboxState.layers.clear();
  mapboxState.isLoaded = false;
  mapboxState.isStyleLoaded = false;
  mapboxState.markerElements.length = 0;
  mapboxState.markerDragEnd = null;
  mapboxState.markerLngLat = { lat: -26.19205, lng: 28.03038 };
  mapboxState.addLayer.mockClear();
  mapboxState.addLayer.mockImplementation((layer: { id: string }) => {
    mapboxState.layers.add(layer.id);
  });
  mapboxState.addSource.mockClear();
  mapboxState.addSource.mockImplementation(
    (sourceId: string, source: { data?: unknown }) => {
      mapboxState.sources.set(sourceId, {
        ...source,
        setData: vi.fn(),
      });
    },
  );
  mapboxState.easeTo.mockClear();
  mapboxState.fitBounds.mockClear();
  mapboxState.jumpTo.mockClear();
  mapboxState.mapConstructor.mockClear();
  mapboxState.markerConstructor.mockClear();
  mapboxState.markerOff.mockClear();
  mapboxState.markerOn.mockClear();
  mapboxState.markerRemove.mockClear();
  mapboxState.markerSetDraggable.mockClear();
  mapboxState.markerSetLngLat.mockClear();
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
    expect(mapboxState.attributionOptions).toContainEqual({ compact: true });
  });

  it('fits an explicit initial authoring area instead of forcing one zoom level', async () => {
    const initialBounds = [
      [28.0185, -26.195],
      [28.034, -26.1845],
    ] as const;

    await createMapboxMap(
      document.createElement('div'),
      {
        ...configuration,
        initialBounds,
        initialBoundsPadding: 32,
      },
      [],
      new AbortController().signal,
    );

    const options = mapboxState.mapConstructor.mock.calls[0]?.[0];
    expect(options).toEqual(
      expect.objectContaining({
        bounds: [
          [28.0185, -26.195],
          [28.034, -26.1845],
        ],
        fitBoundsOptions: { padding: 32 },
      }),
    );
    expect(options).not.toHaveProperty('center');
    expect(options).not.toHaveProperty('zoom');
  });

  it('renders keyboard-selectable event markers with selected and reachable semantics', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [
        {
          availability: 'active',
          id: 'event-1',
          label: 'Great Hall Quest',
          latitude: -26.19205,
          longitude: 28.03038,
          radiusMetres: 75,
          reachable: true,
        },
      ],
      new AbortController().signal,
    );
    const listener = vi.fn();
    controller.setPointSelectionListener?.(listener);
    controller.setSelectedPoint?.({
      availability: 'active',
      id: 'event-1',
      label: 'Great Hall Quest',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
      reachable: true,
    });

    const marker = mapboxState.markerElements[0] as HTMLButtonElement;
    expect(marker).toHaveAttribute('role', 'button');
    expect(marker).toHaveClass(
      'mapboxgl-marker',
      'mapboxgl-marker-anchor-center',
    );
    expect(marker.tagName).toBe('BUTTON');
    expect(marker).toHaveAttribute('aria-pressed', 'true');
    expect(marker).toHaveAttribute(
      'aria-label',
      'Select Great Hall Quest, available now, in range',
    );
    expect(marker).toHaveClass('event-marker--selected');
    expect(marker).toHaveClass('event-marker--reachable');
    marker.click();
    expect(listener).toHaveBeenCalledWith('event-1');
  });

  it('represents ordered trail states and only lets the current stop open from the map', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [
        {
          id: 'completed-stop',
          label: 'Great Hall',
          latitude: -26.19205,
          longitude: 28.03038,
          selectable: false,
          trailState: 'completed',
        },
        {
          id: 'current-stop',
          label: 'Senate House',
          latitude: -26.19195,
          longitude: 28.03048,
          selectable: true,
          trailState: 'current',
        },
        {
          id: 'locked-stop',
          label: 'Origins Centre',
          latitude: -26.19185,
          longitude: 28.03058,
          selectable: false,
          trailState: 'locked',
        },
        {
          id: 'unavailable-stop',
          label: 'Old Fort',
          latitude: -26.19175,
          longitude: 28.03068,
          selectable: false,
          trailState: 'unavailable',
        },
        {
          id: 'retired-stop',
          label: 'Former Observatory',
          latitude: -26.19165,
          longitude: 28.03078,
          selectable: false,
          trailState: 'retired',
        },
      ],
      new AbortController().signal,
    );
    const listener = vi.fn();
    controller.setPointSelectionListener?.(listener);

    const completed = mapboxState.markerElements[0] as HTMLButtonElement;
    const current = mapboxState.markerElements[1] as HTMLButtonElement;
    const locked = mapboxState.markerElements[2] as HTMLButtonElement;
    const unavailable = mapboxState.markerElements[3] as HTMLButtonElement;
    const retired = mapboxState.markerElements[4] as HTMLButtonElement;
    expect(completed).toBeDisabled();
    expect(completed).toHaveClass('event-marker--trail-completed');
    expect(completed).toHaveAttribute(
      'aria-label',
      'Great Hall, completed trail stop',
    );
    expect(current).toBeEnabled();
    expect(current).toHaveClass('event-marker--trail-current');
    expect(current).toHaveAttribute(
      'aria-label',
      'Select Senate House, current trail stop',
    );
    expect(locked).toBeDisabled();
    expect(locked).toHaveClass('event-marker--trail-locked');
    expect(locked).toHaveAttribute(
      'aria-label',
      'Origins Centre, locked trail stop',
    );
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveClass('event-marker--trail-unavailable');
    expect(unavailable).toHaveAttribute(
      'aria-label',
      'Old Fort, unavailable trail stop',
    );
    expect(retired).toBeDisabled();
    expect(retired).toHaveClass('event-marker--trail-retired');
    expect(retired).toHaveAttribute(
      'aria-label',
      'Former Observatory, retired trail stop',
    );

    completed.click();
    locked.click();
    unavailable.click();
    retired.click();
    expect(listener).not.toHaveBeenCalled();
    current.click();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('current-stop');
  });

  it('renders and replaces only the selected event geodesic source', async () => {
    mapboxState.isStyleLoaded = true;
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const source = mapboxState.sources.get('wits-selected-event-radius') as {
      setData: ReturnType<typeof vi.fn>;
    };
    controller.setSelectedPoint?.({
      id: 'event-1',
      label: 'Great Hall',
      latitude: -26.19205,
      longitude: 28.03038,
      radiusMetres: 75,
    });

    expect(source.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            geometry: expect.objectContaining({ type: 'Polygon' }),
          }),
        ],
      }),
    );
    controller.setSelectedPoint?.(null);
    expect(source.setData).toHaveBeenLastCalledWith({
      features: [],
      type: 'FeatureCollection',
    });
    expect(
      mapboxState.addLayer.mock.calls.find(
        ([layer]) => layer.id === 'wits-selected-event-radius-fill',
      )?.[0],
    ).toMatchObject({ slot: 'middle', type: 'fill' });
  });

  it('renders selectable territory regions and fits the selected geometry', async () => {
    mapboxState.isStyleLoaded = true;
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const region: MapRegion = {
      geometry: {
        coordinates: [
          [
            [28.029, -26.193],
            [28.032, -26.193],
            [28.032, -26.19],
            [28.029, -26.193],
          ],
        ],
        type: 'Polygon',
      },
      id: 'zone-1',
      label: 'East Campus',
      ownerLabel: 'blue_witsie',
      status: 'active',
    };
    const listener = vi.fn();

    controller.setRegionSelectionListener?.(listener);
    controller.setRegions?.([region]);
    controller.setSelectedRegion?.(region);

    const source = mapboxState.sources.get('wits-territory-regions') as {
      setData: ReturnType<typeof vi.fn>;
    };
    expect(source.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({
              id: 'zone-1',
              mapLabel: 'East Campus\nOwned by blue_witsie',
              selected: true,
            }),
          }),
        ],
      }),
    );

    const click = mapboxState.handlers.get('click:wits-territory-fill') as
      | ((event: { features: Array<{ properties: { id: string } }> }) => void)
      | undefined;
    click?.({ features: [{ properties: { id: 'zone-1' } }] });
    expect(listener).toHaveBeenCalledWith('zone-1');

    expect(controller.focusRegion?.(region)).toBe(true);
    expect(mapboxState.fitBounds).toHaveBeenCalledWith(
      [
        [28.029, -26.193],
        [28.032, -26.19],
      ],
      { duration: 650, maxZoom: 17, padding: 72 },
    );
    expect(mapboxState.addLayer.mock.calls.map(([layer]) => layer.id)).toEqual(
      expect.arrayContaining([
        'wits-territory-fill',
        'wits-territory-line',
        'wits-territory-suspended-line',
        'wits-territory-selected-line',
        'wits-territory-label',
      ]),
    );
    const activeLine = mapboxState.addLayer.mock.calls.find(
      ([layer]) => layer.id === 'wits-territory-line',
    )?.[0];
    expect(activeLine).toMatchObject({
      filter: [
        'all',
        ['==', ['get', 'status'], 'active'],
        ['==', ['get', 'selected'], false],
      ],
      paint: {
        'line-color': '#e0c46c',
        'line-emissive-strength': 0.45,
        'line-opacity': 0.96,
        'line-width': 2.5,
      },
    });
  });

  it('makes only opted-in author markers draggable and reports their final coordinate', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [
        {
          draggable: true,
          id: 'author-event-position',
          label: 'selected event location',
          latitude: -26.19205,
          longitude: 28.03038,
          radiusMetres: 75,
        },
      ],
      new AbortController().signal,
    );
    const listener = vi.fn();
    controller.setCoordinateSelectionListener?.(listener);

    expect(mapboxState.markerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ draggable: true }),
    );
    expect(mapboxState.markerElements[0]).toHaveAttribute(
      'aria-label',
      'Focus selected event location. Drag the marker to adjust it, or use the coordinate fields for keyboard entry.',
    );
    mapboxState.markerLngLat = { lat: -26.1907, lng: 28.0289 };
    mapboxState.markerDragEnd?.();
    expect(listener).toHaveBeenCalledWith({
      latitude: -26.1907,
      longitude: 28.0289,
    });

    controller.setPoints([
      {
        draggable: false,
        id: 'author-event-position',
        label: 'selected event location',
        latitude: -26.1907,
        longitude: 28.0289,
      },
    ]);
    expect(mapboxState.markerSetDraggable).toHaveBeenLastCalledWith(false);
    controller.remove();
    expect(mapboxState.markerOff).toHaveBeenCalledWith(
      'dragend',
      expect.any(Function),
    );
  });

  it('centres the first fix, stops following after a drag, and recentres without resetting camera language', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const followListener = vi.fn();
    controller.setFollowStateListener?.(followListener);
    controller.setReportedLocation({
      accuracyMetres: 12,
      latitude: -26.19205,
      longitude: 28.03038,
    });
    expect(mapboxState.easeTo).toHaveBeenLastCalledWith({
      center: [28.03038, -26.19205],
      duration: 700,
      zoom: 17,
    });
    expect(followListener).toHaveBeenLastCalledWith(true);

    mapboxState.handlers.get('dragstart')?.();
    expect(followListener).toHaveBeenLastCalledWith(false);
    controller.recenterReportedLocation?.();
    expect(followListener).toHaveBeenLastCalledWith(true);
    expect(mapboxState.easeTo).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        bearing: expect.anything(),
        pitch: expect.anything(),
      }),
    );
  });

  it('does not chase accuracy-sized jitter while following', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    controller.setReportedLocation({
      accuracyMetres: 25,
      latitude: -26.19205,
      longitude: 28.03038,
    });
    mapboxState.easeTo.mockClear();

    controller.setReportedLocation({
      accuracyMetres: 25,
      latitude: -26.192,
      longitude: 28.03038,
    });
    expect(mapboxState.easeTo).not.toHaveBeenCalled();

    controller.setReportedLocation({
      accuracyMetres: 25,
      latitude: -26.1917,
      longitude: 28.03038,
    });
    expect(mapboxState.easeTo).toHaveBeenCalledWith({
      center: [28.03038, -26.1917],
      duration: 250,
    });
  });

  it('centres a selected event and suspends location following', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const followListener = vi.fn();
    controller.setFollowStateListener?.(followListener);
    controller.setReportedLocation({
      accuracyMetres: 12,
      latitude: -26.19205,
      longitude: 28.03038,
    });

    controller.focusPoint({
      id: 'event-2',
      label: 'Library Quest',
      latitude: -26.1914,
      longitude: 28.0311,
      radiusMetres: 60,
    });

    expect(followListener).toHaveBeenLastCalledWith(false);
    expect(mapboxState.easeTo).toHaveBeenLastCalledWith({
      center: [28.0311, -26.1914],
      duration: 650,
      zoom: 17,
    });
    controller.recenterReportedLocation?.();
    expect(followListener).toHaveBeenLastCalledWith(true);
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

  it('reports recoverable provider errors separately from WebGL context loss', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const recoverableListener = vi.fn();
    const fatalListener = vi.fn();

    controller.onError(recoverableListener);
    controller.onFatalError?.(fatalListener);

    expect(mapboxState.on).toHaveBeenCalledWith('error', recoverableListener);
    expect(mapboxState.on).toHaveBeenCalledWith(
      'webglcontextlost',
      fatalListener,
    );
  });

  it('anchors the local reported-location element with a viewport-aligned Mapbox marker', async () => {
    const controller = await createMapboxMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );

    controller.setReportedLocation({
      accuracyMetres: 12,
      latitude: -26.19205,
      longitude: 28.03038,
    });

    const pointer = mapboxState.canvasContainer?.querySelector(
      '[data-map-reported-location]',
    );
    expect(pointer).toHaveAttribute('aria-hidden', 'true');
    expect(pointer).toHaveAttribute('title', 'Reported location');
    expect(mapboxState.markerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'center',
        draggable: false,
        element: pointer,
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      }),
    );
    expect(mapboxState.markerSetLngLat).toHaveBeenCalledWith([
      28.03038, -26.19205,
    ]);
    expect(mapboxState.project).not.toHaveBeenCalled();
    expect(
      mapboxState.addSource.mock.calls.some(([sourceId]) =>
        String(sourceId).includes('player'),
      ),
    ).toBe(false);

    controller.setReportedLocation(null);

    expect(
      mapboxState.canvasContainer?.querySelector(
        '[data-map-reported-location]',
      ),
    ).not.toBeInTheDocument();
    expect(mapboxState.markerRemove).toHaveBeenCalledOnce();
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

  it('omits the reset control when a flat map does not need it', async () => {
    await createMapboxMap(
      document.createElement('div'),
      { ...configuration, showResetViewControl: false },
      [],
      new AbortController().signal,
    );

    expect(mapboxState.controls).toHaveLength(2);
    expect(mapboxState.controls.some((control) => control.onAdd)).toBe(false);
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
      accuracyMetres: 12,
      latitude: -26.19205,
      longitude: 28.03038,
    });
    controller.remove();
    expect(mapboxState.markerRemove).toHaveBeenCalledTimes(2);
    expect(
      mapboxState.canvasContainer?.querySelector(
        '[data-map-reported-location]',
      ),
    ).not.toBeInTheDocument();
    expect(mapboxState.remove).toHaveBeenCalledOnce();
  });
});
