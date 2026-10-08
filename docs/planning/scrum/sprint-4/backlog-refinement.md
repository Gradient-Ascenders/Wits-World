---
title: Sprint 4 Backlog Refinement
sidebar_position: 6
toc_max_heading_level: 2
---

# Sprint 4 Backlog Refinement

**Reporting point:** 29 September–8 October 2026 evidence window.

Reconstructed on 8 October 2026 from repository history. Discussion, decisions, and actions below are inferred summaries; original minutes, ceremony dates, and attendance were not supplied.

[Read the complete sprint report](report.md).

## Discussion

Refine final-submission work around the most visible player friction and the operational risks exposed by latency and pool observations. These topics are reconstructed from the sequence of UI, performance, test-repair, and deployment commits.

## Completed or Mostly Completed Items

- Homepage/Explore startup, artwork sizing, CPU battle presentation, and battle database-path refinements were merged.
- Collection, decks, evolution, trading, profiles, Author workspaces, account settings, and typography changes were merged.
- Loading/recovery, retained refresh, pool observations, idle coordination, and listener isolation were integrated in the repository.

## Items Needing Refinement

- Define deployment prerequisites and checks for the direct listener endpoint and staged scheduler backend.
- Separate local timing/structural evidence from hosted latency, multi-instance behavior, and idle suspension.
- Keep signed-in account lifecycle, multiplayer recovery, accessibility, and mobile journeys in final regression scope.
- Confirm which submission-period findings remain open using their actual tracker and retest evidence.

## Backlog Decisions

- Group presentation work by complete journey and keep state-changing behavior tied to existing API contracts.
- Reduce repeated database work before increasing connection capacity or changing gameplay semantics.
- Keep Redis-fenced work creation and PostgreSQL-only existing-work cleanup distinct.
- Treat operational rollout and measured acceptance as follow-up work even when the implementation PR has merged.

## Action Items

- Finish a traceable submission checklist with revision, environment, result, and remaining limitations.
- Collect a small controlled request sample alongside pool and scheduler observations.
- Record actual review outcomes and retests when the corresponding sessions occur.

## Record Details and Sources

- **Scope:** final-submission work grouped as Sprint 4, 29 September–8 October 2026.
- **Snapshot:** local `origin/main` at [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f).
- **Dates:** reporting points and windows chosen for this reconstruction, shown in Africa/Johannesburg time.
- **Attendance and original minutes:** not supplied.
- **Evidence:** [Merge register](report.md#merge-register), [loading policy](../../../design/state-review.md#loading), [Gameplay workers](../../../deployment/ranked-operations.md), and [PvP timing guide](../../../testing/pvp-request-phase-timing.md).

## AI declaration

Prepared with assistance from Codex[GPT-6], using Git history and existing project documentation. Meeting discussion and actions are reconstructions; commit authorship does not establish meeting attendance.
