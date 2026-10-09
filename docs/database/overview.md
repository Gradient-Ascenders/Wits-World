---
title: 'Database structure and relationships'
description: The Wits Quest data model, integrity rules, migrations, and evidence limits.
---

# Database structure and relationships

Wits Quest uses PostgreSQL with PostGIS as its authoritative data store.
PostgreSQL provides relational constraints, transactions, and concurrency
control. PostGIS provides server-side distance and geometry operations.

The browser never connects to the database. The Fastify API uses parameterised
SQL and explicit transactions. The project does not use an ORM or a
backend-as-a-service tool to generate its API.

For a visual introduction, open the
[database relationship diagrams](../architecture/diagrams/database-relationships.md).
For exact SQL, use the ordered files in `database/migrations`.

## Main schema areas

| Area                           | What is stored                                                                                | Detailed guide                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity                       | Local players, roles, lifecycle state, profiles, and deletion requests                        | [Player schema](player-schema.md), [account deletion](account-deletion-retention.md)                                                                                                       |
| Events and location            | Published events, PostGIS points, access radius, movement evidence, and eligibility decisions | [Event schema](event-schema.md), [eligibility](event-eligibility.md), [movement evidence](movement-evidence.md)                                                                            |
| Challenges and rewards         | Attempts, question snapshots, locked answers, completion, reward history, and owned cards     | [Challenge and reward storage](challenge-reward-persistence-design.md)                                                                                                                     |
| Collections and decks          | Individual owned cards, evolution receipts, saved decks, and active deck selection            | [Saved decks](saved-deck-persistence-design.md), [card evolution](../requirements/card-evolution-rules.md)                                                                                 |
| Battles                        | CPU, asynchronous, live, and ranked match state and history                                   | [CPU battles](cpu-match-persistence-design.md), [asynchronous PvP](asynchronous-pvp-persistence.md), [live PvP](live-pvp-persistence.md), [ranked play](ranked-competition-persistence.md) |
| Progression                    | Points, achievements, streaks, standings, and ordered trails                                  | [Progression](player-progression-persistence.md), [trails](ordered-trails-persistence.md)                                                                                                  |
| Trading                        | Versioned offers, card reservations, approvals, receipts, and ownership movements             | [Trading](card-trading-persistence.md)                                                                                                                                                     |
| Authoring                      | Content versions, review state, campaigns, placement plans, and audit history                 | [Campaigns](campaign-scheduling-persistence.md), [placement](automatic-event-placement-persistence.md)                                                                                     |
| Trust and moderation           | Derived signals, scores, review cases, decisions, restrictions, and appeals                   | [Trust storage](trust-persistence.md)                                                                                                                                                      |
| Territories                    | Definitions, contributions, settlements, ownership, and player-safe projections               | [Territory storage](contested-campus-territory-persistence.md)                                                                                                                             |
| Analytics and developer access | Privacy-limited aggregates and hashed developer API credentials                               | [Analytics](advanced-analytics.md), [developer keys](developer-api-keys.md)                                                                                                                |

Correct answers and other protected content are stored in the `private` schema.
Active challenge responses do not expose answers, correctness, scores, or
rewards. Completed review data is returned only after server finalisation.

## Integrity and authority

The API applies domain rules. The database supports those rules with:

- foreign and composite keys for ownership;
- unique indexes for one-time or one-active records;
- check constraints for valid states, ranges, and timestamps;
- triggers for immutable records and cross-row lifecycle rules;
- transactions for atomic rewards, decks, trades, and matches;
- row locks for concurrent protected operations;
- submission IDs for safe retries; and
- PostGIS calculations for distance and geometry.

The browser may submit identifiers and intended actions. It cannot assert card
ownership, accepted answers, rewards, deck totals, match outcomes, rankings, or
territory ownership.

## Migration process

Migrations live in `database/migrations` and run in full filename order. The
migration runner:

1. acquires a PostgreSQL advisory lock;
2. reads `public.schema_migrations`;
3. checks the SHA-256 hash of each applied file;
4. applies each new file in its own transaction; and
5. rolls back a failed file.

Applied migrations are immutable. A correction must use a new migration. It
must not edit an applied file or rewrite migration history.

The current chain reaches `0065_constrain_cpu_match_json_shapes.sql`. Important
groups are:

| Range         | Main change                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `0001`–`0025` | Core identity, events, challenges, cards, decks, and CPU battles                                |
| `0026`–`0030` | Progression, trails, asynchronous PvP, content review, and campaigns                            |
| `0041`–`0045` | Full card catalogue, evolution, source evidence, live PvP, and placement                        |
| `0046`–`0054` | Trust, ranked play, and contested territories                                                   |
| `0055`–`0058` | Trading, analytics, and developer API access                                                    |
| `0059`–`0064` | Event-editor placement, portable events, trust evidence, account cleanup, and profile showcases |
| `0065`        | CPU match JSON shape constraints                                                                |

This table is a guide, not a replacement for the migration files or the
[database release procedure](database-release-procedure.md).

## Seeds

Repeatable seeds live in `database/seeds`. They provide development and test
catalogues, demonstration content, and reviewed event data. Development seeds
must not be treated as production data unless a separate release decision says
so.

The verified event pack includes stored source links, but it still needs the
documented independent factual and presentation review. See
[Verified Wits event content](verified-event-content.md).

## Environments and releases

- `DATABASE_URL` points to the normal development or authorised production
  database.
- `TEST_DATABASE_URL` points to an isolated test parent database.
- Integration tests create disposable databases under the test target.

Connection strings are secrets. Keep them out of the browser bundle, Git,
screenshots, and reports.

Main-branch API deployment runs the guarded database release before deploying
the application, using the configured production database and expected Neon
host/name checks. An authorised operator can also run the release manually.
Content seeding remains a separate decision; deployment does not install event
packs by default. Runtime and migration credentials are currently coupled.

See [Neon/PostGIS setup](neon-postgis-setup.md) and
[database releases and recovery](database-release-procedure.md).

## Testing and evidence

The database suite applies the complete migration chain to disposable PostGIS
databases. It tests constraints, transactions, concurrency, ownership,
geospatial rules, and recovery. Pull-request CI runs this suite against an
isolated service.

A passing test database does not prove that production was migrated, backed up,
restored, or monitored. Production evidence must identify the target safely,
record the operator and time, and state the result without exposing the
connection string.

The [September review summary](../planning/scrum/sprint-2/evidence.md#database-review--4-september)
records index cleanup and local verification. It does not establish the current
production schema or workload.

## Known evidence gaps

Migration `0065` adds CPU JSON shape checks without rewriting historical snapshots.
The migration runner validates all applied names and checksums before applying
pending SQL, including refusing applied files missing from the source tree.

The repository documents the schema, migration process, release controls, and
test approach. Final provider backup guarantees, a completed production restore,
production query benchmarks, and current retention and monitoring results need
separate dated records.

## AI declaration

This page was generated and edited with assistance from Codex, Codex-CLI, and
ChatGPT-Web models listed in its earlier revision. It was rewritten in simpler
language with assistance from Codex[GPT-5]. Merge guidance was updated with
assistance from Codex[GPT-6] and checked against migrations through `0065`.
