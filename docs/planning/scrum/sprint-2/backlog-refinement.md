---
title: Sprint 2 Backlog Refinement
sidebar_position: 6
---

# Sprint 2 Backlog Refinement

**Date:** 28 August–15 September 2026.

[Read the complete sprint report](report.md).

## Discussion {/* #inputs-reviewed */}

Review the goal, dependencies, release evidence, and follow-up scope across the sprint. The record below summarises the retained sources.

- the Sprint 2 goal and issue set #159-#186;
- dependency links between persistence, API, UI, content, and release work;
- merged pull-request review findings and migration compatibility failures;
- Neon compute/storage constraints and deployment reliability;
- stakeholder reviews on 4, 8, and 11 September; and
- ten user-testing responses and findings `UT-S2-01` through `UT-S2-05`.

## Completed or Mostly Completed Items

- Account lifecycle, ordering, progression, trails, and asynchronous PvP were integrated.
- The card catalogue, event/question content, curation, campaigns, and analytics were delivered.
- Stakeholder feedback and five user findings were evaluated and linked to follow-up work.

These are implementation outcomes across the refinement period; final release validation and participant retests remained separate.

## Items Needing Refinement {/* #tracker-reconciliation-snapshot */}

- Complete validation gates #167 and #186.
- Retest all five user findings and add missing implementation links for #243 and #244.
- Correct missing Sprint 2 milestone metadata on planned issues #179–#186.

On 15 September, the live `Sprint 2` milestone contained 28 issues: 27 closed
and [#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
open. Planned issues #179-#186 were created as part of the same Sprint 2 issue
set but did not have Sprint 2 milestone metadata in the inspected Gitea state.
Of those, #179-#185 were closed and
[#186](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/186) remained
open as the Intermediate validation/release gate.

This discrepancy is retained rather than rewriting the live tracker history.
Future refinement should ensure the milestone and board are assigned when an
issue is created.

## Backlog Decisions

### Refinement pass 1: rules and dependencies

Early implementation resolved rules that changed downstream scope:

- **Progression replaced the planned coin economy:** [#193](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/193) removed coin rewards and wallet persistence after progression persistence was established
- **Intermediate work had several parallel lanes:** Native dependencies were reserved for actual blockers, allowing account, ordering, catalogue, movement, progression, trails, PvP-contract, and governance work to start independently
- **PvP required a stable authority contract:** #178 preceded persistence and routes so actor, version, deadline, privacy, and legal-action rules were shared before implementation
- **Content and verification were long-running tasks:** #164-#167 continued alongside service/UI work instead of blocking unrelated Intermediate slices

### Refinement pass 2: integrated lifecycle completeness

As asynchronous PvP and catalogue work reached the UI, focused follow-up issues
were created rather than expanding merged issue scope silently:

- **[#219](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/219):** Add voluntary resignation so a player is not trapped in an asynchronous match
- **[#220](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/220):** Allow cancellation of an outgoing invitation before acceptance
- **[#228](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/228):** Make cancellation and forfeit results understandable in the player interface
- **[#231](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/231):** Repair the catalogue migration for existing Power-card rows instead of only supporting a clean database

Pull-request review also returned work for correction when transaction,
migration, authority, or CI requirements were not met. Resolution remained in
the original PR history rather than being hidden by opening replacement work.

### Refinement pass 3: stakeholder and user feedback

Stakeholder feedback was evaluated against the implemented architecture:

- Database concerns led to separate production/test databases, idle compute
  suspension, and removal of redundant indexes. Converting relational game data
  to JSON was considered but not selected.
- Trails remained in scope and were delivered through ordered trail APIs and
  the nearby discovery experience.
- Production card art remained raster artwork; SVG conversion was considered
  but not selected.
- Frontend feedback led to standardised loading, error, empty, permission,
  success, and action states in PR #234.

Formal user feedback then produced five traceable issues:

- **`UT-S2-01` possible out-of-turn action** — **Issue:** [#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240); **Priority and disposition:** High; investigated and addressed through server-authority regressions and client control state in PR #245
- **`UT-S2-02` CPU action latency** — **Issue:** [#241](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/241); **Priority and disposition:** High; query and identity hot paths improved in PR #245
- **`UT-S2-03` unclear battle state/effects** — **Issue:** [#242](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/242); **Priority and disposition:** High; turn/request clarity improved, full effect comprehension still requires retest
- **`UT-S2-04` unclear deck requirements** — **Issue:** [#243](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/243); **Priority and disposition:** Medium; issue closed, but linked implementation/retest evidence remained incomplete
- **`UT-S2-05` weak first-time event/quiz/reward guidance** — **Issue:** [#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244); **Priority and disposition:** Medium; issue closed, but linked implementation/retest evidence remained incomplete

### Resulting backlog policy

- Dependencies represent actual inability to begin or complete work, not a
  preferred sequence or shared reviewer.
- Operational and migration defects receive focused issues and upgrade-path
  tests when existing environments are affected.
- Stakeholder and user findings are evaluated, prioritised, linked to a change,
  and retested; closing an issue alone is not integration evidence.
- Content, documentation, testing, and release evidence are delivery work, not
  optional work deferred until after feature coding.
- Final validation stays open until deployed/manual evidence exists.

### Refinement outcome

The sprint backlog adapted to confirmed progression rules, complete PvP
lifecycle needs, database upgrade compatibility, operational constraints, and
observed user friction. The resulting changes remained small and traceable,
while #167 and #186 preserved the outstanding release-validation boundary.

## Record Details and Sources

This page records scope, dependency, defect, and usability changes visible in
Gitea and Git during Sprint 2. Exact issue status remains authoritative in
Gitea.

- **Refinement period:** 28 August-15 September 2026
- **Participants:** Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy
- **Initial backlog:** Issues #159-#186
- **Evidence:** Issue creation and closure history, native dependencies, PR review changes, stakeholder records, and user findings
- **Trigger:** Product decisions, integration findings, operational constraints, and formal user feedback changed the ready work

## AI declaration

This refinement record was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository, Gitea, stakeholder, and user-testing evidence.

Navigation titles and documentation integration updated with assistance from
Codex-CLI[GPT-6].

Layout and section structure revised with assistance from Codex[GPT-6], using `vitaqsprint.pdf` as the presentation reference.
