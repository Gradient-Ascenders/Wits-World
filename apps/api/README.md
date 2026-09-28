# Wits World API

The Wits World API is the hand-written HTTP API for the Wits Quest game.

The current foundation provides:

- a Fastify and TypeScript application;
- runtime configuration validation;
- `GET /health`;
- versioned routes under `/api/v1`;
- server-generated request identifiers;
- a consistent safe error model;
- generated OpenAPI documentation; and
- API integration tests.

Bearer-token authentication, protected event discovery, and server-side location
eligibility are implemented in the API. The current API also implements local
player provisioning and lifecycle, application roles and Author protection,
challenge attempts and marking, atomic rewards, card collections, saved decks,
CPU matches/history, asynchronous PvP invitations, challenger-owned invitation
cancellation, matches, voluntary resignation, live PvP ticketing/realtime gateway, authenticated
progression/standings, protected Author content operations, and an external
read-only developer API for published events, public cards, and progression
standings. Developer resources use generated `X-API-Key` credentials rather
than player bearer authentication. The cancellation endpoint requires the
version 3 PvP media type and derives ownership from the
validated player identity; it never accepts a player ID or result from the
browser.
Asynchronous match detail negotiates version 4 to return the complete
participant-safe public action history through the returned match version;
unplayed opponent cards and private transition snapshots remain excluded.

The protected trust-review surface is available only to authenticated active
Authors:

- `GET /api/v1/author/trust-cases` lists a server-filtered, paginated queue;
- `GET /api/v1/author/trust-cases/:caseId` returns privacy-safe score,
  bounded evidence, restriction, and audit previews;
- `GET` on the case's `/evidence`, `/restrictions`, and `/history` resources
  returns deterministic pages of the complete safe collections;
- `POST /api/v1/author/trust-cases/:caseId/decisions` records a versioned human
  decision and any bounded `trust-v1` restriction; and
- `GET /api/v1/author/trust-cases/:caseId/export` returns a bounded,
  privacy-safe JSON export with truncation metadata.

Decision requests require the current `expectedVersion`, a reason of 1 through
1,000 characters, and, for restrictions, one or more supported scopes plus a
duration of 1 through 168 hours. Stale writes return `409`; inaccessible and
self-review cases share the same `404` response so the API does not disclose
case existence. The service derives actors, timestamps, score changes, case
outcomes, and restriction state. Responses exclude precise location, raw
source identifiers and payloads, submitted answers, Auth0 identity, and
detector thresholds. No new environment variable controls these policy limits.

The detailed challenge and persistence contracts are documented in the
[challenge attempt API contract](../../docs/architecture/challenge-attempt-api-contract.md)
and the
[challenge, reward, and card persistence design](../../docs/database/challenge-reward-persistence-design.md).

## Requirements

Use:

- Node.js `>=24.14.1 <25`;
- npm `>=11.18.0 <12`.

Install all workspace dependencies from the repository root:

```powershell
npm ci
```

## Local configuration

Copy the API environment example:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

The local `.env` file is ignored by Git and must not contain values intended for commit.

### API variables

| Variable                                        | Required | Example       | Purpose                                       |
| ----------------------------------------------- | -------- | ------------- | --------------------------------------------- |
| `HOST`                                          | Yes      | `127.0.0.1`   | Network interface used by the API server      |
| `PORT`                                          | Yes      | `3000`        | TCP port used by the API server               |
| `LOG_LEVEL`                                     | Yes      | `info`        | Fastify log level                             |
| `MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND` | Yes      | `12.5`        | Server-authoritative impossible-journey limit |
| `ASYNC_PVP_CURSOR_SIGNING_KEY`                  | Yes      | secret        | HMAC key of at least 32 bytes for PvP cursors |
| `ACCOUNT_DELETION_RETRY_INTERVAL_MS`            | No       | `1800000`     | Failed account-deletion retry interval        |
| `ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS`          | No       | `1800000`     | PvP expiry/forfeit sweep interval             |
| `LIVE_PVP_WEBSOCKET_URL`                        | No       | local `ws://` | Public live PvP WebSocket endpoint            |
| `LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS`           | No       | `1000`        | Live turn-deadline sweep interval             |
| `LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS`        | No       | `1800000`     | Live ticket/access cleanup interval           |
| `MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS`         | No       | `1800000`     | Expired movement-evidence cleanup interval    |
| `TRUST_EVALUATION_INTERVAL_MS`                  | No       | `1800000`     | Trust decay/recovery evaluation interval      |
| `CARD_TRADE_MAINTENANCE_INTERVAL_MS`            | No       | `1800000`     | Trade expiry/retention maintenance interval   |
| `RATE_LIMIT_BACKEND`                            | No       | `upstash`     | `local` is an explicit non-production option  |
| `UPSTASH_REDIS_REST_URL`                        | Upstash  | secret config | HTTPS endpoint for shared rate-limit state    |
| `UPSTASH_REDIS_REST_TOKEN`                      | Upstash  | secret        | Server-only Upstash REST token                |
| `RATE_LIMIT_TIMEOUT_MS`                         | No       | `500`         | Maximum limiter wait in ms                    |
| `RATE_LIMIT_MAX_REQUESTS`                       | No       | `120`         | General player sliding-window maximum         |
| `RATE_LIMIT_WINDOW_MS`                          | No       | `60000`       | General player window in ms                   |
| `DEVELOPER_API_RATE_LIMIT_MAX_REQUESTS`         | No       | `120`         | Developer-key sliding-window maximum          |
| `DEVELOPER_API_RATE_LIMIT_WINDOW_MS`            | No       | `60000`       | Developer-key window in ms                    |
| `RATE_LIMIT_CRITICAL_WRITE_MAX_REQUESTS`        | No       | `10`          | Credential-write maximum                      |
| `RATE_LIMIT_CRITICAL_WRITE_WINDOW_MS`           | No       | `60000`       | Credential-write window in ms                 |
| `RATE_LIMIT_CREDENTIAL_REVOKE_MAX_REQUESTS`     | No       | `10`          | Developer-key revocation maximum              |
| `RATE_LIMIT_CREDENTIAL_REVOKE_WINDOW_MS`        | No       | `60000`       | Developer-key revocation window in ms         |
| `RATE_LIMIT_GAMEPLAY_WRITE_MAX_REQUESTS`        | No       | `30`          | Sensitive gameplay-write maximum              |
| `RATE_LIMIT_GAMEPLAY_WRITE_WINDOW_MS`           | No       | `60000`       | Sensitive gameplay-write window in ms         |
| `RATE_LIMIT_AUTHOR_EXPENSIVE_MAX_REQUESTS`      | No       | `30`          | Expensive author-query maximum                |
| `RATE_LIMIT_AUTHOR_EXPENSIVE_WINDOW_MS`         | No       | `60000`       | Expensive author-query window in ms           |
| `RATE_LIMIT_LIVE_TICKET_MAX_REQUESTS`           | No       | `30`          | Live PvP ticket-minting maximum               |
| `RATE_LIMIT_LIVE_TICKET_WINDOW_MS`              | No       | `60000`       | Live PvP ticket-minting window in ms          |

For normal local development without Upstash credentials, explicitly set
`RATE_LIMIT_BACKEND=local` and keep `NODE_ENV` other than `production`. This
selects a per-process, in-memory sliding-window limiter at startup. It is for
development only: counters do not span restarts or API instances. The setting
never activates in response to an Upstash error. `RATE_LIMIT_BACKEND=upstash`
requires a valid HTTPS URL and token; production rejects `local` and rejects
missing or malformed Upstash settings before starting the API. Production
Upstash outages follow the policy-specific open/closed behavior in the
[rate-limiting guide](../../docs/architecture/rate-limiting.md), without an
in-memory fallback. Tests and Basic E2E inject deterministic fakes.

Supported log levels are:

- `fatal`;
- `error`;
- `warn`;
- `info`;
- `debug`;
- `trace`;
- `silent`.

`PORT` must be an integer between `1` and `65535`.

Missing or invalid required API configuration prevents the server from starting.
The journey-speed setting has no default and must be a finite number greater
than zero. The example illustrates syntax only; operators must use the reviewed
product value for the environment.

The database-backed account-deletion, movement-evidence, asynchronous-PvP,
trust-evaluation, and card-trade maintenance workers run once at startup and
default to the same 30-minute interval. Their minimum supported interval is 15 minutes.
Keeping the production values aligned allows an idle serverless PostgreSQL
compute to suspend between sweeps. Asynchronous PvP reads and mutations still
enforce the authoritative 24-hour deadlines before the periodic worker runs.

The event-placement worker also evaluates at startup and every 30 minutes,
with a timer for the next policy-defined `04:00 Africa/Johannesburg` rotation
boundary. It requires migrations through `0049` and the `placement-v1` seed.
See [Automatic event placement service](../../docs/architecture/automatic-event-placement-service.md)
for the Author API and release checks.

Ranked maintenance also drives the `territory-v1` runtime. `RANKED_SWEEP_INTERVAL_MS`
remains the only ranked/territory worker cadence setting: matchmaking work runs on
each ranked sweep, while territory settlement and expired-grant maintenance are
throttled internally to approximately once per minute. Migration
`0054_implement_contested_territory_runtime.sql` must be applied after `0053`
before enabling territory queue claims. Ranked season closure waits for all
territory windows, including the final partial window, to settle before the season
can become `closed`; every API instance may attempt this work because PostgreSQL
locks and immutable receipts make retries idempotent.

Players may optionally attach a server-validated `territoryClaim` to
`POST /api/v1/ranked/queue`. The browser supplies the requested zone plus a fresh
location claim, but it never supplies influence, ownership, or a result. The API
stores only the short-lived coarse grant provenance needed to bind a ranked match
to a zone; latitude, longitude, and reported accuracy are not persisted in the
territory ledger. Player-safe reads are available under
`/api/v1/territory/zones`; standings expose ranked counts and the authenticated
player's own cap state without contributor identities. See the
[territory API contract](../../docs/architecture/contested-campus-territory-api-contract.md)
and [territory-v1 policy](../../docs/requirements/contested-campus-zone-policy.md).

When updating an existing checkout, remove or replace any legacy `60000`
overrides for `ACCOUNT_DELETION_RETRY_INTERVAL_MS`,
`ASYNC_PVP_DEADLINE_SWEEP_INTERVAL_MS`,
`MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS`, `TRUST_EVALUATION_INTERVAL_MS`, and
`CARD_TRADE_MAINTENANCE_INTERVAL_MS` in
`apps/api/.env` or the local shell
environment. Omitting them uses the 30-minute defaults. `RATE_LIMIT_WINDOW_MS`
is unrelated and may remain `60000`.

Rate protection is keyed by the verified local player identity and returns
`429 RATE_LIMITED` with `Retry-After` and `RateLimit-*` headers. It is an
application-process control, not a substitute for deployment-level protection
of invalid-token traffic or aggregation across multiple API instances.

`TRUST_EVALUATION_INTERVAL_MS` controls the retry-safe maintenance cadence for
`trust-v1` decay/recovery, completed-PvP pattern evaluation, and retention cleanup.
It is not a trust score threshold or policy value. Every API instance may run the
sweep; PostgreSQL advisory/row locks, idempotent retention deletion, and signal
uniqueness keep maintenance authoritative under concurrent workers.

`CARD_TRADE_MAINTENANCE_INTERVAL_MS` controls only bulk expiry and 30-day
retention cleanup for non-completed trades. Trade reads and mutations still
enforce the original 24-hour deadline immediately. Every API instance may run
the sweep because the database terminal transitions and cleanup are idempotent.

### Database variables

| Variable            | Required for database operations   | Purpose                                     |
| ------------------- | ---------------------------------- | ------------------------------------------- |
| `DATABASE_URL`      | Yes                                | Development PostgreSQL/PostGIS connection   |
| `TEST_DATABASE_URL` | Yes for database integration tests | Separate test PostgreSQL/PostGIS connection |

The development and test variables must point to different databases.

Do not commit real database credentials, passwords, tokens, or private keys.

## Run locally

From the repository root:

```powershell
npm run dev --workspace @wits-world/api
```

The default local address is:

```text
http://127.0.0.1:3000
```

The development process watches the API source files and restarts when they
change.

To build and run the compiled application:

```powershell
npm run build --workspace @wits-world/api
npm run start --workspace @wits-world/api
```

## API routes

### Health

```http
GET /health
```

Example response:

```json
{
  "status": "ok",
  "service": "Wits World API",
  "requestId": "server-generated-request-id"
}
```

The health endpoint confirms that the API process is running and accepting
requests. It does not currently perform a database-readiness check.

Database readiness is checked separately through:

```powershell
npm run db:check --workspace @wits-world/api
```

Release preparation uses a guarded command that requires an explicit test or
production target and exact database-name confirmation. Demonstration seeding is
disabled unless separately requested:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target test \
  --confirm-database <test-database-name> \
  --seed-basic-demo
```

See the
[Sprint 1 database release procedure](../../docs/database/database-release-procedure.md)
for approval, production, verification, evidence, and recovery requirements.
Use the
[PostGIS recovery rehearsal](../../docs/database/postgis-recovery-rehearsal.md)
to prove fresh setup, idempotent reruns, eligibility outcomes, and transactional
failure recovery against a disposable test database.

### Versioned API root

```http
GET /api/v1/
```

Example response:

```json
{
  "name": "Wits World API",
  "version": "v1",
  "requestId": "server-generated-request-id"
}
```

New application endpoints should be added beneath `/api/v1`.

Breaking API changes should use a new version prefix rather than silently
changing an existing public contract.

## External developer API

Wits World accounts can create and revoke named developer credentials from the
Account page. The complete key is shown only when it is created and is sent to
the external read-only endpoints through `X-API-Key`:

```http
GET /api/v1/developer/events
GET /api/v1/developer/events/:eventId
GET /api/v1/developer/cards
GET /api/v1/developer/cards/:cardDefinitionId
GET /api/v1/developer/leaderboard
```

Key-management operations remain normal Auth0-bearer account operations:

```http
GET    /api/v1/developer/keys
POST   /api/v1/developer/keys
DELETE /api/v1/developer/keys/:keyId
```

Developer keys never establish a player principal and cannot be used on normal
player, author, or gameplay operations. Each key receives its own shared
sliding-window limit using `DEVELOPER_API_RATE_LIMIT_*`. The reusable credential header is
redacted from API logs and is not accepted through URLs. See the
[external developer API guide](../../docs/architecture/developer-api.md) and
[developer-key persistence](../../docs/database/developer-api-keys.md).

## Live PvP runtime

Live PvP uses bearer authentication only on HTTPS:

```http
GET /api/v1/matches/live/:matchId
POST /api/v1/matches/live/:matchId/connection-tickets
```

The ticket response returns a short-lived opaque ticket and the configured
WebSocket endpoint. The browser then connects to:

```text
GET /api/v1/realtime/live?ticket=<single-use-ticket>
```

The ticket query value is redacted from Fastify logs; deployed proxies must do
the same. Client messages are closed protocol-version-1 intent objects
(`action.submit` or `resign.submit`) and never contain timeout, damage, winner,
deadline, or result authority. The gateway enforces a 16 KiB payload limit,
uses 20-second ping/pong liveness, and reloads every published match projection
from PostgreSQL. The database-backed deadline worker runs independently of
socket presence, and each API instance listens for committed match-version
notifications so session affinity is not required for correctness.

The authenticated snapshot response includes an ISO `serverTime` for display
countdown anchoring. Participant projections additionally include the
authoritative `selfSide` and the complete participant-safe public history
through the returned match version; `lastAction` is the final history item.
Spectator responses retain their separate public shape and never include hands,
legal actions, private snapshots, private participant data, or a participant
side. The client may render these fields but cannot use them to resolve a
deadline or battle transition.

See the [live PvP API contract](../../docs/architecture/live-pvp-api-contract.md)
for message schemas, reconnect, timeout, idempotency, and spectator privacy
rules.

## Suspect-player review API

Active Authors can use the protected trust-review operations:

```http
GET  /api/v1/author/trust-cases
GET  /api/v1/author/trust-cases/:caseId
GET  /api/v1/author/trust-cases/:caseId/evidence
GET  /api/v1/author/trust-cases/:caseId/restrictions
GET  /api/v1/author/trust-cases/:caseId/history
POST /api/v1/author/trust-cases/:caseId/decisions
GET  /api/v1/author/trust-cases/:caseId/export
```

The queue defaults to `status=active` (`open` plus `under_review`) and supports
explicit lifecycle state or `status=all`, bounded pagination, literal
case-insensitive Player Name substring search, exact case/player UUID search,
review band, active-restriction state, derived signal type, and creation/update
time filters. Queue and detail expose canonical `score`, `band`, restriction
counts, `latestRestrictionExpiry`, and `canReview`. Detail contains a
`scoreExplanation`, ten-item recent `evidence`/`evidencePreview` and
restriction previews, and 20-item `history`/`recentHistory` aliases plus
total/truncation metadata; the separate collection routes provide pages up to
100 items. The aliases keep the Author console contract compatible without
making detail reads unbounded. New opponent-pattern evidence persists
signal-time aggregate counts, evaluation windows, and trust-v1 thresholds so
the service can validate the immutable summary, but reviewer responses expose
only the window, counts, and observed concentration ratio. Legacy rows without
that summary are explicitly unavailable and make the case
non-reviewable only while they still contribute points and remain unadjusted;
only a newer explained evaluation that is also effective and unadjusted can
supersede them.
Detail and audit responses contain local opaque player identifiers,
policy/version data, and effective restrictions. Detail also exposes the
authoritative active restriction scopes needed for destructive confirmation.
They do not
contain Auth0 identifiers, precise location, raw telemetry, private match
history, evidence source identifiers, or detector thresholds.

Every mutation derives the reviewer from the bearer token, requires the
expected case version and a bounded `reasonNote`, and runs the case transition,
append-only audit, evidence links, false-positive adjustments, and supported
restrictions in one transaction. Stale versions return a safe `409` conflict.
Self-review cases use the same `404` response as inaccessible/missing cases.
Human decisions are `continue_monitoring`, `mark_false_positive`, `restrict`,
and `dismiss`. The first three start or continue review; dismissal resolves only
an `under_review` case. `mark_false_positive` requires one or more evidence IDs
and adjusts exactly those signals without resolving the case. A decision may
reference at most 100 distinct evidence summaries. History retains the
false-positive subset and each restriction's committed start and expiry.
Restriction decisions accept the console-facing `durationHours` field.
The writable scopes are `online_verification_required`,
`location_reward_challenge_hold`, and `new_competitive_match_hold`;
`card_trade_hold` remains readable but cannot be authored by these endpoints.
The export operation returns the same server-defined safe projection as JSON,
with at most 100 evidence, restriction, and history records per collection and
pagination totals that identify truncation. Clients cannot select columns.
See the [longitudinal trust persistence guide](../../docs/database/trust-persistence.md)
for the complete privacy and concurrency contract.

## OpenAPI documentation

With the API running, open:

```text
http://127.0.0.1:3000/documentation/
```

The generated OpenAPI JSON is available at:

```text
http://127.0.0.1:3000/documentation/json
```

Route schemas must document:

- request parameters and bodies;
- successful responses;
- safe error responses;
- authentication requirements when introduced; and
- validation constraints.

The OpenAPI plugin must be registered before API routes so their schemas are
included in the generated document.

## Authentication

Protected API routes use Auth0 bearer access tokens.

The development authentication configuration is:

| Setting           | Value                                        |
| ----------------- | -------------------------------------------- |
| Auth0 domain      | `dev-5artxfvpdennq8qm.us.auth0.com`          |
| Canonical issuer  | `https://dev-5artxfvpdennq8qm.us.auth0.com/` |
| API audience      | `https://api.wits-world.invalid`             |
| Signing algorithm | RS256                                        |

The deployed production boundary reviewed on 22 August 2026 uses:

| Setting          | Value                            |
| ---------------- | -------------------------------- |
| Auth0 domain     | `auth.witsworld.co.za`           |
| Canonical issuer | `https://auth.witsworld.co.za/`  |
| API audience     | `https://api.wits-world.invalid` |
| Web CORS origin  | `https://witsworld.co.za`        |

`AUTH0_DOMAIN` selects the verified custom issuer in production.
`AUTH0_TENANT_DOMAIN` continues to identify the underlying Auth0 tenant for
Management API operations. These are different configuration names and must not
be substituted for one another.

The API derives the canonical issuer from `AUTH0_DOMAIN` and validates access
tokens against the configured audience.

Local configuration requires:

```env
AUTH0_DOMAIN=dev-5artxfvpdennq8qm.us.auth0.com
AUTH0_AUDIENCE=https://api.wits-world.invalid
```

No Auth0 client secret is required for bearer-token validation.

### Protected request format

Protected routes expect an access token in the standard HTTP Authorization
header:

```http
Authorization: Bearer <access-token>
```

The API validates:

- the RS256 signature;
- the exact issuer;
- the configured audience;
- token expiry;
- the required identity claims.

Interactive player tokens additionally use the trusted namespaced connection
strategy claim `https://witsworld.co.za/connection_strategy`. Database (`auth0`)
tokens require `https://witsworld.co.za/player_name`; Google (`google-oauth2`)
tokens intentionally do not. Other interactive strategies fail closed. These
requirements are applied after ordinary JWT validation and do not prevent the
generic verifier from representing non-interactive/client-credentials tokens.

The API resolves signing keys through the configured Auth0 tenant's JWKS
endpoint.

The API does not trust identity values supplied through request bodies, query
parameters, route parameters, or browser state.

### External identity

An authenticated external identity is represented by the pair:

```text
(iss, sub)
```

The `sub` claim alone is not treated as globally unique because an OIDC subject
is scoped to its issuer.

For the current development tenant, the issuer is exactly:

```text
https://dev-5artxfvpdennq8qm.us.auth0.com/
```

The scheme and trailing slash are part of the issuer identifier.

The authenticated Fastify request context exposes:

```typescript
{
  connectionStrategy: 'auth0' | 'google-oauth2' | null;
  issuer: string;
  playerName: string | null;
  subject: string;
}
```

These values are populated only after successful token validation. The issuer
and subject remain the authentication identity. A database `playerName` is
trusted account metadata synchronized onto that same local player UUID. Google
starts with null and completes one-time local setup before gameplay; no profile
or email value is used as fallback.

Application roles and object-level permissions are separate from
authentication. A valid Auth0 token does not automatically grant author or
administrator privileges.

Concurrent requests for the same validated external identity may reuse only the
stable local player ID learned by an identity resolution already in flight.
Every request still performs its own database read of role, lifecycle status,
and deleted-token denial state before it is authorized. The in-flight player-ID
entry is removed as soon as the original resolution settles, avoiding stale
authorization decisions.

### Authentication test route

The current authentication foundation exposes:

```http
GET /api/v1/auth/me
```

This route returns the current local player resolved through the validated
external identity. It does not expose the Auth0 issuer, subject, or email.

Example successful response:

```json
{
  "connectionStrategy": "auth0",
  "id": "00000000-0000-4000-8000-000000000001",
  "playerName": "example-player",
  "playerNameSetupRequired": false,
  "role": "player",
  "lifecycleStatus": "active",
  "requestId": "server-generated-request-id"
}
```

The example player ID and name are illustrative and do not identify a real
account. `connectionStrategy` is the validated safe provider category used to
select the correct account-recovery guidance. The player-facing route does not
return the Auth0 issuer, subject, email, or bearer token.

A Google player awaiting setup receives `playerName: null` and
`playerNameSetupRequired: true`. The authenticated
`PUT /api/v1/auth/me/player-name` endpoint assigns that supported social player
one locally unique, Auth0-compatible Player Name. It does not accept a player ID,
cannot be used by database accounts, and cannot change an existing name.

### Permanent account deletion

The authenticated `POST /api/v1/auth/account-deletion` route coordinates the
server-authoritative deletion lifecycle. It accepts only the exact destructive
confirmation and a separately acquired Auth0 ID token proving authentication no
more than five minutes ago. The API independently verifies that proof and its
exact `(iss, sub)` match; it never accepts the ID token as the API bearer token.

A completed request returns `200` with `status: "completed"`. When Auth0 or
local cleanup cannot finish immediately, the account remains locked and the
route returns `202` with `status: "retry_pending"`; the persisted retry worker
continues idempotently. Safe error responses never echo credentials, identity
claims, or provider details. The browser and API never create, accept, or render
Wits World password fields.

Completion physically removes the local player row and personal gameplay,
progression, achievements, ratings, and standings entries. Shared outcomes,
published content, and bounded moderation evidence can retain a private
profile-free actor key.

See the [account deletion persistence and retention contract](../../docs/database/account-deletion-retention.md)
and [player account lifecycle validation](../../docs/testing/player-account-lifecycle-validation.md).

### Authentication failures

Missing, malformed, expired, incorrectly signed, wrong-issuer, and
wrong-audience access tokens are rejected with `401 Unauthorized`.

Example:

```json
{
  "type": "https://wits.world/problems/unauthorized",
  "title": "Authentication required",
  "status": 401,
  "code": "UNAUTHORIZED",
  "detail": "A valid bearer access token is required.",
  "requestId": "server-generated-request-id"
}
```

Authentication errors intentionally do not reveal:

- the submitted token;
- decoded token contents;
- signature-validation details;
- JWKS internals;
- issuer comparison details;
- audience comparison details;
- stack traces.

The API logger also redacts the `Authorization` request header.

### OpenAPI

The OpenAPI document defines the `bearerAuth` HTTP security scheme.

Protected operations explicitly declare:

```yaml
security:
  - bearerAuth: []
```

Public operations such as `GET /health` remain accessible without
authentication.

The interactive OpenAPI interface is available at:

```text
http://127.0.0.1:3000/documentation/
```

### Authentication tests

The automated authentication tests generate temporary RSA key pairs and JWTs
locally.

They do not depend on the live Auth0 tenant and do not commit or store real
access tokens.

The suite covers:

- missing bearer tokens;
- malformed tokens;
- invalid signatures;
- expired tokens;
- missing expiry claims;
- incorrect issuers;
- incorrect audiences;
- valid authenticated identities;
- prevention of request-body identity spoofing;
- authentication runtime configuration;
- the OpenAPI bearer security scheme.

The production authentication path uses the Auth0 JWKS endpoint rather than the
temporary test keys.

## Browser-to-API access

The Wits World web application and API are independently served applications.

During local development:

- the web application runs at `http://localhost:5173`;
- the API runs at `http://127.0.0.1:3000`.

Because these are different browser origins, the API uses a controlled CORS
policy.

### CORS configuration

The approved browser origin is configured with:

```env
CORS_ALLOWED_ORIGIN=http://localhost:5173
```

The API requires one exact HTTP or HTTPS origin.

Wildcard origins are not permitted.

Examples that are rejected at startup include:

```text
*
https://*.example.com
https://example.com/path
```

Production deployments must provide their deployed web origin through
`CORS_ALLOWED_ORIGIN`. A production origin must not be hard-coded into the
application.

### Allowed browser requests

The current CORS policy permits:

- `GET`;
- `POST`;
- the `Authorization` request header;
- the `Content-Type` request header;
- browser preflight requests.

Cookie credentials are not enabled.

Bearer authentication remains authoritative and unchanged. CORS does not
authenticate a user and does not make protected routes public.

For example:

```http
GET /api/v1/events
Origin: http://localhost:5173
Authorization: Bearer <access-token>
```

still requires a valid Auth0 access token.

### Security boundary

CORS is a browser security boundary, not API access control.

A command-line client or another non-browser HTTP client is not prevented from
sending requests by CORS. Protected API operations therefore continue to rely
on server-side bearer-token validation and application authorisation.

The API:

- does not use `Access-Control-Allow-Origin: *`;
- does not dynamically reflect arbitrary origins;
- does not disable authentication for preflight support;
- does not place bearer tokens in CORS configuration;
- fails startup when the required allowed-origin configuration is missing or
  malformed.

### Local preflight verification

With the API running, a local bearer-token preflight can be checked with:

```bash
curl -i -X OPTIONS http://127.0.0.1:3000/api/v1/events \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```

The response should allow exactly the configured local origin and include
support for the requested bearer `Authorization` header.

An unapproved origin must not receive an applicable
`Access-Control-Allow-Origin` response permitting browser access.

## Event discovery and location eligibility

Authenticated players can discover published events and submit location claims
for server-side eligibility evaluation.

Both event endpoints require a valid bearer access token.

### Event discovery

```http
GET /api/v1/events
```

The endpoint returns published event information intended for the player map and
event list.

Example response:

```json
{
  "events": [
    {
      "eventId": "00000000-0000-4000-8000-000000000018",
      "title": "Sprint 1 Demo - Wits Great Hall",
      "description": "A player-safe event description.",
      "latitude": -26.19205,
      "longitude": 28.03038,
      "radiusMetres": 75,
      "startsAt": "2026-08-01T00:00:00.000Z",
      "endsAt": "2026-08-20T00:00:00.000Z",
      "availability": "active"
    }
  ],
  "requestId": "server-generated-request-id"
}
```

Player discovery exposes only information required to understand and locate an
event.

It does not expose:

- accepted challenge answers;
- private author information;
- unpublished events;
- audit information;
- reward decisions;
- internal eligibility data.

Published events may have an availability value of:

- `active`;
- `upcoming`;
- `ended`.

The production service coalesces concurrent discovery reads and may reuse the
same player-safe result for up to five seconds. The cache expires early at an
event start or end boundary. It is not used for location eligibility,
challenge access, or any other authoritative game decision.

### Event eligibility

```http
POST /api/v1/events/{eventId}/eligibility
```

The browser submits a location **claim**:

```json
{
  "latitude": -26.19205,
  "longitude": 28.03038,
  "accuracyMetres": 10,
  "acquiredAt": "2026-08-10T11:59:30.000Z"
}
```

The browser does not decide whether it is eligible.

Fields such as the following are not part of the request contract and are
rejected:

```json
{
  "eligible": true,
  "reachable": true,
  "distanceMetres": 5
}
```

The API validates the request and delegates authoritative event distance,
radius, publication, and availability evaluation to the server-side PostGIS
eligibility service.

### Eligibility outcomes

A clearly reachable claim returns:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000018",
  "status": "reachable",
  "reachable": true,
  "requestId": "server-generated-request-id"
}
```

A clearly unreachable claim returns:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000018",
  "status": "unreachable",
  "reachable": false,
  "requestId": "server-generated-request-id"
}
```

An uncertain location claim returns a safe retry result rather than accusing the
player of cheating:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000018",
  "status": "retry",
  "reachable": null,
  "reason": "location_accuracy",
  "requestId": "server-generated-request-id"
}
```

Retry reasons currently include:

- `location_accuracy`;
- `stale_location`;
- `future_acquisition_time`;
- `journey_too_fast`.

An event that has not started or has ended returns `status: "unavailable"`.

Unpublished events return the same `404 EVENT_NOT_FOUND` response as nonexistent
events so that private content is not disclosed.

### Accuracy-aware boundary

The API combines the reported device accuracy with the authoritative PostGIS
distance and event radius.

Conceptually:

```text
distance + accuracy <= radius
    -> clearly reachable

distance - accuracy > radius
    -> clearly unreachable

otherwise
    -> ambiguous; retry
```

The browser-reported accuracy remains an untrusted claim. This calculation
reduces false certainty near an event boundary; it does not make browser
geolocation tamper-proof.

### Location freshness

The current Sprint 1 implementation uses a **provisional** maximum location
claim age of 120 seconds.

This is a development recommendation rather than a confirmed product
requirement and should be revisited after physical-device and campus field
testing.

Malformed timestamps are rejected. Future or stale timestamps produce a safe
retry outcome without running the PostGIS eligibility query.

### Privacy and trust boundary

Location is submitted only when required for an eligibility operation.

The current endpoint does not continuously track the player.

For issue `#168`, the endpoint persists one validated sample only after the
authenticated player requests eligibility and the event is confirmed as
published and active. The internal record contains the server-resolved player,
event context, coordinates, accuracy, acquisition/receipt times, and expiry. It
is not returned through an API. Equal or older acquisition timestamps are
checked against the player's latest physical sample. Older samples and equal
timestamps with different coordinates or accuracy are rejected with
`409 NON_MONOTONIC_MOVEMENT_EVIDENCE`. An identical equal-timestamp retry for
the same event is idempotent; the same physical sample may also be associated
with another active event without weakening the player-global sequence.

Precise evidence defaults to a provisional 24-hour retention configured by
`MOVEMENT_EVIDENCE_RETENTION_MS`. An idempotent API worker deletes expired rows
at `MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS`; account-deletion initiation removes
the player's rows transactionally. Ordinary logs redact all submitted location
fields. See the
[movement-evidence design](../../docs/database/movement-evidence.md).

For cross-event reachable claims, the server compares the newest sample with
the latest unexpired accepted reachable anchor. PostGIS supplies distance, both
reported accuracy radii reduce the distance conservatively, and server receipt
timestamps supply elapsed time. Browser-supplied speed or elapsed-time fields
are rejected. A journey above the required configured maximum returns the
neutral `journey_too_fast` retry response and is not trusted as a later anchor.
The API never returns the calculated distance, speed, prior event, threshold,
or audit row. Challenge start repeats the same check transactionally, so a
client cannot bypass it by calling the challenge route directly.

The API treats latitude, longitude, accuracy, and acquisition time as
browser-supplied claims. It independently determines:

- event existence;
- publication state;
- availability;
- authoritative event coordinates;
- event radius;
- distance from the claimed location;
- final reachability outcome.

Authentication establishes the external `(iss, sub)` identity independently of
location data.

A valid access token does not make a browser-provided location trustworthy.

### Event API tests

Automated API tests cover:

- authentication requirements;
- player-safe event discovery;
- omission of private event fields;
- reachable claims;
- unreachable claims;
- ambiguous-accuracy retry behaviour;
- stale claims;
- future acquisition timestamps;
- invalid coordinates;
- invalid accuracy values;
- malformed timestamps;
- nonexistent events;
- unpublished events;
- inactive events;
- rejection of browser-supplied eligibility decisions;
- neutral impossible-journey retries and rejected-anchor exclusion;
- accuracy-adjusted threshold boundaries and server-receipt timing;
- same-event, idempotent, retention-expiry, and concurrency behaviour;
- OpenAPI bearer protection.

The HTTP integration tests use injected event services and do not require a
live database.

The existing PostGIS integration tests separately verify authoritative distance,
radius, publication, and availability behaviour against PostgreSQL/PostGIS.

## Card evolution API

The authenticated card boundary exposes:

```http
GET  /api/v1/cards/evolutions/{sourceCardDefinitionId}/preview
POST /api/v1/cards/evolutions
```

Preview returns the authored source/target pair, rarity-derived deck point
costs, and the current player's eligible and saved-deck-locked copies. The
mutation accepts `{ "submissionId": "<uuid>", "sourceCardDefinitionId":
"<uuid>" }`; it does not accept a player, target, or owned-copy selection. The
server atomically consumes the three newest eligible copies and grants the
fixed evolved definition. A matching idempotent replay returns `200`; a new
evolution returns `201`. Expected failures use the
`EVOLUTION_NOT_AVAILABLE`, `EVOLUTION_COPIES_INSUFFICIENT`,
`EVOLUTION_COPIES_DECK_LOCKED`, and `EVOLUTION_REPLAY_CONFLICT` codes.

See [Card evolution rules](../../docs/requirements/card-evolution-rules.md) for
the fixed relationships, trust boundary, and deferred player UI.

## Challenge API

The multiple-choice and ordering start, resume, answer-locking, timeout, and
player-safe feedback contract is documented in the
[challenge and attempt API contract](../../docs/architecture/challenge-attempt-api-contract.md).
The protected endpoints are implemented under `/api/v1`. Marking is
server-authoritative; answer feedback is withheld while the timed attempt is
active and revealed only after authoritative completion. Completed responses
contain the persisted score/reward result plus five ordered review entries built
from attempt snapshots, locked answers, and the private answer key. Active
responses contain no review, correct choices or item order, correctness, score,
rewards, or explanations. Ordering answers submit exactly four unique snapshot
item IDs; marking awards a point only for an exact four-position match.

## Progression API

The progression API is protected by bearer authentication and active Player Name
setup:

```text
GET /api/v1/progression/me
GET /api/v1/progression/standings
```

The current-player operation returns authoritative points, all-time rank,
current and longest streaks, and active achievement progress. Standings default
to `period=all_time`; use `period=monthly&month=YYYY-MM` for a Johannesburg
calendar month. `page` defaults to `1` and is capped at `10000`; `pageSize`
defaults to `20` and is capped at `100`.

Each standings response includes the current player's selected-period rank even
when that player is outside the page. Rows expose only Player Name, points, rank,
and streaks. They never expose player UUIDs, email, Auth0 subjects, location, or
private gameplay history. Deleted and deletion-pending accounts are excluded
from live standings.

Challenge and terminal CPU-match transactions record their progression decision
before commit. The database adapter returns the existing immutable award on
replay, and any progression failure rolls the owning completion back.

## Error-response model

Errors use a consistent JSON structure:

```json
{
  "type": "https://wits.world/problems/not-found",
  "title": "Resource not found",
  "status": 404,
  "code": "NOT_FOUND",
  "detail": "The requested resource was not found.",
  "requestId": "server-generated-request-id"
}
```

The fields are:

| Field        | Purpose                                                    |
| ------------ | ---------------------------------------------------------- |
| `type`       | Stable problem-type identifier                             |
| `title`      | Short human-readable category                              |
| `status`     | HTTP status code                                           |
| `code`       | Machine-readable application code                          |
| `detail`     | Safe client-facing explanation                             |
| `requestId`  | Identifier used to correlate the response with server logs |
| `validation` | Optional safe field-validation details                     |

Production-style error responses must not expose:

- stack traces;
- SQL statements;
- database credentials;
- access tokens;
- private keys;
- internal file paths; or
- private implementation details.

Request identifiers are generated by the server rather than accepted from the
browser as authoritative values.

## Verification

Run API-specific checks:

```powershell
npm run lint --workspace @wits-world/api
npm run type-check --workspace @wits-world/api
npm test --workspace @wits-world/api
npm run build --workspace @wits-world/api
```

To validate the API from a clean shared-dependency build state, use the
repository-level commands:

```powershell
npm run validate:api:coverage
npm run validate:api:build
```

Run repository-wide checks before opening a pull request:

```powershell
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

The API integration tests cover:

- successful health responses;
- the `/api/v1` prefix;
- safe `404` responses;
- safe unexpected-error responses;
- server-generated request identifiers;
- invalid runtime configuration; and
- OpenAPI route generation.

## Current limitations

The API foundation does not yet include:

- production monitoring;
- background challenge-expiry processing outside request-time finalisation.

Implemented routes finalise expired challenge attempts when the relevant
authoritative operation loads or submits the attempt; a separate background
expiry worker is not currently part of the runtime.

---

The preceding document was planned, generated, and edited with the assistance
of: ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-5],
Codex[GPT-5.6 Sol], Codex-CLI[GPT-5.6 Sol].
