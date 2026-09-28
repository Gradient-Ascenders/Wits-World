---
title: Sprint 3 overview
description: Advanced feature delivery, API and database references, testing, feedback, methodology, and release-readiness evidence for Sprint 3.
---

# Sprint 3 overview

**Documentation snapshot:** 28 September 2026, repository main `c0fd42b`.

Sprint 3 extends the campus exploration and collectible-card game with live
competition, longitudinal trust checks, automatic event placement, ranked
seasons, contested territories, trading, and operational analytics. Existing
Basic and Intermediate journeys remain part of the release regression surface.

Start with the [Advanced feature matrix](requirements/sprint-3-feature-matrix.md)
and [Advanced systems diagram](architecture/diagrams/advanced-systems.md).
Implementation status describes this revision; execution evidence belongs in
the [Sprint 3 validation snapshot](testing/sprint-3-validation-status.md).

## Reading guide

| Review area                           | Starting point                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Features and remaining acceptance     | [Feature matrix](requirements/sprint-3-feature-matrix.md)                                                                                                             |
| API and realtime behavior             | [API overview](architecture/api-overview.md), [live PvP](architecture/live-pvp-api-contract.md), [developer API](architecture/developer-api.md)                       |
| Data and authority                    | [Database guide](database/overview.md), [Advanced systems diagram](architecture/diagrams/advanced-systems.md)                                                         |
| Test procedures and recorded outcomes | [Validation snapshot](testing/sprint-3-validation-status.md), [testing strategy](testing/testing-strategy.md), [CI](testing/continuous-integration.md)                |
| User evaluation                       | [Testing process](testing/sprint-3-user-testing-plan.md), [15-response results](testing/sprint-3-user-feedback-results.md)                                            |
| Stakeholder follow-up                 | [Interaction index](planning/stakeholder-interactions/index.md#sprint-3-review-plans)                                                                                 |
| Methodology and coordination          | [Governance](planning/sprint-3-governance-and-evidence.md), [Scrum records](planning/scrum/index.md#sprint-3-record)                                                  |
| Deployment and operation              | [Azure setup](deployment/azure-deployment-setup.md), [ranked operations](deployment/ranked-operations.md), [database release](database/database-release-procedure.md) |

The [Sprint 2 overview](sprint-2-overview.md) remains the historical reading guide
for the preceding increment. Its dated release and feedback observations are
not automatically current Sprint 3 results.

## Milestone 3 evidence map

Source: the team-supplied _COMS3011A Project Brief_, section 3.3, printed and
PDF pages 10-11. The [original rubric excerpt](/files/assessment/milestone-3-rubric.pdf)
retains those two pages, including the Advanced, Intermediate, and Basic
descriptors. Advanced Automated Testing specifies "code coverage > 60%" across
all codebases; this is an assessment requirement, not a measured result.
The source file is `project_briefs.pdf`, SHA-256
`358dcf4b21c565e61fe89c9f96fe3ef6cf6252ad022db68b1a08405188679c71`.

The Milestone 3 rubric differs from Milestone 2. Product tiers come separately from
_Wits Quest_, section 1.1.3, printed pages 2-3; a product feature tier is not a
marking band.

| Criterion              | Weight | Evidence to present                                                                                                                                                                  | Remaining evidence to establish                                                                   |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| User feedback          | 10%    | [Process](testing/sprint-3-user-testing-plan.md), [response counts and themes](testing/sprint-3-user-feedback-results.md)                                                            | Broaden recovery and Author coverage; retain session provenance and record follow-up              |
| Automated testing      | 10%    | [Strategy](testing/testing-strategy.md), [configured verification](testing/automated-verification.md), [dated results](testing/sprint-3-validation-status.md)                        | Current coverage artifacts across every codebase; the strongest band specifies coverage above 60% |
| Feature implementation | 20%    | [Advanced requirement mapping](requirements/sprint-3-feature-matrix.md), source and linked PRs                                                                                       | Integrated demonstration and severity-based defect disposition                                    |
| API implementation     | 20%    | [HTTP/OpenAPI reference](architecture/api-overview.md), [realtime contract](architecture/live-pvp-api-contract.md), [external developer API](architecture/developer-api.md)          | Named deployed endpoint, authorization, error, retry, and realtime checks                         |
| Performance            | 5%     | [Battle response evidence](testing/api-battle-responsiveness.md), merged [PR #327](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/327)                                   | Authenticated mobile/desktop timings, warm/cold distinction, and two-client live delivery         |
| Improvement            | 5%     | [Finding traceability](testing/sprint-3-user-feedback-results.md#traceability-summary), [stakeholder action plans](planning/stakeholder-interactions/index.md#sprint-3-review-plans) | Decisions, resulting issue/PR links, and retests for accepted feedback                            |
| Documentation          | 15%    | This guide plus feature, API, database, testing, operational and dependency references                                                                                               | Publish this branch and keep descriptions aligned with the named release                          |
| Project methodology    | 15%    | [Workflow](planning/project-and-git-methodology.md), [governance](planning/sprint-3-governance-and-evidence.md), [coordination records](planning/scrum/index.md#sprint-3-record)     | Reconcile actual tracker ownership, reviews, board state, and release evidence                    |

The rubric map is a presentation guide, not a grade. Configured coverage
thresholds and merged code are not substitutes for coverage artifacts or
demonstrated behavior.

## Delivered workstreams

| Workstream                         | Current reference and implementation chain                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live PvP and spectators            | [Contract](architecture/live-pvp-api-contract.md), [persistence](database/live-pvp-persistence.md); PRs #281, #283, #285 and #318                                                                                                             |
| Trust and human review             | [Policy](requirements/longitudinal-trust-policy.md), [persistence](database/trust-persistence.md); PRs #282, #288, #293, #320 and #326                                                                                                        |
| Automatic event distribution       | [Policy](requirements/automatic-event-placement-policy.md), [service and Author workflow](architecture/automatic-event-placement-service.md), [persistence](database/automatic-event-placement-persistence.md); PRs #286, #287, #294 and #317 |
| Ranked seasons and matchmaking     | [Policy](requirements/ranked-competition-policy.md), [API](architecture/ranked-matchmaking-api-contract.md), [persistence](database/ranked-competition-persistence.md); PRs #289, #291, #295 and #321                                         |
| Contested territories              | [Rules](requirements/contested-campus-zone-policy.md), [API](architecture/contested-campus-territory-api-contract.md), [persistence](database/contested-campus-territory-persistence.md); PRs #290, #298, #299 and #319                       |
| Card trading                       | [Anti-drain policy](requirements/card-trading-policy.md), [API](architecture/card-trading-api-contract.md), [persistence](database/card-trading-persistence.md); PRs #292, #300, #301 and #324                                                |
| Author operational analytics       | [API](architecture/advanced-analytics-api-contract.md), [aggregate storage](database/advanced-analytics.md); PRs #302 and #303                                                                                                                |
| External developer access          | [Read-only API and key usage](architecture/developer-api.md), [credential storage](database/developer-api-keys.md); PR #304                                                                                                                   |
| Usability and integrity follow-ups | Accessibility #306, evolution availability #313, Author packages #315, swaps #323, navigation #325, performance #327, responsive battle polish #328, and account purge #329                                                                   |

PR numbers refer to merge-history evidence at the pinned revision. Follow their
links or the current Gitea tracker for review discussion and live disposition.

## Feedback and release follow-up

The [feedback report](testing/sprint-3-user-feedback-results.md) retains all 15
submitted rows, including three identical answer sets. It identifies six
proposed findings. Thirteen submissions rate battle delay acceptable, but
recovery has only two applicable responses and Author review only one. New
finding-specific fixes and participant retests remain to be linked.

The stakeholder pages cover the team-supplied 21, 23, and 25 September topics.
They are review plans with independently checked implementation progress.
Randomized territory placement and Upstash-backed distributed limits are
follow-up proposals, not delivered features. Current automatic event placement
and process-local developer quotas must not be presented as those extensions.

Before declaring the increment ready, demonstrate the core journey, a live
match with reconnect and spectator access, ranked settlement, territory
influence, a bilateral trade, placement preview/apply, and role-protected Author
analytics/review. Record the revision, environment, outcome, and unresolved
defects using the [validation snapshot](testing/sprint-3-validation-status.md)
and [Sprint Review](planning/scrum/sprint-3/sprint-review.md).

## AI declaration

This Sprint 3 reading guide was generated and edited with assistance from
Codex-CLI[gpt-6-sol], using the supplied briefs, repository merge history, and existing
technical, feedback, and stakeholder documents. Codex-CLI[gpt-6-luna] assisted
with verification of the linked rubric source.
