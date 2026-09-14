---
title: 'Database review — September 2026'
---

# Database review — September 2026

## Scope and conclusion

Reviewed on 4 September 2026 against main commit `9dbc2dd`: migration history,
database design documents, API persistence code, deletion rules, integration
tests, and a read-only Neon catalogue/statistics inspection. The live database
had migrations through `0035_deny_deleted_identity_tokens.sql` applied.

**Keep the relational architecture. Remove exact duplicate indexes, not useful
tables or meaningful nulls.** This review does not establish that every query is
optimal, and it is not a production load test or a complete security audit.
No production schema or player data was changed during the review.

## Measured footprint

The live metadata snapshot reported:

| Schema      | Ordinary tables | Table totals including indexes and TOAST |
| ----------- | --------------: | ---------------------------------------: |
| `public`    |              51 |                         12,386,304 bytes |
| `private`   |               8 |                            262,144 bytes |
| `neon_auth` |               9 |                            270,336 bytes |

The public count includes `schema_migrations` and PostGIS `spatial_ref_sys`.
Excluding those two gives 57 application tables across public/private.
Provider-managed `neon_auth` relations are not candidates for application cleanup.
These sums are not the entire PostgreSQL database or Neon's billed storage metric.
They cannot explain or reconcile the previously observed 0.3 GB dashboard value.

## Improvement included: duplicate indexes

Migration `0036_remove_duplicate_indexes.sql` removes only the following six
standalone indexes. Their constraint-backed equivalents have the same B-tree
keys and ordering, without different predicates, expressions, or included columns.
The unique constraints and all data remain in place.

| Index removed                          | Constraint-backed index retained          |
| -------------------------------------- | ----------------------------------------- |
| `card_moves_definition_position_idx`   | `card_moves_card_position_unique`         |
| `card_effects_definition_position_idx` | `card_effects_card_position_unique`       |
| `cpu_match_cards_match_idx`            | `cpu_match_cards_primary_key`             |
| `cpu_match_rounds_match_idx`           | `cpu_match_rounds_identity_unique`        |
| `cpu_match_actions_match_idx`          | `cpu_match_actions_identity_unique`       |
| `async_pvp_match_actions_history_idx`  | `async_pvp_match_actions_sequence_unique` |

Combined measured size: **90,112 bytes (88 KiB)**. The benefit is modest storage
savings and avoiding six unnecessary index-maintenance paths as data grows.
This is not a fix for hundreds of megabytes of provider storage.
PostgreSQL automatically creates indexes for unique constraints; an additional
identical index is unnecessary. See [PostgreSQL unique indexes](https://www.postgresql.org/docs/current/indexes-unique.html).

Other indexes sharing a leading column were deliberately retained. A narrower
index can have different performance characteristics. Composite unique
constraints also support ownership-enforcing foreign keys and must not be
removed merely because the table has a UUID primary key.

## Why keep these tables?

| Area                                                        | Reason for the existing separation                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card definitions, owned copies, deck membership             | One definition can have many owned copies and saved-deck references. Combining these repeats catalogue data or weakens ownership validation.                                           |
| Questions, choices, ordering items, private answer keys     | Formats have different structure; private marking data must stay outside player payloads. A schema name alone is not access control: API queries and database privileges still matter. |
| Attempts, question snapshots, answers, completions, rewards | These have different lifetimes and transaction responsibilities. Snapshots preserve the challenge actually played; completion/reward records support exactly-once outcomes.            |
| CPU and asynchronous PvP persistence                        | Invitations, two-player ownership and deadlines differ from CPU matches. Similar columns alone do not justify a risky unified match rewrite.                                           |
| Progression award ledger and current totals                 | The ledger records sources and duplicate protection; totals are a read projection. Preserve transactional consistency rather than deleting either side.                                |
| Trail/campaign membership                                   | Join tables represent ordering and many-to-many relationships with enforceable foreign keys. JSON arrays would weaken those guarantees.                                                |
| Movement evidence and eligibility decisions                 | Different evidence and audit responsibilities with privacy-limited retention. Keep the existing expiry policy; verify cleanup operationally.                                           |
| Retired coin records                                        | Historical retention and account-deletion paths still refer to these. Removal needs an explicit archival/retention decision and coordinated code changes.                              |

No table merge is recommended in this change. Fewer tables is not itself a
performance or storage target. Likewise, replacing relational ownership,
rewards or deck membership with JSON is not recommended.

## Nullable columns

`pg_stats.null_frac` is an estimate from the most recent analysis, not a live
validation of every row. High null percentages are a prompt to inspect semantics,
not permission to fill values or remove columns.

| Example                                       | Assessment                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cpu_matches.completed_at`, `winner`          | Expected while active. A default winner or completion timestamp would misrepresent game state.                                                   |
| `players.deletion_request_id`                 | Expected for players who have not requested deletion. Identity fields also intentionally become null during anonymisation.                       |
| `player_cards.source_completion_id`           | Starters do not originate from an event completion. Preserve source-specific constraints.                                                        |
| Move/effect modifier fields                   | Not every effect is a buff/debuff or has a duration. Existing typed checks are preferable to arbitrary zero/empty values.                        |
| `cpu_match_actions.submission_id`, `response` | Server-generated actions differ from client submissions and replay receipts. Preserve the distinction.                                           |
| `card_definitions.image_url`                  | Optional content, with a frontend fallback in `CollectibleCard.tsx`. Audit catalogue artwork separately; do not invent URLs to satisfy NOT NULL. |

PostgreSQL represents nullness with an optional bitmap and skips storing the
field's value. Nulls are not full-sized empty objects; filling them with defaults
is not a storage optimisation. See [PostgreSQL row layout](https://www.postgresql.org/docs/current/storage-page-layout.html).

There is one unvalidated check in the live metadata:
`event_completions_retired_coin_award_check`. Migration `0034` deliberately adds
it as `NOT VALID` to preserve historical coin awards while preventing new ones.
Do not blindly validate it or rewrite historical rewards.

## Next improvements, in priority order

1. **Measure battle-history growth.** In the inspected database, CPU round
   relations occupied 1,032,192 bytes, actions 729,088 bytes, and matches 253,952
   bytes. These include indexes/TOAST, not just JSON payloads. Snapshot and replay
   duplication is a plausible growth driver, not yet a proven bottleneck.
   Before redesigning, measure bytes per completed match and inspect actual
   history/recovery queries. A later checkpoint/delta design must preserve replay,
   account deletion, versioned rules and reconstruction tests.
2. **Verify retention execution.** Confirm privacy-limited movement cleanup and
   deletion-audit expiry actually run in the deployed environment. Do not invent
   new retention periods or delete retained match/reward history to save space.
3. **Capture representative query plans.** Prioritise collection/deck lookup,
   history pagination, event discovery and deadline sweeps. Use a controlled test
   dataset before considering prefix-index removals. Zero scan counts alone are
   insufficient evidence, especially after statistics resets.
4. **Keep migrations immutable.** Consolidating applied SQL files is not a live
   storage optimisation and breaks checksum-based deployment history.

## Verification and rollout

The event database integration test checks that all six redundant indexes are
absent after migration and the retained unique indexes are valid, ready and
constraint-backed. Existing migration application/replay expectations are
updated. The progression upgrade fixture now selects migrations before its
historical boundary rather than maintaining a growing exclusion list.
The asynchronous PvP fixture defers the cleanup until its tables exist and
checks the retained unique index as its history access path.

Local verification on 4 September 2026:

- `npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`, and
  `npm run build` passed, including the documentation build.
- All 23 opt-in database suites passed: **237 tests** on disposable local
  PostgreSQL 16.15/PostGIS 3.4.2 databases, with no Neon test writes.
- Initial local setup and fixture failures were corrected before the complete
  database suite passed. This is local evidence, not a CI or production result.
- Toolchain: Node 24.15.0 and npm 11.12.1. npm emitted an engine warning because
  the repository requests npm >=11.18.0; CI should verify with the pinned version.

Run the normal verification commands and opt-in database suites against an
isolated PostgreSQL/PostGIS target before release. Those integration suites
create/drop temporary databases and must not use production as their test target.

Use the existing [database release procedure](./database-release-procedure.md).
Migration `0036` uses a five-second lock timeout: a busy database causes the
transaction to fail and roll back rather than wait indefinitely for locks.
Schedule/retry during a quiet period; do not bypass the migration runner or delete
its history. If an unexpected query regression is demonstrated, add a new
forward migration recreating the relevant standalone index, leaving constraints
intact. No seed changes or API/frontend deployment changes are required.

## AI declaration

Prepared with assistance from Codex[GPT-5]. Measurements came from read-only database
metadata; recommendations were checked against repository persistence code and
PostgreSQL documentation.

Page title clarified with assistance from Codex-CLI[GPT-6].
