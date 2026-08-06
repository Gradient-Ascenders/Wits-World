# Wits World Web Application

This workspace contains the mobile-first React foundation for Wits Quest, the
game/topic being developed by the Wits World project.

The current application provides a responsive shell, basic client-side routing,
configuration validation, loading presentation, and unexpected-error handling.
It does not yet include authentication, the campus map, events, geolocation,
challenges, cards, or battles.

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
landmarks, routes, keyboard order, configuration failures, loading status, and
the render-error fallback. Automated checks do not replace manual browser and
keyboard testing.

### Manual browser checks

With `apps/web/.env` configured and the development server running:

1. Open `/` at widths of 360px, 390px, 768px, and approximately 1280px. Confirm
   that the header, navigation, heading, content panel, and footer remain readable
   without horizontal scrolling.
2. Capture review screenshots at 390×844 and 1280×800.
3. At 390px, press Tab. Confirm the skip link becomes visible first, followed by
   visibly focused Home and About links. Press Enter on About and confirm the
   `/about` heading appears.
4. Open an unknown route such as `/missing`. Confirm the not-found heading and
   Return home link are available by keyboard.
5. Stop the server, temporarily move the ignored `apps/web/.env` file elsewhere,
   and restart. Confirm the setup screen names `VITE_API_BASE_URL` and explains
   how to restore configuration. Put the ignored file back afterward.

The preceding document was generated and edited with the assistance of:
Codex-CLI[gpt-5.6-sol medium].
