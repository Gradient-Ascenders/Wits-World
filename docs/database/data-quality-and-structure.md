---
title: 'Production data and database quality'
---

# Production data and database quality

## Assessment scope

Milestone 4 gives Data 3%, Deployment 2%, and Structure 5%. Its questions concern
usable production data, the amount originating from testing, deployed database
availability, and database-type best practices. It does not prescribe a minimum account/table count or detailed
percentage bands. The gates below are engineering and evidence targets for a
strong full-mark submission, not a promise of a tutor's score.

This reference separates catalogue/content, player-generated activity, retained
history, and test fixtures. A seeded production catalogue is legitimate game
content. Stored activity on a production host is not automatically evidence of
ordinary use. Retired rows can be necessary historical records, not junk.

## Observed baseline: 8 October 2026

The read-only Neon inspection at 13:07 UTC examined the configured normal
`DATABASE_URL` target, `neondb`. Its 65 applied migration names and checksums
matched merged revision `b7e1bac735e05feb0cf97f4558e5bf3a44ff1d96`.
Later merged revision `035cde031bad6f0085faab8b41cee15fb0a11824` changed
connection handling/observability, not those migration files. The initial
inspection was read-only; the separately authorised content and schema changes
below were committed later that day. No production schema migration was applied
during that initial inspection.

| Area              | Observed data                                                                                | Interpretation                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cards             | 41 definitions; 30 active/published; 11 retired                                              | The approved 30-card catalogue is usable content. Keep referenced historical definitions.                                                                                                                    |
| Events            | 48 total; 18 demo/test-labelled; 6 in their own published schedule window                    | All 6 schedule-window events carried fixture labels. Campaign and placement eligibility was not included in this baseline query. 18/48 = 37.5% of event rows were labelled, not 37.5% of the whole database. |
| Questions         | 299 total; 282 published; 210 with source URLs                                               | 30 published questions belonged to those schedule-window events; those 30 had no source URLs.                                                                                                                |
| Trails            | 4 total; all retired                                                                         | No trail was published.                                                                                                                                                                                      |
| Accounts/activity | 5 active accounts, 9 event completions, 35 completed CPU matches, 41 completed async matches | Real persisted interactions exist; these counts alone do not establish whether they came from QA or ordinary play.                                                                                           |
| Live PvP/trading  | 0 live matches; 2 expired trades; 0 recorded trade movements                                 | Do not present these as evidence of completed live battles or exchanges.                                                                                                                                     |
| Schema            | 137 application tables, 311 validated foreign keys                                           | The advanced systems justify separate entities, receipts and history. Table count alone does not indicate poor normalisation.                                                                                |

These are a dated snapshot after account cleanup, not lifetime usage totals.
The labels are an audit signal: independent review still determines a content
row's intended purpose. The generic report cannot certify every answer, source,
coordinate, or end-to-end player journey.

## Authorised content cleanup: 8 October 2026

After the operator confirmed keeping all five accounts and preserving historical
attempts/rewards, a single transaction committed to the configured Neon `neondb`
target at **14:57:17 UTC**. A successful rollback-only rehearsal preceded it.
At execution, the applied SQL came from the local, uncommitted branch based on
`035cde031bad6f0085faab8b41cee15fb0a11824`; this is a manual content operation,
not evidence that the branch, API code or pending migration was deployed.

| Content file                                                              | SHA-256 at execution                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `database/seeds/verified-events/0001_verified_wits_events.sql`            | `7f3904149c63aaddfa4f9bca01f28d0121222e223e684fec643df6e87967a656` |
| `database/seeds/verified-events/0002_active_campus_events_and_trails.sql` | `8c0d3487e17d6ea858124d7f3ed845bd97aeeea49d0a4c9ba6ea80064728e238` |
| `database/maintenance/2026-10-08_retire_demo_content.sql`                 | `605bba3b7b58f4e4cd3cf485637768283e6ec9da3519e11ce2a542fad5a3491f` |

The maintenance file uses an explicit reviewed fixture-ID allowlist and checks
the expected label before acting. It is operator-only, not part of routine
seeding. Published campaigns/trails are retired before their members. Published
fixture events, challenges and questions are retired through normal lifecycle
transitions; unused drafts are deleted only if their lifecycle and references
permit it. No history triggers, foreign keys or constraints were disabled.

The post-commit read-only audit at **14:57:52 UTC** recorded:

| Area                                 | Before                  | After                                                                |
| ------------------------------------ | ----------------------- | -------------------------------------------------------------------- |
| Player-available events              | 6, all fixture-labelled | 11, none fixture-labelled; all sourced and with ready question pools |
| Player-available published questions | 30, without sources     | 110 sourced rows, representing 100 distinct definitions              |
| Published trails                     | 0                       | 3, covering all 11 events in ordered groups of 4, 4 and 3            |
| Current scheduled content            | Fixture/demo content    | One campaign, `Campus Discovery: Spring 2026`, including MSL         |
| Reviewed fixture event rows          | 18                      | 15 protected/unavailable rows; 3 unused drafts deleted               |
| Stored events / questions / trails   | 48 / 299 / 4            | 56 / 408 / 7, including archived source content and history          |

The current events and trails expire at `2026-12-01T00:00:00+02:00`, exclusively,
so they remain available through the end of 30 November in South African time.
This is a game-content window, not a promise about building opening hours.

A read-only follow-up at **14:59:19 UTC** confirmed 11 available events and
3 trails at `2026-11-30T23:59:59+02:00`, and zero of each at the exclusive end
boundary. It also confirmed that the 15 retained fixture events consist of
14 retired rows and one unpublished protected draft.

The five player accounts, 533 owned cards, 9 challenge attempts, 9 completions,
39 CPU matches and 41 async matches retained exactly the same row IDs and counts
across the transaction. Existing reward records and match snapshots were not
rewritten. Two retained completions reference a confirmed demo event: at least
2/9 (22.2%) of completion rows therefore have fixture-content provenance.
That is not a whole-database test percentage or proof about other activity.

Cleanup means **no active player-facing fixture content**, not physically erasing
every test-labelled row. Immutable historical definitions, a protected
unpublished draft, the retained account's test-named deck, and an already-revoked
test credential remain. Retained references prevented that draft's deletion,
and a draft-to-retired transition is not permitted by the current
lifecycle. Do not fabricate publication or bypass safeguards to hide this row.
The already-retired Test card and demo trail also remain historical definitions.

Correction to the initial deployment interpretation: inspection at 14:43 UTC
found the eleven older v2 replacement events already installed but retired,
along with retired trails. Uncommitted source files did not establish that those
rows were absent from Neon. The new v3 pack uses new event, challenge, question,
choice, ordering-item, trail and campaign identities; it does not republish or
rewrite those archived v2 rows. Original v1 questions remain the canonical
source catalogue for repeatable cloning, not available questions on retired
parent events.

## Data: remaining acceptance work

1. **Review and merge the matching content source.** The authorised v3 pack is
   now installed on Neon, but its source/runbook changes remain unmerged. Review
   and merge this branch so future releases reproduce the installed content.
   Its player availability and playable pools were measured after commit, not
   inferred from stored-row totals. See the
   [content review gate](./verified-event-content.md) and
   [release procedure](./database-release-procedure.md).
2. **Review factual and location quality.** Independently check every question's
   answer/explanation, ordering years, location, radius, and trail order against
   recorded sources. Record the actual reviewer/date/result. Verify map access,
   random non-repeating five-question selection, reward issuance, and trail
   progress through the deployed application. More question rows do not replace
   this acceptance evidence.
3. **Separate and account for QA.** Routine automated tests stay on disposable
   PostGIS databases; development/QA uses the separate test target. Classify
   retained dedicated QA accounts using an operator-reviewed private register.
   Ordinary-play accounts need affirmative evidence too. Mixed-use or uncertain
   accounts remain unknown; do not retrospectively invent an origin for their
   activity. Account-based classification does not distinguish mixed-origin
   actions within one account.
4. **Gather actual normal-play evidence.** Run real consenting participant
   journeys and retain their genuine resulting activity. Link anonymised
   feedback and retests to the corresponding change records. Do not generate
   artificial accounts, completions or matches to increase this criterion's
   counts. Absence of a row after the account purge is not proof the feature was
   never tested; link existing dated evidence separately.
5. **Complete the final measured breakdown.** The post-content aggregate audit
   is recorded above. Repeat it after the approved schema/credential release or
   genuinely new acceptance activity. Record the observation time, environment,
   revision, source/applied migrations, reviewed classification date, and counts
   by entity. Show both confirmed test and unclassified rows. Do not combine
   different row types or storage bytes into a misleading single percentage.

No further catalogue expansion is required to address the observed gap. Demo
retirement must preserve attempts, rewards and match references; deleting all
retired rows or renaming fixtures is not a substitute for accepted content.

## Read-only quality report

From the repository root:

```bash
npm run prepare:api
npm run db:audit --workspace @wits-world/api
```

The audit loads the normal configured URL, or `TEST_DATABASE_URL` with `--test`.
The URL's target must be confirmed by the authorised operator: the configuration
name does not prove an Azure production connection. It opens a repeatable-read,
read-only transaction, sets 8-second per-statement and 1-second lock limits,
reads aggregates/catalogue metadata, and rolls back. It never migrates, seeds,
cleans up or labels database rows. It is an on-demand snapshot, not a scheduler.

Output includes active/published content, fixture labels, source coverage,
question-pool readiness, per-entity account-origin counts, CPU JSON shapes,
constraint-validation exceptions, connected-role capabilities and migration
drift. It contains no player UUID/name, auth identity, answer key/text, precise
location, JSON battle body, connection string or password.

The `available` event count uses the API's campaign-availability and placement
resolvers. `publishedInOwnWindow` only checks publication and the event's own
schedule, so it is not interchangeable with player availability. Question-pool
readiness means at least five published questions in a published challenge;
it does not certify factual accuracy or prove a participant completed the event.

Without a register, **all account-owned rows are unknown**. A reviewed optional
register must be outside Git; an ignored local `.env.audit-classifications.json`
is another option. Its shape is:

```json
{
  "databaseHost": "<exact configured database hostname>",
  "databasePort": "5432",
  "databaseName": "neondb",
  "reviewedAt": "<actual YYYY-MM-DD review date>",
  "productionPlayerIds": [],
  "testPlayerIds": []
}
```

Replace the placeholders and include only confirmed UUIDs in the appropriate
array. Do not attach the private register to the public assessment documents.
It must match the connection's host, port and database name, use a real non-future
review date, and have no duplicate/conflicting UUIDs. A target mismatch fails
before connecting. IDs absent after account deletion are counted separately;
they are not silently treated as current accounts.

```bash
npm run db:audit --workspace @wits-world/api -- --classifications /private/path/register.json
```

For a clean machine-readable artifact, build first and invoke the CLI directly:

```bash
npm run build --workspace @wits-world/api
node apps/api/dist/database/audit.js --classifications /private/path/register.json > /tmp/wits-db-quality.json
```

For each account-owned entity, `confirmedTest / total * 100` gives the known test
share of that entity's rows. If `unknown` is nonzero, it is not a certified exact
test fraction. Empty tables can be absent from `byEntity`. Async/live match totals
are reported but deliberately not assigned one player's origin: multiple actors
and anonymised retained history need separate provenance evidence.

## Structure: implementation and deliberate choices

The review covered ownership/deck/evolution relationships, challenge snapshots,
private answer keys, trading reservations and settlement, ranked queue leases,
placement history, territory grants/settlement and account-deletion retention.
These use normalised entities, composite foreign keys, uniqueness/state checks,
transactional locking and idempotency receipts. No major relational redesign or
blanket index addition was justified. See the [schema overview](./overview.md)
and [September architecture review](./architecture-review-2026-09.md).

Two concrete repository changes strengthen the implementation:

- `0065_constrain_cpu_match_json_shapes.sql` validates object-shaped CPU states,
  card snapshots and per-action results, array-shaped round results, and nullable
  object-shaped responses/submitted intents. The read-only preflight at 13:21 UTC
  found 39 states, 390 snapshots, 460 rounds and 935 actions with compatible
  shapes. It imposes no modern field-name/move-count requirement on legacy
  snapshots, changes no battle rules, and rewrites no stored history. These are
  outer-shape checks, not a replacement for the shared rules engine's semantics.
- The migration runner validates the entire applied history before executing
  pending SQL. A changed checksum or an applied filename absent from the release
  now fails before any pending migration runs. Existing per-migration transactions,
  advisory locking and immutable checksums remain in place.

Migration `0065` was subsequently applied through the separately authorised
guarded release below. The strengthened runner was used for that manual release;
its source and the audit CLI still require review/merge before they become the
normal deployment tooling. Do not alter already-applied migrations.

Keep these intentional structures:

- Nullable deck references preserve match snapshots after deck deletion.
- Nullable Power affinity expresses genuinely typeless cards, not missing data.
- Nullable draft review/publication metadata records a real lifecycle state.
- Private historical actor anchors preserve shared outcomes after account purge
  without retaining an authenticatable player identity.
- `event_completions_retired_coin_award_check` deliberately remains `NOT VALID`:
  migration `0034` preserves immutable historical non-zero coin awards but blocks
  new ones. Blindly validating it can fail on valid retained history. It is not
  an integrity defect to conceal or a reason to rewrite those awards.

These decisions follow PostgreSQL's
[constraint rules](https://www.postgresql.org/docs/17/ddl-constraints.html),
[JSON types](https://www.postgresql.org/docs/17/datatype-json.html), and
[constraint validation behaviour](https://www.postgresql.org/docs/17/sql-altertable.html).

## Authorised schema release: 8 October 2026

The operator explicitly requested applying the pending changes to Neon. The
15:10:25 UTC read-only preflight found no changed/unexpected migration history,
only `0065_constrain_cpu_match_json_shapes.sql` pending, and zero incompatible
CPU JSON rows. Earlier focused local integration tests had already verified
malformed JSON rejection, legitimate arrays/SQL NULLs and retained history.

The guarded manual release completed at **15:12:36 UTC**, applying only `0065`
and skipping the 65 previously applied files. It used the compiled branch's
existing release/migration functions with an exact `neondb` target, verified Neon
TLS, an approved-single-migration scope guard, a 30-second statement limit and a
3-second lock limit. Each migration retained its transaction and advisory lock.
No seed files, role changes, extensions, credentials or application deployments
were applied.

The recorded checksum for `0065` is
`3a6cf08c7b82e7d7d0d9d879c305851768051c82c579067f9d666ea665d9f06c`.
Schema metadata at **15:15:43 UTC** confirmed all nine named CPU checks exist and
are validated. The aggregate audit at **15:17:31 UTC** confirmed 66 source and
66 applied migrations, with no pending, changed or unexpected entries. All
audited CPU JSON fields still had zero invalid rows. The 11 available events,
110 available question rows, 3 trails, five accounts and retained activity
counts were unchanged.

**Release dependency:** merge the matching migration source before the next
automatic API deployment. Older source with only 65 migration files fails the
release's migration-count verification against this now-66-migration database.
Do not remove the migration record or loosen the verification to hide the
mismatch. Database constraints are live; branch/API/docs publication is not.

## Normalisation follow-up review

The 8 October follow-up inspected live keys and JSON/array-column metadata,
the core card/challenge/ownership/deck relationships, and ranked, trading,
territory and analytics persistence. There are **136 domain tables plus the
migration registry**, explaining the aggregate report's 137-table count. All
domain tables have primary keys; the registry also has its `name` primary key.
There remain 311 validated foreign keys. Neither fewer tables nor fewer NULLs
is itself a normalisation target.

### Worthwhile follow-up: one canonical move-effect representation

`card_moves` retains the older scalar effect fields (`effect_type`,
`effect_value` and modifier metadata), while `card_move_effects` stores the
ordered executable effects introduced by migration `0041`. The position-1 child
is generated on move insertion, not synchronised on a later scalar update.
This is overlapping writable representation with a potential update anomaly,
not a reason to merge ownership or deck tables.

A disposable local PostGIS reproduction at **15:19:05 UTC** inserted a draft
damage move, then directly updated its scalar value from 10 to 20. The update
was accepted while its ordered child stayed at 10. The example transaction was
rolled back and its temporary database dropped; it made no Neon writes. The live
metadata snapshot contained **zero draft moves**, so this is not evidence that
current production draft moves are already inconsistent.

The current Author API is a material counterargument: `updateCard` in
`apps/api/src/cards/author-card-service.ts` locks/version-checks the draft and
deletes/reinserts children transactionally, causing the insert trigger to build
the primary effect again. Therefore the reproduction demonstrates a direct-SQL
or future-writer integrity risk, **not a demonstrated current Author-edit bug**.
Published cards are protected against content mutation.

The preferred future change is to make `card_move_effects` canonical for both
authoring and battle execution, with legacy scalar representations derived only
where compatibility requires them. Do this as a coordinated catalogue/Author
API change with publication, ordered-effects and battle-snapshot regressions.
Do not simply install an automatic mirror trigger: rich effects such as
Overcharge/self-damage cannot be losslessly represented by the older scalar
model, and overwriting ordered rows could change published gameplay. No such
refactor or migration was applied during this review.

### Optional only when needed: shared source metadata

Five relations use constrained `source_urls` arrays. Separate source records and
event/question source memberships would help if citations acquire independent
review dates, titles, ownership or URL-search requirements. That would add
relations, not reduce the table count. Preserve versioned historical evidence
rather than changing old citations through one mutable global source record.

Current arrays are read as small citation lists, not entity ownership or event
membership. There is no demonstrated workload or metadata requirement justifying
an immediate conversion. PostgreSQL's
[array guidance](https://www.postgresql.org/docs/17/arrays.html#ARRAYS-SEARCHING)
supports separate rows when individual elements become independently searched
or managed; it does not require replacing every array in this application.

### Keep deliberate snapshots and projections

Immutable challenge/battle snapshots, replay receipts, trade provenance and
policy snapshots represent historical facts, not editable copies of today's
definitions. Rating totals and current territory ownership are intentional
read projections backed by authoritative ledgers/history and validation.
Composite ownership foreign keys intentionally repeat the owner/entity scope
to enforce consistency. Removing those fields or joins can weaken guarantees.

Keep the validated atomic JSON documents for battle state and typed effect
configuration; PostgreSQL permits relational and JSON structures to coexist
and recommends predictable document shapes. See
[JSON document design](https://www.postgresql.org/docs/17/datatype-json.html#JSON-DESIGN).
The review does not certify every relation as strictly BCNF: these deliberate
historical and projection exceptions need explanation, not blanket decomposition.
Runtime/migration credential separation remains the larger operational
best-practice gap outside this normalisation follow-up.

## Structure: credential separation still required

The configured role inspection at 13:35 UTC found effective database ownership,
database/role creation rights, and CREATE access in both application schemas.
This describes the audited connection, not independently fetched Azure runtime
settings. Current `.gitea/workflows/ci.yml` reads the production API App Service's
`DATABASE_URL` and uses it to apply migrations, coupling runtime and DDL access.

Before claiming least-privilege runtime access:

1. The infrastructure/backend owners confirm the actual Azure API and direct
   notification-listener roles. Keep migration/maintenance credentials separate
   from both normal request and listener credentials.
2. Provision a restricted API login with no database ownership, role/database
   creation, or schema CREATE rights. Grant only the schema/table/function rights
   the existing API requires, including deliberately revoked private cleanup and
   settlement functions. A schema named `private` is not itself access control.
3. Update the guarded deployment release step to obtain dedicated migration
   credentials while retaining exact Neon target/TLS checks. Do this before
   switching runtime settings; otherwise the next automatic migration can fail.
4. Rehearse all relevant account-deletion, author, trading, battle, ranked,
   territory, notification and migration paths on disposable PostGIS with the
   restricted role. Demonstrate normal operations succeed and DDL is denied.
5. Perform an approved credential cutover and rerun the production aggregate
   audit. Keep secrets out of Git and submission evidence. Do not use CI passing
   under the owner role as proof that the restricted-role deployment works.

No roles, grants, credentials or deployment settings were changed in this work.
Backup/restore guarantees, runtime credentials and accepted live usage are
operational evidence, not something a new constraint can manufacture.

## Verification and release boundary

Run focused API unit tests, the CPU persistence and content suites on disposable PostGIS,
API lint/type-check/build, and documentation navigation/build checks at the end.
The CPU suite checks malformed JSON rejection, array/null compatibility, legacy
recovery, actual audit aggregates and identity-safe output. Migration regressions
check that history mismatches cannot partially apply pending files. These checks
are separate from factual content approval and participant retesting.

The final review also covered content expiry, archived-version upgrades,
repeatable cloning and cleanup safety. It found and corrected missing standalone
trail expiry by adding a scheduled campaign, and nested choice/item identifier
collisions by versioning the complete v3 content tree. Local regressions exercise
the November/December boundary and an existing v2 question/choice; a Neon
rollback rehearsal verified the installed historical state. The existing Basic
demo release checks are retained, not weakened to accommodate production cleanup.

### Executed checks: 8 October 2026

The `fix/milestone-4-database-quality` branch, uncommitted at the initial checks, is based on
`035cde031bad6f0085faab8b41cee15fb0a11824`. Checks completed on Node.js 24.15.0;
the installed npm 11.12.1 is below the repository's requested 11.18.0, so the
install reported an engine warning. No dependency or lockfile changes were made.

| Check                                                                                                                  | Result                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run prepare:api` and API lint/type-check/build                                                                    | Passed.                                                                                                                      |
| Focused unit files: `migrations.test.ts`, `database-quality-audit.test.ts`, `database-release-procedure.test.ts`       | 29 tests passed.                                                                                                             |
| Disposable local PostGIS: `cpu-match-database.integration.test.ts` and `coin-retirement-migration.integration.test.ts` | 21 tests passed in 8.08 seconds, using PostgreSQL 17.5 on local port 55434, not Neon.                                        |
| Documentation tests, lint, type-check and production build                                                             | Passed; all 5 documentation tests passed. The build's optional update-check/cache warning did not prevent static generation. |
| Compiled audit against the configured normal Neon target                                                               | Succeeded read-only at 14:05:38 UTC; no migration, seed or data changes.                                                     |

After the content/cleanup changes, the three local CPU/legacy-coin/cleanup
integration files passed **22 tests**. Following the expiry and v2 identifier
fixes, `verified-events-content.integration.test.ts` passed its **13 tests** in
7.79 seconds, with integration testing enabled against the disposable PostGIS
target. The release unit file was rerun after retaining the existing Basic demo
checks and passed all **9 tests**. API lint/type-check/build and all five docs
tests, docs lint/type-check/build also passed on the final source. None of these
integration suites used Neon; no full database-suite rerun was needed.

The initial compiled audit confirmed 6 player-available events after applying campaign
and placement rules. All 6 were fixture-labelled, none had source URLs, and
all had a published pool of at least 5 questions. There were 30 published
questions attached to available events and no published trails. This confirms
the content gap is not merely a mismatch in the earlier schedule-only count.

At the initial audit, all 9 CPU JSON fields had zero invalid rows and Neon had 65 applied
migrations with no changed or unexpected history entries; local source had 66,
with only `0065_constrain_cpu_match_json_shapes.sql` pending. Without an
operator-reviewed classification register, all 5 players, 533 owned cards,
7 decks, 9 challenge attempts, 9 event completions and 39 CPU matches remained
unclassified. These are unknown origins, not confirmed production or test use.

The focused local suites created and dropped their own temporary databases.
Neither their successful schema checks nor the read-only Neon report proves a
restricted-role cutover or participant acceptance occurred. The later production
migration is evidenced separately by the authorised release and schema checks.

The public document is published only after its branch reaches `main` and the
documentation deployment succeeds. The content pack was applied through the
separately authorised manual transaction above, and migration `0065` through the
subsequent authorised schema release. Their source and the strengthened migration
runner/audit CLI are on `fix/milestone-4-database-quality` and require review and merge.
No runtime credential cutover or API deployment was performed.

## Deployment evidence

The configured Neon database accepted the authorised content transaction and the
subsequent read-only audit, reporting PostgreSQL 17.11 and PostGIS 3.5.0. The
deployed API's root `/health` endpoint returned HTTP 200 with `status: ok` during
the 8 October checks. That endpoint establishes process health, not database
readiness; the direct Neon checks are the database evidence. Backup/restore and
restricted runtime-role operation were not demonstrated by these checks.

## Indicative rubric assessment

These are engineering estimates against the three questions on page 11 of the
project brief, not official percentage bands or guaranteed marks.

| Criterion       | Current estimated achievement | Weighted contribution | Remaining evidence or work                                                                                                                                                        |
| --------------- | ----------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data (3%)       | 90%                           | 2.70 / 3              | Usable sourced catalogue/events/trails are live; classify retained QA versus ordinary play and complete independent factual/on-site and participant acceptance evidence.          |
| Deployment (2%) | 100%                          | 2.00 / 2              | Database deployment and availability were directly verified. Keep operational/release evidence current.                                                                           |
| Structure (5%)  | 95%                           | 4.75 / 5              | New CPU shape safeguards are validated on Neon. Merge the matching source; consider the canonical move-effects follow-up and demonstrate runtime/migration credential separation. |

Before the schema release, the estimate was **9.20 / 10 (92%)**. Following the
validated release, the current indicative estimate is **9.45 / 10 (94.5%)** for
these database criteria only. Full marks still require genuine data-origin and
acceptance evidence and demonstrated least-privilege deployment. The move-effect
follow-up would improve maintainability, but no percentage increase is guaranteed
by decomposing more tables or adding synthetic play.

## AI declaration

Generated and edited with assistance from Codex[GPT-5]. Advanced relational
safeguards, content cleanup and normalisation were reviewed with assistance from
Codex-CLI[gpt-6-luna]. Observations come from the stated queries, authorised
content/schema releases and repository revisions. Participant acceptance, role
cutover and API deployment are not inferred.
