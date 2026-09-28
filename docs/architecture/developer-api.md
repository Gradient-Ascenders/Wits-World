---
title: 'External developer API'
---

# External developer API

## Purpose

Wits World exposes a deliberately limited, read-only developer API so external
applications can consume public Wits Quest data without using the player Web
application. It is intended for tools such as campus event viewers, card guides,
leaderboard displays, server-side bots, Postman, `curl`, and assessment HTTP
requests.

The developer API does **not** turn a developer key into a player login. It
cannot read a player's collection, decks, attempts, matches, private profile,
trust information, or authoring data, and it cannot mutate gameplay state.

The generated OpenAPI document remains the source of truth for exact schemas:

- local interactive reference: `http://127.0.0.1:3000/documentation/`
- local OpenAPI JSON: `http://127.0.0.1:3000/documentation/json`

## Getting a developer API key

An authenticated Wits World account can create keys from **Account settings →
Developer API access**. A key has a human-readable name so separate applications
can use separate credentials. An account may have at most five active keys.

The complete credential is shown only in the successful creation response. Save
it immediately. Later key-list responses expose only a non-secret prefix and
metadata. Wits World stores a SHA-256 verifier of the machine-generated secret,
not the complete key.

Treat a developer key like a password:

- keep it out of Git and screenshots;
- do not put it in URLs or query parameters;
- do not embed it in browser JavaScript or a public frontend bundle;
- use a server-side environment variable or another appropriate secret store;
- revoke it from Account settings if it may have been exposed.

Revocation takes effect for subsequent developer requests. A key also stops
working as soon as its owning Wits World account is no longer active, and its
stored credential record is removed during local account-deletion cleanup.

## Authentication

Send the credential only in the `X-API-Key` request header:

```http
X-API-Key: ww_api_<public-id>_<secret>
```

For example, with a local shell environment variable:

```bash
curl \
  -H "X-API-Key: $WITS_WORLD_API_KEY" \
  "http://127.0.0.1:3000/api/v1/developer/cards"
```

Missing, malformed, incorrect, revoked, or inactive-owner credentials receive a
generic `401` response. The API does not reveal whether a particular public key
identifier exists.

Auth0 bearer tokens and developer keys are separate authentication mechanisms.
A bearer token does not satisfy the external developer endpoints, and a
developer key does not satisfy ordinary player, author, or gameplay endpoints.

## Read-only resources

### Published events

```http
GET /api/v1/developer/events?page=1&pageSize=50
GET /api/v1/developer/events/:eventId
```

The collection is bounded to page sizes of at most 100. It reuses the same
published-event discovery boundary as the player application and exposes only:

- event ID;
- title and public description;
- effective latitude and longitude;
- event radius;
- effective start and end times; and
- current `active`, `upcoming`, or `ended` availability.

It does not expose challenge questions or accepted answers, author/reviewer
metadata, placement-assignment internals, movement evidence, eligibility
history, attempts, or anti-abuse information. Developer reads do not count as
player event views in product analytics.

### Public card catalogue

```http
GET /api/v1/developer/cards
GET /api/v1/developer/cards/:cardDefinitionId
```

Only active, published, ordinary catalogue cards are returned. The public
projection contains player-visible card identity and game information such as
name, rarity, category, affinity, HP/Power where applicable, artwork metadata,
deck point cost, evolution relationship, and player-readable moves/effects.

The endpoint does not expose authoring state, reward/starter/CPU eligibility
flags, ownership, drop configuration, or internal effect execution/configuration
metadata.

### Public progression leaderboard

```http
GET /api/v1/developer/leaderboard?period=all_time&page=1&pageSize=20
GET /api/v1/developer/leaderboard?period=monthly&month=2026-09&page=1&pageSize=20
```

This is the existing progression/points standing, not ranked-PvP rating. Entries
contain only:

- public Player Name;
- points; and
- rank.

Player UUIDs, Auth0 identity, streak/activity detail, locations, moderation,
trust information, private match history, and private progression data are not
part of this contract.

## Rate limiting

Each validated developer key has an independent shared Upstash Redis
sliding-window request limit. The default is **120 requests per 60 seconds**
and can be changed by the
API operator through:

```text
DEVELOPER_API_RATE_LIMIT_MAX_REQUESTS
DEVELOPER_API_RATE_LIMIT_WINDOW_MS
```

Successful authenticated requests include `RateLimit-Limit` and
`RateLimit-Remaining`. A request above the current window returns `429
RATE_LIMITED` and a `Retry-After` header.

The limiter shares state across API processes and restarts. This changes the
former first-request-anchored fixed-window behavior; a burst near a window
boundary may be treated differently. On Upstash timeout or outage, this
developer read policy fails open and logs a safe degradation warning. It does
not replace an edge/WAF denial-of-service control. See [API rate limiting](./rate-limiting.md).

## Browser CORS boundary

The deployed API keeps the existing exact-origin CORS policy for the Wits World
Web application. The project does not add `X-API-Key` to arbitrary cross-origin
browser access because a developer credential is a reusable secret and should
not be shipped in public frontend code.

CORS does not affect direct HTTP clients such as `curl`, Postman, backend
services, or server-side bots. Swagger UI is served by the API itself and can be
used to authorise with a developer key and exercise these endpoints.

## Key-management HTTP operations

Account settings use Auth0 bearer authentication for the credential lifecycle:

```http
GET    /api/v1/developer/keys
POST   /api/v1/developer/keys
DELETE /api/v1/developer/keys/:keyId
```

These operations are account management, not part of the external read-only
resource surface. `POST` is the only operation that returns the complete API
key. Revoking an already-revoked owned key is idempotent.
Creation and revocation each have a 10-request-per-60-second sliding-window
policy. Creation returns a safe `503 RATE_LIMIT_UNAVAILABLE` if the limiter is
unavailable; revocation remains available during a limiter outage so a player
can disable a compromised key. Both still return `429 RATE_LIMITED` on actual
quota exhaustion, and both retain bearer authentication and ownership checks.

## Error model

Developer operations use the same problem-style envelope as the rest of the
hand-written API. Common outcomes include:

| Status | Meaning                                                     |
| ------ | ----------------------------------------------------------- |
| `400`  | Request parameter/body validation failed.                   |
| `401`  | A valid developer key is required for an external resource. |
| `403`  | The authenticated account cannot manage keys.               |
| `404`  | A requested public resource or owned key was not found.     |
| `409`  | The account already has five active developer keys.         |
| `429`  | The current developer-key rate-limit window is exhausted.   |

Unknown server failures remain generic to the caller and retain the normal
request/correlation identifier for diagnosis.

## Security model summary

```text
Auth0 bearer token
  -> active Wits World account
  -> create/list/revoke that account's developer keys

X-API-Key
  -> active developer credential
  -> per-key rate limit
  -> GET published events / public cards / public leaderboard only
```

Raw developer keys are redacted from structured request logs and never stored
in the database. External response DTOs are explicit allow-lists rather than
raw database rows.

## Related documentation

- [API overview](./api-overview.md)
- [Trust boundaries](./trust-boundaries.md)
- [External integrations](./external-integrations.md)
- [Developer API key persistence](../database/developer-api-keys.md)
- [Account deletion and retained data](../database/account-deletion-retention.md)

## AI declaration

This document was generated and edited with the assistance of:
ChatGPT-Web[GPT-5.6 Sol].
