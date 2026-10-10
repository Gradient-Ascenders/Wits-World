import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import type {
  MapPoint,
  ReportedMapLocation,
} from '../components/exploration/map-provider';
import campus from './campus-map.json';
import './offline.css';

const WIDTH = 1600;
const HEIGHT = 1220;
const [south, west, north, east] = campus.bounds as [
  number,
  number,
  number,
  number,
];
export function projectCampusPoint(longitude: number, latitude: number) {
  return [
    ((longitude - west) / (east - west)) * WIDTH,
    ((north - latitude) / (north - south)) * HEIGHT,
  ] as const;
}
const geometry = campus.features.map((feature) => ({
  ...feature,
  points: feature.coordinates
    .map(([lon, lat]) => projectCampusPoint(lon!, lat!).join(','))
    .join(' '),
  centre: projectCampusPoint(
    feature.coordinates.reduce((sum, point) => sum + point[0]!, 0) /
      feature.coordinates.length,
    feature.coordinates.reduce((sum, point) => sum + point[1]!, 0) /
      feature.coordinates.length,
  ),
}));

export function OfflineCampusMap({
  points,
  selectedPoint,
  onPointSelect,
  reportedLocation,
  locationStale,
  focusPointRequest,
  recenterRequest,
}: {
  points: readonly MapPoint[];
  selectedPoint: MapPoint | null;
  onPointSelect: (id: string) => void;
  reportedLocation: ReportedMapLocation | null;
  locationStale: boolean;
  focusPointRequest: number;
  recenterRequest: number;
}) {
  const [view, setView] = useState({
    x: 0,
    y: 0,
    width: WIDTH,
    height: HEIGHT,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({
    width: WIDTH,
    height: HEIGHT,
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const bounds = svg.getBoundingClientRect();
      if (bounds.width && bounds.height)
        setDimensions({ width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  // Keep marker targets at least 44 CSS pixels at every viewport and zoom.
  const screenScale = Math.max(
    view.width / dimensions.width,
    view.height / dimensions.height,
  );
  const labels = useMemo(() => {
    const occupied: Array<{ x: number; y: number; width: number }> = [];
    return geometry.filter((feature) => {
      if (!feature.name || feature.kind !== 'building') return false;
      const [x, y] = feature.centre;
      if (
        x < view.x ||
        x > view.x + view.width ||
        y < view.y ||
        y > view.y + view.height
      )
        return false;
      const width = Math.min(feature.name.length, 28) * 6 * screenScale;
      if (
        occupied.some(
          (box) =>
            Math.abs(x - box.x) < (width + box.width) / 2 + 8 * screenScale &&
            Math.abs(y - box.y) < 18 * screenScale,
        )
      )
        return false;
      occupied.push({ x, y, width });
      return true;
    });
  }, [view, screenScale]);
  const drag = useRef<{
    x: number;
    y: number;
    origin: typeof view;
    moved: boolean;
  } | null>(null);
  const focusRef = useRef({ selectedPoint, reportedLocation });
  focusRef.current = { selectedPoint, reportedLocation };
  const centre = (point: { longitude: number; latitude: number }) => {
    const [x, y] = projectCampusPoint(point.longitude, point.latitude);
    setView((current) => ({
      ...current,
      x: x - current.width / 2,
      y: y - current.height / 2,
    }));
  };
  useEffect(() => {
    const point = focusRef.current.selectedPoint;
    if (focusPointRequest > 0 && point) centre(point);
  }, [focusPointRequest]);
  useEffect(() => {
    const point = focusRef.current.reportedLocation;
    if (recenterRequest > 0 && point) centre(point);
  }, [recenterRequest]);
  const zoom = (factor: number) =>
    setView((current) => {
      const width = Math.max(160, Math.min(WIDTH * 2, current.width * factor));
      const height = (width * HEIGHT) / WIDTH;
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  const location = reportedLocation
    ? projectCampusPoint(reportedLocation.longitude, reportedLocation.latitude)
    : null;
  return (
    <div className="campus-map offline-campus-map">
      <svg
        ref={svgRef}
        role="group"
        aria-label="Downloaded campus map with paths, buildings and event markers. Use the event list for accessible details."
        tabIndex={0}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        onKeyDown={(event) => {
          const delta = view.width / 10;
          if (event.key === '+' || event.key === '=') zoom(0.8);
          else if (event.key === '-') zoom(1.25);
          else if (
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            setView((current) => ({
              ...current,
              x:
                current.x +
                (event.key === 'ArrowRight'
                  ? delta
                  : event.key === 'ArrowLeft'
                    ? -delta
                    : 0),
              y:
                current.y +
                (event.key === 'ArrowDown'
                  ? delta
                  : event.key === 'ArrowUp'
                    ? -delta
                    : 0),
            }));
          }
        }}
        onPointerDown={(event) => {
          if ((event.target as Element).closest('[role="button"]')) return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            origin: view,
            moved: false,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const value = drag.current;
          const bounds = svgRef.current?.getBoundingClientRect();
          if (!value || !bounds?.width || !bounds.height) return;
          value.moved = true;
          const scale = Math.max(
            value.origin.width / bounds.width,
            value.origin.height / bounds.height,
          );
          setView({
            ...value.origin,
            x: value.origin.x - (event.clientX - value.x) * scale,
            y: value.origin.y - (event.clientY - value.y) * scale,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <g aria-hidden="true">
          {geometry.map((feature) =>
            feature.kind === 'building' ? (
              <polygon
                key={feature.id}
                points={feature.points}
                className="offline-campus-map__building"
              />
            ) : (
              <polyline
                key={feature.id}
                points={feature.points}
                className="offline-campus-map__path"
              />
            ),
          )}
          {labels.map((feature) => (
            <text
              key={feature.id}
              x={feature.centre[0]}
              y={feature.centre[1]}
              className="offline-campus-map__label"
              style={{
                fontSize: 11 * screenScale,
                strokeWidth: 2 * screenScale,
              }}
            >
              {feature.name!.length > 28
                ? `${feature.name!.slice(0, 27)}…`
                : feature.name}
              <title>{feature.name}</title>
            </text>
          ))}
        </g>
        {points.map((point) => {
          const [x, y] = projectCampusPoint(point.longitude, point.latitude);
          const selected = point.id === selectedPoint?.id;
          return (
            <g
              key={point.id}
              role="button"
              tabIndex={0}
              aria-label={`View ${point.label} on map`}
              aria-pressed={selected}
              className={`offline-campus-map__event${selected ? ' offline-campus-map__event--selected' : ''}`}
              onClick={() => onPointSelect(point.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onPointSelect(point.id);
                }
              }}
            >
              <circle cx={x} cy={y} r={22 * screenScale} />
              <text
                aria-hidden="true"
                x={x}
                y={y + 5 * screenScale}
                textAnchor="middle"
                style={{ fontSize: 14 * screenScale }}
              >
                {points.indexOf(point) + 1}
              </text>
              <title>{point.label}</title>
            </g>
          );
        })}
        {location && (
          <g
            aria-label={
              locationStale
                ? 'Last known location'
                : 'Current reported location'
            }
            className={
              locationStale
                ? 'offline-campus-map__position offline-campus-map__position--stale'
                : 'offline-campus-map__position'
            }
          >
            <circle cx={location[0]} cy={location[1]} r={8 * screenScale} />
          </g>
        )}
      </svg>
      <div className="offline-campus-map__legend">
        <span>Campus map · north up</span>
        {location && (
          <span>
            {locationStale
              ? 'Last known location'
              : 'Current reported location'}
          </span>
        )}
      </div>
      <div className="offline-campus-map__zoom">
        <button
          type="button"
          className="button button--quiet"
          aria-label="Zoom in campus map"
          onClick={() => zoom(0.8)}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="button button--quiet"
          aria-label="Zoom out campus map"
          onClick={() => zoom(1.25)}
        >
          <Minus size={20} />
        </button>
      </div>
      <p className="offline-campus-map__attribution">
        <a href="https://www.openstreetmap.org/copyright">
          © OpenStreetMap contributors · ODbL
        </a>{' '}
        · Map data {campus.updatedAt.slice(0, 10)}. Paths are not verified
        walking directions.
      </p>
    </div>
  );
}
