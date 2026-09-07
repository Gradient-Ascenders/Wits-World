import { MapPinIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { CampusMap } from '../exploration/CampusMap';
import '../exploration/exploration.css';
import type {
  MapBounds,
  MapConfiguration,
  MapCoordinate,
  MapFactory,
  MapPoint,
} from '../exploration/map-provider';

export const WITS_BRAAMFONTEIN_AUTHORING_BOUNDS: MapBounds = [
  // This is a camera viewport for the East and West campuses, not a gameplay boundary.
  [28.0185, -26.195],
  [28.034, -26.1845],
];

const WITS_BRAAMFONTEIN_CENTRE = [28.02625, -26.18975] as const;

interface AuthorLocationMapProps {
  coordinate: MapCoordinate | null;
  disabled?: boolean;
  mapboxAccessToken: string;
  mapFactory?: MapFactory;
  onChange: (coordinate: MapCoordinate) => void;
  radiusMetres: number | null;
}

export function AuthorLocationMap({
  coordinate,
  disabled = false,
  mapboxAccessToken,
  mapFactory,
  onChange,
  radiusMetres,
}: AuthorLocationMapProps) {
  const [focusPointRequest, setFocusPointRequest] = useState(0);
  const [configuration] = useState<MapConfiguration>(() => ({
    accessToken: mapboxAccessToken,
    bearing: 20,
    center: coordinate
      ? [coordinate.longitude, coordinate.latitude]
      : WITS_BRAAMFONTEIN_CENTRE,
    ...(coordinate
      ? {}
      : {
          initialBounds: WITS_BRAAMFONTEIN_AUTHORING_BOUNDS,
          initialBoundsPadding: 32,
        }),
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
  }));

  const selectedPoint = useMemo<MapPoint | null>(() => {
    if (coordinate === null) return null;

    return {
      draggable: !disabled,
      id: 'author-event-position',
      label: 'selected event location',
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      ...(radiusMetres !== null ? { radiusMetres } : {}),
    };
  }, [coordinate, disabled, radiusMetres]);
  const points = useMemo(
    () => (selectedPoint === null ? [] : [selectedPoint]),
    [selectedPoint],
  );

  return (
    <div className="author-location-map">
      <div aria-live="polite" className="author-location-map__summary">
        <span aria-hidden="true" className="author-location-map__pin">
          <MapPinIcon size={20} />
        </span>
        <span className="author-location-map__summary-copy">
          <strong>
            {coordinate === null ? 'Choose a location' : 'Location selected'}
          </strong>
          <span>
            {coordinate === null
              ? 'Select a point on the Wits Braamfontein campus map.'
              : radiusMetres === null
                ? 'Drag the marker or select another point to adjust it.'
                : `${radiusMetres} m event area shown. Drag the marker or select another point to adjust it.`}
          </span>
        </span>
        {selectedPoint !== null ? (
          <button
            className="button button--quiet author-location-map__focus"
            disabled={disabled}
            onClick={() => setFocusPointRequest((current) => current + 1)}
            type="button"
          >
            Centre marker
          </button>
        ) : null}
      </div>

      <CampusMap
        accessibleLabel="Event location map for Wits Braamfontein. Select a point to place the event. The selected marker can be dragged; the coordinate fields below provide keyboard-accessible entry."
        configuration={configuration}
        errorDescription="Use the advanced latitude and longitude fields below to place the event."
        focusPointRequest={focusPointRequest}
        mapFactory={mapFactory}
        onCoordinateSelect={disabled ? undefined : onChange}
        onPointSelect={
          disabled
            ? undefined
            : () => setFocusPointRequest((current) => current + 1)
        }
        points={points}
        selectedPoint={selectedPoint}
      />
      <p className="field-help">
        The coordinate fields below remain available for keyboard entry or if
        the map is unavailable.
      </p>
    </div>
  );
}
