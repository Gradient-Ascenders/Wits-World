import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Crosshair,
  MagnifyingGlass,
} from '@phosphor-icons/react';

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
import {
  NearbyList,
  TrailDetail,
  TrailList,
  type NearbyDiscoveryState,
  type TrailDetailState,
  type TrailListState,
} from './TrailDiscovery';
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
  nearbyDiscovery?: NearbyDiscoveryState;
  onEnableLocation: () => void;
  onClearEventSelection: () => void;
  onLoadNearby?: () => void;
  onLoadTrails?: () => void;
  onOpenTrail?: (trailId: string) => void;
  onRetry: () => void;
  onRetryEligibility: (eventId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onStartChallenge?: (eventId: string) => void;
  reportedLocation?: ReportedMapLocation | null;
  selectedEventId: string | null;
  trailDetail?: TrailDetailState;
  trailDiscovery?: TrailListState;
}

type EventPanelMode = 'list' | 'peek' | 'selected';
type EventAvailabilityFilter = 'active' | 'all' | 'ended' | 'upcoming';
type DiscoverySection = 'events' | 'nearby' | 'trail-detail' | 'trails';

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

type MapEventPresentation = EventPresentation &
  Pick<MapPoint, 'selectable' | 'trailState'>;

function toMapPoints(
  events: readonly MapEventPresentation[],
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
    ...(event.selectable === undefined ? {} : { selectable: event.selectable }),
    ...(event.trailState === undefined ? {} : { trailState: event.trailState }),
  }));
}

export function CampusExplorer({
  discovery,
  eligibility,
  eligibilityBusy,
  locationState,
  mapConfiguration,
  mapFactory,
  nearbyDiscovery = { status: 'idle' },
  onEnableLocation,
  onClearEventSelection,
  onLoadNearby = () => undefined,
  onLoadTrails = () => undefined,
  onOpenTrail = () => undefined,
  onRetry,
  onRetryEligibility,
  onSelectEvent,
  onStartChallenge = () => undefined,
  reportedLocation = null,
  selectedEventId,
  trailDetail = { status: 'idle' },
  trailDiscovery = { status: 'idle' },
}: CampusExplorerProps) {
  const [discoverySection, setDiscoverySection] =
    useState<DiscoverySection>('events');
  const [following, setFollowing] = useState(false);
  const [panelMode, setPanelMode] = useState<EventPanelMode>(() =>
    window.matchMedia?.('(min-width: 64rem)').matches ? 'list' : 'peek',
  );
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
  const selectionOriginRef =
    useRef<Exclude<DiscoverySection, 'trails'>>('events');
  const selectionFromListRef = useRef(false);
  const preserveControlFocusRef = useRef(false);
  const openedSelectedEventIdRef = useRef<string | null>(null);
  const filteredSelectionClearRef = useRef<string | null>(null);
  const events = discovery.status === 'ready' ? discovery.events : [];
  const nearbyEvents =
    nearbyDiscovery.status === 'ready'
      ? nearbyDiscovery.events.map((event) => ({
          availability: 'active' as const,
          description: event.description,
          endsAt: event.endsAt,
          id: event.eventId,
          latitude: event.latitude,
          longitude: event.longitude,
          radiusMetres: event.radiusMetres,
          startsAt: event.startsAt,
          title: event.title,
        }))
      : [];
  const trailEvents =
    trailDetail.status === 'ready'
      ? trailDetail.trail.steps.map((step) => ({
          availability:
            step.unavailableReason === 'upcoming'
              ? ('upcoming' as const)
              : step.unavailableReason === 'ended'
                ? ('ended' as const)
                : ('active' as const),
          description: step.description,
          endsAt: step.endsAt,
          id: step.eventId,
          latitude: step.latitude,
          longitude: step.longitude,
          radiusMetres: step.radiusMetres,
          selectable: step.state === 'current',
          startsAt: step.startsAt,
          title: step.title,
          trailState:
            step.state === 'unavailable' &&
            (step.unavailableReason === 'event_retired' ||
              step.unavailableReason === 'trail_retired')
              ? ('retired' as const)
              : step.state,
        }))
      : [];
  const eventCatalog = useMemo(() => {
    const catalog = new Map<string, EventPresentation>();
    for (const event of [...events, ...nearbyEvents, ...trailEvents]) {
      if (!catalog.has(event.id)) catalog.set(event.id, event);
    }
    return [...catalog.values()];
  }, [events, nearbyEvents, trailEvents]);
  const visibleEvents = useMemo(
    () => filterEventPresentations(events, searchQuery, availabilityFilter),
    [availabilityFilter, events, searchQuery],
  );
  const mapEvents =
    discoverySection === 'events'
      ? visibleEvents
      : discoverySection === 'nearby'
        ? nearbyDiscovery.status === 'ready'
          ? nearbyEvents
          : []
        : discoverySection === 'trail-detail'
          ? trailDetail.status === 'ready'
            ? trailEvents
            : []
          : [];
  const points = useMemo(
    () => toMapPoints(mapEvents, eligibility),
    [eligibility, mapEvents],
  );
  const selectedEvent =
    eventCatalog.find((event) => event.id === selectedEventId) ?? null;
  const selectedPoint =
    points.find((point) => point.id === selectedEventId) ?? null;
  const selectablePoints = points.filter((point) => point.selectable !== false);
  const selectedIndex = selectablePoints.findIndex(
    (point) => point.id === selectedEventId,
  );
  const hasActiveFilters =
    searchQuery.trim().length > 0 || availabilityFilter !== 'all';

  const focusDiscoveryReturnTarget = useCallback(
    (eventId: string | null = selectedEventId): void => {
      window.setTimeout(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const eventControl = [
          ...panel.querySelectorAll<HTMLElement>('[data-event-id]'),
        ].find((element) => element.dataset.eventId === eventId);
        const target =
          eventControl ??
          panel.querySelector<HTMLElement>('[aria-pressed="true"]') ??
          panel.querySelector<HTMLElement>(
            '.discovery-navigation__item[aria-current="page"]',
          ) ??
          panel.querySelector<HTMLElement>('h2');
        target?.focus();
      }, 0);
    },
    [selectedEventId],
  );

  useEffect(() => {
    if (
      discovery.status !== 'ready' ||
      selectedEventId === null ||
      selectionOriginRef.current !== 'events'
    ) {
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
      focusDiscoveryReturnTarget();
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
  }, [focusDiscoveryReturnTarget, panelMode]);

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
    if (panelMode !== 'list') return;

    const activeElement = document.activeElement;
    const focusWasLost =
      activeElement === document.body ||
      !(activeElement instanceof HTMLElement) ||
      !activeElement.isConnected;
    if (!focusWasLost) return;

    panelRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [
    discoverySection,
    nearbyDiscovery.status,
    panelMode,
    trailDetail.status,
    trailDiscovery.status,
  ]);

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

  const selectEvent = (
    eventId: string,
    origin: Exclude<DiscoverySection, 'trails'> = discoverySection === 'trails'
      ? 'events'
      : discoverySection,
  ): void => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    selectionFromListRef.current = Boolean(
      returnFocusRef.current?.closest('.event-panel'),
    );
    selectionOriginRef.current = origin;
    onSelectEvent(eventId);
    setFocusPointRequest((current) => current + 1);
    const event = eventCatalog.find((candidate) => candidate.id === eventId);
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
    setSheetSnap(selectedEvent === null ? 'expanded' : 'medium');
  };

  const showEventList = (): void => {
    setDiscoverySection(selectionOriginRef.current);
    setPanelMode('list');
    setSheetSnap('expanded');
    focusDiscoveryReturnTarget();
  };

  const showDiscoverySection = (
    section: Exclude<DiscoverySection, 'trail-detail'>,
  ): void => {
    setDiscoverySection(section);
    if (section === 'nearby') onLoadNearby();
    if (section === 'trails') onLoadTrails();
    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('h2')?.focus();
    }, 0);
  };

  const openTrail = (trailId: string): void => {
    onOpenTrail(trailId);
    setDiscoverySection('trail-detail');
    setSheetSnap('expanded');
  };

  const openTrailEvent = (eventId: string): void => {
    selectEvent(eventId, 'trail-detail');
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
      data-location-state={locationState}
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
          title={locationControl.guidance}
          onClick={locationAction}
          type="button"
        >
          <Crosshair aria-hidden="true" size={24} />
          <span className="location-control__label">
            {locationState === 'tracking'
              ? following
                ? 'Following'
                : 'Recenter'
              : locationControl.label}
            {locationState === 'tracking' && reportedLocation !== null ? (
              <span className="location-control__accuracy">
                {' '}
                · ±{Math.max(0, Math.round(reportedLocation.accuracyMetres))} m
              </span>
            ) : null}
          </span>
        </button>
        {locationControl.guidance ? (
          <p
            aria-live="polite"
            className={
              locationState === 'tracking'
                ? 'sr-only'
                : 'location-control__guidance'
            }
          >
            {locationControl.guidance}
          </p>
        ) : null}
      </div>

      <BottomSheetSurface
        ariaLabel="Campus discovery"
        className={`event-panel event-panel--${panelMode}${
          discoverySection === 'trail-detail'
            ? ' event-panel--trail-detail'
            : ''
        }`}
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
                      : discovery.status === 'error'
                        ? 'Events could not load · Open to retry'
                        : 'No published events · Check back soon'
                  : `${availabilityLabels[selectedEvent.availability]} · View details`}
              </span>
            </span>
            <CaretUp
              aria-hidden="true"
              className="event-panel__peek-chevron"
              size={20}
            />
          </button>
        ) : null}

        {panelMode === 'list' && discoverySection !== 'trail-detail' ? (
          <>
            <div className="event-panel__header">
              <div>
                <h2 tabIndex={-1}>
                  {discoverySection === 'events'
                    ? 'Campus events'
                    : discoverySection === 'nearby'
                      ? 'Nearby to you'
                      : 'Trails'}
                </h2>
                {discoverySection === 'events' &&
                discovery.status === 'ready' ? (
                  <span className="event-panel__summary">
                    {visibleEvents.length === events.length
                      ? `${events.length} published`
                      : `${visibleEvents.length} of ${events.length} shown`}
                  </span>
                ) : null}
              </div>
              <button
                aria-label={
                  discoverySection === 'events'
                    ? 'Collapse events'
                    : discoverySection === 'nearby'
                      ? 'Collapse nearby discovery'
                      : 'Collapse trails'
                }
                className="event-panel__close"
                onClick={collapsePanel}
                type="button"
              >
                <CaretDown aria-hidden="true" size={20} />
              </button>
            </div>
            <div className="event-panel__scroll">
              <nav
                aria-label="Campus discovery"
                className="discovery-navigation"
              >
                {(
                  [
                    ['events', 'Events'],
                    ['nearby', 'Nearby'],
                    ['trails', 'Trails'],
                  ] as const
                ).map(([section, label]) => (
                  <button
                    aria-current={
                      discoverySection === section ? 'page' : undefined
                    }
                    className="discovery-navigation__item"
                    key={section}
                    onClick={() => showDiscoverySection(section)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {discoverySection === 'events' && discovery.status === 'ready' ? (
                <div className="event-discovery-controls">
                  <label className="event-search">
                    <span className="sr-only">Search campus events</span>
                    <MagnifyingGlass
                      aria-hidden="true"
                      className="event-search__icon"
                      size={20}
                    />
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

              {discoverySection === 'events' &&
              discovery.status === 'ready' &&
              visibleEvents.length === 0 &&
              hasActiveFilters ? (
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
              ) : discoverySection === 'events' ? (
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
              ) : discoverySection === 'nearby' ? (
                <NearbyList
                  locationState={locationState}
                  onEnableLocation={onEnableLocation}
                  onOpenEvent={(eventId) => selectEvent(eventId, 'nearby')}
                  onRetry={onLoadNearby}
                  state={nearbyDiscovery}
                />
              ) : (
                <TrailList
                  onOpenTrail={openTrail}
                  onRetry={onLoadTrails}
                  state={trailDiscovery}
                />
              )}
            </div>
          </>
        ) : null}

        {panelMode === 'list' && discoverySection === 'trail-detail' ? (
          <>
            <div className="event-panel__toolbar">
              <button
                className="event-panel__back"
                onClick={() => showDiscoverySection('trails')}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={20} /> Trails
              </button>
              <button
                aria-label="Collapse trail details"
                className="event-panel__close"
                onClick={collapsePanel}
                type="button"
              >
                <CaretDown aria-hidden="true" size={20} />
              </button>
            </div>
            <div className="event-panel__scroll">
              <TrailDetail
                onOpenEvent={openTrailEvent}
                onRetry={() => {
                  if (trailDetail.status !== 'idle') {
                    onOpenTrail(
                      trailDetail.status === 'ready'
                        ? trailDetail.trail.trailId
                        : trailDetail.trailId,
                    );
                  }
                }}
                state={trailDetail}
              />
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
                <ArrowLeft aria-hidden="true" size={20} />
                {selectionOriginRef.current === 'nearby'
                  ? 'Nearby'
                  : selectionOriginRef.current === 'trail-detail'
                    ? 'Trail'
                    : 'All events'}
              </button>
              {selectablePoints.length > 1 && selectedIndex >= 0 ? (
                <div
                  className="event-panel__switcher"
                  aria-label="Switch selected event"
                  role="group"
                >
                  <button
                    className="event-panel__close"
                    aria-label="Previous event"
                    disabled={selectedIndex === 0}
                    onClick={() =>
                      selectEvent(
                        selectablePoints[selectedIndex - 1]!.id,
                        selectionOriginRef.current,
                      )
                    }
                    type="button"
                  >
                    <CaretLeft aria-hidden="true" size={20} />
                  </button>
                  <span>
                    {selectedIndex + 1} / {selectablePoints.length}
                  </span>
                  <button
                    className="event-panel__close"
                    aria-label="Next event"
                    disabled={selectedIndex === selectablePoints.length - 1}
                    onClick={() =>
                      selectEvent(
                        selectablePoints[selectedIndex + 1]!.id,
                        selectionOriginRef.current,
                      )
                    }
                    type="button"
                  >
                    <CaretRight aria-hidden="true" size={20} />
                  </button>
                </div>
              ) : null}
              <button
                aria-label="Collapse event details"
                className="event-panel__close"
                onClick={collapsePanel}
                type="button"
              >
                <CaretDown aria-hidden="true" size={20} />
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
