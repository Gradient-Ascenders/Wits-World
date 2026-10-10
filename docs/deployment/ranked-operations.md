---
title: 'Gameplay workers'
---

# Gameplay workers

API background workers recover persisted work at startup and process it without
requiring a player to keep a page open. This page covers deployment settings
and operating checks for live battles, ranked matchmaking, and territory
settlement. [Battle contracts](../architecture/live-pvp-api-contract.md) and
[ranked storage](../database/ranked-competition-persistence.md) define the
underlying state and transaction rules.

## Responsibilities

| Worker   | Work handled                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live PvP | Processes persisted decision deadlines and recovers active matches. A separate cleanup timer removes expired transient tickets and access records.                                              |
| Ranked   | Activates and closes scheduled seasons, expires queue leases and proposals, pairs players, and cleans up standings snapshots. It also settles due territory windows and removes expired grants. |

Asynchronous battle deadlines, account-deletion retries, movement-evidence
cleanup, trust evaluation, and trade maintenance have separate schedulers. The
live/ranked coordination setting below does not replace those workers.

Deployment does not create a ranked season. An operator must schedule its
policy, display name, and intended start through a reviewed database change.
Schedule the next season before the current one ends; activation waits until
the previous season has finished closing. Player-facing season behaviour is
covered in [Rankings](../requirements/ranked-competition-policy.md).

## Scheduling modes

`GAMEPLAY_SCHEDULER_BACKEND` defaults to `polling`.

| Mode      | Behaviour                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polling` | Live and ranked workers probe PostgreSQL at their configured cadence, including while idle.                                                                                                                                                                   |
| `upstash` | Active workers keep their configured cadence. While idle, shared Redis activity records wake workers across API instances; idle PostgreSQL probes can be up to 30 minutes apart, with ranked probes brought forward for known season or territory boundaries. |

`LIVE_PVP_DEADLINE_SWEEP_INTERVAL_MS` and `RANKED_SWEEP_INTERVAL_MS` both default
to `1000`. The live interval accepts `250–5000`; ranked accepts `250–30000`.
Intervals control processing cadence, not the persisted deadlines or gameplay
rules.

Upstash mode checks a combined activity snapshot every 10 seconds. These reads
and work-announcement commands share the Redis service with rate limiting, so
include replica count and both workloads when reviewing usage. Reduced idle
probing does not guarantee that Neon will suspend: other requests, cleanup
workers, or database clients can keep it active.

Thrown gameplay probe/sweep errors retry with exponential backoff: the first
retry retains the active interval, later consecutive failures double the delay
up to 30 seconds (or the configured interval if already longer). A successful
probe resets the backoff; an explicit mutation wake remains immediate. Healthy
active work, idle confirmation that safely falls back to fast scans, and paused
work-creation booleans do not enter this error backoff. A Redis coordination
outage can therefore still keep PostgreSQL scanning; this is not an outage-time
scale-to-zero guarantee.

Credentials remain server-only. `GAMEPLAY_SCHEDULER_NAMESPACE`, when set, must
match across all writers sharing the database. Otherwise the API derives it
from the database endpoint, normalising pooled and direct Neon hostnames.

## Enable coordinated scheduling

1. Deploy with `polling` and the Upstash rate-limit backend so new-work producers
   already publish durable activity records. Credentials alone do not enable
   publishing on an instance using local rate limiting and polling.
2. Retire every older or unaware writer to the shared database, including local
   API instances. All producers must announce work before long idle sleeps
   become safe.
3. Set `PRODUCTION_GAMEPLAY_SCHEDULER_BACKEND=upstash` and acknowledge the
   completed writer audit with `PRODUCTION_GAMEPLAY_WRITERS_COORDINATED=true`.
   Start a new deployment. CI defaults the acknowledgement to `false`, keeps
   polling unless both settings allow promotion, and applies and verifies the
   Azure mode only after database release succeeds.
4. Verify cross-instance wake-up, restart recovery, and outage behaviour in an
   isolated environment before relying on the mode in production.

To return to frequent probing, set that repository Variable to `polling` and
redeploy. Changing only the Azure setting is temporary: the next deployment
uses the repository value or its `polling` default. Returning to polling does
not remove rate limiting or the durable publication guard from Upstash-backed
writers.

Keep shared activity records intact. Clearing them to force an idle state can
hide pending work.

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

## Outages and recovery

When Redis coordination is unavailable, new-work mutations fail before database
writes, and ranked pairing and season transitions pause. Existing queue and
proposal expiry, due territory settlement, and live deadline processing
continue through PostgreSQL. Workers return to frequent probes when coordination
monitoring fails and scan persisted work again after restart.

Existing live actions do not require Redis gameplay coordination, but they still
pass the independent HTTP request policies. [Rate limits](../architecture/rate-limiting.md)
explains which policies reject requests during a Redis outage.

A closing season waits for ranked results to settle and for territory
finalisation to record its close receipt before the standings archive seals.
Investigate a season stuck in `closing`, a terminal match without settlement,
or a territory backlog through worker errors and persisted receipts. Do not
force completion or rewrite rating and ownership history to clear the backlog.

## Operating checks

After a worker or scheduling change, use an isolated environment to check that:

- pending work resumes after an API restart;
- work created on one API instance wakes the relevant worker on another;
- a ranked match settles once and repeated reads agree;
- territory windows catch up before a season closes; and
- a Redis outage pauses new-work creation while existing-work recovery continues.

Monitor worker failures, stale queue entries, overdue matches, unsettled
results, and seasons remaining in `closing`. Collect aggregate timings and
counts without recording tickets, tokens, hidden cards, or precise locations.
[Database integration and coordination suites](../testing/automated-verification.md#database-integration)
cover automated checks; deployed recovery needs its own verification.

**AI declaration:** Prepared and updated with assistance from Codex[GPT-5],
ChatGPT-Web[GPT-5.6 Sol], Codex[GPT-6], Codex-CLI[GPT-5], and
Codex-CLI[gpt-6-luna].
