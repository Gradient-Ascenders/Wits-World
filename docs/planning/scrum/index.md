---
title: Scrum records
sidebar_position: 1
---

# Scrum records

:::note[Historical Sprint 1 evidence]

These records preserve an evidence-based reconstruction of Sprint 1. They are
not current delivery status or verbatim meeting transcripts; the source limits
and inference rules below remain part of the record.

:::

Wits World uses a lightweight Scrum-inspired process in which Gitea issues are
the product backlog, short-lived branches and pull requests carry the work, and
CI plus human review provide the quality gate. The durable process is described
in the [project and Git methodology](../project-and-git-methodology.md); this
section records how that process was applied during Sprint 1.

## Record status

The initial planning and Daily Scrum pages were assembled retrospectively on 24
August 2026. The Review and Retrospective records were added on 25 August after
the team confirmed that both ceremonies occurred. These pages are not verbatim
transcripts and must not be read as proof that every sentence was said in a
meeting. The reliable sources are:

1. Gitea issue titles, timestamps, assignees, labels, milestones, and state;
2. pull-request and Git commit history;
3. architecture, planning, testing, and deployment documents committed at the
   time; and
4. five team-call images supplied for the planning and Daily Scrum records;
5. team-confirmed recollection, explicitly labelled where it is used.

Where the sources establish an outcome, the record states it directly. Where a
discussion or intention is reconstructed from later activity, it is labelled as
an inference. Missing attendance, exact meeting times, and verbatim statements
are not invented.

## Sprint 1 record

| Ceremony or record                                           | Reconstructed date      | Purpose                                                                                          |
| ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------ |
| [Initial sprint planning](./sprint-1/initial-planning.md)    | 5 August 2026           | Establish the first vertical-slice goal, ownership, dependencies, and Definition of Done         |
| [Daily Scrum 01](./sprint-1/daily-scrum-01.md)               | 6 August 2026           | Coordinate the repository, architecture, web, and database foundations                           |
| [Daily Scrum 02](./sprint-1/daily-scrum-02.md)               | 10 August 2026          | Integrate CI, Auth0, the API, PostGIS eligibility, and the first deployment                      |
| [Backlog refinement](./sprint-1/backlog-refinement.md)       | 11–12 August 2026       | Add validation work and decompose the remaining Basic-tier journey                               |
| [Daily Scrum 03](./sprint-1/daily-scrum-03.md)               | 13 August 2026          | Coordinate refinement outcomes, public documentation, contracts, and delivery preparation        |
| [Daily Scrum 04](./sprint-1/daily-scrum-04.md)               | 17 August 2026          | Integrate the Basic-tier loop and identify release-readiness work                                |
| [Sprint 1 Review](./sprint-1/sprint-review.md)               | Exact date not retained | Reconstruct the delivered increment, review topics, assessment, limitations, and carry-over work |
| [Sprint 1 Retrospective](./sprint-1/sprint-retrospective.md) | Exact date not retained | Preserve team-confirmed improvement themes and concrete Sprint 2 process actions                 |

## Image provenance

The images were supplied under the filenames `sprint plan.png` and
`daily1.png` through `daily4.png`. They have been moved into the Docusaurus
static assets under `img/scrum/sprint-1/` and mapped to the records in filename
order. Their file metadata does not establish when the calls occurred, so the
dates on these pages come from the repository and Gitea timeline rather than
from the images.

The four Daily Scrum pages are representative check-in records spread across
the delivery period. Each summarises repository activity since the preceding
record; the dates do not imply these were the team's only coordination points.
The Review and Retrospective have no associated supplied image and do not infer
attendance or exact dates from the planning/Daily Scrum material.

## AI declaration

This retrospective evidence structure and its narrative summaries were created
with assistance from Codex[GPT-5]. The underlying issues, commits, pull
requests, project documents, and supplied images remain the evidence sources.
The historical-status notice was added with assistance from
Codex-CLI[GPT-5].
