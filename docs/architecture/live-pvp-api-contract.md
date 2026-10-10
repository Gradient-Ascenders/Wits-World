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
presentation is available through the protected live-match routes described
below. Deployed multi-instance verification remains later work.

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

The live battle contract deliberately excludes opponent discovery, ratings,
seasons, public match listings, spectator chat, and spectator replay. Match
creation is owned by the existing server-side ranked queue and proposal
acceptance flow in the
[ranked competition policy](../requirements/ranked-competition-policy.md); the
browser cannot create an arbitrary live match. Spectators enter only through a
privately shared live-match URL or opaque match identifier. There is no public
match browser. These entry paths do not change this contract's battle authority.

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
participant and spectator sockets receive the committed final projection and
then close.

The response is the recovery authority after refresh, reconnect, an observed
version gap, or an ambiguous realtime response. Local storage, an old socket
message, countdown state, and client-simulated actions are never authoritative.
A successful response includes `serverTime`; the participant projection also
includes the viewer's authoritative `selfSide` and the complete persisted,
participant-safe public `history` through the advertised match version. The
browser anchors its display countdown to `serverTime` and `decisionDeadline`,
but never submits or resolves a timeout. Spectator projections continue to
exclude participant-only fields, legal actions, hands, private snapshots, and
private participant data.
A projection is internally version-consistent: projection-critical match,
battle-state, participant, access, history, and presence reads run inside one
read-only `REPEATABLE READ` database snapshot. Public action/history reads are
also bounded to the advertised authoritative match version, so a concurrent
transition cannot mix version-N match state with version-N+1 participant or
history data.

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

After redemption commits, any subsequent setup failure closes the persisted
connection-access row before the socket is rejected, so failed catch-up or
projection setup cannot leave durable ghost presence.

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

Voluntary Creature swaps are an opt-in projection capability during rollout.
The current HTTP client sends
`Accept: application/vnd.wits-world.live.v2+json, application/json;q=0.9`
when reading a match. The current WebSocket client adds `battleSwaps=1` to
the ticketed socket URL. Without the relevant opt-in, the server removes
`swap_creature` from participant legal actions in HTTP and socket projections;
it also redacts swap intent details from participant and spectator history and
the participant's latest result. History entries stay in order with their
original positions, so a committed turn does not disappear from an old
client's timeline. The authoritative state is unchanged. Spectator views have
no legal actions. The WebSocket message `protocolVersion` remains 1 because the message
envelope is unchanged; the URL capability negotiates the action projection.

Binary messages, malformed JSON, unsupported protocol versions, oversized
messages, and unknown message types are rejected without invoking game logic. A
protocol failure synchronously invalidates the runtime connection before the
WebSocket close handshake completes, and queued messages are ignored once the
connection is closed or the transport is no longer `OPEN`. The implementation
must set and document a bounded message-size limit before deployment.

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
{ type: "swap_creature", creatureId: UUID }
{ type: "use_move", moveId: UUID }
{ type: "use_power_card", powerCardId: UUID }
```

`swap_creature` consumes a normal turn and requires a living bench Creature;
mandatory replacement remains free. The client cannot submit `timeout`, damage, effects, randomness, card values,
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
change. The receiving gateway reloads persisted state before delivery. Because
`LISTEN/NOTIFY` is lossy across listener outages, a recovered listener forces
all sockets held by that API instance to reconnect; their next connection loads
the current persisted projection, so a transition missed during the outage
cannot leave an already-open client permanently stale. Explicit snapshot reads
and version-gap recovery remain additional repair paths. Correctness must not
depend on Azure session affinity. See
[live PvP persistence](../database/live-pvp-persistence.md) for the implemented
storage and retention boundary.

Ticket redemption and persisted connection closure also emit a current-version
wake-up. Those notifications do not claim that a gameplay transition occurred;
they cause other gateway instances to reload persisted generation/presence
state. A receiving instance may therefore emit a complete snapshot rather than
a new transition, and an older participant socket is closed when its persisted
generation no longer matches.

### Runtime settings and worker scheduling

Issue `#253` uses protocol version `1`, a 16 KiB WebSocket message limit, and a
20-second transport ping interval. `LIVE_PVP_WEBSOCKET_URL` controls the public
`ws://`/`wss://` endpoint returned by ticket minting;
`LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS` controls the worker probe interval and
defaults to 1000 ms (250–5000 ms). Once the gameplay scheduler implementation
is deployed, `GAMEPLAY_SCHEDULER_BACKEND` selects `polling` (default) or
`upstash`. In polling mode, every running worker keeps
its configured persisted-work probe cadence while idle. In Upstash mode,
active workers still poll at the configured cadence; idle database probes can
sleep up to 30 minutes or until an earlier known work boundary. The activity
store is constructed when either `RATE_LIMIT_BACKEND=upstash` or
`GAMEPLAY_SCHEDULER_BACKEND=upstash`; work producers on those instances publish
durable pre-write intents in either scheduler mode. Valid credentials alone do not
construct the store. Upstash mode reads one combined live/ranked activity
snapshot with a direct Redis `HMGET` every 10 seconds and wakes the relevant
local worker when activity changes. Same-process work still has an immediate
local wake; the Redis interval is for cross-instance observation and remains
below the 30-second lease and 20-second proposal window. A continuously
running API instance makes about 259,200 snapshot reads per 30-day month;
multiply by replica count and budget for mutation/initialization Lua commands
and rate-limit traffic on the same Redis. With SDK automatic deserialization
disabled, the reader maps the five ordered `HMGET` values explicitly. An entirely
missing state initializes through EVAL with both workers active; partial or
malformed state fails safely and retains fast scans instead of declaring idle.
Initialization EVAL is only needed when the state is missing. Coordination errors
include fixed `activity_error_category` values (`transport`, `timeout`,
`invalid_response`, or `unknown`) and a `coordination_stage`; idle errors also
identify the fixed worker category. Raw provider errors, state values, keys,
credentials and URLs are not logged. Startup scans persisted work
immediately and marks discovered work active. PostgreSQL listeners remain disconnected while there is no persisted
active match and no local gateway socket. `LIVE_PVP_TRANSIENT_CLEANUP_INTERVAL_MS`
schedules the idempotent 24-hour transient-data purge without changing the
retention policy itself. The gateway redacts the `ticket` query value from
application logs and production edge logs must apply the same rule.

Each API instance maintains only local socket references. PostgreSQL state,
participant connection generations, receipts, and versions remain authority.
Ranked API mutation attempts, including acceptance that creates a new active
live match, publish durable intents before PostgreSQL writes;
this announcement is distinct from the successful local post-response wake
allowlist. Existing-match live actions, tickets, and presence writes do not
create or reactivate a match, so they do not need a new intent: persisted active
matches already prevent the live worker from declaring idle. This also keeps
Redis out of the ongoing live-action path. The activity store is constructed when either
`RATE_LIMIT_BACKEND=upstash` or `GAMEPLAY_SCHEDULER_BACKEND=upstash`; valid
credentials alone do not construct it. A domain-validation failure can
therefore publish an intent and
then remove it during `finally`; the worker remains active until a safe idle
confirmation succeeds. Only successful allowlisted operations, such as live
ticket creation or proposal acceptance, trigger their immediate local wake.
Recovery scans can also mark persisted work active. Ordinary reads, including
`GET /matches/live/:matchId`, neither publish intents nor wake workers. Durable
pre-write intents are shared across API instances, while local wake callbacks
remain an optimization. PostgreSQL shared transaction advisory locks serialize
these work producers with idle confirmation, and a producer validates its durable intent after
taking the lock before it can write. A delayed writer whose intent was
invalidated aborts with `503`. The live worker's idle transition requires the exclusive
try-lock, removes intents older than 120 seconds under that lock, rechecks
persisted matches, and clears active only if the epoch and revision still
match and there are no pending intents. Existing ranked queue/proposal expiry
and due territory settlement use a shared PG transaction guard without Redis
publication or intent validation, so they remain fenced against idle
confirmation and continue during Redis outages. A proposal timeout may requeue
a previously proposed entry, which was already pending work and cannot make
an idle database active. Season transitions and pairing
retain the durable producer guard; coordination failures pause those phases
while expiry and cleanup continue. Paused creation drives fast retries without
forcing full cleanup on every tick. Existing live actions remain independent
of Redis gameplay coordination. If Redis is unavailable or monitoring requests
fallback, fast PostgreSQL scans preserve recovery. The probe policy
does not disable, pause, extend, or reset persisted decision deadlines. Full
deadline processing uses persisted deadlines and database-clock serialization,
catching up elapsed decisions without resetting their clocks. See the
[ranked operations guide](../deployment/ranked-operations.md) for staged
activation and rollback; all producers of new persisted work must participate
in durable coordination before Upstash mode is enabled.

A dedicated PostgreSQL listener receives `live_pvp_match_changed` and
`live_pvp_presence_changed` notifications. Gameplay notifications reload the
role-specific persisted projection before delivery; presence notifications
reload persisted connection generations and advisory presence without replaying
an already-delivered gameplay transition. If the dedicated PostgreSQL listener
drops, the instance marks the notification stream as having a gap. Once both
channels are subscribed again, the gateway closes its currently registered
sockets with a reconnect-required service-restart close code and finalizes their
persisted access; reconnect then reloads the latest authoritative projection.
If a gameplay notification names an older version than the current persisted
state, the gateway sends a complete snapshot instead of fabricating an
intermediate transition.

The PostgreSQL notification listener is stopped when the process has no
persisted active match and no local gateway sockets, avoiding an idle listener
connection and reconnect loop. This listener serves gateway fan-out and is
separate from the optional activity-store scheduler. When accepting a gateway connection, the
gateway starts the listener before loading and sending the initial persisted
snapshot, preventing a concurrent remote commit from falling between snapshot
load and subscription. PostgreSQL notifications support gateway fan-out only;
they are lossy and are not the cross-instance delivery mechanism for scheduler
wake hints. An idle replica discovers persisted work through its own bounded
fallback scan or immediate startup scan.

## Web experience and recovery policy

The protected Web entry route is `/matches/live`. Players use the existing
ranked queue and proposal acceptance APIs; acceptance creates the match and
navigates to `/matches/live/:matchId`. Spectators provide a privately shared URL
or opaque match ID on the same entry route. The shared match route requests the
server-derived role and renders either the participant projection or the
visibly read-only spectator projection.

On first load and every recovery, the client performs an authenticated HTTP
snapshot read before minting a new single-use ticket and opening a WebSocket. It
does not trust cached battle state. Unexpected version gaps, stale/conflicting
responses, transport loss, and ambiguous action errors return through the same
snapshot-first recovery path. Reconnect attempts use delays of 0, 1, 2, 5, then
10 seconds, capped at 10 seconds. A newer client connection epoch invalidates
messages from an older socket.

The ranked lobby polls its server-owned queue view every 2.5 seconds and sends a
lease heartbeat every 8 seconds while queued. These are presentation policies,
not matchmaking authority. Queue expiry, proposal expiry, match creation, turn
deadlines, timeout transitions, dropout outcomes, rules, versions, and ratings
remain server decisions.

Ranked entry is gated by `GET /api/v1/ranked/seasons/current`. No current active
season leaves the join control disabled and exposes a manual refresh action;
the browser does not infer season availability from an idle queue response.
Safe `409` details from a join attempt are rendered visibly while the control is
restored for retry.

Participant controls are derived only from `legalActions`. A synchronous local
guard locks them before the WebSocket send, and they remain locked until an
authoritative transition or an error followed by reconciliation. Each intent
uses one UUID `messageId` and the displayed `expectedVersion`; the client never
automatically replays an obsolete intent. Spectators have no action or resign
controls, and the closed response parser rejects unexpected private fields.

Current limitations are intentional: there is no public match discovery,
spectator replay, chat, client-owned timeout resolution, or offline battle
mode. A spectator who refreshes after completion can no longer load the match;
an already-connected spectator receives the committed final projection before
the server closes access. Deployed proxy/WebSocket and multi-instance recovery
remain deployment verification rather than local UI evidence.

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
of Codex[GPT-5.6 Sol], ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-5]. The
idle-aware scheduling update was prepared with assistance from Codex-CLI[GPT-5]
and Codex-CLI[gpt-6-luna], based on source inspection and user direction.
The durable activity-store and staged scheduler guidance was updated with
assistance from Codex[GPT-5], based on user-provided implementation requirements.
Existing-work outage behavior was clarified with assistance from Codex-CLI[gpt-6-luna].

Raw SDK response handling and safe coordination diagnostics documented with assistance from Codex[GPT-6].
