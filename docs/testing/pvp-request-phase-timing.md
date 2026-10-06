---
title: 'PvP request phase timing'
---

# PvP request phase timing

## Scope and correlation

The API extends its existing `API request timing` event for exactly:

- `POST /api/v1/matches/pvp/invitations/:invitationId/accept`;
- `GET /api/v1/matches/pvp/:matchId`.

Every match-detail GET on that route is included, including polls and completed
matches. The server cannot distinguish the first navigation GET from a poll
without adding tracking. Identify the initial GET from the browser sequence.

The existing event retains `timings` (`auth`, `identity`, `total`) and the
templated `route`. These two routes additionally log `phaseTimings` and
`statusCode`. Fastify's existing request logger supplies `reqId`, also returned
as `requestId` in the response envelope. Correlate a controlled acceptance and
its first match GET manually using those two IDs; do not add a persistent
journey, account or resource identifier.

Detailed phases remain **server logs only**. The browser `Server-Timing` header
still contains only the existing coarse stages. Response schemas and bodies,
locks, transactions, rate policies and battle rules remain unchanged. The
acceptance-write and match-detail reductions below document current query changes.
Repository implementation does not prove production deployment.

## Fields and boundaries

All durations use monotonic milliseconds. Counts are nonnegative integers.
Fields are from a fixed runtime allowlist; invalid names, negative/nonfinite
values and fractional counts are discarded. Only observed fields are emitted.
No field is filled with zero to imply that an unavailable phase was measured.

| Fields                                                                                                                   | Boundary                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rate_ms`, `upstash_client_ms`                                                                                           | Entire rate enforcement; awaited Upstash limiter call including its existing timeout handling, respectively                                                  |
| `pool_acquire_ms`                                                                                                        | Service transaction client acquisition, including pool queue/connect/TLS work                                                                                |
| `begin_ms`, `commit_ms`, `rollback_ms`, `transaction_ms`                                                                 | Existing transaction commands; transaction spans BEGIN dispatch through COMMIT/ROLLBACK completion, including a failed BEGIN attempt                         |
| `invitation_lock_client_ms`, `submission_lock_client_ms`, `receipt_clock_ms`                                             | Existing invitation lock, submission lock and combined receipt/clock operations                                                                              |
| `trust_ms`, `trust_statement_count`                                                                                      | Sum of acceptance restriction checks; actual calls made by those checks on the same transaction client                                                       |
| `post_transaction_trust_ms`                                                                                              | Existing conflict reporting or completed-match opponent-pattern evaluation after the transaction, if that dependency is configured                           |
| `deck_ms`, `snapshot_read_ms`, `snapshot_write_ms`                                                                       | Recipient deck loader, challenger snapshot hydration and recipient snapshot persistence                                                                      |
| `match_construct_ms`                                                                                                     | Synchronous battle construction, both initial selections and active-phase validation; UUID/deadline preparation immediately afterwards remains residual work |
| `initial_match_write_ms`                                                                                                 | Single dependent CTE statement inserting the match, both participants and private state                                                                      |
| `match_insert_ms`, `participants_insert_ms`, `private_state_insert_ms`                                                   | Historical separate initial-write fields; absent on the consolidated fresh acceptance path                                                                   |
| `invitation_update_ms`, `invitation_view_ms`, `match_response_view_ms`, `receipt_write_ms`                               | Accepted invitation update, fresh invitation projection, combined match/card response hydration, replay receipt persistence                                  |
| `get_locked_projection_ms`, `get_clock_ms`, `get_response_projection_ms`, `get_card_presentation_ms`, `project_match_ms` | GET participant/deadline lock inputs, database clock, fresh combined response/card projection, separate card read when used, and synchronous view projection |
| `sql_client_ms`, `sql_statement_count`                                                                                   | Sum/count of attempted calls on this service transaction's client, including BEGIN/COMMIT/ROLLBACK and failed calls                                          |
| `serialize_hook_interval_ms`                                                                                             | preSerialization → onSend interval when the hook is reached; includes other intervening hooks, not pure serializer CPU                                       |
| `request_residual_ms`                                                                                                    | Remaining elapsed time after subtracting only disjoint top-level intervals, as described below                                                               |

Battle state, latest action and ordered history are part of the full projection
SQL; the timers do not pretend they are independent queries. `project_match_ms`
includes JavaScript history transformation. Deferred constraints/validators may
execute during COMMIT, so their work can appear in `commit_ms` rather than an
insert's client time.

The normal controlled transaction counts are 16 for acceptance without
optional production trust checks, 18 with its two restriction reads (previously
18 and 20 respectively), 5 for a
fresh active GET (previously 6) and 11 for the normal action control. These are expected
controlled-path counts, not universal counts for error, replay, forfeit or
history variants. Statement count excludes identity queries before the service,
queries in post-transaction trust dependencies, and SQL inside database triggers.
No extra query is issued to collect timings.

## Acceptance initial-write consolidation

Fresh acceptance uses one parameterized SQL statement for the three initial
writes. The match CTE returns its authoritative ID/version; the participant CTE
consumes that row to insert both existing player/snapshot/side tuples. The private
state CTE consumes the match row and depends on the participant CTE returning two
rows. A final projection returns integer counts for all three inserts; the
service requires exactly one match, two participants and one private state or
throws inside the existing transaction.

Data flows through `RETURNING`, not same-statement reads of the modified tables.
Immediate match/player foreign keys and unique/check constraints remain active;
existing deferred snapshot, current-participant, state/version and integrity
checks still validate the complete transaction at COMMIT. Invitation update,
fresh response hydration and receipt persistence remain subsequent statements.
Server-generated match ID, snapshot IDs, battle state and the post-lock database
clock/deadline values are reused unchanged. No schema or constraint change is
required.

The invitation lock, submission lock, post-lock receipt/clock read and replay
branches are unchanged. Insert, row-count, downstream receipt or COMMIT failures
retain the existing rollback behavior. Real PostgreSQL tests force immediate
insert constraints, a deferred snapshot violation, receipt uniqueness and
incomplete CTE rows; they check pending invitation/snapshot/receipt state and
the absence of orphan match, participant and private-state records, then retry
acceptance and its replay successfully. Existing duplicate/racing acceptance,
cancellation, expiry, authorization, viewer-relative response and action tests
remain applicable.

`initial_match_write_ms` replaces the three individual spans on this path;
absent individual fields are not zero. Compare it with the old three-write sum
within each request, then report SQL/transaction/request timings separately.
The consolidated statement removes two client calls, reducing the production-style controlled
count from 20 to 18. This describes local implementation, not a deployment or a
guaranteed end-to-end saving. Reverify five fresh journeys, eight action controls
and matching request-ID-filtered timing events after normal reviewed CI/CD.

## Match-detail read reduction

The normal active GET retains BEGIN, participant-authorized `FOR UPDATE OF match`,
a separate authoritative database clock, a fresh response query and COMMIT.
The lock query now reads only match/participant inputs needed for authorization
and deadline processing. The response query uses the existing combined
match/history/card-presentation projection; there is no standalone card read.
Completed GETs skip the clock and use four statements. Deadline-forfeit paths
still perform their existing writes and then reload persisted response state.

Reusing the original locked full projection is unsafe after a concurrent-action
lock wait under Read Committed: the updated locked match row can accompany older
joined battle-state/history data. The separate response statement obtains a new
snapshot after acquiring the lock, including after any deadline mutation.
No initial frontend GET is removed and no match state is cached.

`get_locked_projection_ms` retains its historical field name but now measures
the smaller authorization/deadline lock query. `get_response_projection_ms`
includes card presentation in the combined response query. Standalone
`get_card_presentation_ms` is absent on this GET path, not zero; compare the
combined query against the two earlier reads without double-counting SQL time.
This is a repository implementation description, not proof of deployment or
a guaranteed production latency reduction.

## Overlap and limitations

`transaction_ms` includes its SQL, trust, deck/snapshot work, synchronous match
construction and commit/rollback. `sql_client_ms` overlaps every timed SQL
phase. `deck_ms` includes several SQL calls. `upstash_client_ms` is inside
`rate_ms`. Do not add these parent and child fields to obtain request time.

The residual is:

```text
max(0, total - auth - identity - rate_ms - pool_acquire_ms
       - transaction_ms - post_transaction_trust_ms
       - serialize_hook_interval_ms)
```

Absent fields are not subtracted; their work, if any, remains unallocated.
Residual includes validation, hashing, envelope construction, release, other
hooks and instrumentation overhead. It is not a measurement of platform wait.
The top-level service pool timer excludes identity's separate acquisition/work,
already inside `identity`.

SQL client durations combine driver/protocol work, wire round trips, server
execution, queueing and lock waits. Lock-labelled client timers are **not pure
lock-wait measurements**. Existing database/platform telemetry is required to
split these components. Do not enable SQL/parameter logging or add production
monitoring queries to infer that split. Upstash client time similarly does not
isolate Redis execution from network wait.

The event is emitted in onSend before browser transfer or socket completion.
Serialization hooks may not run on every response shape; missing serialization
timing is expected. Failures/replay paths emit only the spans they reached.

## Isolation, failures and privacy

The existing WeakMap associates timing state with a Fastify request. The route
passes that request's optional sink to its service method and transaction
helper. A lightweight wrapper delegates query/release to that acquired client;
it never wraps the global pool, classifies query text or stores parameters.
Trust-query counts use a local delegating wrapper on the same client. Concurrent
requests have independent collectors, including requests blocked on the same
invitation/submission or match locks. Other routes receive no detailed collector.

Timers finalize in `finally` on errors and preserve the original result/error.
Timing clock, sink and log/header failures are best effort and cannot fail the
operation. The existing logger is used once per request; no per-statement log,
extra tracing framework or dependency is introduced.

The instrumentation emits fixed numeric duration/count fields, the templated
route, normal response status and existing request logger correlation. It never
records SQL, parameters, bodies, claims, tokens, cookies, connection strings,
Redis keys, precise location, emails, usernames or player/match/invitation/deck/
card identifiers. Error message contents are not added to timing logs.

## Validation and production measurement

1. Run request-timing, query-wrapper, Upstash/rate and asynchronous-PvP route
   tests. The real persistence suite exercises per-call collectors for existing
   normal/replay/conflict/concurrency/expiry/rollback/access/forfeit/history
   behavior, including independent duplicate-accept and concurrent-GET counts.
2. Confirm the dedicated `TEST_DATABASE_URL` is separate from application data.
   Use the suite's disposable child database lifecycle for all integration
   writes. Compare the unchanged main build and instrumented build with
   alternating acceptance/GET/action runs, including production-style trust
   reads. Keep statement counts, responses and fixtures equivalent. Distinguish
   request-time noise from local collector overhead and production log I/O.
3. Complete API tests, type-check, lint, build, repository format:check and diff
   checks. Do not deploy manually from a diagnostic implementation task.
4. After separate approval, commit/review/merge and use normal CI/CD. Confirm
   actual deployment revision evidence; preserve current quotas and configuration.
5. Run at least five fresh disposable-account accept-click→authoritative-ready
   journeys, retaining the first/slower samples. Collect both response request
   IDs, browser request start/TTFB/completion, navigation/GET gap and render-ready
   timing. Retrieve the corresponding existing server log events using request
   IDs without saving sensitive raw request logs or authenticated storage.
6. Collect eight PvP actions as a control. These retain only coarse request
   timing; the detailed phase collector must remain absent on action requests.
7. Report every sample, median/min/max, observed statement counts, phase coverage
   and residuals. Separate fresh/replay/expired/overdue/completed paths and
   first-after-idle from warm runs. Correlate API total with TTFB rather than
   equating either with database CPU. Choose the next optimization only from
   measured avoidable costs; retain the authoritative initial GET.

Reduce/remove detailed fields through a separately reviewed change after repeat
measurements establish a stable bottleneck and the selected fix is verified.
Retain the coarse request timing/correlation. Remove unused diagnostic detail
if its logging cost becomes material, but do not quietly disable fields during
the comparative run or claim unavailable measurements are zero.

## PostgreSQL pool pressure observations

Pool observations supplement request timing; they do not identify the root cause
of a production incident until correlated evidence is available. They change no
pool limits, timeouts, scheduler cadence, LISTEN endpoint, SQL or HTTP behavior.

The fixed message `PostgreSQL pool observation` carries allowlisted fields only.
Request events use the existing request logger and request ID; process summaries
are structured JSON. Retrieve only matching request events and narrowly bounded
pool/scheduler/listener summaries from the same process and incident window in
`/home/LogFiles/*_default_docker.log`. Do not export unrelated production logs.

| Field                                                                                                 | Meaning                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `totalCount`                                                                                          | Current clients, including connecting and checked-out clients                                                                                                              |
| `idleCount`                                                                                           | Clients immediately available for reuse                                                                                                                                    |
| `waitingCount`                                                                                        | Checkouts waiting in the pool queue                                                                                                                                        |
| `before_total/idle/waiting`, `after_total/idle/waiting`                                               | Snapshots before checkout and after success/failure; release events use acquisition and post-release snapshots                                                             |
| `checkout_ms`                                                                                         | Time from native connect invocation to resolution/rejection; combines queue and connection establishment time                                                              |
| `hold_ms`                                                                                             | Successful checkout to release; includes queries, locks, application work and persistent LISTEN retention                                                                  |
| `active_holds_count`, `oldest_hold_ms`                                                                | Number and oldest age of tracked successful checkouts                                                                                                                      |
| `listener/request/maintenance/other_holds_count`, corresponding `*_oldest_hold_ms`                    | Holder-category evidence without identifying clients or users                                                                                                              |
| `checkout_count`, `checkout_failures_count`, `new_connections_count`, `suppressed_count`              | Counts since the previous pool summary                                                                                                                                     |
| `run_started_unix_ms`, `run_ms`, `running_count`                                                      | Current/latest scheduler run start, elapsed duration and active state                                                                                                      |
| `runs_count`, `skipped_count`                                                                         | Scheduler runs and active-run skips since its previous summary                                                                                                             |
| `run_failures_count`, scheduler `checkout_count/checkout_failures_count/checkout_ms/contention_count` | Current/latest run failure flag (0/1), acquisitions, failures, summed checkout time and acquisitions finding contention; snapshots describe its last completed acquisition |

Native promise and callback `connect()` overloads are delegated, including the
callback used internally by native `pool.query()`. Query text is never wrapped or
examined. An asynchronous scope assigns only `request`, `ranked_maintenance`,
`live_deadline`, `listener` or `other`; unscoped work remains `other`. Hold timing
applies to all acquired clients, including existing transaction helpers.

Successful checkouts below 250 ms without observed contention remain quiet.
Failures, slower checkouts, queued/saturated acquisitions and holds of at least
1,000 ms are eligible for events, capped together at 20 per pool per minute.
Listener releases are also eligible. A summary every 60 seconds reports activity,
held clients and suppressed events; an inactive pool emits nothing. The timer is
unreferenced and cleared on native pool shutdown. Connection counts measure
successful physical connections, not connection attempts or separate handshake
duration.

Ranked maintenance and live-deadline summaries report slow (at least 1,000 ms),
contended or failed runs at most once per 10 seconds and periodic activity every
60 seconds. Runs skipped while an earlier run is active are counted. A prolonged
active run can produce a periodic summary on a skipped invocation. Quiet short
runs produce no per-second logs. If a run has been reported as active, its
completion always emits `running_count=0`, including failed completion, even
within the ten-second exceptional-summary throttle. This completion transition
is scoped to that run and does not make subsequent short runs noisy.
Cleanup work outside these two run scopes remains
`other`. Existing scheduler result/error logs retain their existing behavior.

Listener events describe checkout start/success/failure, LISTEN success, client
error, reconnect, recovery, release and destruction. A long listener hold is
expected; it still explains occupied pool capacity. Recovery callback failures
are not automatically classified as SQL failures. No payload or match identifier
is included in listener telemetry or its fan-out failure warning.

| `error_category`        | Evidence / interpretation                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `checkout_timeout`      | Exact pg-pool pending checkout message `timeout exceeded when trying to connect`                                           |
| `connection_timeout`    | Exact new-client message `Connection terminated due to connection timeout`                                                 |
| `connection_terminated` | Exact known connection termination messages                                                                                |
| `query_error`           | Failure at a known query boundary, or a transaction error with SQLSTATE-shaped code                                        |
| `rollback_failure`      | Existing rollback rejected; original rejection semantics preserved                                                         |
| `client_error`          | Other client-error callback failures                                                                                       |
| `unknown_db_error`      | Unclassified errors at known database boundaries; generic transaction/domain exceptions are not emitted as database errors |

Generic transaction catches emit a database-error event only for a recognized
connection failure or SQLSTATE-shaped error. Application/domain exceptions
without that evidence emit no database-error event. Explicit query and rollback
boundaries still report their failures; original rollback, release and error
propagation behavior is unchanged.

Exception contents are inspected only for classification and never serialized.
The event constructor excludes SQL, parameters, bodies, credentials, tokens,
cookies, URLs, provider hostnames, usernames, account/player/match/invitation IDs,
backend PIDs, client objects, raw messages, stacks and arbitrary caller strings.
Only finite nonnegative numeric fields and predefined categories are accepted.
Existing server logger correlation/process metadata is unchanged. Telemetry logger
failures do not fail database work.

On recurrence, correlate identity/total timing with a checkout failure and its
before/after queue counts, holder ages/categories, recent physical connection
counts, listener lifecycle and overlapping maintenance summaries. A saturated
pool with waiting requests and older request/maintenance holders supports checkout
pressure; a `connection_timeout` supports establishment failure. Neither proves
why a holder is slow, whether a query is blocked, or provider/network health.
Counts are instantaneous, held clients become visible only after acquisition,
and rate limiting intentionally omits individual events. No SQL tracing, query
deadlines, stack capture or additional database queries are introduced.

Validate with `pool-observability`, request-timing, identity, connection, listener
and scheduler tests. The gated disposable PostgreSQL saturation test uses max=1
and a short checkout timeout **only in its test pool**, occupies it, observes a
pending timeout, releases the holder, and verifies native query/callback recovery.
Full database-suite results and environment limitations belong in the handoff.
A dedicated direct LISTEN connection remains a separately reviewed follow-up;
this instrumentation does not move or add a connection endpoint.

## AI declaration

Codex[GPT-6] assisted with the instrumentation implementation, tests and this
documentation. Verification results and local measurement evidence belong in
the implementation handoff; this declaration is not deployment evidence.
