import { StateIcon } from '../StatusMessage';
import { LoadingState } from '../LoadingState';
import {
  Archive,
  ArrowCircleRight,
  CheckCircle,
  Lock,
  MapPin,
  WarningCircle,
} from '@phosphor-icons/react';
import type {
  NearbyUnvisitedEvent,
  PlayerTrail,
  PlayerTrailSummary,
  PlayerTrailUnavailableReason,
  TrailDiscoveryFailure,
} from '../../api/trails';
import type { LocationExperienceState } from './EventList';

export type TrailListState =
  | { status: 'empty' }
  | { failure: TrailDiscoveryFailure; status: 'error' }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; trails: readonly PlayerTrailSummary[] };

export type TrailDetailState =
  | {
      failure: TrailDiscoveryFailure;
      status: 'error';
      trailId: string;
    }
  | { status: 'idle' }
  | { status: 'loading'; trailId: string }
  | { status: 'ready'; trail: PlayerTrail };

export type NearbyDiscoveryState =
  | { status: 'empty' }
  | {
      failure: 'authorization' | 'location-retry' | 'unavailable';
      status: 'error';
    }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'waiting-location' }
  | { events: readonly NearbyUnvisitedEvent[]; status: 'ready' };

interface TrailListProps {
  onOpenTrail: (trailId: string) => void;
  onRetry: () => void;
  state: TrailListState;
}

export function TrailList({ onOpenTrail, onRetry, state }: TrailListProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <LoadingState label="Loading trails and progress…" />;
  }

  if (state.status === 'error') {
    return (
      <DiscoveryError
        action="Try loading trails again"
        detail={
          state.failure === 'authorization'
            ? 'Your session could not load trail progress. Try again, or sign out and sign in again.'
            : 'Check your connection and try again.'
        }
        onRetry={onRetry}
        title="Trails are unavailable right now."
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="event-list__state">
        <strong>No trails are available yet.</strong>
        <p>Published campus trails will appear here.</p>
      </div>
    );
  }

  return (
    <ul aria-label="Campus trails" className="trail-list">
      {state.trails.map((trail) => {
        const status = trailSummaryStatus(trail);
        return (
          <li className="trail-summary" key={trail.trailId}>
            <div className="trail-summary__heading">
              <h3>{trail.title}</h3>
              <strong
                aria-label={`${trail.completedStepCount} of ${trail.totalSteps} steps completed`}
              >
                {trail.completedStepCount}/{trail.totalSteps}
              </strong>
            </div>
            {trail.description ? (
              <p className="trail-summary__description">{trail.description}</p>
            ) : null}
            <div className="trail-summary__progress">
              <progress
                aria-label={`Progress for ${trail.title}`}
                max={trail.totalSteps}
                value={trail.completedStepCount}
              />
              <span className={`trail-status trail-status--${status.tone}`}>
                <TrailStatusIcon name={status.icon} />
                {status.label}
              </span>
            </div>
            <button
              className="button button--quiet trail-summary__action"
              onClick={() => onOpenTrail(trail.trailId)}
              type="button"
            >
              View trail
              <span className="sr-only">: {trail.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface TrailDetailProps {
  onOpenEvent: (eventId: string) => void;
  onRetry: () => void;
  state: TrailDetailState;
}

export function TrailDetail({ onOpenEvent, onRetry, state }: TrailDetailProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <article className="trail-detail trail-detail--state">
        <h2 tabIndex={-1}>Trail details</h2>
        <LoadingState label="Loading ordered trail…" />
      </article>
    );
  }

  if (state.status === 'error') {
    return (
      <article className="trail-detail trail-detail--state">
        <h2 tabIndex={-1}>Trail unavailable</h2>
        <DiscoveryError
          action="Try loading this trail again"
          detail={
            state.failure === 'not-found'
              ? 'This trail may have been retired or is no longer visible.'
              : state.failure === 'authorization'
                ? 'Your session could not load this trail. Try again, or sign out and sign in again.'
                : 'Check your connection and try again.'
          }
          onRetry={onRetry}
          title="This trail is unavailable right now."
        />
      </article>
    );
  }

  const { trail } = state;
  const currentStep = trail.steps.find((step) => step.state === 'current');

  return (
    <article className="trail-detail">
      <header className="trail-detail__header">
        <h2 tabIndex={-1}>{trail.title}</h2>
        <div className="trail-detail__progress-row">
          <p className="trail-detail__progress" role="status">
            {trail.completedStepCount} of {trail.totalSteps} completed
          </p>
          {trail.progressStatus === 'completed' ? (
            <TrailStatusIcon
              className="trail-detail__complete-icon"
              name="completed"
            />
          ) : null}
        </div>
        <progress
          aria-label={`Progress for ${trail.title}`}
          max={trail.totalSteps}
          value={trail.completedStepCount}
        />
        {currentStep ? (
          <p className="trail-detail__next-stop">
            <span>Next stop:</span> <strong>{currentStep.title}</strong>
          </p>
        ) : trail.progressStatus === 'completed' ? (
          <div className="trail-detail__complete" role="status">
            <strong>Trail complete</strong>
            <span>Every stop in this trail has been completed.</span>
          </div>
        ) : null}
        {trail.description ? <p>{trail.description}</p> : null}
      </header>

      {trail.progressStatus === 'retired' ? (
        <div className="trail-notice" role="status">
          <strong>This trail has retired.</strong>
          <span>Your completed stops remain part of your history.</span>
        </div>
      ) : trail.availability === 'upcoming' ||
        trail.availability === 'ended' ? (
        <div className="trail-notice" role="status">
          <strong>
            {trail.availability === 'upcoming'
              ? 'This trail is not open yet.'
              : 'This trail is no longer active.'}
          </strong>
          <span>The ordered stops remain visible for context.</span>
        </div>
      ) : null}

      <ol
        aria-label={`Ordered stops for ${trail.title}`}
        className="trail-steps"
      >
        {trail.steps.map((step) => {
          const presentation = trailStepPresentation(
            step.state,
            step.unavailableReason,
          );
          return (
            <li
              className={`trail-step trail-step--${step.state}`}
              key={`${step.position}-${step.eventId}`}
            >
              <span aria-hidden="true" className="trail-step__icon">
                <TrailStatusIcon name={presentation.icon} />
              </span>
              <div className="trail-step__copy">
                <strong>
                  <span className="sr-only">Stop </span>
                  {step.position}. {step.title}
                </strong>
                {step.description ? <p>{step.description}</p> : null}
                {presentation.guidance ? (
                  <p className="trail-step__guidance">
                    {presentation.guidance}
                  </p>
                ) : null}
              </div>
              <span
                className={`trail-step__status trail-step__status--${presentation.tone}`}
              >
                {presentation.label}
              </span>
              {step.state === 'current' ? (
                <div className="trail-step__current-action">
                  <span>Next stop</span>
                  <button
                    className="button trail-step__action"
                    data-event-id={step.eventId}
                    onClick={() => onOpenEvent(step.eventId)}
                    type="button"
                  >
                    Open event
                    <TrailStatusIcon name="open" />
                    <span className="sr-only">: {step.title}</span>
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

interface NearbyListProps {
  locationState: LocationExperienceState;
  onEnableLocation: () => void;
  onOpenEvent: (eventId: string) => void;
  onRetry: () => void;
  state: NearbyDiscoveryState;
}

export function NearbyList({
  locationState,
  onEnableLocation,
  onOpenEvent,
  onRetry,
  state,
}: NearbyListProps) {
  if (
    state.status === 'idle' ||
    state.status === 'waiting-location' ||
    (state.status === 'loading' && locationState !== 'tracking')
  ) {
    return (
      <NearbyLocationState
        locationState={locationState}
        onEnableLocation={onEnableLocation}
      />
    );
  }

  if (state.status === 'loading') {
    return (
      <p aria-live="polite" className="event-list__state" role="status">
        Finding nearby unvisited events…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <DiscoveryError
        action={
          state.failure === 'location-retry'
            ? 'Get a new reported location'
            : 'Try nearby search again'
        }
        detail={
          state.failure === 'authorization'
            ? 'Your session could not search nearby events. Try again, or sign out and sign in again.'
            : state.failure === 'location-retry'
              ? 'The reported location was too old or not accurate enough for this search.'
              : 'Check your connection and try again.'
        }
        onRetry={onRetry}
        title="Nearby events could not be loaded."
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="event-list__state">
        <strong>No nearby unvisited events.</strong>
        <p>
          You have explored everything active within about 1 km, or there are no
          events nearby right now.
        </p>
        <button
          className="button button--quiet"
          onClick={onRetry}
          type="button"
        >
          Refresh nearby
        </button>
      </div>
    );
  }

  return (
    <div className="nearby-discovery">
      <p className="nearby-discovery__context">
        Active, unvisited events within about 1 km of your last reported
        location.
      </p>
      <ul aria-label="Nearby unvisited events" className="nearby-list">
        {state.events.map((event) => (
          <li className="nearby-event" key={event.eventId}>
            <span aria-hidden="true" className="nearby-event__marker">
              ⌖
            </span>
            <div className="nearby-event__copy">
              <h3>{event.title}</h3>
              <p>{formatDistance(event.distanceMetres)} · Unvisited</p>
              {event.trailContexts.map((context) => (
                <span className="nearby-event__trail" key={context.trailId}>
                  Current stop {context.position} of {context.totalSteps} on{' '}
                  {context.title}
                </span>
              ))}
            </div>
            <button
              className="button button--quiet nearby-event__action"
              data-event-id={event.eventId}
              onClick={() => onOpenEvent(event.eventId)}
              type="button"
            >
              View event
              <span className="sr-only">: {event.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        className="button button--quiet nearby-discovery__refresh"
        onClick={onRetry}
        type="button"
      >
        Refresh nearby
      </button>
    </div>
  );
}

function NearbyLocationState({
  locationState,
  onEnableLocation,
}: {
  locationState: LocationExperienceState;
  onEnableLocation: () => void;
}) {
  const content = nearbyLocationContent[locationState];
  const canEnable =
    locationState === 'denied' ||
    locationState === 'permission-required' ||
    locationState === 'stale' ||
    locationState === 'timeout' ||
    locationState === 'unavailable';

  return (
    <div
      aria-live="polite"
      className="event-list__state nearby-location-state"
      role="status"
    >
      <strong>{content.title}</strong>
      <p>{content.detail}</p>
      {canEnable ? (
        <button className="button" onClick={onEnableLocation} type="button">
          {locationState === 'permission-required'
            ? 'Enable location'
            : 'Retry location'}
        </button>
      ) : null}
    </div>
  );
}

const nearbyLocationContent: Record<
  LocationExperienceState,
  { detail: string; title: string }
> = {
  blocked: {
    detail:
      'Use a secure, permitted browser context. You can still browse all events and trails.',
    title: 'Live location is not allowed here.',
  },
  'checking-permission': {
    detail: 'You can browse all events and trails while this finishes.',
    title: 'Checking location access…',
  },
  denied: {
    detail:
      'Enable location in browser settings to find nearby unvisited events. All events and trails remain available without the map.',
    title: 'Location permission is denied.',
  },
  locating: {
    detail:
      'Nearby search will start when a usable reported location is available.',
    title: 'Finding your reported location…',
  },
  'permission-required': {
    detail:
      'Share a one-time reported location with the nearby search. Wits World does not store it as trail history.',
    title: 'Location is needed for nearby discovery.',
  },
  stale: {
    detail: 'Get a fresh reported location to update nearby results.',
    title: 'Your reported location is no longer current.',
  },
  timeout: {
    detail: 'Move to an open area and try the location request again.',
    title: 'The location signal timed out.',
  },
  tracking: {
    detail: 'Nearby search will use the latest reported location.',
    title: 'Preparing nearby discovery…',
  },
  unavailable: {
    detail: 'Check device location services and try again.',
    title: 'A usable reported location is unavailable.',
  },
  unsupported: {
    detail:
      'This browser cannot provide a reported location. All events and trails remain available without the map.',
    title: 'Nearby discovery is unavailable in this browser.',
  },
};

function DiscoveryError({
  action,
  detail,
  onRetry,
  title,
}: {
  action: string;
  detail: string;
  onRetry: () => void;
  title: string;
}) {
  return (
    <div
      className="event-list__state state-message state-message--error"
      role="alert"
    >
      <StateIcon tone="error" />
      <strong>{title}</strong>
      <p>{detail}</p>
      <button className="button" onClick={onRetry} type="button">
        {action}
      </button>
    </div>
  );
}

function trailSummaryStatus(trail: PlayerTrailSummary): {
  icon: TrailStatusIconName;
  label: string;
  tone: 'complete' | 'current' | 'muted' | 'warning';
} {
  if (trail.progressStatus === 'completed') {
    return { icon: 'completed', label: 'Completed', tone: 'complete' };
  }

  if (trail.progressStatus === 'retired' || trail.availability === 'retired') {
    return { icon: 'retired', label: 'Retired', tone: 'muted' };
  }

  if (trail.availability === 'upcoming') {
    return { icon: 'unavailable', label: 'Upcoming', tone: 'warning' };
  }

  if (trail.availability === 'ended') {
    return { icon: 'unavailable', label: 'Ended', tone: 'muted' };
  }

  return {
    icon: 'current',
    label: `Stop ${trail.currentStepPosition ?? trail.completedStepCount + 1} next`,
    tone: 'current',
  };
}

function trailStepPresentation(
  state: PlayerTrail['steps'][number]['state'],
  reason: PlayerTrailUnavailableReason | null,
): {
  guidance: string | null;
  icon: TrailStatusIconName;
  label: string;
  tone: 'completed' | 'current' | 'locked' | 'retired' | 'unavailable';
} {
  if (state === 'completed') {
    return {
      guidance: null,
      icon: 'completed',
      label: 'Completed',
      tone: 'completed',
    };
  }
  if (state === 'current') {
    return {
      guidance: null,
      icon: 'current',
      label: 'Current',
      tone: 'current',
    };
  }
  if (state === 'locked') {
    return {
      guidance: 'Complete the previous stop to unlock.',
      icon: 'locked',
      label: 'Locked',
      tone: 'locked',
    };
  }

  switch (reason) {
    case 'upcoming':
      return {
        guidance: 'This stop is not open yet.',
        icon: 'unavailable',
        label: 'Unavailable',
        tone: 'unavailable',
      };
    case 'ended':
      return {
        guidance: 'This stop is no longer available.',
        icon: 'unavailable',
        label: 'Unavailable',
        tone: 'unavailable',
      };
    case 'event_retired':
      return {
        guidance: 'This event has retired and cannot be opened.',
        icon: 'retired',
        label: 'Retired',
        tone: 'retired',
      };
    case 'trail_retired':
      return {
        guidance: 'This trail has retired; completed stops remain visible.',
        icon: 'retired',
        label: 'Retired',
        tone: 'retired',
      };
    case 'event_unavailable':
    case null:
      return {
        guidance: 'This stop is temporarily unavailable.',
        icon: 'unavailable',
        label: 'Unavailable',
        tone: 'unavailable',
      };
  }
}

type TrailStatusIconName =
  'completed' | 'current' | 'locked' | 'open' | 'retired' | 'unavailable';

function TrailStatusIcon({
  className,
  name,
}: {
  className?: string;
  name: TrailStatusIconName;
}) {
  const Icon = {
    completed: CheckCircle,
    current: MapPin,
    locked: Lock,
    open: ArrowCircleRight,
    retired: Archive,
    unavailable: WarningCircle,
  }[name];
  return <Icon aria-hidden="true" className={className} size={20} />;
}

function formatDistance(distanceMetres: number): string {
  if (distanceMetres >= 1_000) {
    return `~${(distanceMetres / 1_000).toLocaleString('en-ZA', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })} km away`;
  }

  return `~${Math.max(0, Math.round(distanceMetres)).toLocaleString('en-ZA')} m away`;
}
