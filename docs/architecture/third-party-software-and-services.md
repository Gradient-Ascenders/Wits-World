---
title: 'Third-party tools and why we use them'
---

# Third-party tools and why we use them

## Scope

This page records the significant external software and operated services used
by the current Wits World repository, their purpose, and the repository-backed
reason for each selection. It is intentionally a curated architectural record,
not a copy of `package-lock.json` or a claim that every transitive package was
selected individually by the team.

Exact installed package versions remain pinned in the workspace manifests and
lockfile. Operational configuration, credentials, licences, quotas, and live
acceptance remain separate from selecting a dependency.

## Application and data software

| Software                                     | Current purpose                                                      | Why it fits Wits World                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React and React DOM                          | Component model and rendering for the player and Author interfaces   | Reusable components support the multiple authenticated journeys and their loading, error, and responsive states without combining browser presentation with server authority.                                                                                                                                                                                                        |
| Vite                                         | Web development server and production browser build                  | Provides a focused React/TypeScript build and an explicit boundary where only `VITE_*` values become browser-visible.                                                                                                                                                                                                                                                                |
| Wouter                                       | Client-side routing                                                  | Supplies the small SPA routing layer used for public, authenticated player, match, and Author routes.                                                                                                                                                                                                                                                                                |
| Fastify                                      | Hand-written TypeScript HTTP API                                     | Supports explicit plugins and routes, runtime schema validation, structured logging, request injection for tests, and independent deployment from the Web.                                                                                                                                                                                                                           |
| `@fastify/websocket` and `ws`                | Live PvP WebSocket transport                                         | Extends the existing Fastify server with explicit WebSocket routes while preserving PostgreSQL/API authority. The gateway uses `ws` through the Fastify plugin for bounded text messages, ping/pong heartbeat handling, close codes, and process-local socket delivery; persisted match state, deadlines, idempotency, and reconnect generations remain authoritative in PostgreSQL. |
| `@fastify/swagger` and `@fastify/swagger-ui` | Runtime OpenAPI 3.0.3 generation and an interactive public reference | Keeps the machine-readable contract connected to the schemas that validate actual routes instead of maintaining a separate endpoint catalogue.                                                                                                                                                                                                                                       |
| `@fastify/cors`                              | Exact-origin browser-to-API policy                                   | Makes the separate Web/API deployment boundary explicit while leaving authentication to bearer-token validation.                                                                                                                                                                                                                                                                     |
| `jose`                                       | JWT signature and claim verification                                 | Implements standards-based Auth0 access-token validation against the configured issuer, audience, expiry, algorithm, and key set without custom cryptography.                                                                                                                                                                                                                        |
| `pg`                                         | PostgreSQL connection pooling, transactions, and parameterised SQL   | Gives the API explicit control over SQL, locks, transaction boundaries, and PostGIS queries. The repository does not use an ORM or generated backend API.                                                                                                                                                                                                                            |
| PostgreSQL and PostGIS                       | Authoritative relational, transactional, and geospatial data layer   | PostgreSQL supplies constraints, indexes, transactions, and concurrency controls; PostGIS supplies server-side WGS 84 point storage and metre-based distance calculations. [ADR-003](./decisions/ADR-003-postgresql-postgis.md) records the decision and alternatives.                                                                                                               |
| Mapbox GL JS and Mapbox Standard             | Interactive campus-map presentation                                  | Supplies the implemented 3D-capable basemap, styles, controls, and attribution behind a provider boundary. It is a confirmed team-selected integration within the project's technology discretion and remains visual only, with an accessible event list and PostGIS authority. Licensing, token/privacy, usage/cost, and campus-data evidence remains operational.                  |
| Auth0 React SDK                              | Browser authentication integration                                   | Uses an established SPA provider flow rather than custom password handling. The API validates access tokens independently. [ADR-005](./decisions/ADR-005-auth0-authentication.md) records the provider comparison and decision.                                                                                                                                                      |
| Docusaurus                                   | Static public documentation application                              | Publishes version-controlled Markdown/MDX with curated navigation, stable routes, search-engine-readable pages, and broken-link failure during builds.                                                                                                                                                                                                                               |

The repository also contains two first-party workspace packages:
`@wits-world/account-policy` for shared Player Name rules and
`@wits-world/game-rules` for pure battle transitions. They are project code,
not third-party dependencies, but separating them prevents duplicate policy
implementations across applications.

The docs also use `@docusaurus/theme-mermaid` (matching Docusaurus 3.10.2),
which renders version-controlled Mermaid source as SVG diagrams. This keeps
database and architecture visuals reviewable alongside their contracts, supports
light/dark themes, and avoids a separately maintained drawing file. Mermaid is
loaded by the docs application, not by the player game.

## Engineering and quality tooling

| Tool                                                         | Current purpose                                                                              | Motivation                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                                   | Static checking across applications and shared packages                                      | Makes application, service, and client contracts explicit while retaining runtime validation for untrusted input.             |
| Vitest and V8 coverage                                       | Unit, component, route/service, and database test execution plus Web/API coverage reports    | Fits the TypeScript/Vite ecosystem and supports focused suites without requiring a listener for Fastify route tests.          |
| React Testing Library, `user-event`, jsdom, and DOM matchers | Web component behaviour and semantic interaction tests                                       | Encourages testing visible behaviour, accessible names, keyboard actions, and focus outcomes rather than component internals. |
| Playwright                                                   | Real-browser E2E and focused responsive, touch, keyboard, authentication, and journey checks | Covers behaviour that jsdom cannot reliably establish and supports the deterministic integrated Basic release journey.        |
| ESLint, typescript-eslint, and Prettier                      | Static quality rules and repository formatting                                               | Provides repeatable local and CI checks across the monorepo.                                                                  |
| Wrangler                                                     | Cloudflare Pages documentation deployment                                                    | Provides the current scripted deployment path for the generated Docusaurus build.                                             |

No `axe-core` dependency or automated axe scan exists in the current
repository. Accessibility evidence currently comes from semantic/component
tests, focused browser checks, and required manual evaluation as documented in
the [testing strategy](../testing/testing-strategy.md).

## Operated services

| Service                    | Current purpose                                                                                                                   | Selection and operational boundary                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth0                      | Hosted registration/sign-in, token issuance, custom production issuer, and account-management APIs used by backend lifecycle work | Avoids custom password storage and supports SPA plus API token flows. Tenant settings, callbacks, DNS, email policy, Management API credentials, and live behaviour require operator evidence. |
| Mapbox                     | Hosts the Standard style and browser map resources                                                                                | Provides the implemented map presentation. Public tokens must be URL/scoped, attribution must remain, usage/licensing must be reviewed, and reported player location is not sent to Mapbox.    |
| Neon                       | Managed PostgreSQL/PostGIS for separate development, test, and production targets                                                 | Provides the required managed PostGIS-capable database. The API still owns migrations and SQL; backup, restore, inactivity, quota, and plan guarantees depend on operator/provider evidence.   |
| Azure App Service          | Independent Linux hosting for the Web and API                                                                                     | Matches the separate-application architecture and current Gitea artifact deployment. App Service settings hold API runtime secrets; managed identity limits deployment access.                 |
| Cloudflare Pages           | Public static hosting for Docusaurus                                                                                              | Supports the separately deployed, account-free documentation site through a path-filtered workflow.                                                                                            |
| Wits SDP Gitea and Actions | Git hosting, backlog/issues, pull requests, reviews, CI artifacts, and delivery automation                                        | Keeps project-methodology evidence and code review connected to Git while providing repository and host runner labels for validation and deployment.                                           |

Upstash Redis is also used through the existing `@upstash/ratelimit` and
`@upstash/redis` SDKs for shared HTTP quotas and durable gameplay activity
signals. The REST transport reuses server-only credentials; separate versioned
keyspaces keep rate-limit counters apart from persistent scheduling intents.
Gameplay state remains authoritative in PostgreSQL, whose advisory transaction
locks fence safe idle transitions. This permits idle DB workers to sleep without
depending on a process-local callback or a lossy notification. Redis command
budgets, outage handling, and staged activation are documented in
[rate limiting](./rate-limiting.md) and
[ranked operations](../deployment/ranked-operations.md). Adding this use does
not establish production CU savings or authorize a paid plan upgrade.

## Supporting dependencies and manifest coverage

Reviewed against the root, Web, API, docs and shared-package manifests on
14 September 2026. The main tables above cover the significant runtime and
service decisions. The following groups complete the directly declared support
packages; they should not be confused with individually selected transitive
packages in the lockfile.

| Packages                                                                                                              | Purpose and motivation / current boundary                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@phosphor-icons/react`, `sonner`                                                                                     | Shared icon vocabulary and transient toast feedback. They keep status presentation consistent; persistent errors still need contextual recovery.                                                                                  |
| `motion`                                                                                                              | Card-evolution transitions with reduced-motion support; it presents authoritative results and does not decide them.                                                                                                               |
| `idb`, `vite-plugin-pwa`                                                                                              | IndexedDB transactions and service-worker/build integration for offline play. Local persistence supports recovery; rewards still require server reconciliation.                                                                   |
| `fake-indexeddb`                                                                                                      | Controlled IndexedDB implementation for deterministic offline-storage tests.                                                                                                                                                      |
| `dotenv`, `tsx`                                                                                                       | Environment loading and TypeScript development execution for API/tooling. Keep local secrets outside Git; neither replaces production validation.                                                                                 |
| `@vitejs/plugin-react`                                                                                                | React transformation/development integration in Vite.                                                                                                                                                                             |
| `@docusaurus/core`, `@docusaurus/preset-classic`, `@mdx-js/react`                                                     | Documentation runtime, standard docs/theme features and Markdown/React rendering, avoiding a bespoke documentation platform.                                                                                                      |
| `clsx`, `prism-react-renderer`                                                                                        | Conditional CSS classes and code highlighting in the docs application.                                                                                                                                                            |
| `@docusaurus/types`, `@docusaurus/tsconfig`, `@docusaurus/module-type-aliases`                                        | Framework-aligned configuration typing and module resolution.                                                                                                                                                                     |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg`, `@types/geojson`                                      | Compile-time declarations for runtime and geographic boundaries. They do not add runtime validation.                                                                                                                              |
| `@testing-library/dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` | DOM simulation, accessible queries, interaction and assertions supporting the component-testing approach above.                                                                                                                   |
| `@playwright/test`, `@vitest/coverage-v8`, `@eslint/js`                                                               | Browser runner, coverage provider and baseline lint configuration supporting the documented testing/static-analysis tools.                                                                                                        |
| `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `embla-carousel-react`          | Declared root UI-toolkit dependencies, but this audit found no application imports. Their presence is not evidence of shipped dialogs, menus or carousels; continued retention needs an explicit use or later dependency cleanup. |
| `@docusaurus/faster`                                                                                                  | Declared docs build-optimisation package, but not enabled in the inspected configuration. Do not attribute measured build improvements to it.                                                                                     |

The [root manifest](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/package.json),
[Web manifest](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/web/package.json),
[API manifest](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/package.json),
[docs manifest](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/docs/package.json),
and [lockfile](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/package-lock.json)
are the version and transitive-dependency inventory. Upstream licence files and
service terms remain authoritative. This motivation inventory is not a completed
licence audit or a claim that every declared dependency is actively used.

## Documentation search

`@easyops-cn/docusaurus-search-local` provides full-text search over the built
documentation. It runs queries in the browser against a static index generated
by the docs build, without sending search queries to an external service or
requiring credentials. Its MIT licence and Docusaurus 3/React 19 compatibility
fit the existing docs app. The docs workspace owns its configuration and index
updates; see the [search maintenance guide](../development/documentation-site.md#search).

## Selection and review rule

A significant new dependency or service should have a concrete repository need,
an identified authority and data boundary, a licence/cost/security review
proportionate to its role, an operational owner, tests or failure handling, and
documentation in the natural architecture or operations section. A package is
not justified merely because it is popular, and a deployed service is not
accepted merely because the code can connect to it.

The [technology stack](./technology-stack.md) explains the overall stack, while
[external integration boundaries](./external-integrations.md) records the data
flows and evidence limits. Provider-specific details remain in their ADRs and
runbooks so this page does not duplicate volatile configuration.

## AI declaration

This curated third-party record was generated, edited, and reviewed with the
assistance of Codex[GPT-5]. Package and service claims were checked against the
current manifests, workflows, source, and existing operational documentation.

Direct-dependency coverage and motivations updated with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

Mermaid integration and motivation documented with assistance from Codex-CLI[GPT-6].

Local documentation search motivation documented with assistance from Codex[GPT-6].

`@fastify/websocket` and `ws` realtime transport motivation documented with
assistance from ChatGPT-Web[GPT-5.6 Sol].

Upstash gameplay coordination purpose and boundaries documented with assistance
from Codex-CLI[GPT-5].
