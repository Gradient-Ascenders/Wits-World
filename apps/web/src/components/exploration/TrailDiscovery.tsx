import { StateIcon } from '../StatusMessage';
import { ExplorationLoadingPanel } from './ExplorationLoadingPanel';
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
    return <ExplorationLoadingPanel label="Loading trails…" />;
  }

  if (state.status === 'error') {
    return (
      <DiscoveryError
        action="Retry trails"
        detail={
          state.failure === 'authorization'
            ? 'Try again. If this continues, sign out and sign in again.'
            : 'Check your connection and try again.'
        }
        onRetry={onRetry}
        title="Trails could not load."
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="event-list__state">
        <strong>No trails available.</strong>
        <p>Check back later.</p>
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
        <ExplorationLoadingPanel
          className="exploration-loading-panel--inline"
          label="Loading trail…"
        />
      </article>
    );
  }

  if (state.status === 'error') {
    return (
      <article className="trail-detail trail-detail--state">
        <h2 tabIndex={-1}>Trail unavailable</h2>
        <DiscoveryError
          action="Retry trail"
          detail={
            state.failure === 'not-found'
              ? 'This trail may have been retired or removed.'
              : state.failure === 'authorization'
                ? 'Try again. If this continues, sign out and sign in again.'
                : 'Check your connection and try again.'
          }
          onRetry={onRetry}
          title="This trail could not load."
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
    return <ExplorationLoadingPanel label="Finding nearby unvisited events…" />;
  }

  if (state.status === 'error') {
    return (
      <DiscoveryError
        action={
          state.failure === 'location-retry'
            ? 'Refresh location'
            : 'Retry nearby search'
        }
        detail={
          state.failure === 'authorization'
            ? 'Try again. If this continues, sign out and sign in again.'
            : state.failure === 'location-retry'
              ? 'Your location is out of date or not accurate enough. Refresh it to search again.'
              : 'Check your connection and try again.'
        }
        onRetry={onRetry}
        title="Nearby events could not load."
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="event-list__state">
        <strong>No nearby unvisited events.</strong>
        <p>
          No active, unvisited events within about 1 km of your last location.
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
        Unvisited events open now, within about 1 km of your last location.
      </p>
      <ul aria-label="Nearby unvisited events" className="nearby-list">
        {state.events.map((event) => (
          <li className="nearby-event" key={event.eventId}>
            <span aria-hidden="true" className="nearby-event__marker">
              <MapPin aria-hidden="true" size={20} />
            </span>
            <div className="nearby-event__copy">
              <h3>{event.title}</h3>
              <p>{formatDistance(event.distanceMetres)}</p>
              {event.trailContexts.map((context) => (
                <span className="nearby-event__trail" key={context.trailId}>
                  {context.title} · Stop {context.position} of{' '}
                  {context.totalSteps}
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
  const checking = ['checking-permission', 'locating', 'tracking'].includes(
    locationState,
  );

  if (checking) {
    return (
      <ExplorationLoadingPanel
        description={content.detail}
        label={content.title}
      />
    );
  }

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
      'Open this page over HTTPS and allow location access. You can still browse Events and Trails.',
    title: 'Live location is not allowed here.',
  },
  'checking-permission': {
    detail: 'You can browse all events and trails while this finishes.',
    title: 'Checking location access…',
  },
  denied: {
    detail: 'Allow location in browser settings, or browse Events and Trails.',
    title: 'Location permission is denied.',
  },
  locating: {
    detail: 'Nearby events will appear once your location is available.',
    title: 'Finding your location…',
  },
  'permission-required': {
    detail:
      'Use your location to find nearby events. It is not saved as trail history.',
    title: 'Enable location to search nearby.',
  },
  stale: {
    detail: 'Refresh your location to update nearby events.',
    title: 'Location is out of date.',
  },
  timeout: {
    detail: 'Move to an open area and retry.',
    title: 'The location signal timed out.',
  },
  tracking: {
    detail: 'Searching from your latest location.',
    title: 'Finding nearby events…',
  },
  unavailable: {
    detail: 'Check device location services and try again.',
    title: 'Location is unavailable.',
  },
  unsupported: {
    detail: 'You can still browse Events and Trails.',
    title: 'This browser cannot share your location.',
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
