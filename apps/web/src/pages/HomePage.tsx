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
import { HomeBattleMatchup } from '../components/home/HomeBattleMatchup';
import { HomeChallengeCta } from '../components/home/HomeChallengeCta';
import { HomeChallengeDemo } from '../components/home/HomeChallengeDemo';
import { HomeCollectShowcase } from '../components/home/HomeCollectShowcase';
import { HomeExplorePreview } from '../components/home/HomeExplorePreview';
import '../styles/home.css';

const greatHallHeroSrcSet = `${greatHallHero640Webp} 640w, ${greatHallHero960Webp} 960w, ${greatHallHeroWebp} 1672w`;

const gameplaySteps = [
  {
    description: 'See what’s happening around Wits.',
    name: 'Explore',
    icon: CompassIcon,
  },
  {
    description: 'Take on a challenge.',
    name: 'Complete',
    icon: CheckCircleIcon,
  },
  {
    description: 'Build your collection.',
    name: 'Collect',
    icon: CardsIcon,
  },
  {
    description: 'Put your collection to work.',
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
          <div className="section-introduction__title">
            <span aria-hidden="true" className="section-introduction__range">
              01—04
            </span>
            <h2 id="journey-title">How it works</h2>
          </div>
          <p>
            From your next campus discovery to your next battle, every step
            moves your quest forward.
          </p>
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
                  <span className="journey-navigation__copy">
                    <strong>{name}</strong>
                    <span>Stage {String(index + 1).padStart(2, '0')}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="journey-sections">
          {gameplaySteps.map(({ description, name }, index) => (
            <section
              className={`journey-section${name === 'Explore' ? ' journey-section--explore' : ''}${name === 'Complete' ? ' journey-section--complete' : ''}${name === 'Collect' ? ' journey-section--collect' : ''}${name === 'Battle' ? ' journey-section--battle' : ''}`}
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
                      Campus is full of things you can walk past without ever
                      noticing. Explore the map, find events and places around
                      Wits, and pick something that catches your attention.
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
              ) : name === 'Complete' ? (
                <>
                  <div className="home-complete-copy">
                    <span
                      aria-hidden="true"
                      className="journey-section__number"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 id="home-complete-title">Complete</h3>
                    <p className="home-complete-lead">{description}</p>
                    <p className="home-complete-description">
                      Found something interesting? Give its challenge a go.
                      Answer the questions, see how you did, and earn your
                      reward for completing it.
                    </p>
                    <HomeChallengeCta />
                  </div>
                  <HomeChallengeDemo />
                </>
              ) : name === 'Collect' ? (
                <>
                  <div className="home-collect-copy">
                    <span
                      aria-hidden="true"
                      className="journey-section__number"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 id="home-collect-title">Collect</h3>
                    <p className="home-collect-lead">{description}</p>
                    <p className="home-collect-description">
                      Every challenge can add something new to your collection.
                      Keep exploring Wits, complete more challenges, and
                      discover the cards scattered across campus.
                    </p>
                  </div>
                  <HomeCollectShowcase />
                </>
              ) : (
                <>
                  <div className="home-battle-copy">
                    <span
                      aria-hidden="true"
                      className="journey-section__number"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 id="home-battle-title">Battle</h3>
                    <p className="home-battle-lead">{description}</p>
                    <p className="home-battle-description">
                      Your cards aren’t just there to look at. Build a deck from
                      the ones you’ve collected and take it into battle against
                      other players.
                    </p>
                  </div>
                  <HomeBattleMatchup />
                </>
              )}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
