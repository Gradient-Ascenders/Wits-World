---
title: Daily Scrum 04 - verification and feedback
sidebar_position: 6
---

# Daily Scrum 04 - verification and feedback

| Field            | Record                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Checkpoint date  | 13 September 2026                                                                                     |
| Reporting window | 6-13 September 2026                                                                                   |
| Participants     | Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy                                     |
| Sprint focus     | Finish production content, harden automated verification, and integrate stakeholder and user feedback |
| Evidence         | Merged PRs #229-#246; stakeholder records dated 8 and 11 September; ten user-testing responses        |

## Progress since the previous checkpoint

| Workstream       | Evidence-backed update                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/Web      | Kevin delivered shared collectible/evolution frames, dedicated duplicate/evolution flows, improved PvP cancellation/forfeit presentation, and consistent loading, error, empty, permission, and success states. |
| API/security     | Tyron implemented atomic card evolution and then addressed the highest-priority user findings around illegal CPU actions, battle latency, pending actions, and turn clarity in PR #245.                         |
| Data             | Uzair completed the 30-card catalogue and artwork, fixed upgrades of existing Power-card rows, and retained migration compatibility for existing databases.                                                     |
| Quality/delivery | Caleb automated PR/nightly/release verification, delivered ten verified events and one hundred questions, documented the poor-GPS decision, hardened nightly E2E diagnostics, and coordinated final evidence.   |

## Stakeholder feedback integrated

- The [8 September trails and card-art review](../../stakeholder-interactions/2026-09-08-trails-and-card-art-review.md)
  confirmed that trails were required. Ordered trail APIs and the nearby trail
  experience were already implemented; raster production artwork was retained
  instead of switching to SVG.
- The [11 September frontend UI review](../../stakeholder-interactions/2026-09-11-frontend-ui-review.md)
  requested improved presentation. PR #234 standardised feedback states and
  refined the player and Author interfaces.

## Formal user feedback

Ten questionnaire responses were collected on 13 September. The sanitised
[Sprint 2 user-feedback results](../../../testing/sprint-2-user-feedback-results.md)
identified five prioritised findings:

| Finding                                          | Outcome by this checkpoint                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `UT-S2-01` possible out-of-turn CPU action       | #240 investigated; PR #245 retained server actor/version checks and disabled invalid client controls      |
| `UT-S2-02` CPU battle latency and pacing         | #241 addressed in PR #245 with fewer identity writes and bounded match-history queries                    |
| `UT-S2-03` battle turn/effect clarity            | #242 partially addressed in PR #245 with explicit turn and synchronisation states                         |
| `UT-S2-04` deck requirements unclear             | #243 recorded and closed; linked implementation/retest evidence remained incomplete in the results report |
| `UT-S2-05` event, quiz, and reward guidance weak | #244 recorded and closed; linked implementation/retest evidence remained incomplete in the results report |

## Verification status

- PR, nightly, and release workflows covered formatting, linting, type checks,
  package tests, database/migration checks, builds, and Basic E2E execution at
  their documented scopes.
- The catalogue and event seeds were tested for repeatability and upgrade
  compatibility.
- CPU actor authority and request-state behaviour gained focused regressions.
- Local and CI evidence remained distinct from signed-in deployed validation.

## Remaining release gates

- [#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
  remained open for Basic release, stakeholder, participant, accessibility,
  field, and deployment validation.
- [#186](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/186)
  remained open for validation of the planned Intermediate systems.
- Participant retests for all five user findings had not been recorded.
- Findings #243 and #244 still needed explicit implementation and retest links.

## Plan for Review

- Reconcile the delivered increment against the Sprint goal and live tracker.
- Keep merged feature status separate from manual/deployed acceptance.
- Carry the two release-validation gates and any missing retest evidence
  explicitly rather than declaring them passed.
- Record process improvements for earlier testing, dependency hygiene, and
  contemporaneous ceremony evidence.

## AI declaration

This Daily Scrum summary was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository, Gitea, stakeholder, and user-testing evidence.
