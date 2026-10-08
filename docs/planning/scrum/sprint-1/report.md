---
title: Sprint 1
description: Planning, daily coordination, refinement, review, and retrospective in one sprint report.
sidebar_position: 0
toc_max_heading_level: 2
---

# Sprint 1

Historical report for the August 2026 increment. Planning and Daily Scrum dates
are reconstructed from repository activity. The team confirmed that the Review
and Retrospective occurred; their exact dates were not retained.

## Sprint Planning — 5 August 2026 (reconstructed)

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/sprint-planning.png" aria-label="Open full-size photo: Team-call image supplied for Sprint 1 planning">
    <img
      src="/img/scrum/sprint-1/sprint-planning.png"
      alt="Team-call image supplied for Sprint 1 planning"
      width="3838"
      height="2158"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call image supplied for Sprint 1 planning.</figcaption>
</figure>

### Sprint Goal

Build the first deployable Wits Quest journey: an authenticated player discovers
a published campus event, submits a browser-reported location, and receives a
server-authoritative PostGIS eligibility decision. Establish the Web, API,
database, CI/CD, and documentation foundations needed for later gameplay.

### Agenda

Review the location journey, agree on application boundaries, allocate work,
identify dependencies, and define the quality and release checks.

### Discussion Summary

- Use the first journey to connect authentication, event data, eligibility,
  presentation, and deployment rather than build isolated screens.
- Keep the React Web application and Fastify API independently buildable.
- Use PostgreSQL/PostGIS for event geometry and distance checks.
- Keep an accessible event list available when the map cannot load.
- Treat location radius, accuracy, and freshness values as provisional until
  field testing provides evidence.

### Key Decisions

- Keep eligibility and other protected decisions in the API.
- Treat browser location data as untrusted input.
- Use short-lived branches, Gitea issues, reviewed pull requests, and CI.
- Include relevant tests, documentation, security, and accessibility in completion.
- Keep unperformed manual and external checks visible in the release record.

### Task Allocation

- **Kevin — product/Web:** campus map, event discovery, reported-location
  submission, and eligibility presentation (#12, #21).
- **Tyron — API/security:** authentication selection, token validation, and
  protected event endpoints (#11, #13, #14).
- **Uzair — data/infrastructure:** PostgreSQL/PostGIS setup, event migration and
  seed, and authoritative eligibility (#16, #18, #19).
- **Caleb — quality/delivery:** public documentation, CI/CD, and vertical-slice
  release validation (#15, #17, #20).
- **Whole team:** project and Git methodology (#10).

### Action Items

- Establish repository conventions and scaffold the Web/API applications.
- Configure authentication, database access, event data, and CI.
- Connect discovery and reported-location actions to protected API routes.
- Deploy the applications independently and publish project documentation.
- Validate the integrated journey and retain the release evidence.

[Detailed planning record and issue links](initial-planning.md).

## Daily Scrum 1 — 6 August 2026 (reconstructed)

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-01.png" aria-label="Open full-size photo: Team-call image supplied for Sprint 1 Daily Scrum 1">
    <img
      src="/img/scrum/sprint-1/daily-scrum-01.png"
      alt="Team-call image supplied for Sprint 1 Daily Scrum 1"
      width="1672"
      height="941"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call image supplied for Sprint 1 Daily Scrum 1.</figcaption>
</figure>

### Summary of Progress

- Kevin established the monorepo conventions, React scaffold, setup documentation,
  tests, and first map presentation components.
- Tyron documented the architecture, application boundaries, decisions, and risks.
- Uzair configured separate Neon development/test targets and the event schema.
- CI remained the next shared delivery dependency; no Caleb commit is attributed
  to the 5–6 August reporting window.

### Blockers Raised During Stand-ups

- Authentication and the token contract had not yet landed.
- The Fastify API and CI workflow were pending.
- Location thresholds still needed field validation.

### Actions Taken

- Kept Web, API, and database configuration separate within the shared workspace.
- Established that event geometry and eligibility belong to the API/database.
- Prepared the architecture and environment examples for the next integrations.

[Detailed check-in and next actions](daily-scrum-01.md).

## Daily Scrum 2 — 10 August 2026 (reconstructed)

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-02.png" aria-label="Open full-size photo: Team-call image supplied for Sprint 1 Daily Scrum 2">
    <img
      src="/img/scrum/sprint-1/daily-scrum-02.png"
      alt="Team-call image supplied for Sprint 1 Daily Scrum 2"
      width="1672"
      height="941"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call image supplied for Sprint 1 Daily Scrum 2.</figcaption>
</figure>

### Summary of Progress

- Kevin connected the authenticated Explore and reported-location journey.
- Tyron established Fastify, Auth0 validation, event/eligibility routes, and CORS.
- Uzair delivered PostGIS eligibility, migrations, and database deployment support.
- Caleb established Gitea Actions quality jobs and the initial deployment setup.

### Blockers Raised During Stand-ups

- Production database readiness and public documentation were incomplete.
- Permission failures, responsive behaviour, and accessibility needed manual evidence.
- The remaining gameplay work needed dependency-aware refinement.

### Actions Taken

- Selected Auth0 and adopted `/api/v1` as the browser-to-server boundary.
- Kept token validation and eligibility on the server.
- Separated formatting, lint, type-check, test, and build feedback in CI.

[Detailed check-in and next actions](daily-scrum-02.md).

## Daily Scrum 3 — 13 August 2026 (reconstructed)

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-03.png" aria-label="Open full-size photo: Team-call image supplied for Sprint 1 Daily Scrum 3">
    <img
      src="/img/scrum/sprint-1/daily-scrum-03.png"
      alt="Team-call image supplied for Sprint 1 Daily Scrum 3"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call image supplied for Sprint 1 Daily Scrum 3.</figcaption>
</figure>

### Summary of Progress

- Kevin reviewed responsive/accessibility states, field-test plans, identity,
  product decisions, and map-provider presentation.
- Tyron completed the challenge-attempt API contract.
- Uzair documented PostGIS recovery and designed challenge/reward persistence.
- Caleb established Docusaurus and Cloudflare Pages documentation automation.

### Blockers Raised During Stand-ups

- The Basic workload needed smaller, ordered implementation slices.
- Field testing, device checks, and production operations remained manual gates.
- Account, reward, card/deck, and battle rules needed explicit contracts.

### Actions Taken

- Kept map-provider changes independent of eligibility authority.
- Protected marking data, deadlines, scores, rewards, and replay handling in the API contract.
- Ordered the expanded backlog across persistence, services, client work, and validation.

[Detailed check-in and next actions](daily-scrum-03.md).

## Daily Scrum 4 — 17 August 2026 (reconstructed)

<figure className="sprint-meeting-photo">
  <a href="/img/scrum/sprint-1/daily-scrum-04.png" aria-label="Open full-size photo: Team-call image supplied for Sprint 1 Daily Scrum 4">
    <img
      src="/img/scrum/sprint-1/daily-scrum-04.png"
      alt="Team-call image supplied for Sprint 1 Daily Scrum 4"
      width="1448"
      height="1086"
      loading="lazy"
      decoding="async"
    />
  </a>
  <figcaption>Team-call image supplied for Sprint 1 Daily Scrum 4.</figcaption>
</figure>

### Summary of Progress

- Kevin integrated challenge, collection, deck, Author, and CPU battle interfaces.
- Tyron delivered identity/account services and protected challenge, collection,
  deck, and Author APIs.
- Uzair added atomic rewards, catalogue data, battle persistence, and demo seeds.
- Caleb reviewed documentation deployment while release evidence and CI work continued.

### Blockers Raised During Stand-ups

- The integrated Basic loop needed consolidated release evidence.
- Accessibility, field behaviour, representative devices, and production
  database/recovery checks still required recorded validation.
- CI/deployment failures needed investigation and clear separation from product defects.

### Actions Taken

- Connected discovery → challenge → reward → collection → deck → CPU battle/history.
- Kept eligibility, marking, rewards, deck legality, and battle outcomes server-owned.
- Prepared deterministic journey, privacy, recovery, and handover checks.

[Detailed check-in and next actions](daily-scrum-04.md).

## Backlog Refinement — 11–12 August 2026 (reconstructed)

### Discussion

Separate the implemented location slice from the work needed to validate its
release and complete the wider Basic game loop. This section follows the
example's ceremony grouping; refinement occurred before Daily Scrums 3 and 4.

### Completed or Mostly Completed Items

- Authenticated event discovery and server-authoritative location eligibility.
- Deployable Web/API foundations and CI.
- A first integrated location journey ready for further release checks.

### Items Needing Refinement

- Field calibration, accessibility, authentication/CORS/privacy, database release,
  recovery, E2E coverage, and presentation (#43–#51).
- Identity, challenges, rewards, cards, decks, CPU battles, Author tools, and
  demonstrable content (#62–#80).
- Team capacity: Kevin's presentation and validation load exceeded the nominal allocation.

### Backlog Decisions

- Split release quality into independently reviewable issues.
- Keep unvalidated thresholds as field-test tasks.
- Implement persistence and protected contracts before their dependent client work.
- Carry non-blocking polish forward when capacity cannot support it.
- Preserve the naming discrepancy: the committed #62–#80 plan calls itself
  Sprint 2, while the recorded tracker metadata placed those issues in Sprint 1.

[Detailed refinement, ownership, and issue links](backlog-refinement.md).

## Sprint Review — exact date not retained

### Demoed Features

The retained record establishes available Review topics, rather than an exact
live demonstration sequence:

- Authentication, campus event discovery, and PostGIS eligibility.
- Map-independent discovery and location-failure handling.
- Independent builds, CI/CD, deployments, and public documentation.
- Later Basic challenge, reward, collection, deck, CPU battle, and Author work.

### Accepted Items

The team confirmed a positive overall assessment. Item-by-item acceptance was
not retained. The formal Sprint 1 release claim remains the location slice;
later Basic implementation does not expand that claim automatically.

### Review Notes

- Substantial foundations and Basic gameplay were delivered in the repository.
- Field calibration, manual accessibility/device checks, and production operator
  evidence remained incomplete.
- Account/profile completeness, content enforcement, and ceremony evidence
  needed follow-up at the sprint boundary.

### Follow-up Items

- Complete account/profile work and remaining content constraints.
- Run structured user testing and retain finding → issue → change → retest evidence.
- Complete field, accessibility, deployed-provider, and recovery validation.
- Retain later ceremony and stakeholder records when they occur.

[Detailed Review and release-evidence links](sprint-review.md).

## Sprint Retrospective — exact date not retained

### What Went Well

- The team was happy with progress and delivered the first location slice.
- Specialist work integrated through focused issues and reviewed pull requests.
- Basic gameplay, documentation, tests, CI/CD, and deployment foundations expanded.
- Concrete pipeline and map issues improved the architecture and delivery process.

### What Did Not Go Well

- CI/CD and map UX needed remediation during delivery.
- Some decisions and evidence were documented after implementation.
- Ceremony and stakeholder evidence was not consistently retained.
- Informal app sharing had not yet become a structured user test.

### Lessons Learned

- Keep increments integrated and small enough to review and validate.
- Record decisions, feedback, and release evidence as work happens.
- Prepare formal testing early enough to act on and retest findings.

### Action Items for Sprint 2

- Capture dated Review and Retrospective notes with participants and actions.
- Record stakeholder feedback with evaluation, decisions, owners, and issue links.
- Run the formal user-testing plan and retain sanitised results.
- Continue focused vertical slices and CI reliability work.
- Keep historical evidence dated while updating current technical references.

[Detailed Retrospective and improvement evidence](sprint-retrospective.md).

## Sources and Record Status

This report summarises the eight linked records. They retain issue/PR references,
reporting windows, ownership, and original AI declarations. The planning and
Daily Scrum photos follow the supplied filename order; image metadata does not
establish dates or identities. No Review or Retrospective photo was supplied.
See the [record and image provenance](../index.md#sprint-1-image-provenance) and
[Sprint 1 evidence index](../../../testing/sprint-1-evidence-index.md).

## AI declaration

Prepared with assistance from Codex[GPT-6], using the existing Sprint 1 records
for content and `vitaqsprint.pdf` for layout. Historical claims and source
attributions remain in the detailed records.
