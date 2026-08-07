import { useEffect, useState } from 'react';

import {
  EventDiscoveryError,
  listPlayerEvents,
  type PlayerEvent,
} from '../api/events';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import { CampusExplorer } from '../components/exploration/CampusExplorer';
import type { EventDiscoveryState } from '../components/exploration/EventList';
import type {
  MapConfiguration,
  MapFactory,
} from '../components/exploration/map-provider';

const CAMPUS_MAP_CONFIGURATION: MapConfiguration = {
  center: [28.03038, -26.19205],
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  zoom: 16,
};

interface ExplorePageProps {
  apiBaseUrl: string;
  mapFactory?: MapFactory;
}

function toDiscoveryState(events: PlayerEvent[]): EventDiscoveryState {
  if (events.length === 0) {
    return { status: 'empty' };
  }

  return {
    events: events.map((event) => ({
      availability: event.availability,
      id: event.eventId,
      latitude: event.latitude,
      longitude: event.longitude,
      title: event.title,
    })),
    status: 'ready',
  };
}

function getFailureMessage(error: unknown): string {
  if (
    error instanceof EventDiscoveryError &&
    error.failure === 'authorization'
  ) {
    return 'Your session could not load events. Try again, or sign out and sign in again.';
  }

  return 'Check your connection and try again.';
}

export default function ExplorePage({
  apiBaseUrl,
  mapFactory,
}: ExplorePageProps) {
  const getAccessToken = useApiAccessToken();
  const [attempt, setAttempt] = useState(0);
  const [discovery, setDiscovery] = useState<EventDiscoveryState>({
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();

    setDiscovery({ status: 'loading' });

    void listPlayerEvents({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((events) => {
        if (!controller.signal.aborted) {
          setDiscovery(toDiscoveryState(events));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDiscovery({
            message: getFailureMessage(error),
            status: 'error',
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, attempt, getAccessToken]);

  return (
    <CampusExplorer
      discovery={discovery}
      mapConfiguration={CAMPUS_MAP_CONFIGURATION}
      mapFactory={mapFactory}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  );
}
