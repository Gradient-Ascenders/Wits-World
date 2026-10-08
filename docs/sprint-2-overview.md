---
title: 'Sprint 2 overview'
description: A reading guide to Sprint 2 capabilities, verification, user feedback, stakeholder reviews, and remaining evidence gaps.
---

# Sprint 2 overview

For a presentation walkthrough, open the [Visual guide and diagrams](architecture/diagrams/index.md).

Start here to review Sprint 2. This page connects the repository's current
reference and dated evidence; it does not replace the Gitea tracker or certify
that every feature has passed deployed acceptance testing.

## Meeting starting point

**Meeting:** 15 September 2026. **Evidence audit:** 14 September 2026.

Wits Quest takes players from campus event discovery through a timed challenge,
server-selected card rewards, collection/deck building and turn-based battles.
The browser presents the game; Fastify authorises and resolves player intent;
PostgreSQL/PostGIS owns persistent and spatial state. Auth0 supplies identity
and Mapbox supplies map presentation. See the
[architecture overview](architecture/overview.md) and
[system context](architecture/diagrams/system-context.md).

- [Live app](https://witsworld.co.za) and [public docs](https://wits-world-docs.pages.dev).
- [Public interactive API](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/).
- [Basic/Intermediate feature and evidence matrix](requirements/sprint-2-feature-matrix.md).
- [Dated test, CI, deployment and limitation snapshot](testing/sprint-2-validation-status.md):
  includes the 13 September local release results and their outstanding acceptance gaps.

Main revision `9a2f941` has recorded successful CI and application/docs deployments.
The complete release acceptance remains open under #167. The status page
separates those results from participant retests, field checks and the supplied
nightly failure. This update itself still requires publication.

## Meeting evidence map

Source: _COMS3011A Project Brief_, section 3.2, printed pages 9–10, supplied by
Kevin for this audit. The weights below match the original Milestone 2 rubric.
This is an evidence guide, not a predicted grade or claim that every band is met.

| Criterion                      | Weight | Open during the meeting                                                                                                                                                                                                                                                                                                 | Evidence boundary                                                                                                          |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Core features                  | 25%    | [Feature matrix](requirements/sprint-2-feature-matrix.md), [Basic reference](basic-release-reference.md)                                                                                                                                                                                                                | Demonstrate deployed behaviour; implementation alone does not establish the permitted bug count                            |
| Automated testing              | 10%    | [Dated results](testing/sprint-2-validation-status.md), [testing strategy](testing/testing-strategy.md)                                                                                                                                                                                                                 | UI/API coverage and specific results; outstanding nightly and manual gates remain visible                                  |
| Stakeholder reviews            | 10%    | [Meeting 2 — Database & hosting](planning/stakeholder-interactions/2026-09-04-database-usage-review.md), [Meeting 3 — Trails & card artwork](planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review.md), [Meeting 4 — Frontend UI](planning/stakeholder-interactions/2026-09-11-frontend-ui-review.md) | Records distinguish feedback, evaluation, changes and missing follow-up                                                    |
| API                            | 15%    | [API overview/OpenAPI](architecture/api-overview.md), [external integrations](architecture/external-integrations.md)                                                                                                                                                                                                    | Public API docs and implemented integrations; HTTP reachability is not an authenticated end-to-end pass                    |
| User feedback                  | 10%    | [Formal process](testing/sprint-2-user-testing-plan.md), [actual results and issue/change trail](testing/sprint-2-user-feedback-results.md)                                                                                                                                                                             | Ten responses, five accepted findings; incomplete change/retest evidence is identified                                     |
| Project methodology            | 10%    | [Project/Git methodology](planning/project-and-git-methodology.md), [Sprint 2 governance](planning/sprint-2-governance-and-evidence.md)                                                                                                                                                                                 | Show actual issues/PRs and recorded meetings; process documentation alone is insufficient                                  |
| Bug tracker                    | 5%     | [Work/bug tracking](planning/work-tracking-and-issue-management.md), [Gitea issues](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues)                                                                                                                                                                        | Tracker is authoritative; old planning checkboxes are not live status                                                      |
| Database documentation         | 5%     | [Schema and relationship guide](database/overview.md), [deployment](database/neon-postgis-setup.md), [migrations](database/database-release-procedure.md), [database technology](architecture/technology-stack.md#postgresql-postgis-and-pg)                                                                            | Distinguish schema reference from proof of production migration/recovery                                                   |
| Third-party code documentation | 5%     | [Software/services and motivations](architecture/technology-stack.md#application-stack)                                                                                                                                                                                                                                 | Direct dependencies, supporting tooling and unused declarations are distinguished; transitive inventory is in the lockfile |
| Testing documentation          | 5%     | [Policy and procedures](testing/testing-strategy.md), [CI](testing/continuous-integration.md), [formal user-testing process](testing/sprint-2-user-testing-plan.md)                                                                                                                                                     | Procedures and completed results are separate pages                                                                        |

Also keep [AI-use declarations](planning/ai-use.md) and
[deployment/setup](deployment/azure-deployment-setup.md) available.

## Sprint meetings and process evidence

Read the [Sprint 2 report](planning/scrum/sprint-2/report.md) for planning,
four Daily Scrums with meeting photos, backlog refinement, Review, and
Retrospective in one document. It incorporates the ceremony records introduced in
[PR #248](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/248).

The [sprint records index](planning/scrum/index.md) retains source and image
provenance across all sprints. Record dates and reporting windows remain
separate from image provenance and dated test/deployment evidence.

## Product and player journeys

The [Basic release overview](basic-release-reference.md) describes the core
explore → challenge → reward → collection → deck → battle journey and setup.
Sprint 2 reference includes:

| Area                         | Rules, contracts, and implementation reference                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progression and trails       | [Progression rules](requirements/player-progression-rules.md), [ordered trails](requirements/ordered-trails-rules.md)                                                              |
| Collection and evolution     | [Evolution rules](requirements/card-evolution-rules.md), [card roster](design/basic-card-roster.md)                                                                                |
| Player battles               | [Asynchronous PvP journey](requirements/player-asynchronous-pvp-journey.md), [API contract](architecture/asynchronous-pvp-api-contract.md)                                         |
| Offline challenges           | [Offline play and reconciliation](architecture/offline-challenge-play.md)                                                                                                          |
| Player account lifecycle     | [Deletion and retention](database/account-deletion-retention.md), [validation and external checks](testing/player-account-lifecycle-validation.md)                                 |
| Author tools and campaigns   | [Author curation contract](architecture/author-curation-api-contract.md), [campaign scheduling](architecture/campaign-scheduling-api-contract.md)                                  |
| Location and content quality | [Movement evidence](database/movement-evidence.md), [question analytics](database/question-performance-analytics.md), [verified event content](database/verified-event-content.md) |

The browser submits intent and renders authoritative server results. Reading
these documents is not evidence that a feature has been deployed or field-tested.

## User feedback and stakeholder reviews

The [Sprint 2 user-feedback report](testing/sprint-2-user-feedback-results.md)
records ten questionnaire responses, five accepted findings, their issue/PR
links, and the limits of the evidence. Reported concerns cover battle behaviour,
latency, battle-state clarity, deck validation, and first-time event/quiz/reward guidance. Issue closure
is not a substitute for a recorded participant retest.

Read the [testing plan](testing/sprint-2-user-testing-plan.md) alongside the
results. The plan describes the intended process; the results describe the
collected evidence.

Browse [all meetings with Calvin Rea](planning/stakeholder-interactions/index.md).

Sprint 2 stakeholder records:

- [Meeting 2 — Calvin Rea: Database & hosting (4 September), with photo](planning/stakeholder-interactions/2026-09-04-database-usage-review.md).
- [Meeting 3 — Calvin Rea: Trails & card artwork (8 September)](planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review.md).
- [Meeting 4 — Calvin Rea: Frontend UI (11 September)](planning/stakeholder-interactions/2026-09-11-frontend-ui-review.md).

## Verification and remaining gaps

- [Testing strategy](testing/testing-strategy.md) describes the verification layers.
- [Automated verification](testing/automated-verification.md) and
  [CI](testing/continuous-integration.md) explain the configured gates.
- [API and battle responsiveness](testing/api-battle-responsiveness.md) separates
  measured implementation evidence from deployed interaction timing.
- [Player account validation](testing/player-account-lifecycle-validation.md)
  records provider-owned and manual checks.
- [Location field-test protocol](requirements/location-eligibility-field-test.md)
  covers real-device evidence. Poor-GPS alternative proof remains unimplemented;
  current eligibility rules still apply.

The user-feedback report identifies outstanding deployed follow-up sessions.
Keep these limits visible when preparing a demo or submission; do not relabel
local tests or closed issues as stakeholder acceptance.

## Governance and historical context

Use [Sprint 2 governance and evidence](planning/sprint-2-governance-and-evidence.md)
for the evidence map and gaps, and [work tracking](planning/work-tracking-and-issue-management.md)
for the current issue-to-review process. Sprint 1 records remain available in
clearly labelled historical sections. The historical Sprint 2 issue plan is a
planning record; Gitea remains authoritative for live scope and status.

## AI declaration

This reading guide was prepared with assistance from Codex-CLI[GPT-6] using
existing repository records. It adds navigation, not new acceptance evidence.

Page title clarified with assistance from Codex-CLI[GPT-6].

Sprint report links updated with assistance from Codex[GPT-6].
