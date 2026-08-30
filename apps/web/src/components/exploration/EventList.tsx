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
  | { status: 'empty' }
  | { message: string; status: 'error' }
  | { status: 'loading' }
  | { events: readonly EventPresentation[]; status: 'ready' };

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
    return (
      <p aria-live="polite" className="event-list__state" role="status">
        Loading published events…
      </p>
    );
  }

  if (discovery.status === 'error') {
    return (
      <div className="event-list__state" role="alert">
        <strong>Events are unavailable right now.</strong>
        <p>{discovery.message}</p>
        <button className="button" onClick={onRetry} type="button">
          Try loading events again
        </button>
      </div>
    );
  }

  if (discovery.status === 'empty') {
    return (
      <div className="event-list__state">
        <strong>No published events are available.</strong>
        <p>Check again later.</p>
      </div>
    );
  }

  return (
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
  return (
    <div className="selected-event">
      <div className="selected-event__heading">
        <span className={`status-badge status-badge--${event.availability}`}>
          {availabilityLabels[event.availability]}
        </span>
        <h2 tabIndex={-1}>{event.title}</h2>
      </div>

      {event.description ? (
        <p className="selected-event__description">{event.description}</p>
      ) : null}

      <dl className="selected-event__facts">
        <div>
          <dt>Event interaction area</dt>
          <dd>{formatRadius(event.radiusMetres)} radius</dd>
        </div>
        <div>
          <dt>{event.availability === 'upcoming' ? 'Starts' : 'Ends'}</dt>
          <dd>
            {formatEventTime(
              event.availability === 'upcoming' ? event.startsAt : event.endsAt,
            )}
          </dd>
        </div>
      </dl>

      <EligibilityStatus
        eligibilityBusy={eligibilityBusy}
        event={event}
        locationState={locationState}
        onRetryEligibility={onRetryEligibility}
        onStart={onStart}
        state={state}
      />
    </div>
  );
}

function KnownEligibility({ state }: { state: EventEligibilityState }) {
  if (state.status === 'reachable') {
    return <span className="event-summary__eligibility">In range</span>;
  }

  if (state.status === 'unreachable') {
    return <span className="event-summary__eligibility">Out of range</span>;
  }

  return null;
}

function EligibilityStatus({
  eligibilityBusy,
  event,
  locationState,
  onRetryEligibility,
  onStart,
  state,
}: SelectedEventDetailsProps) {
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
        className="selected-event__status selected-event__status--reachable"
        role="status"
      >
        <strong>In range</strong>
        <span>Confirmed by Wits World for this reported location.</span>
        <button
          aria-label={`Start challenge for ${event.title}`}
          className="button"
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
      <div aria-live="polite" className="selected-event__status" role="status">
        <strong>Starting challenge…</strong>
        <span>Wits World is checking your latest reported location again.</span>
      </div>
    );
  }

  const content = getEligibilityContent(state, locationState);
  const canRetry =
    state.status === 'api-error' ||
    state.status === 'authorization-error' ||
    state.status === 'journey-too-fast' ||
    state.status === 'location-stale' ||
    state.status === 'start-error';

  return (
    <div
      aria-live="polite"
      className={`selected-event__status selected-event__status--${state.status}`}
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
        detail: 'Waiting for a better reported-location reading…',
        title: 'Location accuracy is too low.',
      };
    case 'location-stale':
      return {
        detail: 'A newer reading is needed before Wits World can decide.',
        title: 'Reported location needs refreshing.',
      };
    case 'journey-too-fast':
      return {
        detail:
          'This event cannot be confirmed from recent reported-location activity yet. Wait briefly, then try again with a fresh reading.',
        title: 'Travel time needs another check.',
      };
    case 'unreachable':
      return {
        detail: 'Move closer and live location will check again.',
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
        detail: 'Your previous range result was not used as authorization.',
        title: 'The challenge could not start.',
      };
    case 'location-denied':
      return { title: 'Live location is disabled.' };
    case 'location-timeout':
      return { title: 'Location signal timed out.' };
    case 'location-unavailable':
      return { title: 'Reported location is unavailable.' };
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
    detail: 'Use a secure page and check browser Permissions Policy settings.',
    title: 'Live location is not allowed here.',
  },
  'checking-permission': { title: 'Checking location access…' },
  denied: {
    detail: 'Enable it in browser settings to check event range.',
    title: 'Live location is disabled.',
  },
  locating: { title: 'Finding your reported location…' },
  'permission-required': { title: 'Live location is off.' },
  stale: {
    detail: 'The last marker remains visible while you retry.',
    title: 'Reported location is unavailable.',
  },
  timeout: {
    detail: 'Move to an open area and retry when ready.',
    title: 'Location signal timed out.',
  },
  tracking: { title: 'Checking range…' },
  unavailable: {
    detail: 'Check device location services and retry.',
    title: 'Reported location is unavailable.',
  },
  unsupported: {
    detail: 'You can still browse every event in the list.',
    title: 'This browser does not support live location.',
  },
};

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatRadius(radiusMetres: number): string {
  return `${new Intl.NumberFormat('en-ZA').format(radiusMetres)} m`;
}
