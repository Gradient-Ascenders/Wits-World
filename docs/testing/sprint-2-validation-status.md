---
title: Sprint 2 test and release status
---

# Sprint 2 test and release status

**Audit date:** 14 September 2026 (Africa/Johannesburg).

**Application revision:** `9a2f941f97bcc43f6dba056e49293af9dc554013` on `main`.

This page records observed and previously documented results. It is separate
from the [testing strategy and policy](testing-strategy.md),
[automated procedure](automated-verification.md), and
[user-testing plan](sprint-2-user-testing-plan.md). A procedure is not a test result.

## Current CI and deployment evidence

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
[documentation deployment](../development/documentation-site.md) must succeed.

## Public endpoint checks during this audit

Unauthenticated HTTP GETs returned **200** for:

- [Live application](https://witsworld.co.za).
- [API health](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/health).
- [OpenAPI JSON](https://witsworld-api-a4awdtdahbbkh8g4.southafricanorth-01.azurewebsites.net/documentation/json).
- [Public documentation](https://wits-world-docs.pages.dev).

These checks establish public reachability at the audit time. They do not prove
the served revision, successful authentication, database migration state,
correct gameplay, external API operation, or participant acceptance. The
[API reference](../architecture/api-overview.md) documents the interactive API
and authentication; [external integrations](../architecture/external-integrations.md)
records Auth0 and Mapbox usage and authority boundaries.

## Teammate-recorded local release evidence — 13 September

The [#167 evidence record](basic-release-validation-167.md) supplies detailed
commands, environments and results for `06db4a7a...`, committed by Caleb in
`0e911d6` and integrated into this documentation branch. This is earlier local
evidence, not a fresh run or a result for the main revision above.

| Check                    | Recorded result                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Root tests               | API 1,020 passed / 276 database-gated skipped; Web 607 passed; account-policy 16 passed; game-rules 28 passed; deployment tests 3 passed |
| Basic browser E2E        | 7/7 passed in 4.2 minutes, including the canonical 21-step journey and six responsive/failure scenarios                                  |
| Static checks and build  | Passed, with non-fatal build warnings recorded at source                                                                                 |
| Remote database run 1    | Failed/inconclusive: 245 tests passed, 31 skipped; setup timeout and Neon DNS failures                                                   |
| Unchanged database rerun | Failed/inconclusive: connection-setup failures and 269 skipped tests; no passing database release gate established                       |

The source record also contains public-boundary checks and prepared
[player-session](basic-release-player-session.md),
[accessibility](basic-release-accessibility-matrix.md),
[stakeholder-review](basic-release-stakeholder-review.md) and
[follow-up finding](basic-release-findings.md) templates. Unfilled templates are
not completed acceptance evidence.

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

1. Named-deployment registration through completed CPU history, including failure recovery.
2. Participant retests for accepted feedback and implementation traceability for deck/first-time guidance.
3. Real-campus reported-location and trail checks, plus representative device/accessibility checks.
4. Auth0 recovery/email/deletion operator checks and confirmation of production migration/content state.
5. Itemised stakeholder follow-up; independent content factual/presentation review.

The documentation preparation does not fabricate or silently complete these checks.

## Reproduce the relevant checks

Use [testing strategy](testing-strategy.md) for exact commands and boundaries,
[CI](continuous-integration.md) for workflow jobs, and
[Basic E2E](basic-tier-deterministic-e2e.md) for the integrated test setup.
Database tests require the documented isolated test target; do not point them
at production. Record revision, command, result and environment with every new
result. Keep secrets and participant data out of public logs.

## AI declaration

Prepared with assistance from Codex-CLI[GPT-6]. CI states and public HTTP results
were inspected during this audit; historical test and feedback evidence is
attributed to its existing record rather than claimed as freshly executed.
