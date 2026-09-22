---
title: 'Card trading persistence'
---

# Card trading persistence

## Scope

Migration `0055_persist_versioned_card_trades.sql` implements the durable
persistence boundary for issue `#275`. It follows the approved
[card-trading and anti-drain policy](../requirements/card-trading-policy.md).
This migration does **not** expose trading HTTP routes or a player trading UI;
those remain follow-up work in `#272` and `#274`.

The database remains authoritative for exact-copy reservations, immutable offer
history, terminal lifecycle, and the all-or-nothing settlement record. The API
trade service operates inside PostgreSQL transactions and locks players and
owned-card rows in stable order before mutating trade state.

## Tables and versioning

`private.card_trade_policy_versions` stores immutable server policy values. The
initial `card-trade-v1` row records the approved defaults: 24-hour minimum
account age, five open offers, one-to-five copies per side, five completed
trades per rolling 24 hours, a 24-hour original offer lifetime, a two-point
rarity warning threshold, and post-trade minimums of three Creature and two
Power cards.

`private.card_trades` is the aggregate root. It identifies the two participants,
current version, original deadline, and lifecycle. Its terminal states are
`completed`, `declined`, `cancelled`, `expired`, and `invalidated`. The original
participant identities, policy version, creation time, and deadline cannot be
rewritten. A terminal row cannot return to `open`.

Each counter creates a new row in `private.card_trade_versions`. Exact offered
copies and requested card-definition quantities are persisted in
`private.card_trade_version_items` and `private.card_trade_version_requests`.
Acceptances and imbalance acknowledgements are keyed by trade, version, and
participant. Therefore changing the current version makes every approval from
an earlier version unusable without deleting its audit history.

`private.card_trade_reservations` is the mutable projection for the current
open version. `owned_card_id` is its primary key, so one exact owned copy cannot
be reserved by two active trades. The deck, evolution, and battle-deck paths
lock the same `player_cards` rows before checking reservations. This prevents a
race where a copy is simultaneously reserved and committed to another
operation.

## Settlement and provenance

The second valid acceptance settles in one transaction. The service rechecks
participants, deadline, current version, approvals, imbalance acknowledgements,
trade holds, rolling completion caps, exact ownership, reservations, card
definition state, saved-deck/gameplay protection, and post-trade inventory
minimums before any ownership transfer commits.

Settlement never rewrites `player_cards.player_id`. Each outgoing ownership row
is consumed and a new recipient-owned row is created with
`acquisition_kind = 'trade'` and `source_trade_movement_id`. One immutable
`private.card_trade_settlement_receipts` row records the completed exchange and
the effective policy values. One immutable `private.card_trade_movements` row
per transferred copy snapshots the source copy identifier, definition,
acquisition kind, acquisition time, and original provenance, including
territory-owner-bonus provenance where present. The historical source owned-card
identifier is intentionally not a foreign key to the live ownership row.

A deferred constraint trigger requires every movement to create exactly one
matching recipient-owned copy. The one-receipt-per-trade and one-new-copy-per-
movement constraints make settlement replay safe. If any statement fails, the
transaction rolls back the receipt, movements, source deletions, grants,
acceptance that triggered settlement, and terminal transition together.

## Cross-feature locks

A selected trade copy is unavailable while it is referenced by any saved deck,
a pending asynchronous PvP invitation, an active CPU/asynchronous/live match,
another unfinished trade, or a concurrent authoritative ownership operation.
Completed match history does not lock the copy.

The inverse protections are also enforced:

- saved-deck creation/update locks selected ownership rows, then rejects any
  active trade reservation;
- battle-deck commitment locks its ownership rows, then rejects any active trade
  reservation before a match snapshot can be created;
- evolution locks candidate ownership rows, rechecks trade reservations after
  the lock, excludes reserved copies from the preview, and refuses to consume a
  reserved copy.

## Trust hold and deletion lifecycle

Migration `0055` adds the new `card_trade_hold` restriction scope under the
immutable `trust-v2` policy identifier. Existing `trust-v1` rows retain their
historical meaning. The current automated trust scoring implementation remains
on `trust-v1`; an authoring/governance workflow that creates a
`card_trade_hold` must create its case and reviewer decision consistently under
`trust-v2`. This limitation is intentional so `#275` does not silently migrate
or reinterpret open `trust-v1` cases.

An immediately effective `card_trade_hold` invalidates that player's open trade
offers and releases their reservations in the same database transaction as the
restriction insert. Trade operations also recheck currently effective holds.
The scope does not block collection browsing, ordinary deck management, CPU
play, or account deletion.

When a player changes from `active` to `deletion_pending`, a lifecycle trigger
invalidates every unfinished trade involving the player before live owned cards
are removed. Completed settlement receipts and movements remain against the
anonymous local player tombstone; no Player Name, Auth0 token, reauthentication
claim, email address, or precise location is copied into trade history.

## Retention and maintenance

`private.expire_card_trades(...)` closes open offers whose original deadline
has passed. `private.purge_terminal_card_trades(...)` may remove non-completed
terminal offer detail after 30 days. Completed trade versions, approvals,
settlement receipts, and movements are retained as immutable ownership
provenance and are excluded from this purge.

The persistence service exposes maintenance operations, but issue `#275` does
not add a new production scheduler because trading is not yet publicly
reachable. The trading API/runtime work must invoke expiry/retention maintenance
before the feature is enabled.

## Verification

`apps/api/tests/card-trading-persistence.integration.test.ts` applies the
repository through migration `0054`, seeds existing ownership and deck
references, then applies `0055`. It covers migration safety, conflicting
reservations, version-scoped acceptance, concurrent reservation attempts,
final-acceptance/cancellation serialization, saved-deck exclusion, exactly-once
settlement and provenance, transaction rollback after an injected grant failure,
committed expiry and reservation release, `trust-v2` trade-hold invalidation,
terminal immutability, and deletion-pending invalidation. The existing
card-catalogue integration suite also covers evolution preview/consumption while
an exact copy is reserved by a trade, and `player-battle-deck.test.ts` verifies
that a reservation blocks a new match commitment after ownership rows are
locked.

The focused non-database policy tests are in
`apps/api/tests/card-trade-policy.test.ts`. Existing deck, card-evolution,
match, trust, account-deletion, and migration suites remain regression coverage
for the shared boundaries changed by this migration.

The preceding document was generated with the assistance of:
ChatGPT-Web[GPT-5.6 Sol].
