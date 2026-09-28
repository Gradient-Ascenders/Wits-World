---
title: 'Live PvP persistence'
---

# Live PvP persistence

## Purpose and scope

Migration `0044_create_live_pvp_persistence.sql` implements the durable storage
boundary required by issue `#251` and the approved
[live PvP contract](../architecture/live-pvp-api-contract.md). It persists the
state needed for live play, reconnect, one-minute deadlines, participant
connection supersession, idempotent mutations, spectator-safe history, and
terminal results across API or gateway restarts.

Migration `0044` remains intentionally persistence-only, but issue `#253` now
uses it through bearer-protected ticket routes, the WebSocket gateway, the
server-owned deadline worker, reconnect handling, and PostgreSQL notification
fan-out. The player UI, matchmaking, ratings, seasons, and territory rules
remain separate work. Runtime connection memory is transport state only and
never replaces these persisted invariants.

Migration `0047_persist_ranked_competition.sql` now adds an optional
[ranked-competition persistence layer](ranked-competition-persistence.md)
around **new** accepted ranked proposals and live matches. It does not rate
existing casual live matches or change the live battle state machine; issue
`#266` must still wire ranked match creation and atomic settlement.

## Public and private data

The schema separates viewer-safe history from security-sensitive battle data.

| Relation                                                                   | Purpose                                                                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.live_pvp_matches`                                                  | Authoritative lifecycle, gameplay version, phase, current actor, exact 60-second decision deadline, winner, and terminal reason.                              |
| `public.live_pvp_match_participants`                                       | Exactly two players, participant side, immutable deck snapshot reference, consecutive timeout count, current connection generation, and terminal outcome.     |
| `public.live_pvp_match_actions`                                            | Immutable spectator-safe transition history, one record for each committed gameplay version.                                                                  |
| `private.live_pvp_deck_snapshots` / `private.live_pvp_deck_snapshot_cards` | Immutable battle-ready copies of each participant's five-card Basic deck, independent of later saved-deck or ownership changes.                               |
| `private.live_pvp_match_states`                                            | Current full authoritative battle state at the match version.                                                                                                 |
| `private.live_pvp_match_transitions`                                       | Immutable before/after state, authoritative result, server randomness, and accepted participant connection generation where applicable.                       |
| `private.live_pvp_connection_tickets`                                      | SHA-256 digests of opaque single-use connection tickets, role, protocol version, expiry, and redemption time. Raw tickets and bearer tokens are never stored. |
| `private.live_pvp_connection_access`                                       | Redeemed participant/spectator connection access, participant generation, closure reason, and bounded cleanup time.                                           |
| `private.live_pvp_submission_receipts`                                     | Canonical payload hash and committed acknowledgement keyed by match, participant, operation, and message ID.                                                  |
| `private.live_pvp_completion_sources`                                      | Exactly-once per-participant terminal sources for later progression policy; migration `0044` does not create a live-PvP point rule.                           |

A `public` database schema name is not an API disclosure policy. The future
runtime still has to authenticate the caller and construct participant- or
spectator-safe projections. Full state, hidden cards, ticket digests,
connections, receipts, randomness, and authoritative before/after state remain
in `private` relations.

## Match and version invariants

A new match begins at version `0` in `initial_selection` with exactly two
participants, two valid immutable deck snapshots, and one private current-state
row at version `0`. The canonical shared Basic deck rules are enforced at the
snapshot boundary: five distinct card copies, three Creature cards, two Power
cards, and at most ten rarity points.

Every committed gameplay transition advances the public match and private state
by exactly one version and appends one public transition plus one private
transition. The transition may be participant-submitted or server-derived, so
automatic initial selection, automatic replacement, timeout, abandonment,
voluntary resignation, and account-deletion forfeit can be represented without
pretending that the browser authored them.

Active initial-selection matches have no single current actor. Active normal or
replacement phases require one current participant. Every active decision has
`turn_deadline = decision_started_at + interval '60 seconds'`; completed matches
have no pending decision deadline. A completed match has one winner, one loser,
a supported completion reason, matching immutable completion sources, and no
later mutable state. Once a participant has a terminal outcome, the entire
participant row is immutable, including timeout and connection-generation
fields.

The database stores the deadline but does not decide a late action merely from
network arrival time. The runtime contract requires the transaction handling an
action or deadline to lock the authoritative match row and then sample
PostgreSQL `clock_timestamp()`. An elapsed deadline is persisted before a late
participant intent is rejected.

## Connection tickets and participant generations

Connection tickets are opaque high-entropy values generated by the server. Only
the 32-byte SHA-256 digest is persisted. A ticket is bound to one match, one
active local player, one server-derived role, and protocol version `1`; it
expires exactly 60 seconds after creation and can be redeemed once.

Ticket minting and redemption serialize against player and match lifecycle
changes. Both paths lock the player row before the authoritative match row;
redemption then locks the ticket and, for participants, the participant row.
Minting samples PostgreSQL `clock_timestamp()` only after the player/match
lifecycle locks are acquired and derives `created_at`, the exact 60-second
`expires_at`, and the retention boundary from that post-lock timestamp.
Production redemption likewise samples `clock_timestamp()` only after all of
its required locks are acquired, so time spent waiting during redemption counts
against the already-started ticket lifetime. A mint request therefore does not
lose TTL while blocked on lifecycle serialization, while an already-minted
ticket that expires during a redemption lock wait is rejected.

Participant redemption increments its persisted `connection_generation` by
one, closes an older open participant access as `superseded`, and records the
new access atomically. Spectator redemption does not increment participant
generation. A participant cannot obtain spectator access to the same match,
and a nonparticipant cannot redeem a participant ticket.

Connection generation is separate from gameplay version. Reconnect,
supersession, socket close, and spectator presence do not advance battle state
or extend a deadline. Participant submission receipts lock the participant row
and reject a generation different from the currently persisted value. The
future gateway must still follow the contract ordering: generation check,
idempotency lookup, post-lock database time/deadline handling, expected version,
legal-action validation, shared rules transition, atomic persistence, then
post-commit publication.

Connection-access rows are durable authorization and audit records, not an exact
record of currently open sockets. A gateway process can disappear without
closing a row, especially for spectators. The issue `#253` gateway therefore keeps presence advisory as required by the
live contract. It closes access rows on observed transport shutdown and uses
ping/pong for local liveness, but a process can still disappear before cleanup;
therefore battle correctness never depends on the presence projection.

## Idempotency and immutable history

`private.live_pvp_submission_receipts` stores one logical participant message
for `(match, actor, operation, message_id)`. It records the canonical payload
hash, expected gameplay version, accepted connection generation, committed
public event, and canonical acknowledgement. The issue `#253` API/gateway returns
the stored acknowledgement for an identical replay and reject reuse of the
message ID with a different canonical payload.

Participant public transitions require exactly one matching receipt and the
same accepted connection generation. Server-derived transitions cannot carry a
participant generation or participant receipt. Public action history, private
transition history, submission receipts, completion sources, and deck snapshots
are immutable after insertion.

## Retention and privacy

The live persistence layer stores no IP address, raw connection ticket, bearer
token, Auth0 subject, email address, or precise location in its operational
records.

Migration `0044` uses a **confirmed 24-hour transient-retention policy** for
expired ticket digests and closed/replaced connection-access rows. Issue `#252`
does not prescribe this duration; it was confirmed during issue `#251` review.
This is a persistence policy, not the 60-second protocol validity period.
`purge_after` indexes support bounded cleanup and
`private.purge_live_pvp_transient_access(...)` is retry-safe:
it removes due closed access first and then removes a due ticket only when no
access row still references it. Match state, snapshots, transition history,
idempotency receipts, terminal results, and completion sources are not removed
by this transient cleanup.

No automatic production cleanup schedule is introduced by migration `0044`.
Scheduling and operational evidence belong to the runtime/deployment work that
invokes the private purge primitive.

## Account deletion

Completed live matches and their immutable history remain attached to a
profile-free historical actor key. Presentation code must use `Deleted
player` rather than reconstructing identity.

When a player is about to enter `deletion_pending`, the migration removes that
player's transient live connection access and ticket digests. A database guard
rejects the lifecycle transition while the player still belongs to an active
live match. This prevents account deletion from silently erasing or bypassing
an authoritative live result.

The issue `#253` live runtime integrates with the existing
`finalizeDependentGameplay` account-deletion hook. Under the approved match-lock
and database-clock rules, an already-elapsed decision is resolved first;
otherwise the deleting participant is terminally resolved with
`account_deletion_forfeit`. Only after affected matches are completed may the
player enter `deletion_pending`.

## Deployment and rollback

Migration `0044` is additive and database-first. Existing API versions do not
query the new relations, so applying it before the realtime gateway introduces
no live-PvP route and requires no mixed-version response contract. Once applied,
treat the migration as immutable and correct defects with a later migration;
do not edit or remove applied migration history.

The migration adds no dependency, seed, environment variable, WebSocket
setting, or point-award rule. The confirmed 24-hour transient-retention value
is recorded here as the issue `#251` policy; after the migration is applied,
any change requires a later migration rather than editing history.

## Verification

`apps/api/tests/live-pvp-persistence.integration.test.ts` covers the upgrade
path from the pre-`0044` schema, migration rerun/checksum behavior, private/public
separation, canonical five-card snapshots, ticket redemption races, participant
connection generations, stale-generation rejection, same-version write races,
idempotency receipt uniqueness, terminal immutability, completion sources,
account-deletion guards and retained anonymous history, 24-hour cleanup
boundaries, and recovery through a fresh database pool.

The disposable database runner includes the focused suite. Pull-request CI is
responsible for the full migration/database regression run against its isolated
PostGIS service. A passing test database is not evidence that the production
migration or cleanup schedule was executed; deployed verification must be
recorded only when an authorised operator performs it.

## AI declaration

This document and the issue `#251` persistence implementation were generated and
reviewed with the assistance of ChatGPT-Web[GPT-5.6 Sol].

Ranked persistence handoff updated with assistance from Codex[GPT-5.6 Sol].

This account-deletion update was edited with assistance from Codex[GPT-6].
