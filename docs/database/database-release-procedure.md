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

From the repository root, rehearse against an isolated test database:

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
