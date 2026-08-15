import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChallengeApiError, startChallengeAttempt } from '../api/challenges';
import {
  EventDiscoveryError,
  EventEligibilityError,
  evaluateEventEligibility,
  listPlayerEvents,
  type EventEligibilityResult,
  type PlayerEvent,
} from '../api/events';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BrowserLocationError,
  requestBrowserLocation,
  type LocationClaimProvider,
} from '../browser-location';
import { CampusExplorer } from '../components/exploration/CampusExplorer';
import type {
  EventDiscoveryState,
  EventEligibilityState,
} from '../components/exploration/EventList';
import type {
  MapCoordinate,
  MapConfiguration,
  MapFactory,
} from '../components/exploration/map-provider';

const CAMPUS_MAP_CONFIGURATION: MapConfiguration = {
  accessToken: '',
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

interface ExplorePageProps {
  apiBaseUrl: string;
  locationClaimProvider?: LocationClaimProvider;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  onChallengeStarted?: (attemptId: string) => void;
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

function toEligibilityState(
  result: EventEligibilityResult,
): EventEligibilityState {
  if (result.status === 'reachable' || result.status === 'unreachable') {
    return { status: result.status };
  }

  if (result.status === 'unavailable') {
    return { status: 'event-unavailable' };
  }

  if (result.reason === 'location_accuracy') {
    return { status: 'location-uncertain' };
  }

  return { status: 'location-stale' };
}

function toEligibilityFailure(error: unknown): EventEligibilityState {
  if (error instanceof BrowserLocationError) {
    if (error.failure === 'denied') {
      return { status: 'location-denied' };
    }

    if (error.failure === 'timeout') {
      return { status: 'location-timeout' };
    }

    return { status: 'location-unavailable' };
  }

  if (
    error instanceof EventEligibilityError &&
    error.failure === 'authorization'
  ) {
    return { status: 'authorization-error' };
  }

  if (
    error instanceof EventEligibilityError &&
    error.failure === 'event-unavailable'
  ) {
    return { status: 'event-unavailable' };
  }

  return { status: 'api-error' };
}

export default function ExplorePage({
  apiBaseUrl,
  locationClaimProvider = requestBrowserLocation,
  mapFactory,
  mapboxAccessToken,
  onChallengeStarted = navigateToChallenge,
}: ExplorePageProps) {
  const getAccessToken = useApiAccessToken();
  const [attempt, setAttempt] = useState(0);
  const [discovery, setDiscovery] = useState<EventDiscoveryState>({
    status: 'loading',
  });
  const [eligibility, setEligibility] = useState<
    Record<string, EventEligibilityState | undefined>
  >({});
  const [checkingEventId, setCheckingEventId] = useState<string | null>(null);
  const [startingEventId, setStartingEventId] = useState<string | null>(null);
  const eligibilityRequest = useRef<AbortController | null>(null);
  const challengeStartRequest = useRef<AbortController | null>(null);
  const reportedLocationRef = useRef<MapCoordinate | null>(null);
  const [, setReportedLocationRevision] = useState(0);
  const mounted = useRef(true);
  const mapConfiguration = useMemo(
    () => ({ ...CAMPUS_MAP_CONFIGURATION, accessToken: mapboxAccessToken }),
    [mapboxAccessToken],
  );

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

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      eligibilityRequest.current?.abort();
      challengeStartRequest.current?.abort();
      reportedLocationRef.current = null;
    };
  }, []);

  const checkEligibility = useCallback(
    async (eventId: string) => {
      if (eligibilityRequest.current !== null) {
        return;
      }

      const controller = new AbortController();
      eligibilityRequest.current = controller;
      setCheckingEventId(eventId);
      setEligibility((current) => ({
        ...current,
        [eventId]: { status: 'locating' },
      }));

      try {
        const claim = await locationClaimProvider();

        if (!mounted.current || controller.signal.aborted) {
          return;
        }

        // Keep the coordinate in an ephemeral ref. The revision only causes
        // the map prop to refresh; the location is never persisted in state.
        reportedLocationRef.current = {
          latitude: claim.latitude,
          longitude: claim.longitude,
        };
        setReportedLocationRevision((revision) => revision + 1);

        setEligibility((current) => ({
          ...current,
          [eventId]: { status: 'checking' },
        }));

        const result = await evaluateEventEligibility({
          apiBaseUrl,
          claim,
          eventId,
          getAccessToken,
          signal: controller.signal,
        });

        if (mounted.current && !controller.signal.aborted) {
          setEligibility((current) => ({
            ...current,
            [eventId]: toEligibilityState(result),
          }));
        }
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) {
          setEligibility((current) => ({
            ...current,
            [eventId]: toEligibilityFailure(error),
          }));
        }
      } finally {
        if (mounted.current && eligibilityRequest.current === controller) {
          eligibilityRequest.current = null;
          setCheckingEventId(null);
        }
      }
    },
    [apiBaseUrl, getAccessToken, locationClaimProvider],
  );

  const startChallenge = useCallback(
    async (eventId: string) => {
      if (
        eligibilityRequest.current !== null ||
        challengeStartRequest.current !== null ||
        startingEventId !== null
      ) {
        return;
      }

      const controller = new AbortController();
      challengeStartRequest.current = controller;
      setStartingEventId(eventId);
      setEligibility((current) => ({
        ...current,
        [eventId]: { status: 'starting' },
      }));

      try {
        const claim = await locationClaimProvider();

        if (!mounted.current || controller.signal.aborted) {
          return;
        }

        const challengeAttempt = await startChallengeAttempt({
          apiBaseUrl,
          claim,
          eventId,
          getAccessToken,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          onChallengeStarted(challengeAttempt.attemptId);
        }
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) {
          setEligibility((current) => ({
            ...current,
            [eventId]: toChallengeStartFailure(error),
          }));
        }
      } finally {
        if (challengeStartRequest.current === controller) {
          challengeStartRequest.current = null;
        }

        if (mounted.current && !controller.signal.aborted) {
          setStartingEventId(null);
        }
      }
    },
    [
      apiBaseUrl,
      getAccessToken,
      locationClaimProvider,
      onChallengeStarted,
      startingEventId,
    ],
  );

  return (
    <CampusExplorer
      discovery={discovery}
      eligibility={eligibility}
      eligibilityBusy={checkingEventId !== null || startingEventId !== null}
      mapConfiguration={mapConfiguration}
      mapFactory={mapFactory}
      onCheckEligibility={(eventId) => void checkEligibility(eventId)}
      onStartChallenge={(eventId) => void startChallenge(eventId)}
      onRetry={() => setAttempt((current) => current + 1)}
      reportedLocation={reportedLocationRef.current}
    />
  );
}

function toChallengeStartFailure(error: unknown): EventEligibilityState {
  if (error instanceof BrowserLocationError) {
    if (error.failure === 'denied') {
      return { status: 'location-denied' };
    }

    if (error.failure === 'timeout') {
      return { status: 'location-timeout' };
    }

    return { status: 'location-unavailable' };
  }

  if (error instanceof ChallengeApiError) {
    if (error.failure === 'authorization') {
      return { status: 'authorization-error' };
    }

    if (error.failure === 'event-not-reachable') {
      return { status: 'unreachable' };
    }

    if (error.failure === 'event-unavailable') {
      return { status: 'event-unavailable' };
    }

    if (error.failure === 'location-retry') {
      return { status: 'location-stale' };
    }
  }

  return { status: 'start-error' };
}

function navigateToChallenge(attemptId: string): void {
  window.history.pushState({}, '', `/challenge-attempts/${attemptId}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
