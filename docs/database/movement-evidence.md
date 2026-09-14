---
title: 'Movement checks and privacy'
---

# Movement checks and privacy

Issues `#168` and `#169` add the minimum precise evidence and derived journey
decisions needed for impossible-journey checks without creating a general
location-history product. Browser
geolocation remains an untrusted claim; authentication supplies the player
identity, and the API/database own validation and persistence.

## Collection boundary

The API stores a sample only after an authenticated active player initiates the
visible location-dependent Explore/event flow, a fresh claim reaches
`POST /api/v1/events/{eventId}/eligibility`, and the server confirms that the
event exists and is currently active under the authoritative event/campaign
availability resolver. After an event is selected,
the existing Explore journey may perform bounded automatic eligibility refreshes
for meaningful reported-location changes while the page remains visible and in
active use. The watcher pauses when the page is hidden and stops on unmount.
Issue `#168` adds no browser watcher, passive/background polling, tracking
endpoint, or movement-history response.

Stale, future, malformed, unauthenticated, nonexistent-event, unpublished, and
inactive-event requests do not create evidence. A valid claim can be stored for
a reachable, unreachable, or accuracy-ambiguous result because all three arose
from the same legitimate active eligibility operation. Only reachable claims
whose journey decision is accepted as a baseline, same-event continuation, or
plausible cross-event journey may anchor a later journey comparison.

## Stored precise evidence

Migration `0031_create_movement_evidence.sql` creates
`public.movement_evidence` with:

- a random immutable record ID;
- the server-resolved active player UUID;
- the authoritative event UUID;
- claimed latitude and longitude;
- reported accuracy in metres;
- device acquisition time;
- server receipt and immutable creation time; and
- an explicit expiry time.

Foreign keys, coordinate/accuracy bounds, finite timestamp checks, and indexes
for the latest per-player sample and expiry cleanup reinforce the API checks. A
unique `(player_id, event_id, acquired_at)` context prevents duplicate retries.

The service locks the active player row before reading every context attached to
the latest player-global acquisition time, so concurrent requests and multiple
API instances serialize against one physical movement sequence:

- an older acquisition time is rejected as non-monotonic;
- an equal acquisition time with different coordinates or accuracy is rejected
  as inconsistent evidence;
- an identical equal-time sample already stored for the event succeeds
  idempotently without another row;
- an identical equal-time sample for another valid event creates one additional
  immutable context row; and
- a newer acquisition time creates the next physical sample normally.

This preserves player-global ordering for issue `#169` without forcing a new
geolocation acquisition merely because the player selects another event.

The table is internal database evidence. No public or player-facing API reads
it, and another player cannot supply or retrieve its ownership identity.

## Server-authoritative journey decisions

Migration `0032_add_movement_eligibility_decisions.sql` adds one immutable
`movement_eligibility_decisions` row per evaluated movement-evidence context.
It records the reachability status, decision outcome, prior anchor identifier,
server-computed distance and elapsed time where applicable, uncertainty-adjusted
distance, required speed, and the configured maximum-speed snapshot. The prior
identifier is intentionally historical rather than a foreign key: an older
anchor may expire first, while the later decision must remain immutable until
its own evidence expires.

The server locks the active player while recording and evaluating a sample. It
selects the most recent unexpired accepted reachable sample by server receipt
time. Unreachable, accuracy-retry, and `too_fast` samples are audited but never
become trusted anchors. A first accepted sample is a `baseline`; a reachable
sample for the same event is `same_event` and does not require travel-speed
mathematics.

For a cross-event comparison, PostGIS calculates geodesic distance between the
two reported points. The decision is:

```text
adjusted distance = max(0, distance - previous accuracy - current accuracy)
elapsed time      = max(0, current server receipt - previous server receipt)
required speed    = adjusted distance / elapsed time
plausible         = adjusted distance is zero, or required speed <= configured maximum
```

Device acquisition timestamps still enforce sample ordering and identity, but
cannot increase the travel interval. This prevents a browser from forging an
older acquisition time to make an impossible trip appear slower. A zero or
negative server interval with positive adjusted distance is `too_fast`.

`MAX_PLAUSIBLE_JOURNEY_SPEED_METRES_PER_SECOND` is required and has no default.
It must be a finite number greater than zero. The threshold is an operational
product setting that must be chosen and documented by the team before each
deployment; repository code does not invent a campus policy value.

A `too_fast` eligibility request returns a neutral `journey_too_fast` retry and
does not expose coordinates, distance, speed, the prior event, or the threshold.
Challenge start applies the same check inside the attempt-creation transaction,
so calling the challenge route directly cannot bypass it. A direct-start
`too_fast` decision commits its evidence and audit row before the safe retry is
returned, but creates no challenge attempt. The result creates no punishment,
account flag, trust score, reward effect, or permanent gameplay state.

## Retention and automatic cleanup

`MOVEMENT_EVIDENCE_RETENTION_MS` controls precise-data retention. The current
default is a **provisional 24 hours** (`86400000` ms), chosen as a conservative,
reversible implementation value rather than a final product/privacy decision.
The team must confirm or revise it before production release based on the
minimum window required by issue `#169`.

The value must be a safe integer between `1000` and
`8000000000000000` milliseconds. The upper bound is only a JavaScript `Date`
representation safeguard, not a supported business retention period. Each row
stores its calculated `expires_at` when collected. Changing configuration
affects newly collected evidence only; existing rows keep their recorded expiry.

The API process starts an idempotent cleanup sweep immediately and then every
`MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS` (default `1800000` ms, or 30 minutes).
Each sweep deletes rows whose `expires_at` is at or before the database
operation's cutoff. Under normal successful worker operation, expired evidence
may remain physically present until the next cleanup sweep, typically no more
than one configured interval after expiry. Worker failure, API downtime, or
delayed execution can extend physical retention, but expired evidence is never
considered current after `expires_at`. The worker logs only the number deleted;
failures use a fixed safe message without row content. Repeated execution is
safe.

The cleanup interval must be a safe integer from `900000` through
`2147483647` milliseconds. The upper value is Node's signed 32-bit timer limit;
larger delays would otherwise be reduced to an unsafe one-millisecond interval.
The lower bound leaves room for an idle serverless database compute to suspend
between maintenance sweeps.

Production deployment must set and review both values. The worker runs per API
instance, so overlapping sweeps are expected and safe. Operators should verify
the migration and worker after deployment without attaching coordinates to
evidence.

## Logging, access, and deletion

Fastify redacts latitude, longitude, accuracy, and acquisition time if a request
body is logged. The movement service and cleanup worker do not log input rows,
and safe API errors contain no prior or submitted coordinates. Ordinary logs
may contain a request ID and aggregate cleanup count only.

When an account enters `deletion_pending`, a database trigger deletes all of
that player's precise movement evidence in the same transaction. Journey
decision rows cascade from their current evidence row, so no movement decision,
path, coordinate, or speed remains attached to the anonymous player tombstone.

## Limitations

The check detects only travel that exceeds the configured threshold between
recent accepted reported-location claims. It does not prove physical presence,
detect all spoofing or collusion, infer transport mode, or create a statistical
behavioural profile. Generous device accuracy can reduce adjusted distance, and
an expired or absent anchor intentionally produces a new baseline. These are
bounded false-positive/privacy trade-offs, not guarantees of legitimacy.

The 24-hour default and production scheduling evidence remain decisions for
team/operator confirmation. Passing local tests does not prove that production
cleanup is running.

## Verification

- `movement-evidence.test.ts` covers runtime validation, physical-sample
  ordering, identical-sample reuse, idempotency, expiry representation,
  transaction rollback, and cleanup queries.
- `events.integration.test.ts` covers the authenticated active-operation
  boundary, stale/malformed/unauthorised inputs, and non-monotonic safe errors.
- `movement-evidence-logging.test.ts` verifies precise request fields are
  redacted from ordinary structured logs.
- `movement-evidence-database.integration.test.ts` covers real constraints,
  immutability, ownership/context, player-global ordering, same-event and
  cross-event concurrency, expiry, idempotent cleanup, account-deletion
  removal, rejected-anchor exclusion, audit immutability, threshold-boundary
  outcomes, and concurrent impossible attempts.
- `journey-evaluation.test.ts` covers accuracy adjustment, exact-threshold,
  zero-time, negative-time, and invalid-metric cases.
- `movement-journey.test.ts` covers trusted-anchor selection, server receipt
  timing, same-event handling, and idempotent retries without a live database.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5].

Page title clarified with assistance from Codex-CLI[GPT-6].
