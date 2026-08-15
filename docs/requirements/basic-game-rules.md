# Wits Quest Basic Game Rules

## Purpose

This document consolidates the approved player-visible and server-authoritative
rules for the Wits Quest Basic tier. It is an implementation input, not an
implementation. The status and evidence for each rule are maintained in the
[Basic-tier decision register](basic-tier-decision-register.md).

No browser may submit or calculate an authoritative identity, eligibility,
correctness, score, reward, deck validity, legal battle action, battle outcome,
or ownership result.

## Roles, authority, and account lifecycle

### Roles and authoring

- Basic has only two roles: Player and Author. There is no separate
  Administrator role in Basic.
- New accounts receive the Player role. Author assignment and revocation happen
  out-of-band through the database or deployment process; no browser or API
  operation may grant or change roles.
- Authors may create, edit, publish, retire, and manage all Basic content,
  including content created by other Authors.
- Players cannot access author endpoints, accepted answers, or unpublished
  content.
- Author create, edit, publish, and retire actions record the acting Author and
  timestamp in the audit trail. In-app role management and advanced
  administration are deferred beyond Basic.

### Account deletion and re-registration

- Deletion requires recent authentication and explicit permanent-deletion
  confirmation. Access locks immediately; Basic has no deletion grace period.
- The Auth0 account is permanently deleted. The local record remains only as an
  anonymised tombstone such as `Deleted player`; the Auth0 subject, name, email,
  and other identifying data are removed.
- Player-owned cards, decks, active-deck selection, coin balance, and starter
  selection are permanently deleted.
- Completed challenges, reward records, coin transactions, matches, and
  anonymous final results are retained for integrity and aggregate statistics.
  Individual answers and answer snapshots are deleted. Anonymous gameplay
  history is retained indefinitely unless a later formal retention rule is
  established.
- Published events, questions, and cards remain available. Authored-content
  ownership transfers to a system-owned account, and `Deleted author` is shown
  where needed.
- Auth0 or database cleanup failures trigger idempotent automatic retry and an
  operational alert while the account remains locked. The workflow is marked
  pending until cleanup completes.
- A person may register again as a completely new player with no previous
  progress, cards, coins, or decks.
- A minimal deletion audit record is retained for `12 months` and contains only
  a random deletion ID, request/completion timestamps, status, and applicable
  failure reason. It contains no email, Auth0 subject, name, location, or other
  identifying data.

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
- Marking is server-authoritative. During an active timed attempt, the API does
  not reveal correctness or answer keys. After authoritative completion, it
  returns the final score and reward outcome plus five ordered review entries
  containing the player's locked answer (or `null` after timeout), the correct
  answer, and server-derived correctness. The current content model has no
  explanation field.
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

### Attributes, moves, effects, and type modifiers

- HP and Creature Power are set per card during catalogue authoring. There are
  no fixed rarity-wide stat ranges.
- Move types are Basic, Wit, Grit, Spark, Spirit, and Mystic.
- Effect types are Damage, Debuff, Heal, and Buff. Damage and Debuff target the
  opponent; Heal and Buff target the user's active Creature.
- `effectValue` is optional and represents the magnitude of a Damage, Debuff,
  Heal, or Buff effect.
- A battle-ready Buff or Debuff declares a modifier target (`hp`, `power`, or
  `damage_multiplier`) and operation (`add` or `multiply`). HP and Power
  modifiers apply immediately and are clamped to the Creature's valid range.
- Damage-strength modifiers use `effectValue` as a percentage, apply to future
  Damage effects, and may define `durationTurns`. A duration counts the
  affected Creature's subsequent turns; an omitted duration lasts for the rest
  of the match.
- Multiple damage modifiers are multiplied together. Base Damage, the type
  multiplier, and active damage modifiers are multiplied and floored once at
  the end. Damage cannot become negative.
- Effects are applied in their authored order. An effect that lacks the data
  required to execute is invalid catalogue data and cannot be used in a battle.
- The target/operation/percentage/duration contract is the explicit
  BASIC-09/#74 amendment recorded in [issue #74 comment 4832](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/74#issuecomment-4832).
- `power` is the resource cost consumed from the Creature's remaining Power.
  A move is legal only when the Creature has enough remaining Power.
- Only Damage is affected by type advantage or disadvantage. The type cycle is
  Wit -> Grit -> Spark -> Spirit -> Mystic -> Wit. Advantage is `1.5x`,
  disadvantage is `0.75x`, and unrelated matchups use `1.0x`.
- Power cards also have one of the five types. Per-card HP, Power, damage,
  healing, buff, and debuff values are decided during authoring. Catalogue
  validation enforces data types and allowed enum values.

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
- A deck's five cards may total no more than ten points. Common cards cost `1`
  point, Rare cards `2`, Epic cards `3`, and Legendary cards `4`; the fixed
  rarity value applies equally to Creature and Power cards.
- A player may reuse one owned copy across multiple saved decks.
- Two copies of a definition in the same deck require two separately owned
  copies.
- The API validates ownership and final deck validity.
- A match snapshots its deck and card values; later deck or catalogue edits do
  not alter active or completed matches.

The API validates the point total using the server-authoritative card rarity;
the client may present the same values but must not decide deck validity.

## CPU battles

The Basic release uses a move-based, server-authoritative CPU match and private
completed-match history. It does not use direct attribute comparison.

- The server flips a coin to choose the first player.
- Player and CPU actions use the same legal-action rules. A turn allows either
  one legal Creature move or one Power card.
- A Power card may be played only while an active Creature is on the board. It
  is discarded immediately after use, cannot be reused during that battle, and
  may define multiple authored effects.
- The PvP turn timer is `1 minute`; the CPU match turn timer is `1.5 minutes`.
  The shared rule remains configurable.
- If the timer expires without a selected move or action, the turn ends without
  an action.
- The CPU selects randomly from legal actions using server-side randomness.
  Difficulty levels and machine-learning behaviour are deferred.
- Ties are not possible in the current move-based system.
- A defeated Creature cannot return. Replacement is mandatory, does not consume
  the replacement player's normal turn, and voluntary switching is not allowed.
- A player loses when all of their Creatures are defeated.
- The browser submits only an intended action identifier, such as a move ID or
  Power-card ID. It never submits damage, HP, Power, effects, multipliers,
  random results, round outcomes, winner, or completion status. The server loads
  card definitions, calculates effects, performs required randomness, and
  resolves the authoritative outcome.

The pure implementation lives in `packages/game-rules`. It accepts validated
card/deck snapshots, returns a new battle state for every legal action, and
receives randomness through an injected integer source. Match persistence and
HTTP coordination remain API responsibilities.

## Basic exclusions

The following are not Basic game rules: PvP, matchmaking, ratings, spectators,
trading, selling, evolution, rarity upgrades, offline play, movement tracking,
anti-cheat trust scoring, territory control, seasons, advanced analytics, or an
advanced author review workflow.

This document was planned, generated, and edited with the assistance of
Codex-CLI[gpt-5.6-sol medium] and Codex[GPT-5].
