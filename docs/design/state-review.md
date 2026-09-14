---
title: 'Loading, error and feedback states'
---

# Loading, error and feedback states

The design system remains the default contract. This pass changes presentation
and feedback only; backend contracts, eligibility, lifecycle rules, legal battle
actions, request identities, routing, and permission checks remain authoritative.

## Shared changes

- `components/LoadingState.tsx` — labelled loading and static row, card, and battle
  skeleton geometry; decorative shapes are hidden from assistive technology.
- `components/StatusMessage.tsx` and `styles/states.css` — neutral empty states,
  restrained error/permission/success accents, small Phosphor icons, bounded copy,
  and responsive spacing. Existing focused recovery regions retain their markup.
- `components/AppToaster.tsx`, `App.tsx`, and web package declarations — Sonner
  confirmations for deck creation, saving, selection, and deletion. One shared
  notification ID replaces earlier confirmations. Recovery notices stay inline.
- Player pages and author workspaces — shared loading/empty/error presentation;
  clearer session, deck, profile, and battle loading copy. Author infrastructure
  details are hidden while typed domain and field validation remain available.
- PvP refresh controls — visible pending labels and disabled retry controls during
  requests, retaining existing request guards and confirmed battle content.
- Offline pages — a storage failure ends loading; browser location failures remain
  distinguishable and browser storage exception details are not shown to players.
- Account recovery, author forms, dialogs, sheets, map fallback, and field validation
  retain existing focus, input preservation, and recovery actions. Author creation
  prerequisites are now visible alongside blocked controls.

The old treatments mixed prominent gradients, dashed empty panels, oversized state
headings, plain loading text, and technical implementation language. The shared
styles now own decoration while each route retains its useful contextual copy.
Mobile uses smaller padding and keeps 44px toast dismissal above navigation;
desktop bounds prose and anchors notifications to the bottom-right corner.

## How to see it locally

For normal development with the repository's existing local environment:

1. Run `npm run api` and `npm run view` in separate terminals from the repository
   root. Open `http://localhost:5173`.
2. Sign in and visit `/explore`, `/collection`, `/decks`, `/matches`, `/profile`,
   and `/account`. Author accounts can also visit `/author/events`,
   `/author/cards`, and the review/campaign workspaces.
3. In `/collection`, enter a search that matches no owned cards, then clear it.
   In `/decks`, save a valid deck or select another saved deck as active; expect
   one dismissible confirmation and the updated saved deck state.
4. Use browser request blocking or network throttling to inspect loading/failure,
   then unblock and retry. Keep `/auth/me` available when testing route-local
   failures. No real account deletion is needed to inspect its confirmation dialog.
5. Check at 390, 768, and 1440px. Tab to retry and toast dismissal; verify visible
   focus and no horizontal overflow. Enable reduced motion to remove spinner and
   toast animation.

For repeatable mocked states without a live API or real Auth0 session:

```bash
npx playwright test --config apps/web/playwright/states.config.ts --headed
```

The config starts the existing `basic-e2e` application on
`http://127.0.0.1:5176`, supplies the existing authenticated fixture, intercepts API
responses in the browser, and captures screenshots under
`.playwright-artifacts/states`. Keep port 5176 free first. To use an already-running
server with the same fixture configuration, set `PLAYWRIGHT_EXTERNAL_WEB_SERVER=true`.
If Playwright's matching Chromium is unavailable, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium executable.
These fixtures do not add production states or change backend behaviour.

## Verification and limits

- Web unit/component suite: 587 tests passed across 40 files.
- Web lint, type-check, production build, and diff whitespace check passed.
- Deterministic browser coverage: route loading and failed requests at all three
  widths; collection no-results; empty decks; author permission; map failure;
  failed event requests and retry to empty; author service error; singular deck
  confirmation, 44px dismissal, keyboard dismissal, and navigation clearance.
- Existing browser scenarios exercised author validation, saving, failure/input
  preservation and successful recovery; author catalogue loading/error/empty;
  CPU processing/timeout/error; account recovery/deletion dialogs and focus return;
  inaccurate reported location and empty nearby results. Expected deliberately
  injected HTTP failures appeared; the corrected fixtures had no unexpected
  runtime errors in their monitored flows.
- The account fixtures now include background event discovery. The location
  scenario was run with its required geolocation grant. The older deck-management
  browser scenario depends on live authentication and was not validated in the
  mocked server configuration; the new deck state/confirmation scenarios and
  existing component regressions cover this pass instead.
- Real Auth0 hosted recovery, real account deletion, OS-specific location settings,
  intermittent physical-network transitions, and full offline service-worker
  synchronization were not exercised. Offline storage failure is covered by a
  deterministic component regression. Every possible backend error permutation
  was not manually reproduced; existing typed error mappings were retained.

AI declaration: Written and reviewed with assistance from Codex-CLI[GPT-6].

Page title clarified with assistance from Codex-CLI[GPT-6].
