---
title: 'Trading cards'
description: Make and review card offers, understand copy protections, and confirm an exchange.
---

# Trading cards

Trading exchanges cards between two players. Each participant chooses their
own copies; the other player's collection stays private. Trades cannot include
gifts, currency, or real-money payments.

## Player journey

1. Open **Trades** at `/collection/trades` and choose **Start a trade**.
2. Enter the recipient's exact **Player Name** and choose **Choose cards**.
3. Select copies you will give, then request card names and quantities from the
   catalogue. Choose **Review offer**, check both sides, and confirm **Send offer**.
4. The recipient chooses **Accept**, **Counter**, or **Decline**. Accept opens a
   confirmation popup; confirming exchanges the cards in one transaction using
   the existing signed-in session.
5. **Counter** opens the editor with the offered and requested cards already in
   the middle. Adjust the proposal, choose **Counter**, then confirm **Send counter**.
   The new version is sent directly to the other player to accept or counter.

Confirming Send offer or Send counter approves that proposal and acknowledges
its displayed rarity warning. Countering clears the other player's earlier
approval. Accepting the current proposal confirms the other player's consent;
it does not require an additional login, password, or identity-verification step.
The server still enforces account eligibility, card availability and all limits.

## Limits and consent

These are the current `card-trade-v1` policy defaults, enforced by the server:

| Rule                        | Limit                                                       |
| --------------------------- | ----------------------------------------------------------- |
| Participants                | Two distinct, active accounts, each at least 24 hours old   |
| Cards given by each player  | 1–5 owned copies                                            |
| Open offers per player      | 5 across sent and received offers                           |
| Completed trades per player | 5 in a rolling 24-hour period                               |
| Offer lifetime              | 24 hours from original creation; revisions do not extend it |
| Collection after exchange   | At least 3 Creature copies and 2 Power copies per player    |
| Identity at acceptance      | Existing authenticated, active player session               |

The collection minimum does not guarantee a legal ten-point deck. A new account
created after deletion starts the account-age requirement again.

Rarity totals use Common **1**, Rare **2**, Epic **3**, and Legendary **4** points.
A difference greater than **2 points** requires both players to acknowledge the
warning for that version. These totals describe rarity, not a price or equal
value; an uneven exchange can proceed with both acknowledgements and approvals.

## Eligible and protected copies

Starter, reward, evolved, and previously traded copies can be exchanged if still
owned and their definitions are active and published. A copy is unavailable when
it belongs to any saved deck, a pending asynchronous PvP invitation, an active
CPU/asynchronous/live battle, or another open trade. Completed battle history
does not lock it.

Selected copies are reserved while the offer is open. They cannot enter another
trade, a saved deck, a new battle commitment, or an evolution. Remove deck copies
from every saved deck, finish relevant gameplay, or close the reserving offer
before trying to use them elsewhere.

## Offer outcomes

An offer remains **Open** while negotiating or awaiting approval. The proposer selects exact own copies and requests definitions and quantities.
At acceptance, the server selects matching available copies from the accepting
player’s collection, locks them, and rechecks protections before settlement.

| Outcome     | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| Completed   | Both accepted the same version and the exchange committed.       |
| Declined    | The recipient chose **Decline offer**.                           |
| Cancelled   | The sender chose **Cancel offer**.                               |
| Expired     | The original deadline passed.                                    |
| Invalidated | A participant or the exchange no longer met server requirements. |

Closed offers release reservations and cannot be edited or reopened. Account
deletion and an effective trading hold invalidate open offers. A trading hold
blocks new offers, revisions, and acceptance while preserving collection
browsing, deck management, CPU play, and account deletion. Completed exchanges
are not reversed by a later hold.

## How it works

The server rechecks the version, approvals, deadline, participant eligibility,
limits, ownership, and copy protections before settlement. All card movements
commit in one transaction; a failed check prevents the entire exchange.
Idempotent retries cannot transfer the cards twice.

Only participants can read an offer or its history. Completed receipts retain
profile-free ownership provenance indefinitely; other closed-offer details are
purged after 30 days. History displays **Deleted player** after account deletion.

See the [Trading API](../architecture/card-trading-api-contract.md) for requests
and retries, [trading persistence](../database/card-trading-persistence.md) for
ownership records, [trust review](longitudinal-trust-policy.md)
for holds and appeals, and [account retention](../database/account-deletion-retention.md)
for deletion rules.

---

This page was prepared and reviewed with assistance from Codex[GPT-5.6 Sol],
ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-6].
