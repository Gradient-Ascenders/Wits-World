# Sprint 1, Week 2 Gitea Issue Plan

:::note[Historical issue plan]

This page preserves a Sprint 1 planning snapshot. It is not the current backlog
or current issue state.

:::

## Current state

- `main` is at `6361b1e`; the latest Gitea CI reports all six jobs successful,
  including API and web deployment.
- The authenticated location vertical slice is implemented: event discovery,
  map and text fallback, geolocation, PostGIS eligibility, Auth0 protection, and
  error states.
- Local lint, type-checking, and tests pass:
  - API: 114 passed, 2 skipped
  - Web: 60 passed
  - Documentation: 1 passed
- The documentation application remains only a scaffold.
- The production database migration and seed procedure is documented as
  outstanding.
- Location radius and freshness values remain provisional pending field
  testing.
- Gitea has eleven open issues, no open pull requests, and one open Sprint 1
  milestone due 25 August 2026 after the week-two backlog was created.
- Repository-wide formatting is blocked only by ignored local `.playwright-mcp`
  evidence files. The unrelated untracked logo reference was left untouched.

The installed Gitea version does not expose project-column names through its
API. Issue #15 has a recorded board transition and is treated as `In Progress`;
issue #20 has no subsequent transition and is treated as `Backlog`. Gitea did
not automatically add issues #43–#51 to the project, so those cards still need
to be added to `Backlog` manually.

## Recommended week-two responsibilities

| Gitea member       | Week-two responsibility                                                       |           Approx. load |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------: |
| `kevin-ebrahim`    | Product, field testing, accessibility, visual refinement, and player evidence | ~6.5 days plus reviews |
| `Tyron-Van-Tonder` | Deployed security validation and challenge-contract foundation                |                ~5 days |
| `Uzair`            | Database release reliability and persistence foundation                       |                ~5 days |
| `Caleb_P`          | Documentation, end-to-end testing, and release coordination                   |                ~5 days |

This temporarily shifts `Caleb_P` from card-system implementation to release
quality because #15 and #20 are the only existing unresolved issues and are
already assigned to him. Challenge and reward implementation remains postponed;
only two explicitly gated design foundations are proposed.

Kevin's additional visual-refinement issue raises his estimated week-two load
above the original five-day target. The team should either reduce the issue's
visual-bug scope or carry non-blocking polish forward if release work is at
risk.

## Created Gitea issue mapping

| Planning ID | Gitea issue                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `S1-W2-01`  | [#43 — Field-test and calibrate Sprint 1 location eligibility](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/43)                  |
| `S1-W2-02`  | [#44 — Validate the accessible mobile Sprint 1 player journey](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/44)                  |
| `S1-W2-03`  | [#45 — Review deployed authentication, CORS, and location privacy boundaries](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45)   |
| `S1-W2-04`  | [#46 — Define the challenge and attempt API contract](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/46)                           |
| `S1-W2-05`  | [#47 — Make the Sprint 1 database release procedure repeatable](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/47)                 |
| `S1-W2-06`  | [#48 — Rehearse PostGIS migration, seed, and eligibility recovery](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/48)              |
| `S1-W2-07`  | [#49 — Design the challenge, reward, and card ownership persistence foundation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/49) |
| `S1-W2-08`  | [#50 — Add deterministic end-to-end coverage for the Sprint 1 vertical slice](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/50)   |
| `S1-W2-09`  | [#51 — Refine the Wits Quest visual identity and frontend presentation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51)         |

---

## #15 — Publish the initial documentation website

**Gitea title:** `Publish the initial documentation website`  
**Existing Gitea issue:** [#15](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/15)  
**Project column:** `In Progress`  
**Milestone:** `Sprint 1`  
**Assignee:** `Caleb_P — Documentation, End-to-End and Release Quality Lead`  
**Reviewer:** `kevin-ebrahim`  
**Labels:** `Low Priority`, `documentation`, `feature`  
**Estimate:** `2 days`  
**Depends on:** `#5, #7` — both complete  
**Blocks:** `#20`

```markdown
## Purpose

Provide the publicly accessible, version-controlled documentation website required for the Sprint 1 demonstration and review.

## Description

Replace the current documentation workspace scaffold with a usable static documentation application. Publish the existing setup, architecture, methodology, requirements, testing, deployment, and roadmap material without duplicating or contradicting the repository documentation.

The site must be accessible without a Gitea or application account.

## Included

- Static documentation application
- Public deployment
- Project overview
- Getting-started guide
- Architecture and trust-boundary overview
- Project methodology
- Requirements and player journey
- Delivery roadmap
- Testing and deployment guidance
- AI-use declaration
- Contribution guidance
- Mobile and desktop navigation
- Internal-link checking where practical

## Not included

- Complete final user manual
- Complete generated API reference
- Marketing website
- Final visual branding
- Challenge, collection, deck, or battle documentation
- Invented stakeholder decisions

## Acceptance criteria

- [ ] The documentation application is no longer a placeholder scaffold
- [ ] The site is generated from version-controlled Markdown or MDX
- [ ] The site is publicly accessible without an account
- [ ] Deployment is automatic or follows a documented repeatable process
- [ ] Navigation exposes setup, architecture, methodology, requirements, testing, deployment, and roadmap content
- [ ] Existing documentation remains the source of truth or is deliberately migrated
- [ ] The site works at mobile and desktop widths
- [ ] Meaningful images have text alternatives
- [ ] Keyboard focus and navigation are usable
- [ ] Internal links are checked automatically where practical
- [ ] No secret, token, or private environment value appears in the published output

## Testing and evidence

- [ ] Documentation lint, type-check, test, and build commands pass
- [ ] The public URL is attached to the issue
- [ ] Deployment evidence is attached
- [ ] Another member follows the getting-started guide
- [ ] Mobile and desktop screenshots are stored under `.pr-screenshots/`
- [ ] Keyboard navigation is checked manually
- [ ] Broken-link behaviour is verified

## Documentation

- [ ] Document how to run the site locally
- [ ] Document how to add or update content
- [ ] Document the deployment process
- [ ] Include an accurate AI-use declaration
- [ ] Link the public site from the repository README

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated checks pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes
- [ ] Another team member has reviewed the pull request
- [ ] The issue is linked from the pull request
- [ ] Public deployment has been verified
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-01 — Field-test and calibrate location eligibility

**Gitea title:** `Field-test and calibrate Sprint 1 location eligibility`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `kevin-ebrahim — Product and Player Experience Lead`  
**Reviewer:** `Uzair`  
**Labels:** `High Priority`, `frontend`, `testing`, `research`, `documentation`  
**Estimate:** `2 days`  
**Depends on:** `#19, #21` — both complete  
**Blocks:** `S1-W2-02, #20`

```markdown
## Purpose

Determine whether the provisional event radius, location freshness, accuracy handling, and player messaging are usable under real campus conditions.

## Description

Run controlled field checks against the deployed Sprint 1 event using representative mobile devices and browsers. Record observed API outcomes and player-facing states without treating browser location as proof of presence.

Review the provisional 75-metre event radius and two-minute freshness threshold. Any resulting value must be recorded as confirmed, unresolved, or still provisional rather than silently changed.

## Included

- Real-device browser checks
- Location permission prompt behaviour
- Reachable, unreachable, and ambiguous-accuracy observations
- Fresh, stale, and timeout behaviour
- Outdoor and realistically difficult positioning conditions
- Review of the provisional radius and freshness threshold
- Review of player-facing retry guidance
- Sanitised evidence without precise coordinates or tokens
- Follow-up defects where observed behaviour differs from requirements

## Not included

- Movement-history tracking
- Anti-cheat or trust scoring
- Continuous location monitoring
- Automatic event placement
- Silent changes to server rules
- Claims that location is verified
- Testing in unsafe or unauthorised locations

## Acceptance criteria

- [ ] A field-test plan identifies devices, browsers, conditions, and expected states
- [ ] At least one reachable or safe-retry outcome is observed on a real mobile device
- [ ] An out-of-range claim produces the API-authoritative unreachable result
- [ ] Poor or ambiguous accuracy produces a retry rather than a guessed result
- [ ] Denied permission leaves event information usable
- [ ] The application requests one location reading only after player action
- [ ] Radius, freshness, and accuracy decisions are recorded as confirmed, unresolved, or provisional
- [ ] No threshold is described as client-approved without evidence
- [ ] The browser does not calculate or override eligibility
- [ ] Any required code, data, or contract change is coordinated with the relevant lead

## Testing and evidence

- [ ] Device, operating system, browser, route, and permission state are recorded
- [ ] Evidence covers at least two materially different location outcomes
- [ ] Screenshots exclude tokens and precise coordinates
- [ ] API and UI results are compared for consistency
- [ ] Any discovered defects are recorded separately with reproduction steps
- [ ] `Uzair` reviews geospatial interpretation and threshold implications

## Documentation

- [ ] Update the player-location journey with verified field limitations
- [ ] Update the requirements register or decision record
- [ ] Update known limitations
- [ ] Record the final status of provisional thresholds
- [ ] Include an accurate AI-use declaration where required

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests still pass
- [ ] Field evidence is attached or linked
- [ ] Another team member reviews the findings
- [ ] The issue is linked from any resulting pull request
- [ ] Follow-up defects or unresolved decisions are recorded
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-02 — Validate the accessible mobile player journey

**Gitea title:** `Validate the accessible mobile Sprint 1 player journey`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `kevin-ebrahim — Product and Player Experience Lead`  
**Reviewer:** `Caleb_P`  
**Labels:** `High Priority`, `frontend`, `testing`, `documentation`  
**Estimate:** `2.5 days`  
**Depends on:** `#12, #21, S1-W2-01`  
**Blocks:** `S1-W2-08, #20`

```markdown
## Purpose

Verify that a player can understand and complete the Sprint 1 journey on a small mobile screen, with keyboard or assistive navigation, and when location or map services fail.

## Description

Perform a focused accessibility, responsive, and usability review of the deployed `/explore` journey. Test representative viewport widths, keyboard operation, status announcements, map-independent event discovery, geolocation failures, and recovery actions.

Address clear, in-scope defects. Record larger changes as follow-up issues instead of expanding this issue into a redesign.

## Included

- Checks near 360 px, 390 px, 768 px, and a desktop viewport
- Keyboard navigation and visible focus
- Heading and landmark structure
- Touch-target sizing
- Status and alert announcements
- Permission-denied and timeout states
- Poor-accuracy and stale-location states
- API and map-provider failures
- Event-list fallback
- A small structured user observation
- Focused fixes discovered during testing
- Sanitised mobile and desktop evidence

## Not included

- Challenge interface
- Reward or collection interface
- Full accessibility certification
- Large visual redesign
- Marketing research
- Claims based only on automated accessibility tooling
- Fabricated user feedback

## Acceptance criteria

- [ ] The journey has no horizontal overflow at the required representative widths
- [ ] The primary action remains understandable and reachable at narrow widths
- [ ] All interactive controls are keyboard operable
- [ ] Keyboard focus is visible
- [ ] Icon-only controls, if present, have accessible names
- [ ] Loading and eligibility results are announced appropriately
- [ ] Errors use text and do not rely on colour alone
- [ ] Event discovery remains available when the map fails
- [ ] Permission denial and retry guidance are understandable
- [ ] The interface never describes the location claim as verified
- [ ] At least one real user observation is recorded accurately, or the absence of an available participant is reported honestly
- [ ] Clear in-scope defects are fixed and covered by tests

## Testing and evidence

- [ ] Relevant component and integration tests pass
- [ ] An automated accessibility scan is run and its limitations are stated
- [ ] Manual keyboard navigation is recorded
- [ ] Mobile and desktop screenshots are attached from `.pr-screenshots/`
- [ ] The tested route, viewport, authentication state, and geolocation state are recorded
- [ ] User feedback distinguishes observed behaviour from interpretation
- [ ] `Caleb_P` reviews the evidence against the release checklist

## Documentation

- [ ] Update accessibility behaviour where implementation changed
- [ ] Update the player journey where observed behaviour differs
- [ ] Record known limitations
- [ ] Link resulting defects or decisions
- [ ] Include an accurate AI-use declaration where required

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant verification commands pass
- [ ] CI passes
- [ ] Manual checks and evidence are attached
- [ ] Another team member reviews the pull request and evidence
- [ ] The issue is linked from the pull request
- [ ] Follow-up defects are recorded
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-03 — Review deployed security and privacy boundaries

**Gitea title:** `Review deployed authentication, CORS, and location privacy boundaries`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Tyron-Van-Tonder — API and Security Lead`  
**Reviewer:** `kevin-ebrahim`  
**Labels:** `High Priority`, `backend`, `testing`, `documentation`  
**Estimate:** `2.5 days`  
**Depends on:** `#3, #8, #13, #14, #37` — all complete  
**Blocks:** `S1-W2-08, #20`

```markdown
## Purpose

Confirm that the deployed Sprint 1 journey preserves the documented authentication, CORS, server-authority, and location-privacy boundaries.

## Description

Review the deployed web-to-API boundary using safe test accounts and requests. Confirm that protected routes require valid bearer tokens, CORS grants only the configured web origin, player identity comes from the validated token, and sensitive values are not exposed in responses, logs, screenshots, or browser storage.

This is a focused release-boundary review, not a penetration test.

## Included

- Unauthenticated and invalid-token requests
- Valid authenticated event discovery
- Allowed-origin CORS preflight
- Unapproved-origin CORS preflight
- Auth0 issuer and audience configuration names
- API-safe error responses and request identifiers
- Browser storage and console review
- Location-data handling review
- Verification that client-supplied authority fields are rejected
- Documentation of observed limitations
- Focused fixes for confirmed release blockers

## Not included

- Full penetration testing
- Load or denial-of-service testing
- Auth0 tenant redesign
- New application roles
- Movement-history anti-cheat
- New data-retention rules without team or client approval
- Printing secret values during verification

## Acceptance criteria

- [ ] Protected event endpoints return 401 without a valid bearer token
- [ ] Player identity is derived from the validated token
- [ ] The API rejects client-supplied eligibility decisions
- [ ] The configured production web origin receives the intended CORS headers
- [ ] An unapproved origin is not granted browser access
- [ ] Wildcard CORS is not enabled
- [ ] Tokens are absent from committed files, response bodies, screenshots, and application logs inspected during the review
- [ ] Precise location claims are not written to browser storage
- [ ] Accepted answers, reward decisions, and private author data remain absent
- [ ] Safe API errors do not expose stack traces or configuration values
- [ ] Any retention uncertainty is documented rather than silently resolved
- [ ] Confirmed release-blocking defects are fixed or recorded

## Testing and evidence

- [ ] Automated authentication and CORS tests pass
- [ ] Allowed- and denied-origin request evidence is attached
- [ ] An unauthenticated protected request is recorded
- [ ] Browser storage and console checks are recorded
- [ ] Evidence contains no token, secret, or precise coordinate
- [ ] `kevin-ebrahim` reviews the player-facing implications
- [ ] Any production defect includes reproducible, sanitised evidence

## Documentation

- [ ] Update authentication or CORS setup if it differs from deployment
- [ ] Update trust-boundary documentation if implementation differs
- [ ] Update known limitations
- [ ] Record unresolved privacy or retention decisions
- [ ] Include an accurate AI-use declaration where required

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated checks pass
- [ ] CI passes for any resulting change
- [ ] Another team member reviews the pull request or review report
- [ ] The issue is linked from any resulting pull request
- [ ] Follow-up security defects are recorded
- [ ] No sensitive evidence is attached
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-04 — Define the challenge and attempt API contract

**Gitea title:** `Define the challenge and attempt API contract`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Tyron-Van-Tonder — API and Security Lead`  
**Reviewer:** `Uzair`  
**Labels:** `Low Priority`, `backend`, `documentation`, `research`  
**Estimate:** `2.5 days`  
**Depends on:** `S1-W2-03`; start only when firm Sprint 1 release work is not at risk  
**Blocks:** `S1-W2-07`  
**Does not block:** `#20`

```markdown
## Purpose

Define a safe Sprint 2 contract for opening and submitting challenges before database, API, and UI implementations diverge.

## Description

Design the versioned API contract for challenge start and answer submission, including authentication, validation, safe player-facing payloads, attempt identifiers, result feedback, and errors.

This is a gated Sprint 1 foundation. It must not delay the location vertical-slice release and must not implement the complete challenge or reward system.

Accepted answers or marking secrets must never appear in a pre-submission response.

## Included

- Challenge-start request and response
- Answer-submission request and response
- Challenge-format discriminator
- Safe player-facing challenge payload
- Attempt identifier and state
- Server-authoritative marking response
- Authentication requirements
- Validation rules
- Safe error model
- Configurable or unresolved expiry behaviour
- Compatibility considerations for the existing event API

## Not included

- Challenge endpoint implementation
- Reward issuing
- Collection endpoint
- Authoring endpoints
- Deck or battle endpoints
- Offline submissions
- Invented challenge formats, thresholds, or retry rules

## Acceptance criteria

- [ ] Challenge-start and answer-submission schemas are defined
- [ ] Accepted answers are absent from pre-submission responses
- [ ] Identity comes from the validated token
- [ ] Event and attempt identifiers are validated
- [ ] The browser cannot claim answer correctness
- [ ] Errors follow the existing API error model
- [ ] Expiry and retry behaviour is documented without inventing thresholds
- [ ] Supported challenge formats are linked to an approved decision or explicitly marked unresolved
- [ ] The contract states whether repeated submission is rejected or idempotent without assuming unapproved rules
- [ ] OpenAPI-compatible schemas or examples are prepared
- [ ] Reward behaviour is left to the later transaction contract

## Testing and evidence

- [ ] Player-safe example payloads are reviewed
- [ ] Examples demonstrate that accepted answers are not exposed
- [ ] Invalid identifier and malformed-answer examples are included
- [ ] `Uzair` reviews schema and transaction implications
- [ ] A security review confirms that marking secrets remain server-side
- [ ] Unresolved decisions are listed with owners

## Documentation

- [ ] Document the proposed API contract
- [ ] Document challenge authority boundaries
- [ ] Record unresolved format, expiry, retry, and explanation decisions
- [ ] Link the persistence-foundation issue
- [ ] Include an accurate AI-use declaration

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Firm Sprint 1 work remains stable
- [ ] Another team member reviews the contract
- [ ] No implementation is presented as approved without evidence
- [ ] Resulting decisions and follow-up work are recorded
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-05 — Make the database release procedure repeatable

**Gitea title:** `Make the Sprint 1 database release procedure repeatable`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Uzair — Data and Infrastructure Lead`  
**Reviewer:** `Tyron-Van-Tonder`  
**Labels:** `High Priority`, `database`, `documentation`, `testing`  
**Estimate:** `2.5 days`  
**Depends on:** `#3, #16, #18` — all complete  
**Blocks:** `S1-W2-06, #20`

```markdown
## Purpose

Provide a safe, repeatable procedure for preparing the Sprint 1 PostgreSQL/PostGIS database used by the deployed API.

## Description

Document and, where appropriate, automate the migration, readiness, and controlled seed steps required for the deployed environment. The process must distinguish schema migration from demonstration-data seeding and must not expose credentials or destructively reset production data.

The current deployment documentation explicitly identifies this procedure as outstanding.

## Included

- Production-target database readiness check
- PostGIS extension check
- Ordered migration procedure
- Controlled demonstration seed procedure
- Idempotency expectations
- Failure handling
- Verification queries or commands
- Secret-handling guidance
- Recovery and rerun guidance
- Deployment ownership and approval boundary
- Evidence from an isolated rehearsal environment

## Not included

- Destructive production reset
- Printing or committing `DATABASE_URL`
- Automatic production seeding without an explicit release decision
- Challenge, reward, card, or ownership migrations
- Provider migration
- Database backup guarantees not supported by the provider

## Acceptance criteria

- [ ] The procedure begins with a readiness check
- [ ] Migrations run in a deterministic order
- [ ] Re-running completed migrations is safe
- [ ] Demonstration seeding is a distinct, controlled step
- [ ] Re-running the existing Sprint 1 seed does not duplicate the event
- [ ] The procedure confirms that PostGIS is available
- [ ] Failure stops the release before an unhealthy API is presented as ready
- [ ] Secret values are never printed or stored in Git
- [ ] The target environment is identified before any write
- [ ] Recovery guidance avoids destructive commands
- [ ] The deployed API can read the intended seeded event after the procedure
- [ ] Responsibility for executing or approving the production step is documented

## Testing and evidence

- [ ] The procedure is rehearsed against an isolated PostgreSQL/PostGIS database
- [ ] Migration tests pass
- [ ] Seed tests pass
- [ ] Database integration tests pass
- [ ] A second migration and seed run demonstrates idempotent behaviour
- [ ] Sanitised output is attached
- [ ] `Tyron-Van-Tonder` reviews deployment and secret boundaries

## Documentation

- [ ] Update the Neon/PostGIS setup guide
- [ ] Update Azure deployment documentation
- [ ] Document migration, seed, verification, and recovery commands
- [ ] Document what remains manual
- [ ] Include an accurate AI-use declaration

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] Production writes are not performed without explicit authority
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-06 — Rehearse PostGIS deployment and eligibility recovery

**Gitea title:** `Rehearse PostGIS migration, seed, and eligibility recovery`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Uzair — Data and Infrastructure Lead`  
**Reviewer:** `Caleb_P`  
**Labels:** `High Priority`, `database`, `testing`, `documentation`  
**Estimate:** `1.5 days`  
**Depends on:** `#19, S1-W2-05`  
**Blocks:** `S1-W2-08, #20`

```markdown
## Purpose

Demonstrate that the Sprint 1 database can be recreated safely and still produce correct PostGIS eligibility results.

## Description

Use an isolated test database to rehearse readiness checking, migrations, seeding, event discovery, known-distance eligibility, and safe recovery from an interrupted or failed step.

Production verification must remain read-only unless a separate approved release procedure explicitly authorises a write.

## Included

- Fresh isolated-database setup
- Migration and seed rehearsal
- PostGIS readiness validation
- Seeded-event discovery
- Known inside-radius and outside-radius checks
- Ambiguous-boundary behaviour
- Re-running the procedure
- Safe failure and recovery notes
- Sanitised evidence for the release issue

## Not included

- Destructive production recovery
- Unapproved production writes
- Provider failover
- Load testing
- Challenge or reward tables
- New geospatial rules
- Exact campus coordinates in public evidence

## Acceptance criteria

- [ ] A fresh isolated database can be migrated and seeded using documented commands
- [ ] The seeded event is returned through the event-discovery service
- [ ] A known inside-radius claim is evaluated as reachable
- [ ] A known outside-radius claim is evaluated as unreachable
- [ ] An ambiguous accuracy envelope produces a retry result
- [ ] A second run does not duplicate the seeded event
- [ ] Failure and rerun guidance is tested
- [ ] Evidence does not expose connection strings or unnecessary coordinates
- [ ] Production verification, if performed, is read-only and clearly identified
- [ ] Results are linked to the Sprint 1 release issue

## Testing and evidence

- [ ] `npm run db:check:test --workspace @wits-world/api` passes
- [ ] `npm run db:migrate:test --workspace @wits-world/api` passes
- [ ] `npm run db:seed:test --workspace @wits-world/api` passes
- [ ] The database integration suite passes
- [ ] Sanitised command output is attached
- [ ] `Caleb_P` reviews whether the evidence is sufficient for the release checklist

## Documentation

- [ ] Add the rehearsal procedure
- [ ] Add recovery and rerun guidance
- [ ] Record known provider or free-tier limitations
- [ ] Link the evidence from #20
- [ ] Include an accurate AI-use declaration

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes for any resulting change
- [ ] Another team member reviews the evidence
- [ ] No destructive production action was taken
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-07 — Design the persistence foundation for challenges and rewards

**Gitea title:** `Design the challenge, reward, and card ownership persistence foundation`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Uzair — Data and Infrastructure Lead`  
**Reviewer:** `Tyron-Van-Tonder`  
**Labels:** `Low Priority`, `database`, `documentation`, `research`  
**Estimate:** `1 day`  
**Depends on:** `S1-W2-04`; start only when firm Sprint 1 release work is not at risk  
**Blocks:** `Future Sprint 2 challenge and reward implementation`  
**Does not block:** `#20`

```markdown
## Purpose

Define the minimum persistence boundaries needed for Sprint 2 challenge attempts, one-time rewards, and card ownership without prematurely changing the Sprint 1 production schema.

## Description

Prepare a reviewed data-model proposal and migration sequence that extends the existing event schema. Define identities, foreign-key relationships, uniqueness constraints, accepted-answer privacy, transaction boundaries, and carry-over behaviour.

This issue produces a design foundation only. Production migrations and reward logic remain separate Sprint 2 work.

## Included

- Challenge-to-event relationship
- Private accepted-answer storage boundary
- Attempt identity and lifecycle fields
- Authenticated player identity representation
- Reward relationship
- Card catalogue and player ownership relationship
- One-reward-per-player-per-event invariant
- Idempotency and concurrency constraints
- Transaction boundary proposal
- Migration ordering
- Carry-over treatment for the existing seeded event
- Unresolved retention and deletion questions

## Not included

- Production migration
- Reward issuing implementation
- Collection endpoint
- Challenge marking implementation
- Deck or battle schema
- Full author console schema
- Invented card statistics, rarities, or battle rules

## Acceptance criteria

- [ ] The proposal extends rather than rewrites the existing event model
- [ ] Accepted answers are separated from player-facing challenge data
- [ ] Attempts are linked to authenticated player identity and an event challenge
- [ ] The browser cannot provide authoritative correctness or reward fields
- [ ] A database constraint supports one reward per player per event
- [ ] The transaction boundary covers answer marking and reward issuing
- [ ] Concurrent duplicate submissions are considered
- [ ] Existing Sprint 1 event data has an explicit carry-over plan
- [ ] Retention and account-deletion questions are marked unresolved where necessary
- [ ] No production schema change is made
- [ ] The design aligns with the challenge API contract

## Testing and evidence

- [ ] An entity or relational diagram is reviewed
- [ ] Example uniqueness and transaction scenarios are documented
- [ ] A concurrent duplicate-reward scenario is considered
- [ ] Migration ordering and rollback limitations are reviewed
- [ ] `Tyron-Van-Tonder` confirms alignment with the API and security boundaries

## Documentation

- [ ] Add the proposed persistence design
- [ ] Record invariants and transaction boundaries
- [ ] Record unresolved retention and deletion decisions
- [ ] Link the challenge API contract
- [ ] Include an accurate AI-use declaration

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Firm Sprint 1 work remains stable
- [ ] Another team member reviews the design
- [ ] No proposal is described as implemented
- [ ] Follow-up Sprint 2 work is identified
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-08 — Add deterministic end-to-end coverage

**Gitea title:** `Add deterministic end-to-end coverage for the Sprint 1 vertical slice`  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Caleb_P — Documentation, End-to-End and Release Quality Lead`  
**Reviewer:** `kevin-ebrahim`  
**Labels:** `High Priority`, `testing`, `frontend`, `backend`  
**Estimate:** `2 days`  
**Depends on:** `S1-W2-02, S1-W2-03, S1-W2-06`  
**Blocks:** `#20`

```markdown
## Purpose

Provide a repeatable automated browser check showing that the Sprint 1 web, API, and database journey works as an integrated system.

## Description

Add a deterministic end-to-end test harness for the protected `/explore` journey. It should exercise the real local web and API applications against an isolated test database while controlling authentication, geolocation, and map-provider boundaries.

The test must not depend on live Auth0, live map tiles, a user's real location, or the production database.

## Included

- Project-local browser test tooling
- Documented test startup
- Isolated PostgreSQL/PostGIS test data
- Controlled authenticated test identity
- Protected-route behaviour
- Seeded-event discovery
- Mocked browser geolocation
- Reachable and unreachable API outcomes
- Permission-denied UI state
- Map-provider isolation
- Failure diagnostics and screenshots
- CI integration if stable on the available runner

## Not included

- Live Auth0 dependency
- Live map-service dependency
- Real device geolocation
- Production database writes
- Full browser matrix
- Challenge or reward testing
- Security penetration testing

## Acceptance criteria

- [ ] The test starts the real local web and API applications
- [ ] The API uses an isolated PostgreSQL/PostGIS test database
- [ ] Authentication is controlled through a documented test boundary
- [ ] The production authentication path is not silently disabled
- [ ] The test loads the seeded event into the text event list
- [ ] A mocked in-range location produces the API-authoritative reachable state
- [ ] A mocked out-of-range location produces the unreachable state
- [ ] Denied geolocation permission produces a usable explanation
- [ ] The map provider is stubbed or isolated deterministically
- [ ] The test does not call live Auth0, map, or production database services
- [ ] Failure output is useful and does not expose secrets
- [ ] The test can run locally through one documented command

## Testing and evidence

- [ ] The end-to-end suite passes from a clean installation
- [ ] Existing API, web, and documentation tests continue to pass
- [ ] The test is run twice to check repeatability
- [ ] CI execution is enabled or a specific runner blocker is documented
- [ ] Failure screenshots or traces are stored outside committed source unless deliberately required
- [ ] `kevin-ebrahim` reviews player-facing assertions

## Documentation

- [ ] Document prerequisites
- [ ] Document the exact local command
- [ ] Document mocked and real boundaries
- [ ] Document troubleshooting
- [ ] Link the test from #20
- [ ] Include an accurate AI-use declaration where required

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes or a confirmed runner limitation is recorded
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] No live secret or production data is used
- [ ] AI assistance is attributed where applicable
```

---

## S1-W2-09 — Refine the Wits Quest visual identity and frontend presentation

**Gitea title:** `Refine the Wits Quest visual identity and frontend presentation`  
**Created Gitea issue:** [#51](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51)  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `kevin-ebrahim — Product and Player Experience Lead`  
**Reviewer:** `Caleb_P`  
**Labels:** `Medium Priority`, `frontend`, `bug`, `feature`, `testing`  
**Estimate:** `2 days`  
**Depends on:** `#30, #44`  
**Blocks:** `#20`

```markdown
## Purpose

Give Wits Quest a coherent, production-ready player-facing identity and resolve confirmed visual defects without displacing the Sprint 1 location journey.

## Description

Create an original Wits Quest logo and refine the implemented player-facing interface. Inspect the current home, authentication, exploration, error, and responsive states, then fix reproducible visual bugs and inconsistencies within the established design direction.

Use the repository design system and reference material as art direction. Do not treat an unapproved reference image as final branding. Preserve the mobile-first, premium futuristic academic identity, accessible interaction states, and map-independent event information.

## Included

- Original Wits Quest logo exploration and final selected asset
- Appropriate vector or code-native master asset where practical
- Favicon and application-brand placement updates
- Visual review of the home, authentication, explore, error, and not-found states
- Fixes for confirmed spacing, alignment, overlap, wrapping, contrast, and responsive defects
- Consistent typography, colour, focus, loading, empty, and error presentation
- Checks near 360 px, 390 px, 768 px, and a normal desktop viewport
- Reduced-motion and keyboard considerations
- Before-and-after screenshots stored under `.pr-screenshots/`

## Not included

- A full design-system rewrite
- Author-console implementation
- Challenge, reward, collection, deck, or battle screens
- Unapproved Wits University marks or copyrighted assets
- Changes to API, database, authentication, or eligibility rules
- Visual changes unsupported by an observed defect or the established design direction

## Acceptance criteria

- [ ] An original logo is created and its source/master asset is preserved
- [ ] Logo variants remain legible at application-header and favicon sizes
- [ ] Any use of university names or marks follows confirmed project permissions
- [ ] The selected logo is integrated consistently into the relevant player-facing surfaces
- [ ] Confirmed visual bugs have reproduction notes and are fixed
- [ ] The player journey has no horizontal overflow at the required representative widths
- [ ] Navigation, event cards, status messages, and actions remain readable at narrow widths
- [ ] Text and controls meet the established accessibility requirements
- [ ] Keyboard focus remains visible
- [ ] Status is not communicated by colour alone
- [ ] The map-independent event list remains intact
- [ ] No browser-authoritative game decision is introduced

## Testing and evidence

- [ ] Relevant component tests are updated or added for behaviour affected by visual fixes
- [ ] Web lint, type-check, tests, and build pass
- [ ] Manual checks cover 360 px, 390 px, 768 px, and desktop
- [ ] Keyboard navigation is checked manually
- [ ] Reduced-motion behaviour is checked if motion changes
- [ ] Before-and-after screenshots are attached from `.pr-screenshots/`
- [ ] `Caleb_P` reviews responsive behaviour and release impact

## Documentation

- [ ] Update the design-system documentation with the selected logo usage
- [ ] Document logo variants and minimum-use guidance
- [ ] Record third-party or source attribution if any reference materially contributes
- [ ] Record any deferred visual defects as follow-up work
- [ ] Include an accurate AI-use declaration for submission-facing visual documentation

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes
- [ ] Another team member reviews the pull request
- [ ] The issue is linked from the pull request
- [ ] Mobile and desktop evidence is attached
- [ ] No unrelated feature work is included
- [ ] AI assistance is attributed where applicable
```

---

## #20 — Validate and release the Sprint 1 vertical slice

**Gitea title:** `Validate and release the Sprint 1 vertical slice`  
**Existing Gitea issue:** [#20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20)  
**Project column:** `Backlog`  
**Milestone:** `Sprint 1`  
**Assignee:** `Caleb_P — Documentation, End-to-End and Release Quality Lead`  
**Reviewer:** `Tyron-Van-Tonder`  
**Labels:** `Medium Priority`, `documentation`, `testing`  
**Estimate:** `1 day after dependencies are review-ready`  
**Depends on:** `#15, #17, #43, #44, #45, #47, #48, #50, #51`  
**Blocks:** `Sprint 1 milestone completion`  
**Does not depend on:** `S1-W2-04, S1-W2-07`

```markdown
## Purpose

Demonstrate that the Sprint 1 deliverables operate as one deployed player journey rather than as disconnected components.

## Description

Execute the final release checklist across authentication, event discovery, map and text presentation, geolocation, API submission, PostGIS distance evaluation, eligibility presentation, documentation, accessibility, and deployment.

Assemble the repeatable demonstration procedure and sanitised evidence required for Sprint 1 review.

Challenge and reward foundation work does not block this issue.

## Included

- End-to-end happy path
- Unauthenticated protected-access check
- Permission-denied check
- Reachable and unreachable location outcomes
- Poor-accuracy or retry outcome
- API-failure presentation
- Map-provider fallback
- Accessibility smoke check
- Responsive checks
- Database release evidence
- Deployment smoke tests
- Documentation review
- Demonstration script
- Sprint evidence index
- Known-limitations list
- Release checklist

## Not included

- Challenge or reward testing
- Complete user-research study
- Full penetration testing
- Load testing
- Production-readiness certification
- Sprint 2 card, deck, or battle work

## Acceptance criteria

- [ ] The deployed web application communicates with the deployed API
- [ ] An authenticated player can complete the target Sprint 1 journey
- [ ] An unauthenticated protected API request returns 401
- [ ] The seeded event is loaded from PostgreSQL/PostGIS
- [ ] Reachable and unreachable claims produce different visible outcomes
- [ ] Permission denial produces a usable state
- [ ] Poor or ambiguous accuracy produces a safe retry state
- [ ] The map has a usable text-based fallback
- [ ] The public documentation site is available
- [ ] The deterministic end-to-end test passes
- [ ] Main-branch CI and deployment checks pass
- [ ] No known severe defect remains open
- [ ] All four members have meaningful version-control contributions
- [ ] Sprint evidence is organised and linked
- [ ] AI usage is attributed according to course policy

## Testing and evidence

- [ ] API, database, web, documentation, and end-to-end checks pass
- [ ] Deployment smoke-test results are attached
- [ ] Screenshots or a recording show the complete journey
- [ ] Accessibility results distinguish automated and manual checks
- [ ] Mobile and desktop evidence is attached
- [ ] Field-test findings are linked
- [ ] Security-boundary findings are linked
- [ ] Database rehearsal evidence is linked
- [ ] The evidence index links issues, pull requests, tests, decisions, deployments, and relevant meetings
- [ ] Evidence contains no tokens, secrets, or unnecessary precise coordinates

## Documentation

- [ ] Publish the test procedure
- [ ] Publish the demonstration script
- [ ] Publish known limitations
- [ ] Update architecture documentation to match implementation
- [ ] Update setup and deployment instructions
- [ ] Link the public documentation URL
- [ ] Record AI usage for generated, edited, or reviewed material

## Completion requirements

- [ ] Acceptance criteria are satisfied
- [ ] Relevant automated tests pass
- [ ] Full relevant verification commands have been run
- [ ] CI passes on the release commit
- [ ] Another team member reviews the release
- [ ] Issues and pull requests are linked
- [ ] Documentation is deployed
- [ ] Follow-up defects are recorded
- [ ] The Sprint 1 demonstration can be repeated from the documentation
- [ ] The project card moves to `Done` only after merge and verification
- [ ] AI assistance is attributed where applicable
```

`S1-W2-*` values are planning identifiers for Gitea issues #43–#51, not issue
numbers themselves.

---

The preceding document was planned, generated, and edited with the assistance
of: Codex-CLI[GPT-5].
