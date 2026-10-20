---
title: 'Azure deployment'
---

# Azure deployment

The Web application and API use separate Azure App Services. Web publication
requires successful same-commit API publication and contract verification. This
page covers their runtime configuration and release checks. The
[deployment diagram](../architecture/diagrams/deployment.md) shows the hosting
layout; [CI workflows](../testing/continuous-integration.md) explains validation
and release selection.

## Runtime configuration

Both applications use the Node.js version declared in `.nvmrc` and prebuilt
release artifacts. Configure HTTPS, Always On, and the startup command for each
App Service.

| Application | Startup command                          | Runtime behaviour                                                                                                                                     |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web         | `node /home/site/wwwroot/server.mjs`     | Serves the Vite build, compresses responses, caches hashed assets, and supports direct navigation to application routes. Missing assets return `404`. |
| API         | `/home/site/wwwroot/apps/api/startup.sh` | Extracts the packaged production dependencies and starts the compiled Fastify server.                                                                 |

The API artifact expects `BUILD_FLAGS=Off` and App Service build automation to
remain disabled. The API deployment workflow does not change its startup
command or verify `BUILD_FLAGS`; check these settings when provisioning or
changing the App Service.

Live battles also require the deployed HTTPS proxy to support WebSocket
upgrades. Check ticket redemption, reconnect, and deadline recovery through the
actual deployed route; an HTTP health response alone does not verify realtime
play.

## Configuration ownership

### Web build

Gitea repository Variables supply these values when the Web artifact is built:

```text
VITE_API_BASE_URL
VITE_AUTH0_DOMAIN
VITE_AUTH0_CLIENT_ID
VITE_AUTH0_AUDIENCE
VITE_AUTH0_DATABASE_CONNECTION (optional; defaults to Username-Password-Authentication)
VITE_MAPBOX_ACCESS_TOKEN
```

These values are visible in the browser. Changing an Azure runtime setting does
not change an existing Vite bundle; rebuild and redeploy the Web application.
[Integrations](../architecture/external-integrations.md) covers Auth0 origins
and Mapbox token configuration.

### API runtime

API App Service settings supply database connections, Auth0 validation and
Management API configuration, allowed Web origins, Redis credentials, signing
keys, and gameplay settings. `apps/api/.env.example` lists the supported
variables and defaults.

Use an explicit direct, non-pooled `LISTENER_DATABASE_URL` for PostgreSQL
notifications, alongside `DATABASE_URL` for ordinary queries. Production rate
limiting requires the Upstash backend. Keep database URLs, Management API
secrets, Redis tokens, and cursor-signing keys in server configuration.

The API's `CORS_ALLOWED_ORIGIN` must match the intended Web origin. Auth0's
callback, logout, and Web-origin settings must match the same application
configuration. Include the dedicated listener and deployment overlap when
checking database connection capacity.

The workflow also supplies maintenance intervals and maps the repository
Variables `PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND` and
`PRODUCTION_GAMEPLAY_WRITERS_COORDINATED` to a safe effective scheduler mode.
It retains polling unless Upstash is requested and writer retirement is
acknowledged, then applies and reads back the Azure setting after database
release succeeds. [Gameplay workers](ranked-operations.md) covers the rollout
and running-process verification.

## 9. Auth0 production URL configuration

Auth0 callback, logout, and Web-origin allowlists must use the exact application
origins. The browser's `/account/reset-password` flow also requires
`http://localhost:5173` and `https://witsworld.co.za` in the SPA's
**Allowed Origins (CORS)** for `/dbconnections/change_password`. Do not use a
wildcard. The recorded dashboard value is empty; applying these required CORS
entries and real reset-email delivery remain unverified operator checks.

The `www` hostname redirects before the SPA starts and is not a separate request
origin. `VITE_AUTH0_DATABASE_CONNECTION` is public build configuration and
selects the database connection, defaulting to `Username-Password-Authentication`.
[Authentication decisions](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/docs/architecture/decisions/ADR-005-auth0-authentication.md#password-reset)
explain the provider-owned reset flow.

## Deployment controls

Deployment jobs authenticate to Azure with the runner's managed identity.
Pull-request validation has no production deployment step. Eligible `main`
releases verify artifact integrity and reject a stale commit before changing
production.

The API job confirms the configured database host and name, then runs the
[guarded database release](../database/database-release-procedure.md) before
uploading the API artifact. A failed database release blocks the API deployment.
The release uses a direct migration connection even when runtime
`DATABASE_URL` uses Neon PgBouncer. Optional `MIGRATION_DATABASE_URL` credentials
must identify the same endpoint/database. Lock waits are limited to 30 seconds,
statements to five minutes, and the release command to six minutes; the release
step and API job have eight- and 15-minute timeouts. A timeout blocks deployment.
See [bounded release waits](../database/database-release-procedure.md#bounded-migration-connections-and-release-waits).

The workflow applies maintenance settings after successful database release and
before API publication. It does not seed event packs or create a ranked season.
The Web job requires same-commit API publication, health verification, and the
[compact Battles contract gate](../testing/continuous-integration.md#api-first-battles-contract-gate).
Web-only changes also publish an API artifact. Shared response changes must
still account for old browser tabs and the interval between releases.

Documentation follows a separate Cloudflare Pages workflow described in
[CI workflows](../testing/continuous-integration.md#documentation-publishing).

## Release verification

The automated API check waits for `/health` to return `200`. The Web check
verifies `/` and `/about`, then checks compression and immutable caching on the
hashed JavaScript entry asset.

Use a test account for the affected signed-in journeys after deployment:
confirm sign-in and logout, a protected API request, and the feature changed by
the release. For live-battle changes, include reconnect and API restart recovery.
Record the deployed commit and sanitised results without tokens, precise player
locations, or private responses.

If startup fails, inspect App Service startup logs and the required settings.
If a migrated API release cannot start, follow the database page's
[recovery guidance](../database/database-release-procedure.md#recovery)
before selecting an application rollback.

## Monitoring and maintenance

Session restoration uses early HTML connection hints for the configured Auth0
and API origins. Each API process also preloads public signing keys and refreshes
them before the normal key-cache expiry. The `auth_signing_keys_warmup` log event
records whether startup prefetch succeeded and its duration; refresh failures use
`auth_signing_keys_refresh`. A failure falls back to normal on-demand token
verification. Check request `auth` and `identity` timings separately when
investigating slow `/auth/me` calls; these server timings do not include browser
Auth0 restoration or network time.

### Service health

`/health` confirms that the API process accepts requests; it does not query
PostgreSQL, Redis, or Auth0. Monitor request failures and latency alongside
database connection errors, queued pool requests, long-held connections, and
Redis timeouts. A healthy process can still have a failing dependency.
[Rate limits](../architecture/rate-limiting.md) explains the effect of Redis
failures on different requests.

### Background maintenance

Routine maintenance uses at most one connection at a time from each API
process's existing four-connection shared pool. This includes trust evaluation
and retention, movement retention, live cleanup, account-deletion retries,
placement sweeps, and trade-history retention. Waiting routine checkouts queue
before entering the native pool and remain visible in checkout timings. Pool
shutdown rejects queued checkouts.

Player requests, battle deadlines, trade expiry, placement boundaries,
coordination, and probes retain direct admission. The limit does not add
connections or change worker intervals, transaction boundaries, or authoritative
deadlines. Monitor routine backlogs and pool waits alongside foreground latency;
lower SQL counts alone do not establish production speed improvements.

Review sweep failures, repeated account-deletion retries, and growing backlogs
of overdue work or expired records. A configured cleanup interval schedules
work; it does not prove that deletion completed. Use worker results and
aggregate counts to confirm progress after a failure or restart.

[Gameplay workers](ranked-operations.md#operating-checks) covers battle and
settlement checks. [Account deletion](../database/account-deletion-retention.md)
and [movement retention](../database/movement-evidence.md#retention-and-access)
define the cleanup obligations.

### Diagnostic logging

Keep request IDs, operation names, durations, aggregate counts, and safe error
codes so failures can be correlated. Exclude credentials, bearer tokens,
realtime tickets, precise player locations, hidden cards, and raw private
responses. Preserve API redaction rules when forwarding logs, and apply an
explicit access and retention policy to any exported copies.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Sol], Codex-CLI[GPT-5], Codex[GPT-5], Codex-CLI[GPT-6],
Codex[GPT-6], and Codex-CLI[gpt-6-luna].
