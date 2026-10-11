---
title: Live PvP API
description: Connect to a live battle, send versioned actions, and recover participant or spectator state.
---

# Live PvP API

Live battles use authenticated HTTP reads for recovery and a WebSocket
connection for actions and updates. The server owns match state and deadlines;
a connected client displays the returned view and submits intent.

[Ranked matchmaking](ranked-matchmaking-api-contract.md) supplies a match ID
after both players accept a pairing. This page covers the battle connection.
See [Player battles](../requirements/player-asynchronous-pvp-journey.md#live-ranked-battles)
for the journey and [Battle rules](../requirements/battle-rules.md) for combat,
turn order, and timeout behaviour.

## HTTP access

Both routes require bearer authentication and an active player account.

| Method | Route                                              | Result                                                         |
| ------ | -------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/v1/matches/live/:matchId`                    | `200` with the caller's current participant or spectator view. |
| POST   | `/api/v1/matches/live/:matchId/connection-tickets` | `201` with a single-use connection ticket.                     |

GET uses the general quota; ticket creation has its own
[request quota](rate-limiting.md). See the [API reference](../api-reference.md)
for shared authentication and HTTP errors.

Use the current HTTP capability to include voluntary Creature swaps:

```http
Accept: application/vnd.wits-world.live.v2+json, application/json;q=0.9
```

Without it, projections omit swap legal actions and redact swap details from
history. The WebSocket capability is negotiated separately below.

## Open a connection

Request a ticket with `{ "role": "participant" }` or
`{ "role": "spectator" }`. The server verifies the requested role against the
caller's access. The response contains `ticket`, `role`, `protocolVersion: 1`,
`expiresAt`, `webSocketUrl`, and `requestId`.

Tickets expire after 60 seconds and can be used once. Open the returned URL with
the ticket as its `ticket` query parameter. Add `battleSwaps=1` to receive the
current swap-capable projection:

```text
wss://<api-host>/api/v1/realtime/live?ticket=<ticket>&battleSwaps=1
```

Send the bearer token only to the HTTP endpoint. Keep tickets out of logs and
obtain a fresh ticket for every reconnect; an expired or already redeemed
ticket cannot open another connection.

After redemption, `connection.ready` supplies the role and complete current
`match`. A new participant connection supersedes that player's previous
connection to the same match. The old connection receives
`LIVE_CONNECTION_SUPERSEDED` and closes with code `4409`; it cannot continue
submitting actions.

## Participant and spectator views

HTTP and state-bearing socket messages use the same role-specific match shape.
Both include match identity, `mode: "live"`, `role`, `status`, `version`,
`phase`, `turnNumber`, `turnDeadline`, `consecutiveTimeouts`, public history,
and lifecycle timestamps. HTTP adds
`requestId` and `serverTime`; socket messages include their own `serverTime`.

| View        | Additional fields and visibility                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Participant | `selfSide`, `self`, `opponent`, `legalActions`, `lastAction`, `outcome`, and `completionReason`. Your cards are visible; unrevealed opponent cards are hidden. `currentActor` uses `self` or `opponent`. |
| Spectator   | `playerOne`, `playerTwo`, public effects, `winner`, and `presence`. Only revealed cards and remaining counts are visible. `currentActor` uses `playerOne` or `playerTwo`. No legal actions are exposed.  |

`selfSide` maps the participant to the stable `playerOne` or `playerTwo` history
side. During initial selection, the opponent's selected Creature stays hidden
until both opening selections resolve.

Spectator presence includes participant connection booleans and an aggregate
spectator count. It does not identify spectators or expose private account,
deck, or location data. Participants can fetch their completed match; new
spectator reads and tickets are limited to active matches. Missing or
unavailable matches return `404 LIVE_MATCH_NOT_FOUND`.

## Client messages

Send a UTF-8 JSON text object with `protocolVersion: 1`, `matchId`, a UUID
`messageId`, and a non-negative integer `expectedVersion`. Extra fields,
binary messages, unknown types, and messages over 16,384 bytes are rejected.

An action uses `type: "action.submit"`:

```json
{
  "protocolVersion": 1,
  "type": "action.submit",
  "matchId": "11111111-1111-4111-8111-111111111111",
  "messageId": "22222222-2222-4222-8222-222222222222",
  "expectedVersion": 7,
  "action": {
    "type": "use_move",
    "moveId": "33333333-3333-4333-8333-333333333333"
  }
}
```

The supported action types and identifier fields are:

| Action type               | Identifier field |
| ------------------------- | ---------------- |
| `select_initial_creature` | `creatureId`     |
| `select_replacement`      | `creatureId`     |
| `swap_creature`           | `creatureId`     |
| `use_move`                | `moveId`         |
| `use_power_card`          | `powerCardId`    |

Use the latest `legalActions` and their returned IDs. The server revalidates
each action against the current match version and deadline. Clients do not
submit damage, effects, random outcomes, or timeout actions.

Resignation uses `type: "resign.submit"` with the same envelope fields and no
`action`. It is available to an active participant regardless of whose turn it
is. Spectators cannot submit either message type.

## Server messages

Every message identifies `protocolVersion: 1`. State-bearing messages contain
the committed version and `serverTime`.

| Type                  | Purpose and key fields                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `connection.ready`    | Confirms connection with `connectionId`, `role`, `version`, and complete `match`.          |
| `match.snapshot`      | Replaces local state with `eventId`, `version`, and complete `match`.                      |
| `match.transition`    | Publishes `eventId`, `previousVersion`, `version`, and complete `match`.                   |
| `action.acknowledged` | Confirms a committed or replayed command using `messageId`, `eventId`, and `version`.      |
| `presence.changed`    | Reports participant connection booleans and spectator count; it does not advance gameplay. |
| `error`               | Reports `code`, safe `detail`, `retryable`, and an optional `messageId`.                   |

Acknowledge and transition delivery can occur separately. Use `messageId` to
resolve pending commands, `eventId` to recognise repeated events, and `version`
to order gameplay. Replace state from complete projections rather than
reconstructing combat from messages. Ignore older versions; a version gap or
ambiguous outcome can be repaired with an HTTP GET.

## Deadlines and reconnect

Each required decision has a 60-second deadline. Use `serverTime` and
`turnDeadline` for the displayed countdown. The server checks database time
when the action obtains authority; arrival at the gateway before the deadline
does not guarantee acceptance. At the deadline, the action is late.

A missed decision advances the server's timeout handling. After 3 consecutive
missed decisions, the participant loses by `abandonment_forfeit`. Reconnecting,
reading state, and transport ping/pong do not pause or reset deadlines. The
[decision rules](../requirements/battle-rules.md#decision-deadlines) explain
automatic selection, replacement, and normal-turn timeouts.

Reconnect with a fresh ticket and replace local state from `connection.ready`.
Do not automatically replay an old action. For an intentionally retried command,
reuse the same `messageId` and identical payload. An identical retry acknowledges
the committed action without another transition; changed intent returns
`LIVE_IDEMPOTENCY_CONFLICT`.

Existing sockets receive the final committed view and close normally with code
`1000`. Participants can then recover the result through HTTP.

## Worker coordination safety

In Upstash scheduler mode, each API instance reads one combined live/ranked
activity snapshot with Redis `HMGET` every 10 seconds. This remains below the
30-second activity lease and 20-second proposal window; PostgreSQL match state,
deadlines, locks, and versions remain authoritative.

SDK automatic deserialization is disabled, so the reader maps the five ordered
`HMGET` values explicitly. A completely missing state initializes through EVAL
with both workers active. Partial or malformed state fails safely and retains
fast scans instead of declaring the workers idle.

Coordination diagnostics expose only a fixed `activity_error_category`
(`transport`, `timeout`, `invalid_response`, or `unknown`), the
`coordination_stage`, and, for idle failures, the fixed worker category. Raw
provider errors, state values, keys, credentials, and URLs are never logged.

## Errors and recovery

| Code                                                | Caller action                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `LIVE_VERSION_CONFLICT`                             | Reconcile the supplied snapshot or fetch current state before deciding again.                    |
| `LIVE_ACTION_LATE`                                  | Show the current snapshot and resolved timeout; do not resubmit the late intent as a new action. |
| `LIVE_ACTION_ILLEGAL`                               | Use current legal actions after refreshing state.                                                |
| `LIVE_MATCH_COMPLETED`                              | Retrieve the final participant result.                                                           |
| `LIVE_CONNECTION_SUPERSEDED`                        | Stop using the old socket; continue with the newer connection.                                   |
| `LIVE_TICKET_EXPIRED` or `LIVE_TICKET_ALREADY_USED` | Obtain a fresh ticket before connecting.                                                         |
| `LIVE_ACTION_FORBIDDEN`                             | Check the connection role and match; spectators have read access only.                           |

Socket errors use the message format above, while HTTP errors use the shared
API format. `retryable` does not authorise replaying changed intent. For a lost
acknowledgement, reconcile current state before intentionally retrying the
original command. Ranked rating and territory results are read through the
[ranked settlement endpoint](ranked-matchmaking-api-contract.md#rating-and-season-reads).

## AI declaration

Rewritten with assistance from Codex[GPT-6], using live routes, message handling,
and role-specific projections. Earlier versions also used Codex[GPT-5] and
Codex-CLI[GPT-5].
