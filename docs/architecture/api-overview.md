---
title: API overview
---

# API overview

## Purpose and authority

`apps/api` is the hand-written Fastify and TypeScript HTTP API for Wits Quest.
It is the protected boundary between the untrusted browser and authoritative
identity, content, eligibility, challenge, reward, collection, deck, trail, CPU
match, asynchronous PvP, and progression state.

The browser sends player intent and renders responses. It does not determine
authenticated identity, location eligibility, answer correctness, scores,
rewards, ownership, deck legality, legal match actions, or outcomes. Those
decisions remain in the API, shared server-consumed rules, and
PostgreSQL/PostGIS.

## Addresses and versioning

Local development uses:

| Boundary            | Address                                    |
| ------------------- | ------------------------------------------ |
| API origin          | `http://127.0.0.1:3000`                    |
| Health              | `http://127.0.0.1:3000/health`             |
| Versioned root      | `http://127.0.0.1:3000/api/v1/`            |
| Interactive OpenAPI | `http://127.0.0.1:3000/documentation/`     |
| OpenAPI JSON        | `http://127.0.0.1:3000/documentation/json` |

The repository's recorded production API origin is
`https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net`.
The [deployed boundary review](../testing/deployed-auth-cors-privacy-review.md)
records public health, versioned-root, authentication, and CORS checks against
that origin on 22 August 2026. The generated
[interactive reference](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/)
and [OpenAPI JSON](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/json)
use the same deployed application.

Application routes are placed beneath `/api/v1`. New backward-incompatible
contracts require a new version boundary rather than a silent change to the
existing prefix. `/health` and `/documentation/` are operational or reference
routes outside the application prefix.

The API is externally reachable, but that does not make protected game data
anonymous or public. Health, the versioned root, and OpenAPI are public;
gameplay, account, and author operations declare bearer authentication and
enforce their own role and ownership rules.

## Authentication and authorisation

Protected operations expect an Auth0 access token:

```http
Authorization: Bearer <access-token>
```

The API validates the token signature, issuer, audience, and expiry through the
configured Auth0 issuer/JWKS boundary. It then resolves the exact validated
issuer-and-subject pair to a local player. The local database record supplies
the application lifecycle and `player` or `author` role; a browser-supplied
player ID or role is not authoritative.

Authentication answers who the principal is. Route pre-handlers and services
separately enforce active-account, role, ownership, publication, and object
permissions. CORS permits the configured exact Web origin but is not an
authentication mechanism.

## Resource areas

The generated OpenAPI groups the current contract into these areas:

| Area                       | Responsibility                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| System                     | Health and API version information                                                                           |
| Authentication and account | Local identity, Player Name setup, and implemented account-lifecycle API boundaries                          |
| Events                     | Player-safe published-event discovery and server-authoritative location eligibility                          |
| Challenges                 | Timed attempt start/resume, answer locking, completion, marking, and completed-only review                   |
| Cards                      | Server-derived starter-package previews and grants, catalogue-safe rewards, and collection                   |
| Decks                      | Saved-deck CRUD, ownership validation, and active selection                                                  |
| Trails                     | Ordered trail progress, step state, and bounded nearby-unvisited guidance                                    |
| Matches                    | Server-created CPU and asynchronous PvP matches, legal intent, recovery, deadlines, and viewer-safe history  |
| Progression                | Current-player points, streaks, achievements, rank, and privacy-safe paginated standings                     |
| Authoring                  | Author-only event, challenge, question, card, trail, and campaign lifecycle operations plus audit boundaries |

The [Author curation contract](./author-curation-api-contract.md) explains the
five-state review workflow, optimistic concurrency, safe review queue and audit
history, and temporary Author-console limitation.

The OpenAPI document is the endpoint-level reference for parameters, bodies,
status codes, and response shapes. Narrative documents explain domain contracts
that need more context, including the
[challenge-attempt contract](./challenge-attempt-api-contract.md),
[saved-deck design](../database/saved-deck-persistence-design.md), and
[CPU match persistence](../database/cpu-match-persistence-design.md). Ordered
trail semantics and endpoints are documented in the
[trail rules](../requirements/ordered-trails-rules.md) and
[trail persistence design](../database/ordered-trails-persistence.md). Campaign
scheduling and effective availability are documented in the
[campaign API contract](./campaign-scheduling-api-contract.md) and
[campaign persistence design](../database/campaign-scheduling-persistence.md).

Progression exposes `GET /api/v1/progression/me` and
`GET /api/v1/progression/standings`. Both derive the player from bearer
authentication. The standings operation accepts all-time or `YYYY-MM` monthly
selection plus bounded pagination, and returns the current-player rank outside
the selected page without exposing a player UUID.

The [asynchronous PvP contract](./asynchronous-pvp-api-contract.md) defines the
implemented exact Player Name lookup, invitations, viewer-safe match reads,
signed keyset pages, legal-action submissions, and 24-hour deadline behavior.
These routes remain separate from CPU and live PvP; the Web experience is
tracked independently.

## Validation and errors

Fastify route schemas validate untrusted parameters, query values, and request
bodies at runtime. Response schemas also define the player-safe data boundary
used to generate OpenAPI.

Errors use a stable problem-style JSON envelope:

```json
{
  "type": "https://wits.world/problems/validation-error",
  "title": "Request validation failed",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "detail": "One or more request values are invalid.",
  "requestId": "server-generated-request-id"
}
```

Validation failures may additionally contain a `validation` array with safe
field and message values. Expected domain failures use explicit codes and HTTP
statuses. Unknown failures are logged server-side and returned as a generic
`500 INTERNAL_ERROR`; stack traces and internal exception details are not sent
to the client. JSON success bodies and all problem responses include the server
request identifier used for safe correlation; intentionally empty `204`
responses have no body.

Bearer-protected active-player operations also document the implemented
per-process `429 RATE_LIMITED` response and rate-limit headers. This does not
claim edge throttling for invalid-token traffic or aggregation across multiple
API processes.

## OpenAPI generation and maintenance

The API registers `@fastify/swagger` before its routes and generates OpenAPI
3.0.3 from the route schemas at runtime. `@fastify/swagger-ui` serves the
interactive reference at `/documentation/`; the machine-readable document is
available at `/documentation/json`.

The repository deliberately does not maintain a second hand-written endpoint
catalogue. Route integration tests inspect generated operations, bearer
security declarations, safe responses, and important exposure boundaries.
When an API contract changes, its route schema, implementation, tests, typed Web
client, and any affected narrative contract must change together.

## External publication evidence still needed

The repository supports a public generated reference and records one deployed
boundary review. Future milestone evidence should retain the deployed commit,
timestamp, public OpenAPI URL, successful retrieval of the JSON document, and a
sanitised screenshot or artifact when the rubric requires it. That evidence
must distinguish reference availability from successful authenticated use of a
protected operation.

## Related documentation

- [Trust boundaries](./trust-boundaries.md)
- [Author curation API contract](./author-curation-api-contract.md)
- [Asynchronous PvP API contract](./asynchronous-pvp-api-contract.md)
- [High-level data flow](./data-flow.md)
- [External integrations](./external-integrations.md)
- [API application guide](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/apps/api/README.md)
- [Azure deployment setup](../deployment/azure-deployment-setup.md)

## AI declaration

This API overview was generated, edited, and reviewed with the assistance of
Codex[GPT-5] and Codex[gpt-5.6-sol]. It summarises current repository schemas and recorded deployment
evidence rather than replacing the generated OpenAPI contract.
