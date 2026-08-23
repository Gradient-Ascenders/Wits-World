import { useEffect, useRef, type CSSProperties } from 'react';

import greatHallHeroWebp from '../assets/home/great-hall-hero.webp';
import { AuthAwareCta } from '../components/auth/AuthAwareCta';
import { CampusSeal } from '../components/branding/CampusSeal';
import {
  JourneyStageVisual,
  QuestProgressionVisual,
} from '../components/home/QuestVisuals';
import '../styles/home.css';

const gameplaySteps = [
  {
    description: 'Find events around Wits.',
    name: 'Explore',
    stage: 'explore',
  },
  {
    description: 'Take on the challenge at each event.',
    name: 'Complete',
    stage: 'complete',
  },
  {
    description: 'Earn cards for your collection.',
    name: 'Collect',
    stage: 'collect',
  },
  {
    description: 'Build a deck and take on the CPU.',
    name: 'Battle',
    stage: 'battle',
  },
] as const;

function useQuestJourneyReveal() {
  const journeyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const journey = journeyRef.current;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!journey || reducedMotion || !('IntersectionObserver' in window)) {
      return;
    }

    journey.classList.add('quest-journey--motion-ready');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          journey.classList.add('quest-journey--revealed');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.18 },
    );

    observer.observe(journey);
    return () => observer.disconnect();
  }, []);

  return journeyRef;
}

export default function HomePage() {
  const journeyRef = useQuestJourneyReveal();

  useEffect(() => {
    if (window.location.hash !== '#project-context') {
      return;
    }

    const scrollToProjectContext = () => {
      const projectContext = document.getElementById('project-context');

      if (typeof projectContext?.scrollIntoView === 'function') {
        projectContext.scrollIntoView();
      }
    };

    if (typeof window.requestAnimationFrame !== 'function') {
      scrollToProjectContext();
      return;
    }

    const frame = window.requestAnimationFrame(scrollToProjectContext);

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="home-page">
      <section aria-labelledby="home-title" className="hero">
        <div aria-hidden="true" className="hero__media">
          <img
            alt=""
            decoding="async"
            fetchPriority="high"
            height="941"
            loading="eager"
            src={greatHallHeroWebp}
            width="1672"
          />
        </div>

        <div aria-hidden="true" className="hero__atmosphere">
          <span className="hero__mist hero__mist--near" />
          <span className="hero__mist hero__mist--far" />
        </div>

        <div className="hero__identity">
          <CampusSeal className="hero__seal" decorative />
          <h1 id="home-title">Wits World</h1>
          <p>Explore · Discover · Achieve</p>
        </div>
      </section>

      <section
        aria-labelledby="game-introduction-title"
        className="game-introduction"
      >
        <div className="game-introduction__heading">
          <p className="eyebrow">The game starts on campus.</p>
          <h2 id="game-introduction-title">
            <span>Explore campus.</span> <span>Take on the quest.</span>
          </h2>
        </div>
        <div className="game-introduction__body">
          <p>
            Find events around Wits, complete challenges, earn cards and build a
            deck for battle.
          </p>
          <AuthAwareCta />
        </div>
      </section>

      <section
        aria-labelledby="journey-title"
        className="quest-journey"
        id="how-it-works"
        ref={journeyRef}
      >
        <div className="section-introduction">
          <h2 id="journey-title">How it works</h2>
        </div>

        <ol className="journey-stages">
          {gameplaySteps.map(({ description, name, stage }, index) => (
            <li
              className="journey-stage"
              key={name}
              style={{ '--journey-index': index } as CSSProperties}
            >
              <span className="journey-stage__number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="journey-stage__node">
                <JourneyStageVisual stage={stage} />
              </span>
              <div className="journey-stage__copy">
                <h3>{name}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="proof-title" className="product-proof">
        <div className="product-proof__content">
          <h2 id="proof-title">Earn cards. Build a deck. Battle.</h2>
        </div>

        <figure className="product-proof__visual">
          <QuestProgressionVisual />
          <figcaption className="sr-only">
            A campus challenge earns card rewards, which form a deck for a CPU
            battle.
          </figcaption>
        </figure>
      </section>

      <section
        aria-labelledby="project-context-title"
        className="project-context"
        id="project-context"
      >
        <div aria-hidden="true" className="project-context__mark">
          <CampusSeal className="project-context__seal" decorative />
          <span className="project-context__orbit" />
        </div>
        <div className="project-context__copy">
          <h2 id="project-context-title">Built at Wits</h2>
          <p>
            Wits World is a COMS3011A Software Design Project at Wits
            University, built around turning campus exploration into a
            location-based card game.
          </p>
        </div>
      </section>
    </div>
  );
}
