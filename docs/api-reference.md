---
title: API reference
description: HTTP documentation, authentication, responses, and feature contracts for the Wits World API.
---

# API reference

The Wits World API serves player journeys, Author workspaces, and external
applications. It validates requests and applies the game's rules. Clients send
actions and display the returned state; the server decides eligibility, scores,
rewards, ownership, and battle outcomes.

## HTTP reference

Use the generated reference for exact endpoints, parameters, request bodies,
response schemas, and status codes:

- [Interactive OpenAPI reference](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/)
- [OpenAPI JSON](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/json)

Application routes begin with `/api/v1`. The health check at `/health` and the
OpenAPI reference at `/documentation/` sit outside that prefix. The reference
is generated from the route schemas used to validate requests and responses.

For a local API instance, follow [Getting started](development/getting-started.md).

## Authentication and access

| API area                     | Credential                             | Access                                                      |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Player operations            | `Authorization: Bearer <access-token>` | The authenticated player's permitted actions and data.      |
| Author operations            | `Authorization: Bearer <access-token>` | Content and reporting operations requiring the Author role. |
| External developer resources | `X-API-Key: <api-key>`                 | Selected read-only published data.                          |

Bearer tokens come from Auth0. The API verifies the token and resolves a local
account, then checks account state, role, and permissions for the requested
resource. Signing in does not grant access to another player's private data or
Author operations. Developer keys do not grant player or Author permissions.

See the [Developer API](architecture/developer-api.md) for obtaining a key and
its supported resources, and [Auth0 integration](architecture/external-integrations.md#auth0)
for the authentication boundary.

## Feature contracts

OpenAPI covers the HTTP operations, including accounts, collections, decks,
progression, and CPU battles. These guides explain feature-specific state,
permissions, versioning, and retry behaviour:

| Area                  | Contract                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players and cards     | [Profiles](architecture/player-profile-api-contract.md), [trading](architecture/card-trading-api-contract.md)                                                                                             |
| Challenges            | [Attempts and answers](architecture/challenge-attempt-api-contract.md), [offline play](architecture/offline-challenge-play.md)                                                                            |
| Player battles        | [Asynchronous PvP](architecture/asynchronous-pvp-api-contract.md), [live PvP](architecture/live-pvp-api-contract.md)                                                                                      |
| Competition           | [Ranked matchmaking](architecture/ranked-matchmaking-api-contract.md), [territories](architecture/contested-campus-territory-api-contract.md)                                                             |
| Author content        | [Events and questions](architecture/author-curation-api-contract.md), [campaigns](architecture/campaign-scheduling-api-contract.md), [event placement](architecture/automatic-event-placement-service.md) |
| Author reporting      | [Analytics API](architecture/advanced-analytics-api-contract.md)                                                                                                                                          |
| External applications | [Developer API](architecture/developer-api.md)                                                                                                                                                            |

OpenAPI describes HTTP operations. Live PvP also uses a WebSocket protocol:
an authenticated HTTP request obtains a short-lived connection ticket, then
versioned messages carry match updates and actions. The
[live PvP contract](architecture/live-pvp-api-contract.md) defines connection,
reconnect, deadline, and spectator behaviour.

## Responses and retries

Errors include an HTTP status, a stable `code`, a safe explanation, and a
`requestId`. For example, a missing resource returns:

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

Use the status and code to handle the failure; retain the request ID when
reporting it. Validation errors can also identify invalid fields. Internal
errors return a generic explanation rather than stack traces or private data.

Requests over their quota return `429 RATE_LIMITED`. The
[rate limits guide](architecture/rate-limiting.md) explains quotas, response
headers, and waiting before retrying.

For a write whose outcome is uncertain, follow its feature contract before
resubmitting. Contracts define when to reuse a submission identifier, fetch
current state, or handle a version conflict. A failed connection does not prove
that an action was rejected.

## AI declaration

Rewritten and moved to the API landing page with assistance from Codex[GPT-6],
using repository routes, authentication, and error handlers. Earlier API
documentation used Codex[GPT-5], Codex[gpt-5.6-sol], Codex-CLI[GPT-6], and
ChatGPT-Web[GPT-5.6 Sol].
