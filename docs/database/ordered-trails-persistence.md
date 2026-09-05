---
title: Ordered trail persistence and API design
---

# Ordered trail persistence and API design

## Scope

Migration `0027_create_ordered_trails.sql` and the trail API implement ordered
event trails, protected Author lifecycle operations, derived player progress,
and nearby unvisited guidance. The implementation reuses authoritative events
and event completions rather than introducing a second event or progress
ledger.

See the [ordered trail rules](../requirements/ordered-trails-rules.md) for the
player-facing semantics.

## Relations

### `public.trails`

| Column         | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `id`           | Stable trail UUID                                    |
| `title`        | Nonblank player-facing title                         |
| `description`  | Optional nonblank description                        |
| `status`       | `draft`, `published`, or `retired`                   |
| `published_at` | Publication history; null for never-published drafts |
| `retired_at`   | Retirement history                                   |
| timestamps     | Creation and last mutation times                     |

Lifecycle checks keep timestamps consistent. New rows begin as drafts.
Published definitions are immutable except for the transition to `retired`;
retired definitions are immutable.

### `public.trail_events`

| Column     | Purpose                                  |
| ---------- | ---------------------------------------- |
| `trail_id` | Parent trail                             |
| `event_id` | Existing event                           |
| `position` | One-based order, limited to 1 through 50 |

The primary key prevents an event from appearing twice in one trail. A unique
`(trail_id, position)` constraint prevents two events occupying one position.
A deferred constraint trigger requires every nonempty sequence to remain
contiguous from position 1 at transaction commit. This permits an Author update
to replace the complete order atomically without exposing an intermediate gap.

Foreign keys use `ON DELETE RESTRICT`. An authored trail therefore cannot be
silently damaged by deleting its trail or event references.

## Publication and lifecycle enforcement

Database triggers enforce the final lifecycle boundary:

- membership may change only while the trail is a draft;
- publication requires contiguous membership;
- publication requires at least two events;
- every member event must be published and not retired at publication time;
- published metadata and order are immutable; and
- retirement preserves the trail and membership.

The Author service checks readiness first to return a useful `422
CONTENT_NOT_READY` response, then the trigger repeats the critical check inside
the same transaction. Create, edit, publish, and retire operations also append
an immutable `author_content_audit` row with entity type `trail`.

## Derived progress

There is deliberately no `player_trail_progress` table. Player progress is
derived from the unique `(player_id, event_id)` records in
`public.event_completions`:

1. load trail steps in position order;
2. join only completions for the authenticated local player;
3. walk from position 1 until the first missing completion; and
4. expose that contiguous count and the corresponding step states.

This makes replay and out-of-order completion converge without maintaining a
second mutable cursor. A later event completion cannot advance past a gap, but
it is automatically counted after the gap closes.

Published trails are visible to every active player. Retired, previously
published trails are visible only when that player has a completion for one of
their events. Never-published retired drafts are not exposed to players.

Migration `0030_create_campaign_scheduling.sql` adds an independent effective
trail window. A campaign-scheduled trail remains visible as upcoming or ended,
but only an active window participates in nearby guidance. Campaign retirement
uses the existing historical visibility rule without deleting the trail,
membership order, or event completions. A campaign containing a trail does not
globally schedule the trail's member events.

## Nearby query

`POST /api/v1/events/nearby-unvisited` uses these server-side filters:

- validated local player ID from the bearer-token identity;
- effectively published, non-retired, currently active events;
- no completion for that player and event;
- current step in an effectively active published trail, or no active-trail
  membership;
- `ST_DWithin` against the submitted claim and bounded search distance; and
- deterministic distance and UUID ordering with a bounded result limit.

`ST_Distance` provides display distance in metres. The existing
`events_location_gist_idx` supports the `ST_DWithin` predicate. The database
integration test runs `EXPLAIN` with sequential scans disabled and verifies
that this index appears in the plan.

The result may include multiple trail contexts for one event. It never includes
another player's progress and does not assert location eligibility.

## API and error model

All trail routes require a validated bearer token and active local player.
Author routes additionally require the server-resolved `author` role.

| Failure                                   | Status | Code                      |
| ----------------------------------------- | ------ | ------------------------- |
| Invalid trail body or membership          | `400`  | `INVALID_TRAIL`           |
| Trail hidden or absent                    | `404`  | `TRAIL_NOT_FOUND`         |
| Invalid lifecycle transition              | `409`  | `CONTENT_STATE_CONFLICT`  |
| Trail is not ready to publish             | `422`  | `CONTENT_NOT_READY`       |
| Invalid nearby search                     | `400`  | `INVALID_NEARBY_SEARCH`   |
| Stale, future, or too inaccurate location | `422`  | `LOCATION_RETRY_REQUIRED` |

Fastify schemas reject additional client authority fields such as `playerId`,
`status`, or `currentStepPosition` before a service call.

## Location privacy

The nearby endpoint receives an ephemeral browser claim. It validates
coordinates, nonnegative accuracy, acquisition freshness, distance bounds, and
result limits. The implementation passes coordinates directly as parameterised
query values and does not insert them into a trail, player, or location-history
relation.

The query is discovery guidance only. A player still passes the independent
event eligibility or challenge-start location check before protected gameplay.

## Tests

Focused tests cover:

- Author authentication, role checks, validation, lifecycle errors, and
  OpenAPI registration;
- player authentication, identity isolation, detail states, location retries,
  and nearby defaults;
- pure derivation of out-of-order, caught-up, unavailable, completed, and
  retired states;
- clean migration and database constraints;
- draft reorder, publish, retire, and audit transactions;
- score-zero authoritative completion, player isolation, and retired history;
- nearby current-step, standalone, locked, completed, and distant filtering;
  and
- query-plan evidence for `events_location_gist_idx`.

The PostgreSQL/PostGIS suite is registered in
`apps/api/scripts/run-database-tests.mjs` and requires the isolated
`TEST_DATABASE_URL` target.

## Deployment

Apply migration `0027_create_ordered_trails.sql` before deploying an API version
that registers trail services. The migration is additive except for extending
the existing Author audit entity constraint to accept `trail`. It does not
rewrite events, attempts, completions, or player records.

Issue `#176` did not add a trail seed. Issue `#177` adds the explicitly enabled,
non-production `Campus Highlights Trail` to the `basic-demo` seed set for local
and disposable-database UI verification. Authors create normal trail
definitions through the protected API.

## AI declaration

This persistence design was generated, edited, and reviewed with the assistance
of Codex-CLI[gpt-5.6-sol medium] and Codex-CLI[GPT-5]. Schema, SQL, API, test,
and development-fixture claims were checked against migration `0027` and the
implemented trail modules.
