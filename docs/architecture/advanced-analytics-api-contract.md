---
title: 'Advanced analytics API contract'
---

# Advanced analytics API contract

Issue `#278` provides Author-only operational analytics for event locations,
question performance, and card issuance. The API keeps the server and database
authoritative and deliberately avoids a player-level analytics stream.

## Access and common filters

All routes require the normal authenticated, active-player, Author guards:

- `GET /api/v1/author/analytics/event-locations`
- `GET /api/v1/author/analytics/questions`
- `GET /api/v1/author/analytics/card-issuance`

The routes accept `page` (default `1`) and `pageSize` (default `25`, maximum
`100`). `fromDate` and `toDate` are optional UTC calendar dates in `YYYY-MM-DD`
form. When either date is supplied, both are required; `fromDate` is inclusive,
`toDate` is exclusive, and the range must be between one and 366 days.

Invalid combinations return the normal safe API error shape with
`INVALID_ANALYTICS_FILTERS`. The generated OpenAPI document is authoritative for
field-level schemas.

## Event-location analytics

`GET /api/v1/author/analytics/event-locations` combines four stages:

| Stage      | Authoritative source                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| View       | Hourly aggregate recorded when an active published event is returned by player discovery |
| Eligible   | Hourly aggregate recorded only after the final server eligibility result is `reachable`  |
| Start      | `challenge_attempts.started_at`                                                          |
| Completion | `event_completions.completed_at`                                                         |

Only the first two stages need an analytics-specific store because attempts and
completions already have durable authoritative records. The aggregate recorder
receives an event identifier, an optional placement-assignment identifier, and a
server timestamp. It never receives a player identifier or location claim.
Analytics writes are started in the background and are not awaited by the
player-facing discovery or eligibility response path. A later write failure is logged
but does not replace or delay the authoritative gameplay response.

Automatic-placement activity is attributed through the historical placement
assignment to the reviewed placement site. Multiple rotations through the same
site therefore aggregate to one physical site. Fixed authored events use the
event identifier as their location identifier. The response does not project
player coordinates or movement evidence.

The optional `mode` filter is:

- `all` — any location with activity in at least one funnel stage;
- `popular` — locations with at least the minimum reportable view or eligibility
  sample, ordered by successful eligibility, starts, completions, then views;
- `ignored` — locations with a reportable view sample and zero eligibility,
  starts, and completions.

These are aggregate stage counts, not linked unique-player cohorts. Offline or
direct starts can therefore exist without an online view in the same time
window. The API intentionally does not publish conversion percentages that
would imply a player-level join.

## Question analytics

`GET /api/v1/author/analytics/questions` reuses the existing
`QuestionPerformanceService`, which derives correctness from completed
server-authoritative attempt snapshots. Issue `#278` does not alter the older
`GET /api/v1/author/question-performance` curation endpoint.

The advanced projection uses the existing 10-outcome minimum as its disclosure
threshold. Positive samples from one through nine hide counts and rates and are
classified as `suppressed`. At ten or more outcomes:

- `easy` means `correctRate >= 0.90`;
- `problematic` reuses the existing `incorrectRate >= 0.70` rule;
- otherwise the classification is `normal`.

The `0.90` easy threshold is the issue `#278` operational policy. It does not
modify challenge marking, question publication, or the issue `#184` problematic
question rule.

## Card issuance analytics

`GET /api/v1/author/analytics/card-issuance` reads historical issuance from the
immutable `event_completion_card_rewards` ledger. It does not infer issuance
from current `player_cards`, because ownership can later change through account
deletion, evolution, and trading.

The response contains per-card rows and four rarity summaries. Reward-eligible
cards with zero issuance remain visible; historically issued definitions remain
visible even if their current reward eligibility later changes.
`issuancesPer100Completions` uses authoritative `event_completions` in the same
reporting window as its denominator. A positive issuance or denominator sample
below ten suppresses both the count and derived rate for that row. Rarity summaries
also use secondary suppression: if any card in the rarity has a non-zero issuance
count below ten, the rarity count and rate are hidden so the child count cannot be
reconstructed by subtracting disclosed sibling cards from the rarity total.

## Privacy boundary

The minimum sample size is `10`. Exact zero is retained because it represents
absence of observed activity, while positive values from one through nine are
suppressed where the advanced analytics response could expose a narrow sample.
This is threshold suppression, not differential privacy.

The advanced analytics API does not return or newly retain:

- player or authentication identity;
- attempt identifiers;
- submitted answers;
- exact product-event timestamps;
- precise player latitude/longitude or reported accuracy; or
- raw movement evidence.

The event product store uses UTC hourly buckets and aggregate counters only.
Account deletion therefore has no player-level analytics row to delete.

## Performance contract

Issue `#278` uses a focused database integration fixture and real
`EXPLAIN (ANALYZE, BUFFERS)` execution. The documented target is **less than
1,000 ms PostgreSQL execution time for each representative advanced-analytics
query on that disposable fixture**. Selective product-event date reads must use
an appropriate index. This is a repository test target, not a production HTTP
latency SLA and not a general load-test claim.

## Related documentation

- [Advanced analytics persistence](../database/advanced-analytics.md)
- [Question performance analytics](../database/question-performance-analytics.md)
- [API overview](./api-overview.md)
- [Testing strategy](../testing/testing-strategy.md)

## AI declaration

The preceding document was generated and edited with the assistance of:
ChatGPT-Web[GPT-5.6 Sol].
