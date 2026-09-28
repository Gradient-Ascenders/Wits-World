import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const readerPaths = [
  {
    title: 'Understand the product',
    description:
      'See what Wits Quest currently delivers, how its rules are defined, and how players move through the game.',
    links: [
      {
        label: 'Sprint 3 overview',
        href: '/docs/sprint-3-overview',
      },
      {
        label: 'Sprint 2 reference',
        href: '/docs/sprint-2-overview',
      },
      {
        label: 'Game rules & player experience',
        href: '/docs/product-requirements',
      },
    ],
  },
  {
    title: 'Build and run the system',
    description:
      'Find local-service guidance, delivery workflows, deployment procedures, and database operations.',
    links: [
      {
        label: 'Development & deployment',
        href: '/docs/development-operations',
      },
    ],
  },
  {
    title: 'Explore the technical design',
    description:
      'Review the system architecture, data model, design decisions, and accessible interface standards.',
    links: [
      {
        label: 'Technical guides',
        href: '/docs/technical-reference',
      },
      {
        label: 'Database guides',
        href: '/docs/data-database',
      },
      {
        label: 'Design and accessibility standards',
        href: '/docs/design/design-system',
      },
    ],
  },
  {
    title: 'Review quality and project evidence',
    description:
      'Inspect Sprint 3 user feedback, stakeholder review plans, verification gaps, governance, and coordination records alongside earlier sprint evidence.',
    links: [
      {
        label: 'Testing & feedback',
        href: '/docs/testing-quality',
      },
      {
        label: 'Project & sprint records',
        href: '/docs/project-management',
      },
    ],
  },
];

const documentationSections = [
  { label: 'Start here', href: '/docs/' },
  {
    label: 'Game rules & player experience',
    href: '/docs/product-requirements',
  },
  { label: 'Technical guides', href: '/docs/technical-reference' },
  {
    label: 'Development & deployment',
    href: '/docs/development-operations',
  },
  { label: 'Testing & feedback', href: '/docs/testing-quality' },
  { label: 'Project & sprint records', href: '/docs/project-management' },
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
          <strong>Wits World</strong> is the project and repository workspace
          for <strong>Wits Quest</strong>, a location-based campus exploration
          game.
        </p>

        <div className={styles.heroActions}>
          <Link
            className={clsx('button button--lg', styles.primaryButton)}
            to="/docs/"
          >
            Open documentation
          </Link>

          <Link
            className={clsx('button button--lg', styles.secondaryButton)}
            to="/docs/sprint-3-overview"
          >
            Explore Sprint 3
          </Link>
        </div>
      </div>
    </header>
  );
}

function DocumentationPaths(): ReactNode {
  return (
    <section className={styles.documentation}>
      <div className={styles.sectionHeader}>
        <Heading as="h2">Choose a path</Heading>
        <p>
          Start with the part of Wits World that matches what you need to
          understand or do.
        </p>
      </div>

      <div className={styles.pathGrid}>
        {readerPaths.map((path, index) => (
          <article className={styles.pathCard} key={path.title}>
            <span className={styles.pathNumber} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>

            <Heading as="h3">{path.title}</Heading>
            <p>{path.description}</p>

            <ul className={styles.pathLinks}>
              {path.links.map((link) => (
                <li key={link.href}>
                  <Link className={styles.pathLink} to={link.href}>
                    <span>{link.label}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className={styles.directoryHeader}>
        <Heading as="h2">All documentation</Heading>
        <p>Browse every major section in the curated documentation guide.</p>
      </div>

      <nav className={styles.sectionLinks} aria-label="Documentation sections">
        {documentationSections.map((section) => (
          <Link
            className={styles.sectionLink}
            to={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        ))}
      </nav>
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
        <DocumentationPaths />
      </main>
    </Layout>
  );
}
