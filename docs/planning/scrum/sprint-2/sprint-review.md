---
title: Sprint 2 review
sidebar_position: 7
---

# Sprint 2 review

This Review record compares the Sprint 2 goal with the integrated increment and
the evidence available on 15 September 2026. Detailed implementation and review
history remains in the linked issues and pull requests.

## Record status

| Field                   | Record                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Review date             | 15 September 2026                                                                                        |
| Milestone due           | 15 September 2026                                                                                        |
| Participants            | Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy                                        |
| Stakeholder             | Calvin Rea, through the three linked Sprint 2 review records                                             |
| Tracker snapshot        | 27 of 28 live Sprint 2 milestone issues closed; #167 open                                                |
| Additional planned gate | #186 open; #179-#186 lacked Sprint 2 milestone metadata in the inspected tracker state                   |
| Primary evidence        | Gitea issues/PRs, Git history, CI/testing docs, stakeholder records, and sanitised user-feedback results |

## Sprint goal assessment

The sprint delivered the planned remaining Basic implementation and a broad
Intermediate feature increment. Account lifecycle, ordering challenges,
movement checks, progression, achievements, duplicate/evolution mechanics,
ordered trails, asynchronous PvP, curation, campaigns, analytics, production
cards, and verified event content were integrated into `main`.

The implementation goal was therefore substantially achieved. The release goal
was not yet fully evidenced because Basic validation issue #167 and Intermediate
validation issue #186 remained open, participant retests were outstanding, and
some manual/deployed checks had not been recorded.

## Delivered increment

| Capability                      | Review evidence                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account lifecycle               | Account deletion retention and anonymisation in PR #187; player password-reset/deletion experience in PR #211                                              |
| Second challenge format         | Ordering persistence/API in PR #188 and author/player UI in PR #214                                                                                        |
| Movement integrity and privacy  | Privacy-limited evidence in PR #200 and impossible-journey/too-fast checks in PR #203                                                                      |
| Progression and profiles        | Persistence in PR #192, API in PR #196, and player profile/navigation in PR #221                                                                           |
| Duplicate selling and evolution | Atomic backend evolution in PR #233 and dedicated UI/shared frames in PR #235                                                                              |
| Trails                          | Ordered trail persistence/API in PR #197 and nearby-unvisited UI in PR #223                                                                                |
| Asynchronous PvP                | Contract in PR #195, persistence in PR #199, APIs/deadlines in PR #204, UI in PR #222, and cancellation/resignation follow-ups in PRs #224, #226, and #229 |
| Author workflow and campaigns   | Curated publication in PR #198, campaign scheduling/retirement in PR #201, Author UI in PR #209, and question analytics in PR #225                         |
| Production content              | 30-card catalogue/art in PR #230 and ten verified events/one hundred questions in PR #238                                                                  |
| Testing and delivery            | PR/nightly/release verification in PR #236, E2E hardening in PRs #239 and #246, plus deployment/database reliability fixes                                 |
| User-feedback integration       | Five issues #240-#244 and battle authority/performance/clarity work in PR #245                                                                             |

Repository history also contains prepared offline challenge play in PR #227.
It is recorded as delivered work, but its release acceptance still belongs to
the validation gate rather than being inferred from merge status.

## Stakeholder review outcomes

| Date                                                                                   | Topic and feedback                                                          | Team evaluation and integration                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [4 September](../../stakeholder-interactions/2026-09-04-database-usage-review.md)      | Neon compute consumption, JSON restructuring, and database pipeline options | Retained relational integrity; separated production/test databases; enabled idle suspension; removed redundant indexes |
| [8 September](../../stakeholder-interactions/2026-09-08-trails-and-card-art-review.md) | Trails required; SVG card art considered                                    | Trails delivered; raster production art retained as the lower-risk asset approach                                      |
| [11 September](../../stakeholder-interactions/2026-09-11-frontend-ui-review.md)        | Frontend presentation needed improvement                                    | PR #234 standardised user feedback states and refined player/Author workflows                                          |

## User-feedback review

Ten structured responses collected on 13 September produced five prioritised
findings. Issues #240-#242 were connected to PR #245, which added authority
regressions, reduced repeated database work, and clarified turn/request state.
Issues #243 and #244 captured deck and first-time journey clarity requirements,
but the [results report](../../../testing/sprint-2-user-feedback-results.md)
still records missing linked implementation/retest evidence.

The feedback is evidence of collection and evaluation. It is not treated as
representative acceptance, and issue closure is not substituted for participant
retesting.

## Quality and authority review

- Protected operations continued to derive identity and roles from validated
  authentication rather than browser-supplied player authority.
- Location, challenge marking, rewards, progression, ownership, evolution,
  PvP actors/deadlines, and publication remained server-owned.
- Database changes used migrations and included compatibility fixes where the
  existing Power-card catalogue exposed an upgrade-path defect.
- PR, nightly, and release workflows broadened automated validation across
  packages, applications, migrations, and E2E paths.
- Performance work in PR #245 reduced known API/database hot paths while
  retaining legal-action and duplicate-submission protections.

## Review decisions

1. Accept the merged feature increment as the Sprint 2 implementation result.
2. Keep #167 open until Basic deployed, stakeholder, participant,
   accessibility, field, and release evidence is reconciled.
3. Keep #186 open until the planned Intermediate systems are demonstrated and
   validated against a named revision/environment.
4. Require focused retests for `UT-S2-01` through `UT-S2-05`, with explicit
   implementation evidence for #243 and #244.
5. Correct missing milestone/project metadata for carry-over work rather than
   relying on historical Markdown ownership.

## Carry-over

- Complete and close #167 with exact automated, deployed, field,
  accessibility, stakeholder, and participant evidence.
- Complete and close #186 with an integrated Intermediate demonstration and
  known-limitation record.
- Reconcile implementation and retest evidence for #243 and #244.
- Verify external API/docs availability and the final named deployment.
- Retain future ceremony and feedback records contemporaneously.

## Review conclusion

Sprint 2 produced a substantial integrated feature increment and demonstrated
active use of issues, reviewed PRs, automated checks, stakeholder feedback, and
formal user findings. It should not be represented as fully released or fully
validated until the two open release gates and retest boundaries are resolved.

## AI declaration

This Sprint 2 Review record was generated with assistance from Codex-CLI[gpt-5.6-sol medium]
using repository, Gitea, stakeholder, and user-testing evidence.

Navigation titles and documentation integration updated with assistance from
Codex-CLI[GPT-6].
