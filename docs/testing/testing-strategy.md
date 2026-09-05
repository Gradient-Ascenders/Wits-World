---
title: Testing strategy and policy
---

# Testing strategy and policy

## Question performance analytics

Issue `#184` adds service, route, client, and Author-workspace coverage for the 10-answer flagging boundary, exact and just-below 70% incorrect rates with non-misleading decimal display, larger samples, MCQ and ordering aggregation, part-way timeout exclusion of unseen snapshots, timeout counts, composed filters, genuine empty results, stale-page recovery to the last valid page, malformed filters, Author authorization, page bounds, closed aggregate response parsing, keyboard-accessible horizontal results, and edit navigation. The Author-only response deliberately retains exact small-sample aggregates; its residual narrow-filter inference risk and the remaining database query-plan gate are documented in [Question performance analytics](../database/question-performance-analytics.md).

## Purpose

Wits World uses the smallest test boundary that can reliably demonstrate a
behaviour, then adds broader integration or release evidence where a protected
cross-system journey requires it. Tests are part of an issue's implementation
and review; a passing unit suite is not treated as deployed, accessibility,
field, stakeholder, or production evidence.

This page records the practice implemented in the repository on 25 August 2026. It does not introduce a future test target or claim that an operator-run
check is automated in CI.

## Test layers

| Layer                                   | Current repository practice                                                                                                                                                                                                                                                                                                                     | Principal evidence                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure unit tests                         | Vitest exercises domain rules, validation, configuration, timing, security policy, and deterministic state transitions without a browser or external service. The `account-policy` and `game-rules` packages have their own suites.                                                                                                             | `packages/*/tests`, focused files under `apps/api/tests` and `apps/web/tests`                                                                                                              |
| Web component and client tests          | Vitest, jsdom, React Testing Library, `user-event`, and DOM matchers exercise rendered states, typed API clients, forms, focus movement, native keyboard interaction, and provider failure boundaries. Tests normally select controls by accessible role or name.                                                                               | `apps/web/tests` and `apps/web/vite.config.ts`                                                                                                                                             |
| API route and service tests             | Vitest and Fastify injection exercise route schemas, authentication, authorisation, safe errors, request validation, OpenAPI output, service rules, idempotency, and failure handling without opening a network listener. Authentication tests generate local keys and tokens rather than using a live Auth0 tenant.                            | `apps/api/tests`, especially `*.integration.test.ts` route suites                                                                                                                          |
| Database integration tests              | A dedicated runner enables PostgreSQL/PostGIS suites against `TEST_DATABASE_URL`. The tests use a disposable database created beneath the separate test target and cover migrations, constraints, transactions, concurrency, ownership, progression backfill, ordered trails, asynchronous PvP persistence, recovery, and geospatial behaviour. | `npm run test:database --workspace @wits-world/api` and `apps/api/scripts/run-database-tests.mjs`                                                                                          |
| Browser end-to-end tests                | Playwright covers integrated Web/API journeys. The deterministic Basic runner migrates and seeds the test database, starts the real Fastify and Vite applications, and controls Auth0 and Mapbox at their network boundaries. Separate smoke specifications exist for real configured integrations and focused browser behaviour.               | [Basic-tier deterministic E2E](./basic-tier-deterministic-e2e.md) and `apps/web/playwright`                                                                                                |
| Manual, accessibility, and field checks | Release records identify checks that require human judgement or physical context: responsive layout, touch, full keyboard and focus quality, screen-reader use, contrast, reduced motion, real Auth0/Mapbox behaviour, and campus location conditions.                                                                                          | [Basic release validation](./basic-tier-release-validation.md) and [location field-test protocol](../requirements/location-eligibility-field-test.md)                                      |
| Deployment and release validation       | Gitea Actions validates repository changes. Main-branch deployment jobs verify artifacts and smoke the deployed Web/API health boundaries. Documentation deploys through its own path-filtered workflow. Database releases remain explicitly operator-run.                                                                                      | [Continuous integration](./continuous-integration.md), [Azure setup](../deployment/azure-deployment-setup.md), and [database release procedure](../database/database-release-procedure.md) |

## Choosing the test boundary

- Put pure calculations, policies, and state transitions under unit tests.
- Use Web component tests for interface behaviour that does not require a real
  browser engine or service process.
- Use Fastify injection for HTTP authentication, validation, response, error,
  and OpenAPI contracts.
- Use the database suite when correctness depends on PostgreSQL/PostGIS,
  constraints, locks, transaction isolation, migration order, or SQL results.
- Use Playwright when routing, browser interaction, responsive layout, touch,
  keyboard behaviour, or the integrated player journey materially matters.
- Use a deployed smoke check only for the deployed boundary; do not describe a
  local result as production evidence.
- Use a reviewed manual or field record when automation cannot establish the
  quality being evaluated.

Protected game rules are tested at the API, rules-package, or database boundary.
The browser is tested for submitting player intent and rendering authoritative
responses, not for independently deciding eligibility, marking, rewards, deck
legality, trail progress, unlock state, or match outcomes.

Ordering-challenge web coverage validates the discriminated author and Player
API contracts, exact four-item authoring, pointer reordering, keyboard-operable
Move Up / Move Down controls and announcements, ordered submission intent,
double-submit prevention, timeout reconciliation, malformed payload rejection,
and API-supplied completed feedback. Server route, service, and database tests
remain the evidence for shuffling, answer locking, exact-sequence marking,
deadlines, score, completion, and explanation privacy.

Progression route tests verify authentication, Player Name setup, privacy
allowlists, month and pagination validation, current rank outside the selected
page, and closed OpenAPI schemas. Database tests verify points and achievement
backfill, duplicate and concurrent awards, Johannesburg streak boundaries,
competition ties, stable tie ordering, monthly/all-time reads, zero-point
players, and deleted-player exclusion. Completion-service tests additionally
prove that progression runs before commit and that an award failure rolls back
the owning challenge or CPU-match completion.

The asynchronous PvP database suite upgrades retained CPU progression through
migration `0028`, verifies private-state separation and lifecycle constraints,
and exercises unordered invitation uniqueness, immutable snapshots and history,
deadline indexes, all terminal outcomes, concurrent replay, and the
two-participant 25/0 activity awards. Issue `#220` adds cancellation actor,
receipt, retention, pagination, worker-skip, and accept/decline/expiry/account-
invalidation race coverage. Route and scheduler tests cover issue `#180`. Web client and component tests for issue `#181` cover closed privacy-safe
parsing, all invitation states, Player Name challenge creation, deck/Creature
selection with API validation errors, versioned actions, duplicate-click
protection, bounded cursor navigation, polling, stale recovery,
deadline/account forfeits, win/loss, hidden opponent information, and API
retry. Existing CPU match tests remain in the same focused regression run
because CPU and PvP share presentation without sharing their different
lifecycle contracts.

Author curation tests cover the five-state transition matrix across the four
original content types plus campaigns, draft-only edits, latest-submitter self-review denial, required
return reasons, readiness at approval and publication, optimistic concurrency,
transactional audit rollback, safe queue/history schemas, and exclusion of every
non-published state from Player paths. Database runs additionally cover migration
`0029` backfill/constraints, seed provenance, dependency races, and preservation
of attempts, rewards, ownership, decks, matches, and progression after
retirement. These database checks require the dedicated disposable test target;
they must not be redirected to development or production.

Campaign database tests additionally cover start-inclusive/end-exclusive
boundaries, effective event and trail windows, adjacent and overlapping member
reuse, concurrent approvals, publication/retirement races, review history, and
preservation of completed attempts and derived trail progress.

Author Web component/client tests cover queue parent-route context, required
return reasons and keyboard focus, lifecycle request bodies, lazy history reads,
campaign schedule and membership submission, and preservation of campaign form
input after a stale-version conflict. They also cover navigation-only queue
summaries, authoritative refresh after `CONTENT_STATE_CONFLICT`, confirmed
replacement of a preserved campaign draft, server-returned lifecycle feedback,
and read-only non-draft campaign edit deep links. Analytics UI tests remain
blocked with issue `#184` / S3-06; no mock analytics contract is used.

Impossible-journey tests separate the pure uncertainty-adjusted speed rule from
the PostgreSQL/PostGIS evidence path. API and Web tests cover neutral retries
and direct challenge-start enforcement. The disposable database suite covers
the forward migration, immutable audit, accepted-anchor selection, retention,
account deletion, idempotency, and concurrent requests. Physical campus and
transport-mode calibration remain manual evidence; automated tests do not prove
that a chosen production threshold is appropriate.

## Commands and data isolation

The normal repository quality set is:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

The root `npm test` command runs test scripts exposed by all workspaces. Database
integration tests are deliberately opt-in because they require PostgreSQL and
perform destructive setup inside a disposable database:

```bash
npm run test:database --workspace @wits-world/api
```

The complete deterministic Basic browser journey is also opt-in:

```bash
npm run test:e2e:basic
```

It requires `TEST_DATABASE_URL` and must never be pointed at the development or
production database. The runner applies migrations and the Basic fixture before
starting the browser scenario.

Real Auth0 Playwright flows use ignored local configuration and authentication
state. Tokens, credentials, connection strings, precise location evidence, and
browser auth state must not be committed or copied into reports.

## What CI runs

Pull requests targeting `main` and pushes to `main` run five parallel validation
jobs after a clean `npm ci`:

1. repository formatting check;
2. workspace linting;
3. workspace type checking;
4. Web and API Vitest coverage plus the documentation test script; and
5. Web, API, and documentation builds.

Coverage reports for the Web and API are retained as a workflow artifact, and a
successful main run updates the coverage badge. The repository does not
currently configure a minimum percentage threshold as a CI gate.

The CI test job does **not** directly run the `account-policy` or `game-rules`
package test scripts, the PostgreSQL/PostGIS database runner, or either
Playwright E2E runner. Package code receives indirect coverage through current
application tests, but that is not equivalent to executing the package suites.
Database and E2E evidence must therefore be run and recorded separately when
the change or release requires it. See [Continuous integration](./continuous-integration.md)
for the exact workflow and deployment triggers.

## Accessibility policy

Accessibility is divided between deterministic checks and human evaluation.
Current Web tests cover semantic names and roles, map-independent event access,
status and error presentation, form feedback, keyboard activation, and selected
focus behaviour. Focused Playwright scenarios cover real browser keyboard,
touch, overflow, and responsive behaviour where implemented.

The repository does not currently install or run `axe-core`, and it has no
automated screen-reader, contrast, reduced-motion, or complete accessibility
conformance suite. Those qualities require reviewed manual evidence at the
release boundary. A passing component or E2E suite must not be reported as full
accessibility acceptance.

## Manual and field evidence

Manual evidence should identify the commit or deployment, date, tester, device
or viewport, state exercised, expected result, observed result, and resulting
issue or decision. Sanitised screenshots or recordings may support the record,
but they do not replace the written outcome.

The location field-test protocol defines a repeatable real-device process, but
the repository does not currently contain completed campus results. The seeded
radius, location freshness, and accuracy-envelope interpretation remain
provisional until reviewed evidence is recorded.

Likewise, release documents list required screen-reader, keyboard, responsive,
Auth0, Mapbox, database-operation, and production checks without pre-claiming
their result.

## Asynchronous PvP verification

Asynchronous PvP changes require route tests for closed schemas, authentication,
safe errors, object-relative identity, and forbidden browser result fields;
service/database tests for real deck snapshots, replay receipts, hidden-state
projection, versioned actions, terminal progression, invitation invalidation,
voluntary-resignation replay and races, exact deadline precedence, and
account-deletion rollback. Invitation cancellation additionally requires
challenger-only authorization, exact replay/payload conflict, stale and terminal
rejection, immutable audit, no-match guarantees, stable pagination, and races
against acceptance, decline, expiry, and invalidation; scheduler tests cover immediate startup,
non-overlap, safe failure containment, and clean shutdown. The explicit
database runner uses only `TEST_DATABASE_URL`, provisions isolated temporary
databases, and must cover migrations `0028`, `0033`, `0037`, and `0038`. Route, client,
component, and Playwright coverage must also verify CORS-safelisted media-type
negotiation, legacy fallback, overdue-detail finalization, capability gating,
confirmation/focus behavior, repeated-click protection, and ambiguous-response
recovery. Cancellation UI tests must also retain later-page items, disable
duplicate submissions, treat absent `canCancel` as false, and reuse the same
submission ID after ambiguous delivery. Production or shared
database targets are not substitutes for this evidence.

## Performance and reliability evidence

The repository contains measured CI and deployment timing comparisons in
[Continuous integration](./continuous-integration.md). Those measurements led
to disabling a failing Gitea npm-cache path and moving Web/API artifact creation
to the higher-capacity validation runner. They are delivery-pipeline performance
evidence, not application latency, throughput, rendering, or database-query
benchmarks.

No general application performance baseline or load-test result is currently
recorded. A future benchmark must retain its scenario, data volume, environment,
tooling, result, analysis, and resulting change before the documentation can
claim an application performance improvement.

## Evidence and review rule

Each report must distinguish:

- an automated test that was actually executed;
- a CI run for a named commit;
- a deployed smoke check;
- a manual or field observation;
- stakeholder or user acceptance; and
- a planned check that has not yet run.

Known gaps stay explicit. Tests are added for material regressions, but the
repository does not pursue a test count or coverage percentage as a substitute
for demonstrating the acceptance criteria and protected invariants.

## AI declaration

This testing strategy was generated, edited, and reviewed with the assistance
of Codex[GPT-5], Codex[gpt-5.6-sol], Codex-CLI[GPT-5], and
Codex-CLI[gpt-5.6-sol medium].
Repository paths and workflow claims were checked against the current source;
this declaration is not test evidence.
