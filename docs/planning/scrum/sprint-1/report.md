---
title: Sprint 1 report
description: Planning, daily coordination, refinement, review, and retrospective in one sprint report.
sidebar_position: 0
toc_max_heading_level: 2
---

# Sprint 1 report

Historical report for the August 2026 increment. Planning and Daily Scrum dates
are reconstructed from repository activity. The team confirmed that the Review
and Retrospective occurred; their exact dates were not retained.

The records are reconstructions, not transcripts: exact times, detailed attendance,
individual statements, and votes were not retained. Team-confirmed recollections
are labelled separately from repository evidence. Merged work does not establish
release acceptance. Shared workflow rules are in the
[project methodology](../../project-and-git-methodology.md).

<a id="sprint-planning--5-august-2026-reconstructed" />

## Sprint Planning — 5 August 2026 (reconstructed) {/* #planning */}

**Date:** 5 August 2026 (reconstructed).

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/sprint-planning.png" aria-label="Open full-size photo: Four-person team call image supplied for the Sprint 1 planning record">
    <img
      src="/img/scrum/sprint-1/sprint-planning.png"
      alt="Four-person team call image supplied for the Sprint 1 planning record"
      width="3838"
      height="2158"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Supplied planning image. The image supports that a four-person call image was
provided for this record; its date and participant identities were not derived
from file metadata.</figcaption>
</figure>

### Sprint Goal {/* #planning-sprint-goal */}

Deliver a deployable, mobile-friendly Wits Quest vertical slice in which an
authenticated player can discover a published campus event, submit a
browser-reported location, and receive a server-authoritative PostGIS eligibility
decision. The slice should establish the separate Web/API architecture,
repeatable quality checks, and public project documentation needed for later
gameplay.

### Discussion Summary {/* #planning-discussion-summary */}

#### Why this increment was selected {/* #planning-why-this-increment-was-selected */}

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

#### Dependency order {/* #planning-dependency-order */}

1. Establish repository conventions, application boundaries, and environment
   handling.
2. Scaffold the independently buildable Web and API applications.
3. Configure Auth0, database access, migrations, event data, and CI.
4. Implement protected event discovery and PostGIS eligibility endpoints.
5. Connect the player interface, map/list presentation, and reported-location
   action to the HTTP API.
6. Deploy the Web and API independently, publish documentation, and validate the
   integrated journey.

#### Initial risks and responses {/* #planning-initial-risks-and-responses */}

- **Browser-calculated eligibility could be manipulated:** Store event geometry in PostGIS and return the API decision
- **Map failure could block discovery:** Maintain an accessible text event list independent of the map
- **Authentication work could expand into unsafe custom password handling:** Select an established provider and validate its access tokens in the API
- **Frontend and backend could become a single deployment:** Keep `apps/web` and `apps/api` independently buildable and deployed
- **CI or deployment might arrive too late:** Establish the pipeline in the same vertical slice
- **Numeric location thresholds were not yet validated:** Treat them as provisional and create field-test follow-up rather than claim certainty

### Task Allocation {/* #planning-task-allocation */}

The list reflects the issue assignments recorded in Gitea. Issue links may
require access to the private course Gitea instance.

- **Shared methodology** — **Owner:** Whole team; **Planned issues and outcome:** [#10](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/10) establish the project and Git methodology
- **Product and player experience** — **Owner:** Kevin; **Planned issues and outcome:** [#12](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/12) render the campus map and event; [#21](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/21) submit reported location and display eligibility
- **API and security** — **Owner:** Tyron; **Planned issues and outcome:** [#11](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/11) select authentication; [#13](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/13) validate tokens; [#14](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/14) expose event endpoints
- **Data and infrastructure** — **Owner:** Uzair; **Planned issues and outcome:** [#16](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/16) configure PostgreSQL/PostGIS; [#18](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/18) add the event migration and seed; [#19](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/19) implement eligibility
- **Quality and delivery** — **Owner:** Caleb; **Planned issues and outcome:** [#15](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/15) publish documentation; [#17](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/17) establish CI and deployment; [#20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20) validate and release the slice

### Action Items {/* #planning-action-items */}

- Establish shared repository conventions and independently buildable Web/API apps.
- Configure authentication, PostgreSQL/PostGIS, event data, and CI.
- Implement protected event discovery and location eligibility.
- Connect the map and accessible event list to the API.
- Deploy the slice, publish documentation, and record release checks.

### Sources {/* #planning-record-details-and-sources */}

- **Reconstructed date:** 5 August 2026
- **Planning horizon:** Initial vertical slice, followed by release validation before the milestone due date
- **Team in scope:** Kevin Ebrahim, Tyron Van Tonder, Uzair Mahomed, Caleb Perumalsamy
- **Source status:** Retrospective reconstruction from Gitea issues #10–#21, Git history, and committed planning documents

<a id="daily-scrum-1--6-august-2026-reconstructed" />

## Daily Scrum 1 — 6 August 2026 (reconstructed) {/* #daily-scrum-01 */}

**Date:** 6 August 2026 (reconstructed).

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-01.png" aria-label="Open full-size photo: Four-person team call image supplied as Daily Scrum 01 evidence">
    <img
      src="/img/scrum/sprint-1/daily-scrum-01.png"
      alt="Four-person team call image supplied as Daily Scrum 01 evidence"
      width="1672"
      height="941"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Four-person team call image supplied as Daily Scrum 01 evidence.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-01-summary-of-progress */}

- **Product/Web:** Kevin configured the monorepo standards, scaffolded the mobile-first React application, added tests and setup documentation, and established the first campus-map presentation components.
- **API/architecture:** Tyron documented the architecture overview, application boundaries, roadmap, and risk register, then addressed review feedback.
- **Data:** Uzair configured separate Neon development/test targets, added readiness and migration tests, and implemented the initial PostGIS event schema and seed.
- **Delivery:** No delivery-stream commit is attributed to Caleb during this reporting window; CI remained the next dependency for the shared foundation.

### Blockers Raised During Stand-ups {/* #daily-scrum-01-blockers-raised-during-stand-ups */}

- The authentication provider decision and token contract had not yet landed.
- The Fastify API foundation and CI workflow were still pending.
- Location radius, accuracy, and freshness values remained provisional.

### Actions Taken {/* #daily-scrum-01-actions-taken */}

- The Web, API, and database must remain separately configured even though they
  share one npm workspace.
- Event geometry and eligibility belong to the API/database boundary; the map
  remains a presentation component.
- The initial architecture and environment examples must be stable enough for
  CI and API work to consume next.

### Next Actions {/* #daily-scrum-01-next-actions */}

- Kevin: continue the player experience and connect it to authenticated event
  discovery.
- Tyron: establish the Fastify API and resolve the authentication approach.
- Uzair: implement and test server-side PostGIS eligibility.
- Caleb: establish the Gitea Actions quality workflow.

### Sources {/* #daily-scrum-01-record-details-and-sources */}

- **Reconstructed date:** 6 August 2026
- **Reporting window:** 5–6 August 2026
- **Evidence:** Commits and merged PRs for the monorepo, Web scaffold, architecture, Neon/PostGIS setup, and event schema

<a id="daily-scrum-2--10-august-2026-reconstructed" />

## Daily Scrum 2 — 10 August 2026 (reconstructed) {/* #daily-scrum-02 */}

**Date:** 10 August 2026 (reconstructed).

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-02.png" aria-label="Open full-size photo: Four-person team call image supplied as Daily Scrum 02 evidence">
    <img
      src="/img/scrum/sprint-1/daily-scrum-02.png"
      alt="Four-person team call image supplied as Daily Scrum 02 evidence"
      width="1672"
      height="941"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Four-person team call image supplied as Daily Scrum 02 evidence.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-02-summary-of-progress */}

- **Product/Web:** Kevin completed the Auth0-aware Explore journey, connected reported-location claims to eligibility, added clear unavailable/denied states, and integrated the browser with the deployed API.
- **API/security:** Tyron established the Fastify/Auth0 boundary, event and eligibility routes, exact-origin CORS policy, tests, and the initial Azure API deployment configuration.
- **Data:** Uzair delivered the PostGIS eligibility service, database-backed event path, safe precision handling, migrations, and infrastructure support for the Azure deployment.
- **Quality/delivery:** Caleb added the Gitea Actions workflow, separated quality jobs, proved the merge gate with a controlled failure/revert, and contributed the initial Azure Web/API deployment setup.

### Blockers Raised During Stand-ups {/* #daily-scrum-02-blockers-raised-during-stand-ups */}

- The integrated slice existed, but production database readiness, public
  documentation, and repeatable release evidence were incomplete.
- The reported-location flow still needed manual permission-denied,
  unavailable, responsive, and accessibility evidence.
- Gameplay work beyond discovery was not yet sliced into a dependency-aware
  delivery plan.

### Actions Taken {/* #daily-scrum-02-actions-taken */}

- Auth0 was selected instead of implementing password authentication in the
  project.
- `/api/v1` became the versioned browser-to-server boundary.
- The API validates access tokens and makes eligibility decisions; the browser
  only submits intent and reported-location data.
- CI separates formatting, linting, type-checking, testing, and build feedback.

### Next Actions {/* #daily-scrum-02-next-actions */}

- Run the release checklist against the deployed discovery slice.
- Refine release-quality issues and distinguish automated gates from manual
  evidence.
- Resolve gameplay dependencies before starting the Basic-tier loop.
- Keep eligibility, challenge outcomes, rewards, and other protected state on
  the server.

### Sources {/* #daily-scrum-02-record-details-and-sources */}

- **Reconstructed date:** 10 August 2026
- **Reporting window:** 7–10 August 2026
- **Evidence:** Commits for Gitea Actions, Fastify, Auth0, event APIs, PostGIS eligibility, reported location, CORS, and Azure deployment

<a id="daily-scrum-3--13-august-2026-reconstructed" />

## Daily Scrum 3 — 13 August 2026 (reconstructed) {/* #daily-scrum-03 */}

**Date:** 13 August 2026 (reconstructed).

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-03.png" aria-label="Open full-size photo: Four-person team call image supplied as Daily Scrum 03 evidence">
    <img
      src="/img/scrum/sprint-1/daily-scrum-03.png"
      alt="Four-person team call image supplied as Daily Scrum 03 evidence"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Four-person team call image supplied as Daily Scrum 03 evidence.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-03-summary-of-progress */}

- **Product/Web:** Kevin documented the field-test protocol, reviewed responsive and accessible states, clarified Basic-tier product decisions, established the visual identity, compared map providers, and began the Mapbox Standard migration.
- **API/security:** Tyron completed and documented the challenge-attempt API contract so the browser could submit intent without marking challenges or awarding rewards locally.
- **Data:** Uzair documented PostGIS recovery, designed challenge and reward persistence, and synchronised the expanded issue plan with ownership and dependency information.
- **Quality/delivery:** Caleb established the Docusaurus site and Cloudflare Pages automation so architecture, API, testing, deployment, and process evidence could be published without requiring an account.

### Blockers Raised During Stand-ups {/* #daily-scrum-03-blockers-raised-during-stand-ups */}

- The refined Basic-tier workload was too large to treat as one undifferentiated
  sprint item.
- Location field testing, accessible-device checks, and production operator
  evidence remained manual gates.
- Account lifecycle, reward idempotency, card/deck rules, and battle rules
  required explicit server-side decisions before their dependent UI could be
  considered complete.

### Actions Taken {/* #daily-scrum-03-actions-taken */}

- The map-provider migration could change presentation and SDK integration, but
  not the API's authority over eligibility.
- The challenge-attempt contract needed to protect marking data, server
  deadlines, scores, rewards, and replay behaviour before UI implementation.
- Docusaurus provided the public documentation surface required for release
  evidence.
- The expanded backlog needed dependency order across persistence, API, Web,
  testing, and deployment rather than parallel implementation of disconnected
  screens.

### Next Actions {/* #daily-scrum-03-next-actions */}

- Implement identity and account-lifecycle foundations before dependent player
  data.
- Land challenge, reward, collection, deck, and battle migrations before their
  corresponding services and interfaces.
- Follow the refined dependency order and keep protected game rules on the
  server.
- Keep CI, public documentation, and release validation moving alongside the
  feature increment.

### Sources {/* #daily-scrum-03-record-details-and-sources */}

- **Reconstructed date:** 13 August 2026
- **Reporting window:** 11–13 August 2026
- **Evidence:** Gitea refinement history and commits for responsive review, PostGIS recovery, Docusaurus, branding, Mapbox, and challenge APIs

<a id="daily-scrum-4--17-august-2026-reconstructed" />

## Daily Scrum 4 — 17 August 2026 (reconstructed) {/* #daily-scrum-04 */}

**Date:** 17 August 2026 (reconstructed).

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-04.png" aria-label="Open full-size photo: Four-person team call image supplied as Daily Scrum 04 evidence">
    <img
      src="/img/scrum/sprint-1/daily-scrum-04.png"
      alt="Four-person team call image supplied as Daily Scrum 04 evidence"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Four-person team call image supplied as Daily Scrum 04 evidence.</figcaption>
</figure>

### Summary of Progress {/* #daily-scrum-04-summary-of-progress */}

- **Product/Web:** Kevin implemented the challenge experience, collection and deck interfaces, author console, CPU battle flow and history, then added end-to-end coverage and CI polish for the integrated player journey.
- **API/security:** Tyron delivered identity and account deletion, challenge services, collection and deck APIs, and protected author operations while retaining authenticated, server-authoritative contracts.
- **Data:** Uzair added challenge and reward migrations, atomic reward handling, the card catalogue, battle rules, CPU battle persistence, and demo seed data needed to exercise the vertical slice.
- **Quality/delivery:** Caleb reviewed the public documentation deployment during this window; the broader stream continued to depend on CI stability, deployment configuration, and evidence gathered by the feature owners.

### Blockers Raised During Stand-ups {/* #daily-scrum-04-blockers-raised-during-stand-ups */}

- Feature completion still needed one deterministic deployed journey and a
  consolidated body of release evidence.
- Mobile accessibility, reported-location field behaviour, and representative
  device checks remained manual gates.
- Production database operations, privacy/security boundaries, backup/recovery,
  and operator instructions needed explicit review.
- Transient CI or deployment failures had to be distinguished from product
  defects and documented rather than bypassed.
- Known limitations and incomplete advanced-tier behaviour needed to remain
  visible in the public documentation.

### Actions Taken {/* #daily-scrum-04-actions-taken */}

The available history shows the Basic-tier loop moving from separate plans to
an integrated increment:

1. discover an event and check eligibility;
2. start and submit a server-marked challenge;
3. receive a persisted, idempotent reward;
4. view cards and construct a validated deck;
5. run a server-resolved CPU battle and inspect its history; and
6. use protected author tools to manage the content behind the journey.

The browser continued to render authoritative state rather than deciding
eligibility, challenge results, rewards, deck legality, or battle outcomes.

### Next Actions {/* #daily-scrum-04-next-actions */}

- Exercise the complete Basic-tier journey deterministically in the deployed
  environment.
- Verify authentication, CORS, privacy, database, and server-authority
  boundaries at release scope.
- Finish accessibility and representative-device evidence.
- Consolidate release, testing, deployment, recovery, and known-limitation
  documentation for the handover.

### Sources {/* #daily-scrum-04-record-details-and-sources */}

- **Reconstructed date:** 17 August 2026
- **Reporting window:** 14–17 August 2026
- **Evidence:** Commits for challenges, rewards, collections, decks, authoring, CPU battles, account lifecycle, tests, documentation, and CI work

<a id="backlog-refinement--1112-august-2026-reconstructed" />

## Backlog Refinement — 11–12 August 2026 (reconstructed) {/* #backlog-refinement */}

**Date:** 11–12 August 2026 (reconstructed).

### Discussion {/* #backlog-refinement-discussion */}

Review the goal, dependencies, release evidence, and follow-up scope across the sprint. The record below summarises the retained sources.

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

### Completed or Mostly Completed Items {/* #backlog-refinement-completed-or-mostly-completed-items */}

- The authenticated location slice was implemented and deployable.
- Event discovery and PostGIS eligibility provided the first integrated journey.
- Release-quality and remaining Basic gameplay work had been split into focused issues.

### Items Needing Refinement {/* #backlog-refinement-items-needing-refinement */}

- Complete field, accessibility, deployment, database-release, and recovery evidence.
- Resolve challenge, reward, ownership, deck, battle, and account rules before dependent work.
- Keep the Basic issue-plan naming discrepancy visible rather than rewriting tracker history.

An earlier issue-writing plan called issues #62–#80 a
Sprint 2 plan. Current Gitea metadata records those issues under the `Sprint 1`
milestone, and their work was completed within the same August delivery period.
This record does not silently choose one label: it treats 12 August as a major
mid-delivery refinement while preserving the naming discrepancy for review.

### Backlog Decisions {/* #backlog-refinement-backlog-decisions */}

#### Refinement on 11 August: release-quality backlog {/* #backlog-refinement-refinement-on-11-august-release-quality-backlog */}

The first refinement pass added focused work rather than hiding it under the
general release issue:

- **[#43](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/43)** — **Refined outcome:** Field-test and calibrate location eligibility; **Recorded owner:** Kevin
- **[#44](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/44)** — **Refined outcome:** Validate the accessible mobile journey; **Recorded owner:** Kevin
- **[#45](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45)** — **Refined outcome:** Review deployed authentication, CORS, and privacy boundaries; **Recorded owner:** Uzair in current Gitea metadata; the committed plan originally described Tyron as owner, so the reassignment/history should be read from Gitea
- **[#46](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46)** — **Refined outcome:** Define the challenge and attempt API contract; **Recorded owner:** Tyron
- **[#47](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/47)** — **Refined outcome:** Make database release repeatable; **Recorded owner:** Uzair
- **[#48](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/48)** — **Refined outcome:** Rehearse PostGIS migration and recovery; **Recorded owner:** Uzair
- **[#49](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49)** — **Refined outcome:** Design challenge, reward, and ownership persistence; **Recorded owner:** Uzair
- **[#50](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/50)** — **Refined outcome:** Add deterministic vertical-slice E2E coverage; **Recorded owner:** Caleb
- **[#51](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51)** — **Refined outcome:** Refine visual identity and frontend presentation; **Recorded owner:** Kevin

##### Refinement rationale {/* #backlog-refinement-refinement-rationale */}

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

#### Refinement on 12 August: remaining Basic-tier decomposition {/* #backlog-refinement-refinement-on-12-august-remaining-basic-tier-decomposition */}

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

### Sources {/* #backlog-refinement-record-details-and-sources */}

- **Reconstructed dates:** 11–12 August 2026
- **Trigger:** The first vertical slice was implemented and deployable, but release evidence and the remaining Basic-tier journey were not yet decomposed sufficiently
- **Evidence:** Gitea issue creation history, the committed week-two issue plan, the Basic-tier issue plan, and subsequent implementation commits

<a id="sprint-review--exact-date-not-retained" />

## Sprint Review — exact date not retained {/* #sprint-review */}

**Date:** Exact date not retained.

### Demoed Features {/* #sprint-review-demoed-features */}

The available evidence identifies Review topics and delivered work. It does not establish an item-by-item live demonstration.

#### Sprint goal and delivered increment {/* #sprint-review-sprint-goal-and-delivered-increment */}

Sprint 1 began with a location-focused vertical-slice goal: an authenticated
player should discover a published event, submit a browser-reported location,
and receive a server-authoritative PostgreSQL/PostGIS eligibility result. The
repository supports the following delivered foundations by the sprint close:

- independently buildable React Web, Fastify API, and Docusaurus applications;
- Auth0 authentication and server-side bearer-token validation;
- versioned `/api/v1` routes, safe errors, request identifiers, and generated
  OpenAPI;
- PostgreSQL/PostGIS migrations, seeds, readiness checks, and authoritative
  event eligibility;
- map-backed and map-independent event discovery with browser-location failure
  handling;
- Gitea CI/CD, independent Web/API deployment, and public documentation;
- automated unit, component, route, database, and deterministic browser
  coverage for the release slice; and
- architecture, requirements, risk, deployment, testing, and operational
  documentation.

Repository history also shows substantial Basic functionality delivered before
the milestone close: timed challenges and marking, retry-safe rewards,
collection and starter cards, saved decks, CPU matches and history, and the
protected Author console. These later features were real repository progress,
but they were not silently added to the narrower formal Sprint 1 location-slice
release claim.

#### Repository-backed Review topics {/* #sprint-review-repository-backed-review-topics */}

The following are safe reconstructions of increment topics available for Review
from the Sprint goal and delivered work. The evidence does not prove that every
item was live-demonstrated or establish a precise presentation sequence.

1. The end-to-end location slice from authentication and event discovery to an
   API/PostGIS eligibility result.
2. The authority boundary: reported location is untrusted, the map is
   presentation-only, and protected rules remain server-side.
3. Mobile and accessible fallback behaviour when geolocation, the map provider,
   or the API fails.
4. Independent Web/API/docs builds, automated validation, deployment, and
   public documentation.
5. The broader Basic gameplay and Author increment then present in the
   repository, while distinguishing it from the formal Sprint 1 release scope.

### Accepted Items {/* #sprint-review-accepted-items */}

The team confirmed a positive overall assessment. Item-by-item acceptance was not retained, and the formal location-slice release remains narrower than the later Basic implementation.

### Review Notes {/* #sprint-review-review-notes */}

#### Evidence boundaries {/* #sprint-review-evidence-boundaries */}

- **Contemporaneous evidence:** the repository, issues, pull requests, commits,
  workflows, deployments, and documents created during the sprint. No Review
  minutes or recording are available.
- **Team-confirmed recollection:** the Review occurred and the team's overall
  assessment was positive.
- **Repository evidence:** establishes the delivered increment and known gates,
  but not the exact order or wording of the ceremony.
- **Future planned evidence:** later Reviews should retain date, attendance,
  increment demonstrated, stakeholder feedback, decisions, and follow-up work
  at the time of the ceremony.

#### Assessment and limitations {/* #sprint-review-assessment-and-limitations */}

The team confirms that its assessment was positive and that it was satisfied
with Sprint 1 progress. The repository supports substantial delivery, while
also recording these limitations at the boundary:

- completed campus field-test results were not retained in the repository, so
  location thresholds remained provisional;
- full manual keyboard, screen-reader, touch, contrast, reduced-motion, and
  representative-device evidence remained incomplete;
- signed-in production, database-release, backup/recovery, and other
  operator-owned evidence was not fully recorded;
- a complete player profile/account, password-reset, and account-deletion
  journey remained future Basic work;
- some Creature content and strict publication enforcement still required
  reviewed remediation; and
- meeting, ceremony, and feedback evidence had not been captured consistently
  at the time it occurred.

These limits are preserved in the [Sprint 1 evidence index](evidence.md),
[known limitations](evidence.md#known-limitations), and
[Basic-tier release validation](../../../testing/basic-tier-release-validation.md).

### Follow-up Items {/* #sprint-review-follow-up-items */}

Natural follow-up work included:

- complete and validate the remaining account/profile capabilities;
- conduct formal user testing and trace findings into issues and changes;
- finish manual accessibility, responsive, field, and deployed-provider
  evidence;
- continue CI reliability and release-evidence improvements;
- resolve remaining content and database-enforcement gates; and
- preserve current-reference and historical-evidence boundaries as the product
  evolves.

### Sources {/* #sprint-review-record-details-and-sources */}

- **Ceremony:** Sprint 1 Review
- **Occurrence:** Confirmed by the team
- **Date:** Exact date not retained
- **Participants:** Detailed attendance was not retained
- **Team assessment:** Positive; the team confirms it was satisfied with the progress made
- **Primary sources:** Team-confirmed recollection, Git/Gitea history, Sprint 1 goal, release evidence, and current-state reconciliation

<a id="sprint-retrospective--exact-date-not-retained" />

## Sprint Retrospective — exact date not retained {/* #sprint-retrospective */}

**Date:** Exact date not retained.

### What Went Well {/* #sprint-retrospective-what-went-well */}

- The team was generally happy with Sprint 1 progress.
- Major project foundations were established across architecture,
  authentication, API, database, Web, documentation, testing, CI/CD, and
  deployment.
- The location vertical slice was delivered, and substantial Basic challenge,
  reward, collection, deck, CPU battle, and Author functionality was also
  present by the sprint close.
- CI/CD and deployment capability improved as concrete runner, artifact,
  configuration, and deployment problems were investigated.
- Architecture, documentation, testing, and development processes became more
  explicit and repeatable during the sprint.
- Small issue- and pull-request-backed changes allowed specialist work to be
  integrated while retaining server-authority and review boundaries.

### What Did Not Go Well {/* #sprint-retrospective-what-did-not-go-well */}

- CI/CD issues required remediation during the sprint, showing that reliability
  and evidence from the exact release path needed continued attention.
- The map experience required further UX refinement after the initial vertical
  slice.
- Some product decisions, reconciliation, and evidence were documented after
  implementation rather than when the decision or event occurred.
- Client-meeting, Sprint Review, and Retrospective evidence was not retained
  consistently; later reconstruction cannot replace contemporaneous notes.
- Informal sharing of the application had not yet become a structured user test
  with recorded observations, critique, prioritisation, and traced changes.

These are process themes, not attributed complaints from a particular person.

### Lessons Learned {/* #sprint-retrospective-lessons-learned */}

- Keep a small end-to-end increment and integrate specialist work through focused reviews.
- Capture ceremony, stakeholder, and release evidence when the work happens.
- Prepare structured user testing early enough to evaluate and retest findings.

### Action Items for Sprint 2 {/* #sprint-retrospective-action-items-for-sprint-2 */}

- **Retain actual Review and Retrospective notes:** Dated record with participants, increment or themes, decisions/actions, and links created at the ceremony
- **Capture stakeholder feedback when it happens:** Interaction record separating feedback, team evaluation, decision, owner, issue, and resulting change
- **Run formal user testing:** Follow the [testing strategy](../../../testing/testing-strategy.md#manual-and-field-validation) and retain sanitised observations and results
- **Continue smaller reviewed vertical slices:** Focused issue and PR links with acceptance criteria, tests, documentation, and review evidence
- **Continue improving CI reliability:** Named failure, measured intervention, exact workflow result, and any residual risk
- **Preserve current/historical documentation boundaries:** Current reference updated without rewriting dated plans, decisions, or evidence records

### Follow-up {/* #sprint-retrospective-follow-up */}

#### Evidence boundaries {/* #sprint-retrospective-evidence-boundaries */}

- **Contemporaneous evidence:** the sprint's issues, commits, pull requests,
  CI/deployment history, and documents; no Retrospective minutes are available.
- **Team-confirmed recollection:** the Retrospective occurred, the team was
  generally happy with progress, and the broad themes below are accurate.
- **Repository evidence:** supports delivery, CI/map remediation, and the timing
  of documentation/evidence work; it does not preserve individual views.
- **Future planned evidence:** later Retrospectives should retain participants,
  agreed themes, selected actions, owners, and follow-up review at the time.

#### Follow-up rule {/* #sprint-retrospective-follow-up-rule */}

An improvement is not complete merely because it appears in this reconstructed
record. Sprint 2 evidence must show the process being used: notes retained,
feedback evaluated, tests run, issues created, changes reviewed, and outcomes
linked.

### Sources {/* #sprint-retrospective-record-details-and-sources */}

- **Ceremony:** Sprint 1 Retrospective
- **Occurrence:** Confirmed by the team
- **Date:** Exact date not retained
- **Detailed notes:** Not retained
- **Overall theme:** The team was generally happy with Sprint 1 progress
- **Sources:** Team-confirmed themes and repository evidence

## Sources and Record Status

The eight ceremony sections retain issue/PR references,
reporting windows, ownership, and original AI declarations. The planning and
Daily Scrum photos follow the supplied filename order; image metadata does not
establish dates or identities. No Review or Retrospective photo was supplied.
See the [record and image provenance](../index.md#sprint-1-image-provenance) and
[Sprint 1 evidence index](evidence.md).

## AI declaration

The original ceremony narratives used repository history, project documentation, and the supplied `vitaqsprint.pdf` layout reference with assistance from Codex[GPT-5], Codex-CLI[GPT-5], Codex[GPT-6].

Report consolidation and simplification assisted by Codex[GPT-6]. Repeated
agendas, workflow instructions, and source notices were removed; historical
dates, photo provenance, and evidence limits are unchanged. No meeting,
attendance, quotation, acceptance, or test result is inferred from this edit.
