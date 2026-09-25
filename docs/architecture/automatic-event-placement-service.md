---
title: Automatic event placement service
---

# Automatic event placement service

Issue `#262` connects the reviewed `placement-v1` catalogue to player event
locations. The API selects assignments from explicitly approved portable
events, active reviewed sites, and active coverage zones. Published events
without portability history continue to use their authored points. A portable
event without a valid current assignment is unavailable to players; it never
falls back to its authored point.

## Rotation and consistency

The API placement worker evaluates the current Johannesburg rotation bucket at
startup, at the next `04:00 Africa/Johannesburg` boundary, and every 30 minutes
for invalidation and override expiry. PostgreSQL time determines the bucket and
the boundary delay. The singleton placement-state row is
locked for each apply, override, lifecycle change, and scheduled evaluation.
One scheduled committed plan per policy and bucket is enforced by a unique
index. An Author change or invalidated assignment can produce a later
`reconcile` plan in the same bucket.

The planner reads the persisted policy, active sites and zones, eligible event
and challenge publication state, campaign availability, fixed-event positions,
current assignments, active overrides, and assignment history. PostGIS computes
the authoritative metre distances. The planner uses stable UUID tie-breakers;
it reserves pins, preserves valid current assignments where possible, and fills
the six slots while prioritising the one-per-zone floor and then two per zone.
For the mandatory floor it revisits ranked site and event choices, including
which current assignments to retain within the rotation replacement limit, so
an early choice cannot hide a feasible zone assignment. It records shortfalls
and cooldown-floor exceptions. An entirely unserved zone prevents application
and leaves still-valid assignments in place.

Preview creation writes an immutable plan and its proposed entries without
changing player-visible assignments. Apply locks placement state, checks the
expected version, policy, bucket, expiry, actor, and a fresh input digest,
recomputes the proposal, and commits assignment ends, starts, state, and audit
in one transaction. A stale preview returns HTTP `409`. Rollback creates a new
plan after validating historical choices under the current policy; it does not
reopen historical assignments.

The Author state response exposes the complete immutable policy snapshot and
portable-event display names. Preview responses include server-generated
coverage and separation validation. Coverage diagnostics report actual,
mandatory, and preferred counts per zone. Separation diagnostics identify
reviewed candidate sites blocked by selected assignments or fixed events,
without exposing fixed-event coordinates. These fields are presentation evidence
only: the browser does not recompute placement outcomes.

## Author API

All routes below use `/api/v1`, require an authenticated active Author, and
return `Cache-Control: no-store` where they expose a preview or current state.
Mutation bodies require `expectedVersion` and a bounded nonempty `reason`.
The Author identity comes from the validated token, never the request body.

| Route                                                 | Purpose                                                                                                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /author/event-placement`                         | Current policy, bucket, state version, assignment and coverage metrics, recent safe failure, active assignments, site and zone presentation data, and overrides |
| `GET /author/event-placement/history`                 | Recent plan status and safe failure history                                                                                                                     |
| `POST /author/event-placement/previews`               | Persist and return a proposed plan                                                                                                                              |
| `POST /author/event-placement/apply`                  | Apply `planId` with the expected state version                                                                                                                  |
| `POST /author/event-placement/overrides`              | Create a pin, site exclusion, or automation pause with `idempotencyKey` and `durationHours`                                                                     |
| `POST /author/event-placement/overrides/:id/end`      | End an override early                                                                                                                                           |
| `POST /author/event-placement/sites/:id/status`       | Suspend, reactivate, or retire a reviewed site                                                                                                                  |
| `POST /author/event-placement/zones/:id/status`       | Suspend, reactivate, or retire a reviewed zone                                                                                                                  |
| `POST /author/event-placement/events/:id/portability` | Approve or withdraw a separately reviewed portable event                                                                                                        |
| `POST /author/event-placement/rollback`               | Create and apply a new plan from `sourcePlanId`                                                                                                                 |

## Author workspace

Issue `#265` adds the protected `/author/placement` workspace. The semantic
current-versus-proposed ledger, coverage table, and candidate-site register are
the complete operational representation; the synchronized Mapbox layers are a
visual aid. Marker labels and patterns distinguish current, proposed, excluded,
overridden, and unused candidate sites, while zone fill and line patterns show
served, preferred-shortfall, and unserved coverage.

Preview is non-consequential. Apply, pause, pin, temporary site exclusion,
ending an override, and rollback require a reason and an explicit confirmation.
The workspace sends the API-provided state version and, for apply, the persisted
preview identifier. HTTP `409` clears the stale preview and refreshes current
state and history without retrying the mutation. Applying then requires a fresh
preview. Author navigation and route guards hide the workspace from ordinary
players; every API route independently enforces authentication, active-player
status, and the Author role.

The workspace intentionally does not expose site/zone lifecycle controls or
portable-event approval. Those existing API operations remain separate review
workflows. Map failure leaves all placement data and actions available through
the semantic tables and controls. The map receives reviewed site points and zone
geometry only; it receives no player location, fixed-event coordinate, or
placement-decision input.

Pins require `eventId` and `siteId`; site exclusions require `siteId`; pauses
take neither. An idempotency key replay with the same payload returns the
existing override. A changed payload returns HTTP `409`. Site exclusion,
suspension, retirement, and portability withdrawal close affected assignments
in the same transaction. Authors must review event wording and evidence for
landmark independence before approving portability. Existing fixed,
landmark-specific published content should remain fixed; the appropriate path
is a separately reviewed replacement event.

## Player and offline behavior

Discovery, eligibility, and trail reads resolve the effective location in the
database. Challenge start retains the selected assignment identifier on the
attempt, so a later rotation cannot move an attempt already started. The
player API does not expose placement history or Author review data.

Offline packs for assigned events are signed with the assignment identifier
and expire no later than the next rotation boundary. Submission checks that
the assignment matched the event and site at the claimed start time; an old
pack cannot claim a replacement location. Assignment history remains
available for a valid start before a later rotation or site suspension.

## Release and operations

Apply migration `0049_enable_event_placement_services.sql` and the existing
`0003_event_placement_catalogue.sql` seed before starting this API version.
The migration preserves authored event coordinates and existing attempts. It
adds an optional assignment reference to attempts, adjusts plan constraints
for Author and reconciliation plans, and installs the location resolver.
There are no new environment variables. The API process hosts the scheduler;
Azure App Service `Always On` must stay enabled. Multiple API instances use
the same placement-state lock and scheduled-plan uniqueness boundary.

The initial seed has no portable-event approvals, so the worker may record a
safe unserved-zone failure until reviewed portable replacements are approved.
Authors can inspect recent plans through the history route. Operational logs
contain outcome and duration, without player location or challenge answers.
Deployment verification should confirm migration and seed completion, API
health, an Author preview/history response, and unchanged fixed-event
discovery. A live rotation requires reviewed portable content and should not
be manufactured from existing landmark-specific events.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5].
