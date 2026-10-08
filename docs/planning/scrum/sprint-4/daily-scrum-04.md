---
title: Sprint 4 Daily Scrum 4
sidebar_position: 5
toc_max_heading_level: 2
---

# Sprint 4 Daily Scrum 4

**Reporting point:** 7–8 October 2026 reporting window.

Reconstructed on 8 October 2026 from repository history. Discussion, decisions, and actions below are inferred summaries; original minutes, ceremony dates, and attendance were not supplied.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-05.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 5">
    <img
      src="/img/scrum/sprint-4/meeting-05.png"
      alt="Sprint 4 supplied team-call photo 5"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 5, displayed with Daily Scrum 4.</figcaption>
</figure>

Photos follow the supplied order for presentation. Their dates and association with individual meetings remain unconfirmed. See the [photo sources](report.md#image-provenance).

## Summary of Progress

- Homepage-to-Explore navigation retained the SPA path, and mobile map startup work was reduced ([PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355), [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359)).
- App-wide loading and retained-refresh behavior were integrated, including safe slow-load recovery and background saved-attempt sync ([PR #360](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/360)). The merge includes the work referenced by issues #356 and #357.
- Idle gameplay coordination and operational guidance were integrated ([PR #361](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/361)). Commit [`d137554`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/d137554) keeps existing ranked expiry and due territory settlement available during Redis outages.
- PostgreSQL LISTEN subscriptions moved to a dedicated direct pool ([PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362)), while gateway reads retain the shared authoritative database path.

## Blockers and Open Questions

- Coordinated idle scheduling remains a staged rollout; the polling default and deployment prerequisites must stay explicit.
- Listener isolation needs the private direct LISTENER_DATABASE_URL setting and aggregate Neon session headroom checks.
- Neither structural tests nor merged scheduling code prove deployed Neon suspension or a measured production latency improvement.
- Loading recovery must not expose protected content or silently repeat submitted actions.

## Actions Taken

- Kept confirmed content through revisits and refreshes and scoped loading feedback to the affected operation.
- Separated new-work coordination from PostgreSQL-fenced existing-work cleanup during Redis outages.
- Separated notification subscriptions from request-pool capacity and documented startup, reconnect, and shutdown checks.

## Next Actions

- Complete the remaining submission-period work after this 8 October snapshot.
- Provision and verify listener configuration before the corresponding release.
- Run the documented hosted coordination, outage, recovery, and signed-in journeys against a named revision.
- Record measured outcomes, unresolved findings, and actual stakeholder review results in the release evidence.

## Record Details and Sources

- **Scope:** final-submission work grouped as Sprint 4, 29 September–8 October 2026.
- **Snapshot:** local `origin/main` at [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f).
- **Dates:** reporting points and windows chosen for this reconstruction, shown in Africa/Johannesburg time.
- **Attendance and original minutes:** not supplied.
- **Evidence:** [PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355), [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359)–[PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362); source commits include [`84cd985`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/84cd985), [`dcb6fc6`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/dcb6fc6), [`54f7bc8`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/54f7bc8), [`d137554`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/d137554), and [`bd45690`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/bd45690).

## AI declaration

Prepared with assistance from Codex[GPT-6], using Git history and existing project documentation. Meeting discussion and actions are reconstructions; commit authorship does not establish meeting attendance.
