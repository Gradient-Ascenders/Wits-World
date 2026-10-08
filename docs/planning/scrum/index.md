---
title: Sprint reports
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint reports

Read each sprint as one report, following the ceremony order in
`vitaqsprint.pdf`: planning, Daily Scrums, backlog refinement, Review, and
Retrospective. Each report uses short summaries, action lists, and the meeting
photos already mapped to its records.

- [Sprint 1 report](sprint-1/report.md) — first location slice and Basic foundations.
- [Sprint 2 report](sprint-2/report.md) — remaining Basic work and Intermediate systems.
- [Sprint 3 report](sprint-3/report.md) — Advanced implementation and open release evidence.
- [Sprint 4 photos](sprint-4/index.md) — five supplied team-call images.

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

| Supplied filename | Retained image                                               |
| ----------------- | ------------------------------------------------------------ |
| `1.png`           | [daily-scrum-01.png](/img/scrum/sprint-3/daily-scrum-01.png) |
| `2.png`           | [daily-scrum-02.png](/img/scrum/sprint-3/daily-scrum-02.png) |
| `3.png`           | [daily-scrum-03.png](/img/scrum/sprint-3/daily-scrum-03.png) |
| `4.png`           | [daily-scrum-04.png](/img/scrum/sprint-3/daily-scrum-04.png) |
| `5.png`           | [daily-scrum-05.png](/img/scrum/sprint-3/daily-scrum-05.png) |

The images are retained in commit `aca1ee5`. Filenames identify the supplied
order, not verified meeting dates. Five photos were supplied for four written
checkpoints, so the images are displayed in the [Sprint 3 report gallery](sprint-3/report.md#meeting-photos)
until their meeting-to-record mapping is confirmed. They do not independently establish discussion,
stakeholder attendance, or agreement.

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
