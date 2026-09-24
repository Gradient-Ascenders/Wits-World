import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import {
  CardsIcon,
  CheckCircleIcon,
  CompassIcon,
  MapPinIcon,
  StackIcon,
  SwordIcon,
} from '@phosphor-icons/react';

import greatHallHero640Webp from '../assets/home/great-hall-hero-640.webp';
import greatHallHero960Webp from '../assets/home/great-hall-hero-960.webp';
import greatHallHeroWebp from '../assets/home/great-hall-hero.webp';
import { HomeExplorePreview } from '../components/home/HomeExplorePreview';
import { CampusSeal } from '../components/branding/CampusSeal';
import '../styles/home.css';

const greatHallHeroSrcSet = `${greatHallHero640Webp} 640w, ${greatHallHero960Webp} 960w, ${greatHallHeroWebp} 1672w`;

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
  const journeyNav = useRef<HTMLElement>(null);
  const [activeStage, setActiveStage] = useState(-1);

  useEffect(() => {
    let frame = 0;
    const updateStage = () => {
      frame = 0;
      const readingLine =
        (journeyNav.current?.getBoundingClientRect().height ?? 0) +
        Math.min(160, window.innerHeight * 0.2);
      let nextStage = -1;
      gameplaySteps.forEach(({ name }, index) => {
        const section = document.getElementById(`home-${name.toLowerCase()}`);
        if (section && section.getBoundingClientRect().top <= readingLine) {
          nextStage = index;
        }
      });
      // The final section may never reach the reading line on tall screens.
      if (
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2
      ) {
        nextStage = gameplaySteps.length - 1;
      }
      setActiveStage(nextStage);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateStage);
    };
    updateStage();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  preload(greatHallHeroWebp, {
    as: 'image',
    fetchPriority: 'high',
    imageSizes: '100vw',
    imageSrcSet: greatHallHeroSrcSet,
  });

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
            srcSet={greatHallHeroSrcSet}
            width="1672"
          />
        </div>

        <div aria-hidden="true" className="hero__atlas">
          <span className="hero__atlas-line hero__atlas-line--top" />
          <span className="hero__atlas-line hero__atlas-line--bottom" />
          <span className="hero__compass">
            <CompassIcon size={36} weight="thin" />
          </span>
        </div>

        <div className="hero__identity">
          <h1 id="home-title">Wits World</h1>
          <section
            aria-labelledby="game-introduction-title"
            className="game-introduction"
          >
            <div className="game-introduction__heading">
              <h2 id="game-introduction-title">
                <span>Explore campus.</span> <span>Take on the quest.</span>
              </h2>
            </div>
            <div className="game-introduction__body">
              <p>
                Find events around Wits, complete challenges, earn cards and
                build a deck for battle.
              </p>
              <p className="game-introduction__signature">
                Wits Quest · The game starts on campus
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

        <nav
          aria-label="Gameplay journey"
          className="journey-navigation"
          ref={journeyNav}
        >
          <ol className="journey-navigation__steps">
            {gameplaySteps.map(({ name, icon: Icon }, index) => (
              <li
                key={name}
                className={index <= activeStage ? 'is-reached' : undefined}
              >
                <a
                  href={`#home-${name.toLowerCase()}`}
                  aria-label={`Jump to ${name} stage`}
                  aria-current={index === activeStage ? 'location' : undefined}
                >
                  <span className="journey-navigation__node">
                    <Icon aria-hidden="true" size={22} weight="light" />
                  </span>
                  <span>{name}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="journey-sections">
          {gameplaySteps.map(({ description, name }, index) => (
            <section
              className={`journey-section${name === 'Explore' ? ' journey-section--explore' : ''}`}
              id={`home-${name.toLowerCase()}`}
              aria-labelledby={`home-${name.toLowerCase()}-title`}
              key={name}
              tabIndex={-1}
            >
              {name === 'Explore' ? (
                <>
                  <div className="home-explore-copy">
                    <span
                      aria-hidden="true"
                      className="journey-section__number"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 id="home-explore-title">Explore</h3>
                    <p className="home-explore-lead">{description}</p>
                    <p className="home-explore-description">
                      See campus from a new angle. Browse the map and event
                      list, then choose a challenge to take on at Wits.
                    </p>
                    <div className="home-explore-highlights">
                      <div>
                        <MapPinIcon
                          aria-hidden="true"
                          size={26}
                          weight="light"
                        />
                        <span>Discover events nearby</span>
                      </div>
                      <div>
                        <StackIcon
                          aria-hidden="true"
                          size={26}
                          weight="light"
                        />
                        <span>Browse campus spaces</span>
                      </div>
                      <div>
                        <CompassIcon
                          aria-hidden="true"
                          size={26}
                          weight="light"
                        />
                        <span>Find your next challenge</span>
                      </div>
                    </div>
                  </div>
                  <HomeExplorePreview />
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="journey-section__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="journey-section__copy">
                    <h3 id={`home-${name.toLowerCase()}-title`}>{name}</h3>
                    <p>{description}</p>
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
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
