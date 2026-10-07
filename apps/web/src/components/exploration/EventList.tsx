import { createAppDateTimeFormatter } from '../../date-time';
import { useEffect, useRef } from 'react';
import { UpdatingIndicator } from '../LoadingState';
import { StatusMessage } from '../StatusMessage';
import { ExplorationLoadingPanel } from './ExplorationLoadingPanel';
import type { PlayerEventAvailability } from '../../api/events';

export interface EventPresentation {
  availability: PlayerEventAvailability;
  description: null | string;
  endsAt: string;
  id: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  startsAt: string;
  title: string;
}

export type EventDiscoveryState =
  | { status: 'empty'; refreshing?: boolean; refreshError?: string }
  | { message: string; status: 'error' }
  | { status: 'loading' }
  | {
      events: readonly EventPresentation[];
      status: 'ready';
      refreshing?: boolean;
      refreshError?: string;
    };

export type EventEligibilityState =
  | { status: 'api-error' }
  | { status: 'authorization-error' }
  | { status: 'checking' }
  | { status: 'event-unavailable' }
  | { status: 'idle' }
  | { status: 'journey-too-fast' }
  | { status: 'locating' }
  | { status: 'location-denied' }
  | { status: 'location-stale' }
  | { status: 'location-timeout' }
  | { status: 'location-uncertain' }
  | { status: 'location-unavailable' }
  | { status: 'reachable' }
  | { status: 'starting' }
  | { status: 'start-error' }
  | { status: 'unreachable' };

export type LocationExperienceState =
  | 'blocked'
  | 'checking-permission'
  | 'denied'
  | 'locating'
  | 'permission-required'
  | 'stale'
  | 'timeout'
  | 'tracking'
  | 'unavailable'
  | 'unsupported';

interface EventListProps {
  discovery: EventDiscoveryState;
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>;
  onRetry: () => void;
  onSelect: (eventId: string) => void;
  selectedEventId: string | null;
}

export const availabilityLabels: Record<PlayerEventAvailability, string> = {
  active: 'Available now',
  ended: 'Ended',
  upcoming: 'Upcoming',
};

export function EventList({
  discovery,
  eligibility,
  onRetry,
  onSelect,
  selectedEventId,
}: EventListProps) {
  if (discovery.status === 'loading') {
    return <ExplorationLoadingPanel label="Loading events…" />;
  }

  if (discovery.status === 'error') {
    return (
      <StatusMessage tone="error" className="event-list__state">
        <strong>Events could not load.</strong>
        <p>{discovery.message}</p>
        <button className="button" onClick={onRetry} type="button">
          Retry events
        </button>
      </StatusMessage>
    );
  }

  if (discovery.status === 'empty' || discovery.events.length === 0) {
    return (
      <>
        <UpdatingIndicator
          active={discovery.refreshing ?? false}
          error={discovery.refreshError}
          label="Updating events"
          onRetry={onRetry}
        />
        <StatusMessage tone="empty" className="event-list__state">
          <strong>No events available.</strong>
          <p>Check back later.</p>
        </StatusMessage>
      </>
    );
  }

  return (
    <>
      <UpdatingIndicator
        active={discovery.refreshing ?? false}
        error={discovery.refreshError}
        label="Updating events"
        onRetry={onRetry}
      />
      <ul aria-label="Campus events" className="event-list__items">
        {discovery.events.map((event) => {
          const state = eligibility[event.id] ?? { status: 'idle' as const };
          const selected = selectedEventId === event.id;
          return (
            <li
              className={`event-summary${selected ? ' event-summary--selected' : ''}`}
              key={event.id}
            >
              <div className="event-summary__copy">
                <strong>{event.title}</strong>
                <span
                  className={`event-summary__availability event-summary__availability--${event.availability}`}
                >
                  {availabilityLabels[event.availability]}
                </span>
                <KnownEligibility state={state} />
              </div>
              <button
                aria-pressed={selected}
                className="button button--quiet event-summary__action"
                onClick={() => onSelect(event.id)}
                type="button"
              >
                {selected ? 'Selected' : 'View on map'}
                <span className="sr-only">: {event.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface SelectedEventDetailsProps {
  eligibilityBusy: boolean;
  event: EventPresentation;
  locationState: LocationExperienceState;
  onRetryEligibility: (eventId: string) => void;
  onStart: (eventId: string) => void;
  state: EventEligibilityState;
}

export function SelectedEventDetails({
  eligibilityBusy,
  event,
  locationState,
  onRetryEligibility,
  onStart,
  state,
}: SelectedEventDetailsProps) {
  const decisionSeen = useRef(false);
  const decisionReady =
    state.status === 'reachable' || state.status === 'unreachable';
  const emphasizeDecision = decisionReady && !decisionSeen.current;
  useEffect(() => {
    if (decisionReady) decisionSeen.current = true;
  }, [decisionReady]);

  return (
    <div className="selected-event">
      <div className="selected-event__heading">
        <span className={`status-badge status-badge--${event.availability}`}>
          {availabilityLabels[event.availability]}
        </span>
        <h2 tabIndex={-1}>{event.title}</h2>
      </div>

      <EligibilityStatus
        emphasizeDecision={emphasizeDecision}
        eligibilityBusy={eligibilityBusy}
        event={event}
        locationState={locationState}
        onRetryEligibility={onRetryEligibility}
        onStart={onStart}
        state={state}
      />
      <details className="selected-event__more">
        <summary>About this event</summary>
        {event.description ? (
          <p className="selected-event__description">{event.description}</p>
        ) : null}
        <dl className="selected-event__facts">
          <div>
            <dt>Challenge radius</dt>
            <dd>{formatRadius(event.radiusMetres)} radius</dd>
          </div>
          <div>
            <dt>
              {event.availability === 'upcoming'
                ? 'Starts'
                : event.availability === 'ended'
                  ? 'Ended'
                  : 'Ends'}
            </dt>
            <dd>
              {formatEventTime(
                event.availability === 'upcoming'
                  ? event.startsAt
                  : event.endsAt,
              )}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function KnownEligibility({ state }: { state: EventEligibilityState }) {
  if (state.status === 'reachable') {
    return <span className="event-summary__eligibility">In range</span>;
  }

  if (state.status === 'unreachable') {
    return (
      <span className="event-summary__eligibility event-summary__eligibility--unreachable">
        Out of range
      </span>
    );
  }

  return null;
}

function EligibilityStatus({
  emphasizeDecision,
  eligibilityBusy,
  event,
  locationState,
  onRetryEligibility,
  onStart,
  state,
}: SelectedEventDetailsProps & { emphasizeDecision: boolean }) {
  if (event.availability !== 'active') {
    return (
      <p className="selected-event__status">
        {event.availability === 'upcoming'
          ? 'This event is not open yet.'
          : 'This event has ended.'}
      </p>
    );
  }

  if (state.status === 'reachable') {
    return (
      <div
        aria-live="polite"
        className={`selected-event__status selected-event__status--reachable${emphasizeDecision ? ' selected-event__status--settle' : ''}`}
        role="status"
      >
        <strong>In range</strong>
        <button
          aria-label={`Start challenge for ${event.title}`}
          className="button selected-event__start"
          disabled={eligibilityBusy}
          onClick={() => onStart(event.id)}
          type="button"
        >
          Start challenge
        </button>
      </div>
    );
  }

  if (state.status === 'starting') {
    return (
      <ExplorationLoadingPanel
        className="exploration-loading-panel--inline"
        immediate
        label="Starting challenge…"
      />
    );
  }

  const content = getEligibilityContent(state, locationState);
  const checking =
    state.status === 'checking' ||
    state.status === 'locating' ||
    (state.status === 'idle' &&
      (locationState === 'checking-permission' ||
        locationState === 'locating' ||
        locationState === 'tracking'));
  const canRetry =
    state.status === 'api-error' ||
    state.status === 'authorization-error' ||
    state.status === 'journey-too-fast' ||
    state.status === 'location-stale' ||
    state.status === 'start-error';

  if (checking) {
    return (
      <ExplorationLoadingPanel
        className="exploration-loading-panel--inline"
        description={content.detail}
        immediate
        label={content.title}
      />
    );
  }

  return (
    <div
      aria-live="polite"
      className={`selected-event__status selected-event__status--${state.status}${emphasizeDecision ? ' selected-event__status--settle' : ''}`}
      role="status"
    >
      <strong>{content.title}</strong>
      {content.detail ? <span>{content.detail}</span> : null}
      {canRetry ? (
        <button
          className="button button--quiet"
          disabled={eligibilityBusy}
          onClick={() => onRetryEligibility(event.id)}
          type="button"
        >
          Try again
          <span className="sr-only"> for {event.title}</span>
        </button>
      ) : null}
    </div>
  );
}

function getEligibilityContent(
  state: EventEligibilityState,
  locationState: LocationExperienceState,
): { detail?: string; title: string } {
  switch (state.status) {
    case 'checking':
      return { title: 'Checking range…' };
    case 'event-unavailable':
      return { title: 'This event is unavailable.' };
    case 'location-uncertain':
      return {
        detail: 'Improving location accuracy…',
        title: 'Location accuracy is too low.',
      };
    case 'location-stale':
      return {
        detail: 'Try again to refresh your location and check range.',
        title: 'Location is out of date.',
      };
    case 'journey-too-fast':
      return {
        detail: 'Wait a moment, then try again with a fresh location.',
        title: 'Travel time needs another check.',
      };
    case 'unreachable':
      return {
        detail: 'Move closer. Range is checked again as your location updates.',
        title: 'Out of range',
      };
    case 'api-error':
      return {
        detail: 'Check your connection and try again.',
        title: 'Range could not be checked.',
      };
    case 'authorization-error':
      return {
        detail: 'Try again, or sign out and sign in again.',
        title: 'Your session could not check this event.',
      };
    case 'start-error':
      return {
        detail: 'Try again. Your location will be checked before starting.',
        title: 'The challenge could not start.',
      };
    case 'location-denied':
      return locationContent.denied;
    case 'location-timeout':
      return locationContent.timeout;
    case 'location-unavailable':
      return locationContent.unavailable;
    case 'idle':
    case 'locating':
      return locationContent[locationState];
    case 'reachable':
    case 'starting':
      return { title: '' };
  }
}

const locationContent: Record<
  LocationExperienceState,
  { detail?: string; title: string }
> = {
  blocked: {
    detail: 'Open this page over HTTPS and allow location access.',
    title: 'Live location is not allowed here.',
  },
  'checking-permission': { title: 'Checking location access…' },
  denied: {
    detail: 'Allow location in browser settings, then reload this page.',
    title: 'Live location is disabled.',
  },
  locating: { title: 'Finding your location…' },
  'permission-required': {
    detail: 'Enable live location on the map to check event range.',
    title: 'Live location is off.',
  },
  stale: {
    detail:
      'Retry location on the map. The marker shows your last known location.',
    title: 'Location is out of date.',
  },
  timeout: {
    detail: 'Move to an open area, then retry location on the map.',
    title: 'Location signal timed out.',
  },
  tracking: { title: 'Checking range…' },
  unavailable: {
    detail: 'Check device location services, then retry location on the map.',
    title: 'Location is unavailable.',
  },
  unsupported: {
    detail: 'You can still browse every event in the list.',
    title: 'This browser does not support live location.',
  },
};

function formatEventTime(value: string): string {
  return createAppDateTimeFormatter('en-ZA', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatRadius(radiusMetres: number): string {
  return `${new Intl.NumberFormat('en-ZA').format(radiusMetres)} m`;
}
