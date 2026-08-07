import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
      onLoad(listener) {
        listener();
      },
      remove: vi.fn(),
    };

    expect(points).toEqual(expectedPoints);

    return controller;
  });
}

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
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory([testPoint])}
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
        mapConfiguration={configuration}
        mapFactory={failingMapFactory}
        onRetry={vi.fn()}
      />,
    );

    expect(await screen.findByText('The map could not load.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Test event' })).toBeVisible();
  });

  it('announces event loading and offers API failure recovery', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <CampusExplorer
        discovery={{ status: 'loading' }}
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
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
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
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
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
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
        mapConfiguration={configuration}
        mapFactory={createSuccessfulMapFactory()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Upcoming')).toBeVisible();
    expect(screen.getByText('Ended')).toBeVisible();
  });
});
