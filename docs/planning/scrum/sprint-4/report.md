---
title: Sprint 4 report
description: Planning, daily coordination, refinement, review, and retrospective in one sprint report.
sidebar_position: 0
toc_max_heading_level: 2
---

# Sprint 4 report

Reconstructed report for the final-submission work from 29 September to
8 October 2026, using local `origin/main` at `a9dca04`. Discussion, decisions,
and actions are inferred from commit history; original minutes, ceremony dates,
and attendance were not supplied. The reporting windows below organise the
work in the same sequence as the earlier sprints.

This is an interim report. The roadmap’s final-submission target is 11 October;
work and acceptance after this snapshot are not covered. Photos follow supplied
order for presentation, with unconfirmed dates and meeting associations.

All reporting dates are in Africa/Johannesburg time and were chosen for this
reconstruction. The [merge register](evidence.md#merge-register) fixes the evidence snapshot;
[photo provenance](#image-provenance) explains the presentation-only placements.

<a id="sprint-planning--29-september-2026-reconstructed" />

## Sprint Planning — 29 September 2026 (reconstructed) {/* #planning */}

**Reporting point:** 29 September 2026 — reconstructed planning point.

### Meeting photo {/* #planning-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-01.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 1">
    <img
      src="/img/scrum/sprint-4/meeting-01.png"
      alt="Sprint 4 supplied team-call photo 1"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 1, displayed with planning.</figcaption>
</figure>

### Sprint Goal {/* #planning-sprint-goal */}

Prepare the existing Basic, Intermediate, and Advanced journeys for final submission: make the interface clearer, reduce avoidable startup and battle latency, improve loading and recovery, and make database operations easier to diagnose.

### Discussion Summary {/* #planning-discussion-summary */}

- The next increment should concentrate on finishing and stabilising existing journeys rather than expanding the game rules.
- Start with homepage and Explore startup, then collection, decks, evolution, trading, profiles, and Author workflows.
- Review battle hydration, action, acceptance, and match-detail reads together so latency improvements retain the existing transaction and recovery contracts.
- Keep loading, reading preferences, keyboard focus, and mobile layout consistent across the app.
- Treat the late Sprint 3 rate-limit integration as starting context; keep subsequent scheduler coordination and listener changes separately traceable.

### Key Decisions {/* #planning-key-decisions */}

- Preserve server-owned identity, ownership, versions, gameplay results, and publication while simplifying the interface.
- Reduce unnecessary reads and startup work before changing gameplay behavior.
- Use focused tests and responsive browser checks for each changed journey; retain explicit deployment and manual checks.
- Keep background recovery available and avoid blind resubmission of player or Author mutations.

### Task Allocation {/* #planning-task-allocation */}

- **Kevin — interface and docs:** player and Author journeys, profiles, accessible typography, loading presentation, and sprint documentation.
- **Tyron — API and performance:** startup and battle-path optimisations, request/pool observations, and notification-listener isolation.
- **Uzair — database and operations:** durable idle-worker coordination, ranked expiry during Redis outages, and scheduler deployment guidance.
- **Team — quality and final delivery:** cross-journey regression checks, deployment verification, unresolved findings, and submission evidence.

This coordination plan is reconstructed from recurring commit authorship and existing team roles; it is not a retained meeting assignment.

### Action Items {/* #planning-action-items */}

- Begin with public startup and Explore navigation, then finish collection and battle interfaces.
- Review each optimisation against transaction, privacy, accessibility, and recovery requirements.
- Collect production-like measurements separately from local structural tests.
- Keep release notes, deployment configuration, and sprint evidence aligned with merged work.

### Sources {/* #planning-record-details-and-sources */}

- **Evidence:** [PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)–[PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362) in the [Sprint 4 merge register](evidence.md#merge-register); prior rate-limit integration [PR #332](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/332) is starting context.

<a id="daily-scrum-1--29-september1-october-2026-reporting-window" />

## Daily Scrum 1 — 29 September–1 October 2026 reporting window {/* #daily-scrum-01 */}

**Reporting point:** 29 September–1 October 2026 reporting window.

### Meeting photo {/* #daily-scrum-01-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-02.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 2">
    <img
      src="/img/scrum/sprint-4/meeting-02.png"
      alt="Sprint 4 supplied team-call photo 2"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 2, displayed with Daily Scrum 1.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-01-summary-of-progress */}

- Homepage work reserved the shell layout and right-sized artwork ([PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)). Commit [`5b76e39`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5b76e39) reports local production-build Lighthouse results; these are recorded local measurements, not deployed acceptance.
- First-install service-worker navigation was corrected, and CPU-match code was deferred from public startup ([PR #334](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/334), [PR #335](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/335)).
- Explore gained clearer navigation, trail-stop numbering, territory detail, map layers, and campus-time presentation ([PR #336](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/336)).
- Collection artwork was resized, CPU battle presentation delays were reduced, and deck hydration reads were reduced ([PR #337](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/337)–[PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339)).

### Blockers and Open Questions {/* #daily-scrum-01-blockers-and-open-questions */}

- Public startup, signed-in restoration, and a first CPU battle have different loading boundaries and need separate checks.
- Smaller artwork and deferred modules still need sharp previews, safe chunk-load recovery, and responsive layouts.
- Local Lighthouse measurements do not establish performance on the deployed mobile journey.

### Actions Taken {/* #daily-scrum-01-actions-taken */}

- Separated public startup work from the optional CPU battle module.
- Kept location guidance, map/list recovery, and trail/territory navigation visible during Explore refinements.
- Reduced presentation and hydration overhead while retaining existing battle state and deck rules.

### Next Actions {/* #daily-scrum-01-next-actions */}

- Complete collection, deck, evolution, and trade interfaces.
- Reduce battle-action reads without weakening version, identity, or turn checks.
- Verify first visits, reloads, and mobile card previews against the changed loading paths.

### Sources {/* #daily-scrum-01-record-details-and-sources */}

- **Evidence:** [PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)–[PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339); source commits include [`5b76e39`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5b76e39), [`03d19c7`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/03d19c7), [`5588959`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5588959), and [`6937f55`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6937f55).

<a id="daily-scrum-2--23-october-2026-reporting-window" />

## Daily Scrum 2 — 2–3 October 2026 reporting window {/* #daily-scrum-02 */}

**Reporting point:** 2–3 October 2026 reporting window.

### Meeting photo {/* #daily-scrum-02-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-03.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 3">
    <img
      src="/img/scrum/sprint-4/meeting-03.png"
      alt="Sprint 4 supplied team-call photo 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 3, displayed with Daily Scrum 2.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-02-summary-of-progress */}

- PvP action-path reads were reduced ([PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340)). Collection, decks, evolution, and trade presentation were refined ([PR #341](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/341)).
- Player profiles gained owner editing, cropped pictures, statuses, favourite owned cards, activity, and achievement presentation ([PR #342](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/342)). Commit [`6514154`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6514154) includes migration 0064 and ownership/deletion boundaries.
- Author workspaces and analytics were streamlined, including review, catalogue, placement, sidebar, and shared loading work ([PR #343](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/343)).
- Player battle lobbies, shared history, and completed battle reports were refined ([PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344)).

### Blockers and Open Questions {/* #daily-scrum-02-blockers-and-open-questions */}

- Profile favourites must retain exact owned-card IDs, and editing must remain owner-only.
- Trade, evolution, placement, and battle UI changes must preserve confirmation, version-conflict, and recovery behavior.
- Merge history contains migration-expectation, focus, responsive-metadata, and fixture repairs; these need to stay aligned with the product contracts.

### Actions Taken {/* #daily-scrum-02-actions-taken */}

- Grouped related player actions and reduced repeated labels across collection, trade, and battle interfaces.
- Kept profile publication opt-in and progression server-authoritative.
- Added reusable Author and battle presentation while keeping saved results and historical context visible.

### Next Actions {/* #daily-scrum-02-next-actions */}

- Finish account settings and accessible reading preferences.
- Optimise invitation acceptance and match-detail reads.
- Check mobile layout, native picker interactions, keyboard focus, and migration compatibility together.

### Sources {/* #daily-scrum-02-record-details-and-sources */}

- **Evidence:** [PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340)–[PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344); source commits include [`4a8a7fd`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/4a8a7fd), [`6514154`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6514154), [`2670c8d`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/2670c8d), [`c251113`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/c251113), and [`fd512e5`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/fd512e5).

<a id="daily-scrum-3--46-october-2026-reporting-window" />

## Daily Scrum 3 — 4–6 October 2026 reporting window {/* #daily-scrum-03 */}

**Reporting point:** 4–6 October 2026 reporting window.

### Meeting photo {/* #daily-scrum-03-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-04.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 4">
    <img
      src="/img/scrum/sprint-4/meeting-04.png"
      alt="Sprint 4 supplied team-call photo 4"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 4, displayed with Daily Scrum 3.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-03-summary-of-progress */}

- PvP acceptance hydration and receipt/clock work were combined, and match-ready phases gained observations ([PR #345](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/345)–[PR #347](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/347)).
- Account settings were simplified, and shared typography and accessible reading preferences were integrated ([PR #348](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/348), [PR #349](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/349)).
- Match-detail reads and initial acceptance writes were consolidated ([PR #350](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/350), [PR #351](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/351)). Terminal-result focus checks were made asynchronous ([PR #352](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/352)).
- PostgreSQL pool pressure observations were added, and ranked settlement reused already-loaded policy ([PR #353](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/353), [PR #354](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/354)).

### Blockers and Open Questions {/* #daily-scrum-03-blockers-and-open-questions */}

- Fewer queries do not by themselves prove lower end-to-end latency; database wait, identity, network, and client preparation remain separate costs.
- Focus assertions must wait for effects without hiding missing focus or broken recovery.
- Pool observations must identify operational pressure without logging SQL parameters, credentials, or player identifiers.

### Actions Taken {/* #daily-scrum-03-actions-taken */}

- Reduced repeated hydration and writes within existing acceptance and settlement boundaries.
- Kept account recovery, deletion, accessibility preferences, and developer-key behavior available while simplifying settings.
- Added request-phase and pool-holder evidence for diagnosing slow paths before further architectural changes.

### Next Actions {/* #daily-scrum-03-next-actions */}

- Correlate pool waits with controlled battle and session-restoration requests.
- Finish Explore route/startup optimisation and app-wide loading recovery.
- Investigate idle-worker wake behavior and persistent listener occupancy using the new observations.

### Sources {/* #daily-scrum-03-record-details-and-sources */}

- **Evidence:** [PR #345](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/345)–[PR #354](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/354); source commits include [`90ac4dc`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/90ac4dc), [`ec7e77d`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/ec7e77d), [`3ca6146`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/3ca6146), [`84407a3`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/84407a3), and [`3ee2401`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/3ee2401).

<a id="daily-scrum-4--78-october-2026-reporting-window" />

## Daily Scrum 4 — 7–8 October 2026 reporting window {/* #daily-scrum-04 */}

**Reporting point:** 7–8 October 2026 reporting window.

### Meeting photo {/* #daily-scrum-04-meeting-photo */}

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-4/meeting-05.png" aria-label="Open full-size photo: Sprint 4 supplied team-call photo 5">
    <img
      src="/img/scrum/sprint-4/meeting-05.png"
      alt="Sprint 4 supplied team-call photo 5"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied Sprint 4 photo 5, displayed with Daily Scrum 4.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-04-summary-of-progress */}

- Homepage-to-Explore navigation retained the SPA path, and mobile map startup work was reduced ([PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355), [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359)).
- App-wide loading and retained-refresh behavior were integrated, including safe slow-load recovery and background saved-attempt sync ([PR #360](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/360)). The merge includes the work referenced by issues #356 and #357.
- Idle gameplay coordination and operational guidance were integrated ([PR #361](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/361)). Commit [`d137554`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/d137554) keeps existing ranked expiry and due territory settlement available during Redis outages.
- PostgreSQL LISTEN subscriptions moved to a dedicated direct pool ([PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362)), while gateway reads retain the shared authoritative database path.

### Blockers and Open Questions {/* #daily-scrum-04-blockers-and-open-questions */}

- Coordinated idle scheduling remains a staged rollout; the polling default and deployment prerequisites must stay explicit.
- Listener isolation needs the private direct LISTENER_DATABASE_URL setting and aggregate Neon session headroom checks.
- Neither structural tests nor merged scheduling code prove deployed Neon suspension or a measured production latency improvement.
- Loading recovery must not expose protected content or silently repeat submitted actions.

### Actions Taken {/* #daily-scrum-04-actions-taken */}

- Kept confirmed content through revisits and refreshes and scoped loading feedback to the affected operation.
- Separated new-work coordination from PostgreSQL-fenced existing-work cleanup during Redis outages.
- Separated notification subscriptions from request-pool capacity and documented startup, reconnect, and shutdown checks.

### Next Actions {/* #daily-scrum-04-next-actions */}

- Complete the remaining submission-period work after this 8 October snapshot.
- Provision and verify listener configuration before the corresponding release.
- Run the documented hosted coordination, outage, recovery, and signed-in journeys against a named revision.
- Record measured outcomes, unresolved findings, and actual stakeholder review results in the release evidence.

### Sources {/* #daily-scrum-04-record-details-and-sources */}

- **Evidence:** [PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355), [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359)–[PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362); source commits include [`84cd985`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/84cd985), [`dcb6fc6`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/dcb6fc6), [`54f7bc8`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/54f7bc8), [`d137554`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/d137554), and [`bd45690`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/bd45690).

<a id="backlog-refinement--29-september8-october-2026-evidence-window" />

## Backlog Refinement — 29 September–8 October 2026 evidence window {/* #backlog-refinement */}

**Reporting point:** 29 September–8 October 2026 evidence window.

### Discussion {/* #backlog-refinement-discussion */}

Refine final-submission work around the most visible player friction and the operational risks exposed by latency and pool observations. These topics are reconstructed from the sequence of UI, performance, test-repair, and deployment commits.

### Completed or Mostly Completed Items {/* #backlog-refinement-completed-or-mostly-completed-items */}

- Homepage/Explore startup, artwork sizing, CPU battle presentation, and battle database-path refinements were merged.
- Collection, decks, evolution, trading, profiles, Author workspaces, account settings, and typography changes were merged.
- Loading/recovery, retained refresh, pool observations, idle coordination, and listener isolation were integrated in the repository.

### Items Needing Refinement {/* #backlog-refinement-items-needing-refinement */}

- Define deployment prerequisites and checks for the direct listener endpoint and staged scheduler backend.
- Separate local timing/structural evidence from hosted latency, multi-instance behavior, and idle suspension.
- Keep signed-in account lifecycle, multiplayer recovery, accessibility, and mobile journeys in final regression scope.
- Confirm which submission-period findings remain open using their actual tracker and retest evidence.

### Backlog Decisions {/* #backlog-refinement-backlog-decisions */}

- Group presentation work by complete journey and keep state-changing behavior tied to existing API contracts.
- Reduce repeated database work before increasing connection capacity or changing gameplay semantics.
- Keep Redis-fenced work creation and PostgreSQL-only existing-work cleanup distinct.
- Treat operational rollout and measured acceptance as follow-up work even when the implementation PR has merged.

### Action Items {/* #backlog-refinement-action-items */}

- Finish a traceable submission checklist with revision, environment, result, and remaining limitations.
- Collect a small controlled request sample alongside pool and scheduler observations.
- Record actual review outcomes and retests when the corresponding sessions occur.

### Sources {/* #backlog-refinement-record-details-and-sources */}

- **Evidence:** [Merge register](evidence.md#merge-register), [loading policy](../../../design/state-review.md#loading), [Gameplay workers](../../../deployment/ranked-operations.md), and [PvP timing guide](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/docs/testing/api-battle-responsiveness.md#timing-diagnostics-and-remaining-limits).

<a id="sprint-review--8-october-2026-interim" />

## Sprint Review — 8 October 2026 (interim) {/* #sprint-review */}

**Reporting point:** 8 October 2026 — interim review snapshot.

### Implementation Available for Review {/* #sprint-review-implementation-available-for-review */}

- Public startup, Explore navigation/maps/trails, card artwork, and CPU battle entry ([PR #333](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/333)–[PR #339](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/339), [PR #355](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/355), [PR #359](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/359)).
- Collection, deck, evolution, trade, profile, Author, completed-battle, account, and typography presentation ([PR #341](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/341)–[PR #344](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/344), [PR #348](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/348), [PR #349](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/349)).
- Battle action, invitation acceptance, match detail, ranked settlement, and pool observations ([PR #340](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/340), [PR #345](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/345)–[PR #347](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/347), [PR #350](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/350)–[PR #354](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/354)).
- Loading/recovery, retained refresh, idle coordination, and dedicated notification listening ([PR #360](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/360)–[PR #362](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/362)).

### Accepted Items {/* #sprint-review-accepted-items */}

The merge register establishes repository integration through `a9dca04`. No original Sprint 4 stakeholder acceptance or release sign-off was supplied; this interim reconstruction does not close the sprint or the final-submission gate.

### Review Notes {/* #sprint-review-review-notes */}

- The increment concentrates on refining and stabilising journeys already delivered in earlier sprints.
- The homepage commit reports a three-run local mobile Lighthouse median increase from 60 to 87 and CLS from 1.935 to 0; retain its local production-build qualification.
- Profile work retains owner-only editing, opt-in sharing, exact owned-card favourites, and account-deletion cleanup.
- Loading work retains protected identity gates and operation-specific mutation recovery.
- Idle scheduling and listener changes include operational prerequisites; polling-to-coordination rollout, hosted outage/recovery checks, and production measurements remain separate evidence.
- The roadmap targets final submission on 11 October. Work after this 8 October snapshot remains outside the report.

### Follow-up Items {/* #sprint-review-follow-up-items */}

- Demonstrate the agreed player and Author journeys on the named submission build.
- Verify listener configuration, Neon connection headroom, and staged scheduler requirements.
- Record mobile, accessibility, account lifecycle, saved-attempt, and multiplayer recovery outcomes.
- Link each remaining finding to its owner, change, and focused retest; record actual reviewer feedback.

### Sources {/* #sprint-review-record-details-and-sources */}

- **Evidence:** [Merge register](evidence.md#merge-register), homepage measurement [`5b76e39`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/5b76e39), profile implementation [`6514154`](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/commit/6514154), [listener verification](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/docs/testing/api-battle-responsiveness.md#timing-diagnostics-and-remaining-limits), and [delivery roadmap](../../delivery-roadmap.md).

<a id="sprint-retrospective--8-october-2026-interim" />

## Sprint Retrospective — 8 October 2026 (interim) {/* #sprint-retrospective */}

**Reporting point:** 8 October 2026 — interim retrospective reconstruction.

### What Went Well {/* #sprint-retrospective-what-went-well */}

- Journey-based interface passes improved consistency across Explore, collection, battles, profiles, Author, and settings.
- Performance changes targeted concrete costs: artwork transfer, module startup, presentation delays, repeated hydration, writes, and policy reads.
- Focus, fixture, migration, and responsive repairs were retained alongside the feature work.
- Pool observations informed later operational changes, and scheduler/listener documentation retained rollout and recovery requirements.

### What Did Not Go Well {/* #sprint-retrospective-what-did-not-go-well */}

- Follow-up commits repaired asynchronous focus assertions, fixture state, migration expectations, and validation alignment after larger interface changes.
- Repository delivery and local checks still need separate hosted, stakeholder, and manual release evidence.
- Connection occupancy and idle-worker wake behavior required additional work late in the submission period.
- Contemporaneous meeting minutes and photo-to-meeting mappings were not retained in the supplied material.

### Lessons Learned {/* #sprint-retrospective-lessons-learned */}

- Review loading, recovery, focus, and responsive states as part of the journey rather than after the visual pass.
- Use request-phase and pool evidence to identify a bottleneck before changing architecture.
- Design outage handling around existing work as well as new-work creation.
- Keep implementation completion, deployment configuration, measured benefit, and release acceptance separately traceable.

### Action Items for Final Submission {/* #sprint-retrospective-action-items-for-final-submission */}

- **Interface streams:** finish named desktop/mobile and accessibility journeys with actual results and unresolved limitations.
- **API/data streams:** verify direct listener configuration, connection headroom, scheduler rollout, and outage/reconnect behavior.
- **Team:** retain the final revision, deployment details, review outcomes, findings, and retests with the submission record.
- **Sprint coordination:** record future meeting dates, attendees, concise decisions, and photo mappings at the time.

These are reconstructed recommendations; no team vote or acceptance of an action is inferred.

### Sources {/* #sprint-retrospective-record-details-and-sources */}

- **Evidence:** [Merge register](evidence.md#merge-register), [loading policy](../../../design/state-review.md#loading), [pool/listener observations](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/docs/testing/api-battle-responsiveness.md#timing-diagnostics-and-remaining-limits), and [Gameplay workers](../../../deployment/ranked-operations.md).

## Sources and Record Status

### Delivery evidence {/* #merge-register */}

The [Sprint 4 evidence](evidence.md#merge-register) retains the dated merge
register, immutable commit references, and outstanding acceptance limits.

### Image provenance

For presentation, photo 1 appears beside planning, followed by photos 2–5 beside
Daily Scrums 1–4. This follows the earlier sprint layout; it does not establish
which meeting each image depicts.

The site's `meeting-01.png` through `meeting-05.png` are byte-for-byte copies
of the supplied `1.png` through `5.png`. Filenames establish supplied order;
they do not establish attendance, dates, discussion, or decisions.

No Review or Retrospective photo is assigned.

## AI declaration

The original ceremony narratives used repository history, project documentation, and the supplied `vitaqsprint.pdf` layout reference with assistance from Codex[GPT-6].

Report consolidation and simplification assisted by Codex[GPT-6]. Repeated
agendas, workflow instructions, and source notices were removed; historical
dates, photo provenance, and evidence limits are unchanged. No meeting,
attendance, quotation, acceptance, or test result is inferred from this edit.
