<p align="center">
  <img src="apps/web/src/assets/branding/wits-world-campus-seal-transparent.svg" alt="Wits World campus seal" width="160" />
</p>

# Wits World

[![Build](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml)
[![Coverage](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/raw/branch/coverage-badge/coverage.svg)](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-live-2ea44f?logo=readthedocs&logoColor=white)](https://wits-world-docs.pages.dev/)
[![Azure Web App](https://img.shields.io/badge/Azure-Live-0078D4?logo=microsoftazure&logoColor=white)](https://witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net/)
![Node.js](https://img.shields.io/badge/Node.js-24.14.1-339933?logo=node.js&logoColor=white)
![npm](https://img.shields.io/badge/npm-11.18.0-CB3837?logo=npm&logoColor=white)

Wits World is the project repository and development workspace for **Wits
Quest**, a mobile-friendly, location-based campus exploration game built for
the COMS3011A Software Design Project.

The names are intentional:

- **Wits World** means the repository, project, and technical workspace.
- **Wits Quest** means the game and player experience being built.

## Current status

Wits Quest lets players explore campus events, complete university-themed
challenges, collect cards, build decks, and play turn-based CPU matches. The
current repository includes:

- Auth0 sign-in and sign-out for the player web application;
- a responsive Wits World home page and protected `/explore` route;
- published event discovery through a versioned Fastify API;
- Mapbox campus-map presentation with an accessible text event list;
- one-shot browser geolocation requested only after a player action; and
- server-authoritative event eligibility backed by PostgreSQL/PostGIS;
- timed challenge attempts, authoritative answer marking, and atomic rewards;
- card collections, starter grants, and saved-deck management;
- deterministic CPU battles and completed-match history; and
- protected author content APIs and an author console.

The Sprint 1 release validation in issue #20 remains deliberately limited to
authentication, `/explore`, published event discovery, map and text
presentation, browser location claims, and server-authoritative PostGIS
eligibility. Later gameplay and authoring features are implemented in the
repository but are not part of that release claim.

## Architecture at a glance

| Area                      | Responsibility                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web`                | React/Vite player interface, authentication flow, map presentation, and browser interactions      |
| `apps/api`                | Fastify HTTP API, bearer-token validation, event discovery, eligibility, OpenAPI, and safe errors |
| `packages/account-policy` | Shared pure Player Name validation used by the Web and API                                        |
| `packages/game-rules`     | Pure server-consumable Creature and Power-card battle rules and deterministic state transitions   |
| PostgreSQL/PostGIS        | Authoritative event data, coordinates, radii, and distance calculations                           |
| Auth0                     | External identity authentication and access-token issuance                                        |
| Mapbox                    | Map tiles and visual presentation; it does not decide eligibility                                 |
| `apps/docs`               | Docusaurus site generated from the repository-level `docs/` directory                             |

The browser submits a location claim. The API validates it, obtains the event's
authoritative location from PostgreSQL/PostGIS, and returns the eligibility
decision. Browser state, map markers, and client-supplied eligibility values are
never authoritative.

## Getting started

### Prerequisites

- [Git](https://git-scm.com/)
- Node.js `24.14.1`
- npm `11.18.0`

The repository pins the Node.js version in `.nvmrc` and the npm version in
`package.json`. With [nvm](https://github.com/nvm-sh/nvm), use:

```bash
nvm install
nvm use
```

### Install dependencies

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
nvm use
npm ci
```

Local `.env` files are ignored by Git. Copy only the examples needed for the
workspace you are running.

### Run the web application

For the quickest UI-only start:

```bash
cp apps/web/.env.example apps/web/.env
npm run view
```

Open <http://localhost:5173>. Before testing authentication or the live map,
replace the public Auth0 SPA Client ID and Mapbox `pk.` token in
`apps/web/.env`. All `VITE_` values are browser-visible and must never contain
secrets.

The web application can display its setup state without a complete
configuration, but the protected event experience also needs a running API.
See the [web application guide](apps/web/README.md) for configuration,
authentication, map behaviour, routes, and browser checks.

### Run the full local slice

The API uses Neon PostgreSQL/PostGIS for development. A local Docker or
self-hosted PostgreSQL setup is not configured in this repository. Use separate
development and test database targets.

In one terminal, configure and start the API:

```bash
cp apps/api/.env.example apps/api/.env
# Set DATABASE_URL, TEST_DATABASE_URL, Auth0 values, and CORS_ALLOWED_ORIGIN.
npm run db:migrate --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api
npm run api
```

The API listens on <http://127.0.0.1:3000>.

In a second terminal, configure and start the web application:

```bash
cp apps/web/.env.example apps/web/.env
# Set the public Auth0 Client ID and Mapbox token.
npm run view
```

The API exposes these useful local endpoints:

- Health: <http://127.0.0.1:3000/health>
- Versioned API root: <http://127.0.0.1:3000/api/v1/>
- OpenAPI UI: <http://127.0.0.1:3000/documentation/>
- OpenAPI JSON: <http://127.0.0.1:3000/documentation/json>

See the [API guide](apps/api/README.md) and [Neon/PostGIS setup
guide](docs/database/neon-postgis-setup.md) for required values,
authentication, migrations, seeds, and troubleshooting.

### Run the documentation site

The documentation site does not currently require environment variables. Start
it on port 3001 so it can run alongside the API:

```bash
npm run start --workspace @wits-world/docs -- --port 3001
```

Open <http://localhost:3001>. Docusaurus reads its content from `docs/`.
The published site is available at
[wits-world-docs.pages.dev](https://wits-world-docs.pages.dev/).

## Repository structure

```text
.
├── apps/
│   ├── api/          Fastify API, authentication, event routes, and DB tooling
│   ├── docs/         Docusaurus documentation application
│   └── web/          React/Vite player web application
├── packages/
│   ├── account-policy/ Shared Player Name validation for Web and API
│   └── game-rules/    Pure Basic battle rules and deterministic state transitions
├── database/
│   ├── migrations/   Ordered PostgreSQL/PostGIS migrations
│   └── seeds/        Repeatable development and test fixtures
├── docs/             Architecture, requirements, design, planning, and operations
├── .gitea/workflows/ Continuous integration and deployment workflows
└── CONTRIBUTING.md   Branch, verification, commit, and AI-attribution standards
```

Application tests live beside their respective workspaces in `apps/web/tests`,
`apps/api/tests`, `packages/account-policy/tests`, and
`packages/game-rules/tests`.

## Development commands

Run these commands from the repository root:

| Command                         | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `npm run view`                  | Start the web development server                                            |
| `npm run api`                   | Start the API development server                                            |
| `npm run db`                    | Check, migrate, and seed the development database                           |
| `npm run prepare:api`           | Clean and build shared workspace packages required by the API               |
| `npm run validate:api:coverage` | Prepare shared API dependencies and run API coverage tests                  |
| `npm run validate:api:build`    | Prepare shared API dependencies and build the API                           |
| `npm run build`                 | Build all workspaces that expose a build script                             |
| `npm run lint`                  | Lint all application workspaces                                             |
| `npm run type-check`            | Type-check all application workspaces                                       |
| `npm test`                      | Run all workspace test suites                                               |
| `npm run test:e2e:basic`        | Run the disposable-database 21-step Basic release flow                      |
| `npm run coverage`              | Run web/API tests with V8 coverage and write reports under `coverage/`      |
| `npm run format:check`          | Check Prettier formatting without changing files                            |
| `npm run format`                | Apply Prettier formatting across the repository                             |
| `npm run verify`                | Format, then run formatting checks, linting, type checks, tests, and builds |

For a single workspace, use npm's workspace flag:

```bash
npm test --workspace @wits-world/web
npm run build --workspace @wits-world/api
npm run build --workspace @wits-world/docs
```

`npm run verify` intentionally formats files first. Use
`npm run format:check` when you need a read-only CI-style formatting check.

### Database commands

After configuring `apps/api/.env`:

```bash
npm run db:check --workspace @wits-world/api
npm run db:migrate --workspace @wits-world/api
npm run db:seed --workspace @wits-world/api
```

For a shortcut that runs all three commands in order, use:

```bash
npm run db
```

Test-database variants use `TEST_DATABASE_URL`:

```bash
npm run db:check:test --workspace @wits-world/api
npm run db:migrate:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api
npm run test:database --workspace @wits-world/api
```

The database integration test creates and removes temporary test data. Run it
only with a disposable test target; `TEST_DATABASE_URL` must not identify the
development database. The [database release procedure](docs/database/database-release-procedure.md)
defines the guarded workflow for release targets.

## Documentation map

Start with the guide that matches your task:

| Topic                                               | Guide                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| New developer setup and monorepo orientation        | [Developer guide](docs/development/getting-started.md)                                                    |
| Web configuration and player flows                  | [Web application guide](apps/web/README.md)                                                               |
| API routes, authentication, errors, and eligibility | [API guide](apps/api/README.md)                                                                           |
| System boundaries and responsibilities              | [Architecture overview](docs/architecture/overview.md)                                                    |
| Technology choices                                  | [Technology stack](docs/architecture/technology-stack.md)                                                 |
| Player location journey                             | [Location and eligibility journey](docs/requirements/player-location-journey.md)                          |
| Event schema and spatial rules                      | [Event schema](docs/database/event-schema.md) and [event eligibility](docs/database/event-eligibility.md) |
| Local Neon/PostGIS setup                            | [Neon/PostGIS guide](docs/database/neon-postgis-setup.md)                                                 |
| Design foundations                                  | [Design system](docs/design/design-system.md)                                                             |
| Delivery status and risks                           | [Delivery roadmap](docs/planning/delivery-roadmap.md) and [risk register](docs/planning/risk-register.md) |
| Gitea work and bug tracking                         | [Work tracking and issue management](docs/planning/work-tracking-and-issue-management.md)                 |
| Project and Git workflow                            | [Project and Git methodology](docs/planning/project-and-git-methodology.md)                               |
| CI checks                                           | [Continuous integration](docs/testing/continuous-integration.md)                                          |
| Basic release scope and public reference            | [Basic release reference](docs/basic-release-reference.md)                                                |
| Basic release evidence                              | [Basic-tier release validation](docs/testing/basic-tier-release-validation.md)                            |
| Azure deployment                                    | [Azure deployment setup](docs/deployment/azure-deployment-setup.md)                                       |
| Published documentation                             | [wits-world-docs.pages.dev](https://wits-world-docs.pages.dev/)                                           |

## CI/CD

Gitea Actions validates pull requests and pushes to `main` with formatting,
linting, type checking, tests, and builds for the web, API, and documentation
workspaces.

The web and API tests collect V8 coverage during the same CI test pass. Gitea
uploads the HTML, LCOV, and JSON summary files as the `coverage-reports`
artifact. After a successful push to `main`, the badge above is refreshed with
weighted line coverage across both applications.

Successful pushes to `main` can deploy the independently hosted applications:

- the web application deploys to [Azure App Service](https://witsworld-web-fqabhufqgvapapgq.southafricanorth-01.azurewebsites.net/), and the API deploys separately;
- the documentation site deploys to Cloudflare Pages; and
- production configuration and credentials remain outside the repository.

See the [CI guide](docs/testing/continuous-integration.md) and [Azure
deployment guide](docs/deployment/azure-deployment-setup.md) for operational
details.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting work. It covers the
issue-based workflow, branch naming, quality checks, commit prefixes,
pull-request evidence, accessibility expectations, and AI attribution.

## AI declaration

This repository uses AI code generation: ChatGPT-Web[GPT-5.6 Thinking],
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5], Codex[GPT-5], and
Codex[GPT-5.6 Sol].

This repository uses AI inline editing: Codex-CLI[gpt-5.6-sol medium],
Codex-CLI[GPT-5], Codex[GPT-5], and Codex[GPT-5.6 Sol].

This repository uses AI code review: Codex-CLI[gpt-5.6-sol medium],
Codex-CLI[GPT-5], Codex[GPT-5], and ChatGPT-Web[GPT-5.6 Sol].
