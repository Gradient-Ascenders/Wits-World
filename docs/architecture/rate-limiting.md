---
title: Rate limits
description: Request quotas, rate-limit response headers, and retry behaviour for API callers.
---

# Rate limits

Authenticated HTTP requests have shared sliding-window limits. Player and
Author limits belong to the local account, so requests from different tabs or
devices share its quota. External developer reads have a separate quota for
each validated API key. Limits are shared across API instances.

Each request is evaluated against one policy selected by its route. The
policies have separate quotas; a gameplay request does not also consume the
general quota.

## Default quotas

These are the repository defaults. Every row uses a 60-second window; the
response headers report the configured limit for the request.

| Requests                                                                                                                                                                                                  | Limit per 60 seconds |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------: |
| General player and Author operations                                                                                                                                                                      |                  120 |
| Challenge attempt creation and answer submission, offline pack/attempt creation, CPU match creation, PvP invitation changes, trade recipient lookup/creation/preview/acceptance, and ranked queue joining |                   30 |
| Author analytics, question-performance reports, and trust-case exports                                                                                                                                    |                   30 |
| Live PvP connection-ticket creation                                                                                                                                                                       |                   30 |
| Developer-key creation                                                                                                                                                                                    |                   10 |
| Developer-key revocation                                                                                                                                                                                  |                   10 |
| External developer resources, per API key                                                                                                                                                                 |                  120 |

Battle actions, ranked queue heartbeats, and account deletion use the general
quota. Limits govern HTTP request frequency; they do not change game deadlines,
action legality, or permissions. Live WebSocket messages follow the
[live PvP protocol](live-pvp-api-contract.md).

## Reading the response

When the limiter makes a decision, the response includes:

| Header                | Meaning                                            |
| --------------------- | -------------------------------------------------- |
| `RateLimit-Limit`     | Maximum requests allowed in the applicable window. |
| `RateLimit-Remaining` | Requests remaining in that window.                 |
| `Retry-After`         | Whole seconds to wait after a `429` response.      |

Exceeding the quota returns **`429 RATE_LIMITED`** using the
[standard API error format](../api-reference.md#responses-and-retries).
Wait for `Retry-After` before trying again. Avoid immediate retry loops and
coordinate polling or parallel requests that share an account or API key.
A sliding window does not reset its full allowance at a fixed minute boundary.

## Service availability

If rate protection is temporarily unavailable, developer-key creation and live
connection-ticket creation return **`503 RATE_LIMIT_UNAVAILABLE`**. That
response has no quota headers or `Retry-After`; it indicates temporary service
unavailability rather than an exhausted allowance.

Other policies allow requests to continue when rate protection is unavailable.
Normal authentication, permissions, and feature checks still apply. Quota
exhaustion continues to return `429`, including for key revocation.

Use a bounded delay before retrying a temporary failure, and follow the
endpoint's retry rules before repeating a write with an uncertain outcome.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using repository configuration,
route policies, and rate-limit response handlers. Earlier documentation also
used Codex-CLI[GPT-5] and Codex-CLI[gpt-6-luna].
