---
title: Privacy-limited movement evidence
---

# Privacy-limited movement evidence

Issue `#168` adds the minimum precise evidence needed for later Intermediate
movement checks without creating a general location-history product. Browser
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
from the same legitimate active eligibility operation.

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
`MOVEMENT_EVIDENCE_CLEANUP_INTERVAL_MS` (default `60000` ms). Each sweep deletes
rows whose `expires_at` is at or before the database operation's cutoff. It logs
only the number deleted; failures use a fixed safe message without row content.
Repeated execution is safe.

The cleanup interval must be a safe integer from `1000` through
`2147483647` milliseconds. The upper value is Node's signed 32-bit timer limit;
larger delays would otherwise be reduced to an unsafe one-millisecond interval.

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
that player's precise movement evidence in the same transaction. Nothing from
this table is retained against the anonymous player tombstone. Issue `#168`
adds no longer-lived derived decision table because the current eligibility
response and existing gameplay records are sufficient; storing another audit
record is not yet justified.

## Relationship to issue #169 and limitations

Issue `#169` may read recent rows through an internal server-side service to
compare event journeys. It must continue to ignore browser-calculated speed and
must not turn this table into a public history, permanent punishment, trust
score, or behavioural profile. This implementation does not detect spoofing,
collusion, impossible journeys, or poor-GPS alternatives.

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
  cross-event concurrency, expiry, idempotent cleanup, and account-deletion
  removal.

The preceding document was generated and edited with the assistance of:
Codex[GPT-5].
