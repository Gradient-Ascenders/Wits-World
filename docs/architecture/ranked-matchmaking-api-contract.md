---
title: Ranked matchmaking API
description: Join the ranked queue, respond to proposals, and read seasonal ratings and settlements.
---

# Ranked matchmaking API

Ranked matchmaking pairs eligible players and creates a live match after both
accept a proposal. The API supplies queue state, seasonal ratings, standings,
and each participant's settlement. Clients cannot select an opponent, rating,
season, or result.

See [Ranked competition](../requirements/ranked-competition-policy.md) for
eligibility, search ranges, cooldowns, rating calculations, and season rules.
[Live PvP](live-pvp-api-contract.md) covers the battle connection after matching;
[Territories](contested-campus-territory-api-contract.md) covers optional zone
claims and influence feedback.

## Access and queue routes

All routes require bearer authentication and an active player account. Successful
responses return the objects described below directly. Errors use the shared
[API format](../api-reference.md#responses-and-retries).

Routes below begin with `/api/v1` and return `200` on success.

| Method | Route                                   | Request and result                                                                                                     |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| POST   | `/ranked/queue`                         | Send `{ deckId }` to join; returns your queue state. Optional `territoryClaim` is described in the territory contract. |
| GET    | `/ranked/queue`                         | Read your queue state without renewing its lease.                                                                      |
| POST   | `/ranked/queue/heartbeat`               | Renew an unexpired searching lease; no body is required.                                                               |
| DELETE | `/ranked/queue`                         | Leave searching or decline your pending proposal; returns the resolved queue state.                                    |
| POST   | `/ranked/proposals/:proposalId/accept`  | Accept your proposal; no body is required.                                                                             |
| POST   | `/ranked/proposals/:proposalId/decline` | Decline your proposal; no body is required.                                                                            |

Joining uses the gameplay quota; other ranked requests use the general
[request quota](rate-limiting.md). A deck ID must identify the caller's valid
saved deck. Extra join-body fields are rejected.

## Queue state and deadlines

| Fields                                         | Meaning                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `status`                                       | `idle`, `searching`, `proposed`, `matched`, `cancelled`, `expired`, `restricted`, or `invalid_deck`. |
| `queueEntryId`, `seasonId`, `joinedAt`         | Queue identity, season, and original join time.                                                      |
| `leaseExpiresAt`, `searchRange`                | Searching lease deadline and current rating range.                                                   |
| `proposalId`, `acceptanceDeadline`, `accepted` | Pending proposal, its deadline, and whether you have accepted.                                       |
| `matchId`                                      | The committed live match ID after matching.                                                          |

Unavailable values are null. Proposals hide the opponent's name, deck, and
rating. A proposed pair is not yet a match.

While `searching`, heartbeat at least every 10 seconds to maintain the
30-second lease. GET requests do not extend it, and a heartbeat cannot revive
an expired entry. Stop heartbeats when leaving search or receiving a proposal.

A proposal gives both players 20 seconds to accept. Acceptance does not extend
the deadline. If only 1 player accepts, no match starts. Decline or expiry can
return an eligible accepting player to searching with their original join time;
the other player may enter the policy's cooldown. Render the returned state
rather than assuming a proposal always ends in a match.

Once `status` is `matched`, open `matchId` through the live API. Queue reads
return `idle` with no match ID after that battle completes, so returning to the
lobby does not reopen a historical result. Retrying acceptance still returns
the original committed match receipt. Cancelling a
queue does not cancel a match that has already committed. Use live resignation
when conceding an active battle.

## Rating and season reads

| Route                                            | Returned object                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/ranked/me`                          | `season`, `rating`, `wins`, `losses`, `settledMatchCount`, `placementMatchesRemaining`, and `provisional`. |
| `GET /api/v1/ranked/matches/:matchId/settlement` | Your match outcome, rating change, and optional territory result.                                          |
| `GET /api/v1/ranked/seasons/current`             | `{ season }`; null when no season is active or closing.                                                    |
| `GET /api/v1/ranked/standings`                   | Current-season `{ season, entries, nextCursor }`.                                                          |
| `GET /api/v1/ranked/seasons/:seasonId/standings` | Closed-season `{ season, entries, nextCursor }`.                                                           |

Season objects include `seasonId`, `name`, `status`, `policyVersion`,
`activatedAt`, `activeEndsAt`, and `closedAt`. A closing season can still be
read, while new queue entries require an active season. Profile `rating` can
be null when no seasonal rating exists.

Settlement includes `matchId`, `seasonId`, `status: pending|settled`,
`completionReason`, `outcome`, `ratingBefore`, `ratingAfter`, `appliedDelta`,
`settledAt`, and `territory`. Fields awaiting settlement can be null. A missing
match and another player's settlement return a neutral
`404 RANKED_MATCH_UNAVAILABLE`. Read `territory` using the
[contribution contract](contested-campus-territory-api-contract.md#match-contribution-feedback).

Only ranked live matches have ranked settlement. A completed battle is not
permission to calculate or write a rating locally; completion and settlement
commit together on the server.

## Standings pagination and privacy

Use `limit` from 1–100 (default 25) and the returned opaque `cursor`. Entries
contain `playerName`, `rank`, `rating`, `wins`, `losses`, and `settledMatchCount`.
`nextCursor: null` marks the end.

Current standings hold competitive values stable for a 10-minute traversal.
An invalid, foreign, or expired cursor returns `400 RANKED_CURSOR_INVALID`;
restart from the first page. Names resolve from current account records on each
page, and unavailable accounts are omitted. Closed-season competitive values
are fixed, while display names can change and personal entries can be removed
by account deletion.

Provisional ratings remain private until the player has completed the required
placements. Standings do not expose private queue candidates or decks.

## Conflicts and recovery

Ranked commands use the queue or proposal identity rather than a caller-supplied
submission UUID. Rejoining the same active selection returns the existing entry;
changing the deck or territory selection conflicts. Repeating acceptance for a
matched proposal returns its committed match ID.

After a timeout or lost response, read `/ranked/queue` before deciding what to
submit next. A cancellation racing with proposal resolution returns the
resolved state; it cannot undo an already created match.

| Response                                | Caller action                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `409 RANKED_STATE_CONFLICT`             | Read queue state before changing the selection.                               |
| `409 RANKED_DECK_INVALID`               | Choose a valid saved deck.                                                    |
| `409 RANKED_COOLDOWN`                   | Wait before rejoining; follow the competition policy.                         |
| `409 RANKED_ALREADY_PLAYING`            | Return to the existing active battle.                                         |
| `409 RANKED_UNAVAILABLE`                | Refresh season availability before joining.                                   |
| `403 RANKED_RESTRICTED`                 | Show the safe access message; repeated joining cannot bypass the restriction. |
| `404 RANKED_PROPOSAL_UNAVAILABLE`       | Refresh queue state rather than acting on the old proposal.                   |
| `503 GAMEPLAY_COORDINATION_UNAVAILABLE` | Keep current state, use a bounded retry delay, and refresh before continuing. |

Temporary service failures do not extend leases or proposal deadlines.

## AI declaration

Rewritten with assistance from Codex[GPT-6], using ranked route schemas, queue
handling, and read projections. Earlier versions also used Codex[GPT-5] and
Codex-CLI[GPT-5].
