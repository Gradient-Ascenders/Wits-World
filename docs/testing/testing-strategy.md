---
title: 'Testing strategy'
description: Test layers, coverage priorities, and the role of manual validation.
---

# Testing strategy

Wits World tests game rules, interface behaviour, API contracts, and persistence
at the layer responsible for each decision. Integration and browser tests then
check how those layers work together.

## Test layers

| Layer                      | Main checks                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unit tests                 | Pure game rules, validation, timing, and state transitions                                            |
| Web component tests        | Forms, API clients, rendering, focus, loading, and recovery                                           |
| API tests                  | Authentication, permissions, request validation, response contracts, and service behaviour            |
| Database integration tests | Migrations, constraints, transactions, concurrency, persistence, and PostGIS queries                  |
| Browser tests              | Navigation and selected complete journeys in Chromium, including responsive and keyboard interactions |
| Documentation tests        | Page navigation, sidebar coverage, homepage behaviour, and site configuration                         |
| Runtime and tooling tests  | Static asset serving, caching, deployment guards, and verification utilities                          |

Vitest runs the unit, component, and API tests. Web component tests use React
Testing Library, API route tests use Fastify injection, and browser tests use
Playwright. Database tests exercise PostgreSQL and PostGIS directly.

## What receives particular attention

Tests cover both successful actions and the boundaries that protect game state:

- **Challenges and rewards:** location eligibility, saved answers, final marking,
  and prevention of duplicate rewards.
- **Cards and decks:** owned-copy selection, deck composition, evolution,
  reservations, and atomic trading.
- **Battles:** legal actions, persisted results, timeouts, reconnects, concurrent
  requests, rankings, and territory settlement.
- **Authoring and accounts:** permissions, content review, publication,
  player restrictions, deletion, and retention.
- **Interface behaviour:** keyboard controls, readable states, preserved drafts,
  failed updates, and recovery.
- **Offline and profiles:** saved-event storage, answer synchronisation,
  service-worker updates, responsive artwork, avatar editing, activity, and
  showcase ownership.
- **Operations and integrations:** gameplay scheduling, coordination,
  provider clients, API startup and cleanup, rate protection, static serving,
  and deployment guards.

The API and database enforce ownership, permissions, and game rules. Interface
tests check that the browser sends player intent and presents the confirmed
result.

## Running the workspace checks

After the [development setup](../development/getting-started.md), run these from
the repository root:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

The normal workspace test command does not enable the database integration or
browser suites. The full catalogue and
selection commands are covered in [Test suites](automated-verification.md).

## Coverage profiles

`npm run coverage` runs database-free workspace coverage. After configuring a
disposable local PostgreSQL/PostGIS target, `npm run coverage:full` adds the
full API integration scope and collects the other workspace reports. PR and
main CI use the integrated API profile; its setup is covered in
[Test suites](automated-verification.md#full-api-coverage).

Both profiles measure the same application source but execute different test
scopes. The combined badge weights covered lines across workspaces rather than
averaging their percentages. V8 measures TypeScript execution; database assertions
provide the evidence for SQL constraints, rollback, and concurrency.

## Manual and field validation

Automated checks are supplemented by real-device and human review for
screen-reader output, visual quality, touch interaction, browser zoom, campus
location behaviour, and external services.

Deterministic browser suites use controlled authentication and service
responses. Separate authenticated smoke checks exercise real sign-in, while
field GPS accuracy and broader provider availability require their own checks. PostgreSQL/Redis coordination tests exercise local
services; hosted-service reliability needs separate verification.

Manual observations should identify the tested revision, device, scenario, and
outcome. The [Sprint 1 field evidence](../planning/scrum/sprint-1/evidence.md#on-campus-field-evidence)
records the missing campus observations and links the historical protocol.
Use current eligibility rules for new checks; completed observations belong in
dated records.

For participant sessions, explain the purpose, voluntary participation, planned
tasks, retention, and right to skip or stop. Obtain separate consent for recording,
quotes, or screenshots. Use anonymous session codes and controlled test accounts;
keep raw notes, consent records, credentials, and precise locations out of public
evidence. Publish only sanitised summaries.

Observe tasks without coaching first, and record any assistance. Label each task
complete, assisted, incomplete, or not run on the named build and device. Keep
questionnaire self-reports separate from observed outcomes. Evaluate findings,
record an accept/defer/reject decision, link accepted work to its issue and change,
and retest the affected task. Stakeholder reviews should likewise record the
demonstrated scope, feedback, decision, remaining conditions, and actual sign-off;
an issue closure or planned review is not acceptance evidence.

## Focused loading and caching checks

### Author and Profile module loading

Issue `#358` Workstream 7 keeps the existing lazy page routes and adds boundaries
for the seven Author workspaces and the status editor's emoji catalogue. The
console shell, sidebar, retained reads and navigation guard stay mounted while
the destination workspace loads. Destination code starts alongside the console
and identity checks; importing code does not authorize or initiate protected
reads. Leaderboard imports its standings component independently of Profile.

`apps/web/playwright/lazy-loading.spec.ts` tests the optimized production bundle,
including direct routes, role denial, delayed and failed imports, reload recovery,
focus restoration, cached navigation and demand-cached deferred modules.
The normal experience-regression CI command does not include this separate
configuration. Run it explicitly alongside the relevant existing Author and
Profile journeys. Some existing Author visual cases write screenshots under
`.impeccable/`; preserve those files before running captures. For the existing
Player review case, `PLAYER_REVIEW_CAPTURE=none` skips its optional screenshots
while retaining the behavioral assertions. Existing component tests wait for the deferred emoji control to
be enabled before interacting with it; the dialog and text input do not wait for
the catalogue.

For a safe local build, use the existing `basic-e2e` Auth0/runtime fixture aliases
and synthetic public configuration; do not use real credentials or start an API:

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:3999/api/v1'
$env:VITE_AUTH0_AUDIENCE = 'https://lazy-e2e.invalid/api'
$env:VITE_AUTH0_CLIENT_ID = 'lazy-e2e-client'
$env:VITE_AUTH0_DOMAIN = 'lazy-e2e.invalid'
$env:VITE_MAPBOX_ACCESS_TOKEN = 'pk.lazy-e2e-not-used'
npm run build:bundle --workspace @wits-world/web -- --mode basic-e2e --manifest
Set-Location apps/web
npx playwright test --config=playwright/lazy-loading.config.ts
```

`LAZY_BUNDLE_DIRECTORY` optionally selects a preserved build outside the
repository. `LAZY_MEASURE=1` enables the three-run navigation comparison;
`LAZY_MEASUREMENT_FILE` selects its JSON artifact. Compare unchanged-main and
feature builds with identical fixtures, independently and without concurrent
tests/builds. The fixture responds to read-only API requests after 100 ms. Mobile
uses 390 × 844, DPR 3, fourfold CPU throttling, 150 ms network latency and
200,000 bytes/s download throughput; desktop uses 1440 × 1000, DPR 2, normal CPU
and loopback networking. Readiness means visible Home, populated Profile,
completed empty Battles summary, completed empty Author events, or completed
Analytics overview. Repeated visits reuse loaded modules while making fresh
route reads. Record incremental JavaScript requests/transfer and layout shifts.

Route-demand measurements block service workers to separate page-critical code
from background precaching. Workstream 7 alone left deferred modules precached;
Workstream 5 now installs only the supported offline JavaScript closure and
caches other build-allowlisted modules on demand. The offline test verifies
cached shell/chunk delivery and an already
loaded emoji picker; it does not imply offline Author API or Profile API support.
Fixture timings and build sizes are not deployed Auth0/API performance evidence.

This module-loading procedure was documented with assistance from Codex[GPT-6].

### Service-worker installation and demand caching

Issue `#358` Workstream 5 derives the essential JavaScript closure from emitted
entry, Home and OfflinePages chunks and their static imports. Missing build roots,
dependencies or manifest entries fail the build. All existing non-JavaScript
shell assets remain installed. Other exact same-origin build URLs are retained
only after successful requests; API, third-party and query-string traffic remain
excluded. Unit tests cover this selection, failed installation, immutable asset
reuse, demand-cache failures and activation cleanup.

Use two preserved `basic-e2e` production builds with identical synthetic public
configuration (as above), one from unchanged main and one from the feature tree.
Set `PRECACHE_BEFORE_DIRECTORY` and `PRECACHE_AFTER_DIRECTORY` to their absolute
paths, then run from `apps/web`:

```powershell
npx playwright test --config=playwright/precache.config.ts
```

The fixture server uses the production static server's compression and records
actual response-body and header bytes, including service-worker requests. Tests
cover first-use offline `/explore`, both prepared challenge formats, answer
reload persistence, failed sync and receipt recovery, on-demand module reuse,
failed first installation, failed upgrade, explicit activation and IndexedDB
preservation. Outputs use Playwright's isolated `test-results/precache` path,
never `.impeccable/`. This separate configuration is not included in normal CI.

`PRECACHE_MEASURE=1` enables three fresh installations per build and viewport.
Mobile uses 390 × 844, DPR 3 and fourfold CPU throttling; desktop uses 1440 × 1000,
DPR 2 and normal CPU. Both use loopback networking. Timings indicate visible Home,
worker control after successful installation and a warm saved-event navigation.
Report compressed response bodies separately from raw build-manifest bytes and
full allowlist counts separately from actually installed entries. These are local
fixture measurements, not production or real mobile-network results.

The two existing `offline.spec.ts` cases have baseline failures at the obsolete
`Saved on this device. Waiting for server validation.` assertion. This workstream
does not modify those tests or claim the complete offline suite is green. The
new tests independently verify persisted answers, retry and confirmed receipts.

This cache-policy verification procedure was documented with Codex[GPT-6]
assistance.

## Interpreting results

A passing check supports the behaviour and environment it exercised. Test counts
and coverage percentages alone do not establish user acceptance, accessibility
conformance, or production performance. Coverage thresholds are configured
minimums; measured coverage comes from a completed run.

[CI workflows](continuous-integration.md) describes how the automated checks run
for pull requests and releases. Dated results remain separate from this strategy.

AI declaration: Rewritten with assistance from Codex[GPT-6].
