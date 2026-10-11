---
title: Sprint 4 Daily Scrum 2
sidebar_position: 3
toc_max_heading_level: 2
---

# Sprint 4 Daily Scrum 2

**Reporting point:** 2–3 October 2026 reporting window.

Reconstructed on 8 October 2026 from repository history. Discussion, decisions, and actions below are inferred summaries; original minutes, ceremony dates, and attendance were not supplied.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-03.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 3">
    <img
      src="/img/scrum/sprint-4/meeting-03.png"
      alt="Sprint 4 supplied team-call photo 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 3, displayed with Daily Scrum 2.</figcaption>
</figure>

Photos follow the supplied order for presentation. Their dates and association with individual meetings remain unconfirmed. See the [photo sources](report.md#image-provenance).

## Summary of Progress

- PvP action-path reads were reduced ([PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340)). Collection, decks, evolution, and trade presentation were refined ([PR #341](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/341)).
- Player profiles gained owner editing, cropped pictures, statuses, favourite owned cards, activity, and achievement presentation ([PR #342](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/342)). Commit [`6514154`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6514154) includes migration 0064 and ownership/deletion boundaries.
- Author workspaces and analytics were streamlined, including review, catalogue, placement, sidebar, and shared loading work ([PR #343](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/343)).
- Player battle lobbies, shared history, and completed battle reports were refined ([PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344)).

## Blockers and Open Questions

- Profile favourites must retain exact owned-card IDs, and editing must remain owner-only.
- Trade, evolution, placement, and battle UI changes must preserve confirmation, version-conflict, and recovery behavior.
- Merge history contains migration-expectation, focus, responsive-metadata, and fixture repairs; these need to stay aligned with the product contracts.

## Actions Taken

- Grouped related player actions and reduced repeated labels across collection, trade, and battle interfaces.
- Kept profile publication opt-in and progression server-authoritative.
- Added reusable Author and battle presentation while keeping saved results and historical context visible.

## Next Actions

- Finish account settings and accessible reading preferences.
- Optimise invitation acceptance and match-detail reads.
- Check mobile layout, native picker interactions, keyboard focus, and migration compatibility together.

## Record Details and Sources

- **Scope:** final-submission work grouped as Sprint 4, 29 September–8 October 2026.
- **Snapshot:** local `origin/main` at [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f).
- **Dates:** reporting points and windows chosen for this reconstruction, shown in Africa/Johannesburg time.
- **Attendance and original minutes:** not supplied.
- **Evidence:** [PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340)–[PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344); source commits include [`4a8a7fd`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/4a8a7fd), [`6514154`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6514154), [`2670c8d`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/2670c8d), [`c251113`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/c251113), and [`fd512e5`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/fd512e5).

## AI declaration

Prepared with assistance from Codex[GPT-6], using Git history and existing project documentation. Meeting discussion and actions are reconstructions; commit authorship does not establish meeting attendance.
