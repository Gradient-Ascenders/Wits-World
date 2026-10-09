---
title: 'Ranked competition operations'
---

# Ranked competition operations

Ranked matchmaking becomes available only after an operator schedules a
`ranked-v1` season. Deployment does not insert a season, because the accessible
name and intended start are product decisions. Use a reviewed change with the
production database release procedure; the following SQL shows the required
fields, not a command to run against an unknown database:

```sql
insert into public.ranked_seasons (policy_version, name, intended_start_at)
values ('ranked-v1', 'Reviewed season name', '2026-10-01T00:00:00Z');
```

The name and UTC start above are examples and must be replaced with approved
values. Schedule the next season before the active season ends. A due season
waits while the current one is active or draining. Its 28 days begin at actual
activation. Only one season may be active or closing.

## Release and configuration

The production database release must apply migration `0047` and the issue
`#266` snapshot migration `0050`, proposal withdrawal migration `0051`,
invalid-proposal cooldown migration `0052`, territory persistence migration
`0053`, and territory runtime migration `0054` before starting the new API.
Existing
deployment ordering already runs database release before API deployment. A
database backup or point-in-time recovery plan should cover the release; do
not reverse a ranked migration after ranked matches have settled.

`RANKED_SWEEP_INTERVAL_MS` defaults to 1000 and accepts 250–30000. It is the
active-work scan interval for lease expiry, proposal expiry, pairing, and
season transitions. Each API process scans immediately at startup to recover
persisted work. With `GAMEPLAY_SCHEDULER_BACKEND=polling` (the default), idle
probes retain the configured interval just as active probes do. In `upstash`
mode, active work still scans at this configured interval; an idle process
instead waits up to 30 minutes between PostgreSQL probes, or until an earlier
known work boundary. Full maintenance runs only for pending work, a known due
season or territory boundary, startup, capped backlog, or the approximately
60-second maintenance throttle. A known season or territory boundary may bring
work forward. Its delay is clamped to the configured probe interval in polling
mode, or to 30 minutes in coordinated idle mode. The season boundary is the active season's `active_ends_at`, or an
eligible scheduled season's `intended_start_at`; the territory boundary uses
the persisted policy cadence and `daily_cap_timezone` for active zones.

The gameplay scheduler configuration accepts `polling` or `upstash` and
defaults to `polling`. The activity store is constructed when either
`RATE_LIMIT_BACKEND=upstash` or `GAMEPLAY_SCHEDULER_BACKEND=upstash`; work producers
on those API instances publish persistent pre-write intents even while scheduler polling
mode is selected. Valid credentials by themselves are insufficient. An
instance configured with local rate limiting and scheduler polling is unaware
of durable coordination; retire it or move it to Upstash before enabling long
idle sleeps. In Upstash
mode, each instance reads one combined live/ranked activity snapshot with a
direct `HMGET` every 10 seconds and wakes the relevant local workers when
activity changes; initialization EVAL runs only when the epoch is missing. A
continuously running API instance therefore performs
about 259,200 snapshot reads per 30-day month; total reads grow with replica
count. Mutation and initialization Lua commands plus rate-limit traffic share
the same Redis budget, so include all of them when checking the selected plan's
quota. Same-process successful mutations still use immediate local wake-ups;
the Redis interval is for cross-instance observation and remains below the
30-second queue lease and 20-second proposal window. PostgreSQL listeners
remain off while idle; known boundaries can still schedule earlier database
work. Other API traffic, housekeeping, and external database clients can also
wake Neon compute.

Thrown gameplay probe/sweep errors retry with exponential backoff: the first
retry retains the active interval, later consecutive failures double the delay
up to 30 seconds (or the configured interval if already longer). A successful
probe resets the backoff; an explicit mutation wake remains immediate. Healthy
active work, idle confirmation that safely falls back to fast scans, and paused
work-creation booleans do not enter this error backoff. A Redis coordination
outage can therefore still keep PostgreSQL scanning; this is not an outage-time
scale-to-zero guarantee.

An optional `GAMEPLAY_SCHEDULER_NAMESPACE` selects the shared private Redis key
namespace. If unset, the API derives it as a hash of the canonical database
endpoint, including normalized host, port, and path; Neon `-pooler` is removed
so pooler and direct URLs for the same database resolve identically. Every API
replica and producer that shares the database must use the same namespace.
Activity keys are persistent and have no TTL; do not delete or reset them to
force an idle state. They contain opaque intent tokens only, never player IDs,
and tokens are not logged.

Work-producing transactions publish a durable pre-write intent, take the
worker's shared PostgreSQL transaction advisory lock, and confirm the intent
still exists before writing. Ranked API mutations, season transitions, and
pairing retain this guard and fail closed when Redis publication or validation
is unavailable. Queue and proposal expiry and due territory settlement instead
take the shared transaction advisory lock without publishing or validating a
Redis intent. Timed-out proposal resolution may requeue an already-proposed
accepted entry, atomically replacing existing pending work rather than
introducing work from an idle database; the shared fence covers that transition.
These existing-work jobs continue during Redis outages; their explicit PG-only guard
is not a fallback for creating new work. Without that
explicit guard, transactions retain the default fail-closed producer guard. An
idle transition requires the exclusive try-lock, removes intents older than
120 seconds while holding that lock, rechecks PostgreSQL work under the lock,
then clears active only if the activity epoch and revision are unchanged and
no intents remain. A delayed writer whose intent was invalidated aborts with
503 before database writes. Redis outages or monitoring/fallback signals force fast
PostgreSQL scans so Redis cannot cause work to be missed. Startup also scans
persisted work immediately and marks discovered work active.

During a coordination outage, the ranked scheduler pauses season transitions
and pairing but still runs queue/proposal expiry and cleanup. It handles
`GameplayCoordinationUnavailable` only in those work-producing phases;
database and domain errors retain their normal failure handling. Paused work
creation drives retries at the configured active interval without forcing
standings or territory cleanup on every retry; those jobs retain their normal
maintenance throttles. Healthy sweeps keep season maintenance first, followed
by expiry and pairing.

Roll out in stages: first deploy the API with polling mode and durable intent
publishing; then retire every older or otherwise unaware producer, including
old local servers that can write to the same Neon database. Only after all
producers of new persisted work participate in the protocol, set the repository Actions variable
`PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND=upstash` and, after the audit, explicitly
set `PRODUCTION_GAMEPLAY_WRITERS_COORDINATED=true`. Start a new API deployment.
CI retains `polling` unless both conditions are met; the acknowledgement
defaults to `false`. It changes and verifies the Azure setting only after a
successful database release. Changing only the live Azure setting is temporary
because the next deployment will reset it from the gated repository settings.
Do not enable
Upstash mode during a rolling deployment that still has unaware writers. Roll
back by setting the Actions variable to `polling` and redeploying/restarting;
polling remains the correctness fallback.
Upstash mode adds Redis commands and is not free. No CU savings, Neon suspend
behavior, or deployed multi-instance result has been measured yet. No schema
migration is required.

### Verify the deployed scheduler mode

The Gitea Actions variable requests the mode for a future deployment; it is not
proof that the running API uses that mode. After the writer-retirement audit,
start a **new** deployment using the updated variable. CI prints the requested
backend, safe effective backend, and Azure's non-secret
`GAMEPLAY_SCHEDULER_BACKEND`, failing if Azure differs from the safe effective
backend. A missing writer acknowledgement deliberately retains polling and
logs the activation gate. API startup logs record `gameplaySchedulerBackend`,
`livePvpActiveIntervalMs`, and `rankedActiveIntervalMs`; production polling also
emits a warning. Confirm the startup values on every running replica.

On 9 October 2026, the operator reported the requested Gitea backend as
`upstash` but Azure's backend as `polling`. This mismatch explains persistent
idle queries, not the entire reported CU-hours increase. Do not assume that a
finished CI run means old API servers have stopped: check old deployments and
local API servers sharing production Neon separately. Keep the namespace,
durable intents, and writer fences intact during activation.

Later on 9 October 2026, the operator confirmed that Kevin and Tyron had
finished stopping or upgrading the old API servers using production Neon.
This cleared the operator-confirmed writer-retirement prerequisite, not the
deployment verification. At confirmation time, the release fixes were local
and no post-cutover Azure mode readback had been performed. A repository owner must set
`PRODUCTION_GAMEPLAY_WRITERS_COORDINATED=true` alongside the requested
`PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND=upstash`; merge the reviewed release fix
and start a new deployment instead of rerunning the old failed job, then verify
Azure and runtime startup both report `upstash`. The investigation session
could not manage Gitea Actions variables and had no Azure login. No production
activation or CU savings are claimed by this incident record.

An upgraded local API still keeps Neon awake if its own scheduler remains in
polling mode, even when it publishes valid intents. Stop unused local servers;
prefer a disposable local database for development. Every running API sharing
production must use the coordinated mode after the safe cutover to obtain the
idle-probe reduction. A check on one machine cannot establish the state of
teammates' servers or other replicas.

After deployment, compare `live_probe`, `ranked_probe`, and `listener` pool
telemetry during at least two otherwise idle 30-minute windows, alongside
Neon's compute-activity graph and actual CU-hours delta. Observe normal
gameplay and the next scheduled boundary as well. Neon compute use is compute
size multiplied by active time; regular queries can prevent its five-minute
idle suspension. A 30-minute idle check is a scheduling limit, not a promised
monthly CU budget. Other traffic, maintenance, replicas, sockets and external
clients still affect usage. See [compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)
and [usage metrics](https://neon.com/docs/introduction/usage-metrics).

Ranked queue `POST`, heartbeat `POST`, queue `DELETE`, proposal accept and
decline `POST`, and other work-producing mutations publish before their
database writes; territory `GET` reads do not publish. Pairing creates proposal
work. Proposal acceptance is the only API path that creates an active live
match and announces both live and ranked work. Existing-match live actions,
tickets, and presence writes cannot create or reactivate a match and keep
Redis out of their gameplay coordination path. The existing server-only
`ASYNC_PVP_CURSOR_SIGNING_KEY` also signs viewer-bound ranked standings cursors.
Keep that value stable across API instances and rotations during a traversal.
It must never be a `VITE_*` value.

On startup and each full sweep, the worker checks the season, expires stale search
leases and proposals, claims eligible pairs, and once per minute drains expired
ten-minute standings snapshots in 100-row delete batches. The same ranked worker
throttles territory maintenance to approximately once per minute: it settles due
`territory-v1` windows chronologically and removes expired short-lived grants.
These approximately 60-second throttles are internal `runOnce` maintenance
cadences, not an idle database wake interval. In polling mode and while active,
the configured sweep cadence still drives database scans; Upstash idle scans
can be separated by up to 30 minutes or an earlier known work boundary.
The live PvP deadline worker remains responsible for active match completion;
ranked rating settlement and qualifying territory influence recording run inside
the authoritative live terminal transaction.

Hourly settlement reuses the minimum-influence value from the existing policy
load inside each settlement operation. Migration `0053` prevents updates or
deletes of versioned territory policies, so this value cannot change during the
operation. It is passed through the hourly savepoint/retry path without a global
cache or reuse across transactions or sweeps. Regular catch-up still commits
each window separately and loads policy again in the next transaction. Season
finalization reuses its operation's policy for complete hourly windows;
standalone settlement calls and final partial windows retain their own lookup.
Settlement ordering, player-before-zone locks, thresholds and transaction
boundaries are unchanged. This reduces redundant SQL; it does not establish the
cause of an authentication incident or prove a production latency improvement.

A closing season now waits for both systems. Every ranked receipt must first have
a rating settlement. The territory finalizer then catches up complete hourly
windows, settles one final partial window per active zone, records the season
close receipt, and appends the unowned `season_reset` state. Only after that
transaction succeeds may ranked standings be archived and the season become
`closed`. A failed or stale territory attempt leaves the season `closing` so the
next sweep can retry safely. Do not manually mark a live match complete, alter
rating rows, insert ownership state, or force a ranked season closed.

## Operational checks

After deployment, confirm the API OpenAPI document includes the `Ranked` tag
and the current-season route reports the scheduled season only after worker
activation. Test a two-player queue and match in a disposable environment
before enabling player UI. Check that one match yields one settlement receipt
and two ledger entries, and that repeated reads return the same values. Watch
ranked sweep failures, active/closing season age, stale queue/proposal counts,
unmatched ranked receipts, territory windows awaiting settlement, failed stale
state retries, and expired-grant cleanup. During a closing season, confirm a
`territory_season_close_receipts` row exists before expecting the ranked archive
to seal. Investigate an unsettled terminal match or territory window before
attempting a season close.

The gameplay coordination integration test is a small fixture, not the full
database suite. It is gated on
`GAMEPLAY_COORDINATION_TEST_DATABASE_URL` and either
`GAMEPLAY_COORDINATION_TEST_REDIS_HOST` or
`GAMEPLAY_COORDINATION_TEST_REDIS_CONTAINER`. The database URL must target an
isolated local PostgreSQL instance; the test creates and drops only its own
random schema and runs no migrations. The Redis target must be an isolated local test
service/container. CI may use the `postgres` service alias only with
`CI=true`, the isolated `wits_world_test` database and the unusable
`DATABASE_URL=postgresql://ci-guard:ci-guard@127.0.0.1:1/wits_world_ci_guard`
sentinel. For local Postgres and Redis listening on loopback:

```bash
GAMEPLAY_COORDINATION_TEST_DATABASE_URL='postgresql://test_user:replace-me@127.0.0.1:5432/gameplay_coord_test' \
GAMEPLAY_COORDINATION_TEST_REDIS_HOST=127.0.0.1 \
npm test --workspace @wits-world/api -- gameplay-coordination.integration.test.ts
```

For a local owned Redis container, set
`GAMEPLAY_COORDINATION_TEST_REDIS_CONTAINER=<container-name>` instead of the
host variable; the test invokes `redis-cli --json` inside that container. The
test does not load `.env` or use production connection settings.

The full hosted database test suite is separate and runs in Gitea CI. It uses
`TEST_DATABASE_URL`, creates a temporary database, and applies the migration
set; reserve manual hosted runs for authorized release smoke or recovery
evidence. Never point either integration target at production.

## AI declaration

This document was created and reviewed with assistance from Codex (GPT-5) and
ChatGPT-Web[GPT-5.6 Sol]. The operation-scoped policy reuse documentation was
updated with assistance from Codex (GPT-6). The idle-aware worker behavior
update was prepared with assistance from Codex-CLI[GPT-5] and
Codex-CLI[gpt-6-luna], based on source inspection and user direction.
The durable activity-store rollout guidance was updated with assistance from
Codex[GPT-5], based on user-provided implementation requirements.
Existing-work outage behavior was clarified with assistance from Codex-CLI[gpt-6-luna].

Error-backoff and deployed-mode verification guidance was added with assistance
from Codex[GPT-5] and Codex-CLI[gpt-6-luna].
