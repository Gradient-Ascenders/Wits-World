---
title: Author curation API contract
---

# Author curation API contract

## Scope and authority

Events, challenges, questions, cards, and campaigns share the server-authoritative
lifecycle `draft → in_review → approved → published → retired`. Only `published` content is
available to player discovery, eligibility, attempts, rewards, starter packages,
or CPU catalogue selection. Retirement stops future selection without deleting or
rewriting attempts, snapshots, completions, progression awards, achievements,
standings, owned cards, decks, or completed matches.

Every operation resolves an active local Author from the validated access token.
The API ignores browser claims about the actor, reviewer, status, readiness, or
publication. A row lock, optimistic version comparison, dependency locks, update,
and audit insert occur in one transaction.

## Transitions and permissions

| Operation | Allowed transition     | Actor rule                                       |
| --------- | ---------------------- | ------------------------------------------------ |
| Edit      | `draft → draft`        | Any active Author                                |
| Submit    | `draft → in_review`    | Any active Author; becomes the current submitter |
| Approve   | `in_review → approved` | Active Author other than the current submitter   |
| Return    | `in_review             | approved → draft`                                | Active Author other than the current submitter; reason required |
| Publish   | `approved → published` | Any active Author                                |
| Retire    | `published → retired`  | Any active Author                                |

There is no transition out of `retired` and no unpublish operation. Returning a
record clears its submission/review metadata, so repair and resubmission form a
new review cycle. The Author who performs the latest submit action is the owner of
that submission for the self-review rule, regardless of who created or edited the
draft.

All edit and transition bodies include `expectedVersion`. A successful edit or
transition increments `version` exactly once and creates exactly one audit row.
Concurrent requests using the same version cannot both succeed.

## Readiness and dependency order

Readiness is checked when a different Author approves content and checked again
when any Author publishes it. Publication returns `422 CONTENT_NOT_READY` without
changing state or version when a dependency changed after approval. A different
Author can return that approved record to draft for repair.

Nested publication proceeds from leaves to roots:

1. questions with format-appropriate items, complete private answer keys, and a
   nonblank explanation;
2. a challenge with at least five complete published questions, while its event
   has no other published challenge;
3. cards with complete executable content (exactly four moves for a Creature, or
   one or more effects for a Power card); and
4. an event with exactly one published challenge and at least one active,
   published Common reward card; and
5. a campaign with at least one published event or trail, intersecting event
   periods, and no member schedule overlap.

The coordinator locks dependencies in stable identifier order. Retirement guards
prevent removing a dependency that would make still-published parent content
invalid. Configured canonical starter definitions cannot be retired until their
authoritative starter-package configuration has been replaced, so one retirement
cannot break the server-derived starter options.

## HTTP endpoints

Existing resource-specific Author paths remain in place. Each resource supports
`POST .../:id/submit`, `/approve`, `/return`, `/publish`, and `/retire`. Submit,
approve, publish, and retire bodies contain `expectedVersion` plus an optional,
trimmed note of at most 1,000 characters. Return contains `expectedVersion` and a
required, trimmed `reason` of 1–1,000 characters. Edit bodies also require
`expectedVersion`.

`GET /api/v1/author/review-queue` is an active-Author-only, paginated queue of
`in_review` summaries. It accepts an optional `entityType` filter and a page size
up to 100, sorts by submission time and stable identifiers, and includes a
server-derived `canReview`. Self-submissions remain visible with `canReview:
false`.

`GET /api/v1/author/content/:entityType/:entityId/history` returns paginated,
version-ordered audit records. Queue and history responses contain only stable
local player IDs and safe actor labels. The label is the current Player Name,
`Deleted author` for an account-deletion tombstone, or `Unnamed author` when an
active account has no Player Name. They exclude Auth0 identifiers, email, private
answers, event coordinates, and full content bodies.

Stable workflow failures are:

| Status | Code                     | Meaning                                             |
| ------ | ------------------------ | --------------------------------------------------- |
| `403`  | `SELF_REVIEW_FORBIDDEN`  | Current submitter attempted approve or return       |
| `409`  | `CONTENT_STATE_CONFLICT` | Requested operation is invalid in the current state |
| `409`  | `STALE_CONTENT_VERSION`  | `expectedVersion` no longer matches                 |
| `422`  | `CONTENT_NOT_READY`      | Content or a locked dependency is incomplete        |

The generated OpenAPI document remains the exact schema reference.

Campaign-specific membership, effective-window, and retirement behavior is
defined in the [campaign scheduling contract](./campaign-scheduling-api-contract.md).

## Provenance, compatibility, and Web limitation

Migration `0029_curate_author_content_lifecycle.sql` marks existing published or
retired rows as `legacy`. Repository-controlled repeatable seeds use
`controlled_seed`; ordinary reviewed publication uses `reviewed`. Event
`is_published`/`retired_at` and card `is_active` remain constrained compatibility
fields rather than independent sources of lifecycle truth.

The current Author console understands all five states, versions, and review
metadata, and allows editing only drafts. Reviewer actions and the review queue UI
belong to issue `#185`; therefore the console cannot currently submit, approve,
return, or publish. Active Authors can use the documented API in the interim.

## AI declaration

This contract was generated, edited, and reviewed with the assistance of
Codex[gpt-5.6-sol] and Codex[GPT-5]. It describes the implemented issue `#182`
contract; it does not claim that issue `#185` reviewer UI or asynchronous PvP is
implemented.
