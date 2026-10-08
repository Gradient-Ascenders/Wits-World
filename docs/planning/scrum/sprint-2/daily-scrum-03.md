---
title: Sprint 2 Daily Scrum 3
sidebar_position: 4
---

# Sprint 2 Daily Scrum 3

**Date:** 5 September 2026.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-03.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 3">
    <img
      src="/img/scrum/sprint-2/daily-scrum-03.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 3 — checkpoint recorded as 5 September 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

## Summary of Progress {/* #progress-since-the-previous-checkpoint */}

- **Product/Web:** Kevin delivered the account lifecycle experience, ordering challenge authoring/player flow, profile and progression navigation, trail discovery, asynchronous PvP experience, and related responsive state handling.
- **API/security:** Tyron completed voluntary PvP resignation and outgoing invitation cancellation, while supporting the integrated account, progression, trail, and curation contracts consumed by the Web client.
- **Data:** Uzair reviewed database architecture and removed six redundant indexes without changing domain behaviour.
- **Quality/delivery:** Caleb surfaced question performance analytics and continued coordination of content, test automation, poor-GPS, and release-evidence work.

## Blockers Raised During Stand-ups {/* #remaining-concerns */}

- The 30-card catalogue, evolution flows, and production event/question set
  were still active content dependencies.
- Database, package, and browser automation had not yet become a complete PR,
  nightly, and release verification path.
- Final participant testing and deployed release validation remained open.

## Actions Taken

### Integrated outcomes

1. Players could recover passwords and request protected account deletion.
2. Authors and players could use the ordering challenge format end to end.
3. Profiles exposed progression, achievements, streaks, and standings from
   server-owned data.
4. Players could discover ordered trails and nearby unvisited events.
5. Asynchronous PvP supported invitations, legal turn submission, deadlines,
   cancellation, resignation, and match presentation.
6. Authors could manage curation, campaign, and analytics capabilities through
   protected role-checked operations.

### Stakeholder integration

The [4 September database usage review](../../stakeholder-interactions/2026-09-04-database-usage-review.md)
raised Neon compute consumption, possible JSON restructuring, and database
pipeline options. The team retained the relational model, separated production
and test databases, allowed idle compute to suspend, and removed redundant
indexes. The alternatives that were not selected remained documented rather
than being presented as implemented.

### Coordination points

- UI states had to display server-returned deadlines, actors, progression,
  eligibility, and validation failures rather than infer them locally.
- Author curation and campaign screens had to preserve role checks and avoid
  exposing accepted challenge answers through player endpoints.
- The richer navigation increased the need for consistent loading, empty,
  error, permission, and success feedback.

## Next Actions {/* #plan-before-the-next-checkpoint */}

- Finish the card catalogue, Power-card migration compatibility, and atomic
  evolution behaviour.
- Standardise application feedback states across player and Author workflows.
- Complete automated verification and verified event/question content.
- Run formal user testing, convert findings into Gitea issues, and verify the
  resulting changes.

## Record Details and Sources

- **Checkpoint date:** 5 September 2026
- **Reporting window:** 31 August-5 September 2026
- **Participants:** Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy
- **Sprint focus:** Expose the new account, challenge, progression, trail, PvP, and Author capabilities through usable UI
- **Evidence:** Merged PRs #209, #211, #214, #218, and #221-#226; 4 September stakeholder review

## AI declaration

This Daily Scrum summary was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository, Gitea, and stakeholder evidence.

Navigation titles, supplied-photo placement, and documentation integration updated with assistance from
Codex-CLI[GPT-6].

Layout and section structure revised with assistance from Codex[GPT-6], using `vitaqsprint.pdf` as the presentation reference.
