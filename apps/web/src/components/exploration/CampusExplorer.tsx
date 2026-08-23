import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CampusMap } from './CampusMap';
import {
  EventList,
  SelectedEventDetails,
  type EventDiscoveryState,
  type EventEligibilityState,
  type EventPresentation,
  type LocationExperienceState,
} from './EventList';
import type {
  MapConfiguration,
  MapCoordinate,
  MapFactory,
  MapPoint,
} from './map-provider';
import './exploration.css';

interface CampusExplorerProps {
  discovery: EventDiscoveryState;
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>;
  eligibilityBusy: boolean;
  locationState: LocationExperienceState;
  mapConfiguration: MapConfiguration;
  mapFactory?: MapFactory;
  onEnableLocation: () => void;
  onRetry: () => void;
  onRetryEligibility: (eventId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onStartChallenge?: (eventId: string) => void;
  reportedLocation?: MapCoordinate | null;
  selectedEventId: string | null;
}

type EventPanelMode = 'list' | 'peek' | 'selected';

function toMapPoints(
  events: readonly EventPresentation[],
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>,
): MapPoint[] {
  return events.map((event) => ({
    availability: event.availability,
    id: event.id,
    label: event.title,
    latitude: event.latitude,
    longitude: event.longitude,
    radiusMetres: event.radiusMetres,
    reachable: eligibility[event.id]?.status === 'reachable',
  }));
}

export function CampusExplorer({
  discovery,
  eligibility,
  eligibilityBusy,
  locationState,
  mapConfiguration,
  mapFactory,
  onEnableLocation,
  onRetry,
  onRetryEligibility,
  onSelectEvent,
  onStartChallenge = () => undefined,
  reportedLocation = null,
  selectedEventId,
}: CampusExplorerProps) {
  const [following, setFollowing] = useState(false);
  const [panelMode, setPanelMode] = useState<EventPanelMode>('peek');
  const [recenterRequest, setRecenterRequest] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const peekButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectionFromListRef = useRef(false);
  const events = discovery.status === 'ready' ? discovery.events : [];
  const points = useMemo(
    () => toMapPoints(events, eligibility),
    [eligibility, events],
  );
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const selectedPoint =
    points.find((point) => point.id === selectedEventId) ?? null;

  const dismissPanel = useCallback((): void => {
    if (panelMode === 'selected' && selectionFromListRef.current) {
      setPanelMode('list');
      window.setTimeout(() => {
        panelRef.current
          ?.querySelector<HTMLElement>('[aria-pressed="true"]')
          ?.focus();
      }, 0);
      return;
    }

    setPanelMode('peek');
    window.setTimeout(() => {
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      } else {
        peekButtonRef.current?.focus();
      }
    }, 0);
  }, [panelMode]);

  useEffect(() => {
    if (selectedEvent !== null) {
      setPanelMode('selected');
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (panelMode === 'peek') {
      return;
    }

    panelRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [panelMode, selectedEventId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || panelMode === 'peek') {
        return;
      }

      dismissPanel();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [dismissPanel, panelMode]);

  const selectEvent = (eventId: string): void => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    selectionFromListRef.current = Boolean(
      returnFocusRef.current?.closest('.event-panel'),
    );
    onSelectEvent(eventId);
    setPanelMode('selected');
  };

  const collapsePanel = (): void => {
    dismissPanel();
  };

  const locationControl = getLocationControl(
    locationState,
    reportedLocation !== null,
    following,
  );
  const locationAction = (): void => {
    if (locationControl.action === 'recenter') {
      setRecenterRequest((current) => current + 1);
      return;
    }

    if (locationControl.action === 'enable') {
      onEnableLocation();
    }
  };

  return (
    <section
      aria-labelledby="campus-map-title"
      className={`exploration-view exploration-view--panel-${panelMode}`}
    >
      <h1 className="sr-only" id="campus-map-title">
        Explore the campus map
      </h1>

      <CampusMap
        configuration={mapConfiguration}
        mapFactory={mapFactory}
        onFollowStateChange={setFollowing}
        onPointSelect={selectEvent}
        points={points}
        recenterRequest={recenterRequest}
        reportedLocation={reportedLocation}
        selectedPoint={selectedPoint}
      />

      <div className="explore-hud" aria-label="Explore controls">
        <span className="explore-hud__label">Wits Quest · Explore</span>
      </div>

      <div className="location-control-wrap">
        <button
          aria-label={locationControl.label}
          aria-pressed={locationControl.active || undefined}
          className={`location-control${locationControl.active ? ' location-control--active' : ''}`}
          disabled={locationControl.disabled}
          onClick={locationAction}
          type="button"
        >
          <span aria-hidden="true" className="location-control__icon" />
          <span className="location-control__label">
            {locationControl.label}
          </span>
        </button>
        {locationControl.guidance ? (
          <p aria-live="polite" className="location-control__guidance">
            {locationControl.guidance}
          </p>
        ) : null}
      </div>

      <aside
        aria-label="Campus events"
        className={`event-panel event-panel--${panelMode}`}
        ref={panelRef}
      >
        {panelMode === 'peek' ? (
          <button
            aria-expanded="false"
            className="event-panel__peek"
            onClick={() => {
              returnFocusRef.current = document.activeElement as HTMLElement;
              setPanelMode('list');
            }}
            ref={peekButtonRef}
            type="button"
          >
            <span>Events</span>
            <span className="event-panel__count">
              {discovery.status === 'ready' ? discovery.events.length : '—'}
            </span>
            <span aria-hidden="true">⌃</span>
          </button>
        ) : null}

        {panelMode === 'list' ? (
          <>
            <div className="event-panel__header">
              <div>
                <span className="eyebrow">Map-independent discovery</span>
                <h2 tabIndex={-1}>Campus events</h2>
              </div>
              <button
                aria-label="Collapse events"
                className="event-panel__close"
                onClick={collapsePanel}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="event-panel__scroll">
              <EventList
                discovery={discovery}
                eligibility={eligibility}
                onRetry={onRetry}
                onSelect={selectEvent}
                selectedEventId={selectedEventId}
              />
            </div>
          </>
        ) : null}

        {panelMode === 'selected' && selectedEvent !== null ? (
          <>
            <div className="event-panel__toolbar">
              <button
                className="event-panel__back"
                onClick={() => setPanelMode('list')}
                type="button"
              >
                All events
              </button>
              <button
                aria-label="Collapse event details"
                className="event-panel__close"
                onClick={collapsePanel}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="event-panel__scroll">
              <SelectedEventDetails
                eligibilityBusy={eligibilityBusy}
                event={selectedEvent}
                locationState={locationState}
                onRetryEligibility={onRetryEligibility}
                onStart={onStartChallenge}
                state={eligibility[selectedEvent.id] ?? { status: 'idle' }}
              />
            </div>
          </>
        ) : null}
      </aside>
    </section>
  );
}

interface LocationControlPresentation {
  action: 'enable' | 'none' | 'recenter';
  active: boolean;
  disabled: boolean;
  guidance?: string;
  label: string;
}

function getLocationControl(
  state: LocationExperienceState,
  hasLocation: boolean,
  following: boolean,
): LocationControlPresentation {
  if (state === 'tracking' && hasLocation) {
    return {
      action: 'recenter',
      active: following,
      disabled: false,
      label: following
        ? 'Following reported location'
        : 'Recenter on reported location',
    };
  }

  if (state === 'checking-permission' || state === 'locating') {
    return {
      action: 'none',
      active: false,
      disabled: true,
      label:
        state === 'checking-permission'
          ? 'Checking location access'
          : 'Finding reported location',
    };
  }

  if (state === 'denied') {
    return {
      action: 'none',
      active: false,
      disabled: true,
      guidance: 'Enable location in browser settings to check event range.',
      label: 'Location access disabled',
    };
  }

  if (state === 'unsupported' || state === 'blocked') {
    return {
      action: 'none',
      active: false,
      disabled: true,
      guidance:
        state === 'blocked'
          ? 'Live location needs a secure, permitted browser context.'
          : 'Live location is not supported in this browser.',
      label: 'Live location unavailable',
    };
  }

  return {
    action: 'enable',
    active: false,
    disabled: false,
    guidance:
      state === 'timeout'
        ? 'The signal timed out. Move to an open area and retry.'
        : state === 'stale'
          ? 'The last reported-location marker may be stale.'
          : state === 'unavailable'
            ? 'Check device location services and retry.'
            : undefined,
    label:
      state === 'permission-required'
        ? 'Enable live location'
        : 'Retry live location',
  };
}
