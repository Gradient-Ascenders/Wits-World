---
title: 'Trail rules and progress'
---

# Trail rules and progress

## Purpose

Trails join existing campus events into an Author-defined order. They guide a
player from the next unfinished event to the next without changing the event
challenge, location eligibility, or reward rules.

## Confirmed rules

- A trail has a title, optional description, lifecycle status, and an ordered
  list of unique events.
- An event may appear once within one trail and may be reused by other trails.
- A trail requires at least two events before publication.
- Every member event must be published and not retired when the trail is
  published.
- Draft trails may be edited and reordered.
- Published trails are immutable. An Author may retire one but cannot rewrite
  its historical order.
- Retired trails remain visible only to players who have progress on them.
- Retiring a trail does not delete event completions or historical progress.
- A published trail assigned directly to a campaign follows the campaign's
  effective window. Upcoming and ended trails remain visible but unavailable.
- Retiring a campaign removes its trail from new discovery while preserving it
  for players with progress.
- Campaign membership gates the trail, not its member events in standalone
  event discovery.

## Progress rule

Trail progress is the longest contiguous prefix of events for which the
authenticated player has an authoritative `event_completions` record.

Any finalised event attempt counts as completion for trail ordering, including
a timeout or a score of zero. The trail does not create a second success or
reward rule. Challenge score, progression points, and cards remain governed by
the challenge and progression reward policies.

Example:

| Trail order | Existing completion | Derived state before event 1 completes | Derived state after event 1 completes |
| ----------- | ------------------- | -------------------------------------- | ------------------------------------- |
| Event 1     | No                  | Current                                | Completed                             |
| Event 2     | Yes                 | Locked                                 | Completed                             |
| Event 3     | No                  | Locked                                 | Current                               |

Completing Event 2 early does not skip Event 1. The Event 2 completion remains
authoritative and is incorporated automatically when Event 1 later closes the
gap. The player does not repeat Event 2.

For an active trail:

- prefix events are `completed`;
- the first missing event is `current` when it is active and published;
- the first missing event is `unavailable` when it is upcoming, ended, or
  retired; and
- every later event is `locked`.

For an incomplete retired trail, completed prefix events remain `completed` and
all remaining events are `unavailable` with reason `trail_retired`. A fully
completed trail remains `completed` even if it is later retired.

## Nearby unvisited guidance

The nearby endpoint returns active, published, unvisited events within the
requested distance when they are either:

- the player's current step in at least one published trail; or
- not a member of any published trail.

Locked later trail steps are excluded. One event may contain multiple trail
contexts when it is currently actionable in multiple trails.

The defaults are a 1,000 metre search distance and 20 results. Callers may
request 100 to 5,000 metres and 1 to 50 results.

Nearby guidance uses a fresh browser location claim, but it does not make the
player eligible to open a challenge. Event eligibility still requires the
separate server-authoritative eligibility or challenge-start check.

## Authority and privacy

The API derives player identity from the validated bearer token. The browser
cannot submit progress, completed positions, unlock state, or another player
ID.

The nearby request contains latitude, longitude, reported accuracy, and device
acquisition time. The claim is validated for range, freshness, and usable
accuracy. It is used for the bounded PostGIS query and is not persisted as
trail history.

## API operations

Player operations:

- `GET /api/v1/trails`
- `GET /api/v1/trails/{trailId}`
- `POST /api/v1/events/nearby-unvisited`

Author operations:

- `GET /api/v1/author/trails`
- `POST /api/v1/author/trails`
- `PUT /api/v1/author/trails/{trailId}`
- `POST /api/v1/author/trails/{trailId}/publish`
- `POST /api/v1/author/trails/{trailId}/retire`

The generated OpenAPI document is authoritative for request and response
schemas.

## Player discovery experience

The authenticated `/explore` sheet provides map-independent **Events**,
**Nearby**, and **Trails** views. Trail summaries show authoritative completed
and total step counts. Trail detail preserves the server-returned order and
labels every stop as completed, current, locked, unavailable, or retired with
text and an icon rather than colour alone.

Only a server-returned `current` step exposes **Open current event**. That action
opens the existing event detail, reported-location eligibility, and challenge
start journey; it does not create a trail-specific challenge path or infer
eligibility in React.

Nearby discovery runs only after a player asks for that view and a usable
reported-location claim is available. The result list and displayed map-marker
set use the same API response. Empty, permission-denied, inaccurate, malformed,
retired, and network-failure states retain the full event and trail lists as
alternatives and expose a safe retry where retry can help.

## Deferred work

This implementation does not add offline trails, automatic route optimisation,
advanced event placement, or a trail-specific reward.

## AI declaration

This rule document was generated, edited, and reviewed with the assistance of
Codex-CLI[gpt-5.6-sol medium] and Codex-CLI[GPT-5]. It records the decisions
approved for issues `#176` and `#177` and was reconciled with the implemented
API, migration, and player discovery UI.

Page title clarified with assistance from Codex-CLI[GPT-6].
