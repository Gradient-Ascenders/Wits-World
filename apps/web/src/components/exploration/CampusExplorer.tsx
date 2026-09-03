import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomSheetSurface, type BottomSheetSnap } from './BottomSheetSurface';
import { CampusMap } from './CampusMap';
import {
  availabilityLabels,
  EventList,
  SelectedEventDetails,
  type EventDiscoveryState,
  type EventEligibilityState,
  type EventPresentation,
  type LocationExperienceState,
} from './EventList';
import type {
  MapConfiguration,
  MapFactory,
  MapPoint,
  ReportedMapLocation,
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
  onClearEventSelection: () => void;
  onRetry: () => void;
  onRetryEligibility: (eventId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onStartChallenge?: (eventId: string) => void;
  reportedLocation?: ReportedMapLocation | null;
  selectedEventId: string | null;
}

type EventPanelMode = 'list' | 'peek' | 'selected';
type EventAvailabilityFilter = 'active' | 'all' | 'ended' | 'upcoming';

export function filterEventPresentations(
  events: readonly EventPresentation[],
  query: string,
  availability: EventAvailabilityFilter,
): EventPresentation[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return events.filter((event) => {
    if (availability !== 'all' && event.availability !== availability) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    return [event.title, event.description ?? ''].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    );
  });
}

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
  onClearEventSelection,
  onRetry,
  onRetryEligibility,
  onSelectEvent,
  onStartChallenge = () => undefined,
  reportedLocation = null,
  selectedEventId,
}: CampusExplorerProps) {
  const [following, setFollowing] = useState(false);
  const [panelMode, setPanelMode] = useState<EventPanelMode>('peek');
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('peek');
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [focusPointRequest, setFocusPointRequest] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] =
    useState<EventAvailabilityFilter>('all');
  const [focusAnnouncement, setFocusAnnouncement] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const peekButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectionFromListRef = useRef(false);
  const preserveControlFocusRef = useRef(false);
  const openedSelectedEventIdRef = useRef<string | null>(null);
  const filteredSelectionClearRef = useRef<string | null>(null);
  const events = discovery.status === 'ready' ? discovery.events : [];
  const visibleEvents = useMemo(
    () => filterEventPresentations(events, searchQuery, availabilityFilter),
    [availabilityFilter, events, searchQuery],
  );
  const points = useMemo(
    () => toMapPoints(visibleEvents, eligibility),
    [eligibility, visibleEvents],
  );
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const selectedPoint =
    points.find((point) => point.id === selectedEventId) ?? null;
  const hasActiveFilters =
    searchQuery.trim().length > 0 || availabilityFilter !== 'all';

  useEffect(() => {
    if (discovery.status !== 'ready' || selectedEventId === null) {
      filteredSelectionClearRef.current = null;
      return;
    }

    if (visibleEvents.some((event) => event.id === selectedEventId)) {
      filteredSelectionClearRef.current = null;
      return;
    }

    if (filteredSelectionClearRef.current === selectedEventId) {
      return;
    }

    filteredSelectionClearRef.current = selectedEventId;
    preserveControlFocusRef.current = true;
    onClearEventSelection();
    setFocusAnnouncement('');
    setPanelMode('list');
    setSheetSnap('medium');
  }, [discovery.status, onClearEventSelection, selectedEventId, visibleEvents]);

  const dismissPanel = useCallback((): void => {
    if (panelMode === 'selected' && selectionFromListRef.current) {
      setPanelMode('list');
      setSheetSnap('medium');
      window.setTimeout(() => {
        panelRef.current
          ?.querySelector<HTMLElement>('[aria-pressed="true"]')
          ?.focus();
      }, 0);
      return;
    }

    setPanelMode('peek');
    setSheetSnap('peek');
    window.setTimeout(() => {
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      } else {
        peekButtonRef.current?.focus();
      }
    }, 0);
  }, [panelMode]);

  useEffect(() => {
    if (selectedEventId === null) {
      openedSelectedEventIdRef.current = null;
      return;
    }

    if (
      selectedPoint !== null &&
      openedSelectedEventIdRef.current !== selectedEventId
    ) {
      openedSelectedEventIdRef.current = selectedEventId;
      setPanelMode('selected');
      setSheetSnap('medium');
    }
  }, [selectedEventId, selectedPoint]);

  useEffect(() => {
    if (panelMode === 'peek') {
      return;
    }

    if (preserveControlFocusRef.current) {
      preserveControlFocusRef.current = false;
      return;
    }

    panelRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [panelMode, selectedEventId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || panelMode === 'peek') {
        return;
      }

      if (panelMode === 'list' && sheetSnap === 'expanded') {
        setSheetSnap('medium');
        return;
      }

      dismissPanel();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [dismissPanel, panelMode, sheetSnap]);

  const selectEvent = (eventId: string): void => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    selectionFromListRef.current = Boolean(
      returnFocusRef.current?.closest('.event-panel'),
    );
    onSelectEvent(eventId);
    setFocusPointRequest((current) => current + 1);
    const event = events.find((candidate) => candidate.id === eventId);
    setFocusAnnouncement(
      event === undefined
        ? ''
        : `${event.title} selected and centred on the map. Location following paused.`,
    );
    setPanelMode('selected');
    setSheetSnap('medium');
  };

  const changeSheetSnap = (nextSnap: BottomSheetSnap): void => {
    setSheetSnap(nextSnap);
    if (nextSnap === 'peek') {
      setPanelMode('peek');
      return;
    }

    if (panelMode === 'peek') {
      setPanelMode(selectedEvent === null ? 'list' : 'selected');
    }
  };

  const openSheet = (): void => {
    returnFocusRef.current = document.activeElement as HTMLElement;
    setPanelMode(selectedEvent === null ? 'list' : 'selected');
    setSheetSnap('medium');
  };

  const showEventList = (): void => {
    setPanelMode('list');
    setSheetSnap('medium');
    window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.focus();
    }, 0);
  };

  const clearFilters = (): void => {
    setSearchQuery('');
    setAvailabilityFilter('all');
  };

  const collapsePanel = (): void => {
    dismissPanel();
  };

  const locationControl = getLocationControl(
    locationState,
    reportedLocation,
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
  const activeEventCount = visibleEvents.filter(
    (event) => event.availability === 'active',
  ).length;

  return (
    <section
      aria-labelledby="campus-map-title"
      className={`exploration-view exploration-view--panel-${panelMode}`}
      data-sheet-snap={sheetSnap}
    >
      <h1 className="sr-only" id="campus-map-title">
        Explore the campus map
      </h1>

      <CampusMap
        configuration={mapConfiguration}
        focusPointRequest={focusPointRequest}
        mapFactory={mapFactory}
        onFollowStateChange={setFollowing}
        onPointSelect={selectEvent}
        points={points}
        recenterRequest={recenterRequest}
        reportedLocation={reportedLocation}
        selectedPoint={selectedPoint}
      />

      <p aria-live="polite" className="sr-only">
        {focusAnnouncement}
      </p>

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

      <BottomSheetSurface
        ariaLabel="Campus events"
        className={`event-panel event-panel--${panelMode}`}
        id="explore-event-sheet"
        onSnapChange={changeSheetSnap}
        panelRef={panelRef}
        snap={sheetSnap}
        view={panelMode}
      >
        {panelMode === 'peek' ? (
          <button
            aria-expanded="false"
            aria-label={
              selectedEvent === null
                ? `Events — ${visibleEvents.length} ${visibleEvents.length === 1 ? 'event' : 'events'}, ${activeEventCount} available now`
                : `Events — ${selectedEvent.title} selected, open details`
            }
            className="event-panel__peek"
            onClick={openSheet}
            ref={peekButtonRef}
            type="button"
          >
            <span className="event-panel__peek-copy">
              <strong>
                {selectedEvent === null
                  ? discovery.status === 'ready'
                    ? `${visibleEvents.length} campus ${visibleEvents.length === 1 ? 'event' : 'events'}`
                    : 'Campus events'
                  : selectedEvent.title}
              </strong>
              <span>
                {selectedEvent === null
                  ? discovery.status === 'ready'
                    ? `${activeEventCount} available now`
                    : discovery.status === 'loading'
                      ? 'Loading published events…'
                      : 'Open event discovery'
                  : `${availabilityLabels[selectedEvent.availability]} · View details`}
              </span>
            </span>
            <svg
              aria-hidden="true"
              className="event-panel__peek-chevron"
              fill="none"
              focusable="false"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 16 16"
            >
              <path d="m4 10 4-4 4 4" />
            </svg>
          </button>
        ) : null}

        {panelMode === 'list' ? (
          <>
            <div className="event-panel__header">
              <div>
                <h2 tabIndex={-1}>Campus events</h2>
                {discovery.status === 'ready' ? (
                  <span className="event-panel__summary">
                    {visibleEvents.length === events.length
                      ? `${events.length} published`
                      : `${visibleEvents.length} of ${events.length} shown`}
                  </span>
                ) : null}
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
              {discovery.status === 'ready' ? (
                <div className="event-discovery-controls">
                  <label className="event-search">
                    <span className="sr-only">Search campus events</span>
                    <span aria-hidden="true" className="event-search__icon" />
                    <input
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search"
                      type="search"
                      value={searchQuery}
                    />
                  </label>
                  <label className="event-status-filter">
                    <span className="sr-only">Filter events by status</span>
                    <select
                      aria-label="Filter events by status"
                      onChange={(event) =>
                        setAvailabilityFilter(
                          event.target.value as EventAvailabilityFilter,
                        )
                      }
                      value={availabilityFilter}
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Available now</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="ended">Ended</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {discovery.status === 'ready' && visibleEvents.length === 0 ? (
                <div aria-live="polite" className="event-list__state">
                  <strong>No events match these filters.</strong>
                  <p>Adjust the search or status to see more campus events.</p>
                  <button
                    className="button button--quiet"
                    disabled={!hasActiveFilters}
                    onClick={clearFilters}
                    type="button"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <EventList
                  discovery={
                    discovery.status === 'ready'
                      ? { events: visibleEvents, status: 'ready' }
                      : discovery
                  }
                  eligibility={eligibility}
                  onRetry={onRetry}
                  onSelect={selectEvent}
                  selectedEventId={selectedEventId}
                />
              )}
            </div>
          </>
        ) : null}

        {panelMode === 'selected' && selectedEvent !== null ? (
          <>
            <div className="event-panel__toolbar">
              <button
                className="event-panel__back"
                onClick={showEventList}
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
      </BottomSheetSurface>
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
  reportedLocation: ReportedMapLocation | null,
  following: boolean,
): LocationControlPresentation {
  if (state === 'tracking' && reportedLocation !== null) {
    const accuracy = Math.max(0, Math.round(reportedLocation.accuracyMetres));
    return {
      action: 'recenter',
      active: following,
      disabled: false,
      guidance: following
        ? `Reported accuracy is approximately ±${accuracy} m.`
        : `Map following is paused. Reported accuracy is approximately ±${accuracy} m.`,
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
