---
title: 'Automatic event placement and campus coverage'
---

# Automatic event placement and campus coverage

## Status and purpose

This document is the issue `#259` policy contract for Advanced-tier automatic
event placement. Issue `#261` will persist reviewed sites, zones, policy
versions, assignments, overrides, and history. Issue `#262` will implement the
placement and rotation services, and issue `#265` will add the Author preview
and control interface. This document does not claim that those capabilities are
implemented or deployed.

The policy automates where explicitly portable event content is made available.
It does not generate questions, infer safe places from player movement, edit a
published event's authored location, or make the map provider authoritative.

## Authority and terminology

The API and PostgreSQL/PostGIS are authoritative for candidate-site status,
coverage zones, policy versions, assignment history, effective event locations,
rotation plans, overrides, and the final applied plan. The browser may request a
preview or an Author operation, but it cannot submit authoritative coordinates,
coverage results, separation results, assignments, or publication state.

The initial immutable policy version is `placement-v1`. Every preview, applied
plan, assignment, override, rollback, and failure record identifies the policy
version and the server-selected rotation bucket that produced it. Publishing a
new policy version does not rewrite historical decisions or assignments.

Terms used by this policy are:

- **candidate site**: a sourced campus point reviewed for pedestrian access and
  automatic placement;
- **coverage zone**: a reviewed PostGIS campus area used to prevent one part of
  campus from being starved of placements;
- **portable event**: published event content explicitly approved to move
  between candidate sites;
- **fixed event**: content that continues to use its authored event location;
- **assignment**: the immutable event-to-site decision for an effective period;
- **plan**: the complete set of automatic assignments selected for one rotation;
  and
- **valid plan**: a plan satisfying every hard lifecycle, site, coverage, and
  separation rule in the policy version that selected it.

## Initial reviewed campus catalogue

`placement-v1` accepts the following eleven sourced locations as the initial
candidate catalogue. This is a document and source review based on the current
official Wits campus material and recorded OpenStreetMap evidence. It does not
claim that a physical field visit was performed. Issue `#261` must persist the
review evidence and may not infer approval merely from a point existing in the
legacy `events` table.

| Coverage zone        | Candidate site                         | Longitude  | Latitude    |
| -------------------- | -------------------------------------- | ---------- | ----------- |
| `east_campus`        | Great Hall                             | 28.0303750 | -26.1920468 |
| `east_campus`        | William Cullen Library                 | 28.0293495 | -26.1906928 |
| `east_campus`        | The Matrix                             | 28.0307564 | -26.1895929 |
| `east_campus`        | Amphitheatre                           | 28.0300541 | -26.1900839 |
| `west_campus`        | Origins Centre                         | 28.0283091 | -26.1929795 |
| `west_campus`        | Wits Anglo American Digital Dome       | 28.0283502 | -26.1884929 |
| `west_campus`        | Wits Science Stadium                   | 28.0258204 | -26.1906244 |
| `west_campus`        | Mathematical Sciences Laboratory (MSL) | 28.0268144 | -26.1904425 |
| `arts_and_community` | Wits School of Arts                    | 28.0326024 | -26.1920348 |
| `arts_and_community` | Wits Art Museum                        | 28.0328645 | -26.1928427 |
| `arts_and_community` | Wits Club                              | 28.0258017 | -26.1857438 |

The shared geographic reference is the
[official Wits Braamfontein campus map](https://www.wits.ac.za/media/wits-university/about-wits/documents/2025-Braamfontein-Campus-map.pdf).
The per-site evidence retained by issue `#261` is:

- Great Hall: [OpenStreetMap way 452712704](https://www.openstreetmap.org/way/452712704);
- William Cullen Library: [OpenStreetMap way 26327942](https://www.openstreetmap.org/way/26327942);
- Origins Centre: [official visitor page](https://www.wits.ac.za/origins/plan-your-visit/)
  and [OpenStreetMap way 26327903](https://www.openstreetmap.org/way/26327903);
- The Matrix: [OpenStreetMap way 739521835](https://www.openstreetmap.org/way/739521835);
- Amphitheatre: [OpenStreetMap way 739545292](https://www.openstreetmap.org/way/739545292);
- Wits Anglo American Digital Dome:
  [official visitor page](https://digitaldome.wits.ac.za/plan-your-visit/) and
  [OpenStreetMap way 223889931](https://www.openstreetmap.org/way/223889931);
- Wits Science Stadium: [OpenStreetMap way 235891611](https://www.openstreetmap.org/way/235891611);
- MSL: [official CSAM contact page](https://www.wits.ac.za/csam/contact-us/);
- Wits School of Arts: [OpenStreetMap way 235955328](https://www.openstreetmap.org/way/235955328);
- Wits Art Museum: [official contact page](https://www.wits.ac.za/wam/contact-us/)
  and [OpenStreetMap way 739519845](https://www.openstreetmap.org/way/739519845);
- Wits Club: [OpenStreetMap way 618335711](https://www.openstreetmap.org/way/618335711).

Each site must retain its reviewed point, zone, evidence URLs, supported maximum
interaction radius, review actor, review time, and lifecycle. A site has one of
these states:

```text
pending_review -> active
pending_review -> retired
active -> suspended
active -> retired
suspended -> active
suspended -> retired
```

Only `active` sites may receive a new automatic assignment. Suspending a site
immediately ends its current assignment in the same Author operation; it does
not wait for a replacement plan. Retirement is permanent and never deletes
assignment history. A site belongs to exactly one active zone, and its point
must fall inside that zone's reviewed PostGIS geometry. Overlapping zone
polygons must not make site membership ambiguous.

A coverage zone has the same `pending_review`, `active`, `suspended`, and
`retired` lifecycle and transition set as a candidate site. Activation requires
a reviewed non-empty PostGIS geometry and at least one active reviewed candidate
site inside it. Only `active` zones participate in the preferred allocation and
mandatory floor. Suspending a zone immediately ends its automatic assignments;
reactivation requires the activation checks again. Retirement is permanent and
preserves zone, plan, and assignment history. All three `placement-v1` zones
begin active.

Site review establishes that the point represents a campus place that a player
may reasonably approach on foot during the intended event window. It does not
promise step-free access, opening hours, route safety, or indoor GPS quality.
Those limitations stay visible to Authors and are reasons to suspend or exclude
a site. Automatic placement does not perform route finding.

## Portable event boundary

Automatic placement is opt-in. An event is eligible only when all of these are
true at preview time and again at apply time:

- it is explicitly marked portable under the current policy version;
- it is published, not retired, and within its effective event or campaign
  availability window;
- its challenge remains published and otherwise ready for player use;
- its wording, explanation, and source evidence do not depend on one landmark;
- its interaction radius does not exceed the selected site's reviewed maximum;
  and
- it is not a member of a published ordered trail.

Current landmark-specific content remains fixed. Because published content is
immutable, making an equivalent challenge portable requires a separately
reviewed replacement event and retirement of the fixed event where appropriate.
Merely adding an event to a campaign does not make it portable. A portable
campaign event may be assigned only inside the intersection of its own and
campaign availability periods.

Fixed events remain discoverable under their existing rules and do not consume
the six automatic-placement slots. Placement-managed Author pins do consume a
slot. Moving a portable event does not reset completion or reward identity: the
existing one-time reward and attempt rules remain keyed to the event and player,
not the candidate site.

## `placement-v1` configuration

| Setting                          | Initial value                 |
| -------------------------------- | ----------------------------- |
| Automatic target                 | 6 concurrent assignments      |
| Preferred zone allocation        | 2 assignments per active zone |
| Mandatory zone floor             | 1 assignment per active zone  |
| Minimum centre separation        | 150 metres                    |
| Rotation cadence                 | Daily                         |
| Rotation boundary                | `04:00 Africa/Johannesburg`   |
| Normal replacements per rotation | 2 assignments                 |
| Candidate-site cooldown          | 2 completed rotation buckets  |
| Maximum Author pin               | 7 days per audited decision   |
| Maximum automation pause         | 7 days per audited decision   |
| Maximum temporary site exclusion | 30 days per audited decision  |

All values are persisted as one immutable policy-version snapshot rather than
read from mutable browser configuration. A later version may change them after
review. A service must never combine values from two policy versions in one
preview or applied plan.

The separation rule applies between every pair of automatic or pinned
assignments in the proposed plan, and between each proposed assignment and each
currently live fixed event:

```text
required separation = max(
  150 metres,
  first event radius + second event radius
)

automatic pair distance = PostGIS distance between both candidate-site centres
fixed pair distance = PostGIS distance between the candidate-site centre and
  the fixed event's authored point

applicable distance >= required separation
```

Equality is valid. Fixed events do not consume automatic slots, but their
authored points and interaction radii constrain automatic site selection. The
policy does not retroactively reject or move two fixed events that are already
closer than the required separation.

Fixed content takes precedence when it is published or reaches its scheduled
start. Any conflicting automatic assignment ends, the remaining valid plan is
marked degraded, and the service attempts a replacement plan. Automation never
moves, delays, or silently unpublishes the fixed event.

## Deterministic planning and fairness

A rotation uses authoritative PostgreSQL time. The rotation bucket is the local
calendar date whose `04:00 Africa/Johannesburg` boundary began the current
period. Re-running the same bucket with the same policy version, inputs, and
history must produce the same plan digest and assignments.

The complete input snapshot contains:

- policy version and rotation bucket;
- active zones and active candidate sites;
- eligible portable events and effective availability;
- current valid assignments;
- currently live fixed-event points and radii;
- unexpired pins, exclusions, and pause state;
- candidate-site and event assignment history; and
- the expected current placement-state version.

It contains no player location, movement history, challenge answers, collection,
profile, rating, or map-provider data.

Planning proceeds in this order:

1. Validate unexpired pins against every hard rule and reserve their slots.
2. Exclude suspended, retired, temporarily excluded, radius-incompatible, and
   spatially conflicting sites, including conflicts with live fixed events.
3. Compute replacement slots as
   `min(2, max(0, target - reserved pins))`. Preserve
   `max(0, target - reserved pins - replacement slots)` current unpinned
   assignments: four with no pins and three with one pin. If fewer alternatives
   exist, rotate fewer rather than violate a hard rule.
4. Prioritise zones below two assignments. A zone below the mandatory floor is
   considered before every zone already at the floor.
5. Rank candidate sites by `last assignment ended` ascending with never-used
   sites first, then lifetime assignment count ascending, then stable site UUID
   ascending.
6. Rank portable events by `last assignment ended` ascending with never-used
   events first, then lifetime assignment count ascending, then stable event
   UUID ascending.
7. Select the first event-site pair that satisfies availability, radius,
   cooldown, separation, and zone rules. Continue until six assignments exist
   or no valid pair remains.

An active site used in either of the preceding two completed rotation buckets
is in cooldown. A pin may retain an existing site through cooldown, but cannot
introduce a different event at that site during cooldown. If every valid site in
a zone is cooling down, the planner may reuse the least recently used site only
to satisfy the mandatory one-assignment zone floor. The exception is recorded
in the plan and never bypasses separation or lifecycle rules.

No random seed, database row order, JavaScript object order, map rendering, or
request arrival order may affect selection. Stable UUID ordering is the final
tie-breaker for every equal ranking.

Every successful six-assignment plan normally contains two assignments per
zone. A plan may contain a different split only when it still serves every zone
and the preferred split is impossible under hard constraints. Assignment
history makes never-used and least-recently-used sites rise in priority, so a
zone or site cannot remain starved while valid alternatives exist.

## Plan and assignment history

A preview is valid for at most 15 minutes and never beyond the next rotation
boundary or an earlier event, campaign, pin, exclusion, or policy transition.
Its plan digest covers every deterministic input listed above. Preview expiry
does not change current assignments.

An applied plan records:

- plan identifier, policy version, rotation bucket, input digest, and status;
- authoritative creation and application times;
- predecessor plan and rollback source where applicable;
- expected and committed placement-state versions;
- target, actual, and per-zone assignment counts;
- degraded-policy exceptions and safe failure codes; and
- the server-resolved Author for manual apply, override, or rollback actions.

Each assignment records the plan, portable event, candidate site, snapshotted
zone, effective start and end, origin (`automatic`, `pin`, or `rollback`), and
end reason. Effective periods are half open: `[starts_at, ends_at)`. At most one
assignment may be current for one portable event or one candidate site.

A successful rotation ends superseded assignments and begins replacements in
one transaction. The daily boundary triggers evaluation but does not expire an
otherwise valid assignment by itself. Therefore a failed rotation can safely
retain the last valid plan. Applied plans and assignments are immutable and
retained as non-player operational history; corrections append new records.

## Author controls and audit

The existing active `author` role controls placement. No browser-supplied role
or actor identifier is accepted. Every mutation requires the current expected
placement-state version, a bounded reason, and an atomic audit record containing
the server-resolved Author, time, policy version, previous state, and resulting
state.

Authors may:

- preview the next plan without changing player-visible state;
- apply the exact still-current preview;
- pause new rotations for at most seven days;
- pin one eligible portable event to one active reviewed site for at most seven
  days;
- exclude an active site for at most 30 days;
- suspend or retire a site through its reviewed lifecycle; and
- roll back by creating a new plan from a historical plan whose assignments are
  still valid under the current policy.

Pins take precedence over automatic ranking and count toward the six slots and
their zone's allocation. They do not bypass portability, publication,
availability, radius, separation, site lifecycle, trail, or campaign rules.
Creating a pin is rejected if unexpired pins would exceed the six-slot target or
make the mandatory floor impossible for another active zone.
Replaying a pin, exclusion, or pause request with the same idempotency key and
payload returns its stored result. A changed payload with the same key is
rejected.

Applying a preview submits its opaque plan identifier or digest and expected
state version, not a browser-selected list of assignments. The API recalculates
or revalidates every mutable input inside the authoritative transaction. A stale
preview fails without partially changing assignments.

Rollback does not reopen or edit old rows. It produces a new audited plan and
new assignment records using the current policy and current lifecycle state.

## Failure and degraded operation

Plan application is atomic. Assignment history, current assignments, state
version, and audit data either commit together or remain unchanged.

- A transient planning, database, or scheduler failure keeps the last valid
  assignments active and records a safe operational failure.
- If six assignments are impossible but every zone can receive at least one,
  the planner may apply a smaller valid plan with status `degraded` and the
  unsatisfied target recorded.
- If any active zone cannot receive one assignment, no new plan is activated.
  Existing assignments that remain valid stay active and the failure identifies
  the unserved zone to Authors.
- If an Author suspends or retires a site, its assignment ends even when no
  replacement plan can be produced. An unsafe or invalid assignment is never
  retained merely to satisfy availability.
- A failed apply, stale preview, expired pin, or invalid override never changes
  publication state, event content, attempts, rewards, campaigns, or trails.

Only one scheduler run may apply a rotation bucket. Concurrent runs must share
an authoritative lock or uniqueness boundary and converge on the same committed
plan. A retry after an uncertain response returns the existing bucket result
rather than rotating another two assignments.

## Player, challenge, and offline compatibility

Fixed events continue to expose the location and radius authored on the event.
For a portable event with an active assignment, discovery and eligibility use
the assigned candidate point and the event's approved interaction radius. The
player-facing event response keeps its existing location fields; placement
history, policy values, site review data, and Author reasons are not exposed.

Challenge start binds internally to the assignment that passed eligibility. A
later rotation does not invalidate or move an attempt that already started, and
answer submission never recalculates location against the new assignment.

An offline pack binds to one assignment. Its validity is capped at the earliest
of the existing offline limit, event or campaign end, and the next scheduled
rotation boundary. Rotation does not rewrite an issued pack. If a rotation
fails, the assignment may remain current, but a player must obtain a new pack
for the next rotation period. A pack submitted after its assignment-bound
validity ends follows the existing safe offline-expiry behavior and cannot claim
the new location.

Completed attempts, one-time rewards, card ownership, progression, and trail
history are never rewritten by placement. The same event appearing at a new
site does not create another reward entitlement for a player who already earned
that event's reward.

## Privacy and map-provider boundary

Automatic placement uses curated site and content data only. It must not read or
retain player coordinates, movement evidence, eligibility samples, home or
frequent locations, attendance patterns, or per-player completion density.

Mapbox remains a presentation service. It may render reviewed site points,
coverage polygons, current assignments, proposed assignments, and validation
messages supplied by the API. It does not select sites, calculate authoritative
separation, decide coverage, apply plans, or receive player location for
placement. The Author interface must provide an accessible list alternative to
every placement map layer.

Operational logs may contain a plan identifier, policy version, rotation bucket,
counts, status, safe failure code, and duration. They exclude coordinates,
source evidence, Author reason text, player data, access tokens, and full plan
payloads.

## Deterministic examples

### Normal rotation

Six automatic assignments contain two sites in each zone. At the next `04:00`
boundary, four remain valid and unpinned. The planner retains those four and
replaces the two oldest eligible assignments. Never-used sites rank before
previously used sites, and stable UUIDs settle any remaining tie.

### Pinned assignment

An Author pins one portable event to an active West Campus site for three days.
The pin occupies one of the six slots and one West Campus allocation. The daily
planner preserves it and fills the other five slots. It still rejects another
assignment less than the required separation from the pin.

### Coverage shortage

Only one Arts and Community site is currently valid. The planner assigns that
site to satisfy the zone floor, then distributes the remaining valid slots
across East and West Campus. The plan records the preferred two-per-zone target
as unsatisfied but may apply if all three zones remain served.

### Unserved zone

All West Campus sites are suspended. No new plan is activated because the zone
floor cannot be met. Valid East and Arts assignments remain; invalid West
assignments do not. Authors receive an operational failure and must reactivate a
reviewed site or publish a new policy version.

### Concurrent scheduler retry

Two workers evaluate the same rotation bucket. One commits the plan under the
authoritative concurrency boundary. The second returns that committed plan and
does not rotate another pair or duplicate assignment history.

## Implementation and verification requirements

Issues `#261` and `#262` must turn this policy into focused database and service
tests covering:

- unreviewed, suspended, retired, and radius-incompatible site rejection;
- exact 150-metre and combined-radius separation boundaries;
- fixed events constraining sites without consuming automatic slots;
- scheduled or newly published fixed content safely displacing a conflicting
  automatic assignment;
- six-slot planning, preferred two-per-zone coverage, and the mandatory floor;
- zone activation, suspension, reactivation, retirement, and immediate
  assignment termination;
- deterministic selection and UUID tie-breaking under shuffled query results;
- two-assignment rotation, cooldown, and fair site/event reuse;
- pin-aware preservation and replacement counts at the six-slot boundary;
- portable opt-in and fixed-event exclusion;
- published-trail, campaign-window, and lifecycle filtering;
- stale preview rejection and preview/apply policy-version consistency;
- concurrent scheduler idempotency and atomic assignment history;
- 15-minute preview expiry and immutable half-open assignment periods;
- pin, exclusion, pause, expiry, rollback, and audit behavior;
- valid degraded plans, an entirely unserved zone, and transient failures;
- site suspension ending an invalid current assignment;
- assignment-bound online eligibility and offline-pack expiry; and
- unchanged attempt, reward, ownership, progression, and trail history.

Issue `#265` must cover map/list equivalence, current/proposed/excluded/overridden
states, explicit apply confirmation, validation feedback, stale previews,
keyboard operation, responsive layouts, and unauthorised controls.

For issue `#259`, formatting and the documentation build are the meaningful
automated checks. It does not add implementation-mirroring runtime tests before
the persistence and service boundaries exist.

## AI declaration

This policy was planned, generated, edited, and reviewed with the assistance of
Codex[GPT-5.6 Sol].
