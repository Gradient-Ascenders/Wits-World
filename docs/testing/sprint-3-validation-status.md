---
title: 'Sprint 3 validation status'
---

# Sprint 3 validation status

**Evidence snapshot:** repository `main` at `c0fd42b`, 28 September 2026,
for feedback-report implementation context. The focused automated evidence
below is from PR #329 re-review at `babc534`, now merged. These are separate
revisions and evidence boundaries.

This page records supplied/observed results, not a fresh release audit. The
[testing strategy](./testing-strategy.md) and
[automated verification guide](./automated-verification.md) describe test
boundaries and procedures; a procedure is not a result. Current CI, deployment,
nightly state, and coverage artifacts have not been verified here.

## User feedback evidence

The [Sprint 3 feedback report](./sprint-3-user-feedback-results.md) records 15
CSV submissions dated 28 September 2026. Three submissions have identical
answer sets. The export does not establish unique participants, consent,
session dates, device/browser, tested release, or observed task results. The
report proposes six findings. Only two submissions exercised reconnect, and
only one exercised Author package/review. Those counts are denominators for
limited self-report signals, not population failure rates or follow-up results.

The report's links to implementation at `c0fd42b` give repository context;
they do not establish the tested version, post-feedback causality, a fix, or a
participant retest. Follow-up tasks and privacy/provenance handling are defined
in the [Sprint 3 user-testing plan](./sprint-3-user-testing-plan.md).

## Focused PR #329 review evidence

At PR #329 review revision `babc534`, the observed checks were:

| Scope                            | Observed result                                              | Boundary                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL integration           | 3 selected tests passed; 6 skipped; 9 total in the selection | `node run-review-db.mjs` wrapper invoked Vitest on `tests/account-deletion-persistence.integration.test.ts` with `--maxWorkers 1 --testTimeout 30000` and `-t 'physically deletes the account                                                                                           | purges expired trust snapshots | preserves a bounded formal trust case'`. This covers physical account removal, active-player retention, and historical-actor retention scenarios only. |
| API tests                        | 28 tests passed across five files                            | `tests/account-deletion-coordinator.test.ts`, `tests/account-deletion-lifecycle.test.ts`, `tests/account-deletion-retry-processor.test.ts`, `tests/account-deletion-retry-scheduler.test.ts`, and `tests/trust-restrictions.test.ts`; focused deletion/retry/restriction coverage only. |
| API TypeScript                   | Passed                                                       | Type-check result for the reviewed change, not the whole release.                                                                                                                                                                                                                       |
| Changed-test lint and formatting | Passed                                                       | ESLint and Prettier checks on changed test files only.                                                                                                                                                                                                                                  |

This is narrow evidence for PR #329, not validation of the whole Advanced
release, live PvP, Ranked, territory, trading, automatic placement, trust
review, analytics, developer API, or the complete user journey. It is not a
claim that tests were run during this documentation task.

## Coverage rubric and artifacts

Milestone 3 rubric section 3.3, pages 10-11, assigns Automated Testing 10%.
Its strongest band requires coverage **greater than 60% across all
codebases**. The strict inequality matters: exactly 60% does not meet that
wording. Other rubric weights are feedback 10%, feature 20%, API 20%,
performance 5%, improvement 5%, documentation 15%, and methodology 15%; the
[Sprint 3 overview](../sprint-3-overview.md) contains the full rubric map.

Configured coverage thresholds are not measured coverage artifacts:

| Codebase/configuration          | Configured thresholds                                                                                                           | Actual current coverage artifact          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| API                             | Statements 60%, lines 60%, functions 60%, branches 50%                                                                          | No verified current number in this record |
| `game-rules`                    | Statements 85%, lines 85%, functions 95%, branches 80%                                                                          | No verified current number in this record |
| Docs and `account-policy`       | 100% configured                                                                                                                 | No verified current number in this record |
| Web (`apps/web/vite.config.ts`) | Statements 75%, branches 70%, functions 80%, lines 80%; V8 coverage includes `src/**/*.{ts,tsx}` and excludes declaration files | No verified current number in this record |

Do not infer rubric attainment from thresholds, test counts, a passing type
check, or a documentation build. To claim the strongest band, collect and
retain actual coverage reports for every rubric-relevant codebase on a named
revision, identify included/excluded files consistently, and verify that each
required aggregate is strictly above 60%. This status page does not request or
claim a suite rerun.

## Documentation verification

The Sprint 3 documentation working tree on `docs/sprint-3-stakeholder-reviews`
was checked locally on 28 September 2026:

| Command                                           | Result                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run test --workspace @wits-world/docs`       | 5 tests passed across 3 files, including complete sidebar coverage |
| `npm run lint --workspace @wits-world/docs`       | Passed                                                             |
| `npm run type-check --workspace @wits-world/docs` | Passed                                                             |
| `npm run build --workspace @wits-world/docs`      | Production build passed with broken-link checks enabled            |
| `git diff --check`                                | Passed                                                             |

These results validate the documentation site, not gameplay, deployed services,
product coverage, or participant outcomes. No API/database suites were run for
this documentation-only change.

## CI, deployment, and other gates

The repository's [automated verification guide](./automated-verification.md)
documents configured pull-request database and Basic E2E procedures. The local
documentation results above do not establish current CI/deployment state.
No current CI run, deployment, nightly result, or
production smoke check is asserted here. Consult the relevant run/artifact and
record its exact revision before reporting one.

## Remaining evidence gaps

- Obtain task observations and denominator-aware retests for the six proposed
  feedback findings, especially intentional reconnect and dedicated Author
  review tasks.
- Exercise live PvP, ranked seasons, territory, trade consequences, automatic
  placement, trust review, analytics/developer API, and retained core journeys
  on a named build with appropriate test roles.
- Capture current coverage artifacts across all codebases before making a
  Milestone 3 strongest-band claim.
- Verify the relevant current CI, deployment, and any required operational
  gates independently; none is established by the focused PR review tests or
  older docs-only checks.

## AI declaration

This status page was drafted with assistance from Codex-CLI[gpt-6-luna] and
reviewed and edited with Codex-CLI[gpt-6-sol]. It distinguishes the supplied PR-review observations and
feedback report from procedures and unverified current release state.
