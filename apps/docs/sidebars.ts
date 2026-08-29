import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Overview',
      link: {
        type: 'doc',
        id: 'index',
      },
      items: [
        {
          type: 'doc',
          id: 'basic-release-reference',
          label: 'Wits Quest Basic Release Overview',
        },
      ],
    },
    {
      type: 'category',
      label: 'Product & Requirements',
      link: {
        type: 'generated-index',
        title: 'Product & Requirements',
        description:
          'Current Wits Quest rules, confirmed product decisions, and player journeys. Start with the Basic game rules; Sprint-specific journeys are labelled.',
        slug: '/product-requirements',
      },
      items: [
        {
          type: 'category',
          label: 'Product Rules & Decisions',
          items: [
            {
              type: 'doc',
              id: 'requirements/basic-game-rules',
              label: 'Wits Quest Basic Game Rules',
            },
            {
              type: 'doc',
              id: 'requirements/basic-tier-decision-register',
              label: 'Basic-Tier Decision Register',
            },
            {
              type: 'doc',
              id: 'requirements/player-progression-rules',
              label: 'Player Progression Rules',
            },
            {
              type: 'doc',
              id: 'requirements/ordered-trails-rules',
              label: 'Ordered Trail Rules',
            },
          ],
        },
        {
          type: 'category',
          label: 'Player Journeys',
          items: [
            {
              type: 'doc',
              id: 'requirements/player-challenge-journey',
              label: 'Challenge Journey',
            },
            {
              type: 'doc',
              id: 'requirements/player-deck-building-journey',
              label: 'Saved-Deck Journey',
            },
            {
              type: 'doc',
              id: 'requirements/player-cpu-battle-journey',
              label: 'CPU Battle & Match-History Journey',
            },
            {
              type: 'doc',
              id: 'requirements/player-location-journey',
              label: 'Location & Eligibility Journey (Sprint 1)',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      link: {
        type: 'generated-index',
        title: 'Architecture',
        description:
          'Current system structure, technology, authority boundaries, API documentation, diagrams, integration boundaries, evaluations, and ADRs. Start with the Architecture Overview.',
        slug: '/architecture',
      },
      items: [
        {
          type: 'category',
          label: 'Core Architecture',
          items: [
            {
              type: 'doc',
              id: 'architecture/overview',
              label: 'Architecture Overview',
            },
            {
              type: 'doc',
              id: 'architecture/technology-stack',
              label: 'Technology Stack',
            },
            {
              type: 'doc',
              id: 'architecture/data-flow',
              label: 'High-Level Data Flow',
            },
            {
              type: 'doc',
              id: 'architecture/trust-boundaries',
              label: 'Trust Boundaries',
            },
          ],
        },
        {
          type: 'category',
          label: 'API',
          items: [
            {
              type: 'doc',
              id: 'architecture/api-overview',
              label: 'API Overview',
            },
            {
              type: 'doc',
              id: 'architecture/author-curation-api-contract',
              label: 'Author Curation API Contract',
            },
            {
              type: 'doc',
              id: 'architecture/challenge-attempt-api-contract',
              label: 'Challenge & Attempt API Contract',
            },
            {
              type: 'doc',
              id: 'architecture/asynchronous-pvp-api-contract',
              label: 'Asynchronous PvP API Contract',
            },
          ],
        },
        {
          type: 'category',
          label: 'System Diagrams',
          items: [
            {
              type: 'doc',
              id: 'architecture/diagrams/system-context',
              label: 'System Context',
            },
            {
              type: 'doc',
              id: 'architecture/diagrams/application-containers',
              label: 'Application Containers',
            },
            {
              type: 'doc',
              id: 'architecture/diagrams/deployment',
              label: 'Current Deployment',
            },
          ],
        },
        {
          type: 'category',
          label: 'Integration Boundaries',
          items: [
            {
              type: 'doc',
              id: 'architecture/external-integrations',
              label: 'External Integrations',
            },
            {
              type: 'doc',
              id: 'architecture/mapbox-standard-migration',
              label: 'Mapbox Standard 3D Integration Boundary',
            },
          ],
        },
        {
          type: 'category',
          label: 'Technical Evaluations',
          items: [
            {
              type: 'doc',
              id: 'architecture/authentication-provider-comparison',
              label: 'Authentication Provider Comparison',
            },
            {
              type: 'doc',
              id: 'architecture/map-provider-evaluation',
              label: 'Map Provider Evaluation (Historical)',
            },
          ],
        },
        {
          type: 'category',
          label: 'Architecture Decisions',
          items: [
            {
              type: 'doc',
              id: 'architecture/decisions/README',
              label: 'ADR Overview',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-001-monorepo',
              label: 'ADR-001 — Monorepo',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-002-separate-web-api',
              label: 'ADR-002 — Separate Web & API',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-003-postgresql-postgis',
              label: 'ADR-003 — PostgreSQL & PostGIS',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-004-map-provider-boundary',
              label: 'ADR-004 — Map Provider Boundary',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-005-auth0-authentication',
              label: 'ADR-005 — Auth0',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Data & Database',
      link: {
        type: 'generated-index',
        title: 'Data & Database',
        description:
          'Current domain, geospatial, schema, and persistence reference. Start with the Database Overview, then use the relevant schema or persistence design for implementation detail.',
        slug: '/data-database',
      },
      items: [
        {
          type: 'category',
          label: 'Domain & Spatial Model',
          items: [
            {
              type: 'doc',
              id: 'database/overview',
              label: 'Database Overview',
            },
            {
              type: 'doc',
              id: 'database/event-schema',
              label: 'Event Schema',
            },
            {
              type: 'doc',
              id: 'database/player-schema',
              label: 'Player Identity & Player Names',
            },
            {
              type: 'doc',
              id: 'database/event-eligibility',
              label: 'Event Eligibility Calculation',
            },
          ],
        },
        {
          type: 'category',
          label: 'Persistence Designs',
          items: [
            {
              type: 'doc',
              id: 'database/challenge-reward-persistence-design',
              label: 'Challenge, Reward & Card Persistence',
            },
            {
              type: 'doc',
              id: 'database/saved-deck-persistence-design',
              label: 'Saved-Deck Persistence & API Design',
            },
            {
              type: 'doc',
              id: 'database/cpu-match-persistence-design',
              label: 'CPU Match Persistence',
            },
            {
              type: 'doc',
              id: 'database/player-progression-persistence',
              label: 'Player Progression Persistence',
            },
            {
              type: 'doc',
              id: 'database/ordered-trails-persistence',
              label: 'Ordered Trail Persistence',
            },
            {
              type: 'doc',
              id: 'database/asynchronous-pvp-persistence',
              label: 'Asynchronous PvP Persistence',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Design & Accessibility',
      items: [
        {
          type: 'doc',
          id: 'design/design-system',
          label: 'Wits World Design System',
        },
        {
          type: 'doc',
          id: 'design/basic-card-roster',
          label: 'Wits Quest Basic Card Roster',
        },
      ],
    },
    {
      type: 'category',
      label: 'Development & Operations',
      link: {
        type: 'generated-index',
        title: 'Development & Operations',
        description:
          'Developer onboarding, third-party dependencies, local data setup, CI/CD, service deployment, and database runbooks. Start with the Developer Guide for a new checkout.',
        slug: '/development-operations',
      },
      items: [
        {
          type: 'doc',
          id: 'development/getting-started',
          label: 'Developer Guide',
        },
        {
          type: 'doc',
          id: 'architecture/third-party-software-and-services',
          label: 'Third-Party Software & Services',
        },
        {
          type: 'category',
          label: 'Development Data & Local Services',
          items: [
            {
              type: 'doc',
              id: 'database/neon-postgis-setup',
              label: 'Neon PostgreSQL & PostGIS Setup',
            },
            {
              type: 'doc',
              id: 'database/basic-demo-seed',
              label: 'Basic Demo Seed',
            },
          ],
        },
        {
          type: 'category',
          label: 'CI/CD & Deployment',
          items: [
            {
              type: 'doc',
              id: 'testing/continuous-integration',
              label: 'Continuous Integration',
            },
            {
              type: 'doc',
              id: 'deployment/azure-deployment-setup',
              label: 'Azure Deployment Setup',
            },
            {
              type: 'doc',
              id: 'deployment/mapbox-operations',
              label: 'Mapbox Operations & Deployment',
            },
          ],
        },
        {
          type: 'category',
          label: 'Database Operations',
          items: [
            {
              type: 'doc',
              id: 'database/database-release-procedure',
              label: 'Basic Database Release Procedure',
            },
            {
              type: 'doc',
              id: 'database/postgis-recovery-rehearsal',
              label: 'PostGIS Recovery Rehearsal',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Testing & Quality',
      link: {
        type: 'generated-index',
        title: 'Testing & Quality',
        description:
          'The durable testing strategy and planned Sprint 2 user evaluation come first, followed by current Basic verification and preserved Sprint 1 release evidence.',
        slug: '/testing-quality',
      },
      items: [
        {
          type: 'doc',
          id: 'testing/testing-strategy',
          label: 'Testing Strategy & Policy',
        },
        {
          type: 'doc',
          id: 'testing/sprint-2-user-testing-plan',
          label: 'Sprint 2 User Testing Plan',
        },
        {
          type: 'category',
          label: 'Current Basic Verification',
          items: [
            {
              type: 'doc',
              id: 'testing/basic-tier-deterministic-e2e',
              label: 'Basic-Tier Deterministic E2E',
            },
            {
              type: 'doc',
              id: 'testing/basic-tier-release-validation',
              label: 'Basic-Tier Release Validation',
            },
            {
              type: 'doc',
              id: 'testing/deployed-auth-cors-privacy-review',
              label: 'Deployed Authentication, CORS & Privacy Review',
            },
          ],
        },
        {
          type: 'category',
          label: 'Sprint 1 Release Evidence',
          items: [
            {
              type: 'doc',
              id: 'testing/sprint-1-evidence-index',
              label: 'Evidence Index',
            },
            {
              type: 'doc',
              id: 'requirements/location-eligibility-field-test',
              label: 'Location Eligibility Field-Test Protocol',
            },
            {
              type: 'doc',
              id: 'testing/sprint-1-deterministic-e2e',
              label: 'Deterministic End-to-End Test',
            },
            {
              type: 'doc',
              id: 'testing/sprint-1-release-validation',
              label: 'Release Validation',
            },
            {
              type: 'doc',
              id: 'testing/sprint-1-demonstration-script',
              label: 'Demonstration Script',
            },
            {
              type: 'doc',
              id: 'testing/sprint-1-known-limitations',
              label: 'Known Limitations',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Project Management',
      link: {
        type: 'generated-index',
        title: 'Project Management',
        description:
          'Current methodology and Gitea work tracking, stakeholder interactions, plans, and registers alongside clearly labelled Sprint 1 Scrum evidence and historical issue plans. Start with Project & Git Methodology.',
        slug: '/project-management',
      },
      items: [
        {
          type: 'category',
          label: 'Methodology & Governance',
          items: [
            {
              type: 'doc',
              id: 'planning/project-and-git-methodology',
              label: 'Project & Git Methodology',
            },
            {
              type: 'doc',
              id: 'planning/work-tracking-and-issue-management',
              label: 'Work Tracking & Issue Management',
            },
            {
              type: 'doc',
              id: 'planning/sprint-2-governance-and-evidence',
              label: 'Sprint 2 Governance & Evidence',
            },
            {
              type: 'doc',
              id: 'planning/ai-use',
              label: 'AI Use',
            },
          ],
        },
        {
          type: 'category',
          label: 'Plans & Registers',
          items: [
            {
              type: 'doc',
              id: 'planning/delivery-roadmap',
              label: 'Delivery Roadmap (Planning Baseline)',
            },
            {
              type: 'doc',
              id: 'planning/risk-register',
              label: 'Initial Risk Register',
            },
            {
              type: 'doc',
              id: 'planning/wits-quest-sprint-2-gitea-issues',
              label: 'Historical Sprint 2 Gitea Issue Plan',
            },
          ],
        },
        {
          type: 'category',
          label: 'Stakeholder Interactions',
          items: [
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/initial-client-meeting',
              label: 'Initial Client Meeting — Calvin Rea',
            },
          ],
        },
        {
          type: 'category',
          label: 'Sprint 1 Scrum Evidence',
          items: [
            {
              type: 'doc',
              id: 'planning/scrum/index',
              label: 'Scrum Records',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/initial-planning',
              label: 'Initial Sprint Planning',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/daily-scrum-01',
              label: 'Daily Scrum 01 — Foundations',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/daily-scrum-02',
              label: 'Daily Scrum 02 — Integration Boundaries',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/backlog-refinement',
              label: 'Backlog Refinement',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/daily-scrum-03',
              label: 'Daily Scrum 03 — Refinement Outcomes',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/daily-scrum-04',
              label: 'Daily Scrum 04 — Basic-Tier Integration',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/sprint-review',
              label: 'Sprint 1 Review',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-1/sprint-retrospective',
              label: 'Sprint 1 Retrospective',
            },
          ],
        },
        {
          type: 'category',
          label: 'Historical Issue Plans',
          items: [
            {
              type: 'doc',
              id: 'planning/wits-quest-sprint-1-gitea-issues',
              label: 'Sprint 1 Gitea Issues',
            },
            {
              type: 'doc',
              id: 'planning/sprint-1-week-2-gitea-issues',
              label: 'Sprint 1, Week 2 Gitea Issue Plan',
            },
          ],
        },
      ],
    },
  ],
};

export default sidebars;
