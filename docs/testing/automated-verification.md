---
title: 'Test suites'
description: Workspace, database, browser, offline, visual, and authenticated test suites and how to select them.
---

# Test suites

Wits World has workspace tests, database integration tests, integrated browser
journeys, and focused browser suites. The catalogue below describes what is
available. [CI workflows](continuous-integration.md) identifies the subset run
automatically; a suite's presence does not mean it ran for a particular revision.

## Workspace suites

The repository-root `npm test` prepares shared API dependencies, runs the
deployment-guard tests, and then runs workspace tests:

| Suite             | Coverage                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Account policy    | Player Name normalisation, validation, and provider naming rules                                                                         |
| Game rules        | Battle actions, effects, type matchups, costs, and turn resolution                                                                       |
| Web               | API clients, pages, forms, map behaviour, offline storage and synchronisation, accessibility preferences, focus, loading, and recovery   |
| API               | Routes, authentication, permissions, game services, Author workflows, schedulers, cleanup, analytics, configuration, and error contracts |
| Documentation     | Sidebar coverage, site configuration, and homepage behaviour                                                                             |
| Web static server | Asset compression, caching, navigation fallback, and missing-file handling                                                               |
| Deployment guard  | Current-main validation and handling of superseded deployment revisions                                                                  |

Vitest runs application and shared-package tests. Node's test runner handles the
Web static server and deployment guard. Some API tests use Fastify injection with
controlled services; an `integration.test` filename does not by itself mean the
test connects to PostgreSQL.

The ordinary workspace command does not enable opt-in database tests or launch
browser suites. Use the relevant commands below for those layers.

## Database integration

The database runner applies migrations and checks persistence, constraints,
transactions, concurrent actions, and spatial queries against PostgreSQL/PostGIS.
Its selected suites cover events, challenges, cards, decks, battles, progression,
Author content, trading, trust, analytics, territories, placement, and cleanup.

Set `TEST_DATABASE_URL` to a dedicated test instance. Its account needs permission
to create temporary databases. Selected integration suites create and migrate
child databases, then remove them after the run.

From the repository root:

```bash
npm run prepare:api
npm run test:database --workspace @wits-world/api
```

The standalone runner uses an explicit file list. Profile and developer-API
persistence suites are selected by the full coverage profile used in PR and main
CI, although they are not in this standalone runner's list. They can also be
selected directly with the same test-database setup:

```bash
RUN_DATABASE_INTEGRATION_TESTS=true npm test --workspace @wits-world/api -- tests/player-profile-database.integration.test.ts tests/developer-api-persistence.integration.test.ts
```

### Full API coverage

The full profile runs API unit and opt-in PostgreSQL/PostGIS tests in one coverage
report, including profile and developer-API persistence. PR and main coverage
jobs provide their own isolated PostGIS services.

For a local run, explicitly configure `TEST_DATABASE_URL` for disposable local
PostgreSQL/PostGIS, with permission to create databases and install extensions:

```bash
npm run validate:api:coverage:full
```

This profile accepts local or isolated CI targets and rejects remote database
hosts. It does not fall back to the normal application database. Redis coordination
requires its separate service configuration and remains a separate CI check.

### Gameplay coordination

A separate integration suite exercises durable gameplay coordination using both
PostgreSQL and Redis, including competing workers and recovery boundaries.
Pull-request CI runs it with isolated services in the database job. It requires
its own service configuration and is additional to the general database command.
It does not establish hosted Redis availability or production performance.

## Integrated browser journeys

### Basic journey

The Basic suite starts the Web application and an API test harness backed by
PostgreSQL/PostGIS. Its main journey covers discovery, eligibility, challenges,
rewards, starter cards, saved decks, CPU battles, history, and Author publication.
Additional shell and Explore cases use mocked API responses.

Configure `TEST_DATABASE_URL` for a dedicated disposable database, then run from
the repository root:

```bash
npm run prepare:api
npx playwright install chromium
npm run test:e2e:basic
```

The runner builds the API, applies migrations, prepares test content, and starts
its servers. It prepares the configured database directly rather than creating
a child database for every suite. Use a test database without development or
production data. Authentication is controlled by the harness, and external
providers are excluded.

The canonical scenario has 21 sequential `test.step` blocks, described in the
[acceptance checklist](basic-tier-release-validation.md#the-21-step-journey).
It uses a fixed clock, controlled reward and CPU selection, and a unique
player/Author identity. The real HTTP, authorization, service, and database
boundaries remain exercised. The local token verifier and Mapbox module are
substitutes; this does not verify production Auth0, Mapbox, DNS, or deployment.

The seven tests comprise one database-backed scenario and six cases whose API
requests are intercepted in separate browser contexts. They run with four
workers in CI and two locally. Action and navigation limits are 15 and 30
seconds; ordinary tests have two minutes and the canonical journey eight.

Standalone preparation builds the API once, then uses compiled migration and
seed entrypoints with `--test`. CI can pass `--api-build-prepared` after preparing
the API; a missing prepared build fails before database preparation. Test source:
`apps/web/playwright/basic.deterministic.spec.ts`; API harness:
`apps/api/e2e/basic-server.ts`.

### Sprint 1 journey

`npm run test:e2e:sprint1` retains the earlier location/exploration slice.
It prepares `TEST_DATABASE_URL` with migrations and the idempotent Basic fixture,
then starts Fastify and Vite. It verifies published event discovery, reachable
and unreachable PostGIS results, denied permission, and the usable text list.
The configured test database is used directly and must be disposable and
separate from development and production.

Browser geolocation uses controlled coordinates, and the harness fixes the
clock and acquisition time. Auth0 verification and Mapbox are controlled;
unexpected provider requests fail the suite. The React application, HTTP/CORS,
local identity resolution, event services, and PostGIS remain real. The current
PR integration gate uses the broader Basic journey.

The Sprint 1 harness starts on ports 3001 and 5174 without reusing servers.
Failure screenshots/traces are in `apps/web/playwright/test-results/`, with
reports in `apps/web/playwright-report/`. Missing Chromium, occupied ports, or
an unreachable PostGIS target are setup failures, not a passing test. Historical
executions remain in the [Sprint 1 evidence](sprint-1-evidence-index.md).

## Focused browser suites

These suites use controlled authentication and API responses to exercise browser
behaviour without a live API database. Offline tests additionally build a preview
and use a real service worker. The configuration paths below are relative to
`apps/web`.

| Suite                      | Main checks                                                                                                         | Configuration                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Explore                    | Discovery, map/list interaction, location feedback, trails, and territories                                         | `playwright/explore.config.ts`     |
| Trails                     | Focused trail discovery and detail                                                                                  | `playwright/trails.config.ts`      |
| Author                     | Editors, publication controls, retained drafts, review, and analytics                                               | `playwright/author.config.ts`      |
| Account                    | Preferences, account controls, confirmation dialogs, and recovery                                                   | `playwright/account.config.ts`     |
| Collection and evolution   | Gallery presentation, card inspection, and evolution flows                                                          | `playwright/collection.config.ts`  |
| Starters and deck overview | Starter selection, affinity artwork, collection, and saved-deck overview                                            | `playwright.starter.config.ts`     |
| Trading                    | Trade lists, card inspection, and offer interactions                                                                | `playwright/trades.config.ts`      |
| Profile and progression    | Showcase editing, activity, achievements, and progression views                                                     | `playwright/progression.config.ts` |
| Battles                    | CPU, asynchronous player, and live battle interaction                                                               | `playwright.battle.config.ts`      |
| Offline and game artwork   | Offline shell and answers, sync recovery, responsive artwork, enlarged-text image quality, and achievement previews | `playwright/offline.config.ts`     |
| Typography                 | Font loading, reading preferences, enlarged text, and dialog reflow                                                 | `playwright/typography.config.ts`  |
| Card frames                | Rarity treatments across collection, inspection, decks, and battles                                                 | `playwright/card-frames.config.ts` |
| Loading                    | Startup, slow reads, retained refreshes, failed modules, and recovery                                               | `playwright/loading.config.ts`     |
| Feedback states            | Empty results, errors, permissions, retries, and confirmations                                                      | `playwright/states.config.ts`      |

After preparing the workspace and installing Chromium, select a configuration.
For example, from the repository root:

```bash
npm exec --workspace @wits-world/web -- playwright test --config playwright/loading.config.ts
```

Explore, Author, and Account also have a combined command used by pull-request CI:

```bash
npm run test:e2e:experience-regressions
```

A file labelled `visual` can include layout assertions and captured images.
That label alone does not imply automated screenshot-baseline comparison or
complete accessibility verification.

## Authenticated smoke checks

The default Playwright configuration supports real Auth0 sign-in against the
local Web and API services. It includes authenticated application smoke checks,
session restoration, Author access, and deck-management scenarios. Some of those
scenarios mock selected API responses after sign-in.

It requires the normal local services and ignored E2E account configuration.
Select a named test using the default configuration, for example:

```bash
npm exec --workspace @wits-world/web -- playwright test authenticated.smoke.spec.ts
```

The authentication setup supplies saved browser state, and session-restoration
checks run afterward. Saved authentication state and account credentials remain
local. These checks are separate from the deterministic PR browser gate.

## Results and privacy

Pull-request CI uploads a sanitised Basic verification summary and structural
failure diagnostics when available. The Basic journey disables screenshots,
video, and traces; focused suites can produce local images or traces, which are
not included in that summary upload.

Record the selected suite, revision, and environment with any result. See
[Testing strategy](testing-strategy.md) for evidence limits and manual validation,
and [CI workflows](continuous-integration.md) for automatic coverage.

AI declaration: Rewritten and expanded with assistance from Codex[GPT-6].

Integrated journey scope and setup consolidated with assistance from Codex[GPT-6], preserving the original Codex[GPT-5] and ChatGPT-Web[GPT-5.6 Sol] test-documentation attribution.
