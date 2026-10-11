---
title: 'API speed and battle response results'
---

# API speed and battle response results

## Findings and measurements

Measured locally on 12 September 2026 (Africa/Johannesburg):

| Path                                            | Before                    | After                     | Measurement scope                                                                                                                                                  |
| ----------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unchanged identity resolution                   | 732–743 ms; median 738 ms | 183–194 ms; median 185 ms | Five alternating warm runs of original/current services against a newly created disposable test database with minimal identity tables; database removed afterwards |
| Existing CPU history, three matches / 79 rounds | 83 queries; 16,360 ms     | 3 queries; 579 ms         | Original/current services against existing data inside a read-only transaction; serialized responses identical (151,205 bytes)                                     |
| CPU history, three matches / 20 rounds each     | 64 queries; 1,003 ms      | 3 queries; 54 ms          | Same service fixture with a simulated 10 ms delay per query; Windows timer scheduling adds overhead; not a production benchmark                                    |
| Database connection                             | 1,769 ms                  | Unchanged                 | One read-only connection probe from the developer machine                                                                                                          |
| Warm database round trip                        | 182–222 ms                | Unchanged                 | Five `SELECT 1` probes; no gameplay writes                                                                                                                         |

The identity median improved by approximately 75%. Every authenticated gameplay
request previously began a transaction, acquired an identity lock, upserted the
player even when unchanged, and committed. Existing active identities now use a
single indexed read, including current role, lifecycle and token-denial checks.
Missing identities, name changes and pending deletion retain the locked path.
There is no authorization cache. A read may precede a concurrent deletion request,
as it could before this change; protected services retain their own integrity
checks. Pending deletion must not bypass serialization with deletion completion.

History previously issued one match-list query, one rounds query per match, and
one actions query per round. It now batches rounds/actions for the authenticated
player's returned match IDs and groups them in memory, preserving ordering and
response shape. Unused full battle-state snapshots are no longer selected for
history. Existing match/round/action and identity indexes cover these lookups;
no speculative index or pool-size change was made.

## Battle flow and interface

CPU actions already resolve the CPU chain within the versioned transaction and
return the full authoritative response. Successful moves need one POST and no
follow-up GET. Both services already reject illegal actors; the CPU regression
now explicitly verifies rejection and rollback without transition persistence.
Version checks, row locks, submission receipts and response-version checks remain.

Controls require the current actor, an allowed action and a ready request state.
CPU opening selection is actionable even though `currentSide` is initially null.
Submission and uncertain recovery disable input. Visible indicators say
`YOUR TURN`, `OPPONENT'S TURN`, or processing/synchronization status; active-side
text complements the existing battlefield emphasis. No predicted damage or
results are shown. Failed CPU submissions describe an unconfirmed outcome rather
than claiming the server did not apply the action.

PvP refreshes cannot start during mutations, and mutations abort an older refresh
before sending. This prevents refresh completion from clearing the pending state.
Existing version/generation checks still reject stale state. Visible-tab opponent
polling remains at five seconds, with failure backoff and visibility refresh;
shortening it would increase API/database load. Deadline-expired controls remain
inert while server state is checked.

## Timing diagnostics and remaining limits

`Server-Timing` reports `auth`, `identity`, and `total` durations in milliseconds.
The same numeric stages and route template are logged. Timing instrumentation
records no SQL, tokens, player IDs, bodies or precise location. `identity` includes
pool acquisition and database work; `total` minus stages includes route work and
serialization before sending, not browser transport or response download.
Use browser Network timings alongside this header to separate network waiting
from server work. Compare warm and first-after-idle requests separately.

Detailed acceptance and match-read spans can overlap; they must not be
+added together as total request latency. Server instrumentation alone does not
+establish a latency improvement or deployment. Keep controlled measurements
+attached to their revision, dataset, and warm/cold conditions; operator logging
+and diagnostics follow the [Azure monitoring guidance](../deployment/azure-deployment-setup.md).

The deployed browser/API click-to-result path was not profiled with a signed-in
session. The identity measurements isolate real database work; they are not a
claim of deployed end-to-end latency. Cold database/API starts, geographic network
latency, Auth0 token/JWKS retrieval, and the remaining required battle transaction
round trips still contribute. PvP opponent detection can additionally wait up to
the polling interval. The existing full-history API remains unpaginated, so large
accounts can still produce large responses; changing that contract is deferred.

## Reproducing checks

Run the focused web battle tests (`matches-pages`, `pvp-pages`, `battle-controls`),
API service/route/identity/timing tests, and `history-performance.test.ts` with the
workspace test commands. The history test prints its controlled elapsed time and
asserts constant query count plus round/action grouping. Run player,
account-deletion and CPU persistence integration tests using the repository's
disposable database configuration before accepting identity/query changes.
Never run profiling writes against development or production data.

## Verification results and changed files

- Passed in the 13 September follow-up: 970 non-database API tests, all 566 web
  tests, 44 shared-package tests and three deployment-script tests (1,583 total).
  Web tests were run through the npm workspace command so asset checks use the
  expected working directory. No database checks were rerun in this follow-up.
- Passed: player and CPU database suites plus the complete seven-test
  account-deletion suite after fixing pending-deletion serialization. The first
  deletion run exposed that race; its timed-out cleanup was completed explicitly.
- Passed: repository lint and formatting; API/web TypeScript checks including
  Playwright types; API and web production builds. Vite still warns about large
  chunks and a deprecated PWA bundling option.
- Browser suite: all seven tests passed after the 13 September follow-up.
  The mobile CPU page now allocates the viewport across both status notices and
  battle content, preserving the notices and scrolling action tray. This fixes
  the previous 938 px document on an 844 px viewport without weakening the
  viewport, keyboard, or authoritative-response assertions.
- Deployed browser-to-API timing, CI and deployment were not verified.

Implementation files: API `app.ts`, `request-timing.ts`,
`auth/authentication.ts`, `auth/authorization.ts`,
`players/player-identity.ts`, and `matches/cpu-match-service.ts`; web
`components/matches/BattlePresentation.tsx`, `pages/CpuMatchPage.tsx`,
`pages/PvpMatchPage.tsx`, and `pages/matches.css`. The test-failure follow-up also
updates `components/author/CardWorkspace.tsx` and its author-console regression:
input handlers snapshot values before scheduling state updates, so a deferred
update cannot reread restored DOM text after clearing an input. Corresponding API/web
regressions and both battle Playwright specs were added or updated. No schema,
dependency or API response-body changes were made.

The PowerShell npm launcher was broken. Checks used the existing npm CLI at
`C:/Program Files/Node.js/node_modules/npm/bin/npm-cli.js`, or local tool
entrypoints directly. Installed Node 24.19.0 is supported; the working npm 11.17.0
is below the repository's 11.18.0 minimum and was not changed. No installation or
lockfile regeneration was performed.

## CPU response serialization follow-up (13 September 2026)

The reported action failure and subsequent reload failure shared one cause:
an engine `effectCode` field leaked through the public `lastAction` projection.
Fastify's strict response schema rejected it after the action had committed.
The affected saved action was a CPU `power_change` debuff; its signed amount
remains unchanged. This was a serialization failure, not a connection failure.

The service now explicitly selects the existing public effect fields for fresh
responses and saved idempotency receipts. Internal metadata remains in the
engine and database. No schema relaxation, database repair, extra query, or
battle-state change is required.

Three regression checks fail against the previous implementation (including
HTTP 500 at the route boundary) and pass with the fix. Coverage includes saved
action projection, legacy receipt replay, and action/reload/resume serialization.
A read-only check of the actual affected match returned HTTP 200 for reload
and resume with version 4 unchanged. Local injected requests took 1,220 ms and
629 ms respectively; authentication was stubbed for this diagnostic, so these
are recovery evidence, not an end-to-end latency comparison. The original logs
showed failed reload/resume requests around 915–933 ms.

Follow-up validation: all 971 non-database API tests passed (264 database tests
skipped); API lint, type-check and build, changed-file formatting, and
`git diff --check` passed. No deployed browser session or database-writing
checks were run for this follow-up.

## Integration with updated main

The follow-up was reconciled with main at `87bb998`, retaining the updated
battle visuals and main's action/history serialization fix. The batched history
query now also selects `state_after`, which the public effect projection needs
to recover modifier details. It still uses three queries; earlier latency
measurements above predate this additional column. Main's responsive battle
layout supersedes the earlier mobile CSS override described above.

Post-merge verification: 39 targeted API tests and 65 battle web tests passed;
API/web type-checks and lint/formatting of the resolved files passed. All 12
battle browser scenarios passed across the initial run and targeted reruns.
The history scenario needed a warm rerun after a page-loading timeout; the
three-viewport PvP scenario passed with a local 120-second overall timeout
instead of 60 seconds, with every assertion retained. Its bench assertion now
checks that the new detail buttons open a dialog without submitting an action.
Dependencies were installed from the incoming lockfile with `npm ci`; no
database-writing checks were run.

## PvP response recovery follow-up

Both supplied PvP logs showed `lastAction` response serialization failures.
PvP used a separate projection that spread engine results into its public
contract, leaking `expiredEffects` and per-effect `effectCode`. The action could
already be committed before serialization failed, and subsequent reads failed
on the same saved result. PvP now explicitly selects its existing public action
fields while retaining viewer-relative sides. Saved action and resignation
receipts are also projected without changing their version or applying a new
move. Internal engine data remains persisted; no schema or database repair is
required. The UI now says “Action not confirmed” instead of claiming an action
was not applied.

Both viewer regression cases reproduced HTTP 500 on the previous code and
passed with the fix, including old receipt replay without a new action write.
Read-only local API injection against both affected saved matches returned
HTTP 200 for all four player views, at saved version 1. Authentication was
stubbed for this diagnostic, and row locks were omitted inside a read-only
transaction; no match was advanced or repaired.

Validation: all 16 PvP route tests and 32 PvP page tests passed. The full API
run passed 1,005 tests and skipped 275 database tests, with two unrelated
five-second timeouts. Both affected files passed on a single-worker rerun
(22 tests) without increasing timeouts. API/web type-check, API build, and
changed-file lint and formatting passed. No browser layout changes or database-writing tests
were needed for this correction.

## Review: serialize identity reads with account deletion

The active-identity fast path now uses `FOR KEY SHARE OF p`. A plain MVCC
read could authorize the old active row while deletion held `FOR UPDATE`
and finalized dependent gameplay. The key-share lock waits for that transaction;
after deletion commits, the active-row predicate no longer matches and the
existing lifecycle path returns deletion-pending, which authorization rejects.
Unchanged active identities still use one statement, and concurrent key-share
readers remain compatible. The earlier identity timings predate this lock;
no updated latency claim is made here.

A focused disposable-database regression pauses real deletion during cleanup,
observes the competing identity query blocked using `pg_blocking_pids`, then
verifies HTTP 403 `ACCOUNT_UNAVAILABLE` and that the gameplay handler never ran.
Without the row lock, the regression failed because the request completed
before deletion; with the lock, it passed. So did 62 identity/authentication/authorization unit and
HTTP tests, API type-check and changed-file lint. No development or production
database was modified.

AI assistance: Codex[GPT-6] investigated, implemented and documented this pass.

Page title clarified with assistance from Codex-CLI[GPT-6].

## Compact Battles landing reads (Issue #358, Workstream 2)

The landing page previously fetched the active CPU entry, then hydrated every
saved deck when no match was active. Its recent-results panel also fetched the
entire completed CPU history, including rounds and actions, to display five
merged CPU/PvP results. The shared shell's identity read and existing bounded PvP
reads are unchanged.

Two additive read profiles reuse the existing authenticated endpoints:

- `GET /api/v1/matches/cpu/entry?view=summary` returns nullable `activeMatch` and
  `selectedDeck` (only `deckId` and `name`). A single statement reads active state
  or selected-deck metadata for the authenticated player. An active match excludes
  deck metadata. An empty entry is HTTP 200. This read does not validate a deck or
  create/recover a match; the existing start endpoint still performs those checks.
- `GET /api/v1/matches/history?view=summary&limit=5` returns completed headers with
  `roundCount`. The limit defaults to five and must be an integer from one to 20.
  SQL bounds the player's matches before counting their rounds, without loading
  actions or battle state. Ordering is completion time descending, then match ID
  descending. The browser merges five CPU and five PvP summaries and displays the
  five newest results with a deterministic identity tie-breaker.

Requests without `view` retain their existing contracts. Full history and match
detail load when those destinations are opened. CPU preparation, active PvP and
recent results still load independently, preserving partial-result failures and
CPU retries. There is no new cache, polling or prefetch. Returning to Battles
performs fresh reads; starting a match retains authoritative validation and
active-match recovery. No pool, scheduler, transaction, authentication or gameplay
policy changed.

### Controlled local comparison

Three independent Chromium contexts per mobile/desktop layout compared frozen
before/after production-format `basic-e2e` builds, including cold direct entry and
repeat SPA navigation. Fixtures contained 30 completed CPU matches with 20 rounds
each, 20 decks and identical PvP rows. API requests were intercepted with a
constant 150 ms response delay. Mobile used 390 px/DPR 3 and four-times CPU
throttling; desktop used 1440 px/DPR 2 and normal CPU. These are fixture response
body bytes and browser timings, not compressed network transfer or deployed API
measurements. Service workers were blocked for this comparison.

| Metric                              | Before    | After    |
| ----------------------------------- | --------- | -------- |
| Battles landing requests            | 5         | 4        |
| Landing JSON response bodies        | 472,816 B | 1,704 B  |
| Mobile cold summary-ready median    | 2,984 ms  | 2,662 ms |
| Mobile repeat summary-ready median  | 775 ms    | 495 ms   |
| Desktop cold summary-ready median   | 1,114 ms  | 1,086 ms |
| Desktop repeat summary-ready median | 954 ms    | 305 ms   |

Cold entry includes shell/module preparation. Three samples are noisy and do not
establish a production latency improvement. Authenticated deployment verification
and production query plans remain follow-up work.

The CPU preparation/history paths now use two SQL statements instead of five
when no match is active (four previously with an active match). CPU client
acquisitions are two instead of three in the no-active case; PvP/identity work is
excluded and unchanged. These counts are established by source and focused query
tests, not production telemetry.

The three-match, 20-round service fixture with simulated 10 ms/query reduced
history from three statements to one, retaining one acquisition. One sampled
history hold was 53.7 ms versus 19.9 ms. In-process Fastify history requests had
three-run medians of 58.3 ms versus 16.2 ms and bodies of 21,313 B versus 622 B.
These simulated database costs are not PostgreSQL or production server timings.

### Verification and release considerations

Focused checks cover ownership, anonymous access, strict query bounds and
serialization, empty/error/partial states, timeout/retry and stale-response
protection, explicit resume/start, deferred details, and fresh SPA return. Real
PostgreSQL checks run the production SELECTs against session-local temporary
tables in the authorized disposable test database, with rollback cleanup. They
verify ownership, state changes, deterministic SQL limiting and fresh history;
they do not benchmark the full migrated schema.

The main release workflow makes web deployment depend on successful API
deployment. API publication emits its commit SHA only after Azure accepts the
verified artifact; a separate successful health check supplies the API origin.
Immediately before web publication, the release guard requires that SHA to match
the web artifact's selected commit and that the frontend API base addresses that
same API. It checks the public OpenAPI compact response schemas and both summary
queries anonymously. The deployed routes must accept the new query parameters
and return `401 UNAUTHORIZED`; the older API returns a validation error. This
uses no credentials, player records or database queries. Missing publication
outputs, API failure, incompatible contracts and exhausted bounded retries block
web publication. Health alone cannot pass this guard.

Both API artifact and deployment filters include the web application's existing
release inputs. A web-only push therefore produces and publishes a fresh API
artifact for the same commit before automatically publishing the frontend. The
normal API database-release protections remain in place, with no seed flags;
web-only releases also incur the normal API recycle. API-only changes still skip
unnecessary web publication. An unexpectedly skipped API publication blocks a
required web publication. The existing main `workflow_dispatch` continues to
force both artifacts through normal validation and release steps.
Custom API aliases are not accepted by this guard: the configured frontend API
base must use the published App Service origin with `/api/v1`.

These release checks establish contract availability and authentication
boundaries, not successful account-specific database reads or running-process
revision identity. Authenticated post-deployment verification remains necessary.
Compare representative account sizes, checking request bodies, query counts/holds,
section readiness, auth, start/resume, archive/detail navigation and state
freshness. An older API rejects the new parameters; the UI reports section errors
rather than silently falling back to expensive requests.

The existing dashboard Playwright heading-focus assertion fails on both the
unchanged frozen main build and this branch: direct entry does not focus its
non-focusable `h1`. That unrelated assertion is retained. New SPA return checks
verify the existing main-content focus behavior.

AI assistance: Codex[GPT-6] implemented, tested, measured and documented this
Workstream 2 change.

## Issue #358 Workstream 3: Live deck detail scoping

Source baseline: `cfdbf8d375f11bd4089a4e4206994a8eda59e2ac` (9 October 2026).
The asynchronous PvP hub already reads compact invitation, active-match and
history projections in parallel with saved decks. It does not hydrate full
matches before opening one. Its two invitation reads retain independent cursors
and authoritative expiry handling. These paths, the existing post-accept fresh
match GET, Live projection/ticket sequence and polling frequencies are unchanged.

Live entry reads six resources, then requests the **entire** owned collection to
resolve five selected-deck cards. The initial queue controls are already usable
independently of those supplementary card details. The narrowly scoped change
adds `deckId` to the existing authenticated `GET /api/v1/cards/collection` read.
It filters current deck membership before projecting moves/effects, requiring
both deck and card ownership to match the authenticated player. Missing,
deleted and another player's decks return the same empty list. Invalid UUIDs
return 400. The response envelope and full card metadata are unchanged.
`unique=true` still selects the newest copy, within the deck if also scoped.

Live passes its freshly loaded selected deck ID. No selected deck means no card
read. Existing artwork fallback, independent detail retry, abort cleanup,
keyboard dialog focus and fresh reads on return remain intact. No summary cache,
prefetch, new endpoint, transaction, index, pool, scheduler or gameplay change is
introduced. Deploy the API support before the frontend; the existing release
workflow publishes both from the same commit in that order. An older API may
reject the new scope; supplementary card details then use their existing error
and retry state rather than blocking queue readiness.

### Measured scope and results

Equivalent optimized Vite `basic-e2e` production builds use the existing synthetic
authentication boundary and local HTTP fixtures. Each build uses a fresh Chromium
context for three runs per device, with cold then cache-warm document entry.
Service workers are blocked. Mobile is 390 × 844, CPU 4× slowdown, 150 ms network
latency and 200,000 bytes/s download; desktop is 1440 × 900, native CPU, 20 ms and
1,250,000 bytes/s. JSON is actually served with gzip and a fixed 35 ms simulated
server delay. The 250-card synthetic collection and five-card deck are identical
between builds. These are **local fixture measurements, not production evidence**.

| Measurement                             |    Before |    After |
| --------------------------------------- | --------: | -------: |
| Live reads excluding identity           |         7 |        7 |
| Live reads including `/auth/me`         |         8 |        8 |
| Collection rows projected               |       250 |        5 |
| Collection JSON body                    | 163,072 B |  2,842 B |
| Collection gzip response body           |   3,621 B |    487 B |
| All sampled Live JSON bodies            | 166,229 B |  5,999 B |
| All sampled Live gzip bodies            |   5,187 B |  2,053 B |
| Mobile cold usable median               |  5,724 ms | 5,871 ms |
| Mobile repeat usable median             |  1,773 ms | 1,642 ms |
| Desktop cold usable median              |  1,053 ms | 1,057 ms |
| Desktop repeat usable median            |    945 ms |   944 ms |
| Mobile cold card-detail-ready median    |  5,748 ms | 5,912 ms |
| Mobile repeat card-detail-ready median  |  1,972 ms | 1,847 ms |
| Desktop cold card-detail-ready median   |  1,089 ms | 1,128 ms |
| Desktop repeat card-detail-ready median |    948 ms |   947 ms |

Collection JSON falls 98.3%, its gzip body 86.6%, and total sampled gzip bodies
60.4%. Transfer figures exclude headers. The mobile collection request median
falls 196 → 178 ms cold and 184 → 172 ms repeat; desktop is essentially unchanged
at approximately 55–57 ms. **No general navigation speedup is demonstrated**:
cold mobile entry became slower in the sample and queue readiness does not wait
for the card response. The repeat difference is not statistical proof.

Five PostgreSQL checks create a new database using the explicitly disposable
`TEST_DATABASE_URL`, apply the real migrations, and remove the database afterward.
The fixture has 250 owned definitions with moves and a legal five-card deck.
After one warm-up pair, three alternating unscoped/scoped service samples show:

| PostgreSQL client measurement           |    Before |    After |
| --------------------------------------- | --------: | -------: |
| Statements / acquisitions per card read |     1 / 1 |    1 / 1 |
| Connection hold median                  |  182.8 ms | 176.7 ms |
| Checkout median                         |  0.062 ms | 0.093 ms |
| Service duration median                 |  183.5 ms | 177.2 ms |
| Serialized card envelope                | 164,943 B |  2,851 B |

These client holds include query round trip, row transfer and parsing, not pure
database execution. No saturated-pool benefit or production server latency is
established. Database and browser fixtures use different metadata, so their
serialized sizes are reported separately. The fixture deliberately represents
many owned copies, not a real player's collection or a normal starter grant.

Unchanged-path controls use the same local server and three samples per device.
PvP first entry follows Live in the same context: the shared shell is warm while
the PvP route is first visited. The following control variation is not attributed
to this change.

| Control median                                        | Mobile before → after | Desktop before → after |
| ----------------------------------------------------- | --------------------: | ---------------------: |
| PvP first lobby entry                                 |      1,594 → 1,732 ms |           943 → 938 ms |
| PvP repeat lobby entry                                |      1,716 → 1,602 ms |           941 → 966 ms |
| Invitation create and four-list refresh               |          647 → 646 ms |           223 → 179 ms |
| Accept click through initial match GET and ready view |      1,119 → 1,184 ms |           864 → 857 ms |
| PvP repeat match entry                                |      1,613 → 1,587 ms |           937 → 930 ms |
| Live initial REST projection displayed                |      1,601 → 1,819 ms |           950 → 954 ms |

PvP lobby remains five reads plus identity, 2,284 JSON bytes. Creation remains one
POST plus four refresh reads, 1,408 bytes. Acceptance remains one POST and one
initial GET, 6,348 bytes. Repeat PvP entry remains identity plus one GET, 3,179
bytes. Live entry remains identity, projection GET and ticket POST, 3,350 bytes.
The Live timing control stubs the transport and measures projection display,
**not WebSocket connection readiness**. Simulated HTTP server waits are not real
API/server timings; invitation and match SQL were not benchmarked again because
their implementations are unchanged.

### Reproduction and regression checks

Use equivalent fixture builds and capture response bodies, Resource Timing and
readiness separately. Retain the benchmark harness and per-run JSON as local
review artifacts; they contain synthetic data only and are not production logs.
The following focused commands exercise the committed test definitions:

```sh
npm test --workspace @wits-world/api -- tests/card-collection.test.ts tests/cards.integration.test.ts tests/cards-coverage-boundaries.test.ts tests/asynchronous-pvp-routes.integration.test.ts tests/live-pvp-routes.integration.test.ts
npm test --workspace @wits-world/web -- tests/cards-client.test.ts tests/live-lobby-boundaries.test.tsx tests/pvp-hub-boundaries.test.tsx
RUN_DATABASE_INTEGRATION_TESTS=true npm test --workspace @wits-world/api -- tests/live-deck-collection.integration.test.ts --maxWorkers=1
npm run test:e2e:battle --workspace @wits-world/web -- --grep-invert 'centres Player Battles'
```

The PostgreSQL test optionally writes safe numeric samples to
`LIVE_DECK_MEASUREMENT_FILE`; keep this output outside version control. Normal
isolated API coverage discovers this gated integration file. No CI configuration
was changed; the battle browser suite was executed separately.

Regressions cover scoped ownership, invalid/unauthenticated requests, complete
metadata parity, missing/deleted decks, fresh membership after edits, empty
entry, delayed card details, HTTP/offline request failures and retry, repeat
entry, responsive layout and dialog focus restoration. Existing PvP tests cover
incoming/outgoing invitations, populated/history navigation and authoritative
match interactions. One unchanged browser assertion expects the obsolete
`Checking battles and challenges…` text; it also fails against the unchanged
baseline build and is not fixed here. A history-flow timeout from the initial
concurrent dev-server run did not reproduce on either production build.

AI assistance: Codex[GPT-6] investigated, implemented, tested, measured and
documented this Workstream 3 slice.

## Issue #358: concurrent request identity initialization

10 October 2026. Local disposable-database comparison against frozen main
`0dcce5db629d4cd5082fcc459f429fb606d4b8ca`; not production performance evidence.
The API already uses a reused max4 shared pool. Unchanged identities require one
fresh authorization statement, including token denial and `FOR KEY SHARE`,
without provisioning writes. The previous in-flight identity lookup nevertheless
made same-player requests wait for the first resolution before starting their
own fresh reads. Four warm simultaneous `/auth/me` requests therefore needed two
database round-trip waves even with four idle clients.

Concurrent requests now attempt that same fresh read immediately. Only a miss
waits for the existing in-flight resolution, then rechecks mutable authorization
and token denial using the stable player ID when available. Existing provisioning
transactions and identity locks remain authoritative. No authorization result is
shared across requests. SQL, authentication, pool limits, idle/acquisition
timeouts, rate limiting, coordination and scheduler behavior are unchanged.

### Equivalent fixture measurements

The harness used actual Fastify routes, local RS256 token verification and current
identity/collection services against a new isolated PostgreSQL database under the
approved disposable test target. Its minimal identity/card schema and empty
collection are not a production workload or a full migration fixture. Fixtures
were removed after each comparison. Request duration uses Fastify injection, not
browser-to-Azure latency. SQL-client/hold durations include transport and server
work; they do not isolate server-only execution.

| Measurement (median, ms unless stated)      | Frozen main | Change  |
| ------------------------------------------- | ----------- | ------- |
| Four same-player requests, all complete     | 339.6       | 172.2   |
| Four distinct-player requests, all complete | 173.3       | 172.0   |
| Same-player request duration (12 requests)  | 338.7       | 170.8   |
| Same-player SQL-client hold per request     | 169.4       | 169.3   |
| Sequential warm `/auth/me` (five requests)  | 169.4       | 174.8   |
| Sequential empty collection (five requests) | 337.1       | 343.5   |
| Empty-pool `/auth/me` (three requests)      | 1,182.8     | 1,222.0 |
| Empty-pool acquisition                      | 1,011.3     | 1,047.9 |
| Three concurrent first-time requests        | 1,040.8     | 1,034.7 |
| First-time burst statements / acquisitions  | 7 / 4       | 9 / 6   |
| First-time burst cumulative client holds    | 1,214.8     | 1,547.1 |

Each four-request concurrency condition had three bursts. The warm same-player
benefit removes an application-level wait, approximately one measured database
round trip; it does not accelerate PostgreSQL connection establishment. Each
steady-state `/auth/me` still uses one statement/acquisition; collection uses two.
Median sequential RS256 verification was 0.4 ms in both builds. Small changes in
sequential and cold timings are not claimed as improvements or regressions.

The first-time trade-off is explicit: each follower whose initial read misses
performs an extra fresh read after waiting. The three-request fixture saved no
meaningful provisioning latency and added two statements/acquisitions and about
332 ms cumulative holds. Normal pool capacity remains max4, with no extra pool or
permanent client. The optimization benefits concurrent unchanged-player reads,
not sign-up/provisioning bursts, and needs independent review of that trade-off.

A separate SELECT-only pool sample observed empty-pool acquisition of
1,024–1,683 ms with a new connection, versus 0.08–0.16 ms for immediate idle reuse.
With all four test clients deliberately held, a fifth checkout waited 87.6 ms
until a controlled release and created no new connection. These controlled
conditions distinguish waiting from empty-pool establishment, but do not split
DNS, TLS, authentication, provider routing or backend connection creation. Existing
production telemetry combines waiting and establishment; no causal link to the
separate gameplay coordination incident is established.

### Focused verification and release gate

Focused identity/authentication tests exercise independent role/denial reads,
delayed and failed leaders, fresh rechecks after misses and recovery. The gated
`player-identity-concurrency.integration.test.ts` uses a minimal isolated real
PostgreSQL fixture for parallel role visibility, exactly one provisioning
transaction/player, deletion row-lock behavior and independent token denial.
Existing native-pool integrations verify queue timeout, release and query-error
recovery. The full migration/deletion-retention suite remains separate.

```sh
npm test --workspace @wits-world/api -- tests/player-identity.test.ts tests/authentication.integration.test.ts tests/authorization.test.ts tests/database-connection.test.ts tests/pool-observability.test.ts tests/request-timing.test.ts --maxWorkers=2
RUN_DATABASE_INTEGRATION_TESTS=true npm test --workspace @wits-world/api -- tests/player-identity-concurrency.integration.test.ts tests/pool-observability.integration.test.ts --maxWorkers=1
```

No production measurements or release occurred. Do not release this slice until
the independent gameplay activity-store correction is merged and production
coordination recovery is verified. After that gate, compare equivalent natural
same-player request bursts, authorization timing, query/acquisition counts,
pool waiting, new connections and failures; separately monitor first-time
provisioning costs. Rollback restores the previous wait placement without a
schema/configuration change. No general endpoint or cold-start speedup is claimed.

AI assistance: Codex[GPT-6] investigated, implemented, tested and measured this
request-initialization slice and documented its limitations.

## Submission stabilization: PvP deck snapshot writes

The 10 October 2026 local comparison uses main revision
`df24854b6a7d20ec47bc91458d49afabfed3d3ca`. Fresh invitation creation and
acceptance each persisted a snapshot header followed by its five cards in two
sequential SQL calls. A data-modifying CTE now returns the inserted header ID to
the card insert in one call. Card identities, source ownership, ordering, JSON,
timestamps, deferred constraints, transaction boundaries and client acquisitions
are preserved. No API, Redis, scheduler, pool, timeout or migration changes are
required. Idempotent replays and battle turns do not execute this snapshot write.

### Comparable disposable measurements

The real service runs against temporary local PostgreSQL 17/PostGIS. A frozen
copy of the old two statements replaces only the combined snapshot query in the
baseline condition. Fixture setup and parity assertions are outside the timed
service calls. Connections/plans are primed, and baseline/change ordering
alternates across five fresh journeys per condition. Both participants' five
persisted cards and header fields are checked against the write parameters.

| Median measurement                | Original | Combined |
| --------------------------------- | -------- | -------- |
| Invitation SQL statements         | 18       | 17       |
| Acceptance SQL statements         | 16       | 15       |
| Snapshot statements, either role  | 2        | 1        |
| Acquisitions per operation        | 1        | 1        |
| Local invitation service time, ms | 27.1     | 25.1     |
| Local acceptance service time, ms | 32.7     | 31.0     |
| Local invitation client hold, ms  | 26.9     | 25.0     |
| Local acceptance client hold, ms  | 32.5     | 30.9     |
| Local invitation SQL-client, ms   | 26.6     | 24.7     |
| Local acceptance SQL-client, ms   | 31.8     | 30.3     |

These small local timing differences are not a general latency claim. Counts
include BEGIN/COMMIT; the fixture does not configure the production Trust gate or
Redis producer guard, so its totals are not production request totals. Checkout
medians were 0.03–0.05 ms with warm idle reuse; connection establishment and
saturated-pool queueing are not improved by this change.

A second equivalent comparison adds an explicit 25 ms simulated delay to every
real SQL round trip, equally in both conditions:

| Median simulated-transport measurement | Original | Combined |
| -------------------------------------- | -------- | -------- |
| Invitation service time, ms            | 572.8    | 551.4    |
| Acceptance service time, ms            | 514.3    | 481.9    |
| Invitation client hold, ms             | 572.7    | 551.1    |
| Acceptance client hold, ms             | 514.1    | 481.7    |
| Invitation SQL-client, ms              | 572.1    | 550.3    |
| Acceptance SQL-client, ms              | 513.2    | 480.8    |

Timer scheduling and real query variability are included. This demonstrates the
saved serialized round trip under controlled delay; it is not measured Azure to
Neon latency, server-only execution time, HTTP latency or production speedup.

### Correctness, reproduction and rollback

The real PostgreSQL persistence suite passes 48 tests, including frozen-query
parity for both roles, real card-constraint failures with no partial snapshot or
receipt left behind, successful retry, existing concurrent acceptance, expiry,
receipt freshness, privacy, hidden state, legal actions and rollback regressions.
The fixture's optional measurement case runs only when an output path is supplied;
normal database CI still runs the parity/rollback cases and existing strict query
count checks.

```sh
RUN_DATABASE_INTEGRATION_TESTS=true PVP_SNAPSHOT_MEASUREMENT_FILE=/temporary/review/snapshot-measurements.json npm test --workspace @wits-world/api -- tests/asynchronous-pvp-persistence.integration.test.ts --maxWorkers=1
```

Use the authorized disposable `TEST_DATABASE_URL` and an independently different
development URL as required by the database-test guard. Keep measurements outside
the repository. No production fixture, account or gameplay mutation was used.

After a separately approved release, compare equivalent fresh invitation and
acceptance request phase counts, SQL-client/transaction time, pool checkout,
errors and retries. Expect one fewer statement only where a new deck snapshot is
written; unchanged replays/turns are controls. Do not attribute all request timing
changes to this write. Rollback restores the two statements in the same existing
transaction; no schema, data repair or configuration change is needed.

AI assistance: Codex[GPT-6] investigated, implemented, tested and measured this
snapshot-write slice and documented its limitations.
