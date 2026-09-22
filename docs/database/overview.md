---
title: 'Database structure and relationships'
---

# Database structure and relationships

For a presentation walkthrough, open the [Database relationship diagrams](../architecture/diagrams/database-relationships.md).

## Purpose and motivation

PostgreSQL/PostGIS is Wits Quest's authoritative persistent data layer. It was
selected because the product needs relational integrity, transactions,
concurrency controls, durable gameplay history, and server-side geospatial
distance calculations. [ADR-003](../architecture/decisions/ADR-003-postgresql-postgis.md)
records the decision, alternatives, benefits, and costs.

The browser never connects to the database. The Fastify API uses `pg`,
parameterised SQL, constraints, indexes, locks, and transactions to enforce
protected state. There is no ORM or backend-as-a-service-generated application
API in the current repository.

## Schema areas

| Area                   | Principal relations and responsibility                                                                                                                                                                                                                                                                                                                          | Detailed reference                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and lifecycle | `players` maps the validated Auth0 issuer/subject pair to a local UUID, role, lifecycle state, and optional Player Name. `account_deletion_requests` records the minimal backend lifecycle workflow state.                                                                                                                                                      | [Player identity and Player Names](./player-schema.md), [account deletion retention](./account-deletion-retention.md), and the [Auth0 ADR](../architecture/decisions/ADR-005-auth0-authentication.md)                                                                                                                                         |
| Events and location    | `events` stores publication, availability, WGS 84 `geography(Point, 4326)`, radius, and lifecycle data. `movement_evidence` stores short-lived, active-use claims with explicit expiry; `movement_eligibility_decisions` stores the corresponding immutable journey audit for the same bounded lifetime. A GiST index supports spatial work.                    | [Event schema](./event-schema.md), [eligibility calculation](./event-eligibility.md), and [privacy-limited movement evidence](./movement-evidence.md)                                                                                                                                                                                         |
| Automatic placement    | Immutable policy versions, reviewed PostGIS coverage zones and candidate sites, portable-event approvals, plans, assignments, bounded overrides, state versions, and audit history provide the persistence boundary for automatic event rotation.                                                                                                               | [Automatic event placement persistence](./automatic-event-placement-persistence.md) and [placement policy](../requirements/automatic-event-placement-policy.md)                                                                                                                                                                               |
| Challenges             | Multiple-choice and ordering definitions, private answer keys, attempts, immutable format-specific snapshots, and locked answers support one timed five-question attempt per player/event.                                                                                                                                                                      | [Challenge, reward, and card persistence](./challenge-reward-persistence-design.md) and [API contract](../architecture/challenge-attempt-api-contract.md)                                                                                                                                                                                     |
| Rewards and collection | Event completions, progression awards, retained card-reward outcomes, 30 ordinary card definitions, owned copies, ordered moves/effects, fixed evolution relationships, immutable evolution receipts/consumption snapshots, and starter grants preserve authoritative and retry-safe reward state; retired wallets and coin-ledger rows remain historical only. | [Complete card catalogue](../design/basic-card-roster.md), [card evolution rules](../requirements/card-evolution-rules.md), [challenge, reward, and card persistence](./challenge-reward-persistence-design.md), [player progression](./player-progression-persistence.md), and [account deletion retention](./account-deletion-retention.md) |
| Saved decks            | Player decks, exact owned-copy membership, and active selection enforce ownership and composition through composite keys plus API validation.                                                                                                                                                                                                                   | [Saved-deck persistence](./saved-deck-persistence-design.md)                                                                                                                                                                                                                                                                                  |
| CPU matches            | Match rows, immutable card snapshots, rounds, actions, submissions, versions, timers, and final results support transactional server-controlled battles and private history.                                                                                                                                                                                    | [CPU match persistence](./cpu-match-persistence-design.md)                                                                                                                                                                                                                                                                                    |
| Player progression     | Versioned point rules, immutable source awards, Johannesburg activity days, streaks, data-driven achievements, and indexed all-time/monthly totals support deterministic profiles and standings.                                                                                                                                                                | [Player progression persistence](./player-progression-persistence.md) and [progression rules](../requirements/player-progression-rules.md)                                                                                                                                                                                                    |
| Ordered trails         | Trail definitions and unique ordered event membership provide immutable publication history. Player progress is derived from authoritative event completions rather than a mutable cursor.                                                                                                                                                                      | [Ordered trail persistence](./ordered-trails-persistence.md) and [trail rules](../requirements/ordered-trails-rules.md)                                                                                                                                                                                                                       |
| Asynchronous PvP       | Invitation, immutable deck-snapshot, private match-state, idempotency-receipt, action-history, terminal-result, and participant progression relations preserve asynchronous battle authority.                                                                                                                                                                   | [Asynchronous PvP persistence](./asynchronous-pvp-persistence.md) and [API contract](../architecture/asynchronous-pvp-api-contract.md)                                                                                                                                                                                                        |
| Live PvP               | Durable two-participant state, immutable battle-ready snapshots, one-minute deadlines, participant connection generations, hashed tickets, idempotency receipts, spectator-safe transition history, and terminal completion sources support reconnectable live battle authority.                                                                                | [Live PvP persistence](./live-pvp-persistence.md) and [API contract](../architecture/live-pvp-api-contract.md)                                                                                                                                                                                                                                |
| Ranked competition     | Seasonal ratings, private queue leases and proposals, immutable ranked-live matchmaking receipts, paired settlement ledgers, and closed-season standing archives provide the persistence boundary for rated live PvP.                                                                                                                                           | [Ranked competition storage](./ranked-competition-persistence.md) and [ranked-v1 policy](../requirements/ranked-competition-policy.md)                                                                                                                                                                                                        |
| Contested territory    | Independently versioned PostGIS territory zones, exactly-once ranked contribution decisions, append-only influence, immutable settlement receipts/totals, ownership state history, and a rebuildable current-owner projection persist the Advanced zone-control state without storing precise location claims.                                                  | [Contested-campus territory persistence](./contested-campus-territory-persistence.md) and [territory-v1 policy](../requirements/contested-campus-zone-policy.md)                                                                                                                                                                              |
| Trust and review       | Private immutable derived signals, policy-versioned score snapshots, versioned cases, safe evidence summaries, append-only decisions, bounded restrictions, appeals, and retention/account-deletion primitives preserve explainable trust governance without copying sensitive source payloads.                                                                 | [Longitudinal trust persistence](./trust-persistence.md) and [trust policy](../requirements/longitudinal-trust-policy.md)                                                                                                                                                                                                                     |
| Authoring and audit    | Five-state lifecycle columns, versions, provenance, constraints, and triggers protect curated content; `author_content_audit` records versioned Author actions.                                                                                                                                                                                                 | [Author curation contract](../architecture/author-curation-api-contract.md), [Challenge, reward, and card persistence](./challenge-reward-persistence-design.md#event-authoring-lifecycle), and [Event schema](./event-schema.md#author-publication-lifecycle)                                                                                |

Accepted choices and correct ordering positions are kept in the `private`
schema rather than normal public read relations. Player-facing active-attempt
queries do not expose correct answers, explanations, correctness, score, or
rewards. Completed review data is reconstructed only after authoritative
finalisation from persisted snapshots and locked answers.

## Reading the schema and relationships

Start with the domain table above, then follow the diagrams and detailed field
references below. These documents describe the application schema; the ordered
[migration source](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/src/branch/main/database/migrations)
is authoritative for exact SQL types, constraints, indexes and later alterations
through `0053_persist_contested_territory.sql`, including the issue `#257`
trust-persistence update, issue `#263` ranked-persistence update, issue `#258`
forward trust hardening, and issue `#268` contested-territory persistence.

| Schema question                                                                   | Canonical reference                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which event fields and spatial constraints determine availability?                | [Event fields and ER diagram](event-schema.md), [eligibility](event-eligibility.md)                                                                                                                                                                                                                                                                                                                                                                     |
| How do identity, Player Names and lifecycle retention relate?                     | [Player schema](player-schema.md), [deletion and retention](account-deletion-retention.md)                                                                                                                                                                                                                                                                                                                                                              |
| How do challenges, questions, snapshots, answers, rewards and owned cards relate? | [Challenge/reward fields and ER diagram](challenge-reward-persistence-design.md)                                                                                                                                                                                                                                                                                                                                                                        |
| How do saved decks refer to individual owned copies?                              | [Saved-deck fields, ownership keys and ER diagram](saved-deck-persistence-design.md)                                                                                                                                                                                                                                                                                                                                                                    |
| How are authoritative CPU and two-player matches recorded?                        | [CPU match schema](cpu-match-persistence-design.md), [asynchronous PvP schema](asynchronous-pvp-persistence.md), [live PvP schema](live-pvp-persistence.md)                                                                                                                                                                                                                                                                                             |
| How are points, achievements and trails persisted?                                | [Progression schema](player-progression-persistence.md), [ordered trails](ordered-trails-persistence.md)                                                                                                                                                                                                                                                                                                                                                |
| How do later systems extend the schema?                                           | [Campaigns](campaign-scheduling-persistence.md), [movement evidence](movement-evidence.md), [question analytics](question-performance-analytics.md), [ranked competition](ranked-competition-persistence.md), [contested territory](contested-campus-territory-persistence.md), [trust persistence](trust-persistence.md), [offline contract](../architecture/offline-challenge-play.md), [evolution receipts](../requirements/card-evolution-rules.md) |
| How is schema deployed safely?                                                    | [Neon/PostGIS setup](neon-postgis-setup.md), [migration and release procedure](database-release-procedure.md), [seed policy](basic-demo-seed.md)                                                                                                                                                                                                                                                                                                        |

The [September database review](architecture-review-2026-09.md) records a dated
inspection, relationship rationale and index findings. Its table counts describe
that inspection, not the latest production schema. This documentation audit
neither inspected production rows nor applied migrations.

## Integrity and authority

The database reinforces, but does not replace, API rules:

- foreign and composite keys keep ownership relationships within one player;
- unique and partial unique indexes enforce one-time or one-active invariants;
- check constraints protect states, ranges, timestamps, and vocabulary;
- triggers protect published or completed immutable records and lifecycle
  transitions that span rows;
- transactions keep attempts, rewards, decks, and matches atomic;
- row locks and submission identifiers serialize or deduplicate concurrent
  protected operations; and
- PostGIS calculates event and cross-sample distances in metres from
  authoritative event points and validated reported-location claims; server
  receipt time supplies the journey interval.

The browser may submit identifiers and intended actions. It cannot assert
player ownership, accepted answers, correctness, reward values, card metadata,
deck totals, random outcomes, or a match result.

## Migrations and seeds

SQL migrations live in `database/migrations` and load in full filename order.
The repository migration runner:

1. acquires a PostgreSQL advisory lock;
2. creates and reads `public.schema_migrations`;
3. verifies the SHA-256 checksum of every previously applied migration;
4. applies each new file in its own transaction; and
5. rolls back a failed file without rewriting migration history.

Applied migrations are immutable. A later correction is a new migration, not
an edit to an applied file or the migration-history table. Filenames are the
identity, so the two historical `0019_...` files remain distinct and ordered by
their complete names.

Repeatable catalogue, Basic demonstration, and verified event seeds live in
`database/seeds`. The Basic fixtures remain development/test content unless a
separate production decision is approved. The issue `#165` event pack is an
explicit, separately guarded seed with stored source evidence and an outstanding
independent factual/presentation review; see
[Verified Wits event content](./verified-event-content.md).

Migration `0027_create_ordered_trails.sql` follows progression migration `0026`.
Migration `0029_curate_author_content_lifecycle.sql` then preserves the trail
audit entity while extending events, challenges, questions, and cards. It
backfills existing published and retired content with `legacy` provenance,
while repeatable repository seeds explicitly use `controlled_seed`. It does not
rewrite trails, historical gameplay, or progression rows.

Migration `0030_create_campaign_scheduling.sql` adds curated campaign schedules,
event/trail membership, overlap and retirement guards, and shared effective
availability functions. It preserves existing standalone content behavior and
does not rewrite attempts, completions, rewards, ownership, progression, decks,
or matches. See the
[campaign persistence design](./campaign-scheduling-persistence.md).

Migration `0041_complete_card_catalogue.sql` installs the approved 30-card
ordinary catalogue and its ordered effect model. It separates starter, reward,
and fixed-CPU eligibility, classifies superseded definitions as historical
special content, preserves ownership and match snapshots, and makes the
repeatable card seed a readiness assertion.

Migration `0042_implement_card_evolution.sql` adds immutable, player-scoped
`card_evolution_transactions` and `card_evolution_consumptions`, extends owned
card provenance with `source_evolution_id`, and enforces one evolved grant plus
exactly three consumption snapshots per transaction. Composite keys bind the
receipt to the authored source/target relationship and to one player. Each
receipt also snapshots its granted owned-copy identifier and acquisition time,
so idempotent replay does not depend on that copy remaining in current
ownership. The API uses a player row lock and owned-copy locks to serialize
concurrent requests; the database rejects incomplete history and duplicate
grants.

Migration `0043_add_content_source_evidence.sql` adds constrained HTTPS source
arrays to event and question definitions. Protected Author reads expose these
review links. Player discovery and challenge-attempt contracts remain unchanged
and never serialize the source arrays or private answer keys.

Migration `0044_create_live_pvp_persistence.sql` adds the Advanced live PvP
persistence boundary: exactly two participants, immutable five-card snapshots,
current private state, one-minute deadlines, connection generations, hashed
single-use ticket records, connection-access retention, immutable transition
history, idempotency receipts, terminal results, and exactly-once completion
sources. It adds no live route, WebSocket gateway, point-award rule, seed, or
environment variable. See [Live PvP persistence](./live-pvp-persistence.md).

Migration `0045_create_event_placement_persistence.sql` adds the reviewed
PostGIS site and zone catalogue, immutable placement policies, explicit
portable-event approvals, versioned plans, current and historical assignments,
bounded overrides, and audit history. The migration does not schedule or move
events; the later placement service owns those transactions.

Migration `0046_persist_longitudinal_trust.sql` adds the private `trust-v1`
persistence boundary: immutable derived signals and score snapshots, versioned
review cases, safe evidence summaries, append-only decisions and adjustments,
bounded restrictions, appeals, retention cleanup, and account-deletion cleanup.
It stores no raw precise-location, answer, authentication, or battle payloads
and adds no scoring, enforcement, review API, or UI. See
[Longitudinal trust persistence](./trust-persistence.md).

Migration `0047_persist_ranked_competition.sql` adds `ranked-v1` seasonal
ratings, private queue/proposal state, match and rating snapshots, immutable
per-player settlements, and archived standings. It does not create matchmaking
routes, run a season worker, or rate an existing live match. See
[Ranked competition storage](./ranked-competition-persistence.md).

Migration `0048_implement_trust_scoring_and_enforcement.sql` keeps `0046`
immutable while hardening the runtime contract used by issue `#258`: trust
review decisions require a non-null resulting score snapshot, appeal-reviewer
and signal-adjustment lookups are indexed for audit/scoring queries, and the
previously undocumented trust relations receive table comments. Deterministic
score calculation and restriction enforcement remain API services; the database
continues to own persistence constraints and authoritative time.

Migration `0053_persist_contested_territory.sql` adds the `territory-v1`
persistence boundary. It copies the three reviewed `placement-v1` geometries
and provenance into independent territory definitions, records immutable
contribution and settlement evidence, versions ownership state, and maintains a
rebuildable private current-owner projection. A repeatable `0004` seed performs
the clean-install bootstrap after the placement catalogue; upgrades bootstrap
from already-seeded placement rows during the migration. Runtime location
grants, ranked match snapshots, settlement calculation, workers, APIs, and map
UI remain later work. See
[Contested-campus territory persistence](./contested-campus-territory-persistence.md).

## Environments and deployment

The repository documents separate PostgreSQL/PostGIS targets:

- `DATABASE_URL` for the normal development or authorised production target;
- `TEST_DATABASE_URL` for isolated testing; and
- disposable databases created beneath the test target for destructive
  integration and recovery checks.

The current managed provider is Neon. Connection strings stay in ignored local
configuration or protected runtime settings and must use the documented TLS
configuration. They never enter the browser bundle, Git history, screenshots,
or routine evidence.

Database migration is deliberately separate from Azure application deployment.
The Data and Infrastructure Lead runs the guarded release command, confirms the
exact database name, reviews migration and PostGIS results, and makes a separate
decision about demo seeding. Gitea Actions does not automatically mutate the
production database.

See the [Neon/PostGIS setup](./neon-postgis-setup.md),
[database release procedure](./database-release-procedure.md), and
[PostGIS recovery rehearsal](./postgis-recovery-rehearsal.md) for commands and
safety controls.

## Testing and evidence limits

The opt-in database runner applies the complete migration history to a
disposable database and exercises geospatial calculations, constraints,
transactions, concurrency, ownership, authoring lifecycles, ordered trail
derivation, asynchronous PvP persistence, live PvP persistence and concurrency,
bounded nearby discovery, and recovery. The deterministic Basic E2E
also crosses the real test database boundary.

Pull requests invoke the migration and database suites with four workers
against a per-job ephemeral PostGIS service. A separate PR job runs the
deterministic Basic E2E against its own ephemeral PostGIS service. See
[automated verification](../testing/automated-verification.md). A CI or local
test-database pass is still not proof that production migrations, backups,
restore, retention, monitoring, or provider recovery were exercised.
Production evidence must identify the target without exposing its connection
string and must be recorded by an authorised operator.

## Open operational evidence

The [September architecture review](./architecture-review-2026-09.md) records
live metadata findings, the duplicate-index cleanup, nullable-field decisions,
and follow-up storage and query-plan work.

The schema, motivation, migration mechanism, release procedure, and disposable
database tests are documented. The repository does not yet contain final
provider backup/point-in-time-recovery guarantees, a completed production
restore result, an application performance baseline for queries, or final
retention/observability evidence. Those topics should receive dated operational
records when the team performs them; they are not inferred from the existence
of Neon or from a passing local suite.

## AI declaration

This database overview was generated, edited, and reviewed with the assistance
of Codex[GPT-5], Codex-CLI[gpt-5.6-sol medium],
Codex-CLI[GPT-5.6 Sol], Codex[gpt-5.6-sol], and ChatGPT-Web[GPT-5.6 Sol]. It
was reconciled with the current migrations, runner, tests, and existing schema
and release documents.

Sprint 2 schema navigation updated with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

Ranked schema navigation updated with assistance from Codex[GPT-5.6 Sol].
