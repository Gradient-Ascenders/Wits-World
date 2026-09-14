---
title: 'Basic release test results (#167)'
---

# Basic release test results (#167)

## Evidence status

This is the canonical working record for
[#167](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/167),
`S2-09`. It separates evidence that exists from evidence that still requires a
person, real device, campus visit, stakeholder decision, deployed credentials,
CI run, or release operation. Preparing this package does not complete the
issue.

The validation target prepared on 13 September 2026 is commit
`06db4a7a7e48bdfb188612206ccce3203471d391`. Replace or supplement that value
with the exact deployed release identifier before recording deployed results.

| Evidence class                       | Status at package creation                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository inspection                | Completed for the Basic journey, existing test strategy, release/deployment procedures, accessibility policy, field protocol, account flow, and issue dependencies |
| Automated/local validation           | Static checks, root tests, build, and deterministic Basic E2E passed; the remote database gate remains inconclusive because of setup timeout/DNS failures below    |
| Participant sessions                 | **Pending manual evidence** — no session is claimed by this record                                                                                                 |
| Accessibility and real-device checks | **Pending manual evidence** except for specifically named automated checks                                                                                         |
| Campus geolocation                   | **Pending manual evidence** — browser geolocation is not proof of physical presence                                                                                |
| Stakeholder review                   | **Pending manual evidence** — no decision is confirmed by this record                                                                                              |
| Deployed authenticated journey       | **Pending manual evidence** unless a dated deployed run is added below                                                                                             |
| Findings and retests                 | Empty until observations are genuinely recorded; do not infer “none” from an empty register                                                                        |

## Integration with the Sprint 2 meeting evidence

The execution table below is the teammate-recorded **13 September** evidence for
`06db4a7a...`, imported from commit `0e911d6`. It has not been rerun as part of
the documentation integration. Preserve its dates, skipped-test counts and
inconclusive database outcomes. In particular, its statement that the docs had
no tests describes that revision; this branch now includes sidebar coverage tests.

For **14 September main** CI/deployment and public reachability observations,
read the [Sprint 2 test and release snapshot](sprint-2-validation-status.md).
Do not transfer a local result from one revision into the other revision's CI record.

The package-creation rows above and gap analysis below describe the original
preparation snapshot. Subsequent repository evidence includes:

- [Ten questionnaire responses and five accepted findings](sprint-2-user-feedback-results.md),
  with issue/change traceability and outstanding participant retests. These are
  questionnaire responses, not five documented observed sessions using this script.
- Dated stakeholder records for [4 September](../planning/stakeholder-interactions/2026-09-04-database-usage-review.md),
  [8 September](../planning/stakeholder-interactions/2026-09-08-trails-and-card-art-review.md)
  and [11 September](../planning/stakeholder-interactions/2026-09-11-frontend-ui-review.md).
  They are existing review evidence, not completed rows in the new release-review template.

The [follow-up finding register](basic-release-findings.md), player-session,
accessibility and stakeholder templates support the remaining #167 work. Empty
rows mean those specific follow-ups have not been recorded; they do not erase
existing feedback or mean the product has no known findings.

## Package-creation acceptance-criteria gap analysis

| #167 criterion                                                   | Existing evidence                                                                                                                           | Can be generated in the current checkout                            | Manual or external evidence still required                                                                                | Known product blocker                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Test script exists before sessions                               | [Sprint 2 user-testing plan](sprint-2-user-testing-plan.md) and the issue-specific [player session script](basic-release-player-session.md) | Documentation build and link validation                             | Use the script before every counted session                                                                               | None identified in preparation                          |
| Participant count and limitations recorded                       | Privacy and consent rules already exist                                                                                                     | Session IDs and empty result structure                              | At least five real sessions with dates, limitations, and task outcomes                                                    | No evidence yet; criterion remains open                 |
| Every actionable finding disposed                                | Established severity and Gitea workflow; [finding register](basic-release-findings.md)                                                      | Prepare the register                                                | Classify genuine findings and record accepted, postponed, rejected-with-reason, or unresolved disposition                 | Cannot be evaluated before sessions/review              |
| Accepted Critical/High findings fixed and retested               | Regression and retest conventions exist                                                                                                     | Run relevant tests for any in-scope fix                             | Human retest and genuine issue/fix references where applicable                                                            | No finding may be invented to satisfy this row          |
| Deployed registration through completed CPU history demonstrated | Deterministic local Playwright journey covers identity through stored CPU history; account documentation covers production Auth0 boundaries | Run local E2E if a safe disposable `TEST_DATABASE_URL` exists       | Real deployed registration, sign-in, challenge/reward, collection/deck, completed CPU match, history, and logout evidence | Local E2E cannot clear this criterion                   |
| Public OpenAPI and docs reachable                                | API registers `/documentation`; Docusaurus has a public deployment workflow                                                                 | Perform read-only public reachability checks and record status/date | Recheck after the target release deploy; verify content matches the release                                               | Reachability alone does not prove full deployed journey |
| No known severe defect blocks Basic                              | Focused suites and deterministic journey provide executable regression evidence                                                             | Run all available release checks and classify failures              | Participant, accessibility, field, stakeholder, deployed smoke, and final review evidence                                 | Cannot be concluded while required evidence is pending  |
| Anonymised task results and representative screenshots attached  | Repository defines sanitisation and ignored screenshot storage                                                                              | Prepare naming and capture guidance                                 | Capture real, consented, sanitised evidence; attach through the authorised review workflow                                | Face photographs are neither needed nor requested       |
| Stakeholder notes and resulting issues linked                    | Governance and issue lifecycle are documented                                                                                               | Prepare the review table and finding IDs                            | Conduct review; create Gitea issues only for genuine accepted/unresolved actionable findings                              | No stakeholder response is claimed                      |
| Final CI, deployment, and smoke outcomes recorded                | Workflows and deployment procedures exist                                                                                                   | Record local outcomes only                                          | Link actual CI run, release/deployment identifier, operator evidence, and deployed smoke results                          | A workflow definition is not a run result               |
| Affected documentation updated                                   | Existing docs cover rules, APIs, setup, testing, and deployment                                                                             | Update only evidence/process docs justified by #167                 | Record future product/documentation changes through genuine findings                                                      | No unrelated redesign is in scope                       |

## Package and evidence locations

| Evidence                                           | Record                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Participant script and per-session task table      | [Basic player validation script](basic-release-player-session.md)                                                              |
| Accessibility, device, input, and viewport results | [Accessibility and device matrix](basic-release-accessibility-matrix.md)                                                       |
| Campus and geolocation runs                        | [Location eligibility field-test protocol](../requirements/location-eligibility-field-test.md#milestone-2-and-issue-167-reuse) |
| Stakeholder topics and decisions                   | [Stakeholder review record](basic-release-stakeholder-review.md)                                                               |
| Findings, disposition, fixes, and retests          | [Finding and disposition register](basic-release-findings.md)                                                                  |
| Local, CI, deployed, and smoke outcomes            | This document                                                                                                                  |

## Participant-session index

The issue requires at least five genuine anonymised sessions. Create one
sanitised record per completed session from the
[Basic player validation script](basic-release-player-session.md) and retain it
under `docs/testing/evidence/issue-167/player-sessions/<session-id>.md`, for
example `P01.md`. Treat the script as a source template: do not overwrite one
shared completed copy between participants. Keep raw consent-controlled notes
outside the repository and link only the sanitised per-session record and safe
evidence here.

| Anonymous session ID | Date                        | Tested release/deployment   | Broad device/browser/context | Overall task completion/result | Limitations                 | Finding IDs                 | Evidence/session-record reference |
| -------------------- | --------------------------- | --------------------------- | ---------------------------- | ------------------------------ | --------------------------- | --------------------------- | --------------------------------- |
| P01                  | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**  | **Pending manual evidence**    | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**       |
| P02                  | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**  | **Pending manual evidence**    | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**       |
| P03                  | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**  | **Pending manual evidence**    | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**       |
| P04                  | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**  | **Pending manual evidence**    | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**       |
| P05                  | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**  | **Pending manual evidence**    | **Pending manual evidence** | **Pending manual evidence** | **Pending manual evidence**       |

Add rows only for additional real sessions. The index must never contain names,
emails, student numbers, exact locations, or unnecessary demographics.

Raw consent records, credentials, tokens, exact coordinates, precise movement
history, participant names, student numbers, emails, and unredacted account data
must remain outside the repository. Store temporary screenshot candidates under
`.pr-screenshots/issue-167/<session-or-run-id>/`; that directory is ignored.
Before attaching a representative screenshot, confirm that it shows the named
task/status, release context where safe, and no face, precise coordinate,
credential, token, developer-tool output, or unnecessary account data. Record
only its final attachment or repository-relative reference in the relevant
table.

## Automated and deployed evidence

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

## Release conclusion

Release conclusion: **not yet validated for release**. Existing questionnaire
and stakeholder records must be considered alongside the package, while the
unrecorded observed sessions and acceptance checks remain open. The package and local
automation can reduce uncertainty, but #167 remains open until the required
participant, accessibility, campus, stakeholder, deployed journey, finding,
retest, CI, and reviewer evidence genuinely supports its acceptance criteria.

No claim that “no known severe defect blocks the Basic journey” belongs here
until the finding register has been reviewed after all required evidence is
collected.

## AI declaration

This evidence structure and gap analysis were generated and edited with the
assistance of Codex[GPT-5]. The AI did not participate in player sessions,
campus testing, stakeholder review, deployment, or CI and supplied no manual
test result.

Sprint 2 evidence integration assisted by Codex-CLI[GPT-6]; original run results preserved.

Page title clarified with assistance from Codex-CLI[GPT-6].
