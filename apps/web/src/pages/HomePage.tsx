import { Link } from 'wouter';

export default function HomePage() {
  return (
    <div className="home-page">
      <section aria-labelledby="home-title" className="hero">
        <div className="hero__content">
          <p className="eyebrow">Campus exploration, thoughtfully designed</p>
          <h1 id="home-title">Explore campus through Wits Quest</h1>
          <p className="lead">
            Discover location-based events through a player experience built for
            quick decisions, clear status information, and small screens.
          </p>
          <Link className="button button--link" href="/about">
            How Wits Quest works
          </Link>
        </div>

        <aside aria-labelledby="foundation-title" className="information-panel">
          <p className="information-panel__label">Sprint 1 player journey</p>
          <h2 id="foundation-title">The campus map comes first</h2>
          <p>
            The first playable slice will present one campus event on a map and
            in an accessible text list, with clear loading and failure states.
          </p>
          <div aria-hidden="true" className="orbital-visual">
            <span className="orbital-visual__orbit orbital-visual__orbit--one" />
            <span className="orbital-visual__orbit orbital-visual__orbit--two" />
            <span className="orbital-visual__signal" />
          </div>
        </aside>
      </section>
    </div>
  );
}
