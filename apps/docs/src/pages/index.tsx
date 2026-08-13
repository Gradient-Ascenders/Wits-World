import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const sections = [
  {
    title: 'Architecture',
    description:
      'System architecture, technology decisions, trust boundaries, API contracts, and ADRs.',
    href: '/docs/architecture/overview',
  },
  {
    title: 'Database',
    description:
      'PostgreSQL, PostGIS, persistence design, schemas, deployment, and recovery procedures.',
    href: '/docs/database/neon-postgis-setup',
  },
  {
    title: 'Development',
    description:
      'Deployment guidance, CI/CD processes, development practices, and project infrastructure.',
    href: '/docs/deployment/azure-deployment-setup',
  },
  {
    title: 'Design',
    description:
      'Wits Quest visual language, interaction principles, accessibility, and interface standards.',
    href: '/docs/design/design-system',
  },
  {
    title: 'Planning',
    description:
      'Delivery roadmap, sprint planning, risk management, and implementation priorities.',
    href: '/docs/planning/delivery-roadmap',
  },
  {
    title: 'Testing',
    description:
      'Continuous integration, automated verification, testing strategy, and quality practices.',
    href: '/docs/testing/continuous-integration',
  },
];

function HomepageHeader(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className={styles.heroGlow} />

      <div className={styles.heroContent}>
        <div className={styles.eyebrow}>
          COMS3011A · SOFTWARE DESIGN PROJECT
        </div>

        <Heading as="h1" className={styles.heroTitle}>
          Wits World
        </Heading>

        <p className={styles.heroSubtitle}>
          Technical and project documentation for Wits Quest, a location-based
          campus exploration game.
        </p>

        <div className={styles.heroActions}>
          <Link
            className={clsx('button button--lg', styles.primaryButton)}
            to="/docs/architecture/overview"
          >
            Explore documentation
          </Link>

          <Link
            className={clsx('button button--lg', styles.secondaryButton)}
            href="https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World"
          >
            View Gitea
          </Link>
        </div>
      </div>
    </header>
  );
}

function DocumentationSections(): ReactNode {
  return (
    <section className={styles.documentation}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionNumber}>01</span>

        <div>
          <Heading as="h2">Project documentation</Heading>
          <p>
            Design decisions, technical guidance, delivery planning, and
            engineering evidence maintained alongside the source code.
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {sections.map((section, index) => (
          <Link className={styles.card} to={section.href} key={section.title}>
            <span className={styles.cardNumber}>
              {String(index + 1).padStart(2, '0')}
            </span>

            <Heading as="h3">{section.title}</Heading>
            <p>{section.description}</p>

            <span className={styles.cardLink}>Open section →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Documentation"
      description="Technical and project documentation for Wits World and the Wits Quest campus exploration game."
    >
      <main>
        <HomepageHeader />
        <DocumentationSections />
      </main>
    </Layout>
  );
}
