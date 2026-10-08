---
title: 'API rate limiting'
---

# API rate limiting

The Fastify API uses Upstash Redis as shared state for authenticated HTTP rate
limits. Each named policy uses a sliding window. A request uses one policy,
chosen by its route, after the server validates its identity. This replaces the
former process-local counter whose window began with the first request. The
same numeric limit can therefore reject a different burst pattern near a
window boundary.

| Policy              | Default    | Identity                              | Failure behavior | Routes                                                                                                                                                                       |
| ------------------- | ---------- | ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player-general`    | 120 / 60 s | Resolved local player UUID            | Open             | Authenticated routes without an override                                                                                                                                     |
| `developer-api`     | 120 / 60 s | Validated internal developer-key UUID | Open             | External read-only developer resources                                                                                                                                       |
| `critical-write`    | 10 / 60 s  | Local player UUID                     | Closed           | Developer-key creation                                                                                                                                                       |
| `credential-revoke` | 10 / 60 s  | Local player UUID                     | Open             | Developer-key revocation                                                                                                                                                     |
| `gameplay-write`    | 30 / 60 s  | Local player UUID                     | Open             | Challenge attempt creation and answers, offline pack/attempt creation, CPU match creation, PvP invitation mutations, trade creation/preview/acceptance, ranked queue joining |
| `author-expensive`  | 30 / 60 s  | Local player UUID                     | Open             | Author analytics, question performance, trust-case export                                                                                                                    |
| `live-ticket`       | 30 / 60 s  | Local player UUID                     | Closed           | Live PvP connection-ticket minting                                                                                                                                           |

The account-deletion endpoint stays on `player-general`: making account
deletion depend on Upstash availability could delay the existing privacy and
retry flow. Battle actions and ranked queue heartbeats also remain on the
general policy to avoid an unnecessarily low ceiling for normal play.
Revocation stays available during an Upstash outage so a player can disable a
compromised credential; normal quota exhaustion still returns `429`.

The API sends `RateLimit-Limit` and `RateLimit-Remaining` when a limiter gives a
decision. Quota exhaustion returns the usual `429 RATE_LIMITED` problem body
and `Retry-After` in whole seconds. Store errors and timeouts on open policies
allow the request and emit a safe warning. Closed policies return a distinct
`503 RATE_LIMIT_UNAVAILABLE` problem, without a misleading quota header or
`Retry-After`. The timeout is configured by `RATE_LIMIT_TIMEOUT_MS`.

Redis prefixes are versioned (`ww:rl:v1:<policy>`). Identifiers are the
server-resolved player UUID or validated internal developer-key UUID. Tokens,
raw developer keys, tickets, query strings, and raw IP addresses are not used
as Redis keys. Upstash analytics and successful-decision local caching are off.
Application logs record the policy and outcome without Redis credentials or
identifiers. The application limiter does not replace gameplay authority,
authorization, or edge denial-of-service protection.

`/health`, public documentation and version routes do not call Upstash. Live
PvP WebSocket messages do not call this HTTP limiter. Anonymous and invalid
credential traffic have no application rate limit yet: the Azure proxy chain
must be verified before trusting a client IP or `X-Forwarded-For` for that
purpose.

Production requires `RATE_LIMIT_BACKEND=upstash` (the default) and the
server-only `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; missing or
malformed settings stop startup. For local development only, explicitly set
`RATE_LIMIT_BACKEND=local` without Upstash credentials. This selects a
process-local sliding-window implementation whose counters do not survive a
restart or span instances. It is selected only at startup, never as an outage
fallback, and production rejects it. Unit and Fastify tests inject deterministic
fakes and never call a real Upstash service. Multi-instance behavior, deployed
latency, Upstash outages and load behavior still need controlled deployment
checks.

The gameplay scheduler reuses these Redis credentials in a separate
`ww:gameplay:v1:<database-namespace>` keyspace. Its persistent intents and
activity snapshots are not rate-limit counters and must not be expired or
deleted with counter cleanup. Ranked API mutations can therefore return
`503 GAMEPLAY_COORDINATION_UNAVAILABLE` when their durable pre-write signal is
unavailable, even if the general HTTP policy allowed the request. Season
transitions and pairing also pause when Redis coordination is unavailable.
Existing queue/proposal expiry and due territory settlement continue under a
shared PostgreSQL transaction advisory lock without publishing or validating a
Redis intent. This explicit existing-work guard cannot be used as an outage
fallback for creating new work. The scheduler retries the paused creation
phases at the active cadence while preserving cleanup throttles. Existing live
actions do not introduce or reactivate matches and remain independent of Redis
gameplay coordination; monitoring failures force fast database scans. The HTTP
limiter's open/closed policy itself is unchanged, including the closed
`live-ticket` policy. Include
the scheduler's snapshot reads and Lua commands in the same Redis quota.
See [Gameplay workers](../deployment/ranked-operations.md) for staged rollout,
recovery, and command budgeting.

---

This page was drafted with assistance from Codex[GPT-6].

Gameplay coordination interaction documented with assistance from Codex-CLI[GPT-5].
Existing-work outage behavior was clarified with assistance from Codex-CLI[gpt-6-luna].
