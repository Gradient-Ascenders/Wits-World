---
title: 'Technology stack'
---

# Technology stack

## Purpose

This document records the initial Wits World technology stack and explains how
each technology supports the Wits Quest product and course requirements.

The stack is intended to support independently deployable applications, a
hand-written HTTP API, geospatial event checks, established authentication,
automated testing, CI/CD, and public documentation.

## Repository and runtime

| Technology      | Purpose                                                               | Motivation                                                                                                                        |
| --------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Git and Gitea   | Version control, issues, pull requests, reviews, and project tracking | Provides the required Git-compliant workflow and keeps development evidence linked to code changes                                |
| npm workspaces  | Monorepo package and application management                           | Allows the web, API, documentation, and shared packages to be managed from one repository while remaining independently buildable |
| Node.js 24.14.1 | JavaScript and TypeScript runtime                                     | Matches the version documented by the current repository setup                                                                    |
| npm 11.18.0     | Dependency and workspace management                                   | Matches the package-manager version documented by the current repository setup                                                    |
| TypeScript      | Static typing across applications and shared packages                 | Reduces integration mistakes and allows contracts to be shared without removing runtime validation                                |

Runtime and package-manager versions should remain pinned and documented so all
team members and CI use compatible environments.

## Web application

| Technology                     | Purpose                                         | Motivation                                                                            |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| React                          | Player and author interfaces                    | Supports reusable components and clear separation of interface responsibilities       |
| Vite                           | Development server and production build tooling | Provides fast local development and a straightforward browser application build       |
| Wouter 3.10.0                  | Client-side routing                             | Supports public and protected application routes                                      |
| Runtime environment validation | Validation of browser-visible configuration     | Prevents the application from starting with malformed or missing public configuration |

The web application is located in `apps/web`.

It is responsible for presentation, browser interaction, map rendering,
geolocation requests, and displaying API decisions.

It is not authoritative for identity, event eligibility, rewards, card
ownership, or game outcomes.

## API application

| Technology                     | Purpose                                              | Motivation                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fastify                        | Hand-written HTTP API                                | Provides explicit route registration, validation integration, plugin boundaries, structured logging, and test injection                     |
| `@fastify/websocket` / `ws`    | Live PvP realtime transport                          | Adds bounded WebSocket upgrade/message handling to the existing Fastify process without making socket memory authoritative for battle state |
| TypeScript                     | API types and implementation safety                  | Keeps route, service, and database interfaces explicit                                                                                      |
| OpenAPI                        | Machine-readable API documentation                   | Documents request schemas, response schemas, authentication requirements, and errors                                                        |
| Runtime schema validation      | Validation of requests, responses, and configuration | TypeScript types alone do not validate untrusted runtime input                                                                              |
| Structured request identifiers | Correlation of requests and failures                 | Supports safe debugging without exposing internal details to clients                                                                        |

The API is located in `apps/api`.

All protected browser operations pass through versioned routes under `/api/v1`.

The API is authoritative for:

- validated player identity;
- application authorisation;
- event publication and availability;
- location-claim validation;
- event eligibility;
- challenge and reward rules;
- card and deck ownership;
- battle rules and outcomes; and
- safe error responses.

## Database and geospatial processing

| Technology                                                             | Purpose                                         | Motivation                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| node-postgres (`pg`)                                                   | PostgreSQL connection and parameterised queries | Matches the implemented API database layer and retains explicit control over SQL              |
| Repository SQL migration runner                                        | Applies ordered SQL migrations                  | Matches the implemented migration approach and keeps database changes explicit and reviewable |
| Parameterised PostGIS SQL                                              | Geospatial storage and calculations             | Keeps protected distance calculations server-side and prevents SQL injection                  |
| PostgreSQL/PostGIS stores the authoritative event location and radius. |

The browser submits a location claim. The API validates the claim and uses
PostGIS-backed logic to determine distance and eligibility.

Critical integrity rules must also be protected using database constraints and
transactions rather than relying only on the user interface.

## Authentication

The project uses Auth0 under ADR-005. The provider supports:

- registration;
- sign-in;
- password reset;
- account-deletion capabilities;
- browser application integration;
- API access tokens;
- issuer and audience validation; and
- documented token-verification mechanisms.

The API validates Auth0 access tokens and resolves local player identity and
roles from validated issuer and subject claims. The application does not trust
browser-supplied identity or role values.

Wits World does not store passwords. Account-deletion persistence and retention
are implemented server-side; issue `#161` adds the player-facing deletion entry
point and delegates database password recovery to Auth0's hosted capability.

Public browser configuration may include:

- authentication domain or issuer;
- public browser client identifier;
- API audience; and
- redirect URLs.

Private authentication secrets must remain outside browser bundles and the Git
repository.

## Maps and location

| Technology                   | Purpose                           | Motivation                                                                               |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| Mapbox GL JS 3.28.1          | Interactive browser map rendering | Provides Mapbox Standard 3D presentation without determining protected game outcomes     |
| Mapbox Standard              | Public basemap style              | Supplies the dusk/night-capable visual presentation and 3D basemap configuration         |
| Licensed Wits campus dataset | Optional project-owned map layer  | Adds verified campus features only after licensing and provenance review                 |
| Browser Geolocation API      | Device location claim             | Allows the player to submit latitude, longitude, reported accuracy, and acquisition time |

Mapbox GL JS with Mapbox Standard is the current implementation from issue #92.
The team confirms it as an allowed team-selected integration within the
project's implementation discretion. This does not claim that Calvin or the
lecturer approved Mapbox by name. Production token/CSP/privacy review,
licensing and cost ownership, usage monitoring, and any licensed Wits campus
dataset remain to be confirmed operationally.

Map rendering is not authoritative. A marker appearing near an event does not
grant access to that event.

The API and PostgreSQL/PostGIS determine event eligibility.

## Testing

The current test layers, commands, CI boundaries, and evidence rules are
maintained in the [testing strategy and policy](../testing/testing-strategy.md).

| Technology              | Purpose                                 | Motivation                                                                 |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Vitest                  | Unit and integration tests              | Works effectively with the TypeScript and Vite ecosystem                   |
| React Testing Library   | Web interface behaviour tests           | Encourages testing accessible behaviour rather than implementation details |
| Fastify injection       | API integration tests                   | Tests routes without requiring an external network listener                |
| Playwright              | End-to-end browser journeys             | Validates deployed or locally integrated player flows                      |
| Dedicated test database | Migration, query, and integration tests | Prevents tests from modifying normal development data                      |

Testing is part of implementation rather than a final-stage activity.
The durable strategy distinguishes unit, component, route, database, browser,
manual, field, and deployed evidence so historical Sprint 1 checks are not
mistaken for the complete current release policy.

## Documentation

| Technology       | Purpose                                 | Motivation                                                             |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Markdown and MDX | Version-controlled documentation source | Keeps documentation reviewable alongside code                          |
| Docusaurus       | Public documentation website            | Provides a static, account-free site generated from repository content |
| Mermaid          | Architecture and process diagrams       | Keeps diagrams version-controlled and editable as text                 |

The documentation application is located in `apps/docs`.

Source material may remain organised under the repository-level `docs`
directory and be incorporated into the public site through the documentation
build process.

## CI/CD

The current Gitea Actions workflows run clean dependency installation,
formatting, linting, TypeScript checking, Web/API coverage tests, and Web, API,
and documentation builds for pull requests and `main`. Main deployment uses
verified Web/API artifacts and health checks; documentation has a separate
path-filtered Cloudflare Pages workflow.

The current CI test job does not invoke the database integration runner,
Playwright E2E, or the shared-package test scripts directly. Those checks are
run separately when the change or release requires them. Exact workflow
triggers, runners, artifacts, and measured timings are documented in
[Continuous integration](../testing/continuous-integration.md).

Deployment must keep the web application, API, and documentation application
independently deployable.

Secrets must be supplied through repository or platform-managed secret storage.

## Deployment

The current deployment uses:

- Azure App Service for independently deployed `apps/web` and `apps/api`;
- Neon for production PostgreSQL/PostGIS;
- Cloudflare Pages for the Docusaurus `apps/docs` site;
- Auth0 for authentication; and
- Mapbox GL JS with Mapbox Standard for browser map presentation.

The deployment workflows and platform configuration document these selections.
Mapbox is a confirmed team technology choice, but licensing/terms, token
restrictions, privacy, usage, cost ownership, and campus-data readiness are not
implied merely by implementation.

## Shared packages

The monorepo currently contains these first-party supporting packages:

| Package                   | Responsibility                                                 |
| ------------------------- | -------------------------------------------------------------- |
| `packages/game-rules`     | Pure card, deck, and battle rules                              |
| `packages/account-policy` | Shared Auth0-compatible Player Name policy used by Web and API |

Shared packages must not combine the web and API into a single deployable
application.

Runtime validation remains necessary even where TypeScript types are shared.

## Technology constraints

The project must not:

- generate its required application API through a backend-as-a-service platform;
- trust browser-calculated eligibility;
- store private secrets in `VITE_` environment variables;
- implement custom password storage;
- expose database credentials to the browser;
- allow the map provider to determine protected outcomes; or
- couple the web and API so tightly that they cannot be built independently.

## Open technology decisions

The following remain to be confirmed or reviewed:

- Mapbox licensing/terms, production token/CSP/privacy, cost ownership, usage,
  and campus-data readiness evidence;
- production logging and monitoring services;
- ongoing credential rotation and least-privilege controls; and
- operational approval and evidence for backup and recovery.

Each significant selection should be captured in an architecture decision
record.

---

The preceding document was planned and generated with the assistance of
ChatGPT-Web[GPT-5.6 Thinking], updated with Codex-CLI[GPT-5], and reviewed and
edited for Sprint 1 release validation with assistance from
ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5], and
Codex-CLI[gpt-5.6-sol medium].

Page title clarified with assistance from Codex-CLI[GPT-6].

Live PvP realtime transport documented with assistance from
ChatGPT-Web[GPT-5.6 Sol].
