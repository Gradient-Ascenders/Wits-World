---
title: 'Database and end-to-end test gates'
---

# Database and end-to-end test gates

## Rate-limit test isolation

The API rate-limit unit and Fastify integration tests inject a deterministic
fake limiter. They cover named policy selection, authenticated player and
developer-key isolation, a shared counter across two app instances, quota
responses, timeout/error policy behavior, and `/health` exclusion without
contacting Upstash. The production server constructs the Upstash client only
when it starts with server-only credentials; explicit non-production `local`
mode uses a separate process-local backend without network access. Real Upstash latency, outages,
multi-instance behavior, and stress performance require controlled deployment
verification; the local fake does not establish those outcomes.

Issue `#166` adds pull-request verification for the shared packages,
PostgreSQL/PostGIS migrations and integration suites, and the deterministic
Basic Playwright journey. The jobs use isolated PostGIS services and do not
receive the repository database secret or permit a production fallback.

## Verification matrix

| Behaviour                                                  | Pull-request gate                                  |
| ---------------------------------------------------------- | -------------------------------------------------- |
| Trigger                                                    | Every pull request targeting `main`                |
| Formatting, lint, types, application/docs coverage, builds | Required in `pr-validation.yml`                    |
| `account-policy` package coverage gate                     | Explicitly required                                |
| `game-rules` package coverage gate                         | Explicitly required                                |
| PostgreSQL/PostGIS target                                  | Per-job ephemeral `postgis/postgis:17-3.5` service |
| Database readiness, migrations, and integration suite      | Required with four workers                         |
| Deterministic Basic Playwright E2E                         | Required in its own isolated PostGIS job           |
| Candidate identity guard                                   | Pull-request checkout                              |
| Sanitized verification summary artifact                    | Always for the Basic E2E job, including failure    |

Pushes to `main` continue to run the normal validation, artifact, deployment,
and health-check pipeline. Its application-test job now executes both shared
package suites explicitly. The shared mutable test database and Basic E2E are
not added to that deployment path. Pull requests use their own ephemeral
PostGIS services, so validation does not queue on or mutate a shared remote
test database.

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

Readiness builds the API once; the PR profile passes `--api-build-prepared` so
migration and seeding reuse those compiled entrypoints. The seven Basic browser
tests run with four workers in CI. Only the canonical journey writes to the
database; the six shell/Explore tests intercept every API request within their
own browser contexts. Its 21 dependent steps stay sequential. Action waits are
capped at 15 seconds so a missing control does not consume an entire test budget.

The profile validates the pinned isolated-service fingerprint and unreachable
ordinary-database guard, but skips shared package tests and the full database
integration suite because those run in separate PR jobs. It retains sanitized
summaries and Playwright failure diagnostics. The job has a 20-minute timeout.

There is no nightly or manually dispatched remote verification workflow.

## Failure evidence and artifact privacy

The uploaded `summary.json` contains a schema version, profile, commit SHA,
overall status, fixed check names, fixed statuses, integer durations, and—only
when Playwright diagnostics were written—the fixed relative filename
`playwright-diagnostics.json`. Raw logs, environment dumps, connection strings,
database rows, accepted answers, exact player locations, browser authentication
state, screenshots, video, and traces are deliberately excluded. In Gitea, raw
child-process output remains suppressed and is replaced with the fixed check
name and status.

For PR Basic E2E, the wrapper asks a repository-owned Playwright reporter to
write a temporary machine-readable structural report. On failure
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

For a controlled local proof that failure is enforced, run:

```bash
npm run verify:failure-probe
```

The probe writes a sanitized summary and exits non-zero before validating or
connecting to a database. Its expected failure must never be described as a
passing verification run.

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

## AI declaration

This issue implementation and operational guide were generated and reviewed
with the assistance of Codex[GPT-5] and Codex-CLI[GPT-6]. The declaration is not verification
evidence.

Page title clarified with assistance from Codex-CLI[GPT-6].

Coverage-gate wording updated with assistance from Codex-CLI[GPT-5].
