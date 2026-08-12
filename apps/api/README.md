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
eligibility are implemented in the API. Local-user provisioning, application
authorisation beyond authentication, challenge sessions, answer marking,
rewards, cards, and battles are introduced in later issues.

The proposed contracts for that later work are documented in the
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

The local `.env` file is ignored by Git and must not contain values intended for
commit.

### API variables

| Variable    | Required | Example     | Purpose                                  |
| ----------- | -------- | ----------- | ---------------------------------------- |
| `HOST`      | Yes      | `127.0.0.1` | Network interface used by the API server |
| `PORT`      | Yes      | `3000`      | TCP port used by the API server          |
| `LOG_LEVEL` | Yes      | `info`      | Fastify log level                        |

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
  --seed-demo-event
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
  issuer: string;
  subject: string;
}
```

These values are populated only after successful token validation.

Application roles and object-level permissions are separate from
authentication. A valid Auth0 token does not automatically grant author or
administrator privileges.

### Authentication test route

The current authentication foundation exposes:

```http
GET /api/v1/auth/me
```

This route is used to verify the authenticated external identity made available
to protected API operations.

Example successful response:

```json
{
  "issuer": "https://dev-5artxfvpdennq8qm.us.auth0.com/",
  "subject": "auth0|example-user",
  "requestId": "server-generated-request-id"
}
```

The example subject is illustrative and is not a real Auth0 user identifier.

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
- `future_acquisition_time`.

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
- OpenAPI bearer protection.

The HTTP integration tests use injected event services and do not require a
live database.

The existing PostGIS integration tests separately verify authoritative distance,
radius, publication, and availability behaviour against PostgreSQL/PostGIS.

## Proposed challenge API

The Sprint 2 MCQ start, resume, answer-locking, timeout, and player-safe feedback
contract is documented in the
[challenge and attempt API contract](../../docs/architecture/challenge-attempt-api-contract.md).
It is a reviewed proposal, not an implemented endpoint set. Accepted answers,
scores, and eventual rewards remain server-authoritative.

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
- challenge, reward, card, deck, or battle operations.
- challenge sessions, answer marking, and reward issuance beyond event
  discovery and location eligibility;

Those capabilities are introduced through later tracked issues.

---

The preceding document was planned, generated, and edited with the assistance
of: ChatGPT-Web[GPT-5.6 Thinking], ChatGPT-Web[GPT-5.6 Sol].
