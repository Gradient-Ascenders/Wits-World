import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CampusExplorer } from '../src/components/exploration/CampusExplorer';
import type {
  MapConfiguration,
  MapController,
  MapFactory,
} from '../src/components/exploration/map-provider';

const configuration: MapConfiguration = {
  center: [0, 0],
  styleUrl: 'https://maps.example.test/style.json',
  zoom: 14,
};

const testPoint = {
  id: 'event-test-1',
  label: 'Test event',
  latitude: 0.001,
  longitude: 0.002,
};

function createSuccessfulMapFactory(
  expectedPoints: readonly (typeof testPoint)[] = [],
): MapFactory {
  return vi.fn(async (_container, _configuration, points) => {
    const controller: MapController = {
      onError: vi.fn(),
      onLoad(listener: () => void) {
        listener();
      },
      remove: vi.fn(),
      setPoints: vi.fn(),
    };

    expect(points).toEqual(expectedPoints);

    return controller;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('campus exploration', () => {
  it('presents a loaded event on the map and in the text fallback', async () => {
    render(
      <CampusExplorer
        discovery={{
          events: [
            {
              availability: 'active',
              id: 'event-test-1',
              latitude: 0.001,
              longitude: 0.002,
              title: 'Test event',
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory([testPoint])}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('region', { name: /interactive campus map/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nearby events' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Test event' })).toBeVisible();
    expect(screen.getByText('Available now')).toBeVisible();

    await waitFor(() => {
      expect(
        screen.queryByText('Loading the campus map…'),
      ).not.toBeInTheDocument();
    });
  });

  it('updates event markers without recreating the WebGL map', async () => {
    const setPoints = vi.fn();
    const mapFactory: MapFactory = vi.fn(async () => ({
      onError: vi.fn(),
      onLoad(listener: () => void) {
        listener();
      },
      remove: vi.fn(),
      setPoints,
    }));
    const sharedProps = {
      eligibility: {},
      eligibilityBusy: false,
      mapConfiguration: configuration,
      mapFactory,
      onCheckEligibility: vi.fn(),
      onRetry: vi.fn(),
    };
    const { rerender } = render(
      <CampusExplorer {...sharedProps} discovery={{ status: 'loading' }} />,
    );

    await waitFor(() => expect(mapFactory).toHaveBeenCalledOnce());

    rerender(
      <CampusExplorer
        {...sharedProps}
        discovery={{
          events: [
            {
              availability: 'active',
              id: 'event-test-1',
              latitude: 0.001,
              longitude: 0.002,
              title: 'Test event',
            },
          ],
          status: 'ready',
        }}
      />,
    );

    await waitFor(() => expect(setPoints).toHaveBeenCalledWith([testPoint]));
    expect(mapFactory).toHaveBeenCalledOnce();
  });

  it('keeps the event list available when the map fails', async () => {
    const failingMapFactory: MapFactory = vi.fn(async () => {
      throw new Error('Expected map failure');
    });

    render(
      <CampusExplorer
        discovery={{
          events: [
            {
              availability: 'active',
              id: 'event-test-1',
              latitude: 0.001,
              longitude: 0.002,
              title: 'Test event',
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={failingMapFactory}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(await screen.findByText('The map could not load.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Test event' })).toBeVisible();
  });

  it('stops waiting when the map provider never completes loading', async () => {
    vi.useFakeTimers();

    const stalledMapFactory: MapFactory = vi.fn(async () => ({
      onError: vi.fn(),
      onLoad: vi.fn(),
      remove: vi.fn(),
      setPoints: vi.fn(),
    }));

    render(
      <CampusExplorer
        discovery={{
          events: [
            {
              availability: 'active',
              id: 'event-test-1',
              latitude: 0.001,
              longitude: 0.002,
              title: 'Test event',
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={stalledMapFactory}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading the campus map…')).toBeVisible();

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText('The map could not load.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Test event' })).toBeVisible();
  });

  it('identifies each active event in its reachability action name', () => {
    render(
      <CampusExplorer
        discovery={{
          events: [
            { ...testPoint, availability: 'active', title: 'Great Hall' },
            {
              ...testPoint,
              availability: 'active',
              id: 'event-test-2',
              title: 'Origins Centre',
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory([
          { ...testPoint, label: 'Great Hall' },
          {
            ...testPoint,
            id: 'event-test-2',
            label: 'Origins Centre',
          },
        ])}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Check reachability for Great Hall',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Check reachability for Origins Centre',
      }),
    ).toBeVisible();
  });

  it('announces event loading and offers API failure recovery', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <CampusExplorer
        discovery={{ status: 'loading' }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
        onCheckEligibility={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Loading published events…')).toHaveAttribute(
      'role',
      'status',
    );

    rerender(
      <CampusExplorer
        discovery={{
          message: 'Try again when a connection is available.',
          status: 'error',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
        onCheckEligibility={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Events are unavailable right now.')).toBeVisible();
    expect(
      screen.getByText('Try again when a connection is available.'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try loading events again' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('presents empty and non-active event states in text', () => {
    const { rerender } = render(
      <CampusExplorer
        discovery={{ status: 'empty' }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText('No published events are available.'),
    ).toBeVisible();

    rerender(
      <CampusExplorer
        discovery={{
          events: [
            { ...testPoint, availability: 'upcoming', title: 'Future event' },
            {
              ...testPoint,
              availability: 'ended',
              id: 'event-test-2',
              title: 'Past event',
            },
          ],
          status: 'ready',
        }}
        eligibility={{}}
        eligibilityBusy={false}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
        onCheckEligibility={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Upcoming')).toBeVisible();
    expect(screen.getByText('Ended')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Check reachability for/ }),
    ).not.toBeInTheDocument();
  });
});
