import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapLibreMap } from '../src/components/exploration/map-provider';

const mapLibreState = vi.hoisted(() => ({
  isLoaded: false,
  once: vi.fn(),
}));

vi.mock('maplibre-gl', () => ({
  Map: class {
    public addControl() {}

    public loaded() {
      return mapLibreState.isLoaded;
    }

    public on() {}

    public once = mapLibreState.once;

    public remove() {}
  },
  Marker: class {
    public addTo() {
      return this;
    }

    public setLngLat() {
      return this;
    }
  },
  NavigationControl: class {},
}));

const configuration = {
  center: [28.03038, -26.19205] as const,
  styleUrl: 'https://maps.example.test/style.json',
  zoom: 16,
};

beforeEach(() => {
  mapLibreState.isLoaded = false;
});

describe('MapLibre provider', () => {
  it('reports a map that loaded before the consumer registered its listener', async () => {
    mapLibreState.isLoaded = true;
    const controller = await createMapLibreMap(
      document.createElement('div'),
      configuration,
      [],
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
    );
    const listener = vi.fn();

    controller.onLoad(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(mapLibreState.once).toHaveBeenCalledWith('load', listener);
  });
});
