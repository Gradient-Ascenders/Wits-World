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
SQL, query order, locks, transactions, rate policies and battle rules are
unchanged. Repository implementation does not prove production deployment.

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
| `match_insert_ms`, `participants_insert_ms`, `private_state_insert_ms`                                                   | Three separate existing awaited initial writes                                                                                                               |
| `invitation_update_ms`, `invitation_view_ms`, `match_response_view_ms`, `receipt_write_ms`                               | Accepted invitation update, fresh invitation projection, combined match/card response hydration, replay receipt persistence                                  |
| `get_locked_projection_ms`, `get_clock_ms`, `get_response_projection_ms`, `get_card_presentation_ms`, `project_match_ms` | Existing GET locked full projection, database clock, second full projection, separate card presentation, and synchronous client-view projection              |
| `sql_client_ms`, `sql_statement_count`                                                                                   | Sum/count of attempted calls on this service transaction's client, including BEGIN/COMMIT/ROLLBACK and failed calls                                          |
| `serialize_hook_interval_ms`                                                                                             | preSerialization → onSend interval when the hook is reached; includes other intervening hooks, not pure serializer CPU                                       |
| `request_residual_ms`                                                                                                    | Remaining elapsed time after subtracting only disjoint top-level intervals, as described below                                                               |

Battle state, latest action and ordered history are part of the full projection
SQL; the timers do not pretend they are independent queries. `project_match_ms`
includes JavaScript history transformation. Deferred constraints/validators may
execute during COMMIT, so their work can appear in `commit_ms` rather than an
insert's client time.

The normal controlled transaction counts remain 18 for acceptance without
optional production trust checks, 20 with its two restriction reads, 6 for a
fresh active GET and 11 for the normal action control. These are expected
controlled-path counts, not universal counts for error, replay, forfeit or
history variants. Statement count excludes identity queries before the service,
queries in post-transaction trust dependencies, and SQL inside database triggers.
No extra query is issued to collect timings.

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

## AI declaration

Codex[GPT-6] assisted with the instrumentation implementation, tests and this
documentation. Verification results and local measurement evidence belong in
the implementation handoff; this declaration is not deployment evidence.
