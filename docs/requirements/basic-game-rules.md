# Wits Quest Basic Game Rules

## Purpose

This document consolidates the approved player-visible and server-authoritative
rules for the Wits Quest Basic tier. It is an implementation input, not an
implementation. The status and evidence for each rule are maintained in the
[Basic-tier decision register](basic-tier-decision-register.md).

No browser may submit or calculate an authoritative identity, eligibility,
correctness, score, reward, deck validity, legal battle action, battle outcome,
or ownership result.

## Event challenge

### Start and resume

- A player may start the event's published challenge only after a fresh,
  API-evaluated reachable location claim while the event is active.
- Each player has one attempt and one completion per event.
- A repeated start while the attempt is in progress returns the same attempt,
  including its selected questions, shuffled choices, locked answers, and
  original deadline.
- Refreshing or reconnecting does not restart the timer.
- An attempt started while the event is active keeps its full deadline even if
  the event closes during the attempt.
- A completed or timed-out attempt cannot be replayed in Basic.

### Questions and timing

- The format is a timed multiple-choice quiz.
- The server selects exactly five distinct questions.
- Each question has four preset choices and exactly one private accepted choice.
- Difficulty is an integer from `1` through `3`.
- Choice order is shuffled once and persisted for the attempt.
- The average difficulty selects the time limit:

| Average difficulty   |  Time limit |
| -------------------- | ----------: |
| `<= 1.5`             |  90 seconds |
| `> 1.5` and `<= 2.5` | 120 seconds |
| `> 2.5`              | 150 seconds |

### Answers, expiry, and feedback

- The API locks an answer when it accepts it.
- Repeating the same answer is idempotent; submitting a different choice for an
  answered question is rejected.
- Server receipt time decides whether an answer met the deadline.
- At expiry, unanswered questions count as incorrect and the attempt completes.
- On completion, the API returns only the final number correct (`0`-`5`) and the
  reward outcome. It does not reveal per-question correctness, the player's
  accepted choices, correct answers, or explanations. The 2026-08-13 product
  decision recorded as `BASIC-03` supersedes the conflicting feedback wording in
  issues #66 and #68.
- Scores from zero through five are completed attempts. A low score does not
  create another attempt.

## Rewards

Coins are selected deterministically within the score band using the attempt's
average difficulty:

```text
coins = min + round(((averageDifficulty - 1) / 2) * (max - min))
```

| Correct | Coin band | Card award                     |
| ------: | --------: | ------------------------------ |
|       0 |         0 | None                           |
|       1 |     10-20 | None                           |
|       2 |     20-30 | None                           |
|       3 |     30-40 | One guaranteed Common          |
|       4 |     40-50 | One card: 75% Common, 25% Rare |
|       5 |     50-75 | 80% one card, 20% two cards    |

Each card for a five-correct reward independently rolls 45% Common, 40% Rare,
14% Epic, and 1% Legendary. After rarity selection, the server selects uniformly
from active Creature and Power definitions in that rarity. Affinity and category
are not separately weighted.

If a positive-probability rarity has no active definition, the server
redistributes its probability proportionally over the available
positive-probability rarities. A guaranteed Common reward requires an active
Common definition. Completion, the coin credit, card awards, owned copies, and
the persisted result commit atomically; a retry returns the same result instead
of rerolling.

## Cards and ownership

- Categories: Creature and Power.
- Affinities: Wit, Grit, Spark, Spirit, and Mystic.
- Rarities: Common, Rare, Epic, and Legendary.
- Every awarded duplicate is a separate owned copy.
- The catalogue is server-managed data; React artwork or display metadata never
  defines gameplay values.
- The valid HP, power, move/effect, type-cycle, and modifier values are blocked
  pending `BASIC-09` in the decision register.

## Starter grant

- The player selects one starter affinity once.
- The server grants five distinct Common cards of that affinity: three Creature
  cards and two Power cards.
- The transaction and uniqueness rules prevent repeated or concurrent starter
  requests from issuing another starter set.
- The catalogue must contain enough qualifying active definitions before an
  affinity can be offered.

## Saved decks

- A deck contains five owned copies: three Creature and two Power cards.
- The deck has a ten-point rarity cap.
- A player may reuse one owned copy across multiple saved decks.
- Two copies of a definition in the same deck require two separately owned
  copies.
- The API validates ownership and final deck validity.
- A match snapshots its deck and card values; later deck or catalogue edits do
  not alter active or completed matches.

The point value for each rarity remains blocked by `BASIC-08`. A client may show
the cap, but neither client nor server implementation may guess those values.

## CPU battles

The Basic release requires a deterministic, server-authoritative CPU match and
private completed-match history. However, battle mechanics are not yet approved.
The following must be decided together before implementation:

- attribute comparison versus creature moves;
- affinity advantage order and modifier values;
- initial creature and first-player selection;
- legal player and CPU actions;
- Power-card timing, targets, effects, and discard behavior;
- ties and timeouts;
- defeat, replacement, and inability-to-replace behavior;
- CPU action policy and the injected randomness boundary; and
- win, loss, draw, and termination conditions.

Issue #74 and dependent match work must remain blocked rather than choosing
defaults for these rules.

## Basic exclusions

The following are not Basic game rules: PvP, matchmaking, ratings, spectators,
trading, selling, evolution, rarity upgrades, offline play, movement tracking,
anti-cheat trust scoring, territory control, seasons, advanced analytics, or an
advanced author review workflow.

This document was planned, generated, and edited with the assistance of
Codex-CLI[GPT-5].
