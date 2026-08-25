---
title: Backlog refinement
sidebar_position: 4
---

# Sprint 1 backlog refinement

| Field               | Record                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconstructed dates | 11–12 August 2026                                                                                                                                       |
| Trigger             | The first vertical slice was implemented and deployable, but release evidence and the remaining Basic-tier journey were not yet decomposed sufficiently |
| Evidence            | Gitea issue creation history, the committed week-two issue plan, the Basic-tier issue plan, and subsequent implementation commits                       |

> This page records backlog changes that are visible in Gitea and Git. It does
> not claim a single uninterrupted refinement meeting or invent exact votes,
> estimates, or quotations that were not retained.

## Inputs reviewed

- the original Sprint 1 issues #10–#21;
- the deployed authentication/location vertical slice;
- release coordinator issue
  [#20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20);
- outstanding documentation, database-release, accessibility, privacy, and E2E
  evidence;
- unresolved challenge, reward, card, deck, battle, authoring, and account
  lifecycle decisions; and
- team ownership boundaries for product/Web, API/security, data/infrastructure,
  and quality/delivery.

## Refinement on 11 August: release-quality backlog

The first refinement pass added focused work rather than hiding it under the
general release issue:

| Issue                                                                 | Refined outcome                                              | Recorded owner                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [#43](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/43) | Field-test and calibrate location eligibility                | Kevin                                                                                                                                          |
| [#44](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/44) | Validate the accessible mobile journey                       | Kevin                                                                                                                                          |
| [#45](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45) | Review deployed authentication, CORS, and privacy boundaries | Uzair in current Gitea metadata; the committed plan originally described Tyron as owner, so the reassignment/history should be read from Gitea |
| [#46](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46) | Define the challenge and attempt API contract                | Tyron                                                                                                                                          |
| [#47](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/47) | Make database release repeatable                             | Uzair                                                                                                                                          |
| [#48](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/48) | Rehearse PostGIS migration and recovery                      | Uzair                                                                                                                                          |
| [#49](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49) | Design challenge, reward, and ownership persistence          | Uzair                                                                                                                                          |
| [#50](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/50) | Add deterministic vertical-slice E2E coverage                | Caleb                                                                                                                                          |
| [#51](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51) | Refine visual identity and frontend presentation             | Kevin                                                                                                                                          |

### Refinement rationale

- Release quality was separated into independently reviewable security,
  accessibility, recovery, E2E, and presentation work.
- Unvalidated numeric thresholds remained field-test tasks instead of becoming
  undocumented requirements.
- Challenge/reward persistence and the API contract were prepared as design
  foundations, not silently treated as part of the already delivered location
  slice.
- Team load was made visible. The committed plan explicitly warned that Kevin's
  visual and validation load exceeded the nominal week allocation and allowed
  non-blocking polish to carry forward.

## Refinement on 12 August: remaining Basic-tier decomposition

The second pass decomposed the complete game loop into issues #62–#80:

1. resolve product and governance decisions;
2. establish local player profiles, roles, and account lifecycle;
3. add challenge, attempt, card, reward, and ownership persistence;
4. implement authoritative challenge start, marking, timing, and atomic rewards;
5. expose card collections and starter grants;
6. implement saved-deck persistence and player management;
7. implement deterministic CPU rules, persisted matches, and history;
8. implement protected author APIs and the author console; and
9. seed and validate the complete demonstrable Basic journey.

The dependency order prevented the Web client from inventing protected rules
before API, database, and product decisions existed.

## Planning discrepancy retained for transparency

The committed artifact
`docs/planning/wits-quest-sprint-2-gitea-issues.md` calls issues #62–#80 a
Sprint 2 plan. Current Gitea metadata records those issues under the `Sprint 1`
milestone, and their work was completed within the same August delivery period.
This record does not silently choose one label: it treats 12 August as a major
mid-delivery refinement while preserving the naming discrepancy for review.

## Resulting backlog policy

- A backlog item is ready when its user or system outcome, owner, dependencies,
  acceptance criteria, security/data constraints, and evidence expectations are
  clear enough to implement.
- Priority follows the dependency chain and release risk, not merely visual
  appeal or issue age.
- Manual and external checks stay visible as checks; they are not converted into
  automated passes.
- New findings become focused issues instead of silently broadening the active
  implementation branch.
- Work that cannot fit without compromising testing, security, accessibility,
  or documentation is carried forward explicitly.

## Refinement outcome

The refined backlog transformed one deployable location slice into two clear
tracks: evidence needed to release that slice responsibly, and dependency-ordered
work needed to complete the Basic game loop. Subsequent Gitea history shows that
the resulting issues were assigned and closed, but each issue and its pull
request remain the source of truth for completion evidence.

## AI declaration

This retrospective refinement record was generated with assistance from
Codex[GPT-5] using repository and Gitea evidence. Inferences are labelled
and are not presented as verbatim historical discussion.
