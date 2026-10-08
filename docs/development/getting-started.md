---
title: 'Getting started'
description: Local setup, environment configuration, and verification for the Wits World workspaces.
---

# Getting started

## Prerequisites

- Git
- Node.js `24.14.1`
- npm `11.18.0`

The repository pins Node.js in `.nvmrc` and records the npm version in
`package.json`.

## Install dependencies

Clone the repository and install dependencies from the repository root:

```bash
git clone https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World.git
cd Wits-World
npm ci
```

If using nvm, run `nvm install` and `nvm use` before `npm ci`.
The root install covers all npm workspaces. Rerun it when the lockfile changes.

## Configure the game

The game uses a React/Vite Web application, a Fastify API, and Neon
PostgreSQL with PostGIS. Authentication uses Auth0; map rendering uses Mapbox.

Create the local environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

PowerShell equivalent:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Replace the example placeholders with development values. Both `.env` files
are ignored by Git. Restart the affected application after changing them.

### API environment

Configure these values in `apps/api/.env`:

| Setting                                         | Configuration                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                  | Development PostgreSQL/PostGIS connection.                                                                                              |
| `LISTENER_DATABASE_URL`                         | Direct, session-compatible connection to the same development database. Neon `-pooler` endpoints are not supported for this connection. |
| `TEST_DATABASE_URL`                             | Separate disposable database for integration tests. Configure its identity guard using the database setup guide.                        |
| Auth0 settings                                  | Development domain, API audience, SPA client ID, tenant domain, and Management API credentials.                                         |
| `CORS_ALLOWED_ORIGIN`                           | `http://localhost:5173` for the default Vite origin.                                                                                    |
| `ASYNC_PVP_CURSOR_SIGNING_KEY`                  | Random server-only secret of at least 32 bytes.                                                                                         |
| `MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND` | Reviewed movement threshold for the environment; there is no default.                                                                   |

Keep `RATE_LIMIT_BACKEND=local` and `GAMEPLAY_SCHEDULER_BACKEND=polling` for
local development. Offline challenge packs additionally require
`OFFLINE_PACK_SIGNING_KEY`; see the
[offline play contract](../architecture/offline-challenge-play.md).

The [Neon/PostGIS guide](../database/neon-postgis-setup.md) covers database
provisioning and test-target safeguards. The
[API README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/README.md#local-configuration)
defines the complete runtime configuration.

### Web environment

Configure these values in `apps/web/.env`:

| Setting                    | Configuration                                               |
| -------------------------- | ----------------------------------------------------------- |
| `VITE_API_BASE_URL`        | `http://localhost:3000/api/v1` for the local API.           |
| `VITE_AUTH0_DOMAIN`        | Development Auth0 domain matching the API configuration.    |
| `VITE_AUTH0_CLIENT_ID`     | Public SPA client ID matching the API's SPA configuration.  |
| `VITE_AUTH0_AUDIENCE`      | API audience matching the server configuration.             |
| `VITE_MAPBOX_ACCESS_TOKEN` | Public Mapbox token restricted to the approved web origins. |

`VITE_` values are bundled into browser code. Database credentials, private
keys, and Auth0 Management API secrets belong only in server configuration.
The [Web README](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/web/README.md)
covers Auth0 callback URLs and the full browser configuration.

## Initialise the database

From the repository root:

```bash
npm run prepare:api
npm run db
```

`prepare:api` builds the shared packages consumed by the API. `db` builds the
API, checks the development connection, applies migrations, and runs seeds.
Verify the development target in `DATABASE_URL` before executing it.
Database integration tests use the separate disposable test target.

## Start the game services

Run the API and Web in separate terminals from the repository root:

```bash
# API
npm run api
```

```bash
# Web
npm run view
```

| Service             | Local endpoint                                                                       |
| ------------------- | ------------------------------------------------------------------------------------ |
| Web application     | [http://localhost:5173](http://localhost:5173)                                       |
| API health          | [http://127.0.0.1:3000/health](http://127.0.0.1:3000/health)                         |
| Interactive OpenAPI | [http://127.0.0.1:3000/documentation/](http://127.0.0.1:3000/documentation/)         |
| OpenAPI JSON        | [http://127.0.0.1:3000/documentation/json](http://127.0.0.1:3000/documentation/json) |

## Run the documentation

The Docusaurus workspace runs independently of the game services:

```bash
npm run start --workspace @wits-world/docs -- --port 3001
```

Open [http://localhost:3001/docs/](http://localhost:3001/docs/).
Markdown content lives in `docs/`; site configuration, navigation, and styling
live in `apps/docs/`. No environment configuration is required.

See [Maintaining the documentation site](documentation-site.md) for the
publishing and navigation workflow.

## Troubleshooting

| Symptom                           | Check                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Dependency installation fails     | Confirm the pinned Node.js/npm versions and run `npm ci` at the repository root.       |
| API startup rejects configuration | Replace required placeholders and empty values in `apps/api/.env`.                     |
| Database connection fails         | Verify credentials, target database, TLS settings, and the direct listener connection. |
| Authentication fails              | Verify the Auth0 domain, audience, SPA client ID, and allowed callback URLs.           |
| Browser requests fail             | Confirm API availability, `VITE_API_BASE_URL`, and exact-origin CORS configuration.    |
| Port binding fails                | Stop the conflicting process or update the port and any dependent URLs.                |

## Verification

Run the standard repository checks before review:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

For documentation-only changes:

```bash
npm run build --workspace @wits-world/docs
```

Additional browser and database checks are documented in the
[testing strategy](../testing/testing-strategy.md). The
[contributor guide](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/CONTRIBUTING.md)
defines the issue, branch, and pull-request workflow. Production configuration
is covered in the [deployment guide](../deployment/azure-deployment-setup.md).

---

This guide was created and edited with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].
