---
title: 'Live player battle API'
---

# Live player battle API

## Status and purpose

This document began as the issue `#252` contract for one-minute live
player-versus-player matches. Migration `0044_create_live_pvp_persistence.sql`
implements the issue `#251` persistence boundary, and issue `#253` implements
the backend HTTP ticket routes, WebSocket gateway, deadline worker, reconnect
handling, and PostgreSQL multi-instance fan-out described here. Frontend
presentation and deployed multi-instance verification remain later work.

Live PvP reuses the shared battle rules, card snapshots, legal action shapes,
and hidden-card rules used by CPU and asynchronous PvP. Its distinct concerns
are simultaneous presence, short server-owned decision windows, reconnecting
to persisted state, and privacy-safe spectators. PostgreSQL and the API remain
authoritative; a browser or open socket is never a source of battle truth.

## Confirmed rules and boundaries

The first live implementation uses these fixed rules:

- every initial-selection, normal-turn, and replacement decision has a
  60-second deadline recorded from the server clock;
- disconnecting does not pause or extend a deadline;
- a missed initial or replacement decision selects uniformly from the legal
  Creature choices using server-side randomness;
- a missed normal turn applies the shared rules package's no-action `timeout`
  transition;
- each missed required decision increments that participant's consecutive
  timeout count, a timely legal action resets it to zero, and the third
  consecutive miss loses by `abandonment_forfeit`;
- initial Creature choices remain hidden until both are resolved, after which
  the server reveals them simultaneously and randomly chooses the first side;
- an active authenticated player with the opaque match identifier may watch an
  active match through a spectator-safe projection;
- one participant connection controls each side at a time, with a newer
  authenticated connection superseding the older connection;
- spectators cannot act, resign, or access participant-private state; and
- a completed match sends its final state before spectator access ends.

The contract deliberately excludes match creation, opponent discovery,
matchmaking, ratings, seasons, public match listings, spectator chat, and
spectator replay. Those features may create a live match or distribute its
opaque identifier later, but they must use this match authority boundary.

## Roles and lifecycle

Each connection has exactly one server-derived role:

| Role          | Eligibility                                       | Capabilities                                      |
| ------------- | ------------------------------------------------- | ------------------------------------------------- |
| `participant` | One of the two persisted match participants       | Read own projection and submit legal own intents  |
| `spectator`   | Any other authenticated active application player | Read the spectator projection; no match mutations |

The browser may request a role when obtaining a ticket, but the API derives
and validates the effective role from the authenticated local player and
persisted match. A participant cannot request a spectator projection of their
own match to bypass participant connection or state rules.

A live match has one of these lifecycle states:

```text
active -> completed by defeat
       -> completed by abandonment_forfeit
       -> completed by voluntary_resignation
       -> completed by account_deletion_forfeit
```

`active` includes the shared `initial_selection`, `active`, and `replacement`
battle phases. Completion is terminal and immutable. The participant who
resigns or reaches three consecutive timeouts is the loser; the browser cannot
nominate the winner, loser, reason, or final state.

Presence is advisory metadata, not match state. A player being marked
disconnected does not complete, cancel, pause, or mutate the battle. If both
players remain absent, normal persisted deadlines continue in turn order; the
first participant to reach three consecutive required-decision misses loses.

## HTTP connection and recovery contract

The Fastify implementation exposes the following bearer-protected
operations beneath the existing `/api/v1` boundary:

| Method | Path                                        | Success | Purpose                                         |
| ------ | ------------------------------------------- | ------- | ----------------------------------------------- |
| `GET`  | `/matches/live/:matchId`                    | `200`   | Read the latest role-appropriate snapshot       |
| `POST` | `/matches/live/:matchId/connection-tickets` | `201`   | Mint one short-lived realtime connection ticket |

These route and component names are OpenAPI-ready contract definitions. The
runtime OpenAPI document must not advertise them until their Fastify routes,
validation, authorization, and responses are implemented together.

### Match snapshot

`GET /matches/live/:matchId` derives the caller from the validated bearer
token. A participant receives `LiveParticipantMatch`; another active player
receives `LiveSpectatorMatch`. A missing match and an unauthorized or
unavailable match use the same safe `LIVE_MATCH_NOT_FOUND` response where
necessary to avoid disclosing private match existence.

Participants may read their final completed projection. Non-participant
spectator reads and new spectator tickets are available only while the match is
active; after completion they receive `LIVE_MATCH_NOT_FOUND`. Existing
spectator sockets receive the committed final projection and then close.

The response is the recovery authority after refresh, reconnect, an observed
version gap, or an ambiguous realtime response. Local storage, an old socket
message, countdown state, and client-simulated actions are never authoritative.
A projection is internally version-consistent: public action/history reads are
bounded to the already-loaded authoritative match version so a concurrent
transition cannot be mixed into an older state snapshot.

### Connection-ticket request

The closed request body is:

```json
{
  "role": "participant"
}
```

`role` is exactly `participant` or `spectator`. The API validates active-account
status, match availability, participant membership, and the requested role
before returning:

```json
{
  "ticket": "opaque-single-use-value",
  "role": "participant",
  "protocolVersion": 1,
  "expiresAt": "2026-09-17T10:01:00.000Z",
  "webSocketUrl": "wss://api.example/api/v1/realtime/live",
  "requestId": "server-generated-request-id"
}
```

The ticket is opaque, cryptographically random, bound to one match, local
player, role, and protocol version, and expires 60 seconds after creation. Ticket
minting locks the local player row and then the authoritative match row before
sampling PostgreSQL `clock_timestamp()`; `created_at` and the 60-second expiry
are derived from that post-lock time, so waiting for lifecycle serialization
does not consume the ticket TTL. Only a hash of the ticket is persisted.
Redemption is atomic and single-use. A failed, expired, replayed, wrong-match,
or wrong-role redemption cannot open a connection.

The Auth0 bearer token is sent only to the HTTPS ticket endpoint. It is never
placed in a WebSocket URL, query string, close reason, application message, or
log. The browser opens the WebSocket using the returned URL and supplies the
short-lived ticket as the `ticket` query parameter. API and proxy logging must
redact that parameter.

## Realtime transport

The Fastify realtime gateway upgrades:

```text
GET /api/v1/realtime/live?ticket=<short-lived-ticket>
```

The gateway redeems the ticket before accepting application messages.
Redemption serializes against account deletion and match completion by locking
the local player row and then the authoritative match row before locking the
ticket. Participant redemption additionally locks that participant's live-match
row. PostgreSQL `clock_timestamp()` is sampled only after those locks are
acquired, so a ticket that expires while waiting is rejected rather than
redeemed with an earlier arrival time.

A participant redemption increments its persisted connection generation and
binds the accepted socket to the resulting immutable
`(playerId, matchId, connectionGeneration)` server context. The generation is
never taken from an application message. A newer generation for the same match
and player supersedes the previous one; the prior socket closes with code
`4409`. Opening or closing a socket does not change the battle version, state,
or deadline.

Closing the prior socket is best-effort fan-out rather than the authorization
boundary. Every participant action and resignation must lock the authoritative
match and compare its socket-bound generation with the participant's persisted
current generation before loading an idempotency receipt or applying game
logic. A mismatch returns `LIVE_CONNECTION_SUPERSEDED`, closes that socket with
`4409`, and performs no match mutation. This remains effective when the older
and newer sockets are connected to different gateway instances.

Transport-level WebSocket ping/pong detects dead connections. It is not a game
action and cannot refresh a turn deadline. Implementations should send a ping
at least every 20 seconds and treat a connection as unavailable after two
unanswered intervals, while retaining persisted match authority.

Persisted connection-access rows are revalidated before participant or
spectator fan-out. Account deletion removes the deleting player's transient
access rows in the same transaction and emits an advisory presence wake-up for
any affected matches; because PostgreSQL notifications are delivered only after
commit, every gateway instance then revalidates and closes revoked sockets. A
`match_completed` access closure is the sole exception: it may be used once to
load and deliver the committed final projection before the socket closes.

Every text message is one UTF-8 JSON object with:

- `protocolVersion: 1`;
- one closed `type` discriminator;
- `matchId` as a UUID; and
- the fields defined for that message type, with no additional properties.

Binary messages, malformed JSON, unsupported protocol versions, oversized
messages, and unknown message types are rejected without invoking game logic.
The implementation must set and document a bounded message-size limit before
deployment.

### Client messages

#### `action.submit`

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

`action` is exactly one shared battle intent:

```text
{ type: "select_initial_creature", creatureId: UUID }
{ type: "select_replacement", creatureId: UUID }
{ type: "use_move", moveId: UUID }
{ type: "use_power_card", powerCardId: UUID }
```

The client cannot submit `timeout`, damage, effects, randomness, card values,
deadlines, timeout counts, presence, winner, completion, progression, or
spectator fields. Returned legal actions are advisory; the server revalidates
the intent under the locked current version.

#### `resign.submit`

```json
{
  "protocolVersion": 1,
  "type": "resign.submit",
  "matchId": "11111111-1111-4111-8111-111111111111",
  "messageId": "44444444-4444-4444-8444-444444444444",
  "expectedVersion": 7
}
```

Only a participant in an active match may resign. The server derives the loser
from the authenticated ticket principal. Spectator use is rejected with
`LIVE_ACTION_FORBIDDEN`.

### Server messages

All state-bearing server messages include `serverTime` and the committed match
`version`. Messages never instruct the browser to calculate a transition.

| Type                  | Required payload                                                                   | Purpose                                                             |
| --------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `connection.ready`    | `connectionId`, role, `serverTime`, complete role-appropriate `match`              | Confirms ticket redemption and synchronizes current persisted state |
| `match.snapshot`      | `eventId`, `serverTime`, complete role-appropriate `match`                         | Repairs a version gap or explicitly resynchronizes                  |
| `match.transition`    | `eventId`, previous and new version, `serverTime`, complete projected `match`      | Publishes one committed authoritative transition                    |
| `action.acknowledged` | client `messageId`, `eventId`, committed version, `serverTime`                     | Confirms that an idempotent intent committed or replayed            |
| `presence.changed`    | `eventId`, version, `serverTime`, participant connection booleans, spectator count | Publishes advisory presence without identities                      |
| `error`               | optional client `messageId`, code, safe detail, retryable, `serverTime`            | Reports a safe protocol or domain failure                           |

`connection.ready`, `match.snapshot`, and `match.transition` use the same
projection schemas as the HTTP match read. Sending complete projections keeps
the first implementation deterministic and lets a client replace rather than
merge security-sensitive state. A future delta protocol requires a new
protocol version.

`eventId` is a unique server-generated UUID for observability and client
deduplication. It is not an idempotency key and does not replace the committed
match version.

## Match projections and hidden information

The participant projection follows the existing asynchronous-PvP
viewer-relative shape, with live-specific fields added:

| Field                 | Type                                       | Rule                                   |
| --------------------- | ------------------------------------------ | -------------------------------------- |
| `matchId`             | UUID                                       | Opaque identifier                      |
| `mode`                | `"live"`                                   | Never aliases asynchronous PvP         |
| `status`              | `"active" \| "completed"`                  | Authoritative lifecycle                |
| `version`             | non-negative integer                       | Optimistic concurrency version         |
| `phase`               | shared battle phase                        | Authoritative rules phase              |
| `currentActor`        | `"self" \| "opponent" \| null`             | Viewer-relative                        |
| `turnDeadline`        | RFC 3339 timestamp or null                 | Null only when no decision is pending  |
| `consecutiveTimeouts` | `{ self, opponent }` non-negative integers | Server-derived strike counts           |
| `self`                | full own participant view                  | Includes own unrevealed cards          |
| `opponent`            | hidden-card opponent view                  | Revealed cards plus aggregate counts   |
| `legalActions`        | shared action array                        | Non-empty only when self may act       |
| `lastAction`          | public action result or null               | Contains only legally revealed effects |
| `outcome`             | `"win" \| "loss" \| null`                  | Non-null only after completion         |
| `completionReason`    | terminal reason or null                    | Server-derived                         |
| timestamps            | RFC 3339 timestamps                        | Server clock                           |

During initial selection, the projection exposes whether each side has
submitted but never the selected Creature until both selections resolve. The
server then publishes one transition revealing both active Creatures and the
randomly selected first actor.

The spectator projection uses stable `playerOne` and `playerTwo` sides rather
than `self` and `opponent`. It includes:

- safe Player Names;
- current phase, turn number, current actor, deadline, and timeout counts;
- each active and defeated Creature with current public state;
- legally played Power cards and public resolved effects;
- counts of unrevealed Creature and Power cards;
- public action history, completion reason, and final result; and
- participant connected/disconnected booleans plus an aggregate spectator
  count.

It excludes unrevealed card identifiers, array positions, placeholders,
participant legal actions, private deck snapshots and unrevealed card state,
internal player UUIDs, Auth0 claims, email, location, connection identifiers,
tickets, IP addresses, submission receipts, and individual spectator identity.
Active public buffs, debuffs, and status effects remain visible so spectators
can understand the battle. Spectators cannot use `action.submit` or
`resign.submit`, even if an identifier becomes guessable.

## Deadlines, timeout strikes, and reconnect

Every required decision stores:

```text
turnDeadline = decisionStartedAt + 60 seconds
```

The sole acceptance timestamp is `decisionNow`, sampled from PostgreSQL with
`clock_timestamp()` immediately after the mutation acquires the authoritative
match row lock. At the exact boundary, `decisionNow >= turnDeadline` is late.
The gateway's receipt time, socket timestamp, application-process clock, and
time spent waiting for the lock have no authority. An action that reaches the
gateway before the deadline but acquires the lock at or after it is therefore
late. The service persists the overdue automatic transition before rejecting
that intent with `LIVE_ACTION_LATE`, then sends the latest role-appropriate
snapshot so the caller can reconcile.

The deadline worker uses the same match lock and post-lock database-clock rule.
If an action locks first and samples `decisionNow < turnDeadline`, it commits
and the worker observes the new version and deadline. If the worker locks first
at or after the deadline, it commits the timeout and the waiting action observes
the advanced state and is rejected as late. If either path locks before the
deadline, it cannot manufacture an early timeout. This serialization rule, not
network arrival order, produces one deterministic transition. The worker
provides at-least-once convergence for matches receiving no traffic, while
persisted deadlines and row locks remain authoritative.

When a process resumes after more than one persisted decision window has
elapsed, catch-up does not reset the clock to process-recovery time. Each
automatic transition derives the next decision window from the prior persisted
deadline, so already-elapsed decisions remain due and are processed in order
until the match reaches a future deadline or a terminal result. The runtime
caps one catch-up pass defensively, but the three-strike abandonment rule makes
the documented live match converge within that bound.

For a missed decision:

1. increment the required participant's consecutive timeout count;
2. if the count is now three, complete the match with that participant losing
   by `abandonment_forfeit` and do not apply an automatic action;
3. otherwise, choose a legal Creature uniformly for initial selection or
   replacement, or apply `{ "type": "timeout" }` for a normal turn;
4. persist the automatic transition, server randomness, next required actor,
   and next deadline atomically; and
5. publish only after commit.

A legal action accepted before its deadline resets that actor's consecutive
timeout count to zero. Acting, reconnecting, reading, receiving ping/pong, or
opening another socket does not alter the other participant's count. A
replacement auto-selection still preserves the shared rule that replacement
does not consume the following normal turn.

Account-deletion finalization uses the same rule. While holding the match lock
it catches up every decision that is already due at the sampled database time;
only an active match whose next deadline is still in the future is then ended
with `account_deletion_forfeit` for the deleting participant.

Reconnect requires a fresh HTTPS ticket. After redemption, the gateway loads
the latest committed match and first processes an elapsed deadline under the
same authority used by normal actions. It then sends `connection.ready` with a
complete current projection. The client discards older local versions and must
not replay an old action automatically. It may intentionally retry an
ambiguous action only with the same `messageId` and identical payload.

## Idempotency, ordering, and concurrency

Every participant mutation is keyed by the authenticated player, match,
operation, and UUID `messageId`. An identical replay returns the committed
acknowledgement and current projection without another transition. Reusing the
ID with a different canonical payload returns `LIVE_IDEMPOTENCY_CONFLICT`.
For a newly committed intent, the caller receives `action.acknowledged` and all
authorized sockets receive `match.transition`. An identical replay receives
the same acknowledgement followed by a caller-only `match.snapshot`, because a
later action may already have advanced the match beyond the original version.

Every mutation also supplies `expectedVersion`. Under a participant-scoped
match lock, the service must:

1. compare the socket-bound participant connection generation with the
   persisted current generation, rejecting and closing a superseded socket;
2. load a committed receipt after acquiring the lock;
3. return an identical replay or reject a payload conflict;
4. sample `decisionNow` from the database and process an elapsed deadline
   before client intent;
5. compare the expected and persisted versions;
6. validate role, current actor, phase, ownership, and legal action;
7. apply shared battle rules and server randomness;
8. persist state, deadline, timeout counts, history, terminal result,
   progression source, and receipt in one transaction; and
9. publish only after commit.

Participant ticket redemption and participant mutation both serialize through
the same participant match row. If an old socket's mutation acquires the lock
first, it may commit before the later redemption supersedes it. If redemption
increments the generation first, every subsequent mutation from the old socket
is rejected. An old socket can never mutate after the newer generation has
committed, even when close notification is delayed or lost.

Two intents against one version cannot both advance the match. Realtime
delivery may be duplicated, delayed, or reordered; the browser orders state by
committed version and requests a snapshot when it observes a gap. A notification
is never evidence that a transition committed unless the persisted version can
be read.

## Error contract

HTTP failures use the existing problem-style JSON envelope. Realtime failures
use the closed `error` message and may close the socket when continuing would
be unsafe.

| HTTP/status or close | Code                           | Meaning                                                     |
| -------------------- | ------------------------------ | ----------------------------------------------------------- |
| `401` / `4401`       | `LIVE_AUTHENTICATION_REQUIRED` | Bearer authentication or ticket redemption failed           |
| `403` / `4403`       | `LIVE_ACTION_FORBIDDEN`        | Role cannot perform the requested operation                 |
| `404`                | `LIVE_MATCH_NOT_FOUND`         | Match is unavailable or cannot safely be disclosed          |
| `409`                | `LIVE_MATCH_COMPLETED`         | New intent targets a terminal match                         |
| `409`                | `LIVE_VERSION_CONFLICT`        | Expected version is stale                                   |
| `409`                | `LIVE_ACTION_ILLEGAL`          | Intent is not legal in the current state                    |
| `409`                | `LIVE_ACTION_LATE`             | Post-lock database time reached the persisted deadline      |
| `409`                | `LIVE_IDEMPOTENCY_CONFLICT`    | Message ID was reused with another payload                  |
| `410` / `4401`       | `LIVE_TICKET_EXPIRED`          | Ticket expired before redemption                            |
| `409` / `4401`       | `LIVE_TICKET_ALREADY_USED`     | Ticket has already been redeemed                            |
| close `4409`         | `LIVE_CONNECTION_SUPERSEDED`   | A newer participant connection became authoritative         |
| `429`                | `RATE_LIMITED`                 | Existing authenticated rate protection rejected the request |

Errors contain no stack trace, SQL detail, hidden cards, token, ticket, player
UUID, or opponent-private state. Expected conflicts keep the socket open unless
the connection itself is no longer authorized. Authentication, protocol
version, oversized-message, and superseded-connection failures close it.

## Persistence and fan-out requirements

Migration `0044_create_live_pvp_persistence.sql` represents the issue `#251`
persistence requirements:

- participants, immutable battle-ready deck snapshots, and current full state;
- match version, phase, current actor, deadline, and timeout counts;
- one-use hashed connection tickets with role, expiry, and redemption time;
- current participant connection generation for supersession;
- idempotency receipts and immutable public action history;
- terminal result and completion reason; and
- exactly-once progression sources and account-deletion behavior.

PostgreSQL remains the source of truth across API restarts and multiple gateway
instances. The persistence layer stores the match state, transition history,
participant connection generation, ticket digests, and idempotency receipts;
it does not itself start a gateway or deadline worker. PostgreSQL
`LISTEN/NOTIFY` may wake gateways after a commit, but it is not a durable queue.
Both live channels carry only an opaque match identifier and committed version:
`live_pvp_match_changed` denotes a committed gameplay transition, while
`live_pvp_presence_changed` denotes connection-generation or advisory presence
change. The receiving gateway reloads persisted state before delivery. Missed notifications
converge through reconnect, explicit snapshot reads, and version-gap recovery.
Correctness must not depend on Azure session affinity. See
[live PvP persistence](../database/live-pvp-persistence.md) for the implemented
storage and retention boundary.

Ticket redemption and persisted connection closure also emit a current-version
wake-up. Those notifications do not claim that a gameplay transition occurred;
they cause other gateway instances to reload persisted generation/presence
state. A receiving instance may therefore emit a complete snapshot rather than
a new transition, and an older participant socket is closed when its persisted
generation no longer matches.

### Implemented runtime settings

Issue `#253` uses protocol version `1`, a 16 KiB WebSocket message limit, and a
20-second transport ping interval. `LIVE_PVP_WEBSOCKET_URL` controls the public
`ws://`/`wss://` endpoint returned by ticket minting;
`LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS` controls the database-backed deadline
worker and defaults to one second; and
`LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS` schedules the idempotent 24-hour
transient-data purge without changing the retention policy itself. The gateway
redacts the `ticket` query value from application logs and production edge logs
must apply the same rule.

Each API instance maintains only local socket references. PostgreSQL state,
participant connection generations, receipts, and versions remain authority.
A dedicated PostgreSQL listener receives `live_pvp_match_changed` and
`live_pvp_presence_changed` notifications. Gameplay notifications reload the
role-specific persisted projection before delivery; presence notifications
reload persisted connection generations and advisory presence without replaying
an already-delivered gameplay transition. If a gameplay notification names an
older version than the current persisted state, the gateway sends a complete
snapshot instead of fabricating an intermediate transition.

## Deployment and operational constraints

Before the realtime gateway is released:

- Azure App Service WebSocket support and HTTP upgrade forwarding must be
  enabled and verified for the API application;
- proxy and platform idle timeouts must exceed the documented ping interval;
- `ticket` query values, bearer tokens, full socket payloads, and hidden match
  state must be redacted from application and edge logs;
- shutdown must stop accepting tickets, close sockets with a retryable service
  code, and leave all committed match state recoverable;
- reconnect and deadline behavior must be tested across an API restart;
- fan-out must work with session affinity disabled and at least two gateway
  instances in a controlled verification environment; and
- metrics should cover active participant/spectator connections, ticket
  failures, reconnects, version-gap repairs, action latency, deadline actions,
  and terminal reasons without player-identifying labels.

## Verification matrix

Later implementation issues must cover at least:

### Authentication and authorization

- valid, expired, reused, wrong-player, wrong-match, and wrong-role tickets;
- participant versus spectator projections and mutation permissions;
- account deletion or suspension after ticket creation but before redemption;
- account deletion after spectator redemption, including cross-instance
  revocation of the already-open socket;
- bearer tokens and tickets absent from URLs or logs beyond the explicitly
  redacted short-lived ticket query; and
- participants prevented from downgrading themselves to spectator projection.

### Match authority and privacy

- hidden initial choices before simultaneous reveal;
- hidden unused cards in participant and spectator projections;
- rejection of client timeout, result, damage, deadline, presence, and winner
  fields;
- legal initial selection, replacement, move, Power card, and resignation;
- spectator receipt of public transitions with no legal actions; and
- final spectator projection followed by access termination.

### Timing, reconnect, and concurrency

- actions locking immediately before, exactly at, and after the deadline,
  including an earlier gateway arrival that waits past the boundary;
- random automatic initial and replacement choices;
- no-action normal-turn timeout and reset after a timely action;
- third consecutive miss producing one abandonment result;
- reconnect before and after a deadline without extending it;
- an old socket on another gateway attempting an action after a newer ticket
  redemption committed its connection generation;
- duplicate and conflicting message IDs;
- two actions racing on one version;
- deadline worker racing a participant action;
- gateway restart and missed-notification recovery; and
- two gateway instances publishing one committed transition.

## Delivery gates

Before issue `#253` is merged:

- the API/security reviewer must approve ticket handling, participant and
  spectator authorization, hidden-state projections, idempotency, and safe
  errors;
- the game-rule reviewer must approve all timeout, automatic-selection,
  strike-reset, abandonment, and initial-reveal rules;
- HTTP shapes must be checked against existing Fastify/OpenAPI conventions;
- realtime examples must be checked as closed versioned schemas;
- formatting and the documentation build must pass; and
- the pull request must link issue `#253` and record any deferred decision as
  follow-up work rather than silently implementing it.

## AI declaration

This contract was planned, generated, edited, and reviewed with the assistance
of Codex[GPT-5.6 Sol] and ChatGPT-Web[GPT-5.6 Sol].
