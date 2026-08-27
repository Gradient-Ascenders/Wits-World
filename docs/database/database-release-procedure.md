# Basic Database Release Procedure

This procedure prepares the PostgreSQL/PostGIS database used by the Wits Quest
API. It is intentionally operator-run. Gitea Actions does not migrate or seed a
database, and an API deployment must not be treated as ready when this procedure
fails.

## Authority and ownership

The Data and Infrastructure Lead executes the procedure. The API and Security
Lead approves production database writes and reviews secret handling. A second
explicit release decision is required before adding Basic demonstration content
to production.

Never run a production command only because a branch or deployment workflow was
started. Record the approved commit, environment, database name, operator, and
whether demonstration seeding was approved before any write.

## Safety model

The guarded command:

1. selects `TEST_DATABASE_URL` for `--target test` or `DATABASE_URL` for
   `--target production`;
2. performs a read-only connection and PostGIS availability check;
3. prints the target label and connected database name, never the connection
   URL;
4. refuses to write unless the connected name exactly matches
   `--confirm-database`;
5. applies ordered, checksummed migrations under an advisory lock;
6. confirms the installed PostGIS version;
7. applies the reusable catalogue and Basic demo seed only with
   `--seed-basic-demo`; and
8. verifies the migration count and, when seeded, the published Basic event and
   challenge fixtures.

Each migration runs in its own transaction. Each seed group runs in its own
transaction. A failed stage exits nonzero and prevents later stages from
running.

Migration `0023_add_ordering_challenges.sql` is additive: it broadens the
challenge-format constraint and adds ordering definitions, private order keys,
attempt snapshots, and locked ordering answers. Apply it before deploying an
API version that can create or serve ordering challenges. Existing
`multiple_choice` definitions and attempts remain valid and require no rewrite.

## Prerequisites

- Use the Node.js and npm versions declared by the repository.
- Run from a clean checkout of the approved commit.
- Install dependencies with `npm ci`.
- Set `DATABASE_URL` and `TEST_DATABASE_URL` only in an ignored environment file
  or the operator's environment.
- Confirm in Neon that the test and production URLs identify different targets.
- Confirm the expected database name without copying the connection URL into a
  terminal command, ticket, screenshot, or log.

## Isolated rehearsal

Use only the separate test Neon target. Replace `<test-database-name>` with the
database name shown in Neon:

```bash
npm run db:release --workspace @wits-world/api -- \
  --target test \
  --confirm-database <test-database-name> \
  --seed-basic-demo
```

Run the same command a second time. The second run must report zero applied
migrations, all existing migrations skipped, and the expected Basic demo event
and challenge counts. Seed upserts update the fixed fixtures instead of
inserting duplicates.

Run the database integration suite against the isolated test target:

```bash
npm run test:database --workspace @wits-world/api
```

Use the separate [PostGIS recovery rehearsal](postgis-recovery-rehearsal.md) to
validate event discovery, accuracy-aware eligibility, transactional failure,
and corrected rerun behaviour in the disposable database.

Store sanitised output outside the repository, for example under `/tmp`. Review
it before attaching it to the issue or pull request. Evidence may include target
type, database name, migration filenames and counts, PostGIS version, and test
results. Remove connection URLs, credentials, tokens, and unnecessary event
coordinates.

## Production procedure

Production writes require the recorded approval described above. Do not use the
test command as evidence that production was changed.

1. Confirm that CI passes for the exact release commit.
2. Confirm the intended Neon production database name and that `DATABASE_URL` is
   available without printing it.
3. Run migrations without demonstration data:

   ```bash
   npm run db:release --workspace @wits-world/api -- \
     --target production \
     --confirm-database <production-database-name>
   ```

4. Review the successful migration, PostGIS, and verification counts.
5. Only when demonstration seeding has separate approval, rerun with the seed
   option:

   ```bash
   npm run db:release --workspace @wits-world/api -- \
     --target production \
     --confirm-database <production-database-name> \
     --seed-basic-demo
   ```

6. Deploy the API only after the required database procedure succeeds.
7. Verify `/health` and `/api/v1/`, then use an authenticated player session to
   confirm the intended event is returned by the deployed event-discovery API.
   Do not place an access token in committed files or captured output.

## Failure and recovery

Do not drop databases, truncate tables, delete migration records, edit an applied
migration, or use a destructive reset as recovery.

- **Connection or PostGIS availability failure:** stop and verify the selected
  Neon target, network access, SSL settings, and provider status. Retry only after
  the cause is understood.
- **Database confirmation mismatch:** stop. Recheck the target and command; never
  change the confirmation value merely to bypass the guard.
- **Migration failure:** retain the failure output, inspect the failed migration,
  and review database state. The failed migration transaction rolls back. Fix the
  cause in a new migration when appropriate, obtain review, then rerun.
- **Changed migration checksum:** restore the already-applied migration file and
  put any correction in a new ordered migration.
- **Seed failure:** migrations remain applied, while the seed transaction rolls
  back. Fix the seed or its prerequisites and rerun only with seed approval.
- **Verification failure:** do not deploy. Investigate migration history or the
  controlled fixture; do not manually alter history to make counts pass.
- **Interrupted command:** confirm no other release process is active, rerun the
  same guarded command, and rely on migration checksums and seed idempotency.

Provider backup, point-in-time recovery, and production restore guarantees remain
subject to the selected Neon plan and are not created by this procedure.

## What remains manual

- production approval and operator assignment;
- selecting and confirming the intended Neon target;
- deciding whether demonstration data belongs in production;
- reviewing sanitised evidence;
- starting the API deployment after database success; and
- authenticated deployed-event verification.

This procedure was planned, generated, edited, and verified with the assistance
of Codex[GPT-5] and Codex[GPT-5.6 Sol].
