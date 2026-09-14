---
title: 'Question performance reports'
---

# Question performance reports

Issue `#184` uses an indexed aggregate query rather than a maintained summary. The source tables remain the server-authoritative challenge attempt, immutable question snapshot, submitted-answer, and private answer-key tables. No analytics copy of a player, answer selection, submitted order, or location is created.

## Outcome semantics

Only `completed` challenge attempts contribute outcomes. All five questions and their shuffled choices/items are snapshotted when an attempt starts, so snapshot existence alone does **not** prove that a question was reached. The active question in the existing client is the lowest-position unanswered question. Analytics reproduces that deterministic rule from locked server state at completion.

An answer sample therefore consists of every submitted answer plus, for a timed-out attempt, only its lowest-position unanswered question:

- a correct MCQ is a submitted snapshot choice whose source choice matches the private accepted choice;
- a correct ordering response has all four submitted snapshot items in their private accepted positions;
- every submitted non-correct response is incorrect;
- the lowest-position unanswered question in an attempt completed for `timeout` is both incorrect and included in `timeoutCount`;
- later unanswered snapshots in that timed-out attempt are excluded because the player had not advanced to them;
- a wrong response submitted before an attempt times out is incorrect but is not a timeout;
- in-progress attempts never contribute partial data.

Consequently, `correctCount + incorrectCount = answerCount` and `timeoutCount <= incorrectCount`. Correctness rates are the relevant count divided by `answerCount`, expressed from `0` through `1`.

A question has a sufficient sample at exactly 10 outcomes. It is problematic only when the sample is sufficient and `incorrectCount / answerCount >= 0.70`. This includes the exact 10-answer and 70% boundary.

This minimum is a flagging threshold, not a disclosure threshold. Issue `#184` requires Authors to distinguish insufficient samples from flagged questions, prohibits player-level fields, and defines 10 answers as the minimum for problem flagging; it does not require suppressing aggregates below 10. The checked-in requirements and architecture decisions likewise establish no small-sample suppression rule. Exact aggregate counts and rates therefore remain available to an authenticated active Author below 10 outcomes, without silently adding noise, bucketing, or other statistical privacy behavior.

Date filters apply to the authoritative attempt `completed_at`: `from` is inclusive and `to` is exclusive. Filters use the difficulty snapshot seen by the player, while stable source question, challenge, and event identifiers lead the Author back to the current immutable published or retired content.

## Query and indexes

Migration `0038_add_question_performance_analytics_indexes.sql` adds three partial indexes:

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

The first two support high-selectivity event and challenge workflows, including event/date and challenge/date combinations. The completed-at index supports the default view's optional date window without requiring an event or challenge prefix. All three exclude in-progress attempts. Existing unique/indexed attempt-question relationships bound fan-out to the five immutable snapshots in an attempt. Format and difficulty filters are applied after establishing the active unanswered position across the complete snapshot. Separate infrastructure or a maintained summary is not justified at the current scale.

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

## Privacy and limitations

`GET /api/v1/author/question-performance` is protected by the normal active-player and Author guards. Its response schema is closed and contains only aggregate counts/rates, content context, and edit-navigation identifiers. The browser never receives attempt rows, player identity, attempt identity, submitted answer/order, or player location.

Because exact aggregates remain visible for samples below 10, sufficiently narrow content and date filters can create a residual inference risk when an Author already knows who completed a particular small set of attempts. Author authorization and removal of row-level identity reduce disclosure but do not eliminate that inference. This behavior is retained explicitly because the 10-outcome rule is documented as the problematic-question threshold, not a suppression requirement; changing that boundary requires an authoritative privacy/product decision.

This is a curation signal, not causal analysis. It does not explain why a question was missed, segment players, retain a separate history, rewrite content, or provide a game-wide dashboard. Because published and retired question definitions are immutable, a source identifier continues to describe the answer key used for its snapshots.

Page title clarified with assistance from Codex-CLI[GPT-6].
