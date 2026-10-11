---
title: 'Offline play and synchronisation'
---

# Offline play and synchronisation

Wits Quest supports prepared offline event challenges in both multiple-choice
and ordering formats in the ordinary `/explore` journey. The signed-in application
prepares content automatically while connected; downloads never wait for GPS.
The browser can reopen the saved application, browse downloaded event details,
show campus paths, buildings and event markers, and save timed answers locally.
Only previously downloaded challenges can be played without connectivity.
Rewards and results appear only after the API
validates the submitted attempt.

## Player journey and recovery

`/explore` keeps the same event list, selected-event details, search, geographic
map view and mobile bottom sheet as connectivity changes. A compact status in the
saved map controls explains offline operation without a global download strip,
redirect or interruption to an active challenge.
Offline and saved exploration exposes only **Events**, including the desktop
rail. Nearby, Trails and Territories return after reconnection without a reload;
a failed connection in another section switches safely to Events.
Event details distinguish **Downloaded**, **Not downloaded** and **Expired**.
**Play** starts a downloaded challenge directly; an existing attempt instead offers continuation or its saved
status. An unavailable download cannot be created after disconnection.

`/offline` is the secondary **Downloads & saved attempts** page, available from the
account menu both online and offline. A compact readiness summary precedes
attempts needing attention and searchable downloaded-event rows. Download and
event details are collapsed; failures and their recovery actions remain visible.
**Back to Explore** returns to play; event links select that event in Explore.
Routine download, GPS-check and sync buttons are absent. Retry actions
appear only when preparation, authentication or synchronisation needs recovery.

Saved challenges use the shared challenge timer, progress and answer controls.
Saving feedback reserves space so acknowledging an answer does not move the next
question. Completion shows one pending state and a reconnect deadline derived
from the last timely answer when all five are saved, or from the original timer
deadline for a partial attempt. A delayed finishing GPS reading does not extend
the twelve-hour submission window. Reconnection updates the current saved-result
screen in place; **View confirmed result** opens the canonical result explicitly.

**Ready for offline play** requires downloaded packs and confirmation from the
controlling service worker that its essential application files are present.
Saved questions alone do not establish that the browser can reopen offline.
The saved challenge player and both answer formats are static dependencies of
the application entry, so starting an attempt does not fetch another route
module. Downloads management remains lazy and is not needed to enter play.
The build follows the complete static dependency graph for the entry, Home,
Explore and downloads routes, and caches their styles and fonts. Readiness
responses from a replaced worker cannot mark the new shell ready.
Preparation has a bounded timeout, keeps usable packs after failed or partial
downloads, and never discards pending answers. Location failures at challenge
start or finish explain recovery; an imprecise or distant start does not consume
a local attempt. These browser checks are advisory; the server remains authoritative.

New signed packs use `locationPolicy: arrival-v1`. An eligible reported arrival
may be up to **five minutes before starting**, but must be within pack validity.
The ordinary challenge timer then applies indoors without another finishing GPS
reading. While Explore is open, its foreground location watcher records eligible
arrivals in memory. **Play** reuses one, or obtains a fresh location when needed.
An inaccurate or distant reading cannot start or consume an attempt. The arrival
window is not alternative proof of presence: both location and time remain claims.
Fresh acquisitions are checked against a two-minute age limit; recorded eligible
arrivals may be reused for the signed five-minute window. A valid acquisition
may share a timestamp with a watch callback. It does not need to be newer than
an unrelated rejected reading. Invalid coordinates, future or stale timestamps,
excessive reported uncertainty and out-of-range positions have distinct recovery.
Exact event coordinates still fail if reported accuracy exceeds the policy's
limit (for example, 149 m accuracy exceeds a 60 m event's 120 m ceiling).

One-shot requests have an application-controlled 10-second deadline, including
permission waits. Legacy packs without the signed arrival policy retain their
original fresh-start and finishing-GPS requirements; a failed finish leaves locked
answers saved with **Retry location**. Late or cancelled callbacks cannot complete
another attempt, and local completion does not wait for server synchronisation.
Session recovery clears private collection snapshots without remounting the
saved challenge page or restarting its location deadline.

The header identifies the bound saved account as **Playing offline as…** while
offline, including after a reload that cannot restore Auth0. This is a local
identity, not online authentication: protected online content still requires a
verified session. Reconnection offers **Restore online session** when needed.
**Sign out on this device** retains the existing pending-work confirmation and
clears the local identity and SDK cache without an Auth0 network redirect.

Pack preparation batch-loads placements/challenges, published questions and
selected options on one repeatable-read, read-only snapshot. For one to ten
eligible packs, it uses seven database round trips including discovery and
transaction boundaries, plus the existing trust-restriction checks when enabled.
It does not perform per-event or per-question reads. This bounds query count;
real download time still depends on authentication, database and network latency.

Explore switches to saved data when the browser reports offline, when discovery
fails or times out, or when a bound player's session cannot be restored. A connected
network interface is not evidence of a usable API. Cached routes grant no online
authorisation. Foreground reconnection retries identity restoration and downloads;
if authentication is genuinely required, sign-in returns to the current route.
Reopening a cached navigation uses the saved shell immediately.

## Contract and authority

`POST /api/v1/offline-challenge-packs` takes `eventIds` (one to ten UUIDs).
`POST /api/v1/offline-challenge-attempts` takes `clientAttemptId`, `packToken`,
`startedAt`, `finishedAt`, `answers` and `startLocation`. `finishLocation` is
required for legacy packs and optional for signed `arrival-v1` packs.
Both require an active authenticated player and
`X-Wits-Offline-Contract-Version: 1`. Locations contain latitude, longitude,
accuracyMetres and acquiredAt. Each answer contains questionId, answeredAt
and optionIds (one choice or a permutation of four ordering items).

The server signs the player, event and challenge versions, five selected
questions, shuffled options, issue/validity timestamps and existing challenge
time limit. Packs contain no answer keys, explanations, correctness flags or
reward outcomes. Pack issuance creates no database rows. Preparation requests all
active or soon-opening eligible events in batches of ten under a **4 MiB serialized
pack budget**; ten is a request limit, not an aggregate cache limit. Catalogues have
their own 4 MiB guard. Downloads retain usable packs after partial failures, and
attempts are stored separately so refreshes cannot evict pending work. Packs expire
at the earlier of the effective event end or
24 hours after issue. Attempts must start before that expiry; the ordinary
90/120/150-second challenge timer still applies. Answers at the deadline are
late. A partial attempt finishes as a timeout; missing answers receive no credit.

The server accepts delayed delivery for 12 hours after the derived completion
time, including delivery after the event ends. It checks historical publication
and campaign availability, signature, source versions, answer membership,
the [shared reported-point and accuracy policy](../database/event-eligibility.md#reported-accuracy-policy)
and movement plausibility. Offline start must be inside the event radius, and
arrival accuracy must be at most `min(150m, 2 × event radius)`. Legacy finishing
accuracy uses the same bound. The server enforces the signed five-minute arrival
window for new packs; legacy packs cannot opt into it through a submission field.
Coordinates and times remain
device claims. A signature authenticates the downloaded content, not when a
person read it, answered it or physically visited a location. Cached questions
can be inspected in browser storage; this is an accepted limitation of this
offline design, not a claim of equivalent anti-cheating strength to online play.

Movement anchors must have accepted eligibility decisions. Online
and offline checks order accepted offline anchors by their claimed acquisition
time, not their later sync receipt; ordinary online anchors continue to use
server receipt time. Decisions using an offline anchor are labelled accordingly.
Rejected GPS observations cannot become anchors for offline validation.

Accepted submissions create the existing canonical attempt, snapshots, answers,
completion, card rewards and progression through the existing finalizer in one
transaction. Retrying the same player/client-attempt/pack returns the existing
result; another attempt for that event conflicts. No client result is trusted.
New packs also sign `rewardContext`: the reward-policy version and eligible
card-definition IDs/rarities at preparation. The existing finalizer uses that
catalogue even if a definition is later retired; published card content is
immutable. A missing definition, changed rarity or unsupported saved policy
causes a retryable server failure instead of silently substituting current
rewards. No cards or reward outcomes are reserved when downloading. Previously
issued version-1 packs without this optional context retain their legacy
finalization behaviour for compatibility. Future policy releases must retain
the saved policy implementation through pack lifetime and sync grace.

Responses are 201 for first acceptance, 200 for replay, 409 for a conflict or
contract upgrade, and 422 for a terminal validation rejection. Authentication,
rate-limit, network and server failures keep the local attempt for retry.
The web syncs pending attempts sequentially on start, reconnect and foreground,
and automatically retries transient failures every 15 seconds while visible.
Failure-only manual recovery remains available. A previously bound session with a transient connection failure
is restored using foreground retries with exponential backoff capped at 30 seconds;
identity and authorization failures are not treated as network failures.
Background Sync is not required; upload is not guaranteed while the app is closed.

## Browser storage and privacy

IndexedDB `wits-world-offline` stores sessions, event catalogues, packs, attempts
and receipts. Its additive version-2 upgrade preserves existing attempts.
The local player binding only gates access to cached data; it never grants API
authorization. Another account cannot view or submit that partition. Explicit
sign-out warns about pending work before clearing it. Account deletion also
clears local data. Clearing browser storage or browser eviction can lose unsynced
attempts; device storage is not a server backup.

New attempts capture only arrival evidence; legacy attempts also capture a finishing
sample. Foreground watcher samples and pre-start arrivals are ephemeral, not a
stored location trail. Position is labelled **Last known location** after tracking
fails or a displayed sample becomes more than two minutes old. Successful or terminally
rejected sync removes the local attempt, answers and precise evidence, retaining
only a safe receipt. Old receipts are pruned after seven days during preparation.
The API stores only the accepted start sample under the existing movement
retention/cleanup policy. Account deletion removes that evidence and its decision
audit. Offline payloads are redacted from API logs.

The service worker caches application assets and navigation fallback, including
every size of the existing responsive Great Hall homepage artwork. Authentication
and connectivity changes retain the same hero image. It never caches API, Auth0
or Mapbox traffic. It does not download commercial
map tiles. The downloaded campus map uses a bounded OpenStreetMap extract with
paths, buildings and labels, attribution and recorded provenance. The committed
compact dataset is **533,987 bytes**, below its 2 MiB generation guard; that is
not the size of the entire application shell. It supports pan, zoom, keyboard
operation and an accessible event list, but is not verified walking navigation.
Compact attribution keeps the OpenStreetMap and ODbL links visible. A map-data
disclosure contains the extract date, provenance and walking-directions caveat.
Provenance is recorded in `apps/web/src/offline/campus-map.provenance.md`; the
build-time refresh script is `apps/web/scripts/generate-offline-campus-map.mjs`.

Navigation fallback also handles event-selection query strings, so a saved
`/explore?event=…` link can open directly offline. Query-bearing asset and API
requests remain excluded from caching. On activation the worker retains the
current shell and one complete previous shell. Already open documents can load
their previous build's exact cached asset URLs while an update takes control;
older and failed shells are removed. This can temporarily retain two builds,
separate from the downloaded-content budget.
The locally measured essential shell is approximately **4.12 MB before
compression**, across 83 assets in the verified production build. A per-file gzip
estimate is 2.22 MB; actual transfer size depends on deployment compression. This
includes map code/data, fonts and other application assets, not just map geometry.
These build measurements are not a fixed limit or a deployed performance claim.
Installation retains the entry/Home/Explore/saved-challenge JavaScript and
their static build dependencies, plus the existing CSS, fonts, branding and
campus artwork. Other build-allowlisted JavaScript is cached on successful
same-origin demand, rather than downloaded during installation. Previously
requested modules remain available offline within that worker version; a first
visit to an unrequested online-only route requires connectivity. This does not
add offline Author/Profile API support or change the prepared-challenge contract.
Hashed assets can reuse the browser HTTP cache during installation; revisioned
public files are reloaded. A failed installation leaves the active shell intact.
Updates activate automatically at the public Home boundary only when no local
challenge remains active and no text field is being edited. Pending IndexedDB
data survives updates.

## Deployment and team setup

Explicit sign-out and account switching await offline cleanup before redirecting.
If IndexedDB cannot be read or cleared, a confirmation warns that local
answers/precise location may remain and offers to continue anyway. Only a
deliberate cancellation stops the action: unavailable browser storage must not
prevent server-side account deletion or sign-out. Clear the site's browser data
before leaving a shared device. Cleanup reports `cleared`, `cancelled`, or
`cleanup_failed`; continuing after failure never claims data was removed.
Clearing the identity binding alone
does not delete IndexedDB data. Account deletion checks and clears local offline
data before sending the deletion request, but permits continuing after a cleanup
warning; confirmed local discards cannot be
undone if the later server request fails.

Run `npm ci` after pulling the dependency changes. Existing `TEST_DATABASE_URL`
values continue to target the separate test project; teammates do not need to
move them again. Run integration tests only with that disposable configuration.
Migration `0040_add_offline_challenge_attempts.sql` is additive and must deploy
before enabling offline packs. Apply it through the existing database release
procedure, never by editing an already applied migration.

Set `OFFLINE_PACK_SIGNING_KEY` in the API's ignored local environment or Azure
App Service settings to a separate random secret of at least 32 bytes. An absent
key leaves the API online-only and the web falls back without pack preparation.
The key must never enter a `VITE_*` variable. During rotation, keep the old key
in `OFFLINE_PACK_PREVIOUS_SIGNING_KEY` for at least 37 hours (24-hour packs,
up to 150 seconds to complete, and a 12-hour sync grace). Do not roll back the
schema while accepted offline attempts exist. Keep contract version 1 available
through the complete pack lifetime and sync grace when introducing a successor.

Deploy the API/schema first, then the web bundle, including `sw.js`,
`manifest.webmanifest` and branding assets. Verify worker responses are JavaScript,
navigation fallback works over HTTPS, and the browser sees new worker versions.
Worker registration uses `updateViaCache: none`. A PWA installation is optional.

## Storage and release evidence

The reported production baseline is 0.30 GB out of 0.50 GB, with a separate test
project at 0.04 GB. Browser caches consume no Neon storage. Accepted submissions
add ordinary gameplay rows plus small provenance fields and one expiring movement
sample. No pack/download table or large payload archive is created. Measure
relation sizes before release and after a controlled pilot; review growth at
0.375 GB and arrange a capacity decision by 0.40 GB. These are project operating
thresholds, not Neon product limits. Do not delete canonical outcomes as cleanup.

The automated tests cover signature/player binding, timing boundaries, both answer
formats, durable storage, competing tabs, account isolation and atomic database
sync. Before release, also demonstrate on a real device: prepare online, enter
airplane mode, reopen, answer, reconnect after event closure, and confirm one
result/reward. Verify inaccurate/denied GPS, worker updates, keyboard ordering,
storage failure, account switching and interrupted sync. Record sanitised evidence.
Local checks do not establish deployed or campus-field success.

The local runtime used for verification was Node 24.19.0 and npm 11.17.0; the
repository requests npm 11.18.0 or newer within major 11. Use the repository's
declared toolchain for reproducible team/CI runs. Dependency audit also reports
existing web dependency advisories for `fast-uri` 3.1.5 and `nanoid` 3.3.17;
both versions already occur in the pre-feature lockfile. This change does not
claim to resolve the repository's broader dependency advisories.

Run the production-shell browser regression with
`npm run test:e2e:offline --workspace @wits-world/web`. It builds an isolated
`dist-e2e` bundle with the existing fake-auth fixture, uses mocked API responses,
and requires installed Playwright Chromium. It does not use real Auth0 or Neon.
The test checks both formats, offline reload, answer persistence, transient sync
failure with automatic retry, receipt recovery and the same Explore layout while
the browser still reports online but the API is unreachable. It also checks the
new arrival policy needs no finishing GPS.
The Spec 1 browser regression also checks fresh, signed-in and saved signed-out
homepages, uncached offline hero reads, Events-only navigation, connection
recovery, search and selection retention, and desktop/mobile control clearance.
Database tests separately verify real marking and one-time card issuance.
Run the offline database suite via the existing
`npm run test:database --workspace @wits-world/api` command.

Offline PvP, battles, decks, authoring, trails and poor-GPS alternative proof are
outside this feature. Issue #170 remains responsible for the alternative proof
decision; [ADR-006](./decisions/ADR-006-poor-gps-presence-fallback.md) records
the engineering recommendation and explicitly defers implementation until the
required stakeholder and permission decisions are confirmed. Issue #186 must not claim full Intermediate completion until its
remaining requirements and field evidence are satisfied.

This document was generated with assistance from Codex[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].

This policy update was edited with assistance from Codex-CLI[GPT-6].
