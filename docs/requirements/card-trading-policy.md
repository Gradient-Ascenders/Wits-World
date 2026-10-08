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
4. The recipient opens the offer and uses **Edit your side** to select matching
   copies or propose changes. Confirm changes with **Publish new version**.
5. Both players review the current offer. If a rarity warning appears,
   review it and choose **Confirm warning**. Each player chooses **Accept offer**,
   completes the identity check, and confirms acceptance. The second acceptance
   completes the exchange.

Sending or editing an offer does not count as acceptance. Any new version clears
both players' previous acceptances and rarity-warning acknowledgements.

## Limits and consent

These are the current `card-trade-v1` policy defaults, enforced by the server:

| Rule                         | Limit                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Participants                 | Two distinct, active accounts, each at least 24 hours old                        |
| Cards given by each player   | 1–5 owned copies                                                                 |
| Open offers per player       | 5 across sent and received offers                                                |
| Completed trades per player  | 5 in a rolling 24-hour period                                                    |
| Offer lifetime               | 24 hours from original creation; revisions do not extend it                      |
| Collection after exchange    | At least 3 Creature copies and 2 Power copies per player                         |
| Identity proof at acceptance | Auth0 reauthentication no more than 5 minutes old, matching the signed-in player |

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

An offer remains **Open** while negotiating or awaiting approval. Both sides must
supply exact copies matching the requested cards before either can accept.

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

See [trading persistence](../database/card-trading-persistence.md) for API
idempotency and ownership records, [trust review](longitudinal-trust-policy.md)
for holds and appeals, and [account retention](../database/account-deletion-retention.md)
for deletion rules.

---

This page was prepared and reviewed with assistance from Codex[GPT-5.6 Sol],
ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-6].
