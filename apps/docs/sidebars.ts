import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// Organise by reader task. sidebar-coverage.test.ts guards against missing pages.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Start here',
      items: [
        {
          type: 'doc',
          id: 'architecture/diagrams/index',
          label: 'Visual guide and diagrams',
        },
        {
          type: 'doc',
          id: 'sprint-2-overview',
          label: 'Sprint 2 overview',
        },
        {
          type: 'doc',
          id: 'basic-release-reference',
          label: 'Basic game overview',
        },
      ],
      link: {
        type: 'doc',
        id: 'index',
      },
    },
    {
      type: 'category',
      label: 'Game rules & player experience',
      link: {
        type: 'generated-index',
        slug: '/product-requirements',
      },
      items: [
        {
          type: 'category',
          label: 'Game rules and decisions',
          items: [
            {
              type: 'doc',
              id: 'requirements/sprint-2-feature-matrix',
              label: 'Sprint 2 features and progress',
            },
            {
              type: 'doc',
              id: 'requirements/basic-game-rules',
              label: 'Basic game rules',
            },
            {
              type: 'doc',
              id: 'requirements/basic-tier-decision-register',
              label: 'Confirmed game decisions',
            },
            {
              type: 'doc',
              id: 'requirements/player-progression-rules',
              label: 'Points, achievements and rankings',
            },
            {
              type: 'doc',
              id: 'requirements/ranked-competition-policy',
              label: 'Ranked ratings, matchmaking and seasons',
            },
            {
              type: 'doc',
              id: 'requirements/contested-campus-zone-policy',
              label: 'Contested-campus zones and settlement',
            },
            {
              type: 'doc',
              id: 'requirements/ordered-trails-rules',
              label: 'Trail rules and progress',
            },
            {
              type: 'doc',
              id: 'requirements/card-evolution-rules',
              label: 'Card evolution rules',
            },
            {
              type: 'doc',
              id: 'requirements/card-trading-policy',
              label: 'Card trading and anti-drain policy',
            },
            {
              type: 'doc',
              id: 'requirements/longitudinal-trust-policy',
              label: 'Trust scoring and enforcement policy',
            },
            {
              type: 'doc',
              id: 'requirements/automatic-event-placement-policy',
              label: 'Automatic event placement policy',
            },
          ],
        },
        {
          type: 'category',
          label: 'Playing the game',
          items: [
            {
              type: 'doc',
              id: 'requirements/player-challenge-journey',
              label: 'Playing a challenge',
            },
            {
              type: 'doc',
              id: 'requirements/player-deck-building-journey',
              label: 'Building a deck',
            },
            {
              type: 'doc',
              id: 'requirements/player-cpu-battle-journey',
              label: 'CPU battles and match history',
            },
            {
              type: 'doc',
              id: 'requirements/player-asynchronous-pvp-journey',
              label: 'Player battles and invitations',
            },
            {
              type: 'doc',
              id: 'requirements/player-location-journey',
              label: 'Location and event access (Sprint 1)',
            },
          ],
        },
        {
          type: 'category',
          label: 'Design and accessibility',
          items: [
            {
              type: 'doc',
              id: 'design/design-system',
              label: 'Design and accessibility standards',
            },
            {
              type: 'doc',
              id: 'design/basic-card-roster',
              label: 'Complete card catalogue',
            },
            {
              type: 'doc',
              id: 'design/state-review',
              label: 'Loading, error and feedback states',
            },
            {
              type: 'doc',
              id: 'design/references/card-frames/README',
              label: 'Card frame examples',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Technical guides',
      link: {
        type: 'generated-index',
        slug: '/technical-reference',
      },
      items: [
        {
          type: 'category',
          label: 'Architecture',
          link: {
            type: 'generated-index',
            slug: '/architecture',
          },
          items: [
            {
              type: 'doc',
              id: 'architecture/overview',
              label: 'System architecture',
            },
            {
              type: 'doc',
              id: 'architecture/technology-stack',
              label: 'Technology stack',
            },
            {
              type: 'doc',
              id: 'architecture/data-flow',
              label: 'How data moves through the system',
            },
            {
              type: 'doc',
              id: 'architecture/trust-boundaries',
              label: 'Security and server authority',
            },
            {
              type: 'category',
              label: 'Architecture diagrams',
              items: [
                {
                  type: 'doc',
                  id: 'architecture/diagrams/database-relationships',
                  label: 'Database relationships',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/database-battles',
                  label: 'Battle database relationships',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/challenge-flow',
                  label: 'Challenge and reward flow',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/content-review',
                  label: 'Content review and publication',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/system-context',
                  label: 'System and external services diagram',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/application-containers',
                  label: 'Frontend, API and database diagram',
                },
                {
                  type: 'doc',
                  id: 'architecture/diagrams/deployment',
                  label: 'Hosting and deployment diagram',
                },
              ],
            },
            {
              type: 'category',
              label: 'External services',
              items: [
                {
                  type: 'doc',
                  id: 'architecture/external-integrations',
                  label: 'External services and data sharing',
                },
                {
                  type: 'doc',
                  id: 'architecture/mapbox-standard-migration',
                  label: 'Mapbox 3D map integration',
                },
                {
                  type: 'doc',
                  id: 'architecture/third-party-software-and-services',
                  label: 'Third-party tools and why we use them',
                },
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'API guides',
          items: [
            {
              type: 'doc',
              id: 'architecture/api-overview',
              label: 'API overview and endpoint reference',
            },
            {
              type: 'doc',
              id: 'architecture/author-curation-api-contract',
              label: 'Content authoring API',
            },
            {
              type: 'doc',
              id: 'architecture/challenge-attempt-api-contract',
              label: 'Challenges and answers API',
            },
            {
              type: 'doc',
              id: 'architecture/asynchronous-pvp-api-contract',
              label: 'Asynchronous player battle API',
            },
            {
              type: 'doc',
              id: 'architecture/live-pvp-api-contract',
              label: 'Live player battle API',
            },
            {
              type: 'doc',
              id: 'architecture/ranked-matchmaking-api-contract',
              label: 'Ranked matchmaking API',
            },
            {
              type: 'doc',
              id: 'architecture/contested-campus-territory-api-contract',
              label: 'Contested-campus territory API',
            },
            {
              type: 'doc',
              id: 'architecture/campaign-scheduling-api-contract',
              label: 'Campaign scheduling API',
            },
            {
              type: 'doc',
              id: 'architecture/automatic-event-placement-service',
              label: 'Automatic event placement service',
            },
            {
              type: 'doc',
              id: 'architecture/offline-challenge-play',
              label: 'Offline play and synchronisation',
            },
          ],
        },
        {
          type: 'category',
          label: 'Database guides',
          link: {
            type: 'generated-index',
            slug: '/data-database',
          },
          items: [
            {
              type: 'doc',
              id: 'database/overview',
              label: 'Database structure and relationships',
            },
            {
              type: 'doc',
              id: 'database/event-schema',
              label: 'Event fields and relationships',
            },
            {
              type: 'doc',
              id: 'database/player-schema',
              label: 'Player accounts and names',
            },
            {
              type: 'doc',
              id: 'database/event-eligibility',
              label: 'How event access is calculated',
            },
            {
              type: 'doc',
              id: 'database/movement-evidence',
              label: 'Movement checks and privacy',
            },
            {
              type: 'doc',
              id: 'database/automatic-event-placement-persistence',
              label: 'Automatic event placement storage',
            },
            {
              type: 'category',
              label: 'Data storage and reports',
              items: [
                {
                  type: 'doc',
                  id: 'database/challenge-reward-persistence-design',
                  label: 'Challenge, reward and card storage',
                },
                {
                  type: 'doc',
                  id: 'database/saved-deck-persistence-design',
                  label: 'Deck storage and API',
                },
                {
                  type: 'doc',
                  id: 'database/cpu-match-persistence-design',
                  label: 'CPU battle storage',
                },
                {
                  type: 'doc',
                  id: 'database/player-progression-persistence',
                  label: 'Points and achievement storage',
                },
                {
                  type: 'doc',
                  id: 'database/ordered-trails-persistence',
                  label: 'Trail storage and API',
                },
                {
                  type: 'doc',
                  id: 'database/asynchronous-pvp-persistence',
                  label: 'Player battle storage',
                },
                {
                  type: 'doc',
                  id: 'database/live-pvp-persistence',
                  label: 'Live player battle storage',
                },
                {
                  type: 'doc',
                  id: 'database/ranked-competition-persistence',
                  label: 'Ranked competition storage',
                },
                {
                  type: 'doc',
                  id: 'database/contested-campus-territory-persistence',
                  label: 'Contested-campus territory storage',
                },
                {
                  type: 'doc',
                  id: 'database/card-trading-persistence',
                  label: 'Card trading storage',
                },
                {
                  type: 'doc',
                  id: 'database/trust-persistence',
                  label: 'Trust and review storage',
                },
                {
                  type: 'doc',
                  id: 'database/account-deletion-retention',
                  label: 'Account deletion and retained data',
                },
                {
                  type: 'doc',
                  id: 'database/campaign-scheduling-persistence',
                  label: 'Campaign schedule storage',
                },
                {
                  type: 'doc',
                  id: 'database/question-performance-analytics',
                  label: 'Question performance reports',
                },
                {
                  type: 'doc',
                  id: 'database/verified-event-content',
                  label: 'Campus events, questions and sources',
                },
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Architecture decisions',
          items: [
            {
              type: 'doc',
              id: 'architecture/decisions/README',
              label: 'Architecture decisions explained',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-001-monorepo',
              label: 'ADR-001 — One repository',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-002-separate-web-api',
              label: 'ADR-002 — Separate frontend and API',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-003-postgresql-postgis',
              label: 'ADR-003 — PostgreSQL and PostGIS',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-004-map-provider-boundary',
              label: 'ADR-004 — Map display and server rules',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-005-auth0-authentication',
              label: 'ADR-005 — Auth0 authentication',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-006-poor-gps-presence-fallback',
              label: 'ADR-006 — Poor-GPS options (proposed)',
            },
          ],
        },
        {
          type: 'category',
          label: 'Reviews and comparisons',
          items: [
            {
              type: 'doc',
              id: 'database/architecture-review-2026-09',
              label: 'Database review — September 2026',
            },

            {
              type: 'doc',
              id: 'architecture/authentication-provider-comparison',
              label: 'Authentication options compared',
            },
            {
              type: 'doc',
              id: 'architecture/map-provider-evaluation',
              label: 'Map options compared (historical)',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Development & deployment',
      link: {
        type: 'generated-index',
        slug: '/development-operations',
      },
      items: [
        {
          type: 'doc',
          id: 'development/getting-started',
          label: 'Set up the project locally',
        },
        {
          type: 'doc',
          id: 'development/documentation-site',
          label: 'Update and publish documentation',
        },
        {
          type: 'category',
          label: 'Local database and demo data',
          items: [
            {
              type: 'doc',
              id: 'database/neon-postgis-setup',
              label: 'Set up Neon and PostGIS',
            },
            {
              type: 'doc',
              id: 'database/basic-demo-seed',
              label: 'Load demo events and challenges',
            },
          ],
        },
        {
          type: 'category',
          label: 'CI and application deployment',
          items: [
            {
              type: 'doc',
              id: 'testing/continuous-integration',
              label: 'CI checks and deployment workflows',
            },
            {
              type: 'doc',
              id: 'deployment/azure-deployment-setup',
              label: 'Deploy the app and API to Azure',
            },
            {
              type: 'doc',
              id: 'deployment/mapbox-operations',
              label: 'Configure and operate Mapbox',
            },
            {
              type: 'doc',
              id: 'deployment/ranked-operations',
              label: 'Operate ranked competition',
            },
          ],
        },
        {
          type: 'category',
          label: 'Database setup and recovery',
          items: [
            {
              type: 'doc',
              id: 'database/database-release-procedure',
              label: 'Apply database migrations safely',
            },
            {
              type: 'doc',
              id: 'database/postgis-recovery-rehearsal',
              label: 'Test database recovery',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Testing & feedback',
      link: {
        type: 'generated-index',
        slug: '/testing-quality',
      },
      items: [
        {
          type: 'doc',
          id: 'testing/testing-strategy',
          label: 'Test strategy, commands and policy',
        },
        {
          type: 'category',
          label: 'Sprint 2 results and feedback',
          items: [
            {
              type: 'doc',
              id: 'testing/sprint-2-validation-status',
              label: 'Sprint 2 test results and release status',
            },
            {
              type: 'doc',
              id: 'testing/sprint-2-user-testing-plan',
              label: 'Sprint 2 user-testing plan',
            },
            {
              type: 'doc',
              id: 'testing/sprint-2-user-feedback-results',
              label: 'Sprint 2 feedback and resulting changes',
            },
          ],
        },
        {
          type: 'category',
          label: 'Release testing and checklists',
          items: [
            {
              type: 'category',
              label: 'Basic release results and follow-up',
              items: [
                {
                  type: 'doc',
                  id: 'testing/basic-release-validation-167',
                  label: 'Basic release test results (#167)',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-player-session',
                  label: 'Player test session guide',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-accessibility-matrix',
                  label: 'Accessibility and device checklist',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-stakeholder-review',
                  label: 'Next stakeholder review template',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-findings',
                  label: 'Record findings and retests',
                },
              ],
            },
            {
              type: 'doc',
              id: 'testing/basic-tier-deterministic-e2e',
              label: 'Basic game end-to-end tests',
            },
            {
              type: 'doc',
              id: 'testing/automated-verification',
              label: 'Database and end-to-end test gates',
            },
            {
              type: 'doc',
              id: 'testing/basic-tier-release-validation',
              label: 'Basic release acceptance checklist',
            },
            {
              type: 'doc',
              id: 'testing/deployed-auth-cors-privacy-review',
              label: 'Live authentication and privacy checks',
            },
            {
              type: 'doc',
              id: 'testing/player-account-lifecycle-validation',
              label: 'Account recovery and deletion checks',
            },
            {
              type: 'doc',
              id: 'testing/api-battle-responsiveness',
              label: 'API speed and battle response results',
            },
            {
              type: 'doc',
              id: 'requirements/location-eligibility-field-test',
              label: 'On-campus location testing guide',
            },
          ],
        },
        {
          type: 'category',
          label: 'Stakeholder meetings',
          link: { type: 'doc', id: 'planning/stakeholder-interactions/index' },
          items: [
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/initial-client-meeting',
              label: 'Meeting 1 — Calvin Rea',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-04-database-usage-review',
              label: 'Meeting 2 — Calvin Rea',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review',
              label: 'Meeting 3 — Calvin Rea',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-11-frontend-ui-review',
              label: 'Meeting 4 — Calvin Rea',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Project & sprint records',
      link: {
        type: 'generated-index',
        slug: '/project-management',
      },
      items: [
        {
          type: 'category',
          label: 'Team workflow and responsibilities',
          items: [
            {
              type: 'doc',
              id: 'planning/project-and-git-methodology',
              label: 'How we plan, build and review work',
            },
            {
              type: 'doc',
              id: 'planning/work-tracking-and-issue-management',
              label: 'Track tasks, bugs and fixes',
            },
            {
              type: 'doc',
              id: 'planning/sprint-2-governance-and-evidence',
              label: 'Sprint 2 process and evidence',
            },
            {
              type: 'doc',
              id: 'planning/ai-use',
              label: 'AI tools and contribution disclosure',
            },
          ],
        },
        {
          type: 'category',
          label: 'Plans and risks',
          items: [
            {
              type: 'doc',
              id: 'planning/delivery-roadmap',
              label: 'Delivery roadmap (original plan)',
            },
            {
              type: 'doc',
              id: 'planning/risk-register',
              label: 'Project risks and mitigations',
            },
          ],
        },
        {
          type: 'doc',
          id: 'planning/scrum/index',
          label: 'Sprint meeting overview',
        },
        {
          type: 'category',
          label: 'Sprint 2 meetings',
          items: [
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/initial-planning',
              label: 'Planning',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/daily-scrum-01',
              label: 'Daily Scrum 1 — Foundations',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/daily-scrum-02',
              label: 'Daily Scrum 2 — Backend integration',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/backlog-refinement',
              label: 'Backlog refinement',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/daily-scrum-03',
              label: 'Daily Scrum 3 — Player experience',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/daily-scrum-04',
              label: 'Daily Scrum 4 — Testing and feedback',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/sprint-review',
              label: 'Review',
            },
            {
              type: 'doc',
              id: 'planning/scrum/sprint-2/sprint-retrospective',
              label: 'Retrospective',
            },
          ],
        },
        {
          type: 'category',
          label: 'Sprint 1 evidence',
          items: [
            {
              type: 'category',
              label: 'Test results and demo',
              items: [
                {
                  type: 'doc',
                  id: 'testing/sprint-1-evidence-index',
                  label: 'Sprint 1 evidence overview',
                },
                {
                  type: 'doc',
                  id: 'testing/sprint-1-deterministic-e2e',
                  label: 'Sprint 1 end-to-end tests',
                },
                {
                  type: 'doc',
                  id: 'testing/sprint-1-release-validation',
                  label: 'Sprint 1 release checks',
                },
                {
                  type: 'doc',
                  id: 'testing/sprint-1-demonstration-script',
                  label: 'Sprint 1 demo walkthrough',
                },
                {
                  type: 'doc',
                  id: 'testing/sprint-1-known-limitations',
                  label: 'Sprint 1 known limitations',
                },
              ],
            },
            {
              type: 'category',
              label: 'Planning and Scrum meetings',
              items: [
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/initial-planning',
                  label: 'Sprint 1 planning',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-01',
                  label: 'Daily Scrum 1 — Foundations',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-02',
                  label: 'Daily Scrum 2 — System integration',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/backlog-refinement',
                  label: 'Sprint 1 backlog refinement',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-03',
                  label: 'Daily Scrum 3 — Refinement outcomes',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-04',
                  label: 'Daily Scrum 4 — Basic game integration',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/sprint-review',
                  label: 'Sprint 1 review',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/sprint-retrospective',
                  label: 'Sprint 1 retrospective',
                },
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Past task plans',
          items: [
            {
              type: 'doc',
              id: 'planning/wits-quest-sprint-2-gitea-issues',
              label: 'Sprint 2 task plan (historical)',
            },
            {
              type: 'doc',
              id: 'planning/wits-quest-sprint-1-gitea-issues',
              label: 'Sprint 1 task plan (historical)',
            },
            {
              type: 'doc',
              id: 'planning/sprint-1-week-2-gitea-issues',
              label: 'Sprint 1 week 2 plan (historical)',
            },
          ],
        },
      ],
    },
  ],
};

export default sidebars;
