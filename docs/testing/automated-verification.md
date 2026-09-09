---
title: Automated database, package, and Basic E2E verification
---

# Automated database, package, and Basic E2E verification

Issue `#166` adds distinct pull-request and real-environment verification paths
for the shared packages, PostgreSQL/PostGIS migrations and integration suites,
and the deterministic Basic Playwright journey. Both use existing npm targets;
only nightly/release use `TEST_DATABASE_URL`, and neither path introduces or
permits a production fallback.

## Verification matrix

| Behaviour                                                         | Pull request                                       | Nightly                                             | Release gate                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Trigger                                                           | Every pull request targeting `main`                | `03:00` UTC (`05:00` SAST) each day                 | Manual dispatch from the exact candidate ref, with profile `release` |
| Formatting, lint, types, application coverage, docs tests, builds | Required in `pr-validation.yml`                    | Relies on the latest PR/main result; not duplicated | Relies on the candidate's required PR/main result; not duplicated    |
| `account-policy` package test script                              | Explicitly required                                | Explicitly required                                 | Explicitly required                                                  |
| `game-rules` package test script                                  | Explicitly required                                | Explicitly required                                 | Explicitly required                                                  |
| PostgreSQL/PostGIS target                                         | Per-job ephemeral `postgis/postgis:17-3.5` service | Dedicated direct Neon test target                   | Dedicated direct Neon test target                                    |
| Database readiness, migrations, and integration suite             | Required with four workers                         | Required, serialized, with one worker               | Required, serialized, with one worker                                |
| Deterministic Basic Playwright E2E                                | Omitted to keep normal PR feedback bounded         | Required                                            | Required                                                             |
| Candidate identity guard                                          | Pull-request checkout                              | Scheduled default-branch checkout                   | Full lowercase `RELEASE_COMMIT_SHA` must equal checked-out `HEAD`    |
| Sanitized verification summary artifact                           | Not applicable to the ephemeral database job       | Always, including failure                           | Always, including failure                                            |

Pushes to `main` continue to run the normal validation, artifact, deployment,
and health-check pipeline. Its application-test job now executes both shared
package suites explicitly. The shared mutable test database and Basic E2E are
not added to that deployment path. Pull requests use their own ephemeral
PostGIS service, while the full nightly/release workflow supplies strict
remote-environment evidence without allowing a queued test-database lock to
delay PR feedback or production deployment.

## Pull-request database isolation

Each `database-validation` PR job starts `postgis/postgis:17-3.5` inside that
job's isolated service network. It uses fixed, non-production container
credentials, an unreachable `DATABASE_URL` guard, and
`DATABASE_TEST_WORKERS=4`. The job prepares the shared API dependencies, checks
the ephemeral PostGIS target, and runs the complete database integration and
migration-test runner. It does not receive `TEST_DATABASE_URL`, the target
fingerprint, or the remote advisory lock.

Concurrent pull requests cannot race because every job gets a separate PostGIS
container and network namespace. Parallel workers only share the disposable
service within their own job, and the existing database runner provisions a
different temporary child database for each suite.

## Nightly and release database serialization

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
approved digest appears in the nightly/release workflow and must only be
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

Only nightly and release profiles use this remote command path and run all five
commands. Ordinary PR validation uses the isolated service described above.

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
seconds wall-clock. The PR database job adds one clean dependency install and
the four-worker suite against a local ephemeral service, in parallel with the
other PR jobs. This restores the pre-#166 architecture and should return PR
database feedback to its earlier few-minute range; actual Gitea duration must
be measured after this change rather than inferred from local timings.

Nightly and release each consume one additional clean install plus the two
package suites, one-worker migration/database suite, and Basic E2E. The full
Basic gate completed locally in about 4 minutes 42 seconds. Before the latest
main added the catalogue-upgrade migration suite, the one-worker remote
database portion completed 255 tests across 25 files in about 52 minutes 32
seconds; the current 26-file gate can take longer. Concurrent nightly/release
runs can wait up to 45 minutes for the advisory lock, and the automated job has
a 135-minute ceiling. These are safety ceilings, not expected durations. On the
self-hosted C220 runner, the cost is runner capacity, CPU/storage/network use,
and test-database compute rather than a claimed per-minute Gitea fee. One
scheduled full run at 05:00 SAST each day is the intentional recurring cost.
Record actual Gitea job duration and database-provider usage after rollout
before changing cadence, worker count, or runner capacity.

## AI declaration

This issue implementation and operational guide were generated and reviewed
with the assistance of Codex[GPT-5]. The declaration is not verification
evidence.
