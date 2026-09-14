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
          id: 'sprint-2-overview',
          label: 'Sprint 2 Overview & Evidence',
        },
        {
          type: 'doc',
          id: 'basic-release-reference',
          label: 'Wits Quest Basic Release Overview',
        },
      ],
      link: {
        type: 'doc',
        id: 'index',
      },
    },
    {
      type: 'category',
      label: 'Product & player experience',
      link: {
        type: 'generated-index',
        slug: '/product-requirements',
      },
      items: [
        {
          type: 'category',
          label: 'Rules & decisions',
          items: [
            {
              type: 'doc',
              id: 'requirements/sprint-2-feature-matrix',
              label: 'Sprint 2 feature matrix',
            },
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
            {
              type: 'doc',
              id: 'requirements/card-evolution-rules',
            },
          ],
        },
        {
          type: 'category',
          label: 'Player journeys',
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
              id: 'requirements/player-asynchronous-pvp-journey',
            },
            {
              type: 'doc',
              id: 'requirements/player-location-journey',
              label: 'Location & Eligibility Journey (Sprint 1)',
            },
          ],
        },
        {
          type: 'category',
          label: 'Design & accessibility',
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
            {
              type: 'doc',
              id: 'design/state-review',
            },
            {
              type: 'doc',
              id: 'design/references/card-frames/README',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Technical reference',
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
            {
              type: 'category',
              label: 'System diagrams',
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
              label: 'Integrations',
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
                {
                  type: 'doc',
                  id: 'architecture/third-party-software-and-services',
                  label: 'Third-Party Software & Services',
                },
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'API contracts',
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
            {
              type: 'doc',
              id: 'architecture/campaign-scheduling-api-contract',
            },
            {
              type: 'doc',
              id: 'architecture/offline-challenge-play',
              label: 'Offline Challenge Play',
            },
          ],
        },
        {
          type: 'category',
          label: 'Data & database',
          link: {
            type: 'generated-index',
            slug: '/data-database',
          },
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
            {
              type: 'doc',
              id: 'database/movement-evidence',
            },
            {
              type: 'category',
              label: 'Persistence & analytics',
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
                {
                  type: 'doc',
                  id: 'database/account-deletion-retention',
                },
                {
                  type: 'doc',
                  id: 'database/campaign-scheduling-persistence',
                },
                {
                  type: 'doc',
                  id: 'database/question-performance-analytics',
                },
                {
                  type: 'doc',
                  id: 'database/verified-event-content',
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
              label: 'ADR Overview',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-001-monorepo',
              label: 'ADR-001 \u2014 Monorepo',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-002-separate-web-api',
              label: 'ADR-002 \u2014 Separate Web & API',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-003-postgresql-postgis',
              label: 'ADR-003 \u2014 PostgreSQL & PostGIS',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-004-map-provider-boundary',
              label: 'ADR-004 \u2014 Map Provider Boundary',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-005-auth0-authentication',
              label: 'ADR-005 \u2014 Auth0',
            },
            {
              type: 'doc',
              id: 'architecture/decisions/ADR-006-poor-gps-presence-fallback',
              label: 'Poor-GPS Fallback (Evaluation)',
            },
          ],
        },
        {
          type: 'category',
          label: 'Technical evaluations',
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
      ],
    },
    {
      type: 'category',
      label: 'Development & operations',
      link: {
        type: 'generated-index',
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
          id: 'development/documentation-site',
        },
        {
          type: 'category',
          label: 'Local data setup',
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
          label: 'CI & deployment',
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
          label: 'Database operations',
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
      label: 'Testing & evidence',
      link: {
        type: 'generated-index',
        slug: '/testing-quality',
      },
      items: [
        {
          type: 'doc',
          id: 'testing/testing-strategy',
          label: 'Testing Strategy & Policy',
        },
        {
          type: 'category',
          label: 'Sprint 2 feedback & follow-up',
          items: [
            {
              type: 'doc',
              id: 'testing/sprint-2-validation-status',
              label: 'Sprint 2 test & release status',
            },
            {
              type: 'doc',
              id: 'testing/sprint-2-user-testing-plan',
              label: 'Sprint 2 User Testing Plan',
            },
            {
              type: 'doc',
              id: 'testing/sprint-2-user-feedback-results',
              label: 'Sprint 2 User-Feedback Results',
            },
          ],
        },
        {
          type: 'category',
          label: 'Verification & release checks',
          items: [
            {
              type: 'category',
              label: 'Basic release evidence & templates',
              items: [
                {
                  type: 'doc',
                  id: 'testing/basic-release-validation-167',
                  label: 'Issue 167 Evidence Record',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-player-session',
                  label: 'Player Validation Script',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-accessibility-matrix',
                  label: 'Accessibility & Device Matrix',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-stakeholder-review',
                  label: 'Stakeholder Review Template',
                },
                {
                  type: 'doc',
                  id: 'testing/basic-release-findings',
                  label: 'Follow-up Finding & Retest Register',
                },
              ],
            },
            {
              type: 'doc',
              id: 'testing/basic-tier-deterministic-e2e',
              label: 'Basic-Tier Deterministic E2E',
            },
            {
              type: 'doc',
              id: 'testing/automated-verification',
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
            {
              type: 'doc',
              id: 'testing/player-account-lifecycle-validation',
            },
            {
              type: 'doc',
              id: 'testing/api-battle-responsiveness',
            },
            {
              type: 'doc',
              id: 'requirements/location-eligibility-field-test',
              label: 'Location Eligibility Field-Test Protocol',
            },
          ],
        },
        {
          type: 'category',
          label: 'Stakeholder & technical reviews',
          items: [
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/initial-client-meeting',
              label: 'Initial Client Meeting \u2014 Calvin Rea',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-04-database-usage-review',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review',
            },
            {
              type: 'doc',
              id: 'planning/stakeholder-interactions/2026-09-11-frontend-ui-review',
            },
            {
              type: 'doc',
              id: 'database/architecture-review-2026-09',
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Project & history',
      link: {
        type: 'generated-index',
        slug: '/project-management',
      },
      items: [
        {
          type: 'category',
          label: 'Methodology & governance',
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
          label: 'Plans & registers',
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
          ],
        },
        {
          type: 'category',
          label: 'Sprint 1 records (historical)',
          items: [
            {
              type: 'category',
              label: 'Release evidence',
              items: [
                {
                  type: 'doc',
                  id: 'testing/sprint-1-evidence-index',
                  label: 'Evidence Index',
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
            {
              type: 'category',
              label: 'Scrum records',
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
                  label: 'Daily Scrum 01 \u2014 Foundations',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-02',
                  label: 'Daily Scrum 02 \u2014 Integration Boundaries',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/backlog-refinement',
                  label: 'Backlog Refinement',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-03',
                  label: 'Daily Scrum 03 \u2014 Refinement Outcomes',
                },
                {
                  type: 'doc',
                  id: 'planning/scrum/sprint-1/daily-scrum-04',
                  label: 'Daily Scrum 04 \u2014 Basic-Tier Integration',
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
          ],
        },
        {
          type: 'category',
          label: 'Historical issue plans',
          items: [
            {
              type: 'doc',
              id: 'planning/wits-quest-sprint-2-gitea-issues',
              label: 'Historical Sprint 2 Gitea Issue Plan',
            },
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
