---
title: Sprint reports
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint reports

Read each sprint as one report, following the ceremony order in
`vitaqsprint.pdf`: planning, Daily Scrums, backlog refinement, Review, and
Retrospective. Each report uses short summaries, action lists, and the meeting
photos retained with its records. Confirmed mappings and presentation-only
placements are distinguished in the photo source notes.

- [Sprint 1 report](sprint-1/report.md) — first location slice and Basic foundations.
- [Sprint 2 report](sprint-2/report.md) — remaining Basic work and Intermediate systems.
- [Sprint 3 report](sprint-3/report.md) — Advanced implementation and open release evidence.
- [Sprint 4 report](sprint-4/report.md) — final-submission refinement, performance, and operations through 8 October.

The reports link to the detailed records for owners, issue/PR references,
reporting windows, and source limits. Dates retain their original meaning;
refinement is grouped after the Daily Scrums without changing when it occurred.

Gitea remains the source of truth for current work. The
[project and Git methodology](../project-and-git-methodology.md),
[Sprint 2 governance](../sprint-2-governance-and-evidence.md), and
[Sprint 3 governance](../sprint-3-governance-and-evidence.md) describe the shared
workflow and evidence requirements.

## Record status

The Sprint 1 planning and Daily Scrum pages were assembled on 24 August 2026,
and its Review and Retrospective records were added on 25 August. The Sprint 2
records were completed on 15 September using the evidence retained throughout
the sprint. The reliable sources are:

1. Gitea issue titles, timestamps, assignees, labels, milestones, and state;
2. pull-request and Git commit history;
3. architecture, planning, testing, and deployment documents committed at the
   time; and
4. five team-call images supplied for the Sprint 1 planning and Daily Scrum
   records;
5. three dated Sprint 2 stakeholder records and the sanitised formal
   user-feedback report; and
6. team-confirmed recollection, explicitly labelled where it is used.

The Sprint 1 summaries remain retrospective reconstructions, not verbatim
meeting transcripts. Their source limits, labelled inferences, and missing exact
meeting times remain part of the historical record. The new Sprint 2 records
and supplied images do not change those Sprint 1 claims.

## Sprint 4 record

Read the [Sprint 4 Meetings page](sprint-4/report.md) for reconstructed planning,
four Daily Scrums, refinement, Review, and Retrospective. The
[Sprint 4 source register](sprint-4/report.md#merge-register) links all 27 selected merged PRs
and their immutable merge commits through `a9dca04` on 8 October.

The reporting windows group final-submission work from 29 September to
8 October, with dates shown in Africa/Johannesburg time. Meeting discussion and
actions are inferred from repository history; original minutes, attendance, and
ceremony dates were not supplied. The 11 October submission target remains
outside this interim snapshot.

Five [supplied Sprint 4 photos](sprint-4/report.md#image-provenance) appear beside
planning and Daily Scrums 1–4 in numbered order. Placement follows the earlier
sprint layout, without establishing meeting dates or a confirmed photo mapping.

## Sprint 3 record

The Sprint 3 set follows the shared report structure with repository-backed reporting
windows, reviewed against main `c0fd42b` on 28 September. These windows describe
delivery activity, not inferred ceremony dates. Team roles describe coordination
responsibilities; attendance, meeting media, stakeholder decisions and release
acceptance can be added when their evidence is supplied. See the
[Sprint 3 governance page](../sprint-3-governance-and-evidence.md) for the
current evidence boundaries and feedback workflow.

Read the [Sprint 3 report](sprint-3/report.md) for the complete
ceremony sequence and links to all eight detailed records.

The [Sprint 3 survey report](../../testing/sprint-3-user-feedback-results.md)
provides the new response evidence. The separate
[stakeholder review plans](../stakeholder-interactions/index.md#sprint-3-review-plans)
retain their implementation references and follow-up actions. Sprint 1 and
Sprint 2 photos are not reused as Sprint 3 evidence.

## Sprint 3 photo provenance

Uzair supplied five team-call screenshots in the Sprint 3 static image folder.
They were renamed in the supplied numbered order and preserved byte-for-byte.

| Supplied filename | Retained image                                               | Displayed alongside                                       |
| ----------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `1.png`           | [daily-scrum-01.png](/img/scrum/sprint-3/daily-scrum-01.png) | [Planning](sprint-3/initial-planning.md#meeting-photo)    |
| `2.png`           | [daily-scrum-02.png](/img/scrum/sprint-3/daily-scrum-02.png) | [Daily Scrum 1](sprint-3/daily-scrum-01.md#meeting-photo) |
| `3.png`           | [daily-scrum-03.png](/img/scrum/sprint-3/daily-scrum-03.png) | [Daily Scrum 2](sprint-3/daily-scrum-02.md#meeting-photo) |
| `4.png`           | [daily-scrum-04.png](/img/scrum/sprint-3/daily-scrum-04.png) | [Daily Scrum 3](sprint-3/daily-scrum-03.md#meeting-photo) |
| `5.png`           | [daily-scrum-05.png](/img/scrum/sprint-3/daily-scrum-05.png) | [Daily Scrum 4](sprint-3/daily-scrum-04.md#meeting-photo) |

The images are retained in commit `aca1ee5`. Their bytes and asset URLs are
unchanged. Photo 1 appears with planning, followed by photos 2–5 with the four
Daily Scrum records, to match the earlier sprint layout. This is a presentation
order, not a confirmed meeting-to-photo mapping.

The [Sprint 3 Meetings page](sprint-3/report.md) uses the same placement. The
[photo notes](sprint-3/report.md#meeting-photos) retain the source limits:
filenames identify supplied order, not verified dates, discussion, stakeholder
attendance, or agreement.

## Sprint 2 record

Read the [Sprint 2 report](sprint-2/report.md) for the complete
ceremony sequence and links to all eight detailed records.

## Sprint 1 record

Read the [Sprint 1 report](sprint-1/report.md) for the complete
ceremony sequence and links to all eight detailed records.

## Sprint 2 meeting photos

Kevin supplied four images and confirmed their order for the four Daily Scrum
records. The images were found in `apps/web/` and moved without modification
into the documentation site's Sprint 2 image folder.

| Original filename | Meeting record                                                                   | Documentation image                     |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| `content.png`     | [Daily Scrum 1 — Foundations](sprint-2/daily-scrum-01.md#meeting-photo)          | `img/scrum/sprint-2/daily-scrum-01.png` |
| `content2.png`    | [Daily Scrum 2 — Backend integration](sprint-2/daily-scrum-02.md#meeting-photo)  | `img/scrum/sprint-2/daily-scrum-02.png` |
| `content3.png`    | [Daily Scrum 3 — Player experience](sprint-2/daily-scrum-03.md#meeting-photo)    | `img/scrum/sprint-2/daily-scrum-03.png` |
| `content4.png`    | [Daily Scrum 4 — Testing and feedback](sprint-2/daily-scrum-04.md#meeting-photo) | `img/scrum/sprint-2/daily-scrum-04.png` |

The mapping follows the supplied order, not inferred image timestamps. Checkpoint
dates and reporting windows come from the written records; the images do not
independently establish dates, identities, attendance or what was discussed.
Planning, refinement, Review and Retrospective do not receive reused Daily Scrum
photos. The separate [Calvin Rea stakeholder meetings](../stakeholder-interactions/index.md)
retain their own records and attachments.

## Sprint 1 image provenance

The images were supplied under the filenames `sprint plan.png` and
`daily1.png` through `daily4.png`. They have been moved into the Docusaurus
static assets under `img/scrum/sprint-1/` and mapped to the records in filename
order. Their file metadata does not establish when the calls occurred, so the
dates on these pages come from the repository and Gitea timeline rather than
from the images.

The four Sprint 1 Daily Scrum pages are representative check-in records spread across
the delivery period. Each summarises repository activity since the preceding
record; the dates do not imply these were the team's only coordination points.
The Sprint 1 Review and Retrospective have no associated supplied image. Their
source limits and historical evidence are unchanged. Sprint 2 adds its own
repository, tracker, stakeholder, user-testing and supplied-photo evidence.

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
