---
title: 'Asynchronous player battle API'
---

# Asynchronous player battle API

## Status and purpose

This document is the issue `#178` contract for asynchronous player-versus-player
mode. Migration `0028` implements its persistence boundary for issue `#179`,
issue `#180` implements the routes, viewer projections, and background deadline
work, and issue `#181` adds the Web player journey. Implementation in the
repository is not a claim that a named commit is deployed.

The contract keeps asynchronous PvP separate from the later one-minute live
mode. Asynchronous play uses persisted state, polling, and 24-hour response
windows. It does not introduce WebSockets, live presence, spectators,
matchmaking, ratings, seasons, or client-authoritative results.

The API and PostgreSQL remain authoritative. The browser submits authenticated
intent, renders viewer-safe state, and may poll committed resources. It never
submits or calculates damage, effects, randomness, legal-action results,
deadlines, winners, completion, forfeiture, or progression awards.

## Confirmed and unresolved decisions

The following rules are fixed by issue `#178` and this contract:

- challenge discovery uses the existing unique Player Name and discloses no
  email, Auth0 subject, role, location, internal player UUID, or private
  history;
- invitations expire 24 hours after their server-recorded creation time;
- each decision window in an accepted match lasts 24 hours;
- a missed match decision automatically forfeits the match rather than applying
  the shared rules package's live/CPU `timeout` action;
- deck and card values are validated and snapshotted before use;
- existing deterministic move, effect, replacement, and victory rules are
  shared with CPU battles;
- only participants can inspect invitations, matches, and history;
- polling is the only planned update mechanism;
- every client mutation is idempotent and contains intent only; and
- only the authenticated challenger may cancel their own still-pending
  invitation;
- either authenticated participant may voluntarily resign an active match,
  regardless of whose turn it is; and
- match completion exposes a stable exactly-once progression source without
  inventing client-controlled or unapproved award values.

Issue `#220` adds outgoing invitation cancellation as the distinct terminal
`cancelled` state. It does not mean recipient decline, time-based expiry, or
account-lifecycle invalidation, and it never creates or changes a match. Issue
`#219` adds voluntary match resignation as a distinct `voluntary_resignation`
terminal reason. The authenticated caller is always the loser and the other
persisted participant is always the winner; the browser cannot nominate either
identity. Account deletion still invalidates pending invitations. For an active match
whose turn deadline has not elapsed, the deleting player loses by
`account_deletion_forfeit`. If the deadline has already elapsed when deletion or
resignation begins, deadline authority takes precedence: the current actor loses
by `turn_forfeit`. Completed records retain an anonymous player tombstone under
the existing retention policy.

The following social and privacy decisions are unresolved and require separate
product authority before a later implementation claims them:

- opting out of challenges or limiting challenges to approved contacts;
- player blocking, reporting, moderation, and abuse-response workflows;
- notification channels and notification retention;
- per-player pending-invitation and active-match limits beyond the one-pair
  rule below;
- retention periods for declined, cancelled, and expired invitations; and
- whether a reused Player Name should receive additional protection after
  account deletion.

Until those decisions are approved, exact lookup, the generic authenticated
rate limit, and one pending invitation per unordered player pair are the bounded
first-delivery protections. They are not substitutes for blocking, reporting,
or moderation.

## Identity and discovery

Only an authenticated active player with a non-null Player Name can look up or
challenge another player. Lookup is an exact canonical Player Name match; it is
not prefix search, autocomplete, recommendations, or a player directory.

The lookup response contains only:

| Field        | Type     | Meaning                                      |
| ------------ | -------- | -------------------------------------------- |
| `playerName` | `string` | Exact canonical challenge name               |
| `requestId`  | `string` | Server-generated safe correlation identifier |

No response contains the target's internal UUID, provider identity, account
role, email, location, activity, deck, collection, rank, or challenge history.
A missing, null-name, deleted, deletion-pending, or self target uses the same
`PVP_PLAYER_UNAVAILABLE` response. Invitation creation resolves the supplied
Player Name again inside its transaction, so a prior lookup is never authority.

Player Name is the only client-visible challenge identity. Internally, foreign
keys use server-resolved player UUIDs. The browser cannot submit a player UUID
as an ownership or authorization claim.

## Invitation lifecycle

An invitation has one of these states:

```text
pending -> accepted
        -> declined
        -> cancelled
        -> expired
        -> invalidated
```

`accepted`, `declined`, `cancelled`, `expired`, and `invalidated` are terminal
and immutable. `cancelled` means the challenger ended the invitation before its
deadline. `invalidated` means a participant began account deletion before the
invitation expired; it is not a user cancellation.

### Creation

The challenger supplies a saved deck and an initial Creature from that deck.
The server:

1. derives the challenger from the validated token;
2. resolves the exact opponent Player Name to an active player;
3. rejects self-challenges;
4. validates deck ownership and the complete three-Creature/two-Power,
   ten-point rule;
5. validates that `initialCreatureId` is one of the deck's Creature copies;
6. snapshots the challenger deck and battle-ready card values;
7. records `createdAt` from the server clock and
   `expiresAt = createdAt + 24 hours`; and
8. commits the invitation and submission receipt atomically.

Only one pending invitation may exist for an unordered player pair. Two players
challenging one another concurrently therefore produce one committed pending
invitation; the other request returns `PVP_INVITATION_ALREADY_PENDING`. This
does not prohibit a later rematch or establish a global active-match limit.

The recipient sees the challenger Player Name and invitation timestamps, but
not the challenger deck, snapshot, card identities, initial selection, or
collection. Invitation views do not expose either deck or initial selection;
the server retains them only in the private persistence snapshot needed to
start an accepted match.

### Acceptance

The recipient accepts with their saved deck and initial Creature. In one locked
transaction the server:

1. locks the invitation through a recipient-scoped lookup;
2. performs the fresh post-lock submission-receipt check, returning an
   identical committed replay before applying a deadline;
3. finalizes a still-pending invitation as expired when `now >= expiresAt`;
4. checks `expectedVersion` and lifecycle state;
5. validates and snapshots the recipient deck;
6. applies both hidden initial selections through the shared rules package;
7. uses server-side randomness to choose the first side;
8. creates one active asynchronous match and its first decision deadline;
9. marks the invitation accepted and links the match; and
10. persists the response used for idempotent replay.

The match starts only when all steps commit. Neither participant can observe a
partially accepted invitation, an unmatched snapshot, or the opponent's hidden
initial selection. The first `turnDeadline` is 24 hours after the acceptance
transaction's server timestamp.

### Decline, cancellation, and expiry

Only the recipient may decline. Decline records the server timestamp and no
match or progression source is created.

Only the challenger may cancel. The server locks the invitation through a
challenger-scoped lookup, checks an exact replay before lifecycle decisions,
uses database time to give an already elapsed deadline precedence, and commits
`cancelled`, version `+ 1`, `respondedAt`, and one private
`invitation_cancel` receipt atomically. A recipient or unrelated caller gets
the same safe `PVP_INVITATION_NOT_FOUND` response as an absent invitation.
Cancellation retains the challenger snapshot and invitation audit record, but
creates no recipient snapshot, match, history result, or progression source.

Invitation expiry is successful when `now >= expiresAt`. It may be finalized by
the background sweep or by an invitation read or mutation that locks the
overdue row. Expiry has no winner and no progression effect. A late accept,
decline, or cancellation leaves the invitation persisted as expired and returns
`PVP_INVITATION_EXPIRED` rather than reviving it.

## Match lifecycle and deadlines

An asynchronous match is either `active` or `completed`. A completed match has
one immutable completion reason:

| Reason                     | Meaning                                           |
| -------------------------- | ------------------------------------------------- |
| `defeat`                   | Shared battle rules produced a winner             |
| `turn_forfeit`             | The required participant missed a 24-hour window  |
| `account_deletion_forfeit` | An active participant began permanent deletion    |
| `voluntary_resignation`    | One participant chose to concede the active match |

The API maps the internal `player` and `cpu` rule-engine sides to viewer-relative
`self` and `opponent`. CPU-oriented side names and internal player UUIDs do not
cross the PvP HTTP boundary.

Each committed state identifies either no actor because it is terminal, or one
participant who must act. An active move turn and a mandatory replacement both
receive a fresh deadline:

```text
turnDeadline = decisionStartedAt + 24 hours
```

A mandatory replacement remains a separate shared-rule decision and does not
consume the replacement player's following normal turn. Committing the
replacement therefore creates a new 24-hour deadline for that player's normal
turn.

At the exact boundary, `now >= turnDeadline` means the deadline has passed. The
overdue participant loses by `turn_forfeit`; the opponent wins. The API never
converts this event to the rules package's `{ "type": "timeout" }` transition,
because that action skips a turn in CPU/live play instead of completing an
asynchronous forfeit.

Reads and polling never extend a deadline. Only a committed legal action that
creates another required decision changes it.

## Viewer-safe match projection

All match fields are protected. In this document, **shared** means visible to
both authenticated participants, not anonymous or spectator-visible.

| Data                                             | Self                | Opponent                   | Non-participant |
| ------------------------------------------------ | ------------------- | -------------------------- | --------------- |
| Player Name                                      | Yes                 | Yes                        | No              |
| Internal player UUID/Auth0 data                  | No                  | No                         | No              |
| Match status, version, timestamps, current actor | Yes                 | Yes                        | No              |
| Own full Creature and Power snapshots            | Yes                 | No                         | No              |
| Own current HP, Power, modifiers, and used cards | Yes                 | No                         | No              |
| Opponent active and defeated Creatures           | Yes                 | Viewer-relative equivalent | No              |
| Opponent unused Creature identities              | No; count only      | No; count only             | No              |
| Opponent unused Power-card identities            | No; count only      | No; count only             | No              |
| Legally played Power cards and resolved effects  | Yes                 | Yes                        | No              |
| Legal actions                                    | Only when self acts | No                         | No              |
| Unplayed cards in completed history              | No                  | No                         | No              |
| Authoritative outcome and completion reason      | Yes                 | Yes                        | No              |

The response does not use `null` card objects as hidden placeholders because
their number or position could leak deck ordering. It returns explicit
aggregate counts and separate revealed-card arrays. A history replay contains
only actions and card information that became legally visible during play.

The common match response is viewer-relative:

| Field                 | Type                           | Required   | Notes                            |
| --------------------- | ------------------------------ | ---------- | -------------------------------- |
| `matchId`             | UUID string                    | Yes        | Opaque match identifier          |
| `mode`                | `"asynchronous"`               | Yes        | Never aliases live PvP           |
| `status`              | `"active" \| "completed"`      | Yes        | Authoritative state              |
| `version`             | non-negative integer           | Yes        | Optimistic-concurrency version   |
| `opponent.playerName` | string                         | Yes        | Only approved opponent identity  |
| `currentActor`        | `"self" \| "opponent" \| null` | Yes        | Viewer-relative                  |
| `turnDeadline`        | RFC 3339 timestamp or null     | Yes        | Null only when completed         |
| `state`               | `AsyncPvpStateView`            | Yes        | Viewer-safe battle projection    |
| `legalActions`        | action array                   | Yes        | Empty unless self may act        |
| `history`             | `PvpActionHistoryEntry[]`      | Version 4+ | Full participant-safe action log |
| `lastAction`          | `PvpActionResultView` or null  | Yes        | Legally visible committed result |
| `outcome`             | `"win" \| "loss" \| null`      | Yes        | Non-null when completed          |
| `completionReason`    | terminal reason or null        | Yes        | Non-null when completed          |
| `startedAt`           | RFC 3339 timestamp             | Yes        | Server timestamp                 |
| `updatedAt`           | RFC 3339 timestamp             | Yes        | Polling reconciliation field     |
| `completedAt`         | RFC 3339 timestamp or null     | Yes        | Server timestamp                 |
| `canResign`           | boolean                        | Version 2+ | Server-derived capability        |
| `requestId`           | string                         | Yes        | Safe request correlation         |

The Web client negotiates version 4 with
`Accept: application/vnd.wits-world.pvp.v4+json, application/vnd.wits-world.pvp.v3+json;q=0.9, application/json;q=0.8`.
`Accept` is CORS-safelisted, so this does not add a request header to the browser
preflight allow-list. An older API can ignore the preferred media type and serve
the `application/json` fallback; the Web then treats an absent `canResign` as
unavailable and an absent `canCancel` as false. Version 4 includes all version 3
behavior and adds the complete participant-safe action history through the
returned match version. Each entry contains its committed sequence, authoritative
turn number, server timestamp, and viewer-relative public action result. Version
3 includes all version 2 resignation behavior and adds invitation cancellation. Match responses from the
version-2-or-later API include `canResign`, which
is true only while the authoritative match is active. A detail read locks and
finalizes an elapsed deadline before projecting the response, so an overdue
match is returned as a `turn_forfeit` with `canResign: false`, even when the
periodic sweep has not processed it yet. The resign mutation repeats that
database-time deadline check under the same match lock.

`PvpActionHistoryEntry` is a closed object containing `sequence`, `turnNumber`,
`createdAt`, and `result`. Entries are ordered by committed sequence and include
only the same viewer-relative public result shape used by `lastAction`.
`lastAction` remains the final history result for compatibility; resignation and
deadline completion do not invent action entries.

During a mixed API/Web rollout, legacy requests receive the original shapes
without `canResign` or `canCancel`. A legacy request that would receive a
voluntary-resignation reason, or a pre-v3 request whose invitation page contains
`cancelled`, fails safely with `PVP_CLIENT_UPDATE_REQUIRED`. The resign and
cancel endpoints reject unsupported requests before invoking the service.
If a pending invitation is cancelled before a pre-v3 client submits Accept or
Decline, those endpoints return `PVP_CLIENT_UPDATE_REQUIRED` instead of exposing
`PVP_INVITATION_CANCELLED`. V3 clients retain the cancellation-specific error.

`AsyncPvpStateView` is a closed object with these required fields:

| Field        | Type                                       | Visibility rule                                  |
| ------------ | ------------------------------------------ | ------------------------------------------------ |
| `phase`      | `"active" \| "replacement" \| "completed"` | Shared                                           |
| `turnNumber` | positive integer                           | Shared                                           |
| `self`       | `SelfParticipantView`                      | Full viewer-owned battle snapshot                |
| `opponent`   | `OpponentParticipantView`                  | Revealed cards plus hidden-card aggregate counts |

`SelfParticipantView` contains the viewer's Player Name, every Creature and
Power-card snapshot, active Creature identifier, current HP and Power,
modifiers, and used Power-card identifiers. `OpponentParticipantView` contains
the opponent Player Name, active and defeated Creature snapshots, remaining
Creature count, legally played Power cards and resolved effects, and remaining
Power-card count. It contains no array, identifier, position, or placeholder
for an unrevealed card.

Creature, move, effect, modifier, legal-action, and public action-result objects
reuse the corresponding closed public schema shapes already served by CPU
matches. Issue `#180` must extract shared OpenAPI components for those shapes
and add viewer-relative participant and side enums; it must not fork their
battle semantics. `PvpActionResultView` maps any public actor or target side to
`self` or `opponent` and contains only the committed public result. All three
legal-action variants are closed objects, and `legalActions` is non-empty only
when `currentActor` is `self`.

Success response schemas and request schemas use `additionalProperties: false`
so authoritative-looking fields cannot be smuggled into otherwise valid
payloads.

## Legal client intents

Every mutation carries a UUID `submissionId`. State-changing invitation and
match intents also carry `expectedVersion`. Replaying the same submission with
the same authenticated actor, operation, resource, and canonical payload
returns the stored outcome. Reusing the ID with a different payload returns
`PVP_IDEMPOTENCY_CONFLICT`.

The complete first-delivery endpoint set is:

| Method and path                                              | Success | Response schema               | Intent                                          |
| ------------------------------------------------------------ | ------- | ----------------------------- | ----------------------------------------------- |
| `GET /api/v1/matches/pvp/players?playerName={name}`          | `200`   | `ChallengePlayerResponse`     | Exact challenge lookup                          |
| `POST /api/v1/matches/pvp/invitations`                       | `201`   | `PvpInvitationResponse`       | Create one invitation                           |
| `GET /api/v1/matches/pvp/invitations`                        | `200`   | `PvpInvitationListResponse`   | List a bounded page of the viewer's invitations |
| `POST /api/v1/matches/pvp/invitations/:invitationId/accept`  | `200`   | `AcceptPvpInvitationResponse` | Accept with a deck and initial Creature         |
| `POST /api/v1/matches/pvp/invitations/:invitationId/decline` | `200`   | `PvpInvitationResponse`       | Decline a pending invitation                    |
| `POST /api/v1/matches/pvp/invitations/:invitationId/cancel`  | `200`   | `PvpInvitationResponse`       | Cancel an outgoing pending invitation           |
| `GET /api/v1/matches/pvp`                                    | `200`   | `PvpMatchListResponse`        | List a bounded active-match page                |
| `GET /api/v1/matches/pvp/history`                            | `200`   | `PvpHistoryResponse`          | List a bounded completed-history page           |
| `GET /api/v1/matches/pvp/:matchId`                           | `200`   | `AsyncPvpMatchResponse`       | Read one viewer-safe match                      |
| `POST /api/v1/matches/pvp/:matchId/actions`                  | `200`   | `AsyncPvpMatchResponse`       | Submit one legal battle intent                  |
| `POST /api/v1/matches/pvp/:matchId/resign`                   | `200`   | `AsyncPvpMatchResponse`       | Concede one active participant match            |

Static `/history` routing must be registered without allowing it to be captured
as a match identifier.

Every success envelope requires `requestId` and uses
`additionalProperties: false`:

| Schema                        | Required content                                                 |
| ----------------------------- | ---------------------------------------------------------------- |
| `ChallengePlayerResponse`     | `playerName`, `requestId`                                        |
| `PvpInvitationResponse`       | `invitation`, `requestId`                                        |
| `PvpInvitationListResponse`   | `invitations[]`, `nextCursor`, `requestId`                       |
| `AcceptPvpInvitationResponse` | terminal accepted `invitation`, created `match`, `requestId`     |
| `PvpMatchListResponse`        | viewer-relative active `matches[]`, `nextCursor`, `requestId`    |
| `AsyncPvpMatchResponse`       | the complete viewer-relative match fields defined above          |
| `PvpHistoryResponse`          | completed viewer-relative `matches[]`, `nextCursor`, `requestId` |

The list item components are also closed and viewer-relative:

| Component           | Required fields                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PvpMatchSummary`   | `matchId`, `mode`, `status`, `version`, `opponent.playerName`, `currentActor`, `turnDeadline`, `updatedAt`    |
| `PvpHistorySummary` | `matchId`, `mode`, `status`, `opponent.playerName`, `outcome`, `completionReason`, `startedAt`, `completedAt` |

An active list returns only `PvpMatchSummary` values with
`mode = "asynchronous"` and `status = "active"`. History returns only
`PvpHistorySummary` values with `mode = "asynchronous"` and
`status = "completed"`; a deleted opponent is represented by the literal safe
display value `Deleted player`, not an internal identifier.

### Bounded collection queries

All three collection routes use keyset cursor pagination. Their query objects
are closed and accept:

| Route          | Query fields                                 |
| -------------- | -------------------------------------------- |
| Invitations    | `cursor?`, `limit?`, `direction?`, `status?` |
| Active matches | `cursor?`, `limit?`                          |
| Match history  | `cursor?`, `limit?`                          |

`limit` is an integer from `1` through `50` and defaults to `20`. The server
never returns more than the effective limit. `direction` is `incoming` or
`outgoing`; `status` is one invitation status. Omitting either invitation
filter includes both directions or all statuses respectively. This lets the
Web application request a bounded actionable page such as pending incoming
invitations without loading retained terminal invitations.

`cursor` is an opaque server-issued string with a maximum length of 512
characters. It binds the authenticated viewer, endpoint, filters, effective
limit, ordering fields, and final row of the preceding page. A malformed,
tampered, cross-viewer, cross-endpoint, or filter-mismatched cursor returns the
safe `VALIDATION_ERROR`; the client never constructs or edits one and repeats
the same filters and limit when requesting the next page.

Ordering and cursor comparisons are deterministic:

| Collection     | Order                                      |
| -------------- | ------------------------------------------ |
| Invitations    | `createdAt DESC`, then `invitationId DESC` |
| Active matches | `updatedAt DESC`, then `matchId DESC`      |
| Match history  | `completedAt DESC`, then `matchId DESC`    |

The opaque cursor advances strictly after that tuple. UUIDs are the stable
tie-breakers and are already visible identifiers for the corresponding
participant-owned resources. Each list response includes required
`nextCursor: string | null`; null means that query currently has no later page.
The implementation may fetch one extra row internally to decide whether to
emit a cursor, but it does not return that row in the current page.

Active-match ordering can change while a player traverses pages. Consumers
deduplicate by `matchId`, keep the greatest `version`, and restart from the
first page for the next refresh; a cursor traversal is not a long-lived
database snapshot. Background polling refreshes only the visible first page or
an open match detail. It must not automatically drain every cursor page on each
interval. Explicit navigation or recovery may request later pages one at a
time.

A safe first-page envelope is:

```json
{
  "matches": [],
  "nextCursor": null,
  "requestId": "server-generated-request-id"
}
```

The lookup query requires exactly one `playerName` and rejects unknown query
properties. Invitation and match path parameters require UUID format. List
operations accept no browser-supplied player identifier. A first-page request
omits `cursor`; an empty page still returns `nextCursor: null`.

### Invitation request schemas

Create invitation:

```json
{
  "opponentPlayerName": "wits_wanderer",
  "deckId": "11111111-1111-4111-8111-111111111111",
  "initialCreatureId": "22222222-2222-4222-8222-222222222222",
  "submissionId": "33333333-3333-4333-8333-333333333333"
}
```

Required fields are exactly `opponentPlayerName`, `deckId`,
`initialCreatureId`, and `submissionId`. The three identifiers use UUID format;
Player Name uses the shared account-policy length and syntax.

Accept invitation:

```json
{
  "deckId": "44444444-4444-4444-8444-444444444444",
  "initialCreatureId": "55555555-5555-4555-8555-555555555555",
  "submissionId": "66666666-6666-4666-8666-666666666666",
  "expectedVersion": 0
}
```

Decline invitation:

```json
{
  "submissionId": "77777777-7777-4777-8777-777777777777",
  "expectedVersion": 0
}
```

Cancel invitation uses the same closed versioned body:

```json
{
  "submissionId": "88888888-8888-4888-8888-888888888888",
  "expectedVersion": 0
}
```

The accept body requires exactly `deckId`, `initialCreatureId`, `submissionId`,
and `expectedVersion`. The decline and cancel bodies require exactly
`submissionId` and `expectedVersion`. All version values are non-negative
integers, and all shown identifiers use UUID format.

`PvpInvitationView` is a closed object:

| Field                 | Type                                                                                 | Required  |
| --------------------- | ------------------------------------------------------------------------------------ | --------- |
| `invitationId`        | UUID string                                                                          | Yes       |
| `direction`           | `"incoming" \| "outgoing"`                                                           | Yes       |
| `status`              | `"pending" \| "accepted" \| "declined" \| "cancelled" \| "expired" \| "invalidated"` | Yes       |
| `version`             | non-negative integer                                                                 | Yes       |
| `opponent.playerName` | string                                                                               | Yes       |
| `createdAt`           | RFC 3339 timestamp                                                                   | Yes       |
| `expiresAt`           | RFC 3339 timestamp                                                                   | Yes       |
| `respondedAt`         | RFC 3339 timestamp or null                                                           | Yes       |
| `matchId`             | UUID string or null                                                                  | Yes       |
| `canCancel`           | boolean                                                                              | Version 3 |

`respondedAt` is null only while pending. `matchId` is non-null only when the
invitation was accepted. Both incoming and outgoing views omit deck and initial
selection data. `direction` and `opponent` are relative to the authenticated
viewer.

For a version 3 response, `canCancel` is true only for a pending outgoing view.
It is false for incoming and terminal views. Capability absence is a safe false
for clients during a mixed rollout; the browser does not infer capability from
direction or status alone.

### Match action schema

The action request is:

```json
{
  "submissionId": "88888888-8888-4888-8888-888888888888",
  "expectedVersion": 4,
  "action": {
    "type": "use_move",
    "moveId": "99999999-9999-4999-8999-999999999999"
  }
}
```

`action` is exactly one of:

```text
{ type: "select_replacement", creatureId: UUID }
{ type: "swap_creature", creatureId: UUID }
{ type: "use_move", moveId: UUID }
{ type: "use_power_card", powerCardId: UUID }
```

Initial selection is captured during invitation creation and acceptance.
`swap_creature` is allowed only on a normal turn and consumes that turn; a
mandatory `select_replacement` remains a separate, free decision.
`select_initial_creature` and `timeout` are therefore never accepted at the
match-action endpoint. The body cannot contain effects, card statistics,
damage, HP, Power, randomness, target results, winner, completion reason,
deadline, or progression fields.

The server still validates the requested identifier against the current
authoritative `legalActions`; returning an action earlier does not reserve it
or bypass version and deadline checks.

The resignation body is the closed intent
`{ submissionId: UUID, expectedVersion: integer }`. It contains no participant,
loser, winner, outcome, reason, points, or battle state. Resignation does not
depend on `currentActor` or `legalActions`; the server derives permission from
authenticated participation and the active persisted match.

## Polling and history

`GET /matches/pvp` and `GET /matches/pvp/:matchId` are the recovery authority
after refresh, restart, or an ambiguous network response. Local storage,
guessed state, and browser simulation are not authoritative.

Polling uses the returned `version` and `updatedAt` to recognize a new committed
snapshot. The contract does not require a fixed polling interval; the Web
implementation must use bounded polling only while the relevant page is
visible, stop on unmount, and back off after failures or rate limiting.
Collection polling follows the bounded first-page rules above; match-detail
polling remains the authority while a battle is open.

An ambiguous mutation response is reconciled by reading the affected
invitation or match and then replaying the same `submissionId` only when
necessary. For cancellation, an unchanged outgoing pending invitation may
offer an explicit same-reference retry; a terminal invitation is rendered
without resubmission. For resignation, an unchanged active match with the same version may
offer an explicit same-reference retry; a newer or terminal match is rendered
without resubmission. The client must not manufacture a new submission
identifier merely because the first response was lost.

History is participant-only. List rows contain the opponent Player Name or
`Deleted player`, viewer-relative outcome, completion reason, and timestamps.
Detail may include the legally revealed action history, but never unplayed
opponent cards or private persistence snapshots.

## Idempotency and concurrency boundary

Migration `0028` reinforces this contract with foreign keys, terminal-state
constraints, unique submission receipts, private immutable snapshots, and
indexes for pending invitations, active participant matches, history, and
overdue work. The
[persistence design](../database/asynchronous-pvp-persistence.md) records the
implemented relations and downstream transaction boundary.

Invitation creation has no existing resource row to lock. Its transaction must
serialize the canonical unordered player pair, enforce the one-pending-pair
constraint, and use an actor-and-operation-scoped unique submission receipt. A
same-submission or same-pair unique race is resolved with a fresh receipt and
pending-invitation lookup so an identical replay returns its committed result
and a different request receives the appropriate conflict.

Each mutation of an existing invitation or match follows this order:

1. begin a transaction and lock the invitation or match through a
   participant-scoped lookup, returning the safe not-found response for a
   missing resource or wrong actor;
2. load a previously committed submission receipt in a fresh statement after
   acquiring the lock;
3. return that result for an identical replay or reject a payload conflict;
4. compare the authoritative server time with the persisted deadline;
5. finalize overdue state before considering client intent;
6. validate version, lifecycle, ownership, and legal intent;
7. apply the shared deterministic transition and any server randomness;
8. persist state, version, action/history, terminal result, submission receipt,
   and progression hook atomically; and
9. commit before returning the response.

The fresh post-lock receipt lookup preserves the existing CPU-match lesson: a
statement snapshot created while waiting for another writer may not observe
that writer's newly committed receipt through a subquery in the locking
statement.

Two requests with one expected version cannot both advance a match. The first
commit increments the version; the second returns the stored receipt when it is
a replay or rejects the now-stale/terminal intent. A resignation receipt is
unique per match, and deferred validation requires exactly one such receipt for
a `voluntary_resignation` result and none for any other completion reason.
Migration `0039` similarly makes the cancellation receipt unique per invitation
and deferred validation requires exactly one challenger-owned cancellation
receipt for `cancelled`, with no match or recipient snapshot.

## Deterministic deadline processing

The deadline processor is an at-least-once convergence mechanism, not a source
of authority. PostgreSQL timestamps and terminal constraints decide outcomes.

The implemented processor:

- run one sweep after API startup and repeat on a configurable interval;
- select bounded overdue batches ordered by deadline and stable identifier;
- lock candidates with `FOR UPDATE SKIP LOCKED` or an equivalent non-overlapping
  pattern;
- recheck status and deadline after locking;
- finalize each invitation expiry or match forfeit transactionally;
- write no duplicate history or progression under retry;
- contain one-item failures without exposing sensitive state in logs;
- stop cleanly during API shutdown; and
- catch up all overdue work after restart.

Production runs this worker on the aligned 30-minute database-maintenance
cadence. This does not extend a persisted 24-hour deadline: reads and mutations
finalize overdue state against database time before returning, while the worker
converges matches that receive no further traffic.

The current single Azure API instance with Always On can host the processor in
the API process, following the account-deletion retry scheduler pattern.
Database locking and idempotency remain mandatory so correctness survives a
recycle or future scale-out. Issue `#180` must add safe interval configuration
and update the deployment guide when the processor is actually implemented;
this contract does not claim that configuration exists today.

## Progression boundary

Asynchronous PvP completion creates one stable server-internal progression
source per participant, keyed by the authoritative match and player. It records
the viewer-independent result, completion reason, and completion timestamp in
the same transaction as the terminal match.

The source is processed exactly once even when an action response is replayed,
a deadline worker retries, or two workers race. Zero-point outcomes must still
be recordable when the approved progression rules require activity evidence.

Migration `0028` adds the dedicated `asynchronous_pvp` source without
reclassifying PvP as a CPU match. Migration `0037` adds versioned voluntary-
resignation rules. A defeat, turn forfeit, account-deletion forfeit, or voluntary
resignation awards 25 permanent points to the winner and zero to the loser or
forfeiter. Both participant decisions count as activity. No PvP achievement is
introduced, although the activity may contribute to the existing streak
achievement.

The transaction-aware
`recordAsynchronousPvpCompletion(client, matchId)` operation validates the
terminal match and records both participant decisions in canonical player-ID
order. The unique `(matchId, participantId)` source converges under replay and
worker races. Issue `#180` calls it inside the terminal match transaction, so a
progression failure rolls back the terminal transition. See the
[progression rules](../requirements/player-progression-rules.md#asynchronous-pvp-progression)
and [persistence design](../database/asynchronous-pvp-persistence.md#progression).

## Safe errors

Errors use the existing problem-style envelope with `type`, `title`, `status`,
`code`, safe `detail`, and `requestId`. The proposed domain codes are:

| Status | Code                              | Use                                                  |
| ------ | --------------------------------- | ---------------------------------------------------- |
| `400`  | `VALIDATION_ERROR`                | Malformed parameter or closed request schema         |
| `400`  | `PVP_DECK_INVALID`                | Saved deck or initial Creature is unavailable        |
| `404`  | `PVP_PLAYER_UNAVAILABLE`          | Exact target cannot safely be challenged             |
| `404`  | `PVP_INVITATION_NOT_FOUND`        | Missing invitation or wrong participant              |
| `404`  | `PVP_MATCH_NOT_FOUND`             | Missing match or non-participant access              |
| `409`  | `PVP_INVITATION_ALREADY_PENDING`  | One-pair pending constraint                          |
| `409`  | `PVP_INVITATION_EXPIRED`          | Accept, decline, or cancel lost to expiry            |
| `409`  | `PVP_INVITATION_INVALIDATED`      | Participant account deletion ended invitation        |
| `409`  | `PVP_INVITATION_CANCELLED`        | Recipient response lost to challenger cancel         |
| `409`  | `PVP_INVITATION_VERSION_CONFLICT` | Stale invitation version                             |
| `409`  | `PVP_MATCH_COMPLETED`             | New action against a terminal match                  |
| `409`  | `PVP_MATCH_VERSION_CONFLICT`      | Stale match version                                  |
| `409`  | `PVP_ACTION_ILLEGAL`              | Intent is not currently legal                        |
| `409`  | `PVP_IDEMPOTENCY_CONFLICT`        | Submission ID reused with another payload            |
| `409`  | `PVP_CLIENT_UPDATE_REQUIRED`      | Client contract cannot use/read a new terminal state |
| `429`  | `RATE_LIMITED`                    | Existing authenticated per-process limit             |

Authentication continues to use the existing `401` boundary. Object-level
authorization uses the same `404` as absence so a caller cannot probe another
player's invitations or matches. Unknown failures remain generic `500`
responses; internal SQL, state, tokens, and stack traces are not returned.

A safe invitation-expired example is:

```json
{
  "type": "https://wits.world/problems/pvp_invitation_expired",
  "title": "PvP invitation expired",
  "status": 409,
  "code": "PVP_INVITATION_EXPIRED",
  "detail": "The invitation is no longer available.",
  "requestId": "server-generated-request-id"
}
```

## Downstream verification matrix

Migration `0028` and issues `#180` and `#181` must collectively turn these
scenarios into proportionate unit, route, database, component, and integration
tests:

### Invitation and identity

- nonexistent, self, null-name, deletion-pending, and deleted lookup targets;
- absence of email, Auth0 subject, role, UUID, location, rank, and private
  history in lookup and invitation responses;
- same-direction and reverse-direction concurrent invitations;
- invalid, unowned, stale, or incomplete challenger and recipient decks;
- challenger snapshot stability after saved-deck or catalogue edits;
- cancel versus accept, decline, expiry, and account invalidation;
- duplicate cancellation replay, stale versions, payload conflict, and
  participant-scoped authorization;
- accept versus decline, accept versus expiry, and duplicate accept replay;
- identical replay versus submission-ID/payload conflict;
- account deletion during pending invitations; and
- invitation filters, limit bounds, invalid/cross-viewer cursors, stable
  tie-break ordering, and insertion between pages.

### Match authority and privacy

- wrong-player read, action, polling, and history access;
- hidden initial selections and unrevealed Creature and Power cards;
- legal reveal of active/defeated Creatures, played Power cards, and effects;
- rejection of result fields and the `timeout` action;
- stale legal actions after another committed transition;
- two different actions submitted against one version;
- coherent reads before or after, but never across, a concurrent commit;
- mandatory replacement followed by a fresh normal-turn deadline;
- immutable completed state and history;
- participant-only resignation on either turn, with no client-selected result;
- resignation replay, payload conflict, stale/completed rejection, and exact
  deadline precedence;
- resignation racing a legal action or account deletion with one terminal
  result, one progression pair, and no duplicate activity;
- anonymous completed history after account deletion; and
- active/history page bounds, deduplication after mutable ordering, and
  first-page refresh without automatic cursor draining.

### Deadlines, restart, and progression

- actions received immediately before, exactly at, and after the deadline;
- request-driven finalization before the periodic sweep runs;
- two deadline workers selecting the same due population;
- processor restart and overdue catch-up;
- rollback and retry without duplicate terminal history;
- completion action racing a forfeit sweep;
- exactly-once per-participant progression sources for defeat and forfeiture;
- replay of persisted outcomes without duplicate points or achievements; and
- safe logging when a sweep item fails.

### Web behavior

- bounded visible-page polling, recovery after refresh, and lost-response
  reconciliation;
- cancellation capability gating, repeated-click protection using the same
  submission ID, retained terminal sent/incoming presentation, and ambiguous
  response reconciliation;
- confirmed resignation, focus restoration, capability gating, and
  lost-response/stale-state recovery without automatic resubmission;
- incoming, outgoing, accepted, declined, expired, active, forfeited, completed,
  loading, empty, forbidden, and retry states;
- no rendering or storage of unrevealed opponent cards; and
- responsive, keyboard, focus, screen-reader, non-color, and deadline text
  behavior.

## Review and delivery gates

Before issue `#178` is closed:

- an API/security reviewer must approve identity exposure, object
  authorization, idempotency, safe errors, hidden-state projections, and
  deadline concurrency;
- a game-rule reviewer must approve initial selection, first-side randomness,
  mandatory replacement, legal actions, forfeiture, and the separation from
  live timeout behavior;
- the OpenAPI-ready shapes and examples must be checked against Fastify's
  runtime-schema conventions;
- formatting, linting, type checking, tests, and builds must pass;
- CI and the documentation build must pass;
- the pull request must link issue `#178`; and
- unresolved social/privacy decisions must remain visible rather than being
  presented as implemented protections.

This document was planned, generated, edited, and reviewed with the assistance
of Codex[GPT-6], Codex[GPT-5], Codex-CLI[GPT-5], and Codex-CLI[gpt-5.6-sol medium].

Page title clarified with assistance from Codex-CLI[GPT-6].
