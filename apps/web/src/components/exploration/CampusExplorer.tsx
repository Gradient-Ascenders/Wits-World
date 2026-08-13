import { useMemo } from 'react';

import { CampusMap } from './CampusMap';
import {
  EventList,
  type EventDiscoveryState,
  type EventEligibilityState,
  type EventPresentation,
} from './EventList';
import type {
  MapConfiguration,
  MapCoordinate,
  MapFactory,
  MapPoint,
} from './map-provider';
import './exploration.css';

interface CampusExplorerProps {
  discovery: EventDiscoveryState;
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>;
  eligibilityBusy: boolean;
  mapConfiguration: MapConfiguration;
  mapFactory?: MapFactory;
  onCheckEligibility: (eventId: string) => void;
  onRetry: () => void;
  reportedLocation?: MapCoordinate | null;
}

function toMapPoints(events: readonly EventPresentation[]): MapPoint[] {
  return events.map((event) => ({
    id: event.id,
    label: event.title,
    latitude: event.latitude,
    longitude: event.longitude,
  }));
}

export function CampusExplorer({
  discovery,
  eligibility,
  eligibilityBusy,
  mapConfiguration,
  mapFactory,
  onCheckEligibility,
  onRetry,
  reportedLocation = null,
}: CampusExplorerProps) {
  const points = useMemo(
    () => (discovery.status === 'ready' ? toMapPoints(discovery.events) : []),
    [discovery],
  );

  return (
    <section aria-labelledby="campus-map-title" className="exploration-view">
      <header className="exploration-view__header">
        <div>
          <p className="eyebrow">Campus exploration</p>
          <h1 id="campus-map-title">Explore the campus map</h1>
        </div>
        <p className="exploration-view__intro">
          Find published events on the map or browse the same information in the
          nearby events list.
        </p>
      </header>

      <CampusMap
        configuration={mapConfiguration}
        mapFactory={mapFactory}
        points={points}
        reportedLocation={reportedLocation}
      />
      <EventList
        discovery={discovery}
        eligibility={eligibility}
        eligibilityBusy={eligibilityBusy}
        onCheckEligibility={onCheckEligibility}
        onRetry={onRetry}
      />
    </section>
  );
}
