# PostGIS Recovery Rehearsal

This procedure demonstrates that the Sprint 1 database can be recreated,
queried, failed safely, and recovered without using production. It complements
the [database release procedure](database-release-procedure.md); it does not
authorise a production migration, seed, or recovery action.

## Safety boundary

- Use only the isolated Neon test branch selected by `TEST_DATABASE_URL`.
- Confirm `TEST_DATABASE_URL` and `DATABASE_URL` identify different targets.
- Never substitute `DATABASE_URL` in the commands below.
- The integration suite creates and drops only a uniquely named temporary
  database. It does not clear or drop the configured test database.
- The deliberate migration failure exists only in a temporary local directory
  and the temporary database. It is never added to `database/migrations`.

The configured test role must be allowed to create and drop databases and own
objects in the temporary database's `public` schema. Neon supports SQL database
creation, but database and schema permissions still apply; see Neon's
[database management documentation](https://neon.com/docs/manage/databases).

## Prerequisites

1. Use the Node.js and npm versions declared by the repository.
2. Check out the approved commit with a clean worktree and run `npm ci`.
3. Set `TEST_DATABASE_URL` in `apps/api/.env` or the operator environment without
   printing or committing it.
4. Confirm no other rehearsal is using the same test branch.

## Rehearsal commands

From the repository root, run the test-target checks in order:

```bash
npm run db:check:test --workspace @wits-world/api
npm run db:migrate:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api
npm run db:seed:test --workspace @wits-world/api
npm run test:database --workspace @wits-world/api
```

Run the readiness, migration, and seed commands a second time when collecting
rerun evidence. Existing migrations must be skipped, readiness must still report
PostGIS, and the fixed demonstration event must remain a single row.

## What the integration suite proves

The database suite performs the destructive portion only inside its disposable
database. It verifies:

1. all repository migrations apply to an empty database;
2. installed PostGIS passes the readiness query;
3. repeated migration and seed runs do not duplicate schema changes or the
   demonstration event;
4. the discovery service returns the seeded, published event;
5. PostGIS distances produce reachable and unreachable decisions;
6. a location-accuracy envelope that crosses the event radius produces a safe
   `retry` decision;
7. an intentionally invalid temporary migration rolls back both its schema
   change and migration-history record; and
8. replacing that unapplied temporary migration with a valid version permits a
   successful rerun while the seeded event remains usable.

Successful cleanup drops the uniquely named temporary database even when an
assertion fails. If cleanup itself fails, stop and identify the database by its
`wits_quest_event_` prefix before removing only that disposable database.

## Failure and rerun guidance

- **Readiness or connection failure:** stop and verify the test URL, Neon compute
  availability, SSL settings, and role access. Do not switch to production.
- **Database creation denied:** use a test role with the required permission or
  create a separate disposable test branch/database through the approved Neon
  process. Do not weaken production permissions for the rehearsal.
- **Migration failure:** retain sanitised output, confirm the failed migration
  was not recorded, fix the unapplied migration, and rerun. Never edit a
  migration that has already been recorded with its checksum.
- **Seed failure:** the seed transaction rolls back. Fix the cause and rerun the
  seed; do not truncate the events table.
- **Interrupted run:** confirm no test process remains active, remove only an
  identified disposable database if automatic cleanup did not complete, then
  rerun the full suite.
- **Eligibility mismatch:** do not change coordinates or the radius merely to
  make the assertion pass. Investigate the migration, seed, SRID, geography
  casts, and accuracy-envelope calculation.

## Provider limitations

Neon databases belong to a branch, and temporary-database creation consumes
resources on that branch. The Free plan has finite compute, storage, and network
allowances, so a suspended compute or exhausted allowance can delay or block the
rehearsal. Current allowances can change and must be checked on Neon's
[pricing page](https://neon.com/pricing) before release evidence is collected.
These provider limits are environmental failures, not permission to redirect a
destructive test to production.

## Sanitised evidence

Record the approved commit, test target label, command names, migration and seed
counts, PostGIS version, test counts, and whether cleanup succeeded. Evidence
must not contain:

- connection strings, passwords, access tokens, or role secrets;
- exact player coordinates;
- unnecessary demonstration-event coordinates; or
- raw environment files.

Attach the sanitised result to issue #48 and link it from the Sprint 1 release
issue #20. A second team member must review whether the evidence is sufficient.
No production verification is part of this rehearsal.

This procedure was planned, generated, edited, and verified with the assistance
of Codex[GPT-5.6 Sol].
