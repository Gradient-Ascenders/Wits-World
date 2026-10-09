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

const sprintReport = (sprint: number): SidebarItemConfig =>
  doc(`planning/scrum/sprint-${sprint}/report`, 'Sprint report');

const sprint = (
  number: number,
  items: SidebarItemConfig[],
): SidebarItemConfig => ({
  type: 'category',
  label: `Sprint ${number}`,
  collapsed: true,
  link: {
    type: 'generated-index',
    slug: `/project/sprint-${number}`,
    title: `Sprint ${number}`,
    description: `Meetings and related Sprint ${number} material.`,
  },
  items,
});

// Small topic groups keep technical references and dated evidence findable
// without turning any expanded section into an inventory of every page.
const sidebars: SidebarsConfig = {
  docsSidebar: [
    category(
      'Start here',
      [
        doc('basic-release-reference', 'About the game'),
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
        doc('requirements/player-location-journey', 'Explore'),
        doc('requirements/player-challenge-journey', 'Challenges'),
        doc('requirements/ordered-trails-rules', 'Trails'),
        doc('design/profile-showcase', 'Profile'),
        category('Cards', [
          doc(
            'requirements/player-deck-building-journey',
            'Collections and decks',
          ),
          doc('design/basic-card-roster', 'Card catalogue'),
          doc('requirements/card-evolution-rules', 'Evolution'),
          doc('requirements/card-trading-policy', 'Trading'),
        ]),
        category('Battles', [
          doc('requirements/battle-rules', 'Battle rules'),
          doc('requirements/player-cpu-battle-journey', 'CPU battles'),
          doc('requirements/player-asynchronous-pvp-journey', 'Player battles'),
        ]),
        category('Game systems', [
          doc(
            'requirements/player-progression-rules',
            'Points and achievements',
          ),
          doc('requirements/ranked-competition-policy', 'Rankings'),
          doc('requirements/contested-campus-zone-policy', 'Territories'),
        ]),
      ],
    },
    {
      type: 'category',
      label: 'Authors',
      collapsed: true,
      link: {
        type: 'doc',
        id: 'design/author-guide',
      },
      items: [
        category(
          'Content',
          [
            doc(
              'architecture/author-curation-api-contract',
              'Events and questions',
            ),
            doc('design/author-cards', 'Cards'),
            doc('design/author-trails', 'Trails'),
            doc('architecture/campaign-scheduling-api-contract', 'Campaigns'),
            doc(
              'architecture/automatic-event-placement-service',
              'Event placement',
            ),
            doc(
              'requirements/automatic-event-placement-policy',
              'Placement rules',
            ),
          ],
          'architecture/diagrams/content-review',
        ),
        doc('requirements/longitudinal-trust-policy', 'Moderation and trust'),
        doc('design/author-analytics', 'Analytics'),
        doc('database/question-performance-analytics', 'Question reports'),
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
          doc('development/getting-started', 'Getting started'),
          doc('database/neon-postgis-setup', 'Neon and PostGIS'),
        ]),
        category(
          'Architecture',
          [
            doc('architecture/technology-stack', 'Stack'),
            doc('architecture/data-flow', 'Data flow'),
            doc('architecture/trust-boundaries', 'Security'),
            doc('architecture/external-integrations', 'Integrations'),
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
              doc('database/verified-event-content', 'Questions and sources'),
              doc('database/event-eligibility', 'Eligibility'),
              doc('database/movement-evidence', 'Movement checks'),
              doc('database/ordered-trails-persistence', 'Trails'),
              doc(
                'database/automatic-event-placement-persistence',
                'Event placement',
              ),
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
            doc('database/campaign-scheduling-persistence', 'Campaigns'),
            category('Analytics', [
              doc('database/advanced-analytics', 'Storage and privacy'),
              doc('database/question-performance-query', 'Question queries'),
            ]),
          ],
          'database/overview',
        ),
        category('Interface', [
          doc('design/ui-ux-design', 'UI/UX design'),
          doc('design/design-system', 'Accessibility'),
          doc('design/state-review', 'Interaction states'),
        ]),
        category('Testing', [
          doc('testing/testing-strategy', 'Strategy'),
          doc('testing/automated-verification', 'Test suites'),
          doc('testing/continuous-integration', 'CI workflows'),
        ]),
        category('Operations', [
          doc('deployment/azure-deployment-setup', 'Azure deployment'),
          doc('database/database-release-procedure', 'Database releases'),
          doc('deployment/ranked-operations', 'Gameplay workers'),
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
        doc('architecture/api-overview', 'Overview'),
        doc('architecture/rate-limiting', 'Rate limits'),
        category('Players and cards', [
          doc('architecture/player-profile-api-contract', 'Profiles'),
          doc('architecture/card-trading-api-contract', 'Trading'),
        ]),
        category('Challenges', [
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
        doc('architecture/advanced-analytics-api-contract', 'Author analytics'),
        doc('architecture/developer-api', 'External developer API'),
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
          doc('planning/work-tracking-and-issue-management', 'Work and bugs'),
          doc('planning/delivery-roadmap', 'Roadmap'),
          doc('planning/risk-register', 'Risks'),
          doc('planning/ai-use', 'AI use'),
        ]),
        category(
          'Sprints',
          [
            sprint(4, [sprintReport(4)]),
            sprint(3, [
              sprintReport(3),
              doc('sprint-3-overview', 'Milestone evidence'),
              doc('requirements/sprint-3-feature-matrix', 'Features'),
              doc('testing/sprint-3-validation-status', 'Validation status'),
              doc('testing/sprint-3-user-testing-plan', 'User testing plan'),
              doc('testing/sprint-3-user-feedback-results', 'User feedback'),
              doc('planning/sprint-3-governance-and-evidence', 'Governance'),
            ]),
            sprint(2, [
              sprintReport(2),
              doc('sprint-2-overview', 'Milestone evidence'),
              doc('requirements/sprint-2-feature-matrix', 'Features'),
              doc('testing/sprint-2-validation-status', 'Validation status'),
              doc('testing/sprint-2-user-testing-plan', 'User testing plan'),
              doc('testing/sprint-2-user-feedback-results', 'User feedback'),
              doc('planning/sprint-2-governance-and-evidence', 'Governance'),
            ]),
            sprint(1, [
              sprintReport(1),
              doc('testing/sprint-1-evidence-index', 'Release evidence'),
              doc('testing/sprint-1-known-limitations', 'Known limitations'),
            ]),
          ],
          'planning/scrum/index',
        ),
        category('Verification', [
          doc('testing/basic-tier-release-validation', 'Acceptance checklist'),
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
      ],
    },
  ],
};

export default sidebars;
