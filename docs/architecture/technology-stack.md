# Technology Stack

## Purpose

This document records the initial Wits World technology stack and explains how
each technology supports the Wits Quest product and course requirements.

The stack is intended to support independently deployable applications, a
hand-written HTTP API, geospatial event checks, established authentication,
automated testing, CI/CD, and public documentation.

## Repository and runtime

| Technology | Purpose | Motivation |
| --- | --- | --- |
| Git and Gitea | Version control, issues, pull requests, reviews, and project tracking | Provides the required Git-compliant workflow and keeps development evidence linked to code changes |
| npm workspaces | Monorepo package and application management | Allows the web, API, documentation, and shared packages to be managed from one repository while remaining independently buildable |
| Node.js 24.14.1 | JavaScript and TypeScript runtime | Matches the version documented by the current repository setup |
| npm 11.18.0 | Dependency and workspace management | Matches the package-manager version documented by the current repository setup |
| TypeScript | Static typing across applications and shared packages | Reduces integration mistakes and allows contracts to be shared without removing runtime validation |

Runtime and package-manager versions should remain pinned and documented so all
team members and CI use compatible environments.

## Web application

| Technology | Purpose | Motivation |
| --- | --- | --- |
| React | Player and author interfaces | Supports reusable components and clear separation of interface responsibilities |
| Vite | Development server and production build tooling | Provides fast local development and a straightforward browser application build |
| React Router | Client-side routing | Supports public and protected application routes |
| Runtime environment validation | Validation of browser-visible configuration | Prevents the application from starting with malformed or missing public configuration |

The web application is located in `apps/web`.

It is responsible for presentation, browser interaction, map rendering,
geolocation requests, and displaying API decisions.

It is not authoritative for identity, event eligibility, rewards, card
ownership, or game outcomes.

## API application

| Technology | Purpose | Motivation |
| --- | --- | --- |
| Fastify | Hand-written HTTP API | Provides explicit route registration, validation integration, plugin boundaries, structured logging, and test injection |
| TypeScript | API types and implementation safety | Keeps route, service, and database interfaces explicit |
| OpenAPI | Machine-readable API documentation | Documents request schemas, response schemas, authentication requirements, and errors |
| Runtime schema validation | Validation of requests, responses, and configuration | TypeScript types alone do not validate untrusted runtime input |
| Structured request identifiers | Correlation of requests and failures | Supports safe debugging without exposing internal details to clients |

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

| Technology | Purpose | Motivation |
| --- | --- | --- |
| PostgreSQL | Primary relational database | Provides transactions, constraints, indexing, mature tooling, and reliable relational integrity |
| PostGIS | Geospatial event storage and distance calculations | Provides authoritative server-side geographic operations using stored event points |
| Drizzle ORM | Typed relational queries and migrations where appropriate | Provides explicit schema definitions while retaining control over SQL |
| Parameterised PostGIS SQL | Geospatial queries requiring database-specific functions | Keeps geospatial operations explicit and avoids trusting client-calculated distances |

PostgreSQL/PostGIS stores the authoritative event location and radius.

The browser submits a location claim. The API validates the claim and uses
PostGIS-backed logic to determine distance and eligibility.

Critical integrity rules must also be protected using database constraints and
transactions rather than relying only on the user interface.

## Authentication

The project will use an established authentication provider that supports:

- registration;
- sign-in;
- password reset;
- account-deletion capabilities;
- browser application integration;
- API access tokens;
- issuer and audience validation; and
- documented token-verification mechanisms.

The specific provider will be selected and recorded during the authentication
provider issue.

The application will not implement custom password storage or a custom password
reset system.

Public browser configuration may include:

- authentication domain or issuer;
- public browser client identifier;
- API audience; and
- redirect URLs.

Private authentication secrets must remain outside browser bundles and the Git
repository.

## Maps and location

| Technology | Purpose | Motivation |
| --- | --- | --- |
| MapLibre GL JS | Interactive browser map rendering | Provides an open-source client library that does not determine protected game outcomes |
| Licensed tile and style provider | Visual map data | Supplies the presentation layer required by the map interface |
| Browser Geolocation API | Device location claim | Allows the player to submit latitude, longitude, reported accuracy, and acquisition time |

The tile and style provider remains to be selected.

Map rendering is not authoritative. A marker appearing near an event does not
grant access to that event.

The API and PostgreSQL/PostGIS determine event eligibility.

## Testing

| Technology | Purpose | Motivation |
| --- | --- | --- |
| Vitest | Unit and integration tests | Works effectively with the TypeScript and Vite ecosystem |
| React Testing Library | Web interface behaviour tests | Encourages testing accessible behaviour rather than implementation details |
| Fastify injection | API integration tests | Tests routes without requiring an external network listener |
| Playwright | End-to-end browser journeys | Validates deployed or locally integrated player flows |
| axe-core | Automated accessibility checks | Detects common accessibility defects during development |
| Dedicated test database | Migration, query, and integration tests | Prevents tests from modifying normal development data |

Testing is part of implementation rather than a final-stage activity.

Sprint 1 testing must cover:

- API health;
- invalid configuration;
- authenticated and unauthenticated requests;
- valid and invalid tokens;
- database readiness;
- event discovery;
- inside and outside location claims;
- inactive and unpublished events;
- invalid coordinates;
- geolocation permission denial;
- map failure fallback; and
- the integrated deployed journey.

## Documentation

| Technology | Purpose | Motivation |
| --- | --- | --- |
| Markdown and MDX | Version-controlled documentation source | Keeps documentation reviewable alongside code |
| Docusaurus or the agreed equivalent | Public documentation website | Provides a static, account-free site generated from repository content |
| Mermaid | Architecture and process diagrams | Keeps diagrams version-controlled and editable as text |

The documentation application is located in `apps/docs`.

Source material may remain organised under the repository-level `docs`
directory and be incorporated into the public site through the documentation
build process.

## CI/CD

The CI/CD workflow will use the automation supported by the team's Gitea
environment and configured runner.

Pull-request checks should include:

- dependency installation;
- formatting;
- linting;
- TypeScript type checking;
- automated tests;
- web build;
- API build;
- documentation build; and
- relevant security or dependency checks.

Deployment must keep the web application, API, and documentation application
independently deployable.

Secrets must be supplied through repository or platform-managed secret storage.

## Deployment

The architecture requires:

- a static or web application host for `apps/web`;
- an application host for `apps/api`;
- a PostGIS-capable PostgreSQL host;
- static hosting for `apps/docs`;
- an authentication provider; and
- a licensed map tile and style provider.

The final providers remain open until their cost, free-tier limits, PostGIS
support, security, and deployment workflow have been evaluated.

## Shared packages

The monorepo may contain supporting packages such as:

| Package | Responsibility |
| --- | --- |
| `packages/contracts` | Shared API schemas or generated-safe types |
| `packages/game-rules` | Pure card, deck, and battle rules |
| `packages/config` | Shared linting, formatting, TypeScript, and testing configuration |

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

The following remain to be selected or confirmed:

- authentication provider;
- map tile and style provider;
- web hosting provider;
- API hosting provider;
- PostgreSQL/PostGIS hosting provider;
- documentation hosting provider;
- production logging and monitoring services;
- deployment secret-management approach; and
- backup and recovery approach.

Each significant selection should be captured in an architecture decision
record.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].