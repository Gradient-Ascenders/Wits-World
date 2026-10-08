---
title: 'Technology stack'
toc_max_heading_level: 4
---

# Technology stack

Wits World uses TypeScript across the Web application, API, shared packages,
and documentation configuration. npm workspaces manage these projects from
the repository root while keeping their builds separate.

The repository specifies **Node.js 24.14.1** and **npm 11.18.0**.
Use the checked-in `.nvmrc` and `packageManager` setting for a compatible setup.

## Overview

- **[Web application](#web-application):** React, Vite, and Wouter provide the
  screens and navigation. Interface components, Mapbox, and offline storage
  support interaction, campus maps, and pending attempts.
- **[API and database](#api-and-database):** Fastify handles requests,
  PostgreSQL and PostGIS store game state and perform spatial calculations,
  and Sharp processes images.
- **[Shared services](#shared-services):** Auth0 connects browser sign-in with
  API authentication. Redis supports shared quotas and gameplay coordination
  across API processes.
- **[Shared packages](#shared-packages):** Common battle rules and Player Name
  validation keep application behaviour consistent.
- **Project tools:** [Verification tools](#development-and-verification) check
  the implementation, and [Docusaurus](#documentation) publishes the documentation.

## Application stack

### Web application

#### React, Vite, and Wouter

React 19 provides the component model for Player and Author screens. Shared
components let forms, card displays, navigation, and loading states follow the
same patterns across features.

Vite 8 runs the Web development server and builds the production browser
bundle. Wouter maps application URLs to screens and supports navigation within
the single-page application. Together, they keep interface development and
routing in the Web workspace.

#### Interface components

React Aria Components supplies controls with keyboard interaction, focus
management, and accessible semantics. `@internationalized/date` provides
structured date and time values used by the Author scheduling controls.
Application styling and date/time policy remain in Wits World.

Phosphor Icons provides a consistent icon set. Motion supports transitions
such as card evolution, with reduced-motion handling, while Sonner presents
toast notifications. Persistent results and validation messages also appear
in the relevant screen.

#### Mapbox GL JS

Mapbox GL JS provides the interactive map renderer and 3D basemap support.
A shared adapter lets Explore and Author maps reuse the same rendering code.

[Mapbox integration](external-integrations.md#mapbox) covers styles, overlays,
and provider behaviour.

#### Offline storage and service worker

IndexedDB stores issued challenge packs, local attempts, and reconciliation
receipts. The `idb` library provides an asynchronous interface and transactions
for those related records, helping the Web recover pending work after a reload.

`vite-plugin-pwa` integrates the application's service worker and installable
manifest with the Vite build. The worker caches the application shell and
build assets; challenge records use their separate IndexedDB store.
[Offline play](offline-challenge-play.md) defines how pending attempts are
reconciled with the API.

### API and database

#### Fastify and API plugins

Fastify 5 hosts the HTTP API. Routes define request and response schemas,
while feature services handle gameplay and persistence. This structure makes
routes testable through Fastify's request-injection interface.

The Swagger plugins generate OpenAPI documentation from the route schemas,
keeping the HTTP reference connected to the implementation. The CORS plugin
controls permitted browser origins. The WebSocket plugin adds live battle
connections to the same API application.

TypeScript checks the API code during development and builds. `tsx` runs
the TypeScript development server. Runtime schemas still validate incoming
requests; compile-time types alone cannot check network input.

#### PostgreSQL, PostGIS, and `pg`

PostgreSQL stores relational game data, including ownership, challenge
attempts, and match history. Foreign keys, uniqueness constraints, transactions,
and locks support operations that must keep several records consistent.

PostGIS adds spatial types and queries for event distance, reviewed placement
sites, and campus boundaries. Geography-based distance calculations support
metre-based rules in the API.

The `pg` driver gives services direct control over parameterised SQL,
connection pools, and transaction boundaries. Schema changes use versioned
SQL migrations. The [database overview](../database/overview.md) links the
domain designs.

#### Sharp

Sharp processes uploaded profile images on the API. The implementation checks
the input, applies orientation, crops and resizes it, and produces a consistent
256 × 256 JPEG before storing the profile image.

Repository artwork scripts also use Sharp. Keeping this processing on the
server or in tooling gives the application a consistent image format and size.

### Shared services

#### Auth0 and token verification

The Auth0 React SDK provides browser authentication support; `jose` handles
JWT verification in the API. Using maintained authentication libraries keeps
this code focused on Wits World account and permission rules.

[Auth0 integration](external-integrations.md#auth0) covers authentication flows,
client configuration, and account-management requests; [Security](trust-boundaries.md)
covers validation and permissions.

#### Upstash Redis

The Upstash SDKs connect the API to Redis-backed request limits and gameplay
coordination. Shared counters allow quotas to apply across API instances.

[Upstash Redis integration](external-integrations.md#upstash-redis) covers the
exchanged records and operational links; [Rate limits](rate-limiting.md)
defines the operation-specific policies.

## Shared packages

`packages/game-rules` contains the battle engine used by CPU, asynchronous,
and live matches. It operates on validated snapshots and returns transitions;
API services supply its inputs and persist the results. Keeping battle
transitions in one package avoids separate implementations for each match mode.

`packages/account-policy` contains Player Name validation shared by the Web
and API. Browser feedback and server validation therefore use the same naming
rules.

Build the shared packages before dependent applications.
[Getting started](../development/getting-started.md) gives the setup commands.

## Development and verification

TypeScript checks application and package types. ESLint applies static code
rules, and Prettier keeps formatting consistent across workspaces.

Vitest runs unit, component, route, and database tests within the TypeScript
toolchain. React Testing Library and jsdom exercise Web interface behaviour;
Fastify injection exercises HTTP routes. `fake-indexeddb` provides controlled
offline-storage tests.

Database integration tests use isolated PostGIS databases. PR validation
supplies PostgreSQL 17 with PostGIS 3.5. Playwright covers real-browser journeys,
where browser behaviour and interactions need their own checks.

[Testing strategy](../testing/testing-strategy.md) and
[Continuous integration](../testing/continuous-integration.md) define commands
and test scope.

## Documentation

Docusaurus builds the public site from Markdown and MDX. It supplies navigation,
page rendering, and a separate static build, allowing documentation changes to
be reviewed alongside application changes.

Mermaid keeps diagrams editable as text next to their supporting references.
Local search generates its index with the site and runs queries in the browser.
The [documentation guide](../development/documentation-site.md) covers editing,
previewing, and publication.

## Dependency versions

Workspace `package.json` files declare dependencies; `package-lock.json`
records resolved versions. Use `npm ci` for a reproducible installation.
Those files remain the complete dependency and version reference.

See [System architecture](overview.md) for application responsibilities and
hosting, and [Integrations](external-integrations.md) for external service
connections.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[GPT-5],
Codex[GPT-5], Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], and Codex[GPT-6].
