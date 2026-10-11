---
title: 'Sprint 2 test results and release status'
---

# Sprint 2 test results and release status

**Audit date:** 14 September 2026 (Africa/Johannesburg).

**Application revision:** `9a2f941f97bcc43f6dba056e49293af9dc554013` on `main`.

This page records observed and previously documented results. It is separate
from the [testing strategy and policy](testing-strategy.md),
[automated procedure](automated-verification.md), and
[user-testing plan](sprint-2-user-testing-plan.md). A procedure is not a test result.

## CI and deployment evidence — 14 September

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
[documentation deployment](continuous-integration.md#documentation-publishing) must succeed.

## Public endpoint checks during this audit

Unauthenticated HTTP GETs returned **200** for:

- [Live application](https://witsworld.co.za).
- [API health](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/health).
- [OpenAPI JSON](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/json).
- [Public documentation](https://wits-world-docs.pages.dev).

These checks establish public reachability at the audit time. They do not prove
the served revision, successful authentication, database migration state,
correct gameplay, external API operation, or participant acceptance. The
[API reference](../api-reference.md) documents the interactive API
and authentication; [external integrations](../architecture/external-integrations.md)
records Auth0 and Mapbox usage and authority boundaries.

## Teammate-recorded local release evidence — 13 September

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

## Existing detailed results

- [API and battle responsiveness](api-battle-responsiveness.md) records dated
  measurements, focused test counts, browser scenarios, fixes, reruns and
  limitations. Keep each result attached to its recorded change; do not add
  counts across different revisions or describe them as tonight's full suite.
- [User-feedback results](sprint-2-user-feedback-results.md) records ten formal
  questionnaire responses and five accepted findings. #240/#241 have PR #245
  implementation evidence; #242 has partial scope evidence. #243/#244 lacked
  linked post-feedback change/retest evidence in the report. All require
  participant follow-up; closure alone does not fill that gap.
- [Stakeholder reviews](../sprint-2-overview.md#meeting-evidence-map) link dated
  records with evaluation, decisions and evidence limits. The 11 September
  record explicitly distinguishes earlier UI work from a feedback-caused change.
- [Basic release validation](basic-tier-release-validation.md) defines the
  integrated journey and manual gates; it is not a blanket passing release report.

## Known failures and remaining acceptance work

The team supplied a nightly-verification failure log: package checks, database
readiness and migrations passed, but database integration tests failed after
approximately 55 minutes. The supplied excerpt has no run ID or exact revision,
so it is not assigned to the current commit. It is unresolved evidence here;
main CI success does not establish that the separate nightly gate passed.
See [automated verification](automated-verification.md) for the configured
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

## Reproduce the relevant checks

Use [testing strategy](testing-strategy.md) for exact commands and boundaries,
[CI](continuous-integration.md) for workflow jobs, and
[Basic E2E](automated-verification.md#basic-journey) for the integrated test setup.
Database tests require the documented isolated test target; do not point them
at production. Record revision, command, result and environment with every new
result. Keep secrets and participant data out of public logs.

## Database review — 4 September {/* #database-review--4-september */}

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

The [4 September stakeholder record](../planning/stakeholder-interactions/2026-09-04-database-usage-review.md)
retains the feedback and technical motivation. Current schema and deployment
guidance remain in the [database reference](../database/overview.md) and
[release procedure](../database/database-release-procedure.md).

## Accessibility checks — 24 September {/* #accessibility-checks--24-september */}

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
[acceptance checklist](basic-tier-release-validation.md#deployed-and-manual-acceptance)
and [formal testing plan](sprint-2-user-testing-plan.md#accessibility-and-device-review)
retain the required review scope.

## AI declaration

Prepared with assistance from Codex-CLI[GPT-6]. CI states and public HTTP results
were inspected during this audit; historical test and feedback evidence is
attributed to its existing record rather than claimed as freshly executed.

Page title clarified with assistance from Codex-CLI[GPT-6].

Historical #167, database-review, and accessibility results consolidated with assistance from Codex[GPT-6]. Original database measurements/results used Codex[GPT-5]; accessibility implementation records used Codex-CLI[GPT-6]. No new application, device, production, or participant checks are claimed.
