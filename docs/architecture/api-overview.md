---
title: 'API overview and endpoint reference'
description: How the Wits Quest API is structured, secured, documented, and tested.
---

# API overview and endpoint reference

`apps/api` is the hand-written Fastify and TypeScript API for Wits Quest. It
validates requests, checks permissions, applies game rules, and reads or writes
authoritative state in PostgreSQL/PostGIS.

The browser sends an intended action and renders the response. It does not
decide identity, eligibility, scores, rewards, ownership, legal battle actions,
or match results.

## OpenAPI and addresses

| Boundary            | Local address                              |
| ------------------- | ------------------------------------------ |
| API                 | `http://127.0.0.1:3000`                    |
| Health check        | `http://127.0.0.1:3000/health`             |
| Versioned API       | `http://127.0.0.1:3000/api/v1/`            |
| Interactive OpenAPI | `http://127.0.0.1:3000/documentation/`     |
| OpenAPI JSON        | `http://127.0.0.1:3000/documentation/json` |

The recorded production API is
`https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net`.
Its [interactive reference](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/)
is generated from the same route schemas used for runtime validation.

Application routes use `/api/v1`. A breaking contract change requires a new
version instead of a silent change to existing behaviour. Health and OpenAPI
routes sit outside the versioned application prefix.

## Authentication and permissions

Player and Author routes use an Auth0 bearer token:

```http
Authorization: Bearer <access-token>
```

The API validates the token signature, issuer, audience, and expiry. It then
maps the validated Auth0 identity to a local player record. That record supplies
the account state and `player` or `author` role.

Authentication identifies the caller. Each route must still check account
state, role, ownership, publication state, and object permissions. CORS limits
which browser origins may call the API, but CORS is not authentication.

The external developer API uses `X-API-Key`. It exposes selected read-only
public data and does not grant player or Author permissions.

## Resource areas

| Area                   | Responsibility                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Accounts               | Local identity, player names, profiles, and account lifecycle                         |
| Events and challenges  | Published discovery, location checks, timed attempts, marking, and review             |
| Cards and decks        | Rewards, collections, evolution, owned copies, saved decks, and active deck selection |
| Trails and progression | Ordered progress, points, achievements, rankings, and standings                       |
| Battles                | CPU, asynchronous, live, and ranked match operations                                  |
| Trading                | Private offers, approvals, cancellation, expiry, and atomic settlement                |
| Authoring              | Content lifecycle, campaigns, placement, moderation, and analytics                    |
| Developer API          | Read-only published events, card catalogue, and public leaderboard data               |

Use the generated OpenAPI page for exact HTTP paths, parameters, request
bodies, status codes, and response schemas. Use the narrative contracts for
rules that need more explanation:

- [Challenge attempts](challenge-attempt-api-contract.md)
- [Events and questions](author-curation-api-contract.md)
- [Author cards](../design/author-cards.md)
- [Author trail operations](../database/ordered-trails-persistence.md#author-operations)
- [Content review and publication](diagrams/content-review.md#versions-and-history)
- [Campaign scheduling](campaign-scheduling-api-contract.md)
- [Event placement](automatic-event-placement-service.md)
- [Asynchronous PvP](asynchronous-pvp-api-contract.md)
- [Live PvP and WebSocket messages](live-pvp-api-contract.md)
- [Ranked matchmaking](ranked-matchmaking-api-contract.md)
- [Card trading](card-trading-api-contract.md)
- [Author analytics](advanced-analytics-api-contract.md)
- [External developer API](developer-api.md)

## Realtime boundary

OpenAPI describes HTTP only. Live PvP uses HTTP to obtain a short-lived ticket,
then uses a WebSocket connection for versioned messages. The server keeps match
state, turn deadlines, reconnect state, and spectator-safe views authoritative.
See the [live PvP contract](live-pvp-api-contract.md) for the protocol.

## Validation and errors

Fastify schemas validate parameters, queries, request bodies, and responses.
Errors use a stable JSON structure:

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

Expected failures use specific codes and HTTP statuses. Unknown failures are
logged on the server and returned as a generic `500 INTERNAL_ERROR`. Stack
traces and private implementation details are not returned to clients.

Rate-limited routes return `429 RATE_LIMITED` with rate-limit headers. See
[API rate limiting](rate-limiting.md) for policy and deployment details.

## Keeping the contract current

The API registers `@fastify/swagger` before its routes and generates OpenAPI
3.0.3 at runtime. The repository does not maintain a second hand-written list
of endpoints. When a contract changes, update the route schema,
implementation, tests, typed Web client, and affected narrative guide together.

## Evidence limits

A public OpenAPI page proves that the reference is reachable. It does not prove
that authenticated operations, realtime delivery, or production recovery work.
A release record should name the deployed revision, time, environment, and
results of protected and realtime checks.

See the [deployed boundary review](../testing/deployed-auth-cors-privacy-review.md)
for the recorded checks from 22 August 2026.

## AI declaration

This page was generated and edited with assistance from Codex[GPT-5],
Codex[gpt-5.6-sol], Codex-CLI[GPT-6], and ChatGPT-Web[GPT-5.6 Sol]. It was
rewritten in simpler language with assistance from Codex[GPT-5].
