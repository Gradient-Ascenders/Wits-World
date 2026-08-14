# Continuous Integration

Wits World uses Gitea Actions for continuous integration. The primary workflow
is defined in `/.gitea/workflows/ci.yml`.

## Triggers

Continuous integration runs for:

- every push to `main`; and
- every pull request targeting `main`.

Pull-request runs validate proposed changes but cannot deploy. A successful
push to `main` may continue into the production deployment jobs described in
the [Azure deployment guide](../deployment/azure-deployment-setup.md).

## Runners

Normal validation runs on the repository-scoped `wits-world-c220-01` runner
through the dedicated Docker label:

```text
wits-world-ci:docker://docker.gitea.com/runner-images:ubuntu-latest
```

The dedicated label prevents normal CI jobs from being scheduled randomly on
the older Azure runner. With a runner capacity of five, up to five CI or
documentation-deployment jobs can execute concurrently.

Production API and Web deployment remains on `witsworld-azure-runner` through
its host-only `azure-deploy` label. That runner provides the proven Azure CLI,
Docker, managed-identity, filesystem, and networking environment used by the
deployment jobs.

The documentation deployment workflow also uses `wits-world-ci`. It runs only
for pushes to `main` and exposes its Cloudflare credentials only to its deploy
step.

## Parallel validation

The CI workflow splits independent verification into five jobs:

```text
format ─────┐
lint ───────┤
type-check ─┼── Repository and application validation
test ───────┤
build ──────┘
```

Each job checks out the repository, restores npm's download cache, and runs a
clean lockfile-controlled install:

```bash
npm ci --prefer-offline --no-audit --fund=false
```

The jobs then run the following existing repository commands:

```bash
# format
npm run format:check

# lint
npm run lint

# type-check
npm run type-check

# test
npm run test:coverage --workspace @wits-world/web
npm run test:coverage --workspace @wits-world/api
npm test --workspace @wits-world/docs
npm run coverage:badge

# build
npm run build:bundle --workspace @wits-world/web
npm run build --workspace @wits-world/api
npm run build --workspace @wits-world/docs
```

The final validation job needs all five jobs. It therefore succeeds only when
formatting, lint, type-checking, tests, and builds all pass. API deployment
depends on this combined gate, and Web deployment remains after API deployment.

The duplicated clean installs trade additional aggregate work for substantially
lower elapsed time on the 44-core C220. They remain bounded to up to five
concurrent jobs rather than creating a job for every workspace and command.

## Coverage and artifacts

The web and API test steps collect V8 coverage during the test run; they do not
execute a second test pass. HTML, LCOV, and JSON summary reports are uploaded
together as the `coverage-reports` artifact. The test job also generates
`coverage/coverage.svg` from the combined line totals.

On a successful push to `main`, the final validation job downloads that artifact
and publishes the SVG to the non-triggering `coverage-badge` branch. Keeping the
publication behind the combined gate prevents a passing test job from updating
the live badge when another required validation job failed.

Coverage scope is explicit in each workspace configuration. The API includes
`src/**/*.ts`, and the web application includes `src/**/*.{ts,tsx}`. Only
TypeScript declaration files are excluded. Production modules that are never
imported by tests therefore remain in the published coverage denominator.

The workflow retains `actions/upload-artifact@v3` and
`actions/download-artifact@v3` as the known-working protocol. Gitea Runner 3.x
supports the stock v4 artifact protocol, but v4 should be enabled only after an
artifact upload and download have been verified against this repository's
actual Gitea server configuration.

## Dependency caching

`setup-node` caches npm's content-addressed download cache using
`package-lock.json`; it does not cache `node_modules`. Every job still performs
`npm ci`, so stale installed dependency trees cannot cross jobs or branches and
the lockfile remains authoritative.

`--prefer-offline` reuses verified cached package data when available, while
`--no-audit --fund=false` avoids unrelated install-time network work and output.
Dependency vulnerability review remains an explicit `npm audit` activity.

Docker base images and downloaded actions are managed by the runner's existing
cache. The workflow does not introduce a custom runner image, registry mirror,
or host-mounted `node_modules` cache.

## Compatibility and throughput boundaries

The C220 runs Gitea Runner 3.1.0. The workflows do not depend on newer job-level
syntax, privileged container options, or host execution for normal CI. The
artifact v3 compatibility pin is retained until the v4 path is proven on the
live instance.

Gitea 1.24 does not reliably honour workflow `concurrency`, so superseded runs
cannot be assumed to cancel automatically. Stale queued runs must be cancelled
manually until server-side queue controls are upgraded and verified.

## AI declaration

This document was reviewed and edited with assistance from:

```text
Codex-CLI[GPT-5] and Codex[GPT-5]
```
