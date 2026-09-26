---
title: 'Content authoring API'
---

# Content authoring API

## Question performance projection

`GET /api/v1/author/question-performance` is an active-Author-only, bounded aggregate projection for issue `#184`. It accepts optional `eventId`, `challengeId`, `format`, `difficulty`, inclusive `from`, and exclusive `to` filters plus `page` and `pageSize` (`1` through `100`). UUIDs, enums, timestamps, pagination, and range ordering are validated before query execution.

Each item contains `questionId`, `challengeId`, `eventId`, `eventTitle`, current prompt/format/difficulty/status, aggregate answer/correct/incorrect/timeout counts, rates, and the server-derived `hasSufficientSample` and `isProblematic` flags. Those identifiers are sufficient for the existing Author question route. The projection excludes attempt IDs, player identity, submitted choices/order, and location. It never returns attempt rows for browser-side aggregation.

The threshold constants are returned with every page: minimum sample size `10` and problematic incorrect rate `0.7`. `answerCount` means submitted answers plus at most one legitimate current-question timeout per timed-out attempt; future unanswered snapshots are excluded. Empty and out-of-range pages retain correct total metadata. See [Question performance analytics](../database/question-performance-analytics.md) for exact timeout, denominator, filtering, and index semantics.

The 10-outcome minimum controls only whether the server may mark a question as problematic; it is not a disclosure threshold. An authenticated active Author can see exact aggregate counts and rates for smaller samples. The closed response omits player and attempt identity, submitted choices/orders, and location, but a highly selective combination of content and date filters can still permit inference about a known small sample. Issue `#184` and the checked-in architecture record do not require small-sample suppression, so the endpoint preserves those curation details rather than introducing an undocumented privacy mechanism.

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

The event package endpoint performs the question, challenge, and event steps
inside one transaction. A package approval accepts its newly approved children;
publication still requires published children. A failure at any step rolls back
all transitions and audit records.

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

The console uses `POST /api/v1/author/events/:eventId/package/{submit,approve,publish,return}`
for the event review package. The body contains the event `expectedVersion` and
an optional note, except `return` requires a reason. The server requires exactly
one active challenge and at least five active questions for submission,
approval, and publication. It locks and transitions children before the event;
each child retains its own review history and independent-review check.
Already approved or published children are not resubmitted or republished.
Resource-specific endpoints remain available for existing clients.

`GET /api/v1/author/review-queue` is an active-Author-only, paginated queue of
`in_review` summaries. It accepts an optional `entityType` filter and a page size
up to 100, sorts by submission time and stable identifiers, and includes a
server-derived `canReview`. Self-submissions remain visible with `canReview:
false`. Every item includes nullable `eventId` and `challengeId` navigation
context. Challenges include their `eventId`; questions include both parents;
top-level events, cards, and campaigns return `null` for both fields.
When an event package is in review, its child challenge and questions are omitted
from the unfiltered queue so reviewers see one event package entry. Direct
entity-type filtering remains available for legacy individual reviews.

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

## Provenance, compatibility, and Web coverage

Migration `0029_curate_author_content_lifecycle.sql` marks existing published or
retired rows as `legacy`. Repository-controlled repeatable seeds use
`controlled_seed`; ordinary reviewed publication uses `reviewed`. Event
`is_published`/`retired_at` and card `is_active` remain constrained compatibility
fields rather than independent sources of lifecycle truth.

The Author console presents each event's challenge and questions in one view.
Authors may draft all questions before submitting the package once; the Overview
tab and separate Challenge/Questions tabs are no longer shown. Event details
and history remain available in a disclosure, and old deep links still resolve.
The Author console exposes submission, independent review, return reasons,
approval, publication, confirmed retirement, the filtered review queue, and
lazy review history for events, multiple-choice and ordering
challenges/questions, cards, and campaigns. Ordering authoring records exactly
four nonblank items in authoritative correct-sequence order. Queue summaries
navigate to the authoritative entity detail before review actions are offered.
Editing remains draft-only; lifecycle conflicts reload authoritative detail,
while stale campaign edits preserve the local form until the Author confirms
replacing it with the server version. The browser derives successful lifecycle
feedback from the returned resource and does not infer a new state from the
requested action.

Card `imageUrl` is optional. Author card creation and editing accept a direct
absolute HTTP(S) URL or a same-origin `/cards/` artwork path (as used by the
seeded catalogue); malformed URLs and other schemes are rejected with a 400.
The Author form previews valid values but does not upload or verify image
rights. A URL may pass validation yet still fail to load, in which case the
preview shows a failure state.

Event and question reads include `sourceUrls`, a list of constrained HTTPS
review references introduced for the issue `#165` verified content pack. The
Author console renders these links on detail views. They are review metadata,
not accepted-answer data, and are not included in player event or challenge
payloads. Ordinary Author-created legacy-compatible content returns an empty
list until source editing is added through a separately reviewed contract.

Question analytics and flagged-question workflows remain blocked by issue
`#184` / S3-06 because no current analytics contract is available. The console
does not invent or mock that data.

## AI declaration

This contract was generated, edited, and reviewed with the assistance of
Codex[gpt-5.6-sol] and Codex[GPT-5]. It describes the implemented issue `#182`
contract, issue `#185` Author-console integration, and issue `#163` ordering
authoring integration; it does not claim that blocked analytics or asynchronous
PvP is implemented.

Page title clarified with assistance from Codex-CLI[GPT-6].

Event review-package, Author console, and artwork URL contract updates were
edited with assistance from Codex[GPT-5].
