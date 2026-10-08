---
title: 'Apply database migrations safely'
---

# Apply database migrations safely

This procedure prepares the PostgreSQL/PostGIS database used by the Wits Quest
API. It remains operator-run for rehearsals and manual releases. For a validated
push to `main`, the Gitea `deploy-api` job runs the same guarded production
release before deploying the API; it never seeds demonstration data. An API
deployment must not be treated as ready when the database release fails.

## Authority and ownership

The migration runner checks the complete recorded history before applying
pending SQL. A changed applied checksum or an applied filename absent from the
release fails before any pending migration is executed. Use the matching
complete release; do not delete migration records or edit applied files to
bypass this guard.

Migration `0065_constrain_cpu_match_json_shapes.sql` validates existing CPU JSON
outer shapes without rewriting history. Run the read-only `db:audit` command
before release and inspect `structure.cpuJsonShapes` for incompatible rows.
An incompatible row makes the migration fail transactionally; investigate its
origin instead of automatically coercing historical state. See
[production data and database quality](./data-quality-and-structure.md) for
data-origin evidence and the separate runtime/migration credential cutover.

The Data and Infrastructure Lead executes manual procedures and owns the
guarded Gitea deployment configuration. The API and Security Lead approves
production database writes and reviews secret handling. A second explicit
release decision is required before adding Basic demonstration content to
production.

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
7. applies the reusable catalogue plus exactly one explicitly selected content
   pack (`--seed-basic-demo` or `--seed-verified-events`); and
8. verifies the migration count and the selected content pack counts.

Each migration runs in its own transaction. Each seed group runs in its own
transaction. A failed stage exits nonzero and prevents later stages from
running.

The verified issue `#165` pack requires a separate production-content decision
and cannot be combined with the Basic demo flag. Its guarded verification
requires eleven current events, one hundred ten question rows and three published
trails; their shared campaign expires at the start of December 2026. See
[Verified Wits event content](./verified-event-content.md) for source coverage,
repeatability, and the outstanding manual-review gate.

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

Migration `0037_add_async_pvp_voluntary_resignation.sql` is database-first and
forward-only. It extends the asynchronous PvP terminal-reason and submission-
receipt constraints, adds the unique per-match resignation receipt, replaces
the deferred validators, and installs 25/0 progression rules. It does not alter
existing matches. Apply it before the issue `#219` API.

The Web requests the version-2 PvP representation with
`Accept: application/vnd.wits-world.pvp.v2+json, application/json;q=0.9`.
Because `Accept` is CORS-safelisted, it requires no new preflight allow-list
entry. Before the new API is live, the old API can serve the JSON fallback and
the Web treats an absent `canResign` as unavailable. Before the new Web is live,
the new API keeps the legacy match shape and rejects resignation; it returns
`PVP_CLIENT_UPDATE_REQUIRED` rather than exposing a voluntary terminal reason
to an old tab. This protects the parallel API/Web deployment window.

Deploy in database, API, then Web order. Once any voluntary resignation is
stored, do not roll the API back to a version that cannot parse that reason;
drain incompatible API instances and recover by rolling forward with migration
`0037` retained.

Migration `0039_add_async_pvp_invitation_cancellation.sql` is also database-
first and forward-only. It extends invitation lifecycle and receipt constraints
with `cancelled` / `invitation_cancel`, adds the unique per-invitation
cancellation receipt, and replaces the invitation and receipt deferred
validators. It adds no environment variable, dependency, seed, purge, or
background worker. Apply it before the issue `#220` API.

The issue `#220` Web requests
`Accept: application/vnd.wits-world.pvp.v3+json, application/vnd.wits-world.pvp.v2+json;q=0.9, application/json;q=0.8`.
An older API may use the v2/JSON fallback and the Web treats absent `canCancel`
as false. The new API omits `canCancel` for pre-v3 clients, rejects the cancel
endpoint before service invocation, and returns `PVP_CLIENT_UPDATE_REQUIRED`
instead of putting `cancelled` into a pre-v3 invitation page. This supports the
existing independently scheduled API/Web deployment jobs, while database, API,
then Web remains the recommended order.

Once any cancellation is stored, do not roll the API back to a version that
cannot parse `cancelled`. Retain `0039`, drain incompatible API instances, and
roll forward. A Web rollback remains safe because pre-v3 lists fail closed on
pages containing the new state and cannot initiate cancellation.

Migration `0042_implement_card_evolution.sql` is database-first and additive.
It installs immutable evolution receipts and consumption snapshots, then
extends `player_cards` with evolution provenance. Apply it before deploying the
API that registers the evolution routes. Existing API instances continue to use
the prior ownership kinds during the short database-to-API window. Deploy the
matching Web parser before players can receive evolved cards so collection
responses remain readable; the separate evolution UI may follow independently.
No new environment variable, dependency, seed, purge job, or content backfill is
required. If the API release fails after migration, retain `0042` and roll
forward; do not remove its provenance column or immutable history tables.

Migration `0044_create_live_pvp_persistence.sql` is database-first, additive,
and forward-only. It creates the durable live-PvP match, participant, snapshot,
state, transition, ticket-digest, connection-access, idempotency-receipt, and
completion-source relations required by issue `#251`. Existing API versions do
not query these relations, so the database-to-runtime window exposes no new
route and requires no WebSocket support. Apply `0044` before deploying the
issue `#253` realtime gateway. No new dependency, seed, environment variable,
or live-PvP point-award rule is introduced. The provisional 24-hour transient
ticket/access retention value must be confirmed by the issue `#251` reviewer;
it is stored through indexed `purge_after` values. Migration
`0044` supplies a retry-safe purge function but does not schedule it.

Once `0044` is applied, keep it in migration history. If persistence defects are
found, stop the unreleased live gateway if necessary and correct the schema with
a later migration. Do not drop the new authoritative history or edit the applied
file. Rehearsal must confirm both the first application and an immediate second
run that skips `0044` with the stored checksum unchanged.

## Longitudinal trust migration `0046`

Migration `0046_persist_longitudinal_trust.sql` is additive and persistence-only.
It creates private `trust-v1` relations, constraints, indexes, append-only audit
guards, retention cleanup, and account-deletion cleanup. It adds no Fastify
routes, score calculation, reviewer UI, or gameplay restriction enforcement.

Apply `0046` before deploying issue `#258` scoring/enforcement code. The
migration can be deployed while the current application ignores the new trust
relations. `private.purge_expired_trust_data(...)` is retry-safe. The issue #258
API runtime invokes it from the trust maintenance scheduler at startup and on the
configured maintenance cadence; deployment verification must confirm that cleanup
runs successfully before relying on the documented retention limits.

After `0046` is applied, keep its migration checksum immutable. Fix later defects
with a new forward migration rather than editing `0046`.

## Ranked competition migration `0047`

Migration `0047_persist_ranked_competition.sql` adds the versioned `ranked-v1`
season, rating, queue, proposal, match-snapshot, settlement, and archive
relations. Apply it before deploying issue `#266` ranked matchmaking/settlement
services. It creates no ranked HTTP routes, season, worker schedule, or rating
changes for existing live matches, so the current casual live API continues to
work unchanged. See [Ranked competition storage](ranked-competition-persistence.md)
for transaction and privacy boundaries.

The new deferred terminal-match guard applies only to live matches with an
accepted ranked matchmaking receipt: when the ranked runtime is deployed, its
terminal transition and both ratings must commit in one transaction. Rehearse
the first migration and checksum-safe rerun against the separate test target;
do not treat a test pass as a production application. Correct applied-schema
defects only with a later migration.

## Longitudinal trust scoring migration `0048`

Migration `0048_implement_trust_scoring_and_enforcement.sql` is the forward
hardening migration for issue `#258`. Apply it before the matching API runtime.
It makes the already-trigger-required decision snapshot reference explicitly
non-null, adds trust audit/scoring indexes and table comments, adds the nullable
privacy-limited offline-submission canonical digest used for replay conflict
detection, and stores the canonical submitted CPU action separately from any
server-authoritative timeout substitution. Precise location values are excluded
from the offline digest. It does not backfill scores, generate signals, or create
automatic restrictions.
The API runtime starts the configurable trust maintenance sweep only after
application startup succeeds.

After deployment, verify `0048` is recorded once, the API starts without schema
errors, and the trust-focused database integration suite passes. Do not edit
`0046`, `0047`, or `0048` after publication; follow-up defects require the next
additive migration.

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
   `0028` before deploying the API and compatible Web build. For `0037`, confirm
   the new reason, receipt index, deferred validators, and progression rules,
   then smoke-test resignation from both viewer perspectives without logging
   player identifiers. For `0039`, confirm the status/receipt constraints,
   cancellation index, and deferred validators, then smoke-test challenger-only
   cancellation, recipient terminal visibility, replay, and absence of a match
   without logging player UUIDs or private snapshots. For `0034`, confirm
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
- initiating and supervising any manual deployment outside the guarded Gitea
  `main` workflow; and
- authenticated deployed-event verification.

## Contested territory migration `0053`

Migration `0053_persist_contested_territory.sql` is database-first, additive,
and persistence-only. It creates the immutable `territory-v1` policy snapshot,
separately versioned PostGIS zone definitions, private contribution and
settlement ledgers, immutable ownership versions, and the rebuildable current
ownership projection. It introduces no HTTP route, location-grant runtime,
settlement worker, owner reward, map UI, dependency, or environment variable.

On an existing database whose `placement-v1` catalogue is already seeded, the
migration copies the three reviewed zone geometries and provenance immediately.
On a clean database migrations run before seeds, so `0004_territory_catalogue.sql`
invokes the same idempotent bootstrap after `0003_event_placement_catalogue.sql`.
The bootstrap never updates lifecycle state on an existing territory row; a
later placement suspension or retirement therefore cannot silently move or
reactivate territory.

Apply `0053` before issue `#270` territory services. Rehearse both the upgrade
path and a clean migration-plus-seed path against the disposable test target.
After application, retain the migration checksum and correct defects with a new
forward migration. Do not edit a published territory definition to move a
boundary: create a new reviewed territory-zone version and retire the old one.
The settlement runtime must keep the documented player-before-zone lock order
and serialize contributions and settlement on the same zone row; accepted
contribution timestamps are sampled only after that zone lock is held. The
database keeps contribution, receipt, total, and ownership history append-only
and account deletion clears only the current owner projection by appending a new
unowned version.

## Contested territory runtime migration `0054`

Migration `0054_implement_contested_territory_runtime.sql` is the additive
forward migration for issue `#270`; do not fold its runtime changes back into
`0053`. Apply `0053` first, then `0054`, before deploying the API that accepts
ranked territory claims. `0054` adds short-lived private zone grants, immutable
ranked-match territory snapshots, season-close receipts, owner-bonus snapshots
and decisions, and the database validation needed for final partial settlement
windows. It replaces selected validation trigger functions forward so ordinary
settlements remain one full Johannesburg-aligned cadence while a closing season
may commit exactly its remaining partial window.

The migration stores no grant latitude, longitude, or reported accuracy. Grant
cleanup may delete expired transient rows after the policy retention bound, while
accepted contribution, settlement, ownership, season-close, and awarded-bonus
evidence remains immutable. Rehearse migration `0054` through the normal
`migrations.test.ts` path and the focused territory disposable-database suite;
leave the complete database integration matrix to Gitea CI. A correction after
`0054` has merged must use the next additive migration rather than changing
either published territory migration.

## Permanent account-deletion migrations `0062` and `0063`

Apply `0062_detach_deleted_player_history.sql` and
`0063_purge_deleted_player_progression.sql` in order before deploying the API
that physically removes `public.players` rows. `0062` creates UUID-only
historical actor keys and retargets shared, author, and moderation references;
player-owned tables keep account foreign keys. `0063` expands the guarded purge
to personal progression, completed challenge and CPU state, rankings, and
territory grants. Review the migration against a disposable full-schema test
database, including a deletion with retained shared history. Roll out the API
only after both migrations succeed. Auth0 deletion still occurs through the
existing retrying application workflow, never as a migration side effect.
The migration also removes legacy `deleted` player tombstones and their retained
personal progression; rehearse that backfill with a copy of representative data.

This procedure was planned, generated, edited, and verified with the assistance
of Codex[GPT-6], Codex[GPT-5], Codex[GPT-5.6 Sol], Codex[gpt-5.6-sol], and
Codex-CLI[gpt-5.6-sol medium], and ChatGPT-Web[GPT-5.6 Sol].

Page title clarified with assistance from Codex-CLI[GPT-6].
