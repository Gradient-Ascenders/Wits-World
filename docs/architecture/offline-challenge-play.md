---
title: 'Offline play and synchronisation'
---

# Offline play and synchronisation

Wits Quest supports prepared offline event challenges in both multiple-choice
and ordering formats. A player must first sign in, allow location access and
download nearby events while connected. The browser can then reopen the saved
application, show an accessible event list and relative-position schematic,
and save timed answers locally. Rewards and results appear only after the API
validates the submitted attempt.

## Contract and authority

`POST /api/v1/offline-challenge-packs` takes `eventIds` (one to ten UUIDs).
`POST /api/v1/offline-challenge-attempts` takes `clientAttemptId`, `packToken`,
`startedAt`, `finishedAt`, `answers`, `startLocation` and `finishLocation`.
Both require an active authenticated player and
`X-Wits-Offline-Contract-Version: 1`. Locations contain latitude, longitude,
accuracyMetres and acquiredAt. Each answer contains questionId, answeredAt
and optionIds (one choice or a permutation of four ordering items).

The server signs the player, event and challenge versions, five selected
questions, shuffled options, issue/validity timestamps and existing challenge
time limit. Packs contain no answer keys, explanations, correctness flags or
reward outcomes. Pack issuance creates no database rows. The application keeps
at most ten unstarted packs and stores attempts separately so refreshes cannot
evict pending work. Packs expire at the earlier of the effective event end or
24 hours after issue. Attempts must start before that expiry; the ordinary
90/120/150-second challenge timer still applies. Answers at the deadline are
late. A partial attempt finishes as a timeout; missing answers receive no credit.

The server accepts delayed delivery for 12 hours after the derived completion
time, including delivery after the event ends. It checks historical publication
and campaign availability, signature, source versions, answer membership,
location accuracy/radius and movement plausibility. Coordinates and times remain
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
Current server reward rules/catalogue apply when finalizing; offline play does
not introduce a second reward engine or reserve cards when downloading packs.

Responses are 201 for first acceptance, 200 for replay, 409 for a conflict or
contract upgrade, and 422 for a terminal validation rejection. Authentication,
rate-limit, network and server failures keep the local attempt for retry.
The web syncs pending attempts sequentially on start, reconnect, foreground and
manual retry. Background Sync is not required.

## Browser storage and privacy

IndexedDB `wits-world-offline` stores sessions, packs, attempts and receipts.
The local player binding only gates access to cached data; it never grants API
authorization. Another account cannot view or submit that partition. Explicit
sign-out warns about pending work before clearing it. Account deletion also
clears local data. Clearing browser storage or browser eviction can lose unsynced
attempts; device storage is not a server backup.

Each attempt captures start and finish location samples. Successful or terminally
rejected sync removes the local attempt, answers and precise evidence, retaining
only a safe receipt. Old receipts are pruned after seven days during preparation.
The API stores only the accepted start sample under the existing movement
retention/cleanup policy. Account deletion removes that evidence and its decision
audit. Offline payloads are redacted from API logs.

The service worker caches only application assets and navigation fallback.
It never caches API, Auth0 or Mapbox traffic. It does not download commercial
map tiles. An update waits for user activation, and the UI blocks activation
while a local challenge remains active. Pending IndexedDB data survives updates.

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
failure and receipt recovery; database tests separately verify real marking and
one-time card issuance. Run the offline database suite via the existing
`npm run test:database --workspace @wits-world/api` command.

Offline PvP, battles, decks, authoring, trails and poor-GPS alternative proof are
outside this feature. Issue #170 remains responsible for the alternative proof
decision; [ADR-006](./decisions/ADR-006-poor-gps-presence-fallback.md) records
the engineering recommendation and explicitly defers implementation until the
required stakeholder and permission decisions are confirmed. Issue #186 must not claim full Intermediate completion until its
remaining requirements and field evidence are satisfied.

This document was generated with assistance from Codex[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].
