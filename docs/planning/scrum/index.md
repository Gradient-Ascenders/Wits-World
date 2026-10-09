---
title: Sprint reports
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint reports

Each report covers planning, Daily Scrums, backlog refinement, Review, and
Retrospective, with delivery outcomes, follow-up actions, and supporting evidence.

Each sprint has a **Sprint report** and an **Evidence** page. Sprints 2 and 3
also have **User feedback**, containing the questionnaire results actually
collected. Separate governance notes, testing plans, and superseded evidence
pages remain repository-only source material.

- [Sprint 1](sprint-1/report.md) — first location slice and Basic foundations.
- [Sprint 2](sprint-2/report.md) — remaining Basic work and Intermediate systems.
- [Sprint 3](sprint-3/report.md) — Advanced implementation and open release evidence.
- [Sprint 4](sprint-4/report.md) — final-submission refinement through 8 October.

## Reading the evidence

These are historical records, not current tracker status or verbatim transcripts.
Reporting windows describe repository activity; they do not establish ceremony
dates or attendance. Each report distinguishes confirmed recollections,
repository evidence, planned reviews, and outstanding acceptance checks.
Original ceremony notes remain repository-only source records.

Sprint 1 records were assembled on 24–25 August 2026; Sprint 2 records were
completed on 15 September. Sprint 3 uses `main` at `c0fd42b` on 28 September.
Sprint 4 uses `origin/main` at `a9dca04` on 8 October; the 11 October submission
target remains outside that interim snapshot.

Issues, commits, PRs, dated project documents, stakeholder records, sanitised
feedback, and explicitly labelled team recollections provide the evidence.
Merged implementation is not proof of deployed acceptance or participant retests.
See the [project methodology](../project-and-git-methodology.md) for shared
workflow rules; Gitea remains authoritative for current work.

## Sprint 1 image provenance

The images were supplied under the filenames `sprint plan.png` and
`daily1.png` through `daily4.png`. They have been moved into the Docusaurus
static assets under `img/scrum/sprint-1/` and mapped to the records in filename
order. Their file metadata does not establish when the calls occurred, so the
dates on these pages come from the repository and Gitea timeline rather than
from the images.

The four Daily Scrum sections are representative check-ins, not a complete
meeting log. No Review or Retrospective photo was supplied.

## Sprint 2 meeting photos

Kevin supplied four images and confirmed their order for the four Daily Scrum
records. The images were found in `apps/web/` and moved without modification
into the documentation site's Sprint 2 image folder.

| Original filename | Meeting record                                                                          | Documentation image                     |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| `content.png`     | [Daily Scrum 1 — Foundations](sprint-2/report.md#daily-scrum-01-meeting-photo)          | `img/scrum/sprint-2/daily-scrum-01.png` |
| `content2.png`    | [Daily Scrum 2 — Backend integration](sprint-2/report.md#daily-scrum-02-meeting-photo)  | `img/scrum/sprint-2/daily-scrum-02.png` |
| `content3.png`    | [Daily Scrum 3 — Player experience](sprint-2/report.md#daily-scrum-03-meeting-photo)    | `img/scrum/sprint-2/daily-scrum-03.png` |
| `content4.png`    | [Daily Scrum 4 — Testing and feedback](sprint-2/report.md#daily-scrum-04-meeting-photo) | `img/scrum/sprint-2/daily-scrum-04.png` |

The mapping follows the supplied order, not inferred image timestamps. Checkpoint
dates and reporting windows come from the written records; the images do not
independently establish dates, identities, attendance or what was discussed.
No planning, refinement, Review, or Retrospective photo was supplied. The
[stakeholder meetings](../stakeholder-interactions/index.md) retain separate
records and attachments.

## Sprint 3 photo provenance

Uzair supplied five team-call screenshots in the Sprint 3 static image folder.
They were renamed in the supplied numbered order and preserved byte-for-byte.

| Supplied filename | Retained image                                               | Displayed alongside                                              |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `1.png`           | [daily-scrum-01.png](/img/scrum/sprint-3/daily-scrum-01.png) | [Planning](sprint-3/report.md#planning-meeting-photo)            |
| `2.png`           | [daily-scrum-02.png](/img/scrum/sprint-3/daily-scrum-02.png) | [Daily Scrum 1](sprint-3/report.md#daily-scrum-01-meeting-photo) |
| `3.png`           | [daily-scrum-03.png](/img/scrum/sprint-3/daily-scrum-03.png) | [Daily Scrum 2](sprint-3/report.md#daily-scrum-02-meeting-photo) |
| `4.png`           | [daily-scrum-04.png](/img/scrum/sprint-3/daily-scrum-04.png) | [Daily Scrum 3](sprint-3/report.md#daily-scrum-03-meeting-photo) |
| `5.png`           | [daily-scrum-05.png](/img/scrum/sprint-3/daily-scrum-05.png) | [Daily Scrum 4](sprint-3/report.md#daily-scrum-04-meeting-photo) |

The images are retained in commit `aca1ee5`, with unchanged bytes and URLs.
Placement follows supplied order, not a confirmed meeting-to-photo mapping.
Filenames do not verify dates, attendance, discussion, or agreement.

## Sprint 4 photos and sources

The [merge register](sprint-4/evidence.md#merge-register) fixes 27 selected PR
merges and their full commit IDs. Five [supplied photos](sprint-4/report.md#image-provenance)
appear beside planning and Daily Scrums 1–4 in numbered order. Their dates and
meeting associations are unconfirmed; no Review or Retrospective photo is assigned.

## AI declaration

This evidence structure and its narrative summaries were created with
assistance from Codex-CLI[gpt-5.6-sol medium]. The underlying issues, commits, pull requests,
project documents, testing results, feedback records, and supplied Sprint 1
images remain the evidence sources.

Earlier Sprint 1 summaries were prepared with assistance from Codex[GPT-5],
with the historical-status notice added using Codex-CLI[GPT-5]. These original
attributions remain part of the record. Sprint 2 navigation, image provenance,
and integration were updated with assistance from Codex-CLI[GPT-6].

The Sprint 3 record index and photo provenance were added with assistance from
Codex-CLI[gpt-6-sol].

Sprint report layout and navigation revised with assistance from Codex[GPT-6],
using `vitaqsprint.pdf` as the presentation reference.

Image presentation, the Sprint 4 photo page, and site entry points were updated
with assistance from Codex[GPT-6].

Sprint 4 reconstructed records and merge register prepared with assistance from Codex[GPT-6].

Index simplified with assistance from Codex[GPT-6], retaining dated evidence
boundaries and photo provenance.
