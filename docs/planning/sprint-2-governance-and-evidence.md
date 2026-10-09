---
title: 'Sprint 2 process and evidence'
description: The Sprint 2 tracker workflow, rubric evidence map, ceremonies, feedback handling, and current governance gaps.
---

# Sprint 2 process and evidence

This page defines how Wits World records Sprint 2 work and evidence while the
work happens. The
[Wits-World Gitea tracker](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues)
is authoritative for current issue state, ownership, dependencies, discussion,
review, and delivery links. Repository documentation records the durable
process, decisions, and evidence; it must not be used to override newer tracker
state.

The dated tracker observations below are an audit snapshot, not a second
backlog. Recheck Gitea before using them to make a current-status decision.

## Meeting audit — 14 September 2026

The [Milestone 2 overview](../sprint-2-overview.md) maps the original rubric to
current documentation, and the [test/release snapshot](../testing/sprint-2-validation-status.md)
records inspected CI/deployment and public reachability evidence for main
revision `9a2f941`. Read-only Gitea inspection now shows #159 closed and release
validation #167 still open. The August counts and tracker-hygiene observations
below are historical; this audit did not recheck board columns or native dependencies.

The formal feedback report records ten questionnaire responses, five accepted
findings and their implementation/retest limits. It does not establish that all
release acceptance or stakeholder follow-up has been completed.

The teammate's [13 September release results](../testing/sprint-2-validation-status.md#teammate-recorded-local-release-evidence--13-september)
record local checks and their limits. The [formal user-testing plan](../testing/sprint-2-user-testing-plan.md)
defines the remaining observed sessions, accessibility/device checks, stakeholder
review, and retests. The execution snapshot predates the newer feedback documentation; both are
linked without treating blank templates as completed evidence.

## Scrum record integration — 15 September 2026

[PR #248](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/248) adds
Sprint 2 planning, four Daily Scrums, backlog refinement, Review and Retrospective.
They are linked from the [sprint meeting overview](scrum/index.md#sprint-2-record).
The four supplied meeting photos are attached in Kevin's confirmed order, with
[their provenance recorded separately](scrum/index.md#sprint-2-meeting-photos).

This supplements the 14 September documentation snapshot; it does not rerun or
replace its test results or establish a new release acceptance. Sprint 1
records, attachments, evidence limits and attribution are preserved.

## Historical administrative starting point

Read-only Gitea inspection on 28 August 2026 found:

- the `Sprint 1` milestone closed with `0` open and `86` closed issues;
- the `Sprint 2` milestone open, due 15 September 2026, with `19` open and `2`
  closed issues;
- [issue #159](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/159)
  open, assigned to `Caleb_P`, with its reviewer, estimate, and planned
  `Backlog` column recorded in the issue body; and
- no comments or native dependencies on #159, which agrees with its declared
  `Depends on: None`.

Sprint 1 is therefore administratively closed in the live milestone. Its
[Review](scrum/sprint-1/report.md#sprint-review) and
[Retrospective](scrum/sprint-1/report.md#sprint-retrospective) are conservative
reconstructions, not contemporaneous minutes. Closure does not convert their
documented manual, stakeholder, field, accessibility, deployment, or operator
evidence gaps into passes; those boundaries remain in the
[Sprint 1 evidence index](../testing/sprint-1-evidence-index.md).

## Sprint goal and planning boundary

The live Sprint 2 milestone describes the goal as completing remaining Basic
requirements and delivering the first Intermediate systems: account lifecycle,
a second challenge format, production content, movement checks, progression,
duplicate economy, trails, and the asynchronous PvP contract.

That milestone description and each current issue determine scope. The
[Sprint 2 report](scrum/sprint-2/report.md#planning) retains historical planning
and ownership context. Earlier Basic implementation plans reused planning IDs
later assigned to #159 onward; those identifiers do not define the current backlog.

## Issue readiness and live workflow

Before an issue moves from `Backlog`, confirm all of the following in Gitea:

| Field                   | Required record                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Owner                   | A current assignee accountable for delivery and coordination                                        |
| Reviewer                | A named reviewer in the issue plan and an actual independent reviewer on the pull request           |
| Estimate                | A bounded estimate in the issue body; revise it when scope materially changes                       |
| Labels                  | One priority label plus relevant work-type and area labels                                          |
| Milestone               | `Sprint 2` only when the work belongs to the current milestone                                      |
| Dependencies            | Native Gitea dependency links for true blockers; readable `Depends on` and `Blocks` text must agree |
| Acceptance and evidence | Testable criteria, required documentation, and manual or external evidence boundaries               |
| Board state             | The column that matches current reality, not the originally planned column in a Markdown snapshot   |

Use this board workflow:

| Column          | Meaning                                                                     | Exit condition                                                                                |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Backlog`       | Refined or awaiting refinement; implementation has not started              | Ready metadata is complete and the owner starts the issue branch                              |
| `In Progress`   | Active implementation, documentation, investigation, or evidence collection | A reviewable pull request exists with the performed checks recorded                           |
| `Review & Test` | Human review, CI, manual checks, or evidence reconciliation is active       | Required review and checks pass, or findings return the issue to active work                  |
| `Done`          | Merged and reconciled through the authorised path                           | Acceptance evidence and remaining follow-ups match the issue; unresolved gates are not hidden |

The issue and pull request remain the detailed records if a board card lags.
Update the board during the weekly review and whenever work starts, enters
review, returns for correction, or is merged.

### Tracker audit and actions still required

The 28 August read-only audit found that all twenty planned issues #159–#178
had an assignee, reviewer, estimate, labels, `Sprint 2` milestone, planned
`Backlog` field, and native dependencies matching their declared blockers.
[Issue #167 (`S2-09`)](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
correctly had native dependencies on #159–#166, including #159.

One additional Sprint 2 issue,
[#193](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/193), had an
owner, reviewer, estimate, priority/area labels, and a body-level dependency on
#171, but no planning ID, planned project column, or native dependency link.
Read-only repository and API inspection also did not expose an active repository
project board. The available label set did not contain `usability`; this is an
optional future tracker-hygiene improvement and is not a blocker for this
documentation issue.

The team must therefore complete these live-tracker actions before claiming the
corresponding acceptance criteria are satisfied:

1. create or confirm the Sprint 2 board, its four columns, and every current
   Sprint 2 issue's actual column;
2. assign #193 an agreed planning ID and board state, then add the true native
   dependency on #171 or correct the body if #171 is not a blocker;
3. have another team member check the documentation links and tracker accuracy.

Do not update this snapshot merely to imitate those remote changes. Update the
live tracker first, then record a dated review only when durable evidence is
useful.

## Sprint 2 rubric-to-evidence matrix

The governance request names the official Sprint 2 rubric headings below. No
more detailed scoring text is stored in this checkout or in issue #159, so this
matrix maps those headings without inventing replacement criteria or claiming
that planned evidence already exists.

| Official criterion             | Expected evidence                                                                                                                                                                                                                                                                                                                                                      | Authoritative location or source                                                                                                                                                                                                                                                                         | Responsible role                                                                              | Collection cadence and current boundary                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core Features                  | Linked issue acceptance, reviewed implementation, focused tests, integrated demonstration, and explicit limitations; a dated count of known defects by severity, with links and an explicit conclusion on whether core features have no severe bugs and only non-severe bugs remain                                                                                    | Live Gitea issues using `bug` and priority labels; [work-tracking rules](./work-tracking-and-issue-management.md#bugs-usability-findings-and-features-use-the-same-tracker); release issue #167; current requirements and architecture                                                                   | Issue owners; Product Lead for scope; release reviewer confirms the defect gate               | Per issue and weekly; capture the live defect count and severity at milestone review rather than inventing or copying an undated count                           |
| Automated Testing              | Named test commands and exact results, CI jobs, regression coverage, and safe failure artifacts                                                                                                                                                                                                                                                                        | PRs and Gitea Actions; `apps/*/tests`; `packages/*`; [testing strategy](../testing/testing-strategy.md)                                                                                                                                                                                                  | Issue owner and reviewer; quality owner for release gates                                     | Per PR, nightly/release where configured; local, CI, deployed, and manual evidence stay distinct                                                                 |
| Stakeholder Reviews            | Dated interaction record, participants, increment or decision reviewed, feedback, evaluation, owner, and resulting issue/decision                                                                                                                                                                                                                                      | [Database usage review](./stakeholder-interactions/2026-09-04-database-usage-review.md); [Trails and card artwork review](./stakeholder-interactions/2026-09-08-trails-and-card-art-review.md); [Frontend UI review](./stakeholder-interactions/2026-09-11-frontend-ui-review.md); linked issues and PRs | Product Lead or interaction owner                                                             | Three retrospective Sprint 2 records now exist; obtain specific follow-up stakeholder confirmation and retain future records contemporaneously                   |
| API                            | Three separately evidenced requirements: external availability of the Wits World HTTP API with dated public-URL/status checks; published and reachable API documentation whose OpenAPI contract matches runtime behavior; and working integration with the project's required external API, Mapbox, including its boundary, failure behavior, and operational evidence | [API reference](../api-reference.md); OpenAPI, API source/tests, CI, and release/deployment evidence; [external integration boundaries](../architecture/external-integrations.md); [Mapbox configuration](../architecture/external-integrations.md#mapbox-configuration)                                 | API and Security Lead; integration owner; relevant issue reviewer                             | Per API or integration change and at release; external availability, API documentation, and external-API integration each need their own evidence                |
| User Feedback                  | Pre-session script, consent/privacy boundary, anonymised task observations, finding decisions, linked issues, fixes, and retest                                                                                                                                                                                                                                        | [Sprint 2 user-testing plan](../testing/sprint-2-user-testing-plan.md); [sanitised results](../testing/sprint-2-user-feedback-results.md); issues #240-#244; PR #245; issue #167                                                                                                                         | User-test facilitator and Product Lead                                                        | Ten questionnaire responses and five prioritised findings are recorded; participant retests and the remaining integration evidence are still open under #167     |
| Project Methodology            | Current issue metadata, board transitions, dependency/risk reviews, linked PRs, CI, independent review, and ceremony records                                                                                                                                                                                                                                           | Gitea; [project and Git methodology](./project-and-git-methodology.md); this page                                                                                                                                                                                                                        | All members; Product Lead coordinates weekly review                                           | Continuous plus weekly review; active board still requires live verification                                                                                     |
| Bug Tracker                    | Reproduction, expected/observed behavior, severity/priority, evidence, regression check, owner/reviewer, and linked fix/retest                                                                                                                                                                                                                                         | Gitea issues with `bug`; explicit usability classification and `UT-S2-*` identifiers for usability findings                                                                                                                                                                                              | Finder records; assigned owner resolves; reviewer verifies                                    | Record when discovered and triage weekly; a dedicated `usability` label is optional future hygiene                                                               |
| Database Documentation         | Current schema/entity/relationship documentation; database deployment information covering the Neon PostgreSQL/PostGIS environment and release, migration, recovery, and operational boundaries; and explicit motivation for the database and deployment choices, including relevant alternatives and constraints                                                      | [Database overview](../database/overview.md); [Neon/PostGIS setup](../database/neon-postgis-setup.md); [database release procedure](../database/database-release-procedure.md); [Database technology](../architecture/technology-stack.md#postgresql-postgis-and-pg); migrations and database tests      | Data and Infrastructure Lead; schema/deployment-change owner                                  | Update with every schema or deployment change and review all three evidence classes at the milestone                                                             |
| Third-Party Code Documentation | For each material dependency or service: its purpose, explicit motivation for choosing or retaining it, configuration/ownership and authority boundary, licence/attribution, privacy/security considerations, and replacement or operational limits                                                                                                                    | [Third-party software and services](../architecture/technology-stack.md#application-stack); lockfile; [external integration boundaries](../architecture/external-integrations.md); deployment docs                                                                                                       | Owner of the dependency or integration; reviewer checks motivation, attribution, and boundary | When added, upgraded, replaced, or materially reconfigured and during release review                                                                             |
| Testing Documentation          | Three separately evidenced requirements: the formal user-feedback process and finding traceability; the automated-testing procedure, including reproducible local, CI, integration, and E2E execution where applicable; and the project's policy for required tests, isolation, evidence reporting, review, and release gates                                          | [Sprint 2 user-testing plan](../testing/sprint-2-user-testing-plan.md); [testing strategy and policy](../testing/testing-strategy.md); [continuous integration](../testing/continuous-integration.md); [project and Git methodology](./project-and-git-methodology.md); PR/CI and release evidence       | User-test facilitator; issue owner; quality/release owner; reviewer                           | Keep procedures and policy current as they change; collect actual feedback and automated-test results per session, PR, and release without duplicating them here |

## Evidence index and retention rule

Store evidence once at the source that is best able to remain authoritative.
Link to it from issues, pull requests, ceremony records, and this matrix instead
of copying volatile status into several Markdown tables.

| Evidence class                                           | Primary location                                                                       | Minimum durable record                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work status and dependencies                             | Gitea issue and project board                                                          | Owner, reviewer, estimate, labels, milestone, native dependencies, current state, blockers                                                                |
| Implementation and review                                | Pull request and Git history                                                           | Linked issue, scoped diff, human review, findings/resolution, merge reference                                                                             |
| Automated validation                                     | PR comment/checklist and Gitea Actions                                                 | Exact command/job, revision, result, meaningful counts, safe artifact link                                                                                |
| Architecture, API, schema, rules, setup, and methodology | Versioned repository documentation                                                     | Current contract or decision, limitations, related issue/PR, accurate AI declaration                                                                      |
| Stakeholder evidence                                     | `docs/planning/stakeholder-interactions/` plus Gitea                                   | Date, participants, reviewed increment/question, feedback, evaluation, decision, owner, links                                                             |
| User-testing evidence                                    | Sanitised result under `docs/testing/` plus linked finding issues                      | Release, anonymous session IDs, task outcomes, observations, decisions, issues, retest; raw consent-controlled notes remain outside the public repository |
| Bugs and usability findings                              | Gitea issues                                                                           | Classification, reproduction/observation, impact, evidence, decision, fix/retest links                                                                    |
| Deployment and release                                   | Release issue, CI/deployment run, and applicable `docs/deployment/` or validation page | Revision/environment, automated result, deployed smoke result, operator/manual boundary, blocker                                                          |
| Risks and decisions                                      | [Risk register](./risk-register.md), linked issue and supporting evidence              | Owner, status, response, decision/evidence, next review                                                                                                   |

Never retain credentials, complete tokens, connection strings, private account
data, raw consent records, or unnecessary precise location in public evidence.

## Weekly ceremonies and evidence

Wits World uses the established weekly Scrum-lite boundary rather than claiming
mandatory daily meetings. Short coordination can occur as needed. A ceremony
record proves only what it actually captures.

| Activity                            | Cadence and purpose                                                                                                                                     | Evidence to retain contemporaneously                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Planning and refinement             | At the weekly boundary and when work becomes ready; order issues and check scope, owner, reviewer, estimate, labels, dependencies, risk, and acceptance | Date, participants, sprint/issue links, changed decisions, blockers, owners, and board updates                 |
| Coordination                        | As needed during the week; surface progress, integration risks, and blockers                                                                            | Issue comment or concise dated note only when it changes work or a decision                                    |
| Stakeholder review                  | At the weekly review when a stakeholder is available, and whenever an external review occurs                                                            | Increment/question reviewed, feedback, evaluation, accepted/deferred/rejected decision, owner, resulting issue |
| Sprint review                       | Weekly boundary and milestone close; compare verified increment with the goal and rubric evidence                                                       | Demonstrated revision, tests and limitations, stakeholder response, accepted work, carry-over, links           |
| Retrospective                       | Weekly boundary or milestone close; select process improvements                                                                                         | Participants, evidence-based themes, one or more owned actions, follow-up review date/link                     |
| Risk, dependency, and defect triage | During the weekly review and immediately for critical findings                                                                                          | Changed risk status, native dependency correction, new/updated bug or usability issue, priority and owner      |

No exact recurring weekday, time, participant list, or completed Sprint 2
ceremony is claimed here because no such evidence was found. Record the actual
schedule and occurrence when agreed or performed.

## Stakeholder and user-testing flow

Stakeholder feedback follows this trace:

```text
dated interaction -> verbatim or carefully paraphrased feedback
                  -> team evaluation against scope, evidence, and constraints
                  -> accepted, deferred, rejected with reason, or unresolved
                  -> linked issue/decision with owner
                  -> reviewed change and verification
                  -> follow-up response where appropriate
```

Formal user testing follows the
[Sprint 2 user-testing plan](../testing/sprint-2-user-testing-plan.md) and
[#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167). Its
prerequisite dependency graph includes #159–#166. Schedule named sessions only
after the tested release, facilitator, safe accounts, consent approach, and
applicable devices are ready. Preserve anonymous observations as stable
`UT-S2-*` findings, classify each as a bug, usability finding, feature request,
or non-actionable feedback, and link accepted changes and retests. Planned
sessions are not evidence of participants or results.

## Risk and dependency control

The [risk register](./risk-register.md) is the durable risk history. Review
active high-impact risks weekly, assign an owner, link response work, record
tested mitigation, and retain residual exposure. Gitea native dependencies are
authoritative for current blocking status; Markdown dependency lists explain
intent but do not create a live blocker.

When a dependency changes, update both the native link and the readable issue
body, review downstream acceptance/schedule impact, and record the decision.
Do not use dependencies for preferred ordering, shared context, or a task that
can proceed independently.

## Defect, usability, and feature classification

All three classes belong in Gitea, not a parallel spreadsheet:

| Class             | Meaning                                                                                                                | Tracker convention                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug               | Implemented behavior deviates from an agreed requirement or expected safe operation                                    | `bug` plus priority, area, and `testing` labels; include reproduction and regression evidence                                                                  |
| Usability finding | Observed friction, confusion, accessibility difficulty, or recovery problem without first claiming a functional defect | Explicit `Usability finding` classification in the issue plus priority/area/testing labels and `UT-S2-*` when user-test sourced; a dedicated label is optional |
| Feature work      | A new capability or scope addition rather than correction of agreed behavior                                           | `feature` plus priority/area labels; evaluate against milestone scope before acceptance                                                                        |

If investigation changes the classification, retain the evidence and decision
in the issue rather than silently rewriting its origin. A severe bug is raised
and triaged immediately; other findings are reviewed at the weekly boundary.

## AI declaration

This Sprint 2 governance and evidence structure was generated, edited, and
reviewed with assistance from Codex[GPT-5]. Tracker facts are from read-only
Gitea inspection on 28 August 2026; no remote resource was changed.

September meeting audit added with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].
