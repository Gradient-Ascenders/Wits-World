---
title: 'Analytics storage and privacy'
---

# Analytics storage and privacy

Author analytics reads aggregate counters and existing gameplay records. It
creates no separate player activity or answer history. The API applies disclosure
rules before returning reports.

[Analytics overview](../design/author-analytics.md) owns report usage.
[Author analytics API](../architecture/advanced-analytics-api-contract.md) owns
filters and response formats.

## Reporting sources

| Metric                                        | Authoritative source                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Event views and successful eligibility checks | `event_product_event_aggregates`.                                            |
| Challenge starts                              | `challenge_attempts.started_at`.                                             |
| Event completions                             | `event_completions.completed_at`.                                            |
| Question outcomes                             | Completed attempts, saved question/answer records, and private marking keys. |
| Base challenge card issuance                  | `event_completion_card_rewards`.                                             |

The issuance ledger records what was awarded, rather than what is currently
owned. Trading and evolution do not change it. Starter grants, evolved cards,
trades, and territory bonus decisions are separate acquisition sources.

Location stages use their own time boundaries and can count repeat activity;
they do not track one cohort of unique players or form a conversion rate.
Question query mechanics belong to [Question queries](question-performance-query.md).

## Hourly activity counters

`public.event_product_event_aggregates` stores:

| Field                          | Contract                                                                  |
| ------------------------------ | ------------------------------------------------------------------------- |
| `event_id`                     | Referenced event.                                                         |
| `location_key`                 | Event UUID for a fixed point, or assignment UUID for automatic placement. |
| `placement_assignment_id`      | Optional historical assignment belonging to the event.                    |
| `bucket_start`                 | UTC hour boundary.                                                        |
| `view_count`, `eligible_count` | Non-negative counts.                                                      |

The primary key is `(event_id, location_key, bucket_start)`. Concurrent
`INSERT … ON CONFLICT … DO UPDATE` operations increment counters atomically.
A discovery response counts each active event once in that response; later
responses can count it again.

The recorder receives event/assignment IDs and server time. It stores no player
ID, Auth0 identity, precise coordinates, accuracy, or request payload.
Background writes are best effort and do not determine gameplay success.

Reporting joins historical assignments to reviewed sites. Several rotations
at one physical site can be grouped together. Starts and completions use the
assignment saved on the attempt, preserving their location context.

## Small-sample disclosure

Advanced reports use a minimum sample of **10**. Hidden values are `null` with
explicit suppression metadata, preserving the difference between hidden, zero,
and an unavailable rate.

| Projection      | Disclosure rule                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Location stages | Check each count independently: 0 and counts of at least 10 remain visible; 1–9 is hidden.   |
| Questions       | With 1–9 outcomes, hide counts and rates and return `suppressed`.                            |
| Card rows       | Hide count/rate when either issuance or the completion denominator is positive and below 10. |
| Rarity totals   | Apply the card rule and suppress any rarity containing a card with 1–9 issuances.            |
| Event attention | Use only reportable ignored-location and question signals.                                   |

A location row can mix visible and hidden stages. A zero-card count can still
be hidden when its completion denominator is small. Rates with no completion
denominator remain unavailable.

Rarity suppression prevents subtraction from revealing a hidden child count.
Clients use returned summaries rather than rebuilding totals from visible rows.

The exact curation endpoint retains small aggregates; its threshold controls
flagging rather than disclosure. See
[the endpoint comparison](../architecture/advanced-analytics-api-contract.md#two-reporting-endpoints).
Neither endpoint adds noise or guarantees anonymity against outside knowledge.

## Queries and retention

Reports query source records directly, with indexes for aggregate time/location,
attempt starts, completion time, and reward time/definition. There is no scheduled
materialised gameplay summary. Bounded pages and period filters limit responses.

All reports require an authenticated, active Author. Projections contain content
context and aggregate statistics, without player/attempt IDs, submitted answers,
precise activity timestamps, or movement evidence.

Hourly counters have no player key to remove on account deletion and no automatic
expiry purge. Source gameplay records retain their own deletion rules, so removing
personal attempts or completions can change derived reports. Analytics does not
preserve a second copy of those records.

See [Account retention](account-deletion-retention.md) for personal data and
[Reward storage](challenge-reward-persistence-design.md) for award history.

**AI declaration:** Prepared and updated with assistance from
ChatGPT-Web[GPT-5.6 Sol] and Codex[GPT-6].
