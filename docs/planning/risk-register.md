# Initial Risk Register

## Purpose

This register records the principal technical, product, security, delivery, and
collaboration risks identified for Wits World.

The register should be reviewed throughout the project. New risks should be
added when discovered, and material risks should be linked to a Gitea issue or
architecture decision.

## Rating approach

### Likelihood

- **Low** — unlikely during the project;
- **Medium** — reasonably possible;
- **High** — likely without active mitigation.

### Impact

- **Low** — limited inconvenience or minor rework;
- **Medium** — threatens an issue, feature, or milestone criterion;
- **High** — threatens a core journey, milestone, security boundary, or final
  submission.

## Risk register

| ID   | Risk                                                                                                               | Likelihood | Impact | Owner           | Mitigation and response                                                                                                  | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| R-01 | Unresolved client requirements are embedded as fixed implementation decisions                                      | Medium     | High   | Member 1        | Record decisions, unresolved questions, and follow-up actions; avoid hard-coding unconfirmed thresholds                  | Open   |
| R-02 | Authentication-provider selection is delayed or incompatible with the React and Fastify architecture               | Medium     | High   | Member 2        | Compare providers early; verify SPA integration, token validation, account lifecycle, cost, issuer, and audience support | Open   |
| R-03 | Access tokens or private authentication credentials are exposed in browser code, logs, screenshots, or Git         | Medium     | High   | Member 2        | Separate public and private configuration; review environment files; redact evidence; test logging behaviour             | Open   |
| R-04 | The browser is trusted to supply identity or protected game results                                                | Medium     | High   | Member 2        | Derive identity from validated tokens; validate all requests; reject client-authoritative fields                         | Open   |
| R-05 | Browser geolocation is inaccurate, stale, denied, unavailable, or manipulated                                      | High       | High   | Members 1 and 2 | Treat location as a claim; validate coordinates, accuracy, and timestamps; provide safe retry and failure states         | Open   |
| R-06 | Event-radius, accuracy, and freshness thresholds are unsuitable for real campus conditions                         | High       | High   | Members 1 and 3 | Keep thresholds configurable; conduct device and field testing; record values as provisional until reviewed              | Open   |
| R-07 | PostGIS is unavailable or inconsistently configured across development, testing, and deployment                    | Medium     | High   | Member 3        | Provide repeatable setup, readiness checks, migration tests, and documented provider requirements                        | Open   |
| R-08 | Incorrect geospatial type, coordinate order, reference system, or distance unit produces wrong eligibility results | Medium     | High   | Member 3        | Document coordinate conventions and metres; add known-distance tests; review PostGIS queries                             | Open   |
| R-09 | The selected database host lacks suitable PostGIS, connection, storage, or free-tier support                       | Medium     | High   | Member 3        | Evaluate providers early; verify PostGIS explicitly; record limits and migration options                                 | Open   |
| R-10 | Web and API contracts diverge during parallel development                                                          | Medium     | High   | Member 2        | Use versioned routes, runtime schemas, OpenAPI, shared safe contracts, and integration tests                             | Open   |
| R-11 | CORS or authentication configuration differs between local and deployed environments                               | Medium     | High   | Members 2 and 3 | Use environment-based allowed origins; document redirect URLs, issuer, audience, and deployment configuration            | Open   |
| R-12 | The web application and API become tightly coupled and cannot be built or deployed independently                   | Low        | High   | Members 2 and 4 | Maintain separate workspaces, builds, environment files, API boundaries, and deployment checks                           | Open   |
| R-13 | Map tile or style provider licensing, attribution, rate limits, or availability blocks deployment                  | Medium     | Medium | Member 1        | Evaluate licensing early; display attribution; retain a text event fallback; keep provider replaceable                   | Open   |
| R-14 | The map becomes the only way to discover events, creating accessibility and failure problems                       | Medium     | High   | Member 1        | Maintain an accessible text-based event list and status messages independent of the map                                  | Open   |
| R-15 | CI runner configuration or deployment credentials delay collaboration and external demonstration                   | Medium     | High   | Members 3 and 4 | Establish CI early; store secrets outside Git; test failing and successful workflows; document manual recovery           | Open   |
| R-16 | Local Node.js, npm, or dependency versions differ across team members                                              | Medium     | Medium | Member 4        | Pin and document versions; use clean installs; ensure CI uses the same runtime expectations                              | Open   |
| R-17 | Tests pass in isolation but the deployed vertical journey fails                                                    | Medium     | High   | Member 4        | Add deployment smoke tests and end-to-end validation across the deployed web, API, authentication, and database          | Open   |
| R-18 | Duplicate reward submissions later issue the same event reward more than once                                      | Medium     | High   | Members 2 and 3 | Use idempotency, unique constraints, transactions, and concurrency tests during reward implementation                    | Open   |
| R-19 | Accepted challenge answers or author-only data are exposed to players                                              | Medium     | High   | Member 2        | Define player-safe response schemas; separate author routes; add exposure tests and object-level authorisation           | Open   |
| R-20 | Card, deck, and battle rules remain unresolved too late for implementation                                         | Medium     | High   | Member 4        | Resolve and document deterministic rules before Sprint 2 implementation; keep rules pure and testable                    | Open   |
| R-21 | The team begins intermediate or advanced features before completing the Basic journey                              | Medium     | High   | Member 1        | Apply the stretch-feature gate; review roadmap and critical issues during planning                                       | Open   |
| R-22 | Documentation diverges from the implemented architecture                                                           | Medium     | Medium | All members     | Include documentation updates in the Definition of Done and review documentation during pull requests                    | Open   |
| R-23 | Insufficient stakeholder, meeting, testing, or Scrum evidence reduces milestone marks                              | Medium     | High   | Member 1        | Maintain linked minutes, issue activity, review evidence, test results, screenshots, decisions, and evidence indexes     | Open   |
| R-24 | AI-generated content or code is incorrect, unverified, or missing attribution                                      | Medium     | High   | All members     | Review all AI-assisted work; include required document declarations, README declarations, and assisted commit trailers   | Open   |
| R-25 | Team members work on overlapping files and create avoidable merge conflicts                                        | Medium     | Medium | All members     | Use short-lived issue branches, coordinate ownership, pull latest changes, and keep pull requests focused                | Open   |
| R-26 | Reduced development time later in the semester threatens completion                                                | High       | High   | All members     | Complete architecture and blockers early; prioritise Basic vertical slices; avoid unnecessary scope expansion            | Open   |
| R-27 | A team member does not have meaningful version-control contributions                                               | Low        | High   | Member 1        | Assign accountable issue ownership and ensure all members contribute reviewed commits                                    | Open   |
| R-28 | Location or identity data is retained longer or more precisely than necessary                                      | Medium     | High   | Member 2        | Define retention and deletion behaviour; minimise stored precision; restrict access; avoid continuous tracking           | Open   |
| R-29 | Account deletion conflicts with audit, match, or reward integrity                                                  | Medium     | High   | Members 2 and 3 | Define deletion and anonymisation rules before implementation; document retained records and privacy implications        | Open   |
| R-30 | Free-tier hosting inactivity, quotas, or service limits interrupt demonstrations                                   | Medium     | High   | Member 3        | Record service limitations; add pre-demonstration smoke checks; maintain repeatable deployment and recovery steps        | Open   |

## Highest-priority risks

The following risks require active attention during Sprint 1:

1. **R-01** — unresolved stakeholder requirements;
2. **R-02** — authentication-provider selection;
3. **R-03** — credential or token exposure;
4. **R-05** — unreliable browser geolocation;
5. **R-06** — unsuitable location thresholds;
6. **R-07** — PostGIS environment inconsistency;
7. **R-10** — web and API contract divergence;
8. **R-15** — CI and deployment delays;
9. **R-17** — deployed integration failure;
10. **R-24** — incorrect or unattributed AI-assisted work.

## Risk-review process

The team should review this register:

- during sprint planning;
- during sprint review;
- after client or lecturer feedback;
- when a risk becomes active;
- before selecting a hosting or authentication provider;
- before the milestone demonstration; and
- before final submission.

For each active high-impact risk, the team should:

1. identify a responsible owner;
2. create or link a Gitea issue where action is required;
3. record the mitigation;
4. record evidence that the mitigation was tested;
5. update the risk status.

## Status values

Use:

- **Open** — identified but not yet resolved;
- **Mitigating** — active work is reducing the risk;
- **Accepted** — the team has consciously accepted the remaining exposure;
- **Closed** — the threat has been resolved or is no longer applicable;
- **Occurred** — the risk became an issue and requires response work.

## Review history

| Date       | Review                      | Participants | Outcome                                          |
| ---------- | --------------------------- | ------------ | ------------------------------------------------ |
| 2026-08-06 | Initial risk identification | Member 2     | Initial register created for architecture review |

Further reviews should be added without removing the historical entries.

---

The preceding document was planned and generated with the assistance of:
ChatGPT-Web[GPT-5.6 Thinking].
