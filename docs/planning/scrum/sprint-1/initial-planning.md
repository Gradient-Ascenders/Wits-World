---
title: Initial sprint planning
sidebar_position: 1
---

# Sprint 1 initial planning

:::note[Historical Sprint 1 evidence]

This page preserves a reconstructed Sprint 1 planning record. It is not a
current plan; see the [Scrum records overview](../index.md) for its evidence and
inference boundaries.

:::

| Field              | Record                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Reconstructed date | 5 August 2026                                                                                         |
| Milestone          | Sprint 1                                                                                              |
| Planning horizon   | Initial vertical slice, followed by release validation before the milestone due date                  |
| Team in scope      | Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy                                     |
| Source status      | Retrospective reconstruction from Gitea issues #10–#21, Git history, and committed planning documents |

> This is not a contemporaneous transcript. Exact meeting time, duration,
> facilitator, and individual statements were not recorded in the available
> repository evidence.

![Four-person team call image supplied for the Sprint 1 planning record](/img/scrum/sprint-1/sprint-planning.png)

_Supplied planning image. The image supports that a four-person call image was
provided for this record; its date and participant identities were not derived
from file metadata._

## Sprint goal

Deliver a deployable, mobile-friendly Wits Quest vertical slice in which an
authenticated player can discover a published campus event, submit a
browser-reported location, and receive a server-authoritative PostGIS eligibility
decision. The slice should establish the separate Web/API architecture,
repeatable quality checks, and public project documentation needed for later
gameplay.

## Why this increment was selected

The location journey exercises every major architectural boundary early:

- the React browser interface and accessibility baseline;
- Auth0 authentication and bearer-token handling;
- the hand-written Fastify API and controlled CORS boundary;
- PostgreSQL/PostGIS persistence and distance calculations;
- an external map service used for presentation only;
- CI/CD and independent Web/API deployment; and
- version-controlled public documentation.

Completing this thin end-to-end path was considered more useful than building
isolated card or battle screens before authentication, data authority, and
deployment had been proven.

## Initial sprint backlog and ownership

The table reflects the issue assignments recorded in Gitea. Issue links may
require access to the private course Gitea instance.

| Area                          | Owner      | Planned issues and outcome                                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared methodology            | Whole team | [#10](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/10) establish the project and Git methodology                                                                                                                                                                                         |
| Product and player experience | Kevin      | [#12](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/12) render the campus map and event; [#21](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/21) submit reported location and display eligibility                                                                           |
| API and security              | Tyron      | [#11](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/11) select authentication; [#13](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/13) validate tokens; [#14](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/14) expose event endpoints                        |
| Data and infrastructure       | Uzair      | [#16](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/16) configure PostgreSQL/PostGIS; [#18](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/18) add the event migration and seed; [#19](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/19) implement eligibility |
| Quality and delivery          | Caleb      | [#15](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/15) publish documentation; [#17](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/17) establish CI and deployment; [#20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20) validate and release the slice    |

## Dependency order

1. Establish repository conventions, application boundaries, and environment
   handling.
2. Scaffold the independently buildable Web and API applications.
3. Configure Auth0, database access, migrations, event data, and CI.
4. Implement protected event discovery and PostGIS eligibility endpoints.
5. Connect the player interface, map/list presentation, and reported-location
   action to the HTTP API.
6. Deploy the Web and API independently, publish documentation, and validate the
   integrated journey.

## Working agreements

The planned working agreement, reconstructed from issue #10 and the methodology
documents, was:

- use Gitea issues as the backlog and keep acceptance criteria visible;
- work on short-lived branches rather than directly on `main`;
- link implementation to issues and use pull requests for human review;
- keep protected decisions in the API and treat browser data as untrusted;
- add proportionate tests and documentation with each feature;
- keep secrets out of Git and browser-visible environment variables; and
- record AI assistance accurately in commits and submission-facing documents.

## Definition of Done used for planning

A backlog item would be considered complete only when its acceptance criteria
were implemented, relevant tests passed, CI succeeded, review findings were
resolved, documentation and security/accessibility impacts were addressed, and
the authorised pull request was merged. External or manual validation that had
not happened would remain explicit rather than being marked as complete.

## Initial risks and responses

| Risk                                                                  | Planned response                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Browser-calculated eligibility could be manipulated                   | Store event geometry in PostGIS and return the API decision                           |
| Map failure could block discovery                                     | Maintain an accessible text event list independent of the map                         |
| Authentication work could expand into unsafe custom password handling | Select an established provider and validate its access tokens in the API              |
| Frontend and backend could become a single deployment                 | Keep `apps/web` and `apps/api` independently buildable and deployed                   |
| CI or deployment might arrive too late                                | Establish the pipeline in the same vertical slice                                     |
| Numeric location thresholds were not yet validated                    | Treat them as provisional and create field-test follow-up rather than claim certainty |

## Planning outcome

The planned increment, ownership split, and dependency order are strongly
supported by the issue creation and subsequent commit history. Exact spoken
agreements are not available; the outcome above is the smallest reconstruction
consistent with the work that followed.

## AI declaration

This retrospective planning record was generated with assistance from
Codex[GPT-5] using repository and Gitea evidence. It is not presented as a
verbatim historical transcript.
The historical-status notice was added with assistance from
Codex-CLI[GPT-5].
