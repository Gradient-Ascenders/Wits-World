---
title: Author moderation API
description: Review privacy-safe trust cases, record versioned decisions, and retrieve bounded audit evidence.
---

# Author moderation API

The Author moderation API exposes privacy-limited player trust cases for human
review. It separates derived evidence from raw gameplay and identity data, and
records every decision against an authoritative case version.

See [Moderation and trust](../requirements/longitudinal-trust-policy.md) for the
policy, score bands, decision effects, and restriction rules. This page covers
requests, pagination, conflicts, and recovery.

## Access and privacy

All routes begin with `/api/v1/author/trust-cases` and require bearer
authentication, an active account, and the Author role. The queue excludes a
case targeting the authenticated Author. Case views omit precise coordinates,
provider identity, submitted answers, hidden cards, and raw private match state.

Missing, inaccessible, and non-reviewable cases use safe responses. Clients
must not infer additional player activity from totals, missing records, or
restriction messages.

## Routes

| Method | Route                                      | Purpose                                      |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/author/trust-cases`                      | Filter and page the review queue.            |
| GET    | `/author/trust-cases/:caseId`              | Read case detail and recent context.         |
| GET    | `/author/trust-cases/:caseId/evidence`     | Page privacy-safe evidence summaries.        |
| GET    | `/author/trust-cases/:caseId/restrictions` | Page current and historical restrictions.    |
| GET    | `/author/trust-cases/:caseId/history`      | Page the append-only decision history.       |
| POST   | `/author/trust-cases/:caseId/decisions`    | Record one versioned Author decision.        |
| GET    | `/author/trust-cases/:caseId/export`       | Download a bounded privacy-safe JSON export. |

Successful JSON responses include `requestId`. The exact field schemas remain
in the [OpenAPI reference](../api-reference.md#http-reference).

## Queue and case reads

The queue defaults to active cases—`open` and `under_review`—with page 1 and 20
items. `pageSize` may be 1–100. Available filters are:

| Filter             | Values or behaviour                                                                |
| ------------------ | ---------------------------------------------------------------------------------- |
| `status`           | `active`, `all`, `open`, `under_review`, or `resolved`.                            |
| `search`           | Literal, case-insensitive Player Name substring; a complete UUID also matches IDs. |
| `band`             | `normal`, `observe`, `review_required`, or `urgent_review`.                        |
| `restrictionState` | `active` or `none`.                                                                |
| `signalType`       | One supported trust signal type.                                                   |
| Date filters       | `createdFrom`, `createdTo`, `updatedFrom`, and `updatedTo` as date-time values.    |

Queue entries include the safe player identity, case status and version, score
and band, signal types, restriction summary, `canReview`, and timestamps. Case
detail adds score explanation, effective restrictions, evidence context, and
recent audit history. Restriction records include their appeal status. Treat the
returned `version` as the basis for the next decision; do not keep an older
version after refreshing any case view.

Evidence, restrictions, and history use deterministic pages with `page`,
`pageSize`, `totalItems`, and `totalPages`. Evidence describes the signal,
policy version, observation and expiry, effective contribution, review state,
and safe opponent-pattern aggregates where available. It does not identify the
opponents behind those aggregates.

## Record a decision

Every decision body requires `expectedVersion`, `action`, and a trimmed
`reasonNote` of 1–1,000 characters. Supported actions are:

| Action                | Additional fields and effect                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| `continue_monitoring` | Keeps or starts human review. Optional `evidenceIds` records reviewed context. |
| `dismiss`             | Resolves an eligible case with no active restriction.                          |
| `mark_false_positive` | Requires 1–100 unique `evidenceIds` and adjusts those active signals.          |
| `restrict`            | Requires scopes and `durationHours` from 1 to 168.                             |

Writable restriction scopes are `online_verification_required`,
`location_reward_challenge_hold`, and `new_competitive_match_hold`. The API can
display a historical `card_trade_hold`, but this decision route cannot create
one.

The server locks the case, compares `expectedVersion`, validates the transition,
records the reason and linked evidence, updates restrictions, and advances the
case version atomically. A decision can be rejected when selected evidence is
invalid, a dismissal is not currently permitted, or legacy opponent-pattern
evidence lacks a safe summary and no fresh evaluation supersedes it.

Decision requests have no idempotency key. After an uncertain response, reload
the case and its history before deciding whether any new command is required.
Never repeat a decision blindly with a newer version: the earlier request may
already have changed the score, state, or restrictions.

## Export and recovery

The export response uses format `trust-case-review-v1` and downloads as JSON. It
contains the safe case projection and up to 100 evidence, restriction, and
history records in each collection. Totals and pagination metadata identify
truncation; use the paginated endpoints when the complete review record is
needed.

| Response                          | Caller action                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `400 VALIDATION_ERROR`            | Correct filters, pagination, UUIDs, action-specific fields, or note formatting. |
| `404 TRUST_CASE_NOT_FOUND`        | Remove the inaccessible case from the current workspace.                        |
| `409 TRUST_CASE_VERSION_CONFLICT` | Reload case detail and review the newer version before another decision.        |
| `409 INVALID_TRUST_DECISION`      | Show the safe explanation and keep the case unchanged until the input is fixed. |

Player appeal records can appear in the projection, but player submission and
Author appeal-resolution routes are not currently part of this API. For storage,
retention, and independent-review boundaries, see
[Trust storage](../database/trust-persistence.md).

## AI declaration

Prepared with assistance from Codex[GPT-6], using Author trust-review route
schemas, privacy projections, decision validation, and export bounds.
