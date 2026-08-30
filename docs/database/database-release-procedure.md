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

Migration `0025_add_ordering_challenges.sql` is additive: it broadens the
challenge-format constraint and adds ordering definitions, private order keys,
attempt snapshots, and locked ordering answers. Apply it before deploying an
API version that can create or serve ordering challenges. Existing
`multiple_choice` definitions and attempts remain valid and require no rewrite.
Because account-deletion migration `0024` predates ordering tables, `0025` also
forward-replaces its cleanup routine and snapshot validator so deletion-pending
players' ordering answers and snapshots are removed in foreign-key order.

Migration `0026_create_player_progression.sql` must run after the ordering
migration. It creates the progression ledger and read models, then backfills
retained event completions and completed CPU matches through the same
authoritative persistence functions used for new progression awards. Apply it
before deploying an API version that exposes progression routes or invokes the
completion hooks; otherwise those operations fail closed and their owning
transactions roll back.

Migration `0027_create_ordered_trails.sql` adds trail definitions, constrained
ordered event membership, lifecycle guards, and discovery indexes. It extends
the Author audit entity constraint to accept `trail` and does not rewrite
existing events, attempts, completions, or player records. Apply it before an
API version that registers trail routes.

Migration `0028_create_asynchronous_pvp_persistence.sql` adds asynchronous PvP
invitations, private immutable deck and match snapshots, participants, actions,
idempotency receipts, terminal history, deadline indexes, and two-participant
progression sources. It preserves existing CPU-match and progression records.
Apply it before deploying issue `#180`; applying it alone does not expose PvP
routes or start deadline processing.

Migration `0029_curate_author_content_lifecycle.sql` must run after ordered
trails and asynchronous PvP persistence. It preserves `trail` as an Author audit entity while installing the
five-state workflow for events, challenges, questions, and cards. It adds
optimistic versions, provenance, versioned audit fields, review indexes, and
database lifecycle guards. Existing live/history content is retained with
`legacy` provenance; controlled catalogue and Basic-demo seeds identify
themselves as `controlled_seed`. Run `0029` before deploying the matching API.
During the database-to-API window, the old direct draft-publish API fails
closed, so coordinate the releases and keep that window short.

Migration `0030_create_campaign_scheduling.sql` runs after the curated content
lifecycle. It adds campaign definitions and memberships, extends the Author
audit entity constraint, installs overlap/retirement guards, and provides the
effective event/trail availability functions used by the matching API. Existing
content remains standalone until it has belonged to a published campaign. Run
`0030` before deploying an API that registers campaign routes or invokes those
functions; applying it does not create campaign content or run a scheduler.

Migration `0031_create_movement_evidence.sql` creates the short-lived precise
movement-evidence table, its constraints/indexes, immutability guard, and
account-deletion trigger. Apply it before deploying an API that persists issue
`#168` evidence. After release, verify the configured retention and cleanup
interval names, one successful aggregate-only cleanup log, and expiry behavior
without recording coordinates or connection details.

Migration `0032_add_movement_eligibility_decisions.sql` adds the retained,
non-precise journey decision audit used by impossible-journey enforcement.
Migration `0033_add_async_pvp_invitation_invalidation.sql` then extends the
asynchronous PvP invitation lifecycle with the terminal `invalidated` state
required by account deletion. Apply both in order before deploying the issue
`#180` API and deadline worker.

Migration `0032_add_movement_eligibility_decisions.sql` creates the immutable
journey-decision audit and the server-receipt lookup index. Apply it before the
issue `#169` API. Configure the required reviewed
`MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND` value before starting that API;
there is deliberately no fallback. Rehearsal must confirm migration checksum,
expiry cleanup, rejected-anchor exclusion, and account-deletion cascade without
recording precise evidence or threshold values in release logs.

Migration `0034_retire_coin_rewards.sql` is the exception to the usual
database-first ordering. Quiesce challenge traffic and perform a coordinated
API/Web cutover because the old and new completed-attempt response shapes are
not cross-compatible. Drain onto the API that writes `coins_awarded = 0`,
creates no wallet or ledger entry, and returns only card rewards; then deploy
the matching Web contract and apply `0034` while challenge traffic remains
quiesced. The new API requires
`X-Wits-Challenge-Contract-Version: 2` on every challenge-attempt operation and
rejects a missing or different value with
`CHALLENGE_CLIENT_UPGRADE_REQUIRED` before a challenge service can mutate or
finalise state. The matching Web build sends that value and presents an explicit
hard-refresh action. This makes refresh enforceable for already-open old tabs:
they cannot submit or finalise against the new contract until refreshed.

After `0034` applies, run the cards-only completion smoke test against the
post-migration schema and reopen challenge traffic only when it succeeds. The
migration preserves historical non-zero completion values, makes legacy wallets
read-only except for account-deletion cleanup, and makes the coin ledger fully
immutable. An older API instance will fail challenge finalisation after `0034`,
so do not leave mixed API versions serving traffic. No new environment variable,
dependency, seed, or data backfill is required.

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
and challenge counts. Conflict-safe seed operations leave already-published,
immutable fixtures unchanged instead of inserting duplicates or rewriting live
content.

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
3. For a release containing `0034`, quiesce challenge traffic, deploy the
   matching API, ensure every old API instance is drained, deploy the matching
   Web build, and confirm the API rejects a challenge request without
   `X-Wits-Challenge-Contract-Version: 2` before invoking challenge services.
   Keep challenge traffic quiesced through steps 4 and 5. For other releases,
   retain the migration-first ordering described by their migration notes.
4. Run migrations without demonstration data:

   ```bash
   npm run db:release --workspace @wits-world/api -- \
     --target production \
     --confirm-database <production-database-name>
   ```

5. Review the successful migration, PostGIS, and verification counts. Confirm
   `0028` before deploying the API and compatible Web build. For `0034`, confirm
   the migration applied only after the compatible application checks in step 3,
   then use the versioned Web client to complete a challenge against the
   post-migration schema. Verify it persists zero in `coins_awarded`, creates no
   wallet or ledger row, and returns the card-only result. Reopen challenge
   traffic only after this smoke test succeeds; otherwise keep it quiesced.
6. Deploy any matching API and Web build not already deployed by the `0034`
   choreography, then verify health and generated OpenAPI. With sanitised
   evidence, perform an authenticated Author
   submit/approve/publish check using two Authors and verify unpublished content
   remains absent from Player APIs.
7. Only when demonstration seeding has separate approval, rerun with the seed
   option:

   ```bash
   npm run db:release --workspace @wits-world/api -- \
     --target production \
     --confirm-database <production-database-name> \
     --seed-basic-demo
   ```

8. Except for the documented `0034` application-first release, deploy the API
   only after the required database procedure succeeds.
9. Verify `/health` and `/api/v1/`, then use an authenticated player session to
   confirm the intended event is returned by event discovery and that
   `/api/v1/progression/me` plus the first all-time standings page return safe
   progression fields. Do not place an access token, player UUID, or private
   profile response in committed files or captured output.

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
of Codex[GPT-5], Codex[GPT-5.6 Sol], Codex[gpt-5.6-sol], and
Codex-CLI[gpt-5.6-sol medium].
