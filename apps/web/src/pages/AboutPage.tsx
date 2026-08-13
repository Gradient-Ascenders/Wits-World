export default function AboutPage() {
  return (
    <article className="content-page">
      <p className="eyebrow">The player experience</p>
      <h1>About Wits World</h1>
      <p className="lead">
        Wits World is the project developing Wits Quest, our location-based
        campus exploration game.
      </p>
      <p>
        The Sprint 1 foundation supports authenticated event discovery on a
        campus map, with the same event information available in an accessible
        text list.
      </p>
      <p>
        Players can request a browser location reading and receive an
        API-evaluated reachability result for an active event. Challenges,
        cards, and battles remain outside the current player experience.
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
