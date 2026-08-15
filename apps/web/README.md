# Wits World Web Application

This workspace contains the mobile-first Wits World web application. Wits World
is the project and primary public brand; Wits Quest is the campus-exploration
game/topic the project is building.

The current application provides a responsive shell, Auth0 sign-in and sign-out,
a protected campus map, authenticated published-event discovery, safe API
access-token retrieval, and a premium editorial home page. The home-page map,
event status, and collectible cards are explicitly static product previews; the
live seeded-event experience is available through the protected `/explore`
route. The protected experience includes one-shot browser geolocation and
API-authoritative event eligibility and the protected timed challenge journey.
Challenges restore their server-owned attempt, submit answer intent only, and
display the persisted final score, rewards, and completed answer review. Card
collection and battles remain outside the live player flow.

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
`VITE_AUTH0_AUDIENCE` and keeps the SDK's default in-memory cache. Tokens are not
written to application logs, local storage, session storage, or rendered UI.

The development Auth0 application must include the following exact values:

| Auth0 setting         | Development value       |
| --------------------- | ----------------------- |
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs   | `http://localhost:5173` |
| Allowed Web Origins   | `http://localhost:5173` |

The application uses Authorization Code with PKCE through the Auth0 React SDK.
An unauthenticated visit to `/explore` shows a clear sign-in action without
rendering protected content. The intended internal route is carried through the
Auth0 redirect and validated before the browser returns to it. Absolute and
protocol-relative return URLs are rejected.

Authenticated API clients obtain a token on demand through
`useApiAccessToken`. Callers must place that token only in the standard
`Authorization: Bearer` request header and must not log or persist it.

### Real authentication end-to-end test

The Playwright suite signs in through the development tenant's real Auth0
Universal Login page and calls the real local API. Put only the dedicated test
player credentials in the ignored `apps/web/.env.e2e.local` file:

```dotenv
E2E_USER_EMAIL=player@example.com
E2E_USER_PASSWORD=replace-with-the-test-player-password
```

From the repository root, run:

```bash
npm run test:e2e:auth --workspace @wits-world/web
npm run test:e2e --workspace @wits-world/web
npm run test:e2e:headed --workspace @wits-world/web
```

Playwright starts the real web and API development services when they are not
already running. The setup project saves reusable browser state under the
ignored `playwright/.auth/` directory. Credentials are loaded by the Playwright
Node process and must never use a `VITE_` prefix.

Known limitations:

- sign-in, sign-out, and silent token retrieval depend on Auth0 availability;
- privacy controls, blocked third-party cookies, browser tracking prevention,
  or incorrect Allowed Web Origins may prevent silent session restoration;
- changing the local port requires matching callback, logout, and web-origin
  entries in Auth0;
- unit tests mock Auth0; the Playwright end-to-end test requires the real
  development tenant, API, database test branch, and network access.

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

The map does not request or send the player's browser location. The event list
requests a fresh position only after the player selects an active event's Check
reachability action. The reported coordinates are sent to the Wits World API,
not to the map provider.

The production Content Security Policy must account for Mapbox's `blob:` worker,
image data, WebAssembly evaluation, and `api.mapbox.com` style/tile/glyph/image
requests. The deployment guidance, current map-load pricing, usage monitoring,
and absence of a configurable hard monthly spending cap are recorded in
[Mapbox operations](../../docs/deployment/mapbox-operations.md). Formal external
service acceptance and licensed campus-data approval remain pending.

## Browser location and eligibility

The `/explore` event list calls the protected
`POST /api/v1/events/:eventId/eligibility` endpoint after a clear player action.
Each request contains the browser-reported latitude, longitude, accuracy, and
acquisition time. The browser uses a ten-second timeout, asks for high accuracy,
and does not accept a cached reading. A retry requests a new reading; the
application does not poll or track location continuously.

The browser treats the reading as a claim. It does not calculate authoritative
distance, compare the event radius, or decide reachability. Reachable,
unreachable, inaccurate, stale, unavailable, and failure states come from the
API or browser boundary and are displayed with accessible text rather than
colour alone.

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
- `/about` explains the Wits World project and Wits Quest game/topic distinction.
- Any unknown route presents a page-not-found message and a link home.

The application uses browser-history routing. A future static host must route
unknown application paths back to `index.html`; production deployment remains
outside issue #6.

## Initial structure

```text
apps/web/
  src/
    api/          Typed player-safe API clients and response validation
    auth/         Auth0 provider integration and safe API-token access
    components/   Application shell and reusable status states
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

The Basic challenge is a server-authoritative, five-question multiple-choice
attempt. The browser sends only the chosen `attemptQuestionId` and `choiceId`.
It derives its timer from the absolute server deadline and reloads an attempt
through `GET /api/v1/challenge-attempts/:attemptId` after refresh or timeout.

During an in-progress Basic attempt, keep feedback neutral: show “Answer saved”
and never render correctness, correct choices, answer keys, explanations, score,
or reward information. Once the API authoritatively completes the attempt, the
final result renders only the persisted score, reward, and answer-review data in
that completed response. The browser does not compare choices or mark answers.
Unanswered timeout items use “Not answered” while still displaying the completed
response's correct choice. Explanations remain absent until the authoritative
content model and completed API contract support them.

The production-like browser flow requires an authenticated player and an active
event with a published challenge containing five valid questions. The Great Hall
development seed now provides that challenge and the active reward catalogue;
use the documented development geolocation override when testing locally. Never
persist browser locations, tokens, answer keys, or rewards in browser storage.

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
Vitest does not transform application stylesheets, keeping these jsdom tests
focused on semantics and behaviour without expensive CSS matching. Automated
checks do not replace manual visual, responsive, browser, and keyboard testing.

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
   Wits World brand, Home, Explore, About, account control, Explore the campus,
   and About the project with a visible outline. Activate the skip link and
   confirm focus moves to the main landmark.
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
   link, Home, Explore, About, account controls, Mapbox controls including reset
   bearing/pitch, and any retry action in a logical order. Confirm the event can
   be discovered without using the map.
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
4. Select Check again and confirm a new one-shot request occurs without ongoing
   location updates.
5. Reset the browser's site permission, deny location, and confirm the denial
   explanation, Check again action, map, and event list remain usable.
6. Press Tab with a connected keyboard. Confirm visible focus reaches the event
   action in logical order and the result does not rely on colour alone.
7. Repeat the layout check at 360px, 768px, and approximately 1280px. Confirm the
   status panel, text, button, event badge, map attribution, and navigation do not
   overlap or cause horizontal scrolling.
8. Record the actual device, operating system, browser version, permission state,
   and API outcome. Store screenshots under `.pr-screenshots/issue-21/` and
   attach them to the pull request without exposing tokens or precise location
   values.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5], and Codex[GPT-5].
