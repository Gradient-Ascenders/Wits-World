import { useMemo, useState } from 'react';

import type {
  AuthorPlacementPlan,
  AuthorPlacementState,
} from '../../api/author';
import { CampusMap } from '../exploration/CampusMap';
import '../exploration/exploration.css';
import type {
  MapArea,
  MapConfiguration,
  MapFactory,
  MapPoint,
  PlacementMapState,
} from '../exploration/map-provider';
import { WITS_BRAAMFONTEIN_AUTHORING_BOUNDS } from './AuthorLocationMap';

interface EventPlacementMapProps {
  eventNames: ReadonlyMap<string, string>;
  focusPointRequest: number;
  mapFactory?: MapFactory;
  mapboxAccessToken: string;
  onSelectedSiteChange: (siteId: string) => void;
  plan: AuthorPlacementPlan | null;
  selectedSiteId: string | null;
  state: AuthorPlacementState;
}

const WITS_BRAAMFONTEIN_CENTRE = [28.02625, -26.18975] as const;

export function EventPlacementMap({
  eventNames,
  focusPointRequest,
  mapFactory,
  mapboxAccessToken,
  onSelectedSiteChange,
  plan,
  selectedSiteId,
  state,
}: EventPlacementMapProps) {
  const [configuration] = useState<MapConfiguration>(() => ({
    accessToken: mapboxAccessToken,
    bearing: 0,
    center: WITS_BRAAMFONTEIN_CENTRE,
    initialBounds: WITS_BRAAMFONTEIN_AUTHORING_BOUNDS,
    initialBoundsPadding: 28,
    pitch: 0,
    showResetViewControl: false,
    standardConfig: {
      show3dBuildings: false,
      show3dLandmarks: false,
      show3dObjects: false,
      show3dTrees: false,
      showPedestrianRoads: true,
    },
    styleUrl: 'mapbox://styles/mapbox/standard',
    zoom: 15.8,
  }));

  const points = useMemo<MapPoint[]>(() => {
    const activeOverrides = state.overrides.filter(
      (override) => override.siteId !== null,
    );
    return state.sites.map((site) => {
      const current = state.assignments.filter(
        (assignment) => assignment.siteId === site.id,
      );
      const proposed = plan?.entries.filter(
        (entry) => entry.siteId === site.id,
      );
      const overrides = activeOverrides.filter(
        (override) => override.siteId === site.id,
      );
      const placementStates: PlacementMapState[] = [];
      if (current.length > 0) placementStates.push('current');
      if ((proposed?.length ?? 0) > 0) placementStates.push('proposed');
      if (
        site.excluded ||
        overrides.some((override) => override.kind === 'site_exclusion')
      ) {
        placementStates.push('excluded');
      }
      if (
        current.some((assignment) => assignment.origin === 'pin') ||
        proposed?.some((entry) => entry.origin === 'pin') ||
        overrides.some((override) => override.kind === 'pin')
      ) {
        placementStates.push('overridden');
      }
      if (placementStates.length === 0) placementStates.push('candidate');

      const assignedEvents = [...current, ...(proposed ?? [])]
        .map(
          (assignment) =>
            eventNames.get(assignment.eventId) ?? 'Unknown portable event',
        )
        .filter((name, index, names) => names.indexOf(name) === index);
      const statusLabel = placementStates
        .map((placementState) => placementStateLabel(placementState))
        .join(', ');

      return {
        id: site.id,
        label: `${site.name}. ${statusLabel}${assignedEvents.length > 0 ? `. ${assignedEvents.join(', ')}` : ''}`,
        latitude: site.latitude,
        longitude: site.longitude,
        placementStates,
        selectable: true,
      };
    });
  }, [eventNames, plan, state.assignments, state.overrides, state.sites]);

  const areas = useMemo<MapArea[]>(() => {
    const validation = plan?.validation.coverage;
    return state.zones.flatMap((zone) => {
      if (
        zone.geometry.type !== 'Polygon' &&
        zone.geometry.type !== 'MultiPolygon'
      ) {
        return [];
      }
      const actual = validation?.find(
        (item) => item.zoneId === zone.id,
      )?.actual;
      const count =
        actual ??
        state.assignments.filter((assignment) => assignment.zoneId === zone.id)
          .length;
      const areaState =
        count < state.policy.mandatoryPerZone
          ? ('unserved' as const)
          : count < state.policy.preferredPerZone
            ? ('shortfall' as const)
            : ('served' as const);
      return [
        {
          geometry: zone.geometry,
          id: zone.id,
          label: `${zone.name}: ${count} assignment${count === 1 ? '' : 's'}`,
          state: areaState,
        },
      ];
    });
  }, [plan, state.assignments, state.policy, state.zones]);

  const selectedPoint =
    points.find((point) => point.id === selectedSiteId) ?? null;

  return (
    <section aria-labelledby="placement-map-title" className="placement-map">
      <div className="placement-map__heading">
        <div>
          <h3 id="placement-map-title">Campus map</h3>
          <p>
            {plan
              ? 'Blue markers are proposed. Gold markers remain live until you apply.'
              : state.assignments.length > 0
                ? 'Gold markers are live. Black markers are available candidate sites.'
                : 'Black markers are reviewed candidate sites. Create a preview to see proposed placements.'}
          </p>
        </div>
        <ul aria-label="Placement map legend" className="placement-map__legend">
          {(
            [
              'candidate',
              'current',
              'proposed',
              'excluded',
              'overridden',
            ] as const
          ).map((placementState) => (
            <li key={placementState}>
              <span
                aria-hidden="true"
                className={`placement-map__key placement-map__key--${placementState}`}
              />
              {placementStateLabel(placementState)}
            </li>
          ))}
        </ul>
      </div>
      <CampusMap
        accessibleLabel="Author event-placement map showing reviewed candidate sites, coverage zones, current assignments, proposed assignments, exclusions, and active overrides. The complete data is available in the tables below."
        areas={areas}
        configuration={configuration}
        errorDescription="Use the coverage, candidate-site, and assignment tables below. All placement controls remain available without the map."
        focusPointRequest={focusPointRequest}
        mapFactory={mapFactory}
        onPointSelect={onSelectedSiteChange}
        points={points}
        selectedPoint={selectedPoint}
      />
    </section>
  );
}

function placementStateLabel(state: PlacementMapState): string {
  switch (state) {
    case 'candidate':
      return 'Candidate';
    case 'current':
      return 'Current';
    case 'excluded':
      return 'Excluded';
    case 'overridden':
      return 'Overridden';
    case 'proposed':
      return 'Proposed';
  }
}
