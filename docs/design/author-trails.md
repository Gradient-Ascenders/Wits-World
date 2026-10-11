---
title: 'Author trails'
description: Prepare an ordered trail, publish it when its events are ready, and preserve existing progress when retiring it.
---

# Author trails

Authors can arrange existing events into an ordered trail. Trail management is currently **API-only**; the console can select published trails for campaigns but has no trail creation or editing workspace.

The [API reference](../api-reference.md) provides the authenticated Author trail operations. The workflow below describes what to prepare and when each operation is allowed.

## Prepare and publish

1. Create a draft with a nonblank title, an optional nonblank description, and an ordered list of existing event IDs.
2. Save or reorder the draft until the route is suitable. Each event can appear only once; a trail can contain up to 50 events.
3. Before publishing, include at least 2 events and confirm that every member is published and not retired.
4. Publish the trail. Publication fixes its title, description, and event order.

An empty or single-event draft is allowed. Updating a draft replaces its metadata and complete event order together. Draft members must exist, but they do not all need to be published until trail publication.

Trails use the direct lifecycle **Draft → Published → Retired**. They do not enter the shared independent-review queue. Their event content still follows the normal event review and publication process.

## Keep the trail usable

Check that the chosen events have compatible schedules and reachable locations. Publishing a trail does not extend an event's availability or bypass its location checks. Temporary unavailability can prevent a player from completing the next stop.

A published trail can be included in a [campaign](../architecture/campaign-scheduling-api-contract.md). Events in a published trail are excluded from the automatic-placement pool, so consider trail membership before relying on portable event assignments.

Progress uses existing event completions rather than a separate trail reward or progress ledger. See [Trail rules](../requirements/ordered-trails-rules.md) for player ordering, previously completed events, and unavailable stops.

## Retire or replace

Published and retired trails cannot be edited or republished. Create a replacement draft to change an existing route.

Retirement removes a trail from active guidance while retaining its definition, membership, and existing player context. A published campaign containing the trail must be retired before the trail can be retired.

Trail mutations are transactional and audited, but use a separate contract from reviewed content. They do not accept the shared `expectedVersion` field. The [trail storage reference](../database/ordered-trails-persistence.md#author-operations) lists the API operations and concurrency boundary.

**AI declaration**

This guide was written and checked against the Author trail API, service, and campaign/placement rules with assistance from Codex[GPT-6].
