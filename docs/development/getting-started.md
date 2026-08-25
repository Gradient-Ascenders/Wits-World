---
title: Developer guide
description: Set up, understand, run, and verify the Wits World monorepo.
---

# Developer guide

This page is the public starting point for developing Wits World. It gives the
shortest safe path through the repository and links to the detailed README or
operational guide that owns each subject. The
[root README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/README.md)
remains the canonical repository-local setup reference.

## Prerequisites

Install:

- Git;
- Node.js `24.14.1`; and
- npm `11.18.0`.

The repository pins Node in `.nvmrc`, constrains Node and npm in `package.json`,
and records the npm release in `packageManager`. With nvm installed:

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
nvm install
nvm use
npm ci
```

Run npm commands from the repository root unless a guide explicitly says
otherwise. `npm ci` installs the lockfile-controlled dependency graph for every
npm workspace; do not run a separate install inside each application.

## Local configuration

Local `.env` files and their variants are ignored by Git. Copy only the example
for an application you intend to run:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

The Web file contains browser-visible `VITE_` configuration. Never put a client
secret, password, private key, database connection string, or private token in a
`VITE_` value. Replace its public Auth0 SPA Client ID and public, restricted
Mapbox token placeholders before testing those integrations.

The API file contains safe placeholders for database and server-side Auth0
configuration. Replace every required placeholder in the ignored file before
starting the full API. Development and test database URLs must identify
different targets. Do not copy real values into documentation, commits, test
output, screenshots, or issue/PR comments.

The documentation application currently needs no local environment values;
`apps/docs/.env.example` records that boundary.

Use the application guides for the complete configuration contracts:

- [Web application README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/web/README.md)
- [API README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/README.md)
- [Neon PostgreSQL and PostGIS setup](../database/neon-postgis-setup.md)

## Monorepo map

| Path                      | Responsibility                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web`                | React/Vite player and Author browser application, Auth0 integration, Mapbox presentation, and player interactions |
| `apps/api`                | Fastify API, authoritative application services, authentication/authorisation, and database tooling               |
| `apps/docs`               | Docusaurus application that renders the repository-level `docs/` content                                          |
| `packages/account-policy` | Shared pure Player Name validation used by Web and API                                                            |
| `packages/game-rules`     | Pure deterministic Basic CPU-battle rules consumed by the API                                                     |
| `database/migrations`     | Ordered, checksummed PostgreSQL/PostGIS schema changes                                                            |
| `database/seeds`          | Repeatable development and test fixtures                                                                          |
| `docs`                    | Public architecture, requirements, data, operations, testing, and project records                                 |
| `.gitea/workflows`        | Pull-request validation, main validation/deployment, and documentation deployment                                 |
| `scripts`                 | Repository-level preparation and reporting helpers                                                                |

Application code stays in its matching workspace. Shared packages contain code
that is genuinely used across a boundary; protected game decisions remain in
the API and database rather than moving into the browser.

## Start the applications

### Documentation

The documentation site is the smallest application to start and can run
without the Web, API, database, Auth0, or Mapbox:

```bash
npm run start --workspace @wits-world/docs -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001). Content comes from `docs/`;
site configuration and the curated sidebar live in `apps/docs/`. See the
[documentation workspace README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/docs/README.md)
before changing navigation or adding a page.

### Web

After creating `apps/web/.env`:

```bash
npm run view
```

Open [http://localhost:5173](http://localhost:5173). A UI-only start is useful
for public and setup states, but authenticated live journeys require the API,
its database, and the approved development integrations. The Web README owns
route, Auth0, Mapbox, browser-test, and manual verification detail.

### API and database-backed development

The repository's supported development entry point is Neon PostgreSQL with
PostGIS. It does not provide a local Docker or self-hosted PostgreSQL start
command. Follow the [Neon/PostGIS guide](../database/neon-postgis-setup.md) to
create separate development and test targets and configure `apps/api/.env`.

Prepare the development database:

```bash
npm run db
```

That root shortcut builds the API and then checks, migrates, and seeds the
development target. Applied migrations are immutable; add a new migration for
later schema evolution. Database integration or destructive verification must
use the separate disposable test target documented by the database guides.

Start the API:

```bash
npm run api
```

The example configuration serves the API at
[http://127.0.0.1:3000](http://127.0.0.1:3000). Useful local endpoints are
`/health`, `/api/v1/`, `/documentation/`, and
`/documentation/json`. The [API README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/README.md)
owns their exact contracts and the full runtime configuration.

Run `npm run view` in a second terminal for the complete browser-to-API slice.

## Verify a change

Use the smallest relevant workspace check while iterating. Before review,
normally run the root quality set:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

For example:

```bash
npm test --workspace @wits-world/web
npm run build --workspace @wits-world/api
npm run build --workspace @wits-world/docs
```

`npm run format:check` is read-only. `npm run verify` runs the formatter before
the checks and may rewrite files, so use it only when formatting changes are
intentional. Browser, database, release, and deployment changes have additional
targeted checks in their application or operational guides.

Read [Continuous Integration](../testing/continuous-integration.md) for the
Gitea Actions gates and [Work Tracking & Issue Management](../planning/work-tracking-and-issue-management.md)
before starting an issue branch or pull request.

## Continue with the canonical guide

- Repository standards and the issue-to-PR flow:
  [CONTRIBUTING.md](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/CONTRIBUTING.md)
- System responsibilities and authority boundaries:
  [Architecture overview](../architecture/overview.md)
- Database releases and recovery:
  [Database release procedure](../database/database-release-procedure.md) and
  [PostGIS recovery rehearsal](../database/postgis-recovery-rehearsal.md)
- Production hosting: [Azure deployment setup](../deployment/azure-deployment-setup.md)
- Testing layers and evidence: [Testing strategy](../testing/testing-strategy.md)

---

This developer guide was created and edited with assistance from Codex[GPT-5].
