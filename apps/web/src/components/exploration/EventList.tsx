export interface EventPresentation {
  availability: string;
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

interface EventListProps {
  discovery: EventDiscoveryState;
}

export function EventList({ discovery }: EventListProps) {
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
              <div>
                <h3>{event.title}</h3>
                <p>{event.availability}</p>
              </div>
              <span className="status-badge status-badge--info">
                Published event
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
