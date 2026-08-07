# Wits World Web Application

This workspace contains the mobile-first React foundation for Wits Quest, the
game/topic being developed by the Wits World project.

The current application provides a responsive shell, basic client-side routing,
configuration validation, loading presentation, unexpected-error handling, and
a premium editorial home page that previews the planned player journey. The
home-page map, event status, and collectible cards are explicitly static product
previews; authentication, live events, geolocation, challenges, collections, and
battles are not enabled yet.

## Run locally

Use Node.js 24.14.1 and npm 11.18.0. From the repository root:

```bash
nvm use
npm ci
cp apps/web/.env.example apps/web/.env
npm run dev --workspace @wits-world/web
```

Open `http://localhost:5173` in a browser. The development server uses a strict
port and exits with an error if port 5173 is unavailable.

To inspect the production build locally:

```bash
npm run build --workspace @wits-world/web
npm run preview --workspace @wits-world/web
```

The preview server uses `http://localhost:4173`.

## Environment configuration

| Variable            | Required | Browser-visible | Purpose                                         |
| ------------------- | -------- | --------------- | ----------------------------------------------- |
| `VITE_API_BASE_URL` | Yes      | Yes             | Base URL reserved for the Wits Quest API client |

Only public values may use the `VITE_` prefix because Vite includes them in the
browser bundle. Do not place tokens, passwords, private keys, or other secrets in
this workspace's environment file.

The application accepts HTTP and HTTPS API URLs. If the variable is absent,
empty, malformed, or uses another protocol, the browser displays a clear setup
screen instead of starting an incorrectly configured application.

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
- `/about` explains the Wits World project and Wits Quest game/topic distinction.
- Any unknown route presents a page-not-found message and a link home.

The application uses browser-history routing. A future static host must route
unknown application paths back to `index.html`; production deployment remains
outside issue #6.

## Initial structure

```text
apps/web/
  src/
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
landmarks, routes, keyboard order, honest preview language, configuration
failures, loading status, and the render-error fallback. Automated checks do not
replace manual browser and keyboard testing.

### Manual browser checks

With `apps/web/.env` configured and the development server running:

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
   Wits Quest brand, Explore, About, Discover how it works, and About the project
   with a visible outline. Activate the skip link and confirm focus moves to the
   main landmark.
6. Enable reduced-motion emulation and confirm transitions are effectively
   removed without hiding information.
7. Open an unknown route such as `/missing`. Confirm the not-found heading and
   Return home link are available by keyboard.
8. Stop the server, temporarily move the ignored `apps/web/.env` file elsewhere,
   and restart. Confirm the setup screen names `VITE_API_BASE_URL` and explains
   how to restore configuration. Put the ignored file back afterward.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium], Codex-CLI[GPT-5].
