---
title: 'Loading policy and coverage'
description: Loading boundaries, long-wait recovery, and the maintained route inventory.
---

# Loading policy

Loading feedback belongs to the smallest region whose usable content depends on
the operation. Keep the app navigation and any independently usable controls
visible. First visits may use a page data gate when no safe page content exists;
optional reads, pagination, previews, and mutations use their own region or
control. Do not wait for optional work before exposing confirmed content.

Page preparation uses one consistent, centered animated seal for module loading,
identity confirmation, and required first reads. Secondary reads use quiet, stationary
placeholders through `RegionLoadingState`, including Author and exploration
regions; their status remains available to assistive technology. Quest markers
accompany visible regional feedback and slow-load recovery. Challenge-start
and location guidance remain visible immediately. Both branded animations
respect the player's reduced-motion preference.

The shared primitives use `useLoadingPhase` from
`apps/web/src/components/loading-policy.ts`. Brief module preparation and
remaining decorative indicators are delayed **150 ms**; visible regional status
and recovery appear at **8 seconds**. There is no minimum wait or ceremonial
completion animation. Completed work replaces its loading state immediately.
These are product thresholds tested with controlled timers; they are not
measured production latency percentiles.

Explore shows one page wait while its first event read is pending. The map starts
in parallel at its actual dimensions beneath that wait. Confirmed events reveal
the explorer immediately, even if the optional map is still loading; the map
does not introduce a second loading card. Map errors retain their list fallback
and retry control. Subsequent reads retain their confirmed content.

`LoadingRecovery` offers a safe way home and saved offline events. Supply
`onRetry` only for a read or an existing operation-specific recovery path. Leaving
a view does not cancel a submitted action on the server. Never blindly retry a
mutation, invent percentages or an ETA, or reveal protected content while identity
is unresolved. The current-player identity read, including token retrieval, has
a **20-second** bound and aborts into the existing retry/sign-in error state.

Busy confirmation dialogs use `ActionLoadingFeedback`: after 8 seconds, its
keyboard-accessible Home link lets the player leave the wait. Submission stays
disabled, and leaving neither cancels nor confirms the server action. Author
navigation still follows the existing draft guard.

Before React mounts, document boot uses branded static HTML and external
`boot.css`. At **8 seconds**, CSS exposes native reload, home, and saved-event
links even if the bootstrap module never loads. The pure-DOM `boot-recovery.ts`
helper updates the status immediately when the application-module import fails.
Its 8-second timer and the CSS deadline intentionally remain independent: recovery
must not depend on the module whose delivery may have failed. This static gate
does not wait for identity or page data and disappears when React mounts.

After React mounts, the app-wide startup overlay is reserved for the return from
sign-in. Ordinary route module loads and reads use the mounted app shell. A module-load failure is
an error with retry/navigation, rather than an endless Suspense fallback.
Session readiness settles the startup overlay independently of route-module
readiness, so a rejected module's recovery remains accessible. Public Home and
saved offline destinations can open while session restoration is still pending.

Saved-attempt synchronization runs in the background. Its progress, failures,
cancellation, and retry controls belong on Saved Events and saved-attempt pages.
The global offline notice only offers saved-event access when disconnected.

One polite status owns each active operation. Keep recovery buttons outside its
live text, mark the affected content busy when useful, and avoid announcing each
individual result in a concurrent batch. Do not move focus just because a loader
appears or completes. Existing dialog traps, pagination/result focus, error
focus, and reduced-motion preferences remain authoritative. CSS motion is
decorative and never the only indication of progress.

## Coverage inventory

The tables cover the current `App.tsx` switch and `author-routing.ts` parser.
Update them when adding a route or asynchronous workspace. Classifications are
**gate** (required identity/module/first page data), **region** (independent read),
and **action** (a submitted operation or its reconciliation). “Shared” means the
appropriate loading primitive supplies the 8-second explanation and escape;
existing error states retain their own retry and sign-in actions. Local action
feedback deliberately uses operation-specific recovery instead of a generic
mutation retry. The retained-read contract and resource matrix below implement the revisit/refresh
companion (#357). Initial identity and authoritative action gates still apply.

| Route                                                        | Trigger and classification                                                                                  | Context retained                                                                                      | Announcement and slow recovery                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| All lazy routes                                              | Navigation module import; gate                                                                              | App shell/navigation, route-specific destination label                                                | Shared route status; module error offers reload/navigation                                                                    |
| All protected routes                                         | Auth0/current-player confirmation; gate                                                                     | Shell; protected data stays hidden                                                                    | Single identity status; shared slow escape and bounded player read, then retry/sign-in                                        |
| Sign-in callback                                             | Auth0 callback + identity readiness; gate                                                                   | One startup overlay; protected app is inert until identity settles; route module has its own boundary | Single startup status; slow reload/home/offline recovery; no minimum display duration                                         |
| `/`                                                          | Home module; gate                                                                                           | Shell; home content needs no extra data gate                                                          | Route status only                                                                                                             |
| `/explore`                                                   | Discovery, nearby location, trail/territory detail, map readiness; regions                                  | Map/list/detail boundaries are independent; current controls stay available where safe                | Exploration statuses and shared recovery; permission/location errors have specific controls                                   |
| `/offline`                                                   | IndexedDB saved-event read; region; sync/download are actions                                               | Offline heading, saved-event controls and sync status                                                 | Shared read status; sync/download use local feedback and existing queue/error recovery                                        |
| `/offline-attempts/:clientAttemptId`                         | Local attempt restoration; region; answer save is action                                                    | Offline challenge context; saved answers remain device-owned                                          | Shared restoration status; local save feedback, validation and specific retry                                                 |
| `/challenge-attempts/:attemptId`                             | Required attempt/question data; gate; answer/result reconciliation is action                                | Shell initially; active challenge/confirmed saved-answer context during actions                       | Shared initial read; result preparation says answers are saved and uses existing authoritative result recovery                |
| `/collection`                                                | Owned cards; gate; starter options independent region; starter claim action                                 | Shell and collection navigation; claim/choices have their own boundary                                | Shared card/choice reads; starter claim uses local status and specific recovery                                               |
| `/collection/evolutions`                                     | Collection read gate, then concurrent preview regions                                                       | Header always; confirmed candidates appear progressively with search/filter/pagination                | One inline scan status with safe read retry; no empty conclusion until all checks finish; dialog suppresses scan announcement |
| `/collection/trades`                                         | Open/history inbox read gate; pagination region                                                             | Trade navigation, existing rows during pagination                                                     | Shared initial read; local load-more feedback, page error retry                                                               |
| `/collection/trades/new`, `/collection/trades/:tradeId/edit` | Required collection/trade/deck read gate; draft submission action                                           | Shell initially, draft and confirmation during submission                                             | Shared read; local validation and existing submission-ID recovery                                                             |
| `/collection/trades/:tradeId`                                | Trade detail read gate; collection refresh region; accept/cancel action                                     | Trade detail during refresh/confirmation                                                              | Shared detail read; local refresh/action status with authoritative recovery                                                   |
| `/collection/decks`                                          | Saved deck + owned-card read gate; save/delete/start-match actions                                          | Collection navigation, editor/confirmation during actions                                             | Shared read; operation-specific status/retry, including lazy match API import failure                                         |
| `/decks`                                                     | Redirect to `/collection/decks`                                                                             | Destination policy applies                                                                            | No independent wait                                                                                                           |
| `/leaderboard`                                               | Standings query/page/filter region                                                                          | Leaderboard title/filter controls                                                                     | Shared standings status; error retry/sign-in; pagination focuses results                                                      |
| `/profile`, `/players/:playerName`                           | Showcase read gate; standings/card picker regions; profile/avatar save actions                              | Shell initially; editor, crop/picker and unrelated sections during local work                         | Shared profile/standings/picker reads; local crop and save feedback with specific recovery                                    |
| `/matches`                                                   | Current CPU match + selected deck region; recent results/player battles regions; start action               | Dashboard and other battle modes usable immediately; CPU readiness remains authoritative              | Shared CPU status; combined CPU/deck read times out after 20 seconds with local retry; retry preserves other regions          |
| `/matches/:matchId`                                          | Required CPU state gate; turn/forfeit and reconciliation actions                                            | Current board during actions                                                                          | Shared first read; battle action feedback, submission-safe reconciliation/retry                                               |
| `/matches/history`                                           | First history page gate; subsequent page region                                                             | Existing history rows during pagination                                                               | Shared first read; local load-more status and page error retry                                                                |
| `/matches/live`                                              | Required lobby/decks gate; season profile, standings, territory and fan-card details regions; queue actions | Lobby playable independently of optional profile/artwork/detail reads                                 | Shared read statuses; queue deadlines, proposal feedback and server recovery own actions                                      |
| `/matches/live/:matchId`                                     | Live connection/snapshot gate; reconnect/settlement regions; turn/resign actions                            | Existing board during reconnect; connection stage has a lobby exit                                    | Live feedback plus existing recovery controls; settlement uses shared region status; server deadlines remain visible          |
| `/matches/pvp`                                               | Required hub data gate; poll/refresh/pages regions; invite/respond/cancel actions                           | Chosen tab/draft/confirmed rows during polling and actions                                            | Shared first read; local refresh/page/action feedback and authoritative submission recovery                                   |
| `/matches/pvp/:matchId`                                      | Required match state gate; turn/swap/forfeit and reconciliation actions                                     | Existing board during submitted actions                                                               | Shared first read; local busy/action status and operation-specific reconciliation                                             |
| `/account`                                                   | Identity gate, optional API key region; reauth/recovery/deletion actions                                    | Account/settings and confirmation context                                                             | Identity status; shared key read feedback; sensitive actions use explicit confirmation and specific recovery                  |
| `/author/*?`                                                 | Role check + console module gate                                                                            | Shell; role-protected workspace hidden                                                                | Author shared access status, existing forbidden/sign-in recovery                                                              |
| `/about`                                                     | Redirect to `/`                                                                                             | Home policy applies                                                                                   | No independent wait                                                                                                           |
| Unmatched routes                                             | Synchronous not-found view                                                                                  | Shell/navigation                                                                                      | No data wait                                                                                                                  |

## Author workspace boundaries

The sidebar and console workspace remain mounted after the role gate. Card
catalogue data is shared by card/event editing, but does not delay unrelated
workspaces. Initial workspace reads and report/filter changes use the quieter
Author primitive rather than the player startup seal.

Question detail/new/edit URLs include both an event ID and a challenge ID.
`/author/events/:eventId/questions` is the event-level list alias, not a prefix
for question-detail URLs. The parser currently sends unknown Author workspace
paths to the events list; the app-wide not-found route does not handle them.

| Author route or nested mode                                                                                                                                                                                                                                                         | Trigger and classification                                                                           | Context retained                                | Announcement and slow recovery                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/author`, `/author/`                                                                                                                                                                                                                                                               | Redirect to events                                                                                   | Console sidebar                                 | No independent wait                                                                            |
| `/author/events`, `/author/events/new`, `/author/events/:eventId/edit`                                                                                                                                                                                                              | Event catalogue/details regions; create/update actions                                               | Sidebar, event controls/editor as available     | Shared authored-event status; existing validation/save recovery                                |
| `/author/events/:eventId`, `/details`, `/review`, `/history`, `/challenge`                                                                                                                                                                                                          | Event/challenge details and review-history regions                                                   | Event workspace/tabs and unrelated controls     | Shared challenge/history statuses; local submission/review actions                             |
| `/author/events/:eventId/challenges/:challengeId`, `/review`                                                                                                                                                                                                                        | Selected challenge and review regions                                                                | Event workspace and selected tab                | Shared challenge status; explicit author review/save recovery                                  |
| `/author/events/:eventId/questions`                                                                                                                                                                                                                                                 | Event question region                                                                                | Event navigation                                | Shared questions status and existing reload                                                    |
| `/author/events/:eventId/challenges/:challengeId/questions`, `/author/events/:eventId/challenges/:challengeId/questions/new`, `/author/events/:eventId/challenges/:challengeId/questions/:questionId`, `/author/events/:eventId/challenges/:challengeId/questions/:questionId/edit` | Question list/details regions; create/edit/review actions                                            | Event/challenge navigation and editor draft     | Shared questions status; existing draft validation/action recovery                             |
| `/author/cards`, `/author/cards/new`, `/author/cards/:cardId`, `/edit`, `/review`                                                                                                                                                                                                   | Shared card catalogue and artwork preview regions; save/review actions                               | Sidebar, draft/details and preview dimensions   | Shared card/artwork status; failed catalogue/preview has existing recovery                     |
| `/author/campaigns`, `/new`, `/:campaignId`, `/edit`, `/review`, `/history`                                                                                                                                                                                                         | Campaigns/available members/history regions; author actions                                          | Sidebar and campaign editing/review context     | Shared campaign/history statuses; existing explicit reload/save recovery                       |
| `/author/review`                                                                                                                                                                                                                                                                    | Pending-submission region; review decision action                                                    | Sidebar and review context                      | Shared submissions status; existing queue reload/action recovery                               |
| `/author/player-review`, `/:caseId`                                                                                                                                                                                                                                                 | Case queue, selected detail, evidence collections and additional pages; regions; adjudication action | Sidebar, selected case and independent evidence | Shared queue/detail/evidence status; load-more local feedback, authoritative decision recovery |
| `/author/analytics`, `/locations`, `/questions`, `/rewards`                                                                                                                                                                                                                         | Report/filter/date-region requests                                                                   | Sidebar and report selection/filter controls    | Shared report status; explicit report reload/error recovery                                    |
| `/author/placement`                                                                                                                                                                                                                                                                 | Event placement and publication-history regions; placement/publication actions                       | Sidebar, map/placement context when available   | Shared placement/history statuses; specific save/publication recovery                          |

## Cross-cutting and local states

| Surface                                     | Trigger and classification                                                      | Context and recovery                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document boot                               | HTML delivered before React/application modules; gate                           | Static branded HTML and external CSS; native recovery after 8 seconds survives bootstrap failure; pure-DOM helper exposes module errors immediately  |
| Shell account control and home CTA          | Session restoration; identity gate on the control                               | Public content/home/navigation remain usable; protected gate owns access/error recovery                                                              |
| Player Name setup                           | Required account name; action                                                   | Naming form and validation remain visible; existing name conflict/sign-in/retry flow owns completion                                                 |
| Card evolution dialog                       | Preview read region, evolution submission and collection reconciliation actions | Focused card transaction stays mounted as collection changes; server preview/result owns eligibility; retry refresh never submits another evolution  |
| Trade/Author/account confirmation dialogs   | Submit/accept/review/delete; actions                                            | Keep confirmation and trap semantics; long feedback does not confirm a result or blindly retry a mutation                                            |
| Profile picker/crop/avatar                  | Owned-card read region; local image preparation and upload actions              | Picker read uses shared status/retry; crop can be abandoned, image preparation/error is local; upload/save uses existing profile validation/recovery |
| Developer API access                        | Key read region; create/revoke actions                                          | Shared read status; keys and confirmations use their own validation/recovery                                                                         |
| Offline navigation and saved-attempt queue  | Online return/manual sync; action/reconciliation                                | Sync runs in the background; progress and recovery stay on saved-event/attempt pages. Global feedback only links to saved events when disconnected   |
| Service worker update                       | Background registration/version check                                           | No takeover or blocking status; automatic replacement waits for a safe public Home boundary, no focused draft field or active saved attempt          |
| Lazy module/render error                    | Import/render failure; terminal error                                           | Error boundary owns reload/home/saved-event recovery; a failed module is never called ready                                                          |
| Home challenge demo and status emoji search | Local synchronous interaction/filtering                                         | No network wait; their instructional/result status is not a loading gate                                                                             |

## Intentional local states and verification limits

Pagination buttons, avatar preparation, downloads/sync, and submitted
battle/author/account actions can show local textual feedback without taking over
the page. Existing
content/navigation provides the escape; errors retain operation-specific retry.
Image `loading="lazy"` is a browser fetch hint, not an app-level loading state.
Map initialization, live connection retries and ranked queue waiting are explicit
state machines with their own errors/deadlines; a longer wait never fabricates
eligibility, readiness or a terminal outcome.

Verification must cover fast completion, slow recovery, abort/unmount, protected
identity timeout, lazy-route errors, and progressive confirmed evolution content.
Use controlled timers/deferred responses and desktop/mobile browser fixtures,
including reduced motion, and record which checks actually ran. Actual
screen-reader speech, 200% text scaling, keyboard focus at every boundary, and
production percentile timing need explicit verification; DOM assertions and
fixture screenshots alone do not certify them.

## Controlled verification evidence

Environment snapshot: Arch Linux, Node **24.14.1**, npm **11.19.0**, Chromium
**152.0.7977.82**; branch `polish/loading-screens`, base commit `3ab2588`.

Run the loading browser fixtures from the repository root:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" \
  npm exec --workspace @wits-world/web -- playwright test \
  --config playwright/loading.config.ts
```

The executable override is optional when Playwright's bundled Chromium is
installed. The config starts the existing `basic-e2e` app with mocked API and
authentication; it does not require a real account or publish a submitted action.

The initial #356 full regression run used two workers and a 15-second test harness
limit. An earlier default 8-second run timed out in the existing campaign picker
interaction; an isolated diagnostic completed its assertions. This harness
limit does not change the app's 8-second recovery or 20-second read deadlines.
The eight browser fixtures passed before the final busy-dialog Home link; the
final full suite and nine focused loading/modal tests cover that keyboard exit.

The subsequent `/matches` fix moves CPU preparation into its own card and bounds
the combined CPU/deck read, including token and response-body waits, at 20 seconds.
Its CPU-only retry leaves other battle regions intact and ignores late cancelled
responses. The updated code passed 145 tests across the match/deck clients and
match/deck/live/PvP pages, plus both mobile/desktop stalled-CPU browser fixtures
(30.1 seconds). Type-check, scoped ESLint, and production build passed. Run the
browser command above with `--grep 'stalled CPU'` for those two fixtures. The
earlier full-suite count below predates this follow-up.

| Check                                        | Observed result and limit                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web regression suite                         | 70 Vitest files passed with 885 tests in 340.60 seconds, plus 3 server tests. From `apps/web`, run `npm exec -- vitest run --maxWorkers=2 --testTimeout=15000 && node --test server.test.mjs`. The final focused loading/modal check passed all 9 tests.                                                                                                      |
| Loading browser fixtures                     | All 8 tests passed in 1.1 minutes: slow collection at mobile/desktop widths, callback identity timeout, Author slow region/reflow, rejected destination module, rejected app entry, failed bootstrap script, and fast/reduced-motion completion. The fixture harness allows 30 seconds for cold Vite transforms; controlled clocks own app transition checks. |
| Rendered inspection                          | Mobile 390×844, desktop 1440×900, and Author 1440×1000 inspected. The 720×500 reflow fixture also verifies the Home link remains reachable and unobscured after scrolling; mobile native boot recovery and reduced-motion keyboard focus were inspected.                                                                                                      |
| Documentation navigation                     | All 5 docs tests passed, including the 3 sidebar coverage tests; sidebar ESLint passed.                                                                                                                                                                                                                                                                       |
| Actual browser zoom and screen-reader speech | Unverified. A reflow viewport checks layout response and does not certify actual 200% browser zoom or spoken announcements.                                                                                                                                                                                                                                   |
| Production timing                            | Unmeasured. Controlled delays validate policy transitions and safe recovery, not real p50/p95/p99 latency.                                                                                                                                                                                                                                                    |

## Retained reads and revisits

Use `UpdatingIndicator` beside mounted confirmed content, rather than replacing
that content with `PageLoadingState`. Pass `active`, an operation-specific `label`,
`error` after a failed update, and a read-only `onRetry`. `previous` explicitly
identifies a previous query/page result; describe the displayed response's period
and pagination separately from the requested filters. A failed update never
confirms the requested query or mutation. Keep errors local, preserve empty
confirmed results, and do not infer an empty requested result until its read
finishes. The marker follows the same 150 ms/8-second policy. Quiet polling uses
`announce={false}` so it does not continually interrupt screen readers.

Refreshes preserve mounted headings, results, filters, pagination, draft fields,
inspection dialogs, focus, and scroll by keeping their components mounted. Focus
moves only for the existing explicit result/error or dialog completion path,
after reconciliation settles. Changing an actual record/owner/match resets its
resource; a newly selected query may retain the prior query only with the explicit
previous-result label. Author navigation still uses its unsaved-draft guard;
navigating away intentionally discards local editor state after that guard. This
is not persistent draft storage or a general route keep-alive system.

There are two opt-in read stores, with no new dependency or persistent account
cache:

- `CollectionReadProvider` holds one owned-card snapshot, at most 5,000 cards,
  for two minutes. `SessionCollectionShell` scopes it to API URL, confirmed player
  ID and role. Binding/storage invalidation clears it and prevents late reads
  from repopulating the invalidated store. Collection ownership mutations clear
  it. Returning to Collection revalidates immediately; starters and evolution
  actions require the fresh read. The snapshot only accelerates presentation.
- `AuthorRetainedReads` lives within the Author console, holds at most 40 entries
  for 60 seconds, and scopes keys to each resource/query/page. Leaving the console,
  changing API/player/role, or losing access clears it. Request generations reject
  superseded and revoked reads. Query groups can show previous results; a
  different event/challenge/case does not inherit another record's data. Revisits
  always revalidate, lifecycle controls require current reads, and reconciliation
  invalidates relevant snapshots.

`ProtectedRoute` also keys mounted protected children by confirmed player ID and
role. Unresolved identity hides protected routes; no snapshot bypasses that gate.
Authorization loss clears protected snapshots instead of retaining a read-only
copy. Mutations retain their original transaction identity/expected version, never
replay an obsolete intent, and do not treat leaving or aborting a browser read as
cancellation of server work.

CPU/PvP/challenge/eligibility, new trade/detail transactions, and new season
readiness deliberately fetch authoritative data on navigation. Their stale
snapshots cannot enable legal actions, accepting offers, joining queues, rewards,
or eligibility. Short-lived descriptive retention is appropriate for the two
bounded stores above; broader account or route caching has no measured benefit
here and is intentionally absent. Most other route revisits therefore use their
existing first-read boundary, while refreshes within the mounted route retain
safe content. This distinction is explicit in the matrix.

## Route/resource refresh matrix

This matrix supplements the initial-load inventory above and covers `App.tsx`,
`author-routing.ts`, nested resources and shared surfaces. **Gate** means no safe
snapshot can authorize the operation; **mounted** means retention is restricted
to the currently mounted resource; **store** means the bounded revisit store
above. All async rows retain the shared shell unless identity forbids access.
Verification names identify frontend fixture checks, not live service evidence.

| Route/resource                                                      | First load and revisit                                                        | Refetch and retained content/indicator                                                                                | Freshness/reset and error recovery                                                                                                               | Verification                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Home, About redirect, Not Found, configuration                      | Static/module boundary; data retention not applicable                         | Navigation stays available; no independent data update                                                                | Existing module/config error recovery; About redirects Home                                                                                      | application, loading-policy                                |
| Lazy routes, sign-in callback, current player, name setup           | Identity/module gate; no protected reuse                                      | Shared preparation/recovery; public Home/offline remain accessible                                                    | Confirmed API/player/role changes reset protected children; 20s identity bound                                                                   | authentication, auth-loading, protected-state-retention    |
| Explore events/map                                                  | Initial region; mounted revisit/refetch only                                  | Confirmed event list including empty results stays visible; local update/retry; map independent                       | Abort old reads; auth failure clears list; map/list unavailable paths remain independent                                                         | explore-page, exploration, map-provider                    |
| Explore Nearby                                                      | Location/read region; mounted                                                 | Previous confirmed nearby list retains inspection and focus during refresh/failure                                    | Results are descriptive; start still requires server eligibility; new location latest-wins                                                       | explore-page                                               |
| Explore Trails/list/detail                                          | List region; new trail detail gate                                            | List/query keeps previous confirmed results with update/retry; detail has own read boundary                           | New trail ID clears prior detail; auth failure clears list; abort cleanup                                                                        | trail-discovery                                            |
| Explore Territories/list/detail/history/standings                   | Independent regions; mounted                                                  | Partial refresh retains failed sections and independently reveals successful sections; honest stale timestamp         | Zone/season/identity reset; authorization clears; per-section retry; empty list retained                                                         | territory-experience, use-territory-discovery              |
| Location permission/watch/event eligibility                         | Action/read gate; no eligibility cache                                        | Map/list remain mounted; specific location/check status                                                               | Hidden-tab watch pauses; fresh server eligibility required, stale results cannot start                                                           | explore-page, browser-location                             |
| Challenge attempt/question/result/rewards                           | New attempt gate                                                              | Existing confirmed answer/attempt retained during submission and result reconciliation                                | Attempt ID/identity resets; original submission IDs and authoritative deadlines/results preserved                                                | challenge-page, challenge-rewards, challenge-deadline      |
| Collection cards/inspection                                         | Initial gate; **store** revisit                                               | Confirmed cards stay mounted during reread/failure; update/retry; inspection/filter state retained in mounted route   | 2-minute API/player/role snapshot; invalidate ownership mutations; new read required for actions                                                 | collection-page; loading-policy browser revisit            |
| Collection starter options/claim                                    | Independent region; mounted                                                   | Confirmed choices retained during retry; claim/dialog retained                                                        | Claim disabled while stale; original submission identity; successful/already-claimed result revalidates cards before focus                       | collection-page                                            |
| Collection evolutions/availability/dialog                           | Fresh preview regions even on revisit                                         | Progressive confirmed candidates retain checking state; one scan indicator; focused transaction not replaced          | Per-definition latest-wins; no empty conclusion before batch settles; collection freshness gates action                                          | collection-evolutions, collection-page                     |
| Decks and `/decks` redirect                                         | Ownership+saved-deck gate on revisit                                          | Mounted cards/decks/editor remain through retry/failure; update/retry                                                 | Fresh read required to save/select/delete/start; draft composition/name retained; server rule validation                                         | decks-page                                                 |
| Trade inbox/open/history/pagination                                 | Initial transaction-list gate; mounted                                        | Rows/tab/paging retained; failed load-more retries same page; update/retry                                            | Auth failure clears; failed page does not advance confirmed paging                                                                               | trade-pages                                                |
| Trade new/edit/preview/confirmation                                 | New trade/resource gate                                                       | Same-ID reread keeps recipient/search/draft selections/confirmation                                                   | Original expected version and submission ID; stale read locks submit; changed trade ID resets                                                    | trade-pages                                                |
| Trade detail/collection reconciliation                              | New-ID gate; mounted same-ID refresh                                          | Confirmed offer/dialog retained with update/error/retry                                                               | No accept/cancel from stale read; resource deletion/auth loss clears; ownership mutation invalidates collection snapshot                         | trade-pages                                                |
| CPU entry/deck/recent results/player battles                        | CPU/deck authority region on revisit; independent summary regions             | Dashboard/mode navigation remain; 20s CPU readiness bound                                                             | Start/resume requires current entry/deck; retries only failed region                                                                             | matches-pages; loading-policy browser CPU                  |
| CPU detail/actions/history                                          | New match gate; mounted board reconciliation                                  | Current board retained during action/recovery; paginated history retains rows                                         | Match/version/submission identity; no stale legal-action replay; history paging error/retry                                                      | matches-pages, matches-pages                               |
| PvP hub/inbox/history/search                                        | New hub read; mounted                                                         | Background collections retain tabs/rows/paging; local failure/retry                                                   | Forced-poll abort guarded; current deck/invitation/action version required                                                                       | pvp-pages                                                  |
| PvP detail/turn/deadline/forfeit                                    | New match gate; mounted                                                       | Background polling/reconnect retains board; mutation/dialog retained                                                  | One refresh at a time, visibility/deadline handling unchanged; server legal actions only                                                         | pvp-pages, pvp-pages                                       |
| Live lobby/queue/proposal/season/decks                              | Fresh readiness gate; season rollover intentionally resets                    | Queue/proposal retain during serialized polls; descriptive sections have independent updates                          | Poll and heartbeat do not overlap; due heartbeat is deferred; new season cannot inherit old queue eligibility                                    | live-pages                                                 |
| Live standings/watch/profile/territories                            | Independent season-bound regions                                              | Paging/descriptive results retained where the season matches; local retry                                             | Different season/resources reset; watch selection cannot invent match authorization                                                              | live-pages                                                 |
| Live participant/spectator/reconnect/settlement                     | New match gate                                                                | Same-match projection retained while reconnecting, actions gated; settlement remains server-owned                     | New match clears projection/pending; socket/request epochs reject late callbacks; spectator privacy preserved                                    | live-pages, live-client                                    |
| Own/other profile/showcase/progression/standings                    | New owner gate; mounted                                                       | Same-owner reread retains showcase/editor/dialog; standings query/page keeps prior results explicitly labeled         | Different player name clears prior profile; auth loss clears; latest request wins; period/page labels from displayed response                    | player-showcase, profile-page                              |
| Favourites/card picker/profile editor/avatar crop                   | Local region/action; catalogue fresh on editor entry                          | Draft/selection/inspection remains local; preparation never hides unrelated profile content                           | Ownership validated on save; image blob/crop errors recover locally; dialog focus trap retained                                                  | player-showcase, player-showcase                           |
| Account/preferences/recovery/deletion                               | Account derives confirmed player; static preferences retention not applicable | Account/draft context retained during actions; no mutation replay                                                     | Reauthentication/deletion use existing authority and sign-out binding clear; accessibility settings persist by existing policy                   | account-page, accessibility-preferences                    |
| Account developer keys/create/revoke/secret                         | Fresh protected metadata region; secrets never cached                         | Confirmed metadata and one-time secret survive unavailable reconciliation; update/retry; draft/focus retained         | Bounded latest-wins read; stale mutation controls locked; authorization clears metadata/secret; pending refresh cannot permanently lock mutation | developer-api-retention, account-page                      |
| Author shell/navigation/cards catalogue                             | Role gate; **store** within console                                           | Shell/catalogue retained through refresh; update/error/retry; editor state preserved                                  | 60s/40-entry scope; global revoked-read generation; lifecycle actions require fresh confirmation                                                 | author-console, author-retained-reads                      |
| Author Events list/new/edit/lifecycle                               | **Store** list revisit; editor remains local                                  | Confirmed events/search/editor retained; compact updating                                                             | Abort latest-wins; server conflict reconciliation; draft guard; new event ID does not inherit editor                                             | author-console, author-console                             |
| Author challenges/details/review/history                            | Event/challenge-scoped **store**                                              | Confirmed challenge/form retained while rereading; questions independent                                              | Different event/challenge ID resets reads; refresh does not overwrite draft; lifecycle freshness lock                                            | author-console, author-console                             |
| Author questions/list/new/detail/edit/options                       | Challenge-scoped **store**                                                    | Confirmed question list/editor/options stay mounted during refetch                                                    | Draft/accepted answers protected by Author role; new question ID resets; optimistic mutation reconciliation remains authoritative                | author-console, author-curation                            |
| Author Cards list/detail/edit/review/lifecycle                      | Console catalogue + record boundary                                           | Catalogue and dirty editor remain mounted through refreshed availability; updating                                    | Permission/record loss clears; server conflict does not silently overwrite draft                                                                 | author-console, author-curation                            |
| Author Campaigns list/new/detail/edit/review/history/content picker | **Store** list; local editor and picker                                       | List/query/history retains previous confirmed content; draft/membership selections retained                           | New campaign ID resets; immutable expected version; lifecycle/membership reconciliation invalidates reads                                        | author-curation, author-console                            |
| Author Content Review queue/inspection                              | Query-scoped **store**                                                        | Previous-query results explicitly labeled during filters/pagination; inspection retained where safe                   | Fresh queue for decision, own-submission rule remains server authority; permission failures revoke store                                         | author-console, author-retained-reads                      |
| Author Player Review queue/case/evidence/appeal                     | Query/case-scoped **store**                                                   | Queue/page and same-case evidence retained with update/retry                                                          | Different case cannot inherit evidence; read generations; fresh decision authority, role/revocation clears                                       | trust-review, author-retained-reads                        |
| Author Analytics overview/locations/questions/rewards               | Report/query/page **store**                                                   | Prior same-report query remains labeled until requested view confirms; report errors local; other reports independent | Previous-result label and confirmed response page identify displayed rows; new report resets; auth loss clears; latest-wins                      | analytics-workspace; Author retained-query browser fixture |
| Author Placement/map/sites/history                                  | Existing retained regions + scoped reads                                      | Independently confirmed placement/history stays mounted during update                                                 | Server rotation/assignment authority unchanged; independent retry; map failure does not block text                                               | event-placement-workspace                                  |
| Offline saved events/download/index                                 | IndexedDB region, player-bound persistence                                    | Saved index retains while sync-driven reads run; local update; per-attempt sync status                                | Reads filter current binding; packs validity checked; pending answers retained, rewards provisional until API receipt                            | offline-store, offline-sync                                |
| Offline active attempt/sync/receipt                                 | Local attempt restoration gate                                                | Saved answers preserved; per-attempt sync/error/retry beside content                                                  | Player binding/attempt scope; sync busy lock, no duplicate submission; original attempt identity                                                 | offline-sync                                               |
| Shared dialogs/artwork/fonts/tooltips                               | Existing local loading; static assets not resource-cache candidates           | Dialog stays mounted; focus traps and local preparation/error retained                                                | No new global catalogue/assets wait; card inspection is read-only                                                                                | loading-policy, card-artwork-assets, player-showcase       |
| Service-worker update/document replacement                          | No automatic replacement during active route                                  | Update waits for safe public Home and no active saved attempt; no active journey takeover                             | Rechecks safe route/focus at controller change; storage failure defers; no draft reload                                                          | service-worker-update                                      |

## Controlled verification and limits

The retained-query/revisit fixtures deliberately withhold responses until the
intermediate UI is inspected, then fail and retry the read. This observes retained
content and updating feedback rather than only the final screen. Unit/component
fixtures cover failed updates, empty results, rapid query changes, aborted late
responses, identity/binding invalidation, TTL expiry, transaction/draft/focus
preservation, partial results and serialized ranked polling. They do not establish
production latency, deployed request reliability or assistive-technology speech.

The browser consistency pass uses 390×844 player and 1440px desktop fixtures,
reduced motion, keyboard focus and overflow assertions. Actual screen-reader
speech, OS-level browser zoom across every route, and live server authorization,
settlement, offline synchronization and season rollover remain manual release
gates. No production performance improvement is claimed. The retained collection
fixture still makes one authoritative read per visit; its optimization is fewer
visible replacement loaders, not fewer server freshness checks.

Controlled collection comparison on baseline
`00c04461432e43514cb371c0e9a79b3c89e55bac` and this working tree used Node
24.14.1, local Vite basic-e2e, `/usr/bin/chromium`, one Playwright worker, identical
five-card fixtures and withheld collection responses. Both 390×844 and 1440×844
runs passed. The baseline was an isolated `git archive` copy in `/tmp`, with the
same installed dependencies; no deployed endpoint was used.

| Measurement (per viewport)                               | Baseline                        | Retained-content implementation           |
| -------------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| Collection reads for initial entry plus revisit          | 2                               | 2                                         |
| Page-data loader replacing cards on revisit              | 1                               | 0                                         |
| Confirmed cards visible during withheld revisit response | No                              | Yes                                       |
| Failed revalidation followed by explicit retry           | Not part of baseline comparison | Cards retained; third read confirms retry |

Reproduce the candidate with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --config=playwright/loading.config.ts --grep 'collection revisit' --workers=1`
from `apps/web`. For an isolated baseline server on port 5176, the same current
harness accepts `PLAYWRIGHT_EXTERNAL_WEB_SERVER=true RETENTION_BASELINE=true`.
This comparison counts visible interruptions and requests. It does not measure
production latency, server throughput, or fewer required authoritative reads.

Final local verification: the repository's normal Web test command passed all
**922 frontend tests (73 files) and 3 server tests**. Web lint, application and
Playwright type checks, production build, changed-file formatting and
`git diff --check` passed. An earlier four-worker run during parallel implementation
had failures; all affected tests passed in a 240-test serial rerun and the final
normal two-worker suite. Backend/deployed-service checks were not run for these
frontend changes. Disposable fixture screenshots remain under the existing
Playwright output directories; they are not production/user evidence.
