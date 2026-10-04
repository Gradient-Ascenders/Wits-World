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

For acceptance and match-detail GET diagnostics, see
[PvP request phase timing](./pvp-request-phase-timing.md). It documents the
additional server-only fields, overlapping spans, privacy limits and controlled
deployment/measurement procedure. Detailed timing is observability, not a claim
of a latency improvement or deployed instrumentation.

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
