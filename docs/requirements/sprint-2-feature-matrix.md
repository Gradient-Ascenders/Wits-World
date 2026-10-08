---
title: 'Sprint 2 features and progress'
---

# Sprint 2 features and progress

**Snapshot:** 14 September 2026, against main revision `9a2f941`.

This matrix connects the team's requirements to implementation references and
remaining acceptance evidence. The course's _COMS3011A Project Brief_, section
2.7, describes the campus exploration, trivia, collectible-card, and battle loop;
it does not enumerate the detailed Wits Quest tier rules. Tier assignments below
come from the linked team requirements and Gitea decisions. The rubric's
Advanced/Intermediate/Basic **marking bands** are not product feature tiers.

**Implemented** means the referenced source/contracts exist in this revision.
It does not mean every deployed or participant check passed. Use the
[dated test and release snapshot](../testing/sprint-2-validation-status.md) for
execution evidence and the [decision register](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/docs/requirements/basic-tier-decision-register.md)
for the full BASIC-01–19 decisions.

## Basic and cross-project requirements

| Requirement                                          | Repository status and evidence                                                                                                                                                                                | Remaining acceptance boundary                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Registration, login, password reset, deletion        | Implemented Auth0 and account lifecycle; [rules](basic-game-rules.md#roles-authority-and-account-lifecycle), [account validation](../testing/player-account-lifecycle-validation.md); issues #160/#161 closed | Provider email, recent-authentication and deletion smoke evidence                   |
| Event discovery and location eligibility             | Implemented map and semantic list; [location journey](player-location-journey.md), [spatial rules](../database/event-eligibility.md)                                                                          | Real-campus device/accuracy checks; reported location is not proof of presence      |
| Five-question challenge and completed review         | Implemented server timers, marking and answer privacy; [rules](basic-game-rules.md#event-challenge), [attempt contract](../architecture/challenge-attempt-api-contract.md)                                    | Full deployed journey and quiz/reward usability follow-up                           |
| Reward, collection and starter cards                 | Implemented atomic card rewards and owned-copy persistence; [persistence](../database/challenge-reward-persistence-design.md), [release journey](../testing/basic-tier-release-validation.md)                 | Deployed retry/recovery and player comprehension                                    |
| Complete card catalogue and move rules               | Migration 0041 supplies the 30-card ordinary catalogue and four moves per Creature; [catalogue](../design/basic-card-roster.md); #164 closed                                                                  | Confirm deployed migration/content, presentation and balance review                 |
| Saved decks and CPU battles                          | Implemented [deck journey](player-deck-building-journey.md), [CPU journey](player-cpu-battle-journey.md), [battle rules](basic-game-rules.md#cpu-battles)                                                     | Feedback #240–#244 retests; deck-validation integration evidence remains incomplete |
| Author workflow                                      | Implemented review/publication, multiple-choice and ordering editors; [Author contract](../architecture/author-curation-api-contract.md)                                                                      | Independent content review and deployed role/workflow checks                        |
| Responsive and accessible experience                 | [Accessibility](../design/design-system.md), semantic/component tests and browser checks described in [testing strategy](../testing/testing-strategy.md)                                                      | Recorded real-device, keyboard and screen-reader acceptance                         |
| Separate frontend/backend and hand-written API       | React/Vite, Fastify and PostgreSQL/PostGIS; [architecture](../architecture/overview.md), [API](../architecture/api-overview.md), [database](../database/overview.md)                                          | External/public reachability is recorded separately from authenticated gameplay     |
| External integration, CI/CD and public documentation | [Integration boundaries](../architecture/external-integrations.md), [CI](../testing/continuous-integration.md), [deployment](../deployment/azure-deployment-setup.md)                                         | Service/operator evidence; this documentation branch must be published              |

## Intermediate systems and additional delivered work

| Area                                             | Repository status and evidence                                                                                                                                                                                             | Remaining limitation                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Ordering challenges                              | Implemented persistence, API, player interaction and Author editor; #162/#163 closed; [attempt](../architecture/challenge-attempt-api-contract.md) and [Author contracts](../architecture/author-curation-api-contract.md) | Real participant and deployed checks remain separate                                                               |
| Progression, achievements, streaks and standings | Implemented; #171–#173 closed; [rules](player-progression-rules.md), [persistence](../database/player-progression-persistence.md)                                                                                          | Deployed acceptance and privacy review                                                                             |
| Three-copy card evolution                        | Backend and collection UI implemented; #174/#175 closed; [evolution rules](card-evolution-rules.md)                                                                                                                        | Saved-deck locks, concurrency and UI evidence are in the linked reference; participant acceptance remains separate |
| Coins, selling and shop                          | Deferred by #193; [progression decision](player-progression-rules.md)                                                                                                                                                      | Do not present old selling issue titles or checked boxes as a shipped sale API                                     |
| Ordered trails and nearby discovery              | Implemented; #176/#177 closed; [rules](ordered-trails-rules.md), [persistence](../database/ordered-trails-persistence.md)                                                                                                  | On-campus trail acceptance                                                                                         |
| Asynchronous PvP                                 | Implemented polling, invitations and server deadlines; [journey](player-asynchronous-pvp-journey.md), [contract](../architecture/asynchronous-pvp-api-contract.md)                                                         | Not live synchronous PvP; deployed two-player and timeout evidence                                                 |
| Offline challenges                               | Implemented local persistence and authoritative reconciliation; [offline contract](../architecture/offline-challenge-play.md)                                                                                              | Device/storage/service-worker and reconnect acceptance; offline client state does not grant rewards                |
| Movement and attempt checks                      | Implemented bounded movement evidence and checks; #168/#169 closed; [movement evidence](../database/movement-evidence.md)                                                                                                  | Real-device false-positive testing; no claim of spoof-proof presence                                               |
| Poor-GPS alternative proof                       | Unimplemented; closing #170 did not deliver alternative proof                                                                                                                                                              | No approved/deployed independent fallback is claimed                                                               |
| Ten events and one hundred questions             | Repeatable, sourced content pack and validations exist; #165 closed; [content reference](../database/verified-event-content.md)                                                                                            | Independent factual/presentation review and controlled production seeding                                          |
| Campaigns and question analytics                 | Additional implemented contracts; [campaigns](../architecture/campaign-scheduling-api-contract.md), [analytics](../database/question-performance-analytics.md)                                                             | These are additional scope, not evidence that all Advanced features are complete                                   |

## Release decision

[Release issue #167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
was open at this audit. No blanket claim that the complete Basic or Intermediate
tier has passed acceptance is made. Closed issues, merged implementation,
automated checks and participant acceptance are distinct evidence.

## AI declaration

Prepared and reviewed with assistance from Codex-CLI[GPT-6], using the supplied
course brief, repository source/documents and read-only Gitea evidence.

Page title clarified with assistance from Codex-CLI[GPT-6].
