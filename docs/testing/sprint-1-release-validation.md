# Sprint 1 release validation

## Purpose and release target

This is the authoritative repository-side procedure for
[issue #20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20). It
validates one deployed player journey: authenticate, open `/explore`, load the
published seeded event from PostgreSQL/PostGIS, use both map and text
presentation, submit a one-shot browser location claim, and display the API's
reachable, unreachable, retry, or unavailable result.

Challenge, reward, card, deck, CPU-battle, author-console, load, penetration,
and production-certification testing are outside this Sprint 1 release scope.

## Evidence classes

- **Automated checks** are repeatable commands run against local code and a
  dedicated disposable test database.
- **Manual checks** require a deployed Auth0 session, real browser/device,
  visual or keyboard judgement, production operations, or current Gitea state.
- **Dependency evidence** is linked rather than recreated. It is not a pass
  when its own results remain unrecorded.

## Prerequisites

- Use the Node.js and npm versions required by `CONTRIBUTING.md`; run `npm ci`.
- Configure only the ignored local environment files. Never print or commit
  tokens, passwords, connection strings, or precise player coordinates.
- For the deterministic suite, use a dedicated disposable PostGIS
  `TEST_DATABASE_URL` and install Playwright Chromium as described in
  [the E2E guide](sprint-1-deterministic-e2e.md).
- For deployed checks, use the documented public URLs and a safe Auth0 test
  player. Do not manufacture a token or weaken authentication.
- Store screenshots or recordings outside Git, for example
  `../Wits-World-evidence/issue-20/`, and attach only sanitised evidence to
  Gitea.

## Automated local procedure

Run from the repository root:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
npm run build --workspace @wits-world/docs
npm run test:e2e:sprint1
npm run test:e2e:sprint1
```

Run the focused Explore evidence when diagnosing or recording the required
non-happy states:

```bash
npm test --workspace @wits-world/web -- --run tests/explore-page.test.tsx tests/exploration.test.tsx
npm test --workspace @wits-world/api -- --run tests/authentication.integration.test.ts tests/events.integration.test.ts tests/cors.integration.test.ts tests/event-database.integration.test.ts
```

Expected evidence includes protected-route `401` handling, event discovery,
reachable and unreachable text, permission denial, geolocation timeout,
accuracy and stale-location retry, eligibility API failure, and the event list
surviving map failure. The deterministic E2E must pass twice and prove the
React/Fastify/PostGIS path using its disposable database.

The normal `npm test` command intentionally skips database-gated suites. For
this release validation, the complete 11-file database integration selection
from the API workspace's `test:database` script was run on Windows by setting
`RUN_DATABASE_INTEGRATION_TESTS=true` only in the current PowerShell process and
invoking those Vitest files directly. It passed all 106 tests against uniquely
named temporary databases derived from the ignored disposable test
configuration. This is local test evidence, not a production database release.

Repository-wide formatting currently has a clean-branch Windows line-ending
baseline that must be recorded separately. Do not run a repository-wide format
rewrite; every file changed for #20 must pass Prettier individually.

For this validation branch, the pre-edit `npm run format:check` exited `1` and
reported 276 unchanged files. After targeted formatting of the seven changed
Markdown files it still exits `1`, now reporting 273 unchanged files. The
changed-file Prettier check passes.

## Safe deployed smoke procedure

Make read-only requests and record timestamp, release SHA, path, status, and a
safe response summary:

| Target | Request                                      | Expected result               |
| ------ | -------------------------------------------- | ----------------------------- |
| API    | `GET /health`                                | `200`; service is healthy     |
| API    | `GET /api/v1/`                               | `200`; versioned API responds |
| API    | `GET /api/v1/events` without `Authorization` | `401`; route is protected     |
| Web    | `GET /`, `/about`, `/explore`                | `200` HTML for each SPA route |
| Docs   | `GET /` and this guide after deployment      | `200` HTML                    |

A `200` for `/explore` proves only that the SPA route is served. It does not
prove authentication or Web-to-API communication.

### Branch smoke record — 18 August 2026

These read-only checks establish public availability at validation time; they
are not the required post-merge release-SHA checks.

| URL/path                                                 | Result               | Safe interpretation                                            |
| -------------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| API `/health`                                            | `200`, JSON          | API health endpoint responded.                                 |
| API `/api/v1/`                                           | `200`, JSON          | Versioned API root responded.                                  |
| API `/api/v1/events`, no bearer token                    | `401`, JSON          | Protected event discovery rejected an unauthenticated request. |
| Web `/`, `/about`, `/explore`                            | `200`, HTML for each | Public SPA and direct routes were served.                      |
| Documentation `/`                                        | `200`, HTML          | Public documentation site was available.                       |
| Documentation `/docs/testing/sprint-1-deterministic-e2e` | `200`, HTML          | Existing Sprint 1 E2E documentation was deployed.              |

## #20 acceptance matrix — branch validation

| #   | Criterion                                                  | Status                     | Evidence or remaining gate                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Deployed Web communicates with deployed API                | **MANUAL REQUIRED**        | Separate public Web/API availability passed, but a production Auth0 session and sanitised browser network evidence are required.                                                                                                              |
| 2   | Authenticated player completes target journey              | **MANUAL REQUIRED**        | Follow the deployed player journey below with a safe test player.                                                                                                                                                                             |
| 3   | Unauthenticated protected API request returns `401`        | **PASS — deployed/public** | Public `GET /api/v1/events` returned `401`; API authentication/event/CORS integration tests also cover it.                                                                                                                                    |
| 4   | Seeded event loads from PostgreSQL/PostGIS                 | **PASS — automated/local** | `event-database.integration.test.ts` and two deterministic E2E runs exercise the disposable PostGIS database. Production seed evidence remains manual.                                                                                        |
| 5   | Reachable and unreachable claims differ visibly            | **PASS — automated/local** | Explore component tests and deterministic E2E assert distinct text and real API/PostGIS outcomes.                                                                                                                                             |
| 6   | Permission denial is usable                                | **PASS — automated/local** | Explore component test and deterministic E2E retain event discovery and show an explanation.                                                                                                                                                  |
| 7   | Poor/ambiguous accuracy gives safe retry                   | **PASS — automated/local** | Explore and API event integration tests assert `location_accuracy` and stale/future retry states. Gitea #43 is closed, but its repository field-test record has no real-device results; that evidence discrepancy remains a #20 closure gate. |
| 8   | Map has usable text fallback                               | **PASS — automated/local** | `exploration.test.tsx` keeps the event list/actions available on provider failure and timeout. Manual deployed visual evidence remains required.                                                                                              |
| 9   | Public documentation is available                          | **PASS — deployed/public** | Root and existing deterministic-E2E route returned `200`; this new package requires post-merge deployment verification.                                                                                                                       |
| 10  | Deterministic E2E passes                                   | **PASS — automated/local** | Two consecutive `npm run test:e2e:sprint1` runs passed, 2 tests each.                                                                                                                                                                         |
| 11  | Main CI and deployment checks pass                         | **MANUAL REQUIRED**        | Cannot pass before merge; link exact main validation and triggered deployment runs afterward.                                                                                                                                                 |
| 12  | No known severe defect remains open                        | **MANUAL REQUIRED**        | Confirm current Gitea has no open P0/P1/severe blocker immediately before closure.                                                                                                                                                            |
| 13  | Four members have meaningful version-control contributions | **MANUAL REQUIRED**        | Git history shows commits under Kevin, Tyron, Uzair, and Caleb names, with multiple aliases; a team reviewer must confirm identity mapping and meaningful contribution.                                                                       |
| 14  | Sprint evidence is organised and linked                    | **MANUAL REQUIRED**        | This package organises repository evidence, but reviewed external screenshots, recordings, meetings, dependency attachments, and final run links still need to be added to #20.                                                               |
| 15  | AI use is attributed under course policy                   | **PASS — automated/local** | Changed submission-facing release documents name ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-5]; final commit needs the matching trailer.                                                                                                          |

## Authenticated manual player journey

1. Record the deployed Web and API origins and expected release SHA without
   exposing environment values. Sign in through production Auth0 with the safe
   test player and open protected `/explore`.
2. Confirm the seeded Great Hall event appears in the accessible text list and
   on the map. In browser network tools, record only sanitised host/path/status
   evidence showing the Web called the deployed API.
3. Before selecting **Check reachability**, confirm no geolocation prompt or
   eligibility request occurs.
4. From a safe position well inside the event area, grant permission and record
   either the expected reachable result or an honest accuracy retry.
5. From a safe position clearly outside the area, record the visibly distinct
   unreachable result.
6. Reset site permission, deny the next request, and confirm the explanation,
   retry action, and text event list remain usable without an eligibility call.
7. In a safe difficult-positioning condition, confirm poor/ambiguous accuracy
   asks for a fresh reading rather than guessing or accusing. Select **Check
   again** and confirm it makes one new request.
8. Using browser request blocking or an approved non-production fault-injection
   method, block the eligibility request. Confirm the safe API-failure message
   and retry action; do not alter production services.
9. Block the Mapbox provider request locally in the browser. Confirm the map
   fallback explains the failure and the text event list and reachability
   control remain usable.
10. Sign out and confirm protected navigation no longer exposes the player
    journey.

If live geolocation is unsuitable during a demonstration, show the reviewed
real-device evidence and run the deterministic E2E. Do not use development
location overrides against production as if they were field evidence.

## Accessibility and responsive procedure

Automated component tests establish semantic status/alert text, accessible
action names, and map-independent event discovery. They do not establish visual
quality or real keyboard/device behaviour.

Manually check approximately 360 px, 390 px, 768 px, and a normal desktop width:

- no accidental horizontal overflow; readable text and usable event list;
- usable touch targets and controls;
- keyboard-only operation with visible focus;
- status conveyed with text, not colour alone;
- understandable permission and retry messages;
- event discovery and reachability without the map; and
- reduced-motion behaviour where applicable.

Record sanitised mobile and desktop screenshots plus a short keyboard/focus
note. Link reviewed evidence from issues
[#44](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/44) and
[#51](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/51) when it
exists; do not invent an attachment URL.

## Database, security, and documentation evidence

- Follow the operator-run [database release procedure](../database/database-release-procedure.md).
  Local migration tests do not prove production migration or seed execution.
- Link the reviewed, sanitised
  [PostGIS recovery rehearsal](../database/postgis-recovery-rehearsal.md)
  evidence from [#48](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/48).
- Link the deployed Auth0/CORS/location-privacy review from
  [#45](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/45).
  CORS is not authentication.
- Build the Docusaurus site locally, check links/navigation, and after merge
  verify the Cloudflare Pages deployment.
- Review the [known limitations](sprint-1-known-limitations.md),
  [evidence index](sprint-1-evidence-index.md), and
  [demonstration script](sprint-1-demonstration-script.md).

## Release checklist

- [ ] Local lint, type-check, tests, builds, focused tests, and two consecutive
      deterministic E2E runs pass.
- [ ] Changed files pass targeted Prettier; the pre-existing global baseline is
      recorded honestly.
- [ ] Public API, Web, and documentation smoke checks are recorded.
- [ ] Authenticated deployed journey and Web-to-API call are recorded.
- [ ] Reachable, unreachable, denied, poor-accuracy, API-failure, and map-failure
      outcomes have sanitised evidence.
- [ ] Manual keyboard, focus, mobile, tablet, and desktop evidence is reviewed.
- [ ] Field-test findings, security review, database procedure, and recovery
      rehearsal evidence are linked.
- [ ] Although Gitea #43 is closed, its actual external field evidence is
      linked and reviewed, threshold interpretation is confirmed, and the empty
      repository results record is updated if appropriate or tracked as a
      follow-up discrepancy.
- [ ] Current Gitea confirms no open P0/P1/severe blocker.
- [ ] Git history is mapped to the four human team members and meaningful
      contributions are confirmed.
- [ ] Every evidence item is linked from #20 and contains no secrets or
      unnecessary precise coordinates.
- [ ] AI use is declared accurately.
- [ ] Another team member reviews the release PR and evidence.

## After the PR merges

1. Confirm the exact merge/release SHA and successful main validation.
2. Confirm Web/API deployment jobs if their path filters triggered; a docs-only
   change is not evidence of a fresh application deployment.
3. Confirm `docs-deploy.yml` succeeded and this package is publicly reachable.
4. Repeat all public smoke checks and the authenticated manual journey against
   the deployed SHA.
5. Add final CI, deployment, screenshots/recording, review, dependency, and
   severe-defect links to #20 and the evidence index or a concise issue comment.
6. Record follow-up defects. Move the project card to Done and close #20 only
   after every manual gate is satisfied.

## AI declaration

This document was planned and reviewed with assistance from
ChatGPT-Web[GPT-5.6 Sol] and generated and edited with assistance from
Codex[GPT-5].
