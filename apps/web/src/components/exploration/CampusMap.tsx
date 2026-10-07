import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, MapTrifold } from '@phosphor-icons/react';
import { ExplorationLoadingPanel } from './ExplorationLoadingPanel';

import {
  createMapboxMap,
  DEFAULT_MAP_LAYER_VISIBILITY,
  type MapArea,
  type MapConfiguration,
  type MapCoordinate,
  type MapController,
  type MapFactory,
  type MapLayerVisibility,
  type MapPoint,
  type MapRegion,
  type ReportedMapLocation,
} from './map-provider';

interface CampusMapProps {
  accessibleLabel?: string;
  areas?: readonly MapArea[];
  configuration: MapConfiguration;
  errorDescription?: string;
  focusPointRequest?: number;
  initialDiscoveryPending?: boolean;
  mapFactory?: MapFactory;
  layerVisibility?: MapLayerVisibility;
  onCoordinateSelect?: (coordinate: MapCoordinate) => void;
  onFollowStateChange?: (following: boolean) => void;
  onPointSelect?: (pointId: string) => void;
  onRegionSelect?: (regionId: string) => void;
  points: readonly MapPoint[];
  regions?: readonly MapRegion[];
  recenterRequest?: number;
  reportedLocation?: ReportedMapLocation | null;
  selectedPoint?: MapPoint | null;
  selectedRegion?: MapRegion | null;
  focusRegionRequest?: number;
}

type MapStatus = 'error' | 'loading' | 'ready';

const MAP_LOAD_TIMEOUT_MS = 15_000;

export function CampusMap({
  accessibleLabel = 'Interactive campus map using Mapbox Standard 3D. Event information is also available in the nearby events list.',
  areas = [],
  configuration,
  errorDescription = 'Open Campus events to keep exploring.',
  focusPointRequest = 0,
  focusRegionRequest = 0,
  initialDiscoveryPending = false,
  mapFactory = createMapboxMap,
  layerVisibility = DEFAULT_MAP_LAYER_VISIBILITY,
  onCoordinateSelect,
  onFollowStateChange,
  onPointSelect,
  onRegionSelect,
  points,
  regions = [],
  recenterRequest = 0,
  reportedLocation = null,
  selectedPoint = null,
  selectedRegion = null,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const initialDiscoveryPendingRef = useRef(initialDiscoveryPending);
  const resumeInitializationRef = useRef<(() => void) | null>(null);
  const onCoordinateSelectRef = useRef(onCoordinateSelect);
  const onFollowStateChangeRef = useRef(onFollowStateChange);
  const onPointSelectRef = useRef(onPointSelect);
  const onRegionSelectRef = useRef(onRegionSelect);
  const pointsRef = useRef(points);
  const regionsRef = useRef(regions);
  const areasRef = useRef(areas);
  const layerVisibilityRef = useRef(layerVisibility);
  const focusPointRequestRef = useRef(focusPointRequest);
  const focusRegionRequestRef = useRef(focusRegionRequest);
  const reportedLocationRef = useRef<ReportedMapLocation | null>(
    reportedLocation,
  );
  const selectedPointRef = useRef<MapPoint | null>(selectedPoint);
  const selectedRegionRef = useRef<MapRegion | null>(selectedRegion);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  pointsRef.current = points;
  initialDiscoveryPendingRef.current = initialDiscoveryPending;
  regionsRef.current = regions;
  areasRef.current = areas;
  layerVisibilityRef.current = layerVisibility;
  focusPointRequestRef.current = focusPointRequest;
  focusRegionRequestRef.current = focusRegionRequest;
  onCoordinateSelectRef.current = onCoordinateSelect;
  onFollowStateChangeRef.current = onFollowStateChange;
  onPointSelectRef.current = onPointSelect;
  onRegionSelectRef.current = onRegionSelect;
  reportedLocationRef.current = reportedLocation;
  selectedPointRef.current = selectedPoint;
  selectedRegionRef.current = selectedRegion;

  useEffect(() => {
    controllerRef.current?.setPoints(points);
  }, [points]);

  useEffect(() => {
    controllerRef.current?.setLayerVisibility?.(layerVisibility);
  }, [layerVisibility]);

  useEffect(() => {
    controllerRef.current?.setRegions?.(regions);
  }, [regions]);

  useEffect(() => {
    controllerRef.current?.setAreas?.(areas);
  }, [areas]);

  useEffect(() => {
    controllerRef.current?.setReportedLocation(reportedLocation);
  }, [reportedLocation]);

  useEffect(() => {
    controllerRef.current?.setSelectedPoint?.(selectedPoint);
  }, [selectedPoint]);

  useEffect(() => {
    controllerRef.current?.setSelectedRegion?.(selectedRegion);
  }, [selectedRegion]);

  useEffect(() => {
    if (focusPointRequest > 0 && selectedPoint !== null) {
      controllerRef.current?.focusPoint(selectedPoint);
    }
  }, [focusPointRequest, selectedPoint]);

  useEffect(() => {
    if (focusRegionRequest > 0 && selectedRegion !== null) {
      controllerRef.current?.focusRegion?.(selectedRegion);
    }
  }, [focusRegionRequest, selectedRegion]);

  useEffect(() => {
    if (recenterRequest > 0) {
      controllerRef.current?.recenterReportedLocation?.();
    }
  }, [recenterRequest]);

  useEffect(() => {
    controllerRef.current?.setCoordinateSelectionListener?.(
      onCoordinateSelect ?? null,
    );
  }, [onCoordinateSelect]);

  useEffect(() => {
    controllerRef.current?.setPointSelectionListener?.(onPointSelect ?? null);
  }, [onPointSelect]);

  useEffect(() => {
    controllerRef.current?.setRegionSelectionListener?.(onRegionSelect ?? null);
  }, [onRegionSelect]);

  useEffect(() => {
    controllerRef.current?.setFollowStateListener?.(
      onFollowStateChange ?? null,
    );
  }, [onFollowStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    const abortController = new AbortController();
    let active = true;
    let controller: MapController | undefined;
    let loaded = false;
    let constructionStarted = false;
    let paintFrame: number | null = null;
    const waitForDiscoveryPaint = initialDiscoveryPendingRef.current;
    const resizeMap = (): void => {
      if (!container) return;
      const exploration = container.closest<HTMLElement>('.exploration-view');
      if (!exploration) {
        controllerRef.current?.resize?.();
        return;
      }
      const sheetHeight =
        parseFloat(
          exploration.style.getPropertyValue('--event-panel-height'),
        ) || 100;
      const panel = exploration.querySelector('.event-panel');
      const clearance = panel
        ? parseFloat(getComputedStyle(panel).bottom) || 0
        : 0;
      const desktop = window.matchMedia?.('(min-width: 64rem)').matches;
      const tablet = window.matchMedia?.('(min-width: 48rem)').matches;
      controllerRef.current?.resize?.({
        top: 16,
        right: 16,
        bottom: !tablet
          ? Math.max(
              0,
              Math.min(
                container.clientHeight - 100,
                sheetHeight + clearance + 64,
              ),
            )
          : !desktop
            ? clearance + 16
            : 16,
        left:
          tablet && !desktop && exploration.dataset.sheetSnap !== 'peek'
            ? (panel?.getBoundingClientRect().right ?? 432) -
              exploration.getBoundingClientRect().left +
              16
            : 16,
      });
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(resizeMap);
    const layoutObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(resizeMap);

    if (!container) {
      return;
    }
    resizeObserver?.observe(container);
    const exploration = container.closest('.exploration-view');
    if (exploration)
      layoutObserver?.observe(exploration, {
        attributes: true,
        attributeFilter: ['style', 'data-sheet-snap'],
      });

    const loadTimeout = window.setTimeout(() => {
      if (active) {
        setStatus('error');
        // A stalled discovery request must not prevent the map attempt.
        // Reuse the existing fallback deadline rather than adding a delay.
        if (paintFrame !== null) window.cancelAnimationFrame(paintFrame);
        paintFrame = null;
        constructMap();
      }
    }, MAP_LOAD_TIMEOUT_MS);

    setStatus('loading');

    const constructMap = (): void => {
      if (!active || constructionStarted) return;
      constructionStarted = true;
      void mapFactory(
        container,
        configuration,
        pointsRef.current,
        abortController.signal,
      )
        .then((map) => {
          if (!active) {
            map.remove();
            return;
          }

          controller = map;
          controllerRef.current = map;
          resizeMap();
          map.setPoints(pointsRef.current);
          map.setRegions?.(regionsRef.current);
          map.setAreas?.(areasRef.current);
          map.setLayerVisibility?.(layerVisibilityRef.current);
          map.setReportedLocation(reportedLocationRef.current);
          map.setSelectedPoint?.(selectedPointRef.current);
          map.setSelectedRegion?.(selectedRegionRef.current);
          if (
            focusPointRequestRef.current > 0 &&
            selectedPointRef.current !== null
          ) {
            map.focusPoint(selectedPointRef.current);
          }
          if (
            focusRegionRequestRef.current > 0 &&
            selectedRegionRef.current !== null
          ) {
            map.focusRegion?.(selectedRegionRef.current);
          }
          map.setCoordinateSelectionListener?.(
            onCoordinateSelectRef.current ?? null,
          );
          map.setPointSelectionListener?.(onPointSelectRef.current ?? null);
          map.setRegionSelectionListener?.(onRegionSelectRef.current ?? null);
          map.setFollowStateListener?.(onFollowStateChangeRef.current ?? null);
          map.onLoad(() => {
            if (active) {
              loaded = true;
              window.clearTimeout(loadTimeout);
              setStatus('ready');
            }
          });
          map.onError(() => {
            if (active && !loaded) {
              window.clearTimeout(loadTimeout);
              setStatus('error');
            }
          });
          map.onFatalError?.(() => {
            if (active) {
              window.clearTimeout(loadTimeout);
              setStatus('error');
            }
          });
        })
        .catch(() => {
          if (active) {
            window.clearTimeout(loadTimeout);
            setStatus('error');
          }
        });
    };

    const resumeInitialization = (): void => {
      if (
        !active ||
        constructionStarted ||
        initialDiscoveryPendingRef.current ||
        paintFrame !== null
      ) {
        return;
      }
      if (!waitForDiscoveryPaint) {
        constructMap();
        return;
      }
      // The discovery DOM has committed. Let it reach a paint opportunity
      // before map imports/construction compete for the renderer thread.
      paintFrame = window.requestAnimationFrame(() => {
        paintFrame = window.requestAnimationFrame(() => {
          paintFrame = null;
          constructMap();
        });
      });
    };
    resumeInitializationRef.current = resumeInitialization;
    resumeInitialization();

    return () => {
      active = false;
      if (paintFrame !== null) window.cancelAnimationFrame(paintFrame);
      if (resumeInitializationRef.current === resumeInitialization) {
        resumeInitializationRef.current = null;
      }
      resizeObserver?.disconnect();
      layoutObserver?.disconnect();
      abortController.abort();
      window.clearTimeout(loadTimeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller?.remove();
    };
  }, [attempt, configuration, mapFactory]);

  useEffect(() => {
    if (!initialDiscoveryPending) resumeInitializationRef.current?.();
  }, [initialDiscoveryPending]);

  return (
    <div className="campus-map" data-sign-in-map>
      <div
        aria-label={accessibleLabel}
        aria-busy={status === 'loading'}
        className="campus-map__canvas"
        ref={containerRef}
        role="region"
      />

      {status === 'loading' ? (
        <ExplorationLoadingPanel
          className="map-state exploration-loading-panel--inline"
          label="Loading map…"
          placeholder={false}
        />
      ) : null}

      {status === 'error' ? (
        <div className="map-state map-state--error" role="alert">
          <MapTrifold aria-hidden="true" size={24} />
          <strong>The map could not load.</strong>
          <span>{errorDescription}</span>
          <button
            className="button button--quiet"
            onClick={() => setAttempt((current) => current + 1)}
            type="button"
          >
            <ArrowClockwise aria-hidden="true" size={20} /> Retry map
          </button>
        </div>
      ) : null}
    </div>
  );
}
