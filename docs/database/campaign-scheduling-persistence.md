---
title: 'Campaign schedule storage'
---

# Campaign schedule storage

## Schema

Migration `0030_create_campaign_scheduling.sql` adds:

| Relation                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `public.campaigns`       | Schedule, curated lifecycle, version, provenance, and history |
| `public.campaign_events` | Direct event membership                                       |
| `public.campaign_trails` | Trail membership                                              |

Both membership tables use composite primary keys and restrictive foreign
keys. Duplicate membership is impossible, and deleting a referenced event,
trail, or campaign cannot silently erase campaign history. Campaign title,
period, and membership are mutable only in `draft`; previously published
campaigns and memberships are retained after retirement.

The migration extends `author_content_audit` to accept `campaign`. Create,
edit, submit, approve, return, publish, and retire actions therefore use the
same versioned audit contract as other curated content.

## Integrity and concurrency

Approval and publication call `validate_campaign_schedule` inside the owning
transaction. It verifies:

- at least one member;
- valid published event and trail references;
- intersection between each directly assigned event and campaign period; and
- no overlap with approved or published campaigns sharing the same member.

The period uses PostgreSQL's start-inclusive/end-exclusive interpretation.
`08:00–10:00` and `10:00–12:00` are adjacent and valid; `09:59–11:00` overlaps
the first period.

Member-scoped transaction advisory locks and stable event/trail row locks make
concurrent approval deterministic. Two overlapping requests for the same
member cannot both commit. Event and trail retirement use the same member lock
namespace, preventing a publication/retirement race from leaving a published
campaign with a retired member.

The service performs readiness checks for safe Author errors, while database
triggers remain the final integrity boundary for direct or concurrent writes.

## Effective availability functions

`resolve_event_availability(event_id, evaluated_at)` centralises event timing
for discovery and eligibility. For directly scheduled events it intersects the
event and campaign periods, selects the active window, nearest future window,
or most recent ended window, and returns `active`, `upcoming`, `ended`, or
`unpublished`.

`resolve_trail_availability(trail_id, evaluated_at)` applies campaign windows
to trail guidance and returns `active`, `upcoming`, `ended`, or `retired`.
Unassigned published trails remain active with null effective schedule dates.

These stable SQL functions are consumed by event discovery, event eligibility,
trail list/detail, and nearby-unvisited queries. Challenge start already uses
event eligibility, so it inherits campaign timing without trusting a campaign
claim from the browser.

## Indexes

- `campaigns_review_queue_idx` serves submitted campaign review ordering.
- `campaigns_effective_schedule_idx` serves approved/published period checks.
- `campaigns_published_history_idx` distinguishes never-published drafts from
  historically scheduled content.
- `campaign_events_event_idx` and `campaign_trails_trail_idx` serve member
  lookup, overlap detection, retirement guards, and effective windows.

Existing PostGIS indexes remain responsible for event distance filtering.

## History and privacy

Retirement changes campaign lifecycle state and effective discovery only. It
does not cascade into events, trails, attempts, event completions, rewards,
owned cards, progression, decks, or matches. Trail history is still derived
from the authenticated player's event completions; no campaign progress cursor
or precise location history is stored.

Player event and trail queries expose effective time/state but not campaign
identity or Author metadata. Campaign definitions and member summaries are
available only through protected Author APIs.

## Verification and deployment

`campaign-persistence.integration.test.ts` creates a disposable database,
applies the complete migration chain, and covers constraints, exact boundaries,
overlap and adjacency, concurrent approval, discovery/eligibility, blocked
member retirement, campaign retirement, audit history, and preserved trail
completion history.

Apply `0030_create_campaign_scheduling.sql` after
`0029_curate_author_content_lifecycle.sql` and before deploying the API version
that registers campaign services or calls the effective-availability functions.
No campaign seed content or scheduler process is introduced.

## AI declaration

This persistence document was generated, edited, and reviewed with the
assistance of Codex-CLI[gpt-5.6-sol medium]. Claims were checked against
migration `0030`, the implemented services, and focused integration tests.

Page title clarified with assistance from Codex-CLI[GPT-6].
