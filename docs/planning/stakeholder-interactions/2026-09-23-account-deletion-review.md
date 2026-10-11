---
title: 'Account deletion'
---

# Account deletion

**Planned review:** 23 September 2026 with Calvin Rea.
**Planned team:** Uzair Mahomed, Kevin Ebrahim, Tyron Van Tonder and Caleb Perumalsamy.

[All stakeholder reviews](index.md)

This is a review plan, not a completed meeting record. Implementation and
focused results were checked on **28 September 2026**; production deployment
and stakeholder acceptance were not established.

## Review topics and decisions

Deletion should remove account-owned data and allow a genuinely new registration
without restoring old cards, decks, rewards or ratings. Retain recent
reauthentication, explicit confirmation, immediate gameplay locking and safe
provider/local retries. Do not indiscriminately delete another player's history
or independently published Author content.

## Implementation evidence

[PR #329](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/329),
merged on **28 September**, delivered the controlled purge with migrations
0062/0063. This implementation date is later than the planned review date.

The completion transaction removes the player and owned progression, cards,
decks, rewards, ratings, CPU history and relevant standings. Shared history uses
a profile-free UUID without an old-identity mapping. Trust records retain bounded
expiry; expired snapshots remain purgeable. Minimal deletion receipts and bounded
old-token denial preserve safe completion without recreating the old account.
A later legitimate registration creates a new identity with default progress.

The independent re-review passed **3 database integration tests and 28 API tests**
for deletion, retries and restrictions. Database tests used a disposable target
and covered physical removal and expired/retained trust cleanup, not real Auth0
or production acceptance.

See the [player schema](../../database/player-schema.md) and
[trust boundaries](../../architecture/trust-boundaries.md).

## Follow-up

Tyron and Uzair confirm deletion and absent old progress; Tyron demonstrates
retryable failure. Kevin and Caleb verify fresh registration, while Uzair and
Caleb check the opponent's retained history. Uzair records stakeholder outcomes.

Use a dedicated test account and exclude credentials, tokens and personal
details from evidence. Backup, export and external-log retention need their own
operational policy.

## AI declaration

Prepared and edited with assistance from Codex-CLI[gpt-6-sol] and Codex[GPT-6].
The team supplied the date/topic; results retain the 28 September review context.
No application or provider checks were rerun for this rewrite.
