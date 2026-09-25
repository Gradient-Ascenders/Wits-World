---
title: 'Test strategy, commands and policy'
---

# Test strategy, commands and policy

## Question performance analytics

Issue `#184` adds service, route, client, and Author-workspace coverage for the 10-answer flagging boundary, exact and just-below 70% incorrect rates with non-misleading decimal display, larger samples, MCQ and ordering aggregation, part-way timeout exclusion of unseen snapshots, timeout counts, composed filters, genuine empty results, stale-page recovery to the last valid page, malformed filters, Author authorization, page bounds, closed aggregate response parsing, keyboard-accessible horizontal results, and edit navigation. The Author-only response deliberately retains exact small-sample aggregates; its residual narrow-filter inference risk and the remaining database query-plan gate are documented in [Question performance analytics](../database/question-performance-analytics.md).

## Advanced operational analytics

Issue `#278` adds focused service and Author-route tests for date/page validation,
authentication and Author authorization, event-location suppression, easy/problematic
question classification, immutable reward-ledger issuance, secondary rarity
suppression, and analytics writes that neither fail nor delay player responses.
`advanced-analytics-database.integration.test.ts` covers atomic concurrent hourly
aggregation, authoritative start/completion joins, ignored-location semantics, card
issuance independent of current ownership, rarity-inference suppression, and
representative query plans. Run that focused database suite locally after migration tests; the complete
database runner remains the Gitea PR gate.

Issue `#280` adds the protected Web presentation boundary. Focused component and
client tests cover the three advanced endpoints, strict privacy/suppression parsing,
server location modes and question classifications, inclusive UI date conversion to
the exclusive API boundary, composable question filters, server-provided rarity
summaries, accessible horizontal table equivalents for charts, independent
loading/empty/error recovery, and an explicit ordinary-Player denial regression for
`/author/analytics`. These are Web/API-contract tests only; they do not replace the
issue `#278` database integration and query-plan evidence.

## Purpose

Wits World uses the smallest test boundary that can reliably demonstrate a
behaviour, then adds broader integration or release evidence where a protected
cross-system journey requires it. Tests are part of an issue's implementation
and review; a passing unit suite is not treated as deployed, accessibility,
field, stakeholder, or production evidence.

This page records the practice implemented in the repository on 6 September 2026. It does not claim that an operator-run
check is automated in CI.

## Test layers

| Layer                                   | Current repository practice                                                                                                                                                                                                                                                                                                                                                      | Principal evidence                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure unit tests                         | Vitest exercises domain rules, validation, configuration, timing, security policy, and deterministic state transitions without a browser or external service. The `account-policy` and `game-rules` packages have their own suites.                                                                                                                                              | `packages/*/tests`, focused files under `apps/api/tests` and `apps/web/tests`                                                                                                             |
| Web component and client tests          | Vitest, jsdom, React Testing Library, `user-event`, and DOM matchers exercise rendered states, typed API clients, forms, focus movement, native keyboard interaction, and provider failure boundaries. Tests normally select controls by accessible role or name.                                                                                                                | `apps/web/tests` and `apps/web/vite.config.ts`                                                                                                                                            |
| API route and service tests             | Vitest and Fastify injection exercise route schemas, authentication, authorisation, safe errors, request validation, OpenAPI output, service rules, idempotency, and failure handling without opening a network listener. Authentication tests generate local keys and tokens rather than using a live Auth0 tenant.                                                             | `apps/api/tests`, especially `*.integration.test.ts` route suites                                                                                                                         |
| Database integration tests              | PR CI uses a per-job ephemeral PostGIS service with four workers. This covers migrations, constraints, transactions, concurrency, ownership, progression backfill, ordered trails, asynchronous PvP persistence, live PvP persistence, ranked competition persistence, longitudinal trust persistence, recovery, and geospatial behaviour without a shared remote test database. | `npm run test:database --workspace @wits-world/api` and `apps/api/scripts/run-database-tests.mjs`                                                                                         |
| Browser end-to-end tests                | Playwright covers integrated Web/API journeys. The deterministic Basic runner migrates and seeds the test database, starts the real Fastify and Vite applications, and controls Auth0 and Mapbox at their network boundaries. Separate smoke specifications exist for real configured integrations and focused browser behaviour.                                                | [Basic-tier deterministic E2E](./basic-tier-deterministic-e2e.md) and `apps/web/playwright`                                                                                               |
| Manual, accessibility, and field checks | Release records identify checks that require human judgement or physical context: responsive layout, touch, full keyboard and focus quality, screen-reader use, contrast, reduced motion, real Auth0/Mapbox behaviour, and campus location conditions.                                                                                                                           | [Basic release validation](./basic-tier-release-validation.md) and [location field-test protocol](../requirements/location-eligibility-field-test.md)                                     |
| Deployment and release validation       | Gitea Actions validates repository changes. PRs run migration/database suites against isolated ephemeral PostGIS and deterministic Basic E2E in a separate isolated PostGIS job. Main deployment jobs verify artifacts and deployed Web/API health. Production database releases remain a separate guarded operation.                                                            | [Automated verification](./automated-verification.md), [Continuous integration](./continuous-integration.md), and [database release procedure](../database/database-release-procedure.md) |

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

Card-evolution route tests cover bearer authentication, closed request schemas,
server-derived player ownership, new-versus-replayed status codes, safe domain
errors, and generated OpenAPI. The collection-client test accepts evolution
provenance without implementing the separate player UI. The disposable card
catalogue database suite covers migration `0042`, fixed target resolution,
newest eligible server selection, exact three-copy consumption, evolved-card
provenance and saved-deck point cost, invalid definitions, insufficient copies,
idempotent replay, saved-deck protection, forced-failure rollback, and
concurrent mutation serialization.

Collection component tests cover progressive evolution discovery, authoritative
owned/eligible/deck-locked quantities, preview and cancellation, explicit
confirmation, single-result reconciliation plus collection refetch, insufficient
and deck-locked states, stale conflict recovery, and recoverable API failures.
Card-client tests reject inconsistent counts and unexpected fields rather than
silently trusting or extending the server contract. Selling tests are not
present because issue #193 retired and deferred the selling-for-currency model;
there is no active selling API for the browser to exercise.

`apps/web/playwright/collection.config.ts` runs deterministic collection gallery
and evolution browser checks using the existing authenticated fixture mode.
Evolution coverage includes 390px, 768px, and 1440px layouts, reachable confirmation
controls, focus trapping/return, cancellation, preview failure, confirmation
failure, stale-copy recovery, saved-deck locks, and success with exact consumption.
Component regressions distinguish pending refresh from completed refresh, retry a
failed refresh without another mutation, and keep the sheet handle disabled during
submission. Browser screenshots are temporary evidence under
`/tmp/wits-world-collection-evidence`, not committed assets or live-backend proof.

Ordering-challenge web coverage validates the discriminated author and Player
API contracts, exact four-item authoring, pointer reordering, keyboard-operable
Move Up / Move Down controls and announcements, ordered submission intent,
double-submit prevention, timeout reconciliation, malformed payload rejection,
and API-supplied completed feedback. Server route, service, and database tests
remain the evidence for shuffling, answer locking, exact-sequence marking,
deadlines, score, completion, and explanation privacy.

The issue `#165` verified-content integration test provisions an isolated
database, applies the full migration history, and runs the content seed twice.
It checks the exact 10-event/100-question shape, five challenges of each format,
four public choices/items per question, private answer keys, source evidence,
availability states, all difficulty/time-limit categories, non-repeating
five-question selection, and compatibility with the canonical reward catalogue.
Factual wording, point/radius placement, and presentation still require the
documented independent manual review.

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
and read-only non-draft campaign edit deep links. Issue `#184` added the first
question-performance workspace coverage; issue `#280` extends that boundary with
privacy-safe advanced location, question, and card analytics UI/client tests.

The issue `#257` trust-persistence database suite upgrades a pre-`0046`
database and also verifies a clean migration. It covers private-only trust
relations, signal privacy/immutability, 90-day expiry, concurrent source
deduplication, score caps/bands, one-active-case concurrency, case-version audit
coupling, safe evidence surviving signal expiry, self-review denial,
false-positive provenance, seven-day restriction bounds, one appeal per
decision, different-Author appeal resolution, delayed audited governance
finalization, account-deletion cleanup, anonymous governance retention, and
retry-safe retention purge. It does not
claim that issue `#258` score calculation or enforcement is implemented.

Issue `#258` adds pure `trust-v1` policy tests for movement severity, exact
90-day integer decay, category/final caps, all review-band boundaries,
false-positive adjustments, deterministic calculation digests, and the rule
that weak opponent evidence alone remains non-severe. Restriction tests verify
neutral allow/deny capability checks, challenge-start tests prove a later hold
does not cancel an existing attempt, and CPU-action tests distinguish an
identical retry from conflicting submission-ID reuse only after rollback. The
offline database suite stores the new canonical submission digest and verifies
that reusing one client attempt identifier with changed payload is rejected and
produces only one deduplicated trust signal.

The `trust-scoring.integration.test.ts` disposable-database suite verifies
migration `0047`, concurrent signal deduplication, the three-conflict pattern,
score/case persistence without automatic restrictions, direct
`trust_decision_evidence` constraints, human-authored restriction enforcement,
resolved-case audit preservation, seven-day decay resolution, and reciprocal
completed-PvP pattern deduplication. Movement database coverage also verifies
that a committed `too_fast` decision produces only the non-precise derived
signal. The periodic scheduler has focused tests for cadence, overlap avoidance,
shutdown, and safe failure logging.

Database integration remains opt-in locally. A slow local database may use a
larger Vitest timeout for an individual focused suite without changing the
repository; the complete database runner and migration validation remain CI
evidence on the ephemeral PostGIS service.

Impossible-journey tests separate the pure uncertainty-adjusted speed rule from
the PostgreSQL/PostGIS evidence path. API and Web tests cover neutral retries
and direct challenge-start enforcement. The disposable database suite covers
the forward migration, immutable audit, accepted-anchor selection, retention,
account deletion, idempotency, and concurrent requests. Physical campus and
transport-mode calibration remain manual evidence; automated tests do not prove
that a chosen production threshold is appropriate.

## Contested territory

Issue `#270` adds focused unit/service coverage for `territory-v1` grant
validation, authoritative contribution decisions, deterministic owner selection,
canonical settlement digests, stale-settlement retries, owner-bonus outcomes,
and privacy-safe territory routes. Ranked route/service regressions cover the
optional territory claim while ordinary ranked queueing remains valid without a
claim. These tests deliberately keep browser-supplied ownership and influence out
of every request contract.

The disposable PostGIS regression boundary remains
`territory-persistence.integration.test.ts`: it applies migration `0054` after
`0053` and verifies the runtime relations alongside the existing contribution,
settlement, ownership, account-deletion, and concurrency invariants. Local
database work should stay focused on this file (and any directly failing ranked
integration suite); the complete multi-worker database runner remains Gitea CI
evidence because it is substantially faster than the normal local test target.
A passing automated suite does not replace physical field validation of campus
boundaries or reported-accuracy behaviour.

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

Pull requests targeting `main` run static analysis, Web/API coverage,
documentation tests, both shared-package test scripts, application builds, and
the four-worker migration/database job against a per-job ephemeral PostGIS
service, plus Basic Playwright E2E in a separate isolated PostGIS job, after
clean `npm ci` installations.
Pushes to `main` run the same non-database validation and explicitly execute
both shared-package suites before artifact/deployment work.

Coverage reports for the Web and API are retained as a workflow artifact, and a
successful main run updates the coverage badge. The repository does not
currently configure a minimum percentage threshold as a CI gate.

The ordinary main-push CI test job directly runs the `account-policy` and
`game-rules` package test scripts, but does not run the database or Basic
Playwright E2E gates. Pull-request validation has a separate isolated
PostgreSQL/PostGIS job that runs the complete database runner without remote
credentials or cross-PR contention. Database evidence therefore comes from
that named PR job.

Basic E2E is required in PR validation, with sanitized failure diagnostics,
and remains outside the main deployment workflow. There is no nightly or
manually dispatched remote verification workflow. See the
[automated verification matrix](./automated-verification.md) and
[Continuous integration](./continuous-integration.md) for exact triggers,
configuration, artifact privacy, and evidence limits.

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

Issue `#265` adds focused placement-planner and Author-route assertions plus Web
workspace tests for Author gating, server-provided coverage and separation
diagnostics, current/proposed/excluded/overridden rendering, the semantic table
fallback, confirmations, apply and override mutations, rollback, stale-state
refresh, map failure, loading/error/empty states, and keyboard activation. CSS
breakpoints keep the policy and controls before the map on narrow screens; the
real-device, screen-reader, contrast, and deployed Mapbox checks remain manual
release evidence.

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
databases, and must cover migrations `0028`, `0033`, `0037`, and `0039`. Route, client,
component, and Playwright coverage must also verify CORS-safelisted media-type
negotiation, legacy fallback, overdue-detail finalization, capability gating,
confirmation/focus behavior, repeated-click protection, and ambiguous-response
recovery. Cancellation UI tests must also retain later-page items, disable
duplicate submissions, treat absent `canCancel` as false, and reuse the same
submission ID after ambiguous delivery. Production or shared
database targets are not substitutes for this evidence.

## Live PvP persistence verification

Issue `#251` adds `apps/api/tests/live-pvp-persistence.integration.test.ts` to
the disposable database runner. The focused suite exercises the migration
upgrade path and rerun behavior, public/private separation, shared five-card
deck-snapshot rules, immutable history, ticket redemption and reuse,
participant connection-generation supersession, stale-generation rejection,
same-version write races, idempotency receipts, terminal completion sources,
account-deletion guards, transient cleanup boundaries, and recovery through a
fresh database pool.

Issue `#253` adds focused route, protocol, WebSocket-gateway,
deadline-processor, scheduler, and PostgreSQL-notification tests around the
realtime runtime. Gateway coverage includes synchronous handler attachment with
bounded queuing while asynchronous ticket redemption completes, spectator
mutation rejection, persisted-generation supersession, and participant intent
forwarding without client-owned outcomes. The existing live persistence suite
additionally exercises the runtime ticket service against the real database so
a newer redemption supersedes an older participant generation. Together these
cover closed client intent schemas, authenticated ticket routes, post-lock
persisted generations, deadline convergence, cleanup scheduling, and
multi-instance notification fan-out. Deployed WebSocket/proxy and two-instance
infrastructure verification remain deployment evidence rather than something a
unit test can claim.

For normal development, the focused live-PvP database file may be run against
`TEST_DATABASE_URL` before opening a draft pull request. The complete disposable
database runner remains the regression gate in PR CI. A successful CI run is
test-environment evidence only; it does not establish that migration `0044` or
its cleanup primitive was executed in production.

## Card-trade persistence verification

Issues `#275` and `#272` use
`apps/api/tests/card-trading-persistence.integration.test.ts` for the private
persistence and durable idempotency boundaries. The focused database suite
upgrades a pre-`0055` database containing existing ownership and deck references,
then applies `0055` and `0056` and checks create/revision submission replay,
conflicting submission reuse, exact-copy reservation conflicts, immutable offer-version approval
semantics, concurrent reservation attempts, final-acceptance/cancellation
serialization, saved-deck exclusion, exactly-once settlement/provenance, rollback
after an injected database failure, expiry and reservation release, `trust-v2` trade-hold invalidation, terminal immutability,
and account-deletion cleanup. The existing card-catalogue integration suite
adds regression coverage that trade-reserved copies are excluded from evolution
preview and destructive consumption until the reservation is released.

`apps/api/tests/card-trade-policy.test.ts` covers the pure rarity-point mapping
and input invariants without a database.
`apps/api/tests/card-trades-routes.test.ts` covers authenticated identity, closed
request schemas, recent-authentication acceptance proof, participant-safe
responses, neutral object-level authorization errors, and participant-only
listing. `apps/api/tests/card-trade-maintenance-scheduler.test.ts` covers startup
maintenance, cadence validation, and non-overlapping sweeps. During local development, run the
focused persistence suite against `TEST_DATABASE_URL` after migration tests and
then only the affected deck/evolution/match/trust/deletion regressions. The full
database runner remains the Gitea PR gate; this documentation does not claim
those checks passed until their execution evidence is recorded.

## Performance and reliability evidence

The repository contains measured CI and deployment timing comparisons in
[Continuous integration](./continuous-integration.md). Those measurements led
to disabling a failing Gitea npm-cache path and moving Web/API artifact creation
to the higher-capacity validation runner. They are delivery-pipeline performance
evidence, not application latency, throughput, rendering, or database-query
benchmarks.

No general application performance baseline or load-test result is currently
recorded. Issue `#278` is narrower: its advanced-analytics database suite defines a
repository target of less than 1,000 ms PostgreSQL execution time for each
representative query on its disposable fixture and requires indexed access for a
selective product-event date read. That focused target is not a production HTTP SLA
or evidence of general application performance. Any broader benchmark must retain
its scenario, data volume, environment, tooling, result, analysis, and resulting
change before the documentation can claim an application performance improvement.

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
of Codex[GPT-6], Codex[GPT-5], Codex[gpt-5.6-sol], Codex-CLI[GPT-5], and
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], and
ChatGPT-Web[GPT-5.6 Sol].
Repository paths and workflow claims were checked against the current source;
this declaration is not test evidence.

Page title clarified with assistance from Codex-CLI[GPT-6].
