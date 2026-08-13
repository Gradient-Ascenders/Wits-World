import { useEffect, useRef, useState } from 'react';

import {
  createMapLibreMap,
  type MapConfiguration,
  type MapController,
  type MapFactory,
  type MapPoint,
} from './map-provider';

interface CampusMapProps {
  configuration: MapConfiguration;
  mapFactory?: MapFactory;
  points: readonly MapPoint[];
}

type MapStatus = 'error' | 'loading' | 'ready';

const MAP_LOAD_TIMEOUT_MS = 15_000;

export function CampusMap({
  configuration,
  mapFactory = createMapLibreMap,
  points,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const pointsRef = useRef(points);
  const [status, setStatus] = useState<MapStatus>('loading');

  pointsRef.current = points;

  useEffect(() => {
    controllerRef.current?.setPoints(points);
  }, [points]);

  useEffect(() => {
    const container = containerRef.current;
    const abortController = new AbortController();
    let active = true;
    let controller: MapController | undefined;

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
        map.onLoad(() => {
          if (active) {
            window.clearTimeout(loadTimeout);
            setStatus('ready');
          }
        });
        map.onError(() => {
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
        aria-label="Interactive campus map. Event information is also available in the nearby events list."
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
          <span>Use the nearby events list to continue exploring.</span>
        </div>
      ) : null}
    </div>
  );
}
