---
title: 'Advanced analytics persistence'
---

# Advanced analytics persistence

Issue `#278` adds a narrow read-model boundary for the two operational funnel
stages that do not already have authoritative durable records. It deliberately
does not create a raw telemetry or player-location history.

## Migration `0057_create_advanced_analytics.sql`

`public.event_product_event_aggregates` stores UTC-hour aggregate counters with
this identity:

- `event_id` — the published event;
- `location_key` — the event ID for a fixed authored location or the historical
  placement-assignment ID for an automatically placed event;
- `placement_assignment_id` — nullable reference to placement history;
- `bucket_start` — the start of the UTC hour;
- `view_count` and `eligible_count` — non-negative aggregate counters.

The primary key `(event_id, location_key, bucket_start)` makes each hour/location
bucket unique. Concurrent recorder calls use `INSERT ... ON CONFLICT ... DO
UPDATE`, so increments are atomic. The recorder validates an optional assignment
against the event before it writes.

No player ID, authentication subject, latitude, longitude, accuracy, request
payload, answer, or movement trail is stored in this table.

## Reused authoritative records

The rest of the reporting model remains in existing domain relations:

| Metric            | Source                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| Challenge starts  | `challenge_attempts.started_at`                                           |
| Event completions | `event_completions.completed_at`                                          |
| Question outcomes | Completed attempt/question snapshots through `QuestionPerformanceService` |
| Card issuance     | Immutable `event_completion_card_rewards`                                 |

Current `player_cards` are intentionally not the source for historical issuance.
Ownership can change after an award, while the completion-reward ledger records
what the game issued at the time.

For automatically placed events, attempts already retain
`placement_assignment_id`. Reporting joins that historical assignment to
`event_placement_sites`, so separate rotations through the same reviewed site
can be aggregated without preserving a player's coordinates.

## Indexes

Migration `0057` adds bounded-read indexes for:

- aggregate bucket time, event, and optional placement assignment;
- placement-assignment aggregate history;
- challenge-attempt start time;
- event-completion completion time; and
- reward award time and card definition.

These support the issue `#278` date-bounded Author queries while keeping the
canonical records in their existing tables. No scheduled refresh worker or
materialized summary of attempts, completions, or rewards is introduced.

## Retention and privacy

The product-event table is aggregate-only and cannot be used to reconstruct an
individual player's path. The API additionally suppresses positive samples below
10 for the advanced analytics projections. Exact zero remains visible. Card rarity
summaries use secondary suppression whenever a rarity contains a non-zero
per-card issuance count below 10, preventing subtraction of disclosed siblings
from revealing the suppressed child count.

This design does not claim differential privacy. Authors can still learn
operational facts about public event locations and content; the protection is
that player-level identities, raw coordinates, and tiny exact activity counts
are not part of the new analytics contract.

Because no player key is retained, account deletion does not require deletion
from the aggregate table. Existing short-lived movement evidence and its
retention rules are unchanged.

## Query-plan evidence

`apps/api/tests/advanced-analytics-database.integration.test.ts` is the focused
persistence and query-plan harness. It covers concurrent counter increments,
privacy-safe schema columns, authoritative start/completion joins, ignored
locations, immutable reward-ledger issuance, secondary rarity suppression,
ownership independence, and representative `EXPLAIN (ANALYZE, BUFFERS)` plans.

The target is less than 1,000 ms PostgreSQL execution time for each captured
representative advanced-analytics query on the disposable fixture. A separate
selective product-event date query verifies indexed access. This target is not
production latency evidence; measured results should only be recorded after the
suite has actually run.

## AI declaration

The preceding document was generated and edited with the assistance of:
ChatGPT-Web[GPT-5.6 Sol].
