# Wits Quest Sprint 2 Gitea Issue Plan

## Objective

Complete the remaining Wits Quest Basic-tier journey without duplicating the
Sprint 1 foundations already tracked in Gitea. This plan records the Sprint 2
issues created from the Basic-tier repository audit.

All issues use the `Sprint 2` milestone and begin in the `Backlog` project
column. Gitea native dependency links are the authority for blocking status;
the dependency lists below are a readable planning snapshot.

## Existing prerequisites

- [#15 - Publish the initial documentation website](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/15)
- [#20 - Validate and release the Sprint 1 vertical slice](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20)
- [#44 - Validate the accessible mobile Sprint 1 player journey](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/44)
- [#45 - Review deployed authentication, CORS, and location privacy boundaries](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45)
- [#46 - Define the challenge and attempt API contract](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46)
- [#49 - Design the challenge, reward, and card ownership persistence foundation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49)
- [#50 - Add deterministic end-to-end coverage for the Sprint 1 vertical slice](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/50)
- [#60 - Reduce CI queue time and unnecessary deployments](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/60)

## Workload summary

| Member             | Primary Sprint 2 work                                                  |    Estimate |
| ------------------ | ---------------------------------------------------------------------- | ----------: |
| `kevin-ebrahim`    | Product decisions, challenge/collection/deck/battle UI, author console |     13 days |
| `Tyron-Van-Tonder` | Identity, challenge APIs, collection API, author APIs                  |     11 days |
| `Uzair`            | Challenge/reward migrations, atomic rewards, match persistence         |      7 days |
| `Caleb_P`          | Card/deck/battle rules, seed content, release quality                  |     12 days |
| **Total**          |                                                                        | **43 days** |

The total exceeds the original approximately five-day allocation per member.
Sprint planning should split the dependency graph across iterations rather than
silently reducing testing, security, accessibility, or documentation scope.

## Dependency order

| Planning ID |                                                                 Gitea | Title                                                           | Assignee           | Estimate |
| ----------- | --------------------------------------------------------------------: | --------------------------------------------------------------- | ------------------ | -------: |
| `S2-01`     | [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62) | Confirm remaining Basic-tier product and governance decisions   | `kevin-ebrahim`    | 1.5 days |
| `S2-02`     | [#63](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/63) | Implement local player profiles, roles, and account lifecycle   | `Tyron-Van-Tonder` | 2.5 days |
| `S2-03`     | [#64](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/64) | Add challenge, card, attempt, reward, and ownership migrations  | `Uzair`            | 2.5 days |
| `S2-04`     | [#65](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/65) | Implement server-authoritative challenge start and resume       | `Tyron-Van-Tonder` |   2 days |
| `S2-05`     | [#66](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/66) | Implement server-side quiz marking, timing, and feedback        | `Tyron-Van-Tonder` |   2 days |
| `S2-06`     | [#67](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/67) | Issue quiz rewards atomically and exactly once                  | `Uzair`            |   2 days |
| `S2-07`     | [#68](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/68) | Build the timed challenge and result player experience          | `kevin-ebrahim`    |   2 days |
| `S2-08`     | [#69](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/69) | Expose the authenticated player card collection API             | `Tyron-Van-Tonder` | 1.5 days |
| `S2-09`     | [#70](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/70) | Build the card collection and starter selection experience      | `kevin-ebrahim`    |   2 days |
| `S2-10`     | [#71](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/71) | Implement the Basic card catalogue and starter grant rules      | `Caleb_P`          |   2 days |
| `S2-11`     | [#72](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/72) | Implement saved deck persistence, validation, and selection API | `Caleb_P`          | 2.5 days |
| `S2-12`     | [#73](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/73) | Build the saved deck management and selection experience        | `kevin-ebrahim`    |   2 days |
| `S2-13`     | [#74](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/74) | Implement deterministic Basic CPU battle rules                  | `Caleb_P`          | 2.5 days |
| `S2-14`     | [#75](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/75) | Create server-authoritative CPU matches and persist history     | `Uzair`            | 2.5 days |
| `S2-15`     | [#76](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/76) | Build the CPU battle and completed match history experience     | `kevin-ebrahim`    | 2.5 days |
| `S2-16`     | [#77](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/77) | Implement protected author content APIs                         | `Tyron-Van-Tonder` |   3 days |
| `S2-17`     | [#78](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/78) | Build the protected Basic author console                        | `kevin-ebrahim`    |   3 days |
| `S2-18`     | [#79](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/79) | Seed a demonstrable and verified Basic game journey             | `Caleb_P`          |   2 days |
| `S2-19`     | [#80](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/80) | Validate, harden, document, and release the complete Basic tier | `Caleb_P`          |   3 days |

---

## S2-01 - Confirm remaining Basic-tier product and governance decisions

- **Gitea:** [#62](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/62)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `documentation`, `meeting`, `research`
- **Estimate:** `1.5 days`
- **Depends on:** None
- **Blocks:** `#63-#80`

### Purpose

Close the product decisions that cannot safely be invented before the remaining
Basic journey is implemented.

### Included

- Challenge retry and failed-attempt behaviour
- Account-deletion retention behaviour
- Author versus administrator permissions
- Final deck, battle, tie, card attribute, and move-value rules
- Confirmation that the map provider satisfies the external-service requirement
- Consolidated Basic scope and exclusions

### Acceptance criteria

- [ ] Every remaining `CONFIRM` item has a decision, owner, date, and evidence
- [ ] Approved challenge, reward, card, deck, and battle rules are consolidated
- [ ] Downstream issues link to the authoritative decision source
- [ ] Unresolved decisions remain explicit blockers rather than guessed defaults

---

## S2-02 - Implement local player profiles, roles, and account lifecycle

- **Gitea:** [#63](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/63)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Tyron-Van-Tonder - API and Security Lead`
- **Reviewer:** `Uzair - Data and Infrastructure Lead`
- **Labels:** `High Priority`, `backend`, `database`, `frontend`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#62`
- **Blocks:** `#64`, `#65`, `#69`, `#75`, `#77`

### Purpose

Give every authenticated player one local identity and enforce server-side roles
and approved account lifecycle behaviour.

### Acceptance criteria

- [ ] One Auth0 identity cannot create duplicate local users
- [ ] API identity always comes from the validated token
- [ ] Player and author permissions are enforced server-side
- [ ] Registration, sign-in, sign-out, and password reset are reachable
- [ ] Account deletion follows the approved retention decision
- [ ] Current-player, token, role, deletion, route, and migration tests pass

---

## S2-03 - Add challenge, card, attempt, reward, and ownership migrations

- **Gitea:** [#64](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/64)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Uzair - Data and Infrastructure Lead`
- **Reviewer:** `Tyron-Van-Tonder - API and Security Lead`
- **Labels:** `High Priority`, `backend`, `database`, `documentation`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#49`, `#62`, `#63`
- **Blocks:** `#65`, `#67`, `#69`, `#71`, `#77`

### Purpose

Implement the reviewed persistence foundation for safe challenges and
collectible rewards.

### Acceptance criteria

- [ ] Migrations apply and roll back through the repository procedure
- [ ] Questions, attempts, cards, rewards, and ownership have required constraints
- [ ] Accepted answers remain unavailable to player-facing queries
- [ ] Duplicate event reward grants are prevented by a database constraint
- [ ] Legitimate duplicate card ownership remains possible
- [ ] Clean-database migration and constraint tests pass

---

## S2-04 - Implement server-authoritative challenge start and resume

- **Gitea:** [#65](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/65)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Tyron-Van-Tonder - API and Security Lead`
- **Reviewer:** `Uzair - Data and Infrastructure Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#46`, `#62`, `#63`, `#64`
- **Blocks:** `#66`, `#68`

### Purpose

Open or resume the correct event quiz only after authoritative eligibility.

### Acceptance criteria

- [ ] Guessed URLs cannot bypass location, time, publication, or completion rules
- [ ] Exactly five distinct questions are selected without repeats
- [ ] The server deadline follows the approved 90/120/150-second bands
- [ ] Player payloads contain no accepted answers or marking secrets
- [ ] Concurrent starts cannot create conflicting active attempts
- [ ] OpenAPI and eligibility/error tests match runtime behaviour

---

## S2-05 - Implement server-side quiz marking, timing, and feedback

- **Gitea:** [#66](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/66)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Tyron-Van-Tonder - API and Security Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#65`
- **Blocks:** `#67`, `#68`

### Purpose

Mark quiz answers on the server and return useful learning feedback safely.

### Acceptance criteria

- [ ] Correctness comes only from stored marking data
- [ ] Attempt, event, question, and authenticated player are bound together
- [ ] Each question affects the score at most once
- [ ] Unanswered questions become incorrect after the deadline
- [ ] Correct and incorrect responses reveal safe answer/explanation feedback
- [ ] Correct, incorrect, malformed, duplicate, concurrent, expired, and ownership tests pass

---

## S2-06 - Issue quiz rewards atomically and exactly once

- **Gitea:** [#67](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/67)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Uzair - Data and Infrastructure Lead`
- **Reviewer:** `Tyron-Van-Tonder - API and Security Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#64`, `#66`
- **Blocks:** `#68`, `#69`

### Purpose

Convert a completed quiz into authoritative coins and cards without duplicate
grants or partial writes.

### Acceptance criteria

- [ ] Rewards match the approved score table and probability rules
- [ ] Reward decisions and randomness are server-authoritative
- [ ] Attempt finalisation, coins, grants, and ownership commit atomically
- [ ] Retries and concurrent requests cannot duplicate rewards
- [ ] Empty rarity pools and rollback paths fail safely
- [ ] Every score band, probability branch, concurrency, and rollback path is tested

---

## S2-07 - Build the timed challenge and result player experience

- **Gitea:** [#68](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/68)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Tyron-Van-Tonder - API and Security Lead`
- **Labels:** `High Priority`, `feature`, `frontend`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#65`, `#66`, `#67`
- **Blocks:** `#80`

### Purpose

Let eligible mobile players complete a quiz and understand its result.

### Acceptance criteria

- [ ] The browser submits answer intent, never correctness, score, or rewards
- [ ] The timer uses the server deadline and refresh resumes the attempt
- [ ] Correct, incorrect, timeout, expired, duplicate, and reward states are clear
- [ ] Feedback includes the correct answer or explanation
- [ ] Keyboard, touch, screen-reader, and required responsive widths work
- [ ] UI tests cover active, result, timeout, reward, and failure states

---

## S2-08 - Expose the authenticated player card collection API

- **Gitea:** [#69](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/69)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Tyron-Van-Tonder - API and Security Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `1.5 days`
- **Depends on:** `#62`, `#63`, `#64`, `#67`
- **Blocks:** `#70`, `#72`

### Purpose

Return every owned card copy for the authenticated player and no one else.

### Acceptance criteria

- [ ] Identity comes only from the validated token
- [ ] Only the authenticated player's copies are returned
- [ ] Duplicate owned copies remain distinguishable
- [ ] Gameplay and accessible display metadata are complete
- [ ] Cross-player access and answer/reward-secret exposure are prevented
- [ ] Empty, populated, duplicate, token, and ownership tests pass

---

## S2-09 - Build the card collection and starter selection experience

- **Gitea:** [#70](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/70)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `feature`, `frontend`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#69`, `#71`
- **Blocks:** `#73`

### Purpose

Let players choose their starter type and browse every owned card copy.

### Acceptance criteria

- [ ] Starter selection is one-time and server-authoritative
- [ ] The starter grant has three distinct Common creatures and two distinct Common power cards
- [ ] Collection cards show name, kind, type, rarity, attributes, moves, and copy state
- [ ] Information is not communicated only through artwork or colour
- [ ] Empty, authentication, API, mobile, keyboard, and screen-reader states are tested

---

## S2-10 - Implement the Basic card catalogue and starter grant rules

- **Gitea:** [#71](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/71)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Reviewer:** `Uzair - Data and Infrastructure Lead`
- **Labels:** `High Priority`, `backend`, `database`, `documentation`, `feature`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#64`
- **Blocks:** `#70`, `#72`, `#74`, `#77`, `#79`

### Purpose

Provide a data-driven card catalogue and safe one-time starter grant.

### Acceptance criteria

- [ ] Creature and Power cards are stored data rather than React constants
- [ ] Wit, Grit, Spark, Spirit, Mystic, rarity, stats, moves, and effects are validated
- [ ] The approved type-advantage cycle is implemented as shared pure rules
- [ ] Starter grants are Common-only, duplicate-free, composition-valid, and concurrency-safe
- [ ] The catalogue supports every starter type and later legal deck/CPU tests
- [ ] Card validation, type multiplier, seed, and starter transaction tests pass

---

## S2-11 - Implement saved deck persistence, validation, and selection API

- **Gitea:** [#72](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/72)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Reviewer:** `Tyron-Van-Tonder - API and Security Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#62`, `#69`, `#71`
- **Blocks:** `#73`, `#74`, `#75`

### Purpose

Store and select legal decks made only from card copies the player owns.

### Acceptance criteria

- [ ] Multiple saved decks and one active selection are supported
- [ ] Five-card, three-creature/two-power, and ten-point rules are server-enforced
- [ ] One copy can appear across loadouts but duplicate copies in one deck require ownership
- [ ] Players cannot read or mutate another player's decks
- [ ] Match snapshots remain unchanged after later deck edits
- [ ] Pure rules, CRUD, ownership, copy-count, migration, and OpenAPI tests pass

---

## S2-12 - Build the saved deck management and selection experience

- **Gitea:** [#73](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/73)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `feature`, `frontend`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#70`, `#72`
- **Blocks:** `#76`

### Purpose

Let players build, validate, and select a saved deck before a CPU match.

### Acceptance criteria

- [ ] Saved-deck list, create, edit, delete, and active selection work
- [ ] The picker uses owned copies and explains composition and point constraints
- [ ] Server validation maps to useful deck and field feedback
- [ ] Active selection is clear and keyboard-accessible
- [ ] Mobile, tablet, desktop, empty, conflict, and API failure states are tested

---

## S2-13 - Implement deterministic Basic CPU battle rules

- **Gitea:** [#74](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/74)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Reviewer:** `kevin-ebrahim - Product and Player Experience Lead`
- **Labels:** `High Priority`, `backend`, `documentation`, `feature`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#62`, `#71`, `#72`
- **Blocks:** `#75`

### Purpose

Create pure deterministic battle rules that the API can enforce for CPU matches.

### Acceptance criteria

- [ ] The approved interpretation resolves the course attribute-comparison and move-system conflict
- [ ] State transitions are deterministic for the same state, action, and random input
- [ ] Illegal actions cannot mutate match state
- [ ] Player and CPU obey the same legal-action rules
- [ ] Ties, type modifiers, power cards, defeat, replacement, timeout, and completion are defined
- [ ] Unit and invariant tests cover legal, illegal, and terminal transitions

---

## S2-14 - Create server-authoritative CPU matches and persist history

- **Gitea:** [#75](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/75)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Uzair - Data and Infrastructure Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `backend`, `database`, `feature`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#62`, `#63`, `#72`, `#74`
- **Blocks:** `#76`

### Purpose

Run CPU matches through the API and retain private completed results.

### Acceptance criteria

- [ ] Match creation accepts only the player's selected valid deck
- [ ] Deck/card/stat snapshots protect active and historical matches from later edits
- [ ] Each intended action is authorised, legal, current, and applied exactly once
- [ ] Concurrent stale actions are rejected safely
- [ ] Finished matches are immutable, persistent, and private to their player
- [ ] API, transaction, concurrency, rollback, history, and OpenAPI tests pass

---

## S2-15 - Build the CPU battle and completed match history experience

- **Gitea:** [#76](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/76)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Labels:** `High Priority`, `feature`, `frontend`, `testing`
- **Estimate:** `2.5 days`
- **Depends on:** `#62`, `#73`, `#75`
- **Blocks:** `#80`

### Purpose

Let mobile players complete a server-authoritative CPU match and revisit results.

### Acceptance criteria

- [ ] The client submits only an intended legal action, never stats or results
- [ ] Initial selection, turns, power cards, defeat, replacement, and finish states work
- [ ] Rejected or stale actions recover from refreshed authoritative state
- [ ] Completed matches appear in private history
- [ ] Keyboard, touch, screen-reader, responsive, and deterministic browser tests pass

---

## S2-16 - Implement protected author content APIs

- **Gitea:** [#77](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/77)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Tyron-Van-Tonder - API and Security Lead`
- **Reviewer:** `Uzair - Data and Infrastructure Lead`
- **Labels:** `High Priority`, `backend`, `database`, `documentation`, `feature`, `testing`
- **Estimate:** `3 days`
- **Depends on:** `#62`, `#63`, `#64`, `#71`
- **Blocks:** `#78`, `#79`

### Purpose

Allow authorised users to manage all content required by the Basic journey.

### Acceptance criteria

- [ ] Event, question/challenge, card, association, reward, and publication APIs exist
- [ ] Every operation requires validated identity and an authoritative author role
- [ ] Player routes never expose accepted answers
- [ ] Invalid locations, times, radii, questions, cards, and relationships are rejected
- [ ] Incomplete content cannot be published
- [ ] Authorised, forbidden, malformed, exposure, integrity, and OpenAPI tests pass

---

## S2-17 - Build the protected Basic author console

- **Gitea:** [#78](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/78)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `kevin-ebrahim - Product and Player Experience Lead`
- **Reviewer:** `Tyron-Van-Tonder - API and Security Lead`
- **Labels:** `High Priority`, `feature`, `frontend`, `testing`
- **Estimate:** `3 days`
- **Depends on:** `#62`, `#77`
- **Blocks:** `#79`

### Purpose

Provide authors a protected interface for managing complete playable content.

### Acceptance criteria

- [ ] Ordinary players cannot access author pages or operations
- [ ] Authors can create, edit, associate, and publish one complete event
- [ ] Map placement also has accessible coordinate inputs
- [ ] Validation identifies affected fields and accepted answers stay out of player routes
- [ ] Mobile, tablet, desktop, keyboard, forbidden, conflict, and API states are tested

---

## S2-18 - Seed a demonstrable and verified Basic game journey

- **Gitea:** [#79](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/79)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Reviewer:** `kevin-ebrahim - Product and Player Experience Lead`
- **Labels:** `High Priority`, `database`, `documentation`, `feature`, `research`, `testing`
- **Estimate:** `2 days`
- **Depends on:** `#62`, `#71`, `#77`, `#78`
- **Blocks:** `#80`

### Purpose

Provide enough verified content to demonstrate every Basic feature safely.

### Acceptance criteria

- [ ] A clean deterministic seed supports the complete Basic journey
- [ ] Demonstrable quizzes have at least five distinct verified questions
- [ ] Map events cover representative availability and eligibility states
- [ ] Cards support starter, legal deck, rarity, type, and CPU requirements
- [ ] Factual trivia and visual assets have reviewable sources and attribution
- [ ] Re-running the seed does not duplicate protected data

---

## S2-19 - Validate, harden, document, and release the complete Basic tier

- **Gitea:** [#80](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/80)
- **Project column:** `Backlog`
- **Milestone:** `Sprint 2`
- **Assignee:** `Caleb_P - Cards, Game Systems and Quality Lead`
- **Reviewer:** `Uzair - Data and Infrastructure Lead`
- **Labels:** `High Priority`, `backend`, `database`, `documentation`, `frontend`, `testing`
- **Estimate:** `3 days`
- **Depends on:** `#15`, `#20`, `#44`, `#45`, `#50`, `#60`, `#62-#79`
- **Blocks:** Basic-tier release

### Purpose

Prove that the complete Basic journey works across the web, API,
authentication, database, documentation, and deployed environments.

### Acceptance criteria

- [ ] The complete 21-step Basic vertical journey passes end to end
- [ ] Representative authentication, location, challenge, reward, deck, battle, and author failures are tested
- [ ] No browser-authoritative identity, eligibility, marking, reward, deck, or battle result remains
- [ ] Responsive, accessibility, security, concurrency, and location-privacy evidence is recorded
- [ ] Clean migrations, deterministic seeds, CI, builds, deployments, and smoke tests pass
- [ ] Public documentation covers setup, architecture, API, schema, auth, rules, authoring, testing, deployment, services, methodology, and AI use
- [ ] Every Basic checklist item has evidence or an explicit blocker

## Common completion requirements

Every Sprint 2 implementation issue is complete only when:

- [ ] Its acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Required formatting, linting, type-checking, tests, and builds have run
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] Resulting decisions, bugs, and follow-up work are recorded
- [ ] Documentation is updated when behaviour, setup, contracts, schema, or configuration changes
- [ ] AI assistance is attributed accurately where applicable

## AI declaration

This issue plan was prepared and reviewed with assistance from:

```text
Codex-CLI[GPT-5.6 Sol]
```
