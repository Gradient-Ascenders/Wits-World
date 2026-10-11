---
title: Sprint 3 governance and evidence
description: Sprint 3 ownership, dependencies, review workflow, feedback handling and release evidence.
---

# Sprint 3 governance and evidence

**Snapshot:** 28 September 2026, main `c0fd42b`.

This page applies the existing [project methodology](project-and-git-methodology.md)
to the Advanced increment. Gitea issues, comments, reviews, and board metadata
remain authoritative for live work. Role guidance and this snapshot do not
override a newer assignee, dependency, or release decision.

## Sprint goal and ownership

Deliver the seven Advanced groups in the Wits Quest brief while preserving the
Basic/Intermediate player loop: live and spectator battles, longitudinal trust
and human review, automatic walkable event placement, ranked competition,
contested territories, bilateral card trading, and operational analytics.

| Coordination role                     | Lead              | Responsibility and handoff                                                                               |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Frontend and player/Author UX         | Kevin Ebrahim     | Accessible workflows, authoritative-state presentation and browser/participant checks                    |
| Backend and security                  | Tyron Van Tonder  | Authentication/authorization, HTTP/realtime services, deadlines, retries and service integration         |
| Database and cross-stack support      | Uzair Mahomed     | Persistence, migrations, spatial/rating/trade integrity, contracts and targeted frontend/backend support |
| Quality, content and delivery support | Caleb Perumalsamy | Content review, test/release evidence, operational checks and extra integration work                     |

These are team role responsibilities, not a claim that one person authored
every change in a stream. Actual assignment and independent review belong to
the linked work item and PR.

## Readiness and dependencies

An actionable issue needs a bounded problem, included/excluded scope,
acceptance criteria, owner, independent reviewer, priority, estimate, milestone,
board position, test/documentation needs, and only genuine blockers.

| Dependency boundary | Required input                                                        | Work that can proceed independently               |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Live runtime        | Stable contract and durable match/connection model                    | UI layout, accessibility and projection fixtures  |
| Ranked competition  | Persisted seasons/ratings plus live match lifecycle                   | Policy, standings UI, controlled season fixtures  |
| Territory influence | Reviewed versioned geometry and ranked result settlement              | Map/list presentation and explanatory text        |
| Trading             | Ownership/reservation invariants and atomic offer/settlement contract | Offer comparison UI and confirmation wording      |
| Trust review        | Bounded evidence, score/case persistence and decision versioning      | Human-review layout and evidence summaries        |
| Placement           | Reviewed walkable sites, coverage policy and atomic plan application  | Preview ledger, diagnostics and Author controls   |
| Analytics           | Defined aggregate sources and suppression rules                       | Accessible tables, filters and empty/error states |

Do not turn preferred sequencing, reviewer availability, or an unrelated stream
into a native issue blocker. Start against a stable contract when integration
can be completed later without inventing backend behavior.

## Delivery workflow and Definition of Done

Use the [issue-to-merge workflow](work-tracking-and-issue-management.md): refined
issue, branch from current main, focused implementation, relevant checks,
independent review, successful required CI, authorized merge, and tracker
reconciliation. Preserve unrelated work and disclose AI assistance.

- Changes to protected behavior require meaningful failure, authorization,
  concurrency or retry checks, not merely tests that mirror the implementation.
- Run affected checks after edits. For database changes, use targeted
  clean/upgrade/persistence checks on disposable test databases or ephemeral
  PostGIS; do not repeatedly rerun the whole hosted matrix without a reason.
- Keep API contracts, database migration/retention descriptions, dependency
  motivation, and operator instructions aligned with the code change.
- Record exact commands, revision, environment and outcomes. A configured
  workflow, passing narrow test, merge, or issue closure proves only its own
  evidence class.
- Confirm acceptance checklists, issue/board state and remaining manual gates
  before calling an issue complete. Do not infer current tracker closure from
  this historical snapshot.

## Feedback workflow

| Stage       | Required record                                                                         |
| ----------- | --------------------------------------------------------------------------------------- |
| Collected   | Actual questionnaire or interaction source, collection date/window and privacy handling |
| Evaluated   | Impact, reproduction needs, applicable denominator and proposed response                |
| Decided     | Accept, defer or reject with reason, accountable owner and review                       |
| Implemented | Specific issue, PR, revision and relevant checks                                        |
| Retested    | Named build/session, affected task outcome, assistance and remaining concern            |

The [Sprint 3 feedback report](../testing/sprint-3-user-feedback-results.md)
contains 15 submitted responses and six proposed findings. Triage action-result
uncertainty and recovery first, then clarity/discovery concerns. If a defect is
reported in YouTrack, cross-link its report to the Gitea implementation issue
and PR; avoid conflicting closure states between the report and delivery work.

The [stakeholder index](stakeholder-interactions/index.md#sprint-3-review-plans)
contains planned reviews for the supplied 21/23/25 September topics. Existing
CPU/live transport and account purge work is linked separately from the
interaction. Randomized territories and Upstash limits still need their own
decision, implementation scope, issue, and validation.

## Coordination and retained evidence

The [Sprint 3 report](scrum/sprint-3/report.md) mirrors Sprint 2:
planning, four delivery checkpoints, refinement, review, and retrospective.
The checkpoints summarize repository windows, and the review/retrospective
capture release-readiness and process actions. Add actual meeting attendance,
dates and approvals when supplied. Five supplied Sprint 3 photos are retained
with [numbered provenance](scrum/index.md#sprint-3-photo-provenance); their
meeting mapping remains to be confirmed. Do not reuse Sprint 2 photos as Sprint 3 evidence.

Keep raw survey exports, consent/provenance notes, personal information,
credentials, auth state and exact location histories outside the public repo.
Publish sanitized aggregates, necessary explanations, links and outcomes.

## Release-readiness ledger

| Gate                                | Evidence location                                                                | Current boundary                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Advanced feature mapping            | [Feature matrix](../requirements/sprint-3-feature-matrix.md)                     | Seven feature groups have implementation references; deployed acceptance remains separate |
| Automated quality                   | [Validation snapshot](../testing/sprint-3-validation-status.md)                  | Focused results and configured gates distinguished from a full release/coverage run       |
| User evaluation and improvement     | [Feedback report](../testing/sprint-3-user-feedback-results.md)                  | New finding-specific issues/fixes/retests remain to be recorded                           |
| Stakeholder evaluation              | [Review plans](stakeholder-interactions/index.md#sprint-3-review-plans)          | Demonstrations and itemized acceptance still to be recorded                               |
| API, spatial and operational checks | [Review checklist](scrum/sprint-3/report.md#sprint-review)                       | Named deployment, real-campus and operator verification needed                            |
| Documentation publication           | [Docs deployment](../testing/continuous-integration.md#documentation-publishing) | Local build does not publish this branch                                                  |

## AI declaration

This governance page was generated and edited with assistance from Codex-CLI[gpt-6-sol] using
team role guidance, existing methodology, repository evidence, and the Sprint 3
feedback and stakeholder plans.
