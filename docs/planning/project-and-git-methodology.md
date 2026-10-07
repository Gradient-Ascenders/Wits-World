---
title: 'How we plan, build and review work'
---

# How we plan, build and review work

Wits World uses a lightweight, issue-driven process. The aim is to make work
visible and reviewable without adding unnecessary meetings or paperwork.

## Planning and tracking

The team reviews progress, feedback, risks, and dependencies each week. Short
coordination happens when needed during the week.

Gitea issues are the units of work. Each issue should show its owner, scope,
acceptance criteria, dependencies, and blockers. The project board should match
the real state of the repository. Stakeholder feedback becomes an issue or an
approved change to acceptance criteria; a suggestion is not automatically a
requirement.

The [Scrum records](./scrum/index.md) contain dated coordination evidence. Some
older records were reconstructed from repository evidence and are labelled as
such. They are not presented as meeting transcripts.

## Development flow

1. Read the issue, comments, dependencies, and evidence requirements.
2. Create a short-lived branch from current `main`.
3. Keep the change within scope. Add relevant tests and documentation.
4. Open a focused pull request that links the issue and lists the checks run.
5. Obtain human review. The author does not merge their own pull request.
6. Merge through the approved process, then update the issue and project board.

`main` requires one approval and dismisses stale approvals after new changes.
Gitea Actions runs pull-request checks. Required status checks are not enforced
by the branch rule, so reviewers must confirm that the correct jobs passed.

## Commits and review

Commit subjects use the repository's square-bracket prefixes:

```text
[feat] add event eligibility display
[fix] handle denied geolocation permission
[test] cover stale location recovery
[docs] explain the player journey
```

Commits and pull requests must exclude secrets and unrelated changes. Review
covers behaviour, tests, security, accessibility, schema changes, operations,
documentation, and AI attribution where relevant.

## Definition of Done

Work is done when:

- the acceptance criteria are met;
- relevant tests and required CI jobs pass;
- review findings are resolved;
- documentation and operational impacts are handled;
- required manual or stakeholder evidence is recorded; and
- the approved pull request is merged.

Any missing external check stays open and visible. It is not converted into a
pass.

See [Work Tracking and Issue Management](./work-tracking-and-issue-management.md)
for labels, board use, bug handling, and known historical inconsistencies.

## AI declaration

This page was generated and edited with assistance from Codex[GPT-5],
ChatGPT-Web[GPT-5.6 Sol], and Codex-CLI[GPT-6]. It was simplified with
assistance from Codex[GPT-5].
