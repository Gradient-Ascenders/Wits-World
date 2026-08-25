---
title: Project and Git methodology
---

# Project and Git methodology

Wits World uses a lightweight, issue-driven process for Wits Quest. The aim is
to keep delivery visible and reviewable without adding ceremony that does not
improve the product or its evidence.

## Scrum-lite cadence and work tracking

The team works in a weekly Scrum-lite cadence. At the weekly boundary it reviews
the increment and stakeholder feedback, checks risks and dependencies, orders
the next work, and records any decisions that change acceptance criteria. Short
coordination happens as needed during the week rather than through mandatory
daily ceremony.

Retrospectively assembled planning and coordination evidence is kept in the
[Scrum records](./scrum/index.md). Those pages distinguish repository-backed
outcomes from inferred discussion and are not presented as verbatim transcripts.

The Gitea Kanban/project tracker is maintained continuously, not reconstructed
at the end of a milestone. Issues are the units of planned work; their status,
owner, dependencies, acceptance criteria, review state, and blockers should
match the current repository reality. New stakeholder feedback is recorded as
an issue, decision, or acceptance-criteria update and then ordered into the
backlog. A request is not treated as approved merely because it was suggested.

The [Work Tracking & Issue Management](./work-tracking-and-issue-management.md)
guide documents the tracker and bug lifecycle, configured labels/milestone/board,
issue-to-merge flow, branch-protection and CI boundary, real repository evidence,
and known historical inconsistencies. The method on this page is the confirmed
team process; a historical closed state or unchecked checklist is preserved as
evidence, not silently rewritten to match it.

## Issue, branch, and pull-request flow

1. Read the issue, its comments, dependencies, and evidence requirements.
2. Branch from current `main` using a descriptive, short-lived branch such as
   `feat/campus-map` or `fix/geolocation-denied-state`.
3. Keep the implementation inside the issue boundary and add proportionate
   tests and documentation.
4. Open a small pull request that links the issue, explains the change, and lists
   commands actually run plus unresolved manual or external checks.
5. Obtain human review. Authors do not merge their own pull requests, and a
   passing build does not replace functional, security, accessibility, or data
   review where those are relevant.
6. Merge only through the authorised pull-request process, then update the
   tracker and retain the required delivery evidence.

`main` requires one approval and dismisses stale approvals after new changes.
Gitea Actions runs PR validation, but required CI status checks are not currently
enabled in the branch-protection rule; confirming green CI therefore remains an
explicit reviewer and Definition of Done responsibility.

Large work is split into coherent issues and PRs so reviewers can understand the
risk. Branches should be deleted after merge when no longer needed.

## Commits and review expectations

This repository does not claim the normal Conventional Commits syntax. Commit
subjects use the established square-bracket prefixes:

```text
[feat] add event eligibility display
[fix] handle denied geolocation permission
[test] cover stale location response state
[docs] document player journey
[refactor] isolate event status presentation
[chore] configure quality checks
```

Commits and PRs must exclude secrets and unrelated edits. Review checks behavior,
tests, architecture and trust boundaries, accessibility impact, schema and
migration safety, documentation, and accurate AI attribution. Review findings
are resolved with focused follow-up changes and retained evidence.

## CI and testing expectations

Before review, run the checks relevant to the change and normally the root
quality set: formatting check, lint, type-check, tests, and build. Database or
browser changes also run their documented integration/E2E commands against
disposable test resources. Record exact results; distinguish local automation,
CI, deployed smoke checks, and manual evidence. Production secrets and
production databases are never used as test fixtures.

## Definition of Done

An item is done only when its acceptance criteria are implemented; focused tests
pass; required broader CI is green; review findings are resolved; documentation,
schema, migration, security, accessibility, and operational impacts are handled;
AI use is attributed accurately; manual or stakeholder evidence required by the
issue is recorded; and the authorised PR is merged. Any unresolved external gate
remains explicit rather than being converted into a pass.

The preceding document was generated, edited, and reviewed with the assistance
of Codex[GPT-5] and ChatGPT-Web[GPT-5.6 Sol].
