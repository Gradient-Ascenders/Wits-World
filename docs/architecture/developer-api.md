---
title: External developer API
description: Read published events, card definitions, and progression standings using a revocable API key.
---

# External developer API

The developer API gives external applications read-only access to published
events, the public card catalogue, and progression standings. It suits campus
event viewers, card guides, and backend integrations.

A developer key grants access to these resources. It does not grant player or
Author permissions, reveal private collections or battles, or allow gameplay
writes. Use the [API reference](../api-reference.md#http-reference) for the
interactive OpenAPI reference, exact schemas, and local API setup.

## Get and protect a key

Sign in and open **Account settings → Developer API access**. Give each key an
application name so you can identify and revoke it later. An active account can
have up to 5 active keys.

The complete credential appears only when creation succeeds. Save it then;
later responses show metadata and a non-secret prefix. Keep the key in a
server-side environment variable or secret store, outside source control,
screenshots, URLs, and public frontend bundles.

Revoking a key blocks subsequent requests. Keys also stop working when the
owning account becomes unavailable, including when account deletion begins.
Revoked keys no longer count towards the active-key limit.

## Authenticate a resource request

Send the complete credential in `X-API-Key`:

```http
X-API-Key: <api-key>
```

For a local API instance:

```bash
curl \
  -H "X-API-Key: $WITS_WORLD_API_KEY" \
  "http://127.0.0.1:3000/api/v1/developer/cards"
```

External resource routes use this header. Key-management routes use an Auth0
bearer token instead. A bearer token does not replace the developer key on
external reads, and a developer key cannot authenticate player or Author routes.

Invalid, missing, revoked, and unavailable-account credentials all return
`401 UNAUTHORIZED`, without revealing whether a particular key exists.

## Published events

| Route                                   | Response                             |
| --------------------------------------- | ------------------------------------ |
| `GET /api/v1/developer/events`          | `{ events, pagination, requestId }`. |
| `GET /api/v1/developer/events/:eventId` | `{ event, requestId }`.              |

Events contain `eventId`, `title`, `description`, `latitude`, `longitude`,
`radiusMetres`, `startsAt`, `endsAt`, and `availability`. Availability is
`active`, `upcoming`, or `ended`. Locations and times reflect the event's
current effective placement and schedule; published data can change between
requests.

The list accepts `page` (default 1) and `pageSize` (default 50, maximum 100).
It follows the same published discovery boundary as the player application.
Questions, accepted answers, player attempts, and eligibility evidence are
excluded. Reading an event through this API does not record a player event view.

## Public card catalogue

| Route                                           | Response                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/v1/developer/cards`                   | `{ cards, requestId }` containing the catalogue without pagination. |
| `GET /api/v1/developer/cards/:cardDefinitionId` | `{ card, requestId }`.                                              |

Only active, published ordinary card definitions are returned. Each card
contains its definition ID, name, category, affinity, rarity, description,
artwork fields, `hp`, `power`, and `deckPointCost`. Values that do not apply
can be null.

Evolution fields are `evolvesFromCardDefinitionId` and `evolutionCopiesRequired`.
`moves` contains `position`, `name`, `moveType`, `powerCost`, and `rulesText`;
`effects` contains `position` and `rulesText`. These are public card descriptions,
rather than private execution configuration or player-owned copies.

## Progression standings

```http
GET /api/v1/developer/leaderboard?period=all_time&page=1&pageSize=20
GET /api/v1/developer/leaderboard?period=monthly&month=2026-10&page=1&pageSize=20
```

The response is `{ period, month, entries, pagination, requestId }`. Entries
contain only `playerName`, `points`, and `rank`. This is the progression-points
leaderboard; ranked PvP ratings use the separate
[ranked API](ranked-matchmaking-api-contract.md).

`period` defaults to `all_time`, with `month: null` in the response. For
`monthly`, send `month` in `YYYY-MM` format. Omit `month` for all-time requests.
`page` defaults to 1 and `pageSize` to 20, with a maximum of 100.

Streaks, activity records, account identifiers, locations, and private gameplay
history are excluded. See [Progression rules](../requirements/player-progression-rules.md)
for the meaning of points and monthly standings.

## Pagination and responses

Successful resource reads return `200`. IDs in detail routes are UUIDs. Event
and leaderboard pages include:

```json
{
  "page": 1,
  "pageSize": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

`page` is an integer from 1 to 10,000 and `pageSize` from 1 to 100. A page beyond
the available results returns an empty collection. Responses are current reads,
rather than a frozen multi-page snapshot, so totals and entries can change
between requests. Extra query parameters are rejected on paginated routes.

## Manage keys through HTTP

These operations require `Authorization: Bearer <access-token>` for an active
account. They manage only that account's keys.

| Method | Route                           | Request and response                                         |
| ------ | ------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/v1/developer/keys`        | `200` with `{ keys, activeKeyLimit, requestId }`.            |
| POST   | `/api/v1/developer/keys`        | Send `{ name }`; `201` returns `{ key, apiKey, requestId }`. |
| DELETE | `/api/v1/developer/keys/:keyId` | `200` returns `{ key, requestId }` after revocation.         |

A name must contain non-whitespace text and be at most 80 characters; it is
trimmed before saving. Key metadata contains `id`, `name`, `keyPrefix`,
`createdAt`, `lastUsedAt`, `revokedAt`, and `status: active|revoked`. Usage time
is approximate and can be null. Creation returns `Cache-Control: no-store`.

Revoking an already-revoked owned key is safe. Creation has no idempotency key:
if its response is lost, list your keys and revoke the uncertain new key before
creating a replacement. The secret cannot be recovered from a later list.

## Limits and recovery

External reads have a quota per validated key. Key creation and revocation have
separate account quotas. The [rate limits guide](rate-limiting.md) defines the
current defaults, headers, and temporary-service behaviour; it also explains
why revocation remains available when rate protection is unavailable.

Errors use the [standard API format](../api-reference.md#responses-and-retries).
Keep the `requestId` when reporting a failure.

| Response                              | Caller action                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `400 VALIDATION_ERROR`                | Check parameter types, UUIDs, pagination bounds, and period/month combinations.  |
| `401 UNAUTHORIZED`                    | Check the credential required by this route and whether the key is still active. |
| `403 ACCOUNT_UNAVAILABLE`             | Key management is unavailable for this account.                                  |
| `404 NOT_FOUND`                       | The public resource or owned key is unavailable.                                 |
| `409 DEVELOPER_API_KEY_LIMIT_REACHED` | Revoke an existing key before creating another.                                  |
| `429 RATE_LIMITED`                    | Wait for `Retry-After` before retrying.                                          |
| `503 RATE_LIMIT_UNAVAILABLE`          | Delay before retrying key creation; no new key was issued by this rejection.     |

Read requests can be retried after transient connection or server failures.
Follow the creation recovery steps above when a write's outcome is uncertain.

## Browser integrations

Use a backend to call the developer API on behalf of a public frontend, keeping
the reusable key on the server. Arbitrary cross-origin browser requests are not
supported by the API's CORS policy. CORS does not restrict direct HTTP clients
such as backend services, Postman, or `curl`.

The interactive reference is served by the API and supports developer-key
authorisation. For storage and account lifecycle details, see
[key storage](../database/developer-api-keys.md) and
[account retention](../database/account-deletion-retention.md).

## AI declaration

Rewritten with assistance from Codex[GPT-6], using developer routes,
public response schemas, and key-management behaviour. Earlier documentation
used ChatGPT-Web[GPT-5.6 Sol].
