import { Link } from 'wouter';

import {
  CollectiblePreviewVisual,
  HeroMapVisual,
  JourneyStageVisual,
  MissionMapVisual,
} from '../components/home/QuestVisuals';
import '../styles/home.css';

export default function HomePage() {
  return (
    <div className="home-page">
      <section aria-labelledby="home-title" className="hero">
        <div className="hero__content">
          <p className="eyebrow">Wits Quest / Campus exploration</p>
          <h1 id="home-title">
            Explore Wits. <span>Begin the quest.</span>
          </h1>
          <p className="lead">
            Discover campus through location-based events, challenges, and a
            growing collection inspired by Wits stories and landmarks.
          </p>
          <div className="hero__actions">
            <a className="button button--link" href="#how-it-works">
              Discover how it works
            </a>
            <Link className="text-link" href="/about">
              About the project
            </Link>
          </div>
          <ul aria-label="Wits Quest product themes" className="hero__signals">
            <li>Map-led</li>
            <li>Location-aware</li>
            <li>Cards to collect</li>
          </ul>
        </div>

        <HeroMapVisual />
      </section>

      <section
        aria-labelledby="journey-title"
        className="quest-journey"
        id="how-it-works"
      >
        <div className="section-introduction">
          <p className="eyebrow">Gameplay preview</p>
          <h2 id="journey-title">A campus journey with purpose</h2>
          <p>
            Wits Quest is being built around a clear loop: explore the campus,
            discover a challenge, and grow a meaningful collection.
          </p>
        </div>

        <ol className="journey-stages">
          <li className="journey-stage">
            <span className="journey-stage__number">01</span>
            <JourneyStageVisual stage="explore" />
            <h3>Explore</h3>
            <p>
              Browse campus events on a map or through the accessible event
              list.
            </p>
          </li>
          <li className="journey-stage">
            <span className="journey-stage__number">02</span>
            <JourneyStageVisual stage="discover" />
            <h3>Discover</h3>
            <p>
              Reach an event and request an API-evaluated location check before
              its challenge.
            </p>
          </li>
          <li className="journey-stage">
            <span className="journey-stage__number">03</span>
            <JourneyStageVisual stage="collect" />
            <h3>Collect</h3>
            <p>
              Successful challenges will unlock cards connected to Wits stories
              and landmarks.
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="mission-title" className="mission-preview">
        <div className="mission-preview__map">
          <div className="mission-preview__map-label">
            <span>Campus map</span>
            <span>Static interface preview</span>
          </div>
          <MissionMapVisual />
          <div className="mission-preview__legend" aria-hidden="true">
            <span>
              <i className="legend-dot legend-dot--blue" />
              Your location
            </span>
            <span>
              <i className="legend-dot legend-dot--gold" />
              Campus event
            </span>
          </div>
        </div>

        <div className="mission-preview__content">
          <p className="eyebrow">Sprint 1 experience preview</p>
          <h2 id="mission-title">The campus map comes first</h2>
          <p className="mission-preview__summary">
            The first playable slice will pair a campus event map with the same
            essential information in text. The API remains authoritative for
            reachability.
          </p>

          <div
            className="event-preview"
            aria-label="Example campus event status"
          >
            <div className="event-preview__heading">
              <div>
                <span className="event-preview__label">Campus event</span>
                <h3>Sprint 1 event preview</h3>
              </div>
              <span className="status-badge status-badge--info">Preview</span>
            </div>
            <dl className="event-preview__details">
              <div>
                <dt>Location status</dt>
                <dd>
                  <span className="technical-signal" />
                  Awaiting location
                </dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>Shown after a location check</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="collection-title"
        className="collection-section"
      >
        <div className="collection-section__content">
          <p className="eyebrow">Collection preview / Future gameplay</p>
          <h2 id="collection-title">
            Build a collection with a sense of place
          </h2>
          <p>
            Collectible cards are planned as lasting records of completed campus
            challenges. These generic structures show the intended visual
            language, not production card content.
          </p>
          <ul className="collection-section__principles">
            <li>Earned through campus challenges</li>
            <li>Connected to Wits stories and landmarks</li>
            <li>Designed for later card gameplay</li>
          </ul>
        </div>
        <CollectiblePreviewVisual />
      </section>

      <section aria-labelledby="project-title" className="project-context">
        <div>
          <p className="eyebrow">Wits World / Sprint 1</p>
          <h2 id="project-title">A focused foundation for the full quest</h2>
        </div>
        <div className="project-context__copy">
          <p>
            Sprint 1 prioritises an authenticated player, a campus map, browser
            location, one seeded event, and a clear API-evaluated eligibility
            result.
          </p>
          <Link className="text-link text-link--arrow" href="/about">
            Read about Wits Quest
          </Link>
        </div>
      </section>
    </div>
  );
}
