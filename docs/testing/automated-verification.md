---
title: Automated database, package, and Basic E2E verification
---

# Automated database, package, and Basic E2E verification

Issue `#166` adds distinct pull-request and real-environment verification paths
for the shared packages, PostgreSQL/PostGIS migrations and integration suites,
and the deterministic Basic Playwright journey. Both use existing npm targets;
only manual remote verification uses the repository database secret, and neither path introduces or
permits a production fallback.

## Verification matrix

| Behaviour                                                         | Pull request                                       | Release gate                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Trigger                                                           | Every pull request targeting `main`                | Manual dispatch from the exact candidate ref, with profile `release` |
| Formatting, lint, types, application coverage, docs tests, builds | Required in `pr-validation.yml`                    | Relies on the candidate's required PR/main result; not duplicated    |
| `account-policy` package test script                              | Explicitly required                                | Explicitly required                                                  |
| `game-rules` package test script                                  | Explicitly required                                | Explicitly required                                                  |
| PostgreSQL/PostGIS target                                         | Per-job ephemeral `postgis/postgis:17-3.5` service | Dedicated direct Neon test target                                    |
| Database readiness, migrations, and integration suite             | Required with four workers                         | Required, serialized, with one worker                                |
| Deterministic Basic Playwright E2E                                | Required in its own isolated PostGIS job           | Required                                                             |
| Candidate identity guard                                          | Pull-request checkout                              | Full lowercase `RELEASE_COMMIT_SHA` must equal checked-out `HEAD`    |
| Sanitized verification summary artifact                           | Always for the Basic E2E job, including failure    | Always, including failure                                            |

Pushes to `main` continue to run the normal validation, artifact, deployment,
and health-check pipeline. Its application-test job now executes both shared
package suites explicitly. The shared mutable test database and Basic E2E are
not added to that deployment path. Pull requests use their own ephemeral
PostGIS service, while the full manual release workflow supplies strict
remote-environment evidence without allowing a queued test-database lock to
delay PR feedback or production deployment.

## Pull-request database isolation

Each `database-validation` PR job starts `postgis/postgis:17-3.5` inside that
job's isolated service network. It uses fixed, non-production container
credentials, an unreachable `DATABASE_URL` guard, and
`DATABASE_TEST_WORKERS=4`. The job prepares the shared API dependencies, checks
the ephemeral PostGIS target, and runs the complete database integration and
migration-test runner. It does not receive the remote database secret, target fingerprint, or remote
advisory lock.

Concurrent pull requests cannot race because every job gets a separate PostGIS
container and network namespace. Parallel workers only share the disposable
service within their own job, and the existing database runner provisions a
different temporary child database for each suite.

## Pull-request Basic E2E

A separate parallel `basic-e2e` job owns another ephemeral PostGIS service and
runs `npm run verify:automated -- --profile pr-e2e`. The final PR validation gate
requires this job as well as database validation. It installs Chromium and its
system dependencies, prepares shared API dependencies, checks database readiness,
and runs the existing Basic E2E runner, which migrates/seeds the database and
starts the API and web harness. No remote database secret is supplied.

The profile validates the pinned isolated-service fingerprint and unreachable
ordinary-database guard, but skips shared package tests, the full database
integration suite, and the remote advisory lock. It retains sanitized summaries
and Playwright failure diagnostics. The job has a 20-minute timeout.

There is no nightly schedule. Full remote verification remains manually
available for exact-SHA release evidence.

## Manual release database serialization

The Gitea configuration must identify the existing dedicated, non-production
test database. Before opening a connection, the runner requires and validates:

- `TEST_DATABASE_URL`: credentialed PostgreSQL URL for the dedicated test
  target, stored as a Gitea repository secret; and
- `TEST_DATABASE_IDENTITY_SHA256`: lowercase SHA-256 of the normalized
  `hostname:port/database` identity, pinned as a non-secret workflow value.

The hostname and database name are derived from `TEST_DATABASE_URL`; duplicating
them as secrets does not provide independent confirmation. The pinned digest
does: changing the URL alone cannot redirect verification to another target,
while the digest reveals no username, password, or connection string. The
approved digest appears in the manual release workflow and must only be
changed after an operator independently confirms a replacement dedicated test
target.

Connection-target query overrides are rejected before any connection. The
blocked parameter names are `host`, `hostaddr`, `port`, `database`, `dbname`,
`db`, and `service`, matched case-insensitively. This prevents node-postgres,
its connection-string parser, a native client, or a future dependency change
from connecting somewhere other than the URL authority/path that was
fingerprinted. After validation, the runner replaces `TEST_DATABASE_URL` in its
child-process environment with the canonical URL it validated, so the advisory
lock, readiness check, migrations, database suites, and Basic E2E all receive
that same connection target.

The verification runner rejects Neon's pooled `-pooler` hostname before opening
a connection. The lock, migrations, and integration tests require the direct
endpoint because the serialization lock is session-scoped. The normal
application may continue using its pooled URL independently.

The workflow supplies an intentionally unreachable `DATABASE_URL` guard.
Existing application configuration independently requires the test and
ordinary database identities to differ. Missing, malformed, pooled, or
mismatched values stop the job before migration or test execution. There is no fallback
URL, default database, production secret, or production runner in either
verification workflow.

After target confirmation, `run-verification.mjs` obtains PostgreSQL advisory
lock `9160166` on the test target and holds the same session for readiness,
migration, database integration, and (for manual release) Basic E2E. This is
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

The release profile uses this remote command path and runs all five commands.
The legacy `nightly` CLI profile remains available for compatibility, but no
scheduled workflow invokes it. Ordinary PR validation uses isolated services.

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

The uploaded `summary.json` contains a schema version, profile, commit SHA,
overall status, fixed check names, fixed statuses, integer durations, and—only
when Playwright diagnostics were written—the fixed relative filename
`playwright-diagnostics.json`. Raw logs, environment dumps, connection strings,
database rows, accepted answers, exact player locations, browser authentication
state, screenshots, video, and traces are deliberately excluded. In Gitea, raw
child-process output remains suppressed and is replaced with the fixed check
name and status.

For PR and manual release Basic E2E, the wrapper asks a repository-owned Playwright
reporter to write a temporary machine-readable structural report. On failure
the wrapper creates `playwright-diagnostics.json` from an explicit allowlist and
deletes the temporary report before artifact upload. Each verification run also
removes stale diagnostics before any checks begin, and the workflow uploads the
sanitized file alongside `summary.json` only when it exists.

The sanitized file contains failed test and `test.step` titles, a fixed failure
category and reason, integer duration, project name, shortened test-declaration
location, and safe attachment basenames/content types. Schema version 3 also
records a structural failure phase, a fixed known hook/fixture title when one is
available, a fixed exception category, and the error-source file basename with
line and column. Failure phases distinguish `beforeAll`, `beforeEach`,
fixture/setup, test body, `afterEach`, `afterAll`, runner/web-server setup, and an
explicit unknown phase. Known exception categories distinguish missing browser
executables, browser launch/closure, refused connections, network timeouts, and
assertion errors without copying their messages. Unknown values collapse to
fixed generic categories rather than being retained.

The Playwright error message, stack, snippet, actual/expected values, DOM or
accessibility snapshot, request/response content, stdout, stderr, attachment
bodies, and absolute paths are never copied into the sanitized artifact. The
transient reporter uses error text or stack only to derive a fixed exception
category and source coordinates; neither input is written to its structural
report. Retained structured labels and filenames are bounded and still pass
through defensive credential, token and precise-location redaction. If the
structural report is missing or malformed, the artifact records only the fixed
collection-failure category and reason.

Playwright remains configured with screenshots, video, and tracing off for this
deterministic journey, so attachment metadata is normally empty. Operators can
use the sanitized test, step, category and source fields to reproduce a failure
locally without exposing the unrestricted child report.

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
seconds wall-clock. The PR database job adds one clean dependency install and
the four-worker suite against a local ephemeral service, in parallel with the
other PR jobs. This restores the pre-#166 architecture and should return PR
database feedback to its earlier few-minute range; actual Gitea duration must
be measured after this change rather than inferred from local timings.

The PR Basic E2E job adds a clean install, browser installation, readiness,
migration/seed preparation, and the browser journey in parallel with the other
PR jobs. A previous local Basic gate completed in about 4 minutes 42 seconds;
this is not a CI duration estimate. Measure the first Gitea runs before tuning
the 20-minute job timeout or runner capacity.

Manual remote release verification retains its existing one-worker database
suite and 135-minute job ceiling. Previous remote database runs took about
52 minutes, so this work is no longer repeated on a daily schedule. No new
remote-environment success is claimed by the move to PR E2E.

## AI declaration

This issue implementation and operational guide were generated and reviewed
with the assistance of Codex[GPT-5] and Codex-CLI[GPT-6]. The declaration is not verification
evidence.
