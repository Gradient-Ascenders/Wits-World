import { selectOption } from './fixtures/select-option';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getBottomSheetSnapPoints,
  resolveBottomSheetSnap,
} from '../src/components/exploration/BottomSheetSurface';
import { CampusExplorer } from '../src/components/exploration/CampusExplorer';
import { CampusMap } from '../src/components/exploration/CampusMap';
import {
  createGeodesicCircle,
  MOBILE_2D_MAP_STYLE,
  type MapConfiguration,
  type MapBounds,
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

const upcomingEvent = {
  ...event,
  availability: 'upcoming',
  description: 'Discover the library collections.',
  id: 'event-test-2',
  latitude: -26.1914,
  longitude: 28.0311,
  title: 'Wartenweiler Library Quest',
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
    focusPoint: vi.fn(() => true),
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
    setRegions: vi.fn(),
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
    onClearEventSelection: vi.fn(),
    onEnableLocation: vi.fn(),
    onRetry: vi.fn(),
    onRetryEligibility: vi.fn(),
    onSelectEvent: vi.fn(),
    selectedEventId: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createPaintHarness() {
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  const cancel = vi.fn((id: number) => frames.delete(id));
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    cancel,
    advance() {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(performance.now())));
    },
  };
}

describe('initial discovery paint before mobile map startup', () => {
  it.each(['ready', 'empty', 'error'] as const)(
    'keeps the same map host and starts after %s discovery has a paint opportunity',
    async (status) => {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
          ({
            matches: query === '(max-width: 47.999rem)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
      const paint = createPaintHarness();
      const controller = createController();
      const mapFactory = vi.fn<MapFactory>(async () => controller);
      const props = explorerProps(mapFactory);
      const view = render(
        <CampusExplorer {...props} discovery={{ status: 'loading' }} />,
      );
      const host = screen.getByRole('region', {
        name: /interactive campus map/i,
      });
      expect(mapFactory).not.toHaveBeenCalled();
      const discovery =
        status === 'ready'
          ? props.discovery
          : status === 'empty'
            ? { status: 'empty' as const }
            : { message: 'Try again.', status: 'error' as const };
      view.rerender(<CampusExplorer {...props} discovery={discovery} />);
      expect(
        screen.getByRole('region', { name: /interactive campus map/i }),
      ).toBe(host);
      expect(mapFactory).not.toHaveBeenCalled();
      if (status === 'ready') {
        expect(screen.getByText('1 campus event')).toBeVisible();
      } else if (status === 'error') {
        expect(
          screen.getByText('Events could not load · Open to retry'),
        ).toBeVisible();
      }
      paint.advance();
      expect(mapFactory).not.toHaveBeenCalled();
      paint.advance();
      await act(async () => {});
      expect(mapFactory).toHaveBeenCalledOnce();
      expect(mapFactory.mock.calls[0]?.[1].styleUrl).toBe(MOBILE_2D_MAP_STYLE);
      expect(controller.setPoints).toHaveBeenCalledWith(
        status === 'ready' ? [point] : [],
      );
      view.rerender(
        <CampusExplorer {...props} discovery={{ status: 'loading' }} />,
      );
      view.rerender(<CampusExplorer {...props} discovery={props.discovery} />);
      paint.advance();
      paint.advance();
      expect(mapFactory).toHaveBeenCalledOnce();
      view.unmount();
      expect(mapFactory.mock.calls[0]?.[3].aborted).toBe(true);
      expect(controller.remove).toHaveBeenCalledOnce();
    },
  );

  it('uses the existing fallback deadline to start a map despite unresolved discovery', async () => {
    vi.useFakeTimers();
    createPaintHarness();
    const controller = createController();
    let loaded: (() => void) | undefined;
    controller.onLoad = vi.fn((listener) => {
      loaded = listener;
    });
    const mapFactory = vi.fn<MapFactory>(async () => controller);
    const view = render(
      <CampusMap
        configuration={configuration}
        initialDiscoveryPending
        mapFactory={mapFactory}
        points={[]}
      />,
    );
    act(() => vi.advanceTimersByTime(14_999));
    expect(mapFactory).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(mapFactory).toHaveBeenCalledOnce();
    expect(screen.getByText('The map could not load.')).toBeVisible();
    act(() => loaded?.());
    expect(
      screen.queryByText('The map could not load.'),
    ).not.toBeInTheDocument();
    view.rerender(
      <CampusMap
        configuration={configuration}
        mapFactory={mapFactory}
        points={[point]}
      />,
    );
    expect(mapFactory).toHaveBeenCalledOnce();
    expect(controller.setPoints).toHaveBeenLastCalledWith([point]);
  });

  it('cancels a pending paint on unmount and constructs only the replacement configuration', async () => {
    const paint = createPaintHarness();
    const mapFactory = vi.fn<MapFactory>(async () => createController());
    const view = render(
      <CampusMap
        configuration={configuration}
        initialDiscoveryPending
        mapFactory={mapFactory}
        points={[]}
      />,
    );
    view.rerender(
      <CampusMap
        configuration={configuration}
        mapFactory={mapFactory}
        points={[point]}
      />,
    );
    paint.advance();
    view.unmount();
    paint.advance();
    expect(paint.cancel).toHaveBeenCalled();
    expect(mapFactory).not.toHaveBeenCalled();
    const next = render(
      <CampusMap
        configuration={configuration}
        initialDiscoveryPending
        mapFactory={mapFactory}
        points={[]}
      />,
    );
    next.rerender(
      <CampusMap
        configuration={{ ...configuration, zoom: 17 }}
        mapFactory={mapFactory}
        points={[point]}
      />,
    );
    await act(async () => {});
    paint.advance();
    paint.advance();
    expect(mapFactory).toHaveBeenCalledOnce();
    expect(mapFactory.mock.calls[0]?.[1].zoom).toBe(17);
  });
});

describe('map-first campus exploration', () => {
  it.each(['Nearby', 'Trails', 'Territories'])(
    'returns from %s to Events offline and restores navigation without a reload',
    async (section) => {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
          ({
            matches: query === '(min-width: 64rem)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
      const user = userEvent.setup();
      const props = explorerProps(async () => createController());
      const view = render(<CampusExplorer {...props} />);
      await user.click(screen.getByRole('button', { name: section }));
      const onlineMode =
        section === 'Territories'
          ? ('territories' as const)
          : ('discover' as const);
      view.rerender(
        <CampusExplorer {...props} exploreMode={onlineMode} offlineMap />,
      );
      expect(
        screen.getByRole('heading', { name: 'Campus events' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Events' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      for (const label of ['Nearby', 'Trails', 'Territories']) {
        expect(screen.queryByRole('button', { name: label })).toBeNull();
      }
      await user.click(screen.getByRole('button', { name: 'Collapse events' }));
      expect(screen.getByRole('button', { name: 'Open Events' })).toBeVisible();
      for (const label of ['Nearby', 'Trails', 'Territories']) {
        expect(
          screen.queryByRole('button', { name: `Open ${label}` }),
        ).toBeNull();
      }
      view.rerender(<CampusExplorer {...props} />);
      for (const label of ['Events', 'Nearby', 'Trails', 'Territories']) {
        expect(
          screen.getByRole('button', { name: `Open ${label}` }),
        ).toBeVisible();
      }
    },
  );

  it('retains the event search and selection across connection changes', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory = vi.fn<MapFactory>(async () => controller);
    const props = {
      ...explorerProps(mapFactory),
      discovery: { events: [event, upcomingEvent], status: 'ready' as const },
    };
    const view = render(<CampusExplorer {...props} />);
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Search campus events' }),
      'Great Hall',
    );
    await user.click(
      screen.getByRole('button', { name: /View on map.*Great Hall Quest/ }),
    );
    view.rerender(<CampusExplorer {...props} selectedEventId={event.id} />);
    expect(screen.getByRole('heading', { name: event.title })).toBeVisible();
    await waitFor(() => expect(controller.focusPoint).toHaveBeenCalledOnce());
    view.rerender(
      <CampusExplorer {...props} selectedEventId={event.id} offlineMap />,
    );
    expect(screen.getByRole('heading', { name: event.title })).toBeVisible();
    view.rerender(<CampusExplorer {...props} selectedEventId={event.id} />);
    expect(screen.getByRole('heading', { name: event.title })).toBeVisible();
    await waitFor(() => expect(mapFactory).toHaveBeenCalledTimes(2));
    expect(controller.focusPoint).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'All events' }));
    expect(
      screen.getByRole('searchbox', { name: 'Search campus events' }),
    ).toHaveValue('Great Hall');
    expect(props.onClearEventSelection).not.toHaveBeenCalled();
  });

  it('carries the geographic view through offline panning and reconnection without remounting on ordinary updates', async () => {
    const controller = createController();
    let reportView!: (bounds: MapBounds) => void;
    controller.setViewChangeListener = (listener) => {
      if (listener) reportView = listener;
    };
    const factory = vi.fn<MapFactory>(async () => controller);
    const props = explorerProps(factory);
    const view = render(<CampusExplorer {...props} />);
    await waitFor(() => expect(factory).toHaveBeenCalledOnce());
    const bounds: MapBounds = [
      [28.025, -26.195],
      [28.035, -26.185],
    ];
    act(() => reportView(bounds));
    view.rerender(<CampusExplorer {...props} eligibilityBusy />);
    expect(factory).toHaveBeenCalledOnce();
    view.rerender(<CampusExplorer {...props} offlineMap />);
    const map = screen.getByRole('group', { name: /Downloaded campus map/ });
    const before = map.getAttribute('viewBox');
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Zoom in campus map' }),
    );
    expect(map.getAttribute('viewBox')).not.toBe(before);
    view.rerender(<CampusExplorer {...props} />);
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    const resumed = factory.mock.calls[1]![1];
    expect(resumed.preserveInitialView).toBe(true);
    expect(resumed.initialBounds![0][0]).toBeGreaterThan(bounds[0][0]);
    expect(resumed.initialBounds![1][0]).toBeLessThan(bounds[1][0]);
  });

  it('keeps the map host absolute and reserves event-panel clearance', () => {
    expect(explorationStyles).toMatch(
      /\.campus-map\s*>\s*\.campus-map__canvas\s*{[^}]*position:\s*absolute\s*!important;/,
    );
    expect(explorationStyles).toContain('--explore-bottom-clearance');
    expect(explorationStyles).toContain('.mapboxgl-ctrl-bottom-right');
  });

  it('starts mobile maps in lightweight mode and enables 3D on request', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          matches: query === '(max-width: 47.999rem)',
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        }) as MediaQueryList,
    );
    const user = userEvent.setup();
    const mapFactory: MapFactory = vi.fn(async () => createController());

    render(<CampusExplorer {...explorerProps(mapFactory)} />);

    await waitFor(() => expect(mapFactory).toHaveBeenCalledOnce());
    expect(mapFactory).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        pitch: 0,
        styleUrl: MOBILE_2D_MAP_STYLE,
        standardConfig: expect.objectContaining({
          show3dBuildings: false,
          show3dLandmarks: false,
          show3dObjects: false,
          show3dTrees: false,
        }),
      }),
      expect.any(Array),
      expect.any(AbortSignal),
    );

    const toggle = screen.getByRole('button', { name: 'Detailed 3D map' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    await waitFor(() => expect(mapFactory).toHaveBeenCalledTimes(2));
    expect(mapFactory).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      configuration,
      expect.any(Array),
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('button', { name: 'Detailed 3D map' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    await waitFor(() => expect(mapFactory).toHaveBeenCalledTimes(3));
    expect(vi.mocked(mapFactory).mock.calls[2]?.[1]).toMatchObject({
      pitch: 0,
      styleUrl: MOBILE_2D_MAP_STYLE,
    });
    expect(vi.mocked(mapFactory).mock.calls[0]?.[3].aborted).toBe(true);
    expect(vi.mocked(mapFactory).mock.calls[1]?.[3].aborted).toBe(true);
  });

  it('recreates one map across the breakpoint while retaining selection and removing the old controller', async () => {
    let changeViewport: ((event: MediaQueryListEvent) => void) | undefined;
    const removeViewportListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: (
            _name: string,
            listener: (event: MediaQueryListEvent) => void,
          ) => {
            if (query === '(max-width: 47.999rem)') changeViewport = listener;
          },
          removeEventListener: removeViewportListener,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const controllers: MapController[] = [];
    const mapFactory = vi.fn<MapFactory>(async () => {
      const controller = createController();
      controllers.push(controller);
      return controller;
    });
    const view = render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        selectedEventId={event.id}
      />,
    );
    await waitFor(() =>
      expect(controllers[0]?.setSelectedPoint).toHaveBeenCalled(),
    );
    expect(mapFactory.mock.calls[0]?.[1]).toBe(configuration);
    act(() => changeViewport?.({ matches: true } as MediaQueryListEvent));
    await waitFor(() =>
      expect(controllers[1]?.setSelectedPoint).toHaveBeenCalledWith(
        expect.objectContaining({ id: event.id }),
      ),
    );
    expect(mapFactory.mock.calls[1]?.[1].styleUrl).toBe(MOBILE_2D_MAP_STYLE);
    expect(controllers[0]?.remove).toHaveBeenCalledOnce();
    expect(mapFactory.mock.calls[0]?.[3].aborted).toBe(true);
    expect(controllers[1]?.setPoints).toHaveBeenCalledWith([point]);
    act(() => changeViewport?.({ matches: false } as MediaQueryListEvent));
    await waitFor(() =>
      expect(controllers[2]?.setSelectedPoint).toHaveBeenCalled(),
    );
    expect(mapFactory.mock.calls[2]?.[1]).toBe(configuration);
    expect(controllers[1]?.remove).toHaveBeenCalledOnce();
    view.unmount();
    expect(controllers[2]?.remove).toHaveBeenCalledOnce();
    expect(mapFactory.mock.calls.every((call) => call[3].aborted)).toBe(true);
    expect(removeViewportListener).toHaveBeenCalledWith(
      'change',
      changeViewport,
    );
  });

  it('aborts an obsolete Streets creation and removes a controller that arrives after a style change', async () => {
    const oldController = createController();
    const currentController = createController();
    let finishOld!: (controller: MapController) => void;
    const mapFactory = vi
      .fn<MapFactory>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue(currentController);
    const view = render(
      <CampusMap
        configuration={{ ...configuration, styleUrl: MOBILE_2D_MAP_STYLE }}
        mapFactory={mapFactory}
        points={[point]}
      />,
    );
    view.rerender(
      <CampusMap
        configuration={configuration}
        mapFactory={mapFactory}
        points={[point]}
      />,
    );
    await act(async () => finishOld(oldController));
    expect(mapFactory.mock.calls[0]?.[3].aborted).toBe(true);
    expect(oldController.remove).toHaveBeenCalledOnce();
    expect(oldController.setPoints).not.toHaveBeenCalled();
    expect(currentController.setPoints).toHaveBeenCalledWith([point]);
    view.unmount();
    expect(currentController.remove).toHaveBeenCalledOnce();
  });

  it('keeps the Streets 15-second fallback, discovery, retry and observer cleanup', async () => {
    vi.useFakeTimers();
    const resizeDisconnect = vi.fn();
    const mutationDisconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function () {
        return {
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: resizeDisconnect,
        };
      }),
    );
    const mutationSpy = vi
      .spyOn(window, 'MutationObserver')
      .mockImplementation(function () {
        return {
          observe: vi.fn(),
          disconnect: mutationDisconnect,
          takeRecords: vi.fn(() => []),
        };
      });
    const controller = createController();
    controller.onLoad = vi.fn();
    const recovered = createController();
    const mapFactory = vi
      .fn<MapFactory>()
      .mockResolvedValueOnce(controller)
      .mockResolvedValue(recovered);
    const view = render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        mapConfiguration={{
          ...configuration,
          pitch: 0,
          styleUrl: MOBILE_2D_MAP_STYLE,
        }}
        selectedEventId={event.id}
      />,
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(14_999));
    expect(
      screen.queryByText('The map could not load.'),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('The map could not load.')).toBeVisible();
    expect(screen.getByRole('heading', { name: event.title })).toBeVisible();
    await act(async () =>
      screen.getByRole('button', { name: 'Retry map' }).click(),
    );
    expect(controller.remove).toHaveBeenCalledOnce();
    expect(mapFactory.mock.calls[0]?.[3].aborted).toBe(true);
    expect(recovered.setSelectedPoint).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.id }),
    );
    expect(
      screen.queryByText('The map could not load.'),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(resizeDisconnect.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mutationDisconnect).toHaveBeenCalled();
    mutationSpy.mockRestore();
  });

  it('provides map-independent event discovery and synchronized selection', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onSelectEvent = vi.fn();

    const view = render(
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
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Events/ })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: /^Events/ }));
    const regionUpdatesBeforeSelection = vi.mocked(controller.setRegions!).mock
      .calls.length;
    await user.click(screen.getByRole('button', { name: /View on map/i }));
    expect(onSelectEvent).toHaveBeenCalledWith(event.id);
    view.rerender(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        onSelectEvent={onSelectEvent}
        selectedEventId={event.id}
      />,
    );
    await waitFor(() =>
      expect(controller.focusPoint).toHaveBeenCalledWith(point),
    );
    expect(controller.setRegions).toHaveBeenCalledTimes(
      regionUpdatesBeforeSelection,
    );
  });

  it('offers keyboard controls for each mobile sheet snap point', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(<CampusExplorer {...explorerProps(mapFactory)} />);

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    const panel = screen.getByRole('complementary', {
      name: 'Campus discovery',
    });
    expect(panel).toHaveAttribute('data-sheet-snap', 'expanded');
    await user.click(screen.getByRole('button', { name: 'Lower event sheet' }));
    expect(panel).toHaveAttribute('data-sheet-snap', 'medium');

    await user.click(
      screen.getByRole('button', { name: 'Expand event sheet fully' }),
    );
    expect(panel).toHaveAttribute('data-sheet-snap', 'expanded');
    expect(
      screen.getByRole('button', { name: 'Lower event sheet' }),
    ).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(panel).toHaveAttribute('data-sheet-snap', 'medium');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Events/ })).toHaveFocus(),
    );
    expect(panel).toHaveAttribute('data-sheet-snap', 'peek');
  });

  it('leaves the discovery panel unchanged when another control handles Escape', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(<CampusExplorer {...explorerProps(mapFactory)} />);

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    const panel = screen.getByRole('complementary', {
      name: 'Campus discovery',
    });
    expect(panel).toHaveAttribute('data-sheet-snap', 'expanded');

    const handledEscape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    handledEscape.preventDefault();
    act(() => document.dispatchEvent(handledEscape));

    expect(panel).toHaveAttribute('data-sheet-snap', 'expanded');
  });

  it('keeps search and status filters synchronized with visible markers', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        discovery={{ events: [event, upcomingEvent], status: 'ready' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    const search = screen.getByRole('searchbox', {
      name: 'Search campus events',
    });
    await user.type(search, 'library');

    expect(screen.queryByText(event.title)).not.toBeInTheDocument();
    expect(screen.getByText(upcomingEvent.title)).toBeVisible();
    await waitFor(() =>
      expect(controller.setPoints).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: upcomingEvent.id }),
      ]),
    );

    await selectOption(
      user,
      screen.getByLabelText('Filter events by status'),
      'active',
    );
    expect(screen.getByText('No events match these filters.')).toBeVisible();
    await waitFor(() =>
      expect(controller.setPoints).toHaveBeenLastCalledWith([]),
    );
  });

  it('clears a selected event deliberately when filters exclude it', async () => {
    const user = userEvent.setup();
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);
    const onClearEventSelection = vi.fn();

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        discovery={{ events: [event, upcomingEvent], status: 'ready' }}
        onClearEventSelection={onClearEventSelection}
        selectedEventId={event.id}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'All events' }));
    const search = screen.getByRole('searchbox', {
      name: 'Search campus events',
    });
    await user.type(search, 'library');

    await waitFor(() => expect(onClearEventSelection).toHaveBeenCalledOnce());
    expect(search).toHaveFocus();
    await waitFor(() =>
      expect(controller.setSelectedPoint).toHaveBeenLastCalledWith(null),
    );
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
    expect(screen.getByText('Challenge radius')).not.toBeVisible();
    await userEvent.setup().click(screen.getByText('About this event'));
    expect(screen.getByText('Challenge radius')).toBeVisible();
    expect(screen.getByText('75 m radius')).toBeVisible();
    await waitFor(() =>
      expect(controller.setSelectedPoint).toHaveBeenCalledWith(point),
    );
  });

  it('labels a past event end time as Ended', async () => {
    const endedEvent = { ...event, availability: 'ended' } as const;
    render(
      <CampusExplorer
        {...explorerProps(vi.fn(async () => createController()))}
        discovery={{ events: [endedEvent], status: 'ready' }}
        selectedEventId={endedEvent.id}
      />,
    );

    await userEvent.setup().click(screen.getByText('About this event'));
    expect(screen.getByText('Ended', { selector: 'dt' })).toBeVisible();
    expect(
      screen.queryByText('Ends', { selector: 'dt' }),
    ).not.toBeInTheDocument();
  });

  it('keeps challenge-start status to one short mobile sheet row', async () => {
    const controller = createController();
    const mapFactory: MapFactory = vi.fn(async () => controller);

    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        eligibility={{ [event.id]: { status: 'starting' } }}
        selectedEventId={event.id}
      />,
    );

    const status = (await screen.findByRole('status')).closest(
      '.exploration-loading-panel',
    )!;
    expect(status.querySelector(':scope > strong')).toHaveTextContent(
      'Starting challenge…',
    );
    expect(
      status.querySelector('.region-loading-state__description'),
    ).toBeNull();
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
        reportedLocation={{
          accuracyMetres: 18,
          latitude: -26.19205,
          longitude: 28.03038,
        }}
      />,
    );
    expect(
      screen.getByText(
        'Map following is paused. Reported accuracy is approximately ±18 m.',
      ),
    ).toBeVisible();
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

  it('retries a failed map without discarding the selected event', async () => {
    const controller = createController();
    const mapFactory = vi
      .fn<MapFactory>()
      .mockRejectedValueOnce(new Error('Expected map failure'))
      .mockResolvedValue(controller);
    render(
      <CampusExplorer
        {...explorerProps(mapFactory)}
        selectedEventId={event.id}
      />,
    );
    await screen.findByText('The map could not load.');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry map' }));
    await waitFor(() =>
      expect(controller.setSelectedPoint).toHaveBeenCalledWith(
        expect.objectContaining({ id: event.id }),
      ),
    );
    expect(
      screen.queryByText('The map could not load.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: event.title })).toBeVisible();
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

describe('mobile Explore sheet snapping', () => {
  const points = getBottomSheetSnapPoints(500);

  it('derives proportional snap points from the measured sheet height', () => {
    expect(points).toEqual({ expanded: 500, medium: 280, peek: 100 });
  });

  it('settles slow drags at the nearest snap point', () => {
    expect(
      resolveBottomSheetSnap({
        currentVisibleHeight: 250,
        movementY: -174,
        points,
        startSnap: 'peek',
        velocityY: -0.2,
      }),
    ).toBe('medium');
    expect(
      resolveBottomSheetSnap({
        currentVisibleHeight: 90,
        movementY: 250,
        points,
        startSnap: 'medium',
        velocityY: 0.2,
      }),
    ).toBe('peek');
  });

  it('uses flick direction without skipping beyond the next nearby snap', () => {
    expect(
      resolveBottomSheetSnap({
        currentVisibleHeight: 100,
        movementY: -24,
        points,
        startSnap: 'peek',
        velocityY: -0.8,
      }),
    ).toBe('medium');
    expect(
      resolveBottomSheetSnap({
        currentVisibleHeight: 250,
        movementY: 20,
        points,
        startSnap: 'medium',
        velocityY: 0.7,
      }),
    ).toBe('peek');
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
