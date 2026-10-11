---
title: Player battles API
description: Invite a player to an asynchronous battle, submit versioned actions, and retrieve private match history.
---

# Player battles API

The asynchronous battle API supports invitations and saved matches that players
can return to later. Clients use HTTP reads and polling to recover current state.
The server validates decks, resolves actions, enforces deadlines, and records
results.

See [Player battles](../requirements/player-asynchronous-pvp-journey.md) for the
journey and mode comparison, and [Battle rules](../requirements/battle-rules.md)
for combat. Live connections and ranked pairing have separate
[live PvP](live-pvp-api-contract.md) and [matchmaking](ranked-matchmaking-api-contract.md)
contracts.

## Access and response version

All routes require bearer authentication and an active player account. Use the
current response capability on invitation and match requests:

```http
Accept: application/vnd.wits-world.pvp.v5+json, application/json;q=0.9
```

This enables cancellation and resignation capabilities, participant battle
history, and voluntary Creature swaps. Older projections omit newer fields or
return `409 PVP_CLIENT_UPDATE_REQUIRED` when the client cannot handle a terminal
state. Treat an absent capability as unavailable and update the client before
using it.

See the [API reference](../api-reference.md) for authentication and shared error
handling. Invitation mutations use the gameplay quota; lookup, lists, match
actions, and resignation use the general [request quota](rate-limiting.md).

## Routes

Routes below begin with `/api/v1`.

| Method | Route                                            | Purpose                                           |
| ------ | ------------------------------------------------ | ------------------------------------------------- |
| GET    | `/matches/pvp/players?playerName=…`              | Look up an exact opponent Player Name.            |
| POST   | `/matches/pvp/invitations`                       | Create an invitation.                             |
| GET    | `/matches/pvp/invitations`                       | List your incoming and outgoing invitations.      |
| POST   | `/matches/pvp/invitations/:invitationId/accept`  | Accept with your saved deck and opening Creature. |
| POST   | `/matches/pvp/invitations/:invitationId/decline` | Decline as the recipient.                         |
| POST   | `/matches/pvp/invitations/:invitationId/cancel`  | Cancel as the challenger.                         |
| GET    | `/matches/pvp`                                   | List your active asynchronous matches.            |
| GET    | `/matches/pvp/history`                           | List your completed asynchronous matches.         |
| GET    | `/matches/pvp/:matchId`                          | Read a participant view of the match.             |
| POST   | `/matches/pvp/:matchId/actions`                  | Submit a battle action.                           |
| POST   | `/matches/pvp/:matchId/resign`                   | Concede an active match.                          |

Creation returns `201`; other successful operations return `200`. Success
responses include `requestId`. Lookup returns only `{ playerName, requestId }`,
without the target's collection or account details. Missing, self, or unavailable
targets return `404 PVP_PLAYER_UNAVAILABLE`.

## Invitations

Create with `opponentPlayerName`, `deckId`, `initialCreatureId`, and a UUID
`submissionId`. The deck must belong to the caller, and the opening Creature
must be a Creature copy in that deck. The server validates and snapshots the
deck; later edits do not rewrite the invitation's cards.

Acceptance requires `deckId`, `initialCreatureId`, `submissionId`, and
`expectedVersion`. Decline and cancellation require only `submissionId` and
`expectedVersion`. Versions are non-negative integers from the latest response;
extra body fields are rejected.

Creation, decline, and cancellation return `{ invitation, requestId }`.
Acceptance returns `{ invitation, match, requestId }`. The invitation includes:

| Fields                                             | Meaning                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `invitationId`, `direction`, `opponent.playerName` | Invitation identity and viewer-relative `incoming` or `outgoing` direction. |
| `status`, `version`                                | Current state and version to use for a decision.                            |
| `createdAt`, `expiresAt`, `respondedAt`            | Server timestamps; `respondedAt` is null while pending.                     |
| `matchId`                                          | The accepted match ID, otherwise null.                                      |
| `canCancel`                                        | Server capability for cancelling a pending outgoing invitation.             |

Invitations expire after 24 hours. Their status is `pending`, `accepted`,
`declined`, `cancelled`, `expired`, or `invalidated`; closed invitations cannot
be reopened. Only 1 pending invitation may exist for a player pair. Invitation
views hide decks and opening selections. Acceptance creates the match with
both saved decks and opening Creatures.

## Match state and actions

A match response returns its fields directly. `mode` is `asynchronous`, `status`
is `active` or `completed`, and `version` identifies the saved state. It includes
`opponent`, `currentActor`, `turnDeadline`, `state`, `legalActions`, `history`,
`lastAction`, `canResign`, outcome fields, and lifecycle timestamps.

`state` contains `phase`, `turnNumber`, `self`, and `opponent`. Your own cards
are visible; the opponent view exposes active or defeated Creatures, played
Power cards, and remaining counts. Unrevealed opponent cards stay hidden,
including in completed history. Outcome and completion reason are null until
completion; a deleted opponent is labelled `Deleted player`.

Action submission requires `{ submissionId, expectedVersion, action }`.
Choose from the current `legalActions` and use its returned identifiers:

| Action type          | Identifier field |
| -------------------- | ---------------- |
| `use_move`           | `moveId`         |
| `use_power_card`     | `powerCardId`    |
| `swap_creature`      | `creatureId`     |
| `select_replacement` | `creatureId`     |

Each action object contains its `type` and identifier. Opening selections are
already part of the invitation; this endpoint accepts neither initial selection
nor client timeout actions. Returned legal actions do not reserve permission:
the server rechecks the version, deadline, and legality when the request acts.

Each required match decision has a 24-hour deadline. A missed decision forfeits
the match. A new action applied at or after the deadline is late. Reads and
mutations resolve elapsed deadlines, so a stale countdown
cannot extend play. Resignation uses `{ submissionId, expectedVersion }` and
can occur regardless of whose turn it is. An elapsed deadline takes precedence
when resolving a new resignation request.

## Lists and polling

Lists use `limit` (1–50, default 20) and an opaque `cursor`. Invitation lists
also accept `direction: incoming|outgoing` and any invitation `status`. Repeat
the same filters and limit when using a returned cursor.

Invitation lists return `{ invitations, nextCursor, requestId }`; active and
history lists return `{ matches, nextCursor, requestId }`. A null cursor marks
the end. Invitations are ordered by creation, active matches by update, and
history by completion, newest first.

Refresh the visible list or open match rather than traversing every page on each
poll. Deduplicate matches by ID and retain the greatest version, since active
match ordering can change during pagination. Pause polling when the page is
hidden and fetch current state when returning or reconnecting.

## Conflicts and retries

Use a new `submissionId` for each intended command. Retry an uncertain command
with the same ID and identical body; it cannot advance the match or record
completion twice. A replay can describe an earlier committed version, so fetch
current state before making the next decision.

| Response                                                                                  | Caller action                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `400 PVP_DECK_INVALID`                                                                    | Choose a valid saved deck and an opening Creature from it.                                   |
| `404 PVP_INVITATION_NOT_FOUND` or `PVP_MATCH_NOT_FOUND`                                   | Treat the resource as unavailable; these codes also cover another player's private resource. |
| `409 PVP_INVITATION_ALREADY_PENDING`                                                      | Refresh invitations rather than creating another for the same pair.                          |
| `409 PVP_INVITATION_VERSION_CONFLICT` or `PVP_MATCH_VERSION_CONFLICT`                     | Reload and review the latest state before submitting a new decision.                         |
| `409 PVP_IDEMPOTENCY_CONFLICT`                                                            | Do not reuse an ID for different intent.                                                     |
| `409 PVP_ACTION_ILLEGAL`                                                                  | Refresh the match and use its current legal actions.                                         |
| `409 PVP_INVITATION_EXPIRED`, `PVP_INVITATION_CANCELLED`, or `PVP_INVITATION_INVALIDATED` | Refresh the invitation list and show its closed state.                                       |
| `409 PVP_MATCH_COMPLETED`                                                                 | Fetch and show the final match.                                                              |

A lost connection does not prove an action failed. Retrieve the match or
intentionally retry the original command; do not create a new command ID merely
because its response was lost. Completed results and progression are recorded
once under the [progression rules](../requirements/player-progression-rules.md#asynchronous-pvp-progression).

## AI declaration

Rewritten with assistance from Codex[GPT-6], using asynchronous battle routes,
client capabilities, and response handling. Earlier versions also used
Codex[GPT-5], Codex-CLI[GPT-5], and Codex-CLI[gpt-5.6-sol medium].
