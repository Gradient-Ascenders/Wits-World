# Wits World Web Application

This workspace contains the mobile-first React foundation for Wits Quest, the
game/topic being developed by the Wits World project.

The current application provides a responsive shell, Auth0 sign-in and sign-out,
a protected player route, safe API access-token retrieval, configuration
validation, loading presentation, and unexpected-error handling. It does not
yet include the live campus map, events, geolocation, challenges, cards, or
battles.

## Run locally

Use Node.js 24.14.1 and npm 11.18.0. From the repository root:

```bash
nvm use
npm ci
cp apps/web/.env.example apps/web/.env
npm run dev --workspace @wits-world/web
```

Before starting the application, replace
`VITE_AUTH0_CLIENT_ID=replace-with-public-spa-client-id` in the ignored
`apps/web/.env` file with the development SPA's public Client ID. Keep the
committed development domain and API audience unless the approved Auth0
configuration changes.

Open `http://localhost:5173` in a browser. The development server uses a strict
port and exits with an error if port 5173 is unavailable.

To inspect the production build locally:

```bash
npm run build --workspace @wits-world/web
npm run preview --workspace @wits-world/web
```

The preview server uses `http://localhost:4173`.

## Environment configuration

| Variable               | Required | Browser-visible | Purpose                                  |
| ---------------------- | -------- | --------------- | ---------------------------------------- |
| `VITE_API_BASE_URL`    | Yes      | Yes             | Base URL reserved for the Wits Quest API |
| `VITE_AUTH0_DOMAIN`    | Yes      | Yes             | Auth0 tenant hostname without a protocol |
| `VITE_AUTH0_CLIENT_ID` | Yes      | Yes             | Public Auth0 single-page application ID  |
| `VITE_AUTH0_AUDIENCE`  | Yes      | Yes             | Audience identifying the Wits World API  |

The committed `.env.example` contains the approved development domain and
audience plus a safe Client ID placeholder. A fresh checkout must replace that
placeholder in its ignored `.env` file before testing authentication.

Only public values may use the `VITE_` prefix because Vite includes them in the
browser bundle. Do not place tokens, passwords, private keys, or other secrets in
this workspace's environment file.

The application accepts HTTP and HTTPS API URLs. The Auth0 domain must be a
hostname without a protocol, path, query, or fragment. If required configuration
is absent, empty, or malformed, the browser displays a clear setup screen instead
of starting an incorrectly configured application.

## Player authentication

Wits Quest uses Auth0 Universal Login. The browser application is a public
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

Known limitations:

- sign-in, sign-out, and silent token retrieval depend on Auth0 availability;
- privacy controls, blocked third-party cookies, browser tracking prevention,
  or incorrect Allowed Web Origins may prevent silent session restoration;
- changing the local port requires matching callback, logout, and web-origin
  entries in Auth0;
- automated tests mock Auth0 and do not prove that tenant configuration is
  correct.

## Campus map foundation

The web workspace uses [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
6.2.0 as its map-rendering library. MapLibre GL JS is distributed under the
[BSD 3-Clause license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt).

MapLibre renders map styles and tiles supplied by a separate provider. Installing
MapLibre does not grant access to a production tile service. A production style
URL, provider terms, attribution text, usage limits, and any required public
configuration must be approved and documented before deployment.

The current map adapter:

- loads MapLibre only when the campus map is rendered;
- leaves MapLibre's attribution control enabled and expanded;
- provides 44px zoom controls;
- presents map loading and failure states;
- keeps event information in a separate semantic text list;
- allows component tests to replace MapLibre with a local fake, avoiding live
  tile requests.

The production map route is not enabled yet. It is waiting for:

- the approved event-discovery OpenAPI contract from Gitea issue #14;
- the confirmed campus centre and seeded-event coordinates from Gitea issue
  #18;
- an approved map style and tile provider.

Until those inputs exist, test coordinates and URLs must remain confined to
automated tests and must not be presented as Wits campus data.

MapLibre's standard browser bundle uses web workers. A future production Content
Security Policy must account for the worker, image, style, and tile origins used
by the approved configuration. The final directives belong with the deployment
configuration rather than being guessed in this frontend scaffold.

## Routes

- `/` presents the mobile-first Wits Quest home page.
- `/explore` requires Auth0 sign-in and contains the Sprint 1 player experience.
- `/about` explains the Wits World project and Wits Quest game/topic distinction.
- Any unknown route presents a page-not-found message and a link home.

The application uses browser-history routing. A future static host must route
unknown application paths back to `index.html`; production deployment remains
outside issue #6.

## Initial structure

```text
apps/web/
  src/
    auth/         Auth0 provider integration and safe API-token access
    components/   Application shell and reusable status states
      exploration/ Provider-independent campus map and event-list presentation
    config/       Public environment validation
    pages/        Home, About, and not-found pages
    styles/       Mobile-first global styles
    App.tsx       Routing and application error boundary
    main.tsx      Configuration-aware browser entry point
  tests/          Component, routing, error, and configuration tests
  index.html      Vite HTML entry point
  vite.config.ts  Development, preview, build, and test configuration
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
authenticated and unauthenticated routing, sign-in and sign-out actions, safe
return paths, token retrieval, configuration failures, and the render-error
fallback. Automated checks do not replace manual browser and keyboard testing.

### Manual browser checks

With `apps/web/.env` configured and the development server running:

1. Open `/` at widths of 360px, 390px, 768px, and approximately 1280px. Confirm
   that the header, navigation, heading, content panel, and footer remain readable
   without horizontal scrolling.
2. Capture review screenshots at 390×844 and 1280×800.
3. At 390px while signed out, open `/explore`. Confirm protected content is not
   visible, the sign-in explanation is readable, and the Sign in to explore
   button has a visible keyboard focus state.
4. Activate Sign in to explore. Complete Auth0 Universal Login with a development
   player and confirm the browser returns to `/explore`, displays Explore the
   campus, and identifies the signed-in player without showing a token.
5. Refresh `/explore`. Confirm the loading state appears without protected
   content and is replaced by the authenticated page when the session restores.
6. Activate Sign out. Confirm Auth0 returns to `/` and reopening `/explore`
   requires sign-in again.
7. At 390px, press Tab. Confirm the skip link becomes visible first, followed by
   visibly focused Home, Explore, About, and account controls. Activate About and
   confirm the `/about` heading appears.
8. Open an unknown route such as `/missing`. Confirm the not-found heading and
   Return home link are available by keyboard.
9. Stop the server, temporarily move the ignored `apps/web/.env` file elsewhere,
   and restart. Confirm the setup screen names the first missing public variable
   and explains how to restore configuration. Put the ignored file back
   afterward.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium] and Codex-CLI[GPT-5].
