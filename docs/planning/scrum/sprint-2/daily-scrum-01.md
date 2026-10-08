---
title: Sprint 2 Daily Scrum 1
sidebar_position: 2
---

# Sprint 2 Daily Scrum 1

**Date:** 28 August 2026.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-01.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 1">
    <img
      src="/img/scrum/sprint-2/daily-scrum-01.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 1"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 1 — checkpoint recorded as 28 August 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

## Summary of Progress {/* #progress-since-planning */}

- **Product/Web:** Kevin's dependent UI work remained aligned to the account, ordering, progression, trail, and PvP contracts landing in the service streams. The reviewed canonical starter choices also established the player-facing Wit, Grit, and Spark entry point.
- **API/security:** Tyron delivered ordering challenge persistence/API behaviour, defined the asynchronous PvP contract, and exposed progression APIs with authenticated identity and server-owned state.
- **Data:** Uzair completed account-deletion retention, defined and persisted progression rules, and reconciled overlapping ordering/progression migrations.
- **Quality/delivery:** Caleb established the Sprint 2 governance and rubric evidence register. CI work also shared the npm package cache while retaining required checks.

## Blockers Raised During Stand-ups {/* #impediments-and-uncertainty */}

- Issues #179-#186 were part of the planned Sprint 2 backlog but lacked Sprint
  2 milestone metadata in the later live tracker snapshot.
- Full release and participant validation remained dependent on an integrated
  deployment, not just merged foundations.
- The poor-GPS alternative remained a decision task rather than an implemented
  fallback.

## Actions Taken

### Integrated outcomes

- Account deletion had an explicit anonymisation and retention policy rather
  than uncontrolled cascades.
- Ordering challenges gained a server-markable representation before their UI.
- Progression rules and APIs were separated from browser calculations.
- The asynchronous PvP contract fixed actor, version, deadline, action, and
  visibility boundaries before persistence and routes were implemented.
- Governance identified Gitea as the live source for ownership, dependencies,
  board state, review, and completion.

### Coordination points

- Ordering, progression, and account migrations touched adjacent player data,
  so branch reconciliation and migration ordering needed explicit review.
- Frontend streams could proceed once their corresponding contracts landed;
  they did not need to wait for unrelated catalogue or movement work.
- The 30-card catalogue and event/question content were larger content tasks
  and needed to progress alongside, rather than after, all API work.

## Next Actions {/* #plan-before-the-next-checkpoint */}

- Persist trails, movement evidence, asynchronous PvP, campaigns, and curation
  state.
- Implement impossible-journey and deadline processing against those models.
- Keep database usage and deployment reliability visible while the number of
  persistence-heavy services increases.
- Begin integrating the corresponding author and player experiences.

## Record Details and Sources

- **Checkpoint date:** 28 August 2026
- **Reporting window:** 26-28 August 2026
- **Participants:** Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy
- **Sprint focus:** Establish the contracts and persistence needed for parallel Intermediate delivery
- **Evidence:** Issues #159-#186 and merged PRs #187-#196

## AI declaration

This Daily Scrum summary was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository and Gitea history.

Navigation titles, supplied-photo placement, and documentation integration updated with assistance from
Codex-CLI[GPT-6].

Layout and section structure revised with assistance from Codex[GPT-6], using `vitaqsprint.pdf` as the presentation reference.
