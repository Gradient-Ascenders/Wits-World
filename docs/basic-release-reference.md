---
sidebar_position: 2
title: 'About Wits Quest'
description: How Wits Quest works, its core gameplay, and the features added beyond Basic.
---

# About Wits Quest

Wits Quest is a campus exploration and card-battle game. Players discover
events, answer questions, collect Creature and Power cards, and build decks
for battles. Authors create and review the content that players encounter.

The Basic game centres on one journey: **explore → challenge → collect →
build a deck → battle a CPU**. Later development adds trails, progression,
offline challenges, player battles, trading, and other features described below.

## The core player journey

### Explore campus

Sign in and open Explore to find published events. Events appear on a map and
in a text list, so discovery remains usable when the map is unavailable.
Allow location access to check whether an event is within reach. The API checks
the reported location, its freshness and accuracy, and the event's availability
before allowing a challenge to start.

### Complete a challenge

A Basic challenge contains five multiple-choice questions. Its time limit is
90, 120, or 150 seconds, depending on average difficulty. Accepted answers are
locked, and refreshing the page keeps the same attempt and deadline.

Correct answers stay hidden during the attempt. Once it finishes, the player
can review their answers, the correct answers, their score, and the reward
outcome. Each event allows one attempt per player; an expired or completed
attempt cannot be restarted.

### Collect cards

Challenge scores determine card rewards:

| Correct answers | Card reward                                        |
| --------------: | -------------------------------------------------- |
|             0–2 | No card                                            |
|               3 | One Common card                                    |
|               4 | One card: 75% Common, 25% Rare                     |
|               5 | One or two cards, with a chance of higher rarities |

The server selects and saves the reward. Retrying a completed request returns
the same result without awarding more cards.

Players also choose a one-time starter set in **Wit, Grit, or Spark**. Each set
contains three Common Creatures and two Common Power cards: Field Kit and
Reserve Focus. The ordinary catalogue contains 30 cards: 24 Creatures and six
Power cards. See the [complete card catalogue](design/basic-card-roster.md)
for stats, moves, affinities, and acquisition rules.

### Build a deck

A legal deck contains **three Creature cards and two Power cards**, using copies
the player owns. Its total rarity cost must be at most **10 points**:

| Rarity    | Cost per card |
| --------- | ------------: |
| Common    |             1 |
| Rare      |             2 |
| Epic      |             3 |
| Legendary |             4 |

Players can save multiple decks and select one for battle. The API checks
ownership and legality. A match saves a snapshot of its deck, so later edits
do not change that match.

### Battle the CPU

The server chooses who goes first and resolves each turn. A player can use a
Creature move, play a Power card, or swap to a living bench Creature. A voluntary
swap uses the turn; replacing a defeated Creature does not. Power cards are
discarded after use.

CPU matches have a 90-second turn deadline. The CPU selects from legal moves
and Power actions. Completed results remain available in battle history.

The [Basic game rules](requirements/basic-game-rules.md) define the full timing,
reward, deck, and battle rules.

## Authoring content

Wits Quest has Player and Author roles. New accounts receive the Player role;
Author access is assigned outside the application.

Authors use the protected Author console to create events, questions,
challenges, cards, and campaigns. Content follows this lifecycle:

**Draft → In review → Approved → Published → Retired**

A different Author must review the latest submission. Only published content
is available to players. Approval and publication check that content is complete
and its dependencies are ready. Creature cards require exactly four ordered
moves before publication.

Edits and lifecycle changes are versioned and audited. Retirement stops future
discovery or selection while preserving existing owned cards and historical
game records. See [Review and publish](architecture/diagrams/content-review.md)
for review, publication, and dependency rules.

## Features beyond Basic

The current application includes features developed in later sprints. These
extend the core game and have their own rules and validation requirements.

| Area                                                                                                                                  | What it adds                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Progression](requirements/player-progression-rules.md) and [trails](requirements/ordered-trails-rules.md)                            | Permanent points, achievements, and ordered sequences of campus events.                               |
| Ordering questions                                                                                                                    | Put four items in the correct sequence; supported in online and offline challenges.                   |
| [Card evolution](requirements/card-evolution-rules.md)                                                                                | Consume three eligible copies of a source card to obtain its defined evolution.                       |
| [Offline challenges](architecture/offline-challenge-play.md)                                                                          | Download events while connected, answer offline, and submit for server validation after reconnecting. |
| [Asynchronous battles](requirements/player-asynchronous-pvp-journey.md)                                                               | Invite another player and take turns with 24-hour decision windows.                                   |
| [Live battles](architecture/live-pvp-api-contract.md) and [ranked competition](requirements/ranked-competition-policy.md)             | Play live matches, resume after disconnects, and enter ranked matchmaking.                            |
| [Card trading](requirements/card-trading-policy.md)                                                                                   | Offer owned copies and complete a server-validated exchange.                                          |
| [Player profiles](architecture/player-profile-api-contract.md)                                                                        | Choose whether to publish a profile, share activity, and showcase owned cards.                        |
| [Campus territories](requirements/contested-campus-zone-policy.md)                                                                    | Contribute eligible gameplay outcomes toward contested campus zones.                                  |
| [Event placement](requirements/automatic-event-placement-policy.md) and [campaigns](architecture/campaign-scheduling-api-contract.md) | Preview and apply event distribution plans and schedule content availability.                         |
| [Trust review](requirements/longitudinal-trust-policy.md) and [analytics](design/author-analytics.md)                                 | Review gameplay evidence and inspect protected Author reports.                                        |
| [Developer API](architecture/developer-api.md)                                                                                        | Access supported resources through scoped developer credentials.                                      |

The [Sprint 2 overview](sprint-2-overview.md) and
[Sprint 3 overview](sprint-3-overview.md) connect these features to their delivery
and testing records.

## Accounts and accessibility

Auth0 handles sign-in and password recovery. Account settings provide reading
and accessibility preferences, developer API access, and account deletion.
Deletion locks the account while cleanup runs, removes personal game data,
and preserves only the shared or system records required by the retention policy.
See [account lifecycle validation](testing/player-account-lifecycle-validation.md)
and [deletion and retention](database/account-deletion-retention.md).

The application supports keyboard navigation, responsive layouts, reduced
motion, and map-independent event discovery. Manual screen-reader, touch,
device, and campus-location checks are recorded separately from automated tests.

## How the system works

The React/Vite browser displays game state and sends actions. The Fastify API
validates identity, permissions, eligibility, answers, rewards, ownership, decks,
and battle actions. PostgreSQL/PostGIS stores authoritative game records and
performs spatial checks. Mapbox provides map presentation.

Read the [system architecture](architecture/overview.md),
[trust boundaries](architecture/trust-boundaries.md), and
[third-party services](architecture/technology-stack.md#application-stack)
for the component responsibilities and external dependencies.

## Setup and release validation

For local development, follow [Getting started](development/getting-started.md).
It covers the pinned Node.js and npm versions, configuration, database setup,
and commands for running each application. Production setup is documented in
the [deployment guide](deployment/azure-deployment-setup.md).

The [Basic release acceptance checklist](testing/basic-tier-release-validation.md)
owns the release requirements and remaining evidence gates. The
[deterministic Basic journey](testing/basic-tier-deterministic-e2e.md) exercises
the core flow through a browser, API, and test database, with Auth0 and Mapbox
controlled at their external boundaries.

Implemented features and passing local tests do not establish production or
stakeholder acceptance. Deployed gameplay, real Auth0 recovery and deletion,
manual accessibility, campus-location testing, and operator checks require
their own dated evidence. Later-sprint results are recorded in the
[Sprint 2](testing/sprint-2-validation-status.md) and
[Sprint 3](testing/sprint-3-validation-status.md) validation snapshots.

Project workflow and attribution are documented in the
[project and Git methodology](planning/project-and-git-methodology.md) and
[AI-use guide](planning/ai-use.md).

---

This page was generated, edited, and reviewed with assistance from Codex[GPT-5],
Codex[gpt-5.6-sol], ChatGPT-Web[GPT-5.6 Sol],
Codex-CLI[gpt-5.6-sol medium], and Codex-CLI[GPT-6].
