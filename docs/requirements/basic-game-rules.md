---
title: 'Basic game rules'
description: Current rules for event challenges, card rewards, starters, decks, CPU battles, and content publication.
---

# Basic game rules

The Basic gameplay loop is **explore → complete a challenge → collect cards →
build a deck → battle the CPU**. This page describes the current core rules and
identifies the features added beyond Basic.

The API and database determine eligibility, correctness, rewards, ownership,
deck legality, and battle outcomes. The browser displays state and submits
player actions. Dated release evidence is tracked in the
[Sprint 2](../planning/scrum/sprint-2/evidence.md) and
[Sprint 3](../planning/scrum/sprint-3/evidence.md) records.

## Event challenge

### Eligibility

A new attempt requires an active player, a published event within its
availability period, and a location claim accepted by the API.

The current location policy requires:

- A reported point within the event's stored radius, including its boundary.
- Reported accuracy no greater than `min(150 metres, 2 × event radius)`.
- An acquisition timestamp no more than 120 seconds old and not in the future.
- Acceptance of the applicable movement-plausibility and gameplay-access checks.

PostGIS calculates distance. Event availability uses
`starts_at <= now < ends_at`. The map does not decide eligibility, and accepted
coordinates remain device-reported claims rather than proof of physical presence.
The 120-second freshness limit is provisional. See
[event eligibility](../database/event-eligibility.md) for the complete policy.

### Start and resume

Each player has one attempt per event. Starting an event again returns its
existing attempt rather than creating another one. The selected questions,
shuffled options, accepted answers, and original deadline are preserved.

Refreshing or reconnecting does not restart the timer. An attempt started
while the event is available keeps its original deadline even if the event
closes. Completed and timed-out attempts cannot be replayed.

### Questions and timing

A Basic attempt contains **five distinct multiple-choice questions**, selected
by the server from at least five published questions. Each question has four
choices, one accepted answer, and an integer difficulty from 1 to 3. Question
selection and option order are saved for the attempt.

The average difficulty determines the time limit:

| Average difficulty   |  Time limit |
| -------------------- | ----------: |
| At most 1.5          |  90 seconds |
| Above 1.5, up to 2.5 | 120 seconds |
| Above 2.5            | 150 seconds |

Ordering questions are an implemented extension beyond Basic. They use four
items whose complete submitted order is marked by the server. See the
[challenge contract](../architecture/challenge-attempt-api-contract.md).

### Answers, expiry, and feedback

An accepted answer is locked. Repeating it is idempotent; replacing it with a
different answer is rejected. Server receipt time determines whether an answer
is on time: it must arrive **before** the deadline. An answer received exactly
at the deadline is late.

The attempt completes after all five answers are accepted or when expiry is
resolved. Unanswered questions count as incorrect. A low score does not grant
another attempt.

During an active attempt, the API withholds correct answers, correctness,
score, and reward outcomes. After completion, it returns the final score,
rewards, and five ordered review entries showing the player's answer, the
correct answer, and correctness. Unanswered entries have no player answer.
Multiple-choice review omits explanations; ordering review includes its saved
explanation. Private answer-key IDs are never returned.

## Rewards

### Card rewards

| Correct answers | Card award                                      |
| --------------: | ----------------------------------------------- |
|             0–2 | None                                            |
|               3 | One guaranteed Common card                      |
|               4 | One card: 75% Common, 25% Rare                  |
|               5 | 80% chance of one card; 20% chance of two cards |

For a perfect score, each awarded card independently uses these rarity weights:

| Rarity    | Probability |
| --------- | ----------: |
| Common    |         45% |
| Rare      |         40% |
| Epic      |         14% |
| Legendary |          1% |

After selecting rarity, the server selects uniformly from active, published,
**reward-eligible** definitions in that rarity. The ordinary reward pool
contains non-evolved Creatures and Power cards. Evolved definitions are acquired
through their evolution recipes. Affinity and category are not separately weighted.

If a weighted rarity has no eligible definitions, its probability is
redistributed proportionally across the available weighted rarities. A
three-correct reward still requires an eligible Common definition.

Completion, card awards, owned copies, progression, and the saved result commit
in one transaction. Retrying returns the persisted result without rerolling
or issuing duplicate rewards.

### Progression points

The current application awards **10 permanent points per correct challenge
answer**, from 0 to 50. A CPU victory awards 25 points; a CPU loss awards none.
These are progression points, separate from deck rarity costs. They cannot be
spent. There is no active coin wallet, card shop, or card-selling economy.

Points, achievements, streaks, and standings were added beyond Basic. Their
complete rules are in [Player progression](player-progression-rules.md).

## Cards and ownership

The ordinary catalogue contains **30 definitions: 24 Creatures and six Power
cards**. Creatures have one of five affinities: Wit, Grit, Spark, Spirit, or
Mystic. The current Power cards are typeless. Both categories use Common,
Rare, Epic, and Legendary rarities.

A definition describes a card; an owned copy identifies a player's individual
card. Duplicate awards create separate owned copies. Server-managed definitions
supply gameplay values; artwork and browser metadata do not.

### Attributes, moves, effects, and type modifiers

HP and maximum Creature Power are authored per definition, with no fixed
rarity-wide stat ranges. Every published Creature has four ordered moves.
Each move is Basic or matches its Creature's affinity.

A move consumes its authored Power cost and is legal only when the active
Creature has enough remaining Power and satisfies any additional move
conditions. Stun prevents Creature moves; Power-card and swap availability
remain governed by the engine's legal actions.

Moves and Power cards resolve effects in their authored order. Supported
effects include damage, healing, Power changes, damage modifiers, Poison,
Stun, Dodge, Reflect, Lifesteal, Power restoration, self-damage, and
HP-percentage swaps. HP and Power changes stay within the valid card ranges.

Duration-based modifiers count affected active-Creature turns. Charge-based
modifiers are consumed by matching actions. Compatible damage multipliers are
combined, with damage floored after the calculation and never below zero.
Affinity modifies damage only; it does not modify healing or Power restoration.

The [complete card catalogue](../design/basic-card-roster.md) records individual
stats, costs, conditions, and effect behaviour.

### Damage matchup table

Rows show the attacking move's type; columns show the defending Creature's
affinity. Basic moves and explicitly neutral Power-card damage use `1×`.

| Attacker / Defender | Wit   | Grit  | Spark | Spirit | Mystic |
| ------------------- | ----- | ----- | ----- | ------ | ------ |
| Wit                 | 1×    | 1.5×  | 0.75× | 1×     | 1×     |
| Grit                | 0.75× | 1×    | 1.5×  | 0.75×  | 1.5×   |
| Spark               | 1.5×  | 0.75× | 1×    | 1.5×   | 0.75×  |
| Spirit              | 1×    | 1.5×  | 0.75× | 1×     | 1.5×   |
| Mystic              | 1×    | 0.75× | 1.5×  | 1.5×   | 1×     |

Wit, Grit, and Spark form an advantage cycle. Wit is neutral against Spirit and
Mystic. Spirit and Mystic both have advantage against each other.

New matches store `affinityRulesVersion: 2`. Historical states without that
field retain the original version 1 cycle. Saved match rules and results are
not rewritten. Battle-serving API instances must support the stored version;
rollback also requires a version-aware binary.

## Starter grant

A player chooses **Wit, Grit, or Spark** once. The server grants:

- Three distinct Common Creatures of the chosen affinity.
- The shared Common Power cards **Field Kit** and **Reserve Focus**.

The grant is transactional and cannot be repeated to obtain another set.
Historical Spirit and Mystic starter grants remain readable, but those
choices are not offered to new players.

## Saved decks

A legal deck contains **five distinct owned copies**:

- Three Creature cards.
- Two Power cards.
- A combined rarity cost of at most 10 points.

| Rarity    | Cost per card |
| --------- | ------------: |
| Common    |             1 |
| Rare      |             2 |
| Epic      |             3 |
| Legendary |             4 |

The same owned copy may appear in multiple saved decks, but only once in any
one deck. Using the same definition twice in a deck requires two owned copies.
The API validates ownership, composition, and rarity cost.

Players select a saved deck for battle. Each match snapshots its cards and
values, so later deck or catalogue changes do not alter that match. See the
[collection and deck journey](player-deck-building-journey.md).

## CPU battles

### Setup and legal actions

A player may have only one active CPU match. They can resume it or forfeit it
before starting another. Both sides select an initial Creature, then the server
randomly chooses who goes first.

The configured CPU deck contains Quillip, Voltiki, Karrik, Field Kit, and
Reserve Focus. The CPU uses the same battle engine and legality checks as the
player. It randomly selects legal moves or Power cards and selects Creatures
when required; it does not choose voluntary swaps.

During a normal turn, the player may take one legal action:

| Action              | Consequence                                                        |
| ------------------- | ------------------------------------------------------------------ |
| Use a Creature move | Pay its Power cost and resolve its effects.                        |
| Play a Power card   | Resolve its effects and discard it for the remainder of the match. |
| Swap Creature       | Switch to a living bench Creature and end the turn.                |

Power cards require an active Creature. Swapping preserves each Creature's
HP, Power, and remaining effects. The outgoing Creature's end-of-turn effects
resolve before the incoming Creature becomes active.

### Timing, defeat, and completion

A normal player turn has a **90-second deadline**. If an action reaches the API
at or after that deadline, the server resolves a timeout instead of the intended
action. The turn ends without a move or Power-card action. Initial selection
and mandatory replacement do not use this normal-turn deadline.

A defeated Creature cannot return. If another living Creature remains, the
player must select a replacement before normal turns continue. Replacement
does not consume a normal turn.

Defeating all opposing Creatures wins the match. The engine produces a winner
rather than a draw. A player may also **forfeit an active battle**, which records
a CPU victory and a zero-point player result. Completed results and action
history remain available privately to the owning player until account deletion.

The browser submits action identifiers and the expected match version. The API
resolves effects, randomness, timing, and completion, and rejects stale or
illegal actions. Pure battle logic lives in `packages/game-rules`; persistence
and request coordination live in the API. See the
[CPU battle journey](player-cpu-battle-journey.md).

## Roles, authority, and account lifecycle

### Authentication and email verification

Auth0 authentication is required for normal online gameplay and protected
features. Email verification is not an application access requirement and does
not establish Wits institutional identity. Access still depends on a valid
token, an active local account, the required role, and object permissions.

The configured email policy disables automatic verification emails while
retaining password recovery. Actual tenant configuration and delivery require
operator verification; see the
[Auth0 email policy](../architecture/external-integrations.md#auth0-email-policy).

### Roles and authoring

New accounts receive the Player role. Author access is assigned or revoked
outside the application. Basic has no separate Administrator role or in-app
role management.

Authors create and edit content through protected operations. Players cannot
read unpublished content or call Author endpoints. Private answer keys and
explanations are available only through authorised content-management operations;
completed player reviews expose only their defined answer feedback.

### Author content lifecycle

Events, challenges, questions, cards, and campaigns use:

**Draft → In review → Approved → Published → Retired**

Editing is draft-only. The latest submitting Author cannot approve or return
their own submission. Another Author may return it to draft with a reason; any
Author may publish approved content or retire published content. Retired content
cannot be republished.

Approval and publication recheck readiness and dependencies:

| Content        | Required before approval and publication                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| Basic question | Four choices, one private accepted answer, difficulty 1–3, and a nonblank explanation. |
| Challenge      | At least five valid published questions.                                               |
| Event          | A valid published challenge and an available Common reward definition.                 |
| Creature       | Exactly four ordered, executable moves. Drafts may contain zero to four.               |

Card-definition names are globally unique after trimming and case-insensitive
comparison. Retired names remain reserved; this does not restrict separately
owned duplicates.

Edits and transitions require `expectedVersion` and record an audit entry.
Conflicting requests fail without changing the content. Published content is
immutable; changes require replacement content. Retirement removes future
availability while retaining authored records, owned copies, and historical
snapshots. A published challenge cannot be retired while its published event
still depends on it. Canonical starter cards require a configured replacement
before retirement.

Authors do not choose progression awards, reward rarity rolls, or the cards
awarded to a player. See the
[review and publication guide](../architecture/diagrams/content-review.md)
for the full dependency and audit rules.

### Account deletion and re-registration

Deletion requires recent authentication and explicit confirmation. The account
locks immediately while provider and database cleanup complete; there is no
grace period. Failures leave the account locked for automatic retry.

Cleanup removes the Auth0 user, local player, owned cards, decks, starter
selection, developer keys, personal challenges, CPU matches, progression,
profile, and personal ratings. Registration afterwards creates a new player
with no restored progress.

Published content and required shared PvP, trade, ranked, and territory history
remain against a fresh profile-free historical actor. Player-facing history
uses `Deleted player`; retained Author history may use `Deleted author`.
Formal trust-case records have separate bounded retention rules.

A minimal deletion receipt is retained for 12 months. A private salted identity
digest is retained for 30 days to prevent old tokens from recreating the deleted
account. See [account deletion and retained data](../database/account-deletion-retention.md)
for the exact purge, historical-reference, and retention boundaries.

## Features beyond Basic

Later features extend the application while retaining the core ownership,
deck, effect, and server-authority rules.

### Asynchronous PvP

An invitation expires after 24 hours. After acceptance, each turn or mandatory
replacement has a 24-hour decision window. Missing it ends the match by
forfeit, rather than skipping a turn.

The challenger may cancel a pending invitation before expiry. Either match
participant may voluntarily forfeit on either player's turn. An already elapsed
decision deadline takes precedence over voluntary resignation. Deck snapshots,
hidden opponent cards, and idempotent actions are enforced by the server.
See the [asynchronous battle contract](../architecture/asynchronous-pvp-api-contract.md).

### Other extensions

Live PvP uses one-minute turns and its own timeout, reconnect, and completion
policy; see the [live battle contract](../architecture/live-pvp-api-contract.md).
Ranked competition, trails, evolution, trading, prepared offline challenges,
territories, trust review, profiles, and analytics also have separate contracts.
They are implemented extensions, not additional Basic release requirements.

The [game overview](../basic-release-reference.md#features-beyond-basic) links
to those rules. Feature implementation does not establish deployment, gameplay
balance, or stakeholder acceptance; those require recorded validation.

---

This page was planned, generated, and edited with assistance from
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5.6 Sol], Codex[GPT-5],
Codex[gpt-5.6-sol], Codex-CLI[GPT-6], and Codex[GPT-6].
