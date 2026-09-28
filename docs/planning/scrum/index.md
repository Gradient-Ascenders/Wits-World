---
title: Sprint meeting records
sidebar_position: 1
---

# Sprint meeting records

:::note[Scrum evidence]

These records preserve Sprint 1 and Sprint 2 summaries and add Sprint 3
repository-backed planning, coordination, refinement, review and retrospective
records. Gitea remains the source of truth for current work.

:::

Wits World uses a lightweight Scrum-inspired process in which Gitea issues are
the product backlog, short-lived branches and pull requests carry the work, and
CI plus human review provide the quality gate. The durable process is described
in the [project and Git methodology](../project-and-git-methodology.md); this
section records how that process was applied across the three increments.

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

The Sprint 1 summaries remain retrospective reconstructions, not verbatim
meeting transcripts. Their source limits, labelled inferences, and missing exact
meeting times remain part of the historical record. The new Sprint 2 records
and supplied images do not change those Sprint 1 claims.

## Sprint 3 record

The Sprint 3 set uses the Sprint 2 structure with repository-backed reporting
windows, reviewed against main `c0fd42b` on 28 September. These windows describe
delivery activity, not inferred ceremony dates. Team roles describe coordination
responsibilities; attendance, meeting media, stakeholder decisions and release
acceptance can be added when their evidence is supplied. See the
[Sprint 3 governance page](../sprint-3-governance-and-evidence.md) for the
current evidence boundaries and feedback workflow.

| Record                                               | Evidence window or snapshot | Purpose                                                                         |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| [Planning](sprint-3/initial-planning.md)             | 16-28 September 2026        | Define the Advanced goal, roles, dependencies and release boundaries            |
| [Checkpoint 1](sprint-3/daily-scrum-01.md)           | 16-19 September 2026        | Establish live, trust, placement, ranked, territory and trading foundations     |
| [Checkpoint 2](sprint-3/daily-scrum-02.md)           | 20-22 September 2026        | Integrate matchmaking, territory runtime and atomic trade persistence           |
| [Backlog refinement](sprint-3/backlog-refinement.md) | 16-28 September 2026        | Trace policy, integration, stakeholder proposals and feedback follow-up         |
| [Checkpoint 3](sprint-3/daily-scrum-03.md)           | 23-25 September 2026        | Integrate trading APIs, analytics, developer access and accessibility           |
| [Checkpoint 4](sprint-3/daily-scrum-04.md)           | 26-28 September 2026        | Consolidate player/Author interfaces, performance, account purge and feedback   |
| [Review](sprint-3/sprint-review.md)                  | 28 September 2026 snapshot  | Map implementation to the goal and retain outstanding release checks            |
| [Retrospective](sprint-3/sprint-retrospective.md)    | 28 September 2026 snapshot  | Recommend evidence-backed improvements to dependencies, validation and feedback |

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
checkpoints, so the images remain linked here until their meeting-to-record
mapping is confirmed. They do not independently establish discussion,
stakeholder attendance, or agreement.

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
