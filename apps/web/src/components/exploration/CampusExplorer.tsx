import { SelectField } from '../fields/SelectField';
import { SearchField } from '../fields/SearchField';
import { StateIcon } from '../StatusMessage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDots,
  CaretLeft,
  CaretRight,
  CaretUp,
  Crosshair,
  Cube,
  FlagBanner,
  MapPin,
  Path,
  SidebarSimple,
} from '@phosphor-icons/react';

import { BottomSheetSurface, type BottomSheetSnap } from './BottomSheetSurface';
import { CampusMap } from './CampusMap';
import { MapLayersControl } from './MapLayersControl';
import { PanelCollapseButton } from './PanelCollapseButton';
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
import { TerritoryDiscovery } from './TerritoryDiscovery';
import type {
  TerritoryDetailState,
  TerritoryListState,
} from './useTerritoryDiscovery';
import type {
  MapConfiguration,
  MapFactory,
  MapPoint,
  MapRegion,
  ReportedMapLocation,
} from './map-provider';
import { DEFAULT_MAP_LAYER_VISIBILITY } from './map-provider';
import './exploration.css';

interface CampusExplorerProps {
  discovery: EventDiscoveryState;
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>;
  eligibilityBusy: boolean;
  locationState: LocationExperienceState;
  mapConfiguration: MapConfiguration;
  mapFactory?: MapFactory;
  exploreMode?: ExploreMode;
  nearbyDiscovery?: NearbyDiscoveryState;
  onEnableLocation: () => void;
  onExploreModeChange?: (mode: ExploreMode) => void;
  onClearEventSelection: () => void;
  onLoadNearby?: () => void;
  onLoadTrails?: () => void;
  onOpenTrail?: (trailId: string) => void;
  onRetry: () => void;
  onRetryEligibility: (eventId: string) => void;
  onClearTerritorySelection?: () => void;
  onRefreshTerritoryDetail?: () => void;
  onRefreshTerritoryZones?: () => void;
  onSelectTerritory?: (zoneId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onStartChallenge?: (eventId: string) => void;
  reportedLocation?: ReportedMapLocation | null;
  selectedEventId: string | null;
  selectedTerritoryId?: string | null;
  territoryDetail?: TerritoryDetailState;
  territoryList?: TerritoryListState;
  trailDetail?: TrailDetailState;
  trailDiscovery?: TrailListState;
}

export type ExploreMode = 'discover' | 'territories';

type EventPanelMode = 'list' | 'peek' | 'selected';
type EventAvailabilityFilter = 'active' | 'all' | 'ended' | 'upcoming';
type DiscoverySection = 'events' | 'nearby' | 'trail-detail' | 'trails';

const EMPTY_TERRITORY_LIST: TerritoryListState = {
  lastUpdatedAt: null,
  message: null,
  refreshing: false,
  stale: false,
  status: 'idle',
  zones: [],
};
const EMPTY_TERRITORY_DETAIL: TerritoryDetailState = {
  detail: null,
  failedSections: [],
  history: null,
  lastUpdatedAt: null,
  refreshing: false,
  stale: false,
  standings: null,
  status: 'idle',
  zoneId: null,
};

const MOBILE_MAP_QUERY = '(max-width: 47.999rem)';
const EMPTY_MAP_POINTS: readonly MapPoint[] = [];
const EMPTY_MAP_REGIONS: readonly MapRegion[] = [];

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
  Pick<MapPoint, 'selectable' | 'trailPosition' | 'trailState'>;

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
    ...(event.trailPosition === undefined
      ? {}
      : { trailPosition: event.trailPosition }),
  }));
}

export function CampusExplorer({
  discovery,
  eligibility,
  eligibilityBusy,
  locationState,
  mapConfiguration,
  mapFactory,
  exploreMode = 'discover',
  nearbyDiscovery = { status: 'idle' },
  onEnableLocation,
  onExploreModeChange = () => undefined,
  onClearEventSelection,
  onLoadNearby = () => undefined,
  onLoadTrails = () => undefined,
  onOpenTrail = () => undefined,
  onRetry,
  onRetryEligibility,
  onClearTerritorySelection = () => undefined,
  onRefreshTerritoryDetail = () => undefined,
  onRefreshTerritoryZones = () => undefined,
  onSelectTerritory = () => undefined,
  onSelectEvent,
  onStartChallenge = () => undefined,
  reportedLocation = null,
  selectedEventId,
  selectedTerritoryId = null,
  territoryDetail = EMPTY_TERRITORY_DETAIL,
  territoryList = EMPTY_TERRITORY_LIST,
  trailDetail = { status: 'idle' },
  trailDiscovery = { status: 'idle' },
}: CampusExplorerProps) {
  const [isMobileMapViewport, setIsMobileMapViewport] = useState(
    () => window.matchMedia?.(MOBILE_MAP_QUERY).matches ?? false,
  );
  const [mobile3dEnabled, setMobile3dEnabled] = useState(false);
  const [isDesktopMapViewport, setIsDesktopMapViewport] = useState(
    () => window.matchMedia?.('(min-width: 64rem)').matches ?? false,
  );
  const [layerVisibility, setLayerVisibility] = useState(
    DEFAULT_MAP_LAYER_VISIBILITY,
  );
  const [discoverySection, setDiscoverySection] =
    useState<DiscoverySection>('events');
  const [following, setFollowing] = useState(false);
  const [panelMode, setPanelMode] = useState<EventPanelMode>(() =>
    window.matchMedia?.('(min-width: 64rem)').matches ? 'list' : 'peek',
  );
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('peek');
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [focusPointRequest, setFocusPointRequest] = useState(0);
  const [focusRegionRequest, setFocusRegionRequest] = useState(0);
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
          trailPosition: step.position,
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
  const territoryRegions = useMemo<MapRegion[]>(
    () =>
      territoryList.zones.map((zone) => ({
        geometry: zone.geometry,
        id: zone.zoneId,
        label: zone.name,
        ownerLabel: zone.owner?.playerName ?? null,
        status: zone.status,
      })),
    [territoryList.zones],
  );
  const selectedRegion =
    territoryRegions.find((region) => region.id === selectedTerritoryId) ??
    null;
  const selectablePoints = points.filter((point) => point.selectable !== false);
  const selectedIndex = selectablePoints.findIndex(
    (point) => point.id === selectedEventId,
  );
  const hasActiveFilters =
    searchQuery.trim().length > 0 || availabilityFilter !== 'all';
  const effectiveMapConfiguration = useMemo(() => {
    if (!isMobileMapViewport || mobile3dEnabled) {
      return mapConfiguration;
    }

    return {
      ...mapConfiguration,
      pitch: 0,
      standardConfig: {
        ...mapConfiguration.standardConfig,
        show3dBuildings: false,
        show3dLandmarks: false,
        show3dObjects: false,
        show3dTrees: false,
      },
    };
  }, [isMobileMapViewport, mapConfiguration, mobile3dEnabled]);

  useEffect(() => {
    const media = window.matchMedia?.(MOBILE_MAP_QUERY);
    if (!media) return;

    const updateViewport = (event: MediaQueryListEvent): void => {
      setIsMobileMapViewport(event.matches);
    };
    setIsMobileMapViewport(media.matches);
    media.addEventListener('change', updateViewport);

    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 64rem)');
    if (!media) return;
    const updateViewport = (event: MediaQueryListEvent): void => {
      setIsDesktopMapViewport(event.matches);
    };
    setIsDesktopMapViewport(media.matches);
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  const focusDiscoveryReturnTarget = useCallback(
    (
      eventId: string | null = selectedEventId,
      territoryId: string | null = selectedTerritoryId,
    ): void => {
      window.setTimeout(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const eventControl = [
          ...panel.querySelectorAll<HTMLElement>('[data-event-id]'),
        ].find((element) => element.dataset.eventId === eventId);
        const territoryControl = [
          ...panel.querySelectorAll<HTMLElement>('[data-territory-id]'),
        ].find((element) => element.dataset.territoryId === territoryId);
        const target =
          territoryControl ??
          eventControl ??
          panel.querySelector<HTMLElement>('[aria-pressed="true"]') ??
          panel.querySelector<HTMLElement>(
            '.explore-mode-navigation [aria-current="page"]',
          ) ??
          panel.querySelector<HTMLElement>('h2');
        target?.focus();
      }, 0);
    },
    [selectedEventId, selectedTerritoryId],
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
      if (exploreMode === 'territories') onClearTerritorySelection();
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
  }, [
    exploreMode,
    focusDiscoveryReturnTarget,
    onClearTerritorySelection,
    panelMode,
  ]);

  useEffect(() => {
    if (exploreMode !== 'discover' || selectedEventId === null) {
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
  }, [exploreMode, selectedEventId, selectedPoint]);

  useEffect(() => {
    if (panelMode === 'peek') {
      return;
    }

    if (preserveControlFocusRef.current) {
      preserveControlFocusRef.current = false;
      return;
    }

    panelRef.current
      ?.querySelector<HTMLElement>('h2')
      ?.focus({ preventScroll: true });
  }, [exploreMode, panelMode, selectedEventId, selectedTerritoryId]);

  useEffect(() => {
    if (panelMode !== 'list') return;

    const activeElement = document.activeElement;
    const focusWasLost =
      activeElement === document.body ||
      !(activeElement instanceof HTMLElement) ||
      !activeElement.isConnected;
    if (!focusWasLost) return;

    panelRef.current
      ?.querySelector<HTMLElement>('h2')
      ?.focus({ preventScroll: true });
  }, [
    discoverySection,
    nearbyDiscovery.status,
    panelMode,
    trailDetail.status,
    trailDiscovery.status,
  ]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.key !== 'Escape' ||
        panelMode === 'peek'
      ) {
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

  const selectTerritory = (zoneId: string): void => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    selectionFromListRef.current = Boolean(
      returnFocusRef.current?.closest('.event-panel'),
    );
    onSelectTerritory(zoneId);
    setFocusRegionRequest((current) => current + 1);
    const zone = territoryList.zones.find(
      (candidate) => candidate.zoneId === zoneId,
    );
    setFocusAnnouncement(
      zone
        ? `${zone.name} selected and centred on the map. ${zone.owner ? `Current owner: ${zone.owner.playerName}.` : 'The territory is unclaimed.'}`
        : '',
    );
    setPanelMode('selected');
    setSheetSnap(isMobileMapViewport ? 'expanded' : 'medium');
  };

  const changeSheetSnap = (nextSnap: BottomSheetSnap): void => {
    setSheetSnap(nextSnap);
    if (nextSnap === 'peek') {
      setPanelMode('peek');
      return;
    }

    if (panelMode === 'peek') {
      setPanelMode(
        exploreMode === 'territories'
          ? selectedTerritoryId === null
            ? 'list'
            : 'selected'
          : selectedEvent === null
            ? 'list'
            : 'selected',
      );
    }
  };

  const openSheet = (): void => {
    returnFocusRef.current = document.activeElement as HTMLElement;
    const hasSelection =
      exploreMode === 'territories'
        ? selectedTerritoryId !== null
        : selectedEvent !== null;
    setPanelMode(hasSelection ? 'selected' : 'list');
    setSheetSnap(
      hasSelection
        ? exploreMode === 'territories' && isMobileMapViewport
          ? 'expanded'
          : 'medium'
        : 'expanded',
    );
  };

  const showEventList = (): void => {
    setDiscoverySection(selectionOriginRef.current);
    setPanelMode('list');
    setSheetSnap('expanded');
    focusDiscoveryReturnTarget();
  };

  const showTerritoryList = (): void => {
    onClearTerritorySelection();
    setPanelMode('list');
    setSheetSnap('expanded');
    focusDiscoveryReturnTarget(null, selectedTerritoryId);
  };

  const showExploreMode = (mode: ExploreMode): void => {
    onExploreModeChange(mode);
    const hasSelection =
      mode === 'territories'
        ? selectedTerritoryId !== null
        : selectedEvent !== null;
    setPanelMode(hasSelection ? 'selected' : 'list');
    setSheetSnap(
      hasSelection
        ? mode === 'territories' && isMobileMapViewport
          ? 'expanded'
          : 'medium'
        : 'expanded',
    );
    window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('h2')
        ?.focus({ preventScroll: true });
    }, 0);
  };

  const showDiscoverySection = (
    section: Exclude<DiscoverySection, 'trail-detail'>,
  ): void => {
    setDiscoverySection(section);
    if (section === 'nearby') onLoadNearby();
    if (section === 'trails') onLoadTrails();
    window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('h2')
        ?.focus({ preventScroll: true });
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
    if (window.matchMedia?.('(min-width: 64rem)').matches) {
      setPanelMode('peek');
      setSheetSnap('peek');
      window.setTimeout(() => peekButtonRef.current?.focus(), 0);
      return;
    }
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
  const mapDetailToggle = isMobileMapViewport ? (
    <button
      aria-label="Detailed 3D map"
      aria-pressed={mobile3dEnabled}
      className={`map-detail-toggle${
        mobile3dEnabled ? ' map-detail-toggle--active' : ''
      }`}
      onClick={() => setMobile3dEnabled((enabled) => !enabled)}
      title={
        mobile3dEnabled ? 'Use lightweight 2D map' : 'Enable detailed 3D map'
      }
      type="button"
    >
      <Cube aria-hidden="true" size={20} />
      <span>3D</span>
    </button>
  ) : null;
  const renderModeNavigation = (rail = false) => (
    <nav
      aria-label={rail ? 'Explore shortcuts' : 'Explore view'}
      className={rail ? 'explore-rail-navigation' : 'explore-mode-navigation'}
    >
      {(
        [
          ['events', 'Events', CalendarDots],
          ['nearby', 'Nearby', MapPin],
          ['trails', 'Trails', Path],
          ['territories', 'Territories', FlagBanner],
        ] as const
      ).map(([section, label, Icon]) => (
        <button
          aria-controls="explore-event-sheet-content"
          aria-current={
            (
              section === 'territories'
                ? exploreMode === 'territories'
                : exploreMode === 'discover' &&
                  (discoverySection === section ||
                    (section === 'trails' &&
                      discoverySection === 'trail-detail'))
            )
              ? 'page'
              : undefined
          }
          key={section}
          onClick={() => {
            if (section === 'territories') {
              showExploreMode('territories');
              if (rail) {
                onClearTerritorySelection();
                setPanelMode('list');
                setSheetSnap('expanded');
              }
            } else {
              onExploreModeChange('discover');
              showDiscoverySection(section);
              setPanelMode('list');
              setSheetSnap('expanded');
            }
          }}
          aria-label={rail ? `Open ${label}` : undefined}
          title={rail ? label : undefined}
          type="button"
        >
          {rail ? <Icon aria-hidden="true" size={22} /> : label}
        </button>
      ))}
    </nav>
  );
  const modeNavigation = renderModeNavigation();

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
        accessibleLabel={
          exploreMode === 'territories'
            ? 'Interactive campus territory map. Zone ownership and activity are also available in the keyboard-accessible territories list.'
            : isMobileMapViewport && !mobile3dEnabled
              ? 'Interactive campus map in lightweight 2D mode. Event information is also available in the nearby events list.'
              : undefined
        }
        configuration={effectiveMapConfiguration}
        errorDescription={
          exploreMode === 'territories'
            ? 'Open Territories to keep exploring zone ownership.'
            : undefined
        }
        focusPointRequest={focusPointRequest}
        focusRegionRequest={focusRegionRequest}
        mapFactory={mapFactory}
        layerVisibility={
          isDesktopMapViewport ? layerVisibility : DEFAULT_MAP_LAYER_VISIBILITY
        }
        onFollowStateChange={setFollowing}
        onPointSelect={selectEvent}
        onRegionSelect={selectTerritory}
        points={exploreMode === 'discover' ? points : EMPTY_MAP_POINTS}
        regions={
          exploreMode === 'territories' ? territoryRegions : EMPTY_MAP_REGIONS
        }
        recenterRequest={recenterRequest}
        reportedLocation={reportedLocation}
        selectedPoint={exploreMode === 'discover' ? selectedPoint : null}
        selectedRegion={exploreMode === 'territories' ? selectedRegion : null}
      />

      <p aria-live="polite" className="sr-only">
        {focusAnnouncement}
      </p>

      {mapDetailToggle}
      {isDesktopMapViewport ? (
        <MapLayersControl
          onChange={setLayerVisibility}
          visibility={layerVisibility}
        />
      ) : null}

      <div className="location-control-wrap">
        <div className="location-control__stack">
          <div id="explore-read-control" />
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
                  · ±{Math.max(
                    0,
                    Math.round(reportedLocation.accuracyMetres),
                  )}{' '}
                  m
                </span>
              ) : null}
            </span>
          </button>
        </div>
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
        ariaLabel={
          exploreMode === 'territories'
            ? 'Campus territories'
            : 'Campus discovery'
        }
        className={`event-panel event-panel--${panelMode}${
          exploreMode === 'discover' && discoverySection === 'trail-detail'
            ? ' event-panel--trail-detail'
            : ''
        } event-panel--with-mode`}
        id="explore-event-sheet"
        onSnapChange={changeSheetSnap}
        panelRef={panelRef}
        sheetName={exploreMode === 'territories' ? 'territory' : 'event'}
        snap={sheetSnap}
        view={panelMode}
      >
        {panelMode === 'peek' ? (
          <>
            <button
              aria-controls="explore-event-sheet-content"
              aria-expanded="false"
              aria-label={
                exploreMode === 'territories'
                  ? selectedRegion === null
                    ? `Territories — ${territoryList.zones.length} ${territoryList.zones.length === 1 ? 'zone' : 'zones'}`
                    : `Territories — ${selectedRegion.label} selected, open details`
                  : selectedEvent === null
                    ? `Events — ${visibleEvents.length} ${visibleEvents.length === 1 ? 'event' : 'events'}, ${activeEventCount} available now`
                    : `Events — ${selectedEvent.title} selected, open details`
              }
              className="event-panel__peek"
              onClick={openSheet}
              ref={peekButtonRef}
              title={
                exploreMode === 'territories'
                  ? 'Open territories'
                  : selectedEvent !== null
                    ? `Open ${selectedEvent.title}`
                    : 'Open campus discovery'
              }
              type="button"
            >
              <SidebarSimple
                aria-hidden="true"
                className="event-panel__rail-icon"
                size={20}
              />
              <span className="event-panel__peek-copy">
                <strong
                  className={
                    (
                      exploreMode === 'territories'
                        ? selectedRegion !== null
                        : selectedEvent !== null
                    )
                      ? 'event-panel__entity-name'
                      : undefined
                  }
                >
                  {exploreMode === 'territories'
                    ? (selectedRegion?.label ?? 'Campus territories')
                    : selectedEvent === null
                      ? discovery.status === 'ready'
                        ? `${visibleEvents.length} campus ${visibleEvents.length === 1 ? 'event' : 'events'}`
                        : 'Campus events'
                      : selectedEvent.title}
                </strong>
                <span>
                  {exploreMode === 'territories'
                    ? selectedRegion !== null
                      ? selectedRegion.ownerLabel
                        ? `Owned by ${selectedRegion.ownerLabel} · View details`
                        : 'Unclaimed · View details'
                      : territoryList.status === 'loading'
                        ? 'Loading ownership…'
                        : territoryList.status === 'error'
                          ? 'Territories could not load · Open to retry'
                          : territoryList.status === 'empty'
                            ? 'No territories available'
                            : `${territoryList.zones.filter((zone) => zone.status === 'active').length} active`
                    : selectedEvent === null
                      ? discovery.status === 'ready'
                        ? `${activeEventCount} available now`
                        : discovery.status === 'loading'
                          ? 'Loading events…'
                          : discovery.status === 'error'
                            ? 'Events could not load · Open to retry'
                            : 'No events · Check back later'
                      : `${availabilityLabels[selectedEvent.availability]} · View details`}
                </span>
              </span>
              <CaretUp
                aria-hidden="true"
                className="event-panel__peek-chevron"
                size={20}
              />
            </button>
            {renderModeNavigation(true)}
          </>
        ) : null}

        {panelMode !== 'peek' && exploreMode === 'territories' ? (
          <TerritoryDiscovery
            detail={territoryDetail}
            list={territoryList}
            modeNavigation={modeNavigation}
            onCollapse={collapsePanel}
            onRefreshDetail={onRefreshTerritoryDetail}
            onRefreshZones={onRefreshTerritoryZones}
            onSelect={selectTerritory}
            onShowList={showTerritoryList}
            selectedZoneId={selectedTerritoryId}
          />
        ) : null}

        {exploreMode === 'discover' &&
        panelMode === 'list' &&
        discoverySection !== 'trail-detail' ? (
          <>
            <div className="event-panel__header">
              <div>
                <h2 tabIndex={-1}>
                  {discoverySection === 'events'
                    ? 'Campus events'
                    : discoverySection === 'nearby'
                      ? 'Nearby events'
                      : 'Trails'}
                </h2>
                {discoverySection === 'events' &&
                discovery.status === 'ready' ? (
                  <span className="event-panel__summary">
                    {visibleEvents.length === events.length
                      ? `${events.length} ${events.length === 1 ? 'event' : 'events'}`
                      : `${visibleEvents.length} of ${events.length} shown`}
                  </span>
                ) : null}
              </div>
              <PanelCollapseButton
                label={
                  discoverySection === 'events'
                    ? 'Collapse events'
                    : discoverySection === 'nearby'
                      ? 'Collapse nearby discovery'
                      : 'Collapse trails'
                }
                onClick={collapsePanel}
              />
            </div>
            {modeNavigation}
            <div className="event-panel__scroll">
              {discoverySection === 'events' && discovery.status === 'ready' ? (
                <div className="event-discovery-controls">
                  <SearchField
                    label="Search campus events"
                    hideLabel
                    className="event-search"
                    onChange={(value) => setSearchQuery(value)}
                    placeholder="Search events"
                    value={searchQuery}
                  />
                  <SelectField
                    label="Filter events by status"
                    hideLabel
                    className="event-status-filter"
                    onChange={(value) =>
                      setAvailabilityFilter(value as EventAvailabilityFilter)
                    }
                    value={availabilityFilter}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'active', label: 'Available now' },
                      { value: 'upcoming', label: 'Upcoming' },
                      { value: 'ended', label: 'Ended' },
                    ]}
                  />
                </div>
              ) : null}

              {discoverySection === 'events' &&
              discovery.status === 'ready' &&
              visibleEvents.length === 0 &&
              hasActiveFilters ? (
                <div
                  aria-live="polite"
                  className="event-list__state state-message state-message--empty"
                >
                  <StateIcon tone="empty" />
                  <strong>No events match these filters.</strong>
                  <p>Change your search or clear the filters.</p>
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

        {exploreMode === 'discover' &&
        panelMode === 'list' &&
        discoverySection === 'trail-detail' ? (
          <>
            <div className="event-panel__toolbar">
              <button
                className="event-panel__back"
                onClick={() => showDiscoverySection('trails')}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={20} /> All trails
              </button>
              <PanelCollapseButton
                label="Collapse trail details"
                onClick={collapsePanel}
              />
            </div>
            {modeNavigation}
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

        {exploreMode === 'discover' &&
        panelMode === 'selected' &&
        selectedEvent !== null ? (
          <>
            <div className="event-panel__toolbar">
              <button
                className="event-panel__back"
                onClick={showEventList}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={20} />
                {selectionOriginRef.current === 'nearby'
                  ? 'Back to nearby'
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
              <PanelCollapseButton
                label="Collapse event details"
                onClick={collapsePanel}
              />
            </div>
            {modeNavigation}
            <div className="event-panel__scroll">
              <SelectedEventDetails
                key={selectedEvent.id}
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
          : 'Finding your location',
    };
  }

  if (state === 'denied') {
    return {
      action: 'none',
      active: false,
      disabled: true,
      guidance: 'Allow location in browser settings, then reload this page.',
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
          ? 'Open this page over HTTPS and allow location access.'
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
          ? 'The map shows your last known location.'
          : state === 'unavailable'
            ? 'Check device location services and retry.'
            : undefined,
    label:
      state === 'permission-required'
        ? 'Enable live location'
        : 'Retry live location',
  };
}
