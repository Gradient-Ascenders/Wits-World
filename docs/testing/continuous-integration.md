# Continuous Integration

Wits World uses Gitea Actions for continuous integration.

The workflow is defined in:

`/.gitea/workflows/ci.yml`

## Triggers

Continuous integration runs for:

- every push to `main`; and
- every pull request targeting `main`.

Pull-request runs validate proposed changes but cannot deploy. A successful
push to `main` may continue into the production deployment jobs described in
the [Azure deployment guide](../deployment/azure-deployment-setup.md).

## Runner

Validation executes on the repository-scoped `witsworld-azure-runner`.

The runner is hosted on an Azure Ubuntu virtual machine and executes validation
in a Docker-isolated environment using the `ubuntu-latest` label. Production
deployment uses the separate host-execution label documented in the deployment
guide and remains restricted to successful `main` pushes.

## Validation job

The workflow uses one validation job so checkout, Node setup, npm-cache restore,
and dependency installation occur once per workflow run. Application checks
remain separate named steps so a web, API, or documentation failure is still
visible without searching through a combined command.

The validation sequence is:

```bash
npm ci --prefer-offline --no-audit --fund=false
npm run format:check
npm run lint --workspace @wits-world/web
npm run type-check --workspace @wits-world/web
npm run test:coverage --workspace @wits-world/web
npm run build:bundle --workspace @wits-world/web
npm run lint --workspace @wits-world/api
npm run type-check --workspace @wits-world/api
npm run test:coverage --workspace @wits-world/api
npm run build --workspace @wits-world/api
npm run lint --workspace @wits-world/docs
npm run type-check --workspace @wits-world/docs
npm test --workspace @wits-world/docs
npm run build --workspace @wits-world/docs
```

The web and API test steps collect V8 coverage during the same test run; they
do not execute a second test pass. HTML, LCOV, and JSON summary reports are
uploaded together as the `coverage-reports` workflow artifact. The root
`npm run coverage` command reproduces both coverage runs locally and generates
`coverage/coverage.svg` from their combined line totals.

After successful `main` validation, CI publishes the generated SVG to the
non-triggering `coverage-badge` branch. The README loads that file directly, so
its percentage reflects the latest successful web and API coverage run without
executing either test suite twice.

The artifact step intentionally pins `actions/upload-artifact` to v3. The
current Gitea 1.24 and `act_runner` 0.2.12 stack does not support the v4
artifact protocol; upgrade the action only after the server and runner have
been verified with that protocol.

The web workspace's `build:bundle` command runs Vite after its dedicated
type-check step. The normal `build` command still performs both type-checking and
bundling for local and production use.

`setup-node` caches npm's download cache using `package-lock.json`; it does not
cache `node_modules`. The clean install therefore remains required for
reproducibility. `--prefer-offline` reuses cached package data when available,
while `--no-audit --fund=false` avoids unrelated network and funding output in
the validation install. Dependency vulnerability review remains an explicit
`npm audit` activity rather than an implicit install side effect.

## Throughput boundary

The current runner is resource constrained. Splitting the checks into multiple
jobs caused the same workspace to be checked out and installed four times while
the jobs competed for one VM. Consolidating setup work reduces queue occupancy
without weakening any required formatter, linter, type-checker, test, or build
command.

Gitea 1.24 does not honour workflow `concurrency`, so the repository cannot
reliably cancel superseded runs through `cancel-in-progress`. Stale queued runs
must be cancelled manually, or the Gitea instance and runner must be upgraded
to a version where the desired queue controls are verified.

## AI declaration

This document was reviewed and edited with assistance from:

```text
Codex-CLI[GPT-5] and Codex[GPT-5]
```
