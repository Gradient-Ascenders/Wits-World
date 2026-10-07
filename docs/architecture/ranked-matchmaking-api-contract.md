---
title: 'Ranked matchmaking API contract'
---

# Ranked matchmaking API contract

Issue `#266` implements the server side of the approved
[ranked-v1 policy](../requirements/ranked-competition-policy.md). Ranked play
uses the existing [live PvP transport](live-pvp-api-contract.md) once both
players accept. All routes require a bearer token and an active local player.
The server derives identity from the token; request bodies cannot choose a
rating, opponent, season, result, or queue status.

## Queue and proposal

| Method and path                                     | Request                | Successful response                                                               |
| --------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `POST /api/v1/ranked/queue`                         | `{ "deckId": "uuid" }` | Private queue state; joining the same active entry is idempotent.                 |
| `GET /api/v1/ranked/queue`                          | None                   | Private queue state; does not extend a lease.                                     |
| `POST /api/v1/ranked/queue/heartbeat`               | None                   | Private queue state; an unexpired searching entry receives a new 30-second lease. |
| `DELETE /api/v1/ranked/queue`                       | None                   | Cancels searching, or declines a pending proposal.                                |
| `POST /api/v1/ranked/proposals/:proposalId/accept`  | None                   | Private queue state; after both accept, includes the committed live match ID.     |
| `POST /api/v1/ranked/proposals/:proposalId/decline` | None                   | Private queue state after resolution.                                             |

Queue state includes `status`, `queueEntryId`, `seasonId`, `joinedAt`,
`leaseExpiresAt`, `searchRange`, `proposalId`, `acceptanceDeadline`, `accepted`,
and `matchId`. Unavailable values are `null`. A proposal discloses no opponent
identity, deck, rating, or candidate list. The client should heartbeat at least
every 10 seconds while searching. It should stop heartbeats after leaving
search or receiving a proposal. A status read is suitable for reconnect and
for observing the result of a retry.

The worker selects the oldest searching anchor with an eligible pair. Both
players must fit each other's widening range. Claim, proposal creation, and
queue transition commit together. A proposal expires 20 seconds after creation.
Acceptance does not extend it. Decline or timeout applies a 30-second cooldown
to a non-accepting player; an accepting player keeps the original join time
and receives a fresh lease only after a fresh eligibility check. An accepted
player whose deck or account fails that check leaves search; invalid deck or
restriction failures receive the same cooldown. Season closure cancels queue
state without a cooldown. A same-proposal accept retry after match creation
returns the original persisted match ID.

Queue cancellation serializes with proposal acceptance, decline, and expiry.
If another resolution requeues the caller first, cancellation leaves that
searching entry in the same transaction. A match already committed before
cancellation remains matched.

## Rating and standings reads

| Method and path                                                      | Response                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/v1/ranked/me`                                              | Own current season, rating, wins, losses, settled count, provisional flag, and remaining placements. |
| `GET /api/v1/ranked/matches/:matchId/settlement`                     | Own ranked result, or `pending` while the match is active. Other players receive a neutral 404.      |
| `GET /api/v1/ranked/seasons/current`                                 | `{ "season": null }` when none is active or closing; otherwise season dates and policy version.      |
| `GET /api/v1/ranked/standings?limit=25&cursor=...`                   | Established current season standings and optional next cursor.                                       |
| `GET /api/v1/ranked/seasons/:seasonId/standings?limit=25&cursor=...` | Immutable competitive facts for a closed season, with current safe display names.                    |

Page size is 1–100. Both standings cursors are signed and bound to the viewer.
Current standings create a private, ten-minute competitive snapshot on the
first page, then page by stable ordinal. Player Names resolve from the current
player record on every page; deleted or deletion-pending accounts are omitted
from current standings. An expired or foreign cursor returns 400 and the client
starts a fresh traversal. Personal archive entries are removed on deletion;
shared match outcomes can render a deleted participant as `Deleted player`.

Provisional ratings are private and never enter current standings before five
settled matches. Rating settlement is part of the existing authoritative live
terminal transaction. CPU, asynchronous PvP, and casual live matches have no
ranked receipt and do not settle a ranked rating.

## Operational boundary

Deploy migrations `0047`, `0050`, `0051`, and `0052` before an API version that registers these
routes and the ranked worker. The worker is safe to run on every API instance;
database locks serialize claims and season changes. No season is created by
deployment. An operator schedules seasons as described in
[ranked operations](../deployment/ranked-operations.md).

With shared gameplay coordination configured, ranked mutations publish a
durable activity intent before database writes. If publication or intent
validation fails, the mutation returns `503 GAMEPLAY_COORDINATION_UNAVAILABLE`
without committing its change; the client can retry. Ordinary queue/profile
reads do not publish intents. Activity detection does not extend queue leases
or proposal deadlines. The operations guide describes the required staged
rollout before enabling long idle database sleeps.

## AI declaration

This document was created and reviewed with assistance from Codex (GPT-5).

This account-deletion update was edited with assistance from Codex[GPT-6].

Durable scheduling availability documented with assistance from Codex-CLI[GPT-5].
