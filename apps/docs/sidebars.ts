import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

type SidebarItemConfig = Extract<SidebarsConfig[string], unknown[]>[number];

const doc = (id: string, label?: string): SidebarItemConfig => ({
  type: 'doc',
  id,
  ...(label ? { label } : {}),
});

const category = (
  label: string,
  items: SidebarItemConfig[],
): SidebarItemConfig => ({
  type: 'category',
  label,
  collapsed: true,
  items,
});

// Keep the first level small and audience-led. Detailed engineering and sprint
// records remain available, but they no longer compete with the main reading paths.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Introduction',
      collapsed: false,
      link: { type: 'doc', id: 'index' },
      items: [
        doc('basic-release-reference', 'What is Wits Quest?'),
        doc('development/getting-started', 'Getting started'),
        doc('requirements/basic-game-rules', 'Game concepts and features'),
        doc('architecture/diagrams/index', 'Visual guide and diagrams'),
      ],
    },
    {
      type: 'category',
      label: 'Player Guide',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/player-guide',
        title: 'Player Guide',
        description:
          'Learn how to explore campus, complete challenges, collect cards, and battle.',
      },
      items: [
        doc('requirements/player-location-journey', 'Campus exploration'),
        doc('requirements/player-challenge-journey', 'Events and challenges'),
        doc(
          'requirements/player-deck-building-journey',
          'Cards, collections and decks',
        ),
        doc(
          'requirements/player-cpu-battle-journey',
          'CPU battles and match history',
        ),
        doc(
          'requirements/player-asynchronous-pvp-journey',
          'Player battles and invitations',
        ),
        category('Rules and progression', [
          doc('requirements/basic-tier-decision-register'),
          doc('requirements/player-progression-rules'),
          doc('requirements/ranked-competition-policy'),
          doc('requirements/contested-campus-zone-policy'),
          doc('requirements/ordered-trails-rules'),
          doc('requirements/card-evolution-rules'),
          doc('requirements/card-trading-policy'),
        ]),
        category('Collection and profile reference', [
          doc('design/profile-showcase'),
          doc('design/basic-card-roster'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'Author Guide',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/author-guide',
        title: 'Author Guide',
        description:
          'Create, review, publish, moderate, and evaluate Wits Quest content.',
      },
      items: [
        doc(
          'architecture/diagrams/content-review',
          'Content review and publication',
        ),
        doc(
          'architecture/author-curation-api-contract',
          'Managing events and content',
        ),
        doc(
          'architecture/campaign-scheduling-api-contract',
          'Campaign scheduling',
        ),
        doc(
          'architecture/automatic-event-placement-service',
          'Automatic event placement',
        ),
        doc('requirements/automatic-event-placement-policy'),
        doc(
          'requirements/longitudinal-trust-policy',
          'Player moderation and trust',
        ),
        doc('architecture/advanced-analytics-api-contract', 'Analytics API'),
        doc(
          'database/question-performance-analytics',
          'Question performance reports',
        ),
        doc('database/advanced-analytics', 'Analytics storage and privacy'),
      ],
    },
    {
      type: 'category',
      label: 'Developer Guide',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/developer-guide',
        title: 'Developer Guide',
        description:
          'Set up, understand, test, deploy, and operate the system.',
      },
      items: [
        category('System architecture', [
          doc('architecture/overview'),
          doc('architecture/technology-stack'),
          doc('architecture/data-flow'),
          doc('architecture/trust-boundaries'),
          doc('architecture/external-integrations'),
          doc('architecture/third-party-software-and-services'),
          doc('architecture/mapbox-standard-migration'),
        ]),
        category('Architecture diagrams', [
          doc('architecture/diagrams/system-context'),
          doc('architecture/diagrams/application-containers'),
          doc('architecture/diagrams/deployment'),
          doc('architecture/diagrams/advanced-systems'),
          doc('architecture/diagrams/challenge-flow'),
          doc('architecture/diagrams/database-relationships'),
          doc('architecture/diagrams/database-battles'),
        ]),
        category('Database and data model', [
          doc('database/overview'),
          doc('database/event-schema'),
          doc('database/player-schema'),
          doc('database/event-eligibility'),
          doc('database/movement-evidence'),
          doc('database/challenge-reward-persistence-design'),
          doc('database/saved-deck-persistence-design'),
          doc('database/cpu-match-persistence-design'),
          doc('database/player-progression-persistence'),
          doc('database/ordered-trails-persistence'),
          doc('database/asynchronous-pvp-persistence'),
          doc('database/live-pvp-persistence'),
          doc('database/ranked-competition-persistence'),
          doc('database/contested-campus-territory-persistence'),
          doc('database/card-trading-persistence'),
          doc('database/trust-persistence'),
          doc('database/account-deletion-retention'),
          doc('database/developer-api-keys'),
          doc('database/campaign-scheduling-persistence'),
          doc('database/automatic-event-placement-persistence'),
          doc('database/verified-event-content'),
          doc('database/architecture-review-2026-09'),
        ]),
        category('Local setup and database operations', [
          doc('database/neon-postgis-setup'),
          doc('database/basic-demo-seed'),
          doc('database/database-release-procedure'),
          doc('database/postgis-recovery-rehearsal'),
          doc('development/documentation-site'),
        ]),
        category('Authentication and design decisions', [
          doc('architecture/decisions/README'),
          doc('architecture/decisions/ADR-001-monorepo'),
          doc('architecture/decisions/ADR-002-separate-web-api'),
          doc('architecture/decisions/ADR-003-postgresql-postgis'),
          doc('architecture/decisions/ADR-004-map-provider-boundary'),
          doc('architecture/decisions/ADR-005-auth0-authentication'),
          doc('architecture/decisions/ADR-006-poor-gps-presence-fallback'),
          doc('architecture/authentication-provider-comparison'),
          doc('architecture/map-provider-evaluation'),
        ]),
        category('Interface implementation', [
          doc('design/design-system'),
          doc('design/state-review'),
          doc('design/references/card-frames/README'),
          doc('loading-policy'),
        ]),
        category('Testing and deployment', [
          doc('testing/testing-strategy'),
          doc('testing/automated-verification'),
          doc('testing/continuous-integration'),
          doc('deployment/azure-deployment-setup'),
          doc('deployment/mapbox-operations'),
          doc('deployment/ranked-operations'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/api-reference',
        title: 'API Reference',
        description:
          'Explore the public API, authentication model, and feature contracts.',
      },
      items: [
        doc('architecture/api-overview', 'OpenAPI documentation'),
        doc('architecture/developer-api', 'External developer API'),
        doc('architecture/rate-limiting', 'Authentication, limits and errors'),
        category('Player and challenge endpoints', [
          doc('architecture/player-profile-api-contract'),
          doc('architecture/challenge-attempt-api-contract'),
          doc('architecture/offline-challenge-play'),
        ]),
        category('Battle and competition endpoints', [
          doc('architecture/asynchronous-pvp-api-contract'),
          doc('architecture/live-pvp-api-contract'),
          doc('architecture/ranked-matchmaking-api-contract'),
          doc('architecture/contested-campus-territory-api-contract'),
        ]),
        doc('architecture/card-trading-api-contract'),
      ],
    },
    {
      type: 'category',
      label: 'Project',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/project',
        title: 'Project',
        description:
          'Review the project process, evidence, decisions, and sprint history.',
      },
      items: [
        category('Milestone evidence', [
          doc('sprint-3-overview'),
          doc('requirements/sprint-3-feature-matrix'),
          doc('sprint-2-overview'),
          doc('requirements/sprint-2-feature-matrix'),
        ]),
        category('Methodology and tools', [
          doc('planning/project-and-git-methodology'),
          doc('planning/work-tracking-and-issue-management'),
          doc('planning/sprint-3-governance-and-evidence'),
          doc('planning/sprint-2-governance-and-evidence'),
          doc('planning/delivery-roadmap'),
          doc('planning/risk-register'),
          doc('planning/ai-use'),
        ]),
        category('Testing and evaluation evidence', [
          doc('testing/sprint-3-validation-status'),
          doc('testing/sprint-3-user-testing-plan'),
          doc('testing/sprint-3-user-feedback-results'),
          doc('testing/sprint-2-validation-status'),
          doc('testing/sprint-2-user-testing-plan'),
          doc('testing/sprint-2-user-feedback-results'),
          doc('testing/basic-release-validation-167'),
          doc('testing/basic-tier-deterministic-e2e'),
          doc('testing/basic-tier-release-validation'),
          doc('testing/basic-release-player-session'),
          doc('testing/basic-release-accessibility-matrix'),
          doc('testing/basic-release-stakeholder-review'),
          doc('testing/basic-release-findings'),
          doc('testing/deployed-auth-cors-privacy-review'),
          doc('testing/player-account-lifecycle-validation'),
          doc('testing/api-battle-responsiveness'),
          doc('testing/pvp-request-phase-timing'),
          doc('requirements/location-eligibility-field-test'),
        ]),
        category('Stakeholder reviews', [
          doc('planning/stakeholder-interactions/index'),
          doc('planning/stakeholder-interactions/initial-client-meeting'),
          doc(
            'planning/stakeholder-interactions/2026-09-04-database-usage-review',
          ),
          doc(
            'planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review',
          ),
          doc(
            'planning/stakeholder-interactions/2026-09-11-frontend-ui-review',
          ),
          doc(
            'planning/stakeholder-interactions/2026-09-21-battle-performance-review',
          ),
          doc(
            'planning/stakeholder-interactions/2026-09-23-account-deletion-review',
          ),
          doc(
            'planning/stakeholder-interactions/2026-09-25-territories-and-rate-limits-review',
          ),
        ]),
        category('Sprint 3 coordination and review', [
          doc('planning/scrum/index'),
          doc('planning/scrum/sprint-3/initial-planning'),
          doc('planning/scrum/sprint-3/daily-scrum-01'),
          doc('planning/scrum/sprint-3/daily-scrum-02'),
          doc('planning/scrum/sprint-3/backlog-refinement'),
          doc('planning/scrum/sprint-3/daily-scrum-03'),
          doc('planning/scrum/sprint-3/daily-scrum-04'),
          doc('planning/scrum/sprint-3/sprint-review'),
          doc('planning/scrum/sprint-3/sprint-retrospective'),
        ]),
        category('Sprint 2 archive', [
          doc('planning/scrum/sprint-2/initial-planning'),
          doc('planning/scrum/sprint-2/daily-scrum-01'),
          doc('planning/scrum/sprint-2/daily-scrum-02'),
          doc('planning/scrum/sprint-2/backlog-refinement'),
          doc('planning/scrum/sprint-2/daily-scrum-03'),
          doc('planning/scrum/sprint-2/daily-scrum-04'),
          doc('planning/scrum/sprint-2/sprint-review'),
          doc('planning/scrum/sprint-2/sprint-retrospective'),
        ]),
        category('Sprint 1 archive', [
          doc('testing/sprint-1-evidence-index'),
          doc('testing/sprint-1-deterministic-e2e'),
          doc('testing/sprint-1-release-validation'),
          doc('testing/sprint-1-demonstration-script'),
          doc('testing/sprint-1-known-limitations'),
          doc('planning/scrum/sprint-1/initial-planning'),
          doc('planning/scrum/sprint-1/daily-scrum-01'),
          doc('planning/scrum/sprint-1/daily-scrum-02'),
          doc('planning/scrum/sprint-1/backlog-refinement'),
          doc('planning/scrum/sprint-1/daily-scrum-03'),
          doc('planning/scrum/sprint-1/daily-scrum-04'),
          doc('planning/scrum/sprint-1/sprint-review'),
          doc('planning/scrum/sprint-1/sprint-retrospective'),
        ]),
        category('Historical task plans', [
          doc('planning/wits-quest-sprint-2-gitea-issues'),
          doc('planning/wits-quest-sprint-1-gitea-issues'),
          doc('planning/sprint-1-week-2-gitea-issues'),
        ]),
      ],
    },
  ],
};

export default sidebars;
