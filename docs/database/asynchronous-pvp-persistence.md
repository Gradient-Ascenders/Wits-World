---
title: Asynchronous PvP persistence
---

# Asynchronous PvP persistence

Migration `0028_create_asynchronous_pvp_persistence.sql` provides the durable
data boundary for the asynchronous player-versus-player contract. It is an
implementation input for issue `#180`; it does not add PvP HTTP routes,
viewer-relative projections, polling, or deadline processing by itself.

## Public lifecycle and private battle state

The schema deliberately separates participant-visible lifecycle data from
hidden battle material:

| Relation                                | Responsibility                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `async_pvp_invitations`                 | Challenger, recipient, lifecycle, 24-hour expiry, version, and accepted match identity                |
| `async_pvp_matches`                     | Current actor, 24-hour decision deadline, version, terminal winner, completion reason, and timestamps |
| `async_pvp_match_participants`          | Exactly two participants, engine-side mapping, immutable deck-snapshot reference, and final outcome   |
| `async_pvp_match_actions`               | Legally revealed action intent and public result in stable sequence order                             |
| `private.async_pvp_deck_snapshots`      | Participant-owned saved-deck and initial-Creature snapshot identity                                   |
| `private.async_pvp_deck_snapshot_cards` | Five complete battle-ready card snapshots, including hidden unused cards                              |
| `private.async_pvp_match_states`        | Current full authoritative battle state and matching version                                          |
| `private.async_pvp_match_transitions`   | Immutable before/after state and authoritative result for each action                                 |
| `private.async_pvp_submission_receipts` | Canonical payload hash and committed actor-relative response used for idempotent replay               |

The `private` relations are revoked from the PostgreSQL `PUBLIC` role. The API
database role can use them for protected operations, but player-facing queries
must construct the viewer-safe projection defined by the
[asynchronous PvP API contract](../architecture/asynchronous-pvp-api-contract.md).
No public invitation or match summary contains full state, unrevealed card
identities, card positions, private transition state, or replay responses.

## Integrity rules

Database constraints and deferred validators reinforce these boundaries:

- an invitation starts `pending` at version zero and transitions exactly once
  to `accepted`, `declined`, or `expired`;
- one pending invitation may exist for an unordered player pair, so reverse
  concurrent challenges cannot both commit;
- every invitation has one challenger snapshot and creation receipt;
- acceptance atomically adds the recipient snapshot, two participants, one
  private state, the match, and the acceptance receipt;
- each snapshot contains exactly three Creature and two Power cards, costs at
  most ten rarity points, and selects one Creature from that snapshot;
- active matches have one current participant and an exact 24-hour deadline;
- completed matches have one winner, one loser, and one of `defeat`,
  `turn_forfeit`, or `account_deletion_forfeit`;
- match and private-state versions advance one step together;
- every public action has one private transition and one matching submission
  receipt; and
- snapshots, actions, transitions, receipts, terminal invitations, completed
  matches, participant outcomes, and progression awards cannot be rewritten.

Cross-row validators are deferred until commit. This allows acceptance and
action transactions to construct a coherent circular resource graph without
making partial state observable. A transaction that omits a required snapshot,
participant, state, transition, or receipt fails at commit.

## Idempotency and indexing

Submission receipts are unique by authenticated actor, operation, and UUID
submission identifier. They retain the canonical payload hash and committed
response so issue `#180` can distinguish an identical replay from an ID reused
with different intent. Match actions additionally enforce unique sequence and
actor submission identifiers.

Indexes support incoming and outgoing invitation pages, one-pair pending
checks, bounded invitation expiry, participant match lookup, active pages,
completed history, overdue decisions, action history, and receipt recovery.
The future deadline worker must still lock bounded due rows and recheck status
and time after locking; an index is not itself a concurrency policy.

## Progression

Migration `0028` extends the progression source vocabulary with
`asynchronous_pvp`. Every completed match produces one immutable source
decision for each participant:

| Completion               |    Winner | Loser or forfeiter |
| ------------------------ | --------: | -----------------: |
| Defeat                   | 25 points |           0 points |
| Turn forfeit             | 25 points |           0 points |
| Account-deletion forfeit | 25 points |           0 points |

Both decisions count as activity, including the zero-point outcome. No PvP
achievement is introduced. Existing streak achievements may still unlock when
the approved activity contributes to a three-day streak.

`createProgressionPersistence()` exposes
`recordAsynchronousPvpCompletion(client, matchId)`. The PostgreSQL function
rejects unfinished matches, processes both participants in canonical player-ID
order, takes the existing per-player advisory locks, and returns exactly two
new-or-existing awards. A replay, action race, or deadline-worker retry
therefore converges on the same `(match, participant)` rows.

Issue `#180` must invoke this operation inside the same transaction that makes
the match terminal. A progression failure must roll that terminal transition
back rather than leaving the match and progression out of sync.

## Retention and deletion boundary

Completed matches continue to reference the retained anonymous player
tombstones. Snapshot source deck and owned-card identifiers are audit values,
not foreign keys, so deleting player-owned decks and cards does not destroy or
mutate the battle snapshot. Player-facing history must render a null Player Name
as `Deleted player` and never expose these internal identifiers.

Issue `#180` remains responsible for expiring pending invitations and recording
an `account_deletion_forfeit` when deletion begins. No automated purge is added
for declined or expired invitations because their retention period remains an
explicitly unresolved product decision.

## Verification and release

`apps/api/tests/asynchronous-pvp-persistence.integration.test.ts` creates a
database at the pre-`0028` schema, records existing CPU progression, applies
`0028`, and verifies that history survives. It then covers private-state
separation, indexes, unordered-pair uniqueness, complete snapshots, lifecycle
and receipt constraints, immutable history, all completion reasons, concurrent
replay, 25/0 awards, and activity for both participants.

The test is registered in the explicit database runner:

```bash
npm run test:database --workspace @wits-world/api
```

Apply migration `0028` before deploying issue `#180`. Applying the migration
alone does not make asynchronous PvP available to players.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium].
