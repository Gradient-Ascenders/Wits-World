---
title: 'Card trading and anti-drain policy'
---

# Card trading and anti-drain policy

## Status and boundary

This is the approved issue `#273` policy for Advanced-tier, bilateral card
trading. Issue `#275` now provides the private persistence and service boundary
for versioned offers, exact-copy reservations, atomic exchanges, and history.
Issue `#272` now exposes the authenticated bilateral trading API; issue `#274`
now provides the focused, mobile-first player trading experience beneath
Collection. The
existing [card evolution](card-evolution-rules.md),
[saved-deck rules](basic-game-rules.md#saved-decks),
[account-deletion boundary](../database/account-deletion-retention.md), and
[trust review policy](longitudinal-trust-policy.md) remain authoritative across
those integrations.

Trading is card-for-card only. There is no gift, currency payment, marketplace,
real-money transaction, or multi-party exchange in this version. The server
decides eligibility, ownership, copy locks, offer version, deadline, limits,
rarity totals, and settlement. A browser submits only player intent and exact
owned-copy identifiers for its **own** side.

## Identity and eligible cards

Both participants must be distinct, active local players whose accounts are at
least 24 hours old according to the server-owned `players.created_at`. A fresh
registration after deletion is a new account and starts that age again. Reuse
the asynchronous PvP contract's exact Player Name lookup: it is not a public
player directory, and a browser cannot select an internal player UUID or read
another player's collection. Missing, self, deleted, deletion-pending, and
otherwise unavailable targets receive the same safe unavailable outcome.

Each side gives at least one and at most five exact owned copies. Starter,
event-reward, and evolved copies are all eligible in principle; source and
rarity do not silently ban a card from trading. A definition must still be
active and the copy must remain owned and unprotected at settlement. After the
**whole** exchange, each player's collection must still contain at least three
Creature copies and two Power copies. This is an inventory minimum, not a
promise that the remaining cards form a valid ten-point saved deck.

An owned copy cannot be selected or transferred while it is:

- referenced by any saved deck, including the active selection;
- snapshotted into a pending asynchronous PvP invitation or an active CPU,
  asynchronous PvP, or live PvP match;
- reserved by another unfinished trade; or
- being consumed by a concurrent evolution or other authoritative ownership
  transaction.

Completed match history does not permanently lock a copy. During a trade, a
reservation prevents using that exact copy in a saved deck, match commitment,
another offer, or evolution. Evolution must ignore reserved copies when it
chooses its three source copies. Reservation and the conflicting operation
must use the same database locking or constraint boundary; a UI-only lock is
insufficient. The future ranked queue and proposal flow must also revalidate
its selected deck before match creation, rather than assuming a prior queue
check authorizes a card transfer.

## Offer and counter workflow

An offer is directed to one player. The sender selects only their own exact
copies and names the wanted **card definitions and quantities**, not copies in
the recipient's private collection. The recipient selects their own exact
copies matching that request. A counter may change the countering player's
selected copies or requested definitions and quantities; the other player
must supply or confirm their own side. Neither participant may nominate an
owned-copy identifier belonging to the other.

The server keeps one current immutable offer version. Every counter or item
change creates the next version, releases reservations for removed copies,
reserves newly selected copies, and clears **both** prior acceptances and any
imbalance acknowledgments. A version is complete only when both exact-copy
lists exist, are nonempty, and satisfy the stated requested definitions and
quantities. An incomplete version cannot be accepted. Creating the offer
does not count as sender acceptance: both players must explicitly accept the
same complete version.

The offer is `open` while being negotiated or awaiting either acceptance.
`countered` and `accepted_by_one` are version events, not terminal offer
states. Its terminal states are:

| State         | Cause                                                        |
| ------------- | ------------------------------------------------------------ |
| `completed`   | Both approvals and the atomic exchange commit                |
| `declined`    | The recipient rejects the open offer                         |
| `cancelled`   | The sender withdraws the open offer                          |
| `expired`     | Its original 24-hour server deadline passes                  |
| `invalidated` | Account deletion, a trade hold, or a protected-copy conflict |

The sender may cancel and the recipient may decline before completion. Neither
can change a terminal offer. An offer expires 24 hours after its original
creation; counters, status reads, and retries never extend that deadline.
Expiry and every other terminal transition release its reservations. Each
player may participate in at most five open offers across sent and received
offers. The API checks that limit for both participants when an offer is
created and again under lock when necessary.

## Consent and anti-drain limits

At **each** acceptance, the player supplies the same separately validated
Auth0 reauthentication proof used for account deletion. Its `auth_time` must
be no more than five minutes old, and its subject must match the authenticated
API identity. A valid acceptance remains recorded even if the other player
accepts later; a new offer version clears it. Tokens and raw proof claims are
never stored in trade history. A retry of the same acceptance is idempotent.

Each player may complete at most five trades in a rolling 24-hour period,
counting both sent and received trades. The server counts committed outcomes,
not offer creations or failed attempts, and enforces the cap in the same
serialized settlement transaction so concurrent acceptances cannot exceed it.
Account age, pending-offer count, per-side copy count, completed-trade count,
offer lifetime, and the warning threshold are server-configurable policy
values with the defaults above. Current age, count, and per-side limits are
rechecked at each action and settlement. A pending offer that no longer meets
them is invalidated and releases its reservations; its original expiry is
never extended or recalculated. A change never rewrites completed history.
Every completed receipt records the effective policy version and limits for
audit.

The server computes each side's total using the existing rarity points:
Common `1`, Rare `2`, Epic `3`, Legendary `4`. The totals are **not** a price
or guarantee of equivalent value. If their absolute difference exceeds two
points, both players see the server-calculated totals and must separately
acknowledge the imbalance for that exact offer version before acceptance.
The mismatch is a warning, not a rejection: for example, one Common for one
Legendary remains possible after both acknowledgments and recent
reauthentication. The browser cannot submit authoritative totals or suppress
the warning.

An Author may apply a separate `card_trade_hold` through the existing
human-reviewed trust-case and appeal process. It follows the existing maximum
seven-day duration, expiry, renewal, reviewer self-review ban, and neutral
player response. It is **not** an alias for `new_competitive_match_hold` and
must not block collection browsing, deck management, CPU play, or account
deletion. When a hold begins, the server atomically invalidates that player's
open offers and releases their reservations. The hold prevents creating,
countering, or accepting further offers but never reverses a completed trade.
Migration `0055_persist_versioned_card_trades.sql` adds this scope under a new
immutable `trust-v2` policy identifier and leaves existing `trust-v1` decisions
unchanged. The automated trust-scoring runtime still evaluates `trust-v1`; any
review workflow that authors `card_trade_hold` must therefore create the case,
decision, and restriction consistently under `trust-v2` before the public
trading API is enabled.

## Atomic settlement and history

The second acceptance settles the offer in one transaction. The server locks
the offer and both players and selected copies in stable order, then rechecks
the current version, both approvals, deadline, accounts, age, trade holds,
daily caps, ownership, reservations, saved decks, pending/active gameplay,
active definitions, per-side limits, and each post-trade collection minimum.
An invalid item aborts the **entire** exchange. A concurrent cancel, expiry,
counter, evolution, or acceptance can commit first, but the losing operation
must return the persisted safe state without moving a partial set of cards.

The current `player_cards` acquisition foreign keys tie an owned copy to its
original owner and reward or evolution. Do not simply update its `player_id`.
The persistence implementation must consume the exact outgoing ownership
rows, create new recipient-owned copy identifiers with a trade acquisition
source, and keep an immutable receipt mapping every source copy and its
definition to the new copy. The receipt must preserve provenance without
claiming that the recipient earned the original player's event reward.
Historical source-copy identifiers in the receipt are snapshots, not foreign
keys that prevent account deletion from removing live `player_cards` rows.
Completed offers, approval versions, copy movements, and settlement receipts
are immutable. A repeated completion returns the same receipt and cannot
create a second set of recipient cards.

Only participants may inspect an open or completed offer. There is no public
trade feed, opponent collection lookup, email, Auth0 identity, location,
hidden deck, or trust-score disclosure. Safe errors distinguish stale version,
expired offer, copy conflict, and player limit where useful, but do not reveal
an unavailable target or another player's protected state. Logs exclude
tokens, selected card lists, and unnecessary player identifiers.

Entering `deletion_pending` must first invalidate the player's open offers
and release reservations in the account-deletion transaction. The owned cards
are then deleted under the existing account policy. Minimal completed trade
receipts and copy provenance remain against profile-free historical actor keys for
integrity; player-facing history resolves the current safe Player Name and
shows `Deleted player` after deletion. It never stores an old Player Name
snapshot. Minimal completed receipts are retained as anonymous gameplay
history under the existing indefinite retention rule. Declined, cancelled,
expired, and invalidated offer details are purged after 30 days; their
temporary retention is not a reason to retain precise identity or
reauthentication proof.

## Downstream acceptance examples

- A version accepted by player A becomes unaccepted by both when player B
  counters; A's old approval cannot complete the new version.
- A player with four Creatures and two Power cards may give one Creature for
  one Power card if the other player also retains at least three Creatures and
  two Power cards after the exchange. A player left with only two Creatures
  cannot complete it, even if their side was already accepted.
- A copy reserved in one open offer cannot enter a saved deck, another offer,
  an evolution, or a new match commitment. A cancel or expiry releases it.
- Simultaneous final acceptance, cancel, expiry, and account deletion produce
  exactly one terminal outcome and never a one-sided transfer.
- A trade hold cancels open offers but preserves earlier completed receipts;
  casual PvP or account browsing remains available.

Issue `#275` adds focused persistence coverage for migration safety,
reservation conflicts, version-scoped approvals, replay, rollback, deletion
cleanup, terminal immutability, and atomic copy movement. Those tests remain
execution evidence only when they are actually run. Issue `#272` adds the authenticated HTTP boundary, durable command idempotency,
recent-authentication enforcement, participant-only list/read operations, and
production expiry/retention scheduling. Its focused tests cover those API
boundaries; database execution evidence is recorded only when the suites are
actually run. Issue `#274` shows both sides' exact selected cards, warnings,
expiry, version changes, and terminal outcomes without exposing an opponent's
collection. Its editor consumes the authenticated player-safe catalogue and
non-reserving selection preview, while create, revision, consent, and settlement
remain server-authoritative.

## AI declaration

This policy was drafted and reviewed with assistance from Codex[GPT-5.6 Sol] and
ChatGPT-Web[GPT-5.6 Sol].

This account-deletion update was edited with assistance from Codex[GPT-6].
