---
title: 'How event access is calculated'
---

# How event access is calculated

Event access combines effective availability, a reported location, and server
checks. The API makes the decision using PostgreSQL/PostGIS. Map markers and
browser distance displays present that decision.

## Availability and location

The service first resolves the event's publication state and effective schedule,
including campaign membership. The active interval includes its start and
excludes its end.

A fixed event uses its authored point. A placement-managed event uses the
assignment valid at the evaluation time. Without a valid assignment it is
unavailable; the service does not fall back to an old authored point.

See [event fields](event-schema.md) and
[placement storage](automatic-event-placement-persistence.md) for those
resolvers.

## Location claim

The authenticated request supplies latitude, longitude, reported accuracy in
metres, and acquisition time. The API derives the player identity.

Coordinates must be finite and within latitude `-90…90` and longitude
`-180…180`. Accuracy must be finite and non-negative. Online readings cannot
be from the future or older than the default **120-second** freshness limit.

The query constructs a WGS 84 point in longitude-latitude order and uses
parameterised SQL. `ST_Distance` calculates metres between geography points;
`ST_DWithin` applies the event radius.

## Reported accuracy policy

A point passes the location check when both conditions hold:

```text
distance <= event radius
reported accuracy <= min(150 metres, 2 × event radius)
```

Both boundaries are inclusive. Accuracy is used as reported, without clamping
or replacement. The uncertainty circle does not have to fit inside the event
radius.

Online eligibility, challenge start, and offline start share this policy.
Offline finish uses the same accuracy bound for movement corroboration; it
does not add a finish-inside-radius requirement.
[Offline play](../architecture/offline-challenge-play.md) defines its separate
timing and reconciliation rules.

## Decision and challenge start

| Result      | Meaning                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| Reachable   | The point is in range with acceptable accuracy, and the applicable movement check passes. |
| Unreachable | Accuracy is acceptable, but the point is outside the event radius.                        |
| Retry       | The reading is stale, future-dated, too inaccurate, or fails the journey check.           |
| Unavailable | Publication, scheduling, or placement does not permit access.                             |
| Not found   | No event matches the requested identifier.                                                |

The spatial service supplies the distance and radius decision. The HTTP route
adds timing, accuracy, and [movement checks](movement-evidence.md), returning
the player-safe result. It does not expose previous movement samples or
journey metrics.

Challenge start repeats access checks and saves the attempt transactionally.
A successful Explore check does not reserve access for a later start. Other
account and content rules can also prevent a new attempt.

A device reading remains a claim rather than proof of physical presence.
Player instructions belong in [Explore](../requirements/player-location-journey.md);
the [attempt contract](../architecture/challenge-attempt-api-contract.md)
defines challenge requests and responses.

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].
