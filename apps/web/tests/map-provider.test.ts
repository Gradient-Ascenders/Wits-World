import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapLibreMap } from '../src/components/exploration/map-provider';

const mapLibreState = vi.hoisted(() => ({
  isLoaded: false,
  mapConstructor: vi.fn(),
  markerRemove: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  setWorkerUrl: vi.fn(),
}));

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: '/assets/maplibre-worker.test.js',
}));

vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      mapLibreState.mapConstructor();
    }

    public addControl() {}

    public loaded() {
      return mapLibreState.isLoaded;
    }

    public on = mapLibreState.on;

    public once = mapLibreState.once;

    public remove() {}
  },
  Marker: class {
    public addTo() {
      return this;
    }

    public remove = mapLibreState.markerRemove;

    public setLngLat() {
      return this;
    }
  },
  NavigationControl: class {},
  setWorkerUrl: mapLibreState.setWorkerUrl,
}));

const configuration = {
  center: [28.03038, -26.19205] as const,
  styleUrl: 'https://maps.example.test/style.json',
  zoom: 16,
};

beforeEach(() => {
  mapLibreState.isLoaded = false;
  mapLibreState.mapConstructor.mockClear();
  mapLibreState.markerRemove.mockClear();
  mapLibreState.on.mockClear();
  mapLibreState.once.mockClear();
  mapLibreState.setWorkerUrl.mockClear();
});

describe('MapLibre provider', () => {
  it("configures Vite's bundled worker before constructing the map", async () => {
    await createMapLibreMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );

    expect(mapLibreState.setWorkerUrl).toHaveBeenCalledWith(
      '/assets/maplibre-worker.test.js',
    );
    expect(mapLibreState.setWorkerUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mapLibreState.mapConstructor.mock.invocationCallOrder[0]!,
    );
  });

  it('reports a map that loaded before the consumer registered its listener', async () => {
    mapLibreState.isLoaded = true;
    const controller = await createMapLibreMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onLoad(listener);

    expect(listener).toHaveBeenCalledOnce();
    expect(mapLibreState.once).not.toHaveBeenCalled();
  });

  it('waits for MapLibre when the map has not loaded yet', async () => {
    const controller = await createMapLibreMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onLoad(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(mapLibreState.once).toHaveBeenCalledWith('load', listener);
  });

  it('reports both provider errors and WebGL context loss', async () => {
    const controller = await createMapLibreMap(
      document.createElement('div'),
      configuration,
      [],
      new AbortController().signal,
    );
    const listener = vi.fn();

    controller.onError(listener);

    expect(mapLibreState.on).toHaveBeenCalledWith('error', listener);
    expect(mapLibreState.on).toHaveBeenCalledWith('webglcontextlost', listener);
  });

  it('does not construct an obsolete map after asynchronous imports finish', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      createMapLibreMap(
        document.createElement('div'),
        configuration,
        [],
        abortController.signal,
      ),
    ).rejects.toThrow('Map creation was cancelled.');

    expect(mapLibreState.mapConstructor).not.toHaveBeenCalled();
  });
});
