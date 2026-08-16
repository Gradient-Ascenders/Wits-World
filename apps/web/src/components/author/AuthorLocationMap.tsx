import { useMemo, useState } from 'react';

import { CampusMap } from '../exploration/CampusMap';
import type {
  MapConfiguration,
  MapCoordinate,
  MapFactory,
} from '../exploration/map-provider';

interface AuthorLocationMapProps {
  coordinate: MapCoordinate;
  mapboxAccessToken: string;
  mapFactory?: MapFactory;
  onChange: (coordinate: MapCoordinate) => void;
}

export function AuthorLocationMap({
  coordinate,
  mapboxAccessToken,
  mapFactory,
  onChange,
}: AuthorLocationMapProps) {
  const [configuration] = useState<MapConfiguration>(() => ({
    accessToken: mapboxAccessToken,
    bearing: 20,
    center: [coordinate.longitude, coordinate.latitude],
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

  const points = useMemo(
    () => [
      {
        id: 'author-event-position',
        label: 'Event position',
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      },
    ],
    [coordinate.latitude, coordinate.longitude],
  );

  return (
    <div className="author-location-map">
      <CampusMap
        accessibleLabel="Event placement map. Select a point to update the coordinate inputs. Latitude and longitude fields provide the complete keyboard-accessible alternative."
        configuration={configuration}
        errorDescription="Use the labelled latitude and longitude fields to continue placing the event."
        mapFactory={mapFactory}
        onCoordinateSelect={onChange}
        points={points}
      />
      <p className="field-help">
        Select a map point for convenience, or enter the same location in the
        labelled latitude and longitude fields.
      </p>
    </div>
  );
}
