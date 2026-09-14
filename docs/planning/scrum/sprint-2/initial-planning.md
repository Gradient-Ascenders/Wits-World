---
title: Sprint 2 planning
sidebar_position: 1
---

# Sprint 2 planning

| Field            | Record                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Planning date    | 26 August 2026                                                                                                            |
| Milestone        | Sprint 2, due 15 September 2026                                                                                           |
| Planning horizon | Remaining Basic release work plus the planned Intermediate systems                                                        |
| Participants     | Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy                                                         |
| Source status    | Gitea issues #159-#186, issue metadata, [Sprint 2 governance](../../sprint-2-governance-and-evidence.md), and Git history |

## Sprint goal

Complete the outstanding Basic account, content, testing, and release work,
then extend Wits Quest with the planned Intermediate capabilities: a second
challenge format, privacy-limited movement checks, progression, achievements,
duplicate-card selling and evolution, ordered trails, asynchronous PvP, curated
author publication, campaigns, and question analytics.

The API and database remain authoritative for identity, eligibility, marking,
rewards, progression, card ownership, legal battle actions, deadlines, and
publication state.

## Planning inputs

- The Basic player and author journeys delivered during Sprint 1.
- The Sprint 1 Retrospective actions to improve stakeholder evidence, user
  testing, CI reliability, and contemporaneous process records.
- The Intermediate requirements in the project brief and Wits Quest brief.
- The existing React, Fastify, PostgreSQL/PostGIS, Auth0, Mapbox, Docusaurus,
  and Gitea Actions architecture.
- Known Basic gaps around account deletion, production content, automated E2E
  verification, accessibility, field validation, and release evidence.

## Initial sprint backlog and ownership

The backlog was created as issues #159-#186. The table groups the work by its
primary delivery stream; the issue and its current Gitea metadata remain the
authority for ownership and status.

| Workstream                    | Planned owner | Initial issues and intended outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product and player experience | Kevin         | [#161](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/161) account lifecycle UI; [#163](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/163) ordering challenge UI; [#173](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/173) progression UI; [#175](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/175) duplicate/evolution UI; [#177](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/177) trails UI; [#181](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/181) asynchronous PvP UI; [#185](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/185) author campaign and analytics UI                                                                                                  |
| API and security              | Tyron         | [#162](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/162) ordering APIs; [#169](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/169) impossible-journey checks; [#172](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/172) progression APIs; [#174](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/174) duplicate/evolution services; [#178](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/178) asynchronous PvP contract; [#180](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/180) PvP APIs; [#182](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/182) curated publication APIs                                                                                                |
| Data and infrastructure       | Uzair         | [#160](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/160) deletion retention; [#164](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/164) 30-card catalogue; [#171](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/171) progression persistence; [#176](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/176) trail persistence/APIs; [#179](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/179) PvP persistence; [#183](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/183) campaigns, scheduling, and retirement                                                                                                                                                                                 |
| Quality, content, and release | Caleb         | [#159](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/159) governance; [#165](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/165) verified events/questions; [#166](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/166) automated verification; [#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167) release and player validation; [#168](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/168) movement evidence; [#170](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/170) poor-GPS decision; [#184](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/184) analytics; [#186](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/186) Intermediate release validation |

## Dependency strategy

The backlog was divided into independently reviewable lanes rather than one
serial chain:

1. Governance, account-retention decisions, ordering persistence, card content,
   movement evidence, progression rules, trail persistence, and the PvP
   contract could begin independently.
2. Frontend work depended on the corresponding stable API contract, but not on
   unrelated streams.
3. Movement evidence preceded impossible-journey checks; progression
   persistence preceded progression APIs; the PvP contract and persistence
   preceded PvP services and UI.
4. Release and player validation depended on the integrated Basic increment,
   while Intermediate validation depended on the planned Intermediate streams.

Dependencies were intended only for genuine implementation blockers. Preferred
ordering, shared context, and reviewer availability were coordination concerns,
not native blockers.

## Working agreements

- Use Gitea issues and the project board as the live backlog.
- Keep work on short-lived branches and require an independently reviewed pull
  request before merging.
- Keep the browser untrusted for protected game and account decisions.
- Run proportionate tests for meaningful behaviour, then rely on required CI
  gates rather than duplicating low-value tests.
- Update API, schema, game-rule, deployment, testing, and user documentation
  when their contracts change.
- Record stakeholder and user feedback with a decision, owner, linked issue,
  resulting change, and outstanding retest.
- Preserve privacy by avoiding unnecessary exact location, credentials, raw
  consent data, and personal account data in public evidence.

## Definition of Done

A Sprint 2 issue is complete when its acceptance criteria are met, relevant
tests and required repository checks pass, CI succeeds, another member reviews
the pull request, documentation is current, and the merged result is reconciled
with the issue. Manual, deployed, stakeholder, or participant validation is not
converted into a pass merely because implementation merged.

## Initial risks and responses

| Risk                                                        | Planned response                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The expanded Intermediate scope could exceed the milestone  | Keep vertical slices independent, expose true dependencies, and carry release gates explicitly      |
| Asynchronous PvP could accept stale or illegal actions      | Define the contract first and retain server-side version, actor, deadline, and legal-action checks  |
| Movement evidence could become continuous tracking          | Store only bounded evidence required for event-attempt checks and document retention/privacy limits |
| Card/evolution rules could diverge across UI, API, and data | Use one catalogue and server-owned transactional ownership/evolution rules                          |
| Production content could be unverified or incomplete        | Create a reviewed 30-card catalogue and ten events with one hundred verified questions              |
| Testing and feedback could arrive too late                  | Add dedicated automation, user-testing, stakeholder-review, and release-validation issues           |

## Planning outcome

The issue set established ownership and dependency-aware delivery across all
four team streams. Later Git and Gitea activity supports that the planned
feature work was implemented in small pull requests, while final Basic and
Intermediate release validation remained separate gates rather than being
assumed from merges.

## AI declaration

This planning record was generated with assistance from
Codex-CLI[gpt-5.6-sol medium] using repository and Gitea evidence.

Navigation titles and documentation integration updated with assistance from
Codex-CLI[GPT-6].
