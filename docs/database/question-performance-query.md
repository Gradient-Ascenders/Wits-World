---
title: 'Question analytics queries'
---

# Question analytics queries

This developer reference describes the question-performance query, supporting indexes, and recorded database test results. For report interpretation, see [Question reports](./question-performance-analytics.md); endpoint contracts are in [Author analytics API](../architecture/advanced-analytics-api-contract.md#two-reporting-endpoints).

## Query and indexes

`QuestionPerformanceService` aggregates completed attempts, immutable snapshots, submitted answers, and private answer keys. It creates no duplicate player or answer store. Existing relationships bound each attempt to 5 question snapshots.

Migration `0038_add_question_performance_analytics_indexes.sql` adds these partial indexes, all restricted to completed attempts:

```sql
challenge_attempts_completed_event_analytics_idx
  (event_id, completed_at, id, challenge_id)
  where status = 'completed'

challenge_attempts_completed_challenge_analytics_idx
  (challenge_id, completed_at, id)
  where status = 'completed'

challenge_attempts_completed_at_analytics_idx
  (completed_at, id, event_id, challenge_id)
  where status = 'completed'
```

Event/challenge indexes support selective content and date filters. The completion-time index supports date-only reports. Format and difficulty filters apply after determining the lowest-position unanswered question across the full snapshot, preserving timeout semantics.

## Query-plan evidence

`question-performance-database.integration.test.ts` is the durable query-plan evidence harness. It provisions a disposable fully migrated database with selective event/challenge distributions, runs the real service query, and executes `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` for event-filtered, challenge-filtered, and unfiltered date-range requests. Assertions require bounded actual work and verify that the filtered shapes are index-supported without making one exact planner choice an application-correctness requirement. A small empty database is not used because it may legitimately produce an unrepresentative plan.

The refreshed disposable Neon test target was validated as distinct from the development target on 5 September 2026. The suite created a unique temporary database, applied the complete migration chain including migration `0038`, seeded 4,201 completed attempts and 4,205 question snapshots, ran the aggregate regressions, captured the plans below, and dropped the temporary database. The final database test run passed all four tests.

Observed warm-cache PostgreSQL plans were:

| Query shape        | Attempt access                                                              |  Rows | Shared hits | Planning | Execution |
| ------------------ | --------------------------------------------------------------------------- | ----: | ----------: | -------: | --------: |
| Event filtered     | Bitmap heap scan via existing `challenge_attempts_event_status_idx`         |   100 |         616 | 1.299 ms |  1.821 ms |
| Challenge filtered | Bitmap heap scan via `challenge_attempts_completed_challenge_analytics_idx` |   100 |       1,630 | 1.283 ms |  3.508 ms |
| Date range         | Bitmap heap scan via `challenge_attempts_completed_at_analytics_idx`        |   201 |       2,204 | 1.336 ms |  3.527 ms |
| Default/unfiltered | Sequential scan of all completed attempts                                   | 4,201 |      10,387 | 1.275 ms | 21.413 ms |

The unfiltered sequential scan is appropriate because that shape consumes the full completed-attempt population. The event-only plan validly preferred the older compact event/status index; migration `0038` retains its event/date covering index for composed event/date queries. The selective challenge and date-range plans used the new partial indexes, and no plan required disabled sequential scans or other planner forcing. These measurements describe the disposable representative fixture and are not production latency claims.

## AI declaration

The title was clarified with Codex-CLI[GPT-6], and the advanced analytics privacy boundary was documented with ChatGPT-Web[GPT-5.6 Sol]. The current rewrite and implementation review used Codex[GPT-6].

The query reference was separated from the Author guide with assistance from Codex[GPT-6].
