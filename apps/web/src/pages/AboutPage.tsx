export default function AboutPage() {
  return (
    <article className="content-page">
      <p className="eyebrow">The player experience</p>
      <h1>About Wits Quest</h1>
      <p className="lead">
        Wits Quest is the location-based campus exploration game being developed
        by the Wits World project.
      </p>
      <p>
        The Sprint 1 foundation will support a campus map, browser location
        requests, nearby events, and clear explanations of whether an event is
        reachable.
      </p>
      <p>
        This initial application shell does not yet include the map,
        authentication, event data, challenges, cards, or battles.
      </p>
      <hr />
      <h2>Designed for clear decisions</h2>
      <p>
        The player interface prioritises readable event status, large touch
        targets, keyboard access, and a text alternative to map-only
        information.
      </p>
    </article>
  );
}
