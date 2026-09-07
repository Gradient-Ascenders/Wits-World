---
title: Automated database, package, and Basic E2E verification
---

# Automated database, package, and Basic E2E verification

Issue `#166` adds one fail-closed verification path for the shared packages,
PostgreSQL/PostGIS migrations and integration suites, and the deterministic
Basic Playwright journey. It uses existing npm targets and the existing
`TEST_DATABASE_URL`; it does not introduce or permit a production fallback.

## Verification matrix

| Behaviour                                                         | Pull request                                          | Nightly                                               | Release gate                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Trigger                                                           | Every pull request targeting `main`                   | `00:00` UTC (`02:00` SAST) each day                   | Manual dispatch from the exact candidate ref, with profile `release` |
| Formatting, lint, types, application coverage, docs tests, builds | Required in `pr-validation.yml`                       | Relies on the latest PR/main result; not duplicated   | Relies on the candidate's required PR/main result; not duplicated    |
| `account-policy` package test script                              | Explicitly required                                   | Explicitly required                                   | Explicitly required                                                  |
| `game-rules` package test script                                  | Explicitly required                                   | Explicitly required                                   | Explicitly required                                                  |
| Dedicated PostgreSQL/PostGIS readiness and migrations             | Required and serialized                               | Required and serialized                               | Required and serialized                                              |
| Database integration suite                                        | Required with one serialized isolated-database worker | Required with one serialized isolated-database worker | Required with one serialized isolated-database worker                |
| Deterministic Basic Playwright E2E                                | Omitted to keep normal PR feedback bounded            | Required                                              | Required                                                             |
| Candidate identity guard                                          | Pull-request checkout                                 | Scheduled default-branch checkout                     | Full lowercase `RELEASE_COMMIT_SHA` must equal checked-out `HEAD`    |
| Sanitized summary artifact                                        | Always, including failure                             | Always, including failure                             | Always, including failure                                            |

Pushes to `main` continue to run the normal validation, artifact, deployment,
and health-check pipeline. Its application-test job now executes both shared
package suites explicitly. The shared mutable test database and Basic E2E are
not added to that deployment path: PR database verification and the full
nightly/release workflow provide those distinct gates without allowing a
queued test-database lock to delay production deployment.

## Database isolation and serialization

The Gitea secrets must identify the existing dedicated, non-production test
database. Before opening a connection, the runner requires and validates all
of these values:

- `TEST_DATABASE_URL`: credentialed PostgreSQL URL for the dedicated test
  target;
- `TEST_DATABASE_HOST`: exact expected hostname for that URL; and
- `TEST_DATABASE_NAME`: exact expected database name for that URL.

The workflow supplies an intentionally unreachable `DATABASE_URL` guard.
Existing application configuration independently requires the test and
ordinary database identities to differ. Missing, malformed, or mismatched
values stop the job before migration or test execution. There is no fallback
URL, default database, production secret, or production runner in either
verification workflow.

After target confirmation, `run-verification.mjs` obtains PostgreSQL advisory
lock `9160166` on the test target and holds the same session for readiness,
migration, database integration, and (for nightly/release) Basic E2E. This is
the authoritative cross-workflow serialization boundary because the installed
Gitea version does not reliably honor workflow concurrency declarations. The
lock wait fails after 45 minutes instead of bypassing serialization. Database
tests use one worker by default; each file still provisions an isolated child
database, but creation, migration, teardown, and forced drop cannot overlap
with another file. `DATABASE_TEST_WORKERS` remains an explicit positive-integer
override for local infrastructure proven to support parallel provisioning.

The commands under the lock reuse the repository's existing targets:

```bash
npm run prepare:api
npm run db:check:test --workspace @wits-world/api
npm run db:migrate:test --workspace @wits-world/api
npm run test:database --workspace @wits-world/api
npm run test:e2e:basic
```

The PR profile stops before the final E2E command. Nightly and release profiles
run all five commands.

## Release operation

1. Confirm the candidate already has the required PR/main validation evidence.
2. Open **Database, Package, and Basic E2E Verification** in Gitea Actions.
3. Select the exact candidate branch or tag, choose `release`, and enter its
   full lowercase 40-character commit SHA in `release_commit_sha`.
4. Leave `prove_failure_gate` disabled for a real gate and dispatch the run.
5. Verify the release-profile job and its sanitized summary pass for that exact
   SHA before making the separate release decision.

A passing release gate is test evidence for the candidate commit. It is not a
production database migration, deployment smoke check, manual accessibility or
campus field result, or stakeholder acceptance record.

## Failure evidence and artifact privacy

The uploaded `summary.json` contains only a schema version, profile, commit
SHA, overall status, fixed check names, fixed statuses, and integer durations.
Raw logs, environment dumps, connection strings, database rows, accepted
answers, exact player locations, browser authentication state, screenshots,
video, and traces are deliberately excluded. In Gitea, raw child-process output
is suppressed and replaced with the fixed check name and status. Playwright
remains configured with screenshots, video, and tracing off for this
deterministic journey. Operators reproduce a failed named check locally against
the dedicated test target when detailed diagnosis is required.

For a controlled proof that workflow failure is enforced, manually dispatch
with `prove_failure_gate` enabled or run:

```bash
npm run verify:failure-probe
```

The probe writes a sanitized summary and exits non-zero before validating or
connecting to a database. Its expected failure must be run separately from a
real release gate and must never be described as a passing verification run.

## Runner duration and cost implications

The normal PR/main C220 validation baseline was previously about 2 minutes 20
seconds wall-clock. The PR database job now adds one clean dependency install
and a one-worker database suite in parallel with the existing jobs. Before the
latest main added the catalogue-upgrade migration suite, a local run against
the dedicated remote test service completed 255 tests across 25 files in about
52 minutes 32 seconds. The current 26-file gate can take longer, and actual
Gitea runner and provider times can vary. It can therefore become the PR
critical path, and concurrent PR, nightly, or release runs can wait up to 45
minutes for the advisory lock. The serialized worker is intentionally slower
than the previous two-worker setting, which proved unreliable under overlapping
database migration workloads.

Nightly and release each consume one additional clean install plus the two
package suites, one-worker migration/database suite, and Basic E2E. The full
Basic gate completed locally in about 4 minutes 42 seconds. The automated job
has a 135-minute ceiling and the PR database job has a 120-minute ceiling so a
run can survive the measured work plus the bounded lock wait; these are safety
ceilings, not expected durations. On the self-hosted C220 runner, the cost is
runner capacity, CPU/storage/network use, and test-database compute rather than
a claimed per-minute Gitea fee. One scheduled full run per day is the
intentional recurring cost. Record actual Gitea job duration and database
provider usage after rollout before changing cadence, worker count, or runner
capacity.

## AI declaration

This issue implementation and operational guide were generated and reviewed
with the assistance of Codex[GPT-5]. The declaration is not verification
evidence.
