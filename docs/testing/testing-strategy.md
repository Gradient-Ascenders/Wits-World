---
title: 'Testing strategy'
description: Test layers, commands, evidence rules, and known limits for Wits Quest.
---

# Testing strategy

Wits World uses the smallest test that can prove a behaviour. Broader tests are
added when a feature crosses the browser, API, database, or an external service.

A passing unit test is not proof of deployment, accessibility, user acceptance,
or field behaviour. Each claim must match the type of evidence collected.

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

This page was generated, edited, and reviewed with assistance from Codex,
Codex-CLI, and ChatGPT-Web models listed in its earlier revision. It was
rewritten in simpler language with assistance from Codex[GPT-5]. Repository
paths and workflow claims were checked against the current source.
