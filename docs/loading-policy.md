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

`LoadingState`, `PageLoadingState`, `AuthorLoadingState`, and
`ExplorationLoadingPanel` use `useLoadingPhase` from
`apps/web/src/components/loading-policy.ts`. The policy delays decorative loading
motion for **150 ms**, adds a truthful explanation and recovery at **8 seconds**,
and imposes no minimum wait or ceremonial completion animation. Completed work
replaces its loading state immediately. These are product thresholds tested with
controlled timers; they are not measured production latency percentiles.

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
mutation retry. Retaining complete data on revisits is a separate follow-up
(#357); this policy does not introduce a cache or claim retained revisit state.

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
| Global offline status and queue             | Online return/manual sync; action/reconciliation                                | Existing queue and offline navigation remain available; cancel sync stops local waiting, review/retry keeps server acknowledgement authoritative     |
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
