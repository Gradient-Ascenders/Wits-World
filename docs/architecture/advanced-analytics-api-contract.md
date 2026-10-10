---
title: 'Author analytics API'
---

# Author analytics API

These read-only endpoints provide Author-only aggregates for event activity, question performance, and challenge card rewards. For console usage, see [Analytics overview](../design/author-analytics.md).

## Endpoints and filters

All endpoints require an authenticated, active player with the Author role. They are read-only `GET` routes under `/api/v1/author/analytics`.

| Endpoint           | Additional filters                                   |
| ------------------ | ---------------------------------------------------- |
| `/attention`       | None                                                 |
| `/event-locations` | `mode`: `all`, `popular`, or `ignored`               |
| `/questions`       | `eventId`, `challengeId`, `format`, and `difficulty` |
| `/card-issuance`   | None                                                 |

Question formats are `multiple_choice` and `ordering`; difficulty is 1, 2, or 3.

Every endpoint accepts:

| Parameter            | Contract                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `page`               | Starts at 1; default 1                                            |
| `pageSize`           | Default 25; maximum 100                                           |
| `fromDate`, `toDate` | Optional UTC dates in `YYYY-MM-DD` format; supply both or neither |

The date interval is `[fromDate, toDate)`: the start is inclusive and the end exclusive. It must span 1–366 days. Omitting both dates requests all-time data. Invalid filters return `INVALID_ANALYTICS_FILTERS`.

Responses include pagination and reporting-threshold metadata. The generated OpenAPI document defines the full field schemas. Suppressed values are `null`, not zero; the exact rules are documented in [Storage and privacy](../database/advanced-analytics.md#small-sample-disclosure).

## Location activity

Each event/location row contains 4 independent counts:

| Stage      | What counts                                            |
| ---------- | ------------------------------------------------------ |
| View       | An active published event returned by player discovery |
| Eligible   | A final server eligibility decision of `reachable`     |
| Start      | A challenge attempt started in the period              |
| Completion | An event completion recorded in the period             |

Views and eligibility checks can repeat. These are activity counts, not unique players or a linked conversion funnel. A start may have no online view in the same period, especially with offline play. The report does not calculate conversion percentages.

Automatic placements use historical assignments to attribute activity to the reviewed site. Repeated rotations at the same site are combined. Fixed events use their own event ID as the location identity.

| Mode      | Selection and ordering                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| `all`     | Locations with any recorded activity                                                                |
| `popular` | At least 10 views or eligibility checks; ordered by eligible count, starts, completions, then views |
| `ignored` | At least 10 views and zero eligibility checks, starts, and completions                              |

View and eligibility counters are recorded in the background. A failed counter write does not delay or change gameplay, so these stages are best-effort measurements. Starts and completions come from the authoritative gameplay records.

## Event attention

The overview groups the full set of reportable location and question signals by event before pagination. It shows:

- `ignoredLocationCount`: locations meeting the ignored rule;
- `easyQuestionCount`: distinct questions classified as easy;
- `hardQuestionCount`: distinct questions classified as problematic.

These count locations and questions, not players or answers. Historical difficulty groups can place the same question in both question categories. Small suppressed samples do not create attention flags.

Rows are ordered by event title and ID. A paired `questionId` and `challengeId` links to a representative question, preferring a problematic question. Both are `null` for location-only attention. There is no combined severity score or automatic moderation action.

## Question performance

The question endpoint reuses completed-attempt outcomes and classifies reportable questions as **Easy**, **Problematic**, or **Normal**. The console distinguishes **No outcomes** from **Suppressed** samples.

[Question reports](../database/question-performance-analytics.md) defines correctness, timeout counting, classification thresholds, and historical difficulty. Timeouts already count as incorrect outcomes; they are not a third outcome category.

### Two reporting endpoints

Both routes require an authenticated, active Author and return aggregates without player identities, attempt IDs, submitted answers, or coordinates.

| Endpoint                              | Small-sample behavior                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/v1/author/analytics/questions`  | Hides positive samples below 10 and returns the question classifications                                        |
| `/api/v1/author/question-performance` | Returns exact counts and rates below 10; flags a problem only at 10 or more outcomes and at least 70% incorrect |

The older curation endpoint's minimum controls flagging, not disclosure. Narrow filters can therefore expose exact activity for a small group, particularly when an Author already knows who attempted the content. Advanced analytics adds suppression without changing that older contract.

The curation endpoint accepts `eventId`, `challengeId`, `format`, `difficulty`, optional timestamp boundaries `from`/`to`, and pagination with a maximum page size of 100. The advanced route uses the shared UTC `fromDate`/`toDate` contract in [Endpoints and filters](#endpoints-and-filters).

[Storage and privacy](../database/advanced-analytics.md) owns the advanced reports' disclosure rules. Neither endpoint introduces noise or claims differential privacy.

## Card rewards

Card issuance comes from the immutable challenge-completion reward ledger. Current card ownership does not determine historical issuance. Reward-eligible definitions with no awards remain in the report, as do historically awarded definitions whose eligibility has changed.

Each card row reports an issuance count and, where available:

```text
issuancesPer100Completions = issuanceCount × 100 / totalEventCompletions
```

The denominator covers the same period. If there are no completions, the rate is `null`.

The response also supplies Common, Rare, Epic, and Legendary totals for the entire period. The client uses these returned summaries; adding visible card rows could bypass suppression or omit other pages. [Storage and privacy](../database/advanced-analytics.md) explains both row and rarity suppression.

## AI declaration

This document was generated and edited with assistance from ChatGPT-Web[GPT-5.6 Sol]. The console documentation and current rewrite were edited and reviewed with Codex[GPT-6].
