---
title: 'Game decisions'
description: Current game decisions, their approval records, and changes since the Basic release.
---

# Game decisions

This register links the original Basic decision IDs to the current game rules
and their recorded owners. Use [game basics](basic-game-rules.md) for the full
rules and the player guides for instructions.

## Status and authority

Reviewed against the repository on **8 October 2026**. The decision records
below preserve the original approval sources; current summaries incorporate
later changes. Implementation does not establish deployment or acceptance.

The team confirmed the 5-question challenge, score-based card rewards, and
move/Power-card combat on **25 August 2026**. These are deliberate product
choices, including departures from the supplied brief. That team confirmation
does not record a formal lecturer or client amendment to the brief.

The register originated in [issue #62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62).
“Beyond Basic” identifies release scope, rather than whether a feature has
since been implemented. Operational checks are listed after the decisions.

## Challenges and rewards

| ID         | Current decision                                                                                                                                                                                                                                               | Original owner and record                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASIC-01` | **Challenge format.** 1 attempt per player per event: 5 distinct questions, 4 choices per multiple-choice question, difficulty 1–3, and a saved shuffle. The server sets a 90, 120, or 150-second deadline. Starting during the event preserves that deadline. | Product Lead. [#46](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46#issuecomment-2732).                                                                                             |
| `BASIC-02` | **Replay and resume.** Restarting resumes an unfinished attempt. Completed or timed-out attempts cannot be replayed; unanswered questions count as incorrect.                                                                                                  | Product Lead. [#46](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46#issuecomment-2732), [challenge contract](../architecture/challenge-attempt-api-contract.md).                    |
| `BASIC-03` | **Feedback.** Correctness and accepted answers stay hidden during play. Completion returns the score, rewards, and answer review. Multiple-choice reviews omit Author explanations; the ordering extension includes its defined explanation feedback.          | Product Lead; API/Security Lead. [#68](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/68#issuecomment-5016), [challenge contract](../architecture/challenge-attempt-api-contract.md). |
| `BASIC-04` | **Rewards and duplicates.** The normal score-based reward grants 0–2 cards. Duplicate awards create separate owned copies. Completion, rewards, and progression commit together; retries return the saved result. The former coin award is retired.            | Product Lead; Data Lead. [#49](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49#issuecomment-2748), [Reward contract](../database/challenge-reward-persistence-design.md).           |

## Cards, decks, and battles

| ID         | Current decision                                                                                                                                                                                                                                                            | Original owner and record                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASIC-05` | **Card vocabulary.** Categories: Creature and Power. Affinities: Wit, Grit, Spark, Spirit, Mystic. Rarities: Common, Rare, Epic, Legendary. Current Power cards are typeless.                                                                                               | Product Lead; Cards/Game Rules reviewer. [#49](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49#issuecomment-2748).                                                                                                |
| `BASIC-06` | **Starter grant.** Choose Wit, Grit, or Spark once. Receive 3 distinct Common Creatures of that affinity, Field Kit, and Reserve Focus. Historical Spirit and Mystic starter grants remain readable.                                                                        | Data Lead; Product reviewer. [#71](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/71), [#70](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/70), [complete catalogue](../design/basic-card-roster.md). |
| `BASIC-07` | **Deck composition.** 5 owned copies: 3 Creatures and 2 Power cards, within 10 rarity points. A copy can appear in several saved decks but only once per deck. Battles use immutable card snapshots.                                                                        | Cards/Game Rules Lead. [#72](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/72).                                                                                                                                    |
| `BASIC-08` | **Rarity costs.** Common costs 1 point, Rare 2, Epic 3, Legendary 4. Costs apply to both categories and are separate from progression points.                                                                                                                               | Cards/Game Rules Lead; Data Lead. [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62#issuecomment-3640).                                                                                                       |
| `BASIC-09` | **Stats and effects.** HP and maximum Power are authored per Creature. Moves spend Power and resolve ordered effects. Move type determines damage matchups; it does not modify healing. Existing matches keep their stored rules version.                                   | Caleb Pather; Uzair Mahomed. [#71](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/71#issuecomment-3688), [Catalogue](../design/basic-card-roster.md), [Game rules](./basic-game-rules.md#damage-matchup-table).     |
| `BASIC-10` | **CPU combat.** Moves and Power cards replace attribute comparison. Each side has a 50% chance to go first. A normal turn permits 1 legal action, including a voluntary swap. CPU player turns last 90 seconds; missed turns skip the action. Required replacement is free. | Caleb Pather; Product reviewer. [#74](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/74#issuecomment-3732).                                                                                                         |
| `BASIC-18` | **Definition names.** Names are globally unique after trimming and case-insensitive comparison, including retired definitions. This limits definitions, not the number of owned copies.                                                                                     | Product Lead; Cards/Game Rules reviewer; Data Lead. [Game rules](basic-game-rules.md#author-content-lifecycle), [Persistence](../database/challenge-reward-persistence-design.md#card-invariant-migration-blockers).             |
| `BASIC-19` | **Creature moves.** Draft Creatures may have 0–4 ordered moves. Publication requires exactly 4 executable moves. The current catalogue has 24 published Creatures; Power cards do not use Creature moves.                                                                   | Product Lead; Cards/Game Rules reviewer; Data Lead. [Game rules](basic-game-rules.md#author-content-lifecycle), [Catalogue](../design/basic-card-roster.md).                                                                     |

## Accounts, access, and content

| ID         | Current decision                                                                                                                                                                                                                                                                      | Original owner and record                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASIC-11` | **Roles.** New accounts are Players. Author access is assigned outside the application; there is no separate Administrator role or in-app role management. Protected content actions are audited. Published content is immutable and follows the review/publication lifecycle.        | Tyron Van Tonder. [Auth0 decision](../architecture/decisions/ADR-005-auth0-authentication.md), [#77](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/77#issuecomment-3691).                                                                                 |
| `BASIC-12` | **Deletion.** Deletion locks access immediately and removes the Auth0 user, local player, and personal gameplay data. Required shared history retains a profile-free historical actor. Cleanup retries automatically; re-registration creates a new player without restored progress. | Tyron Van Tonder; Uzair Mahomed. [Auth0 decision](../architecture/decisions/ADR-005-auth0-authentication.md), [Retention contract](../database/account-deletion-retention.md), [#63](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/63#issuecomment-3657). |
| `BASIC-17` | **Email verification.** Auth0 authentication is required; email verification is not an access condition or proof of Wits identity. Automatic signup verification emails are disabled by tenant policy, while password recovery remains enabled.                                       | Product Lead; API/Security Lead. [Auth0 decision](../architecture/decisions/ADR-005-auth0-authentication.md#email-verification), [Tenant setup](../deployment/azure-deployment-setup.md#91-auth0-email-delivery-policy).                                                |

## Scope and external services

| ID         | Current decision                                                                                                                                                                                                                                                                   | Original owner and record                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASIC-13` | **Map service.** Mapbox GL JS with Mapbox Standard presents the campus map. The event list remains usable without the map. Player coordinates are not sent to Mapbox; the API decides gameplay eligibility.                                                                        | Kevin Ebrahim. [Map evaluation](../architecture/map-provider-evaluation.md), [Map boundary](../architecture/decisions/ADR-004-map-provider-boundary.md), [Operations](../deployment/mapbox-operations.md). |
| `BASIC-14` | **Basic scope.** Authentication and deletion, event discovery and eligibility, timed quizzes, card rewards and collection, starters, decks, CPU battles and history, protected authoring, seed content, and release validation.                                                    | Product Lead; specialist leads for their boundaries. [Sprint 2 issue plan](../planning/wits-quest-sprint-2-gitea-issues.md).                                                                               |
| `BASIC-15` | **Beyond Basic.** PvP, ranked seasons, spectators, trading, evolution, profiles, progression, trails, territories, offline challenges, trust review, and analytics have separate contracts. Their exclusion from Basic does not mean they are absent from the current application. | Product Lead. [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62).                                                                                                                       |
| `BASIC-16` | **Location thresholds.** Event radius is stored per event; 75 metres is the historical Great Hall seed radius. Claims must be no more than 120 seconds old and not future-dated, with accuracy at most min(150 metres, 2 × radius). Field calibration remains provisional.         | Data Lead; API/Security Lead. [Field-test record](location-eligibility-field-test.md#threshold-decision-record).                                                                                           |

## Changes since the original decisions

- **Combat:** voluntary swaps supersede the original no-switching clause in
  `BASIC-10`. CPU turns use 90 seconds, live decisions 60 seconds, and async
  decisions 24 hours. Their missed-deadline rules differ; see
  [Battle rules](battle-rules.md). The reason for replacing attribute comparison
  is explained there too.
- **Rewards and progression:** [issue #193](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/193)
  retired active coins. Permanent points, achievements, and streaks extend the
  Basic reward model. Seasonal ranked rating and territory influence are
  separate from those points; see [progression](player-progression-rules.md)
  and [player battles](player-asynchronous-pvp-journey.md).
- **Account deletion:** the later retention redesign supersedes the local-player
  tombstone and indefinite personal-gameplay retention described in the original
  `BASIC-12` decision. Personal challenges, answers, CPU matches, cards, profile,
  and progression are removed. Shared history uses a fresh historical actor.
  The deletion receipt lasts 12 months; the private identity digest lasts
  30 days. See [account retention](../database/account-deletion-retention.md).
- **Authoring and feedback:** current content passes **Draft → In review →
  Approved → Published → Retired**. Another Author must review the latest
  submitter's work. Ordering questions extend the original multiple-choice
  format; their completed reviews include explanations. See
  [authoring](../architecture/author-curation-api-contract.md) and the
  [challenge contract](../architecture/challenge-attempt-api-contract.md).

The `BASIC-09` modifier amendment remains part of the authored-data contract:
Authored buffs/debuffs name their target, operation, and magnitude explicitly.
HP and Power use `add`; damage strength uses `multiply` with a percentage value.
Only damage-strength modifiers may define a turn duration in this contract.
See [the recorded amendment](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/74#issuecomment-4832)
and [Battle rules](battle-rules.md#damage-and-modifiers) for resolution behaviour.

## Operational checks

Product decisions and real-service evidence are separate. Relevant checks are:

- **Mapbox:** licensing and terms, an operating owner for cost/usage, production
  token and CSP configuration, privacy, and campus-data provenance. Mapbox is
  a team-selected service; this register does not claim named lecturer approval.
  See [Mapbox operations](../deployment/mapbox-operations.md).
- **Auth0:** tenant email settings, actual password-recovery delivery, recent
  authentication, and deletion/retry behaviour. See
  [authentication decisions](../architecture/decisions/ADR-005-auth0-authentication.md).
- **Location:** real-device observations before treating seeded thresholds as
  calibrated. See the [field-test record](location-eligibility-field-test.md).
- **Release:** executed checks and remaining gaps belong in the
  [acceptance checklist](../testing/basic-tier-release-validation.md), rather
  than being inferred from a confirmed decision.

Selling cards for currency, a card shop, and named competitive leagues or
divisions remain outside the current rules. Later features must follow their
own approved contracts; they do not silently change the original Basic scope.

---

This page was prepared and edited with assistance from Codex-CLI[GPT-5],
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5.6 Sol], Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].
