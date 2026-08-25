---
title: Work tracking and issue management
description: How Wits World plans work, tracks bugs, and moves Gitea issues through branches, pull requests, review, CI, and merge.
---

# Work tracking and issue management

[Wits-World Gitea Issues](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues)
are the operational tracker for planned work, defects, research, documentation,
and release evidence. The project does not maintain a second application as the
authoritative backlog. Repository documents preserve plans and Sprint context;
Gitea records the live work item, ownership, discussion, dependencies, and
delivery links.

This page explains the working method and then distinguishes it from historical
records that are useful evidence but are not always internally consistent.

## What belongs in Gitea

One issue represents one reviewable unit of work or one bug. A useful issue
states:

- the purpose and player/project problem;
- included and excluded scope;
- acceptance criteria;
- verification and evidence requirements;
- documentation or operational impact;
- dependencies and blocked work;
- the assignee and reviewer or required cross-role decision; and
- the relevant priority, work-area labels, and milestone.

The tracker has issue dependencies enabled, and repository history shows them
used alongside explicit `Depends on` and `Blocks` fields. The issue and its
comments are the first source of truth for scope. When a stakeholder decision,
security boundary, or data rule remains unresolved, record the owner and blocker
instead of inventing a default.

Assignment identifies the current owner. The durable team responsibilities in
`AGENTS.md` guide coordination, but ownership not defined there comes from the
current issue/assignee; it should not be guessed.

## Issue to merge

```text
refined Gitea issue
        ↓
short-lived branch from current main
        ↓
small linked pull request
        ↓
Gitea Actions + human review
        ↓
authorised merge commit to main
        ↓
confirm issue, board, and remaining gates
```

1. **Refine the issue.** Read its full body, comments, dependencies, acceptance
   criteria, evidence needs, labels, milestone, and assignee. Planning or
   refinement makes the issue ready before implementation begins.
2. **Branch from current `main`.** Use a descriptive, short-lived name such as
   `feat/campus-map` or `fix/geolocation-denied-state`. Do not work directly on
   `main`.
3. **Make progress visible.** Comment with the branch, planned outcomes, and
   verification approach when work starts. Keep discoveries within scope or
   create/link a follow-up issue.
4. **Open a linked PR.** Complete `.gitea/pull_request_template.md`: identify the
   problem and approach, list only checks actually run, record remaining manual
   work and impacts, and disclose AI use. Use `Closes #<issue>` only when the PR
   fully satisfies that issue. Use `Relates to #<issue>` or
   `Partially implements #<issue>` when gates will remain.
5. **Verify and review.** Pull requests targeting `main` start the independent
   formatting, lint, type-check, test, and build jobs described in
   [Continuous Integration](../testing/continuous-integration.md). A human
   reviewer checks the change and relevant non-automated risks. Review findings
   are resolved before approval.
6. **Merge through the authorised PR path.** The repository uses merge commits;
   squash and rebase merging are disabled. Contributors do not merge their own
   PRs under the documented methodology.
7. **Reconcile the tracker.** After merge, confirm the issue closure, acceptance
   checklist, board state, follow-up defects, remaining manual/external gates,
   and documentation all match reality. Delete the short-lived branch when it
   is no longer needed.

`main` branch protection requires one approval and dismisses stale approvals
after new changes. Required CI status checks are not currently enabled in that
branch-protection rule. Consequently, a green CI run is a documented Definition
of Done gate and review responsibility, but Gitea does not mechanically prevent
every merge with missing or failing status checks. The merge button alone is not
evidence that CI passed.

## Bugs use the same tracker

Gitea Issues is also the bug tracker. The repository has a `bug` label and uses
it together with priority, application-area, and testing labels where a work
item contains confirmed defects. There is no separate bug database and no
bug-specific issue template in the repository.

A bug report should make reproduction and closure reviewable:

- observed behaviour and expected behaviour;
- the smallest reliable reproduction, including route or command;
- relevant environment, viewport, role, or data state without credentials,
  tokens, precise reported coordinates, or private game data;
- player, security, data, accessibility, release, or operational impact;
- evidence such as a safe error/request ID or sanitised screenshot when useful;
- scope boundaries, acceptance criteria, and the regression check required; and
- related issues, dependencies, assignee/reviewer, labels, and milestone.

Use a priority label that reflects confirmed impact rather than confidence or
convenience. Fixes still use an issue branch, linked PR, proportionate regression
test, CI, and review. If a larger defect is discovered while validating another
issue, either add it only when it is clearly within that issue's acceptance
criteria or record a follow-up bug; do not silently broaden the original change.

Issue
[#51, Refine the Wits Quest visual identity and frontend presentation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51),
is preserved evidence of the shared model: it carries `bug`, priority,
frontend, feature, and testing labels; records dependencies and a reviewer;
links the working branch and PRs in comments; records verification and CI; and
tracks reproducible visual defects alongside bounded feature work. PR
[#56](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/56) also
preserves a change-request review, focused correction, re-verification, and
later approval before merge.

## Labels, milestones, and the project board

Repository evidence supports these tracker aids:

- priority labels: `High Priority`, `Medium Priority`, and `Low Priority`;
- area/type labels including `backend`, `database`, `documentation`, `frontend`,
  `testing`, `feature`, `bug`, `meeting`, and `research`;
- the `Sprint 1` milestone on planned and completed issues; and
- project board columns `Backlog`, `In Progress`, `Review & Test`, and `Done`.

Use labels to aid filtering, not to replace a clear issue body. A milestone
groups work against a real delivery boundary; it does not prove completion. The
board gives a compact flow view, while the issue remains the detailed record.
Issue [#10, Establish the project and Git methodology](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/10)
records the agreed board/process setup, attached board evidence, and a board
transition. Later issue timelines also preserve project and board movements.

Do not infer a future milestone, project, label, or board status merely because
it appears in an old plan. Create or assign it in Gitea before presenting it as
current tracker state.

## Sprint planning and repository records

The weekly Scrum-lite planning/review cadence orders Gitea issues, reviews
dependencies and risk, and records decisions that change acceptance criteria.
Short coordination occurs as needed during the week. Backlog refinement makes
issues implementation-ready; Sprint review compares the increment with the
planned outcomes; retrospective records process improvements.

Use these sources for different questions. The repository
[contribution guide](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/CONTRIBUTING.md)
contains the concise contributor-facing workflow.

| Question                                                | Source                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| What is assigned, blocked, under review, or closed now? | Current Gitea issue, comments, dependencies, PRs, and project board                             |
| What process should the team follow?                    | [Project & Git Methodology](./project-and-git-methodology.md), this page, and `CONTRIBUTING.md` |
| What was planned or discussed during Sprint 1?          | [Scrum records](./scrum/index.md) and the preserved historical issue plans                      |
| What is the current product/release truth?              | Current requirements, release validation, implementation, tests, and open tracker gates         |

The Scrum records are retrospectively assembled and explicitly distinguish
repository-backed outcomes from inferred coordination; they are not verbatim
meeting transcripts. The Sprint 1 and Sprint 2 Gitea issue-plan pages are
planning snapshots, not substitutes for the live tracker.

## Evidence limits and known inconsistencies

The repository shows the methodology in real use: issues contain acceptance
criteria and dependencies, comments identify branches and verification, PRs
link issues, Gitea Actions reports CI, and review records include approvals and
change requests. It also shows exceptions that must not be hidden:

- some later product-polish PRs explicitly state that no issue was linked;
- some closed issues retain unchecked acceptance or completion items; and
- a closing keyword or closed Gitea state therefore cannot, by itself, prove
  every manual, stakeholder, deployment, or release gate passed.

The confirmed methodology remains issue-driven and review-before-merge. When
the historical record differs, preserve that record and describe the gap; do
not rewrite an unchecked box or infer missing evidence. Current work should
reconcile its issue and PR before it is treated as Done.

---

This work-tracking guide was created and edited with assistance from
Codex[GPT-5].
