---
title: 'Database releases and recovery'
---

# Database releases and recovery

The release command applies the repository's PostgreSQL/PostGIS migrations to
an explicitly selected database. Main-branch API deployment runs this command
before deploying the API. An authorised operator can also use it for a test
rehearsal or a manual release.

[Neon and PostGIS setup](neon-postgis-setup.md) covers connection setup;
[Test suites](../testing/automated-verification.md#database-integration) covers
disposable database tests.

## What the runner checks

The runner inspects the connection and PostGIS availability, confirms the
connected database name, and applies pending SQL files in filename order under
a database advisory lock. Each migration and its history record commit in the
same transaction.

Before applying pending files, it checks the complete recorded history. An
applied file missing from the release or a changed checksum stops the run.
Unchanged applied migrations are skipped on rerun. After migration, the runner
checks installed PostGIS and verifies the migration count.

Keep applied files unchanged. Correct schema defects with a new ordered
migration and retain the complete migration chain in the release artifact.

## Select the target

| Target       | Connection variable | Additional guard                                                         |
| ------------ | ------------------- | ------------------------------------------------------------------------ |
| `test`       | `TEST_DATABASE_URL` | Must identify a different database from `DATABASE_URL`.                  |
| `production` | `DATABASE_URL`      | The deployment workflow also checks the expected host and database name. |

Both targets require `--confirm-database` to match the connected database name.
Connection strings belong in ignored local configuration or trusted server
settings; the confirmation argument contains the database name only.

Prefer a disposable local PostGIS target for rehearsal. An explicitly approved
manual rehearsal may use a separate test Neon project and consumes its compute
allowance. Automated bounded-maintenance tests require local PostGIS. From the
repository root, confirm the isolated test database name:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target test \
  --confirm-database <test-database-name>
```

For an approved manual production release, use the reviewed commit and its
production configuration:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target production \
  --confirm-database <production-database-name>
```

Review pending migrations and application compatibility before release.
Database-first deployment is the normal order. A change that breaks the old
response or write contract needs a coordinated API, Web, and schema cutover,
including any pause in affected traffic. Confirm the backup or restore option
for the selected database before changing production.

## Content is a separate operation

Without a seed flag, the release applies migrations only. The optional
`--seed-basic-demo` and `--seed-verified-events` flags select different content
packs and cannot be combined. A selected pack also installs its reusable
catalogue prerequisites and verifies the resulting pack counts.

The production deployment workflow supplies neither flag. Review content
publication separately; applying the schema does not author, publish, or
schedule new gameplay content.

## Bounded migration connections and release waits

Migration, seed CLI, and release commands select a session-compatible connection
separately from the API's runtime pool. For a Neon `-pooler` URL they derive the
direct hostname for the same endpoint; credentials, port, database path and TLS
parameters remain unchanged. The API keeps its original pooled `DATABASE_URL`.
Neon uses transaction pooling, which cannot safely retain a session advisory
lock across migration commits. See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).
Non-Neon hosts are not rewritten and must already be session-compatible.

An optional server-only `MIGRATION_DATABASE_URL` permits a separate maintenance
credential. It must be direct and identify the same normalized host, port and
database as `DATABASE_URL`; endpoint override parameters are rejected. Test
commands ignore this production maintenance variable and use only the isolated
`TEST_DATABASE_URL`. Direct and pooled URLs for the same Neon database are not
accepted as separate test targets. No existing `.env` update is required for the
automatic Neon direct-endpoint selection.

Migration sessions set PostgreSQL `lock_timeout` to 30 seconds and
`statement_timeout` to five minutes. The session advisory lock remains held
through each per-file transaction and its release must report ownership. Seed
files instead share one transaction with a bounded transaction advisory lock;
commit or rollback releases that lock automatically, including through a
transaction pooler. Maintenance sessions are destroyed and their pool is ended
on success, callback failure, or failed connection acquisition.

The CLI prints the start and completion duration of inspection, migrations,
readiness, optional seeding, and verification without printing credentials.
Normal main CI does not seed content. The production release command has a
six-minute process deadline, its step has an eight-minute timeout, and the API
deployment job has a 15-minute timeout. Timeout or failed verification blocks
API deployment. Applied files are checksum-checked and skipped, not re-executed
on every release. A timeout never authorizes removing migration records.

### 9 October 2026 incident

At main revision `cfdbf8d375f11bd4089a4e4206994a8eda59e2ac`,
[CI run 961](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/actions/runs/961)
waited for advisory lock `9160001` through Neon PgBouncer. All 66 migrations
were already recorded. An unrelated read-only diagnostic transaction received
the pooled physical backend still holding the migration session lock, proving
that the lock had outlived the originating pooled client.

At 13:57:58 UTC, the verified blocked release query alone was cancelled and the
verified orphaned lock held by that diagnostic backend was released. No game
rows or migration records changed; the remaining migration-lock count was zero.
The API deployment job failed after 38 minutes 16 seconds and the dependent Web
deployment was skipped. This recovery is not evidence of a successful deploy.
The permanent fixes are tracked in [issue #374](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/374).

Local regression evidence on 9 October 2026 used branch
`fix/neon-release-and-idle-usage`, based on that main revision, Node.js 24.15.0,
and disposable `postgis/postgis:17-3.5` (PostgreSQL 17.5, PostGIS 3.5.2).
The API suite passed 1,683 tests with 456 conditional tests skipped; the final
focused maintenance/config/CLI/scheduler run passed 135 tests, including five
real local database tests. The database cases cover concurrent releases across
per-file commits, failed-file rollback and recovery, the actual 30-second server
lock deadline, seed-lock cleanup, and all 66 migrations followed by a no-op
release. The focused run took 32.48 seconds, including the intentional
30-second contention wait. No automated test connected to production Neon.
The deployment guard suite passed 43 tests, including safe activation defaults
and artifact/publication filter agreement. API lint, type-check and production
build passed. These local results are not production activation or CU-savings
evidence; the live scheduler remains operator-reported polling until safe
cutover and deployment are confirmed.

For a recurrence, inspect `pg_stat_activity` and `pg_locks` read-only, identify
the exact database/key/owner/waiter, and distinguish a real active migration
from an orphaned pooled session lock. Obtain scoped operator authorization
before cancelling a verified waiter or releasing a lock owned by the diagnostic
session. Do not terminate arbitrary sessions, clear every advisory lock, run
destructive resets, or repeatedly retry the old pooled release implementation.

## Recovery

A failed migration rolls back that migration and its history record. Earlier
successful migrations remain committed. Inspect the cause and recorded state
before retrying the same guarded release. For a checksum mismatch, restore the
original applied file and place corrections in a new migration; do not delete
history records to bypass the check.

A seed failure does not undo completed migrations. An API failure after
migration also leaves the database changed. Retain the schema and roll forward
unless the proposed older application is compatible with the stored data and
migration state. Confirm no release process is still running before retrying
an interrupted command.

The repository has no automatic production restore command. Backup and
point-in-time restore availability depend on the database provider and selected
configuration. A production restore needs its own reviewed target, recovery
point, and verification of the restored schema and application data.

The disposable database tests exercise fresh setup, repeat runs, and rollback
of a deliberately failing migration. They verify migration recovery; they do
not demonstrate restoration of a production backup.

## Verify the release

Record the commit, environment label, migration results, PostGIS readiness, and
any selected content pack. After the matching API deploys, check health and an
authenticated journey affected by the schema change. Keep credentials and
private player data out of the record.

**AI declaration:** Prepared and updated with assistance from Codex[GPT-6],
Codex[GPT-5], Codex[GPT-5.6 Sol], Codex[gpt-5.6-sol],
Codex-CLI[gpt-5.6-sol medium], ChatGPT-Web[GPT-5.6 Sol], and Codex-CLI[GPT-6].
