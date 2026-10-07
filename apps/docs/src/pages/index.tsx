import type { ReactNode } from 'react';
import {
  ArrowRight,
  BracketsCurly,
  Cards,
  ClipboardText,
  Code,
  type Icon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

type GuideIconName = 'player' | 'author' | 'developer' | 'api';

const guideIcons: Record<GuideIconName, Icon> = {
  player: Cards,
  author: ClipboardText,
  developer: Code,
  api: BracketsCurly,
};

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
  const GuideIconComponent = guideIcons[name];

  return (
    <GuideIconComponent
      aria-hidden="true"
      className={styles.guideIcon}
      weight="regular"
    />
  );
}

function ArrowIcon(): ReactNode {
  return (
    <ArrowRight aria-hidden="true" className={styles.arrowIcon} weight="bold" />
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
