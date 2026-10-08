---
title: Sprint 2 meetings
description: Planning, daily coordination, refinement, review, and retrospective in one sprint report.
sidebar_position: 0
toc_max_heading_level: 2
---

# Sprint 2 meetings

Historical report for 26 August–15 September 2026. Status statements describe
the retained Sprint 2 evidence, including the release gates still open at its close.

## Sprint Planning — 26 August 2026

### Sprint Goal

Complete remaining Basic account, content, testing, and release work. Extend
Wits Quest with ordering challenges, movement checks, progression, achievements,
duplicate selling/evolution, trails, asynchronous PvP, curated publication,
campaigns, and question analytics.

### Agenda

Review the Basic carry-over and Intermediate requirements, allocate parallel
workstreams, agree on contracts and true dependencies, and plan content,
feedback, testing, and release evidence.

### Discussion Summary

- Build on the existing Basic player and Author journeys.
- Implement stable persistence and API contracts before dependent interfaces.
- Let independent account, content, movement, progression, and PvP work proceed in parallel.
- Treat content, operational checks, user testing, and documentation as delivery work.
- Preserve bounded movement evidence and account-retention/privacy rules.

### Key Decisions

- Keep identity, eligibility, marking, rewards, progression, ownership, battle
  actions/deadlines, and publication server-authoritative.
- Use native dependencies for actual implementation blockers.
- Require relevant tests, CI, independent review, and documentation before completion.
- Record feedback with evaluation, owner, issue, change, and retest evidence.
- Keep merged implementation separate from manual/deployed acceptance.

### Task Allocation

- **Kevin — product/Web:** account lifecycle, ordering, progression,
  duplicate/evolution, trails, PvP, campaigns, and analytics interfaces.
- **Tyron — API/security:** ordering, movement integrity, progression,
  duplicate/evolution, PvP, and curated publication contracts/services.
- **Uzair — data/infrastructure:** account retention, catalogue, progression,
  trails, PvP persistence, and campaign scheduling/retirement.
- **Caleb — quality/content/release:** governance, verified events/questions,
  automation, movement evidence, poor-GPS decisions, analytics, and validation.

The original backlog was #159–#186. The detailed planning page preserves the
issue-to-owner mapping.

### Action Items

- Deliver independently reviewable account and Intermediate slices.
- Complete the 30-card catalogue and verified event/question set.
- Integrate client journeys against final API contracts.
- Gather stakeholder and user feedback with traced follow-up work.
- Validate the Basic and Intermediate increments against a named deployment.

[Detailed planning record and issue allocation](initial-planning.md).

## Daily Scrum 1 — 28 August 2026

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-01.png" aria-label="Open full-size photo: Team-call photo supplied for Sprint 2 Daily Scrum 1">
    <img
      src="/img/scrum/sprint-2/daily-scrum-01.png"
      alt="Team-call photo supplied for Sprint 2 Daily Scrum 1"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call photo supplied for Sprint 2 Daily Scrum 1.</figcaption>
</figure>

### Summary of Progress

- Kevin aligned dependent UI work with account, ordering, progression, trails,
  and PvP contracts; canonical starter choices were Wit, Grit, and Spark.
- Tyron delivered ordering behaviour, the PvP contract, and progression APIs.
- Uzair implemented account-retention and progression persistence and reconciled migrations.
- Caleb established governance and evidence tracking; CI package-cache work also landed.

### Blockers Raised During Stand-ups

- Planned issues #179–#186 lacked Sprint 2 milestone metadata in the later tracker snapshot.
- Release/participant validation depended on an integrated deployment.
- Poor-GPS handling remained a decision task.

### Actions Taken

- Established anonymisation/retention and server-markable ordering data.
- Fixed PvP actor, version, deadline, action, and visibility boundaries before integration.
- Kept content work parallel with API/UI work and reviewed migration ordering.

[Detailed check-in and next actions](daily-scrum-01.md).

## Daily Scrum 2 — 30 August 2026

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-02.png" aria-label="Open full-size photo: Team-call photo supplied for Sprint 2 Daily Scrum 2">
    <img
      src="/img/scrum/sprint-2/daily-scrum-02.png"
      alt="Team-call photo supplied for Sprint 2 Daily Scrum 2"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call photo supplied for Sprint 2 Daily Scrum 2.</figcaption>
</figure>

### Summary of Progress

- Kevin integrated player and Author workflow improvements.
- Tyron delivered movement-integrity checks, PvP services/deadlines, and curation.
- Uzair delivered trails, PvP persistence, and campaign scheduling/retirement.
- Caleb delivered privacy-limited movement evidence; database/deployment hardening also progressed.

### Blockers Raised During Stand-ups

- Neon compute was not suspending as expected.
- Deployment/database failures interrupted integration.
- Concurrent persistence work increased migration conflicts.

### Actions Taken

- Changed connection/background-work behaviour to permit idle suspension (PR #212).
- Hardened release and database configuration (PRs #205–#207).
- Reconciled migrations and exposed stable state/error contracts to the Web client.
- Removed coin rewards and wallet persistence to match the confirmed progression model.

[Detailed check-in and next actions](daily-scrum-02.md).

## Daily Scrum 3 — 5 September 2026

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-03.png" aria-label="Open full-size photo: Team-call photo supplied for Sprint 2 Daily Scrum 3">
    <img
      src="/img/scrum/sprint-2/daily-scrum-03.png"
      alt="Team-call photo supplied for Sprint 2 Daily Scrum 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call photo supplied for Sprint 2 Daily Scrum 3.</figcaption>
</figure>

### Summary of Progress

- Kevin delivered account, ordering, profile/progression, trail, and PvP interfaces.
- Tyron completed voluntary resignation and outgoing invitation cancellation.
- Uzair removed six redundant database indexes without changing domain behaviour.
- Caleb surfaced question analytics and coordinated content/validation work.

### Blockers Raised During Stand-ups

- Catalogue, evolution, and production question content remained active dependencies.
- Automation had not yet covered the full PR/nightly/release path.
- Participant and deployed release validation were outstanding.

### Actions Taken

- Connected player and Author workflows to server-owned states and role checks.
- Evaluated the 4 September database feedback and retained the relational model.
- Separated production/test databases and improved idle-compute behaviour.
- Identified consistent loading, empty, error, permission, and success states as integration needs.

[Detailed check-in and stakeholder links](daily-scrum-03.md).

## Daily Scrum 4 — 13 September 2026

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-2/daily-scrum-04.png" aria-label="Open full-size photo: Team-call photo supplied for Sprint 2 Daily Scrum 4">
    <img
      src="/img/scrum/sprint-2/daily-scrum-04.png"
      alt="Team-call photo supplied for Sprint 2 Daily Scrum 4"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call photo supplied for Sprint 2 Daily Scrum 4.</figcaption>
</figure>

### Summary of Progress

- Kevin delivered shared collectible frames, duplicate/evolution flows, PvP lifecycle
  presentation, and consistent feedback states.
- Tyron delivered atomic evolution and battle authority/latency/clarity follow-ups.
- Uzair completed the 30-card catalogue/artwork and existing Power-card migration fixes.
- Caleb delivered automation, ten events/one hundred questions, poor-GPS decisions,
  and E2E diagnostics.

### Blockers Raised During Stand-ups

- Basic validation #167 and Intermediate validation #186 remained open.
- Participant retests for the five user findings were missing.
- Deck and first-time guidance findings #243/#244 lacked complete change/retest links.

### Actions Taken

- Evaluated trails/card-art feedback and retained raster production artwork.
- Standardised player/Author feedback states after the frontend stakeholder review.
- Collected ten questionnaire responses and prioritised five findings.
- Linked battle authority, latency, and turn-state work to PR #245.
- Kept local/CI outcomes separate from signed-in deployment evidence.

[Detailed check-in, findings, and verification status](daily-scrum-04.md).

## Backlog Refinement — 28 August–15 September 2026

### Discussion

Refine rules, true dependencies, lifecycle gaps, migration compatibility,
operational constraints, stakeholder feedback, and user findings across the sprint.

### Completed or Mostly Completed Items

- Account lifecycle, ordering, progression, trails, and asynchronous PvP.
- Catalogue/artwork, verified content, evolution, curation, campaigns, and analytics.
- Automated verification and stakeholder/user-feedback evaluation.

### Items Needing Refinement

- PvP resignation, invitation cancellation, and understandable forfeit results.
- Upgrade compatibility for existing Power-card rows.
- Out-of-turn action concerns, battle latency, turn/effect clarity, deck requirements,
  and first-time event/quiz/reward guidance (findings `UT-S2-01`–`UT-S2-05`).
- Missing milestone metadata and outstanding release/retest evidence.

### Backlog Decisions

- Replace the planned coin economy with progression (#193).
- Use focused follow-up issues for lifecycle and migration defects (#219, #220, #228, #231).
- Retain relational data and raster artwork after evaluating the proposed alternatives.
- Link findings #240–#244 to changes and retests; closure alone is insufficient.
- Preserve the 15 September tracker discrepancy: 27 of 28 milestone issues were
  closed, #167 was open, and planned #179–#186 lacked milestone metadata.
- Keep #186 visible as an open Intermediate validation gate.

[Detailed refinement and feedback dispositions](backlog-refinement.md).

## Sprint Review — 15 September 2026

### Demoed Features

The integrated increment available for Review included:

- Account recovery/deletion and ordering challenges.
- Movement integrity, progression, profiles, duplicate selling, and evolution.
- Ordered trails and asynchronous PvP with cancellation/resignation.
- Curated Author publication, campaigns, question analytics, and prepared offline play.
- A 30-card catalogue, ten events, one hundred questions, and expanded automation.

### Accepted Items

- Accept the merged feature increment as the Sprint 2 implementation result.
- Retain Basic #167 and Intermediate #186 as separate open release gates.
- Require retests for all five user findings and complete change links for #243/#244.
- Reconcile carry-over ownership, milestone, and board metadata in the live tracker.

### Review Notes

- The implementation goal was substantially achieved; final release acceptance remained incomplete.
- Three stakeholder reviews informed database, trails/artwork, and UI decisions.
- Ten user responses produced five findings, with battle follow-ups in PR #245.
- Participant feedback and issue closure did not establish representative acceptance or retest success.

### Follow-up Items

- Complete #167 and #186 with named-revision/environment results and known limitations.
- Retest `UT-S2-01`–`UT-S2-05` and reconcile #243/#244 evidence.
- Verify final deployment/API/docs availability.
- Retain later ceremony and feedback records contemporaneously.

[Detailed Review and implementation references](sprint-review.md).

## Sprint Retrospective — 15 September 2026

### What Went Well

- Focused vertical slices integrated work across all four streams.
- Contracts and server authority remained explicit as the product expanded.
- Review corrected transaction, migration, privacy, and CI defects before merge.
- Stakeholder/user findings produced traceable follow-ups.
- Automation and production content expanded substantially.

### What Did Not Go Well

- Broad feature scope outpaced final release, field, accessibility, and participant validation.
- User testing happened late and left little time for retests.
- Incomplete milestone metadata and unnecessary dependencies obscured the plan.
- Compute, deployment, migration, and database-test problems consumed integration time.
- Clarity and ceremony evidence were sometimes addressed after implementation.

### Lessons Learned

- Schedule validation and retesting alongside feature work.
- Reserve dependencies for real blockers and keep tracker metadata complete.
- Test clean and existing-database upgrade paths before merge.
- Make action, effect, deck, error, and recovery clarity part of feature acceptance.

### Action Items for Sprint 3

- Close validation gates before expanding into another broad feature wave.
- Run mid-sprint usability checks with traced findings and retests.
- Retain dated Scrum notes and complete issue metadata.
- Collect release-like performance evidence and rehearse migration upgrades.
- Review client clarity against the integrated API state.

[Detailed Retrospective, owners, and acceptance evidence](sprint-retrospective.md).

## Sources and Record Status

The eight linked records retain reporting windows, issue/PR references, owners,
and original AI declarations. Kevin supplied four Daily Scrum photos and
confirmed their order; they do not independently establish dates or discussion.
Planning, refinement, Review, and Retrospective have no mapped meeting photo.
See the [photo provenance](../index.md#sprint-2-meeting-photos),
[feedback results](../../../testing/sprint-2-user-feedback-results.md), and
[dated validation status](../../../testing/sprint-2-validation-status.md).

## AI declaration

Prepared with assistance from Codex[GPT-6], using the existing Sprint 2 records
for content and `vitaqsprint.pdf` for layout. Source attributions remain in the
detailed records.
