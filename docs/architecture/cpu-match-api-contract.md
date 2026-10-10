---
title: CPU battles API
description: Create, resume, play, forfeit, and review server-authoritative CPU battles.
---

# CPU battles API

The CPU battles API runs a private match between the authenticated player and a
server-controlled deck. The server snapshots both decks, validates actions,
chooses CPU actions, enforces turn deadlines, and records the final result.

See [CPU battles](../requirements/player-cpu-battle-journey.md) for the player
journey and [Battle rules](../requirements/battle-rules.md) for combat rules.

## Access and response version

All routes require bearer authentication and an active player account. Include
the current response capability on match and history requests:

```http
Accept: application/vnd.wits-world.cpu.v2+json, application/json;q=0.9
```

This projection includes voluntary swaps and Creature identifiers in battle-log
events. Older clients receive the previous projection, which omits those newer
fields. Use identifiers and legal actions from the same current response.

## Routes

Routes below begin with `/api/v1`.

| Method | Route                       | Purpose                                           |
| ------ | --------------------------- | ------------------------------------------------- |
| POST   | `/matches/cpu`              | Create a match from the selected saved deck.      |
| GET    | `/matches/cpu/entry`        | Read the small active-match dashboard projection. |
| GET    | `/matches/cpu`              | Recover the player's active match.                |
| GET    | `/matches/:matchId`         | Read one owned CPU match.                         |
| POST   | `/matches/:matchId/actions` | Submit one intended player action.                |
| POST   | `/matches/:matchId/forfeit` | End an active match as a CPU victory.             |
| GET    | `/matches/history`          | List the player's completed CPU matches.          |

Creation returns `201`; other successful operations return `200`. Responses
include `requestId`. Match reads return only matches owned by the caller.

## Create and recover a match

Create with `{ "deckId": "…" }`. The saved deck must be owned, active for
battle, and valid when the server snapshots it. Later catalogue or saved-deck
changes do not rewrite the match.

A player may have only 1 active CPU match. Creation has no idempotency key. If
its response is uncertain, use `GET /matches/cpu` to recover the committed match
before trying to create another. No active match returns
`404 CPU_MATCH_NOT_FOUND`; an immediate not-found cannot rule out a creation
request that is still in flight.

Use `/matches/cpu/entry` for a dashboard check that needs only `matchId`, status,
start time, phase, turn number, and current side. Use `/matches/cpu` or the
identified match route before presenting battle choices.

For a compact landing-page read, use `/matches/cpu/entry?view=summary`. It returns
nullable `activeMatch` and `selectedDeck`, plus `requestId`. An active match makes
`selectedDeck` null; otherwise the selected deck contains only `deckId` and
`name`. Empty state returns `200` with both values null. This read does not
validate the deck, create a match, or advance gameplay.

Use `/matches/history?view=summary&limit=5` for completed headers with
`roundCount`, without full rounds, actions, or battle state. `limit` defaults to
5 and accepts integers from 1 to 20 when `view=summary` is supplied. Results sort
by completion time descending, then match ID descending. Omitting `view` retains
the existing full-history response; open a match for its detailed log.

## Match state and actions

A full match response includes `matchId`, `status`, `version`, outcome and
lifecycle timestamps, `state` with `legalActions`, `lastAction`, and `battleLog`.
The player sees their snapshotted cards. The CPU projection reveals its active
and defeated Creatures and remaining counts without exposing its unrevealed
reserve.

Submit an action with the current version and a caller-generated command ID:

```json
{
  "submissionId": "00000000-0000-0000-0000-000000000010",
  "expectedVersion": 3,
  "action": {
    "type": "use_move",
    "moveId": "00000000-0000-0000-0000-000000000020"
  }
}
```

Supported action types are `select_initial_creature`, `select_replacement`,
`swap_creature`, `use_move`, and `use_power_card`. Use the corresponding
`creatureId`, `moveId`, or `powerCardId` from `legalActions`. The server rechecks
the match version and legality; a returned action is not a reservation.

After applying the player's intent, the server performs any required CPU actions
and returns the resulting committed state. A normal player turn has a 90-second
deadline. If an action arrives at or after that deadline, the server records the
authoritative timeout instead of the submitted move. Initial selection and
mandatory replacement have no turn deadline.

## Retries and forfeiting

Use a new `submissionId` for each intended battle action. Retry an uncertain
action with the same identifier, version, and action body. An identical replay
returns its saved response without advancing the match again. A replay can be
older than the latest match state, so fetch the match before choosing another
action.

Reusing a submission ID with a different version or intent returns
`409 CPU_MATCH_IDEMPOTENCY_CONFLICT`. Ordinary stale versions return
`409 CPU_MATCH_STALE_ACTION`; reload rather than automatically changing and
resubmitting the choice.

Forfeit with `{ "expectedVersion": 3 }`. Forfeit has no submission ID. If its
response is uncertain, read the match: a completed CPU win confirms the result;
an active match supplies the version to review before another request. Forfeit
records progression once and cannot reopen the match.

## Errors and recovery

| Response                             | Caller action                                                         |
| ------------------------------------ | --------------------------------------------------------------------- |
| `400 INVALID_MATCH_DECK`             | Repair or select a valid saved deck before creating a match.          |
| `400 ILLEGAL_CPU_MATCH_ACTION`       | Reload and choose from the current legal actions.                     |
| `404 CPU_MATCH_NOT_FOUND`            | Treat the match as unavailable; this also protects ownership privacy. |
| `409 CPU_MATCH_ALREADY_ACTIVE`       | Recover the existing match instead of creating another.               |
| `409 CPU_MATCH_COMPLETED`            | Fetch and display the saved final result.                             |
| `409 CPU_MATCH_STALE_ACTION`         | Reload the match and review its current version and choices.          |
| `409 CPU_MATCH_IDEMPOTENCY_CONFLICT` | Keep the used command ID attached to its original version and intent. |

`GET /matches/history` returns the completed CPU archive. Completed results and
logs remain based on their saved snapshots; they are not recalculated from later
deck, catalogue, or rules changes. See
[CPU battle storage](../database/cpu-match-persistence-design.md) for transaction
and retention details.

## AI declaration

Prepared with assistance from Codex[GPT-6], using CPU match routes, response
capabilities, action receipts, and recovery behaviour.
