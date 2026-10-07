import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

type SidebarItemConfig = Extract<SidebarsConfig[string], unknown[]>[number];

// Navigation labels name the topic; page titles carry the full context.
const doc = (id: string, label: string): SidebarItemConfig => ({
  type: 'doc',
  id,
  label,
});

const category = (
  label: string,
  items: SidebarItemConfig[],
  overview?: string,
): SidebarItemConfig => ({
  type: 'category',
  label,
  collapsed: true,
  ...(overview ? { link: { type: 'doc' as const, id: overview } } : {}),
  items,
});

const meetings = (sprint: number): SidebarItemConfig =>
  category('Meetings', [
    doc(`planning/scrum/sprint-${sprint}/initial-planning`, 'Planning'),
    doc(
      `planning/scrum/sprint-${sprint}/daily-scrum-01`,
      sprint === 3 ? 'Snapshot 1' : 'Scrum 1',
    ),
    doc(
      `planning/scrum/sprint-${sprint}/daily-scrum-02`,
      sprint === 3 ? 'Snapshot 2' : 'Scrum 2',
    ),
    doc(
      `planning/scrum/sprint-${sprint}/backlog-refinement`,
      'Backlog refinement',
    ),
    doc(
      `planning/scrum/sprint-${sprint}/daily-scrum-03`,
      sprint === 3 ? 'Snapshot 3' : 'Scrum 3',
    ),
    doc(
      `planning/scrum/sprint-${sprint}/daily-scrum-04`,
      sprint === 3 ? 'Snapshot 4' : 'Scrum 4',
    ),
    doc(`planning/scrum/sprint-${sprint}/sprint-review`, 'Review'),
    doc(
      `planning/scrum/sprint-${sprint}/sprint-retrospective`,
      'Retrospective',
    ),
  ]);

// Small topic groups keep technical references and dated evidence findable
// without turning any expanded section into an inventory of every page.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    category(
      'Start here',
      [
        doc('basic-release-reference', 'About the game'),
        doc('development/getting-started', 'Getting started'),
        doc('requirements/basic-game-rules', 'Game basics'),
        doc('architecture/diagrams/index', 'Visual guide'),
      ],
      'index',
    ),
    {
      type: 'category',
      label: 'Players',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/player-guide',
        title: 'Player Guide',
        description:
          'Explore campus, complete challenges, collect cards, and battle.',
      },
      items: [
        doc('requirements/player-location-journey', 'Explore campus'),
        doc('requirements/player-challenge-journey', 'Challenges'),
        category('Cards and profile', [
          doc(
            'requirements/player-deck-building-journey',
            'Collections and decks',
          ),
          doc('requirements/card-evolution-rules', 'Evolution'),
          doc('requirements/card-trading-policy', 'Trading'),
          doc('design/profile-showcase', 'Profile'),
          doc('design/basic-card-roster', 'Card catalogue'),
        ]),
        category('Battles', [
          doc('requirements/player-cpu-battle-journey', 'CPU battles'),
          doc('requirements/player-asynchronous-pvp-journey', 'Player battles'),
        ]),
        category('Rules and progression', [
          doc('requirements/basic-tier-decision-register', 'Game decisions'),
          doc(
            'requirements/player-progression-rules',
            'Points and achievements',
          ),
          doc('requirements/ranked-competition-policy', 'Rankings'),
          doc('requirements/contested-campus-zone-policy', 'Territories'),
          doc('requirements/ordered-trails-rules', 'Trails'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'Authors',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/author-guide',
        title: 'Author Guide',
        description: 'Create, publish, moderate, and evaluate game content.',
      },
      items: [
        category('Content', [
          doc('architecture/diagrams/content-review', 'Review and publish'),
          doc(
            'architecture/author-curation-api-contract',
            'Events and questions',
          ),
          doc('architecture/campaign-scheduling-api-contract', 'Campaigns'),
          doc(
            'architecture/automatic-event-placement-service',
            'Event placement',
          ),
          doc(
            'requirements/automatic-event-placement-policy',
            'Placement rules',
          ),
        ]),
        doc('requirements/longitudinal-trust-policy', 'Moderation and trust'),
        category('Analytics', [
          doc('architecture/advanced-analytics-api-contract', 'API'),
          doc('database/question-performance-analytics', 'Question reports'),
          doc('database/advanced-analytics', 'Storage and privacy'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'Developers',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/developer-guide',
        title: 'Developer Guide',
        description: 'Set up, understand, test, and operate the system.',
      },
      items: [
        category('Setup', [
          doc('database/neon-postgis-setup', 'Neon and PostGIS'),
          doc('database/basic-demo-seed', 'Demo data'),
          doc('development/documentation-site', 'Documentation site'),
        ]),
        category(
          'Architecture',
          [
            doc('architecture/technology-stack', 'Stack'),
            doc('architecture/data-flow', 'Data flow'),
            doc('architecture/trust-boundaries', 'Security'),
            doc('architecture/external-integrations', 'Integrations'),
            doc(
              'architecture/third-party-software-and-services',
              'Third-party tools',
            ),
            doc('architecture/mapbox-standard-migration', 'Mapbox integration'),
            category('Diagrams', [
              doc('architecture/diagrams/system-context', 'System context'),
              doc(
                'architecture/diagrams/application-containers',
                'App, API and database',
              ),
              doc('architecture/diagrams/deployment', 'Deployment'),
              doc('architecture/diagrams/advanced-systems', 'Advanced systems'),
              doc(
                'architecture/diagrams/challenge-flow',
                'Challenges and rewards',
              ),
              doc(
                'architecture/diagrams/database-relationships',
                'Data relationships',
              ),
              doc(
                'architecture/diagrams/database-battles',
                'Battle relationships',
              ),
            ]),
          ],
          'architecture/overview',
        ),
        category(
          'Database',
          [
            category('Events', [
              doc('database/event-schema', 'Schema'),
              doc('database/event-eligibility', 'Eligibility'),
              doc('database/movement-evidence', 'Movement checks'),
              doc('database/ordered-trails-persistence', 'Trails'),
              doc('database/verified-event-content', 'Questions and sources'),
            ]),
            category('Players', [
              doc('database/player-schema', 'Accounts'),
              doc('database/player-progression-persistence', 'Progression'),
              doc('database/trust-persistence', 'Trust'),
              doc(
                'database/account-deletion-retention',
                'Deletion and retention',
              ),
              doc('database/developer-api-keys', 'API keys'),
            ]),
            category('Cards', [
              doc(
                'database/challenge-reward-persistence-design',
                'Rewards and cards',
              ),
              doc('database/saved-deck-persistence-design', 'Decks'),
              doc('database/card-trading-persistence', 'Trading'),
            ]),
            category('Battles', [
              doc('database/cpu-match-persistence-design', 'CPU battles'),
              doc('database/asynchronous-pvp-persistence', 'Player battles'),
              doc('database/live-pvp-persistence', 'Live PvP'),
              doc('database/ranked-competition-persistence', 'Rankings'),
              doc(
                'database/contested-campus-territory-persistence',
                'Territories',
              ),
            ]),
            category('Campaigns', [
              doc('database/campaign-scheduling-persistence', 'Schedules'),
              doc(
                'database/automatic-event-placement-persistence',
                'Event placement',
              ),
            ]),
            doc('database/architecture-review-2026-09', 'Review (Sep 2026)'),
          ],
          'database/overview',
        ),
        category('Decisions', [
          category(
            'Architecture records',
            [
              doc('architecture/decisions/ADR-001-monorepo', '001: Monorepo'),
              doc(
                'architecture/decisions/ADR-002-separate-web-api',
                '002: Separate web and API',
              ),
              doc(
                'architecture/decisions/ADR-003-postgresql-postgis',
                '003: PostgreSQL/PostGIS',
              ),
              doc(
                'architecture/decisions/ADR-004-map-provider-boundary',
                '004: Map boundary',
              ),
              doc(
                'architecture/decisions/ADR-005-auth0-authentication',
                '005: Auth0',
              ),
              doc(
                'architecture/decisions/ADR-006-poor-gps-presence-fallback',
                '006: Poor GPS (proposed)',
              ),
            ],
            'architecture/decisions/README',
          ),
          doc(
            'architecture/authentication-provider-comparison',
            'Auth providers',
          ),
          doc('architecture/map-provider-evaluation', 'Map providers'),
        ]),
        category('Interface', [
          doc('design/design-system', 'Design and accessibility'),
          doc('design/state-review', 'Feedback states'),
          doc('design/references/card-frames/README', 'Card frames'),
          doc('loading-policy', 'Loading'),
        ]),
        category('Testing', [
          doc('testing/testing-strategy', 'Strategy'),
          doc('testing/automated-verification', 'Database and E2E checks'),
          doc('testing/continuous-integration', 'CI workflows'),
        ]),
        category('Operations', [
          doc('deployment/azure-deployment-setup', 'Azure deployment'),
          doc('database/database-release-procedure', 'Database migrations'),
          doc('database/postgis-recovery-rehearsal', 'Database recovery'),
          doc('deployment/mapbox-operations', 'Mapbox'),
          doc('deployment/ranked-operations', 'Ranked competition'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'API',
      collapsed: true,
      link: {
        type: 'generated-index',
        slug: '/api-reference',
        title: 'API Reference',
        description: 'HTTP endpoints, authentication, and feature contracts.',
      },
      items: [
        doc('architecture/api-overview', 'OpenAPI'),
        doc('architecture/developer-api', 'Developer API'),
        doc('architecture/rate-limiting', 'Rate limits'),
        category('Players and challenges', [
          doc('architecture/player-profile-api-contract', 'Profiles'),
          doc(
            'architecture/challenge-attempt-api-contract',
            'Challenges and answers',
          ),
          doc('architecture/offline-challenge-play', 'Offline play'),
        ]),
        category('Battles and competition', [
          doc('architecture/asynchronous-pvp-api-contract', 'Player battles'),
          doc('architecture/live-pvp-api-contract', 'Live PvP'),
          doc(
            'architecture/ranked-matchmaking-api-contract',
            'Ranked matchmaking',
          ),
          doc(
            'architecture/contested-campus-territory-api-contract',
            'Territories',
          ),
        ]),
        doc('architecture/card-trading-api-contract', 'Trading'),
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
          'Process, sprint records, reviews, and validation evidence.',
      },
      items: [
        category('Process', [
          doc('planning/project-and-git-methodology', 'Methodology and Git'),
          doc('planning/work-tracking-and-issue-management', 'Issue tracking'),
          doc('planning/delivery-roadmap', 'Roadmap'),
          doc('planning/risk-register', 'Risks'),
          doc('planning/ai-use', 'AI use'),
          doc('planning/scrum/index', 'Meeting records'),
        ]),
        category(
          'Sprint 3',
          [
            doc('requirements/sprint-3-feature-matrix', 'Features'),
            doc('testing/sprint-3-validation-status', 'Validation status'),
            doc('testing/sprint-3-user-testing-plan', 'User testing plan'),
            doc('testing/sprint-3-user-feedback-results', 'User feedback'),
            doc('planning/sprint-3-governance-and-evidence', 'Governance'),
            meetings(3),
          ],
          'sprint-3-overview',
        ),
        category('Verification', [
          category('Basic release', [
            doc('testing/basic-release-validation-167', 'Results (#167)'),
            doc('testing/basic-tier-deterministic-e2e', 'E2E tests'),
            doc(
              'testing/basic-tier-release-validation',
              'Acceptance checklist',
            ),
            doc('testing/basic-release-player-session', 'Player test guide'),
            doc(
              'testing/basic-release-accessibility-matrix',
              'Accessibility checklist',
            ),
            doc('testing/basic-release-stakeholder-review', 'Review template'),
            doc('testing/basic-release-findings', 'Findings and retests'),
          ]),
          category('Live checks', [
            doc(
              'testing/deployed-auth-cors-privacy-review',
              'Auth and privacy',
            ),
            doc(
              'testing/player-account-lifecycle-validation',
              'Account lifecycle',
            ),
            doc('testing/api-battle-responsiveness', 'Battle responsiveness'),
            doc('testing/pvp-request-phase-timing', 'PvP request timing'),
            doc(
              'requirements/location-eligibility-field-test',
              'On-campus location',
            ),
          ]),
        ]),
        category(
          'Stakeholder reviews',
          [
            doc(
              'planning/stakeholder-interactions/initial-client-meeting',
              'Initial meeting',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-04-database-usage-review',
              'Database (4 Sep)',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review',
              'Trails and art (8 Sep)',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-11-frontend-ui-review',
              'Interface (11 Sep)',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-21-battle-performance-review',
              'Performance (21 Sep)',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-23-account-deletion-review',
              'Deletion (23 Sep)',
            ),
            doc(
              'planning/stakeholder-interactions/2026-09-25-territories-and-rate-limits-review',
              'Territories (25 Sep)',
            ),
          ],
          'planning/stakeholder-interactions/index',
        ),
        category('Archive', [
          category(
            'Sprint 2',
            [
              doc('requirements/sprint-2-feature-matrix', 'Features'),
              doc('testing/sprint-2-validation-status', 'Validation status'),
              doc('testing/sprint-2-user-testing-plan', 'User testing plan'),
              doc('testing/sprint-2-user-feedback-results', 'User feedback'),
              doc('planning/sprint-2-governance-and-evidence', 'Governance'),
              doc('planning/wits-quest-sprint-2-gitea-issues', 'Task plans'),
              meetings(2),
            ],
            'sprint-2-overview',
          ),
          category(
            'Sprint 1',
            [
              doc('testing/sprint-1-deterministic-e2e', 'E2E tests'),
              doc('testing/sprint-1-release-validation', 'Release validation'),
              doc('testing/sprint-1-demonstration-script', 'Demo script'),
              doc('testing/sprint-1-known-limitations', 'Known limitations'),
              category('Task plans', [
                doc(
                  'planning/wits-quest-sprint-1-gitea-issues',
                  'Initial backlog',
                ),
                doc('planning/sprint-1-week-2-gitea-issues', 'Week 2 backlog'),
              ]),
              meetings(1),
            ],
            'testing/sprint-1-evidence-index',
          ),
        ]),
      ],
    },
  ],
};

export default sidebars;
