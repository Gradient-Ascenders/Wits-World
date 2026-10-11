---
title: Sprint 4 Daily Scrum 1
sidebar_position: 2
toc_max_heading_level: 2
---

# Sprint 4 Daily Scrum 1

**Reporting point:** 29 September–1 October 2026 reporting window.

Reconstructed on 8 October 2026 from repository history. Discussion, decisions, and actions below are inferred summaries; original minutes, ceremony dates, and attendance were not supplied.

[Read the complete sprint report](report.md).

## Meeting photo

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-02.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 2">
    <img
      src="/img/scrum/sprint-4/meeting-02.png"
      alt="Sprint 4 supplied team-call photo 2"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 2, displayed with Daily Scrum 1.</figcaption>
</figure>

Photos follow the supplied order for presentation. Their dates and association with individual meetings remain unconfirmed. See the [photo sources](report.md#image-provenance).

## Summary of Progress

- Homepage work reserved the shell layout and right-sized artwork ([PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)). Commit [`5b76e39`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5b76e39) reports local production-build Lighthouse results; these are recorded local measurements, not deployed acceptance.
- First-install service-worker navigation was corrected, and CPU-match code was deferred from public startup ([PR #334](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/334), [PR #335](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/335)).
- Explore gained clearer navigation, trail-stop numbering, territory detail, map layers, and campus-time presentation ([PR #336](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/336)).
- Collection artwork was resized, CPU battle presentation delays were reduced, and deck hydration reads were reduced ([PR #337](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/337)–[PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339)).

## Blockers and Open Questions

- Public startup, signed-in restoration, and a first CPU battle have different loading boundaries and need separate checks.
- Smaller artwork and deferred modules still need sharp previews, safe chunk-load recovery, and responsive layouts.
- Local Lighthouse measurements do not establish performance on the deployed mobile journey.

## Actions Taken

- Separated public startup work from the optional CPU battle module.
- Kept location guidance, map/list recovery, and trail/territory navigation visible during Explore refinements.
- Reduced presentation and hydration overhead while retaining existing battle state and deck rules.

## Next Actions

- Complete collection, deck, evolution, and trade interfaces.
- Reduce battle-action reads without weakening version, identity, or turn checks.
- Verify first visits, reloads, and mobile card previews against the changed loading paths.

## Record Details and Sources

- **Scope:** final-submission work grouped as Sprint 4, 29 September–8 October 2026.
- **Snapshot:** local `origin/main` at [`a9dca04`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/a9dca04b509eb06a91c3370e7245779d501eb69f).
- **Dates:** reporting points and windows chosen for this reconstruction, shown in Africa/Johannesburg time.
- **Attendance and original minutes:** not supplied.
- **Evidence:** [PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)–[PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339); source commits include [`5b76e39`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5b76e39), [`03d19c7`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/03d19c7), [`5588959`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5588959), and [`6937f55`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6937f55).

## AI declaration

Prepared with assistance from Codex[GPT-6], using Git history and existing project documentation. Meeting discussion and actions are reconstructions; commit authorship does not establish meeting attendance.
