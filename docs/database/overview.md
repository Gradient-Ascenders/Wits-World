---
title: Database overview
---

# Database overview

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

| Area                   | Principal relations and responsibility                                                                                                                                                                     | Detailed reference                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and lifecycle | `players` maps the validated Auth0 issuer/subject pair to a local UUID, role, lifecycle state, and optional Player Name. `account_deletion_requests` records the minimal backend lifecycle workflow state. | [Player identity and Player Names](./player-schema.md), [account deletion retention](./account-deletion-retention.md), and the [Auth0 ADR](../architecture/decisions/ADR-005-auth0-authentication.md)                                                          |
| Events and location    | `events` stores publication, availability, WGS 84 `geography(Point, 4326)`, radius, and lifecycle data. A GiST index supports spatial work.                                                                | [Event schema](./event-schema.md) and [eligibility calculation](./event-eligibility.md)                                                                                                                                                                        |
| Challenges             | Multiple-choice and ordering definitions, private answer keys, attempts, immutable format-specific snapshots, and locked answers support one timed five-question attempt per player/event.                 | [Challenge, reward, and card persistence](./challenge-reward-persistence-design.md) and [API contract](../architecture/challenge-attempt-api-contract.md)                                                                                                      |
| Rewards and collection | Event completions, retained card-reward outcomes, wallets, coin ledger entries, card definitions, owned card copies, moves/effects, and starter grants preserve authoritative and retry-safe reward state. | [Challenge, reward, and card persistence](./challenge-reward-persistence-design.md) and [account deletion retention](./account-deletion-retention.md)                                                                                                          |
| Saved decks            | Player decks, exact owned-copy membership, and active selection enforce ownership and composition through composite keys plus API validation.                                                              | [Saved-deck persistence](./saved-deck-persistence-design.md)                                                                                                                                                                                                   |
| CPU matches            | Match rows, immutable card snapshots, rounds, actions, submissions, versions, timers, and final results support transactional server-controlled battles and private history.                               | [CPU match persistence](./cpu-match-persistence-design.md)                                                                                                                                                                                                     |
| Player progression     | Versioned point rules, immutable source awards, Johannesburg activity days, streaks, data-driven achievements, and indexed all-time/monthly totals support deterministic profiles and standings.           | [Player progression persistence](./player-progression-persistence.md) and [progression rules](../requirements/player-progression-rules.md)                                                                                                                     |
| Ordered trails         | Trail definitions and unique ordered event membership provide immutable publication history. Player progress is derived from authoritative event completions rather than a mutable cursor.                 | [Ordered trail persistence](./ordered-trails-persistence.md) and [trail rules](../requirements/ordered-trails-rules.md)                                                                                                                                        |
| Authoring and audit    | Five-state lifecycle columns, versions, provenance, constraints, and triggers protect curated content; `author_content_audit` records versioned Author actions.                                            | [Author curation contract](../architecture/author-curation-api-contract.md), [Challenge, reward, and card persistence](./challenge-reward-persistence-design.md#event-authoring-lifecycle), and [Event schema](./event-schema.md#author-publication-lifecycle) |

Accepted choices and correct ordering positions are kept in the `private`
schema rather than normal public read relations. Player-facing active-attempt
queries do not expose correct answers, explanations, correctness, score, or
rewards. Completed review data is reconstructed only after authoritative
finalisation from persisted snapshots and locked answers.

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
- PostGIS calculates event distance in metres from authoritative event points
  and validated reported-location claims.

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

Repeatable catalogue and Basic demonstration seeds live in `database/seeds`.
They are development/test fixtures unless a separate production seeding
decision is approved. The Great Hall coordinates, radius, and dates are
provisional integration data rather than accepted event content.

Migration `0027_create_ordered_trails.sql` follows progression migration `0026`.
Migration `0028_curate_author_content_lifecycle.sql` then preserves the trail
audit entity while extending events, challenges, questions, and cards. It
backfills existing published and retired content with `legacy` provenance,
while repeatable repository seeds explicitly use `controlled_seed`. It does not
rewrite trails, historical gameplay, or progression rows.

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
derivation, bounded nearby discovery, and recovery. The deterministic Basic E2E
also crosses the real test database boundary.

These suites are not currently invoked by the normal Gitea CI workflows. A
local or test-database pass is also not proof that production migrations,
backups, restore, retention, monitoring, or provider recovery were exercised.
Production evidence must identify the target without exposing its connection
string and must be recorded by an authorised operator.

## Open operational evidence

The schema, motivation, migration mechanism, release procedure, and disposable
database tests are documented. The repository does not yet contain final
provider backup/point-in-time-recovery guarantees, a completed production
restore result, an application performance baseline for queries, or final
retention/observability evidence. Those topics should receive dated operational
records when the team performs them; they are not inferred from the existence
of Neon or from a passing local suite.

## AI declaration

This database overview was generated, edited, and reviewed with the assistance
of Codex[GPT-5], Codex-CLI[gpt-5.6-sol medium], and Codex[gpt-5.6-sol]. It was reconciled with the
current migrations, runner, tests, and existing schema and release documents.
