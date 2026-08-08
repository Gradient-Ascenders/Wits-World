import type { PlayerEventAvailability } from '../../api/events';

export interface EventPresentation {
  availability: PlayerEventAvailability;
  id: string;
  latitude: number;
  longitude: number;
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
  | { status: 'locating' }
  | { status: 'location-denied' }
  | { status: 'location-stale' }
  | { status: 'location-timeout' }
  | { status: 'location-uncertain' }
  | { status: 'location-unavailable' }
  | { status: 'reachable' }
  | { status: 'unreachable' };

interface EventListProps {
  discovery: EventDiscoveryState;
  eligibility: Readonly<Record<string, EventEligibilityState | undefined>>;
  eligibilityBusy: boolean;
  onCheckEligibility: (eventId: string) => void;
  onRetry: () => void;
}

const availabilityLabels: Record<PlayerEventAvailability, string> = {
  active: 'Available now',
  ended: 'Ended',
  upcoming: 'Upcoming',
};

export function EventList({
  discovery,
  eligibility,
  eligibilityBusy,
  onCheckEligibility,
  onRetry,
}: EventListProps) {
  return (
    <section aria-labelledby="nearby-events-title" className="event-list">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Map-independent discovery</p>
          <h2 id="nearby-events-title">Nearby events</h2>
        </div>
      </div>

      {discovery.status === 'loading' ? (
        <p aria-live="polite" className="event-list__state" role="status">
          Loading published events…
        </p>
      ) : null}

      {discovery.status === 'error' ? (
        <div className="event-list__state" role="alert">
          <strong>Events are unavailable right now.</strong>
          <p>{discovery.message}</p>
          <button className="button" onClick={onRetry} type="button">
            Try loading events again
          </button>
        </div>
      ) : null}

      {discovery.status === 'empty' ? (
        <div className="event-list__state">
          <strong>No published events are available.</strong>
          <p>Check again later.</p>
        </div>
      ) : null}

      {discovery.status === 'ready' ? (
        <ul className="event-list__items">
          {discovery.events.map((event) => (
            <li className="event-summary" key={event.id}>
              <div className="event-summary__heading">
                <h3>{event.title}</h3>
                <span
                  className={`status-badge status-badge--${event.availability}`}
                >
                  {availabilityLabels[event.availability]}
                </span>
              </div>
              {event.availability === 'active' ? (
                <EligibilityStatus
                  eventId={event.id}
                  eventTitle={event.title}
                  isAnyCheckBusy={eligibilityBusy}
                  onCheck={onCheckEligibility}
                  state={eligibility[event.id] ?? { status: 'idle' }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface EligibilityStatusProps {
  eventId: string;
  eventTitle: string;
  isAnyCheckBusy: boolean;
  onCheck: (eventId: string) => void;
  state: EventEligibilityState;
}

const eligibilityMessages: Record<
  Exclude<EventEligibilityState['status'], 'checking' | 'idle' | 'locating'>,
  { message: string; title: string }
> = {
  'api-error': {
    message: 'Check your connection and try again.',
    title: 'Reachability could not be checked.',
  },
  'authorization-error': {
    message: 'Try again, or sign out and sign in again.',
    title: 'Your session could not check this event.',
  },
  'event-unavailable': {
    message: 'Its availability may have changed since the event list loaded.',
    title: 'This event is not available right now.',
  },
  'location-denied': {
    message:
      'Allow location access in your browser settings, then try again. You can still browse events without sharing your location.',
    title: 'Location permission was denied.',
  },
  'location-stale': {
    message: 'Request a fresh location reading and try again.',
    title: 'That location reading could not be used.',
  },
  'location-timeout': {
    message: 'Move to an open area if possible, then try again.',
    title: 'Getting your location took too long.',
  },
  'location-uncertain': {
    message: 'Move to an open area if possible and request a new reading.',
    title: 'Your location is too uncertain to decide reachability.',
  },
  'location-unavailable': {
    message:
      'Check that location services are available on this device, then try again.',
    title: 'Your browser could not provide a usable location.',
  },
  reachable: {
    message: 'You may continue exploring without continuous location tracking.',
    title: 'This event is reachable from your reported location.',
  },
  unreachable: {
    message: 'Move closer to the event and check again when you are ready.',
    title: 'This event is not reachable from your reported location.',
  },
};

function EligibilityStatus({
  eventId,
  eventTitle,
  isAnyCheckBusy,
  onCheck,
  state,
}: EligibilityStatusProps) {
  if (state.status === 'idle') {
    return (
      <div className="eligibility-status">
        <p>
          Check whether this event is reachable from your reported location.
        </p>
        <button
          aria-label={`Check reachability for ${eventTitle}`}
          className="button"
          disabled={isAnyCheckBusy}
          onClick={() => onCheck(eventId)}
          type="button"
        >
          Check reachability
        </button>
      </div>
    );
  }

  if (state.status === 'locating' || state.status === 'checking') {
    return (
      <div
        aria-live="polite"
        className="eligibility-status eligibility-status--loading"
        role="status"
      >
        <strong>
          {state.status === 'locating'
            ? 'Requesting your location…'
            : 'Checking reachability…'}
        </strong>
        <p>Keep this page open while the check finishes.</p>
      </div>
    );
  }

  const content = eligibilityMessages[state.status];
  const isOutcome =
    state.status === 'reachable' || state.status === 'unreachable';

  return (
    <div
      aria-live={isOutcome ? 'polite' : undefined}
      className={`eligibility-status eligibility-status--${state.status}`}
      role={isOutcome ? 'status' : 'alert'}
    >
      <strong>{content.title}</strong>
      <p>{content.message}</p>
      <button
        aria-label={`Check reachability again for ${eventTitle}`}
        className="button button--quiet"
        disabled={isAnyCheckBusy}
        onClick={() => onCheck(eventId)}
        type="button"
      >
        Check again
      </button>
    </div>
  );
}
