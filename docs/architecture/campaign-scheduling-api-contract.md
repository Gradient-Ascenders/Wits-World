---
title: Campaign scheduling API contract
---

# Campaign scheduling API contract

## Purpose and authority

Campaigns group existing events and trails into bounded term, Open Day, or
similar schedules. The API and database decide whether scheduled content is
visible or available. The browser cannot publish a campaign, select an
effective window, declare an event active, or bypass retirement.

Campaigns use the curated lifecycle:

`draft → in_review → approved → published → retired`

A different active Author must approve the latest submission. Every edit and
transition uses optimistic `expectedVersion` control and writes an immutable
audit row. The shared [Author curation contract](./author-curation-api-contract.md)
defines the common transition and error behavior.

## Membership and schedule rules

- A draft may contain no members so Authors can save work in progress.
- Approval and publication require at least one event or trail.
- Start is inclusive and end is exclusive: `[startsAt, endsAt)`.
- Every event and trail must exist, be published, and not be retired when the
  campaign is approved and again when it is published.
- A directly assigned event's own period must overlap the campaign period. Its
  effective period is the intersection of both periods.
- An event or trail may be reused in multiple campaigns only when approved or
  published periods do not overlap. Adjacent periods are valid.
- Draft and `in_review` schedules do not reserve a member. Reservation begins
  at approval.
- Membership and schedule content may change only while the campaign is a
  draft.
- A published member event or trail cannot be retired until every published
  campaign referencing it is retired.

Event membership and trail membership are independent. Assigning a trail to a
campaign gates the trail experience, not each member event's standalone
discovery. An event is globally campaign-scheduled only when it is directly
assigned to a campaign.

## Effective player availability

Unassigned published events and trails retain their existing behavior. Draft,
submitted, and approved campaigns do not affect players.

After a campaign has been published, its member is considered scheduled:

- an active published window makes it active;
- the nearest future published window makes it upcoming;
- otherwise the most recent ended published window makes it ended; and
- retiring all published windows removes the member from new discovery.

Campaign end does not run a background retirement job. The campaign remains
`published` and its content is returned as ended until an Author retires it.
Player event responses retain their existing shape and expose only effective
`startsAt`, `endsAt`, and `availability`. Campaign identifiers and titles are
not exposed through player event or trail payloads.

Retired campaign trails remain available only as private history for players
with an authoritative completion on the trail. Completed steps remain
completed; unfinished steps become unavailable. Attempts, completions,
rewards, ownership, progression, decks, and match records are never deleted or
rewritten by campaign retirement.

## Author endpoints

All routes require a validated bearer token, an active local account, and the
server-resolved `author` role:

- `GET /api/v1/author/campaigns`
- `POST /api/v1/author/campaigns`
- `PUT /api/v1/author/campaigns/{campaignId}`
- `POST /api/v1/author/campaigns/{campaignId}/submit`
- `POST /api/v1/author/campaigns/{campaignId}/approve`
- `POST /api/v1/author/campaigns/{campaignId}/return`
- `POST /api/v1/author/campaigns/{campaignId}/publish`
- `POST /api/v1/author/campaigns/{campaignId}/retire`

Create and update bodies contain title, optional description, start/end,
`eventIds`, and `trailIds`. Update and transition operations include
`expectedVersion`. Return requires a reason. Fastify rejects browser-supplied
identity, lifecycle, publication, and effective-availability fields.

Campaigns also appear in `GET /api/v1/author/review-queue` and
`GET /api/v1/author/content/campaign/{campaignId}/history`.

The generated OpenAPI document is the exact field and response reference.
Stable campaign-specific failures include `400 INVALID_CAMPAIGN` for invalid
draft data and `404 CAMPAIGN_NOT_FOUND` for an absent campaign. Shared curation
errors cover self-review, stale versions, invalid transitions, and readiness.

## Current limitation

Issue `#183` implements persistence and HTTP APIs. Campaign forms, review
controls, and retirement controls in the Author console belong to issue `#185`.
There is no public standalone campaign endpoint, automatic event placement,
offline campaign mode, scheduler worker, or campaign analytics dashboard.

## AI declaration

This contract was generated, edited, and reviewed with the assistance of
Codex-CLI[gpt-5.6-sol medium]. It records the implemented issue `#183` behavior
and does not claim that the issue `#185` Author interface is complete.
