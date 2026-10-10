---
title: 'Movement checks and privacy'
---

# Movement checks and privacy

The API compares recent accepted location claims to detect journeys that exceed
the configured speed threshold. PostgreSQL stores short-lived evidence and its
derived decision. This check supports event access and challenge start.

## When evidence is collected

Online evidence comes from authenticated, active-use event eligibility and
challenge-start operations. The event must be active, and the location claim
must pass structure and timing checks. Valid readings can be recorded for
reachable, out-of-range, or accuracy-retry results.

Malformed, stale, future-dated, unknown-event, and unavailable-event requests
do not create online evidence. Explore's watcher pauses when hidden and stops
on exit; there is no player-facing movement-history endpoint.

Offline reconciliation has a separate collection and timing boundary, described
in [Offline play](../architecture/offline-challenge-play.md).

## Stored records

| Relation                         | Selected data                                                                                                 | Purpose                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `movement_evidence`              | Player and event IDs, coordinates, accuracy, acquisition and receipt times, origin, and expiry.               | The reported sample and its context. |
| `movement_eligibility_decisions` | Evidence ID, prior anchor ID, reachability, outcome, distance, elapsed time, speed threshold, and time basis. | The server's derived assessment.     |

A unique player/event/acquisition-time context makes retries idempotent.
The service locks the active player row to serialise concurrent samples across
events and API instances. Older acquisition times are rejected. Reusing an
acquisition time requires identical coordinates and accuracy; the same physical
sample can have a separate context for another event.

Evidence and decisions are immutable during ordinary operation. Decision rows
depend on their current evidence row; the prior anchor ID is a historical
reference so earlier evidence can expire independently.

## Journey calculation

Only unexpired, reachable evidence with an accepted `baseline`, `same_event`,
or `plausible` decision can anchor a later comparison. Out-of-range,
accuracy-retry, and `too_fast` samples cannot become anchors.

With no accepted anchor, the sample becomes a baseline. A reachable sample for
the same event is a continuation. Cross-event checks use PostGIS distance and
subtract both reported accuracy radii:

```text
adjusted distance = max(0, distance - previous accuracy - current accuracy)
elapsed seconds   = max(0, current time - anchor time)
required speed    = adjusted distance / elapsed seconds
```

Zero adjusted distance is plausible. Otherwise, elapsed time must be positive
and required speed must not exceed the configured maximum. Online anchors use
server receipt time. Validated offline anchors use acquisition time, with that
distinction recorded in the decision.

The maximum speed is a required positive API setting. A `too_fast` decision
returns a neutral retry outcome and cannot create a new challenge attempt.
It can also record a derived moderation signal. Signals support human review;
they do not automatically impose account restrictions.

See [event eligibility](event-eligibility.md) and
[moderation rules](../requirements/longitudinal-trust-policy.md).

## Retention and access

`MOVEMENT_EVIDENCE_RETENTION_MS` defaults to **24 hours**. Each sample saves its
expiry when collected; configuration changes affect new samples. Expired
evidence is excluded from journey anchors.

The cleanup worker removes expired samples and their dependent decisions.
Its default interval is **30 minutes**, with an immediate sweep at startup.
Physical deletion can be delayed by downtime or a failed sweep even though the
evidence has already expired for access decisions.

Player responses omit prior coordinates, journey distance, required speed, and
the configured threshold. Ordinary request logging redacts location claims.
Precise evidence is removed when an account enters `deletion_pending`;
dependent journey decisions are removed with it. Derived moderation records
follow the separate [deletion and retention contract](account-deletion-retention.md).

Device readings remain claims. Accuracy adjustment and a speed threshold do
not prove physical presence or establish that a player cheated.

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5],
Codex-CLI[GPT-6], and Codex[GPT-6].
