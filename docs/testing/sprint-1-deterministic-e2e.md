# Sprint 1 deterministic end-to-end test

:::note[Historical Sprint 1 release evidence]

This procedure preserves the deterministic test for the Sprint 1
location/exploration slice. The current broader procedure is
[Basic-tier deterministic E2E](basic-tier-deterministic-e2e.md).

:::

This suite provides repeatable release-validation evidence for the Sprint 1
`/explore` vertical slice. It covers the player journey associated with
[issue #20](https://sdp.ms.wits.ac.za/gradient-ascent/Wits-World/issues/20) and
implements the deterministic browser coverage requested by issue #50.

## Prerequisites

- Use the Node.js and npm versions in `CONTRIBUTING.md` and run `npm ci`.
- Install the Playwright Chromium binary with `npx playwright install chromium`.
- In the ignored `apps/api/.env`, configure both `DATABASE_URL` and
  `TEST_DATABASE_URL`. The test URL must identify a dedicated disposable
  PostgreSQL database with PostGIS and must not identify the development or
  production database.
- The configured database host must be reachable from the machine running the
  test.

Run the complete preparation and test from the repository root with one command:

```bash
npm run test:e2e:sprint1
```

The command applies existing migrations and the idempotent `basic-demo` seeds
to `TEST_DATABASE_URL`, then starts the deterministic API and Web applications
and runs the Chromium tests. Running the command again repeats the same
preparation and assertions.

## Real and controlled boundaries

The suite keeps these production components real:

- the React/Vite application and browser fetch requests;
- HTTP and CORS between the browser and Fastify;
- the Fastify authentication and authorization hooks;
- `PlayerIdentityService`, including local test-player resolution;
- event discovery and event eligibility services; and
- PostgreSQL/PostGIS distance and radius evaluation.

Only external or time-dependent boundaries are controlled:

- A dedicated Vite mode replaces the Auth0 React module with an authenticated
  local identity that returns one obvious, non-secret bearer-token constant.
  A separate API startup path injects the matching narrow
  `AccessTokenVerifier`. The normal Web build and `src/server.ts` still use
  Auth0 and are not changed or disabled.
- Playwright configures Chromium's real geolocation permission and coordinates.
  The test location provider uses the browser result but fixes `acquiredAt` to
  the API test clock.
- The API discovery, eligibility, and location-claim clock is fixed inside the
  seeded event's availability window. Production clock semantics are unchanged.
- The existing map-factory seam receives an in-memory deterministic map. The
  production Mapbox implementation is unchanged.

The tests monitor browser requests and fail with a hostname/path-only diagnostic
if Auth0 or Mapbox is contacted. They do not depend on live Auth0, Mapbox or map
tiles, a user's location, production data, or production database writes.

## Test database safety

The runner invokes only `db:migrate:test` and `db:seed:test -- --basic-demo`.
Both select `TEST_DATABASE_URL` explicitly. Existing database configuration also
refuses test access when the test and development URLs identify the same host,
port, and database. The runner never drops a database, never resets
`DATABASE_URL`, and never prints either URL.

The basic demo seeds use stable identifiers and conflict-safe operations, so
preparation is safe to repeat against the dedicated disposable test database.
Published controlled fixtures are left unchanged on a repeat run. Do not point
`TEST_DATABASE_URL` at shared, development, staging, or production data.

## Coverage and artifacts

The suite proves that the seeded Great Hall event appears in the text list, an
in-range coordinate receives the server-authoritative reachable response, an
out-of-range coordinate receives the unreachable response, and denied browser
permission leaves the list usable with an explanation.

Failure screenshots and traces are written to the ignored
`apps/web/playwright/test-results/` directory. Playwright reports remain in the
ignored `apps/web/playwright-report/` directory. API logging redacts bearer
authorization headers, and provider-request diagnostics contain no query values
or credentials.

## Troubleshooting

- `TEST_DATABASE_URL is required`: add the dedicated test URL to the ignored
  `apps/api/.env`; do not paste it into terminal output or committed files.
- `TEST_DATABASE_URL must use a different...`: create a truly separate test
  database rather than bypassing the guard.
- Database connection or PostGIS errors: confirm the test host is reachable,
  TLS is configured as required by the existing database configuration, and
  PostGIS is installed.
- Chromium executable missing: run `npx playwright install chromium`.
- Port 3001 or 5174 already in use: stop the conflicting local process. The
  deterministic configuration deliberately does not reuse existing servers.
- Inspect a browser failure under `apps/web/playwright/test-results/`; traces
  can be opened with `npx playwright show-trace <trace-path>`.

## CI status

The deterministic suite is not enabled in Gitea Actions yet. The repository does
not establish that the isolated `wits-world-ci` container receives a dedicated
`TEST_DATABASE_URL` for a disposable PostGIS database, nor that its runner image
has a reliably installable Playwright Chromium and required system libraries.
Enabling the job without those two runner guarantees could risk the wrong data
boundary or create a flaky network-dependent browser installation. Once a
dedicated test-database secret and a Chromium-capable runner image are verified,
CI can run the same root command without changing the test architecture.

## AI declaration

This document and the associated implementation were created with assistance
from Codex[GPT-5].
The historical-status notice was added with assistance from
Codex-CLI[GPT-5]. The curated-content seed clarification was added with
assistance from Codex[gpt-5.6-sol].
