---
title: Sprint 4 Planning
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint 4 Planning

**Reporting point:** 29 September 2026 — reconstructed planning point.

Reconstructed on 8 October 2026 from repository history. Discussion, decisions, and actions below are inferred summaries; original minutes, ceremony dates, and attendance were not supplied.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-01.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 1">
    <img
      src="/img/scrum/sprint-4/meeting-01.png"
      alt="Sprint 4 supplied team-call photo 1"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 1, displayed with planning.</figcaption>
</figure>

Photos follow the supplied order for presentation. Their dates and association with individual meetings remain unconfirmed. See the [photo sources](report.md#image-provenance).

## Sprint Goal

Prepare the existing Basic, Intermediate, and Advanced journeys for final submission: make the interface clearer, reduce avoidable startup and battle latency, improve loading and recovery, and make database operations easier to diagnose.

## Agenda

Review the previous increment, prioritise player and Author friction, identify performance work, and plan the remaining release evidence before the roadmap’s 11 October submission target.

## Discussion Summary

- The next increment should concentrate on finishing and stabilising existing journeys rather than expanding the game rules.
- Start with homepage and Explore startup, then collection, decks, evolution, trading, profiles, and Author workflows.
- Review battle hydration, action, acceptance, and match-detail reads together so latency improvements retain the existing transaction and recovery contracts.
- Keep loading, reading preferences, keyboard focus, and mobile layout consistent across the app.
- Treat the late Sprint 3 rate-limit integration as starting context; keep subsequent scheduler coordination and listener changes separately traceable.

## Key Decisions

- Preserve server-owned identity, ownership, versions, gameplay results, and publication while simplifying the interface.
- Reduce unnecessary reads and startup work before changing gameplay behavior.
- Use focused tests and responsive browser checks for each changed journey; retain explicit deployment and manual checks.
- Keep background recovery available and avoid blind resubmission of player or Author mutations.

## Task Allocation

- **Kevin — interface and docs:** player and Author journeys, profiles, accessible typography, loading presentation, and sprint documentation.
- **Tyron — API and performance:** startup and battle-path optimisations, request/pool observations, and notification-listener isolation.
- **Uzair — database and operations:** durable idle-worker coordination, ranked expiry during Redis outages, and scheduler deployment guidance.
- **Team — quality and final delivery:** cross-journey regression checks, deployment verification, unresolved findings, and submission evidence.

This coordination plan is reconstructed from recurring commit authorship and existing team roles; it is not a retained meeting assignment.

## Action Items

- Begin with public startup and Explore navigation, then finish collection and battle interfaces.
- Review each optimisation against transaction, privacy, accessibility, and recovery requirements.
- Collect production-like measurements separately from local structural tests.
- Keep release notes, deployment configuration, and sprint evidence aligned with merged work.

## Record Details and Sources

- **Scope:** final-submission work grouped as Sprint 4, 29 September–8 October 2026.
- **Snapshot:** local `origin/main` at [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f).
- **Dates:** reporting points and windows chosen for this reconstruction, shown in Africa/Johannesburg time.
- **Attendance and original minutes:** not supplied.
- **Evidence:** [PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)–[PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362) in the [Sprint 4 merge register](report.md#merge-register); prior rate-limit integration [PR #332](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/332) is starting context.

## AI declaration

Prepared with assistance from Codex[GPT-6], using Git history and existing project documentation. Meeting discussion and actions are reconstructions; commit authorship does not establish meeting attendance.
