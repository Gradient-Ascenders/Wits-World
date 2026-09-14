---
title: 'How event access is calculated'
---

# How event access is calculated

The API event-eligibility service decides whether a submitted location claim is
inside the authoritative radius stored for an event. The browser and map display
do not calculate the authoritative result.

## Inputs and authority

The service accepts an event identifier, latitude, and longitude. Latitude must
be a finite number from `-90` through `90`; longitude must be a finite number
from `-180` through `180`.

The submitted coordinates are an untrusted location claim. PostgreSQL/PostGIS
remains authoritative for the event location, radius, publication state, and
availability period. The query uses parameters for every submitted value and
constructs the claim point in longitude-latitude order with SRID 4326.

## Outcomes

The service returns one of three outcomes:

- `not_found` when the event identifier has no stored row;
- `unavailable` when the event is unpublished, has not started, or has ended;
- `evaluated` with the distance, stored radius, and eligibility decision.

Unpublished events are reported as unavailable before considering their time
period. Availability uses the half-open interval `starts_at <= now < ends_at`.

For available events, `ST_Distance` calculates the distance between the two
PostGIS `geography` points in metres. `ST_DWithin` compares that distance with
the stored `radius_metres`; a claim exactly on the radius is eligible.

The service does not return the stored event coordinates.

## Sprint 1 assumptions

The seeded Great Hall demonstration event uses a provisional radius of `75`
metres. This is an integration value, not an approved production threshold.

Reported device accuracy and location-acquisition freshness are validated at the
API request boundary introduced by the event-endpoint work. Acceptable accuracy
and freshness thresholds remain provisional until device and field testing are
complete.

The distance service itself does not perform movement analysis, spoofing
detection, continuous tracking, or challenge-session creation. A failed or
ambiguous location check must not be presented as evidence that a player is
cheating.

For issue `#168`, a valid claim for a confirmed active event is passed to the
internal [privacy-limited movement-evidence service](./movement-evidence.md)
after reachability is calculated. For issue `#169`, the same internal service
compares a reachable claim with the latest unexpired accepted anchor using
PostGIS distance, both accuracy radii, and server receipt time. A journey that
would require more than the configured maximum speed returns the neutral
`journey_too_fast` retry result. It is audited but cannot become a later trusted
anchor. Stale, future, unavailable, or unknown-event requests do not persist
evidence. No movement history, distance, speed, prior event, or threshold is
returned by this endpoint.

## Verification

Run the service unit tests with the normal API test command:

```bash
npm test --workspace @wits-world/api
```

Run the PostGIS-backed tests against the configured test database:

```bash
npm run test:database --workspace @wits-world/api
```

The database test verifies a zero-distance claim at the seeded event, a clearly
outside claim, unavailable events, and a missing event. Test output and issue
evidence must not include database credentials or precise player location data.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5].

Page title clarified with assistance from Codex-CLI[GPT-6].
