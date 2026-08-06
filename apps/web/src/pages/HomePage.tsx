import { Link } from 'wouter';

export default function HomePage() {
  return (
    <div className="home-page">
      <section aria-labelledby="home-title" className="hero">
        <div>
          <p className="eyebrow">Campus exploration</p>
          <h1 id="home-title">Explore with Wits Quest</h1>
          <p className="lead">
            This mobile-first foundation is ready for the map, location, and
            event-status work planned for Sprint 1.
          </p>
          <Link className="button button--link" href="/about">
            Learn about Wits Quest
          </Link>
        </div>

        <aside aria-labelledby="foundation-title" className="information-panel">
          <h2 id="foundation-title">Current foundation</h2>
          <ul>
            <li>Mobile and desktop application shell</li>
            <li>Keyboard-accessible navigation</li>
            <li>Clear loading and error states</li>
          </ul>
          <p>
            The campus map and live event information are not included in this
            scaffold.
          </p>
        </aside>
      </section>
    </div>
  );
}
