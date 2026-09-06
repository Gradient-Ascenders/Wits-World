# Wits Quest Basic Game Rules

## Purpose

This document consolidates the approved player-visible and server-authoritative
rules for the Wits Quest Basic tier. It is an implementation input, not an
implementation. The status and evidence for each rule are maintained in the
[Basic-tier decision register](basic-tier-decision-register.md).

The team confirmed on 25 August 2026 that the implemented five-question
challenge, score-based zero-to-two-card rewards, and current move/Power-card CPU
battle rules are intentional Wits World product rules. That team decision does
not assert that the lecturer or client formally amended the supplied project
brief. As of 25 August 2026, no supplementary Wits Quest brief had been provided
to the team.

No browser may submit or calculate an authoritative identity, eligibility,
correctness, score, reward, deck validity, legal battle action, battle outcome,
or ownership result.

## Roles, authority, and account lifecycle

### Authentication and email verification

- Auth0 authentication remains required for normal gameplay and every protected
  Wits World application feature.
- Email verification is not required for that access. An Auth0-authenticated
  principal with `email_verified: true`, `email_verified: false`, or no
  `email_verified` claim has ordinary application access under the existing
  valid-token, local-lifecycle, role, and object-permission rules.
- Wits World must not claim that email verification proves Wits institutional
  identity. Wits single sign-on and any institutional identity requirement
  remain separate decisions.
- Automatic Auth0 verification email for Wits World database-connection
  sign-ups is intentionally disabled through tenant configuration. Password
  reset and recovery email remains enabled. The authoritative architecture and
  tenant settings are defined by the [Auth0 authentication ADR](../architecture/decisions/ADR-005-auth0-authentication.md#email-verification)
  and [deployment guide](../deployment/azure-deployment-setup.md#91-auth0-email-delivery-policy).

### Roles and authoring

- Basic has only two roles: Player and Author. There is no separate
  Administrator role in Basic.
- New accounts receive the Player role. Author assignment and revocation happen
  out-of-band through the database or deployment process; no browser or API
  operation may grant or change roles.
- Authors may create and edit draft Basic content. Publication requires a review
  cycle; the latest submitting Author cannot approve or return their own
  submission, while any Author may publish approved content or retire published
  content.
- Players cannot access author endpoints, accepted answers, or unpublished
  content.
- Author create, edit, submit, approve, return, publish, and retire actions record
  the acting local Author, transition, version, timestamp, and any safe bounded
  note in the audit trail. In-app role management and advanced administration are
  deferred beyond Basic.

### Author content lifecycle

- Author-created events, challenges, questions, and cards follow `draft →
in_review → approved → published → retired`. Editing is draft-only. A return
  from review or approval requires a reason and starts a new draft/review cycle.
  No state except `published` is player-available.
- A multiple-choice question may be approved or published only when it has exactly four
  choices, exactly one private accepted choice, a difficulty from `1` through
  `3`, and a nonblank explanation. Published question content is immutable;
  later changes require replacement content.
- A challenge may be approved or published only when it contains at least five valid
  published questions. A published challenge cannot return to draft.
- A newly authored event may be approved or published only when it has one valid published
  challenge and the active catalogue contains at least one Common card required
  by the Basic reward policy.
- Published event content is immutable. Retiring an event removes it from
  player discovery without deleting its authored record, and a retired event
  cannot be republished. The published challenge belonging to a live published
  event cannot be retired until the event itself has been retired.
- Card definitions use the same five authoring states. Only
  published cards are active for starter and reward selection. Retiring a card
  removes it from future catalogue selection without deleting owned copies that
  already reference that definition. A configured canonical starter definition
  cannot be retired until the authoritative starter-package configuration has a
  replacement, so all three starter options remain grantable.
- Approval and publication recheck readiness under dependency locks. Every edit
  and lifecycle request includes the expected version; stale concurrent requests
  fail without changing content. See the
  [Author curation API contract](../architecture/author-curation-api-contract.md).
- Protected Author APIs may return private accepted-answer information and
  explanations required for content management. Player APIs never expose
  private answer-key identifiers or explanations. During an active timed
  attempt they also withhold correct answers and per-question correctness;
  after authoritative completion the defined five-question review may return
  the player's selected choice, the correct choice, and server-derived
  correctness.
- Authors do not configure progression-point values, reward rarity outcomes, or
  awarded card definitions. Challenge points and card rewards remain
  server-authoritative and are calculated from their approved score policies.

### Account deletion and re-registration

These are confirmed Basic requirements. Issue `#160` implements the
transactional persistence and retention backend; issue `#161` implements the
player-facing profile/account experience.

- Deletion requires recent authentication and explicit permanent-deletion
  confirmation. Access locks immediately; Basic has no deletion grace period.
- The Auth0 account is permanently deleted. The local record remains only as an
  anonymised tombstone such as `Deleted player`; the Auth0 subject, name, email,
  and other identifying data are removed.
- Player-owned cards, decks, active-deck selection, any retired legacy wallet,
  and starter selection are permanently deleted.
- Completed challenges, reward records, any legacy coin transactions, matches,
  and anonymous final results are retained for integrity and aggregate statistics.
  Individual answers and answer snapshots are deleted. Anonymous gameplay
  history is retained indefinitely unless a later formal retention rule is
  established.
- Published events, questions, and cards remain available as system-owned
  definitions. Immutable Author audit records retain only the anonymous player
  tombstone, and `Deleted author` is shown where needed.
- Auth0 or database cleanup failures trigger idempotent automatic retry and an
  operational alert while the account remains locked. The workflow is marked
  pending until cleanup completes.
- A person may register again as a completely new player with no previous
  progress, cards, or decks.
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
- The Intermediate ordering format added by issue #162 is an additive extension;
  it does not change these Basic multiple-choice rules.
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
  answer, and server-derived correctness. The completed Player review has no
  explanation field.
- Scores from zero through five are completed attempts. A low score does not
  create another attempt.

## Rewards

Challenge points follow the permanent, non-spendable progression table in
[Player progression rules](./player-progression-rules.md). Cards follow this
separate score policy:

| Correct | Card award                     |
| ------: | ------------------------------ |
|       0 | None                           |
|       1 | None                           |
|       2 | None                           |
|       3 | One guaranteed Common          |
|       4 | One card: 75% Common, 25% Rare |
|       5 | 80% one card, 20% two cards    |

Each card for a five-correct reward independently rolls 45% Common, 40% Rare,
14% Epic, and 1% Legendary. After rarity selection, the server selects uniformly
from active Creature and Power definitions in that rarity. Affinity and category
are not separately weighted.

If a positive-probability rarity has no active definition, the server
redistributes its probability proportionally over the available
positive-probability rarities. A guaranteed Common reward requires an active
Common definition. Completion, its progression award, card awards, owned
copies, and the persisted result commit atomically; a retry returns the same
result instead of rerolling.

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
- Every published Creature has four ordered moves. Each move is either Basic or
  matches the Creature's affinity and may contain multiple ordered effects.
- Executable effects include damage, healing, Power changes, outgoing or
  incoming damage modifiers, Poison, Stun, Dodge, Reflect, Lifesteal,
  restore-to-maximum Power, self-damage, and HP-percentage swaps.
- Effect configuration declares its target, magnitude, duration or finite
  charges, affinity behavior, and any legality threshold required by the
  effect. HP and Power changes are clamped to the Creature's valid range.
- Duration-based modifiers count the affected Creature's subsequent turns.
  Charge-based modifiers are consumed by the matching future action.
- Multiple compatible damage modifiers are multiplied together. Base damage,
  affinity, and active modifiers are multiplied and floored once at the end.
  Damage cannot become negative.
- Effects are applied in their authored order. An effect that lacks the data
  required to execute is invalid catalogue data and cannot be used in a battle.
- `power` is the resource cost consumed from the Creature's remaining Power.
  A move is legal only when the Creature has enough remaining Power.
- Only Damage is affected by type advantage or disadvantage. The confirmed
  5 September 2026 matchup table below replaces the original five-type cycle.
  The starters form Wit -> Grit -> Spark -> Wit. Wit is neutral against Spirit
  and Mystic. Spirit and Mystic both deal `1.5x` damage to each other; this is
  an intentional exception to reciprocal advantage/disadvantage.
- Power cards are typeless. Their effects use explicitly neutral damage where
  applicable and resolve in their stored order before the card is discarded.
- The complete release definitions and special-effect behavior are recorded in
  the [complete card catalogue](../design/basic-card-roster.md).

### Damage matchup table

Rows are the attacking Creature move's type; columns are the defending
Creature's affinity. Basic and Power-card damage are neutral.

| Attacker / Defender | Wit   | Grit  | Spark | Spirit | Mystic |
| ------------------- | ----- | ----- | ----- | ------ | ------ |
| Wit                 | 1x    | 1.5x  | 0.75x | 1x     | 1x     |
| Grit                | 0.75x | 1x    | 1.5x  | 0.75x  | 1.5x   |
| Spark               | 1.5x  | 0.75x | 1x    | 1.5x   | 0.75x  |
| Spirit              | 1x    | 1.5x  | 0.75x | 1x     | 1.5x   |
| Mystic              | 1x    | 0.75x | 1.5x  | 1.5x   | 1x     |

New server-created matches store `affinityRulesVersion: 2` in their battle
state. Existing stored states without a version retain the original five-type
cycle (version 1). Both Creature moves and Power-card damage use the stored
version; healing and modifiers are unaffected. Historical results are not
rewritten. Deploy all battle-serving API instances together: older binaries do
not understand version 2 and must not process new-version matches. Rollback
requires a version-aware binary, not an older engine that ignores this field.

This is the agreed matchup design, not a claim of proven balance. Review card
coverage and Spirit/Mystic first-turn outcomes in playtests before release.

## Starter grant

- The player selects Wit, Grit, or Spark once.
- The server grants that affinity's three distinct Common Creatures plus the
  shared typeless Common Power cards Field Kit and Reserve Focus.
- The transaction and uniqueness rules prevent repeated or concurrent starter
  requests from issuing another starter set.
- Historical Spirit and Mystic grants remain readable but those affinities are
  not offered to new players.

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
- The later live PvP mode uses a `1 minute` turn timer; the CPU match turn timer
  is `1.5 minutes`. The shared rule remains configurable. The implemented
  asynchronous PvP mode is separate and uses 24-hour decision windows.
- For CPU and later live PvP modes, if the timer expires without a selected
  move or action, the turn ends without an action. Asynchronous PvP instead
  applies the forfeit rule documented below.
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

## Asynchronous PvP

Issues `#178` through `#181` implement an Intermediate asynchronous mode that
reuses the same server-authoritative move, effect, replacement, deck, and
victory rules. It is not the one-minute live mode and is not part of the Basic
release.

An invitation expires after 24 hours. Once accepted, each active move or
mandatory-replacement decision receives a 24-hour response window. Missing that
window completes the match as an automatic forfeit; it does not use the CPU or
live `timeout` action that merely ends a turn without an action. The browser
continues to submit intent only, opponent cards remain hidden until legally
revealed, and persisted deck snapshots prevent later catalogue or saved-deck
changes from altering the match.

Issue `#220` lets only the authenticated challenger cancel their own pending
invitation before its deadline. The server records the distinct immutable
`cancelled` state and an idempotency receipt, retains the invitation audit, and
creates no match or progression. Recipient decline, time expiry, and
account-lifecycle invalidation remain separate terminal meanings.

Issue `#219` adds voluntary resignation as an API-owned terminal rule. Either
authenticated participant may resign an active match on either player's turn.
The resigning participant loses, the opponent wins, and the server records the
distinct `voluntary_resignation` reason. An already elapsed decision deadline
takes precedence and records `turn_forfeit`; the browser cannot select the
participant, winner, reason, or progression result.

The player interface calls this action **Forfeit battle** and presents the
result as “you forfeited” or “opponent forfeited.” The resign endpoint and
persisted completion-reason values are contract terminology and are not shown
to players.

The endpoint, privacy, idempotency, polling, deadline, history, and
progression boundaries are defined in the
[asynchronous PvP API contract](../architecture/asynchronous-pvp-api-contract.md).

## Basic exclusions

The following are not Basic game rules: PvP, matchmaking, ratings, spectators,
trading, selling, evolution, rarity upgrades, offline play, movement tracking,
anti-cheat trust scoring, territory control, seasons, advanced analytics, or an
advanced administration console. The implemented curated Author review workflow
is part of Basic content integrity and its unblocked Author-console review and
campaign controls are implemented under issue `#185`. Question analytics remains
blocked by issue `#184` / S3-06, and ordering-question authoring remains a
follow-up to the current multiple-choice-only editor contract.

The [card evolution rules](./card-evolution-rules.md) record the confirmed
three-copy conversion rule and the evolved definitions supplied by issue #164.
The player-facing evolution action remains outside Basic and is not implemented
by the catalogue migration.

This document was planned, generated, and edited with the assistance of
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5.6 Sol], Codex[GPT-5], and
Codex[gpt-5.6-sol].
