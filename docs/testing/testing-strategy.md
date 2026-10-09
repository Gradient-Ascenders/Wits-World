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

## Interpreting results

A passing check supports the behaviour and environment it exercised. Test counts
and coverage percentages alone do not establish user acceptance, accessibility
conformance, or production performance. Coverage thresholds are configured
minimums; measured coverage comes from a completed run.

[CI workflows](continuous-integration.md) describes how the automated checks run
for pull requests and releases. Dated results remain separate from this strategy.

AI declaration: Rewritten with assistance from Codex[GPT-6].
