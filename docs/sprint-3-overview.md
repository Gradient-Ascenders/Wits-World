---
title: Sprint 3 overview
description: A concise map from the Milestone 3 rubric to Wits Quest evidence and known gaps.
---

# Sprint 3 overview

**Snapshot:** 28 September 2026, repository `main` at `c0fd42b`.

This is a dated Milestone 3 guide, not a current release audit. Sprint 3 added
live competition, trust review, automatic event placement, ranked play,
contested territories, card trading, and operational analytics. Basic and
Intermediate journeys still form part of the regression scope.

For a short technical tour, open the
[Advanced systems diagram](architecture/diagrams/advanced-systems.md). For
feature status, use the
[Advanced feature matrix](requirements/sprint-3-feature-matrix.md). For test
results and limits, use the
[Sprint 3 validation status](testing/sprint-3-validation-status.md).

Read the [Sprint 3 report](planning/scrum/sprint-3/report.md) for planning,
coordination snapshots, refinement, Review evidence, and Retrospective
recommendations in one document. It preserves the dated repository evidence
and the gaps in ceremony and acceptance records.

## Milestone 3 evidence map

The source is section 3.3 of the team-supplied _COMS3011A Project Brief_,
printed pages 10–11. The
[rubric excerpt](/files/assessment/milestone-3-rubric.pdf) preserves those
pages. Its Advanced automated-testing band requires coverage above 60% across
all codebases. A configured threshold is not a measured result.

| Criterion              | Weight | Main evidence                                                                                                                                                                       | Still needed                                                     |
| ---------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| User feedback          |    10% | [Test plan](testing/sprint-3-user-testing-plan.md) and [15-response report](testing/sprint-3-user-feedback-results.md)                                                              | More recovery and Author tasks, with recorded retests            |
| Automated testing      |    10% | [Test strategy](testing/testing-strategy.md), [automation guide](testing/automated-verification.md), and [dated status](testing/sprint-3-validation-status.md)                      | Current coverage reports for every codebase                      |
| Feature implementation |    20% | [Feature matrix](requirements/sprint-3-feature-matrix.md) and linked pull requests                                                                                                  | One integrated demonstration and a reviewed defect list          |
| API implementation     |    20% | [API overview](architecture/api-overview.md), [live PvP contract](architecture/live-pvp-api-contract.md), and [developer API](architecture/developer-api.md)                        | Deployed authentication, error, retry, and realtime checks       |
| Performance            |     5% | [Battle response evidence](testing/api-battle-responsiveness.md)                                                                                                                    | Mobile and desktop timings, including warm and cold cases        |
| Improvement            |     5% | [Feedback traceability](testing/sprint-3-user-feedback-results.md#traceability-summary) and [stakeholder records](planning/stakeholder-interactions/index.md#sprint-3-review-plans) | Links from each accepted finding to its change and retest        |
| Documentation          |    15% | Product, API, database, test, deployment, and process guides on this site                                                                                                           | Publish the reviewed revision and keep status statements current |
| Project methodology    |    15% | [Team workflow](planning/project-and-git-methodology.md), [governance](planning/sprint-3-governance-and-evidence.md), and [Scrum record](planning/scrum/index.md#sprint-3-record)   | Reconcile tracker state, reviews, and release evidence           |

This table helps markers find evidence. It does not predict a grade.

## Delivered workstreams

| Area                          | Main references                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live and ranked battles       | [Live PvP](architecture/live-pvp-api-contract.md), [ranked competition](architecture/ranked-matchmaking-api-contract.md), and their persistence guides     |
| Trust and moderation          | [Trust policy](requirements/longitudinal-trust-policy.md) and [trust storage](database/trust-persistence.md)                                               |
| Placement and territories     | [Automatic placement](architecture/automatic-event-placement-service.md) and [territory API](architecture/contested-campus-territory-api-contract.md)      |
| Trading                       | [Trade policy](requirements/card-trading-policy.md), [API](architecture/card-trading-api-contract.md), and [storage](database/card-trading-persistence.md) |
| Analytics and external access | [Analytics API](architecture/advanced-analytics-api-contract.md) and [developer API](architecture/developer-api.md)                                        |

## Evidence limits

The feedback report contains 15 submissions, including three identical answer
sets. Only two submissions covered reconnect and one covered Author review.
These results are useful signals, but they are not broad acceptance evidence.

Before claiming release readiness, record an integrated run of the core player
journey, live reconnect and spectator access, ranked settlement, territory
influence, trading, placement, and Author analytics. Each result should name
the revision, environment, outcome, and unresolved defects.

The original rubric source was `project_briefs.pdf`, SHA-256
`358dcf4b21c565e61fe89c9f96fe3ef6cf6252ad022db68b1a08405188679c71`.

## AI declaration

This guide was generated and edited with assistance from
Codex-CLI[gpt-6-sol] and Codex-CLI[gpt-6-luna]. It was simplified with
assistance from Codex[GPT-5].

Sprint report links updated with assistance from Codex[GPT-6].
