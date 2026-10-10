---
title: Sprint 2 report
description: Planning, daily coordination, refinement, review, and retrospective in one sprint report.
sidebar_position: 0
toc_max_heading_level: 2
---

# Sprint 2 report

Historical report for 26 August–15 September 2026. Status statements describe
the retained Sprint 2 evidence, including the release gates still open at its close.

The team comprised Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, and Caleb
Perumalsamy. These summaries draw on issues, commits, stakeholder records, and
user feedback; they are not verbatim ceremony transcripts. Shared workflow rules
are in the [project methodology](../../project-and-git-methodology.md).

<a id="sprint-planning--26-august-2026" />

## Sprint Planning — 26 August 2026 {/* #planning */}

**Date:** 26 August 2026.

### Sprint Goal {/* #planning-sprint-goal */}

Complete the outstanding Basic account, content, testing, and release work,
then extend Wits Quest with the planned Intermediate capabilities: a second
challenge format, privacy-limited movement checks, progression, achievements,
duplicate-card selling and evolution, ordered trails, asynchronous PvP, curated
author publication, campaigns, and question analytics.

The API and database remain authoritative for identity, eligibility, marking,
rewards, progression, card ownership, legal battle actions, deadlines, and
publication state.

### Discussion Summary {/* #planning-discussion-summary */}

#### Planning inputs {/* #planning-planning-inputs */}

- The Basic player and author journeys delivered during Sprint 1.
- The Sprint 1 Retrospective actions to improve stakeholder evidence, user
  testing, CI reliability, and contemporaneous process records.
- The Intermediate requirements in the project brief and Wits Quest brief.
- The existing React, Fastify, PostgreSQL/PostGIS, Auth0, Mapbox, Docusaurus,
  and Gitea Actions architecture.
- Known Basic gaps around account deletion, production content, automated E2E
  verification, accessibility, field validation, and release evidence.

#### Dependency strategy {/* #planning-dependency-strategy */}

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

#### Initial risks and responses {/* #planning-initial-risks-and-responses */}

- **The expanded Intermediate scope could exceed the milestone:** Keep vertical slices independent, expose true dependencies, and carry release gates explicitly
- **Asynchronous PvP could accept stale or illegal actions:** Define the contract first and retain server-side version, actor, deadline, and legal-action checks
- **Movement evidence could become continuous tracking:** Store only bounded evidence required for event-attempt checks and document retention/privacy limits
- **Card/evolution rules could diverge across UI, API, and data:** Use one catalogue and server-owned transactional ownership/evolution rules
- **Production content could be unverified or incomplete:** Create a reviewed 30-card catalogue and ten events with one hundred verified questions
- **Testing and feedback could arrive too late:** Add dedicated automation, user-testing, stakeholder-review, and release-validation issues

### Task Allocation {/* #planning-task-allocation */}

The backlog was created as issues #159-#186. The list groups the work by its
primary delivery stream; the issue and its current Gitea metadata remain the
authority for ownership and status.

- **Product and player experience** — **Planned owner:** Kevin; **Initial issues and intended outcome:** [#161](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/161) account lifecycle UI; [#163](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/163) ordering challenge UI; [#173](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/173) progression UI; [#175](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/175) duplicate/evolution UI; [#177](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/177) trails UI; [#181](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/181) asynchronous PvP UI; [#185](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/185) author campaign and analytics UI
- **API and security** — **Planned owner:** Tyron; **Initial issues and intended outcome:** [#162](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/162) ordering APIs; [#169](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/169) impossible-journey checks; [#172](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/172) progression APIs; [#174](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/174) duplicate/evolution services; [#178](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/178) asynchronous PvP contract; [#180](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/180) PvP APIs; [#182](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/182) curated publication APIs
- **Data and infrastructure** — **Planned owner:** Uzair; **Initial issues and intended outcome:** [#160](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/160) deletion retention; [#164](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/164) 30-card catalogue; [#171](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/171) progression persistence; [#176](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/176) trail persistence/APIs; [#179](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/179) PvP persistence; [#183](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/183) campaigns, scheduling, and retirement
- **Quality, content, and release** — **Planned owner:** Caleb; **Initial issues and intended outcome:** [#159](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/159) governance; [#165](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/165) verified events/questions; [#166](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/166) automated verification; [#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167) release and player validation; [#168](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/168) movement evidence; [#170](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/170) poor-GPS decision; [#184](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/184) analytics; [#186](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/186) Intermediate release validation

### Action Items {/* #planning-action-items */}

- Create the account, ordering, content, movement, progression, and PvP foundations.
- Implement dependent API and client slices against stable contracts.
- Deliver the card catalogue and verified event/question content alongside feature work.
- Capture stakeholder and user feedback with issue, change, and retest links.
- Complete Basic and Intermediate validation against a named revision and environment.

### Sources {/* #planning-record-details-and-sources */}

- **Planning date:** 26 August 2026
- **Milestone:** Sprint 2, due 15 September 2026
- **Planning horizon:** Remaining Basic release work plus the planned Intermediate systems
- **Source status:** Gitea issues #159-#186, issue metadata, [project methodology](../../project-and-git-methodology.md), and Git history

<a id="daily-scrum-1--28-august-2026" />

## Daily Scrum 1 — 28 August 2026 {/* #daily-scrum-01 */}

**Date:** 28 August 2026.

### Meeting photo {/* #daily-scrum-01-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-01.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 1">
    <img
      src="/img/scrum/sprint-2/daily-scrum-01.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 1"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 1 — checkpoint recorded as 28 August 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

### Summary of Progress {/* #daily-scrum-01-summary-of-progress */}

- **Product/Web:** Kevin's dependent UI work remained aligned to the account, ordering, progression, trail, and PvP contracts landing in the service streams. The reviewed canonical starter choices also established the player-facing Wit, Grit, and Spark entry point.
- **API/security:** Tyron delivered ordering challenge persistence/API behaviour, defined the asynchronous PvP contract, and exposed progression APIs with authenticated identity and server-owned state.
- **Data:** Uzair completed account-deletion retention, defined and persisted progression rules, and reconciled overlapping ordering/progression migrations.
- **Quality/delivery:** Caleb established the Sprint 2 governance and rubric evidence register. CI work also shared the npm package cache while retaining required checks.

### Blockers Raised During Stand-ups {/* #daily-scrum-01-blockers-raised-during-stand-ups */}

- Issues #179-#186 were part of the planned Sprint 2 backlog but lacked Sprint
  2 milestone metadata in the later live tracker snapshot.
- Full release and participant validation remained dependent on an integrated
  deployment, not just merged foundations.
- The poor-GPS alternative remained a decision task rather than an implemented
  fallback.

### Actions Taken {/* #daily-scrum-01-actions-taken */}

#### Integrated outcomes {/* #daily-scrum-01-integrated-outcomes */}

- Account deletion had an explicit anonymisation and retention policy rather
  than uncontrolled cascades.
- Ordering challenges gained a server-markable representation before their UI.
- Progression rules and APIs were separated from browser calculations.
- The asynchronous PvP contract fixed actor, version, deadline, action, and
  visibility boundaries before persistence and routes were implemented.
- Governance identified Gitea as the live source for ownership, dependencies,
  board state, review, and completion.

#### Coordination points {/* #daily-scrum-01-coordination-points */}

- Ordering, progression, and account migrations touched adjacent player data,
  so branch reconciliation and migration ordering needed explicit review.
- Frontend streams could proceed once their corresponding contracts landed;
  they did not need to wait for unrelated catalogue or movement work.
- The 30-card catalogue and event/question content were larger content tasks
  and needed to progress alongside, rather than after, all API work.

### Next Actions {/* #daily-scrum-01-next-actions */}

- Persist trails, movement evidence, asynchronous PvP, campaigns, and curation
  state.
- Implement impossible-journey and deadline processing against those models.
- Keep database usage and deployment reliability visible while the number of
  persistence-heavy services increases.
- Begin integrating the corresponding author and player experiences.

### Sources {/* #daily-scrum-01-record-details-and-sources */}

- **Checkpoint date:** 28 August 2026
- **Reporting window:** 26-28 August 2026
- **Evidence:** Issues #159-#186 and merged PRs #187-#196

<a id="daily-scrum-2--30-august-2026" />

## Daily Scrum 2 — 30 August 2026 {/* #daily-scrum-02 */}

**Date:** 30 August 2026.

### Meeting photo {/* #daily-scrum-02-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-02.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 2">
    <img
      src="/img/scrum/sprint-2/daily-scrum-02.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 2"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 2 — checkpoint recorded as 30 August 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

### Summary of Progress {/* #daily-scrum-02-summary-of-progress */}

- **Product/Web:** Kevin integrated broad player and Author workflow polish while the new trail, campaign, and asynchronous PvP services were landing.
- **API/security:** Tyron implemented impossible-journey and too-fast-attempt checks, asynchronous PvP APIs and deadline processing, curated Author review services, and the retirement of coin-wallet behaviour after the progression decision changed.
- **Data:** Uzair delivered ordered trail persistence and APIs, asynchronous PvP persistence, and campaign scheduling/retirement with database constraints and migrations.
- **Quality/delivery:** Caleb delivered privacy-limited movement evidence. The delivery stream also hardened database CI/deployment and changed Neon behaviour so idle compute could suspend.

### Blockers Raised During Stand-ups {/* #daily-scrum-02-blockers-raised-during-stand-ups */}

- **Neon compute was not suspending as expected:** Connection-lifetime and background-work behaviour was changed in PR #212 to allow idle suspension
- **Deployment/database workflow failures interrupted integration:** PRs #205-#207 hardened the release workflow and production database configuration
- **Multiple persistence streams increased migration conflict risk:** Work was kept in focused PRs and reconciled against current `main` before merge

### Actions Taken {/* #daily-scrum-02-actions-taken */}

#### Integrated outcomes {/* #daily-scrum-02-integrated-outcomes */}

- Movement evidence was limited to the data needed for event-attempt checks,
  with privacy and retention boundaries documented.
- Impossible journeys and attempts completed too quickly became server-side
  checks rather than browser warnings.
- Trails gained ordered event membership, progression state, and API support.
- Asynchronous PvP gained persisted invitations/matches, versioned actions,
  server deadlines, timeout processing, and safe opponent visibility.
- Author content gained review/publication state, while campaigns gained
  scheduling and retirement controls.
- Coin rewards and wallet persistence were removed so the implemented model
  matched the confirmed progression rules.

#### Coordination points {/* #daily-scrum-02-coordination-points */}

- Database migrations for trails, PvP, curation, campaigns, and movement
  evidence had to remain repeatable on both clean and existing environments.
- Deadline and impossible-journey processing needed bounded database work so
  background behaviour did not keep Neon compute active continuously.
- Frontend teams needed stable response schemas for invitation state, active
  actors, deadlines, trail progress, publication status, and safe errors.

### Next Actions {/* #daily-scrum-02-next-actions */}

- Complete the player and Author interfaces for account lifecycle, ordering,
  progression, trails, asynchronous PvP, and campaigns.
- Add cancellation and resignation paths needed to finish asynchronous match
  lifecycle handling.
- Continue the production card catalogue and event/question content.
- Review database indexes and UI feedback states as the integrated surface
  expands.

### Sources {/* #daily-scrum-02-record-details-and-sources */}

- **Checkpoint date:** 30 August 2026
- **Reporting window:** 29-30 August 2026
- **Evidence:** Merged PRs #197-#205, #210, and #212; issues #168, #169, #176, and #179-#183

<a id="daily-scrum-3--5-september-2026" />

## Daily Scrum 3 — 5 September 2026 {/* #daily-scrum-03 */}

**Date:** 5 September 2026.

### Meeting photo {/* #daily-scrum-03-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-03.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 3">
    <img
      src="/img/scrum/sprint-2/daily-scrum-03.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 3 — checkpoint recorded as 5 September 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

### Summary of Progress {/* #daily-scrum-03-summary-of-progress */}

- **Product/Web:** Kevin delivered the account lifecycle experience, ordering challenge authoring/player flow, profile and progression navigation, trail discovery, asynchronous PvP experience, and related responsive state handling.
- **API/security:** Tyron completed voluntary PvP resignation and outgoing invitation cancellation, while supporting the integrated account, progression, trail, and curation contracts consumed by the Web client.
- **Data:** Uzair reviewed database architecture and removed six redundant indexes without changing domain behaviour.
- **Quality/delivery:** Caleb surfaced question performance analytics and continued coordination of content, test automation, poor-GPS, and release-evidence work.

### Blockers Raised During Stand-ups {/* #daily-scrum-03-blockers-raised-during-stand-ups */}

- The 30-card catalogue, evolution flows, and production event/question set
  were still active content dependencies.
- Database, package, and browser automation had not yet become a complete PR,
  nightly, and release verification path.
- Final participant testing and deployed release validation remained open.

### Actions Taken {/* #daily-scrum-03-actions-taken */}

#### Integrated outcomes {/* #daily-scrum-03-integrated-outcomes */}

1. Players could recover passwords and request protected account deletion.
2. Authors and players could use the ordering challenge format end to end.
3. Profiles exposed progression, achievements, streaks, and standings from
   server-owned data.
4. Players could discover ordered trails and nearby unvisited events.
5. Asynchronous PvP supported invitations, legal turn submission, deadlines,
   cancellation, resignation, and match presentation.
6. Authors could manage curation, campaign, and analytics capabilities through
   protected role-checked operations.

#### Stakeholder integration {/* #daily-scrum-03-stakeholder-integration */}

The [4 September database usage review](../../stakeholder-interactions/2026-09-04-database-usage-review.md)
raised Neon compute consumption, possible JSON restructuring, and database
pipeline options. The team retained the relational model, separated production
and test databases, allowed idle compute to suspend, and removed redundant
indexes. The alternatives that were not selected remained documented rather
than being presented as implemented.

#### Coordination points {/* #daily-scrum-03-coordination-points */}

- UI states had to display server-returned deadlines, actors, progression,
  eligibility, and validation failures rather than infer them locally.
- Author curation and campaign screens had to preserve role checks and avoid
  exposing accepted challenge answers through player endpoints.
- The richer navigation increased the need for consistent loading, empty,
  error, permission, and success feedback.

### Next Actions {/* #daily-scrum-03-next-actions */}

- Finish the card catalogue, Power-card migration compatibility, and atomic
  evolution behaviour.
- Standardise application feedback states across player and Author workflows.
- Complete automated verification and verified event/question content.
- Run formal user testing, convert findings into Gitea issues, and verify the
  resulting changes.

### Sources {/* #daily-scrum-03-record-details-and-sources */}

- **Checkpoint date:** 5 September 2026
- **Reporting window:** 31 August-5 September 2026
- **Evidence:** Merged PRs #209, #211, #214, #218, and #221-#226; 4 September stakeholder review

<a id="daily-scrum-4--13-september-2026" />

## Daily Scrum 4 — 13 September 2026 {/* #daily-scrum-04 */}

**Date:** 13 September 2026.

### Meeting photo {/* #daily-scrum-04-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-04.png" aria-label="Open full-size photo: Four team members in a video call, supplied for Sprint 2 Daily Scrum 4">
    <img
      src="/img/scrum/sprint-2/daily-scrum-04.png"
      alt="Four team members in a video call, supplied for Sprint 2 Daily Scrum 4"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Sprint 2 Daily Scrum 4 — checkpoint recorded as 13 September 2026. Photo supplied by
Kevin and assigned to this record using the confirmed image order. The image
itself does not establish the call date or the discussion recorded below.</figcaption>
</figure>

See the [photo provenance and mapping](../index.md#sprint-2-meeting-photos).

### Summary of Progress {/* #daily-scrum-04-summary-of-progress */}

- **Product/Web:** Kevin delivered shared collectible/evolution frames, dedicated duplicate/evolution flows, improved PvP cancellation/forfeit presentation, and consistent loading, error, empty, permission, and success states.
- **API/security:** Tyron implemented atomic card evolution and then addressed the highest-priority user findings around illegal CPU actions, battle latency, pending actions, and turn clarity in PR #245.
- **Data:** Uzair completed the 30-card catalogue and artwork, fixed upgrades of existing Power-card rows, and retained migration compatibility for existing databases.
- **Quality/delivery:** Caleb automated PR/nightly/release verification, delivered ten verified events and one hundred questions, documented the poor-GPS decision, hardened nightly E2E diagnostics, and coordinated final evidence.

### Blockers Raised During Stand-ups {/* #daily-scrum-04-blockers-raised-during-stand-ups */}

- [#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
  remained open for Basic release, stakeholder, participant, accessibility,
  field, and deployment validation.
- [#186](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/186)
  remained open for validation of the planned Intermediate systems.
- Participant retests for all five user findings had not been recorded.
- Findings #243 and #244 still needed explicit implementation and retest links.

### Actions Taken {/* #daily-scrum-04-actions-taken */}

#### Stakeholder feedback integrated {/* #daily-scrum-04-stakeholder-feedback-integrated */}

- The [8 September trails and card-art review](../../stakeholder-interactions/2026-09-08-trails-and-card-art-review.md)
  confirmed that trails were required. Ordered trail APIs and the nearby trail
  experience were already implemented; raster production artwork was retained
  instead of switching to SVG.
- The [11 September frontend UI review](../../stakeholder-interactions/2026-09-11-frontend-ui-review.md)
  requested improved presentation. PR #234 standardised feedback states and
  refined the player and Author interfaces.

#### Formal user feedback {/* #daily-scrum-04-formal-user-feedback */}

Ten questionnaire responses were collected on 13 September. The sanitised
[Sprint 2 user-feedback results](feedback.md)
identified five prioritised findings:

The summaries below preserve the Sprint 2 record. The
[updated feedback review](feedback.md#prioritised-findings) adds written evidence
and separately dated implementation follow-up.

- **possible out-of-turn CPU action:** #240 investigated; PR #245 retained server actor/version checks and disabled invalid client controls
- **CPU battle latency and pacing:** #241 addressed in PR #245 with fewer identity writes and bounded match-history queries
- **battle turn/effect clarity:** #242 partially addressed in PR #245 with explicit turn and synchronisation states
- **deck requirements unclear:** #243 recorded and closed; linked implementation/retest evidence remained incomplete in the results report
- **event, quiz, and reward guidance weak:** #244 recorded and closed; linked implementation/retest evidence remained incomplete in the results report

#### Verification status {/* #daily-scrum-04-verification-status */}

- PR, nightly, and release workflows covered formatting, linting, type checks,
  package tests, database/migration checks, builds, and Basic E2E execution at
  their documented scopes.
- The catalogue and event seeds were tested for repeatability and upgrade
  compatibility.
- CPU actor authority and request-state behaviour gained focused regressions.
- Local and CI evidence remained distinct from signed-in deployed validation.

### Next Actions {/* #daily-scrum-04-next-actions */}

- Reconcile the delivered increment against the Sprint goal and live tracker.
- Keep merged feature status separate from manual/deployed acceptance.
- Carry the two release-validation gates and any missing retest evidence
  explicitly rather than declaring them passed.
- Record process improvements for earlier testing, dependency hygiene, and
  contemporaneous ceremony evidence.

### Sources {/* #daily-scrum-04-record-details-and-sources */}

- **Checkpoint date:** 13 September 2026
- **Reporting window:** 6-13 September 2026
- **Evidence:** Merged PRs #229-#246; stakeholder records dated 8 and 11 September; ten user-testing responses

<a id="backlog-refinement--28-august15-september-2026" />

## Backlog Refinement — 28 August–15 September 2026 {/* #backlog-refinement */}

**Date:** 28 August–15 September 2026.

### Discussion {/* #backlog-refinement-discussion */}

Review the goal, dependencies, release evidence, and follow-up scope across the sprint. The record below summarises the retained sources.

- the Sprint 2 goal and issue set #159-#186;
- dependency links between persistence, API, UI, content, and release work;
- merged pull-request review findings and migration compatibility failures;
- Neon compute/storage constraints and deployment reliability;
- stakeholder reviews on 4, 8, and 11 September; and
- ten user-testing responses and five findings linked to issues #240–#244.

### Completed or Mostly Completed Items {/* #backlog-refinement-completed-or-mostly-completed-items */}

- Account lifecycle, ordering, progression, trails, and asynchronous PvP were integrated.
- The card catalogue, event/question content, curation, campaigns, and analytics were delivered.
- Stakeholder feedback and five user findings were evaluated and linked to follow-up work.

These are implementation outcomes across the refinement period; final release validation and participant retests remained separate.

### Items Needing Refinement {/* #backlog-refinement-items-needing-refinement */}

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

### Backlog Decisions {/* #backlog-refinement-backlog-decisions */}

#### Refinement pass 1: rules and dependencies {/* #backlog-refinement-refinement-pass-1-rules-and-dependencies */}

Early implementation resolved rules that changed downstream scope:

- **Progression replaced the planned coin economy:** [#193](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/193) removed coin rewards and wallet persistence after progression persistence was established
- **Intermediate work had several parallel lanes:** Native dependencies were reserved for actual blockers, allowing account, ordering, catalogue, movement, progression, trails, PvP-contract, and governance work to start independently
- **PvP required a stable authority contract:** #178 preceded persistence and routes so actor, version, deadline, privacy, and legal-action rules were shared before implementation
- **Content and verification were long-running tasks:** #164-#167 continued alongside service/UI work instead of blocking unrelated Intermediate slices

#### Refinement pass 2: integrated lifecycle completeness {/* #backlog-refinement-refinement-pass-2-integrated-lifecycle-completeness */}

As asynchronous PvP and catalogue work reached the UI, focused follow-up issues
were created rather than expanding merged issue scope silently:

- **[#219](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/219):** Add voluntary resignation so a player is not trapped in an asynchronous match
- **[#220](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/220):** Allow cancellation of an outgoing invitation before acceptance
- **[#228](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/228):** Make cancellation and forfeit results understandable in the player interface
- **[#231](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/231):** Repair the catalogue migration for existing Power-card rows instead of only supporting a clean database

Pull-request review also returned work for correction when transaction,
migration, authority, or CI requirements were not met. Resolution remained in
the original PR history rather than being hidden by opening replacement work.

#### Refinement pass 3: stakeholder and user feedback {/* #backlog-refinement-refinement-pass-3-stakeholder-and-user-feedback */}

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

- **possible out-of-turn action** — **Issue:** [#240](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/240); **Priority and disposition:** High; investigated and addressed through server-authority regressions and client control state in PR #245
- **CPU action latency** — **Issue:** [#241](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/241); **Priority and disposition:** High; query and identity hot paths improved in PR #245
- **unclear battle state/effects** — **Issue:** [#242](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/242); **Priority and disposition:** High; turn/request clarity improved, full effect comprehension still requires retest
- **unclear deck requirements** — **Issue:** [#243](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/243); **Priority and disposition:** Medium; issue closed, but linked implementation/retest evidence remained incomplete
- **weak first-time event/quiz/reward guidance** — **Issue:** [#244](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/244); **Priority and disposition:** Medium; issue closed, but linked implementation/retest evidence remained incomplete

### Sources {/* #backlog-refinement-record-details-and-sources */}

This page records scope, dependency, defect, and usability changes visible in
Gitea and Git during Sprint 2. Exact issue status remains authoritative in
Gitea.

- **Refinement period:** 28 August-15 September 2026
- **Initial backlog:** Issues #159-#186
- **Evidence:** Issue creation and closure history, native dependencies, PR review changes, stakeholder records, and user findings
- **Trigger:** Product decisions, integration findings, operational constraints, and formal user feedback changed the ready work

<a id="sprint-review--15-september-2026" />

## Sprint Review — 15 September 2026 {/* #sprint-review */}

**Date:** 15 September 2026.

### Demoed Features {/* #sprint-review-demoed-features */}

The following implementation was available at Review; PR links identify the delivery evidence.

- **Account lifecycle:** Account deletion retention and anonymisation in PR #187; player password-reset/deletion experience in PR #211
- **Second challenge format:** Ordering persistence/API in PR #188 and author/player UI in PR #214
- **Movement integrity and privacy:** Privacy-limited evidence in PR #200 and impossible-journey/too-fast checks in PR #203
- **Progression and profiles:** Persistence in PR #192, API in PR #196, and player profile/navigation in PR #221
- **Duplicate selling and evolution:** Atomic backend evolution in PR #233 and dedicated UI/shared frames in PR #235
- **Trails:** Ordered trail persistence/API in PR #197 and nearby-unvisited UI in PR #223
- **Asynchronous PvP:** Contract in PR #195, persistence in PR #199, APIs/deadlines in PR #204, UI in PR #222, and cancellation/resignation follow-ups in PRs #224, #226, and #229
- **Author workflow and campaigns:** Curated publication in PR #198, campaign scheduling/retirement in PR #201, Author UI in PR #209, and question analytics in PR #225
- **Production content:** 30-card catalogue/art in PR #230 and ten verified events/one hundred questions in PR #238
- **Testing and delivery:** PR/nightly/release verification in PR #236, E2E hardening in PRs #239 and #246, plus deployment/database reliability fixes
- **User-feedback integration:** Five issues #240-#244 and battle authority/performance/clarity work in PR #245

Repository history also contains prepared offline challenge play in PR #227.
It is recorded as delivered work, but its release acceptance still belongs to
the validation gate rather than being inferred from merge status.

### Accepted Items {/* #sprint-review-accepted-items */}

1. Accept the merged feature increment as the Sprint 2 implementation result.
2. Keep #167 open until Basic deployed, stakeholder, participant,
   accessibility, field, and release evidence is reconciled.
3. Keep #186 open until the planned Intermediate systems are demonstrated and
   validated against a named revision/environment.
4. Require focused retests for all five user-feedback findings, with explicit
   implementation evidence for #243 and #244.
5. Correct missing milestone/project metadata for carry-over work rather than
   relying on historical Markdown ownership.

### Review Notes {/* #sprint-review-review-notes */}

#### Sprint goal assessment {/* #sprint-review-sprint-goal-assessment */}

The sprint delivered the planned remaining Basic implementation and a broad
Intermediate feature increment. Account lifecycle, ordering challenges,
movement checks, progression, achievements, duplicate/evolution mechanics,
ordered trails, asynchronous PvP, curation, campaigns, analytics, production
cards, and verified event content were integrated into `main`.

The implementation goal was therefore substantially achieved. The release goal
was not yet fully evidenced because Basic validation issue #167 and Intermediate
validation issue #186 remained open, participant retests were outstanding, and
some manual/deployed checks had not been recorded.

#### Stakeholder review outcomes {/* #sprint-review-stakeholder-review-outcomes */}

- **[4 September](../../stakeholder-interactions/2026-09-04-database-usage-review.md)** — **Topic and feedback:** Neon compute consumption, JSON restructuring, and database pipeline options; **Team evaluation and integration:** Retained relational integrity; separated production/test databases; enabled idle suspension; removed redundant indexes
- **[8 September](../../stakeholder-interactions/2026-09-08-trails-and-card-art-review.md)** — **Topic and feedback:** Trails required; SVG card art considered; **Team evaluation and integration:** Trails delivered; raster production art retained as the lower-risk asset approach
- **[11 September](../../stakeholder-interactions/2026-09-11-frontend-ui-review.md)** — **Topic and feedback:** Frontend presentation needed improvement; **Team evaluation and integration:** PR #234 standardised user feedback states and refined player/Author workflows

#### User-feedback review {/* #sprint-review-user-feedback-review */}

Ten structured responses collected on 13 September produced five prioritised
findings. Issues #240-#242 were connected to PR #245, which added authority
regressions, reduced repeated database work, and clarified turn/request state.
Issues #243 and #244 captured deck and first-time journey clarity requirements,
but the [results report](feedback.md)
still records missing linked implementation/retest evidence.

The feedback is evidence of collection and evaluation. It is not treated as
representative acceptance, and issue closure is not substituted for participant
retesting.

#### Quality and authority review {/* #sprint-review-quality-and-authority-review */}

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

#### Review conclusion {/* #sprint-review-review-conclusion */}

Sprint 2 produced a substantial integrated feature increment and demonstrated
active use of issues, reviewed PRs, automated checks, stakeholder feedback, and
formal user findings. It should not be represented as fully released or fully
validated until the two open release gates and retest boundaries are resolved.

### Follow-up Items {/* #sprint-review-follow-up-items */}

- Complete and close #167 with exact automated, deployed, field,
  accessibility, stakeholder, and participant evidence.
- Complete and close #186 with an integrated Intermediate demonstration and
  known-limitation record.
- Reconcile implementation and retest evidence for #243 and #244.
- Verify external API/docs availability and the final named deployment.
- Retain future ceremony and feedback records contemporaneously.

### Sources {/* #sprint-review-record-details-and-sources */}

- **Review date:** 15 September 2026
- **Milestone due:** 15 September 2026
- **Stakeholder:** Calvin Rea, through the three linked Sprint 2 review records
- **Tracker snapshot:** 27 of 28 live Sprint 2 milestone issues closed; #167 open
- **Additional planned gate:** #186 open; #179-#186 lacked Sprint 2 milestone metadata in the inspected tracker state
- **Primary evidence:** Gitea issues/PRs, Git history, CI/testing docs, stakeholder records, and sanitised user-feedback results

This Review record compares the Sprint 2 goal with the integrated increment and
the evidence available on 15 September 2026. Detailed implementation and review
history remains in the linked issues and pull requests.

<a id="sprint-retrospective--15-september-2026" />

## Sprint Retrospective — 15 September 2026 {/* #sprint-retrospective */}

**Date:** 15 September 2026.

### What Went Well {/* #sprint-retrospective-what-went-well */}

- The team delivered independently reviewable vertical slices across all four
  workstreams instead of concentrating the sprint in one large branch.
- Server authority remained intact while the product expanded into movement
  checks, progression, evolution, trails, asynchronous PvP, curation,
  campaigns, and analytics.
- Contract-first work for ordering challenges and asynchronous PvP reduced the
  risk of incompatible Web, API, and database assumptions.
- Review findings were acted on repeatedly before merge, including migration
  upgrade compatibility, transactional evolution, sanitised match history, and
  CI reliability.
- Three stakeholder interactions were evaluated and linked to implemented or
  rejected alternatives.
- Formal user feedback produced five Gitea issues and immediate work on the
  highest-impact battle authority, latency, and clarity findings.
- Automated verification expanded from normal PR checks to database/package,
  nightly, release, and E2E workflows with improved failure diagnostics.
- The team completed substantial production content: a 30-card catalogue with
  artwork and ten events with one hundred verified questions.

### What Did Not Go Well {/* #sprint-retrospective-what-did-not-go-well */}

- The sprint scope was very broad. Feature throughput outpaced final deployed,
  participant, accessibility, and field validation, leaving #167 and #186 open
  near the milestone boundary.
- Formal user testing happened late, leaving little time for participant
  retests and for complete integration of #243 and #244.
- Several planned issues (#179-#186) lacked Sprint 2 milestone metadata, making
  the live milestone an incomplete view of the planned sprint.
- Some dependency links initially represented preferred order rather than true
  blockers, increasing avoidable waiting between team members.
- Neon compute, database test duration, deployment failures, and migration
  conflicts consumed integration time that earlier operational checks could
  have exposed.
- UI clarity work followed implementation. Turn ownership, effect outcomes,
  deck requirements, and first-time journey guidance should be acceptance
  criteria when the feature is first sliced.
- Ceremony evidence still had to be assembled from repositories and trackers;
  recording concise checkpoints as work happens would be cheaper and stronger.

### Lessons Learned {/* #sprint-retrospective-lessons-learned */}

- Plan validation and participant retests alongside implementation.
- Use dependencies for actual blockers and keep milestone/board metadata complete.
- Rehearse migration upgrades and operational checks before the release window.
- Include turn, effect, deck, error, and recovery clarity in feature acceptance criteria.

### Action Items for Sprint 3 {/* #sprint-retrospective-action-items-for-sprint-3 */}

- **Close validation before adding another broad feature wave** — **Owner:** Product/quality lead with all owners; **Acceptance evidence:** #167 and #186 contain a named revision, environment, exact checks, manual results, known limitations, and closure review
- **Run usability checks during feature development** — **Owner:** Product/Web lead; **Acceptance evidence:** At least one mid-sprint task session, sanitised finding, decision, issue/PR link, and follow-up result
- **Keep issue metadata complete** — **Owner:** Issue creator and sprint coordinator; **Acceptance evidence:** Every sprint issue has milestone, project column, owner, reviewer, estimate, priority labels, and only true native dependencies
- **Record Scrum checkpoints contemporaneously** — **Owner:** Sprint coordinator; **Acceptance evidence:** Dated planning, coordination, Review, and Retrospective notes linked during the sprint
- **Add release-like performance smoke evidence** — **Owner:** API and quality leads; **Acceptance evidence:** Named environment measurements for identity, battle action, and history paths with authority regressions still passing
- **Rehearse existing-database migrations before merge** — **Owner:** Data lead and reviewer; **Acceptance evidence:** Clean and upgrade-path migration checks for schema/content changes that affect existing rows
- **Make clarity part of feature acceptance** — **Owner:** Product/Web and API owners; **Acceptance evidence:** Turn, effect, validation, empty, error, and recovery states covered in the issue and reviewed with the integrated API response

### Follow-up {/* #sprint-retrospective-follow-up */}

#### Measures to inspect next {/* #sprint-retrospective-measures-to-inspect-next */}

- Whether #167 and #186 close before new milestone scope expands.
- Whether every accepted user finding has both implementation and retest
  evidence.
- Whether Sprint 3 issues have complete milestone/board metadata.
- Whether CI/deployment/database failures are detected before the final release
  window.
- Whether the next Review and Retrospective are committed at the time they
  occur.

#### Retrospective conclusion {/* #sprint-retrospective-retrospective-conclusion */}

Sprint 2 demonstrated strong engineering delivery and meaningful feedback
integration. The main process correction is to move validation and evidence
earlier, narrow simultaneous work, and make the live tracker accurately reflect
the whole planned sprint.

### Sources {/* #sprint-retrospective-record-details-and-sources */}

- **Retrospective date:** 15 September 2026
- **Inputs:** Sprint goal, issue/PR history, CI/deployment work, three stakeholder records, ten user responses, and open validation gates
- **Overall result:** Strong implementation throughput with release, retest, and tracker-hygiene work still open

This Retrospective turns the Sprint 2 delivery evidence into concrete process
improvements and records team-level themes and actions.

## Sources and Record Status

The eight ceremony sections retain reporting windows, issue/PR references, owners,
and original AI declarations. Kevin supplied four Daily Scrum photos and
confirmed their order; they do not independently establish dates or discussion.
Planning, refinement, Review, and Retrospective have no mapped meeting photo.
See the [photo provenance](../index.md#sprint-2-meeting-photos),
[feedback results](feedback.md), and
[dated validation status](evidence.md).

## AI declaration

The original ceremony narratives used repository history, project documentation, and the supplied `vitaqsprint.pdf` layout reference with assistance from Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-6], Codex[GPT-6].

Report consolidation and simplification assisted by Codex[GPT-6]. Repeated
agendas, workflow instructions, and source notices were removed; historical
dates, photo provenance, and evidence limits are unchanged. No meeting,
attendance, quotation, acceptance, or test result is inferred from this edit.

Feedback labels simplified and linked to the updated written-feedback review
with assistance from Codex[GPT-6]. Historical sprint decisions and dates remain
unchanged.
