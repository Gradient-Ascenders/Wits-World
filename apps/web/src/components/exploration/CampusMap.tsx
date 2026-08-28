import { useEffect, useRef, useState } from 'react';

import {
  createMapboxMap,
  type MapConfiguration,
  type MapCoordinate,
  type MapController,
  type MapFactory,
  type MapPoint,
} from './map-provider';

interface CampusMapProps {
  accessibleLabel?: string;
  configuration: MapConfiguration;
  errorDescription?: string;
  focusPointRequest?: number;
  mapFactory?: MapFactory;
  onCoordinateSelect?: (coordinate: MapCoordinate) => void;
  onFollowStateChange?: (following: boolean) => void;
  onPointSelect?: (pointId: string) => void;
  points: readonly MapPoint[];
  recenterRequest?: number;
  reportedLocation?: MapCoordinate | null;
  selectedPoint?: MapPoint | null;
}

type MapStatus = 'error' | 'loading' | 'ready';

const MAP_LOAD_TIMEOUT_MS = 15_000;

export function CampusMap({
  accessibleLabel = 'Interactive campus map using Mapbox Standard 3D. Event information is also available in the nearby events list.',
  configuration,
  errorDescription = 'Use the nearby events list to continue exploring.',
  focusPointRequest = 0,
  mapFactory = createMapboxMap,
  onCoordinateSelect,
  onFollowStateChange,
  onPointSelect,
  points,
  recenterRequest = 0,
  reportedLocation = null,
  selectedPoint = null,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const onCoordinateSelectRef = useRef(onCoordinateSelect);
  const onFollowStateChangeRef = useRef(onFollowStateChange);
  const onPointSelectRef = useRef(onPointSelect);
  const pointsRef = useRef(points);
  const focusPointRequestRef = useRef(focusPointRequest);
  const reportedLocationRef = useRef<MapCoordinate | null>(reportedLocation);
  const selectedPointRef = useRef<MapPoint | null>(selectedPoint);
  const [status, setStatus] = useState<MapStatus>('loading');

  pointsRef.current = points;
  focusPointRequestRef.current = focusPointRequest;
  onCoordinateSelectRef.current = onCoordinateSelect;
  onFollowStateChangeRef.current = onFollowStateChange;
  onPointSelectRef.current = onPointSelect;
  reportedLocationRef.current = reportedLocation;
  selectedPointRef.current = selectedPoint;

  useEffect(() => {
    controllerRef.current?.setPoints(points);
  }, [points]);

  useEffect(() => {
    controllerRef.current?.setReportedLocation(reportedLocation);
  }, [reportedLocation]);

  useEffect(() => {
    controllerRef.current?.setSelectedPoint?.(selectedPoint);
  }, [selectedPoint]);

  useEffect(() => {
    if (focusPointRequest > 0 && selectedPoint !== null) {
      controllerRef.current?.focusPoint(selectedPoint);
    }
  }, [focusPointRequest, selectedPoint]);

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

    if (!container) {
      return;
    }

    const loadTimeout = window.setTimeout(() => {
      if (active) {
        setStatus('error');
      }
    }, MAP_LOAD_TIMEOUT_MS);

    setStatus('loading');

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
        map.setPoints(pointsRef.current);
        map.setReportedLocation(reportedLocationRef.current);
        map.setSelectedPoint?.(selectedPointRef.current);
        if (
          focusPointRequestRef.current > 0 &&
          selectedPointRef.current !== null
        ) {
          map.focusPoint(selectedPointRef.current);
        }
        map.setCoordinateSelectionListener?.(
          onCoordinateSelectRef.current ?? null,
        );
        map.setPointSelectionListener?.(onPointSelectRef.current ?? null);
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

    return () => {
      active = false;
      abortController.abort();
      window.clearTimeout(loadTimeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller?.remove();
    };
  }, [configuration, mapFactory]);

  return (
    <div className="campus-map">
      <div
        aria-label={accessibleLabel}
        className="campus-map__canvas"
        ref={containerRef}
        role="region"
      />

      {status === 'loading' ? (
        <div aria-live="polite" className="map-state" role="status">
          <span aria-hidden="true" className="map-state__indicator" />
          <span>Loading the campus map…</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="map-state map-state--error" role="alert">
          <strong>The map could not load.</strong>
          <span>{errorDescription}</span>
        </div>
      ) : null}
    </div>
  );
}
