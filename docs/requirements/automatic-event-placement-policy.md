---
title: 'Placement rules'
description: Understand eligible events, campus coverage, separation, rotation, and Author override limits.
---

# Placement rules

Automatic placement distributes eligible events across reviewed campus sites.
The current policy is **`placement-v1`**. The API and PostgreSQL/PostGIS select
and validate assignments; the map displays their results.

Use [Event placement](../architecture/automatic-event-placement-service.md) for
the Author preview/apply workflow and API controls. This page defines the rules
those controls must follow.

## Portable event boundary

A **fixed event** uses its authored point. A **portable event** has **Automatic
placement** enabled and uses a current event-to-site assignment.

Enable automatic placement only when the event's wording, answers, explanation,
and evidence remain valid at any reviewed site. Landmark-specific content
should stay fixed. Published content is immutable; use a separately reviewed
replacement event when its content needs to change.

An event enters the eligible pool only while it:

- has active portability under the current policy;
- is published and inside its effective event/campaign window;
- has a published challenge with at least 5 published questions;
- is not a member of a published trail.

Its interaction radius must fit the selected site's reviewed maximum. The
initial catalogue supports radii up to **60 metres**. Campaign membership alone
does not enable automatic placement.

Fixed events do not use automatic slots. Pins do. A portable event without a
valid assignment is unavailable; it never falls back to an authored point.

## Coverage and separation

| Setting                   | `placement-v1` rule                                  |
| ------------------------- | ---------------------------------------------------- |
| Automatic target          | 6 concurrent assignments                             |
| Preferred coverage        | 2 assignments per active zone                        |
| Required coverage         | At least 1 assignment per active zone                |
| Minimum centre separation | 150 metres, or the sum of both event radii if larger |
| Rotation boundary         | Daily at 04:00 Johannesburg time                     |
| Normal replacement limit  | Up to 2 current unpinned assignments per rotation    |
| Site cooldown             | 2 completed rotation buckets                         |
| Preview lifetime          | At most 15 minutes, shortened by relevant boundaries |

Separation is checked between proposed automatic or pinned assignments, and
between each proposed assignment and every currently live fixed event:

```text
required distance = max(150 metres, first radius + second radius)
actual PostGIS distance >= required distance
```

Equality is allowed. These checks do not move fixed events or reject existing
fixed-to-fixed pairs. When a newly published or scheduled fixed event conflicts
with an automatic assignment, the automatic assignment ends and placement seeks
a replacement.

| Plan outcome | What happens                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Valid        | The target and preferred coverage are satisfied; the plan can apply.                                        |
| Degraded     | All active zones are served, but the target or preferred coverage is short; a smaller valid plan can apply. |
| Unserved     | At least 1 active zone has no assignment, or another hard rule fails; the new plan cannot apply.            |

For example, a 6-assignment plan can use a different zone split when 2 per zone
is infeasible, provided every active zone still receives at least 1 assignment.
A shortage never permits a separation or lifecycle rule to be bypassed.

## Rotation and reuse

A rotation bucket begins at 04:00 in `Africa/Johannesburg`. Database time
selects the bucket. The boundary triggers an evaluation; it does not by itself
expire otherwise valid assignments.

The planner reserves valid pins, then considers which current assignments can
stay within the replacement limit. It fills mandatory zone coverage before
preferred coverage and explores alternatives when an early choice would leave
a feasible zone unserved.

Candidate sites and eligible events are ranked by earliest last-assignment end,
with never-used records first, then fewer lifetime assignments, then stable
internal identifiers. Identical inputs and history produce the same result.
Player location, map rendering, and request arrival order do not select placements.

A site used in either of the preceding 2 completed buckets is cooling down.
An existing pin can retain its event there, but cannot introduce a different
event during cooldown. The planner may reuse a cooling-down site only to satisfy
a zone's mandatory floor, and records that exception. All other hard rules still apply.

If no safe new plan can apply, still-valid assignments remain active. Assignments
that become invalid end even when there is no replacement. A failed rotation
never keeps a suspended site in use merely to meet the target.

## Previews and assignment history

A preview is tied to its requesting Author, policy, rotation bucket, input
snapshot, and state version. It expires no later than the next rotation
boundary or an earlier relevant content, campaign, or override boundary.
Expiry does not change live assignments.

Applying revalidates those inputs and the exact proposed entries. Live changes,
state version, and history commit together. Each event and site can have at
most 1 current assignment. Scheduled retries cannot rotate another pair or
create duplicate assignment history.

Assignment periods include their start and exclude their end. Replaced
assignments receive an end time and reason; new assignments are appended.
Rollback also creates a new plan and new records under current rules, rather
than editing history.

## Author overrides

| Override          | Maximum duration | Rules                                                               |
| ----------------- | ---------------- | ------------------------------------------------------------------- |
| Pin event to site | 7 days           | Occupies an automatic slot and counts toward zone coverage.         |
| Pause rotation    | 7 days           | Pauses new automatic rotations; invalid assignments still end.      |
| Exclude site      | 30 days          | Prevents selection and ends an assignment currently using the site. |

Every override needs a reason, current state version, and audit record. Pins
cannot bypass event readiness, availability, radius, separation, site lifecycle,
trail restrictions, or another zone's required floor. Overrides can be ended early.

Applying and rollback follow the same hard rules. The workspace exposes these
controls; site/zone suspension, reactivation, and retirement use the protected API.

## Reviewed campus catalogue

The initial catalogue contains **11 sites across 3 coverage zones**:

| Zone               | Candidate site                         | Retained review reference                                                                                                          |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| East Campus        | Great Hall                             | [OpenStreetMap](https://www.openstreetmap.org/way/452712704)                                                                       |
| East Campus        | William Cullen Library                 | [OpenStreetMap](https://www.openstreetmap.org/way/26327942)                                                                        |
| East Campus        | The Matrix                             | [OpenStreetMap](https://www.openstreetmap.org/way/739521835)                                                                       |
| East Campus        | Amphitheatre                           | [OpenStreetMap](https://www.openstreetmap.org/way/739545292)                                                                       |
| West Campus        | Origins Centre                         | [Wits visitor page](https://www.wits.ac.za/origins/plan-your-visit/), [OpenStreetMap](https://www.openstreetmap.org/way/26327903)  |
| West Campus        | Wits Anglo American Digital Dome       | [Wits visitor page](https://digitaldome.wits.ac.za/plan-your-visit/), [OpenStreetMap](https://www.openstreetmap.org/way/223889931) |
| West Campus        | Wits Science Stadium                   | [OpenStreetMap](https://www.openstreetmap.org/way/235891611)                                                                       |
| West Campus        | Mathematical Sciences Laboratory (MSL) | [Wits contact page](https://www.wits.ac.za/csam/contact-us/)                                                                       |
| Arts and Community | Wits School of Arts                    | [OpenStreetMap](https://www.openstreetmap.org/way/235955328)                                                                       |
| Arts and Community | Wits Art Museum                        | [Wits contact page](https://www.wits.ac.za/wam/contact-us/), [OpenStreetMap](https://www.openstreetmap.org/way/739519845)          |
| Arts and Community | Wits Club                              | [OpenStreetMap](https://www.openstreetmap.org/way/618335711)                                                                       |

These are the retained catalogue review sources, alongside the
[Wits Braamfontein campus map](https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf).
They record document/source review, not a completed physical field visit.
Reviewed coordinates, radius limits, geometry, and provenance are stored with
the catalogue. Site review does not guarantee current opening hours, step-free
access, route safety, or indoor GPS accuracy.

Only active reviewed sites and zones participate. A site belongs to 1 coverage
zone and must lie inside its reviewed geometry. Zones require valid geometry
and active reviewed sites. Suspension ends affected assignments immediately;
reactivation rechecks readiness. Retirement is permanent and retains history.

Coverage zones distribute events. They are separate from
[player-owned territories](contested-campus-zone-policy.md), whose independently
versioned geometry and ownership are unaffected by placement lifecycle changes.

## Player progress and privacy

Player discovery and eligibility use the current assigned point and the event's
approved interaction radius. Challenge start saves the assignment that passed
eligibility. A later rotation cannot move that started attempt or rewrite its result.

An offline pack binds to its assignment and expires by the earliest applicable
limit, including the next rotation boundary and event/campaign end. A pack from
a previous bucket cannot claim a replacement location. Retained assignment
history supports validation of a start that was valid before a later rotation
or suspension. See [offline challenges](../architecture/offline-challenge-play.md)
for the reconciliation rules.

Moving an event does not reset the player's event completion or create another
reward entitlement. Placement never rewrites owned cards, points, decks, or
completed matches.

Planning uses curated sites, content, overrides, and assignment history. It does
not use player coordinates, movement paths, attendance, profiles, or completion
density. Mapbox presents reviewed geometry and server results; it does not
choose assignments or enforce authoritative distances. Operational logs retain
safe outcomes and counts rather than player data or full plan payloads.

Policy versions and committed history are retained. A later policy applies to
new decisions without rewriting past assignments. See
[placement storage](../database/automatic-event-placement-persistence.md) for
schema, evidence, and transaction details.

---

This page was prepared and edited with assistance from Codex[GPT-5.6 Sol]
and Codex[GPT-6].
