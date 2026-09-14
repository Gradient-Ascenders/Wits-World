---
title: Scrum records
sidebar_position: 1
---

# Scrum records

:::note[Scrum evidence]

These records preserve Sprint 1 and Sprint 2 planning, coordination,
refinement, Review, and Retrospective summaries. Gitea remains the source of
truth for current work.

:::

Wits World uses a lightweight Scrum-inspired process in which Gitea issues are
the product backlog, short-lived branches and pull requests carry the work, and
CI plus human review provide the quality gate. The durable process is described
in the [project and Git methodology](../project-and-git-methodology.md); this
section records how that process was applied during Sprint 1 and Sprint 2.

The [Sprint 2 governance and evidence](../sprint-2-governance-and-evidence.md)
page defines issue readiness, board workflow, evidence retention, feedback
handling, and release boundaries. These Scrum pages preserve the corresponding
delivery checkpoints and outcomes.

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

## Sprint 2 record

| Ceremony or record                                           | Evidence date or window     | Purpose                                                                                              |
| ------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Initial sprint planning](./sprint-2/initial-planning.md)    | 26 August 2026              | Establish the remaining Basic and planned Intermediate goal, ownership, dependencies, and risks      |
| [Daily Scrum 01](./sprint-2/daily-scrum-01.md)               | 26-28 August 2026           | Coordinate account, ordering, progression, governance, and asynchronous PvP contracts                |
| [Daily Scrum 02](./sprint-2/daily-scrum-02.md)               | 29-30 August 2026           | Integrate trails, movement evidence, campaigns, curation, PvP services, and operational fixes        |
| [Backlog refinement](./sprint-2/backlog-refinement.md)       | 28 August-15 September 2026 | Record rule changes, true dependency boundaries, follow-up defects, and stakeholder/user findings    |
| [Daily Scrum 03](./sprint-2/daily-scrum-03.md)               | 31 August-5 September 2026  | Integrate account, ordering, profile, trail, PvP, campaign, and analytics experiences                |
| [Daily Scrum 04](./sprint-2/daily-scrum-04.md)               | 6-13 September 2026         | Complete content and automated verification, then evaluate stakeholder and formal user feedback      |
| [Sprint 2 Review](./sprint-2/sprint-review.md)               | 15 September 2026           | Compare the integrated increment and evidence with the Sprint 2 goal and retain open release gates   |
| [Sprint 2 Retrospective](./sprint-2/sprint-retrospective.md) | 15 September 2026           | Identify evidence-based improvements for validation timing, dependencies, tracker hygiene, and scope |

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
The Review and Retrospective have no associated supplied image. Sprint 2 uses
its repository, tracker, stakeholder, and user-testing evidence.

## AI declaration

This evidence structure and its narrative summaries were created with
assistance from Codex-CLI[gpt-5.6-sol medium]. The underlying issues, commits, pull requests,
project documents, testing results, feedback records, and supplied Sprint 1
images remain the evidence sources.
