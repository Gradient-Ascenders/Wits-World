import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  NearbyUnvisitedEvent,
  PlayerTrail,
  PlayerTrailStep,
  PlayerTrailSummary,
} from '../src/api/trails';
import { CampusExplorer } from '../src/components/exploration/CampusExplorer';
import {
  NearbyList,
  TrailDetail,
  TrailList,
} from '../src/components/exploration/TrailDiscovery';
import type {
  MapConfiguration,
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';

const trailId = '17700000-0000-4000-8000-000000000001';
const eventId = '17700000-0000-4000-8000-000000000002';

const summary: PlayerTrailSummary = {
  availability: 'active',
  completedStepCount: 1,
  currentStepPosition: 2,
  description: 'A connected story through Wits landmarks.',
  endsAt: null,
  progressStatus: 'in_progress',
  publicationStatus: 'published',
  startsAt: null,
  title: 'Campus History Trail',
  totalSteps: 3,
  trailId,
};

function step(
  position: number,
  state: PlayerTrailStep['state'],
  unavailableReason: PlayerTrailStep['unavailableReason'] = null,
): PlayerTrailStep {
  return {
    completedAt: state === 'completed' ? '2026-09-04T10:00:00.000Z' : null,
    description: `Story for stop ${position}.`,
    endsAt: '2026-10-01T00:00:00.000Z',
    eventId: `${eventId.slice(0, -1)}${position}`,
    latitude: -26.19205 + position / 10_000,
    longitude: 28.03038 + position / 10_000,
    position,
    radiusMetres: 75,
    startsAt: '2026-09-01T00:00:00.000Z',
    state,
    title: ['Great Hall', 'Senate House', 'Origins Centre'][position - 1]!,
    unavailableReason,
  };
}

const activeTrail: PlayerTrail = {
  ...summary,
  steps: [step(1, 'completed'), step(2, 'current'), step(3, 'locked')],
};

const nearbyEvent: NearbyUnvisitedEvent = {
  description: 'The current trail stop.',
  distanceMetres: 182.4,
  endsAt: '2026-10-01T00:00:00.000Z',
  eventId,
  latitude: -26.19205,
  longitude: 28.03038,
  radiusMetres: 75,
  startsAt: '2026-09-01T00:00:00.000Z',
  title: 'Senate House',
  trailContexts: [
    { position: 2, title: summary.title, totalSteps: 3, trailId },
  ],
};

describe('trail discovery presentation', () => {
  it('shows readable list progress and opens the chosen trail', async () => {
    const user = userEvent.setup();
    const onOpenTrail = vi.fn();
    render(
      <TrailList
        onOpenTrail={onOpenTrail}
        onRetry={vi.fn()}
        state={{ status: 'ready', trails: [summary] }}
      />,
    );

    expect(screen.getByText('1/3')).toHaveAccessibleName(
      '1 of 3 steps completed',
    );
    expect(screen.getByText('Stop 2 next')).toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: `View trail: ${summary.title}`,
      }),
    );
    expect(onOpenTrail).toHaveBeenCalledWith(trailId);
  });

  it('distinguishes completed, current, and locked stops and opens only the current event', async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn();
    const { container } = render(
      <TrailDetail
        onOpenEvent={onOpenEvent}
        onRetry={vi.fn()}
        state={{ status: 'ready', trail: activeTrail }}
      />,
    );

    expect(screen.getByText('1. Great Hall')).toBeVisible();
    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.getByText('2. Senate House')).toBeVisible();
    expect(screen.getByText('Current')).toBeVisible();
    expect(screen.getByText('3. Origins Centre')).toBeVisible();
    expect(screen.getByText('Locked')).toBeVisible();
    expect(
      screen.getByText('Complete the previous stop to unlock.'),
    ).toBeVisible();
    expect(screen.getByText('Next stop:')).toBeVisible();
    expect(
      container.querySelectorAll('.trail-step__icon svg[aria-hidden="true"]'),
    ).toHaveLength(3);

    const currentAction = screen.getByRole('button', {
      name: 'Open event: Senate House',
    });
    expect(currentAction.closest('li')).toHaveClass('trail-step--current');
    await user.click(currentAction);
    expect(onOpenEvent).toHaveBeenCalledWith(activeTrail.steps[1]!.eventId);
  });

  it.each([
    ['Unavailable', 'This stop is not open yet.', 'upcoming'],
    ['Unavailable', 'This stop is no longer available.', 'ended'],
    [
      'Unavailable',
      'This stop is temporarily unavailable.',
      'event_unavailable',
    ],
    [
      'Retired',
      'This event has retired and cannot be opened.',
      'event_retired',
    ],
    [
      'Retired',
      'This trail has retired; completed stops remain visible.',
      'trail_retired',
    ],
  ] as const)(
    'labels the %s stop state with its supported explanation',
    (label, guidance, reason) => {
      render(
        <TrailDetail
          onOpenEvent={vi.fn()}
          onRetry={vi.fn()}
          state={{
            status: 'ready',
            trail: {
              ...summary,
              availability: reason === 'trail_retired' ? 'retired' : 'active',
              progressStatus:
                reason === 'trail_retired' ? 'retired' : 'in_progress',
              steps: [
                step(1, 'unavailable', reason),
                step(2, 'locked'),
                step(3, 'locked'),
              ],
            },
          }}
        />,
      );

      expect(screen.getByText(label)).toBeVisible();
      expect(screen.getByText(guidance)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /Open event/ }),
      ).not.toBeInTheDocument();
    },
  );

  it('announces a fully completed trail without offering a next step', () => {
    render(
      <TrailDetail
        onOpenEvent={vi.fn()}
        onRetry={vi.fn()}
        state={{
          status: 'ready',
          trail: {
            ...summary,
            completedStepCount: 3,
            currentStepPosition: null,
            progressStatus: 'completed',
            steps: [
              step(1, 'completed'),
              step(2, 'completed'),
              step(3, 'completed'),
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('Trail complete')).toBeVisible();
    expect(
      screen.getByRole('progressbar', {
        name: `Progress for ${summary.title}`,
      }),
    ).toHaveValue(3);
    expect(
      screen.queryByRole('button', { name: /Open event/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps trail loading, network failure, and disappeared-detail states recoverable', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const view = render(
      <TrailList
        onOpenTrail={vi.fn()}
        onRetry={onRetry}
        state={{ status: 'loading' }}
      />,
    );
    expect(screen.getByText('Loading trails and progress…')).toHaveAttribute(
      'role',
      'status',
    );

    view.rerender(
      <TrailList
        onOpenTrail={vi.fn()}
        onRetry={onRetry}
        state={{ failure: 'unavailable', status: 'error' }}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Try loading trails again' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(
      <TrailDetail
        onOpenEvent={vi.fn()}
        onRetry={onRetry}
        state={{ failure: 'not-found', status: 'error', trailId }}
      />,
    );
    expect(
      screen.getByText(
        'This trail may have been retired or is no longer visible.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Try loading this trail again' }),
    ).toBeEnabled();
  });
});

describe('nearby unvisited presentation', () => {
  it('provides distance, unvisited status, trail context, and map-independent event navigation', async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn();
    render(
      <NearbyList
        locationState="tracking"
        onEnableLocation={vi.fn()}
        onOpenEvent={onOpenEvent}
        onRetry={vi.fn()}
        state={{ events: [nearbyEvent], status: 'ready' }}
      />,
    );

    expect(screen.getByText('~182 m away · Unvisited')).toBeVisible();
    expect(
      screen.getByText('Current stop 2 of 3 on Campus History Trail'),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'View event: Senate House' }),
    );
    expect(onOpenEvent).toHaveBeenCalledWith(eventId);
  });

  it('keeps denied, empty, and retryable error states understandable', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const view = render(
      <NearbyList
        locationState="denied"
        onEnableLocation={vi.fn()}
        onOpenEvent={vi.fn()}
        onRetry={onRetry}
        state={{ status: 'waiting-location' }}
      />,
    );
    expect(screen.getByText('Location permission is denied.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Retry location' }),
    ).toBeEnabled();

    view.rerender(
      <NearbyList
        locationState="tracking"
        onEnableLocation={vi.fn()}
        onOpenEvent={vi.fn()}
        onRetry={onRetry}
        state={{ status: 'empty' }}
      />,
    );
    expect(screen.getByText('No nearby unvisited events.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refresh nearby' }));
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(
      <NearbyList
        locationState="tracking"
        onEnableLocation={vi.fn()}
        onOpenEvent={vi.fn()}
        onRetry={onRetry}
        state={{ failure: 'location-retry', status: 'error' }}
      />,
    );
    expect(
      screen.getByText(
        'The reported location was too old or not accurate enough for this search.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Get a new reported location' }),
    ).toBeEnabled();
  });
});

describe('exploration integration', () => {
  it('loads Trails from keyboard-operable discovery navigation', async () => {
    const user = userEvent.setup();
    const onLoadTrails = vi.fn();
    render(
      <CampusExplorer
        discovery={{ status: 'empty' }}
        eligibility={{}}
        eligibilityBusy={false}
        locationState="denied"
        mapConfiguration={configuration}
        mapFactory={mapFactory}
        onClearEventSelection={vi.fn()}
        onEnableLocation={vi.fn()}
        onLoadTrails={onLoadTrails}
        onRetry={vi.fn()}
        onRetryEligibility={vi.fn()}
        onSelectEvent={vi.fn()}
        selectedEventId={null}
        trailDiscovery={{ status: 'ready', trails: [summary] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Trails' }));
    expect(onLoadTrails).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Trails' })).toHaveFocus();
    expect(screen.getByRole('list', { name: 'Campus trails' })).toBeVisible();
  });

  it('keeps map markers aligned with the active nearby or trail discovery source', async () => {
    const user = userEvent.setup();
    const setPoints = vi.mocked(mapController.setPoints);
    setPoints.mockClear();
    const trailWithRetiredStop: PlayerTrail = {
      ...activeTrail,
      steps: [
        ...activeTrail.steps,
        {
          ...step(3, 'unavailable', 'event_retired'),
          eventId: '17700000-0000-4000-8000-000000000004',
          position: 4,
          title: 'Former Observatory',
        },
        {
          ...step(3, 'unavailable', 'trail_retired'),
          eventId: '17700000-0000-4000-8000-000000000005',
          position: 5,
          title: 'Retired Trail Finale',
        },
      ],
      totalSteps: 5,
    };
    const view = render(
      <CampusExplorer
        discovery={{
          events: [toEventPresentation(activeTrail.steps[1]!)],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        locationState="tracking"
        mapConfiguration={configuration}
        mapFactory={mapFactory}
        nearbyDiscovery={{ status: 'loading' }}
        onClearEventSelection={vi.fn()}
        onEnableLocation={vi.fn()}
        onLoadNearby={vi.fn()}
        onLoadTrails={vi.fn()}
        onOpenTrail={vi.fn()}
        onRetry={vi.fn()}
        onRetryEligibility={vi.fn()}
        onSelectEvent={vi.fn()}
        selectedEventId={null}
        trailDetail={{ status: 'ready', trail: trailWithRetiredStop }}
        trailDiscovery={{ status: 'ready', trails: [summary] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Nearby' }));
    await waitFor(() => expect(setPoints).toHaveBeenLastCalledWith([]));

    view.rerender(
      <CampusExplorer
        discovery={{
          events: [toEventPresentation(activeTrail.steps[1]!)],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        locationState="tracking"
        mapConfiguration={configuration}
        mapFactory={mapFactory}
        nearbyDiscovery={{ failure: 'unavailable', status: 'error' }}
        onClearEventSelection={vi.fn()}
        onEnableLocation={vi.fn()}
        onLoadNearby={vi.fn()}
        onLoadTrails={vi.fn()}
        onOpenTrail={vi.fn()}
        onRetry={vi.fn()}
        onRetryEligibility={vi.fn()}
        onSelectEvent={vi.fn()}
        selectedEventId={null}
        trailDetail={{ status: 'ready', trail: trailWithRetiredStop }}
        trailDiscovery={{ status: 'ready', trails: [summary] }}
      />,
    );
    await waitFor(() => expect(setPoints).toHaveBeenLastCalledWith([]));

    view.rerender(
      <CampusExplorer
        discovery={{
          events: [toEventPresentation(activeTrail.steps[1]!)],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        locationState="tracking"
        mapConfiguration={configuration}
        mapFactory={mapFactory}
        nearbyDiscovery={{ events: [nearbyEvent], status: 'ready' }}
        onClearEventSelection={vi.fn()}
        onEnableLocation={vi.fn()}
        onLoadNearby={vi.fn()}
        onLoadTrails={vi.fn()}
        onOpenTrail={vi.fn()}
        onRetry={vi.fn()}
        onRetryEligibility={vi.fn()}
        onSelectEvent={vi.fn()}
        selectedEventId={null}
        trailDetail={{ status: 'ready', trail: trailWithRetiredStop }}
        trailDiscovery={{ status: 'ready', trails: [summary] }}
      />,
    );
    await waitFor(() =>
      expect(setPoints).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: nearbyEvent.eventId }),
      ]),
    );

    await user.click(screen.getByRole('button', { name: 'Trails' }));
    await waitFor(() => expect(setPoints).toHaveBeenLastCalledWith([]));
    await user.click(
      screen.getByRole('button', { name: `View trail: ${summary.title}` }),
    );
    await waitFor(() =>
      expect(setPoints).toHaveBeenLastCalledWith([
        expect.objectContaining({
          id: activeTrail.steps[0]!.eventId,
          selectable: false,
          trailState: 'completed',
        }),
        expect.objectContaining({
          id: activeTrail.steps[1]!.eventId,
          selectable: true,
          trailState: 'current',
        }),
        expect.objectContaining({
          id: activeTrail.steps[2]!.eventId,
          selectable: false,
          trailState: 'locked',
        }),
        expect.objectContaining({
          id: trailWithRetiredStop.steps[3]!.eventId,
          selectable: false,
          trailState: 'retired',
        }),
        expect.objectContaining({
          id: trailWithRetiredStop.steps[4]!.eventId,
          selectable: false,
          trailState: 'retired',
        }),
      ]),
    );
  });

  it('restores focus as trail detail loading changes to an error', async () => {
    const user = userEvent.setup();
    const baseProps = {
      discovery: { status: 'empty' } as const,
      eligibility: {},
      eligibilityBusy: false,
      locationState: 'denied' as const,
      mapConfiguration: configuration,
      mapFactory,
      onClearEventSelection: vi.fn(),
      onEnableLocation: vi.fn(),
      onLoadTrails: vi.fn(),
      onOpenTrail: vi.fn(),
      onRetry: vi.fn(),
      onRetryEligibility: vi.fn(),
      onSelectEvent: vi.fn(),
      selectedEventId: null,
      trailDiscovery: { status: 'ready', trails: [summary] } as const,
    };
    const view = render(
      <CampusExplorer
        {...baseProps}
        trailDetail={{ status: 'loading', trailId }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Trails' }));
    await user.click(
      screen.getByRole('button', { name: `View trail: ${summary.title}` }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Trail details' }),
      ).toHaveFocus(),
    );

    view.rerender(
      <CampusExplorer
        {...baseProps}
        trailDetail={{ failure: 'unavailable', status: 'error', trailId }}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Trail unavailable' }),
      ).toHaveFocus(),
    );
  });

  it('returns focus to the active Nearby navigation item when its event list becomes unavailable', async () => {
    const user = userEvent.setup();
    const eventPresentation = toEventPresentation(activeTrail.steps[1]!);
    const commonProps = {
      discovery: { events: [eventPresentation], status: 'ready' } as const,
      eligibility: {},
      eligibilityBusy: false,
      locationState: 'tracking' as const,
      mapConfiguration: configuration,
      mapFactory,
      onClearEventSelection: vi.fn(),
      onEnableLocation: vi.fn(),
      onLoadNearby: vi.fn(),
      onRetry: vi.fn(),
      onRetryEligibility: vi.fn(),
      onSelectEvent: vi.fn(),
      trailDiscovery: { status: 'idle' } as const,
    };
    const view = render(
      <CampusExplorer
        {...commonProps}
        nearbyDiscovery={{ events: [nearbyEvent], status: 'ready' }}
        selectedEventId={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Nearby' }));
    await user.click(
      screen.getByRole('button', { name: 'View event: Senate House' }),
    );
    view.rerender(
      <CampusExplorer
        {...commonProps}
        nearbyDiscovery={{ failure: 'unavailable', status: 'error' }}
        selectedEventId={nearbyEvent.eventId}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Nearby' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Nearby' })).toHaveFocus(),
    );
    expect(
      screen.getByText('Nearby events could not be loaded.'),
    ).toBeVisible();
  });

  it('hands the authoritative current trail stop to the existing event selection journey', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    render(
      <CampusExplorer
        discovery={{
          events: [
            {
              availability: 'active',
              description: activeTrail.steps[1]!.description,
              endsAt: activeTrail.steps[1]!.endsAt,
              id: activeTrail.steps[1]!.eventId,
              latitude: activeTrail.steps[1]!.latitude,
              longitude: activeTrail.steps[1]!.longitude,
              radiusMetres: activeTrail.steps[1]!.radiusMetres,
              startsAt: activeTrail.steps[1]!.startsAt,
              title: activeTrail.steps[1]!.title,
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        locationState="tracking"
        mapConfiguration={configuration}
        mapFactory={mapFactory}
        onClearEventSelection={vi.fn()}
        onEnableLocation={vi.fn()}
        onOpenTrail={vi.fn()}
        onRetry={vi.fn()}
        onRetryEligibility={vi.fn()}
        onSelectEvent={onSelectEvent}
        selectedEventId={null}
        trailDetail={{ status: 'ready', trail: activeTrail }}
        trailDiscovery={{ status: 'ready', trails: [summary] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Events/ }));
    await user.click(screen.getByRole('button', { name: 'Trails' }));
    await user.click(
      screen.getByRole('button', { name: `View trail: ${summary.title}` }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Open event: Senate House' }),
    );

    expect(onSelectEvent).toHaveBeenCalledWith(activeTrail.steps[1]!.eventId);
  });
});

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

const mapController: MapController = {
  focusPoint: vi.fn(() => true),
  onError: vi.fn(),
  onLoad(listener) {
    listener();
  },
  remove: vi.fn(),
  setReportedLocation: vi.fn(),
  setPoints: vi.fn(),
};
const mapFactory: MapFactory = vi.fn(async () => mapController);

function toEventPresentation(trailStep: PlayerTrailStep) {
  return {
    availability: 'active' as const,
    description: trailStep.description,
    endsAt: trailStep.endsAt,
    id: trailStep.eventId,
    latitude: trailStep.latitude,
    longitude: trailStep.longitude,
    radiusMetres: trailStep.radiusMetres,
    startsAt: trailStep.startsAt,
    title: trailStep.title,
  };
}
