# Wits World Web Application

This workspace contains the mobile-first Wits World web application. Wits World
is the project and primary public brand; Wits Quest is the campus-exploration
game/topic the project is building.

The current application provides a responsive shell, Auth0 sign-in and sign-out,
a protected campus map, authenticated event, nearby-unvisited, and ordered-trail
discovery, safe API access-token retrieval, and a premium editorial home page.
The home-page map, event status, and collectible cards are explicitly static
product previews; the live seeded-event experience is available through the
protected `/explore` route. The protected experience includes foreground browser geolocation,
API-authoritative event eligibility, and the protected timed challenge journey.
Challenges restore their server-owned attempt, submit answer intent only, and
display the persisted final score, rewards, and completed answer review. Card
starter selection and collection browsing are available through the protected
`/collection` route. Saved-deck building, management, and active selection are
available through `/decks`. Authors also have a separate protected `/author`
console for Basic event, challenge, question, and card authoring.
Server-authoritative CPU battles and private
completed-match history are available through the protected `/matches` routes.
The protected `/profile` route presents server-authoritative points, rank,
streaks, achievement progress, and privacy-safe all-time or monthly standings.
Asynchronous PvP is
available alongside CPU play through `/matches/pvp`, with exact Player Name
lookup, invitations, saved-deck selection, server-timed turns, polling, and
viewer-relative completed history. PvP match detail uses
`/matches/pvp/:matchId`; it renders only API-returned legal actions and revealed
opponent information. When the API reports the capability, either participant
can confirm voluntary resignation as an immediate server-recorded loss.
The client requests that capability with a CORS-safelisted version-2 `Accept`
media type and an `application/json` fallback, so an older API can return its
legacy shape without requiring a new preflight allow-list entry.
The protected `/account` route presents the local player identity, delegates
credential recovery to the owning provider, and starts permanent account
deletion with fresh Auth0 reauthentication.

## Run locally

Use Node.js 24.14.1 and npm 11.18.0. From the repository root:

```bash
nvm use
npm ci
cp apps/web/.env.example apps/web/.env
npm run view
```

Before starting the application, replace
`VITE_AUTH0_CLIENT_ID=replace-with-public-spa-client-id` in the ignored
`apps/web/.env` file with the development SPA's public Client ID. Keep the
committed development domain and API audience unless the approved Auth0
configuration changes.

Open `http://localhost:5173` in a browser. The development server uses a strict
port and exits with an error if port 5173 is unavailable.

### Public branding asset

The approved Campus Seal is copied byte-for-byte to
`/branding/wits-world-campus-seal-transparent.svg` so externally hosted
interfaces such as Auth0 Universal Login can load it over HTTPS after the web
application is deployed. The canonical source remains
`src/assets/branding/wits-world-campus-seal-transparent.svg`.

The supplied Quest Marker variants are also copied byte-for-byte to
`/branding/wits-world-quest-marker.svg` and
`/branding/wits-world-quest-marker-transparent.svg`. Both paths are public so
external interfaces can load the selected artwork without application
authentication. The browser favicon remains the simplified W/star mark at
`src/assets/branding/wits-world-favicon.svg`.

To inspect the production build locally:

```bash
npm run build --workspace @wits-world/web
npm run preview --workspace @wits-world/web
```

The preview server uses `http://localhost:4173`.

## Environment configuration

| Variable                   | Required | Browser-visible  | Purpose                                            |
| -------------------------- | -------- | ---------------- | -------------------------------------------------- |
| `VITE_API_BASE_URL`        | Yes      | Yes              | Base URL reserved for the Wits Quest API           |
| `VITE_AUTH0_DOMAIN`        | Yes      | Yes              | Auth0 tenant hostname without a protocol           |
| `VITE_AUTH0_CLIENT_ID`     | Yes      | Yes              | Public Auth0 single-page application ID            |
| `VITE_AUTH0_AUDIENCE`      | Yes      | Yes              | Audience identifying the Wits World API            |
| `VITE_MAPBOX_ACCESS_TOKEN` | Yes      | Yes              | URL-restricted public Mapbox `pk.` token           |
| `VITE_DEV_GEO_LAT`         | No       | Development only | Override latitude for local flow testing           |
| `VITE_DEV_GEO_LNG`         | No       | Development only | Override longitude for local flow testing          |
| `VITE_DEV_GEO_ACCURACY`    | No       | Development only | Override accuracy in metres for local flow testing |

The committed `.env.example` contains the approved development domain and
audience plus safe Client ID and Mapbox token placeholders. A fresh checkout
must replace those placeholders in its ignored `.env` file before testing
authentication or the live map. Mapbox token scope and URL-restriction guidance
is recorded in [Mapbox operations](../../docs/deployment/mapbox-operations.md).

Only public values may use the `VITE_` prefix because Vite includes them in the
browser bundle. Do not place tokens, passwords, private keys, or other secrets in
this workspace's environment file.

For local location-gated flow testing, place all three optional
`VITE_DEV_GEO_LAT`, `VITE_DEV_GEO_LNG`, and `VITE_DEV_GEO_ACCURACY` values in
ignored `.env.local`. They are used only by the Vite development build; production
builds always use browser geolocation. Leave any value unset to retain normal
browser geolocation behavior.

The application accepts HTTP and HTTPS API URLs. The Auth0 domain must be a
hostname without a protocol, path, query, or fragment. If required configuration
is absent, empty, or malformed, the browser displays a clear setup screen instead
of starting an incorrectly configured application.

## Player authentication

Wits World uses Auth0 Universal Login. The browser application is a public
single-page application and must not be configured with an Auth0 client secret.
The Auth0 provider requests access tokens for the audience configured by
`VITE_AUTH0_AUDIENCE`. Production explicitly uses the SDK's in-memory cache and
rotating refresh tokens without persisting access or refresh tokens. After a
reload it falls back to the same-site custom-domain Auth0 session. Local
development and Playwright E2E use rotating refresh tokens in the SDK's
local-storage cache so localhost does not depend on third-party-cookie-based
silent authentication.

The development Auth0 application must include the following exact values:

| Auth0 setting         | Development value       |
| --------------------- | ----------------------- |
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs   | `http://localhost:5173` |
| Allowed Web Origins   | `http://localhost:5173` |

Enable Refresh Token Rotation for the development SPA, enable the Refresh Token
grant and API offline access needed by that SPA, and keep reuse detection on.
Use dedicated development/test accounts because local-storage tokens have
greater exposure to browser script compromise.

The application uses Authorization Code with PKCE through the Auth0 React SDK.
An unauthenticated visit to `/explore` shows a clear sign-in action without
rendering protected content. The intended internal route is carried through the
Auth0 redirect and validated before the browser returns to it. Absolute and
protocol-relative return URLs are rejected.

Authenticated API clients obtain a token on demand through
`useApiAccessToken`. Callers must place that token only in the standard
`Authorization: Bearer` request header and must not log or persist it.

The production custom Auth0 domain is live at `https://auth.witsworld.co.za/`,
and the current production issuer is `https://auth.witsworld.co.za/`. The
following sequence records the completed 2026-08-22 cutover and remains useful
as recovery guidance or for a future issuer change; it is not an outstanding
implementation step:

1. Use `https://witsworld.co.za` as the canonical production web origin. The web
   bootstrap redirects only `www.witsworld.co.za` to that origin before the SPA
   loads, preserving the path, query string, and fragment. Localhost, E2E hosts,
   and the Azure default hostname are not redirected. The API CORS allowlist,
   Auth0 callback/logout/web origin settings, and deployment configuration must
   use the one exact canonical origin; do not weaken CORS with a wildcard. This
   is required because the player binding is origin-scoped.
2. In Auth0, add a custom domain under the same product/root domain as the
   production web application. Create the required DNS CNAME, complete Auth0
   verification, and use an Auth0-managed certificate unless infrastructure
   policy deliberately selects another supported option.
3. In the production SPA settings, enable Refresh Token Rotation, the Refresh
   Token grant, and required offline access. Add the exact canonical HTTPS
   production origin to the production SPA's Allowed Callback URLs, Allowed
   Logout URLs, and Allowed Web Origins. Keep the localhost entries on the
   development SPA. Do not use wildcards.
4. Deploy this repository version while the old Auth0 domain is still active so
   the guarded web policy and the issuer-remap command are available.
5. Schedule a maintenance window, stop production web/API traffic that could
   provision players, take a restorable database backup, and record the exact
   old and custom-domain issuers including their trailing slash. Record both the
   Neon endpoint hostname and PostgreSQL database name; Neon branches can share
   the database name `neondb`.
6. Run the parameterised operation without `--apply`; verify the database
   hostname, database name, and player count. Replace only the placeholders
   below:

   ```bash
   npm run db:remap-auth-issuer --workspace @wits-world/api -- \
     --target production \
     --confirm-hostname <neon-endpoint-hostname> \
     --confirm-database <database-name> \
     --from-issuer https://<tenant>.auth0.com/ \
     --to-issuer https://<custom-auth-domain>/
   ```

7. Re-run that exact reviewed command with `--apply`. It refuses an empty source
   issuer, a populated target issuer, a database hostname/name mismatch, or a
   non-exact issuer URL. It changes only `players.auth_issuer` and the row's
   `updated_at` timestamp; player IDs, subjects, roles, cards, decks, matches,
   progress, and other linked data stay unchanged.
8. While traffic remains stopped, set the API `AUTH0_DOMAIN` and web
   `VITE_AUTH0_DOMAIN` to the custom hostname. Set `AUTH0_TENANT_DOMAIN` to the
   unchanged default `*.auth0.com` tenant hostname so the Management API
   audience remains valid. Keep `AUTH0_AUDIENCE` and `VITE_AUTH0_AUDIENCE`
   unchanged, deploy both applications, and smoke-test `/api/v1/auth/me`
   against previously recorded local player IDs and account deletion.
9. Resume traffic only after the API accepts the custom-domain issuer and the
   web uses the same domain. Users must authenticate again after this issuer
   cutover. Remove any temporary callback/logout/origin entries after the
   rollout is confirmed.

Repository code cannot create or verify DNS records, configure an Auth0 custom
domain/certificate, change Auth0 Dashboard grants or URL allowlists, or update
deployed environment variables. Those remain operator-owned capabilities, but
the production custom-domain cutover itself is complete. The signed-in
hard-refresh, browser-storage, and correlated Azure log checks below remain
outstanding operator evidence. The API never needs a dual-issuer window.

### Real Auth0 local-storage end-to-end test

The Playwright suite signs in through the development tenant's real Auth0
Universal Login page and calls the real local API. It verifies the local/E2E
rotating-refresh-token policy, which restores from local storage with iframe
fallback disabled. It is not evidence for production's memory-cache and
custom-domain iframe restoration. Put only the dedicated test player credentials
in the ignored `apps/web/.env.e2e.local` file:

```dotenv
E2E_USER_EMAIL=player@example.com
E2E_USER_PASSWORD=replace-with-the-test-player-password
```

From the repository root, run:

```bash
npm ci
npx playwright install chromium
npm run test:e2e:auth --workspace @wits-world/web
npm run test:e2e --workspace @wits-world/web
npm run test:e2e:headed --workspace @wits-world/web
```

Playwright may reuse an existing local API service, but it always starts its own
Vite server in the dedicated `e2e` mode so Auth0 can cache the test player's
rotating refresh-token session in local storage. Stop any other service using
port 5173 before running the suite. The setup project saves the token-bearing
browser state under the ignored `playwright/.auth/` directory for the dependent
smoke tests. The real-Auth0 projects use one worker, and the restoration/logout
case runs as the setup project's teardown, so parallel browser contexts cannot
rotate or end the shared Auth0 test session underneath another test. Treat the
storage directory as sensitive and delete it when it is no longer needed.
Credentials are loaded by the Playwright Node process and must never use a
`VITE_` prefix.

The credentialed live-Auth0 suite does not run in the current CI workflow. If
it is added to CI, run `npx playwright install chromium` after `npm ci` and
before the E2E command in that job.

Known limitations:

- sign-in, sign-out, and silent token retrieval depend on Auth0 availability;
- incorrect refresh-token rotation, grant, offline-access, or Allowed Web
  Origins configuration may prevent local/E2E session restoration;
- changing the local port requires matching callback, logout, and web-origin
  entries in Auth0;
- unit tests mock Auth0; the Playwright end-to-end test requires the real
  development tenant, API, database test branch, and network access.

### Required post-cutover production smoke test

The custom-domain cutover is live at `https://auth.witsworld.co.za/`; public
OIDC discovery and the deployed Web configuration were verified on 2026-08-22.
The signed-in storage/console inspection and correlated Azure API-log inspection
remain operator-run gates. The procedure below is retained for that controlled
completion evidence and future cutovers.

Run this against the deployed production build on the selected canonical web
origin after the custom domain and issuer remap are live. Do not use Vite's
`e2e` mode, because that mode restores from local storage instead of exercising
the production mechanism.

1. Sign in as an existing production test account and record only the stable
   player UUID returned by `GET /api/v1/auth/me`; do not record request headers
   or tokens.
2. Open a protected route and hard reload it. Confirm the memory cache starts
   empty, Auth0 silently restores through the configured custom domain, and the
   protected route remains hidden until `/auth/me` succeeds.
3. Confirm the post-reload `/auth/me` player UUID exactly matches the UUID from
   before the reload. Directly revisit another protected URL and compare again.
4. Confirm browser network activity uses the custom Auth0 hostname, not the
   default tenant hostname, without inspecting or exporting token contents.
5. Sign out, hard reload, and confirm the application remains signed out.

## Campus map and event discovery

The web workspace uses [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)
3.28.1 with Mapbox Standard at `mapbox://styles/mapbox/standard`. Mapbox GL JS
is lazy-loaded only when the protected campus map is mounted. Mapbox attribution
is rendered visibly and expanded in the map controls.

The current map adapter:

- loads Mapbox GL JS only when the campus map is rendered;
- uses Mapbox Standard's dusk configuration with 3D buildings, landmarks,
  objects, trees, and pedestrian roads where the provider supplies coverage;
- starts at zoom 16.5, pitch 52, and bearing 20 around the approved Sprint 1
  event area, with a keyboard-accessible reset bearing/pitch control;
- updates event markers without destroying and recreating the WebGL map;
- anchors the application-owned reported-location dot with Mapbox's marker
  runtime so it remains attached to the coordinate during camera movement;
- keeps the map host sized when Mapbox's runtime class and stylesheet arrive;
- leaves Mapbox's attribution control enabled and expanded;
- provides 44px zoom controls;
- presents map loading and failure states, treating WebGL context loss or a
  load that does not complete within 15 seconds as a provider failure;
- keeps event information in a separate semantic text list;
- centres the initial view on the confirmed Sprint 1 Great Hall event point at
  longitude `28.03038`, latitude `-26.19205`;
- allows component tests to replace Mapbox with a local fake, avoiding live
  provider requests;
- accepts a future licensed Wits campus GeoJSON layer through the adapter
  boundary, using only stored `heightM` values for custom building extrusion;
  no Wits campus geometry is currently bundled.

The protected `/explore` route obtains an Auth0 access token on demand and calls
`GET /api/v1/events`. It validates the player-safe response before presenting
events as map markers and as a semantic text list. Active, upcoming, and ended
availability is always written as text and does not rely on marker colour. A
failed API request provides a retry action; a failed tile or style request leaves
the event list available.

The map does not request the player's browser location. `/explore` owns that
permission and lifecycle: an existing grant starts one watcher, while a prompt
or unknown state requires the player's Enable live location action. Reported
coordinates are sent only to the Wits World API for authoritative checks. The
map receives them locally to position the transient dot; Mapbox's geolocation
control is not installed and the claim is not published as provider data.

The production Content Security Policy must account for Mapbox's `blob:` worker,
image data, WebAssembly evaluation, and `api.mapbox.com` style/tile/glyph/image
requests. The deployment guidance, current map-load pricing, usage monitoring,
and absence of a configurable hard monthly spending cap are recorded in
[Mapbox operations](../../docs/deployment/mapbox-operations.md). Formal external
service acceptance and licensed campus-data approval remain pending.

## Browser location and eligibility

The `/explore` route calls the protected
`POST /api/v1/events/:eventId/eligibility` endpoint after a clear player action.
Each request contains the browser-reported latitude, longitude, accuracy, and
acquisition time. The browser watcher uses a fifteen-second timeout, asks for
high accuracy, and does not accept a cached reading. It pauses while the page is
hidden and is removed on unmount. A retry that needs a newer claim uses a fresh
one-shot request rather than resubmitting the rejected acquisition.

The displayed dot keeps a short rolling set of fixes and temporarily prefers a
recent, substantially more accurate fix when the next callback degrades. Follow
mode ignores movement inside the readings' reported uncertainty and uses short
camera transitions. These are presentation behaviours only: eligibility always
receives the current raw browser claim, and reported accuracy is visible as
approximate text rather than implied precision.

The browser treats the reading as a claim. It does not calculate authoritative
distance, compare the event radius, calculate travel speed, select a prior
movement anchor, or decide reachability. Reachable, unreachable, inaccurate,
stale, neutral journey-retry, unavailable, and failure states come from the API
or browser boundary and are displayed with accessible text rather than colour
alone. The journey-retry copy asks for a fresh reading without alleging
cheating or revealing internal distance, speed, or threshold values.

The location values are not written to React state, browser storage, logs, or
the map provider. Permission can be denied without losing access to event
discovery. See the
[player location and eligibility journey](../../docs/requirements/player-location-journey.md)
for the full flow, privacy boundary, browser limitations, and evidence steps.

## Routes

- `/` presents the mobile-first Wits World home page.
- `/explore` requires Auth0 sign-in and contains the Sprint 1 player experience.
- `/challenge-attempts/:attemptId` requires Auth0 sign-in and restores an owned
  timed challenge through the API; it never reuses or stores a location claim.
- `/collection` requires Auth0 sign-in, offers the one-time starter-affinity
  journey when no starter-owned copy is present, and renders every owned card
  copy returned by the API.
- `/decks` requires Auth0 sign-in, loads saved decks and the owned collection,
  and supports server-authoritative deck CRUD and active selection.
- `/author` requires Auth0 sign-in and an API-resolved `author` role. It contains
  the Basic author workflow and never grants or changes roles in the browser.
- `/matches` requires Auth0 sign-in, resumes the current active CPU match before
  offering creation from the selected saved deck.
- `/matches/:matchId` requires Auth0 sign-in and renders the ownership-scoped
  authoritative active or completed CPU match state.
- `/matches/history` requires Auth0 sign-in and lists the authenticated player's
  private completed CPU matches.
- `/profile` requires Auth0 sign-in and shows the current player's approved
  progression fields, achievement progress, and paginated standings.
- `/account` requires Auth0 sign-in, shows the API-resolved player identity and
  provider category, delegates credential recovery, and coordinates permanent
  deletion without collecting passwords.
- `/about` explains the Wits World project and Wits Quest game/topic distinction.
- Any unknown route presents a page-not-found message and a link home.

The application uses browser-history routing. A future static host must route
unknown application paths back to `index.html`; production deployment remains
outside issue #6.

## Player account lifecycle

`/account` displays only the server-resolved Player Name, application role,
lifecycle status, and safe provider category. It deliberately omits email,
provider profile data, Auth0 identifiers, and token contents.

For an Auth0 database account, **Reset password** returns to Universal Login and
instructs the player to use Auth0's hosted recovery option.
Auth0 owns account-identifier collection, recovery email, and replacement
password entry. For Google accounts, the page instead explains that Google owns
the credential and links to Google's account recovery. Wits World has no
password inputs or password API.

Permanent deletion uses two distinct confirmations. A compact first dialog
explains the security step before opening Auth0 with `prompt=login` and
`max_age=0`; returning only supplies an in-memory ID token for the API's
independent five-minute recent-authentication check. A second Wits World dialog
names the permanent effects and requires an explicit checkbox before the exact
deletion confirmation is submitted. Completed and
retry-pending responses clear the local player binding and remain visible until
the player chooses **Finish and return home**. Ambiguous API failures can safely
retry the idempotent operation; expired proof restarts reauthentication; an
already locked account is reported honestly rather than treated as a new
failure.

Auth0 does not report hosted recovery completion to this SPA. Returning to the
account page therefore confirms only that the recovery entry point was opened
and reminds the player to use the newest Auth0 email. Real provider email,
hosted-page, and recent-`auth_time` behavior remain operator/browser checks. See
[player account lifecycle validation](../../docs/testing/player-account-lifecycle-validation.md).

## Basic author console

The navigation shows **Author** only after `GET /api/v1/auth/me` resolves the
signed-in player as an active Author. Opening `/author` directly performs the
same check. This is a presentation boundary only: every `/api/v1/author/*`
request includes the Auth0 bearer token, and the API independently applies its
authentication, active-player, and Author guards. Player roles are assigned and
revoked out of band; the console has no role-management operation.

The author workflow is:

1. Open **Author → Events**, create or select a draft event, and
   enter its title, optional description, active times, positive whole-number
   radius, latitude, and longitude. The coordinate fields are always available;
   clicking the placement map is optional.
2. Choose either **Multiple choice** or **Ordering** when creating the event's
   challenge. Multiple-choice questions require exactly four non-blank choices
   and one accepted-answer position. Ordering questions require exactly four
   non-blank items entered in their correct sequence. Both formats require
   difficulty 1–3 and a non-blank author explanation. For each question, submit
   the draft for review, have a different Author approve it, and then publish
   it. After at least five questions are published, take the challenge through
   the same lifecycle. A challenge's format is fixed when it is created.
3. Open **Card catalogue** and create or update the global definitions used by
   rewards. A Creature has positive HP, non-negative Power, and at least one
   move. A Power card has null HP/Power and at least one effect. Publish at least
   one Common card through independent review and publication so the
   authoritative reward catalogue is ready.
4. Return to the event's publication summary. It explains the three Basic
   relationships, but remains advisory. Submit the event for review, have a
   different Author approve it, then select **Publish event**; success is shown
   only after the API accepts the request.

Basic does not expose an event-to-card assignment or author-defined reward
amount. The reward service selects from the global active catalogue. Only draft
content can be edited, and retirement is permanent. Lifecycle mutations send
the API-provided `version` as `expectedVersion`; the API remains authoritative
when it accepts or rejects the transition. A `409` conflict reloads the current
authoritative detail, while a `422` approval or publication response reports
that readiness rules are not met. Validation details identify controls when the
API supplies field paths, while other API failures remain visible as
request-level alerts.

Accepted-choice identifiers and accepted positions are read only by the
lazy-loaded author client. The ordering answer key is likewise author-only
during an active attempt. The in-progress player challenge client rejects
responses containing correctness, correct answers, explanations, scores, or
rewards. The player route submits only choice or ordered-item intent and renders
the server's safe active or completed-attempt contract. Ordering explanations
are shown only when supplied by the authoritative completed response;
multiple-choice explanations remain excluded from Player responses.

The authoritative validation and publication rules live in the API, principally
in [`author-event-service.ts`](../api/src/events/author-event-service.ts),
[`author-challenge-service.ts`](../api/src/challenges/author-challenge-service.ts),
[`author-card-service.ts`](../api/src/cards/author-card-service.ts), and
[`card-validation.ts`](../api/src/cards/card-validation.ts). The browser mirrors
basic field constraints for immediate feedback but does not decide publication,
rewards, eligibility, marking, or lifecycle authorization.

Run the focused author tests from the repository root with:

```bash
npm test --workspace @wits-world/web -- --run tests/author-client.test.ts tests/author-console.test.tsx tests/challenges-client.test.ts tests/challenge-page.test.tsx
```

## Initial structure

```text
apps/web/
  src/
    api/          Typed player-safe API clients and response validation
    auth/         Auth0 provider integration and safe API-token access
    components/   Application shell and reusable status states
      author/      Protected Basic author forms and publication readiness
      cards/       Semantic owned-card presentation and collection styling
      exploration/ Provider-independent campus map and event-list presentation
      home/        Decorative map, journey, and collectible-card previews
    config/       Public environment validation
    pages/        Home, About, and not-found pages
    styles/       Mobile-first global styles
  App.tsx       Routing and application error boundary
    main.tsx      Configuration-aware browser entry point
  tests/          Component, routing, error, and configuration tests
  index.html      Vite HTML entry point
  vite.config.ts  Development, preview, build, and test configuration
```

## Timed challenge development

The Basic challenge is a server-authoritative, five-question multiple-choice or
ordering attempt. For multiple choice, the browser sends the chosen
`attemptQuestionId` and `choiceId`. For ordering, it sends the
`attemptQuestionId`, `format`, and the four item identifiers in the player's
current order. It derives its timer from the absolute server deadline and
reloads an attempt through `GET /api/v1/challenge-attempts/:attemptId` after
refresh or timeout.

During an in-progress Basic attempt, keep feedback neutral: show “Answer saved”
and never render correctness, correct choices, answer keys, explanations, score,
or reward information. Once the API authoritatively completes the attempt, the
final result renders only the persisted score, reward, and answer-review data in
that completed response. The browser does not compare choices or sequences and
does not mark answers. Unanswered timeout items use “Not answered” while still
displaying the completed response's correct answer. Ordering reviews also show
the API-supplied correct sequence and explanation; multiple-choice reviews do
not expose author explanations.

The production-like browser flow requires an authenticated player and an active
event with a published challenge containing five valid questions. The Great Hall
development seed now provides that challenge and the active reward catalogue;
use the documented development geolocation override when testing locally. Never
persist browser locations, tokens, answer keys, or rewards in browser storage.

## Starter selection and card collection

The protected `/collection` route first requests
`GET /api/v1/cards/collection` with the current Auth0 bearer token. The browser
renders the returned list in its server order and uses `ownedCardId` as the
identity of each displayed copy. Two records with the same `cardDefinitionId`
remain two separate list items; copy labels explain the duplicate count without
combining or inventing ownership records.

When the returned ownership records contain no starter copy, the route requests
`GET /api/v1/cards/starter-options` and renders the returned Spark, Grit, and Wit
packages. Each server preview contains the comparison copy, three Common
Creatures with HP, Power, and four moves, and two Common Power cards with their
effects. Exact package data remains behind progressive disclosure, using the
same player-facing effect language as battle previews rather than catalogue
modifier fields. Spirit and Mystic remain normal affinities and are described
as later progression rewards; they are not offered for a new starter grant.

After a separate final-confirmation step, the browser sends only the selected
`affinity` to `POST /api/v1/cards/starter`. It does not generate cards, submit
card IDs, decide whether the player is eligible, or predict the result. It
disables and synchronously locks submission while the request is active. A
successful `200` or `201` response reveals exactly the five owned cards returned
by the server, then a fresh collection request replaces that result when the
player continues. An authoritative `STARTER_ALREADY_CLAIMED` response explains
that the original choice remains in effect and offers a collection refresh.

Collection loading, empty, token-expired, and network/API failure states are
announced in text. Token expiry provides a new Auth0 sign-in action that returns
to `/collection`; general failures provide a fresh retry. Cards are semantic
articles rather than controls. Category, affinity, rarity, Creature HP and
Power, move type/effect/cost, Power-card effects, acquisition kind, duplicate
copy position, and inactive-catalogue ownership are written as text and never
depend on art or colour alone. The starter-result heading receives focus after
the important transition.

### Card artwork and attribution

The current repeatable Basic catalogue seed sets `image_url` to `null` and is
documented as demonstration content rather than final production artwork in the
[challenge, reward, and card persistence design](../../docs/database/challenge-reward-persistence-design.md).
The collection therefore uses a decorative CSS fallback when no artwork URL is
supplied; that fallback carries no gameplay meaning.

The design system is the current artwork-governance source of truth: existing
asset provenance must be retained, and production art without confirmed rights
is excluded. Before a catalogue author sets a non-null card `image_url`, the
artwork's source, confirmed rights, and any required attribution must be recorded
in the project's approved asset-provenance documentation. Do not infer a licence
or ownership claim from the image URL. The browser renders a supplied card image
with alternative text naming the card, while all gameplay information remains
available separately as semantic text.

## Saved-deck building and selection

The protected `/decks` route loads `GET /api/v1/decks` and
`GET /api/v1/cards/collection` with the current bearer token. It uses the exact
owned-copy IDs returned by the collection API and groups duplicate definitions
only for a clearer `Owned`, `Used`, and `Remaining` picker presentation. It
never creates another implied copy.

The editor explains the confirmed five-card, three-Creature/two-Power,
ten-point Basic rules and the Common/Rare/Epic/Legendary values. Its preflight
is explanatory only. Create, full edit/rename, delete, and active selection use
the [authoritative saved-deck API](../../docs/database/saved-deck-persistence-design.md#http-operations),
and the server derives ownership, category, rarity, totals, and validity. The
authoritative player-visible constraints remain linked from
[Basic Game Rules](../../docs/requirements/basic-game-rules.md#saved-decks).

The route maps server rule codes to specific name, copy, composition, point-cap,
or deck feedback. A `DECK_NOT_FOUND` result is treated as a stale/deleted deck:
the page explains the conflict and reloads authoritative state. The API exposes
no deck version or conditional update field, so the browser does not invent one.
The #72 list operation validates every saved deck before responding, so an
authoritative invariant failure is a list/API failure rather than an invalid
deck item for the browser to accept or mark locally.

Selecting a deck makes its active status explicit and exposes the selected
server-returned `deckId` through the typed CPU-match handoff. The production
route now uses that ID to reconcile `GET /api/v1/matches/cpu` before creating a
match with `POST /api/v1/matches/cpu`. A recovered or created match navigates to
`/matches/:matchId`; deck validation remains wholly authoritative in the API.
See the complete
[player saved-deck journey](../../docs/requirements/player-deck-building-journey.md).

## CPU battle and completed-match history

The protected `/matches` route first performs the ownership-scoped active-match
lookup. It resumes an existing match without requiring a remembered browser ID,
or presents the currently selected saved deck when the API returns
`CPU_MATCH_NOT_FOUND`. `/matches/:matchId` renders only the authoritative match
state and its `legalActions`; `/matches/history` renders the authenticated
completed history and links back to persisted direct detail.

Every action sends one generated `submissionId`, the displayed
`expectedVersion`, and exactly one server-advertised intent. Controls are locked
while that request is pending and the UI never simulates a CPU turn or outcome.
A stale, illegal, or completed-action response triggers a direct authoritative
reload and never automatically replays the obsolete intent. Completed state is
absorbing in the page state model.

Ambiguous match creation is reconciled with active-match lookups at 0, 250, and
750 milliseconds after the failed POST. This small bounded window accounts for
an original create transaction that may commit just after an immediate lookup;
the browser does not persist or invent a second source of truth. A create
`CPU_MATCH_ALREADY_ACTIVE` response uses the same reconciliation path.

See the complete [player CPU battle journey](../../docs/requirements/player-cpu-battle-journey.md),
the [authoritative Basic game rules](../../docs/requirements/basic-game-rules.md),
and the [CPU match API and persistence contract](../../docs/database/cpu-match-persistence-design.md).

## Progression profile and standings

The protected `/profile` route loads `GET /api/v1/progression/me` and
`GET /api/v1/progression/standings` independently. A profile failure therefore
does not hide available standings, and either request can be retried without
replaying or changing gameplay. The browser displays only Player Name, points,
all-time rank, current and longest streak, achievement definition and progress
fields, and the privacy-safe standings fields. Its closed runtime validation
rejects unexpected keys such as email, Auth0 identity, location, or gameplay
history rather than rendering a partial response.

All-time standings load first with a server-bounded page size of 20. Players may
select a `YYYY-MM` Johannesburg calendar month, and Previous/Next requests use
the page metadata returned by the API. The current player is identified with
both visible “Current player” text and `aria-current`, or in a separate “Your
standing” summary containing the server-provided rank when outside the selected
page. A nullable standings Player Name is presented only as `Deleted player`,
without an identifier or other retained account data.

Under the approved progression rules every active account participates in live
standings, including zero-point accounts, so the browser never derives or
invents an “unranked” value. `ACCOUNT_UNAVAILABLE` is the useful no-active-rank
state: it explains that deleted and pending-deletion accounts do not occupy live
standings. Loading, empty achievement catalogue, empty page, malformed response,
expired session, unavailable account, and general API failure states all remain
explicit and recoverable.

Run the focused component and client coverage from the repository root:

```bash
npm test --workspace @wits-world/web -- --run tests/progression-client.test.ts tests/profile-page.test.tsx
npm run test:e2e:progression --workspace @wits-world/web
```

## Verification

Run automated checks from the repository root:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
```

The component tests use accessible roles and names. They cover application
landmarks, routes, keyboard order, authentication loading and errors,
authenticated event discovery, bearer-header use, response validation, loading,
empty, retry, map-provider failure, map-independent event presentation,
user-triggered geolocation, location claim construction, authoritative
eligibility outcomes, permission and timeout failures, honest preview language,
safe return paths, configuration failures, and the render-error fallback.
Card tests additionally cover authenticated API requests and response
validation, starter selection and result focus, double-submit prevention,
already-claimed behaviour, collection loading and empty states, populated and
duplicate-copy presentation, textual gameplay information, session expiry, and
general failure recovery.
Saved-deck tests cover strict response validation, rule/error mapping, loading,
empty collection/deck states, valid and invalid drafts, duplicate exhaustion,
create/edit/rename/delete, active selection, server validation, stale-deck
refresh, mutation reauthentication, match-handoff identity, delete-cancel focus,
final-card focus, and keyboard activation. The deck Playwright suite also uses a
touch-enabled mobile browser context and a real tap event for active selection.
Vitest does not transform application stylesheets, keeping these jsdom tests
focused on semantics and behaviour without expensive CSS matching. Automated
checks do not replace manual visual, responsive, browser, and keyboard testing.
CPU-match tests cover active recovery, no-active and selected-deck creation,
bounded ambiguous-create and already-active reconciliation, strict response
validation, legal initial/move/Power/replacement actions, duplicate suppression,
stale recovery without replay, response-order protection, defeat, continuation,
completion absorption, history, persisted detail, authentication, keyboard use,
and API failure recovery. The CPU battle Playwright scenario uses the real
authenticated application shell and production routes with deterministic
intercepted API responses; it is frontend browser evidence, not a live-backend
match E2E test.
Progression tests cover approved-field runtime validation, private-field
rejection, populated and empty achievements, current and off-page standings,
pagination, monthly selection, zero/no-active-rank handling, tombstones, long
names, request cancellation, keyboard activation, session expiry, malformed
data, and independent API failure recovery.

### Manual browser checks

With `apps/web/.env` configured and the development server running:

#### Home page

1. Open `/` at widths of 360px, 390px, 768px, and approximately 1280px. Confirm
   that the brand, navigation, hero, journey stages, map preview, card preview,
   project context, and footer remain readable without horizontal scrolling.
2. At 390×844, confirm the hero heading wraps cleanly, the decorative map stays
   inside its panel, the fixed navigation does not hide interactive content, and
   the journey stages remain comfortably readable.
3. At 1280×800, confirm the hero, mission preview, and collection preview use
   two-column compositions without stretching body text or obscuring headings.
4. Capture review screenshots under `.pr-screenshots/` at 390×844 and 1280×800.
5. At 390px, press Tab. Confirm focus moves through Skip to main content, the
   Wits World brand, Home, Explore, Collection, About, account control, Explore
   the campus, and About the project with a visible outline. Activate the skip
   link and confirm focus moves to the main landmark.
6. Enable reduced-motion emulation and confirm transitions are effectively
   removed without hiding information.
7. Open an unknown route such as `/missing`. Confirm the not-found heading and
   Return home link are available by keyboard.

#### Authenticated campus map

1. Start the API with its PostgreSQL/PostGIS environment and seeded Sprint 1
   event, then start the web application with the development Auth0 SPA Client
   ID and API base URL configured.
2. At 390px while signed out, open `/explore`. Confirm protected content is not
   visible, the sign-in explanation is readable, and the Sign in to explore
   button has a visible keyboard focus state.
3. Complete Auth0 Universal Login with a development player. Confirm the browser
   returns to `/explore`, identifies the signed-in player, and never displays an
   access token.
4. Check `/explore` at 360×800, 390×844, 768×1024, and 1280×800. Confirm there is
   no horizontal overflow, the map remains usable, and the event list remains
   readable without covering map attribution or controls.
5. Confirm “Sprint 1 Demo - Wits Great Hall” appears as a marker and as a text
   list item with an explicit availability label. Confirm the expanded Mapbox
   attribution remains readable and the Standard dusk preset presents depth
   without obscuring the event.
6. Refresh `/explore`. Confirm the protected-route and event-loading states are
   announced and are replaced by the authenticated map without flashing event
   data while authentication is unresolved.
7. Stop the API and use Try loading events again. Confirm the safe API error and
   retry action remain keyboard-accessible and no server or token detail appears.
8. Restore the API, then block Mapbox style/tile requests or work offline.
   Confirm the map failure is announced while the Great Hall event remains
   available in the text list.
9. Press Tab from the top of `/explore`. Confirm visible focus follows the skip
   link, Home, Explore, Collection, About, account controls, Mapbox controls
   including reset bearing/pitch, and any retry action in a logical order.
   Confirm the event can be discovered without using the map.
10. Activate Sign out. Confirm Auth0 returns to `/` and reopening `/explore`
    requires sign-in again.
11. Open an unknown route such as `/missing`. Confirm the not-found heading and
    Return home link are available by keyboard.
12. Stop the server, temporarily move the ignored `apps/web/.env` file elsewhere,
    and restart. Confirm the setup screen names the first missing public variable
    and explains how to restore configuration. Put the ignored file back
    afterward.
13. Capture the authenticated map at 390×844 and 1280×800 under
    `.pr-screenshots/issue-12/`, along with keyboard and failure-state evidence
    required by the Gitea issue.

#### Authenticated trails and nearby discovery

1. Start the API and web application from the repository root with
   `npm run dev --workspace @wits-world/api` and
   `npm run dev --workspace @wits-world/web`, then sign in as a player and open
   `http://localhost:5173/explore`.
2. Open the exploration sheet and use its Events, Nearby, and Trails controls.
   Confirm each is reachable with Tab and Enter, the active view is named in
   text, and event discovery remains usable without interacting with the map.
3. In Trails, open an incomplete trail. Confirm completed, current, locked,
   temporarily unavailable, event-retired, and trail-retired stops use readable
   labels and icons. For a completed trail, confirm the completion notice appears
   and no current-event action is offered.
4. Choose **Open current event**. Confirm the existing event detail opens and
   continues through the existing reported-location eligibility and challenge
   start flow; locked and unavailable stops must not expose that action.
5. In Nearby, grant location permission and confirm the text list and map show
   the same active unvisited event set, ordered by the API-provided distance.
   Open one from the list and confirm the matching existing event detail opens.
6. Repeat Nearby with permission denied, an inaccurate or stale reported
   location, no results, the API unavailable, and a malformed mocked response.
   Confirm the safe status and retry copy appears without hiding Events or
   Trails, exposing coordinates, or claiming verified presence.
7. Inspect `/explore` at approximately 390×844 and 1280×800. At 360px, also use
   a trail/event with long title and description text and confirm there is no
   horizontal overflow. Check the complete flow with Tab, Shift+Tab, Enter,
   Space, and Escape, and inspect the console for runtime errors.

The deterministic responsive browser scenario uses intercepted API responses
and does not prove live location or database behaviour:

```bash
npm run test:e2e:trails --workspace @wits-world/web
```

#### Authenticated location eligibility

1. Use a real phone with the deployed HTTPS application and API. Sign in with a
   development player, open `/explore`, and confirm no location permission prompt
   appears before an action.
2. At approximately 390px wide, confirm the active event includes Check
   reachability with no horizontal overflow. Confirm upcoming and ended events
   remain readable without requesting location.
3. Select Check reachability and grant permission. Confirm the requesting and
   checking states are announced, followed by the exact reachable, unreachable,
   or retry result returned by the API.
4. Keep `/explore` visible and confirm the reported-location dot remains attached
   to its map coordinate while panning, zooming, pitching, and rotating. Confirm
   the approximate reported accuracy is visible and that normal GPS jitter does
   not make the camera chase every callback.
5. Select Check again after a location retry and confirm a newer claim is used
   rather than resubmitting the rejected acquisition.
6. Reset the browser's site permission, deny location, and confirm the denial
   explanation, Check again action, map, and event list remain usable.
7. Press Tab with a connected keyboard. Confirm visible focus reaches the event
   action in logical order and the result does not rely on colour alone.
8. Repeat the layout check at 360px, 768px, and approximately 1280px. Confirm the
   status panel, text, button, event badge, map attribution, and navigation do not
   overlap or cause horizontal scrolling.
9. Record the actual device, operating system, browser version, permission state,
   and API outcome. Store screenshots under `.pr-screenshots/issue-21/` and
   attach them to the pull request without exposing tokens or precise location
   values.

#### Authenticated starter and collection

1. Start PostgreSQL/PostGIS and prepare the development database using the API
   workspace's documented migration and seed commands. Start the API with
   `npm run dev --workspace @wits-world/api`, then start the browser application
   with `npm run dev --workspace @wits-world/web`.
2. Sign in as a development player and open
   `http://localhost:5173/collection`. For a player without a starter grant,
   confirm the loading announcement is followed by the three server-provided
   Spark, Grit, and Wit packages without a duplicate empty-collection panel.
3. Use Tab and arrow keys to select an affinity. Expand View exact package to
   inspect Creature HP/Power and moves plus Power-card effects, then activate
   Review choice. Confirm the final-confirmation heading receives focus and no
   grant is sent until Confirm starter is activated. Confirm the action becomes
   disabled while pending, the result heading receives visible focus, and
   exactly the five server-returned cards appear. Activate View my collection
   and confirm a fresh collection load.
4. Repeat the same-affinity request only through an intentional API retry and
   confirm the persisted grant is shown. If the server reports
   `STARTER_ALREADY_CLAIMED` for a different affinity, confirm no fictional
   result appears and Load my collection recovers the owned copies.
5. Use a development player with duplicate rewards. Confirm every owned copy is
   a separate card article and the duplicate labels state “Copy 1 of N” through
   “Copy N of N”. Confirm Creature HP/Power, moves, and Power-card effects are
   understandable with images disabled and without relying on colour.
6. Check the focused starter flow at 390×844 and 1280×800. Confirm
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
   the three choices remain readable, exact details are initially collapsed,
   long names and move descriptions wrap, and the fixed mobile navigation does
   not cover the final action.
7. Stop the API and use Try loading again after restoring it. Expire or revoke
   the development session and confirm Sign in again returns to `/collection`.
   Check the browser console after each recovery; no token, raw server detail,
   failed unhandled promise, or card ownership identifier should be logged.
8. Starting from the top of the route, verify visible keyboard focus follows
   the skip link, brand, primary navigation, account control, affinity radios,
   primary action, and recovery actions in DOM order. Inspect the accessibility
   tree to confirm the owned-copy list, card articles, headings, attribute
   definition lists, move/effect lists, alerts, and statuses have useful names.
9. Capture disposable review screenshots outside tracked source files (or under
   the repository's ignored `.pr-screenshots/issue-70/` convention) and do not
   include account details, tokens, or other private data.

#### Duplicate evolution in the collection

1. Start the database, API, and web application using the commands above. Sign
   in as a development player with at least three copies of one evolvable card,
   then open `http://localhost:5173/collection`.
2. At approximately 390px wide, confirm the gallery shows one design tile with
   its total-copy badge. Open it and confirm the details distinguish Owned,
   Available, and In decks using the server preview. A non-evolvable card should
   keep the ordinary detail view without an unavailable action.
3. For fewer than three available copies, confirm Review evolution is disabled
   and the explanation distinguishes insufficient ownership from copies used by
   saved decks. Remove a protected copy from its saved deck, reopen the card,
   and confirm the refreshed server preview changes the action state.
4. Activate Review evolution. Confirm focus moves to the confirmation heading,
   the fixed three-copy recipe and remaining-copy count are clear, and the
   evolved card is rendered with its server-provided definition. Activate
   Cancel and confirm focus returns to Review evolution without a mutation.
5. Review again and activate Confirm evolution. Confirm the action and modal
   close controls remain disabled while pending. The success heading should
   receive focus, exactly one evolved card should appear, and closing the modal
   should reveal the refetched collection without the three consumed copies.
6. Reproduce a concurrent copy or deck change before confirmation. Confirm the
   safe conflict is announced and the latest preview disables or updates the
   action. Stop the API for a general error and confirm retrying the same open
   confirmation remains possible without showing a fictional success.
7. Repeat at approximately 768px and 1440px and use Tab, Shift+Tab, Enter, and Escape.
   Confirm focus remains trapped in the modal, Escape restores the originating
   card tile when safe, controls meet touch-target sizing, text does not clip,
   and no runtime error or ownership identifier appears in the console.

For deterministic browser inspection without a real sign-in or database, run from
the repository root:

```bash
npx playwright test --config apps/web/playwright/collection.config.ts collection-evolution.visual.spec.ts --headed --debug
```

This starts the web app in the existing `basic-e2e` fixture mode at
`http://127.0.0.1:5178/collection`. Step through the Playwright inspector to review
eligible copies, locked copies, confirmation/cancellation, stale previews, preview
and confirmation failures, and success. The test supplies authenticated API
fixtures; opening the URL alone does not install those fixtures. Screenshots go
to `/tmp/wits-world-collection-evidence`. Omit `--headed --debug` to run the checks
automatically; omit the spec filename to also run the gallery regression.

Inspect the fixed confirmation footer while scrolling the result, the vertical
mobile/tablet recipe and horizontal desktop recipe, and expandable Copy history.
After success, the message distinguishes copies consumed from the new card and
does not claim refresh completion while a refresh is still pending.

This refinement and its inspection instructions were prepared with assistance
from Codex-CLI[GPT-6].

Selling is intentionally absent. The active product contract has no currency,
wallet, sale preview, or selling mutation after issue #193 retired and deferred
that model; the browser does not invent a replacement value.

#### Protected Basic authoring

1. Prepare and seed the local database with `npm run db`, start the API with
   `npm run dev --workspace @wits-world/api`, and start the web app with
   `npm run dev --workspace @wits-world/web`. Sign in with a development account
   whose local role has been assigned `author` by the approved out-of-band
   process, then open `http://localhost:5173/author`.
2. Create a draft event. Enter its coordinates entirely by keyboard, save it,
   then click a different point on the optional map and confirm the labelled
   latitude and longitude inputs update. Set a positive integer radius and an
   end time later than the start time.
3. Create one multiple-choice challenge and five questions. For each question,
   enter four choices, choose the accepted answer with its radio control, add an
   author explanation, and save the draft. Submit each question for review; use
   a different Author to approve it, then publish it. Once all five are
   published, repeat those lifecycle steps for the challenge. Confirm the
   current question's accepted marker is visible only inside `/author`. Repeat
   with an ordering challenge: enter four items in correct sequence for each
   question and confirm that sequence is visible in the protected question
   detail. A draft must offer **Submit for review**, not direct publication.
4. In **Card catalogue**, create a Common card with valid category-specific
   moves or effects and take it through review and publication. Return to the
   event and confirm all three readiness summaries read **Ready**. Take the
   event through review and publication, then confirm the API success message
   receives focus.
5. Open `/explore` and confirm the newly published, currently active event is
   available through the player event response. Start its challenge where local
   reported-location configuration permits. Inspect the active network response
   and rendered page: neither accepted-choice identifiers/positions nor an
   ordering answer key or explanation may appear while the attempt is active.
   Complete each format through normal player controls and confirm only the
   server result is rendered. For ordering, reorder once by pointer and once by
   the keyboard-operable Move Up/Move Down controls; confirm each movement and
   the current order are announced, then confirm the completed API explanation
   is visible.
6. Repeat the author and both player challenge layout checks at 390×844 and
   1280×800. Add 360×800 only when checking minimum-width pressure and 768×1024
   only when investigating breakpoint behaviour.
   Confirm no horizontal overflow, clipped controls, or covered final actions.
   At each meaningful form, use Tab/Shift+Tab, arrow keys for radios/selects, and
   Enter/Space for buttons; map pointer input must never be required.
7. Sign in as an ordinary development Player and open `/author`. Confirm the
   focused Author permission message appears, no author API request is made, and
   no author-only content or accepted-answer data is rendered. Also stop the API
   and retry one load, submit invalid fields, provoke a publication `422` with an
   incomplete draft, and retry a lifecycle action after a `409`; confirm alerts,
   field focus, and recovery actions remain usable.
8. Check the console and failed-request list throughout. Record viewport,
   keyboard, success, failure, and player-response evidence on the pull request;
   do not attach access tokens, credentials, accepted answers, precise player
   locations, or other sensitive data.

#### Authenticated saved decks

1. Prepare and seed PostgreSQL using the API workspace commands, then run
   `npm run dev --workspace @wits-world/api` and
   `npm run dev --workspace @wits-world/web` from the repository root.
2. Sign in as a development player with at least the five-card starter set and
   open `http://localhost:5173/decks`. Confirm the loading announcement is
   replaced by saved decks, the Basic rules, and either an explicit active deck
   or the Choose an active deck state.
3. Activate Create a deck. Enter a name and add three Creature and two Power
   copies. Confirm the card, composition, and rarity-point counters update; the
   submit action enables only when the explanatory preflight is complete.
4. With a player who owns duplicates, add the same definition until Remaining
   reaches zero. Confirm another copy is not offered and removing a copy returns
   exactly one to Remaining.
5. Save the deck, use Edit or rename to change its name and composition, then
   make it active. Confirm the saved-list heading receives focus after save, the
   active deck is named in text, and Selected for matches is visible.
6. Delete a non-active deck and cancel once before confirming. Confirm cancel
   restores focus to that deck's Delete control. Then delete the active deck and
   confirm the active handoff returns to Choose an active deck; collection
   ownership must remain unchanged.
7. Exercise a server validation error (for example by changing authoritative
   ownership in a disposable development database after loading). Confirm the
   focused alert explains the copy/rule problem and no deck is accepted locally.
   In another tab delete the deck, then try to edit/select it in the first tab;
   confirm the stale-state message and authoritative refresh.
8. Use only Tab, Shift+Tab, Enter, and Space to complete add/remove, save,
   selection, delete confirmation/cancel, and retry actions. Confirm visible
   focus, logical order, useful alert/status announcements, and no required
   drag-and-drop.
9. Inspect empty, populated, duplicate, invalid, API-error, stale, and active
   states at 360×800, 390×844, 768×1024, and 1280×800. Confirm no horizontal
   overflow, comfortable touch targets, readable long card/deck names, and no
   content hidden behind mobile navigation.
10. Check the console and failed requests during the main flow and recovery.
    Capture disposable evidence under `.pr-screenshots/issue-73/`; do not record
    account details, access tokens, or owned-card identifiers.

#### Authenticated CPU battle and match history

1. Prepare and seed the disposable test database, then start
   `npm run dev --workspace @wits-world/api` and
   `npm run dev --workspace @wits-world/web` from the repository root.
2. Sign in as a development player with a valid active saved deck and open
   `http://localhost:5173/matches`. Confirm an unfinished CPU match resumes; if
   none exists, confirm the selected deck is named and start it. With no active
   deck, confirm the route links to `/decks` instead of attempting creation.
3. Choose an opening Creature, use a currently legal Creature move and Power
   card, and continue through any server-returned defeat/replacement state.
   Confirm unavailable controls explain that they are not in `legalActions`,
   hidden CPU cards are meaningful text, and no action can be submitted twice
   while waiting.
4. Create a stale expected-version response from another tab or the deterministic
   Playwright fixture. Confirm the page announces reconciliation, reloads the
   direct match, discards the obsolete intent, and requires a new activation.
5. Finish the match, refresh `/matches/:matchId`, then open
   `/matches/history` and its saved detail link. Confirm the completed result
   remains completed and no active controls return.
6. Repeat the battle at 360×800, 390×844, 768×1024, and 1280×800. Check
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
   comfortable touch targets, logical screen-reader order, and no content hidden
   behind mobile navigation. Use Tab/Shift+Tab/Enter/Space for the full journey
   and confirm focus reaches the changed phase heading after selection,
   replacement, stale recovery, and completion.
7. Run the deterministic intercepted browser scenario with
   `npm run test:e2e --workspace @wits-world/web -- --project=chromium playwright/cpu-battle.spec.ts`.
   Its touch-enabled context performs real tap events and writes disposable
   responsive evidence under `.pr-screenshots/issue-76/`. Inspect the browser
   console and page errors; do not describe this fixture as a live API E2E match.

#### Authenticated progression profile and standings

1. Prepare and seed PostgreSQL, then start
   `npm run dev --workspace @wits-world/api` and
   `npm run dev --workspace @wits-world/web` from the repository root.
2. Sign in as an active development player with a Player Name and open
   `http://localhost:5173/profile`. Confirm the profile name, points, all-time
   rank, current and longest streak, achievement statuses, and progress values
   match the two progression API responses. Do not use email, location, or
   private gameplay history as evidence.
3. Choose Monthly, select a Johannesburg calendar month, and activate View
   standings. Use Previous and Next where available. Confirm the selected
   period, page count, and off-page “Your standing” rank come from the response,
   and that the current row is identified by text as well as its blue treatment.
4. Inspect an account with zero points. Confirm it still displays its
   server-provided live rank. Exercise an `ACCOUNT_UNAVAILABLE` fixture or
   disposable deleted-account response and confirm the page reports that no
   active standing is available instead of fabricating an unranked value.
5. Exercise an empty achievement catalogue, an empty requested standings page,
   a nullable standings Player Name, a `401`, a general API error, and a response
   containing an unexpected field. Confirm the tombstone reads `Deleted player`,
   errors provide safe retry/sign-in actions, and malformed/private data is not
   rendered.
6. Inspect the populated route at approximately 390×844 and 1280×800 with a long
   Player Name. Confirm there is no horizontal overflow, names wrap without
   clipping, all touch targets remain reachable, and the mobile navigation does
   not cover page controls.
7. Navigate using only Tab, Shift+Tab, arrow keys in the period selector, Enter,
   and Space. Confirm visible focus, logical order, labelled period/month fields,
   announced loading/error/page changes, achievement status text independent of
   colour, and focus moving to the standings heading after a filter or page
   change. Check the browser console and page errors throughout.

#### Authenticated asynchronous PvP

1. Start the disposable database, API, and Web application as above. Sign in as
   two development players that each have a Player Name and valid saved deck.
2. Open `http://localhost:5173/matches/pvp`. Search for the second exact Player
   Name, choose a saved deck and opening Creature, and send the invitation.
3. Before responding, confirm the first account sees **Cancel challenge** only
   on its pending sent invitation. Cancel once and verify both accounts retain a
   **Cancelled** record with viewer-relative text. Repeat the flow to continue.
4. In the second account, open the same route and accept or decline the incoming
   invitation. For acceptance, choose that account's own deck and opening
   Creature. Confirm the new match opens at `/matches/pvp/:matchId`.
5. Submit only an enabled API-returned move or Power action. Confirm the heading
   changes between **Your turn** and **Opponent's turn**, the exact deadline and
   display countdown remain visible, and the waiting view refreshes after the
   other account acts. Do not expect unplayed opponent cards to appear.
6. On either participant's turn, choose **Forfeit battle**. Confirm that Escape
   and **Keep playing** cancel without a request, focus returns to the trigger,
   and **Confirm forfeit** submits once. Confirm the forfeiting player sees
   **You forfeited**, the opponent sees **Opponent forfeited**, the action
   disappears, and refresh preserves the result.
7. Inspect the hub and match at approximately 390px and 1280px, including
   keyboard focus, status announcements, touch targets, overflow, API recovery,
   deadline completion, and saved history. CPU play remains at `/matches`.

Outgoing-invitation cancellation is negotiated through the version 3 PvP
`Accept` media type. The Web application treats an absent `canCancel` as false,
submits a stable versioned cancellation exactly once, reconciles ambiguous
delivery through polling, and displays server-generated cancellation, deadline,
account-lifecycle, and voluntary-resignation results.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[gpt-5.6-sol], Codex-CLI[GPT-5], and Codex[GPT-5].
