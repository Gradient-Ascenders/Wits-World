---
title: 'Testing strategy'
description: Test layers, commands, evidence rules, and known limits for Wits Quest.
---

# Testing strategy

Wits World uses the smallest test that can prove a behaviour. Broader tests are
added when a feature crosses the browser, API, database, or an external service.

A passing unit test is not proof of deployment, accessibility, user acceptance,
or field behaviour. Each claim must match the type of evidence collected.

## Coverage profiles

`npm run coverage` remains the fast, database-free profile. `npm run
coverage:full` runs the same source coverage denominator and adds real
PostgreSQL/PostGIS integration tests. PR and main coverage jobs use the full
profile against their own ephemeral PostGIS service; database and Redis
coordination gates remain independent correctness checks.

For a local full run, explicitly supply the disposable PostGIS administration URL:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55434/postgres npm run coverage:full
```

The full API configuration refuses missing or remote test targets, bounds
database concurrency to four workers, and makes the ordinary database URL
unusable. Tests provision and drop their own databases. Do not use Neon or
production credentials for coverage.

Coverage summaries and LCOV are written under `coverage/<workspace>/`. The badge
uses total covered lines divided by total measured lines across all five
workspaces, not the average of their percentages. No source exclusions or lower
thresholds are used to raise a score. A percentage counts executed code, not
assertion quality or proof that every branch is correct.

The disposable administration role needs permission to create databases and
install PostGIS. Fixture-only timestamp setup also uses transaction-local
`session_replication_role`; the local container and CI service provide that
permission. These are isolated test-administration privileges, not permissions
required by the production application role. Services execute with integrity
triggers enabled; the timestamp helpers restore the normal mode before the
behaviour under test.

The pre-change baseline on 8 October 2026, at `e04bf0c`, was:

| Scope                                   | Line coverage |
| --------------------------------------- | ------------: |
| API, database-free                      |        65.12% |
| API, PostGIS-integrated                 |        83.95% |
| Web                                     |        82.74% |
| Game rules                              |        88.95% |
| Documentation and account policy        |          100% |
| Weighted repository, database-free      |        75.42% |
| Weighted repository, PostGIS-integrated |        83.40% |

The clean Web baseline passed 951 tests; the integrated API baseline passed
1,955 tests with seven environment-gated tests skipped. An earlier concurrent
profiling run timed out two existing Web tests; the sequential rerun passed.
Do not describe coverage gained by including already-existing database tests as
new test coverage: compare the integrated baseline with the integrated result.

The added regression scope covers database CLI target selection and failures,
Redis activity validation and safe errors, API startup/resource cleanup, live
PvP connection authority and persisted transitions, atomic trading and placement
rejections, ranked queue and season lifecycle, territory visibility/bonuses,
offline submissions, Author client contracts, profile editing, and mobile sheet
and save-bar interactions.

### Measured coverage improvement

The local result on 8 October 2026 (UTC) was measured on
`test/improve-application-coverage`, based on `e04bf0c`, with the branch changes
still uncommitted. The environment used Node.js 24.15.0, npm 11.12.1, and the
disposable local PostgreSQL 17 / PostGIS 3.5 container. npm was older than the repository's
specified 11.18.0; dependencies and the lockfile were not changed.

| Scope                           | Covered / measured lines | Line coverage | Passing Vitest tests |
| ------------------------------- | -----------------------: | ------------: | -------------------: |
| API, PostGIS-integrated         |           9,893 / 10,954 |        90.31% |                2,068 |
| Web                             |          12,832 / 14,321 |        89.60% |                1,165 |
| Game rules                      |                481 / 507 |        94.87% |                   49 |
| Documentation                   |                  10 / 10 |          100% |                    5 |
| Account policy                  |                  28 / 28 |          100% |                   16 |
| Weighted repository, full suite |          23,244 / 25,820 |        90.02% |                3,303 |

On the unchanged 25,820-line denominator, this is an increase from 83.40% to
90.02%, with 1,709 additional covered lines and 344 additional test cases.
Combined statement coverage is 88.60%, branch coverage 81.63%, and function
coverage 91.79%; the 90.02% figure is specifically **line** coverage.

The API run passed 195 files with seven Redis-coordination tests skipped; those
tests require the independent PostgreSQL/Redis gate. The Web run passed 102
files, and its three native static-server tests also passed. The three native
deployment-guard tests passed separately. The tests assert authoritative
results, rollback and release, rejected intent, recovery without duplicate
mutations, draft-loss prevention, and keyboard interaction; the application
source, schema, coverage exclusions, and thresholds were unchanged.

The full coverage scope can be reproduced using the command above. The local
measurement used the API full-profile step, the Web coverage step, and the
three shared-workspace coverage steps, then `npm run coverage:badge`. Inspect
`coverage/<workspace>/coverage-summary.json` and `lcov.info` for the measured
source, and `coverage/coverage.svg` for the generated 90.0% badge. The
database-free profile is a different execution scope and must not be presented
as the full-suite result. These are local results; the changed Gitea coverage
jobs have not yet run remotely.

### Post-rebase verification

On 8 October 2026 (UTC), the coverage branch was rebased onto `main` at
`827937e`. Its code/test commit `c03b4a9` was checked again after the upstream
artwork change. Web coverage passed 104 files and 1,169 tests, plus the three
native static-server tests, and measured **89.61%** (12,853 / 14,342 lines).
The API and shared-package source/tests were unchanged by the rebase, so their
verified reports above were retained.

The combined result is **90.03%** (23,265 / 25,841 lines), and regenerating the
badge produced **90.0%**. The additional 21 measured Web lines come from the
upstream artwork implementation, not a change to coverage exclusions. Preserve
the original baseline comparison above; this follow-up is not a claim that
upstream tests or coverage gains were added by this branch. These remain local
results; live badge publication requires successful main-branch CI after merge.

### Remaining test boundaries

- Auth0, Upstash and other external provider behaviour is simulated at public
  boundaries in application tests. Disposable PostgreSQL/Redis coordination
  tests and configured deployed smoke tests provide separate integration evidence.
- jsdom tests do not prove browser layout, touch-device rendering, canvas pixels,
  screen-reader quality or real map/geolocation behaviour. Keep Playwright,
  accessibility and campus field checks separate.
- V8 reports TypeScript execution, not SQL statement or migration coverage.
  Database constraint, rollback, concurrency and migration assertions are the
  evidence for SQL behaviour.
- Coverage is not a production load test, security audit, backup restore test or
  proof of behaviour during every possible multi-instance race or network failure.

## Test layers

| Layer                   | What it checks                                                                      | Main location                                    |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Unit tests              | Pure rules, validation, configuration, timing, and state changes                    | `packages/*/tests` and focused application tests |
| Web component tests     | Rendering, forms, API clients, keyboard use, focus, loading, and errors             | `apps/web/tests`                                 |
| API tests               | Authentication, permissions, schemas, errors, OpenAPI, and service rules            | `apps/api/tests`                                 |
| Database tests          | Migrations, constraints, transactions, locks, concurrency, SQL, and PostGIS         | `apps/api/tests/*.integration.test.ts`           |
| Browser tests           | Routing and complete Web/API journeys in a real browser                             | `apps/web/playwright`                            |
| Manual and field checks | Screen readers, visual quality, touch, real services, and campus location behaviour | Dated release and field-test records             |
| Deployment checks       | Built artifacts, public health, configuration, and smoke tests                      | Gitea Actions and deployment records             |

Database tests use disposable PostgreSQL/PostGIS databases. They must never use
development or production data.

## Choosing a test

- Use a unit test for a pure rule or state transition.
- Use a component test for interface behaviour that does not need a browser
  engine or live service.
- Use Fastify injection for HTTP validation, authentication, permissions,
  response schemas, and errors.
- Use a database test when correctness depends on SQL, constraints,
  transactions, locks, migration order, or PostGIS.
- Use Playwright for routing, responsive layout, touch, keyboard behaviour, or
  an integrated user journey.
- Use a deployed smoke test only for the deployed system.
- Use a manual or field record when human judgement or physical context is
  required.

Protected rules belong in the API, shared rule packages, or database. Browser
tests should prove that the interface sends player intent and displays the
server's result. They should not duplicate game authority in the client.

## Main commands

Run the normal quality set from the repository root:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

Run the database suite separately:

```bash
npm run test:database --workspace @wits-world/api
```

Run the deterministic Basic browser journey with:

```bash
npm run test:e2e:basic
```

Database and Basic E2E runs require `TEST_DATABASE_URL`. The runners create
isolated databases and apply migrations before testing. Real Auth0 browser
tests use ignored local configuration and saved authentication state. Never
commit tokens, credentials, connection strings, precise locations, or browser
authentication files.

## CI coverage

Pull requests to `main` run:

- formatting, linting, type checks, and workspace tests;
- Web and API coverage;
- documentation tests and builds;
- shared package tests;
- the database suite against an isolated PostGIS service; and
- the deterministic Basic Playwright journey against a separate database.

Pushes to `main` run the non-database validation and build deployment artifacts.
The exact triggers and jobs are listed in
[Automated verification](automated-verification.md) and
[Continuous integration](continuous-integration.md).

Coverage thresholds in configuration are targets for a test run. They are not
coverage results. A report must link the actual artifact for the named commit.

## Feature-specific coverage

Detailed feature guides record the special cases that their tests must cover.
This page does not repeat every test name or assertion.

| Feature area                   | Detailed evidence                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenges, rewards, and cards | [Challenge and reward storage](../database/challenge-reward-persistence-design.md), [card evolution rules](../requirements/card-evolution-rules.md)      |
| CPU and asynchronous battles   | [CPU match storage](../database/cpu-match-persistence-design.md), [asynchronous PvP](../architecture/asynchronous-pvp-api-contract.md)                   |
| Live and ranked battles        | [Live PvP](../architecture/live-pvp-api-contract.md), [ranked competition](../architecture/ranked-matchmaking-api-contract.md)                           |
| Trading                        | [Trade API](../architecture/card-trading-api-contract.md), [trade storage](../database/card-trading-persistence.md)                                      |
| Trust and moderation           | [Trust policy](../requirements/longitudinal-trust-policy.md), [trust storage](../database/trust-persistence.md)                                          |
| Territories and placement      | [Territory API](../architecture/contested-campus-territory-api-contract.md), [automatic placement](../architecture/automatic-event-placement-service.md) |
| Analytics                      | [Analytics API](../architecture/advanced-analytics-api-contract.md), [analytics storage](../database/advanced-analytics.md)                              |

## Accessibility

Automated Web tests cover semantic roles and names, form feedback, selected
keyboard paths, focus behaviour, and responsive states. Playwright covers real
browser behaviour for selected journeys.

The repository does not have a complete automated accessibility conformance
suite. Screen-reader quality, contrast, reduced motion, touch, and full
keyboard use still need reviewed manual evidence. Passing component or browser
tests must not be reported as full accessibility acceptance.

## Performance and reliability

CI timing and deployment timing measure the delivery pipeline, not application
speed. Feature-level query tests may set local targets, but those targets are
not production service-level agreements.

A performance result should record:

- the revision and environment;
- the scenario and data size;
- the tool and settings;
- warm or cold state;
- the measured result; and
- the change or decision that followed.

Without this context, a timing number is not useful evidence.

## Manual evidence

A manual record should name the revision or deployment, date, tester, device or
viewport, state tested, expected result, observed result, and follow-up issue.
Screenshots may support the record, but they do not replace a written outcome.

The [location field-test protocol](../requirements/location-eligibility-field-test.md)
defines the real-device campus procedure. A protocol is not a completed field
result.

## Reporting rule

Every report must label evidence as one of the following:

- a local automated test;
- a CI result for a named commit;
- a deployed smoke check;
- a manual or field observation;
- stakeholder or user feedback; or
- a planned check that has not run.

Known gaps remain visible. Test counts and configured thresholds do not replace
the acceptance criteria or protected invariants.

## AI declaration

This testing strategy was generated, edited, and reviewed with assistance from
Codex[GPT-6], Codex[GPT-5], Codex[gpt-5.6-sol], Codex-CLI[GPT-5],
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], and ChatGPT-Web[GPT-5.6 Sol].
It was rewritten in simpler language with assistance from Codex[GPT-5].
Coverage profiles and regression scope were updated with assistance from
Codex[GPT-5] and Luna subagents[gpt-6-luna]. This merge was reconciled with
assistance from Codex[GPT-6].
