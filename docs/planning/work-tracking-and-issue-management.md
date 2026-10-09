---
title: 'Work and bug tracking'
description: How issues, bug reports, feedback, and pull requests connect planning to delivery.
---

import EvidenceScreenshot from '@site/src/components/EvidenceScreenshot';

# Work and bug tracking

[Gitea Issues](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues)
holds the implementation backlog: features, defects, research, documentation,
and release work. Issues connect the problem and acceptance criteria to an
owner, discussion, dependencies, pull requests, and verification.

## Making work visible

A useful issue explains the problem, the intended outcome, included scope,
acceptance criteria, and how the result will be checked. Its assignee owns the
next action. Dependencies identify work that must finish first; labels and
milestones help organise priorities and delivery periods.

The agreed board flow is **Backlog → In Progress → Review & Test → Done**.
Priority and area labels help filter the backlog without replacing the issue's
description. The detailed issue and PR record explains progress when a board
column alone would be ambiguous.

[Issue #10](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/10)
records the process and board setup. Later governance snapshots identified
missing dependency and board evidence, so the planned flow should not be read
as confirmation that every item used it consistently. Current assignment and
state come from the tracker, rather than a historical issue plan.

## Issues and pull requests

Implementation starts on a short-lived branch. The issue records the branch,
progress, discoveries, and blockers; a linked PR explains the resulting change
and its checks. Review findings return to the branch for correction.
The [methodology](project-and-git-methodology.md) describes the review and CI
gates without repeating their configuration here.

Use a closing link when the PR satisfies the whole issue. Partial work should
use a related-work link and leave unmet acceptance criteria visible. After
merge, reconcile the issue, board, follow-up defects, and remaining release
checks. A closed issue cannot stand in for an unrecorded manual test or retest.

## Bug reports {/* #bugs-usability-findings-and-features-use-the-same-tracker */}

A bug is implemented behaviour that differs from an agreed requirement. A
usability finding records difficulty using the product; it may require more
investigation before it becomes a confirmed defect. A feature adds capability.
This distinction helps the team prioritise evidence and avoid treating every
suggestion as a requirement.

A reproducible bug report includes:

- expected and observed behaviour;
- steps, application state, and relevant device or browser details;
- impact and a proportionate priority;
- sanitised evidence, such as a screenshot or request ID; and
- the correction's acceptance criteria and regression check.

Gitea's `bug` label identifies defect work. Sprint 3 governance also allows
reports originating in YouTrack to link to a Gitea implementation issue and PR.
When two tools are involved, cross-links keep the report, fix, and retest aligned.
The [project methodology](project-and-git-methodology.md)
describes that relationship; it does not establish an audited YouTrack inventory.

<a id="examples-of-the-tracker-in-use" />

## Workflow in practice

[Issue #9](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/9)
defined the API foundation work. Its linked
[PR #28](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/28)
shows how that task moved through implementation, peer review, correction,
and merge. Select an image to open the full-size screenshot.

### 1. Define and assign the work

<EvidenceScreenshot
src="/img/workflow/issue-9-scope.png"
alt="Closed issue 9 with API scope, acceptance criteria, Tyron's assignment, and the Sprint 1 milestone"
crop={{ left: 300, top: 65, width: 1310, height: 1015 }}

>

Issue #9 sets out the purpose, included and excluded scope, and acceptance
criteria. Tyron owns the work, with labels and the Sprint 1 milestone providing
planning context.
</EvidenceScreenshot>

### 2. Implement and record checks

<EvidenceScreenshot
src="/img/workflow/pr-28-overview.png"
alt="Merged pull request 28 from feat/api-foundation into main, with implementation details and a verification checklist"
crop={{ left: 300, top: 65, width: 1310, height: 960 }}

>

PR #28 summarises the branch's changes and records local automated and manual
checks. The “Repository CI passes” item is unchecked; this screenshot does not
establish a complete CI pass.
</EvidenceScreenshot>

### 3. Review and request a correction

<EvidenceScreenshot
src="/img/workflow/pr-28-review.png"
alt="Uzair requests changes on PR 28 after identifying a vulnerable Swagger UI dependency"
crop={{ left: 300, top: 535, width: 1000, height: 265 }}

>

Uzair identifies a vulnerable dependency during independent review and requests
an update before approval. The review records both the finding and the checks
performed.
</EvidenceScreenshot>

### 4. Correct, recheck, and merge

<EvidenceScreenshot
src="/img/workflow/pr-28-approval-merge.png"
alt="Tyron records a dependency fix, Uzair rechecks and approves it, then merges PR 28 into main and deletes the branch"
crop={{ left: 300, top: 35, width: 1000, height: 790 }}

>

Tyron records the dependency update and repeat checks. Uzair rechecks the latest
commit, records successful local checks, approves the change, and merges it into
main. The completed branch is then deleted.
</EvidenceScreenshot>

**AI declaration:** Prepared and edited with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6]. The latest revision used Codex[GPT-6] for
rubric comparison, source review, prose editing, and screenshot layout and captions.
