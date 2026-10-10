---
title: 'Moderation and trust'
---

# Moderation and trust

Authors use **Player review** to investigate unusual activity and, where justified, apply a temporary restriction. The server's trust score prioritises cases for review. It does not prove cheating or apply restrictions automatically, even at the maximum score.

Content approval is a separate workflow: see [Review and publish content](../architecture/diagrams/content-review.md).

## Review a player

1. Open `/author/player-review`. Filter the queue by case status, review band, signal type, restriction state, or date.
2. Open a case and read its evidence, score breakdown, active restrictions, and decision history.
3. Compare the signal with its context. Repeated matches between friends or location errors can have legitimate explanations.
4. Choose a decision, record a reason, and submit it against the current case version.

Only authenticated, active Authors can review cases. An Author cannot make decisions about their own account. Player-facing responses do not disclose trust scores, detector details, evidence, or reviewer notes.

Evidence summaries show the signal's policy version, observation and expiry times, remaining contribution, and any false-positive adjustment. Opponent-pattern summaries include the relevant match counts and time window without exposing private match state.

Some older opponent-pattern records lack an explanatory summary. The server blocks review while such a record still contributes to the case. Expired or adjusted records do not block review; fresh explainable evidence can replace a contributing legacy record.

## Scores and signals

The current scoring policy is `trust-v1`. Its risk score ranges from 0 to 100 and measures review priority. It is separate from XP, league rating, reputation, and battle skill.

| Signal                        | Authoritative trigger                                                                                        | Base points |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------: |
| Impossible movement           | A server movement check returns `too_fast`; severity determines the weight                                   |    15 or 25 |
| Conflicting submission        | A reused idempotency key carries a different payload for the same mutation                                   |          10 |
| Repeated submission conflicts | At least 3 distinct conflicts within 24 hours                                                                |          10 |
| Opponent concentration        | Both players have at least 6 completed PvP matches in 30 days, with at least 80% against each other          |          20 |
| One-sided outcomes            | At least 4 matches in 7 days end with the same winner through resignation, turn timeout, or live abandonment |          10 |

Signals come from committed server operations and are deduplicated. Identical retries, ordinary stale-version errors, wrong challenge answers, and normal battle defeats do not create these signals. CPU battles and unstarted or cancelled matches do not contribute to opponent patterns.

Each signal's points decay linearly over 90 days, rounded down to a whole number. Category totals are capped at 50 for movement, 30 for submission conflicts, and 30 for opponent patterns. The final score is capped at 100. Marking a signal false positive removes its contribution from subsequent calculations while preserving the original evidence.

| Score  | Review band         |
| ------ | ------------------- |
| 0–24   | Normal; no new case |
| 25–49  | Observe             |
| 50–74  | Review required     |
| 75–100 | Urgent review       |

The server permits one open or under-review case per player. An untouched open case can resolve after 7 continuous days below 25, provided it has no active restriction. Cases already under human review remain for an Author to resolve. New signals can create a later case; old evidence does not reopen a resolved case.

## Reviewer decisions

| Decision                        | Effect                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Continue monitoring**         | Starts or continues human review without restricting activity           |
| **Mark signals false positive** | Adjusts the selected active signals and recalculates the score          |
| **Apply temporary restriction** | Adds one or more supported activity restrictions                        |
| **Dismiss case**                | Resolves a case already under review, provided no restriction is active |

For a newly opened case, start review before dismissing it. False-positive adjustments do not automatically end an existing restriction.

Every decision needs a reason of 1–1,000 characters. A false-positive decision also needs selected evidence. A restriction needs at least one scope and a duration from 1 to 168 hours. The confirmation view shows the proposed scopes, duration, and reason alongside the current restrictions.

The server records the decision, resulting case state, score, and restrictions atomically. Each submission includes `expectedVersion`; a stale version returns HTTP 409 and requires loading the current case. Previous decisions remain in the audit history.

## Temporary restrictions

The review console can apply these 3 scopes:

| Console label                        | Current enforcement                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Require online verification**      | Blocks new offline challenge packs; online verification remains available                                   |
| **Pause location reward challenges** | Blocks new reward-bearing challenge attempts and new offline packs                                          |
| **Pause new competitive matches**    | Blocks asynchronous invitation creation/acceptance and ranked queue entry, proposal acceptance, and pairing |

Restrictions begin at the committed decision time and expire using database time. Any extension needs a new reasoned decision; the original duration cannot exceed 7 days.

Existing attempts, issued offline packs, and started matches can finish. Restrictions do not cancel matches, prevent live reconnection, remove earned cards or points, or recalculate historical ratings. CPU battles, sign-in, account deletion, and collection/deck access remain available.

Gameplay denials use neutral messages. The shared activity error is `ACTIVITY_REVIEW_RESTRICTION`; ranked entry uses `RANKED_RESTRICTED`.

The trading service also supports a `card_trade_hold`. The current review console can display that scope but cannot create it. See [Trading](card-trading-policy.md) for its effect on offers and card locks.

## Appeals and audit access

Appeal persistence exists, but player submission and Author appeal-resolution routes and screens are not implemented. The console displays the stored appeal status. The [trust storage contract](../database/trust-persistence.md) defines the appeal window and independent-review requirements.

The Author API is rooted at `/api/v1/author/trust-cases`. It provides the queue, case detail, paginated evidence/restrictions/history, decisions, and a JSON export. Exports contain up to 100 records from each collection with totals and pagination metadata; they are not an unlimited dump of a case.

## Privacy and retention

Trust evidence retains derived categories and safe summaries. It does not copy precise coordinates, speed or distance, submitted answers, authentication tokens, hidden cards, or complete match state.

| Record                                                      | Retention                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Derived signals                                             | 90 days after observation                                               |
| Score snapshots                                             | 12 months after evaluation                                              |
| Closed case, evidence, decisions, restrictions, and appeals | 12 months after governance is finalised, including the appeal lifecycle |
| Unfinished cases after account deletion                     | 90 days after deletion completion                                       |

Open cases otherwise remain until resolution. Account deletion removes active signals and replaces retained account references with an opaque audit actor. Free-text reasons and appeal text are redacted at completion; retained restrictions have no active effect. A new registration does not inherit the deleted account's trust state.

See [Trust persistence](../database/trust-persistence.md) and [Account deletion and retention](../database/account-deletion-retention.md) for database rules and cleanup.

## AI declaration

This document was planned, generated, edited, and reviewed with assistance from Codex[GPT-5.6 Sol], ChatGPT-Web[GPT-5.6 Sol], and Codex[GPT-5]. The current rewrite and implementation review used Codex[GPT-6].
