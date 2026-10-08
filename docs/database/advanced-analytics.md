---
title: 'Analytics storage and privacy'
---

# Analytics storage and privacy

Author analytics combines a small aggregate counter table with existing gameplay records. It does not create a separate player activity log. The API applies disclosure rules before sending reports to the Author console.

For report usage, see [Analytics overview](../design/author-analytics.md). Endpoint contracts and filters are in [Author analytics API](../architecture/advanced-analytics-api-contract.md).

## Reporting sources

| Metric                                  | Source                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Views and successful eligibility checks | `public.event_product_event_aggregates`                                                      |
| Challenge starts                        | `challenge_attempts.started_at`                                                              |
| Event completions                       | `event_completions.completed_at`                                                             |
| Question outcomes                       | Completed attempts, immutable question snapshots, submitted answers, and private answer keys |
| Card issuance                           | Immutable `event_completion_card_rewards`                                                    |

Reward reporting uses the award ledger rather than `player_cards`. Trading, evolution, and later ownership changes therefore do not redefine what was issued at challenge completion. The report is not a count of every way a player can acquire a card.

Question results are queried from their source records without creating another answer history. See [Question reports](./question-performance-analytics.md) for outcome semantics and [Question analytics queries](./question-performance-query.md) for query details and dated evidence.

## Hourly activity counters

Migration `0057_create_advanced_analytics.sql` creates `public.event_product_event_aggregates`:

| Field                          | Meaning                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `event_id`                     | Published event                                                                    |
| `location_key`                 | Event ID for a fixed location; historical assignment ID for an automatic placement |
| `placement_assignment_id`      | Optional reference to placement history                                            |
| `bucket_start`                 | Start of the UTC hour                                                              |
| `view_count`, `eligible_count` | Non-negative aggregate counters                                                    |

The primary key is `(event_id, location_key, bucket_start)`. Concurrent writes increment counters atomically with `INSERT … ON CONFLICT … DO UPDATE`. The recorder validates that an optional assignment belongs to the event.

Counters receive event/assignment IDs and server time. They store no player ID, authentication subject, precise coordinates, accuracy, submitted answer, or request payload. Writes run in the background and do not determine whether gameplay succeeds.

For automatic placements, reporting joins the historical assignment to its reviewed site. Attempts also retain that assignment reference. This allows activity from several rotations to be grouped by physical site without storing a player's coordinates in the analytics table.

## Small-sample disclosure

The advanced analytics minimum sample is 10. A positive count from 1 to 9 is hidden where it would reveal a small sample. Suppression uses `null` and explicit status metadata, so the client can distinguish hidden values from zero or an unavailable rate.

| Projection       | Disclosure rule                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Location stages  | Each count is checked independently: zero and counts of at least 10 are visible; 1–9 becomes `null`                |
| Questions        | With 1–9 outcomes, hide all outcome counts and rates and return `suppressed`; zero outcomes remain distinguishable |
| Card rows        | Hide the issuance count and rate if either the issuance count or completion denominator is positive and below 10   |
| Rarity summaries | Apply the card rule, and also hide a rarity total/rate if any card in that rarity has 1–9 issuances                |
| Event attention  | Include only reportable ignored-location and question signals                                                      |

A card's zero issuance can still be hidden when the completion denominator is small. A location row can contain a mix of visible and hidden stages; its suppression flag does not make every stage unavailable.

Rarity suppression prevents a hidden card count from being inferred by subtracting visible sibling counts from the total. The client must not reconstruct hidden totals by summing rows or assign hidden values a chart magnitude.

The older `/api/v1/author/question-performance` curation endpoint retains exact small aggregates. Its 10-outcome rule controls problem flagging, rather than disclosure. The distinction is explained in [Author analytics API](../architecture/advanced-analytics-api-contract.md#two-reporting-endpoints).

## Privacy and retention

All reports require an authenticated, active Author. Responses contain content context and aggregate statistics, without player or attempt identities, submitted answers, exact activity timestamps, or movement evidence. Precise player coordinates are not returned.

Hourly counters have no player key to remove during account deletion. Joined gameplay records retain their own deletion and retention rules; the analytics feature does not override them. Existing short-lived movement evidence remains subject to [Account deletion and retention](./account-deletion-retention.md).

Threshold suppression is not differential privacy. An Author with outside knowledge may still infer activity from narrow periods, content context, or the separate exact curation reports. Removing row-level identity reduces disclosure; it does not guarantee anonymity.

## Queries and verification

Migration `0057` adds indexes for aggregate time/event/assignment reads, attempt starts, completion times, and reward time/card-definition queries. Reports query the authoritative records directly; no scheduled refresh worker or materialised gameplay summary is introduced.

`apps/api/tests/advanced-analytics-database.integration.test.ts` covers concurrent increments, source joins, ignored locations, reward-ledger history, ownership independence, and rarity suppression. It also captures representative `EXPLAIN (ANALYZE, BUFFERS)` plans.

The fixture target is less than 1,000 ms of PostgreSQL execution per representative query, with indexed access for selective product-event date reads. This is a test target, not a production HTTP latency guarantee. Recorded measurements belong with their execution date and fixture; the [question report evidence](./question-performance-query.md#query-plan-evidence) is a separate dated run.

## AI declaration

This document was generated and edited with assistance from ChatGPT-Web[GPT-5.6 Sol]. The current rewrite and implementation review used Codex[GPT-6].
