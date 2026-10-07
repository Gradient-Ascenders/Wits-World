import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

type GuideIconName = 'player' | 'author' | 'developer' | 'api';

const guides: Array<{
  title: string;
  description: string;
  href: string;
  icon: GuideIconName;
}> = [
  {
    title: 'Player Guide',
    description: 'Explore campus, collect cards, and learn how battles work.',
    href: '/docs/player-guide',
    icon: 'player',
  },
  {
    title: 'Author Guide',
    description: 'Create, review, publish, and evaluate game content.',
    href: '/docs/author-guide',
    icon: 'author',
  },
  {
    title: 'Developer Guide',
    description: 'Set up the project and understand how the system is built.',
    href: '/docs/developer-guide',
    icon: 'developer',
  },
  {
    title: 'API Reference',
    description: 'Explore the OpenAPI documentation and feature contracts.',
    href: '/docs/api-reference',
    icon: 'api',
  },
];

function GuideIcon({ name }: { name: GuideIconName }): ReactNode {
  const paths: Record<GuideIconName, ReactNode> = {
    player: (
      <>
        <path d="M7.5 8.5h9a4 4 0 0 1 3.8 2.8l1.2 3.9a2.3 2.3 0 0 1-4.1 2l-1.2-1.7H7.8l-1.2 1.7a2.3 2.3 0 0 1-4.1-2l1.2-3.9a4 4 0 0 1 3.8-2.8Z" />
        <path d="M7 12v3M5.5 13.5h3M16.5 12.5h.01M19 14.5h.01" />
      </>
    ),
    author: (
      <>
        <path d="M8 4.5h8M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1Z" />
        <path d="M6 5h12a1.5 1.5 0 0 1 1.5 1.5v14H4.5v-14A1.5 1.5 0 0 1 6 5Z" />
        <path d="M8 10h8M8 14h8M8 18h5" />
      </>
    ),
    developer: (
      <>
        <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4 10.5 20" />
      </>
    ),
    api: (
      <>
        <path d="M9 4.5H7.8A1.8 1.8 0 0 0 6 6.3v3.2c0 1.4-.7 2.5-2 2.5 1.3 0 2 1.1 2 2.5v3.2a1.8 1.8 0 0 0 1.8 1.8H9M15 4.5h1.2A1.8 1.8 0 0 1 18 6.3v3.2c0 1.4.7 2.5 2 2.5-1.3 0-2 1.1-2 2.5v3.2a1.8 1.8 0 0 1-1.8 1.8H15" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={styles.guideIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function ArrowIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={styles.arrowIcon}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function HomepageHeader(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className={styles.brandLockup}>
        <img
          className={styles.heroSeal}
          src="/img/wits-world-campus-seal.svg"
          alt=""
          width="148"
          height="148"
        />
        <Heading as="h1" className={styles.heroTitle}>
          Wits World
        </Heading>
      </div>

      <p className={styles.heroStatement}>
        Explore campus. Discover stories. Collect cards. Battle.
      </p>

      <p className={styles.heroDescription}>
        Documentation for the Wits Quest campus exploration game.
      </p>

      <div className={styles.heroActions}>
        <Link
          className={clsx('button button--lg', styles.primaryButton)}
          to="/docs/"
        >
          Get started
        </Link>
        <Link
          className={clsx('button button--lg', styles.secondaryButton)}
          to="https://witsworld.co.za/"
        >
          Explore the game
        </Link>
      </div>
    </header>
  );
}

function GuideDirectory(): ReactNode {
  return (
    <section className={styles.guideSection} aria-labelledby="guide-heading">
      <div className={styles.sectionHeading}>
        <Heading as="h2" id="guide-heading">
          Choose your guide
        </Heading>
        <p>Start with the part of Wits Quest that matches what you need.</p>
      </div>

      <div className={styles.guideGrid}>
        {guides.map((guide) => (
          <Link className={styles.guideCard} to={guide.href} key={guide.href}>
            <GuideIcon name={guide.icon} />
            <span className={styles.guideCopy}>
              <span className={styles.guideTitle}>{guide.title}</span>
              <span className={styles.guideDescription}>
                {guide.description}
              </span>
            </span>
            <ArrowIcon />
          </Link>
        ))}
      </div>

      <Link className={styles.projectLink} to="/docs/project">
        <span>
          <strong>Project evidence</strong>
          <small>
            Testing, decisions, stakeholder reviews, and sprint history
          </small>
        </span>
        <ArrowIcon />
      </Link>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Documentation"
      description="Technical and project documentation for Wits World and the Wits Quest campus exploration game."
    >
      <main className={styles.home}>
        <div className={styles.frame}>
          <HomepageHeader />
          <GuideDirectory />
        </div>
      </main>
    </Layout>
  );
}
