import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CampusExplorer } from '../src/components/exploration/CampusExplorer';
import { CampusMap } from '../src/components/exploration/CampusMap';
import {
  createGeodesicCircle,
  type MapConfiguration,
  type MapController,
  type MapFactory,
  type MapPoint,
} from '../src/components/exploration/map-provider';

const configuration: MapConfiguration = {
  accessToken: 'pk.test-token',
  bearing: 20,
  center: [28.03038, -26.19205],
  pitch: 52,
  standardConfig: {
    lightPreset: 'dusk',
    show3dBuildings: true,
    show3dLandmarks: true,
    show3dObjects: true,
    show3dTrees: true,
    showPedestrianRoads: true,
  },
  styleUrl: 'mapbox://styles/mapbox/standard',
  zoom: 16.5,
};

const event = {
  availability: 'active',
  description: 'Follow the story of the Great Hall.',
  endsAt: '2026-08-26T00:00:00.000+02:00',
  id: 'event-test-1',
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-08-01T00:00:00.000+02:00',
  title: 'Great Hall Quest',
} as const;

const point: MapPoint = {
  availability: 'active',
  id: event.id,
  label: event.title,
  latitude: event.latitude,
  longitude: event.longitude,
  radiusMetres: event.radiusMetres,
  reachable: false,
};

const explorationStyles = readFileSync(
  resolve(process.cwd(), 'src/components/exploration/exploration.css'),
  'utf8',
);

function createController(): MapController {
  return {
    onError: vi.fn(),
    onLoad(listener) {
      listener();
    },
    recenterReportedLocation: vi.fn(() => true),
    remove: vi.fn(),
    setFollowStateListener: vi.fn(),
    setPointSelectionListener: vi.fn(),
    setReportedLocation: vi.fn(),
    setPoints: vi.fn(),
    setSelectedPoint: vi.fn(),
  };
}

function explorerProps(mapFactory: MapFactory) {
  return {
    discovery: { events: [event], status: 'ready' as const },
    eligibility: {},
    eligibilityBusy: false,
    locationState: 'permission-required' as const,
    mapConfiguration: configuration,
    mapFactory,
    onEnableLocation: vi.fn(),
    onRetry: vi.fn(),
    onRetryEligibility: vi.fn(),
    onSelectEvent: vi.fn(),
    selectedEventId: null,
  };
}

afterEach(() => vi.useRealTimers());

describe('map-first campus exploration', () => {
  it('keeps the map host absolute and reserves event-panel clearance', () => {
    expect(explorationStyles).toMatch(
      /\.campus-map\s*>\s*\.campus-map__canvas\s*{[^}]*position:\s*absolute\s*!important;/,
    );
    expect(explorationStyles).toContain('--explore-bottom-clearance');
    expect(explorationStyles).toContain('.mapboxgl-ctrl-bottom-right');
  });

  it('provides map-independent event discovery and synchronized selection', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onSelectEvent = vi.fn();

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        onSelectEvent={onSelectEvent}
      />,
    );

    expect(
      screen.getByRole('region', { name: /interactive campus map/i }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    expect(screen.getByRole('list', { name: 'Campus events' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Campus events' }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Events/ })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: /View on map/i }));
    expect(onSelectEvent).toHaveBeenCalledWith(event.id);
  });

  it('uses one selected event for details and the geographic radius', async () => {
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        selectedEventId={event.id}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: event.title }),
    ).toBeVisible();
    expect(screen.getByText('Event interaction area')).toBeVisible();
    expect(screen.getByText('75 m radius')).toBeVisible();
    await waitFor(() =>
      expect(controller.setSelectedPoint).toHaveBeenCalledWith(point),
    );
  });

  it('keeps challenge-start status copy in separate mobile sheet rows', async () => {
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        eligibility={{ [event.id]: { status: 'starting' } }}
        selectedEventId={event.id}
      />,
    );

    const status = await screen.findByRole('status');
    expect(status.querySelector(':scope > strong')).toHaveTextContent(
      'Starting challenge…',
    );
    expect(status.querySelector(':scope > span')).toHaveTextContent(
      'Wits World is checking your latest reported location again.',
    );
  });

  it('connects an interactive map marker selection to the shared selection state', async () => {
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onSelectEvent = vi.fn();
    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        onSelectEvent={onSelectEvent}
      />,
    );

    await waitFor(() =>
      expect(controller.setPointSelectionListener).toHaveBeenCalled(),
    );
    const listener = vi
      .mocked(controller.setPointSelectionListener!)
      .mock.calls.at(-1)?.[0];
    act(() => listener?.(event.id));
    expect(onSelectEvent).toHaveBeenCalledWith(event.id);
  });

  it('exposes one permission/recenter control and restores follow', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onEnableLocation = vi.fn();
    const view = render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        onEnableLocation={onEnableLocation}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Enable live location' }),
    );
    expect(onEnableLocation).toHaveBeenCalledOnce();

    view.rerender(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        locationState="tracking"
        reportedLocation={{ latitude: -26.19205, longitude: 28.03038 }}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Recenter on reported location' }),
    );
    expect(controller.recenterReportedLocation).toHaveBeenCalledOnce();
  });

  it('keeps the event list usable if the provider fails', async () => {
    const user = userEvent.setup();
    const mapFactory: MapFactory = vi.fn(async () => {
      throw new Error('Expected map failure');
    });
    render(<CampusExplorer {...explorerProps(mapFactory)} />);

    expect(await screen.findByText('The map could not load.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    expect(screen.getByText(event.title)).toBeVisible();
  });

  it('keeps a loaded map visible after a recoverable provider error', async () => {
    let reportError: () => void = () => undefined;
    let reportLoad: () => void = () => undefined;
    const controller = createController();
    controller.onError = (listener) => {
      reportError = listener;
    };
    controller.onLoad = (listener) => {
      reportLoad = listener;
    };
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(
      <CampusMap
        configuration={configuration}
        mapFactory={mapFactory}
        points={[]}
      />,
    );
    await waitFor(() => expect(mapFactory).toHaveBeenCalledOnce());
    act(() => reportLoad());
    act(() => reportError());
    expect(
      screen.queryByText('The map could not load.'),
    ).not.toBeInTheDocument();
  });
});

describe('geographic event interaction area', () => {
  it('creates a closed 64-segment geodesic polygon with metre-scale radius', () => {
    const polygon = createGeodesicCircle(
      { latitude: -26.19205, longitude: 28.03038 },
      75,
    );
    const ring = polygon.geometry.coordinates[0]!;

    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const coordinate of ring.slice(0, -1)) {
      expect(
        distanceMetres([-26.19205, 28.03038], [coordinate[1]!, coordinate[0]!]),
      ).toBeCloseTo(75, 5);
    }
  });

  it('rejects invalid radius values instead of rendering pixel approximations', () => {
    expect(() =>
      createGeodesicCircle({ latitude: 0, longitude: 0 }, 0),
    ).toThrow();
  });
});

function distanceMetres(
  first: [number, number],
  second: [number, number],
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(second[0] - first[0]);
  const longitudeDelta = radians(second[1] - first[1]);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first[0])) *
      Math.cos(radians(second[0])) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_008.8 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
