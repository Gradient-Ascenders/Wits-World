import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useLocation } from 'wouter';

import { ChallengeApiError, startChallengeAttempt } from '../api/challenges';
import {
  EventDiscoveryError,
  EventEligibilityError,
  evaluateEventEligibility,
  listPlayerEvents,
  type EventEligibilityResult,
  type PlayerEvent,
} from '../api/events';
import {
  getPlayerTrail,
  listNearbyUnvisited,
  listPlayerTrails,
  NearbyUnvisitedError,
  TrailDiscoveryError,
} from '../api/trails';
import { useApiAccessToken } from '../auth/useApiAccessToken';
import {
  BrowserLocationError,
  getBrowserLocationPermission,
  isBrowserLocationSupported,
  observeBrowserLocation,
  requestBrowserLocation,
  type LocationClaim,
  type LocationClaimProvider,
  type LocationObservationProvider,
  type LocationPermissionProvider,
} from '../browser-location';
import {
  CampusExplorer,
  type ExploreMode,
} from '../components/exploration/CampusExplorer';
import type {
  EventDiscoveryState,
  EventEligibilityState,
  LocationExperienceState,
} from '../components/exploration/EventList';
import type {
  NearbyDiscoveryState,
  TrailDetailState,
  TrailListState,
} from '../components/exploration/TrailDiscovery';
import type {
  MapConfiguration,
  MapFactory,
  ReportedMapLocation,
} from '../components/exploration/map-provider';
import { useTerritoryDiscovery } from '../components/exploration/useTerritoryDiscovery';
import { selectReportedLocation } from '../reported-location-selection';
import { useOffline } from '../offline/OfflineProvider';
import { useOfflineExploration } from '../offline/useOfflineExploration';
import {
  checkOfflineLocation,
  offlineLocationMessage,
} from '../offline/location';
import { launchSavedChallenge } from '../offline/launch-saved-challenge';
import { READ_TIMEOUT_MS } from '../components/loading-policy';

const CAMPUS_MAP_CONFIGURATION: MapConfiguration = {
  accessToken: '',
  bearing: 0,
  center: [28.03038, -26.19205],
  pitch: 0,
  standardConfig: {
    show3dBuildings: true,
    show3dLandmarks: true,
    show3dObjects: true,
    show3dTrees: true,
    showPedestrianRoads: true,
  },
  styleUrl: 'mapbox://styles/mapbox/standard',
  zoom: 16.5,
};

const ELIGIBILITY_REFRESH_MS = 15_000;
const MEANINGFUL_MOVEMENT_METRES = 10;
const EARTH_RADIUS_METRES = 6_371_008.8;
// The API's two-minute freshness rule remains authoritative. This shorter
// reuse window only decides when the browser should acquire a newer ephemeral
// reported-location claim before challenge start, leaving time for transit.
const MAX_REUSABLE_CHALLENGE_LOCATION_AGE_MS = 105_000;

interface ExplorePageProps {
  apiBaseUrl: string;
  locationClaimProvider?: LocationClaimProvider;
  locationObservationProvider?: LocationObservationProvider;
  locationPermissionProvider?: LocationPermissionProvider;
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
      description: event.description,
      endsAt: event.endsAt,
      id: event.eventId,
      latitude: event.latitude,
      longitude: event.longitude,
      radiusMetres: event.radiusMetres,
      startsAt: event.startsAt,
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

  if (result.reason === 'journey_too_fast') {
    return { status: 'journey-too-fast' };
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
  locationObservationProvider = observeBrowserLocation,
  locationPermissionProvider = getBrowserLocationPermission,
  mapFactory,
  mapboxAccessToken,
  onChallengeStarted = navigateToChallenge,
}: ExplorePageProps) {
  const getAccessToken = useApiAccessToken();
  const { isAuthenticated } = useAuth0();
  const { reportConnectionFailure, online, connectionFailed, refresh } =
    useOffline();
  const saved = useOfflineExploration();
  const [, navigate] = useLocation();
  const usingSaved = !online || connectionFailed || !isAuthenticated;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const offlineModeRef = useRef(usingSaved);
  offlineModeRef.current = usingSaved;
  const arrivalsRef = useRef(new Map<string, LocationClaim>());
  const [savedStartMessage, setSavedStartMessage] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const [attempt, setAttempt] = useState(0);
  const [discovery, setDiscovery] = useState<EventDiscoveryState>({
    status: 'loading',
  });
  const [trailDiscovery, setTrailDiscovery] = useState<TrailListState>({
    status: 'idle',
  });
  const [trailDetail, setTrailDetail] = useState<TrailDetailState>({
    status: 'idle',
  });
  const [nearbyDiscovery, setNearbyDiscovery] = useState<NearbyDiscoveryState>({
    status: 'idle',
  });
  const [eligibility, setEligibility] = useState<
    Record<string, EventEligibilityState | undefined>
  >({});
  const [checkingEventId, setCheckingEventId] = useState<string | null>(null);
  const [refreshingLocationEventId, setRefreshingLocationEventId] = useState<
    string | null
  >(null);
  const [startingEventId, setStartingEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('event'),
  );
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(
    null,
  );
  const [exploreMode, setExploreMode] = useState<ExploreMode>('discover');
  const [locationState, setLocationState] = useState<LocationExperienceState>(
    'checking-permission',
  );
  const [, setReportedLocationRevision] = useState(0);
  const eligibilityRequest = useRef<AbortController | null>(null);
  const challengeStartRequest = useRef<AbortController | null>(null);
  const trailListRequest = useRef<AbortController | null>(null);
  const trailDetailRequest = useRef<AbortController | null>(null);
  const nearbyRequest = useRef<AbortController | null>(null);
  const nearbyRequestedRef = useRef(false);
  const nearbyNeedsFreshClaimRef = useRef(false);
  const loadNearbyRef = useRef<(claim: LocationClaim) => void>(() => undefined);
  const latestClaimRef = useRef<LocationClaim | null>(null);
  const displayedClaimRef = useRef<LocationClaim | null>(null);
  const locationSamplesRef = useRef<readonly LocationClaim[]>([]);
  const rejectedLocationClaimRef = useRef<{
    claim: LocationClaim;
    eventId: string;
  } | null>(null);
  const locationRefreshInFlightRef = useRef(false);
  const selectedEventIdRef = useRef<string | null>(null);
  const discoveryRef = useRef<EventDiscoveryState>(discovery);
  const stopLocationWatchRef = useRef<(() => void) | null>(null);
  const trackingRequestedRef = useRef(false);
  const trackingPausedForVisibilityRef = useRef(false);
  const mounted = useRef(true);
  const lastEligibilityAtRef = useRef(0);
  const lastEligibilityClaimRef = useRef<LocationClaim | null>(null);
  const lastEligibilityEventIdRef = useRef<string | null>(null);
  const pendingEligibilityRef = useRef<{
    claim: LocationClaim;
    eventId: string;
  } | null>(null);
  const eligibilityTimerRef = useRef<number | null>(null);
  const queueEligibilityRef = useRef<
    (eventId: string, claim: LocationClaim, force?: boolean) => void
  >(() => undefined);
  const mapConfiguration = useMemo(
    () => ({ ...CAMPUS_MAP_CONFIGURATION, accessToken: mapboxAccessToken }),
    [mapboxAccessToken],
  );

  discoveryRef.current = discovery;
  selectedEventIdRef.current = selectedEventId;

  const clearTerritorySelection = useCallback(() => {
    setSelectedTerritoryId(null);
  }, []);
  const territory = useTerritoryDiscovery({
    apiBaseUrl,
    enabled: exploreMode === 'territories' && !usingSaved,
    getAccessToken,
    onConnectionFailure: reportConnectionFailure,
    onSelectedZoneUnavailable: clearTerritorySelection,
    selectedZoneId: selectedTerritoryId,
  });

  useEffect(() => {
    if (!online || !isAuthenticated || connectionFailed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort();
      reportConnectionFailure();
      setDiscovery({
        status: 'error',
        message:
          'The server took too long to respond. Open saved events or retry when connected.',
      });
    }, READ_TIMEOUT_MS);
    setDiscovery((current) =>
      current.status === 'ready' || current.status === 'empty'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );

    void listPlayerEvents({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((events) => {
        clearTimeout(timer);
        if (!controller.signal.aborted) {
          setDiscovery(toDiscoveryState(events));
        }
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        if (!controller.signal.aborted) {
          if (
            error instanceof EventDiscoveryError &&
            error.failure === 'unavailable'
          )
            reportConnectionFailure();
          setDiscovery((current) =>
            !(
              error instanceof EventDiscoveryError &&
              error.failure === 'authorization'
            ) &&
            (current.status === 'ready' || current.status === 'empty')
              ? {
                  ...current,
                  refreshing: false,
                  refreshError: getFailureMessage(error),
                }
              : { message: getFailureMessage(error), status: 'error' },
          );
        }
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    apiBaseUrl,
    attempt,
    getAccessToken,
    reportConnectionFailure,
    online,
    isAuthenticated,
    connectionFailed,
  ]);
  useEffect(() => {
    if (usingSaved) {
      setExploreMode('discover');
      eligibilityRequest.current?.abort();
      trailListRequest.current?.abort();
      trailDetailRequest.current?.abort();
      nearbyRequest.current?.abort();
      setCheckingEventId(null);
    }
  }, [usingSaved]);

  const loadTrails = useCallback((): void => {
    trailListRequest.current?.abort();
    const controller = new AbortController();
    trailListRequest.current = controller;
    setTrailDiscovery((current) =>
      current.status === 'ready' || current.status === 'empty'
        ? { ...current, refreshing: true, refreshError: undefined }
        : { status: 'loading' },
    );

    void listPlayerTrails({
      apiBaseUrl,
      getAccessToken,
      signal: controller.signal,
    })
      .then((trails) => {
        if (!controller.signal.aborted && mounted.current) {
          setTrailDiscovery(
            trails.length === 0
              ? { status: 'empty' }
              : { status: 'ready', trails },
          );
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && mounted.current) {
          if (
            error instanceof TrailDiscoveryError &&
            error.failure === 'unavailable'
          ) {
            reportConnectionFailure();
          }
          setTrailDiscovery((current) =>
            !(
              error instanceof TrailDiscoveryError &&
              error.failure === 'authorization'
            ) &&
            (current.status === 'ready' || current.status === 'empty')
              ? {
                  ...current,
                  refreshing: false,
                  refreshError:
                    'Trails could not be refreshed. Retry to confirm current progress.',
                }
              : {
                  failure:
                    error instanceof TrailDiscoveryError
                      ? error.failure
                      : 'unavailable',
                  status: 'error',
                },
          );
        }
      })
      .finally(() => {
        if (trailListRequest.current === controller) {
          trailListRequest.current = null;
        }
      });
  }, [apiBaseUrl, getAccessToken, reportConnectionFailure]);

  const openTrail = useCallback(
    (trailId: string): void => {
      trailDetailRequest.current?.abort();
      const controller = new AbortController();
      trailDetailRequest.current = controller;
      setTrailDetail({ status: 'loading', trailId });

      void getPlayerTrail({
        apiBaseUrl,
        getAccessToken,
        signal: controller.signal,
        trailId,
      })
        .then((trail) => {
          if (!controller.signal.aborted && mounted.current) {
            setTrailDetail({ status: 'ready', trail });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && mounted.current) {
            if (
              error instanceof TrailDiscoveryError &&
              error.failure === 'unavailable'
            ) {
              reportConnectionFailure();
            }
            setTrailDetail({
              failure:
                error instanceof TrailDiscoveryError
                  ? error.failure
                  : 'unavailable',
              status: 'error',
              trailId,
            });
          }
        })
        .finally(() => {
          if (trailDetailRequest.current === controller) {
            trailDetailRequest.current = null;
          }
        });
    },
    [apiBaseUrl, getAccessToken, reportConnectionFailure],
  );

  const clearEligibilityTimer = useCallback((): void => {
    if (eligibilityTimerRef.current !== null) {
      window.clearTimeout(eligibilityTimerRef.current);
      eligibilityTimerRef.current = null;
    }
  }, []);

  const executeEligibility = useCallback(
    async (eventId: string, claim: LocationClaim): Promise<void> => {
      if (eligibilityRequest.current !== null) {
        pendingEligibilityRef.current = { claim, eventId };
        return;
      }

      const controller = new AbortController();
      eligibilityRequest.current = controller;
      lastEligibilityAtRef.current = Date.now();
      lastEligibilityClaimRef.current = claim;
      lastEligibilityEventIdRef.current = eventId;
      pendingEligibilityRef.current = null;
      setCheckingEventId(eventId);
      setEligibility((current) => ({
        ...current,
        [eventId]: { status: 'checking' },
      }));

      try {
        const result = await evaluateEventEligibility({
          apiBaseUrl,
          claim,
          eventId,
          getAccessToken,
          signal: controller.signal,
        });

        if (mounted.current && !controller.signal.aborted) {
          const nextState = toEligibilityState(result);
          if (
            nextState.status === 'location-stale' ||
            nextState.status === 'journey-too-fast'
          ) {
            rejectedLocationClaimRef.current = { claim, eventId };
          } else if (rejectedLocationClaimRef.current?.eventId === eventId) {
            rejectedLocationClaimRef.current = null;
          }
          setEligibility((current) => ({
            ...current,
            [eventId]: nextState,
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
        const ownsRequest = eligibilityRequest.current === controller;
        if (ownsRequest) {
          eligibilityRequest.current = null;
          if (mounted.current) {
            setCheckingEventId(null);
            const pending = pendingEligibilityRef.current as {
              claim: LocationClaim;
              eventId: string;
            } | null;
            if (pending !== null) {
              queueEligibilityRef.current(pending.eventId, pending.claim);
            }
          }
        }
      }
    },
    [apiBaseUrl, getAccessToken],
  );

  const queueEligibility = useCallback(
    (eventId: string, claim: LocationClaim, force = false): void => {
      if (offlineModeRef.current) return;
      if (!isActiveEvent(discoveryRef.current, eventId)) {
        return;
      }

      const previousClaim = lastEligibilityClaimRef.current;
      const sameEvent = lastEligibilityEventIdRef.current === eventId;
      if (
        !force &&
        sameEvent &&
        previousClaim !== null &&
        !hasMeaningfulReportedLocationUpdate(previousClaim, claim)
      ) {
        return;
      }

      pendingEligibilityRef.current = { claim, eventId };
      if (eligibilityRequest.current !== null) {
        return;
      }

      const elapsed = Date.now() - lastEligibilityAtRef.current;
      const remaining =
        force || !sameEvent ? 0 : Math.max(0, ELIGIBILITY_REFRESH_MS - elapsed);
      if (remaining === 0) {
        clearEligibilityTimer();
        void executeEligibility(eventId, claim);
        return;
      }

      if (eligibilityTimerRef.current === null) {
        eligibilityTimerRef.current = window.setTimeout(() => {
          eligibilityTimerRef.current = null;
          const pending = pendingEligibilityRef.current;
          if (pending !== null) {
            void executeEligibility(pending.eventId, pending.claim);
          }
        }, remaining);
      }
    },
    [clearEligibilityTimer, executeEligibility],
  );
  queueEligibilityRef.current = queueEligibility;

  const rememberReportedLocation = useCallback(
    (claim: LocationClaim, resetSamples = false): LocationClaim => {
      const selection = resetSamples
        ? { samples: [claim], selected: claim }
        : selectReportedLocation(locationSamplesRef.current, claim);
      latestClaimRef.current = claim;
      for (const { pack } of savedRef.current.local?.packs ?? []) {
        if (
          pack.locationPolicy !== 'arrival-v1' ||
          Date.parse(claim.acquiredAt) < Date.parse(pack.validFrom)
        )
          continue;
        try {
          checkOfflineLocation(claim, pack.event, true);
          arrivalsRef.current.set(pack.packId, claim);
        } catch {
          /* A location outside this event never records arrival. */
        }
      }
      locationSamplesRef.current = selection.samples;

      if (displayedClaimRef.current !== selection.selected) {
        displayedClaimRef.current = selection.selected;
        setReportedLocationRevision((revision) => revision + 1);
      }

      setLocationState('tracking');
      return selection.selected;
    },
    [],
  );

  const acquireNewerReportedLocation = useCallback(
    async (previousClaim: LocationClaim | null): Promise<LocationClaim> => {
      const claim = await locationClaimProvider();
      if (
        !isFreshReusableLocationClaim(claim) ||
        (previousClaim !== null && !isNewerLocationClaim(claim, previousClaim))
      ) {
        throw new FreshReportedLocationRequiredError();
      }

      rememberReportedLocation(claim, true);
      return claim;
    },
    [locationClaimProvider, rememberReportedLocation],
  );

  const loadNearbyFromClaim = useCallback(
    (claim: LocationClaim): void => {
      nearbyRequest.current?.abort();
      const controller = new AbortController();
      nearbyRequest.current = controller;
      setNearbyDiscovery((current) =>
        current.status === 'ready' || current.status === 'empty'
          ? { ...current, refreshing: true, refreshError: undefined }
          : { status: 'loading' },
      );

      void listNearbyUnvisited({
        apiBaseUrl,
        claim,
        getAccessToken,
        signal: controller.signal,
      })
        .then((events) => {
          if (!controller.signal.aborted && mounted.current) {
            nearbyNeedsFreshClaimRef.current = false;
            setNearbyDiscovery(
              events.length === 0
                ? { status: 'empty' }
                : { events, status: 'ready' },
            );
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && mounted.current) {
            const failure =
              error instanceof NearbyUnvisitedError
                ? error.failure
                : 'unavailable';
            if (failure === 'unavailable') reportConnectionFailure();
            nearbyNeedsFreshClaimRef.current = failure === 'location-retry';
            setNearbyDiscovery((current) =>
              failure === 'unavailable' &&
              (current.status === 'ready' || current.status === 'empty')
                ? {
                    ...current,
                    refreshing: false,
                    refreshError:
                      'Nearby events could not be refreshed. Retry to confirm results for your current location.',
                  }
                : { failure, status: 'error' },
            );
          }
        })
        .finally(() => {
          if (nearbyRequest.current === controller) {
            nearbyRequest.current = null;
          }
        });
    },
    [apiBaseUrl, getAccessToken, reportConnectionFailure],
  );
  loadNearbyRef.current = loadNearbyFromClaim;

  const stopLocationWatch = useCallback((retainIntent = false): void => {
    stopLocationWatchRef.current?.();
    stopLocationWatchRef.current = null;
    if (!retainIntent) {
      trackingRequestedRef.current = false;
    }
  }, []);

  const startLocationWatch = useCallback((): void => {
    stopLocationWatch(true);
    trackingRequestedRef.current = true;
    setLocationState('locating');
    let active = true;
    let providerStop = (): void => undefined;
    stopLocationWatchRef.current = () => {
      if (!active) {
        return;
      }

      active = false;
      providerStop();
    };
    const stop = locationObservationProvider({
      onError(error) {
        if (!active || !mounted.current) {
          return;
        }

        stopLocationWatch();
        const nextState = toLocationExperienceState(
          error,
          latestClaimRef.current !== null,
        );
        setLocationState(nextState);
        const eventId = selectedEventIdRef.current;
        if (eventId !== null) {
          setEligibility((current) => ({
            ...current,
            [eventId]: toEligibilityFailure(error),
          }));
        }
      },
      onLocation(claim) {
        if (!active || !mounted.current || !isUsableLocationClaim(claim)) {
          return;
        }

        rememberReportedLocation(claim);
        if (nearbyRequestedRef.current) {
          nearbyRequestedRef.current = false;
          loadNearbyRef.current(claim);
        }
        const eventId = selectedEventIdRef.current;
        if (eventId !== null) {
          // Marker stabilisation is presentation-only. Eligibility must receive
          // the current device claim and remain server-authoritative.
          queueEligibilityRef.current(eventId, claim);
        }
      },
    });
    providerStop = stop;
    if (!active) {
      stop();
    }
  }, [
    locationObservationProvider,
    rememberReportedLocation,
    stopLocationWatch,
  ]);

  const requestNearby = useCallback((): void => {
    if (nearbyRequest.current !== null) {
      return;
    }

    const latestClaim = latestClaimRef.current;
    const needsFreshClaim =
      nearbyNeedsFreshClaimRef.current ||
      (latestClaim !== null && !isFreshReusableLocationClaim(latestClaim));

    if (latestClaim !== null && !needsFreshClaim) {
      nearbyRequestedRef.current = false;
      loadNearbyFromClaim(latestClaim);
      return;
    }

    if (needsFreshClaim) {
      nearbyRequestedRef.current = true;
      setNearbyDiscovery((current) =>
        current.status === 'ready' || current.status === 'empty'
          ? { ...current, refreshing: true, refreshError: undefined }
          : { status: 'loading' },
      );
      void acquireNewerReportedLocation(latestClaim)
        .then((claim) => {
          if (mounted.current && nearbyRequestedRef.current) {
            nearbyRequestedRef.current = false;
            loadNearbyFromClaim(claim);
          }
        })
        .catch((error: unknown) => {
          if (!mounted.current || !nearbyRequestedRef.current) return;
          if (error instanceof BrowserLocationError) {
            setLocationState(
              toLocationExperienceState(error, latestClaim !== null),
            );
            setNearbyDiscovery({ status: 'waiting-location' });
          } else {
            setNearbyDiscovery({
              failure: 'location-retry',
              status: 'error',
            });
          }
        });
      return;
    }

    nearbyRequestedRef.current = true;
    setNearbyDiscovery({ status: 'waiting-location' });
  }, [acquireNewerReportedLocation, loadNearbyFromClaim]);

  useEffect(() => {
    mounted.current = true;
    let active = true;

    if (
      locationObservationProvider === observeBrowserLocation &&
      !isBrowserLocationSupported()
    ) {
      setLocationState('unsupported');
      return () => {
        mounted.current = false;
      };
    }

    void locationPermissionProvider()
      .then((permission) => {
        if (!active || !mounted.current) {
          return;
        }

        if (permission === 'granted') {
          startLocationWatch();
        } else if (permission === 'denied') {
          setLocationState('denied');
        } else {
          setLocationState('permission-required');
        }
      })
      .catch(() => {
        if (active && mounted.current) {
          setLocationState('permission-required');
        }
      });

    return () => {
      active = false;
      mounted.current = false;
      stopLocationWatch();
      eligibilityRequest.current?.abort();
      challengeStartRequest.current?.abort();
      trailListRequest.current?.abort();
      trailDetailRequest.current?.abort();
      nearbyRequest.current?.abort();
      clearEligibilityTimer();
      pendingEligibilityRef.current = null;
      latestClaimRef.current = null;
      displayedClaimRef.current = null;
      locationSamplesRef.current = [];
      rejectedLocationClaimRef.current = null;
      locationRefreshInFlightRef.current = false;
      nearbyRequestedRef.current = false;
    };
  }, [
    clearEligibilityTimer,
    locationObservationProvider,
    locationPermissionProvider,
    startLocationWatch,
    stopLocationWatch,
  ]);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        clearEligibilityTimer();
        pendingEligibilityRef.current = null;
        if (stopLocationWatchRef.current !== null) {
          trackingPausedForVisibilityRef.current = true;
          stopLocationWatch(true);
        }
        return;
      }

      if (
        trackingPausedForVisibilityRef.current &&
        trackingRequestedRef.current
      ) {
        trackingPausedForVisibilityRef.current = false;
        startLocationWatch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearEligibilityTimer, startLocationWatch, stopLocationWatch]);

  const selectEvent = useCallback(
    (eventId: string): void => {
      if (selectedEventIdRef.current === eventId) {
        return;
      }

      selectedEventIdRef.current = eventId;
      setSelectedEventId(eventId);
      clearEligibilityTimer();
      pendingEligibilityRef.current = null;
      if (eligibilityRequest.current !== null) {
        eligibilityRequest.current.abort();
        eligibilityRequest.current = null;
        setCheckingEventId(null);
      }
      lastEligibilityEventIdRef.current = null;
      rejectedLocationClaimRef.current = null;
      const claim = latestClaimRef.current;
      if (claim !== null) {
        queueEligibility(eventId, claim, true);
      } else {
        setEligibility((current) => ({
          ...current,
          [eventId]: { status: 'locating' },
        }));
      }
    },
    [clearEligibilityTimer, queueEligibility],
  );

  const clearSelectedEvent = useCallback((): void => {
    selectedEventIdRef.current = null;
    setSelectedEventId(null);
    clearEligibilityTimer();
    pendingEligibilityRef.current = null;
    if (eligibilityRequest.current !== null) {
      eligibilityRequest.current.abort();
      eligibilityRequest.current = null;
      setCheckingEventId(null);
    }
    lastEligibilityEventIdRef.current = null;
    rejectedLocationClaimRef.current = null;
  }, [clearEligibilityTimer]);

  const retryEligibility = useCallback(
    (eventId: string): void => {
      const claim = latestClaimRef.current;
      const rejected = rejectedLocationClaimRef.current;
      if (rejected?.eventId !== eventId) {
        if (claim !== null) {
          queueEligibility(eventId, claim, true);
        }
        return;
      }

      if (
        claim !== null &&
        isFreshReusableLocationClaim(claim) &&
        isNewerLocationClaim(claim, rejected.claim)
      ) {
        rejectedLocationClaimRef.current = null;
        queueEligibility(eventId, claim, true);
        return;
      }

      if (locationRefreshInFlightRef.current) {
        return;
      }

      locationRefreshInFlightRef.current = true;
      setRefreshingLocationEventId(eventId);
      setEligibility((current) => ({
        ...current,
        [eventId]: { status: 'locating' },
      }));
      void acquireNewerReportedLocation(rejected.claim)
        .then((newerClaim) => {
          if (!mounted.current || selectedEventIdRef.current !== eventId) {
            return;
          }

          rejectedLocationClaimRef.current = null;
          queueEligibility(eventId, newerClaim, true);
        })
        .catch((error: unknown) => {
          if (mounted.current && selectedEventIdRef.current === eventId) {
            setEligibility((current) => ({
              ...current,
              [eventId]: toChallengeStartFailure(error),
            }));
          }
        })
        .finally(() => {
          locationRefreshInFlightRef.current = false;
          if (mounted.current) {
            setRefreshingLocationEventId(null);
          }
        });
    },
    [acquireNewerReportedLocation, queueEligibility],
  );

  const startChallenge = useCallback(
    async (eventId: string) => {
      if (challengeStartRequest.current !== null || startingEventId !== null) {
        return;
      }

      const local = savedRef.current.local;
      const existing = local?.attempts.find(
        (item) => item.cached.pack.event.eventId === eventId,
      );
      if (existing) {
        navigate(`/offline-attempts/${existing.clientAttemptId}`);
        return;
      }
      const cached = local?.packs.find(
        (item) =>
          item.pack.event.eventId === eventId &&
          Date.parse(item.pack.validFrom) <= Date.now() &&
          Date.parse(item.pack.validUntil) > Date.now(),
      );
      if (cached) {
        const controller = new AbortController();
        challengeStartRequest.current = controller;
        setStartingEventId(eventId);
        setSavedStartMessage('Checking arrival…');
        try {
          const value = await launchSavedChallenge({
            cached,
            arrival:
              arrivalsRef.current.get(cached.pack.packId) ??
              latestClaimRef.current,
            acquireLocation: locationClaimProvider,
            signal: controller.signal,
            onSaving: () => setSavedStartMessage('Saving your challenge…'),
          });
          if (!mounted.current) return;
          refresh();
          navigate(`/offline-attempts/${value.clientAttemptId}`);
        } catch (error) {
          if (mounted.current)
            setSavedStartMessage(
              error instanceof Error
                ? offlineLocationMessage(error)
                : 'This challenge could not open. Your saved attempts are kept.',
            );
        } finally {
          if (challengeStartRequest.current === controller) {
            challengeStartRequest.current = null;
            if (mounted.current) setStartingEventId(null);
          }
        }
        return;
      }
      if (offlineModeRef.current) {
        setSavedStartMessage(
          'This challenge was not downloaded. Reconnect to prepare it.',
        );
        return;
      }

      const controller = new AbortController();
      challengeStartRequest.current = controller;
      setStartingEventId(eventId);
      setEligibility((current) => ({
        ...current,
        [eventId]: { status: 'starting' },
      }));

      const acquisitionBaseline = latestClaimRef.current;
      let submittedClaim: LocationClaim | null = null;
      try {
        // A reachable result is display state, never authorization. Challenge
        // start submits a sufficiently fresh ephemeral claim through the
        // existing API, which performs its own authoritative eligibility
        // recheck. An old watched claim triggers a new one-shot acquisition.
        const watchedClaim = acquisitionBaseline;
        submittedClaim =
          watchedClaim !== null && isFreshReusableLocationClaim(watchedClaim)
            ? watchedClaim
            : await acquireNewerReportedLocation(watchedClaim);
        if (!mounted.current || controller.signal.aborted) {
          return;
        }

        const challengeAttempt = await startChallengeAttempt({
          apiBaseUrl,
          claim: submittedClaim,
          eventId,
          getAccessToken,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          onChallengeStarted(challengeAttempt.attemptId);
        }
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) {
          const failure = toChallengeStartFailure(error);
          const rejectedClaim = submittedClaim ?? acquisitionBaseline;
          if (failure.status === 'location-stale' && rejectedClaim !== null) {
            rejectedLocationClaimRef.current = {
              claim: rejectedClaim,
              eventId,
            };
          }
          setEligibility((current) => ({
            ...current,
            [eventId]: failure,
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
      acquireNewerReportedLocation,
      locationClaimProvider,
      onChallengeStarted,
      startingEventId,
      navigate,
      refresh,
    ],
  );

  const reportedLocation: ReportedMapLocation | null =
    displayedClaimRef.current === null
      ? null
      : {
          latitude: displayedClaimRef.current.latitude,
          longitude: displayedClaimRef.current.longitude,
          accuracyMetres: displayedClaimRef.current.accuracyMetres,
        };

  const locationStale =
    locationState !== 'tracking' ||
    !displayedClaimRef.current ||
    clock - Date.parse(displayedClaimRef.current.acquiredAt) > 120_000;
  const catalogue =
    usingSaved || discovery.status !== 'ready'
      ? saved.events.map((event) => ({ ...event, id: event.eventId }))
      : discovery.events;
  const presentedEvents = catalogue.map((event) => {
    const pack = saved.local?.packs.find(
      (item) => item.pack.event.eventId === event.id,
    );
    return {
      ...event,
      availability: !usingSaved
        ? event.availability
        : Date.parse(event.endsAt) <= clock
          ? ('ended' as const)
          : Date.parse(event.startsAt) > clock
            ? ('upcoming' as const)
            : ('active' as const),
      offlineStatus: pack
        ? Date.parse(pack.pack.validUntil) > clock
          ? ('Downloaded' as const)
          : ('Expired' as const)
        : ('Not downloaded' as const),
    };
  });
  const effectiveDiscovery: EventDiscoveryState = catalogue.length
    ? { status: 'ready', events: presentedEvents }
    : usingSaved
      ? saved.error
        ? { status: 'error', message: saved.error }
        : { status: 'empty' }
      : discovery;
  const savedActions: Record<
    string,
    { label: string; detail: string; disabled?: boolean; onPlay?: () => void }
  > = {};
  for (const event of presentedEvents) {
    const cachedPack = saved.local?.packs.find(
      (item) => item.pack.event.eventId === event.id,
    );
    const localAttempt = saved.local?.attempts.find(
      (item) => item.cached.pack.event.eventId === event.id,
    );
    if (localAttempt || event.offlineStatus === 'Downloaded' || usingSaved) {
      savedActions[event.id] = {
        label:
          startingEventId === event.id
            ? 'Checking location…'
            : localAttempt
              ? localAttempt.status === 'active'
                ? 'Continue challenge'
                : 'View saved attempt'
              : 'Play',
        detail:
          savedStartMessage && selectedEventId === event.id
            ? savedStartMessage
            : localAttempt
              ? localAttempt.status === 'active'
                ? 'Your challenge is saved on this device.'
                : 'Answers saved. Waiting for the server to confirm your result.'
              : event.offlineStatus === 'Downloaded'
                ? cachedPack?.pack.locationPolicy === 'arrival-v1'
                  ? `Start within ${event.radiusMetres} metres. Answers are saved on this device.`
                  : `Start within ${event.radiusMetres} metres. Location is also needed when you finish this older download.`
                : event.offlineStatus === 'Expired'
                  ? 'This download has expired. Reconnect to refresh it.'
                  : 'These questions were not downloaded. Reconnect to play this event.',
        disabled:
          startingEventId === event.id ||
          (!localAttempt && event.availability !== 'active'),
        onPlay:
          localAttempt || event.offlineStatus === 'Downloaded'
            ? () => void startChallenge(event.id)
            : undefined,
      };
    }
  }

  return (
    <CampusExplorer
      discovery={effectiveDiscovery}
      offlineMap={usingSaved}
      savedActions={savedActions}
      locationStale={locationStale}
      eligibility={eligibility}
      eligibilityBusy={
        checkingEventId !== null ||
        refreshingLocationEventId !== null ||
        startingEventId !== null
      }
      locationState={
        locationState === 'tracking' && locationStale && reportedLocation
          ? 'stale'
          : locationState
      }
      mapConfiguration={mapConfiguration}
      mapFactory={mapFactory}
      exploreMode={exploreMode}
      nearbyDiscovery={nearbyDiscovery}
      onClearEventSelection={clearSelectedEvent}
      onClearTerritorySelection={clearTerritorySelection}
      onEnableLocation={startLocationWatch}
      onExploreModeChange={setExploreMode}
      onLoadNearby={requestNearby}
      onLoadTrails={loadTrails}
      onOpenTrail={openTrail}
      onRetry={() => setAttempt((current) => current + 1)}
      onRetryEligibility={retryEligibility}
      onRefreshTerritoryDetail={territory.refreshDetail}
      onRefreshTerritoryZones={territory.refreshZones}
      onSelectEvent={selectEvent}
      onSelectTerritory={setSelectedTerritoryId}
      onStartChallenge={(eventId) => void startChallenge(eventId)}
      reportedLocation={reportedLocation}
      selectedEventId={selectedEventId}
      selectedTerritoryId={selectedTerritoryId}
      territoryDetail={territory.detail}
      territoryList={territory.list}
      trailDetail={trailDetail}
      trailDiscovery={trailDiscovery}
    />
  );
}

function toLocationExperienceState(
  error: BrowserLocationError,
  hasLocation: boolean,
): LocationExperienceState {
  if (error.failure === 'blocked') {
    return 'blocked';
  }

  if (error.failure === 'denied') {
    return 'denied';
  }

  if (error.failure === 'timeout') {
    return 'timeout';
  }

  if (error.failure === 'unsupported') {
    return 'unsupported';
  }

  return hasLocation ? 'stale' : 'unavailable';
}

function isActiveEvent(
  discovery: EventDiscoveryState,
  eventId: string,
): boolean {
  return (
    discovery.status === 'ready' &&
    discovery.events.some(
      (event) => event.id === eventId && event.availability === 'active',
    )
  );
}

function isUsableLocationClaim(claim: LocationClaim): boolean {
  return (
    Number.isFinite(claim.latitude) &&
    claim.latitude >= -90 &&
    claim.latitude <= 90 &&
    Number.isFinite(claim.longitude) &&
    claim.longitude >= -180 &&
    claim.longitude <= 180 &&
    Number.isFinite(claim.accuracyMetres) &&
    claim.accuracyMetres >= 0 &&
    !Number.isNaN(Date.parse(claim.acquiredAt))
  );
}

function isFreshReusableLocationClaim(
  claim: LocationClaim,
  now = Date.now(),
): boolean {
  if (!isUsableLocationClaim(claim)) {
    return false;
  }

  const ageMilliseconds = now - Date.parse(claim.acquiredAt);
  return (
    ageMilliseconds >= 0 &&
    ageMilliseconds <= MAX_REUSABLE_CHALLENGE_LOCATION_AGE_MS
  );
}

function isNewerLocationClaim(
  candidate: LocationClaim,
  previous: LocationClaim,
): boolean {
  return Date.parse(candidate.acquiredAt) > Date.parse(previous.acquiredAt);
}

class FreshReportedLocationRequiredError extends Error {
  public constructor() {
    super('A newer reported-location acquisition is required.');
    this.name = 'FreshReportedLocationRequiredError';
  }
}

export function hasMeaningfulReportedLocationUpdate(
  previous: LocationClaim,
  next: LocationClaim,
): boolean {
  const latitudeDelta = degreesToRadians(next.latitude - previous.latitude);
  const longitudeDelta = degreesToRadians(next.longitude - previous.longitude);
  const previousLatitude = degreesToRadians(previous.latitude);
  const nextLatitude = degreesToRadians(next.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(previousLatitude) *
      Math.cos(nextLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const movementMetres =
    2 *
    EARTH_RADIUS_METRES *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const accuracyImproved =
    previous.accuracyMetres - next.accuracyMetres >= 5 ||
    next.accuracyMetres <= previous.accuracyMetres * 0.75;

  // This only suppresses noisy network refreshes between reported claims. It
  // never compares the player with event geometry or decides eligibility.
  return movementMetres >= MEANINGFUL_MOVEMENT_METRES || accuracyImproved;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toChallengeStartFailure(error: unknown): EventEligibilityState {
  if (error instanceof FreshReportedLocationRequiredError) {
    return { status: 'location-stale' };
  }

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
