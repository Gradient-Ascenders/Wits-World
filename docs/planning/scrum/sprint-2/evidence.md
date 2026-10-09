---
title: Sprint 2 evidence
description: Dated delivery, verification, and remaining acceptance evidence.
sidebar_position: 1
toc_max_heading_level: 2
---

# Sprint 2 evidence

These are dated repository records, not a current release audit. Read the
[Sprint report](report.md) for the sprint narrative and [user feedback](feedback.md)
for the collected findings and retest limits. Implementation, automated results,
and deployed acceptance remain separate.

### Updated questionnaire charts

The original Google Forms questionnaire now shows **12 responses per question**
in the [supplied chart snapshot](feedback.md#google-forms-chart-snapshot).
The earlier CSV contained ten responses and underpins the original five issue
decisions. The updated chart counts are presented alongside those findings;
the charts do not show the additional response dates or tested build and do not
establish participant retests. The dated release evidence below is unchanged.

The [written questionnaire excerpts](feedback.md#written-feedback-screenshots)
support the battle, deck, event, quiz, and first-time guidance findings, with
unchanged screenshots and verbatim transcripts. Six show their question totals;
the two battle crops do not. Question totals and visible comments are kept
separate, without treating them as additional participants or retests.

The main feedback review now uses one focused comment crop per finding. All
original charts and written transcripts remain in its single
[Full survey evidence](feedback.md#full-survey-evidence) section.

### Implementation follow-up — 9 October

The [finding-by-finding implementation review](feedback.md#prioritised-findings)
now links merged changes, pinned source, and **165 passing local tests** at
application revision `d0d716b`. It includes later battle, deck, and Explore
improvements; it does not backdate them into Sprint 2. The 14 September
matrix below remains historical, including the implementation gaps recorded then.
Participant retests and deployed performance remain unverified by this update.

## Features

**Snapshot:** 14 September 2026, against main revision `9a2f941`.

This matrix connects the team's requirements to implementation references and
remaining acceptance evidence. The course's _COMS3011A Project Brief_, section
2.7, describes the campus exploration, trivia, collectible-card, and battle loop;
it does not enumerate the detailed Wits Quest tier rules. Tier assignments below
come from the linked team requirements and Gitea decisions. The rubric's
Advanced/Intermediate/Basic **marking bands** are not product feature tiers.

**Implemented** means the referenced source/contracts exist in this revision.
It does not mean every deployed or participant check passed. Use the
[dated test and release snapshot](#verification) for
execution evidence and the [decision register](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/docs/requirements/basic-tier-decision-register.md)
for the full BASIC-01–19 decisions.

### Basic and cross-project requirements

| Requirement                                          | Repository status and evidence                                                                                                                                                                                              | Remaining acceptance boundary                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Registration, login, password reset, deletion        | Implemented Auth0 and account lifecycle; [rules](../../../requirements/basic-game-rules.md#roles-authority-and-account-lifecycle), [account validation](#account-lifecycle-evidence); issues #160/#161 closed               | Provider email, recent-authentication and deletion smoke evidence                   |
| Event discovery and location eligibility             | Implemented map and semantic list; [location journey](../../../requirements/player-location-journey.md), [spatial rules](../../../database/event-eligibility.md)                                                            | Real-campus device/accuracy checks; reported location is not proof of presence      |
| Five-question challenge and completed review         | Implemented server timers, marking and answer privacy; [rules](../../../requirements/basic-game-rules.md#event-challenge), [attempt contract](../../../architecture/challenge-attempt-api-contract.md)                      | Full deployed journey and quiz/reward usability follow-up                           |
| Reward, collection and starter cards                 | Implemented atomic card rewards and owned-copy persistence; [persistence](../../../database/challenge-reward-persistence-design.md), [Basic test journey](../../../testing/automated-verification.md#basic-journey)         | Deployed retry/recovery and player comprehension                                    |
| Complete card catalogue and move rules               | Migration 0041 supplies the 30-card ordinary catalogue and four moves per Creature; [catalogue](../../../design/basic-card-roster.md); #164 closed                                                                          | Confirm deployed migration/content, presentation and balance review                 |
| Saved decks and CPU battles                          | Implemented [deck journey](../../../requirements/player-deck-building-journey.md), [CPU journey](../../../requirements/player-cpu-battle-journey.md), [battle rules](../../../requirements/basic-game-rules.md#cpu-battles) | Feedback #240–#244 retests; deck-validation integration evidence remains incomplete |
| Author workflow                                      | Implemented review/publication, multiple-choice and ordering editors; [Author contract](../../../architecture/author-curation-api-contract.md)                                                                              | Independent content review and deployed role/workflow checks                        |
| Responsive and accessible experience                 | [Accessibility](../../../design/design-system.md), semantic/component tests and browser checks described in [testing strategy](../../../testing/testing-strategy.md)                                                        | Recorded real-device, keyboard and screen-reader acceptance                         |
| Separate frontend/backend and hand-written API       | React/Vite, Fastify and PostgreSQL/PostGIS; [architecture](../../../architecture/overview.md), [API](../../../api-reference.md), [database](../../../database/overview.md)                                                  | External/public reachability is recorded separately from authenticated gameplay     |
| External integration, CI/CD and public documentation | [Integration boundaries](../../../architecture/external-integrations.md), [CI](../../../testing/continuous-integration.md), [deployment](../../../deployment/azure-deployment-setup.md)                                     | Service/operator evidence; this documentation branch must be published              |

### Intermediate systems and additional delivered work

| Area                                             | Repository status and evidence                                                                                                                                                                                                         | Remaining limitation                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Ordering challenges                              | Implemented persistence, API, player interaction and Author editor; #162/#163 closed; [attempt](../../../architecture/challenge-attempt-api-contract.md) and [Author contracts](../../../architecture/author-curation-api-contract.md) | Real participant and deployed checks remain separate                                                               |
| Progression, achievements, streaks and standings | Implemented; #171–#173 closed; [rules](../../../requirements/player-progression-rules.md), [persistence](../../../database/player-progression-persistence.md)                                                                          | Deployed acceptance and privacy review                                                                             |
| Three-copy card evolution                        | Backend and collection UI implemented; #174/#175 closed; [evolution rules](../../../requirements/card-evolution-rules.md)                                                                                                              | Saved-deck locks, concurrency and UI evidence are in the linked reference; participant acceptance remains separate |
| Coins, selling and shop                          | Deferred by #193; [progression decision](../../../requirements/player-progression-rules.md)                                                                                                                                            | Do not present old selling issue titles or checked boxes as a shipped sale API                                     |
| Ordered trails and nearby discovery              | Implemented; #176/#177 closed; [rules](../../../requirements/ordered-trails-rules.md), [persistence](../../../database/ordered-trails-persistence.md)                                                                                  | On-campus trail acceptance                                                                                         |
| Asynchronous PvP                                 | Implemented polling, invitations and server deadlines; [journey](../../../requirements/player-asynchronous-pvp-journey.md), [contract](../../../architecture/asynchronous-pvp-api-contract.md)                                         | Not live synchronous PvP; deployed two-player and timeout evidence                                                 |
| Offline challenges                               | Implemented local persistence and authoritative reconciliation; [offline contract](../../../architecture/offline-challenge-play.md)                                                                                                    | Device/storage/service-worker and reconnect acceptance; offline client state does not grant rewards                |
| Movement and attempt checks                      | Implemented bounded movement evidence and checks; #168/#169 closed; [movement evidence](../../../database/movement-evidence.md)                                                                                                        | Real-device false-positive testing; no claim of spoof-proof presence                                               |
| Poor-GPS alternative proof                       | Unimplemented; closing #170 did not deliver alternative proof                                                                                                                                                                          | No approved/deployed independent fallback is claimed                                                               |
| Ten events and one hundred questions             | Repeatable, sourced content pack and validations exist; #165 closed; [content reference](../../../database/verified-event-content.md)                                                                                                  | Independent factual/presentation review and controlled production seeding                                          |
| Campaigns and question analytics                 | Additional implemented contracts; [campaigns](../../../architecture/campaign-scheduling-api-contract.md), [analytics](../../../database/question-performance-analytics.md)                                                             | These are additional scope, not evidence that all Advanced features are complete                                   |

### Release decision

[Release issue #167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
was open at this audit. No blanket claim that the complete Basic or Intermediate
tier has passed acceptance is made. Closed issues, merged implementation,
automated checks and participant acceptance are distinct evidence.

## Verification

**Audit date:** 14 September 2026 (Africa/Johannesburg).

**Application revision:** `9a2f941f97bcc43f6dba056e49293af9dc554013` on `main`.

This page records observed and previously documented results. It is separate
from the [testing strategy and policy](../../../testing/testing-strategy.md),
[automated procedure](../../../testing/automated-verification.md), and
[testing strategy](../../../testing/testing-strategy.md#manual-and-field-validation). A procedure is not a test result.

### CI and deployment evidence — 14 September

Read-only Gitea commit-status inspection returned the following successful jobs
for the revision above. Times are SAST on 14 September; job links contain the
logs and detailed checks. This audit did not rerun those application suites.

| Job                               | Recorded result | Evidence                                                                                                |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| Application builds                | Success, 22:06  | [Run 595 build](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/2)           |
| Static analysis                   | Success, 22:07  | [Run 595 static analysis](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/0) |
| Application tests with coverage   | Success, 22:08  | [Run 595 tests](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/1)           |
| Repository/application validation | Success, 22:08  | [Run 595 validation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/3)      |
| API deployment                    | Success, 22:08  | [Run 595 API deployment](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/5)  |
| Web deployment                    | Success, 22:08  | [Run 595 web deployment](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/595/jobs/6)  |
| Documentation deployment          | Success, 22:06  | [Run 596 docs deployment](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/596/jobs/0) |

The last successful docs deployment above predates this documentation update.
A local docs build does not publish it. The update must reach `main` and the
[documentation deployment](../../../testing/continuous-integration.md#documentation-publishing) must succeed.

### Public endpoint checks during this audit

Unauthenticated HTTP GETs returned **200** for:

- [Live application](https://witsworld.co.za).
- [API health](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/health).
- [OpenAPI JSON](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/json).
- [Public documentation](https://wits-world-docs.pages.dev).

These checks establish public reachability at the audit time. They do not prove
the served revision, successful authentication, database migration state,
correct gameplay, external API operation, or participant acceptance. The
[API reference](../../../api-reference.md) documents the interactive API
and authentication; [external integrations](../../../architecture/external-integrations.md)
records Auth0 and Mapbox usage and authority boundaries.

### Teammate-recorded local release evidence — 13 September

Validation target: `06db4a7a7e48bdfb188612206ccce3203471d391`. Caleb's
record was imported from commit `0e911d6`; these checks have not been rerun
for this consolidation and are separate from the 14 September CI snapshot.
The statement below that documentation had no tests describes that revision.
The site now has navigation/configuration tests.

Results below were collected on 13 September 2026 SAST. Do not use a localhost
result in the deployed column. The local toolchain was Node `24.19.0` and npm
`11.17.0`; npm was below the repository's declared `11.18.0` version and was
not changed during validation.

| Boundary                                | Command or URL                                          | Target                                                | Date/time | Result                        | Evidence or limitation                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- | --------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format                                  | `npm.cmd run format:check -- --end-of-line auto`        | Local checkout                                        | 13 Sep    | Passed                        | All matched files use Prettier code style                                                                                                                                                 |
| Lint                                    | `npm.cmd run lint`                                      | Local checkout                                        | 13 Sep    | Passed                        | API, docs, Web, account-policy, and game-rules workspaces completed with zero warnings                                                                                                    |
| Type check                              | `npm.cmd run type-check`                                | Local checkout                                        | 13 Sep    | Passed                        | All five workspaces completed                                                                                                                                                             |
| Root tests                              | `npm.cmd test`                                          | Local checkout                                        | 13 Sep    | Passed                        | Deployment 3/3; API 1,020 passed and 276 database-gated skipped; Web 607/607; account-policy 16/16; game-rules 28/28; docs had no test files and exited successfully                      |
| Basic E2E                               | `npm.cmd run test:e2e:basic`                            | Configured test PostgreSQL/PostGIS plus local Web/API | 13 Sep    | Passed                        | Guarded test target; 44 migrations already applied, five Basic seeds applied, Playwright 7/7 in 4.2 minutes, including the canonical 21-step journey and six responsive/failure scenarios |
| Database suite, run 1                   | `npm.cmd run test:database --workspace @wits-world/api` | Configured remote test PostgreSQL/PostGIS; one worker | 13 Sep    | Failed/inconclusive           | 24/27 files and 245 tests passed; 31 skipped after one 45-second setup hook timeout and Neon DNS `EAI_AGAIN`; duration 3,253.69 seconds; no assertion failure was established             |
| Database suite, unchanged run 2         | Same command                                            | Same target; one worker                               | 13 Sep    | Failed/inconclusive           | Neon hostname returned `EAI_AGAIN` throughout: 27 files failed, seven tests failed during connection setup, 269 skipped; duration 13.33 seconds                                           |
| Build, including docs                   | `npm.cmd run build`                                     | Local checkout                                        | 13 Sep    | Passed                        | API, Docusaurus, Web/Vite/PWA, and shared packages built; non-fatal Docusaurus update-check, Vite chunk-size, and deprecation warnings remained                                           |
| Diff whitespace                         | `git diff --check`                                      | Local checkout                                        | 13 Sep    | Passed at evidence update     | Re-run at handoff after final formatting                                                                                                                                                  |
| Public Web                              | `https://witsworld.co.za/`                              | Deployed public boundary                              | 13 Sep    | HTTP 200 HTML                 | Reachability only; not an authenticated journey and no release-SHA match was established                                                                                                  |
| API health                              | Azure API `/health`                                     | Deployed public boundary                              | 13 Sep    | HTTP 200 JSON                 | Returned safe `status: ok`, service name, and a request ID; database readiness is not asserted by this route                                                                              |
| OpenAPI UI/document                     | Azure API `/documentation` and `/documentation/json`    | Deployed public boundary                              | 13 Sep    | HTTP 200                      | UI returned HTML; JSON reported OpenAPI 3.0.3, title `Wits World API`, version 0.0.0, and 78 paths                                                                                        |
| Public documentation                    | `https://wits-world-docs.pages.dev/docs/`               | Deployed public boundary                              | 13 Sep    | HTTP 200 HTML                 | Site reachable; the new #167 pages are local and were not deployed                                                                                                                        |
| Missing/invalid authentication failures | Azure API `GET /api/v1/events`                          | Deployed public boundary                              | 13 Sep    | HTTP 401 safe problem         | Missing and synthetic-invalid bearer cases returned `WWW-Authenticate: Bearer`, `UNAUTHORIZED`, request IDs, and did not echo the synthetic token                                         |
| Unknown-route failure                   | Azure API `GET /api/v1/issue-167-not-found`             | Deployed public boundary                              | 13 Sep    | HTTP 404 safe problem         | Returned `NOT_FOUND` with the shared safe problem keys and request ID                                                                                                                     |
| Authenticated Basic journey             | Registration through completed CPU history              | Deployed paired Web/API/database                      | 13 Sep    | **Pending manual evidence**   | No safe production account/authentication context was available; no authenticated deployed action was attempted                                                                           |
| CI and release gate                     | Gitea Actions run links                                 | Remote automation                                     | 13 Sep    | **Pending external evidence** | No workflow was triggered or inspected as a result for this uncommitted branch                                                                                                            |

The public checks used read-only HTTP requests and made no deployment or Gitea
change. They establish point-in-time reachability, not that Web, API, database,
and docs correspond to commit `06db4a7a...` or pass the authenticated failure
journey.

### Existing detailed results

- [Battle responsiveness](#battle-responsiveness) summarises dated measurements
  and links the complete repository investigation. Keep each result attached to
  its recorded change; do not add
  counts across different revisions or describe them as tonight's full suite.
- [User-feedback results](feedback.md) preserves the original ten-response CSV
  findings and adds the updated twelve-response Google Forms charts.
  Five findings were accepted. #240/#241 have PR #245
  implementation evidence; #242 has partial scope evidence. #243/#244 lacked
  linked post-feedback change/retest evidence in the report. All require
  participant follow-up; closure alone does not fill that gap.
- [Stakeholder reviews](#meeting-evidence-map) link dated
  records with evaluation, decisions and evidence limits. The 11 September
  record explicitly distinguishes earlier UI work from a feedback-caused change.
- [Testing strategy](../../../testing/testing-strategy.md) defines procedures
  and manual gates; it is not a blanket passing release report.

### Known failures and remaining acceptance work

The team supplied a nightly-verification failure log: package checks, database
readiness and migrations passed, but database integration tests failed after
approximately 55 minutes. The supplied excerpt has no run ID or exact revision,
so it is not assigned to the current commit. It is unresolved evidence here;
main CI success does not establish that the separate nightly gate passed.
See [automated verification](../../../testing/automated-verification.md) for the configured
separate gates and diagnostic artifacts.

[Release-validation issue #167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167)
remained open at audit time. The outstanding evidence includes:

1. At least five genuine observed player sessions required by #167, with anonymised task, device, release, and limitation records. The ten questionnaire responses do not supply those observed sessions.
2. Named-deployment registration through completed CPU history, including failure recovery.
3. Participant retests for accepted feedback and implementation traceability for deck/first-time guidance.
4. Real-campus reported-location and trail checks, plus representative device/accessibility checks.
5. Auth0 recovery/email/deletion operator checks and confirmation of production migration/content state.
6. Itemised stakeholder follow-up; independent content factual/presentation review.

The documentation preparation does not fabricate or silently complete these checks.

### Reproduce the relevant checks

Use [testing strategy](../../../testing/testing-strategy.md) for exact commands and boundaries,
[CI](../../../testing/continuous-integration.md) for workflow jobs, and
[Basic E2E](../../../testing/automated-verification.md#basic-journey) for the integrated test setup.
Database tests require the documented isolated test target; do not point them
at production. Record revision, command, result and environment with every new
result. Keep secrets and participant data out of public logs.

### Database review — 4 September {/* #database-review--4-september */}

The review against `9dbc2dd` inspected repository persistence code and read-only
Neon metadata, with migrations through `0035`. It retained relational ownership,
foreign keys, meaningful nullable state, and immutable migration history.
Migration `0036_remove_duplicate_indexes.sql` removes six exact duplicate
standalone indexes while retaining their constraint-backed equivalents. Their
measured combined size was **90,112 bytes (88 KiB)**. This is a modest
maintenance/storage improvement, not a production load benchmark or an
explanation of provider-billed storage.

Local verification on 4 September passed formatting, lint, type checking,
workspace tests, builds, and **237 tests across 23 opt-in database suites** on
disposable PostgreSQL 16.15/PostGIS 3.4.2 databases, with no Neon test writes.
Initial setup/fixture failures were corrected before that complete run. The
toolchain was Node 24.15.0/npm 11.12.1; npm was below the required 11.18.0
minimum and emitted an engine warning. These results do not establish CI,
production migration execution, or deployed retention checks.

The [4 September stakeholder record](../../stakeholder-interactions/2026-09-04-database-usage-review.md)
retains the feedback and technical motivation. Current schema and deployment
guidance remain in the [database reference](../../../database/overview.md) and
[release procedure](../../../database/database-release-procedure.md).

### Accessibility checks — 24 September {/* #accessibility-checks--24-september */}

The preferences implementation added checks for local persistence, storage
failure, motion resolution, and read-aloud controls. Browser checks covered
Account, Collection, and CPU battle at 390, 768, and 1440 px, plus Home at
390 px, with 150% interface size and optional contrast, reading, font, and
speech preferences enabled.

| Recorded date     | Check                                                  | Result |
| ----------------- | ------------------------------------------------------ | ------ |
| 24 September 2026 | Focused Web component tests                            | Pass   |
| 24 September 2026 | Account experience Playwright scenarios                | Pass   |
| 24 September 2026 | Explore read and 3D control placement at 100% and 150% | Pass   |

These are recorded automated/component/browser checks. The source record does
not identify a release commit. It contains no completed real-device or
screen-reader assessment; those manual acceptance gaps remain open. The
[testing strategy](../../../testing/testing-strategy.md#manual-and-field-validation)
retains the required review scope.

## Account lifecycle evidence

The #160/#161 record describes server-authoritative deletion, immediate access
locking and retry-safe cleanup. Component, API and database coverage accompany
controlled Auth0/API browser fixtures at **390×844** and **1280×800**, checking
keyboard cancellation, focus, explicit confirmation, recovery and safe errors.
The record gives no execution date, so these are not new dated run results.

Real recovery email, provider behaviour, recent-authentication claims,
Management API permissions and production logout remained operator checks.
Fixture coverage is not real Auth0 or production-deletion acceptance. The
[full repository record](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/docs/testing/player-account-lifecycle-validation.md)
preserves the test scope and remaining checks.

## Battle responsiveness

[PR #245](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/pulls/245)
added illegal-actor regression coverage, made controls follow server-returned
turn/action state, avoided unchanged-identity writes, and batched CPU history.
These changes address the reported turn ambiguity and slow battles; participant
retests remain separate from implementation proof in [user feedback](feedback.md#prioritised-findings).

**Measured locally on 12 September 2026:** unchanged-identity median fell from
**738 ms to 185 ms** in five alternating warm runs against a disposable database.
Three-match history with 79 rounds fell from **83 queries to 3** and
**16,360 ms to 579 ms** in a read-only transaction, with identical serialized
responses. A separate simulated-delay fixture fell from **64 queries to 3**;
it is not the same dataset or a production benchmark.

Later changes added a history column and an identity lock, so the original
timings do not describe the final implementation. `Server-Timing` separates
authentication, identity and server work, not browser transport; detailed spans
can overlap and must not be summed. No signed-in deployed click-to-result
comparison was recorded. The [full repository investigation](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/commit/01a364f8af736f5de8f5ffb66b3d7b3bc7a5bfa6/docs/testing/api-battle-responsiveness.md)
retains the measurements, regressions and follow-ups. Historical measurements
were not rerun for this consolidation.

## Meeting evidence map

Source: _COMS3011A Project Brief_, section 3.2, printed pages 9–10, supplied by
Kevin for this audit. The weights below match the original Milestone 2 rubric.
This is an evidence guide, not a predicted grade or claim that every band is met.

| Criterion                      | Weight | Open during the meeting                                                                                                                                                                                                                                                                                        | Evidence boundary                                                                                                          |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Core features                  | 25%    | [Feature matrix](#features), [Basic reference](../../../basic-release-reference.md)                                                                                                                                                                                                                            | Demonstrate deployed behaviour; implementation alone does not establish the permitted bug count                            |
| Automated testing              | 10%    | [Dated results](#verification), [testing strategy](../../../testing/testing-strategy.md)                                                                                                                                                                                                                       | UI/API coverage and specific results; outstanding nightly and manual gates remain visible                                  |
| Stakeholder reviews            | 10%    | [Meeting 2 — Database & hosting](../../stakeholder-interactions/2026-09-04-database-usage-review.md), [Meeting 3 — Trails & card artwork](../../stakeholder-interactions/2026-09-08-trails-and-card-art-review.md), [Meeting 4 — Frontend UI](../../stakeholder-interactions/2026-09-11-frontend-ui-review.md) | Records distinguish feedback, evaluation, changes and missing follow-up                                                    |
| API                            | 15%    | [API reference/OpenAPI](../../../api-reference.md), [external integrations](../../../architecture/external-integrations.md)                                                                                                                                                                                    | Public API docs and implemented integrations; HTTP reachability is not an authenticated end-to-end pass                    |
| User feedback                  | 10%    | [testing strategy](../../../testing/testing-strategy.md#manual-and-field-validation), [actual results and issue/change trail](feedback.md)                                                                                                                                                                     | Original CSV: 10 responses; updated charts: 12; five accepted findings; retests incomplete                                 |
| Project methodology            | 10%    | [Project/Git methodology](../../project-and-git-methodology.md)                                                                                                                                                                                                                                                | Show actual issues/PRs and recorded meetings; process documentation alone is insufficient                                  |
| Bug tracker                    | 5%     | [Work/bug tracking](../../work-tracking-and-issue-management.md), [Gitea issues](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues)                                                                                                                                                                  | Tracker is authoritative; old planning checkboxes are not live status                                                      |
| Database documentation         | 5%     | [Schema and relationship guide](../../../database/overview.md), [deployment](../../../database/neon-postgis-setup.md), [migrations](../../../database/database-release-procedure.md), [database technology](../../../architecture/technology-stack.md#postgresql-postgis-and-pg)                               | Distinguish schema reference from proof of production migration/recovery                                                   |
| Third-party code documentation | 5%     | [Software/services and motivations](../../../architecture/technology-stack.md#application-stack)                                                                                                                                                                                                               | Direct dependencies, supporting tooling and unused declarations are distinguished; transitive inventory is in the lockfile |
| Testing documentation          | 5%     | [Policy and procedures](../../../testing/testing-strategy.md), [CI](../../../testing/continuous-integration.md), [participant procedures](../../../testing/testing-strategy.md#manual-and-field-validation)                                                                                                    | Procedures and completed results are separate pages                                                                        |

Also keep [AI-use declarations](../../ai-use.md) and
[deployment/setup](../../../deployment/azure-deployment-setup.md) available.

## AI declaration

Prepared and reviewed with assistance from Codex-CLI[GPT-6], using the supplied
course brief, repository source/documents and read-only Gitea evidence.

Page title clarified with assistance from Codex-CLI[GPT-6].

Prepared with assistance from Codex-CLI[GPT-6]. CI states and public HTTP results
were inspected during this audit; historical test and feedback evidence is
attributed to its existing record rather than claimed as freshly executed.

Historical #167, database-review, and accessibility results consolidated with assistance from Codex[GPT-6]. Original database measurements/results used Codex[GPT-5]; accessibility implementation records used Codex-CLI[GPT-6]. No new application, device, production, or participant checks are claimed.

This reading guide was prepared with assistance from Codex-CLI[GPT-6] using
existing repository records. It adds navigation, not new acceptance evidence.

Sprint report links updated with assistance from Codex[GPT-6].

Public evidence consolidated with assistance from Codex[GPT-6]. Historical
results, source revisions, original attributions, and acceptance limits are
preserved; no checks were rerun for this consolidation.

The twelve-response Google Forms chart snapshot was linked with assistance
from Codex[GPT-6], preserving the original dated release results and issue decisions.

The 9 October implementation follow-up was linked with assistance from
Codex[GPT-6]. Its focused local results are separate from the historical
release audit and do not establish deployment or participant acceptance.

Written feedback excerpts linked with assistance from Codex[GPT-6], without
changing the historical response counts or acceptance record.

Additional written questions and plain-language finding links incorporated with
assistance from Codex[GPT-6], preserving cropped-response and retest limitations.

Focused-comment layout and full-source links added with assistance from
Codex[GPT-6]; original source images and response counts remain unchanged.
