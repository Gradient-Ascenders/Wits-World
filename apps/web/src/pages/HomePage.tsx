import { useEffect } from 'react';
import {
  CardsIcon,
  CheckCircleIcon,
  CompassIcon,
  SwordIcon,
} from '@phosphor-icons/react';

import greatHallHero640Webp from '../assets/home/great-hall-hero-640.webp';
import greatHallHero960Webp from '../assets/home/great-hall-hero-960.webp';
import greatHallHeroWebp from '../assets/home/great-hall-hero.webp';
import { CampusSeal } from '../components/branding/CampusSeal';
import '../styles/home.css';

const gameplaySteps = [
  {
    description: 'Find events around Wits.',
    name: 'Explore',
    icon: CompassIcon,
  },
  {
    description: 'Take on the challenge at each event.',
    name: 'Complete',
    icon: CheckCircleIcon,
  },
  {
    description: 'Earn cards for your collection.',
    name: 'Collect',
    icon: CardsIcon,
  },
  {
    description: 'Build a deck and take on the CPU.',
    name: 'Battle',
    icon: SwordIcon,
  },
] as const;

export default function HomePage() {
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
            sizes="100vw"
            src={greatHallHeroWebp}
            srcSet={`${greatHallHero640Webp} 640w, ${greatHallHero960Webp} 960w, ${greatHallHeroWebp} 1672w`}
            width="1672"
          />
        </div>

        <div className="hero__identity">
          <h1 id="home-title">Wits World</h1>
          <section
            aria-labelledby="game-introduction-title"
            className="game-introduction"
          >
            <div className="game-introduction__heading">
              <p className="eyebrow">Wits Quest · The game starts on campus</p>
              <h2 id="game-introduction-title">
                <span>Explore campus.</span> <span>Take on the quest.</span>
              </h2>
            </div>
            <div className="game-introduction__body">
              <p>
                Find events around Wits, complete challenges, earn cards and
                build a deck for battle.
              </p>
            </div>
          </section>
        </div>
      </section>

      <section
        aria-labelledby="journey-title"
        className="quest-journey"
        id="how-it-works"
      >
        <div className="section-introduction">
          <h2 id="journey-title">How it works</h2>
          <p>From your next campus discovery to your next battle.</p>
        </div>

        <ol className="journey-stages">
          {gameplaySteps.map(({ description, name, icon: Icon }, index) => (
            <li className="journey-stage" key={name}>
              <span className="journey-stage__number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="journey-stage__node">
                <Icon aria-hidden="true" size={28} />
              </span>
              <div className="journey-stage__copy">
                <h3>{name}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="project-context-title"
        className="project-context"
        id="project-context"
      >
        <div aria-hidden="true" className="project-context__mark">
          <CampusSeal className="project-context__seal" decorative />
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
